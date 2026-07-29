import { state } from './state.js';
import { showToast, escapeHtml, openModal, closeModal, authFetch, formatDate } from './utils.js';

let customChecklistItems = [];
let compressedKirimBlob = null;
let compressedSampaiBlob = null;

// Reusable Image Compression Helper (Canvas API client-side)
export function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        resolve(blob);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Add manual dynamic checklist items
export function addCustomChecklistItem() {
    const inputEl = document.getElementById("submit-checklist-other-input");
    const val = inputEl ? inputEl.value.trim() : "";

    if (!val) {
        showToast("Ketik kelengkapan lain terlebih dahulu!", "warning");
        return;
    }

    if (customChecklistItems.includes(val)) {
        showToast("Item kelengkapan sudah ditambahkan!", "warning");
        return;
    }

    customChecklistItems.push(val);
    inputEl.value = "";
    renderCustomChecklistList();
}

export function renderCustomChecklistList() {
    const container = document.getElementById("submit-checklist-other-list");
    if (!container) return;
    container.innerHTML = "";

    customChecklistItems.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "checklist-custom-item";
        div.innerHTML = `
            <span>${escapeHtml(item)}</span>
            <button type="button" class="btn-remove-custom-item" data-index="${index}">&times;</button>
        `;
        div.querySelector('.btn-remove-custom-item').addEventListener('click', () => {
            customChecklistItems.splice(index, 1);
            renderCustomChecklistList();
        });
        container.appendChild(div);
    });
}

// Fetch submissions from API
export async function fetchSubmissions() {
    try {
        const res = await authFetch('/api/slip-submissions').then(r => r.json());
        state.slipSubmissionsDB = res || [];
        renderSubmissionsTable();
    } catch (e) {
        console.error("Gagal memuat data slip:", e);
    }
}

