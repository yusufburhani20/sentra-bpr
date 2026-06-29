import { state } from './js/state.js';
import { showToast, escapeHtml, openModal, closeModal, authFetch } from './js/utils.js';
import { showLoginScreen, hideLoginScreen, checkAuth, login, logout, changePassword } from './js/auth.js';
import { fetchNextRef, renderInputView, updateLiveSlipPreview, resetTxForm, saveTransaction, printElement } from './js/transactions.js';
import { renderRiwayatView, exportRiwayatToCSV, submitEditRequest } from './js/history.js';
import { renderKodeBiayaView, resetCostCodeForm, submitCostCode, exportCostCodes, importCostCodes, downloadCostCodeTemplate, bulkDeleteSelectedCodes, clearAllCostCodes } from './js/costCodes.js';
import { renderUsersView, openAddUserModal, submitUser, submitResetPassword } from './js/users.js';
import { renderAuditTrailView, clearAuditLogs, updateNotifBadge, renderNotifDropdown, markNotifsRead, startClock, initTheme, toggleTheme } from './js/system.js';
import { renderDashboardView } from './js/dashboard.js';
import { renderApprovalsView, fetchPendingApprovalsCount } from './js/approvals.js';
import { fetchSubmissions, setupSlipSubmissionForm, submitSlipSubmission, submitConfirmArrival, addCustomChecklistItem } from './js/slipSubmissions.js';

// Check Permissions
function checkPermission(view, role) {
    const permissions = {
        "dashboard": ["Admin", "Supervisor", "Teller", "SDM", "Kas"],
        "input": ["Admin", "Supervisor", "Teller", "SDM", "Kas"],
        "riwayat": ["Admin", "Supervisor", "Teller", "SDM", "Kas"],
        "kodebiaya": ["Admin"],
        "kirimslip": ["Admin", "Supervisor", "Teller", "SDM", "Kas"],
        "users": ["Admin"],
        "audit": ["Admin", "Supervisor"],
        "approvals": ["Admin", "Supervisor", "Teller", "SDM", "Kas"]
    };
    return permissions[view] ? permissions[view].includes(role) : false;
}

// 1. DATA SYNCHRONIZATION WITH BACKEND
export async function refreshData() {
    try {
        const searchVal = document.getElementById("riwayat-search") ? document.getElementById("riwayat-search").value : "";
        const codeVal = document.getElementById("riwayat-filter-code") ? document.getElementById("riwayat-filter-code").value : "";
        const dateVal = document.getElementById("riwayat-filter-date") ? document.getElementById("riwayat-filter-date").value : "";
        
        const auditSearchVal = document.getElementById("audit-search") ? document.getElementById("audit-search").value : "";
        const auditRoleVal = document.getElementById("audit-filter-role") ? document.getElementById("audit-filter-role").value : "";

        const [usersRes, codesRes, txRes, logsRes, notifRes, countersRes] = await Promise.all([
            fetch('/api/users').then(r => r.json()),
            fetch('/api/cost-codes?limit=10000').then(r => r.json()),
            fetch(`/api/transactions?page=${state.currentTxPage}&limit=${state.paginationLimit}&search=${encodeURIComponent(searchVal)}&code=${encodeURIComponent(codeVal)}&date=${encodeURIComponent(dateVal)}`).then(r => r.json()),
            fetch(`/api/audit-logs?page=${state.currentAuditPage}&limit=${state.paginationLimit}&search=${encodeURIComponent(auditSearchVal)}&role=${encodeURIComponent(auditRoleVal)}`).then(r => r.json()),
            fetch('/api/notifications').then(r => r.json()),
            fetch('/api/ref-counters').then(r => r.json())
        ]);
        
        state.usersDB = usersRes;
        state.costCodesDB = codesRes.data || [];
        
        state.transactionsDB = txRes.data || [];
        state.totalTxPages = txRes.totalPages || 1;
        state.totalTxCount = txRes.totalCount || 0;
        
        state.auditDB = logsRes.data || [];
        state.totalAuditPages = logsRes.totalPages || 1;
        state.totalAuditCount = logsRes.totalCount || 0;
        
        state.notifDB = notifRes;
        state.refCountersDB = Array.isArray(countersRes) ? countersRes : [];
    } catch (e) {
        console.error("Gagal sinkronisasi data dari server API:", e);
        showToast("Koneksi server terputus!", "danger");
    }
}

