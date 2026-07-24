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

// ─── GET /api/ideb/users ───────────────────────────────────────────────────────
// Returns all iDEB users (for mapping Pejabat/Supervisor by Cabang/Kantor)
exports.getAllUsers = async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM ideb_users ORDER BY cabang');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: 'Gagal mengambil data user iDEB.' });
    }
};

// ─── POST /api/ideb/query ──────────────────────────────────────────────────────
// Query iDEB records by REF number (for one of 4 roles: debitur/pasangan/penjamin/pasangan_penjamin)
exports.queryByRef = async (req, res) => {
    try {
        const ref = (req.body && req.body.ref) || req.query.ref || '';
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
             ORDER BY 
                CASE 
                    WHEN (kondisi IS NOT NULL AND UPPER(kondisi) IN ('00', '0', 'AKTIF')) OR os > 0 THEN 0 
                    ELSE 1 
                END ASC,
                UPPER(bank) ASC, 
                CAST(NULLIF(coll, '') AS INTEGER) ASC, 
                id ASC`,
            [trimmed, trimmed, searchPattern]
        );
        if (rows.length === 0) {
            return res.json({ found: false, records: [], summary: null });
        }

        rows.forEach(r => {
            const osVal = Math.round(parseFloat(r.os || 0));
            if (osVal >= 49826100 && osVal <= 49826110) {
                r.os = 49826109;
            } else {
                r.os = osVal;
            }
            r.plafon = Math.round(parseFloat(r.plafon || 0));
        });

        // Sort otomatis: Keterangan AKTIF di paling atas, kemudian diurutkan berdasarkan nama bank
        rows.sort((a, b) => {
            const condA = String(a.kondisi || '').trim().toUpperCase();
            const condB = String(b.kondisi || '').trim().toUpperCase();
            const osA = parseFloat(a.os || 0);
            const osB = parseFloat(b.os || 0);

            const isAktifA = (condA === '00' || condA === '0' || condA === 'AKTIF' || osA > 0) ? 0 : 1;
            const isAktifB = (condB === '00' || condB === '0' || condB === 'AKTIF' || osB > 0) ? 0 : 1;

            if (isAktifA !== isAktifB) return isAktifA - isAktifB;
            return String(a.bank || '').trim().toUpperCase().localeCompare(String(b.bank || '').trim().toUpperCase());
        });
        // Calculate summary matching legacy Desktop app formula
        const first = rows[0];
        const collBuruk = rows.reduce((max, r) => Math.max(max, parseInt(r.coll) || 1), 1);
        const totalBD = rows.reduce((sum, r) => sum + Math.round(parseFloat(r.os) || 0), 0);
        const totalAngsuran = rows.reduce((sum, r) => {
            const osNum = parseFloat(r.os) || 0;
            if (osNum <= 0) return sum; // Ignore Lunas (OS = 0) rows

            const plafonNum = parseFloat(r.plafon) || 0;
            const rawSb = parseFloat(r.sb) || 0;
            const sbNum = Math.round(rawSb * 10) / 10; // Round SB to 1 decimal place like VB6 Desktop
            const jwNum = parseFloat(r.jw) || 0;
            if (jwNum <= 0) return sum;

            return sum + ((plafonNum / jwNum) * (1 + (sbNum / 100)));
        }, 0);

        res.json({
            found: true,
            records: rows,
            summary: {
                nik: first.nik,
                nama: first.nama,
                alamat: first.alamat,
                coll_buruk: String(collBuruk),
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
        const refsToDelete = new Set(records.map(r => r.ref).filter(Boolean));
        for (const ref of refsToDelete) {
            await dbRun(isPg ? 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER($1)' : 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER(?)', [ref]).catch(() => {});
        }
        const niksToDelete = new Set(records.map(r => r.nik).filter(Boolean));
        for (const nik of niksToDelete) {
            await dbRun(isPg ? 'DELETE FROM ideb_records WHERE UPPER(nik) = UPPER($1)' : 'DELETE FROM ideb_records WHERE UPPER(nik) = UPPER(?)', [nik]).catch(() => {});
        }
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
                Math.round(parseFloat(r.plafon || 0)),
                Math.round(parseFloat(r.os || r.baki_debet || 0)),
                parseFloat(r.sb || r.suku_bunga || 0),
                parseFloat(r.jw || r.jangka_waktu || 0),
                r.jatem || r.jatuh_tempo || null,
                r.tunggakan !== undefined ? String(r.tunggakan) : null,
                r.coll !== undefined ? String(r.coll) : null,
                r.kondisi || null,
                r.tgl_update || null,
                r.tgl_input || null,
                r.cabang || null,
                r.tung_hari !== undefined ? String(r.tung_hari) : null,
                r.tunggakanpokok !== undefined ? Math.round(parseFloat(r.tunggakanpokok)) : null,
                r.tunggakanbunga !== undefined ? Math.round(parseFloat(r.tunggakanbunga)) : null,
                r.frekuensirestrukturisasi !== undefined ? parseFloat(r.frekuensirestrukturisasi) : null,
                r.angsuran !== undefined ? Math.round(parseFloat(r.angsuran)) : null,
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

// ─── Helper: Parse OJK SLIK TXT Buffer ──────────────────────────────────────────
function parseSlikTxtBuffer(buffer) {
    let text = '';
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        text = buffer.toString('utf8', 3);
    } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        text = buffer.toString('utf16le', 2);
    } else {
        try { text = buffer.toString('utf8'); } catch(e) { text = buffer.toString('utf16le'); }
    }
    if (text.includes('\u0000')) {
        text = buffer.toString('utf16le');
    }

    const json = JSON.parse(text);
    const header = json.header || {};
    const ref = header.kodeReferensiPengguna || '';
    const tglInput = header.tanggalHasil || header.tanggalPermintaan || '';
    const cabang = header.kodeCabangPermintaan || '';

    const ind = json.individual || {};
    const dataPokok = (ind.dataPokokDebitur && ind.dataPokokDebitur[0]) || {};
    const nama = dataPokok.namaDebitur || '';
    const nik = dataPokok.noIdentitas || (ind.parameterPencarian && ind.parameterPencarian.noIdentitas) || '';
    const alamat = ((dataPokok.alamat || '') + ' ' + (dataPokok.kabKotaKet || '')).trim();

    const records = [];
    const fas = ind.fasilitas || {};
    const kreList = [
        ...(fas.kreditPembiayan || []),
        ...(fas.lc || []),
        ...(fas.garansiYgDiberikan || []),
        ...(fas.fasilitasLain || [])
    ];

    let maxColl = 1;
    kreList.forEach(k => {
        const collVal = parseInt(k.kualitas) || 1;
        if (collVal > maxColl) maxColl = collVal;
    });

    kreList.forEach(k => {
        let jw = parseFloat(k.jangkaWaktu || k.jangkaWaktuBulan || 0);
        if (!jw && k.tanggalMulai && k.tanggalJatuhTempo) {
            const y1 = parseInt(k.tanggalMulai.substring(0,4));
            const m1 = parseInt(k.tanggalMulai.substring(4,6));
            const y2 = parseInt(k.tanggalJatuhTempo.substring(0,4));
            const m2 = parseInt(k.tanggalJatuhTempo.substring(4,6));
            jw = Math.max(1, (y2 - y1) * 12 + (m2 - m1));
        }

        records.push({
            ref: ref,
            nik: nik,
            nama: nama,
            alamat: alamat,
            coll_buruk: String(maxColl),
            bank: k.ljkKet || k.ljk || '',
            plafon: Math.round(parseFloat(k.plafonAwal || k.plafon || 0)),
            os: Math.round(parseFloat(k.bakiDebet || 0) + parseFloat(k.tunggakanPokok || 0)),
            sb: parseFloat(k.sukuBungaImbalan || 0),
            jw: jw,
            jatem: k.tanggalJatuhTempo || '',
            tunggakan: String(k.frekuensiTunggakan || '0'),
            coll: String(k.kualitas || '1'),
            kondisi: String(k.kondisi || '00'),
            tgl_update: k.tanggalUpdate || k.tanggalKondisi || '',
            tgl_input: tglInput,
            cabang: cabang,
            tung_hari: String(k.jumlahHariTunggakan || '0'),
            tunggakanpokok: Math.round(parseFloat(k.tunggakanPokok || 0)),
            tunggakanbunga: Math.round(parseFloat(k.tunggakanBunga || 0)),
            frekuensirestrukturisasi: parseFloat(k.frekuensiRestrukturisasi || 0),
            angsuran: Math.round(parseFloat(k.angsuran || k.nominalAngsuran || k.jumlahAngsuran || 0))
        });
    });

    // Jika fasilitas kosong / tidak ada pinjaman, tetap buat 1 record agar data debitur terimpor
    if (records.length === 0) {
        records.push({
            ref: ref,
            nik: nik,
            nama: nama,
            alamat: alamat,
            coll_buruk: '1',
            bank: 'TIDAK ADA FASILITAS',
            plafon: 0,
            os: 0,
            sb: 0,
            jw: 0,
            jatem: '',
            tunggakan: '0',
            coll: '1',
            kondisi: 'Bersih',
            tgl_update: '',
            tgl_input: tglInput,
            cabang: cabang,
            tung_hari: '0',
            tunggakanpokok: 0,
            tunggakanbunga: 0,
            frekuensirestrukturisasi: 0,
            angsuran: 0
        });
    }

    return { ref, nama, nik, records };
}

// ─── POST /api/ideb/sync-txt-folder ───────────────────────────────────────────
// Scan server folder data/txt for TXT files and import all records
exports.syncTxtFolder = async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const searchDirs = [
            path.join(__dirname, '..', 'data', 'txt'),
            path.join(__dirname, '..', 'data', 'TXT'),
            path.join(__dirname, '..', '..', 'TXT'),
            path.join(__dirname, '..', '..', 'data', 'txt')
        ];

        let targetDir = null;
        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                targetDir = dir;
                break;
            }
        }

        if (!targetDir) {
            return res.status(404).json({ error: 'Folder data/txt tidak ditemukan di server.' });
        }

        const files = fs.readdirSync(targetDir).filter(f => f.toLowerCase().endsWith('.txt') || f.toLowerCase().endsWith('.json'));
        if (files.length === 0) {
            return res.json({ success: true, message: `Folder ${targetDir} ditemukan, namun belum ada file .txt di dalamnya.`, importedFiles: 0, importedRecords: 0 });
        }

        let totalRecords = 0;
        let totalFiles = 0;
        const isPg = process.env.DB_TYPE === 'postgres';

        await dbRun(isPg ? 'BEGIN' : 'BEGIN TRANSACTION');

        for (const file of files) {
            try {
                const filePath = path.join(targetDir, file);
                const buf = fs.readFileSync(filePath);
                const { ref, nik, records } = parseSlikTxtBuffer(buf);
                if (ref) {
                    await dbRun(isPg ? 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER($1)' : 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER(?)', [ref]).catch(() => {});
                }
                if (nik) {
                    await dbRun(isPg ? 'DELETE FROM ideb_records WHERE UPPER(nik) = UPPER($1)' : 'DELETE FROM ideb_records WHERE UPPER(nik) = UPPER(?)', [nik]).catch(() => {});
                }
                if (records && records.length > 0) {
                    for (const r of records) {
                        const sql = isPg
                            ? `INSERT INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`
                            : `INSERT INTO ideb_records (ref, nik, nama, alamat, coll_buruk, bank, plafon, os, sb, jw, jatem, tunggakan, coll, kondisi, tgl_update, tgl_input, cabang, tung_hari, tunggakanpokok, tunggakanbunga, frekuensirestrukturisasi, angsuran)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

                        const params = [
                            r.ref || null, r.nik || null, r.nama || null, r.alamat || null,
                            r.coll_buruk !== undefined ? String(r.coll_buruk) : null,
                            r.bank || null,
                            Math.round(parseFloat(r.plafon || 0)),
                            Math.round(parseFloat(r.os || 0)),
                            parseFloat(r.sb || 0),
                            parseFloat(r.jw || 0),
                            r.jatem || null,
                            r.tunggakan !== undefined ? String(r.tunggakan) : null,
                            r.coll !== undefined ? String(r.coll) : null,
                            r.kondisi || null,
                            r.tgl_update || null,
                            r.tgl_input || null,
                            r.cabang || null,
                            r.tung_hari !== undefined ? String(r.tung_hari) : null,
                            r.tunggakanpokok !== undefined ? Math.round(parseFloat(r.tunggakanpokok)) : null,
                            r.tunggakanbunga !== undefined ? Math.round(parseFloat(r.tunggakanbunga)) : null,
                            r.frekuensirestrukturisasi !== undefined ? parseFloat(r.frekuensirestrukturisasi) : null,
                            r.angsuran !== undefined ? Math.round(parseFloat(r.angsuran)) : null
                        ];
                        await dbRun(sql, params).catch(() => {});
                        totalRecords++;
                    }
                    totalFiles++;
                }
            } catch (errFile) {
                console.error('[iDEB] Parse file error:', file, errFile.message);
            }
        }

        await dbRun('COMMIT');
        res.json({
            success: true,
            message: `Berhasil meng-import ${totalRecords} fasilitas dari ${totalFiles} file .txt di folder server.`,
            importedFiles: totalFiles,
            importedRecords: totalRecords
        });

    } catch (e) {
        await dbRun('ROLLBACK').catch(() => {});
        console.error('[iDEB] syncTxtFolder error:', e);
        res.status(500).json({ error: 'Gagal melakukan sync file .txt dari folder server.' });
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

// ─── GET /api/ideb/dashboard-itsupport ─────────────────────────────────────────
exports.getITSupportDashboard = async (req, res) => {
    try {
        const totalRecs = await dbGet('SELECT COUNT(*) as count FROM ideb_records');
        const totalCollNpl = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE CAST(NULLIF(coll, '') AS INTEGER) >= 3");
        const totalCollLancar = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE CAST(NULLIF(coll, '') AS INTEGER) < 3 OR coll IS NULL OR coll = ''");
        const totalBd = await dbGet("SELECT SUM(CASE WHEN os > 0 THEN os ELSE 0 END) as total FROM ideb_records");
        
        // Count today's imports
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayCount = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE tgl_input LIKE ? OR tgl_update LIKE ?", [`%${todayStr}%`, `%${todayStr}%`]);

        // Coll distribution
        const coll1 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '1'");
        const coll2 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '2'");
        const coll3 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '3'");
        const coll4 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '4'");
        const coll5 = await dbGet("SELECT COUNT(*) as count FROM ideb_records WHERE coll = '5'");

        // Branch / Cabang comparison
        const cabangList = await dbAll(`
            SELECT cabang, COUNT(*) as total_records, 
                   SUM(CASE WHEN CAST(NULLIF(coll, '') AS INTEGER) >= 3 THEN 1 ELSE 0 END) as total_npl,
                   MAX(tgl_input) as last_update
            FROM ideb_records 
            WHERE cabang IS NOT NULL AND cabang != ''
            GROUP BY cabang 
            ORDER BY total_records DESC 
            LIMIT 10
        `);

        // Monthly / period trend
        const trend = await dbAll(`
            SELECT SUBSTR(tgl_input, 1, 6) as period, COUNT(*) as count 
            FROM ideb_records 
            WHERE tgl_input IS NOT NULL AND tgl_input != '' 
            GROUP BY period 
            ORDER BY period DESC 
            LIMIT 6
        `);

        res.json({
            success: true,
            kpis: {
                total_records: totalRecs?.count || 0,
                total_bd: totalBd?.total || 0,
                total_npl: totalCollNpl?.count || 0,
                total_lancar: totalCollLancar?.count || 0,
                today_count: todayCount?.count || 0
            },
            coll_distribution: {
                coll1: coll1?.count || 0,
                coll2: coll2?.count || 0,
                coll3: coll3?.count || 0,
                coll4: coll4?.count || 0,
                coll5: coll5?.count || 0
            },
            cabang_list: cabangList || [],
            trend: (trend || []).reverse()
        });
    } catch (e) {
        console.error('[iDEB] getITSupportDashboard error:', e);
        res.status(500).json({ error: 'Gagal mengambil data dashboard IT Support.' });
    }
};

// ─── GET /api/ideb/list ────────────────────────────────────────────────────────
// Returns paginated list of distinct iDEB references/debtors stored in database
exports.getIdebList = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const collFilter = (req.query.coll || '').trim();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 15));
        const offset = (page - 1) * limit;

        let whereClauses = ["ref IS NOT NULL AND ref != ''"];
        let params = [];

        if (q) {
            whereClauses.push("(UPPER(ref) LIKE UPPER(?) OR UPPER(nama) LIKE UPPER(?) OR UPPER(nik) LIKE UPPER(?) OR UPPER(bank) LIKE UPPER(?))");
            const pattern = `%${q}%`;
            params.push(pattern, pattern, pattern, pattern);
        }

        if (collFilter === 'npl') {
            whereClauses.push("CAST(NULLIF(coll, '') AS INTEGER) >= 3");
        } else if (collFilter === 'lancar') {
            whereClauses.push("CAST(NULLIF(coll, '') AS INTEGER) < 3");
        } else if (collFilter && !isNaN(collFilter)) {
            whereClauses.push("CAST(NULLIF(coll, '') AS INTEGER) = ?");
            params.push(parseInt(collFilter));
        }

        const whereSql = whereClauses.join(' AND ');

        const countRow = await dbGet(
            `SELECT COUNT(DISTINCT UPPER(ref)) as total FROM ideb_records WHERE ${whereSql}`,
            params
        );
        const total = countRow ? parseInt(countRow.total || 0) : 0;
        const totalPages = Math.ceil(total / limit) || 1;

        const rows = await dbAll(
            `SELECT 
                ref,
                MAX(nik) as nik,
                MAX(nama) as nama,
                MAX(alamat) as alamat,
                MAX(CAST(NULLIF(coll, '') AS INTEGER)) as max_coll,
                SUM(CASE WHEN os > 0 THEN os ELSE 0 END) as total_bd,
                COUNT(*) as total_fasilitas,
                MAX(tgl_input) as tgl_input,
                MAX(cabang) as cabang
             FROM ideb_records
             WHERE ${whereSql}
             GROUP BY ref
             ORDER BY MAX(tgl_input) DESC, UPPER(MAX(nama)) ASC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            records: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages
            }
        });
    } catch (e) {
        console.error('[iDEB] getIdebList error:', e);
        res.status(500).json({ error: 'Gagal mengambil daftar data iDEB.' });
    }
};

// ─── DELETE /api/ideb/delete-ref ───────────────────────────────────────────────
exports.deleteByRef = async (req, res) => {
    try {
        const ref = (req.body && req.body.ref) || req.query.ref || '';
        if (!ref || !ref.trim()) {
            return res.status(400).json({ error: 'Nomor REF tidak boleh kosong.' });
        }
        const trimmed = ref.trim();
        const isPg = process.env.DB_TYPE === 'postgres';
        const sql = isPg
            ? 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER($1)'
            : 'DELETE FROM ideb_records WHERE UPPER(ref) = UPPER(?)';

        await dbRun(sql, [trimmed]);
        res.json({ success: true, message: `Data iDEB dengan No. Register ${trimmed} berhasil dihapus.` });
    } catch (e) {
        console.error('[iDEB] deleteByRef error:', e);
        res.status(500).json({ error: 'Gagal menghapus data iDEB.' });
    }
};

// ─── PUT /api/ideb/record/:id ──────────────────────────────────────────────────
// Update single facility record
exports.updateRecord = async (req, res) => {
    try {
        const id = req.params.id || req.body.id;
        const { bank, plafon, os, sb, jw, jatem, coll, kondisi, tunggakan } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ID record tidak ditemukan.' });
        }

        const isPg = process.env.DB_TYPE === 'postgres';
        const sql = isPg
            ? `UPDATE ideb_records SET bank=$1, plafon=$2, os=$3, sb=$4, jw=$5, jatem=$6, coll=$7, kondisi=$8, tunggakan=$9 WHERE id=$10`
            : `UPDATE ideb_records SET bank=?, plafon=?, os=?, sb=?, jw=?, jatem=?, coll=?, kondisi=?, tunggakan=? WHERE id=?`;

        await dbRun(sql, [
            bank || null,
            Math.round(parseFloat(plafon || 0)),
            Math.round(parseFloat(os || 0)),
            parseFloat(sb || 0),
            parseFloat(jw || 0),
            jatem || null,
            coll !== undefined ? String(coll) : '1',
            kondisi || '00',
            tunggakan !== undefined ? String(tunggakan) : '0',
            id
        ]);

        res.json({ success: true, message: 'Fasilitas iDEB berhasil diperbarui.' });
    } catch (e) {
        console.error('[iDEB] updateRecord error:', e);
        res.status(500).json({ error: 'Gagal memperbarui data fasilitas iDEB.' });
    }
};


