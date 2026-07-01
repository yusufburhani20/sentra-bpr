const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', userController.getRefCounters);
router.put('/:username', userController.updateRefCounter);
router.put('/:username/:slip_type', userController.updateRefCounter);
router.post('/:username/reset', userController.resetRefCounter);
router.post('/:username/:slip_type/reset', userController.resetRefCounter);

module.exports = router;
