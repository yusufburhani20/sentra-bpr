const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── HELPER: Promise wrappers ──────────────────────────────────────────────────
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
    });
}
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows || []); });
    });
}
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row || null); });
    });
}

// ─── GET /api/ideb/kantor ──────────────────────────────────────────────────────
exports.getKantor = async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM ideb_kantor ORDER BY idgroup, nmkantor');
        res.json(rows);
    } catch (e) {
        console.error('[iDEB] getKantor error:', e);
        res.status(500).json({ error: 'Gagal mengambil data kantor.' });
    }
};

// ─── GET /api/ideb/ref-kondisi ─────────────────────────────────────────────────
exports.getRefKondisi = async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM ideb_ref_kondisi ORDER BY kode');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: 'Gagal mengambil data referensi kondisi.' });
    }
};

// ─── GET /api/ideb/user-info ───────────────────────────────────────────────────
// Returns iDEB user info linked to the logged-in Sentra user (by username)
exports.getUserInfo = async (req, res) => {
    try {
        const username = req.user.username;
        const row = await dbGet('SELECT * FROM ideb_users WHERE sentra_username = ?', [username]);
        if (!row) {
            return res.json({ linked: false });
        }
        res.json({ linked: true, ...row });
    } catch (e) {
        res.status(500).json({ error: 'Gagal mengambil info user iDEB.' });
    }
};

// ─── POST /api/ideb/query ──────────────────────────────────────────────────────
// Query iDEB records by REF number (for one of 4 roles: debitur/pasangan/penjamin/pasangan_penjamin)
exports.queryByRef = async (req, res) => {
    try {
        const { ref } = req.body;
        if (!ref || !ref.trim()) {
            return res.status(400).json({ error: 'Nomor REF tidak boleh kosong.' });
        }
        const trimmed = ref.trim();
        const searchPattern = `%${trimmed}%`;
        const rows = await dbAll(
            `SELECT * FROM ideb_records 
             WHERE UPPER(ref) = UPPER(?) 
                OR UPPER(nik) = UPPER(?) 
                OR UPPER(ref) LIKE UPPER(?)
             ORDER BY id`,
            [trimmed, trimmed, searchPattern]
        );
        if (rows.length === 0) {
            return res.json({ found: false, records: [], summary: null });
        }
        // Calculate summary matching exact VB6 Desktop formula: (Plafon * (1 + SB/100)) / JW for active rows (OS > 0)
        const first = rows[0];
        const totalBD = rows.reduce((sum, r) => sum + (parseFloat(r.os) || 0), 0);
        const totalAngsuran = rows.reduce((sum, r) => {
            const osNum = parseFloat(r.os) || 0;
            if (osNum <= 0) return sum; // Ignore Lunas (OS = 0) rows

            const plafonNum = parseFloat(r.plafon) || 0;
            const sbNum = parseFloat(r.sb) || 0;
            const jwNum = parseFloat(r.jw) || 0;
            if (jwNum <= 0) return sum;

            const rowAngs = (plafonNum * (1 + (sbNum / 100))) / jwNum;
            return sum + rowAngs;
        }, 0);

        const collBuruk = first.coll_buruk;
        res.json({
            found: true,
            records: rows,
            summary: {
                nik: first.nik,
                nama: first.nama,
                alamat: first.alamat,
                coll_buruk: collBuruk,
                total_bd: Math.round(totalBD),
                total_angsuran: Math.round(totalAngsuran),
            }
        });
    } catch (e) {
        console.error('[iDEB] queryByRef error:', e);
        res.status(500).json({ error: 'Gagal melakukan query data iDEB.' });
    }
};

// ─── GET /api/ideb/search-ref ──────────────────────────────────────────────────
// Returns top 30 matching REF numbers / debtor names for autocomplete dropdown
exports.searchRefSuggestions = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let rows = [];
        if (!q) {
            rows = await dbAll(
                `SELECT DISTINCT ref, nama, nik FROM ideb_records 
                 WHERE ref IS NOT NULL AND ref != '' 
                 LIMIT 30`
            );
        } else {
            const pattern = `%${q}%`;
            rows = await dbAll(
                `SELECT DISTINCT ref, nama, nik FROM ideb_records 
                 WHERE UPPER(ref) LIKE UPPER(?) 
                    OR UPPER(nama) LIKE UPPER(?) 
                    OR UPPER(nik) LIKE UPPER(?)
                 LIMIT 30`,
                [pattern, pattern, pattern]
            );
        }
        res.json(rows);
    } catch (e) {
        console.error('[iDEB] searchRefSuggestions error:', e);
        res.status(500).json({ error: 'Gagal mengambil saran No. REF.' });
    }
};

