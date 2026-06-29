const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/limiter');

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/impersonate', requireAuth, authController.impersonate);
router.post('/stop-impersonating', requireAuth, authController.stopImpersonating);

module.exports = router;
