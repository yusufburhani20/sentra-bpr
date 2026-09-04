const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'SIM_SLIP_REF_SECRET_2026_GANTI_DI_PRODUKSI';

function requireAuth(req, res, next) {
    const token = req.cookies.authToken;
    if (!token) {
        return res.status(401).json({ error: 'Sesi tidak valid. Silakan login kembali.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('authToken');
        return res.status(401).json({ error: 'Sesi kedaluwarsa. Silakan login kembali.' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        // Super Admin selalu mendapat akses penuh ke semua fitur
        if (!req.user) {
            return res.status(403).json({ error: `Akses ditolak.` });
        }
        if (req.user.role === 'Super Admin' || roles.includes(req.user.role)) {
            return next();
        }
        return res.status(403).json({ error: `Akses ditolak. Hanya untuk: ${roles.join(', ')}.` });
    };
}

function excludeRole(...roles) {
    return (req, res, next) => {
        if (!req.user || roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Akses ditolak untuk peran: ${roles.join(', ')}.` });
        }
        next();
    };
}

module.exports = {
    requireAuth,
    requireRole,
    excludeRole
};
