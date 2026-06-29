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

// ─── DEPLOY UPDATE PANEL ──────────────────────────────────────────────────────

export function initDeployPanel() {
    const btnOpen = document.getElementById('btn-open-deploy');
    const btnRun  = document.getElementById('btn-deploy-run');
    const modal   = document.getElementById('modal-deploy');

    if (!btnOpen || !modal) return;

    // Hanya tampilkan untuk Admin
    const role = state.currentRole || state.currentUser?.role;
    if (role !== 'Admin') {
        const deployCard = document.getElementById('deploy-card');
        if (deployCard) deployCard.style.display = 'none';
        return;
    }

    // Remove existing listeners by cloning button
    const newBtnOpen = btnOpen.cloneNode(true);
    btnOpen.parentNode.replaceChild(newBtnOpen, btnOpen);

    newBtnOpen.addEventListener('click', () => {
        resetDeployTerminal();
        modal.classList.add('active');
        if (window.lucide) window.lucide.createIcons();
    });

    // Wire up run button fresh
    const newBtnRun = btnRun.cloneNode(true);
    btnRun.parentNode.replaceChild(newBtnRun, btnRun);
    newBtnRun.addEventListener('click', () => runDeploy());
}

function resetDeployTerminal() {
    const terminal = document.getElementById('deploy-terminal');
    const statusText = document.getElementById('deploy-status-text');
    const btnRun = document.getElementById('btn-deploy-run');
    if (terminal) terminal.innerHTML = '<span style="color:#8b949e;">-- Menunggu perintah deploy... --</span>';
    if (statusText) { statusText.textContent = 'Siap menjalankan deploy.'; statusText.style.color = '#8b949e'; }
    if (btnRun) { btnRun.disabled = false; btnRun.innerHTML = '<i data-lucide="rocket" style="width:15px;height:15px;"></i> Mulai Deploy'; }
    if (window.lucide) window.lucide.createIcons();
}

function terminalLog(line, type = 'log') {
    const terminal = document.getElementById('deploy-terminal');
    if (!terminal) return;

    // Remove placeholder if still present
    const placeholder = terminal.querySelector('span[style*="8b949e"]');
    if (placeholder && terminal.children.length === 1) terminal.innerHTML = '';

    const colorMap = {
        log:     '#c9d1d9',
        info:    '#63b3ed',
        warn:    '#f6e05e',
        error:   '#fc8181',
        success: '#68d391',
    };

    const span = document.createElement('div');
    span.style.color = colorMap[type] || colorMap.log;
    span.style.marginBottom = '2px';
    if (type === 'success') span.style.fontWeight = '700';
    span.textContent = line;
    terminal.appendChild(span);
    terminal.scrollTop = terminal.scrollHeight;
}

async function runDeploy() {
    const btnRun     = document.getElementById('btn-deploy-run');
    const btnClose   = document.getElementById('btn-deploy-close');
    const statusText = document.getElementById('deploy-status-text');
    const terminal   = document.getElementById('deploy-terminal');

    // Reset terminal & disable button
    terminal.innerHTML = '';
    btnRun.disabled = true;
    btnRun.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i> Sedang Deploy...';
    btnClose.disabled = true;
    statusText.textContent = 'Proses deploy berjalan...';
    statusText.style.color = '#63b3ed';
    if (window.lucide) window.lucide.createIcons();

    terminalLog('$ Memulai proses deploy SENTRA BPR...', 'info');

    try {
        const response = await fetch('/api/system/deploy', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            terminalLog(`Error: ${err.error || response.statusText}`, 'error');
            statusText.textContent = '❌ Deploy gagal.';
            statusText.style.color = '#fc8181';
            btnRun.disabled = false;
            btnClose.disabled = false;
            btnRun.innerHTML = '<i data-lucide="rocket" style="width:15px;height:15px;"></i> Coba Lagi';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop(); // keep incomplete chunk

            for (const event of events) {
                const dataLine = event.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;
                try {
                    const payload = JSON.parse(dataLine.slice(5).trim());
                    if (payload.type === 'done') {
                        if (payload.success) {
                            terminalLog('', 'log');
                            terminalLog('✅ Deploy selesai! Server akan restart...', 'success');
                            statusText.textContent = '✅ Sukses! Halaman akan dimuat ulang dalam 5 detik...';
                            statusText.style.color = '#68d391';
                            btnRun.disabled = true;
                            // Auto-reload setelah server restart (beri waktu ~5 detik)
                            let countdown = 5;
                            const timer = setInterval(() => {
                                countdown--;
                                statusText.textContent = `✅ Sukses! Memuat ulang dalam ${countdown} detik...`;
                                if (countdown <= 0) {
                                    clearInterval(timer);
                                    window.location.reload();
                                }
                            }, 1000);
                        } else {
                            terminalLog('❌ Deploy gagal. Periksa output di atas.', 'error');
                            statusText.textContent = '❌ Deploy gagal.';
                            statusText.style.color = '#fc8181';
                            btnRun.disabled = false;
                            btnRun.innerHTML = '<i data-lucide="rocket" style="width:15px;height:15px;"></i> Coba Lagi';
                        }
                        btnClose.disabled = false;
                        if (window.lucide) window.lucide.createIcons();
                    } else {
                        terminalLog(payload.line, payload.type);
                    }
                } catch (e) { /* skip malformed events */ }
            }
        }
    } catch (err) {
        terminalLog(`Koneksi terputus: ${err.message}`, 'error');
        terminalLog('Ini normal jika server sedang restart.', 'warn');
        statusText.textContent = '🔁 Server sedang restart, memuat ulang halaman...';
        statusText.style.color = '#f6e05e';
        btnClose.disabled = false;
        setTimeout(() => window.location.reload(), 4000);
    }
}