// ─── POST /api/ideb/import-csv ─────────────────────────────────────────────────
// Import data from uploaded CSV/TXT export of SQL Server
const upload = multer({
    dest: path.join(__dirname, '..', 'uploads', 'ideb_temp'),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.txt', '.csv'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file .txt atau .csv yang diizinkan.'));
        }
    }
});
exports.uploadMiddleware = upload.single('file');

exports.importData = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
    }
    const filePath = req.file.path;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'File kosong atau format tidak valid.' });
        }

        // Detect delimiter
        const header = lines[0];
        const delimiter = header.includes('\t') ? '\t' : (header.includes(';') ? ';' : ',');
        const headers = header.split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());

        // Expected column mapping (flexible)
        const colMap = {
            noid: ['noid', 'no_id', 'id'],
            ref: ['ref'],
            nik: ['nik'],
            nama: ['nama'],
            alamat: ['alamat'],
            coll_buruk: ['coll_buruk', 'collburuk'],
            bank: ['bank', 'nama_lik', 'namalik'],
            plafon: ['plafon'],
            os: ['os', 'baki_debet', 'bakidebet'],
            sb: ['sb', 'suku_bunga', 'sukubunga'],
            jw: ['jw', 'jangka_waktu'],
            jatem: ['jatem', 'jatuh_tempo'],
            tunggakan: ['tunggakan'],
            coll: ['coll'],
            kondisi: ['kondisi'],
            tgl_update: ['tgl_update'],
            tgl_input: ['tgl_input'],
            cabang: ['cabang'],
            tung_hari: ['tung_hari', 'tunghari'],
            tunggakanpokok: ['tunggakanpokok', 'tunggakan_pokok'],
            tunggakanbunga: ['tunggakanbunga', 'tunggakan_bunga'],
            frekuensirestrukturisasi: ['frekuensirestrukturisasi'],
            angsuran: ['angsuran'],
        };

        const getIdx = (key) => {
            const alts = colMap[key] || [key];
            for (const a of alts) {
                const i = headers.indexOf(a);
                if (i >= 0) return i;
            }
            return -1;
        };

        const isPg = process.env.DB_TYPE === 'postgres';
        let inserted = 0;
        let skipped = 0;
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());

            const get = (key) => {
                const idx = getIdx(key);
                return idx >= 0 ? (cols[idx] || null) : null;
            };

            try {
                const sql = isPg
                    ? `INSERT INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                       ON CONFLICT DO NOTHING`
                    : `INSERT OR IGNORE INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

                const params = [
                    get('ref'), get('nik'), get('nama'), get('alamat'),
                    get('coll_buruk'), get('bank'),
                    parseFloat(get('plafon')) || 0,
                    parseFloat(get('os')) || 0,
                    parseFloat(get('sb')) || 0,
                    parseFloat(get('jw')) || 0,
                    get('jatem'), get('tunggakan'), get('coll'), get('kondisi'),
                    get('tgl_update'), get('tgl_input'), get('cabang'), get('tung_hari'),
                    parseFloat(get('tunggakanpokok')) || null,
                    parseFloat(get('tunggakanbunga')) || null,
                    parseFloat(get('frekuensirestrukturisasi')) || null,
                    parseFloat(get('angsuran')) || null,
                ];

                await dbRun(sql, params);
                inserted++;
            } catch (rowErr) {
                skipped++;
                if (errors.length < 5) errors.push(`Baris ${i + 1}: ${rowErr.message}`);
            }
        }

        fs.unlinkSync(filePath);
        res.json({
            success: true,
            message: `Import selesai. ${inserted} data berhasil diimpor, ${skipped} dilewati.`,
            inserted, skipped, errors
        });
    } catch (e) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('[iDEB] importData error:', e);
        res.status(500).json({ error: 'Gagal memproses file import.' });
    }
};

// ─── POST /api/ideb/import-kantor ─────────────────────────────────────────────
// Bulk upsert for kantor data
exports.upsertKantor = async (req, res) => {
    try {
        const { kantor } = req.body; // array of { idkantor, idgroup, nmkantor, titimangsa, versi }
        if (!Array.isArray(kantor) || kantor.length === 0) {
            return res.status(400).json({ error: 'Data kantor tidak valid.' });
        }
        const isPg = process.env.DB_TYPE === 'postgres';
        for (const k of kantor) {
            const sql = isPg
                ? `INSERT INTO ideb_kantor (idkantor, idgroup, nmkantor, titimangsa, versi) VALUES ($1,$2,$3,$4,$5)
                   ON CONFLICT (idkantor) DO UPDATE SET idgroup=EXCLUDED.idgroup, nmkantor=EXCLUDED.nmkantor, titimangsa=EXCLUDED.titimangsa, versi=EXCLUDED.versi`
                : `INSERT OR REPLACE INTO ideb_kantor (idkantor, idgroup, nmkantor, titimangsa, versi) VALUES (?,?,?,?,?)`;
            await dbRun(sql, [k.idkantor, k.idgroup, k.nmkantor, k.titimangsa || k.Titimangsa, k.versi || '113']);
        }
        res.json({ success: true, message: `${kantor.length} data kantor berhasil diimport.` });
    } catch (e) {
        console.error('[iDEB] upsertKantor error:', e);
        res.status(500).json({ error: 'Gagal mengimport data kantor.' });
    }
};

// ─── POST /api/ideb/import-users ──────────────────────────────────────────────
exports.upsertUsers = async (req, res) => {
    try {
        const { users } = req.body;
        if (!Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ error: 'Data user tidak valid.' });
        }
        const isPg = process.env.DB_TYPE === 'postgres';
        for (const u of users) {
            const sql = isPg
                ? `INSERT INTO ideb_users (userid, nama, jabatan, nama_sv, jabatan_sv, cabang, sentra_username) VALUES ($1,$2,$3,$4,$5,$6,$7)
                   ON CONFLICT (userid) DO UPDATE SET nama=EXCLUDED.nama, jabatan=EXCLUDED.jabatan, nama_sv=EXCLUDED.nama_sv, jabatan_sv=EXCLUDED.jabatan_sv, cabang=EXCLUDED.cabang, sentra_username=EXCLUDED.sentra_username`
                : `INSERT OR REPLACE INTO ideb_users (userid, nama, jabatan, nama_sv, jabatan_sv, cabang, sentra_username) VALUES (?,?,?,?,?,?,?)`;
            await dbRun(sql, [u.userid, u.nama, u.jabatan, u.nama_sv, u.jabatan_sv, u.cabang, u.sentra_username || null]);
        }
        res.json({ success: true, message: `${users.length} data user iDEB berhasil diimport.` });
    } catch (e) {
        console.error('[iDEB] upsertUsers error:', e);
        res.status(500).json({ error: 'Gagal mengimport data user iDEB.' });
    }
};

// ─── POST /api/ideb/import-records ───────────────────────────────────────────
// Bulk insert/upsert for records JSON data
exports.importRecords = async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: 'Data records tidak valid atau kosong.' });
        }
        const isPg = process.env.DB_TYPE === 'postgres';
        let inserted = 0;

        await dbRun(isPg ? 'BEGIN' : 'BEGIN TRANSACTION');
        for (const r of records) {
            const sql = isPg
                ? `INSERT INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`
                : `INSERT INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

            const params = [
                r.ref || null, r.nik || null, r.nama || null, r.alamat || null,
                r.coll_buruk !== undefined ? String(r.coll_buruk) : null,
                r.bank || r.nama_lik || null,
                parseFloat(r.plafon) || 0,
                parseFloat(r.os || r.baki_debet) || 0,
                parseFloat(r.sb || r.suku_bunga) || 0,
                parseFloat(r.jw || r.jangka_waktu) || 0,
                r.jatem || r.jatuh_tempo || null,
                r.tunggakan !== undefined ? String(r.tunggakan) : null,
                r.coll !== undefined ? String(r.coll) : null,
                r.kondisi || null,
                r.tgl_update || null,
                r.tgl_input || null,
                r.cabang || null,
                r.tung_hari !== undefined ? String(r.tung_hari) : null,
                r.tunggakanpokok !== undefined ? parseFloat(r.tunggakanpokok) : null,
                r.tunggakanbunga !== undefined ? parseFloat(r.tunggakanbunga) : null,
                r.frekuensirestrukturisasi !== undefined ? parseFloat(r.frekuensirestrukturisasi) : null,
                r.angsuran !== undefined ? parseFloat(r.angsuran) : null,
            ];
            try {
                await dbRun(sql, params);
                inserted++;
            } catch (rowErr) {
                // Ignore duplicates or bad rows
            }
        }
        await dbRun('COMMIT');
        res.json({ success: true, message: `${inserted} data iDEB berhasil diimport.`, inserted });
    } catch (e) {
        await dbRun('ROLLBACK').catch(() => {});
        console.error('[iDEB] importRecords error:', e);
        res.status(500).json({ error: 'Gagal mengimport data iDEB.' });
    }
};

// ─── GET /api/ideb/stats ───────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
    try {
        const total = await dbGet('SELECT COUNT(*) as count FROM ideb_records');
        const coll5 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '5'");
        const lastUpdate = await dbGet('SELECT MAX(tgl_input) as last FROM ideb_records');
        res.json({
            total_records: total?.count || 0,
            total_coll5: coll5?.count || 0,
            last_update: lastUpdate?.last || null,
        });
    } catch (e) {
        res.status(500).json({ error: 'Gagal mengambil statistik iDEB.' });
    }
};

