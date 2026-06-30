import { state } from './state.js';
import { showToast, escapeHtml, openModal, closeModal, authFetch } from './utils.js';
import { showSection } from '../app.js';
import { fetchNextRef } from './transactions.js';

export function renderUsersView() {
    const listCard = document.getElementById("user-list-card");
    const isAdmin = state.currentRole === 'Admin';

    if (listCard) {
        listCard.style.display = isAdmin ? "block" : "none";
    }

    if (isAdmin && state.usersDB) {
        const tbody = document.getElementById("user-table-body");
        if (tbody) {
            tbody.innerHTML = "";

            state.usersDB.forEach(user => {
                const isSelf = state.currentUser && state.currentUser.id === user.id;
                const canImpersonate = (state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang') && !isSelf && user.status === 'Aktif';

                const impersonateBtn = canImpersonate ? `
                    <button class="btn btn-secondary btn-impersonate-user" style="padding: 4px 8px; font-size:11px; color:var(--primary); border-color:var(--primary-light);" title="Masuk sebagai user ini">
                        <i data-lucide="user-check" style="width:11px; height:11px;"></i> Login As
                    </button>
                ` : '';

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${user.nama}</strong></td>
                    <td><code>${user.username}</code></td>
                    <td>${user.bagian}</td>
                    <td><span class="badge badge-info">${user.role}</span></td>
                    <td><span class="badge badge-primary">${user.operator_code || '-'}</span></td>
                    <td><span class="badge ${user.status === 'Aktif' ? 'badge-success' : 'badge-danger'}">${user.status}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-edit-user" style="padding: 4px 8px; font-size:11px;">
                            <i data-lucide="edit" style="width:11px; height:11px;"></i> Edit
                        </button>
                        <button class="btn btn-secondary btn-password-user" style="padding: 4px 8px; font-size:11px; color:var(--warning); border-color:var(--warning-light);">
                            <i data-lucide="key-round" style="width:11px; height:11px;"></i> Password
                        </button>
                        ${impersonateBtn}
                        <button class="btn btn-secondary btn-delete-user" style="padding: 4px 8px; font-size:11px; color:var(--danger); border-color:var(--danger-light);">
                            <i data-lucide="trash-2" style="width:11px; height:11px;"></i> Hapus
                        </button>
                    </td>
                `;
                tr.querySelector('.btn-edit-user').addEventListener('click', () => openEditUserModal(user.id));
                tr.querySelector('.btn-password-user').addEventListener('click', () => openResetPasswordModal(user.id, user.nama));
                if (canImpersonate) {
                    tr.querySelector('.btn-impersonate-user').addEventListener('click', () => impersonateUser(user.username));
                }
                tr.querySelector('.btn-delete-user').addEventListener('click', () => deleteUser(user.id, user.nama));
                tbody.appendChild(tr);
            });
        }
    }

    renderRefCountersTable();
    if (window.lucide) window.lucide.createIcons();
}

export function openEditUserModal(id) {
    const user = state.usersDB.find(u => u.id === id);
    if (!user) return;

    document.getElementById("user-edit-id").value = user.id;
    document.getElementById("user-nama").value = user.nama;
    document.getElementById("user-username").value = user.username;
    document.getElementById("user-bagian").value = user.bagian;
    document.getElementById("user-role").value = user.role;
    document.getElementById("user-operator-code").value = user.operator_code || "";
    document.getElementById("user-status").value = user.status;

    document.getElementById("user-modal-title").innerText = "Edit Pengguna";
    openModal("modal-user");
}

export function openAddUserModal() {
    document.getElementById("user-edit-id").value = "";
    document.getElementById("user-nama").value = "";
    document.getElementById("user-username").value = "";
    document.getElementById("user-bagian").value = "Teller";
    document.getElementById("user-role").value = "Teller";
    document.getElementById("user-operator-code").value = "";
    document.getElementById("user-status").value = "Aktif";

    document.getElementById("user-modal-title").innerText = "Tambah Pengguna Baru";
    openModal("modal-user");
}

export async function submitUser() {
    const id = document.getElementById("user-edit-id").value;
    const nama = document.getElementById("user-nama").value;
    const username = document.getElementById("user-username").value;
    const bagian = document.getElementById("user-bagian").value;
    const role = document.getElementById("user-role").value;
    const operator_code = document.getElementById("user-operator-code").value;
    const status = document.getElementById("user-status").value;

    if (!nama || !username || !operator_code) {
        showToast("Isi nama, username, dan operator ID!", "warning");
        return;
    }

    const payload = {
        username,
        nama,
        bagian,
        role,
        status,
        operator_code,
        activeUser: state.currentUser.nama,
        activeRole: state.currentUser.role
    };

    const url = id ? `/api/users/${id}` : '/api/users';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast("Data pengguna disimpan!", "success");
            closeModal("modal-user");
            await showSection("users");
        } else {
            showToast(res.error || "Gagal menyimpan user.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

export async function deleteUser(id, nama) {
    if (!confirm(`Hapus pengguna "${nama}" secara permanen?\nData counter referensi milik pengguna ini juga akan dihapus.`)) return;

    try {
        const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeUser: state.currentUser.nama, activeRole: state.currentUser.role })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Pengguna "${nama}" berhasil dihapus.`, "success");
            await showSection("users");
        } else {
            showToast(res.error || "Gagal menghapus pengguna.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

export function renderRefCountersTable() {
    const tbody = document.getElementById("ref-counter-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (state.refCountersDB.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Belum ada data counter.</td></tr>';
        return;
    }

    state.refCountersDB.forEach(rc => {
        const exampleRef = `${rc.prefix || rc.operator_code || ""}${String(rc.counter).padStart(3, '0')}`;
        const tr = document.createElement("tr");

        const isAllowedToEdit = (state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang') || (state.currentUser && state.currentUser.username === rc.username);
        const disabledAttr = isAllowedToEdit ? "" : "disabled";
        const pointerEvents = isAllowedToEdit ? "" : "pointer-events:none; opacity:0.6;";

        tr.innerHTML = `
            <td><code>${rc.operator_code || '-'}</code></td>
            <td><strong>${rc.nama || '-'}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${rc.username})</span></td>
            <td>
                <input type="text" id="rc-prefix-${rc.username}" value="${escapeHtml(rc.prefix || '')}" 
                    class="form-control" style="width:130px; padding:4px 8px; font-size:12px; display:inline-block;" 
                    placeholder="Prefix..." ${disabledAttr}>
            </td>
            <td>
                <input type="number" id="rc-counter-${rc.username}" value="${rc.counter}" min="1"
                    class="form-control" style="width:90px; padding:4px 8px; font-size:12px; display:inline-block;" ${disabledAttr}>
            </td>
            <td>
                <code id="rc-example-${rc.username}" style="font-size:12px; color:var(--primary); font-weight:700;">${exampleRef}</code>
            </td>
            <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-primary btn-save-counter" style="padding:3px 10px; font-size:11px; ${pointerEvents}" ${disabledAttr}>
                    <i data-lucide="save" style="width:11px; height:11px;"></i> Simpan
                </button>
                <button class="btn btn-secondary btn-reset-counter" style="padding:3px 10px; font-size:11px; color:var(--danger); border-color:var(--danger-light); ${pointerEvents}" ${disabledAttr}>
                    <i data-lucide="rotate-ccw" style="width:11px; height:11px;"></i> Reset ke 1
                </button>
            </td>
        `;
        
        if (isAllowedToEdit) {
            tr.querySelector('.btn-save-counter').addEventListener('click', () => saveRefCounter(rc.username));
            tr.querySelector('.btn-reset-counter').addEventListener('click', () => resetRefCounter(rc.username));
        }
        tbody.appendChild(tr);

        const prefixEl = document.getElementById(`rc-prefix-${rc.username}`);
        const counterEl = document.getElementById(`rc-counter-${rc.username}`);
        const exampleEl = document.getElementById(`rc-example-${rc.username}`);
        if (prefixEl && counterEl && exampleEl) {
            const updatePreview = () => {
                const p = prefixEl.value || rc.operator_code || "";
                const c = parseInt(counterEl.value) || 1;
                exampleEl.textContent = `${p}${String(c).padStart(3, '0')}`;
            };
            prefixEl.addEventListener('input', updatePreview);
            counterEl.addEventListener('input', updatePreview);
        }
    });
}

export async function saveRefCounter(username) {
    const prefixEl = document.getElementById(`rc-prefix-${username}`);
    const counterEl = document.getElementById(`rc-counter-${username}`);
    if (!prefixEl || !counterEl) return;

    const payload = {
        counter: parseInt(counterEl.value),
        prefix: prefixEl.value.trim(),
        activeUser: state.currentUser.nama,
        activeRole: state.currentUser.role
    };

    try {
        const res = await fetch(`/api/ref-counters/${encodeURIComponent(username)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast(`Counter ${username} berhasil disimpan!`, "success");
            await showSection("users"); // will automatically fetch new ref data and render tables
            if (state.currentUser && state.currentUser.username === username) {
                await fetchNextRef();
            }
        } else {
            showToast(res.error || "Gagal menyimpan counter.", "danger");
        }
    } catch (e) {
        showToast("Koneksi server terputus.", "danger");
    }
}

export async function resetRefCounter(username) {
    if (!confirm(`Reset counter nomor referensi ${username} ke angka 1?\nTransaksi berikutnya akan menggunakan nomor 0001.`)) return;

    try {
        const res = await fetch(`/api/ref-counters/${encodeURIComponent(username)}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeUser: state.currentUser.nama, activeRole: state.currentUser.role })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Counter ${username} di-reset ke 1!`, "success");
            await showSection("users");
            if (state.currentUser && state.currentUser.username === username) {
                await fetchNextRef();
            }
        } else {
            showToast(res.error || "Gagal reset counter.", "danger");
        }
    } catch (e) {
        showToast("Koneksi server terputus.", "danger");
    }
}

export function openResetPasswordModal(userId, userName) {
    document.getElementById('rp-user-id').value = userId;
    document.getElementById('rp-user-name').textContent = userName;
    document.getElementById('rp-new-password').value = '';
    document.getElementById('rp-error').style.display = 'none';
    openModal('modal-reset-password');
    if (window.lucide) window.lucide.createIcons();
}

export async function submitResetPassword() {
    const id = document.getElementById('rp-user-id').value;
    const newPw = document.getElementById('rp-new-password').value;
    const errEl = document.getElementById('rp-error');
    errEl.style.display = 'none';

    try {
        const res = await authFetch(`/api/users/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword: newPw })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Password direset ke: ${data.newPassword}`, 'success');
            closeModal('modal-reset-password');
        } else {
            errEl.textContent = data.error || 'Gagal reset password.';
            errEl.style.display = 'block';
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            errEl.textContent = 'Koneksi server terputus.';
            errEl.style.display = 'block';
        }
    }
}

export async function impersonateUser(username) {
    if (!confirm(`Apakah Anda yakin ingin masuk sebagai user "${username}"?`)) return;

    try {
        const res = await authFetch('/api/auth/impersonate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Berhasil masuk sebagai ${username}!`, "success");
            window.location.reload();
        } else {
            showToast(res.error || "Gagal melakukan Login As.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}
