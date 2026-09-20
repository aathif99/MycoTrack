const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure profile_picture directory exists
const profilePicDir = path.join(__dirname, '../profile_picture');
if (!fs.existsSync(profilePicDir)){
    fs.mkdirSync(profilePicDir, { recursive: true });
}

// Storage engine for prediction uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        // Create unique filename: fieldname-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Storage engine for user profile pictures
const profileStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, profilePicDir);
    },
    filename: function(req, file, cb) {
        const userId = req.user ? req.user.id : 'user';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `profile-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter to allow images
const fileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        return cb(null, true);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.heic', '.tiff'].includes(ext)) {
        return cb(null, true);
    }
    cb(new Error('Error: Images Only (JPG/PNG/WEBP)!'));
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

upload.upload = upload;
upload.uploadProfile = uploadProfile;

module.exports = upload;
