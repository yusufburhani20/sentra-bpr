const crypto = require('crypto');
const db = require('../config/db');

exports.createRequest = (req, res) => {
    const { transaction_id, request_type, request_data } = req.body;

    if (!transaction_id || !request_type || !request_data) {
        return res.status(400).json({ error: "Parameter tidak lengkap." });
    }

    // Fetch ref_no of the target transaction first
    db.get("SELECT ref_no FROM transactions WHERE id = ?", [transaction_id], (err, tx) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!tx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const operatorCode = req.user.operator_code || '-';
        const operatorName = req.user.nama || '-';

        // Stringify request_data if it's an object
        const dataStr = typeof request_data === 'object' ? JSON.stringify(request_data) : request_data;

        db.run(
            `INSERT INTO approval_requests 
             (id, transaction_id, ref_no, request_type, request_data, operator_code, operator_name, requested_at, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [id, transaction_id, tx.ref_no, request_type, dataStr, operatorCode, operatorName, now],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // Create audit log for the request
                const logId = crypto.randomUUID();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, now, operatorName, req.user.role, 
                     `Mengajukan permintaan ${request_type} transaksi: ${tx.ref_no}`, 
                     req.ip || "127.0.0.1"]);

                // Add in-app notification to supervisors
                const notifId = crypto.randomUUID();
                db.run("INSERT INTO notifications VALUES (?, ?, 'Kepala Bidang', ?, 0)",
                    [notifId, now, `Pengajuan ${request_type} baru: ${tx.ref_no} (Operator: ${operatorName})`]);

                res.json({ success: true, id });
            }
        );
    });
};
exports.getPendingRequests = (req, res) => {
    const query = `
        SELECT 
            ar.*,
            t.debet_nama as orig_debet_nama,
            t.debet_rekening as orig_debet_rekening,
            t.kredit_nama as orig_kredit_nama,
            t.kredit_rekening as orig_kredit_rekening,
            t.nominal_utama as orig_nominal_utama,
            t.nominal_desimal as orig_nominal_desimal,
            t.keterangan as orig_keterangan
        FROM approval_requests ar
        INNER JOIN transactions t ON t.id = ar.transaction_id
        WHERE ar.status = 'PENDING'
        ORDER BY ar.requested_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Parse request_data strings to JSON objects for the frontend
        const parsed = rows.map(r => {
            try {
                r.request_data = JSON.parse(r.request_data);
            } catch(e) {
                // leave as string if parsing fails
            }
            return r;
        });
        res.json(parsed);
    });
};

exports.approveRequest = (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    db.get("SELECT * FROM approval_requests WHERE id = ? AND status = 'PENDING'", [id], (err, requestRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!requestRow) return res.status(404).json({ error: "Permintaan persetujuan tidak ditemukan atau sudah diproses." });

        const now = new Date().toISOString();
        const reviewerName = req.user.nama;

        const isPg = process.env.DB_TYPE === 'postgres';

        db.serialize(() => {
            if (!isPg) db.run("BEGIN TRANSACTION;");
 
            if (requestRow.request_type === 'DELETE') {
                // Soft delete transaction
                const delSuffix = `_del_${Date.now()}`;
                db.run("UPDATE transactions SET deleted_at = ?, ref_no = ref_no || ? WHERE id = ?", [now, delSuffix, requestRow.transaction_id], function(err) {
                    if (err) {
                        if (!isPg) db.run("ROLLBACK;");
                        return res.status(500).json({ error: "Gagal menghapus transaksi." });
                    }
                    finalizeApproval();
                });
            } else if (requestRow.request_type === 'EDIT') {
                // Parse request data to apply updates
                let data = {};
                try {
                    data = JSON.parse(requestRow.request_data);
                } catch(e) {
                    if (!isPg) db.run("ROLLBACK;");
                    return res.status(400).json({ error: "Format data request edit tidak valid." });
                }
 
                db.run(
                    `UPDATE transactions SET 
                        debet_nama = ?, debet_rekening = ?, 
                        kredit_nama = ?, kredit_rekening = ?, 
                        jenis_transaksi = ?, 
                        nominal_utama = ?, nominal_desimal = ?, 
                        keterangan = ?, terbilang = ? 
                     WHERE id = ?`,
                    [
                        data.debet_nama, data.debet_rekening,
                        data.kredit_nama, data.kredit_rekening,
                        data.kredit_nama, // jenis_transaksi
                        parseFloat(data.nominal_utama) || 0,
                        parseInt(data.nominal_desimal) || 0,
                        data.keterangan, data.terbilang,
                        requestRow.transaction_id
                    ],
                    function(err) {
                        if (err) {
                            if (!isPg) db.run("ROLLBACK;");
                            return res.status(500).json({ error: "Gagal mengubah transaksi." });
                        }
                        finalizeApproval();
                    }
                );
            } else {
                if (!isPg) db.run("ROLLBACK;");
                return res.status(400).json({ error: "Tipe permintaan tidak dikenal." });
            }
 
            function finalizeApproval() {
                db.run(
                    `UPDATE approval_requests SET 
                        status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, reason = ? 
                     WHERE id = ?`,
                    [reviewerName, now, reason || '', id],
                    function(err) {
                        if (err) {
                            if (!isPg) db.run("ROLLBACK;");
                            return res.status(500).json({ error: "Gagal menyimpan keputusan persetujuan." });
                        }
 
                        const afterCommit = () => {
                            // Log action
                            const logId = crypto.randomUUID();
                            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                                [logId, now, reviewerName, req.user.role, 
                                 `Persetujuan ${requestRow.request_type} transaksi ${requestRow.ref_no} DISETUJUI`, 
                                 req.ip || "127.0.0.1"]);
 
                            res.json({ success: true });
                        };

                        if (!isPg) {
                            db.run("COMMIT;", (err) => {
                                if (err) {
                                    db.run("ROLLBACK;");
                                    return res.status(500).json({ error: "Gagal komit transaksi persetujuan." });
                                }
                                afterCommit();
                            });
                        } else {
                            afterCommit();
                        }
                    }
                );
            }
        });
    });
};

exports.rejectRequest = (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    db.get("SELECT * FROM approval_requests WHERE id = ? AND status = 'PENDING'", [id], (err, requestRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!requestRow) return res.status(404).json({ error: "Permintaan persetujuan tidak ditemukan atau sudah diproses." });

        const now = new Date().toISOString();
        const reviewerName = req.user.nama;

        db.run(
            `UPDATE approval_requests SET 
                status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, reason = ? 
             WHERE id = ?`,
            [reviewerName, now, reason || '', id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // Log action
                const logId = crypto.randomUUID();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, now, reviewerName, req.user.role, 
                     `Persetujuan ${requestRow.request_type} transaksi ${requestRow.ref_no} DITOLAK: ${reason || '-'}`, 
                     req.ip || "127.0.0.1"]);

                res.json({ success: true });
            }
        );
    });
};

exports.getRequestHistory = (req, res) => {
    let query = "SELECT * FROM approval_requests";
    let params = [];

    if (req.user.role !== 'Admin' && req.user.role !== 'Kepala Bidang') {
        query += " WHERE operator_code = ?";
        params.push(req.user.operator_code);
    }

    query += " ORDER BY requested_at DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const parsed = rows.map(r => {
            try {
                r.request_data = JSON.parse(r.request_data);
            } catch(e) {}
            return r;
        });
        res.json(parsed);
    });
};
