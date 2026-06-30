const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.post('/request', approvalController.createRequest);
router.get('/pending', requireRole('Admin', 'Kepala Bidang'), approvalController.getPendingRequests);
router.get('/history', approvalController.getRequestHistory);
router.post('/:id/approve', requireRole('Admin', 'Kepala Bidang'), approvalController.approveRequest);
router.post('/:id/reject', requireRole('Admin', 'Kepala Bidang'), approvalController.rejectRequest);

module.exports = router;
