import { state } from './state.js';
import { formatRupiah, terbilang, showToast, authFetch } from './utils.js';

export async function fetchNextRef() {
    if (!state.currentUser) return;
    try {
        const res = await fetch(`/api/transactions/next-ref?operator=${state.currentUser.operator_code}`).then(r => r.json());
        state.activeNextRef = res.nextRef;
        const validationEl = document.getElementById("slip-val-validation");
        if (validationEl) validationEl.innerText = state.activeNextRef;
    } catch (e) {
        console.error("Gagal mengambil nomor referensi berikutnya:", e);
    }
}

export async function renderInputView() {
    const nameDatalists = ["debet-nama-list", "kredit-nama-list"];
    const rekDatalists = ["debet-rekening-list", "kredit-rekening-list"];
    
    nameDatalists.forEach(id => {
        const dl = document.getElementById(id);
        if (dl) dl.innerHTML = "";
    });

    rekDatalists.forEach(id => {
        const dl = document.getElementById(id);
        if (dl) dl.innerHTML = "";
    });

    const today = new Date();
    const dayStr = String(today.getDate()).padStart(2, '0');
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    document.getElementById("slip-val-date").innerText = `${dayStr}/${monthStr}/${year}`;
    
    let settings = {};
    try {
        settings = await authFetch('/api/system/settings').then(r => r.json());
    } catch (e) {
        console.error("Gagal mengambil konfigurasi cetak global:", e);
    }

    const savedOffsetX = settings.simslip_cal_x || "0";
    const savedOffsetY = settings.simslip_cal_y || "0";
    const savedWidth = settings.simslip_width || "15.5";
    const savedHeight = settings.simslip_height || "10.5";
    const savedScale = settings.simslip_scale || "100";
    const savedRotation = settings.simslip_rotation || "0";
    const savedPageSize = settings.simslip_page_size || "slip";
    const printOnlyChecked = settings.simslip_print_only !== "false";
    
    document.getElementById("cal-offset-x").value = savedOffsetX;
    document.getElementById("cal-offset-y").value = savedOffsetY;
    document.getElementById("cal-slip-width").value = savedWidth;
    document.getElementById("cal-slip-height").value = savedHeight;
    document.getElementById("cal-slip-scale").value = savedScale;
    document.getElementById("cal-slip-rotation").value = savedRotation;
    document.getElementById("cal-page-size").value = savedPageSize;
    document.getElementById("print-data-only").checked = printOnlyChecked;

    // Sembunyikan/nonaktifkan kontrol untuk non-Admin
    const isAdmin = state.currentUser && state.currentUser.role === 'Admin';
    const calInputs = [
        "cal-offset-x", "cal-offset-y", "cal-slip-width", "cal-slip-height", 
        "cal-slip-scale", "cal-slip-rotation", "cal-page-size", "cal-enable-drag"
    ];
    calInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isAdmin;
    });

    const applyBtn = document.getElementById("btn-apply-calibration");
    const resetBtn = document.getElementById("btn-reset-calibration");
    if (applyBtn) applyBtn.style.display = isAdmin ? "inline-block" : "none";
    if (resetBtn) resetBtn.style.display = isAdmin ? "inline-block" : "none";

    await fetchNextRef();
    updateLiveSlipPreview();

    const detailElements = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
    const detailSelectors = {
        date: ".meta-item-tanggal",
        val: ".meta-item-validasi",
        debet: ".debet-box",
        kredit: ".kredit-box",
        amount: ".row-rp",
        terbilang: ".row-terbilang",
        details: ".row-keterangan"
    };

    detailElements.forEach(id => {
        const savedX = settings[`simslip_offset_${id}_x`] || "0";
        const savedY = settings[`simslip_offset_${id}_y`] || "0";
        
        document.getElementById(`cal-el-${id}-x`).value = savedX;
        document.getElementById(`cal-el-${id}-y`).value = savedY;

        const previewEl = document.querySelector(`#printable-voucher-slip ${detailSelectors[id]}`);
        if (previewEl) {
            previewEl.style.transform = `translate(${savedX}mm, ${savedY}mm)`;
        }
    });
}

