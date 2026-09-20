const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const db = require('../config/db');
const { mapModelIndexToDatabase } = require('../config/diseaseMapping');

exports.predict = async (req, res) => {
    console.log('=== PREDICT REQUEST RECEIVED ===');
    try {
        const userId = req.user.id;
        const captureMethod = req.body.capture_method || 'Gallery';
        const file = req.file;

        console.log('User ID:', userId);
        console.log('Capture Method:', captureMethod);
        console.log('File:', file ? file.filename : 'NO FILE');

        if (!file) {
            console.log('ERROR: No file uploaded');
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const currentDate = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toISOString().split('T')[1].split('.')[0];

        // 1. Save Image to DB
        const imagePath = `/uploads/${file.filename}`;
        const [imageResult] = await db.execute(
            'INSERT INTO images (user_id, capture_method, image_path, upload_date, upload_time) VALUES (?, ?, ?, ?, ?)',
            [userId, captureMethod, imagePath, currentDate, currentTime]
        );
        const imageId = imageResult.insertId;
        console.log('Image saved to DB, imageId:', imageId);

        // 2. Call FastAPI Service with retry logic
        const fastApiUrl = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';
        console.log('Calling FastAPI at:', `${fastApiUrl}/predict`);
        let fastApiResponse;
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Re-create FormData for each attempt (streams can only be read once)
                const formData = new FormData();
                formData.append('file', fs.createReadStream(file.path));

                fastApiResponse = await axios.post(`${fastApiUrl}/predict`, formData, {
                    headers: {
                        ...formData.getHeaders()
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 120000
                });
                console.log(`FastAPI response received (attempt ${attempt}):`, fastApiResponse.status);
                lastError = null;
                break;
            } catch (apiError) {
                lastError = apiError;
                console.log(`FASTAPI CALL FAILED (attempt ${attempt}/${maxRetries}):`, apiError.message);
                if (attempt < maxRetries) {
                    console.log(`Retrying in 3 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }

        if (lastError) {
            console.log('All retry attempts failed.');
            console.log('Error details:', lastError.response ? JSON.stringify(lastError.response.data) : 'No response data');
            // Delete the image record since prediction failed
            await db.execute('DELETE FROM images WHERE image_id = ?', [imageId]);
            // Delete the physical file safely
            if (fs.existsSync(file.path)) {
                try { fs.unlinkSync(file.path); } catch (e) {}
            }
            return res.status(500).json({ 
                error: 'AI Service is unavailable or failed to process the image.',
                details: lastError.response?.data?.detail || lastError.message
            });
        }

        const aiData = fastApiResponse.data;
        console.log('=== FASTAPI RESPONSE KEYS ===', Object.keys(aiData));
        const { confidence_score, heatmap_base64 } = aiData;
        console.log('heatmap_base64 received from FastAPI:', heatmap_base64 ? `YES (length: ${heatmap_base64.length})` : 'EMPTY/NULL');

        // Explicit Mapping Layer:
        // WARNING: Model predicted index MUST NOT be assumed equal to the database disease_id.
        // Model index 0 (Cruris)       -> MySQL disease_id 2 (Tinea Cruris)
        // Model index 1 (Other)        -> MySQL disease_id 0 (Other)
        // Model index 2 (Ringworm)     -> MySQL disease_id 1 (Ringworm)
        // Model index 3 (Versicolor)   -> MySQL disease_id 3 (Tinea Versicolor)
        const rawModelIndex = aiData.model_class_index !== undefined
            ? aiData.model_class_index
            : (aiData.predicted_index !== undefined ? aiData.predicted_index : null);

        let finalDiseaseId;
        let finalDiseaseName;
        let modelClass = null;

        if (rawModelIndex !== null && rawModelIndex !== undefined) {
            const mapped = mapModelIndexToDatabase(rawModelIndex);
            finalDiseaseId = mapped.diseaseId;
            finalDiseaseName = mapped.diseaseName;
            modelClass = mapped.modelClass;
        } else if (aiData.disease_id !== undefined && aiData.disease_name !== undefined) {
            finalDiseaseId = aiData.disease_id;
            finalDiseaseName = aiData.disease_name;
        } else {
            const fallback = mapModelIndexToDatabase(1); // default to Other
            finalDiseaseId = fallback.diseaseId;
            finalDiseaseName = fallback.diseaseName;
            modelClass = fallback.modelClass;
        }

        // 4. Save Detection to DB with verified foreign key disease_id
        const [detectionResult] = await db.execute(
            'INSERT INTO detections (image_id, disease_id, disease_class, confidence_score, detection_date, detection_time) VALUES (?, ?, ?, ?, ?, ?)',
            [imageId, finalDiseaseId, finalDiseaseName, confidence_score, currentDate, currentTime]
        );
        const detectionId = detectionResult.insertId;

        // 5. Save Heatmap Image
        let heatmapUrl = '';
        let heatmapStatus = 'Failed';
        if (heatmap_base64) {
            try {
                // Ensure heatmaps directory exists
                const heatmapsDir = path.join(__dirname, '../heatmaps');
                if (!fs.existsSync(heatmapsDir)){
                    fs.mkdirSync(heatmapsDir, { recursive: true });
                }

                const heatmapFilename = `heatmap-${detectionId}-${Date.now()}.jpg`;
                const heatmapFilePath = path.join(heatmapsDir, heatmapFilename);
                
                // Decode base64 and save
                const base64Data = heatmap_base64.replace(/^data:image\/jpeg;base64,/, "");
                fs.writeFileSync(heatmapFilePath, base64Data, 'base64');
                
                heatmapUrl = `/heatmaps/${heatmapFilename}`;
                heatmapStatus = 'Generated';
            } catch (err) {
                console.error("Failed to save heatmap:", err);
            }
        }

        // 6. Save Heatmap record to DB
        await db.execute(
            'INSERT INTO heatmaps (detection_id, heat_map_status, heatmap_path, generated_date, generated_time) VALUES (?, ?, ?, ?, ?)',
            [detectionId, heatmapStatus, heatmapUrl, currentDate, currentTime]
        );

        // 7. Return complete response
        const responsePayload = {
            message: 'Prediction successful',
            result: {
                detection_id: detectionId,
                model_class_index: rawModelIndex,
                model_class: modelClass,
                disease_id: finalDiseaseId,
                disease_name: finalDiseaseName,
                confidence_score: confidence_score,
                image_url: imagePath,
                heatmap_url: heatmapUrl,
                heatmap_base64: heatmap_base64 || '',
                detection_date: currentDate,
                detection_time: currentTime,
                capture_method: captureMethod,
                created_at: new Date().toISOString()
            }
        };
        console.log('=== RESPONSE TO FLUTTER ===');
        console.log('heatmap_url:', heatmapUrl);
        console.log('heatmap_base64 in response:', responsePayload.result.heatmap_base64 ? `YES (length: ${responsePayload.result.heatmap_base64.length})` : 'EMPTY');
        res.json(responsePayload);

    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ error: 'Server error during prediction' });
    }
};
