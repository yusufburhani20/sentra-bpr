# 📋 Status Pengembangan SENTRA BPR
> *Dokumen ini menggambarkan kondisi terakhir pengembangan aplikasi per 29 Juni 2026.*  
> *Gunakan sebagai konteks awal saat melanjutkan vibe coding.*

---

## 🏷️ Identitas Aplikasi

| Atribut | Detail |
|---|---|
| **Nama** | SENTRA — Sistem Terpusat Referensi, Arsip & Operasional BPR |
| **Versi** | v2.0 |
| **Repositori GitHub** | https://github.com/yusufburhani20/sentra-bpr.git |
| **Workspace Lokal** | `e:\Y\slip` |
| **Server Produksi** | `https://sentra.nusambasingaparna.com` (via Cloudflare Tunnel) |
| **Path Produksi** | `/home/nsbspa/apps/slip/` |

---

## ✅ Fitur yang Sudah Selesai

### 🔐 1. Autentikasi & Keamanan
- [x] Login/logout berbasis **JWT** disimpan di **HttpOnly cookie**
- [x] **Rate limiting** (Helmet.js + express-rate-limit)
- [x] CORS & security headers
- [x] Ganti password oleh user sendiri
- [x] Session timeout otomatis

### 👥 2. Manajemen Pengguna (Admin Only)
- [x] CRUD pengguna (tambah, edit, hapus)
- [x] **Soft delete** — `deleted_at` timestamp, histori tetap terjaga
- [x] Reset password massal ke default (`slip1234`)
- [x] **Impersonasi pengguna** oleh Admin (untuk support)
- [x] **5 Role**: Admin, Supervisor, Teller, Kas, SDM

### 📝 3. Input Transaksi (Slip Jurnal)
- [x] Form input slip jurnal harian (kosong secara default)
- [x] **Penomoran referensi otomatis** per operator: `{KODE_OPERATOR}{NOMOR_URUT}`
- [x] **Terbilang otomatis** (konversi nominal ke teks Indonesia)
- [x] Pilihan kode biaya (cost code) dari database
- [x] **Cetak PDF** slip langsung di browser (via Puppeteer)
- [x] Live preview slip saat mengisi form

### ✅ 4. Alur Persetujuan (Approval Workflow)
- [x] Transaksi masuk status `Menunggu` setelah disubmit
- [x] Supervisor/Admin dapat **Setujui** atau **Tolak** dengan catatan
- [x] Status: `Menunggu` → `Disetujui` / `Ditolak`
- [x] Notifikasi di dashboard setelah ada perubahan status

### 📊 5. Dashboard & Laporan
- [x] **KPI cards**: Total transaksi, volume nominal, transaksi hari ini
- [x] **Grafik tren** 7 hari terakhir
- [x] **Volume per kode biaya** (bar chart)
- [x] **Produktivitas operator** (bar chart, nilai absolut IDR)
- [x] **Role-based filtering**: Teller/Kas/SDM hanya lihat data miliknya; Admin/Supervisor lihat semua

### 📁 6. Kelola Kode Biaya (Cost Code)
- [x] CRUD kode biaya oleh Admin
- [x] Import massal via CSV
- [x] Export ke CSV
- [x] Hapus massal / hapus semua
- [x] Kode biaya aktif otomatis muncul di form transaksi

### 📬 7. Kirim Berkas Slip
- [x] Upload foto/scan bukti slip oleh operator
- [x] Supervisor konfirmasi penerimaan berkas
- [x] Checklist item kustom per pengiriman
- [x] Status pengiriman real-time

### 🔢 8. Kelola Nomor Referensi Operator
- [x] Lihat & reset counter referensi per operator
- [x] Filter user yang sudah dihapus (soft delete) tidak muncul di tabel ini
- [x] Prefix otomatis dari kode operator

### 🔍 9. Audit Trail
- [x] Log setiap aksi penting (login, CRUD, hapus, import, dll.)
- [x] Filter berdasarkan nama/peran/IP
- [x] Pagination
- [x] Hapus semua log (Admin only)

### 🚀 10. Sistem Deploy Otomatis (One-Click Deploy)
- [x] Tombol **"Deploy Update"** di halaman Audit Trail (Admin only)
- [x] Modal terminal bergaya GitHub dark theme
- [x] **Streaming real-time** output via Server-Sent Events (SSE)
- [x] Urutan: `git pull` → `npm install --omit=dev` → restart server
- [x] Auto-reload halaman browser setelah deploy selesai (countdown 5 detik)
- [x] File `deploy.sh` untuk deploy manual via SSH juga tersedia

---

## 🏗️ Arsitektur & Stack Teknologi