// Render Submissions Table DOM
export function renderSubmissionsTable() {
    const tbody = document.getElementById("submissions-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const items = state.slipSubmissionsDB || [];

    // Toggle Laporan Container based on Role (Admin/Supervisor only)
    const laporanContainer = document.getElementById("laporan-slip-container");
    const isReportAuthorized = state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang';
    
    if (laporanContainer) {
        if (isReportAuthorized) {
            laporanContainer.style.display = "flex";
            const total = items.length;
            const pending = items.filter(item => item.status === 'Dikirim').length;
            const sampai = items.filter(item => item.status === 'Sampai').length;

            const totEl = document.getElementById("stat-total-kirim");
            const pendEl = document.getElementById("stat-pending-kirim");
            const sampEl = document.getElementById("stat-sampai-kirim");
            if (totEl) totEl.innerText = total;
            if (pendEl) pendEl.innerText = pending;
            if (sampEl) sampEl.innerText = sampai;

            const btnExport = document.getElementById("btn-export-slip-csv");
            if (btnExport) {
                const newBtnExport = btnExport.cloneNode(true);
                btnExport.parentNode.replaceChild(newBtnExport, btnExport);
                newBtnExport.addEventListener("click", exportSubmissionsCSV);
            }

            const btnExportPdf = document.getElementById("btn-export-slip-pdf");
            if (btnExportPdf) {
                const newBtnExportPdf = btnExportPdf.cloneNode(true);
                btnExportPdf.parentNode.replaceChild(newBtnExportPdf, btnExportPdf);
                newBtnExportPdf.addEventListener("click", exportSubmissionsPDF);
            }
        } else {
            laporanContainer.style.display = "none";
        }
    }

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Belum ada riwayat pengiriman berkas.</td></tr>';
        return;
    }

    items.forEach(item => {
        const tr = document.createElement("tr");

        // Format checklist info
        const checklists = [];
        if (item.checklist_slips) checklists.push("Slip Transaksi");
        if (item.checklist_mutasi) checklists.push("Mutasi Kas");
        if (item.checklist_pb) checklists.push("Pemindahbukuan");
        if (item.checklist_fo) checklists.push("Laporan FO");
        
        if (Array.isArray(item.checklist_lainnya)) {
            item.checklist_lainnya.forEach(other => checklists.push(other));
        }

        const checklistSummary = checklists.map(c => `<span class="badge badge-info" style="margin:2px;">✓ ${escapeHtml(c)}</span>`).join(" ");

        // Format Proof Kirim Image Action
        let buktiKirimAction = '<span class="text-muted" style="font-size:11px;">Tidak ada</span>';
        if (item.bukti_kirim_path) {
            buktiKirimAction = `
                <button class="btn btn-secondary btn-view-image" style="padding: 4px 8px; font-size:11px;" data-src="${item.bukti_kirim_path}" data-title="Bukti Kirim - ${escapeHtml(item.kantor_kas)}">
                    <i data-lucide="image" style="width:12px; height:12px; margin-right:4px;"></i> Lihat Foto
                </button>
            `;
        }

        // Format Proof Sampai Image Action
        let buktiSampaiAction = '<span class="text-muted" style="font-size:11px;">Belum diterima</span>';
        if (item.bukti_sampai_path) {
            buktiSampaiAction = `
                <button class="btn btn-secondary btn-view-image" style="padding: 4px 8px; font-size:11px;" data-src="${item.bukti_sampai_path}" data-title="Bukti Sampai - ${escapeHtml(item.kantor_kas)}">
                    <i data-lucide="image" style="width:12px; height:12px; margin-right:4px;"></i> Lihat Foto
                </button>
            `;
        }

        // Format status, recipient name and date
        let statusBadgeClass = "badge-warning";
        let statusText = "Dikirim";
        let statusInfo = `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Oleh: ${escapeHtml(item.operator_name)}</div>`;
        
        if (item.status === 'Sampai') {
            statusBadgeClass = "badge-success";
            statusText = "Sampai";
            statusInfo = `
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                    Penerima: <strong>${escapeHtml(item.penerima_name)}</strong><br>
                    Tgl: ${formatDate(item.tanggal_sampai)}
                </div>
            `;
        }

        // Action Column Button
        let actionBtnHTML = `<span class="text-muted" style="font-size:11px;">Selesai</span>`;
        if (item.status === 'Dikirim') {
            actionBtnHTML = `
                <button class="btn btn-primary btn-confirm-arrival" style="padding: 6px 10px; font-size:11px;" data-id="${item.id}">
                    <i data-lucide="check-circle" style="width:12px; height:12px; margin-right:4px;"></i> Terima
                </button>
            `;
        }

        const canDelete = state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang';
        const deleteBtnHTML = canDelete ? `
            <button class="btn btn-secondary btn-delete-submission" style="padding: 6px 10px; font-size:11px; color:var(--danger); border-color:var(--danger-light);" data-id="${item.id}">
                <i data-lucide="trash-2" style="width:12px; height:12px; margin-right:4px;"></i> Hapus
            </button>
        ` : '';

        tr.innerHTML = `
            <td><strong>${formatDate(item.tanggal_kirim)}</strong></td>
            <td>
                <strong>${escapeHtml(item.kantor_kas)}</strong>
                <div style="font-size:11px; color:var(--text-muted);">Operator: ${escapeHtml(item.operator_name)} (${item.operator_code})</div>
            </td>
            <td>
                <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:280px;">
                    ${checklistSummary || '<span class="text-muted">-</span>'}
                </div>
            </td>
            <td style="text-align: center;">${buktiKirimAction}</td>
            <td style="text-align: center;">${buktiSampaiAction}</td>
            <td>
                <span class="badge ${statusBadgeClass}">${statusText}</span>
                ${statusInfo}
            </td>
            <td style="text-align: center;">
                <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                    ${actionBtnHTML}
                    ${deleteBtnHTML}
                </div>
            </td>
        `;

        // Wire View Image Click handlers
        tr.querySelectorAll(".btn-view-image").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const src = btn.getAttribute("data-src");
                const title = btn.getAttribute("data-title");
                openImageViewer(src, title);
            });
        });

        // Wire Confirm Arrival Click handler
        const btnConfirm = tr.querySelector(".btn-confirm-arrival");
        if (btnConfirm) {
            btnConfirm.addEventListener("click", () => {
                document.getElementById("confirm-arrival-id").value = item.id;
                document.getElementById("confirm-penerima-name").value = "";
                document.getElementById("confirm-bukti-sampai").value = "";
                document.getElementById("preview-bukti-sampai").style.display = "none";
                document.getElementById("confirm-arrival-error").style.display = "none";
                compressedSampaiBlob = null;
                openModal("modal-confirm-arrival");
            });
        }

        // Wire Delete Submission Click handler
        const btnDelete = tr.querySelector(".btn-delete-submission");
        if (btnDelete) {
            btnDelete.addEventListener("click", () => {
                deleteSubmission(item.id, item.kantor_kas);
            });
        }

        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

