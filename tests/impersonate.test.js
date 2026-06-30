const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Login As (User Impersonation) API Integration Tests', () => {
    let adminCookie = '';
    let tellerCookie = '';

    beforeAll(async () => {
        await app.dbReady;
        // Login as admin
        const resAdmin = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin1', password: 'slip1234' });
        adminCookie = resAdmin.headers['set-cookie'][0];

        // Login as teller
        const resTeller = await request(app)
            .post('/api/auth/login')
            .send({ username: 'teller1', password: 'slip1234' });
        tellerCookie = resTeller.headers['set-cookie'][0];
    });

    afterAll((done) => {
        db.close(done);
    });

    describe('POST /api/auth/impersonate', () => {
        test('should block unauthenticated impersonation requests', async () => {
            const res = await request(app)
                .post('/api/auth/impersonate')
                .send({ username: 'teller1' });
            expect(res.statusCode).toBe(401);
        });

        test('should block non-admin/kepala-bidang impersonation requests', async () => {
            const res = await request(app)
                .post('/api/auth/impersonate')
                .set('Cookie', [tellerCookie])
                .send({ username: 'spv1' });
            expect(res.statusCode).toBe(403);
            expect(res.body.error).toContain('Hanya untuk Admin dan Kepala Bidang');
        });

        test('should reject impersonating non-existent username with 404', async () => {
            const res = await request(app)
                .post('/api/auth/impersonate')
                .set('Cookie', [adminCookie])
                .send({ username: 'nonexistent_user_xyz' });
            expect(res.statusCode).toBe(404);
        });

        test('should reject impersonating self with 400', async () => {
            const res = await request(app)
                .post('/api/auth/impersonate')
                .set('Cookie', [adminCookie])
                .send({ username: 'admin1' });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('ke diri sendiri');
        });

        test('should allow admin to impersonate teller', async () => {
            const res = await request(app)
                .post('/api/auth/impersonate')
                .set('Cookie', [adminCookie])
                .send({ username: 'teller1' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.user).toHaveProperty('username', 'teller1');
            expect(res.body.user).toHaveProperty('impersonator');
            expect(res.body.user.impersonator).toHaveProperty('username', 'admin1');
        });
    });

    describe('POST /api/auth/stop-impersonating', () => {
        test('should revert back to admin session', async () => {
            // 1. Impersonate to get the impersonating cookie
            const impRes = await request(app)
                .post('/api/auth/impersonate')
                .set('Cookie', [adminCookie])
                .send({ username: 'teller1' });
            
            const impCookie = impRes.headers['set-cookie'][0];

            // 2. Stop impersonating using the impersonation cookie
            const stopRes = await request(app)
                .post('/api/auth/stop-impersonating')
                .set('Cookie', [impCookie]);

            expect(stopRes.statusCode).toBe(200);
            expect(stopRes.body).toHaveProperty('success', true);
            expect(stopRes.body.user).toHaveProperty('username', 'admin1');
            expect(stopRes.body.user).not.toHaveProperty('impersonator');
        });

        test('should reject stopping impersonation if not impersonated', async () => {
            const res = await request(app)
                .post('/api/auth/stop-impersonating')
                .set('Cookie', [adminCookie]);
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('Tidak sedang menggunakan fitur Login As');
        });
    });
});
