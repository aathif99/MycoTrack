const assert = require('assert');
const {
    modelToDiseaseId,
    modelToDiseaseName,
    modelClassNames,
    diseaseIdToName,
    mapModelIndexToDatabase
} = require('../config/diseaseMapping');

console.log('Running Disease Mapping Unit Tests...\n');

// Test Suite: Specification Test Cases
const testCases = [
    {
        index: 0,
        expectedModelClass: 'Cruris',
        expectedDiseaseId: 2,
        expectedDiseaseName: 'Tinea Cruris'
    },
    {
        index: 1,
        expectedModelClass: 'Other',
        expectedDiseaseId: 0,
        expectedDiseaseName: 'Other'
    },
    {
        index: 2,
        expectedModelClass: 'Ringworm',
        expectedDiseaseId: 1,
        expectedDiseaseName: 'Ringworm'
    },
    {
        index: 3,
        expectedModelClass: 'Versicolor',
        expectedDiseaseId: 3,
        expectedDiseaseName: 'Tinea Versicolor'
    }
];

let passed = 0;
let total = 0;

testCases.forEach((tc) => {
    total++;
    console.log(`[TEST CASE ${total}] Prediction Index ${tc.index}`);
    
    // 1. Direct dictionary check
    assert.strictEqual(
        modelToDiseaseId[tc.index],
        tc.expectedDiseaseId,
        `modelToDiseaseId[${tc.index}] must be ${tc.expectedDiseaseId}`
    );
    assert.strictEqual(
        modelToDiseaseName[tc.index],
        tc.expectedDiseaseName,
        `modelToDiseaseName[${tc.index}] must be ${tc.expectedDiseaseName}`
    );
    assert.strictEqual(
        modelClassNames[tc.index],
        tc.expectedModelClass,
        `modelClassNames[${tc.index}] must be ${tc.expectedModelClass}`
    );

    // 2. Helper mapping function check
    const mapped = mapModelIndexToDatabase(tc.index);
    assert.strictEqual(mapped.modelIndex, tc.index, `mapped.modelIndex must be ${tc.index}`);
    assert.strictEqual(mapped.modelClass, tc.expectedModelClass, `mapped.modelClass must be ${tc.expectedModelClass}`);
    assert.strictEqual(mapped.diseaseId, tc.expectedDiseaseId, `mapped.diseaseId must be ${tc.expectedDiseaseId}`);
    assert.strictEqual(mapped.diseaseName, tc.expectedDiseaseName, `mapped.diseaseName must be ${tc.expectedDiseaseName}`);

    // 3. String index support check
    const mappedStr = mapModelIndexToDatabase(String(tc.index));
    assert.strictEqual(mappedStr.diseaseId, tc.expectedDiseaseId, `String index "${tc.index}" must resolve correctly`);

    // 4. Verification that model index != database disease_id (for indices 0, 1, 2)
    if (tc.index !== 3) {
        assert.notStrictEqual(
            tc.index,
            mapped.diseaseId,
            `Crucial check: Model index ${tc.index} must NEVER be directly assigned to disease_id!`
        );
    }

    console.log(`  ✓ Expected model class: ${mapped.modelClass}`);
    console.log(`  ✓ Expected database disease_id: ${mapped.diseaseId}`);
    console.log(`  ✓ Expected database disease: ${mapped.diseaseName}`);
    console.log(`  ✓ Passed!\n`);
    passed++;
});

// Fallback test for unknown index
total++;
console.log(`[TEST CASE ${total}] Unknown Index Fallback`);
const fallback = mapModelIndexToDatabase(99);
assert.strictEqual(fallback.diseaseId, 0, 'Unknown index must safely fall back to disease_id 0 (Other)');
assert.strictEqual(fallback.diseaseName, 'Other', 'Unknown index must safely fall back to Other');
console.log(`  ✓ Fallback successfully routed to disease_id: 0 (Other)\n`);
passed++;

console.log(`========================================`);
console.log(`RESULTS: ${passed}/${total} test cases passed successfully!`);
console.log(`========================================\n`);

process.exit(0);
