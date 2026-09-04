const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'slip1234';

exports.getUsers = (req, res) => {
    let query = `
        SELECT u.id, u.username, u.nama, u.bagian, u.role, u.status, u.operator_code, u.branch_id, b.name as branch_name 
        FROM users u 
        LEFT JOIN branches b ON u.branch_id = b.id 
        WHERE u.deleted_at IS NULL
    `;
    let params = [];

    const isSuperAdmin = req.user.role === 'Super Admin';
    const isAdmin = req.user.role === 'Admin';
    if (!isSuperAdmin) {
        if (isAdmin && req.user.handled_branches) {
            const placeholders = req.user.handled_branches.map(() => '?').join(',');
            query += ` AND u.branch_id IN (${placeholders})`;
            params.push(...req.user.handled_branches);
        } else {
            query += " AND u.branch_id = ?";
            params.push(req.user.branch_id);
        }
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.getAkuntingUsers = (req, res) => {
    // Return all active users with role "Akunting" across all branches
    const query = "SELECT username, nama FROM users WHERE deleted_at IS NULL AND role = 'Akunting'";
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};
exports.createUser = async (req, res) => {
    const { username, nama, bagian, role, status, operator_code } = req.body;
    const id = crypto.randomUUID();
    const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    
    // Hanya ada 1 Super Admin di sistem, tidak bisa ditambahkan
    if (role === 'Super Admin') {
        return res.status(403).json({ error: "Tidak dapat membuat akun Super Admin. Hanya ada 1 Super Admin di sistem." });
    }

    // Security: Only Super Admin can specify a different branch_id. Others default to their own branch.
    const branch_id = (req.user.role === 'Super Admin') 
        ? (req.body.branch_id || 'B-PUSAT') 
        : req.user.branch_id;

    db.run("INSERT INTO users (id, username, nama, bagian, role, status, operator_code, password_hash, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, username, nama, bagian, role, status, operator_code, defaultHash, branch_id], function(err) {
            if (err) return res.status(400).json({ error: "Username sudah dipakai pengguna lain!" });

            const op = operator_code || "";
            const types = [
                { type: 'debet', prefix: op },
                { type: 'kredit', prefix: op ? op + 'K' : '' },
                { type: 'tagihan_lainnya', prefix: op ? op + 'T' : '' },
                { type: 'kewajiban_lainnya', prefix: op ? op + 'KW' : '' },
                { type: 'umb', prefix: op ? op + 'UMB' : '' }
            ];
            const isPg = process.env.DB_TYPE === 'postgres';
            types.forEach(t => {
                const sql = isPg
                    ? "INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, 1, $3) ON CONFLICT (username, slip_type) DO NOTHING"
                    : "INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 1, ?)";
                db.run(sql, [username, t.type, t.prefix]);
            });

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
    
    db.get("SELECT role, branch_id FROM users WHERE id = ? AND deleted_at IS NULL", [id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

        const isSuperAdmin = req.user.role === 'Super Admin';
        const isAdmin = req.user.role === 'Admin';
        const isSelf = req.user.id === id;

        // Super Admin memiliki akses penuh untuk mengedit semua user
        if (!isSuperAdmin) {
            // Cegah edit user yang role-nya Super Admin
            if (user.role === 'Super Admin') {
                return res.status(403).json({ error: "Akses ditolak. Tidak dapat mengubah akun Super Admin." });
            }
            if (isAdmin && req.user.handled_branches) {
                if (!req.user.handled_branches.includes(user.branch_id)) {
                    return res.status(403).json({ error: "Akses ditolak. Pengguna ini bukan dari cabang Anda." });
                }
            } else if (!isSelf && user.branch_id !== req.user.branch_id) {
                return res.status(403).json({ error: "Akses ditolak. Pengguna ini bukan dari cabang Anda." });
            }
        }

        // Cegah mengubah role menjadi Super Admin (hanya ada 1 Super Admin)
        const finalRole = (role === 'Super Admin' && !isSelf) ? user.role : role;

        // Super Admin bisa mengubah branch_id secara bebas, Admin reguler tidak bisa
        const branch_id = isSuperAdmin
            ? (req.body.branch_id || user.branch_id)
            : req.user.branch_id;

        db.run("UPDATE users SET username = ?, nama = ?, bagian = ?, role = ?, status = ?, operator_code = ?, branch_id = ? WHERE id = ?",
            [username, nama, bagian, finalRole, status, operator_code, branch_id, id], function(errUpdate) {
                if (errUpdate) return res.status(400).json({ error: errUpdate.message });

                const logId = "LOG-" + Date.now();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, new Date().toISOString(), req.user.nama, req.user.role,
                     `Mengubah data pengguna: ${username}`, req.ip || "127.0.0.1"]);

                res.json({ success: true });
            }
        );
    });
};

exports.deleteUser = (req, res) => {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
        return res.status(400).json({ error: "Tidak dapat menghapus akun sendiri yang sedang aktif." });
    }

    db.get("SELECT username, nama, operator_code, role, branch_id FROM users WHERE id = ? AND deleted_at IS NULL", [id], (err, user) => {
        if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

        const isSuperAdmin = req.user.role === 'Super Admin';
        const isAdmin = req.user.role === 'Admin';

        // Cegah penghapusan akun Super Admin (proteksi dari siapa pun)
        if (user.role === 'Super Admin') {
            return res.status(403).json({ error: "Akun Super Admin tidak dapat dihapus." });
        }
        
        if (!isSuperAdmin) {
            if (isAdmin && req.user.handled_branches) {
                if (!req.user.handled_branches.includes(user.branch_id)) {
                    return res.status(403).json({ error: "Akses ditolak. Pengguna ini bukan dari cabang Anda." });
                }
            } else if (user.branch_id !== req.user.branch_id) {
                return res.status(403).json({ error: "Akses ditolak. Pengguna ini bukan dari cabang Anda." });
            }
        }

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
    const canSeeAll = req.user.role === 'Super Admin' || req.user.role === 'Admin' || req.user.role === 'Kepala Bidang';
    
    let queryUser = "SELECT id, username, operator_code FROM users WHERE deleted_at IS NULL";
    let paramsUser = [];
    const isSuperAdmin = req.user.role === 'Super Admin';
    const isAdmin = req.user.role === 'Admin';
    if (!isSuperAdmin) {
        if (isAdmin && req.user.handled_branches) {
            const placeholders = req.user.handled_branches.map(() => '?').join(',');
            queryUser += ` AND branch_id IN (${placeholders})`;
            paramsUser.push(...req.user.handled_branches);
        } else {
            queryUser += " AND branch_id = ?";
            paramsUser.push(req.user.branch_id);
        }
    }

    db.all(queryUser, paramsUser, (err, users) => {
        if (err) return res.status(500).json({ error: err.message });

        // Pastikan semua user punya entri di ref_counters untuk 4 jenis slip
        const insertPromises = [];
        users.forEach(u => {
            const op = u.operator_code || "";
            const types = [
                { type: 'debet', prefix: op },
                { type: 'kredit', prefix: op ? op + 'K' : '' },
                { type: 'tagihan_lainnya', prefix: op ? op + 'T' : '' },
                { type: 'kewajiban_lainnya', prefix: op ? op + 'KW' : '' },
                { type: 'umb', prefix: op ? op + 'UMB' : '' }
            ];
            types.forEach(t => {
                insertPromises.push(new Promise(resolve => {
                    const isPg = process.env.DB_TYPE === 'postgres';
                    const sql = isPg
                        ? "INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, 1, $3) ON CONFLICT (username, slip_type) DO NOTHING"
                        : "INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 1, ?)";
                    db.run(sql, [u.username, t.type, t.prefix], resolve);
                }));
            });
        });

        Promise.all(insertPromises).then(() => {
            let query = `SELECT rc.username, rc.slip_type, rc.counter, rc.prefix, u.nama, u.operator_code
                    FROM ref_counters rc
                    INNER JOIN users u ON u.username = rc.username
                    WHERE u.deleted_at IS NULL`;
            let params = [];

            if (!canSeeAll) {
                // User biasa hanya melihat counter miliknya sendiri
                query += " AND rc.username = ?";
                params.push(req.user.username);
            }

            query += " ORDER BY u.nama ASC, rc.slip_type ASC";

            db.all(query, params, (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });
        });
    });
};

exports.updateRefCounter = (req, res) => {
    const { username } = req.params;
    const slipType = req.params.slip_type || 'debet';
    const { counter, prefix } = req.body;

    // Hanya Super Admin, Admin dan Kepala Bidang bisa edit counter milik orang lain
    const canEditAll = req.user.role === 'Super Admin' || req.user.role === 'Admin' || req.user.role === 'Kepala Bidang';
    if (!canEditAll && req.user.username !== username) {
        return res.status(403).json({ error: "Anda hanya dapat mengubah counter milik Anda sendiri." });
    }

    const newCounter = parseInt(counter);
    if (isNaN(newCounter) || newCounter < 1) {
        return res.status(400).json({ error: "Nilai counter tidak valid (harus >= 1)" });
    }
    const newPrefix = prefix !== undefined ? prefix.trim() : "";

    const isPg = process.env.DB_TYPE === 'postgres';
    const sql = isPg
        ? `INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, $3, $4)
           ON CONFLICT(username, slip_type) DO UPDATE SET counter = EXCLUDED.counter, prefix = EXCLUDED.prefix`
        : `INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, ?, ?)
           ON CONFLICT(username, slip_type) DO UPDATE SET counter = excluded.counter, prefix = excluded.prefix`;

    db.run(sql, [username, slipType, newCounter, newPrefix], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), req.user.nama, req.user.role,
             `Mengatur counter referensi ${username} (${slipType}): counter=${newCounter}, prefix=${newPrefix}`,
             "127.0.0.1"]);

        res.json({ success: true });
    });
};

