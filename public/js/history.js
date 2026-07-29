import { state } from './state.js';
import { formatDate, formatRupiah, escapeHtml, showToast, openModal, closeModal, authFetch, terbilang } from './utils.js';
import { showSection } from '../app.js';

let lastRiwayatDataStr = null;

export function renderRiwayatView() {
    const filterSelect = document.getElementById("riwayat-filter-code");
    if (filterSelect && filterSelect.children.length <= 1) {
        state.costCodesDB.forEach(cc => {
            const opt = document.createElement("option");
            opt.value = cc.kode;
            opt.innerText = cc.kode;
            filterSelect.appendChild(opt);
        });
    }

    const filtered = state.transactionsDB;
    const dataStr = JSON.stringify({ items: filtered, page: state.currentTxPage, total: state.totalTxCount });
    if (dataStr === lastRiwayatDataStr && document.getElementById("riwayat-table-body").children.length > 0) return;
    lastRiwayatDataStr = dataStr;

    const tbody = document.getElementById("riwayat-table-body");
    if (tbody) tbody.innerHTML = "";

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Tidak ada riwayat transaksi yang cocok.</td></tr>';
        updateTxPaginationUI(0, 0);
        return;
    }

    filtered.forEach(tx => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${tx.ref_no}</strong></td>
            <td><small>${formatDate(tx.tanggal)}</small></td>
            <td><code>${tx.operator_code}</code></td>
            <td><span class="badge badge-info" title="${escapeHtml(tx.debet_nama || '')}">${tx.debet_rekening || tx.cost_code || '-'}</span></td>
            <td><span class="badge badge-secondary" title="${escapeHtml(tx.kredit_nama || '')}">${tx.kredit_rekening || tx.rekening || '-'}</span></td>
            <td><strong>${formatRupiah(tx.nominal_utama, tx.nominal_desimal)}</strong></td>
            <td>
                <button class="btn btn-secondary btn-view-tx" style="padding: 4px 8px; font-size:11px;">
                    <i data-lucide="eye" style="width:12px; height:12px;"></i> Kelola / Cetak
                </button>
            </td>
        `;
        tr.querySelector('.btn-view-tx').addEventListener('click', () => viewSlipDetails(tx.id));
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
    updateTxPaginationUI(filtered.length, state.totalTxCount);
}

export function updateTxPaginationUI(shownCount, totalCount) {
    const startIdx = totalCount === 0 ? 0 : (state.currentTxPage - 1) * state.paginationLimit + 1;
    const endIdx = startIdx + shownCount - (shownCount > 0 ? 1 : 0);
    const infoEl = document.getElementById("riwayat-pagination-info");
    if (infoEl) {
        if (totalCount === 0) {
            infoEl.innerText = "Menampilkan 0 dari 0 transaksi";
        } else {
            infoEl.innerText = `Menampilkan ${startIdx}-${endIdx} dari ${totalCount} transaksi`;
        }
    }
    const indicatorEl = document.getElementById("riwayat-page-indicator");
    if (indicatorEl) {
        indicatorEl.innerText = `Halaman ${state.currentTxPage} / ${state.totalTxPages}`;
    }
    
    const btnFirst = document.getElementById("btn-first-riwayat");
    const btnPrev = document.getElementById("btn-prev-riwayat");
    const btnNext = document.getElementById("btn-next-riwayat");
    const btnLast = document.getElementById("btn-last-riwayat");
    if (btnFirst) btnFirst.disabled = state.currentTxPage <= 1;
    if (btnPrev) btnPrev.disabled = state.currentTxPage <= 1;
    if (btnNext) btnNext.disabled = state.currentTxPage >= state.totalTxPages;
    if (btnLast) btnLast.disabled = state.currentTxPage >= state.totalTxPages;
}

export async function exportRiwayatToCSV() {
    const searchVal = document.getElementById("riwayat-search").value.toLowerCase();
    const codeVal = document.getElementById("riwayat-filter-code").value;
    const dateVal = document.getElementById("riwayat-filter-month").value;
    
    try {
        showToast("Menyiapkan data ekspor...", "info");
        const res = await fetch(`/api/transactions?page=1&limit=1000000&search=${encodeURIComponent(searchVal)}&code=${encodeURIComponent(codeVal)}&date=${encodeURIComponent(dateVal)}`).then(r => r.json());
        const exportData = res.data || [];
        
        if (exportData.length === 0) {
            showToast("Tidak ada data untuk diekspor.", "warning");
            return;
        }

        let csv = 'No. Referensi,Tanggal,Operator ID,Debet Nama,Debet Rekening,Kredit Nama,Kredit Rekening,Jenis,Nominal Utama,Nominal Desimal,Terbilang,Keterangan\n';
        exportData.forEach(tx => {
            csv += `"${tx.ref_no}","${tx.tanggal}","${tx.operator_code}","${(tx.debet_nama || tx.cost_code || '').replace(/"/g, '""')}","${tx.debet_rekening || tx.cost_code || ''}","${(tx.kredit_nama || 'REKENING UTAMA KAS').replace(/"/g, '""')}","${tx.kredit_rekening || tx.rekening || ''}","${tx.jenis_transaksi}",${tx.nominal_utama},${tx.nominal_desimal},"${tx.terbilang}","${tx.keterangan.replace(/"/g, '""')}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Rekap_Voucher_Slip_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Data riwayat diekspor ke CSV.", "success");
    } catch (e) {
        console.error(e);
        showToast("Gagal mengambil data ekspor dari server.", "danger");
    }
}

