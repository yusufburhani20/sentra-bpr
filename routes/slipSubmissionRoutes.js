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

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit (should be smaller after frontend compression)
});

router.use(requireAuth);

router.get('/', slipSubmissionController.getSubmissions);
router.post('/', upload.single('bukti_kirim'), slipSubmissionController.createSubmission);
router.put('/:id/confirm-arrival', upload.single('bukti_sampai'), slipSubmissionController.confirmArrival);

module.exports = router;
