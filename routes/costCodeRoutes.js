const express = require('express');
const router = express.Router();
const costCodeController = require('../controllers/costCodeController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', costCodeController.getCostCodes);
router.post('/', requireRole('Admin'), costCodeController.createCostCode);
router.put('/:id', requireRole('Admin'), costCodeController.updateCostCode);
router.delete('/:id', requireRole('Admin'), costCodeController.deleteCostCode);
router.post('/bulk-delete', requireRole('Admin'), costCodeController.bulkDeleteCostCodes);
router.post('/import', requireRole('Admin'), costCodeController.importCostCodes);
router.post('/clear-all', requireRole('Admin'), costCodeController.clearAllCostCodes);

module.exports = router;
