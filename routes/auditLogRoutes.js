const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', requireRole('Admin', 'Supervisor'), transactionController.getAuditLogs);
router.delete('/', requireRole('Admin'), transactionController.deleteAuditLogs);

module.exports = router;
