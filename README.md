<div align="center">

# SENTRA BPR
### *Sistem Terpusat Referensi, Arsip & Operasional BPR*

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](https://opensource.org/licenses/ISC)

> Platform manajemen operasional internal BPR (Bank Perkreditan Rakyat) yang terpusat — mencakup pengelolaan transaksi harian, slip jurnal, referensi nomor operator, persetujuan multi-tingkat, dan pelaporan audit.

</div>

---

## 📋 Daftar Isi

- [Tentang Aplikasi](#-tentang-aplikasi)
- [Fitur Utama](#-fitur-utama)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Persyaratan Sistem](#-persyaratan-sistem)
- [Instalasi & Setup](#-instalasi--setup)
- [Konfigurasi Environment](#-konfigurasi-environment)
- [Struktur Proyek](#-struktur-proyek)
- [API Documentation](#-api-documentation)
- [Deployment Produksi](#-deployment-produksi)
- [Kontribusi](#-kontribusi)

---

## 🏦 Tentang Aplikasi

**SENTRA** adalah sistem informasi manajemen internal berbasis web yang dirancang khusus untuk kebutuhan operasional BPR (Bank Perkreditan Rakyat). Aplikasi ini menyediakan satu platform terpusat untuk mengelola seluruh alur kerja transaksi harian — mulai dari pencatatan slip jurnal, manajemen referensi nomor operator, hingga persetujuan multi-level dan audit trail.

Dibangun di atas **Node.js + Express**, SENTRA mendukung dua mesin database (SQLite untuk pengembangan lokal, PostgreSQL untuk produksi) melalui lapisan abstraksi yang transparan.

---

## ✨ Fitur Utama

### 🔐 Autentikasi & Manajemen Pengguna
- Login aman berbasis **JWT (JSON Web Token)** dengan session cookie
- **Role-Based Access Control (RBAC)** dengan 5 tingkatan peran:
  - `Admin` — Akses penuh ke seluruh sistem
  - `Supervisor` — Menyetujui transaksi & melihat semua laporan
  - `Teller` — Input transaksi teller
  - `Kas` — Input transaksi kantor kas
  - `SDM` — Input transaksi SDM/HR
- Fitur **impersonasi pengguna** untuk kebutuhan support Admin
- Rate limiting & keamanan header via Helmet

### 📝 Pencatatan Transaksi (Slip Jurnal)
- Formulir input transaksi slip jurnal harian
- Dukungan **terbilang otomatis** (konversi nominal ke teks)
- Kode biaya (**cost code**) terkelola per kategori transaksi
- Penomoran referensi otomatis per operator (`{KODE_OPERATOR}{NOMOR_URUT}`)
- **Cetak slip PDF** langsung dari browser menggunakan Puppeteer
- Riwayat transaksi dengan filter role-based (teller hanya melihat data miliknya sendiri)

### ✅ Alur Persetujuan (Approval Workflow)
- Sistem persetujuan bertingkat untuk transaksi
- Supervisor dapat menyetujui atau menolak slip dengan catatan
- Status transaksi: `Menunggu` → `Disetujui` / `Ditolak`
- Notifikasi status real-time di dashboard

### 📊 Dashboard & Pelaporan
- **KPI Dashboard** — Total transaksi, volume nominal, dan tren harian
- **Grafik Tren 7 Hari** — Visualisasi aktivitas transaksi
- **Volume Per Kode Biaya** — Breakdown penggunaan per kategori
- **Produktivitas Operator** — Perbandingan volume transaksi antar operator
- Filter dashboard berbasis peran (data sesuai hak akses masing-masing)

### 🗂️ Manajemen Referensi Operator
- Pengelolaan nomor referensi per kode operator
- Reset & rekonfigurasi counter per operator
- Otomatis menolak operator yang sudah dihapus (soft delete)

### 📁 Manajemen Kode Biaya
- CRUD kode biaya (cost codes) oleh Admin
- Kode biaya aktif tersedia sebagai pilihan di form input transaksi

### 👤 Manajemen Pengguna
- CRUD pengguna oleh Admin
- **Soft delete** — pengguna dihapus secara logis tanpa menghilangkan histori transaksi
- Reset password massal ke default

### 🔍 Audit Trail
- Setiap aksi penting tercatat di tabel `audit_logs`
- Rekam: waktu, pelaku, jenis aksi, dan IP address
- Dapat diekspor dan difilter oleh Admin/Supervisor

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────┐
│                   Browser Client                    │
│         (Vanilla HTML + CSS + JavaScript)           │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / REST API
┌────────────────────▼────────────────────────────────┐
│              Apache Virtual Host                    │
│         http://slip.nusambasingaparna.com            │
│         (Reverse Proxy → localhost:3000)            │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│            Node.js + Express Server                 │
│                  (port 3000)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │  Routes  │ │Middleware│ │   Controllers     │    │
│  │ /api/... │ │JWT Auth  │ │ Transactions      │    │
│  │          │ │Helmet    │ │ Users             │    │
│  │          │ │RateLimit │ │ Dashboard         │    │
│  └──────────┘ └──────────┘ │ Approvals         │    │
│                            │ SlipSubmissions   │    │
│                            └──────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │   Database Layer    │
          │    (config/db.js)   │
          │  SQL Translation    │
          │  SQLite ↔ PostgreSQL│
          └──────────┬──────────┘
                     │
     ┌───────────────┴───────────────┐
     │                               │
┌────▼────┐                   ┌──────▼──────┐
│ SQLite  │                   │ PostgreSQL  │
│ (Dev)   │                   │(Production) │
└─────────┘                   └─────────────┘
```

---

## 💻 Persyaratan Sistem

| Komponen | Minimum | Rekomendasi |
|---|---|---|
| **Node.js** | v18.x | v20.x LTS atau lebih baru |
| **npm** | v8.x | v10.x atau lebih baru |
| **PostgreSQL** | 13 | 14 atau lebih baru (untuk produksi) |
| **RAM** | 512 MB | 1 GB atau lebih |
| **Disk** | 1 GB | 5 GB (termasuk log & PDF) |
| **OS** | Linux/Windows | Ubuntu 22.04 LTS |

---

## 🚀 Instalasi & Setup

### 1. Clone Repositori

```bash
git clone https://github.com/yusufburhani20/sentra-bpr.git
cd sentra-bpr
```

### 2. Install Dependensi

```bash
npm install
```

### 3. Konfigurasi Environment

Salin file contoh konfigurasi, lalu sesuaikan:

```bash
cp .env.example .env
```

Buka file `.env` dan isi sesuai lingkungan Anda (lihat bagian [Konfigurasi Environment](#-konfigurasi-environment)).

### 4. Jalankan Aplikasi

**Mode Pengembangan (SQLite, tanpa setup database):**
```bash
npm run dev
```

**Mode Produksi (PostgreSQL):**

Pastikan database PostgreSQL sudah dibuat terlebih dahulu:
```sql
CREATE USER sentra WITH PASSWORD 'password_anda';
CREATE DATABASE sentra OWNER sentra;
```

Lalu jalankan:
```bash
npm start
```

Aplikasi akan berjalan di `http://localhost:3000`

**Kredensial login bawaan:**
| Username | Password | Peran |
|---|---|---|
| `admin1` | `slip1234` | Admin |
| `spv1` | `slip1234` | Supervisor |
| `teller1` | `slip1234` | Teller |
| `kas1` | `slip1234` | Kantor Kas |
| `sdm1` | `slip1234` | SDM |

> ⚠️ **Segera ganti password default setelah login pertama!**

---

## ⚙️ Konfigurasi Environment

Salin `.env.example` menjadi `.env` dan sesuaikan nilainya:

```env
# ─── SERVER ───────────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── SECURITY ─────────────────────────────────────────────────
JWT_SECRET=ganti_dengan_string_rahasia_yang_panjang_dan_acak
SESSION_SECRET=ganti_dengan_string_rahasia_lainnya

# ─── DATABASE ─────────────────────────────────────────────────
# Gunakan 'sqlite' untuk pengembangan, 'postgres' untuk produksi
DB_TYPE=postgres

# Konfigurasi PostgreSQL (wajib jika DB_TYPE=postgres)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentra
DB_USER=sentra
DB_PASSWORD=password_anda

# ─── APPLICATION ──────────────────────────────────────────────
DEFAULT_PASSWORD=slip1234
```

---

## 📁 Struktur Proyek

```
sentra-bpr/
├── config/
│   ├── db.js               # Abstraksi database (SQLite/PostgreSQL)
│   └── dbInit.js           # Inisialisasi tabel & seed data awal
├── controllers/
│   ├── authController.js
│   ├── approvalController.js
│   ├── dashboardController.js
│   ├── slipSubmissionController.js
│   ├── transactionController.js
│   └── userController.js
├── middleware/
│   ├── auth.js             # JWT verification middleware
│   └── limiter.js          # Rate limiting
├── routes/
│   ├── authRoutes.js
│   ├── approvalRoutes.js
│   ├── dashboardRoutes.js
│   ├── slipSubmissionRoutes.js
│   ├── transactionRoutes.js
│   └── userRoutes.js
├── js/                     # Frontend JavaScript (Vanilla JS)
│   ├── auth.js
│   ├── dashboard.js
│   ├── transactions.js
│   ├── history.js
│   ├── users.js
│   ├── approvals.js
│   ├── costCodes.js
│   └── ...
├── tests/                  # Integration tests (Jest + Supertest)
│   ├── api.test.js
│   ├── approvals.test.js
│   ├── dashboard.test.js
│   ├── slipSubmissions.test.js
│   └── ...
├── uploads/                # File uploads (foto pendukung transaksi)
├── app.js                  # Express app & API routes configuration
├── server.js               # Entry point server
├── index.html              # Frontend SPA utama
├── styles.css              # Global stylesheet
├── package.json
├── .env.example            # Template konfigurasi environment
└── DEPLOYMENT.md           # Panduan deployment lengkap
```

---

## 📡 API Documentation

Semua endpoint memerlukan autentikasi JWT (kecuali `/api/auth/login`).

### Authentication
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/auth/login` | Login, mendapatkan JWT cookie |
| `POST` | `/api/auth/logout` | Logout, hapus cookie |
| `GET` | `/api/auth/me` | Info pengguna yang sedang login |

### Transactions
| Method | Endpoint | Deskripsi | Role |
|---|---|---|---|
| `GET` | `/api/transactions` | Daftar transaksi | All |
| `POST` | `/api/transactions` | Buat transaksi baru | All |
| `GET` | `/api/transactions/:id` | Detail transaksi | All |
| `GET` | `/api/transactions/:id/print` | Cetak PDF slip | All |

### Users (Admin Only)
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/users` | Daftar semua pengguna |
| `POST` | `/api/users` | Buat pengguna baru |
| `PUT` | `/api/users/:id` | Perbarui data pengguna |
| `DELETE` | `/api/users/:id` | Hapus pengguna (soft delete) |
| `GET` | `/api/users/ref-counters` | Daftar counter referensi |
| `PUT` | `/api/users/ref-counters/:code` | Reset counter referensi |

### Dashboard
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/dashboard/stats` | KPI & statistik (role-filtered) |

### Approvals
| Method | Endpoint | Deskripsi | Role |
|---|---|---|---|
| `GET` | `/api/approvals` | Daftar slip menunggu persetujuan | Supervisor, Admin |
| `POST` | `/api/approvals/:id/approve` | Setujui transaksi | Supervisor, Admin |
| `POST` | `/api/approvals/:id/reject` | Tolak transaksi | Supervisor, Admin |

---

## 🖥️ Deployment Produksi

Lihat panduan lengkap di [DEPLOYMENT.md](./DEPLOYMENT.md).

### Ringkasan Cepat (Ubuntu + Apache):

```bash
# 1. Clone & install di server
git clone https://github.com/yusufburhani20/sentra-bpr.git /home/nsbspa/apps/slip
cd /home/nsbspa/apps/slip
npm install --omit=dev

# 2. Konfigurasi .env (salin & isi)
cp .env.example .env
nano .env

# 3. Jalankan sebagai background process
nohup node server.js > app.log 2>&1 &

# 4. Update di kemudian hari (cukup ini):
git pull && sudo kill $(sudo lsof -t -i :3000) && nohup node server.js > app.log 2>&1 &
```

### Deploy Script Otomatis

Jalankan skrip berikut untuk deploy update terbaru dengan satu perintah:

```bash
bash deploy.sh
```

---

## 🧪 Menjalankan Tests

```bash
npm test
```

Tersedia **39 integration tests** yang mencakup:
- Autentikasi & otorisasi (JWT, role-based access)
- CRUD transaksi & validasi data
- Alur persetujuan supervisor
- Filter dashboard berbasis peran
- Utilitas (terbilang, format nominal)

---

## 🔒 Fitur Keamanan

- **JWT Authentication** — Token tersimpan di HttpOnly cookie
- **Rate Limiting** — Batasan request per IP untuk mencegah brute force
- **Helmet.js** — Security headers (XSS, CSRF, Clickjacking protection)
- **CORS** — Pembatasan origin
- **Soft Delete** — Data pengguna tidak terhapus permanen, histori tetap terjaga
- **Audit Trail** — Setiap aksi tercatat lengkap dengan timestamp dan IP

---

## 🤝 Kontribusi

1. Fork repositori ini
2. Buat branch baru: `git checkout -b fitur/nama-fitur`
3. Commit perubahan: `git commit -m 'feat: tambah fitur X'`
4. Push ke branch: `git push origin fitur/nama-fitur`
5. Buat Pull Request

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **ISC License** — lihat file [LICENSE](LICENSE) untuk detail.

---

<div align="center">
  <p>Dikembangkan oleh <strong>Tim Teknologi Informasi BPR Nusa Amba Singaparna</strong></p>
  <p><em>SENTRA v2.0 — Sistem Terpusat Referensi, Arsip & Operasional BPR</em></p>
</div>
