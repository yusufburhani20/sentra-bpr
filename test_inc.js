const db = require('./config/db');

db.atomicIncrementRef('admin', 'debet', '', (err, res) => {
    if (err) console.error("Error:", err);
    else console.log("Success increment:", res);
    process.exit(0);
});