// Open image preview modal
export function openImageViewer(src, title) {
    const titleEl = document.getElementById("image-viewer-title");
    const imgEl = document.getElementById("image-viewer-img");
    if (titleEl) titleEl.innerText = title;
    if (imgEl) imgEl.src = src;
    openModal("modal-image-viewer");
}

// Form Handlers
export function setupSlipSubmissionForm() {
    // Fill default Kantor Kas with user's division
    const kantorKasInput = document.getElementById("submit-kantor-kas");
    if (kantorKasInput && state.currentUser) {
        kantorKasInput.value = state.currentUser.bagian || "Kantor Kas";
    }

    // Dynamic list initializer
    customChecklistItems = [];
    renderCustomChecklistList();
    
    // File inputs & Preview handlers
    const uploadBoxKirim = document.getElementById("upload-box-kirim");
    const fileInputKirim = document.getElementById("submit-bukti-kirim");
    const previewKirim = document.getElementById("preview-bukti-kirim");

    if (uploadBoxKirim && fileInputKirim) {
        uploadBoxKirim.addEventListener("click", () => fileInputKirim.click());
        fileInputKirim.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                // Instantly compress image
                previewKirim.src = URL.createObjectURL(file);
                previewKirim.style.display = "block";
                
                showToast("⏳ Mengompres foto bukti kirim...", "info");
                compressedKirimBlob = await compressImage(file, 1000, 1000, 0.7);
                showToast(`✅ Foto siap diunggah! Ukuran akhir: ${Math.round(compressedKirimBlob.size / 1024)} KB`, "success");
            } catch (err) {
                console.error("Compression error:", err);
                showToast("Gagal mengompres gambar.", "danger");
            }
        });
    }

    const uploadBoxSampai = document.getElementById("upload-box-sampai");
    const fileInputSampai = document.getElementById("confirm-bukti-sampai");
    const previewSampai = document.getElementById("preview-bukti-sampai");

    if (uploadBoxSampai && fileInputSampai) {
        uploadBoxSampai.addEventListener("click", () => fileInputSampai.click());
        fileInputSampai.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                previewSampai.src = URL.createObjectURL(file);
                previewSampai.style.display = "block";
                
                showToast("⏳ Mengompres foto bukti sampai...", "info");
                compressedSampaiBlob = await compressImage(file, 1000, 1000, 0.7);
                showToast(`✅ Foto siap diunggah! Ukuran akhir: ${Math.round(compressedSampaiBlob.size / 1024)} KB`, "success");
            } catch (err) {
                console.error("Compression error:", err);
                showToast("Gagal mengompres gambar.", "danger");
            }
        });
    }
}

