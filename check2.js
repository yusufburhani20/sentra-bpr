const { Client } = require('pg');
const client = new Client({user: 'postgres', host: 'localhost', database: 'nsbspa', password: 'admin', port: 5432});
client.connect()
  .then(() => client.query("SELECT * FROM users WHERE username = 'admin'"))
  .then(res => { console.log(res.rows); return client.query("SELECT ref_no FROM transactions ORDER BY rowid DESC LIMIT 10") })
  .then(res => { console.log(res.rows); client.end(); })
  .catch(e => { console.error(e); client.end(); });
