const crypto = require('crypto');
const db = require('../config/db');

exports.getBranches = (req, res) => {
    const query = `
        SELECT b.id, b.name, b.type, b.deleted_at, 
               MAX(u.nama) as admin_name, 
               MAX(u.username) as admin_username, 
               MAX(u.id) as admin_id 
        FROM branches b
        LEFT JOIN admin_branches ab ON b.id = ab.branch_id
        LEFT JOIN users u ON ab.admin_id = u.id AND u.deleted_at IS NULL
        WHERE b.deleted_at IS NULL 
        GROUP BY b.id, b.name, b.type, b.deleted_at
        ORDER BY b.type DESC, b.name ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.createBranch = (req, res) => {
    if (req.user.role !== 'Super Admin') {
        return res.status(403).json({ error: "Akses ditolak" });
    }
    const { name, type, admin_id } = req.body;
    if (!name) return res.status(400).json({ error: "Nama cabang diperlukan" });
    
    const id = "B-" + Date.now();
    db.run("INSERT INTO branches (id, name, type) VALUES (?, ?, ?)", [id, name, type || 'Cabang'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (admin_id) {
            db.run("INSERT INTO admin_branches (admin_id, branch_id) VALUES (?, ?)", [admin_id, id], () => {
                res.json({ id, name, type });
            });
        } else {
            res.json({ id, name, type });
        }
    });
};

exports.updateBranch = (req, res) => {
    if (req.user.role !== 'Super Admin') {
        return res.status(403).json({ error: "Akses ditolak" });
    }
    const { id } = req.params;
    const { name, type, admin_id, remove_admin } = req.body;
    
    db.run("UPDATE branches SET name = ?, type = ? WHERE id = ?", [name, type || 'Cabang', id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        if (remove_admin) {
            db.run("DELETE FROM admin_branches WHERE branch_id = ?", [id], () => {
                res.json({ success: true });
            });
        } else if (admin_id) {
            db.run("DELETE FROM admin_branches WHERE branch_id = ?", [id], () => {
                db.run("INSERT INTO admin_branches (admin_id, branch_id) VALUES (?, ?)", [admin_id, id], () => {
                    res.json({ success: true });
                });
            });
        } else {
            res.json({ success: true });
        }
    });
};

exports.deleteBranch = (req, res) => {
    if (req.user.role !== 'Super Admin') {
        return res.status(403).json({ error: "Akses ditolak" });
    }
    const { id } = req.params;
    if (id === 'B-PUSAT') return res.status(400).json({ error: "Kantor Pusat tidak dapat dihapus!" });
    
    // Check for users
    db.get("SELECT COUNT(*) as cnt FROM users WHERE branch_id = ? AND deleted_at IS NULL", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row.cnt > 0) return res.status(400).json({ error: "Cabang masih memiliki user aktif, tidak dapat dihapus." });
        
        db.run("UPDATE branches SET deleted_at = ? WHERE id = ?", [new Date().toISOString(), id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
};
