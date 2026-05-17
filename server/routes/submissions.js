const express = require('express');
const pool = require('../db/pool');
const { authenticate, checkFormAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// POST /api/forms/:formId/submit — Submit form
router.post('/:formId/submit', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
        const { values } = req.body;
        if (!values || typeof values !== 'object') {
            return res.status(400).json({ error: 'values object is required' });
        }

        const access = await checkFormAccess(req.params.formId, req.user.id, req.user.role);
        if (!access.exists) return res.status(404).json({ error: 'Form not found' });
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        const versionResult = await client.query(
            'SELECT id FROM form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1',
            [req.params.formId]
        );
        if (versionResult.rows.length === 0) return res.status(404).json({ error: 'No version exists' });
        const versionId = versionResult.rows[0].id;

        const fieldsResult = await client.query(
            'SELECT * FROM form_fields WHERE form_version_id = $1 ORDER BY field_order',
            [versionId]
        );
        const fields = fieldsResult.rows;

        await client.query('BEGIN');

        await client.query('UPDATE forms SET is_locked = true WHERE id = $1 AND is_locked = false', [req.params.formId]);

        const subResult = await client.query(
            'INSERT INTO submissions (form_version_id, updated_by, data_json) VALUES ($1, $2, $3) RETURNING *',
            [versionId, req.user.id, {}]
        );
        const submission = subResult.rows[0];

        const dataJson = {};
        for (const field of fields) {
            const rawVal = values[field.id] !== undefined ? String(values[field.id]) : '';
            dataJson[field.label] = rawVal;
            
            await client.query(
                'INSERT INTO submission_values (submission_id, field_id, value) VALUES ($1, $2, $3)',
                [submission.id, field.id, rawVal]
            );

            // Learning logic...
            if (field.type === 'university_autocomplete' && rawVal) {
                let uState = '', uDist = '';
                for (const f of fields) {
                    const label = f.label.toLowerCase();
                    const val = values[f.id] || '';
                    if (label.includes('state') && !uState) uState = val;
                    if (label.includes('district') && !uDist) uDist = val;
                    if (f.type === 'residential_address' && val) {
                        const parts = val.split(' ||| ');
                        if (parts.length >= 3) { uDist = uDist || parts[1]; uState = uState || parts[2]; }
                    }
                }
                if (uState && uDist) {
                    await client.query(
                        'INSERT INTO universities (name, state, district) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM universities WHERE name = $1 AND state = $2 AND district = $3)',
                        [rawVal, uState, uDist]
                    );
                }
            }

            // Learn State/District from Residential Address independently
            if (field.type === 'residential_address' && rawVal) {
                const parts = rawVal.split(' ||| ');
                const dist = parts[1], state = parts[2];
                if (state && dist) {
                    // We store a dummy university entry to "learn" the state/district combination
                    // Our autocomplete/locations logic pulls from the universities table
                    await client.query(
                        `INSERT INTO universities (name, state, district, is_custom) 
                         SELECT '---', $1, $2, true 
                         WHERE NOT EXISTS (SELECT 1 FROM universities WHERE state = $1 AND district = $2)`,
                        [state, dist]
                    );
                }
            }

            // Learn Zone/Group from Organizational Groups independently
            if (field.type === 'zone_group' && rawVal) {
                const parts = rawVal.split(' ||| ');
                const zone = parts[0], group = parts[1];
                if (zone && group) {
                    await client.query(
                        `INSERT INTO organizational_groups (zone, group_name, is_custom) 
                         SELECT $1, $2, true 
                         WHERE NOT EXISTS (SELECT 1 FROM organizational_groups WHERE zone = $1 AND group_name = $2)`,
                        [zone, group]
                    );
                }
            }
            if (field.type === 'branch' && rawVal) {
                await client.query('INSERT INTO branches (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [rawVal]);
            }
        }

        // Finalize data_json for AI
        await client.query('UPDATE submissions SET data_json = $1 WHERE id = $2', [dataJson, submission.id]);

        await client.query('COMMIT');
        res.status(201).json({ submission });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Submission failed' });
    } finally {
        client.release();
    }
});

