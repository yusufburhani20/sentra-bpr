const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Slip Submissions Integration Tests', () => {
    let authCookie = '';
    
    beforeAll(async () => {
        await app.dbReady;
        // Login to get session cookie
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin1', password: 'slip1234' });
        authCookie = res.headers['set-cookie'][0];
    });

    afterAll((done) => {
        db.close(done);
    });

    describe('GET /api/slip-submissions', () => {
        test('should return 401 without auth cookie', async () => {
            const res = await request(app).get('/api/slip-submissions');
            expect(res.statusCode).toBe(401);
        });

        test('should return 200 with auth cookie', async () => {
            const res = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [authCookie]);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test('should restrict non-admin/kepala-bidang to see only their own submissions', async () => {
            // 1. Login as teller
            const resTellerLogin = await request(app)
                .post('/api/auth/login')
                .send({ username: 'teller1', password: 'slip1234' });
            const tellerCookie = resTellerLogin.headers['set-cookie'][0];

            // 2. Create a submission as admin
            const mockBuffer = Buffer.from('mock image data');
            const resAdminSub = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [authCookie])
                .field('kantor_kas', 'Admin Branch')
                .attach('bukti_kirim', mockBuffer, 'admin_img.jpg');
            const adminSubId = resAdminSub.body.id;

            // 3. Create a submission as teller
            const resTellerSub = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [tellerCookie])
                .field('kantor_kas', 'Teller Branch')
                .attach('bukti_kirim', mockBuffer, 'teller_img.jpg');
            const tellerSubId = resTellerSub.body.id;

            // 4. Get submissions as teller
            const getResTeller = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [tellerCookie]);
            
            expect(getResTeller.statusCode).toBe(200);
            
            // Teller should see their own submission
            const hasTellerSub = getResTeller.body.some(item => item.id === tellerSubId);
            expect(hasTellerSub).toBe(true);

            // Teller should NOT see the admin's submission
            const hasAdminSub = getResTeller.body.some(item => item.id === adminSubId);
            expect(hasAdminSub).toBe(false);

            // 5. Get submissions as admin (who should see both)
            const getResAdmin = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [authCookie]);
            
            const adminHasTellerSub = getResAdmin.body.some(item => item.id === tellerSubId);
            const adminHasAdminSub = getResAdmin.body.some(item => item.id === adminSubId);
            expect(adminHasTellerSub).toBe(true);
            expect(adminHasAdminSub).toBe(true);
        });
    });

    describe('POST /api/slip-submissions', () => {
        test('should reject creation without image upload', async () => {
            const res = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [authCookie])
                .send({
                    kantor_kas: 'Kantor Kas Utama',
                    checklist_slips: 1,
                    checklist_mutasi: 1,
                    checklist_pb: 0,
                    checklist_fo: 0,
                    checklist_lainnya: '[]'
                });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('Bukti kirim');
        });

        test('should create submission with image upload', async () => {
            const mockBuffer = Buffer.from('mock image data');
            const res = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [authCookie])
                .field('kantor_kas', 'Kantor Kas Test')
                .field('checklist_slips', '1')
                .field('checklist_mutasi', '1')
                .field('checklist_pb', '0')
                .field('checklist_fo', '0')
                .field('checklist_lainnya', '["Laporan Harian"]')
                .attach('bukti_kirim', mockBuffer, 'test_image.jpg');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('id');

            const submissionId = res.body.id;

            // Verify via GET
            const getRes = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [authCookie]);
            
            const createdItem = getRes.body.find(item => item.id === submissionId);
            expect(createdItem).toBeDefined();
            expect(createdItem.kantor_kas).toBe('Kantor Kas Test');
            expect(createdItem.checklist_slips).toBe(1);
            expect(createdItem.status).toBe('Dikirim');
        });
    });

    describe('PUT /api/slip-submissions/:id/confirm-arrival', () => {
        test('should update submission status to Sampai', async () => {
            const mockBuffer = Buffer.from('mock image data');
            const createRes = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [authCookie])
                .field('kantor_kas', 'Kas Terkonfirmasi')
                .attach('bukti_kirim', mockBuffer, 'kirim.jpg');
            
            const submissionId = createRes.body.id;

            const confirmRes = await request(app)
                .put(`/api/slip-submissions/${submissionId}/confirm-arrival`)
                .set('Cookie', [authCookie])
                .field('penerima_name', 'Agus Admin')
                .attach('bukti_sampai', mockBuffer, 'sampai.jpg');

            expect(confirmRes.statusCode).toBe(200);
            expect(confirmRes.body).toHaveProperty('success', true);

            // Verify via GET
            const getRes = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [authCookie]);
            
            const updatedItem = getRes.body.find(item => item.id === submissionId);
            expect(updatedItem).toBeDefined();
            expect(updatedItem.status).toBe('Sampai');
            expect(updatedItem.penerima_name).toBe('Agus Admin');
            expect(updatedItem.bukti_sampai_path).not.toBeNull();
        });
    });

    describe('DELETE /api/slip-submissions/:id', () => {
        test('should block non-authorized users (e.g. Teller) from deleting submissions', async () => {
            const resTellerLogin = await request(app)
                .post('/api/auth/login')
                .send({ username: 'teller1', password: 'slip1234' });
            const tellerCookie = resTellerLogin.headers['set-cookie'][0];

            const res = await request(app)
                .delete('/api/slip-submissions/some-random-id')
                .set('Cookie', [tellerCookie]);
            
            expect(res.statusCode).toBe(403);
            expect(res.body.error).toContain('Akses ditolak');
        });

        test('should allow Admin to delete a submission', async () => {
            const mockBuffer = Buffer.from('mock image data');
            const createRes = await request(app)
                .post('/api/slip-submissions')
                .set('Cookie', [authCookie])
                .field('kantor_kas', 'Kas Temporary')
                .attach('bukti_kirim', mockBuffer, 'temp_kirim.jpg');
            
            const submissionId = createRes.body.id;

            const deleteRes = await request(app)
                .delete(`/api/slip-submissions/${submissionId}`)
                .set('Cookie', [authCookie]);

            expect(deleteRes.statusCode).toBe(200);
            expect(deleteRes.body).toHaveProperty('success', true);

            // Verify via GET that it is physically deleted
            const getRes = await request(app)
                .get('/api/slip-submissions')
                .set('Cookie', [authCookie]);
            
            const deletedItem = getRes.body.find(item => item.id === submissionId);
            expect(deletedItem).toBeUndefined();
        });
    });
});
