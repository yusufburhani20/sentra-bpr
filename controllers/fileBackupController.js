const fs = require('fs');
const path = require('path');

// Menggunakan path dari env, atau default ke /mnt/backup_windows
const getBackupFolderPath = () => {
    return process.env.BACKUP_FOLDER_PATH || '/mnt/backup_windows';
};

exports.listFiles = (req, res) => {
    const backupDir = getBackupFolderPath();

    fs.readdir(backupDir, (err, files) => {
        if (err) {
            // Jika folder tidak ditemukan atau tidak ada akses
            if (err.code === 'ENOENT') {
                return res.json([]); // Kembalikan array kosong jika folder belum ada
            }
            console.error('Error reading backup directory:', err);
            return res.status(500).json({ error: 'Gagal membaca direktori backup server.' });
        }

        const fileList = [];
        let pending = files.length;

        if (pending === 0) {
            return res.json([]);
        }

        files.forEach(filename => {
            const filePath = path.join(backupDir, filename);
            fs.stat(filePath, (err, stats) => {
                if (!err && stats.isFile()) {
                    fileList.push({
                        name: filename,
                        size: stats.size,
                        modifiedAt: stats.mtime
                    });
                }
                pending--;
                if (pending === 0) {
                    // Urutkan berdasarkan waktu modifikasi terbaru
                    fileList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
                    res.json(fileList);
                }
            });
        });
    });
};

exports.downloadFile = (req, res) => {
    const filename = req.query.filename;
    
    if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
    }

    // Keamanan: Pastikan hanya nama file, bukan path traversal (misal: ../../etc/passwd)
    const safeFilename = path.basename(filename);
    const backupDir = getBackupFolderPath();
    const filePath = path.join(backupDir, safeFilename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).json({ error: 'File tidak ditemukan di server.' });
        }
        res.download(filePath, safeFilename, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Gagal mengunduh file.' });
                }
            } else {
                // Log audit opsional saat file didownload
                const db = require('../config/db');
                const crypto = require('crypto');
                const logId = crypto.randomUUID();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, new Date().toISOString(), req.user.nama, req.user.role,
                     `Mengunduh file backup: ${safeFilename}`, req.ip || "127.0.0.1"]);
            }
        });
    });
};
