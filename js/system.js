import { state } from './state.js';
import { formatDate, escapeHtml, showToast } from './utils.js';
import { showSection } from '../app.js';

export function renderAuditTrailView() {
    const tbody = document.getElementById("audit-table-body");
    tbody.innerHTML = "";

    const filtered = state.auditDB;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Tidak ada rekaman log audit.</td></tr>';
        updateAuditPaginationUI(0, 0);
        return;
    }

    filtered.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><small>${formatDate(log.tanggal)}</small></td>
            <td><strong>${log.user}</strong></td>
            <td><span class="badge badge-info">${log.role}</span></td>
            <td class="log-message">${escapeHtml(log.aksi)}</td>
            <td><code>${log.ip}</code></td>
        `;
        tbody.appendChild(tr);
    });
    updateAuditPaginationUI(filtered.length, state.totalAuditCount);
}

export function updateAuditPaginationUI(shownCount, totalCount) {
    const startIdx = totalCount === 0 ? 0 : (state.currentAuditPage - 1) * state.paginationLimit + 1;
    const endIdx = startIdx + shownCount - (shownCount > 0 ? 1 : 0);
    const infoEl = document.getElementById("audit-pagination-info");
    if (infoEl) {
        if (totalCount === 0) {
            infoEl.innerText = "Menampilkan 0 dari 0 log";
        } else {
            infoEl.innerText = `Menampilkan ${startIdx}-${endIdx} dari ${totalCount} log`;
        }
    }
    const indicatorEl = document.getElementById("audit-page-indicator");
    if (indicatorEl) {
        indicatorEl.innerText = `Halaman ${state.currentAuditPage} / ${state.totalAuditPages}`;
    }
    
    const btnPrev = document.getElementById("btn-prev-audit");
    const btnNext = document.getElementById("btn-next-audit");
    if (btnPrev) btnPrev.disabled = state.currentAuditPage <= 1;
    if (btnNext) btnNext.disabled = state.currentAuditPage >= state.totalAuditPages;
}

export async function clearAuditLogs() {
    if (!confirm("Apakah Anda yakin ingin menghapus seluruh rekaman audit trail sistem?")) return;

    try {
        const res = await fetch('/api/audit-logs', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: state.currentUser.nama, userRole: state.currentUser.role })
        }).then(r => r.json());

        if (res.success) {
            showToast("Seluruh berkas audit log dikosongkan.", "success");
            await showSection("audit");
        }
    } catch (e) {
        console.error(e);
    }
}

export function updateNotifBadge() {
    const unread = state.notifDB.filter(n => n.dibaca === 0).length;
    const badge = document.getElementById("notif-badge");
    if (badge) {
        if (unread > 0) {
            badge.innerText = unread;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }
}

export function renderNotifDropdown() {
    const container = document.getElementById("notif-list-container");
    container.innerHTML = "";

    if (state.notifDB.length === 0) {
        container.innerHTML = '<div class="notif-item"><span class="notif-title">Tidak ada notifikasi baru</span></div>';
        return;
    }

    state.notifDB.slice(0, 10).forEach(notif => {
        const item = document.createElement("div");
        item.className = `notif-item ${notif.dibaca === 0 ? 'unread' : ''}`;
        item.innerHTML = `
            <span class="notif-title">${escapeHtml(notif.pesan)}</span>
            <span class="notif-time">${formatDate(notif.tanggal)}</span>
        `;
        container.appendChild(item);
    });
}

export async function markNotifsRead() {
    try {
        await fetch('/api/notifications/read', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userRole: state.currentRole })
        });
        // We will trigger showSection of active section or refresh data
        // For simplicity, just fetch notifications directly and render
        const notifRes = await fetch('/api/notifications').then(r => r.json());
        state.notifDB = notifRes;
        updateNotifBadge();
        renderNotifDropdown();
    } catch (e) {
        console.error(e);
    }
}

export function startClock() {
    function updateClock() {
        const now = new Date();
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        const dayStr = days[now.getDay()];
        const dateStr = now.getDate();
        const monthStr = months[now.getMonth()];
        const yearStr = now.getFullYear();
        const timeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
        
        const clockEl = document.getElementById("current-system-time");
        if (clockEl) {
            clockEl.innerText = `${dayStr}, ${dateStr} ${monthStr} ${yearStr} - ${timeStr}`;
        }
    }
    updateClock();
    setInterval(updateClock, 30000);
}

export function initTheme() {
    const currentTheme = localStorage.getItem("simslip_theme") || "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    updateThemeIcon(currentTheme);
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("simslip_theme", newTheme);
    updateThemeIcon(newTheme);
    showToast(`Tema diganti ke mode ${newTheme === "dark" ? "Gelap" : "Terang"}`, "info");
}

export function updateThemeIcon(theme) {
    const icon = document.getElementById("theme-icon");
    if (icon) {
        if (theme === "dark") {
            icon.setAttribute("data-lucide", "sun");
        } else {
            icon.setAttribute("data-lucide", "moon");
        }
    }
    if (window.lucide) window.lucide.createIcons();
}
