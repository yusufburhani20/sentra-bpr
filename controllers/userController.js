const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'slip1234';

exports.getUsers = (req, res) => {
    db.all("SELECT id, username, nama, bagian, role, status, operator_code FROM users WHERE deleted_at IS NULL", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.createUser = async (req, res) => {
    const { username, nama, bagian, role, status, operator_code } = req.body;
    const id = crypto.randomUUID();
    const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    db.run("INSERT INTO users (id, username, nama, bagian, role, status, operator_code, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, username, nama, bagian, role, status, operator_code, defaultHash], function(err) {
            if (err) return res.status(400).json({ error: "Username sudah dipakai pengguna lain!" });

            db.run(`INSERT OR IGNORE INTO ref_counters (operator_code, counter, prefix) VALUES (?, 1, ?)`,
                [operator_code, operator_code]);

            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Menambahkan pengguna: ${username} (${operator_code}), password default: ${DEFAULT_PASSWORD}`, req.ip || "127.0.0.1"]);

            res.json({ success: true, id, defaultPassword: DEFAULT_PASSWORD });
        }
    );
};

exports.updateUser = (req, res) => {
    const { id } = req.params;
    const { username, nama, bagian, role, status, operator_code } = req.body;

    db.run("UPDATE users SET username = ?, nama = ?, bagian = ?, role = ?, status = ?, operator_code = ? WHERE id = ?",
        [username, nama, bagian, role, status, operator_code, id], function(err) {
            if (err) return res.status(400).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Mengubah data pengguna: ${username}`, req.ip || "127.0.0.1"]);

            res.json({ success: true });
        }
    );
};

exports.deleteUser = (req, res) => {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
        return res.status(400).json({ error: "Tidak dapat menghapus akun sendiri yang sedang aktif." });
    }

    db.get("SELECT username, nama, operator_code FROM users WHERE id = ? AND deleted_at IS NULL", [id], (err, user) => {
        if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

        const now = new Date().toISOString();
        db.run("UPDATE users SET deleted_at = ? WHERE id = ?", [now, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            db.run("DELETE FROM ref_counters WHERE operator_code = ?", [user.operator_code]);

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Menghapus pengguna: ${user.username} (${user.operator_code}) - ${user.nama}`, "127.0.0.1"]);

            res.json({ success: true });
        });
    });
};

exports.resetPassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    const passwordToSet = (newPassword && newPassword.length >= 6) ? newPassword : DEFAULT_PASSWORD;
    const newHash = await bcrypt.hash(passwordToSet, SALT_ROUNDS);

    db.get("SELECT username, nama FROM users WHERE id = ? AND deleted_at IS NULL", [id], (err, user) => {
        if (!user) return res.status(404).json({ error: "User tidak ditemukan." });

        db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Reset password pengguna: ${user.username} (${user.nama})`, "127.0.0.1"]);

            res.json({ success: true, newPassword: passwordToSet });
        });
    });
};

exports.getRefCounters = (req, res) => {
    db.all("SELECT username, operator_code FROM users WHERE deleted_at IS NULL", [], (err, users) => {
        if (err) return res.status(500).json({ error: err.message });

        const insertPromises = users.map(u => new Promise(resolve => {
            db.run(`INSERT OR IGNORE INTO ref_counters (username, counter, prefix) VALUES (?, 1, ?)`,
                [u.username, u.operator_code || ""], resolve);
        }));

        Promise.all(insertPromises).then(() => {
            db.all(`SELECT rc.username, rc.counter, rc.prefix, u.nama, u.operator_code
                    FROM ref_counters rc
                    INNER JOIN users u ON u.username = rc.username
                    WHERE u.deleted_at IS NULL
                    ORDER BY u.nama ASC`, [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });
        });
    });
};

exports.updateRefCounter = (req, res) => {
    const { username } = req.params;
    const { counter, prefix } = req.body;

    const newCounter = parseInt(counter);
    if (isNaN(newCounter) || newCounter < 1) {
        return res.status(400).json({ error: "Nilai counter tidak valid (harus >= 1)" });
    }
    const newPrefix = prefix !== undefined ? prefix.trim() : "";

    db.run(`INSERT INTO ref_counters (username, counter, prefix) VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET counter = excluded.counter, prefix = excluded.prefix`,
        [username, newCounter, newPrefix], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Mengatur counter referensi ${username}: counter=${newCounter}, prefix=${newPrefix}`,
                 "127.0.0.1"]);

            res.json({ success: true });
        }
    );
};

exports.resetRefCounter = (req, res) => {
    const { username } = req.params;

    db.run("UPDATE ref_counters SET counter = 1 WHERE username = ?", [username], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), req.user.nama, req.user.role,
             `Me-reset counter referensi ${username} ke 1`, "127.0.0.1"]);

        res.json({ success: true });
    });
};
