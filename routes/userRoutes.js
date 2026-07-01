const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', userController.getUsers);
router.post('/', requireRole('Admin'), userController.createUser);
router.post('/import', requireRole('Admin'), userController.importUsers);
router.put('/:id', requireRole('Admin'), userController.updateUser);
router.delete('/:id', requireRole('Admin'), userController.deleteUser);
router.post('/:id/reset-password', requireRole('Admin'), userController.resetPassword);

module.exports = router;
