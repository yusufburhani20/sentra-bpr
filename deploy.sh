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
npm install --omit=dev --silent
echo "      OK - Dependensi sudah terkini."

# 3. Restart server (jalankan di background, lepas dari parent process)
echo ""
echo "[3/3] Merestart server SENTRA..."
# Matikan proses yang berjalan di port target
OLD_PID=$(lsof -t -i :$PORT 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    echo "      OK - Proses lama (PID: $OLD_PID) dihentikan."
fi

# Jalankan ulang server sebagai proses terpisah
nohup node "$APP_DIR/server.js" >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "      OK - Server baru berjalan (PID: $NEW_PID)."

echo ""
echo "========================================"
echo "  Deploy selesai!"
echo "========================================"
