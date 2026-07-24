import { state } from './js/state.js';
import { showToast, escapeHtml, openModal, closeModal, authFetch } from './js/utils.js';
import { showLoginScreen, hideLoginScreen, checkAuth, login, logout, changePassword } from './js/auth.js';
import { fetchNextRef, renderInputView, updateLiveSlipPreview, resetTxForm, saveTransaction, printElement, initLayoutDragAndDrop, saveAndPrintTransaction, setupAutocompleteSearch, setupPKCombobox } from './js/transactions.js';
import { renderRiwayatView, exportRiwayatToCSV, submitEditRequest } from './js/history.js';
import { renderKodeBiayaView, resetCostCodeForm, submitCostCode, exportCostCodes, importCostCodes, downloadCostCodeTemplate, bulkDeleteSelectedCodes, clearAllCostCodes } from './js/costCodes.js';
import { renderUsersView, openAddUserModal, submitUser, submitResetPassword, exportUsers, importUsers, downloadUserTemplate } from './js/users.js';
import { renderAuditTrailView, clearAuditLogs, updateNotifBadge, renderNotifDropdown, markNotifsRead, startClock, initTheme, toggleTheme, initDeployPanel } from './js/system.js';
import { renderDashboardView } from './js/dashboard.js';
import { renderApprovalsView, fetchPendingApprovalsCount } from './js/approvals.js';
import { fetchSubmissions, setupSlipSubmissionForm, submitSlipSubmission, submitConfirmArrival, addCustomChecklistItem } from './js/slipSubmissions.js';
import { fetchFileBackupList, setupFileBackup } from './js/fileBackup.js';

// Check Permissions
function checkPermission(view, role) {
    const permissions = {
        "dashboard": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service", "IT Support"],
        "input": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "riwayat": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "kodebiaya": ["Admin"],
        "kirimslip": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "filebackup": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "users": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "audit": ["Admin", "Kepala Bidang"],
        "approvals": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service"],
        "ideb": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service", "IT Support"],
        "ideb-master": ["Admin", "Kepala Bidang", "Teller", "SDMU", "Customer Service", "IT Support"]
    };
    return permissions[view] ? permissions[view].includes(role) : false;
}

let chartSlikTrend = null;
let chartCollPie = null;

