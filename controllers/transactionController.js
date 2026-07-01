const crypto = require('crypto');
const db = require('../config/db');

exports.getTransactions = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const search = req.query.search ? req.query.search.trim() : "";
    const code = req.query.code ? req.query.code.trim() : "";
    const date = req.query.date ? req.query.date.trim() : "";

    let query = "SELECT * FROM transactions WHERE deleted_at IS NULL";
    let countQuery = "SELECT COUNT(*) as count FROM transactions WHERE deleted_at IS NULL";
    let params = [];

    // Admin dan Kepala Bidang bisa melihat semua transaksi
    const canSeeAll = req.user.role === 'Admin' || req.user.role === 'Kepala Bidang';
    if (!canSeeAll) {
        // Filter berdasarkan username (lebih reliabel dari operator_code yang bisa kosong)
        const filterRole = " AND username = ?";
        query += filterRole;
        countQuery += filterRole;
        params.push(req.user.username);
    }

    if (search) {
        const s = `%${search}%`;
        const filterStr = " AND (ref_no LIKE ? OR debet_rekening LIKE ? OR debet_nama LIKE ? OR kredit_rekening LIKE ? OR kredit_nama LIKE ? OR keterangan LIKE ?)";
        query += filterStr;
        countQuery += filterStr;
        params.push(s, s, s, s, s, s);
    }

    if (code) {
        query += " AND (debet_rekening = ? OR kredit_rekening = ?)";
        countQuery += " AND (debet_rekening = ? OR kredit_rekening = ?)";
        params.push(code, code);
    }

    if (date) {
        query += " AND tanggal LIKE ?";
        countQuery += " AND tanggal LIKE ?";
        params.push(`${date}%`);
    }

    query += " ORDER BY tanggal DESC LIMIT ? OFFSET ?";
    
    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const totalCount = countRow ? (parseInt(countRow.count) || 0) : 0;
        const totalPages = Math.ceil(totalCount / limit);

        const queryParams = [...params, limit, offset];
        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
                totalCount,
                totalPages,
                page,
                limit
            });
        });
    });
};

exports.getNextRef = (req, res) => {
    // Ambil operator_code dan username terupdate langsung dari database untuk menghindari ketidaksesuaian cookie session
    db.get("SELECT username, operator_code FROM users WHERE id = ? AND deleted_at IS NULL", [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

        const username = user.username;
        const operator = user.operator_code || "";
        const slipType = req.query.slip_type || 'debet';

        const getDefPrefix = (op, type) => {
            if (!op) return "";
            if (type === 'kredit') return op + 'K';
            if (type === 'tagihan_lainnya') return op + 'T';
            if (type === 'kewajiban_lainnya') return op + 'KW';
            return op;
        };
        const defPrefix = getDefPrefix(operator, slipType);

        // Cari counter referensi yang saat ini terdaftar tanpa melakukan penambahan (increment)
        db.get("SELECT counter, prefix FROM ref_counters WHERE username = ? AND slip_type = ?", [username, slipType], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row) {
                const { counter, prefix } = row;
                const seq = String(counter).padStart(3, '0');
                const nextRef = `${(prefix || defPrefix)}${seq}`;
                res.json({ nextRef, counter, prefix: prefix || defPrefix });
            } else {
                // Jika belum ada row counter untuk operator ini, buat default counter = 1
                db.run("INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 1, ?)", [username, slipType, defPrefix], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    db.get("SELECT counter, prefix FROM ref_counters WHERE username = ? AND slip_type = ?", [username, slipType], (err3, newRow) => {
                        if (err3) return res.status(500).json({ error: err3.message });
                        const cnt = newRow ? newRow.counter : 1;
                        const prfx = newRow ? newRow.prefix : defPrefix;
                        const seq = String(cnt).padStart(3, '0');
                        const nextRef = `${(prfx)}${seq}`;
                        res.json({ nextRef, counter: cnt, prefix: prfx });
                    });
                });
            }
        });
    });
};

