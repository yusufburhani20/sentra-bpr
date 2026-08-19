const { Client } = require('pg');
const client = new Client({user: 'postgres', host: 'localhost', database: 'nsbspa', password: 'admin', port: 5432});
client.connect()
  .then(() => client.query("SELECT ref_no FROM transactions WHERE ref_no LIKE '165%' ORDER BY ref_no DESC LIMIT 5"))
  .then(res => { console.log(res.rows); client.end(); });