export function updateLiveSlipPreview() {
    const debetNama = document.getElementById("tx-debet-nama").value;
    const debetRek = document.getElementById("tx-debet-rekening").value;
    const kreditNama = document.getElementById("tx-kredit-nama").value;
    const kreditRek = document.getElementById("tx-kredit-rekening").value;
    const nominalUtama = parseFloat(document.getElementById("tx-nominal-utama").value) || 0;
    const nominalDesimal = parseInt(document.getElementById("tx-nominal-desimal").value) || 0;
    const keterangan = document.getElementById("tx-keterangan").value;

    document.getElementById("slip-val-debet-nama").innerText = debetNama || "-";
    document.getElementById("slip-val-debet-rekening").innerText = debetRek || "-";
    document.getElementById("slip-val-kredit-nama").innerText = kreditNama || "-";
    document.getElementById("slip-val-kredit-rekening").innerText = kreditRek || "-";
    document.getElementById("slip-val-amount").innerText = formatRupiah(nominalUtama, nominalDesimal).replace("Rp ", "");
    document.getElementById("slip-val-terbilang").innerText = terbilang(nominalUtama, nominalDesimal);
    document.getElementById("slip-val-details").innerText = keterangan || "-";
    
    document.getElementById("slip-val-validation").innerText = state.activeNextRef || (state.currentUser ? state.currentUser.operator_code : "");
}

export function resetTxForm(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }
    document.getElementById("tx-debet-nama").value = "";
    document.getElementById("tx-debet-rekening").value = "";
    document.getElementById("tx-kredit-nama").value = "";
    document.getElementById("tx-kredit-rekening").value = "";
    document.getElementById("tx-nominal-utama").value = "";
    document.getElementById("tx-nominal-desimal").value = "";
    document.getElementById("tx-keterangan").value = "";
    updateLiveSlipPreview();
    fetchNextRef();
    showToast("Formulir isian dikosongkan.", "info");
}

export async function saveTransaction() {
    const debetNama = document.getElementById("tx-debet-nama").value;
    const debetRek = document.getElementById("tx-debet-rekening").value;
    const kreditNama = document.getElementById("tx-kredit-nama").value;
    const kreditRek = document.getElementById("tx-kredit-rekening").value;
    const nominalUtama = parseFloat(document.getElementById("tx-nominal-utama").value) || 0;
    const nominalDesimal = parseInt(document.getElementById("tx-nominal-desimal").value) || 0;
    const keterangan = document.getElementById("tx-keterangan").value;

    if (!debetNama || !debetRek) {
        showToast("Isi Nama Perkiraan dan Rekening Debet!", "warning");
        return;
    }
    if (!kreditNama || !kreditRek) {
        showToast("Isi Nama Perkiraan dan Rekening Kredit/Lawan!", "warning");
        return;
    }
    if (nominalUtama <= 0) {
        showToast("Nominal Utama harus lebih besar dari 0!", "warning");
        return;
    }

    if (!state.activeNextRef || state.activeNextRef.trim() === "") {
        showToast("Nomor referensi belum dimuat atau kosong. Silakan muat ulang halaman.", "warning");
        return;
    }

    const payload = {
        ref_no: state.activeNextRef,
        operator_code: state.currentUser.operator_code,
        debet_nama: debetNama,
        debet_rekening: debetRek,
        kredit_nama: kreditNama,
        kredit_rekening: kreditRek,
        jenis_transaksi: kreditNama,
        nominal_utama: nominalUtama,
        nominal_desimal: nominalDesimal,
        keterangan: keterangan,
        terbilang: terbilang(nominalUtama, nominalDesimal),
        username: state.currentUser.nama,
        userRole: state.currentUser.role
    };

    try {
        const res = await authFetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast("Transaksi berhasil disimpan ke database!", "success");
            resetTxForm();
        } else {
            showToast(res.error || "Gagal menyimpan transaksi.", "danger");
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            console.error(e);
            showToast("Gagal menghubungi server backend.", "danger");
        }
    }
}

