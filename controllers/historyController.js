const db = require('../config/db');

exports.getHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Fetch detections with associated image and heatmap info for this user
        const query = `
            SELECT d.detection_id, d.disease_id, COALESCE(s.disease_name, d.disease_class) AS disease_name,
                   d.disease_class, d.confidence_score, d.detection_date, d.detection_time,
                   i.image_path, i.capture_method,
                   h.heatmap_path, h.heat_map_status
            FROM detections d
            JOIN images i ON d.image_id = i.image_id
            LEFT JOIN diseases s ON d.disease_id = s.disease_id
            LEFT JOIN heatmaps h ON d.detection_id = h.detection_id
            WHERE i.user_id = ?
            ORDER BY d.detection_date DESC, d.detection_time DESC
        `;
        
        const [results] = await db.execute(query, [userId]);
        
        res.json({ history: results });
    } catch (error) {
        console.error('Fetch history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};

exports.getHistoryDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const detectionId = req.params.id;
        
        const query = `
            SELECT d.detection_id, d.disease_id, COALESCE(s.disease_name, d.disease_class) AS disease_name,
                   d.disease_class, d.confidence_score, d.detection_date, d.detection_time,
                   i.image_path, i.capture_method,
                   h.heatmap_path, h.heat_map_status
            FROM detections d
            JOIN images i ON d.image_id = i.image_id
            LEFT JOIN diseases s ON d.disease_id = s.disease_id
            LEFT JOIN heatmaps h ON d.detection_id = h.detection_id
            WHERE i.user_id = ? AND d.detection_id = ?
        `;
        
        const [results] = await db.execute(query, [userId, detectionId]);
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        
        res.json({ details: results[0] });
    } catch (error) {
        console.error('Fetch history details error:', error);
        res.status(500).json({ error: 'Failed to fetch history details' });
    }
};

exports.deleteHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const detectionId = req.params.id;
        
        // Verify ownership before deleting
        const checkQuery = `
            SELECT i.image_id FROM detections d
            JOIN images i ON d.image_id = i.image_id
            WHERE d.detection_id = ? AND i.user_id = ?
        `;
        const [checkResult] = await db.execute(checkQuery, [detectionId, userId]);
        
        if (checkResult.length === 0) {
            return res.status(404).json({ error: 'Record not found or unauthorized' });
        }
        
        const imageId = checkResult[0].image_id;
        
        // Due to ON DELETE CASCADE in the database, deleting the image 
        // will automatically delete the associated detection and heatmap records.
        await db.execute('DELETE FROM images WHERE image_id = ?', [imageId]);
        
        res.json({ message: 'History record deleted successfully' });
    } catch (error) {
        console.error('Delete history error:', error);
        res.status(500).json({ error: 'Failed to delete history' });
    }
};
