const express = require('express');
const router = express.Router();
const costCodeController = require('../controllers/costCodeController');
const { requireAuth, excludeRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', costCodeController.getCostCodes);
router.get('/search', costCodeController.searchCostCodes);
router.post('/', excludeRole('IT Support'), costCodeController.createCostCode);
router.put('/:id', excludeRole('IT Support'), costCodeController.updateCostCode);
router.delete('/:id', excludeRole('IT Support'), costCodeController.deleteCostCode);
router.post('/bulk-delete', excludeRole('IT Support'), costCodeController.bulkDeleteCostCodes);
router.post('/import', excludeRole('IT Support'), costCodeController.importCostCodes);
router.post('/clear-all', excludeRole('IT Support'), costCodeController.clearAllCostCodes);

module.exports = router;