export function printElement(el, onCleanup) {
    const printDataOnly = document.getElementById("print-data-only").checked;
    const offsetX = parseFloat(document.getElementById("cal-offset-x").value) || 0;
    const offsetY = parseFloat(document.getElementById("cal-offset-y").value) || 0;
    const slipWidth = parseFloat(document.getElementById("cal-slip-width").value) || 15.5;
    const slipHeight = parseFloat(document.getElementById("cal-slip-height").value) || 10.5;
    
    const printHeight = slipHeight;
    
    const slipScale = (parseFloat(document.getElementById("cal-slip-scale").value) || 100) / 100;
    const slipRotation = parseInt(document.getElementById("cal-slip-rotation").value) || 0;
    const pageSize = document.getElementById("cal-page-size").value || "slip";

    const parent = el.parentNode;
    const nextSibling = el.nextSibling;

    const wrapper = document.createElement("div");
    wrapper.className = "print-wrapper";

    let pageW, pageH, sizeRule;
    if (pageSize === "a4") {
        pageW = 21;
        pageH = 29.7;
        sizeRule = "A4 portrait";
    } else {
        if (slipRotation === 90 || slipRotation === 270) {
            pageW = printHeight;
            pageH = slipWidth;
        } else {
            pageW = slipWidth;
            pageH = printHeight;
        }
        sizeRule = `${pageW}cm ${pageH}cm`;
    }

    wrapper.style.setProperty("--page-width", `${pageW}cm`);
    wrapper.style.setProperty("--page-height", `${pageH}cm`);

    el.style.setProperty("--print-offset-x", `${offsetX}mm`);
    el.style.setProperty("--print-offset-y", `${offsetY}mm`);
    el.style.setProperty("--print-slip-width", `${slipWidth}cm`);
    el.style.setProperty("--print-slip-height", `${printHeight}cm`);

    let transformStr = "";
    if (pageSize === "a4") {
        transformStr = `scale(${slipScale})`;
    } else {
        if (slipRotation === 0) {
            transformStr = `scale(${slipScale})`;
        } else if (slipRotation === 90) {
            transformStr = `translate(${printHeight * slipScale}cm, 0) rotate(90deg) scale(${slipScale})`;
        } else if (slipRotation === 180) {
            transformStr = `translate(${slipWidth * slipScale}cm, ${printHeight * slipScale}cm) rotate(180deg) scale(${slipScale})`;
        } else if (slipRotation === 270) {
            transformStr = `translate(0, ${slipWidth * slipScale}cm) rotate(270deg) scale(${slipScale})`;
        }
    }
    el.style.setProperty("--print-transform", transformStr);

    if (printDataOnly) {
        el.classList.add("print-data-only-active");
    } else {
        el.classList.remove("print-data-only-active");
    }

    const styleBlock = document.createElement("style");
    styleBlock.id = "print-page-style";
    styleBlock.innerHTML = `
        @media print {
            @page {
                size: ${sizeRule};
                margin: 0;
            }
        }
    `;
    document.head.appendChild(styleBlock);

    const detailElements = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
    const detailSelectors = {
        date: ".meta-item-tanggal",
        val: ".meta-item-validasi",
        debet: ".debet-box",
        kredit: ".kredit-box",
        amount: ".row-rp",
        terbilang: ".row-terbilang",
        details: ".row-keterangan"
    };

    detailElements.forEach(id => {
        const x = parseFloat(document.getElementById(`cal-el-${id}-x`).value) || 0;
        const y = parseFloat(document.getElementById(`cal-el-${id}-y`).value) || 0;
        const child = el.querySelector(detailSelectors[id]);
        if (child) {
            const printY = y;
            child.style.setProperty("transform", `translate(${x}mm, ${printY}mm)`, "important");
        }
    });

    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    document.body.classList.add("printing-active");

    // Cleanup dijalankan setelah dialog print ditutup (afterprint),
    function cleanupAfterPrint() {
        document.body.classList.remove("printing-active");

        if (document.body.contains(wrapper)) {
            document.body.removeChild(wrapper);
        }
        const styleEl = document.getElementById("print-page-style");
        if (styleEl) styleEl.parentNode.removeChild(styleEl);

        el.classList.remove("print-data-only-active");
        el.style.removeProperty("--print-offset-x");
        el.style.removeProperty("--print-offset-y");
        el.style.removeProperty("--print-slip-width");
        el.style.removeProperty("--print-slip-height");
        el.style.removeProperty("--print-transform");

        detailElements.forEach(id => {
            const child = el.querySelector(detailSelectors[id]);
            if (child) {
                if (el.id === "printable-voucher-slip") {
                    const x = parseFloat(document.getElementById(`cal-el-${id}-x`).value) || 0;
                    const y = parseFloat(document.getElementById(`cal-el-${id}-y`).value) || 0;
                    child.style.setProperty("transform", `translate(${x}mm, ${y}mm)`);
                } else {
                    child.style.removeProperty("transform");
                }
            }
        });

        if (nextSibling) {
            parent.insertBefore(el, nextSibling);
        } else {
            parent.appendChild(el);
        }

        if (typeof onCleanup === "function") {
            onCleanup();
        }
    }

    // { once: true } memastikan cleanup hanya berjalan satu kali
    window.addEventListener("afterprint", cleanupAfterPrint, { once: true });

    // requestAnimationFrame memberi browser satu frame untuk merender
    // DOM dengan class printing-active sebelum dialog dibuka
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            window.print();
        });
    });
}

