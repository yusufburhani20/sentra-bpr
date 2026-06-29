# Panduan Pemasangan & Publikasi (Ubuntu & Cloudflare)
## Sistem Informasi Manajemen Nomor Referensi Slip Terpusat (SIM-SLIP-REF) v1.0

Dokumen ini menjelaskan langkah-langkah untuk melakukan pemasangan (deployment) aplikasi **SIM-SLIP-REF** pada server **Ubuntu** dan mempublikasikannya secara aman ke internet menggunakan **Cloudflare Tunnel**.

---

## 🛠️ Prasyarat Sistem
Sebelum memulai, pastikan server Ubuntu Anda telah memiliki:
1. **Node.js** (versi 18 LTS ke atas)
2. **npm** (Node Package Manager)
3. Akun **Cloudflare** dengan domain aktif yang terhubung.

---

## 📥 Langkah 1: Persiapan Aplikasi di Server
1. Salin seluruh direktori proyek `slip` ke server Ubuntu Anda (misal ke direktori `/var/www/sim-slip-ref`).
2. Masuk ke direktori proyek tersebut:
   ```bash
   cd /var/www/sim-slip-ref
   ```
3. Unduh seluruh dependensi proyek yang didefinisikan pada `package.json`:
   ```bash
   npm install --production
   ```
   *Catatan: Parameter `--production` memastikan module development tidak ikut diunduh guna menghemat ruang disk.*

---

## ⚙️ Langkah 2: Konfigurasi Service Autostart (PM2)
Agar aplikasi dapat terus berjalan secara permanen di latar belakang (background) dan otomatis menyala kembali jika server Ubuntu di-reboot, gunakan **PM2 Process Manager**:

1. Pasang PM2 secara global di sistem server:
   ```bash
   sudo npm install -g pm2
   ```
2. Jalankan aplikasi SIM-SLIP-REF melalui PM2:
   ```bash
   pm2 start server.js --name "sim-slip-ref"
   ```
3. Konfigurasikan PM2 agar otomatis berjalan saat sistem operasi Ubuntu melakukan *boot-up*:
   ```bash
   pm2 startup
   ```
   *Perintah di atas akan menghasilkan instruksi command tambahan. Salin dan jalankan instruksi tersebut di terminal Anda.*
4. Simpan daftar proses PM2 saat ini:
   ```bash
   pm2 save
   ```
5. Untuk memantau status log dan performa aplikasi, Anda dapat menggunakan perintah:
   ```bash
   pm2 status
   pm2 logs sim-slip-ref
   ```

---

## ☁️ Langkah 3: Publikasi via Cloudflare Tunnel (`cloudflared`)
Menggunakan Cloudflare Tunnel memungkinkan Anda mempublikasikan aplikasi ke internet secara aman tanpa perlu membuka port port firewall publik (seperti port 80 atau 3000) pada server Anda.

### A. Pemasangan Cloudflare Daemon (`cloudflared`)
Jalankan perintah berikut di server Ubuntu untuk memasang repositori dan paket `cloudflared`:
```bash
# Tambahkan kunci GPG Cloudflare
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# Tambahkan repositori Cloudflare ke APT
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# Update & pasang cloudflared
sudo apt-get update && sudo apt-get install cloudflared
```

### B. Otentikasi Cloudflare
1. Jalankan perintah otentikasi:
   ```bash
   cloudflared tunnel login
   ```
2. Terminal akan menampilkan tautan URL unik. Buka tautan tersebut di browser Anda, masuk ke akun Cloudflare, lalu pilih domain yang ingin dihubungkan untuk memberikan lisensi akses terowongan.

### C. Pembuatan Terowongan (Tunnel)
1. Buat terowongan baru dengan nama `slip-tunnel`:
   ```bash
   cloudflared tunnel create slip-tunnel
   ```
   *Perintah ini akan menampilkan ID terowongan unik (UUID) dan membuat file kredensial berekstensi `.json`.*
2. Tentukan domain/subdomain yang ingin dipakai (misal: `slip.domainanda.com`):
   ```bash
   cloudflared tunnel route dns slip-tunnel slip.domainanda.com
   ```

### D. Konfigurasi Tunnel
1. Buat berkas konfigurasi YAML di folder konfigurasi cloudflared:
   ```bash
   nano ~/.cloudflared/config.yml
   ```
2. Isi berkas tersebut dengan teks berikut (sesuaikan ID terowongan dan jalur file kredensial sesuai output langkah sebelumnya):
   ```yaml
   tunnel: <ID-TEROWONGAN-ANDA-TADI>
   credentials-file: /home/ubuntu/.cloudflared/<ID-TEROWONGAN-ANDA-TADI>.json

   ingress:
     - hostname: slip.domainanda.com
       service: http://localhost:3000
     - service: http_status:404
   ```
   *Ubah `/home/ubuntu/` sesuai dengan nama user home direktori di server Anda.*

### E. Jalankan Tunnel sebagai Service Systemd
Agar terowongan Cloudflare ini otomatis menyala di server Ubuntu sebagai sistem service permanen:
1. Daftarkan tunnel ke dalam systemd service:
   ```bash
   sudo cloudflared --config /home/ubuntu/.cloudflared/config.yml service install
   ```
2. Nyalakan dan aktifkan service:
   ```bash
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   ```
3. Cek status terowongan:
   ```bash
   sudo systemctl status cloudflared
   ```

---

## 🔒 Langkah 4: Pengamanan Tambahan di Cloudflare Dashboard
Karena aplikasi ini akan diakses oleh ~20 orang internal, disarankan mengaktifkan fitur pengamanan tambahan di dashboard Cloudflare Anda:
1. **SSL/TLS**: Atur enkripsi ke mode **Full** atau **Strict** untuk menjamin data slip terenkripsi penuh dari browser ke server Ubuntu.
2. **Cloudflare WAF**: Aktifkan proteksi bawaan Cloudflare untuk memblokir serangan eksploitasi SQL Injection, XSS, dan brute-force.
3. **Cloudflare Access (Opsional)**: Jika Anda ingin membatasi akses hanya untuk karyawan terdaftar, Anda dapat mengaktifkan Cloudflare Access (Zero Trust) untuk memvalidasi email/OTP pengguna sebelum mereka dapat melihat halaman login.

Aplikasi Anda kini sudah siap diakses secara aman di: `https://slip.domainanda.com` 🎉
