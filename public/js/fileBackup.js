import { authFetch, showToast } from './utils.js';

let currentPath = '';

export async function fetchFileBackupList(dir = currentPath) {
    const tbody = document.getElementById("filebackup-table-body");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">
        <i data-lucide="loader-2" class="animate-spin" style="width:18px; height:18px; display:inline-block; vertical-align:middle; margin-right:8px;"></i>
        Memuat daftar direktori...
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const res = await authFetch('/api/user-files/list?dir=' + encodeURIComponent(dir));
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Gagal mengambil daftar file");
        }

        currentPath = dir;
        updatePathDisplay();
        renderFileBackupTable(data);
    } catch (e) {
        console.error("Error fetching file backup list:", e);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:32px; color:var(--danger);">
            <i data-lucide="alert-triangle" style="width:18px; height:18px; display:inline-block; vertical-align:middle; margin-right:8px;"></i>
            ${e.message || "Gagal menghubungi server"}
        </td></tr>`;
        if (window.lucide) window.lucide.createIcons();
        showToast("Gagal memuat daftar direktori", "danger");
    }
}

function updatePathDisplay() {
    const pathEl = document.getElementById("filebackup-path");
    const upBtn = document.getElementById("btn-filebackup-up");
    
    if (pathEl) {
        pathEl.textContent = '/' + currentPath;
    }
    if (upBtn) {
        upBtn.style.display = currentPath ? 'inline-flex' : 'none';
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function renderFileBackupTable(files) {
    const tbody = document.getElementById("filebackup-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 32px; color: var(--text-muted);">Folder ini kosong.</td></tr>`;
        return;
    }

    files.forEach(file => {
        const tr = document.createElement("tr");

        const dateObj = new Date(file.modifiedAt);
        const dateFormatted = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        if (file.isDir) {
            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="folder" style="color:var(--primary); fill:var(--primary); width:16px; height:16px;"></i>
                        <a href="javascript:void(0)" class="btn-open-dir" data-path="${file.path}" style="font-weight:700; font-size:14px; text-decoration:none; color:var(--text-main);">${file.name}</a>
                    </div>
                </td>
                <td><span class="status-badge" style="background:#e2e8f0; color:#475569;">Folder</span></td>
                <td style="font-size:12px; color:var(--text-muted);">${dateFormatted}</td>
                <td style="text-align:center;">
                    <button class="btn btn-secondary btn-open-dir" data-path="${file.path}" style="padding:4px 10px; font-size:12px;">
                        Buka
                    </button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="file-text" style="color:var(--text-muted); width:16px; height:16px;"></i>
                        <span style="font-weight:600; font-size:13px;">${file.name}</span>
                    </div>
                </td>
                <td><span class="status-badge" style="background:#f1f5f9; color:#475569;">${formatBytes(file.size)}</span></td>
                <td style="font-size:12px; color:var(--text-muted);">${dateFormatted}</td>
                <td style="text-align:center;">
                    <button class="btn btn-primary btn-download-file" data-path="${file.path}" style="padding:4px 10px; font-size:12px; background:var(--success);">
                        <i data-lucide="download"></i> Download
                    </button>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();

    // Attach event listeners
    document.querySelectorAll(".btn-download-file").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const filepath = e.currentTarget.getAttribute("data-path");
            downloadFile(filepath);
        });
    });

    document.querySelectorAll(".btn-open-dir").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const dirpath = e.currentTarget.getAttribute("data-path");
            fetchFileBackupList(dirpath);
        });
    });
}

function downloadFile(filepath) {
    showToast(`Mempersiapkan unduhan...`, "info");
    
    authFetch(`/api/user-files/download?filepath=${encodeURIComponent(filepath)}`)
        .then(res => {
            if (!res.ok) throw new Error("Gagal mengunduh file.");
            return res.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Dapatkan nama file dari path
            a.download = filepath.split('/').pop() || 'download';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        })
        .catch(err => {
            console.error("Download error:", err);
            showToast("Gagal mengunduh file.", "danger");
        });
}

// Setup Event Listeners
export function setupFileBackup() {
    const btnRefresh = document.getElementById("btn-refresh-filebackup");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => fetchFileBackupList(currentPath));
    }

    const btnUp = document.getElementById("btn-filebackup-up");
    if (btnUp) {
        btnUp.addEventListener("click", () => {
            if (!currentPath) return;
            // Hapus segmen terakhir dari path
            let parts = currentPath.split('/');
            parts.pop();
            const parentDir = parts.join('/');
            fetchFileBackupList(parentDir);
        });
    }
}
