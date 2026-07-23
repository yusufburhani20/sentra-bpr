require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware/limiter');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Cloudflare)
const PORT = process.env.PORT || 3000;
const DEFAULT_PASSWORD = 'slip1234';

// ─── STARTUP SECURITY CHECK ────────────────────────────────────────────────────
// JWT_SECRET wajib diganti dari nilai default di produksi.
const JWT_SECRET_DEFAULT = 'SIM_SLIP_REF_SECRET_2026_GANTI_DI_PRODUKSI';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === JWT_SECRET_DEFAULT) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET tidak di-set atau masih menggunakan nilai default di environment production!');
        console.error('Set JWT_SECRET di file .env dengan string acak yang panjang sebelum menjalankan server.');
        process.exit(1);
    } else {
        console.warn('⚠️  PERINGATAN: JWT_SECRET belum di-set. Menggunakan fallback (TIDAK AMAN untuk produksi).');
    }
}

// ─── DATABASE INITIALIZATION ──────────────────────────────────────────────────
const initializeDb = require('./config/dbInit');
app.dbReady = new Promise((resolve) => {
    initializeDb(() => {
        console.log("Database tables checked and initialized.");
        resolve();
    });
});

// ─── CORS: Batasi ke allowed origins ─────────────────────────────────────────
// Di .env, set: ALLOWED_ORIGINS=http://slip.nusambasingaparna.com,http://localhost:3000
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://slip.nusambasingaparna.com'];

app.use(cors({
    origin: (origin, callback) => {
        // Izinkan request tanpa origin (curl, mobile app) atau dari daftar yang diizinkan
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin tidak diizinkan — ${origin}`));
        }
    },
    credentials: true,
}));

// ─── GLOBAL MIDDLEWARE ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));           // Dikurangi dari 10mb — cukup untuk JSON
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ─── GLOBAL API RATE LIMITER ──────────────────────────────────────────────────
// Terapkan ke semua endpoint /api/* untuk mencegah flood request
app.use('/api/', apiLimiter);

// ─── API ROUTES ──────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/ref-counters', require('./routes/refCounterRoutes'));
app.use('/api/cost-codes', require('./routes/costCodeRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/approvals', require('./routes/approvalRoutes'));
app.use('/api/slip-submissions', require('./routes/slipSubmissionRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));
app.use('/api/user-files', require('./routes/fileBackupRoutes'));
app.use('/api/ideb', require('./routes/idebRoutes'));

// ─── CATCH-ALL SPA ROUTE ──────────────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
// Menangkap semua error yang tidak tertangkap di controller.
// Mencegah stack trace bocor ke user dan server crash.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Unhandled Server Error: ${err.message}`);
    console.error(err.stack);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Terjadi kesalahan internal server. Silakan coba lagi.' });
});

// ─── START SERVER (ONLY IF RUN DIRECTLY) ──────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`SENTRA v2.0 (Sistem Terpusat Referensi, Arsip & Operasional BPR) running on port ${PORT}`);
        console.log(`Navigate to http://localhost:${PORT}`);
        console.log(`Default password for all users: ${DEFAULT_PASSWORD}`);
    });
}

module.exports = app;

