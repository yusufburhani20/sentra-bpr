        const isPg = process.env.DB_TYPE === 'postgres';

        const executeTransaction = (txDb, isPgClient, commitCallback, rollbackCallback) => {
            const runQ = (sql, params, cb) => {
                if (isPgClient) {
                    let index = 1;
                    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
                    txDb.query(pgSql, params, (err, result) => {
                        cb(err, result ? { changes: result.rowCount } : null);
                    });
                } else {
                    db.run(sql, params, cb);
                }
            };
            
            const getQ = (sql, params, cb) => {
                if (isPgClient) {
                    let index = 1;
                    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
                    txDb.query(pgSql, params, (err, result) => {
                        cb(err, result && result.rows.length > 0 ? result.rows[0] : null);
                    });
                } else {
                    db.get(sql, params, cb);
                }
            };

            // 1. Cek Ganda
            getQ("SELECT id, username, jenis_transaksi, nominal_utama, nominal_desimal, tanggal FROM transactions WHERE ref_no = ? AND deleted_at IS NULL", [ref_no], (err, row) => {
                if (row) {
                    rollbackCallback();

                    const txTime = new Date(row.tanggal).getTime();
                    const nowTime = new Date(realNowStr).getTime();
                    const timeDiffSecs = Math.abs(nowTime - txTime) / 1000;

                    if (row.username === user.username && 
                        row.jenis_transaksi === jenis_transaksi && 
                        row.nominal_utama === nominal_utama && 
                        row.nominal_desimal === nominal_desimal &&
                        timeDiffSecs < 60) {
                        return res.json({ success: true, id: row.id, ref_no: ref_no, duplicate_handled: true });
                    }
                    return res.status(400).json({ error: "Nomor referensi ganda terdeteksi!" });
                }

                // 2. Insert Transaksi
                runQ(`INSERT INTO transactions
                    (id, ref_no, tanggal, tanggal_slip, operator_code, username, debet_nama, debet_rekening, kredit_nama, kredit_rekening,
                     jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, ref_no, realNowStr, slipDateStr, operator_code, user.username, dNama, dRek, kNama, kRek,
                     jenis_transaksi, nominal_utama, nominal_desimal, keterangan, terbilang],
                    function(insertErr) {
                        if (insertErr) {
                            rollbackCallback();

                            const isUniqueViolation =
                                (insertErr.code === '23505') ||
                                (insertErr.message && insertErr.message.includes('UNIQUE constraint failed'));

                            if (isUniqueViolation) {
                                getQ("SELECT id, username, jenis_transaksi, nominal_utama, nominal_desimal, tanggal FROM transactions WHERE ref_no = ? AND deleted_at IS NULL", [ref_no], (errCheck, rowCheck) => {
                                    if (rowCheck) {
                                        const txTime = new Date(rowCheck.tanggal).getTime();
                                        const nowTime = new Date(realNowStr).getTime();
                                        const timeDiffSecs = Math.abs(nowTime - txTime) / 1000;
                                        
                                        if (rowCheck.username === user.username && 
                                            rowCheck.jenis_transaksi === jenis_transaksi && 
                                            rowCheck.nominal_utama === nominal_utama && 
                                            rowCheck.nominal_desimal === nominal_desimal &&
                                            timeDiffSecs < 60) {
                                            return res.json({ success: true, id: rowCheck.id, ref_no: ref_no, duplicate_handled: true });
                                        }
                                    }
                                    return res.status(400).json({ error: "Nomor referensi ganda terdeteksi!" });
                                });
                                return;
                            }
                            return res.status(500).json({ error: "Gagal menyimpan transaksi: " + insertErr.message });
                        }

                        // 3. Insert Audit Log
                        const logId = crypto.randomUUID();
                        runQ("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                            [logId, now, req.user.nama, req.user.role,
                             `Menyimpan slip: ${ref_no} senilai Rp ${nominal_utama},${nominal_desimal}`,
                             req.ip || "127.0.0.1"], (auditErr) => {
                                if (auditErr) console.error("Gagal insert audit_log:", auditErr);

                                // 4. Update Counter
                                const updateSql = isPgClient
                                    ? `INSERT INTO ref_counters (username, slip_type, counter, prefix) 
                                       VALUES ($1, $2, 1, '') 
                                       ON CONFLICT (username, slip_type) 
                                       DO UPDATE SET counter = ref_counters.counter + 1`
                                    : `UPDATE ref_counters SET counter = counter + 1 WHERE username = ? AND slip_type = ?`;
                                
                                runQ(updateSql, [user.username, slipType], (updateErr) => {
                                    if (updateErr) console.error("Gagal update counter (CRITICAL):", updateErr);
                                    
                                    // 5. Insert Notif
                                    const notifId = crypto.randomUUID();
                                    runQ("INSERT INTO notifications VALUES (?, ?, 'Kepala Bidang', ?, 0)",
                                        [notifId, now, `Slip baru: ${ref_no} (Operator: ${req.user.nama})`], () => {
                                            
                                            // Semua Berhasil, COMMIT!
                                            commitCallback(() => {
                                                res.json({ success: true, id, ref_no });
                                            });
                                        });
                                });
                        });
                    }
                );
            });
        };

        if (isPg) {
            db.getClient((err, client, release) => {
                if (err) return res.status(500).json({ error: "Failed to connect to database for transaction." });
                
                client.query('BEGIN', (err) => {
                    if (err) { release(); return res.status(500).json({ error: "Gagal memulai transaksi." }); }

                    executeTransaction(client, true, (onSuccess) => {
                        client.query('COMMIT', (err) => {
                            release();
                            if (err) return res.status(500).json({ error: "Gagal commit." });
                            onSuccess();
                        });
                    }, () => {
                        client.query('ROLLBACK', () => {
                            release();
                        });
                    });
                });
            });
        } else {
            db.serialize(() => {
                db.run("BEGIN EXCLUSIVE TRANSACTION;");
                executeTransaction(null, false, (onSuccess) => {
                    db.run("COMMIT;", (err) => {
                        if (err) {
                            db.run("ROLLBACK;");
                            return res.status(500).json({ error: "Gagal komit transaksi." });
                        }
                        onSuccess();
                    });
                }, () => {
                    db.run("ROLLBACK;");
                });
            });
        }
