const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('Admin'));

router.get('/', userController.getRefCounters);
router.put('/:username', userController.updateRefCounter);
router.post('/:username/reset', userController.resetRefCounter);

module.exports = router;
