const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', transactionController.getNotifications);
router.put('/read', transactionController.markNotificationsAsRead);

module.exports = router;
