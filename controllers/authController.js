const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'SIM_SLIP_REF_SECRET_2026_GANTI_DI_PRODUKSI';
const SALT_ROUNDS = 10;

exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password diperlukan.' });
    }

    db.get("SELECT * FROM users WHERE username = ? AND status = 'Aktif' AND deleted_at IS NULL", [username.trim()], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || !user.password_hash) {
            return res.status(401).json({ error: 'Username atau password salah.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), username, '-', `Percobaan login gagal: ${username}`, req.ip || '127.0.0.1']);
            return res.status(401).json({ error: 'Username atau password salah.' });
        }

        const payload = {
            id: user.id,
            username: user.username,
            nama: user.nama,
            role: user.role,
            bagian: user.bagian,
            operator_code: user.operator_code
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        res.cookie('authToken', token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), user.nama, user.role, `Login berhasil`, req.ip || '127.0.0.1']);

        res.json({ success: true, user: payload });
    });
};

exports.logout = (req, res) => {
    const token = req.cookies.authToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), decoded.nama, decoded.role, `Logout`, req.ip || '127.0.0.1']);
        } catch (e) { /* token invalid, ignore */ }
    }
    res.clearCookie('authToken');
    res.json({ success: true });
};

exports.me = (req, res) => {
    db.get("SELECT id, username, nama, bagian, role, status, operator_code FROM users WHERE id = ? AND deleted_at IS NULL", [req.user.id], (err, user) => {
        if (!user || user.status !== 'Aktif') {
            res.clearCookie('authToken');
            return res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
        }
        res.json({ user });
    });
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Password lama dan baru diperlukan.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    }

    db.get("SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL", [req.user.id], async (err, user) => {
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Password lama salah.' });

        const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role, `Ganti password`, req.ip || '127.0.0.1']);

            res.json({ success: true });
        });
    });
};

exports.impersonate = async (req, res) => {
    const { username } = req.body;

    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Username target diperlukan.' });
    }

    if (req.user.role !== 'Admin' && req.user.role !== 'Supervisor') {
        return res.status(403).json({ error: 'Akses ditolak. Hanya untuk Admin dan Supervisor.' });
    }

    db.get("SELECT * FROM users WHERE username = ? AND status = 'Aktif' AND deleted_at IS NULL", [username.trim()], (err, targetUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!targetUser) return res.status(404).json({ error: 'User target tidak ditemukan atau tidak aktif.' });

        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Tidak dapat melakukan login as ke diri sendiri.' });
        }

        const payload = {
            id: targetUser.id,
            username: targetUser.username,
            nama: targetUser.nama,
            role: targetUser.role,
            bagian: targetUser.bagian,
            operator_code: targetUser.operator_code,
            impersonator: {
                id: req.user.id,
                username: req.user.username,
                nama: req.user.nama,
                role: req.user.role,
                bagian: req.user.bagian,
                operator_code: req.user.operator_code
            }
        };

        if (req.user.impersonator) {
            payload.impersonator.impersonator = req.user.impersonator;
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        res.cookie('authToken', token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), req.user.nama, req.user.role, `Login As (Masuk Sebagai) User: ${targetUser.username}`, req.ip || '127.0.0.1']);

        res.json({ success: true, user: payload });
    });
};

exports.stopImpersonating = (req, res) => {
    if (!req.user.impersonator) {
        return res.status(400).json({ error: 'Tidak sedang menggunakan fitur Login As.' });
    }

    const original = req.user.impersonator;

    const payload = {
        id: original.id,
        username: original.username,
        nama: original.nama,
        role: original.role,
        bagian: original.bagian,
        operator_code: original.operator_code
    };

    if (original.impersonator) {
        payload.impersonator = original.impersonator;
    }

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.cookie('authToken', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    const logId = "LOG-" + Date.now();
    db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
        [logId, new Date().toISOString(), req.user.nama, req.user.role, `Berhenti Login As, kembali ke akun asli: ${original.username}`, req.ip || '127.0.0.1']);

    res.json({ success: true, user: payload });
};

