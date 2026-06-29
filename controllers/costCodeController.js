const crypto = require('crypto');
const db = require('../config/db');

exports.getCostCodes = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    let query = "SELECT * FROM cost_codes WHERE deleted_at IS NULL";
    let countQuery = "SELECT COUNT(*) as count FROM cost_codes WHERE deleted_at IS NULL";
    let params = [];

    if (search) {
        const s = `%${search}%`;
        const filterStr = " AND (kode LIKE ? OR deskripsi LIKE ?)";
        query += filterStr;
        countQuery += filterStr;
        params.push(s, s);
    }

    query += " ORDER BY kode ASC LIMIT ? OFFSET ?";

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

exports.createCostCode = (req, res) => {
    const { kode, deskripsi } = req.body;
    const id = crypto.randomUUID();

    db.run("INSERT INTO cost_codes (id, kode, deskripsi) VALUES (?, ?, ?)",
        [id, kode, deskripsi], function(err) {
            if (err) return res.status(400).json({ error: "Kode Biaya sudah terdaftar!" });

            const logId = crypto.randomUUID();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Menambahkan Kode Biaya: ${kode} - ${deskripsi}`, req.ip || "127.0.0.1"]);

            res.json({ success: true, id });
        }
    );
};

exports.updateCostCode = (req, res) => {
    const { id } = req.params;
    const { kode, deskripsi } = req.body;

    db.run("UPDATE cost_codes SET kode = ?, deskripsi = ? WHERE id = ?",
        [kode, deskripsi, id], function(err) {
            if (err) return res.status(400).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Mengubah Kode Biaya: ${kode} - ${deskripsi}`, req.ip || "127.0.0.1"]);

            res.json({ success: true });
        }
    );
};

exports.deleteCostCode = (req, res) => {
    const { id } = req.params;

    db.get("SELECT kode, deskripsi FROM cost_codes WHERE id = ? AND deleted_at IS NULL", [id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Kode biaya tidak ditemukan" });

        const now = new Date().toISOString();
        db.run("UPDATE cost_codes SET deleted_at = ? WHERE id = ?", [now, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const logId = "LOG-" + Date.now();
            db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                [logId, new Date().toISOString(), req.user.nama, req.user.role,
                 `Menghapus Kode Biaya: ${row.kode} - ${row.deskripsi}`, req.ip || "127.0.0.1"]);

            res.json({ success: true });
        });
    });
};

exports.bulkDeleteCostCodes = (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Daftar ID yang dihapus tidak boleh kosong." });
    }

    const now = new Date().toISOString();
    
    // Construct SQL placeholder list: (?, ?, ?)
    const placeholders = ids.map(() => "?").join(",");
    const query = `UPDATE cost_codes SET deleted_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`;

    db.run(query, [now, ...ids], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = crypto.randomUUID();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, now, req.user.nama, req.user.role,
             `Menghapus secara massal ${this.changes} kode biaya`, req.ip || "127.0.0.1"]);

        res.json({ success: true, count: this.changes });
    });
};

exports.importCostCodes = (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "Tidak ada data untuk diimpor." });
    }

    let imported = 0, skipped = 0, processed = 0;
    const stmt = db.prepare("INSERT OR REPLACE INTO cost_codes (id, kode, deskripsi) VALUES (?, ?, ?)");

    rows.forEach((row, idx) => {
        const kode = (row.kode || "").trim();
        const deskripsi = (row.deskripsi || "").trim();

        if (!kode || !deskripsi) {
            skipped++;
            processed++;
            if (processed === rows.length) done();
            return;
        }

        const id = crypto.randomUUID();
        stmt.run([id, kode, deskripsi], function(err) {
            if (err || this.changes === 0) skipped++;
            else imported++;
            processed++;
            if (processed === rows.length) done();
        });
    });

    function done() {
        stmt.finalize();
        const logId = crypto.randomUUID();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, new Date().toISOString(), req.user.nama, req.user.role,
             `Import Kode Biaya: ${imported} berhasil, ${skipped} dilewati`, "127.0.0.1"]);
        res.json({ success: true, imported, skipped });
    }
};

exports.clearAllCostCodes = (req, res) => {
    const now = new Date().toISOString();
    db.run("UPDATE cost_codes SET deleted_at = ? WHERE deleted_at IS NULL", [now], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const logId = crypto.randomUUID();
        db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [logId, now, req.user.nama, req.user.role,
             `Mengosongkan semua kode biaya (menghapus ${this.changes} kode biaya)`, req.ip || "127.0.0.1"]);

        res.json({ success: true, count: this.changes });
    });
};
