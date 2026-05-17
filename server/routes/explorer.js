const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { generateSql } = require('../services/textToSql');

/**
 * Helper to wrap SQL with user isolation and selected form bounds
 */
function enforceIsolation(sql, userId, userRole, selectedFormIds = []) {
    const isAdmin = userRole === 'admin';
    const ownerSubquery = `(SELECT role FROM users WHERE id = f.user_id)`;
    
    const isolationFilter = `(f.user_id = ${userId} OR (${ownerSubquery} != 'admin' AND (f.id IN (SELECT form_id FROM form_permissions WHERE user_id = ${userId} AND status = 'approved' AND (expires_at IS NULL OR expires_at > NOW())) OR f.user_id IN (SELECT grantor_id FROM user_delegations WHERE grantee_id = ${userId} AND expires_at > NOW()))))`;
    const adminFilter = `(f.user_id = ${userId} OR ${ownerSubquery} != 'admin')`;
    
    // 1. Ensure the SQL actually has the forms join if we are going to use 'f'
    let finalSql = sql;
    if (!sql.toLowerCase().includes('join forms f')) {
        if (sql.toLowerCase().includes('from submissions s')) {
            finalSql = sql.replace(/from submissions s/i, 'FROM submissions s JOIN form_versions fv ON s.form_version_id = fv.id JOIN forms f ON fv.form_id = f.id');
        } else {
            finalSql = sql.replace(/from submissions/i, 'FROM submissions s JOIN form_versions fv ON s.form_version_id = fv.id JOIN forms f ON fv.form_id = f.id');
        }
    }

    // 2. Build the combined security + selection filter
    let filters = [];
    if (isAdmin) {
        filters.push(adminFilter);
    } else {
        filters.push(isolationFilter);
    }
    
    if (selectedFormIds && selectedFormIds.length > 0) {
        filters.push(`f.id IN (${selectedFormIds.join(',')})`);
    }

    if (filters.length === 0) return finalSql;

    const combinedFilter = `(${filters.join(' AND ')})`;

    // 3. Check if isolation/filter is already present (from model)
    const hasIsolation = finalSql.toLowerCase().includes('f.user_id =') || finalSql.toLowerCase().includes('current_user_id()');
    
    if (hasIsolation) {
        return finalSql.replace(/current_user_id\(\)/gi, userId)
                     .replace(/f\.user_id\s*=\s*\d+/gi, `f.user_id = ${userId}`);
    }

    const hasWhere = finalSql.toLowerCase().includes('where');
    
    if (hasWhere) {
        return finalSql.replace(/\bwhere\b/i, `WHERE ${combinedFilter} AND `);
    } else {
        if (finalSql.toLowerCase().includes('group by')) {
            return finalSql.replace(/group by/i, `WHERE ${combinedFilter} GROUP BY`);
        }
        if (finalSql.toLowerCase().includes('order by')) {
            return finalSql.replace(/order by/i, `WHERE ${combinedFilter} ORDER BY`);
        }
        return `${finalSql} WHERE ${combinedFilter}`;
    }
}

/**
 * @route GET /api/explorer/schema
 * @desc  Get all forms and unique field labels the user has access to
 * @access Private
 */
router.get('/schema', authenticate, async (req, res) => {
    try {
        // 1. Get forms the user has access to (Owner, Admin, Approved, or Delegate)
        // STRICT RULE: Admin forms are only visible to their owners.
        const formsResult = await pool.query(`
            SELECT f.id, f.name 
            FROM forms f
            JOIN users u ON f.user_id = u.id
            LEFT JOIN form_permissions fp ON f.id = fp.form_id AND fp.user_id = $1 
                AND (fp.expires_at IS NULL OR fp.expires_at > NOW())
            LEFT JOIN user_delegations ud ON f.user_id = ud.grantor_id AND ud.grantee_id = $1
                AND ud.expires_at > NOW()
            WHERE (f.user_id = $1)
               OR (u.role != 'admin' AND ($2 = 'admin' OR fp.status = 'approved' OR ud.id IS NOT NULL))
            ORDER BY f.name ASC
        `, [req.user.id, req.user.role]);

        const formIds = formsResult.rows.map(f => f.id);

        if (formIds.length === 0) {
            return res.json({ forms: [], fields: [] });
        }

        // 2. Get unique field labels across those forms (using latest version for each)
        const fieldsResult = await pool.query(`
            SELECT DISTINCT label 
            FROM form_fields 
            WHERE form_version_id IN (
                SELECT fv.id 
                FROM form_versions fv
                INNER JOIN (
                    SELECT form_id, MAX(version_number) as max_v
                    FROM form_versions
                    WHERE form_id = ANY($1)
                    GROUP BY form_id
                ) latest ON fv.form_id = latest.form_id AND fv.version_number = latest.max_v
            )
            ORDER BY label ASC
        `, [formIds]);

        res.json({
            forms: formsResult.rows,
            fields: fieldsResult.rows.map(r => r.label)
        });
    } catch (err) {
        console.error('❌ Schema Error:', err);
        res.status(500).json({ error: 'Failed to fetch explorer schema' });
    }
});

