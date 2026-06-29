const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.post('/request', approvalController.createRequest);
router.get('/pending', requireRole('Admin', 'Supervisor'), approvalController.getPendingRequests);
router.get('/history', approvalController.getRequestHistory);
router.post('/:id/approve', requireRole('Admin', 'Supervisor'), approvalController.approveRequest);
router.post('/:id/reject', requireRole('Admin', 'Supervisor'), approvalController.rejectRequest);

module.exports = router;
