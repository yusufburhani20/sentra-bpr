const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:admin@localhost:5432/nsbspa' });
client.connect()
    .then(() => client.query("SELECT username, role, branch_id FROM users WHERE role IN ('Admin', 'Super Admin')"))
    .then(res => {
        console.table(res.rows);
        client.end();
    });
