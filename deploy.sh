#!/bin/bash
# ─── SENTRA BPR - Deploy Script ───────────────────────────────────────────────
# Dijalankan oleh sistem otomatis dari tombol Deploy di panel Admin.
# Script ini: git pull -> update dependensi -> restart server

set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/app.log"
PORT=3000

echo "========================================"
echo "  SENTRA BPR - Deploy Otomatis"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. Pull kode terbaru dari GitHub
echo ""
echo "[1/3] Mengambil kode terbaru dari GitHub..."
cd "$APP_DIR"
git fetch origin
git reset --hard origin/main
echo "      OK - Kode berhasil diperbarui."

# 2. Update dependensi jika package.json berubah
echo ""
echo "[2/3] Memeriksa dependensi (npm install)..."
if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
    echo "      Menjalankan npm install (karena ada perubahan di package.json)..."
    npm install --omit=dev --no-audit --no-fund
    echo "      OK - Dependensi berhasil diupdate."
else
    echo "      OK - Melewati npm install (tidak ada perubahan package.json)."
fi

# 3. Restart server
echo ""
echo "[3/3] Merestart server SENTRA..."

if command -v pm2 >/dev/null 2>&1 && pm2 describe slip >/dev/null 2>&1; then
    echo "      Sistem mendeteksi pengelolaan via PM2."
    pm2 restart slip
    echo "      OK - Server berhasil direstart via PM2."
elif systemctl status slip.service >/dev/null 2>&1; then
    echo "      Sistem mendeteksi slip.service (Systemd)."
    if sudo systemctl restart slip 2>/dev/null; then
        echo "      OK - Server berhasil direstart via Systemd."
    else
        OLD_PID=$(lsof -t -i :$PORT 2>/dev/null || true)
        if [ -n "$OLD_PID" ]; then
            kill "$OLD_PID" 2>/dev/null || true
            sleep 2
            echo "      OK - Proses lama dihentikan, membiarkan Systemd menyalakan ulang server."
        fi
    fi
else
    OLD_PID=$(lsof -t -i :$PORT 2>/dev/null || true)
    if [ -n "$OLD_PID" ]; then
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
        echo "      OK - Proses lama (PID: $OLD_PID) dihentikan."
    fi
    nohup node "$APP_DIR/server.js" >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "      OK - Server baru berjalan manual di background (PID: $NEW_PID)."
fi

echo ""
echo "========================================"
echo "  Deploy selesai!"
echo "========================================"