// Core routing and section displays
export async function showSection(sectionId) {
    if (sectionId !== "access-denied" && !checkPermission(sectionId, state.currentRole)) {
        sectionId = "access-denied";
    }

    state.activeView = sectionId;

    document.querySelectorAll(".view-section").forEach(view => {
        view.style.display = "none";
    });

    const activeElem = document.getElementById("view-" + sectionId);
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
        "kodebiaya": "Kelola Kode Biaya",
        "users": "Manajemen Pengguna",
        "audit": "System Audit Trail",
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
    } else if (sectionId === "kodebiaya") {
        renderKodeBiayaView();
    } else if (sectionId === "users") {
        renderUsersView();
    } else if (sectionId === "audit") {
        renderAuditTrailView();
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

    document.getElementById("nav-kodebiaya").style.display = checkPermission("kodebiaya", state.currentRole) ? "flex" : "none";
    document.getElementById("nav-users").style.display = checkPermission("users", state.currentRole) ? "flex" : "none";
    document.getElementById("nav-audit").style.display = checkPermission("audit", state.currentRole) ? "flex" : "none";
    document.getElementById("nav-approvals").style.display = checkPermission("approvals", state.currentRole) ? "flex" : "none";

    await showSection("dashboard");
    await fetchPendingApprovalsCount();

    setInterval(async () => {
        try {
            await refreshData();
            if (state.activeView === "riwayat") renderRiwayatView();
            else if (state.activeView === "audit") renderAuditTrailView();
            else if (state.activeView === "dashboard") renderDashboardView();
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

    document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

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

    document.getElementById("tx-debet-nama").addEventListener("input", (e) => {
        const found = state.costCodesDB.find(cc => cc.deskripsi === e.target.value);
        if (found) { document.getElementById("tx-debet-rekening").value = found.kode; updateLiveSlipPreview(); }
    });
    document.getElementById("tx-debet-rekening").addEventListener("input", (e) => {
        const found = state.costCodesDB.find(cc => cc.kode === e.target.value);
        if (found) { document.getElementById("tx-debet-nama").value = found.deskripsi; updateLiveSlipPreview(); }
    });
    document.getElementById("tx-kredit-nama").addEventListener("input", (e) => {
        const found = state.costCodesDB.find(cc => cc.deskripsi === e.target.value);
        if (found) { document.getElementById("tx-kredit-rekening").value = found.kode; updateLiveSlipPreview(); }
    });
    document.getElementById("tx-kredit-rekening").addEventListener("input", (e) => {
        const found = state.costCodesDB.find(cc => cc.kode === e.target.value);
        if (found) { document.getElementById("tx-kredit-nama").value = found.deskripsi; updateLiveSlipPreview(); }
    });

    // Calibration saves
    document.getElementById("btn-apply-calibration").addEventListener("click", () => {
        const printDataOnly = document.getElementById("print-data-only").checked;
        const offsetX = document.getElementById("cal-offset-x").value || "0";
        const offsetY = document.getElementById("cal-offset-y").value || "0";
        const slipWidth = document.getElementById("cal-slip-width").value || "15.5";
        const slipHeight = document.getElementById("cal-slip-height").value || "10.5";
        const slipScale = document.getElementById("cal-slip-scale").value || "100";
        const slipRotation = document.getElementById("cal-slip-rotation").value || "0";
        const pageSize = document.getElementById("cal-page-size").value || "slip";
        localStorage.setItem("simslip_cal_x", offsetX);
        localStorage.setItem("simslip_cal_y", offsetY);
        localStorage.setItem("simslip_width", slipWidth);
        localStorage.setItem("simslip_height", slipHeight);
        localStorage.setItem("simslip_scale", slipScale);
        localStorage.setItem("simslip_rotation", slipRotation);
        localStorage.setItem("simslip_page_size", pageSize);
        localStorage.setItem("simslip_print_only", printDataOnly);
        const detailIds = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
        detailIds.forEach(id => {
            const xVal = document.getElementById(`cal-el-${id}-x`).value || "0";
            const yVal = document.getElementById(`cal-el-${id}-y`).value || "0";
            localStorage.setItem(`simslip_offset_${id}_x`, xVal);
            localStorage.setItem(`simslip_offset_${id}_y`, yVal);
        });
        showToast("Kalibrasi berhasil diterapkan!", "success");
    });

    document.getElementById("btn-reset-calibration").addEventListener("click", () => {
        document.getElementById("cal-offset-x").value = "0";
        document.getElementById("cal-offset-y").value = "0";
        document.getElementById("cal-slip-width").value = "15.5";
        document.getElementById("cal-slip-height").value = "10.5";
        document.getElementById("cal-slip-scale").value = "100";
        document.getElementById("cal-slip-rotation").value = "0";
        document.getElementById("cal-page-size").value = "slip";
        document.getElementById("print-data-only").checked = true;
        ["simslip_cal_x","simslip_cal_y","simslip_width","simslip_height","simslip_scale","simslip_rotation","simslip_page_size","simslip_print_only"].forEach(k => localStorage.removeItem(k));
        const detailIds = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
        const detailSels = { date:".meta-item-tanggal", val:".meta-item-validasi", debet:".debet-box", kredit:".kredit-box", amount:".row-rp", terbilang:".row-terbilang", details:".row-keterangan" };
        detailIds.forEach(id => {
            document.getElementById(`cal-el-${id}-x`).value = "0";
            document.getElementById(`cal-el-${id}-y`).value = "0";
            localStorage.removeItem(`simslip_offset_${id}_x`);
            localStorage.removeItem(`simslip_offset_${id}_y`);
            const previewEl = document.querySelector(`#printable-voucher-slip ${detailSels[id]}`);
            if (previewEl) previewEl.style.transform = "translate(0mm, 0mm)";
        });
        showToast("Kalibrasi di-reset ke bawaan.", "info");
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
    document.getElementById("btn-print-slip").addEventListener("click", () => { printElement(document.getElementById("printable-voucher-slip")); });
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
    document.getElementById("riwayat-filter-date").addEventListener("change", async () => {
        state.currentTxPage = 1;
        await refreshAndRenderRiwayat();
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

    document.getElementById("btn-bulk-delete-codes").addEventListener("click", bulkDeleteSelectedCodes);
    const clearAllCodesBtn = document.getElementById("btn-clear-all-codes");
    if (clearAllCodesBtn) {
        clearAllCodesBtn.addEventListener("click", clearAllCostCodes);
    }
    document.getElementById("btn-submit-request-edit").addEventListener("click", submitEditRequest);

    document.getElementById("btn-add-user").addEventListener("click", openAddUserModal);
    document.getElementById("btn-submit-user").addEventListener("click", submitUser);

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
