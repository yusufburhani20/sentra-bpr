const fs = require('fs');
const path = require('path');

// Menggunakan path dari env, atau default ke /mnt/backup_windows
const getBackupFolderPath = () => {
    return process.env.BACKUP_FOLDER_PATH || '/mnt/backup_windows';
};

exports.listFiles = (req, res) => {
    let subDir = req.query.dir || '';
    
    // Keamanan: cegah path traversal (misal: ../../etc)
    subDir = path.normalize(subDir).replace(/^(\.\.(\/|\\|$))+/, '');
    
    const backupDir = getBackupFolderPath();
    const targetDir = path.join(backupDir, subDir);

    // Pastikan targetDir masih berada di dalam backupDir
    if (!targetDir.startsWith(backupDir)) {
        return res.status(403).json({ error: 'Akses ditolak.' });
    }

    fs.readdir(targetDir, (err, files) => {
        if (err) {
            if (err.code === 'ENOENT') return res.json([]);
            console.error('Error reading backup directory:', err);
            return res.status(500).json({ error: 'Gagal membaca direktori backup server.' });
        }

        const fileList = [];
        let pending = files.length;

        if (pending === 0) {
            return res.json([]);
        }

        files.forEach(filename => {
            const filePath = path.join(targetDir, filename);
            fs.stat(filePath, (err, stats) => {
                if (!err) {
                    fileList.push({
                        name: filename,
                        path: path.join(subDir, filename).replace(/\\/g, '/'),
                        isDir: stats.isDirectory(),
                        size: stats.isDirectory() ? 0 : stats.size,
                        modifiedAt: stats.mtime
                    });
                }
                pending--;
                if (pending === 0) {
                    // Urutkan: folder di atas, lalu file (urut terbaru)
                    fileList.sort((a, b) => {
                        if (a.isDir && !b.isDir) return -1;
                        if (!a.isDir && b.isDir) return 1;
                        return new Date(b.modifiedAt) - new Date(a.modifiedAt);
                    });
                    res.json(fileList);
                }
            });
        });
    });
};

exports.downloadFile = (req, res) => {
    let filepath = req.query.filepath;
    
    if (!filepath) {
        return res.status(400).json({ error: 'Filepath is required' });
    }

    // Keamanan: cegah path traversal
    filepath = path.normalize(filepath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    const backupDir = getBackupFolderPath();
    const fullPath = path.join(backupDir, filepath);

    if (!fullPath.startsWith(backupDir)) {
        return res.status(403).json({ error: 'Akses ditolak.' });
    }

    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).json({ error: 'File tidak ditemukan di server.' });
        }
        res.download(fullPath, path.basename(fullPath), (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Gagal mengunduh file.' });
                }
            } else {
                const db = require('../config/db');
                const crypto = require('crypto');
                const logId = crypto.randomUUID();
                db.run("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [logId, new Date().toISOString(), req.user.nama, req.user.role,
                     `Mengunduh file backup: ${path.basename(fullPath)}`, req.ip || "127.0.0.1"]);
            }
        });
    });
};
