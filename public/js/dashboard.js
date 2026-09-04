import { state } from './state.js';
import { formatRupiah } from './utils.js';

let chartVolumeTrend = null;
let chartCcDistribution = null;
let chartOperatorActivity = null;

let lastDashboardDataStr = null;

export async function renderDashboardView() {
    try {
        const filterEl = document.getElementById("dashboard-branch-filter");
        const selectedBranch = filterEl ? filterEl.value : "";
        const container = document.getElementById("dashboard-filter-container");

        const isSuperAdmin = state.currentRole === 'Super Admin';
        const isAdmin = state.currentRole === 'Admin';
        const handledBranches = (state.currentUser && state.currentUser.handled_branches) ? state.currentUser.handled_branches : [];

        // Show/hide filter container
        if (isSuperAdmin || (isAdmin && handledBranches.length > 1)) {
            if (container) container.style.display = "block";

            if (filterEl && filterEl.options.length <= 1) {
                try {
                    const bRes = await window.authFetch('/api/branches');
                    if (bRes.ok) {
                        const branches = await bRes.json();
                        if (Array.isArray(branches)) {
                            branches.forEach(b => {
                                if (isSuperAdmin || handledBranches.includes(b.id)) {
                                    // Cegah duplikasi jika dipanggil 2x bersamaan
                                    if (!Array.from(filterEl.options).some(opt => opt.value === b.id)) {
                                        const opt = document.createElement("option");
                                        opt.value = b.id;
                                        opt.textContent = b.name;
                                        filterEl.appendChild(opt);
                                    }
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Gagal memuat cabang untuk filter dashboard", e);
                }

                // Pasang event listener sekali saja (setelah opsi cabang dimuat)
                filterEl.addEventListener("change", () => {
                    lastDashboardDataStr = null; // Reset cache agar re-render paksa
                    renderDashboardView();
                });
            }
        } else {
            if (container) container.style.display = "none";
        }

        // Fetch stats dengan filter branch yang dipilih
        const branchParam = selectedBranch ? `?branch=${encodeURIComponent(selectedBranch)}` : "";
        const res = await fetch(`/api/dashboard/stats${branchParam}`).then(r => r.json());
        if (!res.success) return;

        const dataStr = selectedBranch + JSON.stringify(res);
        if (dataStr === lastDashboardDataStr && chartVolumeTrend) return; // Skip re-render if data unchanged
        lastDashboardDataStr = dataStr;

        const kpis = res.kpis;

        // Populate KPI values
        document.getElementById("dash-kpi-volume").innerText = formatRupiah(kpis.totalVolume);
        document.getElementById("dash-kpi-today-count").innerText = kpis.todayCount;
        document.getElementById("dash-kpi-avg").innerText = formatRupiah(kpis.avgValue);
        document.getElementById("dash-kpi-total-count").innerText = kpis.totalCount;

        const diffEl = document.getElementById("dash-kpi-yesterday-diff");
        if (diffEl) {
            diffEl.innerText = `vs kemarin: ${kpis.yesterdayCount}`;
        }

        // Color palettes
        const colors = [
            '#3b82f6', // primary blue
            '#10b981', // green
            '#f59e0b', // amber
            '#8b5cf6', // purple
            '#ec4899', // pink
            '#06b6d4', // cyan
            '#f97316'  // orange
        ];

        // 1. Line Chart: Trend Volume
        const ctxTrend = document.getElementById("chart-volume-trend").getContext("2d");
        if (chartVolumeTrend) chartVolumeTrend.destroy();
        
        chartVolumeTrend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: res.trend.map(t => t.tx_date),
                datasets: [{
                    label: 'Volume Transaksi (Rp)',
                    data: res.trend.map(t => t.tx_volume),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#3b82f6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return value >= 1000000 ? (value / 1000000) + 'jt' : value;
                            }
                        }
                    }
                }
            }
        });

        // 2. Doughnut Chart: Cost Code Distribution
        const ctxCc = document.getElementById("chart-cc-distribution").getContext("2d");
        if (chartCcDistribution) chartCcDistribution.destroy();

        const ccData = res.costCodes.slice(0, 7); // Show top 7 codes
        chartCcDistribution = new Chart(ctxCc, {
            type: 'doughnut',
            data: {
                labels: ccData.map(c => `${c.code} (${c.name.substring(0, 12)}...)`),
                datasets: [{
                    data: ccData.map(c => c.volume),
                    backgroundColor: colors.slice(0, ccData.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12, font: { size: 11 } }
                    }
                }
            }
        });

        // 3. Bar Chart: Operator Activity
        const ctxOp = document.getElementById("chart-operator-activity").getContext("2d");
        if (chartOperatorActivity) chartOperatorActivity.destroy();

        chartOperatorActivity = new Chart(ctxOp, {
            type: 'bar',
            data: {
                labels: res.operators.map(o => o.operator_name),
                datasets: [
                    {
                        label: 'Volume (Rp)',
                        data: res.operators.map(o => o.volume),
                        backgroundColor: 'rgba(59, 130, 246, 0.65)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Jumlah Slip',
                        data: res.operators.map(o => o.count),
                        backgroundColor: 'rgba(245, 158, 11, 0.65)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        type: 'line',
                        tension: 0.2,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Volume (Rp)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Jumlah Slip' }
                    }
                }
            }
        });

    } catch (e) {
        console.error("Gagal menggambar grafik dashboard:", e);
    }
}
