const express = require('express');
const router = express.Router();
const predictController = require('../controllers/predictController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Predict route requires auth and handles image upload
router.post('/predict', auth, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Image upload failed' });
        }
        next();
    });
}, predictController.predict);

module.exports = router;
