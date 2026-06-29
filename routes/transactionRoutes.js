const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', transactionController.getTransactions);
router.get('/next-ref', transactionController.getNextRef);
router.post('/', transactionController.createTransaction);
router.put('/:id', requireRole('Admin'), transactionController.updateTransactionDirectly);
router.delete('/:id', requireRole('Admin'), transactionController.deleteTransactionDirectly);

module.exports = router;