export function viewSlipDetails(id) {
    const tx = state.transactionsDB.find(t => t.id === id);
    if (!tx) return;

    const [year, month, dayT] = tx.tanggal.split('T')[0].split('-');
    const formattedDate = `${dayT}/${month}/${year}`;

    const slipType = (tx.jenis_transaksi || "debet").toLowerCase();
    let slipTitle = "slip debet";
    let bandBgColor = "#ffcc00";
    let bandBorderBottom = "2px solid #eab308";

    if (slipType === 'kredit') {
        slipTitle = "slip kredit";
        bandBgColor = "#10b981";
        bandBorderBottom = "2px solid #059669";
    } else if (slipType === 'tagihan_lainnya') {
        slipTitle = "slip tagihan lainnya";
        bandBgColor = "#3b82f6";
        bandBorderBottom = "2px solid #2563eb";
    } else if (slipType === 'kewajiban_lainnya') {
        slipTitle = "slip kewajiban lainnya";
        bandBgColor = "#8b5cf6";
        bandBorderBottom = "2px solid #7c3aed";
    } else if (slipType === 'umb') {
        slipTitle = "slip uang muka biaya (umb)";
        bandBgColor = "#f97316";
        bandBorderBottom = "2px solid #ea580c";
    }

    const modalContainer = document.getElementById("modal-print-container");
    modalContainer.innerHTML = `
        <div class="voucher-slip" id="reprint-voucher-slip">
            <!-- Top Band -->
            <div class="slip-top-band" style="background-color: ${bandBgColor}; border-bottom: ${bandBorderBottom};">
                <div class="logo-wrap">
                    <span class="logo-text-large">bank <strong>nusamba</strong></span>
                    <span class="logo-text-sub">bpr bank nusamba jabar</span>
                </div>
                <div class="slip-type-title">${slipTitle}</div>
            </div>

            <!-- Metadata validasi / tanggal -->
            <div class="slip-meta-row">
                <div class="meta-item-validasi">
                    <span class="lbl">Validasi :</span>
                    <span class="val">${tx.ref_no}</span>
                </div>
                <div class="meta-item-tanggal">
                    <span class="lbl">Tanggal :</span>
                    <span class="val">${formattedDate}</span>
                </div>
            </div>

            <!-- Box Debet & Perkiraan Lawan -->
            <div class="slip-boxes-row">
                <div class="slip-box-container debet-box">
                    <div class="box-title">DEBET</div>
                    <div class="box-inner">
                        <div class="box-label-desc">Nama B.P./B.B. & No. P/K</div>
                        <div class="box-value-rekening">${escapeHtml(tx.debet_rekening || tx.cost_code || '-')}</div>
                        <div class="box-value-nama">${escapeHtml(tx.debet_nama || tx.cost_code || '-')}</div>
                    </div>
                </div>
                <div class="slip-box-container kredit-box">
                    <div class="box-title">Perkiraan Lawan</div>
                    <div class="box-inner">
                        <div class="box-label-desc">Nama B.P./B.B. & No. P/K</div>
                        <div class="box-value-rekening">${escapeHtml(tx.kredit_rekening || tx.rekening || '-')}</div>
                        <div class="box-value-nama">${escapeHtml(tx.kredit_nama || tx.jenis_transaksi || '-')}</div>
                    </div>
                </div>
            </div>

            <!-- Detail Keuangan -->
            <div class="slip-details-section">
                <div class="detail-row row-rp">
                    <span class="lbl">Rp.</span>
                    <div class="rp-box-val">
                        <span class="val">${formatRupiah(tx.nominal_utama, tx.nominal_desimal).replace("Rp ", "")}</span>
                    </div>
                </div>
                <div class="detail-row row-terbilang">
                    <span class="lbl">Terbilang :</span>
                    <span class="val">${tx.terbilang}</span>
                </div>
                <div class="detail-row row-keterangan">
                    <span class="lbl">Keterangan :</span>
                    <span class="val">${escapeHtml(tx.keterangan)}</span>
                </div>
            </div>
        </div>
    `;

    // Dynamic addition of Governance edit/delete buttons based on user role (Teller/SDM/Kas)
    const requestActionsWrap = document.createElement("div");
    requestActionsWrap.style.display = "flex";
    requestActionsWrap.style.gap = "8px";
    requestActionsWrap.style.marginTop = "14px";
    requestActionsWrap.style.justifyContent = "flex-start";

    const isAdmin = state.currentRole === 'Admin';
    
    if (isAdmin) {
        // Direct edit/delete for Admin
        requestActionsWrap.innerHTML = `
            <button class="btn btn-primary" id="btn-modal-direct-edit" style="padding:6px 14px; font-size:12px;">
                <i data-lucide="edit-3" style="width:13px; height:13px; margin-right:4px;"></i> Edit Transaksi
            </button>
            <button class="btn btn-secondary" id="btn-modal-direct-delete" style="padding:6px 14px; font-size:12px; color:var(--danger); border-color:var(--danger-light);">
                <i data-lucide="trash-2" style="width:13px; height:13px; margin-right:4px;"></i> Hapus Transaksi
            </button>
        `;
        modalContainer.appendChild(requestActionsWrap);

        document.getElementById("btn-modal-direct-edit").addEventListener('click', () => {
            closeModal("modal-detail-slip");
            
            // Adjust modal title and submit button label for Admin direct edit
            const titleEl = document.querySelector("#modal-request-edit .modal-title");
            if (titleEl) titleEl.innerHTML = `<i data-lucide="edit-3"></i> Edit Transaksi Langsung`;
            const submitBtn = document.getElementById("btn-submit-request-edit");
            if (submitBtn) submitBtn.innerText = "Simpan Perubahan";
            
            openRequestEditModal(tx);
        });

        document.getElementById("btn-modal-direct-delete").addEventListener('click', () => {
            if (confirm(`Apakah Anda yakin ingin menghapus langsung slip ${tx.ref_no}? Tindakan ini tidak dapat dibatalkan.`)) {
                deleteTransactionDirectly(tx.id, tx.ref_no);
            }
        });
    } else {
        // Operators and Supervisors can request edit/delete
        requestActionsWrap.innerHTML = `
            <button class="btn btn-primary" id="btn-modal-req-edit" style="padding:6px 14px; font-size:12px;">
                <i data-lucide="edit-3" style="width:13px; height:13px; margin-right:4px;"></i> Ajukan Koreksi (Edit)
            </button>
            <button class="btn btn-secondary" id="btn-modal-req-delete" style="padding:6px 14px; font-size:12px; color:var(--danger); border-color:var(--danger-light);">
                <i data-lucide="trash-2" style="width:13px; height:13px; margin-right:4px;"></i> Ajukan Hapus
            </button>
        `;
        modalContainer.appendChild(requestActionsWrap);

        document.getElementById("btn-modal-req-edit").addEventListener('click', () => {
            closeModal("modal-detail-slip");
            
            // Restore modal title and submit button label for regular request
            const titleEl = document.querySelector("#modal-request-edit .modal-title");
            if (titleEl) titleEl.innerHTML = `<i data-lucide="edit-3"></i> Ajukan Koreksi Transaksi`;
            const submitBtn = document.getElementById("btn-submit-request-edit");
            if (submitBtn) submitBtn.innerText = "Ajukan Perubahan";
            
            openRequestEditModal(tx);
        });

        document.getElementById("btn-modal-req-delete").addEventListener('click', () => {
            if (confirm(`Apakah Anda yakin ingin mengajukan penghapusan untuk slip ${tx.ref_no} ke Kepala Bidang/Admin?`)) {
                submitDeleteRequest(tx.id, tx.ref_no);
            }
        });
    }

    openModal("modal-detail-slip");
    if (window.lucide) window.lucide.createIcons();
}