```
Frontend:  Vanilla HTML + CSS + JavaScript (ES Modules, no framework)
Backend:   Node.js + Express.js
Database:  PostgreSQL (production) / SQLite (local development)
Auth:      JWT + HttpOnly Cookie
PDF:       Puppeteer (headless Chrome)
Security:  Helmet.js, express-rate-limit, CORS
Tests:     Jest + Supertest (39 integration tests)
Deploy:    Git + Apache Virtual Host (reverse proxy ke port 3000)
```

---

## 📁 Struktur File Penting

```
e:\Y\slip\
├── server.js                    ← Entry point, mount semua routes
├── app.js                       ← Frontend router & state manager (SPA)
├── index.html                   ← Single Page Application utama
├── styles.css                   ← Global stylesheet
├── deploy.sh                    ← Shell script deploy manual
│
├── config/
│   ├── db.js                    ← KRITIS: SQL translation layer (SQLite ↔ PostgreSQL)
│   └── dbInit.js                ← Inisialisasi tabel + seed data awal
│
├── controllers/
│   ├── authController.js
│   ├── approvalController.js
│   ├── costCodeController.js
│   ├── dashboardController.js   ← Role-based KPI filtering
│   ├── slipSubmissionController.js ← Role-based history filtering
│   ├── systemController.js      ← Deploy endpoint (SSE streaming)
│   ├── transactionController.js
│   └── userController.js        ← Soft delete & ref counter management
│
├── js/                          ← Frontend modules
│   ├── state.js                 ← Global state object
│   ├── auth.js
│   ├── dashboard.js
│   ├── transactions.js
│   ├── history.js
│   ├── users.js
│   ├── approvals.js
│   ├── costCodes.js
│   ├── slipSubmissions.js
│   ├── system.js                ← Audit trail + deploy modal + notif + clock
│   └── utils.js
│
├── routes/                      ← Semua API route definitions
├── middleware/
│   ├── auth.js                  ← requireAuth, requireRole (spread args)
│   └── limiter.js
│
└── tests/                       ← 39 integration tests (Jest + Supertest)
```

---

## 🗄️ Database

### Konfigurasi Produksi (PostgreSQL)
```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentra
DB_USER=sentra
DB_PASSWORD=singaparna123
```

### Konfigurasi Lokal (PostgreSQL via .env)
```env
DB_TYPE=postgres
# Sesuaikan dengan credentials lokal Anda
```

### Catatan Penting Database
- **`config/db.js`** memiliki SQL translation layer — semua query ditulis dalam SQLite syntax (`?` placeholder, `INSERT OR IGNORE`, dll.), lalu otomatis dikonversi ke PostgreSQL syntax (`$1`, `ON CONFLICT DO NOTHING`, dll.).
- **Soft delete users**: Semua hapus user menggunakan `deleted_at = NOW()`, bukan `DELETE`. Setiap query harus menyertakan `WHERE deleted_at IS NULL`.
- **Seed data** (`dbInit.js`): Menggunakan `ON CONFLICT (id) DO NOTHING` — data default hanya diseed saat pertama kali (tidak pernah overwrite perubahan admin).

### Tabel Database
| Tabel | Fungsi |
|---|---|
| `users` | Data pengguna (dengan `deleted_at` soft delete) |
| `transactions` | Slip jurnal transaksi |
| `cost_codes` | Daftar kode biaya |
| `audit_logs` | Log seluruh aktivitas sistem |
| `ref_counters` | Counter nomor referensi per operator |
| `slip_submissions` | Pengiriman berkas slip fisik |
| `notifications` | Notifikasi in-app per user |
| `approvals` | Data persetujuan transaksi |

---

## 🖥️ Server Produksi

### Informasi Server
| Detail | Nilai |
|---|---|
| **IP Lokal** | `192.168.1.29` |
| **Domain** | `https://sentra.nusambasingaparna.com` (via Cloudflare Tunnel) |
| **OS** | Ubuntu 22.04 LTS |
| **Web Server** | Apache (reverse proxy ke port `3000`) |
| **Node Process** | Berjalan via `nohup` sebagai user `nsbspa` |
| **Port App** | `3000` |
| **Git Remote** | `https://github.com/yusufburhani20/sentra-bpr.git` |

### Perintah Produksi yang Sering Dipakai
```bash
# Cek apakah app berjalan
ps aux | grep node

# Lihat log real-time
tail -f /home/nsbspa/apps/slip/app.log

# Hentikan server dengan aman (tanpa matikan service lain)
sudo kill $(sudo lsof -t -i :3000)

# Jalankan server
cd /home/nsbspa/apps/slip
sudo -u nsbspa nohup node server.js > app.log 2>&1 &

# Deploy update terbaru dari GitHub
cd /home/nsbspa/apps/slip
git pull origin main
sudo kill $(sudo lsof -t -i :3000)
sudo -u nsbspa nohup node server.js > app.log 2>&1 &
```

