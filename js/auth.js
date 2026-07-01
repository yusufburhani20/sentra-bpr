import { state } from './state.js';
import { showToast, closeModal, authFetch } from './utils.js';
import { initApp } from '../app.js';

export function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function hideLoginScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
}

export async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401 || res.status === 403) {
            showLoginScreen();
            return false;
        }
        const data = await res.json();
        if (data.user) {
            state.currentUser = data.user;
            state.currentRole = data.user.role;
            return true;
        }
        showLoginScreen();
        return false;
    } catch (e) {
        showLoginScreen();
        return false;
    }
}

export async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-circle"></i> Memproses...';
    if (window.lucide) window.lucide.createIcons();

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            state.currentUser = data.user;
            state.currentRole = data.user.role;
            hideLoginScreen();
            await initApp();
        } else {
            errEl.textContent = data.error || 'Login gagal. Periksa username dan password.';
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = 'Koneksi ke server gagal. Pastikan server berjalan.';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in"></i> Masuk ke Sistem';
        if (window.lucide) window.lucide.createIcons();
    }
}

export async function logout() {
    if (state.currentUser && state.currentUser.impersonator) {
        if (!confirm('Anda sedang mengakses sebagai user lain. Kembali ke akun asli Anda?')) return;
        try {
            const res = await authFetch('/api/auth/stop-impersonating', {
                method: 'POST'
            }).then(r => r.json());

            if (res.success) {
                showToast("Kembali ke akun asli...", "success");
                window.location.reload();
            } else {
                showToast(res.error || "Gagal kembali ke akun asli.", "danger");
            }
        } catch (e) {
            console.error(e);
            showToast("Koneksi server terputus.", "danger");
        }
        return;
    }

    if (!confirm('Apakah Anda yakin ingin keluar dari sistem?')) return;
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    state.currentUser = null;
    state.currentRole = '';
    state.activeNextRef = '';
    showLoginScreen();
    // Reset login form
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
}

export async function changePassword() {
    const current = document.getElementById('cp-current').value;
    const newPw = document.getElementById('cp-new').value;
    const confirmVal = document.getElementById('cp-confirm').value;
    const errEl = document.getElementById('cp-error');

    errEl.style.display = 'none';

    if (!current || !newPw || !confirmVal) {
        errEl.textContent = 'Semua field wajib diisi.';
        errEl.style.display = 'block';
        return;
    }
    if (newPw.length < 6) {
        errEl.textContent = 'Password baru minimal 6 karakter.';
        errEl.style.display = 'block';
        return;
    }
    if (newPw !== confirmVal) {
        errEl.textContent = 'Konfirmasi password tidak cocok.';
        errEl.style.display = 'block';
        return;
    }

    try {
        const res = await authFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: current, newPassword: newPw })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast('Password berhasil diganti!', 'success');
            closeModal('modal-change-password');
            document.getElementById('cp-current').value = '';
            document.getElementById('cp-new').value = '';
            document.getElementById('cp-confirm').value = '';
        } else {
            errEl.textContent = data.error || 'Gagal mengganti password.';
            errEl.style.display = 'block';
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            errEl.textContent = 'Koneksi server terputus.';
            errEl.style.display = 'block';
        }
    }
}