export async function saveAndPrintTransaction() {
    const debetNama = document.getElementById("tx-debet-nama").value;
    const debetRek = document.getElementById("tx-debet-rekening").value;
    const kreditNama = document.getElementById("tx-kredit-nama").value;
    const kreditRek = document.getElementById("tx-kredit-rekening").value;
    const nominalUtama = parseFloat(document.getElementById("tx-nominal-utama").value) || 0;
    const nominalDesimal = parseInt(document.getElementById("tx-nominal-desimal").value) || 0;
    const keterangan = document.getElementById("tx-keterangan").value;

    if (!debetNama || !debetRek) {
        showToast("Isi Nama Perkiraan dan Rekening Debet!", "warning");
        return;
    }
    if (!kreditNama || !kreditRek) {
        showToast("Isi Nama Perkiraan dan Rekening Kredit/Lawan!", "warning");
        return;
    }
    if (nominalUtama <= 0) {
        showToast("Nominal Utama harus lebih besar dari 0!", "warning");
        return;
    }

    if (!state.activeNextRef || state.activeNextRef.trim() === "") {
        showToast("Nomor referensi belum dimuat atau kosong. Silakan muat ulang halaman.", "warning");
        return;
    }

    const payload = {
        ref_no: state.activeNextRef,
        operator_code: state.currentUser.operator_code,
        debet_nama: debetNama,
        debet_rekening: debetRek,
        kredit_nama: kreditNama,
        kredit_rekening: kreditRek,
        jenis_transaksi: kreditNama,
        nominal_utama: nominalUtama,
        nominal_desimal: nominalDesimal,
        keterangan: keterangan,
        terbilang: terbilang(nominalUtama, nominalDesimal),
        username: state.currentUser.nama,
        userRole: state.currentUser.role
    };

    try {
        const res = await authFetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            showToast("Transaksi berhasil disimpan ke database!", "success");
            // Cetak slip dengan melemparkan callback untuk membersihkan form SETELAH cetak selesai
            printElement(document.getElementById("printable-voucher-slip"), () => {
                resetTxForm();
            });
        } else {
            showToast(res.error || "Gagal menyimpan transaksi.", "danger");
        }
    } catch (e) {
        if (e.message !== 'SESSION_EXPIRED') {
            console.error(e);
            showToast("Gagal menghubungi server backend.", "danger");
        }
    }
}