async function renderITSupportDashboardView() {
    try {
        const res = await fetch('/api/ideb/dashboard-itsupport').then(r => r.json());
        if (!res.success) return;

        const k = res.kpis;
        const c = res.coll_distribution;

        const elTotal = document.getElementById("it-kpi-total");
        const elToday = document.getElementById("it-kpi-today");
        const elNpl = document.getElementById("it-kpi-npl");
        const elBd = document.getElementById("it-kpi-bd");

        if (elTotal) elTotal.innerText = (k.total_records || 0).toLocaleString('en-US');
        if (elToday) elToday.innerText = (k.today_count || 0).toLocaleString('en-US');
        if (elNpl) elNpl.innerText = (k.total_npl || 0).toLocaleString('en-US');
        if (elBd) elBd.innerText = 'Rp ' + Math.round(k.total_bd || 0).toLocaleString('id-ID');

        if (typeof Chart === 'undefined') return;

        // 1. Doughnut Chart: Distribution Coll
        const ctxPie = document.getElementById("chart-it-coll-pie")?.getContext("2d");
        if (ctxPie) {
            if (chartCollPie) chartCollPie.destroy();
            chartCollPie = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: ['Kol 1 (Lancar)', 'Kol 2 (DPK)', 'Kol 3 (Kurang Lancar)', 'Kol 4 (Diragukan)', 'Kol 5 (Macet)'],
                    datasets: [{
                        data: [c.coll1, c.coll2, c.coll3, c.coll4, c.coll5],
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        // 2. Bar Chart: Trend SLIK
        const ctxTrend = document.getElementById("chart-it-slik-trend")?.getContext("2d");
        if (ctxTrend) {
            if (chartSlikTrend) chartSlikTrend.destroy();
            const labels = res.trend.map(t => t.period || 'Periode');
            const dataCounts = res.trend.map(t => t.count);

            chartSlikTrend = new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: labels.length > 0 ? labels : ['Bulan lalu', 'Bulan ini'],
                    datasets: [{
                        label: 'Jumlah Impor iDEB',
                        data: dataCounts.length > 0 ? dataCounts : [0, k.today_count || 0],
                        backgroundColor: '#0284c7',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 3. Cabang Comparison Table
        const tbody = document.getElementById("it-table-cabang-body");
        if (tbody) {
            if (!res.cabang_list || res.cabang_list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">Belum ada data aktivitas cabang.</td></tr>';
            } else {
                let html = '';
                res.cabang_list.forEach((cb, idx) => {
                    html += `<tr style="border-bottom: 1px solid var(--border);">
                        <td style="text-align:center; padding:8px;">${idx + 1}</td>
                        <td style="font-weight:700; padding:8px;">Kode Cabang ${cb.cabang}</td>
                        <td style="text-align:right; padding:8px;">${(cb.total_records || 0).toLocaleString()}</td>
                        <td style="text-align:right; color:#ef4444; font-weight:600; padding:8px;">${(cb.total_npl || 0).toLocaleString()}</td>
                        <td style="text-align:center; padding:8px;">${cb.last_update || '-'}</td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            }
        }

    } catch (e) {
        console.error("Gagal memuat dashboard IT Support:", e);
    }
}

// 1. DATA SYNCHRONIZATION WITH BACKEND
export async function refreshData() {
    try {
        const searchVal = document.getElementById("riwayat-search") ? document.getElementById("riwayat-search").value : "";
        const codeVal = document.getElementById("riwayat-filter-code") ? document.getElementById("riwayat-filter-code").value : "";
        const dateVal = document.getElementById("riwayat-filter-month") ? document.getElementById("riwayat-filter-month").value : "";
        
        const auditSearchVal = document.getElementById("audit-search") ? document.getElementById("audit-search").value : "";
        const auditRoleVal = document.getElementById("audit-filter-role") ? document.getElementById("audit-filter-role").value : "";

        const promises = [];
        const keys = [];

        // Selalu ambil notifikasi untuk header
        promises.push(fetch('/api/notifications').then(r => r.json()));
        keys.push('notifications');

        const activeView = state.activeView || 'dashboard';

        // Pemuatan data bersyarat sesuai dengan tab/view yang sedang aktif saja
        if (activeView === 'dashboard') {
            if (state.costCodesDB.length === 0) {
                promises.push(fetch('/api/cost-codes?limit=10000').then(r => r.json()));
                keys.push('codes');
            }
        } else if (activeView === 'input') {
            if (state.costCodesDB.length === 0) {
                promises.push(fetch('/api/cost-codes?limit=10000').then(r => r.json()));
                keys.push('codes');
            }
        } else if (activeView === 'riwayat') {
            if (state.costCodesDB.length === 0) {
                promises.push(fetch('/api/cost-codes?limit=10000').then(r => r.json()));
                keys.push('codes');
            }
            promises.push(fetch(`/api/transactions?page=${state.currentTxPage}&limit=${state.paginationLimit}&search=${encodeURIComponent(searchVal)}&code=${encodeURIComponent(codeVal)}&date=${encodeURIComponent(dateVal)}`).then(r => r.json()));
            keys.push('transactions');
        } else if (activeView === 'kodebiaya') {
            promises.push(fetch(`/api/cost-codes?page=${state.currentCcPage}&limit=${state.ccLimit}&search=${encodeURIComponent(searchVal)}`).then(r => r.json()));
            keys.push('cc_paginated');
        } else if (activeView === 'users') {
            if (state.currentRole === 'Admin' || state.currentRole === 'Kepala Bidang') {
                promises.push(fetch('/api/users').then(r => r.json()));
                keys.push('users');
            }
            promises.push(fetch('/api/ref-counters').then(r => r.json()));
            keys.push('counters');
        } else if (activeView === 'audit') {
            promises.push(fetch(`/api/audit-logs?page=${state.currentAuditPage}&limit=${state.paginationLimit}&search=${encodeURIComponent(auditSearchVal)}&role=${encodeURIComponent(auditRoleVal)}`).then(r => r.json()));
            keys.push('audit');
        }

        const results = await Promise.all(promises);

        results.forEach((res, index) => {
            const key = keys[index];
            if (key === 'notifications') {
                state.notifDB = res;
            } else if (key === 'codes') {
                state.costCodesDB = res.data || [];
            } else if (key === 'transactions') {
                state.transactionsDB = res.data || [];
                state.totalTxPages = res.totalPages || 1;
                state.totalTxCount = res.totalCount || 0;
            } else if (key === 'cc_paginated') {
                state.costCodesDB = res.data || [];
                state.totalCcPages = res.totalPages || 1;
                state.totalCcCount = res.totalCount || 0;
            } else if (key === 'users') {
                state.usersDB = res;
            } else if (key === 'counters') {
                state.refCountersDB = Array.isArray(res) ? res : [];
            } else if (key === 'audit') {
                state.auditDB = res.data || [];
                state.totalAuditPages = res.totalPages || 1;
                state.totalAuditCount = res.totalCount || 0;
            }
        });
    } catch (e) {
        console.error("Gagal sinkronisasi data dari server API:", e);
        showToast("Koneksi server terputus!", "danger");
    }
}

// Helper to display loading indicator inside table body
function showTableLoading(tbodyId, colspan) {
    const tbody = document.getElementById(tbodyId);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding: 32px; color: var(--text-muted);">
            <div style="display:inline-flex; align-items:center; gap:8px;">
                <i data-lucide="loader-2" class="animate-spin" style="width:18px; height:18px;"></i>
                <span>Memuat data dari server...</span>
            </div>
        </td></tr>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

// Core routing and section displays
export async function showSection(sectionId) {
    if (sectionId !== "access-denied" && !checkPermission(sectionId, state.currentRole)) {
        sectionId = "access-denied";
    }

    state.activeView = sectionId;

    // Render data lama dari memory secara instan (jika ada) agar transisi tab terasa cepat (0ms),
    // jika data belum dimuat sama sekali baru tampilkan loading spinner.
    if (sectionId === "dashboard") {
        if (state.currentRole === "IT Support") renderITSupportDashboardView();
        else renderDashboardView();
    } else if (sectionId === "kodebiaya") {
        if (state.costCodesDB && state.costCodesDB.length > 0) renderKodeBiayaView();
        else showTableLoading("codes-table-body", 4);
    } else if (sectionId === "riwayat") {
        if (state.transactionsDB && state.transactionsDB.length > 0) renderRiwayatView();
        else showTableLoading("riwayat-table-body", 7);
    } else if (sectionId === "users") {
        if (state.usersDB && state.usersDB.length > 0) renderUsersView();
        else showTableLoading("user-table-body", 7);
    } else if (sectionId === "audit") {
        if (state.auditDB && state.auditDB.length > 0) renderAuditTrailView();
        else showTableLoading("audit-table-body", 5);
    } else if (sectionId === "kirimslip") {
        showTableLoading("submissions-table-body", 7);
    } else if (sectionId === "filebackup") {
        showTableLoading("filebackup-table-body", 4);
    }

    document.querySelectorAll(".view-section").forEach(view => {
        view.style.display = "none";
    });

    let targetViewId = "view-" + sectionId;
    if (sectionId === "dashboard" && state.currentRole === "IT Support") {
        targetViewId = "view-dashboard-itsupport";
    }

    const activeElem = document.getElementById(targetViewId);
    if (activeElem) {
        activeElem.style.display = "block";
    }

    document.querySelectorAll(".nav-item-link").forEach(link => {
        link.classList.remove("active");
        if (link.getAttribute("data-view") === sectionId) {
            link.classList.add("active");
        }
    });

    const headerTitleMap = {
        "dashboard": "Dashboard Statistik & Tren",
        "approvals": "Antrean Persetujuan Jurnal",
        "input": "Input Transaksi Baru",
        "riwayat": "Riwayat Transaksi",
        "kirimslip": "Kirim Berkas Slip & Laporan Completeness Tracker",
        "filebackup": "Daftar File Backup Server",
        "kodebiaya": "Kelola Kode Biaya",
        "users": "Manajemen Pengguna",
        "audit": "System Audit Trail",
        "ideb": "Informasi Debitur iDEB / SLIK",
        "ideb-master": "Data iDEB Terdaftar (Master Data SLIK)",
        "access-denied": "Akses Ditolak / Terbatas"
    };
    
    document.getElementById("page-title-text").innerText = headerTitleMap[sectionId] || "SIM-SLIP-REF";

    await refreshData();

    if (sectionId === "dashboard") {
        await renderDashboardView();
    } else if (sectionId === "approvals") {
        await renderApprovalsView();
    } else if (sectionId === "input") {
        await renderInputView();
    } else if (sectionId === "riwayat") {
        renderRiwayatView();
    } else if (sectionId === "kirimslip") {
        setupSlipSubmissionForm();
        fetchSubmissions();
    } else if (sectionId === "filebackup") {
        fetchFileBackupList();
    } else if (sectionId === "kodebiaya") {
        renderKodeBiayaView();
    } else if (sectionId === "users") {
        renderUsersView();
    } else if (sectionId === "audit") {
        renderAuditTrailView();
        initDeployPanel();
    } else if (sectionId === "ideb-master") {
        if (typeof window.idebLoadMasterList === 'function') window.idebLoadMasterList(1);
    }
    
    document.getElementById("app-sidebar").classList.remove("mobile-open");
    updateNotifBadge();
    if (window.lucide) window.lucide.createIcons();
}

// ─── initApp: called after successful login / valid session ───────────────────
export async function initApp() {
    if (!state.currentUser) return;

    // Check for impersonator session
    const impBanner = document.getElementById("impersonation-banner");
    if (state.currentUser.impersonator) {
        if (impBanner) impBanner.style.display = "flex";
        const targetNameEl = document.getElementById("impersonate-target-name");
        const adminNameEl = document.getElementById("impersonate-admin-name");
        if (targetNameEl) targetNameEl.innerText = `${state.currentUser.nama} (@${state.currentUser.username})`;
        if (adminNameEl) adminNameEl.innerText = `${state.currentUser.impersonator.nama} (@${state.currentUser.impersonator.username})`;
    } else {
        if (impBanner) impBanner.style.display = "none";
    }

    document.getElementById('active-user-display').textContent =
        `${state.currentUser.nama} (${state.currentUser.role} - ${state.currentUser.operator_code})`;

    document.getElementById("user-display-name").innerText = state.currentUser.nama;
    document.getElementById("user-display-role").innerText = state.currentUser.role;
    document.getElementById("user-avatar-initial").innerText = state.currentUser.nama.charAt(0);

    const setNavDisplay = (id, view) => {
        const el = document.getElementById(id);
        if (el) el.style.display = checkPermission(view, state.currentRole) ? "flex" : "none";
    };

    setNavDisplay("nav-dashboard", "dashboard");
    setNavDisplay("nav-input", "input");
    setNavDisplay("nav-riwayat", "riwayat");
    setNavDisplay("nav-kirimslip", "kirimslip");
    setNavDisplay("nav-filebackup", "filebackup");
    setNavDisplay("nav-kodebiaya", "kodebiaya");
    setNavDisplay("nav-users", "users");
    setNavDisplay("nav-audit", "audit");
    setNavDisplay("nav-approvals", "approvals");
    setNavDisplay("nav-ideb", "ideb");
    setNavDisplay("nav-ideb-master", "ideb-master");

    let initialView = "dashboard";
    if (!checkPermission("dashboard", state.currentRole)) {
        if (checkPermission("ideb", state.currentRole)) initialView = "ideb";
        else if (checkPermission("ideb-master", state.currentRole)) initialView = "ideb-master";
        else if (checkPermission("input", state.currentRole)) initialView = "input";
    }

    await showSection(initialView);
    await fetchPendingApprovalsCount();

    setInterval(async () => {
        try {
            await refreshData();
            if (state.activeView === "riwayat") renderRiwayatView();
            else if (state.activeView === "audit") renderAuditTrailView();
            else if (state.activeView === "dashboard") {
                if (state.currentRole === "IT Support") renderITSupportDashboardView();
                else renderDashboardView();
            }
            else if (state.activeView === "approvals") renderApprovalsView();
            updateNotifBadge();
            await fetchPendingApprovalsCount();
        } catch (e) { /* session may have expired */ }
    }, 8000);
}

// ─── DOMContentLoaded: Auth check + wire events ───────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
    startClock();
    initTheme();
    initLayoutDragAndDrop();

    setupPKCombobox("tx-debet-rekening", "combo-debet-rek-list",   "code", "tx-debet-nama");
    setupPKCombobox("tx-kredit-rekening","combo-kredit-rek-list",  "code", "tx-kredit-nama");

    setupFileBackup();

    document.getElementById("btn-login").addEventListener("click", login);
    document.getElementById("login-password").addEventListener("keydown", (e) => {
        if (e.key === "Enter") login();
    });
    document.getElementById("login-username").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("login-password").focus();
    });

    document.getElementById("btn-toggle-password").addEventListener("click", () => {
        const pwEl = document.getElementById("login-password");
        const eyeEl = document.getElementById("eye-icon");
        const isHidden = pwEl.type === "password";
        pwEl.type = isHidden ? "text" : "password";
        eyeEl.setAttribute("data-lucide", isHidden ? "eye-off" : "eye");
        if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById("btn-logout").addEventListener("click", logout);

    document.getElementById("btn-change-password").addEventListener("click", () => {
        document.getElementById("cp-current").value = "";
        document.getElementById("cp-new").value = "";
        document.getElementById("cp-confirm").value = "";
        document.getElementById("cp-error").style.display = "none";
        openModal("modal-change-password");
        if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById("btn-submit-change-password").addEventListener("click", changePassword);
    document.getElementById("btn-submit-reset-password").addEventListener("click", submitResetPassword);

    const notifBtn = document.getElementById("notif-btn");
    const notifDropdown = document.getElementById("notification-dropdown");
    notifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        renderNotifDropdown();
        notifDropdown.classList.toggle("active");
    });

    document.getElementById("clear-notif-btn").addEventListener("click", markNotifsRead);
    document.addEventListener("click", () => { notifDropdown.classList.remove("active"); });

    document.getElementById("menu-toggle").addEventListener("click", () => {
        document.getElementById("app-sidebar").classList.toggle("mobile-open");
    });

    const sidebarOverlay = document.getElementById("sidebar-overlay");
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", () => {
            document.getElementById("app-sidebar").classList.remove("mobile-open");
        });
    }

    document.querySelectorAll(".nav-item-link").forEach(link => {
        link.addEventListener("click", (e) => {
            const targetView = e.currentTarget.getAttribute("data-view");
            if (targetView) showSection(targetView);
        });
    });

    document.querySelectorAll(".modal-close-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const modal = e.target.closest(".modal-overlay");
            if (modal) modal.classList.remove("active");
        });
    });

    // Transaction form inputs
    document.getElementById("tx-debet-nama").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-debet-rekening").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-kredit-nama").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-kredit-rekening").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-nominal-utama").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-nominal-desimal").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-keterangan").addEventListener("input", updateLiveSlipPreview);
    document.getElementById("tx-jenis-slip").addEventListener("change", () => {
        fetchNextRef();
        updateLiveSlipPreview();
    });

    // Rekening fields: update live preview on input/selection
    // Nama fields are readonly — they sync automatically via the combobox paired field logic
    ["tx-debet-rekening", "tx-kredit-rekening"].forEach(id => {
        document.getElementById(id).addEventListener("input", () => updateLiveSlipPreview());
        document.getElementById(id).addEventListener("pk-selected", () => updateLiveSlipPreview());
    });

    // Calibration saves
    // Calibration saves (Post to backend system settings API for global persistence)
    document.getElementById("btn-apply-calibration").addEventListener("click", async () => {
        const printDataOnly = document.getElementById("print-data-only").checked;
        const offsetX = document.getElementById("cal-offset-x").value || "0";
        const offsetY = document.getElementById("cal-offset-y").value || "0";
        const slipWidth = document.getElementById("cal-slip-width").value || "15.5";
        const slipHeight = document.getElementById("cal-slip-height").value || "10.5";
        const slipScale = document.getElementById("cal-slip-scale").value || "100";
        const slipRotation = document.getElementById("cal-slip-rotation").value || "0";
        const pageSize = document.getElementById("cal-page-size").value || "slip";

        const payload = {
            simslip_cal_x: offsetX,
            simslip_cal_y: offsetY,
            simslip_width: slipWidth,
            simslip_height: slipHeight,
            simslip_scale: slipScale,
            simslip_rotation: slipRotation,
            simslip_page_size: pageSize,
            simslip_print_only: String(printDataOnly)
        };

        const detailIds = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
        detailIds.forEach(id => {
            payload[`simslip_offset_${id}_x`] = document.getElementById(`cal-el-${id}-x`).value || "0";
            payload[`simslip_offset_${id}_y`] = document.getElementById(`cal-el-${id}-y`).value || "0";
        });

        try {
            const res = await authFetch('/api/system/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());

            if (res.success) {
                showToast("Kalibrasi berhasil diterapkan secara global untuk semua user!", "success");
            } else {
                showToast(res.error || "Gagal menerapkan kalibrasi.", "danger");
            }
        } catch (e) {
            showToast("Koneksi server terputus.", "danger");
        }
    });

    document.getElementById("btn-reset-calibration").addEventListener("click", async () => {
        const payload = {
            simslip_cal_x: "0",
            simslip_cal_y: "0",
            simslip_width: "15.5",
            simslip_height: "10.5",
            simslip_scale: "100",
            simslip_rotation: "0",
            simslip_page_size: "slip",
            simslip_print_only: "true"
        };
        const detailIds = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
        detailIds.forEach(id => {
            payload[`simslip_offset_${id}_x`] = "0";
            payload[`simslip_offset_${id}_y`] = "0";
        });

        try {
            const res = await authFetch('/api/system/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(r => r.json());

            if (res.success) {
                document.getElementById("cal-offset-x").value = "0";
                document.getElementById("cal-offset-y").value = "0";
                document.getElementById("cal-slip-width").value = "15.5";
                document.getElementById("cal-slip-height").value = "10.5";
                document.getElementById("cal-slip-scale").value = "100";
                document.getElementById("cal-slip-rotation").value = "0";
                document.getElementById("cal-page-size").value = "slip";
                document.getElementById("print-data-only").checked = true;

                const detailSels = { date:".meta-item-tanggal", val:".meta-item-validasi", debet:".debet-box", kredit:".kredit-box", amount:".row-rp", terbilang:".row-terbilang", details:".row-keterangan" };
                detailIds.forEach(id => {
                    document.getElementById(`cal-el-${id}-x`).value = "0";
                    document.getElementById(`cal-el-${id}-y`).value = "0";
                    const previewEl = document.querySelector(`#printable-voucher-slip ${detailSels[id]}`);
                    if (previewEl) previewEl.style.transform = "translate(0mm, 0mm)";
                });

                showToast("Kalibrasi di-reset ke bawaan secara global!", "info");
            } else {
                showToast(res.error || "Gagal mereset kalibrasi.", "danger");
            }
        } catch (e) {
            showToast("Koneksi server terputus.", "danger");
        }
    });

    const detailIds = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
    const detailSels = { date:".meta-item-tanggal", val:".meta-item-validasi", debet:".debet-box", kredit:".kredit-box", amount:".row-rp", terbilang:".row-terbilang", details:".row-keterangan" };
    detailIds.forEach(id => {
        document.getElementById(`cal-el-${id}-x`).addEventListener("input", (e) => {
            const previewEl = document.querySelector(`#printable-voucher-slip ${detailSels[id]}`);
            if (previewEl) { const y = document.getElementById(`cal-el-${id}-y`).value || 0; previewEl.style.transform = `translate(${e.target.value || 0}mm, ${y}mm)`; }
        });
        document.getElementById(`cal-el-${id}-y`).addEventListener("input", (e) => {
            const previewEl = document.querySelector(`#printable-voucher-slip ${detailSels[id]}`);
            if (previewEl) { const x = document.getElementById(`cal-el-${id}-x`).value || 0; previewEl.style.transform = `translate(${x}mm, ${e.target.value || 0}mm)`; }
        });
    });

    document.getElementById("btn-reset-tx").addEventListener("click", resetTxForm);
    document.getElementById("btn-save-tx").addEventListener("click", saveTransaction);
    document.getElementById("btn-print-slip").addEventListener("click", saveAndPrintTransaction);
    document.getElementById("btn-modal-print").addEventListener("click", () => { const s = document.querySelector("#modal-print-container .voucher-slip"); if (s) printElement(s); });

    const refreshAndRenderRiwayat = async () => {
        await refreshData();
        renderRiwayatView();
    };
    
    const refreshAndRenderAudit = async () => {
        await refreshData();
        renderAuditTrailView();
    };

    document.getElementById("riwayat-search").addEventListener("input", async () => {
        state.currentTxPage = 1;
        await refreshAndRenderRiwayat();
    });
    document.getElementById("riwayat-filter-code").addEventListener("change", async () => {
        state.currentTxPage = 1;
        await refreshAndRenderRiwayat();
    });
    document.getElementById("riwayat-filter-month").addEventListener("change", async () => {
        state.currentTxPage = 1;
        await refreshAndRenderRiwayat();
    });
    
    document.getElementById("riwayat-limit").addEventListener("change", async (e) => {
        state.paginationLimit = parseInt(e.target.value) || 50;
        state.currentTxPage = 1;
        await refreshAndRenderRiwayat();
    });
    
    document.getElementById("btn-first-riwayat").addEventListener("click", async () => {
        if (state.currentTxPage > 1) {
            state.currentTxPage = 1;
            await refreshAndRenderRiwayat();
        }
    });
    document.getElementById("btn-prev-riwayat").addEventListener("click", async () => {
        if (state.currentTxPage > 1) {
            state.currentTxPage--;
            await refreshAndRenderRiwayat();
        }
    });
    document.getElementById("btn-next-riwayat").addEventListener("click", async () => {
        if (state.currentTxPage < state.totalTxPages) {
            state.currentTxPage++;
            await refreshAndRenderRiwayat();
        }
    });
    document.getElementById("btn-last-riwayat").addEventListener("click", async () => {
        if (state.currentTxPage < state.totalTxPages) {
            state.currentTxPage = state.totalTxPages;
            await refreshAndRenderRiwayat();
        }
    });

    document.getElementById("btn-export-riwayat").addEventListener("click", exportRiwayatToCSV);

    document.getElementById("btn-submit-code").addEventListener("click", submitCostCode);
    document.getElementById("btn-cancel-code").addEventListener("click", resetCostCodeForm);
    document.getElementById("btn-export-codes").addEventListener("click", exportCostCodes);
    document.getElementById("import-codes-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importCostCodes(f); });
    document.getElementById("btn-download-template").addEventListener("click", (e) => { e.preventDefault(); downloadCostCodeTemplate(); });

    const refreshAndRenderCodes = async () => {
        await refreshData();
        renderKodeBiayaView();
    };

    document.getElementById("codes-search").addEventListener("input", async () => {
        state.currentCcPage = 1;
        await refreshAndRenderCodes();
    });

    document.getElementById("codes-limit").addEventListener("change", async (e) => {
        state.ccLimit = parseInt(e.target.value) || 50;
        state.currentCcPage = 1;
        await refreshAndRenderCodes();
    });

    document.getElementById("btn-first-codes").addEventListener("click", async () => {
        if (state.currentCcPage > 1) {
            state.currentCcPage = 1;
            await refreshAndRenderCodes();
        }
    });

    document.getElementById("btn-prev-codes").addEventListener("click", async () => {
        if (state.currentCcPage > 1) {
            state.currentCcPage--;
            await refreshAndRenderCodes();
        }
    });

    document.getElementById("btn-next-codes").addEventListener("click", async () => {
        if (state.currentCcPage < state.totalCcPages) {
            state.currentCcPage++;
            await refreshAndRenderCodes();
        }
    });

    document.getElementById("btn-last-codes").addEventListener("click", async () => {
        if (state.currentCcPage < state.totalCcPages) {
            state.currentCcPage = state.totalCcPages;
            await refreshAndRenderCodes();
        }
    });

    document.getElementById("btn-bulk-delete-codes").addEventListener("click", bulkDeleteSelectedCodes);
    const clearAllCodesBtn = document.getElementById("btn-clear-all-codes");
    if (clearAllCodesBtn) {
        clearAllCodesBtn.addEventListener("click", clearAllCostCodes);
    }
    document.getElementById("btn-submit-request-edit").addEventListener("click", submitEditRequest);

    document.getElementById("btn-add-user").addEventListener("click", openAddUserModal);
    document.getElementById("btn-submit-user").addEventListener("click", submitUser);
    document.getElementById("btn-export-users").addEventListener("click", exportUsers);
    document.getElementById("import-users-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importUsers(f); });
    document.getElementById("btn-download-user-template").addEventListener("click", (e) => { e.preventDefault(); downloadUserTemplate(); });

    document.getElementById("btn-add-other-checklist").addEventListener("click", addCustomChecklistItem);
    document.getElementById("btn-submit-slip-submission").addEventListener("click", submitSlipSubmission);
    document.getElementById("btn-refresh-submissions").addEventListener("click", fetchSubmissions);
    document.getElementById("btn-submit-confirm-arrival").addEventListener("click", submitConfirmArrival);
    document.getElementById("btn-stop-impersonate").addEventListener("click", async () => {
        try {
            const res = await authFetch('/api/auth/stop-impersonating', {
                method: 'POST'
            }).then(r => r.json());

            if (res.success) {
                showToast("Kembali ke akun asli...", "success");
                window.location.reload();
            } else {
                showToast(res.error || "Gagal menghentikan Login As.", "danger");
            }
        } catch (e) {
            console.error(e);
            showToast("Koneksi server terputus.", "danger");
        }
    });

    document.getElementById("audit-search").addEventListener("input", async () => {
        state.currentAuditPage = 1;
        await refreshAndRenderAudit();
    });
    document.getElementById("audit-filter-role").addEventListener("change", async () => {
        state.currentAuditPage = 1;
        await refreshAndRenderAudit();
    });
    
    document.getElementById("btn-prev-audit").addEventListener("click", async () => {
        if (state.currentAuditPage > 1) {
            state.currentAuditPage--;
            await refreshAndRenderAudit();
        }
    });
    document.getElementById("btn-next-audit").addEventListener("click", async () => {
        if (state.currentAuditPage < state.totalAuditPages) {
            state.currentAuditPage++;
            await refreshAndRenderAudit();
        }
    });
    
    document.getElementById("btn-clear-audit-logs").addEventListener("click", clearAuditLogs);

    const authenticated = await checkAuth();
    if (authenticated) {
        hideLoginScreen();
        await initApp();
    }
});