### Topologi Layanan di Server
```
Internet/LAN
     │
     ├─── Apache :80  ──→  ownCloud (di IP 192.168.1.29)
     │
     └─── Apache VHost: slip.nusambasingaparna.com
               │
               └──→ localhost:3000 (Node.js SENTRA)
```

---

## 🔑 Kredensial Default

| Username | Password | Role |
|---|---|---|
| `admin1` | `slip1234` | Admin |
| `spv1` | `slip1234` | Supervisor |
| `teller1` | `slip1234` | Teller |
| `kas1` | `slip1234` | Kas |
| `sdm1` | `slip1234` | SDM |

> ⚠️ Kredensial ini sudah diubah admin di produksi. Seed tidak akan overwrite karena sudah fix ke `DO NOTHING`.

---

## 🧪 Testing

```bash
# Jalankan semua test (39 tests, 6 suites)
npm test

# Coverage:
# - Auth & JWT
# - Role-based access (RBAC)
# - Transaction CRUD
# - Approval workflow
# - Dashboard role filtering
# - Slip submission history filtering
# - Utility functions (terbilang, format)
```

---

## 🐛 Bug/Issue yang Sudah Diperbaiki

| # | Bug | Solusi |
|---|---|---|
| 1 | User dihapus masih muncul di Kelola Referensi | Tambah `deleted_at IS NULL` di query `getRefCounters` |
| 2 | Form input transaksi ada nilai pre-filled | Hapus atribut `value` dan teks default di HTML |
| 3 | Perubahan data user ter-reset saat server restart | Ubah seed dari `ON CONFLICT DO UPDATE` ke `ON CONFLICT DO NOTHING` |
| 4 | Deploy modal tidak muncul saat tombol diklik | Ganti `style.display='flex'` ke `classList.add('active')` sesuai sistem CSS yang ada |
| 5 | `pkill -f node` matikan semua service Node.js | Gunakan `kill $(lsof -t -i :3000)` untuk target port spesifik |

---

## 💡 Ide Pengembangan Selanjutnya (Backlog)

Berikut fitur-fitur yang **belum ada** dan bisa dikembangkan:

### 🔴 Prioritas Tinggi
- [ ] **Export laporan ke Excel (.xlsx)** — export transaksi & audit log ke format Excel selain CSV
- [ ] **Notifikasi email/WhatsApp** saat transaksi disetujui/ditolak
- [ ] **Batas atas nominal transaksi** — validasi nominal maksimum per jenis transaksi atau role

### 🟡 Prioritas Sedang  
- [ ] **Rekap/laporan bulanan PDF** — ringkasan otomatis seluruh transaksi per bulan
- [ ] **Multi-cabang** — data dipisah per kantor cabang
- [ ] **Dark mode yang lebih sempurna** — beberapa komponen masih belum responsif terhadap mode gelap
- [ ] **Pencarian global** (Ctrl+K) — cari transaksi/user/kode biaya dari satu tempat
- [ ] **Backup database otomatis** terjadwal (cron + pg_dump)

### 🟢 Prioritas Rendah / Nice-to-Have
- [ ] **Two-factor authentication (2FA)** untuk Admin
- [ ] **Dashboard widget yang bisa dikustomisasi** (drag & drop)
- [ ] **Versi mobile app** (PWA / React Native)
- [ ] **Integrasi SLIK OJK** atau sistem BPR lain
- [ ] **Log aktivitas per sesi** (session tracking yang lebih detail)

---

## 🔧 Catatan Teknis Penting untuk Developer Baru

1. **Middleware `requireRole`**: Menerima **spread args**, bukan array.
   ```javascript
   // ✅ Benar
   router.get('/data', requireAuth, requireRole('Admin', 'Supervisor'), handler);
   // ❌ Salah
   router.get('/data', requireAuth, requireRole(['Admin', 'Supervisor']), handler);
   ```

2. **SQL Dialect**: Selalu tulis query dalam SQLite syntax — translation layer di `config/db.js` yang mengkonversinya ke PostgreSQL. Jangan campur dialect.

3. **State Management Frontend**: Semua state global ada di `js/state.js`. Selalu update `state.currentRole` (bukan hanya `state.currentUser.role`) karena beberapa komponen menggunakan `state.currentRole`.

4. **Modal System**: Semua modal menggunakan class `.active` untuk toggle visibility (bukan `display:none/flex`). Selalu gunakan `modal.classList.add('active')` / `modal.classList.remove('active')`.

5. **Deploy Panel**: Hanya terlihat & aktif untuk role `Admin`. Tidak perlu konfigurasi tambahan — sistem membaca `state.currentRole` saat halaman Audit Trail dibuka.
