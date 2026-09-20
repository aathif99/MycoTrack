/**
 * Centralized Disease Mapping Configuration
 *
 * ==============================================================================
 * ARCHITECTURAL NOTICE:
 * The AI model was trained using TensorFlow/Keras `flow_from_directory()`.
 * Keras sorted the dataset directories in alphabetical order:
 *   - Subfolder "Cruris"     -> Model Class Index 0
 *   - Subfolder "Other"      -> Model Class Index 1
 *   - Subfolder "Ringworm"   -> Model Class Index 2
 *   - Subfolder "Versicolor" -> Model Class Index 3
 *
 * Clinically and canonically:
 *   - "Cruris" refers to "Tinea Cruris"
 *   - "Versicolor" refers to "Tinea Versicolor"
 *
 * In the MySQL database (`diseases` table), the IDs are assigned as:
 *   - disease_id = 0 -> Other
 *   - disease_id = 1 -> Ringworm
 *   - disease_id = 2 -> Tinea Cruris
 *   - disease_id = 3 -> Tinea Versicolor
 *
 * CRITICAL RULE:
 * The model's predicted class index MUST NOT be directly used as the MySQL
 * `disease_id`, because the model class indices and the database IDs DO NOT MATCH!
 *
 * Canonical Mapping:
 *   Model index 0 (Cruris)       -> MySQL disease_id 2 (Tinea Cruris)
 *   Model index 1 (Other)        -> MySQL disease_id 0 (Other)
 *   Model index 2 (Ringworm)     -> MySQL disease_id 1 (Ringworm)
 *   Model index 3 (Versicolor)   -> MySQL disease_id 3 (Tinea Versicolor)
 * ==============================================================================
 */

// Explicit mapping from Model Output Index -> MySQL disease_id
const modelToDiseaseId = {
    0: 2, // Cruris -> Tinea Cruris
    1: 0, // Other -> Other
    2: 1, // Ringworm -> Ringworm
    3: 3  // Versicolor -> Tinea Versicolor
};

// Explicit mapping from Model Output Index -> Canonical Display Disease Name
const modelToDiseaseName = {
    0: 'Tinea Cruris',
    1: 'Other',
    2: 'Ringworm',
    3: 'Tinea Versicolor'
};

// Model's native class labels (matching flow_from_directory directory names)
const modelClassNames = {
    0: 'Cruris',
    1: 'Other',
    2: 'Ringworm',
    3: 'Versicolor'
};

// Database disease_id -> Canonical Disease Name
const diseaseIdToName = {
    0: 'Other',
    1: 'Ringworm',
    2: 'Tinea Cruris',
    3: 'Tinea Versicolor'
};

/**
 * Maps a model predicted class index (0..3) to the database disease_id,
 * canonical display name, and model class name.
 *
 * @param {number|string} modelIndex - The raw argmax output index from the model
 * @returns {{ modelIndex: number, modelClass: string, diseaseId: number, diseaseName: string }}
 */
function mapModelIndexToDatabase(modelIndex) {
    const idx = Number(modelIndex);
    if (modelToDiseaseId.hasOwnProperty(idx)) {
        return {
            modelIndex: idx,
            modelClass: modelClassNames[idx],
            diseaseId: modelToDiseaseId[idx],
            diseaseName: modelToDiseaseName[idx]
        };
    }
    // Safe default to 'Other' (Index 1 -> DB ID 0)
    return {
        modelIndex: 1,
        modelClass: 'Other',
        diseaseId: 0,
        diseaseName: 'Other'
    };
}

module.exports = {
    modelToDiseaseId,
    modelToDiseaseName,
    modelClassNames,
    diseaseIdToName,
    mapModelIndexToDatabase
};
