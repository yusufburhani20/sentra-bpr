require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function migrate() {
    console.log("==========================================");
    console.log("MIGRASI DATA LAMA KE CABANG SINGAPARNA");
    console.log("==========================================");
    
    // 1. Cek apakah Cabang Singaparna ada
    db.all("SELECT id, name FROM branches WHERE name ILIKE '%singaparna%'", [], (err, rows) => {
        if (err) {
            console.error("❌ Error mencari cabang:", err);
            process.exit(1);
        }
        
        if (!rows || rows.length === 0) {
            console.log("⚠️ Cabang Singaparna tidak ditemukan. Membuat cabang secara otomatis...");
            const singaparnaId = "B-" + Date.now();
            db.run("INSERT INTO branches (id, name, type) VALUES (?, ?, ?)", [singaparnaId, "Cabang Singaparna", "Cabang"], function(errInsert) {
                if (errInsert) {
                    console.error("❌ Gagal membuat Cabang Singaparna:", errInsert);
                    process.exit(1);
                }
                console.log(`✅ Berhasil membuat Cabang Singaparna dengan ID: ${singaparnaId}`);
                lanjutkanMigrasi(singaparnaId);
            });
        } else {
            const singaparnaId = rows[0].id;
            console.log(`✅ Ditemukan ID Cabang Singaparna: ${singaparnaId} (${rows[0].name})`);
            lanjutkanMigrasi(singaparnaId);
        }
    });
}

function lanjutkanMigrasi(singaparnaId) {
        
        console.log("🔄 Memperbarui semua transaksi lama yang masuk ke Kantor Pusat (B-PUSAT)...");
        
        // Asumsi: data lama yang termigrasi otomatis oleh sistem ditugaskan ke B-PUSAT.
        // Script ini akan memindahkan SEMUA transaksi dari B-PUSAT ke Cabang Singaparna.
        db.run("UPDATE transactions SET branch_id = $1 WHERE branch_id = 'B-PUSAT'", [singaparnaId], function(errUpdate) {
            if (errUpdate) {
                console.error("❌ Error update transaksi:", errUpdate);
                process.exit(1);
            }
            
            const rowsAffected = this.changes !== undefined ? this.changes : 'Beberapa';
            console.log(`✅ Berhasil memindahkan ${rowsAffected} transaksi ke Cabang Singaparna.`);
            
            console.log("🔄 Memperbarui data pengguna...");
            db.run("UPDATE users SET branch_id = $1 WHERE branch_id = 'B-PUSAT' AND role != 'Super Admin'", [singaparnaId], function(errUser) {
                if (errUser) {
                    console.error("❌ Error update pengguna:", errUser);
                } else {
                    const usersAffected = this.changes !== undefined ? this.changes : 'Beberapa';
                    console.log(`✅ Berhasil memindahkan ${usersAffected} pengguna ke Cabang Singaparna.`);
                }
                
                console.log("🔄 Memastikan akun Admin utama menjadi Super Admin...");
                db.run("UPDATE users SET role = 'Super Admin', branch_id = 'B-PUSAT' WHERE username = 'admin' OR username = 'admin1'", [], function(errAdmin) {
                    if (errAdmin) console.error("❌ Error update admin:", errAdmin);
                    
                    console.log("==========================================");
                    console.log("🎉 Migrasi selesai.");
                    process.exit(0);
                });
            });
        });
    });
}

migrate();
