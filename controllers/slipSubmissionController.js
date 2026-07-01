const crypto = require('crypto');
const db = require('../config/db');

// Fetch all submissions
exports.getSubmissions = (req, res) => {
    let query = "SELECT * FROM slip_submissions ORDER BY tanggal_kirim DESC";
    let params = [];

    const canSeeAll = req.user.role === 'Admin' || req.user.role === 'Kepala Bidang';
    if (!canSeeAll) {
        // Filter berdasarkan username (lebih reliabel), fallback ke operator_code/nama lama
        query = "SELECT * FROM slip_submissions WHERE (username = ? OR operator_code = ? OR operator_name = ?) ORDER BY tanggal_kirim DESC";
        params = [req.user.username || '', req.user.operator_code || '', req.user.nama || ''];
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
        kantor_kas 
    } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Bukti kirim (foto/gambar) wajib diunggah!" });
    }

    const id = "SUB-" + crypto.randomUUID();
    const tanggal_kirim = new Date().toISOString();
    const operator_name = req.user.nama;
    const operator_code = req.user.operator_code;
    const username = req.user.username;
    const bukti_kirim_path = "/uploads/" + req.file.filename;

    const query = `
        INSERT INTO slip_submissions (
            id, tanggal_kirim, operator_name, operator_code, username, kantor_kas,
            checklist_slips, checklist_mutasi, checklist_pb, checklist_fo,
            checklist_lainnya, bukti_kirim_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dikirim')
    `;

    const params = [
        id, tanggal_kirim, operator_name, operator_code, username, kantor_kas || req.user.bagian || "Kantor Kas",
        parseInt(checklist_slips) || 0,
        parseInt(checklist_mutasi) || 0,
        parseInt(checklist_pb) || 0,
        parseInt(checklist_fo) || 0,
        checklist_lainnya || '[]', // Should be JSON string
        bukti_kirim_path
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

    // Check if submission exists and is in 'Dikirim' status
    db.get("SELECT status FROM slip_submissions WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Data pengiriman tidak ditemukan!" });
        if (row.status === 'Sampai') {
            return res.status(400).json({ error: "Pengiriman ini sudah dikonfirmasi sampai sebelumnya." });
        }

        const tanggal_sampai = new Date().toISOString();
        const bukti_sampai_path = "/uploads/" + req.file.filename;

        const query = `
            UPDATE slip_submissions 
            SET status = 'Sampai', 
                tanggal_sampai = ?, 
                bukti_sampai_path = ?, 
                penerima_name = ?
            WHERE id = ?
        `;

        db.run(query, [tanggal_sampai, bukti_sampai_path, penerima_name.trim(), id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Add to audit logs
            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, tanggal_sampai, req.user.nama, req.user.role,
                 `Mengonfirmasi Penerimaan Slip: ID ${id}, Penerima: ${penerima_name}`, req.ip || "127.0.0.1"]);

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

    db.get("SELECT id, kantor_kas, bukti_kirim_path, bukti_sampai_path FROM slip_submissions WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Data pengiriman tidak ditemukan!" });

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
