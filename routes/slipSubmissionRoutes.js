const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const slipSubmissionController = require('../controllers/slipSubmissionController');
const { requireAuth } = require('../middleware/auth');

// Make sure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'slip-' + uniqueSuffix + ext);
    }
});

// Ekstensi dan MIME type yang diizinkan (hanya gambar)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
    const isValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

    if (isValidExt && isValidMime) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file gambar (JPG, PNG, WebP, GIF) yang diizinkan.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

router.use(requireAuth);

router.get('/', slipSubmissionController.getSubmissions);
router.post('/', upload.single('bukti_kirim'), slipSubmissionController.createSubmission);
router.put('/:id/confirm-arrival', upload.single('bukti_sampai'), slipSubmissionController.confirmArrival);
router.delete('/:id', slipSubmissionController.deleteSubmission);

module.exports = router;
