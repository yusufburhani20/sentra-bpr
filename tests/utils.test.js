// Unit tests for pure helper functions (Indonesian Terbilang and Currency formatting)

function terbilang(nominal, desimal = 0) {
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

function formatRupiah(utama, desimal = 0) {
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

describe('Indonesian Terbilang Converter', () => {
    test('converts basic numbers correctly', () => {
        expect(terbilang(0)).toBe('Nol Rupiah');
        expect(terbilang(1)).toBe('Satu Rupiah');
        expect(terbilang(10)).toBe('Sepuluh Rupiah');
        expect(terbilang(11)).toBe('Sebelas Rupiah');
        expect(terbilang(15)).toBe('Lima Belas Rupiah');
        expect(terbilang(100)).toBe('Seratus Rupiah');
        expect(terbilang(1000)).toBe('Seribu Rupiah');
        expect(terbilang(10000)).toBe('Sepuluh Ribu Rupiah');
    });

    test('converts large numbers correctly', () => {
        expect(terbilang(1234567)).toBe('Satu Juta Dua Ratus Tiga Puluh Empat Ribu Lima Ratus Enam Puluh Tujuh Rupiah');
    });

    test('converts decimal values correctly', () => {
        expect(terbilang(10000, 31)).toBe('Sepuluh Ribu Koma Tiga Puluh Satu Rupiah');
        expect(terbilang(0, 50)).toBe('Nol Koma Lima Puluh Rupiah');
    });
});

describe('Currency Formatter (formatRupiah)', () => {
    test('formats Rupiah strings correctly', () => {
        expect(formatRupiah(10000, 31)).toBe('Rp 10.000,31');
        expect(formatRupiah(500, 0)).toBe('Rp 500,00');
        expect(formatRupiah(1000000, 99)).toBe('Rp 1.000.000,99');
    });

    test('formats floating point averages correctly', () => {
        expect(formatRupiah(16666666666666.668, 0)).toBe('Rp 16.666.666.666.666,67');
    });
});
