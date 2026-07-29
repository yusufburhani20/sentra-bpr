import { showLoginScreen } from './auth.js';

// Indonesian Terbilang Converter
export function terbilang(nominal, desimal = 0) {
    const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
    
    function konversi(n) {
        if (n < 0) return "Minus " + konversi(Math.abs(n));
        if (n < 12) return angka[n];
        if (n < 20) return konversi(n - 10) + " Belas";
        if (n < 100) return konversi(Math.floor(n / 10)) + " Puluh " + konversi(n % 10);
        if (n < 200) return "Seratus " + konversi(n - 100);
        if (n < 1000) return konversi(Math.floor(n / 100)) + " Ratus " + konversi(n % 100);
        if (n < 2000) return "Seribu " + konversi(n - 1000);
        if (n < 1000000) return konversi(Math.floor(n / 1000)) + " Ribu " + konversi(n % 1000);
        if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + " Juta " + konversi(n % 1000000);
        if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + " Milyar " + konversi(n % 1000000000);
        if (n < 1000000000000000) return konversi(Math.floor(n / 1000000000000)) + " Trilyun " + konversi(n % 1000000000000);
        return "";
    }

    let hasil = konversi(Math.floor(nominal));
    if (hasil === "") hasil = "Nol";
    hasil += " Rupiah";

    if (desimal > 0) {
        const desimalTeks = konversi(desimal);
        hasil = hasil.replace(" Rupiah", "") + " Koma " + desimalTeks + " Rupiah";
    }
    
    return hasil.replace(/\s+/g, ' ').trim();
}

// Format currency display
export function formatRupiah(utama, desimal = 0) {
    const isNegative = utama < 0;
    let total = Math.abs(Number(utama) || 0);
    if (desimal > 0) {
        total += desimal / 100;
    }
    const parts = total.toFixed(2).split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${isNegative ? '-' : ''}Rp ${formattedInteger},${decimalPart}`;
}

// Format Date
export function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Escape HTML utility
export function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// In-App Toast Alert System
export function showToast(message, type = "success") {
    const stack = document.getElementById("toast-stack");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconName = "check-circle2";
    if (type === "warning") iconName = "alert-circle";
    else if (type === "danger") iconName = "x-circle";
    else if (type === "info") iconName = "info";

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div style="font-size: 13px; font-weight: 600;">${message}</div>
    `;

    stack.appendChild(toast);
    if (window.lucide) {
        window.lucide.createIcons();
    }

    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (stack.contains(toast)) stack.removeChild(toast);
        }, 300);
    }, 3500);
}

export function openModal(modalId) {
    document.getElementById(modalId).classList.add("active");
}
window.openModal = openModal;

export function closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
}
window.closeModal = closeModal;

// Authenticated fetch — redirects to login on 401
export async function authFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        try {
            const clone = res.clone();
            const data = await clone.json();
            if (data && data.error) {
                // If it is NOT a password validation error, treat as session expired
                const isPasswordError = data.error.toLowerCase().includes('password') || data.error.toLowerCase().includes('sandi');
                if (!isPasswordError) {
                    showToast(data.error || 'Sesi berakhir. Silakan login kembali.', 'warning');
                    showLoginScreen();
                    throw new Error('SESSION_EXPIRED');
                }
            } else {
                showToast('Sesi berakhir. Silakan login kembali.', 'warning');
                showLoginScreen();
                throw new Error('SESSION_EXPIRED');
                
            }
        } catch (e) {
            if (e.message === 'SESSION_EXPIRED') throw e;
            showToast('Sesi berakhir. Silakan login kembali.', 'warning');
            showLoginScreen();
            throw new Error('SESSION_EXPIRED');
        }
    }
    return res;
}
