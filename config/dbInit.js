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

        console.log("Database initialized & default credentials verified.");
        if (callback) callback();
    } catch (e) {
        console.error("Critical Database Initialization Error:", e);
        if (callback) callback(e);
    }
}

module.exports = initializeDb;
