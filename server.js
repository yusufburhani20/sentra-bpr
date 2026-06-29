require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_PASSWORD = 'slip1234';

// ─── DATABASE INITIALIZATION ──────────────────────────────────────────────────
const initializeDb = require('./config/dbInit');
app.dbReady = new Promise((resolve) => {
    initializeDb(() => {
        console.log("Database tables checked and initialized.");
        resolve();
    });
});

// ─── GLOBAL MIDDLEWARE ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

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

// ─── CATCH-ALL SPA ROUTE ──────────────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
