const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db/pool');
const { authenticate, checkFormAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/export/:id
router.get('/:id', authenticate, async (req, res) => {
    console.log(`[EXPORT] Started for form ID: ${req.params.id} by ${req.user.username}`);
    try {
        const formId = req.params.id;
        const { search = '' } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        const access = await checkFormAccess(formId, userId, userRole);
        if (!access.exists) return res.status(404).json({ error: 'Form not found' });
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        // 1. Get Fields for Headers
        const fieldsResult = await pool.query(
            `SELECT label FROM form_fields 
             WHERE form_version_id = (
                SELECT id FROM form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1
             ) 
             ORDER BY field_order`,
            [formId]
        );
        const dynamicHeaders = fieldsResult.rows.map(f => f.label);

        // 2. Setup Streaming Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="export_${formId}.xlsx"`);

        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: res,
            useStyles: true,
            useSharedStrings: true
        });

        const worksheet = workbook.addWorksheet('Submissions');

        const columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Submitted At', key: 'submitted_at', width: 22 },
            { header: 'Submitted By', key: 'submitted_by', width: 20 },
            ...dynamicHeaders.map(label => ({ header: label, key: label, width: 25 }))
        ];
        worksheet.columns = columns;

        // 3. Fetch and Stream Rows in Batches
        let offset = 0;
        const limit = 2000;
        let hasMore = true;
        let sno = 1;

        while (hasMore) {
            let searchQuery = `
                SELECT s.id, s.submitted_at, u.username as submitted_by, s.data_json
                FROM submissions s
                JOIN form_versions fv ON s.form_version_id = fv.id
                LEFT JOIN users u ON s.updated_by = u.id
                WHERE fv.form_id = $1 AND s.deleted_at IS NULL
            `;
            const params = [formId];

            if (search && search.trim() !== '') {
                // In streaming mode, we still allow search, but it uses the GIN index now
                searchQuery += ` AND s.data_json::text ILIKE $2`; 
                params.push(`%${search.trim()}%`);
            }

            searchQuery += ` ORDER BY s.submitted_at DESC LIMIT ${limit} OFFSET ${offset}`;

            const subsResult = await pool.query(searchQuery, params);
            
            if (subsResult.rows.length === 0) {
                hasMore = false;
                break;
            }

            subsResult.rows.forEach(sub => {
                const rowData = {
                    sno: sno++,
                    submitted_at: new Date(sub.submitted_at).toLocaleString(),
                    submitted_by: sub.submitted_by || 'Anonymous'
                };

                // Fill dynamic data from data_json
                if (sub.data_json) {
                    Object.keys(sub.data_json).forEach(label => {
                        let val = sub.data_json[label] || '';
                        if (typeof val === 'string') {
                            val = val.replace(/ \|\|\| /g, ', ');
                            // Convert relative upload paths to absolute URLs for LAN access
                            if (val.startsWith('/uploads/')) {
                                const host = req.get('host'); // e.g. 192.168.1.5:5000
                                const protocol = req.protocol; // http
                                
                                // In development, frontend and backend often have different ports
                                // Allow overriding the base URL for shared links via env var
                                const baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;

                                if (val.startsWith('/uploads/batch_')) {
                                    // Folder batch link -> Point to React File Explorer
                                    val = `${baseUrl}/shared/files?path=${encodeURIComponent(val)}`;
                                } else {
                                    // Direct file link
                                    val = `${protocol}://${host}${val}`;
                                }
                            }
                        }
                        rowData[label] = val;
                    });
                }

                worksheet.addRow(rowData).commit();
            });

            offset += limit;
            if (subsResult.rows.length < limit) hasMore = false;
        }

        await worksheet.commit();
        await workbook.commit();
        res.end();

    } catch (err) {
        console.error('Export error:', err);
        // Note: In streaming mode, if we already started the response, we can't send a 500 status code.
        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed internally' });
        }
    }
});

module.exports = router;
