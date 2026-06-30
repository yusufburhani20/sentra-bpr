import { state } from './state.js';
import { showToast, escapeHtml, authFetch } from './utils.js';
import { showSection, refreshData } from '../app.js';

export async function renderKodeBiayaView() {
    const tbody = document.getElementById("codes-table-body");
    tbody.innerHTML = "";

    const checkAll = document.getElementById("check-all-codes");
    const bulkBtn = document.getElementById("btn-bulk-delete-codes");
    if (checkAll) checkAll.checked = false;
    if (bulkBtn) bulkBtn.style.display = "none";

    const searchVal = document.getElementById("codes-search") ? document.getElementById("codes-search").value : "";
    let filtered = [];

    try {
        const res = await authFetch(`/api/cost-codes?page=${state.currentCcPage}&limit=${state.ccLimit}&search=${encodeURIComponent(searchVal)}`).then(r => r.json());
        
        filtered = res.data || [];
        state.totalCcPages = res.totalPages || 1;
        state.totalCcCount = res.totalCount || 0;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Tidak ada kode biaya yang cocok.</td></tr>';
            updateCcPaginationUI(0, 0);
            return;
        }

        filtered.forEach(cc => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="code-checkbox" data-id="${cc.id}">
                </td>
                <td><code>${cc.kode}</code></td>
                <td><strong>${cc.deskripsi}</strong></td>
                <td>
                    <button class="btn btn-secondary btn-edit-cc" style="padding: 4px 8px; font-size:11px;">
                        <i data-lucide="edit" style="width:11px; height:11px;"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-delete-cc" style="padding: 4px 8px; font-size:11px; color:var(--danger); border-color:var(--danger-light);">
                        <i data-lucide="trash-2" style="width:11px; height:11px;"></i> Hapus
                    </button>
                </td>
            `;

            tr.querySelector('.btn-edit-cc').addEventListener('click', () => editCostCode(cc.id));
            tr.querySelector('.btn-delete-cc').addEventListener('click', () => deleteCostCode(cc.id));
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--danger);">Koneksi server gagal memuat data.</td></tr>';
        return;
    }

    // Wire individual checkboxes and Select All
    const checkboxes = tbody.querySelectorAll('.code-checkbox');
    const updateBulkButton = () => {
        const checkedCount = tbody.querySelectorAll('.code-checkbox:checked').length;
        if (bulkBtn) {
            bulkBtn.style.display = checkedCount > 0 ? "inline-flex" : "none";
            bulkBtn.innerHTML = `<i data-lucide="trash-2" style="width:13px; height:13px; margin-right:4px;"></i> Hapus Terpilih (${checkedCount})`;
            if (window.lucide) window.lucide.createIcons();
        }
    };

    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateBulkButton);
    });

    if (checkAll) {
        // Remove previous listener using clone element to prevent multiple binds
        const newCheckAll = checkAll.cloneNode(true);
        checkAll.parentNode.replaceChild(newCheckAll, checkAll);
        
        newCheckAll.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateBulkButton();
        });
    }

    if (window.lucide) window.lucide.createIcons();
    updateCcPaginationUI(filtered.length, state.totalCcCount);
}

export function updateCcPaginationUI(shownCount, totalCount) {
    const startIdx = totalCount === 0 ? 0 : (state.currentCcPage - 1) * state.ccLimit + 1;
    const endIdx = startIdx + shownCount - (shownCount > 0 ? 1 : 0);
    const infoEl = document.getElementById("codes-pagination-info");
    if (infoEl) {
        if (totalCount === 0) {
            infoEl.innerText = "Menampilkan 0 dari 0 kode biaya";
        } else {
            infoEl.innerText = `Menampilkan ${startIdx}-${endIdx} dari ${totalCount} kode biaya`;
        }
    }
    const indicatorEl = document.getElementById("codes-page-indicator");
    if (indicatorEl) {
        indicatorEl.innerText = `Halaman ${state.currentCcPage} / ${state.totalCcPages}`;
    }
    
    const btnFirst = document.getElementById("btn-first-codes");
    const btnPrev = document.getElementById("btn-prev-codes");
    const btnNext = document.getElementById("btn-next-codes");
    const btnLast = document.getElementById("btn-last-codes");
    if (btnFirst) btnFirst.disabled = state.currentCcPage <= 1;
    if (btnPrev) btnPrev.disabled = state.currentCcPage <= 1;
    if (btnNext) btnNext.disabled = state.currentCcPage >= state.totalCcPages;
    if (btnLast) btnLast.disabled = state.currentCcPage >= state.totalCcPages;
}

export function editCostCode(id) {
    const cc = state.costCodesDB.find(c => c.id === id);
    if (!cc) return;

    document.getElementById("code-edit-id").value = cc.id;
    document.getElementById("code-input-kode").value = cc.kode;
    document.getElementById("code-input-desc").value = cc.deskripsi;
    
    document.getElementById("code-form-title").innerText = "Ubah Kode Biaya";
    document.getElementById("btn-cancel-code").style.display = "block";
}

export function resetCostCodeForm() {
    document.getElementById("code-edit-id").value = "";
    document.getElementById("code-input-kode").value = "";
    document.getElementById("code-input-desc").value = "";
    
    document.getElementById("code-form-title").innerText = "Tambah Kode Biaya";
    document.getElementById("btn-cancel-code").style.display = "none";
}

export async function submitCostCode() {
    const id = document.getElementById("code-edit-id").value;
    const kode = document.getElementById("code-input-kode").value;
    const deskripsi = document.getElementById("code-input-desc").value;

    if (!kode || !deskripsi) {
        showToast("Isi kode dan deskripsi terlebih dahulu!", "warning");
        return;
    }

    const payload = {
        kode,
        deskripsi,
        username: state.currentUser.nama,
        userRole: state.currentUser.role
    };

    const url = id ? `/api/cost-codes/${id}` : '/api/cost-codes';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await authFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast("Kode Biaya berhasil disimpan!", "success");
            resetCostCodeForm();
            await showSection("kodebiaya");
        } else {
            showToast(res.error || "Gagal menyimpan.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

export async function deleteCostCode(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus kode biaya ini?")) return;

    const payload = {
        username: state.currentUser.nama,
        userRole: state.currentUser.role
    };

    try {
        const res = await authFetch(`/api/cost-codes/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast("Kode Biaya berhasil dihapus!", "success");
            await showSection("kodebiaya");
        } else {
            showToast(res.error || "Gagal menghapus.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

export async function bulkDeleteSelectedCodes() {
    const checked = document.querySelectorAll('.code-checkbox:checked');
    if (checked.length === 0) return;
    const ids = Array.from(checked).map(cb => cb.getAttribute('data-id'));
    
    if (!confirm(`Apakah Anda yakin ingin menghapus massal ${ids.length} kode biaya terpilih?`)) return;

    try {
        const res = await authFetch('/api/cost-codes/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        }).then(r => r.json());

        if (res.success) {
            showToast(`${res.count} kode biaya berhasil dihapus massal!`, 'success');
            await showSection("kodebiaya");
        } else {
            showToast(res.error || "Gagal menghapus secara massal.", 'danger');
        }
    } catch (e) {
        showToast("Koneksi server terputus.", 'danger');
    }
}

export function exportCostCodes() {
    if (state.costCodesDB.length === 0) {
        showToast("Tidak ada kode biaya untuk diekspor.", "warning");
        return;
    }
    let csv = "Kode Akun,Deskripsi\n";
    state.costCodesDB.forEach(cc => {
        const kode = `"${(cc.kode || "").replace(/"/g, '""')}"`;
        const desc = `"${(cc.deskripsi || "").replace(/"/g, '""')}"`;
        csv += `${kode},${desc}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `KodeBiaya_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${state.costCodesDB.length} kode biaya diekspor ke CSV.`, "success");
}

export function downloadCostCodeTemplate() {
    const csv = "Kode Akun,Deskripsi\n53820,BY PARKIR/TOL\n53821,BY TRANSPORT\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Template_KodeBiaya.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function importCostCodes(file) {
    if (!file) return;

    const statusBar = document.getElementById("import-status-bar");
    statusBar.style.display = "block";
    statusBar.style.background = "var(--primary-light)";
    statusBar.style.color = "var(--primary)";
    statusBar.innerText = "⏳ Memproses file CSV...";

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());

    const dataLines = lines[0].toLowerCase().includes("kode") ? lines.slice(1) : lines;

    const rows = [];
    dataLines.forEach(line => {
        const parts = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
        if (!parts || parts.length < 2) return;
        const kode = parts[0].replace(/^"|"$/g, "").trim();
        const deskripsi = parts[1].replace(/^"|"$/g, "").trim();
        if (kode && deskripsi) rows.push({ kode, deskripsi });
    });

    if (rows.length === 0) {
        statusBar.style.background = "#fff3cd";
        statusBar.style.color = "#856404";
        statusBar.innerText = "⚠ Tidak ada data valid ditemukan dalam file CSV.";
        return;
    }

    try {
        const res = await authFetch('/api/cost-codes/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rows,
                username: state.currentUser.nama,
                userRole: state.currentUser.role
            })
        }).then(r => r.json());

        if (res.success) {
            statusBar.style.background = "#d1e7dd";
            statusBar.style.color = "#0a3622";
            statusBar.innerText = `✅ Import selesai: ${res.imported} data berhasil ditambahkan, ${res.skipped} dilewati (duplikat/kosong).`;
            await showSection("kodebiaya");
        } else {
            statusBar.style.background = "#f8d7da";
            statusBar.style.color = "#842029";
            statusBar.innerText = `❌ Gagal: ${res.error}`;
        }
    } catch (e) {
        statusBar.style.background = "#f8d7da";
        statusBar.style.color = "#842029";
        statusBar.innerText = "❌ Koneksi server terputus.";
    }

    document.getElementById("import-codes-file").value = "";
}

export async function clearAllCostCodes() {
    if (!confirm("Apakah Anda yakin ingin mengosongkan semua data kode biaya? Tindakan ini akan menghapus semua kode biaya dari sistem.")) return;

    try {
        const res = await authFetch('/api/cost-codes/clear-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json());

        if (res.success) {
            showToast("Semua kode biaya berhasil dikosongkan!", "success");
            await showSection("kodebiaya");
        } else {
            showToast(res.error || "Gagal mengosongkan kode biaya.", "danger");
        }
    } catch (e) {
        showToast("Koneksi server terputus.", "danger");
    }
}
