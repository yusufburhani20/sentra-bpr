const request = require('supertest');
const app = require('../server');
const db = require('../config/db');
const initializeDb = require('../config/dbInit');

describe('Approvals Governance & Workflow API Tests', () => {
    let adminCookie;
    let supervisorCookie;
    let tellerCookie;
    let testTxId = 'TX-TEST-APPROVAL';
    let testTxRef = 'TXREF12345';

    beforeAll((done) => {
        // Ensure DB tables and seed data are ready before logging in
        initializeDb(async () => {
            try {
                const resAdmin = await request(app)
                    .post('/api/auth/login')
                    .send({ username: 'admin1', password: 'slip1234' });
                adminCookie = resAdmin.headers['set-cookie'];
                console.log("resAdmin login status:", resAdmin.statusCode, resAdmin.body);

                const resSpv = await request(app)
                    .post('/api/auth/login')
                    .send({ username: 'spv1', password: 'slip1234' });
                supervisorCookie = resSpv.headers['set-cookie'];
                console.log("resSpv login status:", resSpv.statusCode, resSpv.body);

                const resTeller = await request(app)
                    .post('/api/auth/login')
                    .send({ username: 'teller1', password: 'slip1234' });
                tellerCookie = resTeller.headers['set-cookie'];
                console.log("resTeller login status:", resTeller.statusCode, resTeller.body);

                done();
            } catch (err) {
                done(err);
            }
        });
    });

    beforeEach((done) => {
        // Clean up test data and insert a clean test transaction
        db.serialize(() => {
            db.run("DELETE FROM approval_requests", [], () => {
                db.run("DELETE FROM transactions WHERE id = ?", [testTxId], () => {
                    db.run(
                        `INSERT INTO transactions 
                        (id, ref_no, tanggal, operator_code, debet_nama, debet_rekening, kredit_nama, kredit_rekening, jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang) 
                        VALUES (?, ?, ?, 'CSSPA0148', 'BY PARKIR/TOL', '54305', 'REKENING UTAMA KAS', '0159000004', 'R/P Umum', 15000, 0, 'Keterangan Asli', 'Lima Belas Ribu Rupiah')`,
                        [testTxId, testTxRef, new Date().toISOString()],
                        () => done()
                    );
                });
            });
        });
    });

    afterAll((done) => {
        // Clean up everything and close DB connection
        db.serialize(() => {
            db.run("DELETE FROM approval_requests", [], () => {
                db.run("DELETE FROM transactions WHERE id = ?", [testTxId], () => {
                    db.close(done);
                });
            });
        });
    });

    describe('Route Guards & Permissions', () => {
        test('Unauthenticated callers must be blocked from approvals API', async () => {
            const res = await request(app).get('/api/approvals/pending');
            expect(res.statusCode).toBe(401);
        });

        test('Teller role must be blocked from fetching pending requests', async () => {
            const res = await request(app)
                .get('/api/approvals/pending')
                .set('Cookie', tellerCookie);
            expect(res.statusCode).toBe(403);
        });

        test('Teller role must be blocked from approving requests', async () => {
            const res = await request(app)
                .post('/api/approvals/some-id/approve')
                .set('Cookie', tellerCookie)
                .send({ reason: 'Sebab' });
            expect(res.statusCode).toBe(403);
        });
    });

    describe('Approval Request Creation', () => {
        test('Teller can successfully submit an EDIT approval request', async () => {
            const reqData = {
                debet_nama: 'REKREASI / OLAHRAGA',
                debet_rekening: '54306',
                kredit_nama: 'REKENING UTAMA KAS',
                kredit_rekening: '0159000004',
                nominal_utama: 25000,
                nominal_desimal: 50,
                keterangan: 'Keterangan Baru',
                terbilang: 'Dua Puluh Lima Ribu Rupiah Koma Lima Puluh Sen'
            };

            const res = await request(app)
                .post('/api/approvals/request')
                .set('Cookie', tellerCookie)
                .send({
                    transaction_id: testTxId,
                    request_type: 'EDIT',
                    request_data: reqData
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('id');

            // Verify it exists in pending list for Admin
            const pendingRes = await request(app)
                .get('/api/approvals/pending')
                .set('Cookie', adminCookie);

            expect(pendingRes.statusCode).toBe(200);
            expect(pendingRes.body.length).toBe(1);
            expect(pendingRes.body[0].transaction_id).toBe(testTxId);
            expect(pendingRes.body[0].request_type).toBe('EDIT');
            expect(pendingRes.body[0].orig_keterangan).toBe('Keterangan Asli');
            expect(pendingRes.body[0].request_data.keterangan).toBe('Keterangan Baru');
        });

        test('Teller can successfully submit a DELETE approval request', async () => {
            const res = await request(app)
                .post('/api/approvals/request')
                .set('Cookie', tellerCookie)
                .send({
                    transaction_id: testTxId,
                    request_type: 'DELETE',
                    request_data: {}
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);

            // Verify it exists in pending list
            const pendingRes = await request(app)
                .get('/api/approvals/pending')
                .set('Cookie', supervisorCookie);

            expect(pendingRes.body.length).toBe(1);
            expect(pendingRes.body[0].request_type).toBe('DELETE');
        });
    });

    describe('Approval Decisions (Approve/Reject)', () => {
        let requestId;

        beforeEach(async () => {
            // Create a pending EDIT request before running tests in this block
            const reqData = {
                debet_nama: 'REKREASI / OLAHRAGA',
                debet_rekening: '54306',
                kredit_nama: 'REKENING UTAMA KAS',
                kredit_rekening: '0159000004',
                nominal_utama: 20000,
                nominal_desimal: 0,
                keterangan: 'Keterangan Diedit',
                terbilang: 'Dua Puluh Ribu Rupiah'
            };

            const res = await request(app)
                .post('/api/approvals/request')
                .set('Cookie', tellerCookie)
                .send({
                    transaction_id: testTxId,
                    request_type: 'EDIT',
                    request_data: reqData
                });
            requestId = res.body.id;
        });

        test('Supervisor can approve EDIT request and update transaction properties', async () => {
            const resApprove = await request(app)
                .post(`/api/approvals/${requestId}/approve`)
                .set('Cookie', supervisorCookie)
                .send({ reason: 'Disetujui untuk penyesuaian anggaran' });

            expect(resApprove.statusCode).toBe(200);
            expect(resApprove.body).toHaveProperty('success', true);

            // Verify transaction has updated in database
            const txRes = await request(app)
                .get('/api/transactions')
                .set('Cookie', adminCookie);
            
            const updatedTx = txRes.body.data.find(t => t.id === testTxId);
            expect(updatedTx).toBeDefined();
            expect(updatedTx.debet_rekening).toBe('54306');
            expect(updatedTx.nominal_utama).toBe(20000);
            expect(updatedTx.keterangan).toBe('Keterangan Diedit');
        });

        test('Admin can reject approval request leaving transaction unchanged', async () => {
            const resReject = await request(app)
                .post(`/api/approvals/${requestId}/reject`)
                .set('Cookie', adminCookie)
                .send({ reason: 'Nominal tidak sesuai bukti fisik!' });

            expect(resReject.statusCode).toBe(200);
            expect(resReject.body).toHaveProperty('success', true);

            // Verify transaction is UNCHANGED
            const txRes = await request(app)
                .get('/api/transactions')
                .set('Cookie', adminCookie);
            
            const tx = txRes.body.data.find(t => t.id === testTxId);
            expect(tx).toBeDefined();
            expect(tx.debet_rekening).toBe('54305');
            expect(tx.nominal_utama).toBe(15000);
            expect(tx.keterangan).toBe('Keterangan Asli');
        });

        test('Supervisor can approve DELETE request and soft-delete the transaction', async () => {
            // Delete request creation
            const resDelReq = await request(app)
                .post('/api/approvals/request')
                .set('Cookie', tellerCookie)
                .send({
                    transaction_id: testTxId,
                    request_type: 'DELETE',
                    request_data: {}
                });
            const deleteRequestId = resDelReq.body.id;

            // Approve delete
            const resApprove = await request(app)
                .post(`/api/approvals/${deleteRequestId}/approve`)
                .set('Cookie', supervisorCookie)
                .send({ reason: 'Penghapusan disetujui' });

            expect(resApprove.statusCode).toBe(200);

            // Verify transaction is excluded from getTransactions (soft-deleted)
            const txRes = await request(app)
                .get('/api/transactions')
                .set('Cookie', adminCookie);

            const tx = txRes.body.data.find(t => t.id === testTxId);
            expect(tx).toBeUndefined(); // Filtered because deleted_at is set!
        });
    });
});
