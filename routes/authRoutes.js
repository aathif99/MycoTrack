const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/reset-password', authController.resetPassword);

// Profile endpoints
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/profile-picture', authMiddleware, (req, res, next) => {
    uploadProfile.single('profile_picture')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Image upload failed' });
        }
        next();
    });
}, authController.uploadProfilePicture);
router.delete('/profile-picture', authMiddleware, authController.deleteProfilePicture);

// Token verification route
router.get('/verify', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

module.exports = router;
