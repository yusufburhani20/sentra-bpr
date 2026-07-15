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

        test('Can reuse reference number of a deleted transaction', async () => {
            const res = await request(app)
                .post('/api/transactions')
                .set('Cookie', adminCookie)
                .send({
                    ref_no: 'TXREFDIRECT',
                    operator_code: 'CSSPA0146',
                    debet_nama: 'Kas Kantor',
                    debet_rekening: '10101',
                    kredit_nama: 'Pendapatan',
                    kredit_rekening: '40101',
                    jenis_transaksi: 'debet',
                    nominal_utama: 5000,
                    nominal_desimal: 0,
                    keterangan: 'Reused ref no test',
                    terbilang: 'Lima Ribu Rupiah'
                });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);

            // Clean up the created reused transaction
            await new Promise((resolve) => {
                db.run("DELETE FROM transactions WHERE ref_no = 'TXREFDIRECT'", [], () => resolve());
            });
        });

        test('Teller must be blocked from importing users', async () => {
            const res = await request(app)
                .post('/api/users/import')
                .set('Cookie', tellerCookie)
                .send({
                    rows: [
                        { username: 'test_imp_teller', nama: 'Test Imp Teller', bagian: 'Teller', role: 'Teller', status: 'Aktif', operator_code: 'TTEST1' }
                    ]
                });
            expect(res.statusCode).toBe(403);
        });

        test('Admin can import new users and duplicates are skipped', async () => {
            // Delete if exists first to make test idempotent
            await new Promise((resolve) => {
                db.run("DELETE FROM users WHERE username = ?", ['test_imp_admin'], () => {
                    db.run("DELETE FROM ref_counters WHERE username = ?", ['test_imp_admin'], () => resolve());
                });
            });

            // 1. First import should succeed
            const res1 = await request(app)
                .post('/api/users/import')
                .set('Cookie', adminCookie)
                .send({
                    rows: [
                        { username: 'test_imp_admin', nama: 'Test Imp Admin', bagian: 'SDMU', role: 'SDMU', status: 'Aktif', operator_code: 'ATEST1' }
                    ]
                });
            expect(res1.statusCode).toBe(200);
            expect(res1.body).toHaveProperty('success', true);
            expect(res1.body.imported).toBe(1);
            expect(res1.body.skipped).toBe(0);

            // Verify in db
            const userRow = await new Promise((resolve) => {
                db.get("SELECT * FROM users WHERE username = ?", ['test_imp_admin'], (err, row) => resolve(row));
            });
            expect(userRow).toBeDefined();
            expect(userRow.nama).toBe('Test Imp Admin');
            expect(userRow.role).toBe('SDMU');
            expect(userRow.operator_code).toBe('ATEST1');

            const counterRow = await new Promise((resolve) => {
                db.get("SELECT * FROM ref_counters WHERE username = ? AND slip_type = 'debet'", ['test_imp_admin'], (err, row) => resolve(row));
            });
            expect(counterRow).toBeDefined();
            expect(counterRow.prefix).toBe('ATEST1');

            // 2. Second import with same user should be skipped
            const res2 = await request(app)
                .post('/api/users/import')
                .set('Cookie', adminCookie)
                .send({
                    rows: [
                        { username: 'test_imp_admin', nama: 'Test Imp Admin', bagian: 'SDMU', role: 'SDMU', status: 'Aktif', operator_code: 'ATEST1' }
                    ]
                });
            expect(res2.statusCode).toBe(200);
            expect(res2.body.imported).toBe(0);
            expect(res2.body.skipped).toBe(1);

            // Clean up
            await new Promise((resolve) => {
                db.run("DELETE FROM users WHERE username = ?", ['test_imp_admin'], () => {
                    db.run("DELETE FROM ref_counters WHERE username = ?", ['test_imp_admin'], () => resolve());
                });
            });
        });

        test('Admin can perform CRUD on cost codes and resolve soft-deleted unique conflicts', async () => {
            const testCode = 'TEST99';
            const initialDesc = 'Initial Test Cost Code';
            const updatedDesc = 'Updated Test Cost Code';

            // Ensure not exists
            await new Promise((resolve) => {
                db.run("DELETE FROM cost_codes WHERE kode = ?", [testCode], () => resolve());
            });

            // 1. Create a new cost code
            let res = await request(app)
                .post('/api/cost-codes')
                .set('Cookie', adminCookie)
                .send({ kode: testCode, deskripsi: initialDesc });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            const createdId = res.body.id;

            // 2. Try to create duplicate active cost code - should fail
            res = await request(app)
                .post('/api/cost-codes')
                .set('Cookie', adminCookie)
                .send({ kode: testCode, deskripsi: 'Another description' });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('sudah terdaftar');

            // 3. Soft-delete the cost code
            res = await request(app)
                .delete(`/api/cost-codes/${createdId}`)
                .set('Cookie', adminCookie);
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);

            // 4. Create new cost code with the same code (reactivate/restore soft-deleted one)
            res = await request(app)
                .post('/api/cost-codes')
                .set('Cookie', adminCookie)
                .send({ kode: testCode, deskripsi: updatedDesc });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            const newId = res.body.id;

            // Verify it restored/updated
            const costCodeRow = await new Promise((resolve) => {
                db.get("SELECT * FROM cost_codes WHERE id = ?", [newId], (err, row) => resolve(row));
            });
            expect(costCodeRow).toBeDefined();
            expect(costCodeRow.kode).toBe(testCode);
            expect(costCodeRow.deskripsi).toBe(updatedDesc);
            expect(costCodeRow.deleted_at).toBeNull();

            // 5. Soft-delete the cost code again
            res = await request(app)
                .delete(`/api/cost-codes/${newId}`)
                .set('Cookie', adminCookie);
            expect(res.statusCode).toBe(200);

            // 6. Create another active cost code (TEST88)
            const secondCode = 'TEST88';
            res = await request(app)
                .post('/api/cost-codes')
                .set('Cookie', adminCookie)
                .send({ kode: secondCode, deskripsi: 'Second Cost Code' });
            expect(res.statusCode).toBe(200);
            const secondId = res.body.id;

            // 7. Try to edit TEST88's code to TEST99 (which is soft-deleted). This should resolve conflict and succeed.
            res = await request(app)
                .put(`/api/cost-codes/${secondId}`)
                .set('Cookie', adminCookie)
                .send({ kode: testCode, deskripsi: 'Edited to TEST99' });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);

            // Verify in database: TEST88's id now has kode TEST99, and the old TEST99 soft-deleted row is deleted from the DB
            const checkActive = await new Promise((resolve) => {
                db.get("SELECT * FROM cost_codes WHERE id = ?", [secondId], (err, row) => resolve(row));
            });
            expect(checkActive.kode).toBe(testCode);
            expect(checkActive.deskripsi).toBe('Edited to TEST99');

            const checkSoftDeleted = await new Promise((resolve) => {
                db.get("SELECT * FROM cost_codes WHERE id = ?", [newId], (err, row) => resolve(row));
            });
            expect(checkSoftDeleted).toBeFalsy(); // Should be hard-deleted because of the edit conflict resolution

            // Clean up
            await new Promise((resolve) => {
                db.run("DELETE FROM cost_codes WHERE kode IN (?, ?)", [testCode, secondCode], () => resolve());
            });
        });
    });
});
