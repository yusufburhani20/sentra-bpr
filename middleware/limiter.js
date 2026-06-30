const rateLimit = require('express-rate-limit');

// ─── Login: Sangat ketat — cegah brute force ─────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 10,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── API umum: Cegah flood request dari satu IP ───────────────────────────────
// 200 request per menit per IP cukup untuk penggunaan BPR normal.
// Jika satu user melebihi ini, kemungkinan ada bug loop di frontend atau serangan.
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 200,
    message: { error: 'Terlalu banyak permintaan. Harap tunggu 1 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── PDF (Puppeteer): Sangat berat, batasi lebih ketat ───────────────────────
// Cetak PDF membuka browser headless — 1 proses bisa makan 200–500MB RAM.
const pdfLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 5,
    message: { error: 'Terlalu banyak permintaan cetak PDF. Harap tunggu 1 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    loginLimiter,
    apiLimiter,
    pdfLimiter,
};

