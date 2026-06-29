const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('Admin'));

router.get('/', userController.getRefCounters);
router.put('/:operator_code', userController.updateRefCounter);
router.post('/:operator_code/reset', userController.resetRefCounter);

module.exports = router;
