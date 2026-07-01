const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config();

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let sqliteDb = null;
let pgPool = null;

if (DB_TYPE === 'postgres') {
    console.log("Database Engine: PostgreSQL");
    pgPool = new Pool({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'sim_slip_ref',
        max: 20,                    // Cukup untuk 20 concurrent requests
        idleTimeoutMillis: 30000,   // Tutup koneksi idle setelah 30 detik
        connectionTimeoutMillis: 5000 // Gagal cepat jika DB tidak bisa dijangkau
    });
} else {
    console.log("Database Engine: SQLite");
    const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
    sqliteDb = new sqlite3.Database(DB_PATH);
}

// Translate SQLite SQL parameters and specific dialect commands to PostgreSQL
function translateSql(sql) {
    if (DB_TYPE !== 'postgres') return sql;

    let pgSql = sql;

    // Translate transaction commands
    pgSql = pgSql.replace(/BEGIN EXCLUSIVE TRANSACTION/gi, 'BEGIN');

    // Translate INSERT OR IGNORE for ref_counters
    pgSql = pgSql.replace(/INSERT OR IGNORE INTO ref_counters\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
        'INSERT INTO ref_counters ($1) VALUES ($2) ON CONFLICT (username, slip_type) DO NOTHING');

    // Translate INSERT OR IGNORE for cost_codes
    pgSql = pgSql.replace(/INSERT OR IGNORE INTO cost_codes\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
        'INSERT INTO cost_codes ($1) VALUES ($2) ON CONFLICT (kode) DO NOTHING');

    // Translate INSERT OR REPLACE for cost_codes
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO cost_codes\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
        'INSERT INTO cost_codes ($1) VALUES ($2) ON CONFLICT (kode) DO UPDATE SET deleted_at = NULL, deskripsi = EXCLUDED.deskripsi');

    // Translate SQLite parameterized placeholder '?' to PostgreSQL '$1', '$2', ...
    let index = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${index++}`);

    return pgSql;
}

const db = {
    serialize(callback) {
        if (DB_TYPE === 'postgres') {
            // PostgreSQL does not require serialize blocks as it is natively concurrent.
            // We execute the callback immediately.
            callback();
        } else {
            sqliteDb.serialize(callback);
        }
    },

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (DB_TYPE === 'postgres') {
            const pgSql = translateSql(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (callback) {
                    const context = { changes: res ? res.rowCount : 0 };
                    callback.call(context, err);
                }
            });
        } else {
            sqliteDb.run(sql, params, function(err) {
                if (callback) {
                    callback.call(this, err);
                }
            });
        }
    },

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (DB_TYPE === 'postgres') {
            const pgSql = translateSql(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (callback) {
                    const row = res && res.rows && res.rows.length > 0 ? res.rows[0] : null;
                    callback(err, row);
                }
            });
        } else {
            sqliteDb.get(sql, params, callback);
        }
    },

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (DB_TYPE === 'postgres') {
            const pgSql = translateSql(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (callback) {
                    const rows = res && res.rows ? res.rows : [];
                    callback(err, rows);
                }
            });
        } else {
            sqliteDb.all(sql, params, callback);
        }
    },

    prepare(sql, callback) {
        if (DB_TYPE === 'postgres') {
            return {
                run(...args) {
                    let params = [];
                    let cb = null;
                    if (args.length > 0) {
                        if (typeof args[args.length - 1] === 'function') {
                            cb = args[args.length - 1];
                            params = args.slice(0, -1);
                        } else {
                            params = args;
                        }
                    }
                    if (params.length === 1 && Array.isArray(params[0])) {
                        params = params[0];
                    }
                    const pgSql = translateSql(sql);
                    pgPool.query(pgSql, params, (err, res) => {
                        if (cb && typeof cb === 'function') {
                            const context = { changes: res ? res.rowCount : 0 };
                            cb.call(context, err);
                        }
                    });
                },
                finalize(cb) {
                    if (cb) cb();
                }
            };
        } else {
            return sqliteDb.prepare(sql, callback);
        }
    },

    close(callback) {
        if (DB_TYPE === 'postgres') {
            pgPool.end(callback);
        } else {
            sqliteDb.close(callback);
        }
    },

    /**
     * Atomic increment untuk ref_counters — aman dari race condition.
     * PostgreSQL: gunakan INSERT ... ON CONFLICT DO UPDATE RETURNING (atomic).
     * SQLite: gunakan BEGIN EXCLUSIVE TRANSACTION.
     * Callback: (err, { counter, prefix })
     */
    atomicIncrementRef(username, slipType, prefix, callback) {
        const sType = slipType || 'debet';
        if (DB_TYPE === 'postgres') {
            const sql = `
                INSERT INTO ref_counters (username, slip_type, counter, prefix)
                VALUES ($1, $2, 1, $3)
                ON CONFLICT (username, slip_type)
                DO UPDATE SET counter = ref_counters.counter + 1
                RETURNING counter, prefix
            `;
            pgPool.query(sql, [username, sType, prefix], (err, result) => {
                if (err) return callback(err, null);
                callback(null, result.rows[0]);
            });
        } else {
            // SQLite: pakai exclusive transaction agar tidak ada interleaving
            sqliteDb.serialize(() => {
                sqliteDb.run('BEGIN EXCLUSIVE TRANSACTION');
                sqliteDb.run(
                    `INSERT OR IGNORE INTO ref_counters (username, slip_type, counter, prefix) VALUES (?, ?, 0, ?)`,
                    [username, sType, prefix]
                );
                sqliteDb.run(
                    `UPDATE ref_counters SET counter = counter + 1 WHERE username = ? AND slip_type = ?`,
                    [username, sType]
                );
                sqliteDb.get(
                    `SELECT counter, prefix FROM ref_counters WHERE username = ? AND slip_type = ?`,
                    [username, sType],
                    (err, row) => {
                        sqliteDb.run('COMMIT');
                        callback(err, row);
                    }
                );
            });
        }
    }
};

module.exports = db;
