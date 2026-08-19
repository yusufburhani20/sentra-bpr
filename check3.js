const { Client } = require('pg');
const client = new Client({user: 'postgres', host: 'localhost', database: 'nsbspa', password: 'admin', port: 5432});
client.connect()
  .then(() => client.query("SELECT username, nama, operator_code FROM users"))
  .then(res => { console.log(res.rows); return client.query("SELECT ref_no, operator_code, jenis_transaksi FROM transactions ORDER BY tanggal DESC LIMIT 20") })
  .then(res => { console.log(res.rows); client.end(); })
  .catch(e => { console.error(e); client.end(); });