/**
 * @route POST /api/explorer/query
 * @desc  Translate natural language to SQL and execute it (Isolated)
 * @access Private
 */
router.post('/query', authenticate, async (req, res) => {
    try {
        const { prompt, selectedForms } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // 1. Fetch metadata context for ALL selected forms
        let schemaContext = null;
        if (selectedForms && selectedForms.length > 0) {
            const formIds = selectedForms.map(f => f.id);
            
            // Get unique fields and their types across all selected forms
            const fieldsResult = await pool.query(`
                SELECT DISTINCT label, data_type 
                FROM form_fields 
                WHERE form_version_id IN (
                    SELECT id FROM form_versions 
                    WHERE form_id = ANY($1)
                )
                ORDER BY label ASC
            `, [formIds]);
            
            schemaContext = {
                formNames: selectedForms.map(f => f.name),
                fields: fieldsResult.rows
            };
        }

        // 2. Generate SQL from prompt with Multi-Form Metadata context
        let sql = await generateSql(prompt, schemaContext);
        if (!sql) {
            return res.status(500).json({ error: 'Failed to generate SQL' });
        }

        // 3. Enforce Security Isolation & Scope
        const formIds = selectedForms ? selectedForms.map(f => f.id) : [];
        sql = enforceIsolation(sql, req.user.id, req.user.role, formIds);
        console.log(`📡 [USER:${req.user.username}] AI SQL: ${sql}`);

        // 4. Execute SQL
        const result = await pool.query(sql);

        // 5. Aggressive Normalization: Map any variation of data_json/data to "Data"
        const normalizedRows = result.rows.map(row => {
            const newRow = { ...row };
            
            // Find if there's any key that looks like our data column
            const dataKey = Object.keys(row).find(k => 
                k.toLowerCase() === 'data_json' || k.toLowerCase() === 'data'
            );

            if (dataKey) {
                // Ensure it's an object (pg driver does this for jsonb)
                newRow.Data = row[dataKey];
                // Remove the original if it was named something else (e.g., data_json, DATA, etc.)
                if (dataKey !== 'Data') delete newRow[dataKey];
            }
            return newRow;
        });

        res.json({
            sql: sql,
            rowCount: result.rowCount,
            rows: normalizedRows
        });

    } catch (err) {
        console.error('❌ Explorer Error:', err);
        res.status(500).json({ 
            error: 'AI Query failed',
            details: err.message
        });
    }
});

/**
 * @route POST /api/explorer/export
 * @desc  Export AI results to Excel (Streaming)
 * @access Private
 */
router.post('/export', authenticate, async (req, res) => {
    try {
        const { prompt, selectedForms } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        // 1. Fetch metadata context for ALL selected forms
        let schemaContext = null;
        if (selectedForms && selectedForms.length > 0) {
            const formIds = selectedForms.map(f => f.id);
            const fieldsResult = await pool.query(`
                SELECT DISTINCT label, data_type 
                FROM form_fields 
                WHERE form_version_id IN (
                    SELECT id FROM form_versions 
                    WHERE form_id = ANY($1)
                )
                ORDER BY label ASC
            `, [formIds]);
            
            schemaContext = {
                formNames: selectedForms.map(f => f.name),
                fields: fieldsResult.rows
            };
        }

        let sql = await generateSql(prompt, schemaContext);
        if (!sql) return res.status(500).json({ error: 'Failed to generate SQL' });
        
        const formIds = selectedForms ? selectedForms.map(f => f.id) : [];
        sql = enforceIsolation(sql, req.user.id, req.user.role, formIds);
        
        const result = await pool.query(sql);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No data to export' });
        }

        // 2. Setup Streaming Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ai_explorer_export.xlsx"`);

        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: res,
            useStyles: true,
            useSharedStrings: true
        });

        const worksheet = workbook.addWorksheet('AI Query Results');

        // 3. Normalize first row to discover headers
        const firstRow = result.rows[0];
        const dataKeys = new Set();
        result.rows.forEach(row => {
            const dataKey = Object.keys(row).find(k => k.toLowerCase() === 'data_json' || k.toLowerCase() === 'data');
            if (dataKey && row[dataKey] && typeof row[dataKey] === 'object') {
                Object.keys(row[dataKey]).forEach(k => dataKeys.add(k));
            }
        });

        const fixedHeaders = Object.keys(firstRow).filter(k => 
            !['data_json', 'data', 'Data'].includes(k)
        );
        const dynamicHeaders = Array.from(dataKeys).sort();
        const allHeaders = [...fixedHeaders, ...dynamicHeaders];

        worksheet.columns = allHeaders.map(h => ({ header: h, key: h, width: 25 }));

        // 4. Stream Rows
        result.rows.forEach(row => {
            const cleanedRow = {};
            
            // Normalize JSON data source
            const dataKey = Object.keys(row).find(k => k.toLowerCase() === 'data_json' || k.toLowerCase() === 'data');
            const rowData = dataKey ? row[dataKey] : (row.Data || {});

            // Process fixed columns
            fixedHeaders.forEach(k => {
                let val = row[k];
                if (typeof val === 'string') val = val.replace(/ \|\|\| /g, ', ');
                cleanedRow[k] = val;
            });

            // Process dynamic Data columns
            dynamicHeaders.forEach(k => {
                let val = rowData[k] || '';
                if (typeof val === 'string') {
                    val = val.replace(/ \|\|\| /g, ', ');
                    // Convert relative upload paths to absolute URLs for LAN access
                    if (val.startsWith('/uploads/')) {
                        const host = req.get('host');
                        const protocol = req.protocol;
                        val = `${protocol}://${host}${val}`;
                    }
                }
                cleanedRow[k] = val;
            });

            worksheet.addRow(cleanedRow).commit();
        });

        await worksheet.commit();
        await workbook.commit();
        res.end();

    } catch (err) {
        console.error('❌ Explorer Export Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed' });
        }
    }
});

