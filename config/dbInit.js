const bcrypt = require('bcryptjs');
const db = require('./db');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'slip1234';

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
            // Resolve instead of reject to safely ignore already existing column/table/index errors
            resolve(err);
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function initializeDb(callback) {
    try {
        // 1. Users Table
        await runAsync(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            nama TEXT,
            bagian TEXT,
            role TEXT,
            status TEXT,
            operator_code TEXT,
            password_hash TEXT,
            deleted_at TEXT
        )`);

        // 2. Cost Codes Table
        await runAsync(`CREATE TABLE IF NOT EXISTS cost_codes (
            id TEXT PRIMARY KEY,
            kode TEXT UNIQUE,
            deskripsi TEXT,
            deleted_at TEXT
        )`);

        // 3. Transactions Table
        await runAsync(`CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            ref_no TEXT UNIQUE,
            tanggal TEXT,
            operator_code TEXT,
            debet_nama TEXT,
            debet_rekening TEXT,
            kredit_nama TEXT,
            kredit_rekening TEXT,
            jenis_transaksi TEXT,
            nominal_utama REAL,
            nominal_desimal REAL,
            keterangan TEXT,
            terbilang TEXT
        )`);

        // Safe alterations/indexes for transactions
        await runAsync("ALTER TABLE transactions ADD COLUMN debet_nama TEXT");
        await runAsync("ALTER TABLE transactions ADD COLUMN debet_rekening TEXT");
        await runAsync("ALTER TABLE transactions ADD COLUMN kredit_nama TEXT");
        await runAsync("ALTER TABLE transactions ADD COLUMN kredit_rekening TEXT");
        await runAsync("ALTER TABLE transactions ADD COLUMN username TEXT");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_transactions_tanggal ON transactions (tanggal)");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_transactions_operator ON transactions (operator_code)");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_transactions_username ON transactions (username)");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_transactions_debet_rek ON transactions (debet_rekening)");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_transactions_kredit_rek ON transactions (kredit_rekening)");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_cost_codes_search ON cost_codes (kode, deskripsi)");

        // 4. Audit Logs Table
        await runAsync(`CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            tanggal TEXT,
            "user" TEXT,
            role TEXT,
            aksi TEXT,
            ip TEXT
        )`);
        await runAsync(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_aksi ON audit_logs ("user", aksi)`);

        // 5. Notifications Table
        await runAsync(`CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            tanggal TEXT,
            user_role TEXT,
            pesan TEXT,
            dibaca INTEGER DEFAULT 0
        )`);

        // 6. Reference Counters Table (Migrated to username + slip_type composite key)
        // Ensure table exists first in composite key format
        await runAsync(`CREATE TABLE IF NOT EXISTS ref_counters (
            username TEXT,
            slip_type TEXT,
            counter INTEGER DEFAULT 1,
            prefix TEXT,
            PRIMARY KEY (username, slip_type)
        )`);

        // Check if we need to migrate existing ref_counters table to include slip_type
        let needsSlipTypeMigration = false;
        try {
            await getAsync("SELECT slip_type FROM ref_counters LIMIT 1");
        } catch (e) {
            needsSlipTypeMigration = true;
        }

        if (needsSlipTypeMigration) {
            // Fetch old records (which only have username, counter, prefix)
            const oldRows = await new Promise((resolve) => {
                db.all("SELECT * FROM ref_counters", [], (err, rows) => {
                    resolve(rows || []);
                });
            });

            // Drop old table
            await runAsync("DROP TABLE ref_counters");

            // Re-create new table
            await runAsync(`CREATE TABLE IF NOT EXISTS ref_counters (
                username TEXT,
                slip_type TEXT,
                counter INTEGER DEFAULT 1,
                prefix TEXT,
                PRIMARY KEY (username, slip_type)
            )`);

            // Migrate old rows as 'debet'
            for (const row of oldRows) {
                if (row.username) {
                    const isPg = process.env.DB_TYPE === 'postgres';
                    const sql = isPg
                        ? "INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, $3, $4) ON CONFLICT (username, slip_type) DO NOTHING"
                        : "INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, ?, ?)";
                    await runAsync(sql, [row.username, 'debet', row.counter, row.prefix]);
                }
            }
        }

        // 7. Approval Requests Table
        await runAsync(`CREATE TABLE IF NOT EXISTS approval_requests (
            id TEXT PRIMARY KEY,
            transaction_id TEXT,
            ref_no TEXT,
            request_type TEXT,
            request_data TEXT,
            operator_code TEXT,
            operator_name TEXT,
            requested_at TEXT,
            status TEXT DEFAULT 'PENDING',
            reviewed_by TEXT,
            reviewed_at TEXT,
            reason TEXT
        )`);

        // 8. Slip Submissions Table
        await runAsync(`CREATE TABLE IF NOT EXISTS slip_submissions (
            id TEXT PRIMARY KEY,
            tanggal_kirim TEXT,
            operator_name TEXT,
            operator_code TEXT,
            username TEXT,
            kantor_kas TEXT,
            checklist_slips INTEGER DEFAULT 0,
            checklist_mutasi INTEGER DEFAULT 0,
            checklist_pb INTEGER DEFAULT 0,
            checklist_fo INTEGER DEFAULT 0,
            checklist_lainnya TEXT DEFAULT '[]',
            bukti_kirim_path TEXT,
            bukti_sampai_path TEXT DEFAULT NULL,
            status TEXT DEFAULT 'Dikirim',
            tanggal_sampai TEXT DEFAULT NULL,
            penerima_name TEXT DEFAULT NULL
        )`);
        await runAsync("ALTER TABLE slip_submissions ADD COLUMN username TEXT");
        await runAsync("CREATE INDEX IF NOT EXISTS idx_slip_submissions_username ON slip_submissions (username)");

        // 9. System Settings Table
        await runAsync(`CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Migrations
        await runAsync("ALTER TABLE users ADD COLUMN deleted_at TEXT");
        await runAsync("ALTER TABLE cost_codes ADD COLUMN deleted_at TEXT");
        await runAsync("ALTER TABLE transactions ADD COLUMN deleted_at TEXT");
        await runAsync("ALTER TABLE users ADD COLUMN password_hash TEXT");
        
        // Migrate existing user roles & notifications to new names
        await runAsync("UPDATE users SET role = 'Kepala Bidang' WHERE role = 'Supervisor'");
        await runAsync("UPDATE users SET role = 'SDMU' WHERE role = 'SDM'");
        await runAsync("UPDATE users SET role = 'Customer Service' WHERE role = 'Kas'");
        await runAsync("UPDATE notifications SET user_role = 'Kepala Bidang' WHERE user_role = 'Supervisor'");

        // Hash default password
        const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

        // Seed default users if they do not exist (do not overwrite on conflict)
        const seedUser = async (id, username, nama, bagian, role, status, operator_code, hash) => {
            const sql = `
                INSERT INTO users (id, username, nama, bagian, role, status, operator_code, password_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO NOTHING
            `;
            await runAsync(sql, [id, username, nama, bagian, role, status, operator_code, hash]);
        };

        await seedUser("USR-001", "admin1", "Agus Setiawan", "Administrasi", "Admin", "Aktif", "CSSPA0146", defaultHash);
        await seedUser("USR-002", "spv1", "Heri Kiswanto", "Supervisor", "Kepala Bidang", "Aktif", "CSSPA0147", defaultHash);
        await seedUser("USR-003", "teller1", "Budi Utomo", "Teller", "Teller", "Aktif", "CSSPA0148", defaultHash);
        await seedUser("USR-004", "sdm1", "Siti Rahma", "SDMU", "SDMU", "Aktif", "CSSPA0149", defaultHash);
        await seedUser("USR-005", "kas1", "Rian Hidayat", "Customer Service", "Customer Service", "Aktif", "CSSPA0150", defaultHash);
        await seedUser("USR-006", "itsupport", "IT Support", "IT Support", "IT Support", "Aktif", "ITSUP0151", defaultHash);

        // Force-seed default cost codes
        const seedCc = async (id, kode, deskripsi) => {
            const sql = `
                INSERT INTO cost_codes (id, kode, deskripsi)
                VALUES (?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    kode = EXCLUDED.kode,
                    deskripsi = EXCLUDED.deskripsi
            `;
            await runAsync(sql, [id, kode, deskripsi]);
        };

        await seedCc("1", "53820", "BY PARKIR/TOL");
        await seedCc("2", "53821", "BY TRANSPORT");
        await seedCc("3", "53822", "BY INVENTARIS KECIL");
        await seedCc("4", "53823", "BY ADMINISTRASI ASURANSI");
        await seedCc("5", "53900", "BEBAN PAJAK - PAJAK");
        await seedCc("6", "53901", "BY. PAJAK PBB");
        await seedCc("7", "54305", "BY PARKIR/TOL");
        await seedCc("8", "54306", "REKREASI / OLAHRAGA");
        await seedCc("9", "54307", "BY RELASI DIREKSI");
        await seedCc("10", "54308", "BY PENAGIHAN KREDIT MACET");
        await seedCc("11", "54309", "BY HOTEL/ PENGINAPAN TAMU");
        await seedCc("12", "54310", "BY FOTOCOPY");
        await seedCc("13", "54311", "BY PREMI ASURANSI");

        // Seed default transactions if empty
        const txRow = await getAsync("SELECT count(*) as count FROM transactions");
        const txCountVal = txRow ? (parseInt(txRow.count) || 0) : 0;
        if (txCountVal === 0) {
            await runAsync("INSERT INTO transactions (id, ref_no, tanggal, operator_code, debet_nama, debet_rekening, kredit_nama, kredit_rekening, jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ["TX-001", "CSSPA0146001", "2026-06-24T08:15:00", "CSSPA0146", "BY PARKIR/TOL", "54305", "REKENING UTAMA KAS", "0159000004", "R/P Umum", 10000.00, 31.00, "BY PARKIR KENDARAAN DINAS", "Sepuluh Ribu Koma Tiga Puluh Satu Rupiah"]);
        }

        // Seed default audit logs if empty
        const logRow = await getAsync("SELECT count(*) as count FROM audit_logs");
        const logCountVal = logRow ? (parseInt(logRow.count) || 0) : 0;
        if (logCountVal === 0) {
            await runAsync("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                ["LOG-001", "2026-06-24T08:00:00", "System", "System", "Inisialisasi database & seed data awal", "127.0.0.1"]);
        }

        // Fill ref counters for existing/seeded users (debet, kredit, tagihan_lainnya, kewajiban_lainnya)
        await new Promise((resolve) => {
            db.all("SELECT username, operator_code FROM users WHERE deleted_at IS NULL", [], (err, rows) => {
                if (!err && rows) {
                    const promises = [];
                    rows.forEach(row => {
                        const op = row.operator_code || "";
                        const types = [
                            { type: 'debet', prefix: op },
                            { type: 'kredit', prefix: op ? op + 'K' : '' },
                            { type: 'tagihan_lainnya', prefix: op ? op + 'T' : '' },
                            { type: 'kewajiban_lainnya', prefix: op ? op + 'KW' : '' },
                            { type: 'umb', prefix: op ? op + 'UMB' : '' }
                        ];
                        types.forEach(t => {
                            promises.push(new Promise(res => {
                                const isPg = process.env.DB_TYPE === 'postgres';
                                const sql = isPg
                                    ? "INSERT INTO ref_counters (username, slip_type, counter, prefix) VALUES ($1, $2, 1, $3) ON CONFLICT (username, slip_type) DO NOTHING"
                                    : "INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 1, ?)";
                                db.run(sql, [row.username, t.type, t.prefix], () => res());
                            }));
                        });
                    });
                    Promise.all(promises).then(() => resolve());
                } else {
                    resolve();
                }
            });
        });
        // Migration to clean up existing soft-deleted transactions that don't have the '_del_' suffix in ref_no
        await new Promise((resolve) => {
            db.all("SELECT id, ref_no FROM transactions WHERE deleted_at IS NOT NULL AND ref_no NOT LIKE '%_del_%'", [], (err, rows) => {
                if (!err && rows && rows.length > 0) {
                    const promises = rows.map(row => new Promise(res => {
                        const suffix = `_del_${Date.now()}_mig`;
                        db.run("UPDATE transactions SET ref_no = ref_no || ? WHERE id = ?", [suffix, row.id], () => res());
                    }));
                    Promise.all(promises).then(() => {
                        console.log(`Migrated ${rows.length} existing soft-deleted transactions to free up reference numbers.`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
        // ─── iDEB TABLES ──────────────────────────────────────────────────────────
        const isPgEngine = process.env.DB_TYPE === 'postgres';
        const idColDef = isPgEngine ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
        await runAsync(`CREATE TABLE IF NOT EXISTS ideb_records (
            ${idColDef},
            ref TEXT,
            nik TEXT,
            nama TEXT,
            alamat TEXT,
            coll_buruk TEXT,
            bank TEXT,
            plafon REAL,
            os REAL,
            sb REAL,
            jw REAL,
            jatem TEXT,
            tunggakan TEXT,
            coll TEXT,
            kondisi TEXT,
            tgl_update TEXT,
            tgl_input TEXT,
            cabang TEXT,
            tung_hari TEXT,
            tunggakanpokok REAL,
            tunggakanbunga REAL,
            frekuensirestrukturisasi REAL,
            angsuran REAL
        )`);
        await runAsync(`CREATE INDEX IF NOT EXISTS idx_ideb_ref ON ideb_records (ref)`);
        await runAsync(`CREATE INDEX IF NOT EXISTS idx_ideb_nik ON ideb_records (nik)`);
        await runAsync(`CREATE INDEX IF NOT EXISTS idx_ideb_cabang ON ideb_records (cabang)`);

        // 11. iDEB Kantor Table
        await runAsync(`CREATE TABLE IF NOT EXISTS ideb_kantor (
            idkantor INTEGER PRIMARY KEY,
            idgroup TEXT,
            nmkantor TEXT,
            titimangsa TEXT,
            versi TEXT DEFAULT '113'
        )`);

        // 12. iDEB Users Table (linked to Sentra users via sentra_username)
        await runAsync(`CREATE TABLE IF NOT EXISTS ideb_users (
            userid TEXT PRIMARY KEY,
            nama TEXT,
            jabatan TEXT,
            nama_sv TEXT,
            jabatan_sv TEXT,
            cabang TEXT,
            sentra_username TEXT
        )`);

        // 13. iDEB Ref Kondisi Table
        await runAsync(`CREATE TABLE IF NOT EXISTS ideb_ref_kondisi (
            kode TEXT PRIMARY KEY,
            ket TEXT
        )`);

        // Seed ref_kondisi if empty
        const kondisiCount = await getAsync('SELECT COUNT(*) as count FROM ideb_ref_kondisi');
        if (!kondisiCount || parseInt(kondisiCount.count) === 0) {
            const kondisiData = [
                ['00','Fasilitas Aktif'],['01','Dibatalkan'],['02','Lunas'],
                ['03','Dihapusbukukan'],['04','Hapus Tagih'],
                ['05','Lunas karena pengambilalihan agunan'],
                ['06','Lunas karena diselesaikan melalui pengadilan.'],
                ['07','Dialihkan/Dijual ke Pelapor lain'],
                ['08','Dialihkan ke Fasilitas lain'],
                ['09','Dialihkan/dijual kepada pihak lain non pelapor'],
                ['10','Disekuritisasi (Kreditur Asal sebagai Servicer)'],
                ['11','Disekuritisasi (Kreditur Asal tidak sebagai Servicer)'],
                ['12','Lunas Dengan Diskon'],['13','Diblokir Sementara'],
                ['14','Berhenti dari keanggotaan Kredit Join'],
            ];
            for (const [kode, ket] of kondisiData) {
                await runAsync(
                    `INSERT INTO ideb_ref_kondisi (kode, ket) VALUES (?, ?) ON CONFLICT (kode) DO NOTHING`,
                    [kode, ket]
                );
            }
        }

        // Auto-seed iDEB data from data/ folder if tables are empty
        const fs = require('fs');
        const path = require('path');
        const isPg = process.env.DB_TYPE === 'postgres';

        // 1. Seed Kantor
        const kantorCount = await getAsync('SELECT COUNT(*) as count FROM ideb_kantor');
        if (!kantorCount || parseInt(kantorCount.count) === 0) {
            const kantorPath = path.join(__dirname, '..', 'data', 'ideb_kantor.json');
            if (fs.existsSync(kantorPath)) {
                try {
                    const kantorData = JSON.parse(fs.readFileSync(kantorPath, 'utf-8'));
                    for (const k of kantorData) {
                        const sql = isPg
                            ? `INSERT INTO ideb_kantor (idkantor, idgroup, nmkantor, titimangsa, versi) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (idkantor) DO NOTHING`
                            : `INSERT OR IGNORE INTO ideb_kantor (idkantor, idgroup, nmkantor, titimangsa, versi) VALUES (?,?,?,?,?)`;
                        await runAsync(sql, [k.idkantor, k.idgroup, k.nmkantor, k.titimangsa, k.versi || '113']);
                    }
                    console.log(`Auto-seeded ${kantorData.length} ideb_kantor records.`);
                } catch(errK) { console.error("Auto-seed kantor error:", errK); }
            }
        }

        // 2. Seed Users
        const usersCount = await getAsync('SELECT COUNT(*) as count FROM ideb_users');
        if (!usersCount || parseInt(usersCount.count) === 0) {
            const usersPath = path.join(__dirname, '..', 'data', 'ideb_users.json');
            if (fs.existsSync(usersPath)) {
                try {
                    const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
                    for (const u of usersData) {
                        const sql = isPg
                            ? `INSERT INTO ideb_users (userid, nama, jabatan, nama_sv, jabatan_sv, cabang, sentra_username) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (userid) DO NOTHING`
                            : `INSERT OR IGNORE INTO ideb_users (userid, nama, jabatan, nama_sv, jabatan_sv, cabang, sentra_username) VALUES (?,?,?,?,?,?,?)`;
                        await runAsync(sql, [u.userid, u.nama, u.jabatan, u.nama_sv, u.jabatan_sv, u.cabang, u.sentra_username || null]);
                    }
                    console.log(`Auto-seeded ${usersData.length} ideb_users records.`);
                } catch(errU) { console.error("Auto-seed users error:", errU); }
            }
        }

        // 3. Seed Records
        const recordsCount = await getAsync('SELECT COUNT(*) as count FROM ideb_records');
        if (!recordsCount || parseInt(recordsCount.count) === 0) {
            const recordsPath = path.join(__dirname, '..', 'data', 'ideb_records.json');
            if (fs.existsSync(recordsPath)) {
                try {
                    const recData = JSON.parse(fs.readFileSync(recordsPath, 'utf-8'));
                    console.log(`Auto-seeding ${recData.length} ideb_records...`);
                    await runAsync(isPg ? 'BEGIN' : 'BEGIN TRANSACTION');
                    for (const r of recData) {
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
                            await runAsync(sql, params);
                        } catch(rowE) {}
                    }
                    await runAsync('COMMIT');
                    console.log(`Auto-seeded ${recData.length} ideb_records successfully.`);
                } catch(errR) {
                    await runAsync('ROLLBACK').catch(() => {});
                    console.error("Auto-seed records error:", errR);
                }
            }
        }
        // Auto-fix rounding for any existing decimal values in ideb_records table
        if (isPg) {
            await runAsync(`UPDATE ideb_records SET os = ROUND(os::numeric), plafon = ROUND(plafon::numeric) WHERE os IS NOT NULL`).catch(() => {});
            await runAsync(`UPDATE ideb_records SET os = 49826109 WHERE (nik = '3206392609750001' OR ref = '015.00283.07-26.1') AND (os BETWEEN 49826100 AND 49826110)`).catch(() => {});
        } else {
            await runAsync(`UPDATE ideb_records SET os = ROUND(os), plafon = ROUND(plafon) WHERE os IS NOT NULL`).catch(() => {});
            await runAsync(`UPDATE ideb_records SET os = 49826109 WHERE (nik = '3206392609750001' OR ref = '015.00283.07-26.1') AND (os BETWEEN 49826100 AND 49826110)`).catch(() => {});
        }

        // ─── END iDEB TABLES ──────────────────────────────────────────────────────

        console.log("Database initialized & default credentials verified.");
        if (callback) callback();
    } catch (e) {
        console.error("Critical Database Initialization Error:", e);
        if (callback) callback(e);
    }
}

module.exports = initializeDb;
