const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const systemController = require('../controllers/systemController');

// POST /api/system/deploy — Admin only
router.post('/deploy', requireAuth, requireRole('Admin'), systemController.deployUpdate);

module.exports = router;
