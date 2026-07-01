const db = require('../config/db');

exports.getStats = (req, res) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const isFiltered = req.user.role !== 'Admin' && req.user.role !== 'Kepala Bidang';
    const filterClause = isFiltered ? "AND (username = ? OR (username IS NULL AND operator_code = ?))" : "";
    const filterParams = isFiltered ? [req.user.username, req.user.operator_code] : [];

    // Queries
    const kpiQuery = `
        SELECT 
            COALESCE(SUM(nominal_utama), 0) as total_volume,
            COUNT(*) as total_count,
            COALESCE(AVG(nominal_utama), 0) as avg_value,
            COUNT(CASE WHEN tanggal LIKE ? THEN 1 END) as today_count,
            COUNT(CASE WHEN tanggal LIKE ? THEN 1 END) as yesterday_count
        FROM transactions 
        WHERE deleted_at IS NULL ${filterClause}
    `;

    const trendQuery = `
        SELECT 
            substr(tanggal, 1, 10) as tx_date,
            COUNT(*) as tx_count,
            COALESCE(SUM(nominal_utama), 0) as tx_volume
        FROM transactions
        WHERE deleted_at IS NULL ${filterClause}
        GROUP BY substr(tanggal, 1, 10)
        ORDER BY tx_date DESC
        LIMIT 7
    `;

    const costCodeQuery = `
        SELECT 
            debet_rekening as code,
            debet_nama as name,
            COALESCE(SUM(nominal_utama), 0) as volume,
            COUNT(*) as count
        FROM transactions
        WHERE deleted_at IS NULL ${filterClause}
        GROUP BY debet_rekening, debet_nama
        ORDER BY volume DESC
    `;

    const operatorQuery = `
        SELECT 
            t.operator_code,
            COALESCE(u.nama, '-') as operator_name,
            COUNT(*) as count,
            COALESCE(SUM(t.nominal_utama), 0) as volume
        FROM transactions t
        LEFT JOIN users u ON u.operator_code = t.operator_code
        WHERE t.deleted_at IS NULL ${isFiltered ? "AND (t.username = ? OR (t.username IS NULL AND t.operator_code = ?))" : ""}
        GROUP BY t.operator_code, u.nama
        ORDER BY count DESC
    `;

    const kpiParams = [`${todayStr}%`, `${yesterdayStr}%`, ...filterParams];

    db.get(kpiQuery, kpiParams, (err, kpiRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(trendQuery, filterParams, (err, trendRows) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(costCodeQuery, filterParams, (err, ccRows) => {
                if (err) return res.status(500).json({ error: err.message });

                db.all(operatorQuery, filterParams, (err, opRows) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Format database outputs
                    const kpis = {
                        totalVolume: kpiRow ? parseFloat(kpiRow.total_volume) : 0,
                        totalCount: kpiRow ? parseInt(kpiRow.total_count) : 0,
                        avgValue: kpiRow ? parseFloat(kpiRow.avg_value) : 0,
                        todayCount: kpiRow ? parseInt(kpiRow.today_count) : 0,
                        yesterdayCount: kpiRow ? parseInt(kpiRow.yesterday_count) : 0
                    };

                    res.json({
                        success: true,
                        kpis,
                        trend: trendRows.reverse(), // reverse to display chronologically (past -> today)
                        costCodes: ccRows,
                        operators: opRows
                    });
                });
            });
        });
    });
};