exports.createTransaction = (req, res) => {
    const {
        ref_no,
        operator_code,
        debet_nama,
        debet_rekening,
        kredit_nama,
        kredit_rekening,
        jenis_transaksi,
        nominal_utama,
        nominal_desimal,
        keterangan,
        terbilang
    } = req.body;

    let slipType = (jenis_transaksi || "debet").toLowerCase();
    if (!['debet', 'kredit', 'tagihan_lainnya', 'kewajiban_lainnya'].includes(slipType)) {
        slipType = 'debet'; // Fallback
    }

    if (!ref_no || ref_no.trim() === "") {
        return res.status(400).json({ error: "Nomor referensi tidak boleh kosong." });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Pastikan operator_code dibaca yang paling baru dari database
    db.get("SELECT username, operator_code FROM users WHERE id = ? AND deleted_at IS NULL", [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

        const operator_code = user.operator_code || "";
        const dNama = debet_nama || "Debit Account";
        const dRek = debet_rekening || "";
        const kNama = kredit_nama || "Credit Account";
        const kRek = kredit_rekening || "";

        const isPg = process.env.DB_TYPE === 'postgres';

        db.serialize(() => {
            if (!isPg) db.run("BEGIN EXCLUSIVE TRANSACTION;");

            db.get("SELECT id FROM transactions WHERE ref_no = ?", [ref_no], (err, row) => {
                if (row) {
                    if (!isPg) db.run("ROLLBACK;");
                    return res.status(400).json({ error: "Nomor referensi ganda terdeteksi!" });
                }

                db.run(`INSERT INTO transactions
                    (id, ref_no, tanggal, operator_code, username, debet_nama, debet_rekening, kredit_nama, kredit_rekening,
                     jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, ref_no, now, operator_code, user.username, dNama, dRek, kNama, kRek,
                     jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang],
                    function(err) {
                        if (err) {
                            if (!isPg) db.run("ROLLBACK;");

                            // Tangkap unique constraint violation (dari race condition atau duplikat manual)
                            const isUniqueViolation =
                                (err.code === '23505') ||
                                (err.message && err.message.includes('UNIQUE constraint failed'));

                            if (isUniqueViolation) {
                                return res.status(400).json({ error: "Nomor referensi ganda terdeteksi!" });
                            }
                            return res.status(500).json({ error: "Gagal menyimpan transaksi: " + err.message });
                        }

                        const afterCommit = () => {
                            const logId = crypto.randomUUID();
                            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                                [logId, now, req.user.nama, req.user.role,
                                 `Menyimpan slip: ${ref_no} senilai Rp ${nominal_utama},${nominal_desimal}`,
                                 req.ip || "127.0.0.1"]);

                            db.run("UPDATE ref_counters SET counter = counter + 1 WHERE username = ? AND slip_type = ?", [user.username, slipType]);

                            const notifId = crypto.randomUUID();
                            db.run("INSERT INTO notifications VALUES (?, ?, 'Kepala Bidang', ?, 0)",
                                [notifId, now, `Slip baru: ${ref_no} (Operator: ${req.user.nama})`]);

                            res.json({ success: true, id, ref_no });
                        };

                        if (!isPg) {
                            db.run("COMMIT;", (err) => {
                                if (err) {
                                    db.run("ROLLBACK;");
                                    return res.status(500).json({ error: "Gagal komit transaksi." });
                                }
                                afterCommit();
                            });
                        } else {
                            afterCommit();
                        }
                    }
                );
            });
        });
    });
};

exports.getAuditLogs = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const search = req.query.search ? req.query.search.trim() : "";
    const role = req.query.role ? req.query.role.trim() : "";

    let query = "SELECT * FROM audit_logs WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as count FROM audit_logs WHERE 1=1";
    let params = [];

    if (search) {
        const s = `%${search}%`;
        const filterStr = ' AND ("user" LIKE ? OR aksi LIKE ?)';
        query += filterStr;
        countQuery += filterStr;
        params.push(s, s);
    }

    if (role) {
        query += " AND role = ?";
        countQuery += " AND role = ?";
        params.push(role);
    }

    query += " ORDER BY tanggal DESC LIMIT ? OFFSET ?";

    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const totalCount = countRow ? (parseInt(countRow.count) || 0) : 0;
        const totalPages = Math.ceil(totalCount / limit);

        const queryParams = [...params, limit, offset];
        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
                totalCount,
                totalPages,
                page,
                limit
            });
        });
    });
};

exports.deleteAuditLogs = (req, res) => {
    const now = new Date().toISOString();

    db.run("DELETE FROM audit_logs", [], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = "LOG-" + Date.now();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, now, req.user.nama, req.user.role,
             "Melakukan pembersihan seluruh log audit", req.ip || "127.0.0.1"]);

        res.json({ success: true });
    });
};

exports.getNotifications = (req, res) => {
    db.all("SELECT * FROM notifications ORDER BY tanggal DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.markNotificationsAsRead = (req, res) => {
    const userRole = req.user.role;
    let query = "UPDATE notifications SET dibaca = 1 WHERE user_role = 'all' OR user_role = ?";
    let params = [userRole];

    if (userRole === "Admin") {
        query = "UPDATE notifications SET dibaca = 1 WHERE user_role = 'all' OR user_role = 'Kepala Bidang' OR user_role = 'Admin'";
        params = [];
    }

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
};

exports.updateTransactionDirectly = (req, res) => {
    const { id } = req.params;
    const {
        debet_nama, debet_rekening,
        kredit_nama, kredit_rekening,
        nominal_utama, nominal_desimal,
        keterangan, terbilang
    } = req.body;

    const now = new Date().toISOString();
    const updaterName = req.user.nama;

    db.run(
        `UPDATE transactions SET 
            debet_nama = ?, debet_rekening = ?, 
            kredit_nama = ?, kredit_rekening = ?, 
            jenis_transaksi = ?, 
            nominal_utama = ?, nominal_desimal = ?, 
            keterangan = ?, terbilang = ? 
         WHERE id = ?`,
        [
            debet_nama, debet_rekening,
            kredit_nama, kredit_rekening,
            kredit_nama, // jenis_transaksi
            parseFloat(nominal_utama) || 0,
            parseInt(nominal_desimal) || 0,
            keterangan, terbilang,
            id
        ],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log direct update to audit trail
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, now, updaterName, req.user.role,
                 `Mengubah transaksi langsung (ID: ${id}) senilai Rp ${nominal_utama},${nominal_desimal}`,
                 req.ip || "127.0.0.1"]);

            res.json({ success: true });
        }
    );
};

exports.deleteTransactionDirectly = (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    const updaterName = req.user.nama;

    db.get("SELECT ref_no, nominal_utama, nominal_desimal FROM transactions WHERE id = ?", [id], (err, tx) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!tx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

        db.run("UPDATE transactions SET deleted_at = ? WHERE id = ?", [now, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log direct delete to audit trail
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, now, updaterName, req.user.role,
                 `Menghapus transaksi langsung: ${tx.ref_no} senilai Rp ${tx.nominal_utama},${tx.nominal_desimal}`,
                 req.ip || "127.0.0.1"]);

            res.json({ success: true });
        });
    });
};