function openRequestEditModal(tx) {
    document.getElementById("req-edit-tx-id").value = tx.id;
    document.getElementById("req-edit-debet-nama").value = tx.debet_nama;
    document.getElementById("req-edit-debet-rekening").value = tx.debet_rekening;
    document.getElementById("req-edit-kredit-nama").value = tx.kredit_nama;
    document.getElementById("req-edit-kredit-rekening").value = tx.kredit_rekening;
    document.getElementById("req-edit-nominal-utama").value = tx.nominal_utama;
    document.getElementById("req-edit-nominal-desimal").value = tx.nominal_desimal;
    document.getElementById("req-edit-keterangan").value = tx.keterangan;
    document.getElementById("req-edit-error").style.display = "none";

    // Bind Datalists options
    const debetNamesList = document.getElementById("req-edit-debet-nama-list");
    const debetReksList = document.getElementById("req-edit-debet-rekening-list");
    const kreditNamesList = document.getElementById("req-edit-kredit-nama-list");
    const kreditReksList = document.getElementById("req-edit-kredit-rekening-list");

    [debetNamesList, debetReksList, kreditNamesList, kreditReksList].forEach(el => { if(el) el.innerHTML = ""; });

    state.costCodesDB.forEach(cc => {
        const o1 = document.createElement("option"); o1.value = cc.deskripsi;
        const o2 = document.createElement("option"); o2.value = cc.kode;
        if (debetNamesList) debetNamesList.appendChild(o1.cloneNode(true));
        if (debetReksList) debetReksList.appendChild(o2.cloneNode(true));
        if (kreditNamesList) kreditNamesList.appendChild(o1.cloneNode(true));
        if (kreditReksList) kreditReksList.appendChild(o2.cloneNode(true));
    });

    // Handle autocomplete bindings
    const handleAutocomplete = (targetInputId, sourceInputId, isSearchByCode) => {
        document.getElementById(sourceInputId).addEventListener("input", (e) => {
            const val = e.target.value;
            const match = state.costCodesDB.find(cc => isSearchByCode ? cc.kode === val : cc.deskripsi === val);
            if (match) {
                document.getElementById(targetInputId).value = isSearchByCode ? match.deskripsi : match.kode;
            }
        });
    };

    handleAutocomplete("req-edit-debet-rekening", "req-edit-debet-nama", false);
    handleAutocomplete("req-edit-debet-nama", "req-edit-debet-rekening", true);
    handleAutocomplete("req-edit-kredit-rekening", "req-edit-kredit-nama", false);
    handleAutocomplete("req-edit-kredit-nama", "req-edit-kredit-rekening", true);

    openModal("modal-request-edit");
    if (window.lucide) window.lucide.createIcons();
}

