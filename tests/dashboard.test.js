const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Dashboard Controller / API Tests', () => {
    let authCookie;

    beforeAll(async () => {
        await app.dbReady;
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin1', password: 'slip1234' });
        authCookie = res.headers['set-cookie'];
    });

    afterAll((done) => {
        db.close(done);
    });

    test('GET /api/dashboard/stats should require authentication', async () => {
        const res = await request(app).get('/api/dashboard/stats');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/dashboard/stats should return stats when authenticated', async () => {
        const res = await request(app)
            .get('/api/dashboard/stats')
            .set('Cookie', authCookie);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('kpis');
        expect(res.body).toHaveProperty('trend');
        expect(res.body).toHaveProperty('costCodes');
        expect(res.body).toHaveProperty('operators');
        
        // Assert KPIs fields
        expect(res.body.kpis).toHaveProperty('totalVolume');
        expect(res.body.kpis).toHaveProperty('totalCount');
        expect(res.body.kpis).toHaveProperty('avgValue');
        expect(res.body.kpis).toHaveProperty('todayCount');
        expect(res.body.kpis).toHaveProperty('yesterdayCount');
    });

    test('GET /api/dashboard/stats should restrict non-admin/supervisor to their own transactions', async () => {
        // 1. Log in as teller1
        const resTeller = await request(app)
            .post('/api/auth/login')
            .send({ username: 'teller1', password: 'slip1234' });
        const tellerCookie = resTeller.headers['set-cookie'];

        // 2. Clear old transactions to have clean counts for this test
        await new Promise((resolve) => {
            db.run("DELETE FROM transactions", [], () => resolve());
        });

        // 3. Insert one transaction for admin1 (operator CSSPA0146)
        await new Promise((resolve) => {
            db.run(`INSERT INTO transactions 
                (id, ref_no, tanggal, operator_code, debet_nama, debet_rekening, kredit_nama, kredit_rekening, jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang)
                VALUES ('TX-ADMIN-DASH', 'REFADMIN1', '2026-06-29T10:00:00', 'CSSPA0146', 'DEBET', '54305', 'KREDIT', '0159000004', 'Lainnya', 1000, 0, 'Admin Tx', 'Seribu Rupiah')`,
                [], () => resolve());
        });

        // 4. Insert one transaction for teller1 (operator CSSPA0148)
        await new Promise((resolve) => {
            db.run(`INSERT INTO transactions 
                (id, ref_no, tanggal, operator_code, debet_nama, debet_rekening, kredit_nama, kredit_rekening, jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang)
                VALUES ('TX-TELLER-DASH', 'REFTELLER1', '2026-06-29T10:05:00', 'CSSPA0148', 'DEBET', '54305', 'KREDIT', '0159000004', 'Lainnya', 2000, 0, 'Teller Tx', 'Dua Ribu Rupiah')`,
                [], () => resolve());
        });

        // 5. Fetch dashboard stats as teller1
        const resTellerStats = await request(app)
            .get('/api/dashboard/stats')
            .set('Cookie', tellerCookie);
        
        expect(resTellerStats.statusCode).toBe(200);
        // Teller should only see their own transaction (totalCount = 1, totalVolume = 2000)
        expect(resTellerStats.body.kpis.totalCount).toBe(1);
        expect(resTellerStats.body.kpis.totalVolume).toBe(2000);

        // 6. Fetch dashboard stats as admin1 (who should see both transactions)
        const resAdminStats = await request(app)
            .get('/api/dashboard/stats')
            .set('Cookie', authCookie);
        
        expect(resAdminStats.statusCode).toBe(200);
        expect(resAdminStats.body.kpis.totalCount).toBe(2);
        expect(resAdminStats.body.kpis.totalVolume).toBe(3000);
    });
});