export function initLayoutDragAndDrop() {
    const elements = ["date", "val", "debet", "kredit", "amount", "terbilang", "details"];
    const selectors = {
        date: ".meta-item-tanggal",
        val: ".meta-item-validasi",
        debet: ".debet-box",
        kredit: ".kredit-box",
        amount: ".row-rp",
        terbilang: ".row-terbilang",
        details: ".row-keterangan"
    };

    const toggleDragCheckbox = document.getElementById("cal-enable-drag");
    if (!toggleDragCheckbox) return;

    toggleDragCheckbox.addEventListener("change", (e) => {
        const isEnabled = e.target.checked;
        elements.forEach(id => {
            const el = document.querySelector(`#printable-voucher-slip ${selectors[id]}`);
            if (el) {
                if (isEnabled) {
                    el.classList.add("draggable-print-element");
                } else {
                    el.classList.remove("draggable-print-element");
                }
            }
        });
    });

    elements.forEach(id => {
        const targetEl = document.querySelector(`#printable-voucher-slip ${selectors[id]}`);
        if (!targetEl) return;

        targetEl.addEventListener("pointerdown", (e) => {
            if (!toggleDragCheckbox.checked) return;
            e.preventDefault();
            targetEl.setPointerCapture(e.pointerId);
            targetEl.classList.add("dragging-active");

            const startX = e.clientX;
            const startY = e.clientY;

            const inputXEl = document.getElementById(`cal-el-${id}-x`);
            const inputYEl = document.getElementById(`cal-el-${id}-y`);
            const startValX = parseFloat(inputXEl.value) || 0;
            const startValY = parseFloat(inputYEl.value) || 0;

            const slipContainer = document.getElementById("printable-voucher-slip");
            const rect = slipContainer.getBoundingClientRect();
            const scaleFactor = 155 / (rect.width || 1);

            function onPointerMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                const newX = startValX + dx * scaleFactor;
                const newY = startValY + dy * scaleFactor;

                const roundedX = Math.round(newX);
                const roundedY = Math.round(newY);

                inputXEl.value = roundedX;
                inputYEl.value = roundedY;

                targetEl.style.transform = `translate(${roundedX}mm, ${roundedY}mm)`;
            }

            function onPointerUp(ev) {
                targetEl.releasePointerCapture(ev.pointerId);
                targetEl.classList.remove("dragging-active");
                targetEl.removeEventListener("pointermove", onPointerMove);
                targetEl.removeEventListener("pointerup", onPointerUp);
            }

            targetEl.addEventListener("pointermove", onPointerMove);
            targetEl.addEventListener("pointerup", onPointerUp);
        });
    });
}

/**
 * Highlight matching text in a string (returns HTML string).
 */
