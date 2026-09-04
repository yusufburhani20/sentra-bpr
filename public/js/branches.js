import { showToast, openModal, closeModal, authFetch } from './utils.js';

let branchesData = [];

export async function renderBranchesView() {
    await fetchBranches();
    renderBranchesTable();
    setupBranchEvents();
}

async function fetchBranches() {
    try {
        const res = await authFetch('/api/branches');
        const data = await res.json();
        if (res.ok) {
            branchesData = data;
        } else {
            showToast(data.error || "Gagal memuat cabang", "danger");
        }
    } catch (e) {
        showToast("Error jaringan", "danger");
    }
}

function renderBranchesTable() {
    const tbody = document.getElementById("branches-table-body");
    if (!tbody) return;

    if (branchesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Belum ada data cabang.</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    branchesData.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><code>${b.id}</code></td>
            <td><strong>${b.name}</strong></td>
            <td><span class="badge ${b.type === 'Pusat' ? 'badge-primary' : 'badge-secondary'}">${b.type}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-secondary btn-edit-branch" data-id="${b.id}" style="padding:4px 8px; font-size:11px; margin-right:4px;">Edit</button>
                <button class="btn btn-danger btn-delete-branch" data-id="${b.id}" style="padding:4px 8px; font-size:11px;">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit-branch').forEach(btn => {
        btn.addEventListener('click', (e) => openEditModal(e.target.dataset.id));
    });
    document.querySelectorAll('.btn-delete-branch').forEach(btn => {
        btn.addEventListener('click', (e) => deleteBranch(e.target.dataset.id));
    });
}

function setupBranchEvents() {
    const btnAdd = document.getElementById("btn-add-branch");
    if (btnAdd) {
        // Prevent duplicate listener if called multiple times
        const newBtn = btnAdd.cloneNode(true);
        btnAdd.parentNode.replaceChild(newBtn, btnAdd);
        newBtn.addEventListener("click", async () => {
            document.getElementById("form-branch").reset();
            document.getElementById("branch-id").value = "";
            document.getElementById("modal-branch-title").innerText = "Tambah Cabang";
            
            document.getElementById("branch-admin-exists-section").style.display = "none";
            document.getElementById("branch-admin-new-section").style.display = "block";
            document.querySelector('input[name="admin_mode"][value="none"]').checked = true;
            document.getElementById('mode-select-admin').style.display = 'none';
            document.getElementById('mode-create-admin').style.display = 'none';
            
            // Fetch admins
            const select = document.getElementById("admin-select");
            select.innerHTML = '<option value="">-- Memuat Data Admin... --</option>';
            try {
                const res = await authFetch('/api/users');
                const users = await res.json();
                availableAdmins = users.filter(u => u.role === 'Admin');
                
                select.innerHTML = '<option value="">-- Pilih Admin --</option>';
                availableAdmins.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = `${u.nama} (${u.username})`;
                    select.appendChild(opt);
                });
            } catch (e) {
                select.innerHTML = '<option value="">Gagal memuat admin</option>';
            }

            openModal("modal-branch");
        });
    }

    const form = document.getElementById("form-branch");
    if (form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("branch-id").value;
            const name = document.getElementById("branch-name").value.trim();
            const type = document.getElementById("branch-type").value;
            
            const payload = { name, type };

            // Cek status admin
            const newSection = document.getElementById("branch-admin-new-section");
            const existSection = document.getElementById("branch-admin-exists-section");
            
            if (existSection.style.display !== 'none') {
                // Do nothing to admin (or it was removed via button which sets remove_admin flag)
            } else if (newSection.style.display !== 'none') {
                const mode = document.querySelector('input[name="admin_mode"]:checked').value;
                if (mode === 'select') {
                    const selectedId = document.getElementById("admin-select").value;
                    if (selectedId) payload.admin_id = selectedId;
                } else if (mode === 'create') {
                    const username = document.getElementById("admin-username").value;
                    const nama = document.getElementById("admin-nama").value;
                    if (username && nama) {
                        try {
                            const res = await authFetch('/api/users', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    username, nama, bagian: "Manajemen", role: "Admin", status: "Aktif", operator_code: ""
                                })
                            });
                            const newUser = await res.json();
                            if (res.ok) {
                                payload.admin_id = newUser.user ? newUser.user.id : (newUser.id || null);
                            }
                        } catch (err) {
                            console.error("Gagal membuat admin", err);
                        }
                    }
                }
            }

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/branches/${id}` : '/api/branches';

            try {
                const res = await authFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (res.ok) {
                    showToast("Data cabang berhasil disimpan", "success");
                    closeModal("modal-branch");
                    renderBranchesView();
                } else {
                    showToast(data.error || "Gagal menyimpan cabang", "danger");
                }
            } catch (err) {
                showToast("Error jaringan", "danger");
            }
        });
    }

    const btnRemoveAdmin = document.getElementById("btn-remove-branch-admin");
    if (btnRemoveAdmin) {
        btnRemoveAdmin.addEventListener("click", async () => {
            const id = document.getElementById("branch-id").value;
            if (!id) return;
            if (!confirm("Hapus admin dari cabang ini?")) return;
            try {
                const res = await authFetch(`/api/branches/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ remove_admin: true, name: document.getElementById("branch-name").value, type: document.getElementById("branch-type").value })
                });
                if (res.ok) {
                    showToast("Admin dihapus dari cabang", "success");
                    closeModal("modal-branch");
                    renderBranchesView();
                }
            } catch (e) {
                showToast("Error", "danger");
            }
        });
    }
}

let availableAdmins = [];

async function openEditModal(id) {
    const b = branchesData.find(x => x.id === id);
    if (!b) return;
    
    document.getElementById("branch-id").value = b.id;
    document.getElementById("branch-name").value = b.name;
    document.getElementById("branch-type").value = b.type;
    document.getElementById("modal-branch-title").innerText = "Edit Cabang";

    const newSection = document.getElementById("branch-admin-new-section");
    const existSection = document.getElementById("branch-admin-exists-section");
    
    if (b.admin_id) {
        existSection.style.display = "block";
        newSection.style.display = "none";
        document.getElementById("branch-admin-name-display").innerText = `${b.admin_name} (${b.admin_username})`;
        document.getElementById("branch-current-admin-id").value = b.admin_id;
    } else {
        existSection.style.display = "none";
        newSection.style.display = "block";
        document.querySelector('input[name="admin_mode"][value="none"]').checked = true;
        document.getElementById('mode-select-admin').style.display = 'none';
        document.getElementById('mode-create-admin').style.display = 'none';
        
        // Fetch admins
        const select = document.getElementById("admin-select");
        select.innerHTML = '<option value="">-- Memuat Data Admin... --</option>';
        try {
            const res = await authFetch('/api/users');
            const users = await res.json();
            availableAdmins = users.filter(u => u.role === 'Admin');
            
            select.innerHTML = '<option value="">-- Pilih Admin --</option>';
            availableAdmins.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.nama} (${u.username})`;
                select.appendChild(opt);
            });
        } catch (e) {
            select.innerHTML = '<option value="">Gagal memuat admin</option>';
        }
    }

    openModal("modal-branch");
}

async function deleteBranch(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus cabang ini? Penghapusan akan gagal jika masih ada user terkait.")) return;
    
    try {
        const res = await authFetch(`/api/branches/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (res.ok) {
            showToast("Cabang berhasil dihapus", "success");
            renderBranchesView();
        } else {
            showToast(data.error || "Gagal menghapus cabang", "danger");
        }
    } catch (e) {
        showToast("Error jaringan", "danger");
    }
}
