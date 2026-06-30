const { exec } = require('child_process');
const path = require('path');
const db = require('../config/db');

/**
 * POST /api/system/deploy
 * Admin-only: pull kode terbaru dari GitHub dan restart server.
 * Menggunakan Server-Sent Events (SSE) untuk streaming output ke browser.
 */
exports.deployUpdate = (req, res) => {
    // Set SSE headers agar browser menerima output secara streaming real-time
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (line, type = 'log') => {
        res.write(`data: ${JSON.stringify({ type, line })}\n\n`);
    };

    const APP_DIR = path.resolve(__dirname, '..');
    const DEPLOY_SCRIPT = path.join(APP_DIR, 'deploy.sh');

    send('🚀 Memulai proses deploy...', 'info');
    send(`📂 Direktori: ${APP_DIR}`, 'info');

    // Jalankan git pull terlebih dahulu — langkah ini aman karena proses belum mati
    const gitPull = exec(
        `git -C "${APP_DIR}" fetch origin && git -C "${APP_DIR}" reset --hard origin/main`,
        { cwd: APP_DIR }
    );

    gitPull.stdout.on('data', (d) => d.split('\n').filter(Boolean).forEach(l => send(l)));
    gitPull.stderr.on('data', (d) => d.split('\n').filter(Boolean).forEach(l => send(l, 'warn')));

    gitPull.on('close', (code) => {
        if (code !== 0) {
            send(`❌ git pull gagal (exit code: ${code})`, 'error');
            res.write(`data: ${JSON.stringify({ type: 'done', success: false })}\n\n`);
            return res.end();
        }

        send('✅ Kode berhasil diperbarui dari GitHub!', 'success');
        send('📦 Memeriksa dependensi...', 'info');

        // npm install --omit=dev
        const npmInstall = exec('npm install --omit=dev', { cwd: APP_DIR });
        npmInstall.stdout.on('data', (d) => d.split('\n').filter(Boolean).forEach(l => send(l)));
        npmInstall.stderr.on('data', (d) => {
            // npm warn messages are normal — treat as info, not error
            d.split('\n').filter(Boolean).forEach(l => {
                const isWarn = l.toLowerCase().includes('warn');
                send(l, isWarn ? 'warn' : 'log');
            });
        });

        npmInstall.on('close', (npmCode) => {
            send('✅ Dependensi sudah terkini.', 'success');
            send('🔁 Merestart server SENTRA...', 'info');
            send('⏳ Server akan direstart dalam 1 detik. Silakan tunggu...', 'info');

            // Kirim sinyal "done" ke browser SEBELUM server mati
            res.write(`data: ${JSON.stringify({ type: 'done', success: true })}\n\n`);
            res.end();

            // Restart server SETELAH response dikirim
            setTimeout(() => {
                const { spawn } = require('child_process');
                const restarter = spawn('bash', [DEPLOY_SCRIPT], {
                    detached: true,
                    stdio: 'ignore',
                    cwd: APP_DIR
                });
                restarter.unref();
            }, 800);
        });
    });
};

exports.getSettings = (req, res) => {
    db.all("SELECT * FROM system_settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => {
            settings[r.key] = r.value;
        });
        res.json(settings);
    });
};

exports.saveSettings = (req, res) => {
    const settings = req.body;
    const isPg = process.env.DB_TYPE === 'postgres';

    db.serialize(() => {
        if (!isPg) db.run("BEGIN IMMEDIATE TRANSACTION");

        const keys = Object.keys(settings);
        const insertPromises = keys.map(key => {
            return new Promise((resolve, reject) => {
                const val = typeof settings[key] === 'object' ? JSON.stringify(settings[key]) : String(settings[key]);
                const sql = isPg
                    ? "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                    : "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)";
                db.run(sql, [key, val], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        Promise.all(insertPromises)
            .then(() => {
                if (!isPg) db.run("COMMIT");
                res.json({ success: true });
            })
            .catch(err => {
                if (!isPg) db.run("ROLLBACK");
                res.status(500).json({ error: err.message });
            });
    });
};
