const express = require('express');
const router = express.Router();
const fileBackupController = require('../controllers/fileBackupController');
const { requireAuth } = require('../middleware/auth');

// Semua endpoint wajib login
router.use(requireAuth);

router.get('/list', fileBackupController.listFiles);
router.get('/download', fileBackupController.downloadFile);

module.exports = router;
