const crypto = require('crypto');
const db = require('../config/db');

// Fetch all submissions
exports.getSubmissions = (req, res) => {
    let query = "SELECT * FROM slip_submissions ORDER BY tanggal_kirim DESC";
    let params = [];

    const isSuperAdmin = req.user.role === 'Super Admin';
    const isPusat = req.user.branch_id === 'B-PUSAT';
    const isAdmin = req.user.role === 'Admin';

    if (isSuperAdmin) {
        // Super Admin sees everything
    } else if (isAdmin || req.user.role === 'Kepala Bidang') {
        // Admin / Kepala Bidang Cabang sees all within their branch
        query = "SELECT * FROM slip_submissions WHERE branch_id = ? ORDER BY tanggal_kirim DESC";
        params = [req.user.branch_id];
    } else if (req.user.role === 'Akunting') {
        // Akunting sees all in branch, but especially theirs
        query = "SELECT * FROM slip_submissions WHERE branch_id = ? ORDER BY tanggal_kirim DESC";
        params = [req.user.branch_id];
    } else {
        // Standard user sees only their own
        query = "SELECT * FROM slip_submissions WHERE branch_id = ? AND username = ? ORDER BY tanggal_kirim DESC";
        params = [req.user.branch_id, req.user.username];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Parse checklist_lainnya JSON array safely
        const parsedRows = rows.map(row => {
            try {
                row.checklist_lainnya = JSON.parse(row.checklist_lainnya || '[]');
            } catch (e) {
                row.checklist_lainnya = [];
            }
            return row;
        });
        
        res.json(parsedRows);
    });
};

// Create a new submission
exports.createSubmission = (req, res) => {
    const { 
        checklist_slips, 
        checklist_mutasi, 
        checklist_pb, 
        checklist_fo, 
        checklist_lainnya, 
        kantor_kas,
        tujuan_akunting
    } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Bukti kirim (foto/gambar) wajib diunggah!" });
    }

    const id = "SUB-" + crypto.randomUUID();
    const tanggal_kirim = new Date().toISOString();
    const operator_name = req.user.nama;
    const operator_code = req.user.operator_code;
    const username = req.user.username;
    const branch_id = req.user.branch_id;
    const bukti_kirim_path = "/uploads/" + req.file.filename;

    const query = `
        INSERT INTO slip_submissions (
            id, tanggal_kirim, operator_name, operator_code, username, kantor_kas,
            checklist_slips, checklist_mutasi, checklist_pb, checklist_fo,
            checklist_lainnya, bukti_kirim_path, status, branch_id, tujuan_akunting
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dikirim', ?, ?)
    `;

    const params = [
        id, tanggal_kirim, operator_name, operator_code, username, kantor_kas || req.user.bagian || "Kantor Kas",
        parseInt(checklist_slips) || 0,
        parseInt(checklist_mutasi) || 0,
        parseInt(checklist_pb) || 0,
        parseInt(checklist_fo) || 0,
        checklist_lainnya || '[]',
        bukti_kirim_path,
        branch_id,
        tujuan_akunting || null
    ];

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // Add to audit logs
        const logId = crypto.randomUUID();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, tanggal_kirim, req.user.nama, req.user.role,
             `Mengirim Berkas Slip & Laporan: ID ${id} (${kantor_kas})`, req.ip || "127.0.0.1"]);

        res.json({ success: true, id });
    });
};

// Confirm arrival of a submission
exports.confirmArrival = (req, res) => {
    const { id } = req.params;
    const { penerima_name } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Bukti sampai (foto/gambar) wajib diunggah!" });
    }

    if (!penerima_name || !penerima_name.trim()) {
        return res.status(400).json({ error: "Nama penerima wajib diisi!" });
    }

    db.get("SELECT tujuan_akunting FROM slip_submissions WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Slip tidak ditemukan" });

        if (req.user.role !== 'Admin') {
            if (row.tujuan_akunting && row.tujuan_akunting !== req.user.username) {
                return res.status(403).json({ error: "Hanya Akunting yang dituju yang berhak mengonfirmasi berkas ini." });
            }
        }

        const tanggal_sampai = new Date().toISOString();
        const bukti_sampai_path = "/uploads/" + req.file.filename;

        const query = `
            UPDATE slip_submissions 
            SET status = 'Diterima', tanggal_sampai = ?, penerima_name = ?, bukti_sampai_path = ?
            WHERE id = ?
        `;

        db.run(query, [tanggal_sampai, penerima_name || req.user.nama, bukti_sampai_path, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Add to audit logs
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, tanggal_sampai, req.user.nama, req.user.role,
                 `Mengonfirmasi Slip Diterima: ID ${id}`, req.ip || "127.0.0.1"]);

            res.json({ success: true });
        });
    });
};

// Delete a submission
exports.deleteSubmission = (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'Admin' && req.user.role !== 'Kepala Bidang') {
        return res.status(403).json({ error: "Akses ditolak. Hanya Admin dan Kepala Bidang yang dapat menghapus pengiriman." });
    }

    db.get("SELECT id, kantor_kas, bukti_kirim_path, bukti_sampai_path, branch_id FROM slip_submissions WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Data pengiriman tidak ditemukan!" });

        const isSuperAdmin = req.user.role === 'Super Admin';
        
        if (!isSuperAdmin && row.branch_id !== req.user.branch_id) {
            return res.status(403).json({ error: "Akses ditolak. Transaksi ini bukan dari cabang Anda." });
        }

        db.run("DELETE FROM slip_submissions WHERE id = ?", [id], function(errDel) {
            if (errDel) return res.status(500).json({ error: errDel.message });

            // Optional: delete associated files from disk
            const fs = require('fs');
            const path = require('path');
            [row.bukti_kirim_path, row.bukti_sampai_path].forEach(p => {
                if (p) {
                    const filePath = path.join(__dirname, '..', p);
                    if (fs.existsSync(filePath)) {
                        try { fs.unlinkSync(filePath); } catch(e) {}
                    }
                }
            });

            // Add to audit logs
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Menghapus Pengiriman Berkas Slip: ID ${id} (${row.kantor_kas})`, req.ip || "127.0.0.1"]);

            res.json({ success: true });
        });
    });
};
