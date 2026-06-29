const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    loginLimiter
};
