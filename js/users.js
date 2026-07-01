import { state } from './state.js';
import { showToast, escapeHtml, openModal, closeModal, authFetch } from './utils.js';
import { showSection } from '../app.js';
import { fetchNextRef } from './transactions.js';

export function renderUsersView() {
    const listCard = document.getElementById("user-list-card");
    const canSeeUserList = state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang';
    const isAdmin = state.currentRole === 'Admin';

    if (listCard) {
        listCard.style.display = canSeeUserList ? "block" : "none";
    }

    // Hide/show admin specific user management controls
    const addBtn = document.getElementById("btn-add-user");
    const exportBtn = document.getElementById("btn-export-users");
    const importFileInput = document.getElementById("import-users-file");
    const importLabel = importFileInput ? importFileInput.closest("label") : null;
    const csvHint = document.getElementById("csv-import-hint");

    if (addBtn) addBtn.style.display = isAdmin ? "inline-flex" : "none";
    if (exportBtn) exportBtn.style.display = isAdmin ? "inline-flex" : "none";
    if (importLabel) importLabel.style.display = isAdmin ? "inline-flex" : "none";
    if (csvHint) csvHint.style.display = isAdmin ? "block" : "none";

    if (canSeeUserList && state.usersDB) {
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

                const adminActions = isAdmin ? `
                    <button class="btn btn-secondary btn-edit-user" style="padding: 4px 8px; font-size:11px;">
                        <i data-lucide="edit" style="width:11px; height:11px;"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-password-user" style="padding: 4px 8px; font-size:11px; color:var(--warning); border-color:var(--warning-light);">
                        <i data-lucide="key-round" style="width:11px; height:11px;"></i> Password
                    </button>
                ` : '';

                const deleteBtn = isAdmin ? `
                    <button class="btn btn-secondary btn-delete-user" style="padding: 4px 8px; font-size:11px; color:var(--danger); border-color:var(--danger-light);">
                        <i data-lucide="trash-2" style="width:11px; height:11px;"></i> Hapus
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
                        ${adminActions}
                        ${impersonateBtn}
                        ${deleteBtn}
                    </td>
                `;
                if (isAdmin) {
                    tr.querySelector('.btn-edit-user').addEventListener('click', () => openEditUserModal(user.id));
                    tr.querySelector('.btn-password-user').addEventListener('click', () => openResetPasswordModal(user.id, user.nama));
                    tr.querySelector('.btn-delete-user').addEventListener('click', () => deleteUser(user.id, user.nama));
                }
                if (canImpersonate) {
                    tr.querySelector('.btn-impersonate-user').addEventListener('click', () => impersonateUser(user.username));
                }
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

        const idSuffix = `${rc.username}-${rc.slip_type}`;
        const slipTypeLabel = rc.slip_type === 'debet' ? 'Debet' :
                             rc.slip_type === 'kredit' ? 'Kredit' :
                             rc.slip_type === 'tagihan_lainnya' ? 'Tagihan Lainnya' :
                             rc.slip_type === 'kewajiban_lainnya' ? 'Kewajiban Lainnya' : rc.slip_type;

        tr.innerHTML = `
            <td><code>${rc.operator_code || '-'}</code></td>
            <td>
                <strong>${rc.nama || '-'}</strong> 
                <span style="font-size: 11px; color: var(--text-muted);">(${rc.username})</span>
                <span style="font-size: 10px; padding: 2px 6px; background-color: var(--primary-light); color: var(--primary); border-radius: 4px; font-weight: 600; margin-left: 6px; display: inline-block;">
                    ${slipTypeLabel}
                </span>
            </td>
            <td>
                <input type="text" id="rc-prefix-${idSuffix}" value="${escapeHtml(rc.prefix || '')}" 
                    class="form-control" style="width:130px; padding:4px 8px; font-size:12px; display:inline-block;" 
                    placeholder="Prefix..." ${disabledAttr}>
            </td>
            <td>
                <input type="number" id="rc-counter-${idSuffix}" value="${rc.counter}" min="1"
                    class="form-control" style="width:90px; padding:4px 8px; font-size:12px; display:inline-block;" ${disabledAttr}>
            </td>
            <td>
                <code id="rc-example-${idSuffix}" style="font-size:12px; color:var(--primary); font-weight:700;">${exampleRef}</code>
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
            tr.querySelector('.btn-save-counter').addEventListener('click', () => saveRefCounter(rc.username, rc.slip_type));
            tr.querySelector('.btn-reset-counter').addEventListener('click', () => resetRefCounter(rc.username, rc.slip_type));
        }
        tbody.appendChild(tr);

        const prefixEl = document.getElementById(`rc-prefix-${idSuffix}`);
        const counterEl = document.getElementById(`rc-counter-${idSuffix}`);
        const exampleEl = document.getElementById(`rc-example-${idSuffix}`);
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

export async function saveRefCounter(username, slipType) {
    const sType = slipType || 'debet';
    const idSuffix = `${username}-${sType}`;
    const prefixEl = document.getElementById(`rc-prefix-${idSuffix}`);
    const counterEl = document.getElementById(`rc-counter-${idSuffix}`);
    if (!prefixEl || !counterEl) return;

    const payload = {
        counter: parseInt(counterEl.value),
        prefix: prefixEl.value.trim(),
        activeUser: state.currentUser.nama,
        activeRole: state.currentUser.role
    };

    try {
        const res = await fetch(`/api/ref-counters/${encodeURIComponent(username)}/${encodeURIComponent(sType)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast(`Counter ${username} (${sType}) berhasil disimpan!`, "success");
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

export async function resetRefCounter(username, slipType) {
    const sType = slipType || 'debet';
    if (!confirm(`Reset counter nomor referensi ${username} (${sType}) ke angka 1?\nTransaksi berikutnya akan menggunakan nomor 0001.`)) return;

    try {
        const res = await fetch(`/api/ref-counters/${encodeURIComponent(username)}/${encodeURIComponent(sType)}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeUser: state.currentUser.nama, activeRole: state.currentUser.role })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Counter ${username} (${sType}) di-reset ke 1!`, "success");
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

export function exportUsers() {
    if (!state.usersDB || state.usersDB.length === 0) {
        showToast("Tidak ada data pengguna untuk diekspor.", "warning");
        return;
    }
    let csv = "Username,Nama,Bagian,Role,Status,Operator ID\n";
    state.usersDB.forEach(u => {
        const username = `"${(u.username || "").replace(/"/g, '""')}"`;
        const nama = `"${(u.nama || "").replace(/"/g, '""')}"`;
        const bagian = `"${(u.bagian || "").replace(/"/g, '""')}"`;
        const role = `"${(u.role || "").replace(/"/g, '""')}"`;
        const status = `"${(u.status || "").replace(/"/g, '""')}"`;
        const operator_code = `"${(u.operator_code || "").replace(/"/g, '""')}"`;
        csv += `${username},${nama},${bagian},${role},${status},${operator_code}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Pengguna_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${state.usersDB.length} data pengguna diekspor ke CSV.`, "success");
}

export function downloadUserTemplate() {
    const csv = "Username,Nama,Bagian,Role,Status,Operator ID\ncs_budi,Budi Santoso,Customer Service,Customer Service,Aktif,CS\nteller_ani,Ani Wijaya,Teller,Teller,Aktif,TLR\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Template_Pengguna.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importUsers(file) {
    if (!file) return;

    const statusBar = document.getElementById("import-users-status-bar");
    statusBar.style.display = "block";
    statusBar.style.background = "var(--primary-light)";
    statusBar.style.color = "var(--primary)";
    statusBar.innerText = "⏳ Memproses file CSV...";

    try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        if (lines.length === 0) {
            statusBar.style.background = "#fff3cd";
            statusBar.style.color = "#856404";
            statusBar.innerText = "⚠ File CSV kosong atau tidak valid.";
            return;
        }

        const firstLine = lines[0];
        
        // Detect delimiter (support comma and semicolon for Indonesian regional settings in Excel)
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semiCount = (firstLine.match(/;/g) || []).length;
        const delimiter = semiCount > commaCount ? ';' : ',';

        const parseCSVRow = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === delimiter && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const parsedHeader = parseCSVRow(firstLine);
        const headers = parsedHeader.map(h => h.toLowerCase().trim());
        const hasHeader = headers.includes("username") || headers.includes("nama") || headers.includes("bagian") || headers.includes("role") || headers.includes("status") || headers.includes("operator id") || headers.includes("operator_code");
        const dataLines = hasHeader ? lines.slice(1) : lines;

        let usernameIdx = 0;
        let namaIdx = 1;
        let bagianIdx = 2;
        let roleIdx = 3;
        let statusIdx = 4;
        let opCodeIdx = 5;

        if (hasHeader) {
            usernameIdx = headers.indexOf("username");
            namaIdx = headers.indexOf("nama");
            bagianIdx = headers.indexOf("bagian");
            roleIdx = headers.indexOf("role");
            statusIdx = headers.indexOf("status");
            opCodeIdx = headers.findIndex(h => h.includes("operator") || h.includes("id") || h.includes("code"));
        }

        const rows = [];
        dataLines.forEach(line => {
            const parts = parseCSVRow(line);
            if (parts.length === 0) return;

            const username = usernameIdx !== -1 ? (parts[usernameIdx] || "").trim() : "";
            const nama = namaIdx !== -1 ? (parts[namaIdx] || "").trim() : "";
            const bagian = bagianIdx !== -1 ? (parts[bagianIdx] || "").trim() : "";
            const role = roleIdx !== -1 ? (parts[roleIdx] || "").trim() : "";
            const status = (statusIdx !== -1 && parts[statusIdx]) ? parts[statusIdx].trim() : "Aktif";
            const operator_code = opCodeIdx !== -1 ? (parts[opCodeIdx] || "").trim() : "";

            if (username && nama && role && operator_code) {
                rows.push({ username, nama, bagian, role, status, operator_code });
            }
        });

        if (rows.length === 0) {
            statusBar.style.background = "#fff3cd";
            statusBar.style.color = "#856404";
            statusBar.innerText = "⚠ Tidak ada data pengguna valid ditemukan dalam file CSV.";
            return;
        }

        const res = await authFetch('/api/users/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows })
        }).then(r => r.json());

        if (res.success) {
            statusBar.style.background = "#d1e7dd";
            statusBar.style.color = "#0a3622";
            statusBar.innerText = `✅ Import selesai: ${res.imported} pengguna ditambahkan, ${res.skipped} dilewati (duplikat/tidak lengkap).`;
            
            // Clear users database cache and refresh view
            state.usersDB = null;
            await showSection("users");
        } else {
            statusBar.style.background = "#f8d7da";
            statusBar.style.color = "#842029";
            statusBar.innerText = `❌ Gagal: ${res.error}`;
        }
    } catch (e) {
        statusBar.style.background = "#f8d7da";
        statusBar.style.color = "#842029";
        statusBar.innerText = "❌ Terjadi kesalahan saat membaca file atau koneksi server terputus.";
        console.error(e);
    }

    document.getElementById("import-users-file").value = "";
}