function highlightMatch(text, query) {
    if (!query) return escapeHtmlStr(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtmlStr(text).replace(new RegExp(`(${escaped})`, 'gi'), '<span class="pk-highlight">$1</span>');
}

function escapeHtmlStr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Create a custom PK combobox that shows kode + nama in every row,
 * syncs the paired field, and triggers updateLiveSlipPreview on selection.
 *
 * @param {string} inputId        - ID of the text input
 * @param {string} dropdownId     - ID of the .pk-combo-dropdown div
 * @param {'name'|'code'} mode    - whether this field shows nama or kode
 * @param {string} pairedInputId  - ID of the other (paired) field to sync
 */
export function setupPKCombobox(inputId, dropdownId, mode, pairedInputId) {
    const inputEl = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const wrapper = inputEl ? inputEl.closest('.pk-combobox') : null;
    const arrowBtn = wrapper ? wrapper.querySelector('.pk-combo-arrow') : null;
    if (!inputEl || !dropdown || !wrapper) return;

    let debounceTimer = null;
    let currentQuery = '';
    let activeIndex = -1;
    let lastResults = [];
    let suppressNextInput = false; // Prevent search re-trigger after programmatic selection

    function openDropdown() {
        wrapper.classList.add('open');
    }

    function closeDropdown() {
        wrapper.classList.remove('open');
        activeIndex = -1;
    }

    function renderResults(results, query) {
        lastResults = results;
        activeIndex = -1;
        dropdown.innerHTML = '';

        if (!results || results.length === 0) {
            dropdown.innerHTML = `<div class="pk-combo-empty">Tidak ada hasil untuk <strong>"${escapeHtmlStr(query)}"</strong></div>`;
            return;
        }

        results.forEach((cc, idx) => {
            const item = document.createElement('div');
            item.className = 'pk-combo-item';
            item.dataset.index = idx;
            item.innerHTML = `
                <span class="pk-item-kode">${highlightMatch(cc.kode, query)}</span>
                <span class="pk-item-nama">${highlightMatch(cc.deskripsi, query)}</span>
            `;
            item.addEventListener('mousedown', (e) => {
                // use mousedown so blur doesn't close first
                e.preventDefault();
                selectItem(cc);
            });
            dropdown.appendChild(item);
        });
    }

    function selectItem(cc) {
        // Suppress the next 'input' event so the search doesn't re-trigger
        suppressNextInput = true;

        if (mode === 'name') {
            inputEl.value = cc.deskripsi;
        } else {
            inputEl.value = cc.kode;
        }

        // Sync paired field (no input dispatch needed — it's a programmatic set)
        const pairedEl = pairedInputId ? document.getElementById(pairedInputId) : null;
        if (pairedEl) {
            pairedEl.value = (mode === 'name') ? cc.kode : cc.deskripsi;
        }

        closeDropdown();

        // Update live preview directly (function is in same module scope)
        updateLiveSlipPreview();

        // Notify app.js listeners via custom event (does NOT trigger 'input' listener)
        inputEl.dispatchEvent(new CustomEvent('pk-selected', { bubbles: true, detail: cc }));
    }

    async function doSearch(q) {
        dropdown.innerHTML = `<div class="pk-combo-loading"><svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Mencari...</div>`;
        openDropdown();
        try {
            const url = q.length > 0
                ? `/api/cost-codes/search?query=${encodeURIComponent(q)}&limit=20`
                : `/api/cost-codes/search?query=&limit=20`;
            const results = await authFetch(url).then(r => r.json());
            currentQuery = q;
            renderResults(results, q);
        } catch (err) {
            dropdown.innerHTML = `<div class="pk-combo-empty">Gagal memuat data.</div>`;
        }
    }

    // Input event: debounced search — skip if we just programmatically selected
    inputEl.addEventListener('input', () => {
        if (suppressNextInput) {
            suppressNextInput = false;
            return;
        }
        const val = inputEl.value.trim();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => doSearch(val), 150);
        openDropdown();
    });

    // Click/focus on input: show top results immediately (but not right after a selection)
    inputEl.addEventListener('focus', () => {
        if (suppressNextInput) return;
        if (!wrapper.classList.contains('open')) {
            doSearch(inputEl.value.trim());
        }
    });

    // Arrow button: toggle dropdown
    if (arrowBtn) {
        arrowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (wrapper.classList.contains('open')) {
                closeDropdown();
            } else {
                inputEl.focus();
                doSearch(inputEl.value.trim());
            }
        });
    }

    // Keyboard navigation
    inputEl.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.pk-combo-item');
        if (!wrapper.classList.contains('open')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && lastResults[activeIndex]) {
                selectItem(lastResults[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    function updateActiveItem(items) {
        items.forEach((el, i) => {
            el.classList.toggle('active', i === activeIndex);
        });
        if (activeIndex >= 0) {
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            closeDropdown();
        }
    }, true);
}

// Kept for backward compatibility — no-op for old datalist logic
let debounceTimers = {};
export function setupAutocompleteSearch(inputId, datalistId, mode) {
    // This function is replaced by setupPKCombobox.
    // Retained as a no-op export so existing import statements don't break.
}