export async function submitEditRequest() {
    const id = document.getElementById("req-edit-tx-id").value;
    const debetNama = document.getElementById("req-edit-debet-nama").value;
    const debetRek = document.getElementById("req-edit-debet-rekening").value;
    const kreditNama = document.getElementById("req-edit-kredit-nama").value;
    const kreditRek = document.getElementById("req-edit-kredit-rekening").value;
    const nominalUtama = parseFloat(document.getElementById("req-edit-nominal-utama").value) || 0;
    const nominalDesimal = parseInt(document.getElementById("req-edit-nominal-desimal").value) || 0;
    const keterangan = document.getElementById("req-edit-keterangan").value;
    const errEl = document.getElementById("req-edit-error");

    errEl.style.display = "none";

    if (!debetNama || !debetRek || !kreditNama || !kreditRek || nominalUtama <= 0) {
        errEl.innerText = "Isi seluruh kolom rekening dan nominal dengan benar.";
        errEl.style.display = "block";
        return;
    }

    const requestData = {
        debet_nama: debetNama,
        debet_rekening: debetRek,
        kredit_nama: kreditNama,
        kredit_rekening: kreditRek,
        nominal_utama: nominalUtama,
        nominal_desimal: nominalDesimal,
        keterangan: keterangan,
        terbilang: terbilang(nominalUtama, nominalDesimal)
    };

    const isAdmin = state.currentRole === 'Admin';

    try {
        let res;
        if (isAdmin) {
            res = await authFetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            }).then(r => r.json());
        } else {
            res = await authFetch('/api/approvals/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transaction_id: id,
                    request_type: 'EDIT',
                    request_data: requestData
                })
            }).then(r => r.json());
        }

        if (res.success) {
            showToast(isAdmin ? "Transaksi berhasil diubah langsung!" : "Permintaan koreksi slip berhasil dikirim ke Kepala Bidang!", "success");
            closeModal("modal-request-edit");
            await showSection("riwayat");
        } else {
            errEl.innerText = res.error || "Gagal menyimpan perubahan.";
            errEl.style.display = "block";
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            errEl.innerText = "Koneksi server gagal.";
            errEl.style.display = "block";
        }
    }
}

async function submitDeleteRequest(id, refNo) {
    try {
        const res = await authFetch('/api/approvals/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_id: id,
                request_type: 'DELETE',
                request_data: {}
            })
        }).then(r => r.json());

        if (res.success) {
            showToast(`Permintaan hapus slip ${refNo} dikirim ke Kepala Bidang!`, "success");
            closeModal("modal-detail-slip");
            await showSection("riwayat");
        } else {
            showToast(res.error || "Gagal mengajukan hapus slip.", "danger");
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            showToast("Koneksi server gagal.", "danger");
        }
    }
}

async function deleteTransactionDirectly(id, refNo) {
    try {
        const res = await authFetch(`/api/transactions/${id}`, {
            method: 'DELETE'
        }).then(r => r.json());

        if (res.success) {
            showToast(`Slip ${refNo} berhasil dihapus langsung!`, "success");
            closeModal("modal-detail-slip");
            await showSection("riwayat");
        } else {
            showToast(res.error || "Gagal menghapus slip.", "danger");
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            showToast("Koneksi server gagal.", "danger");
        }
    }
}
