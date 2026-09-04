require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function fix() {
    console.log("Memperbaiki branch_id pada transaksi agar sesuai dengan branch_id pembuatnya (user)...");
    
    // SQLite syntax for UPDATE with JOIN is limited, so we can use a subquery or a CTE.
    // The safest is UPDATE transactions SET branch_id = (SELECT branch_id FROM users WHERE users.username = transactions.username)
    
    const query = `
        UPDATE transactions 
        SET branch_id = (SELECT branch_id FROM users WHERE users.username = transactions.username)
        WHERE (SELECT branch_id FROM users WHERE users.username = transactions.username) IS NOT NULL
    `;
    
    db.run(query, [], function(err) {
        if (err) {
            console.error("Gagal memperbaiki transaksi:", err);
            process.exit(1);
        }
        console.log(`Berhasil memperbarui ${this.changes !== undefined ? this.changes : 'beberapa'} transaksi.`);
        process.exit(0);
    });
}

fix();