exports.resetRefCounter = (req, res) => {
    const { username } = req.params;
    const slipType = req.params.slip_type || 'debet';

    // Hanya Super Admin, Admin dan Kepala Bidang bisa reset counter milik orang lain
    const canEditAll = req.user.role === 'Super Admin' || req.user.role === 'Admin' || req.user.role === 'Kepala Bidang';
    if (!canEditAll && req.user.username !== username) {
        return res.status(403).json({ error: "Anda hanya dapat mereset counter milik Anda sendiri." });
    }

    db.run("UPDATE ref_counters SET counter = 1 WHERE username = ? AND slip_type = ?", [username, slipType], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), req.user.nama, req.user.role,
             `Me-reset counter referensi ${username} (${slipType}) ke 1`, "127.0.0.1"]);

        res.json({ success: true });
    });
};

exports.importUsers = async (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "Tidak ada data untuk diimpor." });
    }

    try {
        const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
        
        db.all("SELECT id, name FROM branches", [], (err, branches) => {
            const branchMap = {};
            if (!err && branches) {
                branches.forEach(b => {
                    branchMap[b.id] = b.id;
                    branchMap[b.name.toLowerCase()] = b.id;
                    branchMap[b.name.replace(/^cabang\s+/i, '').toLowerCase()] = b.id;
                });
            }

            let imported = 0, skipped = 0;

        const processRow = (index) => {
            if (index >= rows.length) {
                // Done processing
                const logId = crypto.randomUUID();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, new Date().toISOString(), req.user.nama, req.user.role,
                     `Import Pengguna: ${imported} berhasil, ${skipped} dilewati`, req.ip || "127.0.0.1"],
                    () => {
                        res.json({ success: true, imported, skipped });
                    });
                return;
            }

            const row = rows[index];
            const username = (row.username || "").trim().toLowerCase();
            const nama = (row.nama || "").trim();
            const bagian = (row.bagian || "").trim();
            const role = (row.role || "").trim();
            const status = (row.status || "").trim() || "Aktif";
            const operator_code = (row.operator_code || "").trim();
            
            let inputBranch = (row.branch_id || "").trim();
            let finalBranchId = inputBranch;
            if (inputBranch) {
                const searchKey = inputBranch.toLowerCase();
                const searchKeyNoCabang = inputBranch.replace(/^cabang\s+/i, '').toLowerCase();
                if (branchMap[searchKey]) {
                    finalBranchId = branchMap[searchKey];
                } else if (branchMap[searchKeyNoCabang]) {
                    finalBranchId = branchMap[searchKeyNoCabang];
                }
            }
            const branch_id = finalBranchId || (req.user.role === 'Super Admin' ? 'B-PUSAT' : req.user.branch_id);

            if (!username || !nama || !role) {
                skipped++;
                return processRow(index + 1);
            }

            // Check if username already exists
            db.get("SELECT id FROM users WHERE username = ?", [username], (err, existingUser) => {
                if (err || existingUser) {
                    skipped++;
                    return processRow(index + 1);
                }

                // Insert user
                const id = crypto.randomUUID();
                db.run("INSERT INTO users (id, username, nama, bagian, role, status, operator_code, password_hash, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [id, username, nama, bagian, role, status, operator_code, defaultHash, branch_id], function(errInsert) {
                        if (errInsert) {
                            skipped++;
                            return processRow(index + 1);
                        }

                        // Seed ref_counters (4 slip types)
                        const op = operator_code || "";
                        const types = [
                            { type: 'debet', prefix: op },
                            { type: 'kredit', prefix: op ? op + 'K' : '' },
                            { type: 'tagihan_lainnya', prefix: op ? op + 'T' : '' },
                            { type: 'kewajiban_lainnya', prefix: op ? op + 'KW' : '' },
                            { type: 'umb', prefix: op ? op + 'UMB' : '' }
                        ];
                        const isPg = process.env.DB_TYPE === 'postgres';
                        const promises = types.map(t => new Promise(resolve => {
                            const sql = isPg
                                ? "INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, 1, $3) ON CONFLICT (username, slip_type) DO NOTHING"
                                : "INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 1, ?)";
                            db.run(sql, [username, t.type, t.prefix], resolve);
                        }));
                            Promise.all(promises).then(() => {
                                imported++;
                                processRow(index + 1);
                            });
                        });
                });
            };

            processRow(0);
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
