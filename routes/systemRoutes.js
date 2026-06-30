const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const systemController = require('../controllers/systemController');

// POST /api/system/deploy — Admin only
router.post('/deploy', requireAuth, requireRole('Admin'), systemController.deployUpdate);

// GET /api/system/settings — All authenticated users
router.get('/settings', requireAuth, systemController.getSettings);

// POST /api/system/settings — Admin only
router.post('/settings', requireAuth, requireRole('Admin'), systemController.saveSettings);

module.exports = router;