/**
 * @route POST /api/explorer/discovery
 * @desc  Get fields and sample values for specific forms to aid prompt engineering
 * @access Private
 */
router.post('/discovery', authenticate, async (req, res) => {
    try {
        const { formIds } = req.body;
        if (!formIds || !Array.isArray(formIds) || formIds.length === 0) {
            return res.status(400).json({ error: 'formIds array is required' });
        }

        // 1. Get unique fields and their types across all selected forms
        const fieldsResult = await pool.query(`
            SELECT DISTINCT label, data_type 
            FROM form_fields 
            WHERE form_version_id IN (
                SELECT id FROM form_versions 
                WHERE form_id = ANY($1)
            )
            ORDER BY label ASC
        `, [formIds]);

        const fieldsWithSamples = [];

        // 2. For each field, fetch top 3 sample values from submissions
        for (const field of fieldsResult.rows) {
            const label = field.label;
            const samplesRes = await pool.query(`
                SELECT DISTINCT data_json->>$1 as val
                FROM submissions
                WHERE form_version_id IN (
                    SELECT id FROM form_versions WHERE form_id = ANY($2)
                )
                AND data_json->>$1 IS NOT NULL
                AND data_json->>$1 != ''
                LIMIT 3
            `, [label, formIds]);

            fieldsWithSamples.push({
                label: label,
                type: field.data_type,
                samples: samplesRes.rows.map(r => r.val)
            });
        }

        res.json({ fields: fieldsWithSamples });
    } catch (err) {
        console.error('❌ Discovery Error:', err);
        res.status(500).json({ error: 'Discovery failed' });
    }
});

/**
 * @route POST /api/explorer/suggestions
 * @desc  Get flattened suggestions (fields + samples) for autocomplete
 * @access Private
 */
router.post('/suggestions', authenticate, async (req, res) => {
    try {
        const { formIds } = req.body;
        if (!formIds || !Array.isArray(formIds) || formIds.length === 0) {
            return res.json({ suggestions: [] });
        }

        // 1. Get unique fields
        const fieldsResult = await pool.query(`
            SELECT DISTINCT label 
            FROM form_fields 
            WHERE form_version_id IN (
                SELECT id FROM form_versions WHERE form_id = ANY($1)
            )
        `, [formIds]);

        let allSuggestions = [];

        // 2. Add fields to suggestions
        fieldsResult.rows.forEach(f => {
            allSuggestions.push({ type: 'field', value: f.label });
        });

        // 3. Add top sample values for each field
        for (const field of fieldsResult.rows) {
            const samplesRes = await pool.query(`
                SELECT DISTINCT data_json->>$1 as val
                FROM submissions
                WHERE form_version_id IN (
                    SELECT id FROM form_versions WHERE form_id = ANY($2)
                )
                AND data_json->>$1 IS NOT NULL
                AND data_json->>$1 != ''
                LIMIT 5
            `, [field.label, formIds]);

            samplesRes.rows.forEach(s => {
                allSuggestions.push({ type: 'value', value: s.val, field: field.label });
            });
        }

        res.json({ suggestions: allSuggestions });
    } catch (err) {
        console.error('❌ Suggestions Error:', err);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

module.exports = router;
