import { state } from './state.js';
import { formatDate, formatRupiah, escapeHtml, showToast } from './utils.js';
import { showSection } from '../app.js';

export async function fetchPendingApprovalsCount() {
    if (!state.currentUser || (state.currentUser.role !== 'Admin' && state.currentUser.role !== 'Kepala Bidang')) {
        const badge = document.getElementById("approvals-badge");
        if (badge) badge.style.display = "none";
        return;
    }

    try {
        const res = await fetch('/api/approvals/pending').then(r => r.json());
        const count = Array.isArray(res) ? res.length : 0;
        const badge = document.getElementById("approvals-badge");
        const countLabel = document.getElementById("pending-approvals-count-label");

        if (badge) {
            if (count > 0) {
                badge.innerText = count;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }

        if (countLabel) {
            countLabel.innerText = `${count} Menunggu`;
        }
    } catch (e) {
        console.error("Gagal memuat jumlah pengajuan persetujuan:", e);
    }
}

export async function renderApprovalsView() {
    const tbody = document.getElementById("approvals-table-body");
    tbody.innerHTML = "";

    const historyTbody = document.getElementById("approvals-history-table-body");
    if (historyTbody) historyTbody.innerHTML = "";

    const isAdminOrSpv = state.currentUser && (state.currentUser.role === 'Admin' || state.currentUser.role === 'Kepala Bidang');
    const pendingCard = document.getElementById("approvals-pending-card");
    
    if (pendingCard) {
        pendingCard.style.display = isAdminOrSpv ? "block" : "none";
    }

    const historyTitle = document.getElementById("approvals-history-title");
    if (historyTitle) {
        historyTitle.innerText = isAdminOrSpv ? "Riwayat Pengajuan (Semua)" : "Riwayat Pengajuan Saya";
    }

    // 1. Load pending list if Admin/Supervisor
    if (isAdminOrSpv) {
        try {
            const rows = await fetch('/api/approvals/pending').then(r => r.json());
            state.pendingApprovalsDB = rows;

            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Tidak ada pengajuan persetujuan tertunda.</td></tr>';
            } else {
                rows.forEach(r => {
                    const tr = document.createElement("tr");

                    // Build Difference display
                    let diffHtml = "";
                    if (r.request_type === 'DELETE') {
                        diffHtml = `
                            <div class="approval-diff-box">
                                <div style="font-weight:700; color:var(--danger); margin-bottom:4px;">KONFIRMASI HAPUS SLIP</div>
                                <div class="diff-item"><span class="diff-label">Keterangan:</span> ${escapeHtml(r.orig_keterangan)}</div>
                                <div class="diff-item"><span class="diff-label">Nominal:</span> ${formatRupiah(r.orig_nominal_utama, r.orig_nominal_desimal)}</div>
                            </div>
                        `;
                    } else if (r.request_type === 'EDIT') {
                        const data = r.request_data || {};
                        let items = [];

                        if (String(r.orig_debet_rekening) !== String(data.debet_rekening)) {
                            items.push(`<div class="diff-item"><span class="diff-label">Rekening Debet:</span> <span class="diff-old">${escapeHtml(r.orig_debet_rekening)}</span> &rarr; <span class="diff-new">${escapeHtml(data.debet_rekening)}</span></div>`);
                        }
                        if (String(r.orig_debet_nama) !== String(data.debet_nama)) {
                            items.push(`<div class="diff-item"><span class="diff-label">Nama Debet:</span> <span class="diff-old">${escapeHtml(r.orig_debet_nama)}</span> &rarr; <span class="diff-new">${escapeHtml(data.debet_nama)}</span></div>`);
                        }
                        if (String(r.orig_kredit_rekening) !== String(data.kredit_rekening)) {
                            items.push(`<div class="diff-item"><span class="diff-label">Rekening Kredit:</span> <span class="diff-old">${escapeHtml(r.orig_kredit_rekening)}</span> &rarr; <span class="diff-new">${escapeHtml(data.kredit_rekening)}</span></div>`);
                        }
                        if (String(r.orig_kredit_nama) !== String(data.kredit_nama)) {
                            items.push(`<div class="diff-item"><span class="diff-label">Nama Kredit:</span> <span class="diff-old">${escapeHtml(r.orig_kredit_nama)}</span> &rarr; <span class="diff-new">${escapeHtml(data.kredit_nama)}</span></div>`);
                        }

                        const origVal = parseFloat(r.orig_nominal_utama) + (parseInt(r.orig_nominal_desimal) || 0) / 100;
                        const newVal = parseFloat(data.nominal_utama) + (parseInt(data.nominal_desimal) || 0) / 100;
                        if (origVal !== newVal) {
                            items.push(`<div class="diff-item"><span class="diff-label">Nominal:</span> <span class="diff-old">${formatRupiah(r.orig_nominal_utama, r.orig_nominal_desimal)}</span> &rarr; <span class="diff-new">${formatRupiah(data.nominal_utama, data.nominal_desimal)}</span></div>`);
                        }
                        if (String(r.orig_keterangan) !== String(data.keterangan)) {
                            items.push(`<div class="diff-item"><span class="diff-label">Keterangan:</span> <span class="diff-old">${escapeHtml(r.orig_keterangan)}</span> &rarr; <span class="diff-new">${escapeHtml(data.keterangan)}</span></div>`);
                        }

                        diffHtml = `
                            <div class="approval-diff-box">
                                <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">REVISI DATA SLIP</div>
                                ${items.join("")}
                            </div>
                        `;
                    }

                    tr.innerHTML = `
                        <td><strong>${r.ref_no}</strong></td>
                        <td>
                            <span class="badge ${r.request_type === 'DELETE' ? 'badge-danger' : 'badge-info'}">
                                ${r.request_type}
                            </span>
                        </td>
                        <td><code>${r.operator_name}</code></td>
                        <td><small>${formatDate(r.requested_at)}</small></td>
                        <td>${diffHtml}</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-primary btn-approve-req" style="padding:4px 10px; font-size:11px;">Setuju</button>
                                <button class="btn btn-secondary btn-reject-req" style="padding:4px 10px; font-size:11px; color:var(--danger); border-color:var(--danger-light);">Tolak</button>
                            </div>
                        </td>
                    `;

                    tr.querySelector('.btn-approve-req').addEventListener('click', () => approveRequest(r.id, r.ref_no));
                    tr.querySelector('.btn-reject-req').addEventListener('click', () => rejectRequest(r.id, r.ref_no));

                    tbody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error("Gagal merender daftar persetujuan:", e);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger);">Koneksi server gagal memuat data.</td></tr>';
        }
    }

    // 2. Load history list
    if (historyTbody) {
        try {
            const historyRows = await fetch('/api/approvals/history').then(r => r.json());
            if (historyRows.length === 0) {
                historyTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Belum ada riwayat pengajuan.</td></tr>';
            } else {
                historyRows.forEach(r => {
                    const tr = document.createElement("tr");

                    // Status badge class
                    let statusBadgeClass = "badge-warning";
                    if (r.status === 'APPROVED') statusBadgeClass = "badge-success";
                    else if (r.status === 'REJECTED') statusBadgeClass = "badge-danger";

                    // Condensed details display
                    let detailsText = "-";
                    if (r.request_type === 'DELETE') {
                        detailsText = '<span style="color:var(--danger);">Pengajuan Hapus</span>';
                    } else if (r.request_type === 'EDIT') {
                        const data = r.request_data || {};
                        let parts = [];
                        if (data.debet_rekening) parts.push(`Debet: ${escapeHtml(data.debet_rekening)}`);
                        if (data.kredit_rekening) parts.push(`Kredit: ${escapeHtml(data.kredit_rekening)}`);
                        if (data.nominal_utama) parts.push(`Rp ${formatRupiah(data.nominal_utama, data.nominal_desimal).replace("Rp ", "")}`);
                        detailsText = `<div style="font-size:11px; white-space:normal; max-width:240px;">${parts.join(", ")}</div>`;
                    }

                    tr.innerHTML = `
                        <td><strong>${r.ref_no}</strong></td>
                        <td>
                            <span class="badge ${r.request_type === 'DELETE' ? 'badge-danger' : 'badge-info'}">
                                ${r.request_type}
                            </span>
                        </td>
                        <td><code>${r.operator_name}</code></td>
                        <td><small>${formatDate(r.requested_at)}</small></td>
                        <td>${detailsText}</td>
                        <td><span class="badge ${statusBadgeClass}">${r.status}</span></td>
                        <td><code>${r.reviewed_by || '-'}</code></td>
                        <td><small>${escapeHtml(r.reason || '-')}</small></td>
                    `;
                    historyTbody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error("Gagal memuat riwayat pengajuan:", e);
            historyTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--danger);">Koneksi server gagal memuat riwayat.</td></tr>';
        }
    }
}

export async function approveRequest(id, refNo) {
    if (!confirm(`Setujui pengajuan koreksi untuk slip ${refNo}? Tindakan ini akan langsung memperbarui database.`)) return;
    
    const reason = prompt("Masukkan alasan / catatan keputusan (opsional):") || "";

    try {
        const res = await fetch(`/api/approvals/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Pengajuan slip ${refNo} disetujui!`, 'success');
            await showSection("approvals");
            await fetchPendingApprovalsCount();
        } else {
            showToast(res.error || "Gagal menyetujui pengajuan.", "danger");
        }
    } catch (e) {
        showToast("Koneksi server terputus.", "danger");
    }
}

export async function rejectRequest(id, refNo) {
    const reason = prompt("Masukkan alasan penolakan (wajib):");
    if (reason === null) return; // cancel
    if (!reason.trim()) {
        showToast("Alasan penolakan wajib diisi!", "warning");
        return;
    }

    try {
        const res = await fetch(`/api/approvals/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Pengajuan slip ${refNo} telah ditolak.`, 'info');
            await showSection("approvals");
            await fetchPendingApprovalsCount();
        } else {
            showToast(res.error || "Gagal menolak pengajuan.", "danger");
        }
    } catch (e) {
        showToast("Koneksi server terputus.", "danger");
    }
}
