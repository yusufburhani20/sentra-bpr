const jwt = require('jsonwebtoken');
const token = jwt.sign({
    id: 1,
    username: 'admin',
    nama: 'Yusuf Burhani',
    role: 'Admin',
    bagian: 'Pusat',
    operator_code: 'admin'
}, process.env.JWT_SECRET || 'SIM_SLIP_REF_SECRET_2026_GANTI_DI_PRODUKSI', { expiresIn: '8h' });

const payload = {
    ref_no: 'TEST001',
    operator_code: 'admin',
    debet_nama: 'TEST',
    debet_rekening: '123',
    kredit_nama: 'TEST2',
    kredit_rekening: '456',
    jenis_transaksi: 'debet',
    nominal_utama: 100,
    nominal_desimal: 0,
    keterangan: 'Test',
    terbilang: 'Seratus',
    username: 'Yusuf Burhani',
    userRole: 'Admin'
};

fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Cookie': `authToken=${token}`
    },
    body: JSON.stringify(payload)
})
.then(r => r.json())
.then(res => console.log('POST result:', res))
.catch(e => console.error(e));
