const express = require('express');
const router = express.Router();
const fileBackupController = require('../controllers/fileBackupController');
const { verifyToken } = require('../middleware/authMiddleware');

// Semua endpoint wajib login
router.use(verifyToken);

router.get('/list', fileBackupController.listFiles);
router.get('/download', fileBackupController.downloadFile);

module.exports = router;