// Submit transaction slips
export async function submitSlipSubmission() {
    const kantor_kas = document.getElementById("submit-kantor-kas").value.trim();
    const chkSlips = document.getElementById("submit-checklist-slips").checked ? 1 : 0;
    const chkMutasi = document.getElementById("submit-checklist-mutasi").checked ? 1 : 0;
    const chkPB = document.getElementById("submit-checklist-pb").checked ? 1 : 0;
    const chkFO = document.getElementById("submit-checklist-fo").checked ? 1 : 0;

    if (!kantor_kas) {
        showToast("Nama Kantor Kas / Unit wajib diisi!", "warning");
        return;
    }

    if (!compressedKirimBlob) {
        showToast("Foto bukti kirim (kamera/file) wajib diambil!", "warning");
        return;
    }

    const formData = new FormData();
    formData.append("kantor_kas", kantor_kas);
    formData.append("checklist_slips", chkSlips);
    formData.append("checklist_mutasi", chkMutasi);
    formData.append("checklist_pb", chkPB);
    formData.append("checklist_fo", chkFO);
    formData.append("checklist_lainnya", JSON.stringify(customChecklistItems));
    formData.append("bukti_kirim", compressedKirimBlob, "bukti_kirim.jpg");

    try {
        showToast("Mengirim berkas slip & laporan...", "info");
        
        const res = await authFetch('/api/slip-submissions', {
            method: 'POST',
            body: formData
        }).then(r => r.json());

        if (res.success) {
            showToast("Berkas slip & laporan berhasil dikirim!", "success");
            // Reset form details
            document.getElementById("submit-bukti-kirim").value = "";
            document.getElementById("preview-bukti-kirim").style.display = "none";
            compressedKirimBlob = null;
            customChecklistItems = [];
            renderCustomChecklistList();
            
            await fetchSubmissions();
        } else {
            showToast(res.error || "Gagal mengirim berkas.", "danger");
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

// Confirm receiver arrival
export async function submitConfirmArrival() {
    const id = document.getElementById("confirm-arrival-id").value;
    const penerima_name = document.getElementById("confirm-penerima-name").value.trim();
    const errorEl = document.getElementById("confirm-arrival-error");

    if (!penerima_name) {
        errorEl.innerText = "Nama penerima wajib diisi!";
        errorEl.style.display = "block";
        return;
    }

    if (!compressedSampaiBlob) {
        errorEl.innerText = "Foto bukti fisik sampai wajib diambil!";
        errorEl.style.display = "block";
        return;
    }

    errorEl.style.display = "none";

    const formData = new FormData();
    formData.append("penerima_name", penerima_name);
    formData.append("bukti_sampai", compressedSampaiBlob, "bukti_sampai.jpg");

    try {
        showToast("Menyimpan konfirmasi penerimaan...", "info");

        const res = await authFetch(`/api/slip-submissions/${id}/confirm-arrival`, {
            method: 'PUT',
            body: formData
        }).then(r => r.json());

        if (res.success) {
            showToast("Penerimaan berkas berhasil dikonfirmasi!", "success");
            closeModal("modal-confirm-arrival");
            
            // Clean up state
            compressedSampaiBlob = null;
            document.getElementById("confirm-bukti-sampai").value = "";
            document.getElementById("preview-bukti-sampai").style.display = "none";
            
            await fetchSubmissions();
        } else {
            errorEl.innerText = res.error || "Gagal menyimpan konfirmasi.";
            errorEl.style.display = "block";
        }
    } catch (e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}

export function exportSubmissionsCSV() {
    const items = state.slipSubmissionsDB || [];
    if (items.length === 0) {
        showToast("Tidak ada data untuk diekspor.", "warning");
        return;
    }

    let csvContent = "Tanggal Kirim,Kantor Kas,Nama Pengirim,Kode Operator,Checklist Kelengkapan,Status,Tanggal Sampai,Nama Penerima\n";

    items.forEach(item => {
        const checklists = [];
        if (item.checklist_slips) checklists.push("Slip Transaksi");
        if (item.checklist_mutasi) checklists.push("Mutasi Kas");
        if (item.checklist_pb) checklists.push("Pemindahbukuan");
        if (item.checklist_fo) checklists.push("Laporan FO");
        if (Array.isArray(item.checklist_lainnya)) {
            item.checklist_lainnya.forEach(other => checklists.push(other));
        }

        const checklistText = checklists.join("; ");
        
        const escapeCSV = (str) => {
            if (!str) return "";
            const cleanStr = str.toString().replace(/"/g, '""');
            return cleanStr.includes(",") || cleanStr.includes("\n") || cleanStr.includes('"') || cleanStr.includes(";")
                ? `"${cleanStr}"`
                : cleanStr;
        };

        const tanggalKirim = formatDate(item.tanggal_kirim);
        const kantorKas = escapeCSV(item.kantor_kas);
        const pengirim = escapeCSV(item.operator_name);
        const operatorCode = escapeCSV(item.operator_code);
        const listItems = escapeCSV(checklistText);
        const status = escapeCSV(item.status);
        const tanggalSampai = item.tanggal_sampai ? formatDate(item.tanggal_sampai) : "-";
        const penerima = escapeCSV(item.penerima_name || "-");

        csvContent += `${tanggalKirim},${kantorKas},${pengirim},${operatorCode},${listItems},${status},${tanggalSampai},${penerima}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan_pengiriman_slip_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Laporan CSV berhasil diunduh!", "success");
}

export async function exportSubmissionsPDF() {
    const items = state.slipSubmissionsDB || [];
    if (items.length === 0) {
        showToast("Tidak ada data untuk diekspor ke PDF.", "warning");
        return;
    }

    showToast("Menyiapkan dokumen PDF, harap tunggu...", "info");

    // Buat wadah kontainer off-screen
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.fontFamily = 'sans-serif';
    container.style.color = '#333';
    container.style.width = '800px'; // Set fixed width for better A4 scaling

    let html = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0; padding: 0;">Laporan Pengiriman Berkas Slip</h2>
            <p style="margin: 5px 0; color: #666;">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
        </div>
    `;

    items.forEach(item => {
        const checklists = [];
        if (item.checklist_slips) checklists.push("Slip Transaksi");
        if (item.checklist_mutasi) checklists.push("Mutasi Kas");
        if (item.checklist_pb) checklists.push("Pemindahbukuan");
        if (item.checklist_fo) checklists.push("Laporan FO");
        if (Array.isArray(item.checklist_lainnya)) {
            item.checklist_lainnya.forEach(other => checklists.push(other));
        }

        const fotoKirim = item.bukti_kirim_path ? 
            `<img src="${item.bukti_kirim_path}" style="max-width: 150px; max-height: 150px; object-fit: contain; border: 1px solid #ddd; border-radius: 4px;" alt="Bukti Kirim">` : 
            `<span style="color: #999; font-style: italic;">Tidak ada foto</span>`;

        const fotoSampai = item.bukti_sampai_path ? 
            `<img src="${item.bukti_sampai_path}" style="max-width: 150px; max-height: 150px; object-fit: contain; border: 1px solid #ddd; border-radius: 4px;" alt="Bukti Sampai">` : 
            `<span style="color: #999; font-style: italic;">Belum diterima</span>`;

        html += `
        <div style="page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 20px; background: #fff;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <tr>
                    <td style="width: 50%; vertical-align: top;">
                        <strong>Tanggal Kirim:</strong> ${formatDate(item.tanggal_kirim)}<br>
                        <strong>Kantor Kas:</strong> ${escapeHtml(item.kantor_kas)}<br>
                        <strong>Pengirim:</strong> ${escapeHtml(item.operator_name)} (${escapeHtml(item.operator_code)})<br>
                        <strong>Status:</strong> <span style="color: ${item.status === 'Sampai' ? '#10b981' : '#f59e0b'}; font-weight: bold;">${escapeHtml(item.status)}</span>
                    </td>
                    <td style="width: 50%; vertical-align: top;">
                        <strong>Tanggal Sampai:</strong> ${item.tanggal_sampai ? formatDate(item.tanggal_sampai) : "-"}<br>
                        <strong>Penerima:</strong> ${escapeHtml(item.penerima_name || "-")}<br>
                        <strong>Kelengkapan:</strong><br>
                        <div style="margin-top: 4px; font-size: 13px;">
                            ${checklists.map(c => `<span style="display:inline-block; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; margin:2px;">✓ ${escapeHtml(c)}</span>`).join("") || "-"}
                        </div>
                    </td>
                </tr>
            </table>
            
            <div style="display: flex; gap: 20px; border-top: 1px dashed #e5e7eb; padding-top: 15px;">
                <div style="flex: 1; text-align: center;">
                    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Foto Bukti Kirim</div>
                    ${fotoKirim}
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Foto Bukti Terima</div>
                    ${fotoSampai}
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;

    const opt = {
        margin:       10,
        filename:     `laporan_pengiriman_slip_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Panggil html2pdf
    try {
        await html2pdf().set(opt).from(container).save();
        showToast("Laporan PDF berhasil diunduh!", "success");
    } catch (err) {
        console.error("Error generating PDF:", err);
        showToast("Terjadi kesalahan saat memproses PDF.", "danger");
    }
}

export async function deleteSubmission(id, name) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengiriman berkas dari "${name}"?`)) return;

    try {
        const res = await authFetch(`/api/slip-submissions/${id}`, {
            method: 'DELETE'
        }).then(r => r.json());

        if (res.success) {
            showToast("Pengiriman berkas berhasil dihapus.", "success");
            await fetchSubmissions();
        } else {
            showToast(res.error || "Gagal menghapus pengiriman berkas.", "danger");
        }
    } catch(e) {
        console.error(e);
        showToast("Koneksi server terputus.", "danger");
    }
}
