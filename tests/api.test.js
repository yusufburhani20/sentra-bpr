const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Express REST API Authentication & Security Integration Tests', () => {
    
    beforeAll(async () => {
        await app.dbReady;
    });

    afterAll((done) => {
        // Close database connections cleanly to prevent open handle hangs
        db.close(done);
    });

    describe('Public / Unauthenticated Access Control', () => {
        test('GET /api/transactions should return 401 without auth cookie', async () => {
            const res = await request(app).get('/api/transactions');
            expect(res.statusCode).toBe(401);
            expect(res.body).toHaveProperty('error');
            expect(res.body.error).toContain('Sesi tidak valid');
        });

        test('GET /api/users should return 401 without auth cookie', async () => {
            const res = await request(app).get('/api/users');
            expect(res.statusCode).toBe(401);
        });

        test('GET /api/cost-codes should return 401 without auth cookie', async () => {
            const res = await request(app).get('/api/cost-codes');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('Authentication Endpoints (/api/auth)', () => {
        test('POST /api/auth/login with wrong credentials should return 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'nonexistent_user', password: 'wrongpassword' });
            
            expect(res.statusCode).toBe(401);
            expect(res.body).toHaveProperty('error');
            expect(res.body.error).toContain('Username atau password salah');
        });

        test('POST /api/auth/login with correct credentials should return 200 and auth cookie', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin1', password: 'slip1234' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('username', 'admin1');
            expect(res.body.user).toHaveProperty('role', 'Admin');

            // Verify cookies are set
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies.some(c => c.includes('authToken='))).toBe(true);
        });
    });

    describe('Direct Actions and Admin Capabilities Restrictions', () => {
        let adminCookie;
        let tellerCookie;
        let testTxId = 'TX-DIRECT-TEST';

        beforeAll(async () => {
            const resAdmin = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin1', password: 'slip1234' });
            adminCookie = resAdmin.headers['set-cookie'];

            const resTeller = await request(app)
                .post('/api/auth/login')
                .send({ username: 'teller1', password: 'slip1234' });
            tellerCookie = resTeller.headers['set-cookie'];

            // Seed a direct test transaction
            await new Promise((resolve) => {
                db.run(`INSERT INTO transactions 
                    (id, ref_no, tanggal, operator_code, debet_nama, debet_rekening, kredit_nama, kredit_rekening, jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang)
                    VALUES (?, 'TXREFDIRECT', '2026-06-26T00:00:00', 'CSSPA0148', 'DEBET', '54305', 'KREDIT', '0159000004', 'Lainnya', 1000, 0, 'Keterangan', 'Seribu Rupiah')`,
                    [testTxId], () => resolve());
            });
        });

        afterAll(async () => {
            await new Promise((resolve) => {
                db.run("DELETE FROM transactions WHERE id = ?", [testTxId], () => resolve());
            });
        });

        test('Teller must be blocked from directly deleting transactions', async () => {
            const res = await request(app)
                .delete(`/api/transactions/${testTxId}`)
                .set('Cookie', tellerCookie);
            expect(res.statusCode).toBe(403);
        });

        test('Teller must be blocked from directly modifying transactions', async () => {
            const res = await request(app)
                .put(`/api/transactions/${testTxId}`)
                .set('Cookie', tellerCookie)
                .send({
                    debet_nama: 'EDITED',
                    debet_rekening: '54306',
                    kredit_nama: 'EDITED',
                    kredit_rekening: '0159000004',
                    nominal_utama: 2000,
                    nominal_desimal: 0,
                    keterangan: 'Edited',
                    terbilang: 'Dua Ribu Rupiah'
                });
            expect(res.statusCode).toBe(403);
        });

        test('Teller must be blocked from clearing all cost codes', async () => {
            const res = await request(app)
                .post('/api/cost-codes/clear-all')
                .set('Cookie', tellerCookie);
            expect(res.statusCode).toBe(403);
        });

        test('Admin can directly modify transaction', async () => {
            const res = await request(app)
                .put(`/api/transactions/${testTxId}`)
                .set('Cookie', adminCookie)
                .send({
                    debet_nama: 'EDITED BY ADMIN',
                    debet_rekening: '54305',
                    kredit_nama: 'KREDIT',
                    kredit_rekening: '0159000004',
                    nominal_utama: 9000,
                    nominal_desimal: 0,
                    keterangan: 'Directly edited by Admin',
                    terbilang: 'Sembilan Ribu Rupiah'
                });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
        });

        test('Admin can directly delete transaction', async () => {
            const res = await request(app)
                .delete(`/api/transactions/${testTxId}`)
                .set('Cookie', adminCookie);
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
        });
    });
});