// GET /api/forms/:formId/submissions — All Submissions for Form
router.get('/:formId/submissions', authenticate, async (req, res) => {
    try {
        const { search = '' } = req.query;

        const access = await checkFormAccess(req.params.formId, req.user.id, req.user.role);
        if (!access.exists) return res.status(404).json({ error: 'Form not found' });
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        // Get the LATEST version to know which fields to show in columns
        const versionResult = await pool.query(
            'SELECT id FROM form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1',
            [req.params.formId]
        );
        if (versionResult.rows.length === 0) return res.status(404).json({ error: 'Form not found' });
        const latestVersionId = versionResult.rows[0].id;

        const fieldsResult = await pool.query(
            'SELECT * FROM form_fields WHERE form_version_id = $1 ORDER BY field_order',
            [latestVersionId]
        );

        // Fetch ALL submissions for this form (across all versions)
        let searchQuery = `
            SELECT s.id, s.submitted_at, s.updated_at, s.data_json, u.username as updated_by_username,
                json_agg(
                    json_build_object('field_id', sv.field_id, 'value', sv.value)
                    ORDER BY sv.field_id
                ) as values
            FROM submissions s
            JOIN form_versions fv ON s.form_version_id = fv.id
            LEFT JOIN submission_values sv ON sv.submission_id = s.id
            LEFT JOIN users u ON s.updated_by = u.id
            WHERE fv.form_id = $1 AND s.deleted_at IS NULL
        `;
        const params = [req.params.formId];

        if (search) {
            searchQuery += ` AND s.id IN (SELECT submission_id FROM submission_values WHERE value ILIKE $2)`;
            params.push(`%${search}%`);
        }

        searchQuery += ` GROUP BY s.id, s.submitted_at, s.updated_at, s.data_json, u.username
                         ORDER BY s.submitted_at DESC`;

        const subsResult = await pool.query(searchQuery, params);

        res.json({
            fields: fieldsResult.rows,
            submissions: subsResult.rows,
            pagination: {
                total: subsResult.rows.length,
                page: 1,
                limit: subsResult.rows.length,
                pages: 1
            }
        });
    } catch (err) {
        console.error('List submissions error:', err);
        res.status(500).json({ error: 'Failed to list submissions' });
    }
});

// PUT /api/forms/:formId/submissions/:submissionId — Audit Trail Edit
router.put('/:formId/submissions/:submissionId', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
        const { values } = req.body;
        const access = await checkFormAccess(req.params.formId, req.user.id, req.user.role);
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        await client.query('BEGIN');

        // 1. CREATE AUDIT SNAPSHOT
        const currentValues = await client.query(
            `SELECT json_object_agg(field_id, value) as snapshot 
             FROM submission_values WHERE submission_id = $1`,
            [req.params.submissionId]
        );

        await client.query(
            `INSERT INTO submission_audit (submission_id, changed_by, old_values_json, change_type)
             VALUES ($1, $2, $3, 'update')`,
            [req.params.submissionId, req.user.id, currentValues.rows[0].snapshot || {}]
        );

        // 2. UPDATE MAIN DATA
        await client.query('UPDATE submissions SET updated_at = NOW(), updated_by = $1 WHERE id = $2', [req.user.id, req.params.submissionId]);
        await client.query('DELETE FROM submission_values WHERE submission_id = $1', [req.params.submissionId]);

        const dataJson = {};
        const fieldsResult = await client.query(
            `SELECT ff.id, ff.label FROM form_fields ff 
             JOIN form_versions fv ON ff.form_version_id = fv.id
             JOIN submissions s ON s.form_version_id = fv.id
             WHERE s.id = $1`,
            [req.params.submissionId]
        );
        const fieldMap = {};
        fieldsResult.rows.forEach(f => fieldMap[f.id] = f.label);

        for (const [fieldId, val] of Object.entries(values)) {
            const label = fieldMap[fieldId];
            if (label) dataJson[label] = String(val);

            await client.query(
                'INSERT INTO submission_values (submission_id, field_id, value) VALUES ($1, $2, $3)',
                [req.params.submissionId, fieldId, String(val)]
            );
        }

        await client.query('UPDATE submissions SET data_json = $1 WHERE id = $2', [dataJson, req.params.submissionId]);

        await client.query('COMMIT');
        res.json({ message: 'Submission updated and audited' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Update failed' });
    } finally {
        client.release();
    }
});

// DELETE /api/forms/:formId/submissions/:submissionId — Soft Delete
router.delete('/:formId/submissions/:submissionId', authenticate, async (req, res) => {
    try {
        const access = await checkFormAccess(req.params.formId, req.user.id, req.user.role);
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        await pool.query('UPDATE submissions SET deleted_at = NOW() WHERE id = $1', [req.params.submissionId]);
        res.json({ message: 'Submission deleted (archived)' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// GET /api/forms/:formId/submissions/:submissionId/audit — Fetch Audit History
router.get('/:formId/submissions/:submissionId/audit', authenticate, async (req, res) => {
    try {
        const access = await checkFormAccess(req.params.formId, req.user.id, req.user.role);
        if (!access.hasAccess) return res.status(403).json({ error: 'Access denied' });

        const result = await pool.query(
            `SELECT a.*, u.username as changed_by_username
             FROM submission_audit a
             LEFT JOIN users u ON a.changed_by = u.id
             WHERE a.submission_id = $1
             ORDER BY a.changed_at DESC`,
            [req.params.submissionId]
        );

        res.json({ audit: result.rows });
    } catch (err) {
        console.error('Fetch audit error:', err);
        res.status(500).json({ error: 'Failed to fetch audit history' });
    }
});

module.exports = router;
