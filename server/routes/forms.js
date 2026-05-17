const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireAdmin, checkFormAccess, checkFormOwnership } = require('../middleware/auth');

const ExcelJS = require('exceljs');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for large file uploads (1GB)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
});

/**
 * POST /api/forms/upload — Handle multiple file uploads and store in a folder
 */
router.post('/upload', authenticate, upload.array('files', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
        
        const uploadDir = path.join(__dirname, '..', 'uploads');
        const sessionFolder = `batch_${Date.now()}_${Math.round(Math.random() * 1E9)}`;
        const targetDir = path.join(uploadDir, sessionFolder);
        
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        // Move uploaded files from root /uploads to their session folder
        for (const file of req.files) {
            const newPath = path.join(targetDir, file.filename);
            fs.renameSync(file.path, newPath);
        }

        // Return the relative folder path to be stored in the DB
        const relativeFolderPath = `/uploads/${sessionFolder}`;
        res.json({ folderPath: relativeFolderPath });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ═══════════════════════════════════════ STATIC & SPECIAL ROUTES ═══════════════════════════════════════
// These MUST come before dynamic routes like /:id to prevent shadowing

/**
 * GET /api/forms/upload-files — List files in an upload folder (Public for shared links)
 */
router.get('/upload-files', (req, res) => {
    try {
        const { folderPath } = req.query;
        if (!folderPath || !folderPath.startsWith('/uploads/')) {
            return res.status(400).json({ error: 'Invalid folder path' });
        }

        const relativePath = folderPath.replace('/uploads/', '');
        const targetDir = path.join(__dirname, '..', 'uploads', relativePath);

        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const stats = fs.lstatSync(targetDir);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        const files = fs.readdirSync(targetDir);
        res.json({ files });
    } catch (err) {
        console.error('List files error:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// ═══════════════════════════════════════ USER ROUTES ═══════════════════════════════════════

/**
 * GET /api/forms — List all forms (Public Discovery + Private Access)
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        const result = await pool.query(
            `SELECT f.*,
                u.username as owner_username,
                u.role as owner_role,
                CASE 
                    WHEN f.user_id = $1::int OR $2 = true OR ud.id IS NOT NULL OR fp.status = 'approved' THEN fv.id 
                    ELSE NULL 
                END as latest_version_id,
                fv.version_number,
                COALESCE(sub_count.count, 0)::int as submission_count,
                CASE
                    WHEN f.user_id = $1::int THEN 'owner'
                    WHEN $2 = true THEN 'admin'
                    WHEN ud.id IS NOT NULL THEN 'delegate'
                    WHEN fp.status = 'ignored' THEN 'pending'
                    ELSE COALESCE(fp.status, 'none')
                END as access_status
            FROM forms f
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN form_permissions fp ON f.id = fp.form_id AND fp.user_id = $1::int 
                AND (fp.expires_at IS NULL OR fp.expires_at > NOW())
            LEFT JOIN user_delegations ud ON f.user_id = ud.grantor_id AND ud.grantee_id = $1::int
                AND ud.expires_at > NOW()
            LEFT JOIN LATERAL (
                SELECT id, version_number FROM form_versions
                WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1
            ) fv ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int as count FROM submissions
                WHERE form_version_id = fv.id
            ) sub_count ON true
            WHERE (u.role != 'admin') OR (f.user_id = $1::int)
            ORDER BY u.username ASC, f.created_at DESC`,
            [userId, isAdmin]
        );

        res.json({ forms: result.rows });
    } catch (err) {
        console.error('List forms error:', err);
        res.status(500).json({ error: 'Failed to list forms' });
    }
});

/**
 * POST /api/forms — Create new form + initial version
 */
router.post('/', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Form name is required' });
        
        await client.query('BEGIN');
        const formResult = await client.query('INSERT INTO forms (name, user_id) VALUES ($1, $2) RETURNING *', [name.trim(), req.user.id]);
        const form = formResult.rows[0];
        await client.query('INSERT INTO form_versions (form_id, version_number) VALUES ($1, 1)', [form.id]);
        await client.query('COMMIT');
        res.status(201).json({ form });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create form' });
    } finally { client.release(); }
});

// Dynamic routes with :id must come AFTER specific ones like /upload-files
/**
 * POST /api/forms/:id/duplicate — Duplicate form
 */
router.post('/:id/duplicate', authenticate, async (req, res) => {
    console.log(`\n[DEBUG DUPLICATE] Request for ID: ${req.params.id} by ${req.user.username}`);
    const client = await pool.connect();
    try {
        const access = await checkFormAccess(req.params.id, req.user.id, req.user.role);
        
        if (!access.exists) return res.status(404).json({ error: 'Form not found' });
        if (!access.hasAccess) return res.status(403).json({ error: 'Permission denied' });

        await client.query('BEGIN');
        const originalForm = access.form;
        
        console.log(`[DEBUG DUPLICATE] Inserting new form...`);
        const newFormResult = await client.query('INSERT INTO forms (name, user_id) VALUES ($1, $2) RETURNING *', [`Copy of ${originalForm.name}`, req.user.id]);
        const newForm = newFormResult.rows[0];
        console.log(`[DEBUG DUPLICATE] New Form ID: ${newForm.id}`);

        const versionResult = await client.query('SELECT * FROM form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1', [originalForm.id]);
        if (versionResult.rows.length > 0) {
            const originalVersion = versionResult.rows[0];
            console.log(`[DEBUG DUPLICATE] Original Version ID: ${originalVersion.id}`);
            
            const newVersionResult = await client.query('INSERT INTO form_versions (form_id, version_number) VALUES ($1, 1) RETURNING *', [newForm.id]);
            const newVersion = newVersionResult.rows[0];
            console.log(`[DEBUG DUPLICATE] New Version ID: ${newVersion.id}`);

            const fieldsResult = await client.query('SELECT label, type, options_json, field_order, validation_rules, data_type FROM form_fields WHERE form_version_id = $1', [originalVersion.id]);
            console.log(`[DEBUG DUPLICATE] Found ${fieldsResult.rows.length} fields to copy`);
            
            for (const field of fieldsResult.rows) {
                await client.query(
                    'INSERT INTO form_fields (form_version_id, label, type, options_json, field_order, validation_rules, data_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [newVersion.id, field.label, field.type, JSON.stringify(field.options_json), field.field_order, JSON.stringify(field.validation_rules), field.data_type]
                );
            }
        }
        await client.query('COMMIT');
        console.log(`[DEBUG DUPLICATE] Success!`);

        // Fetch the full form details including the version info we just created
        const finalResult = await client.query(
            `SELECT f.*, fv.id as latest_version_id, fv.version_number
             FROM forms f
             LEFT JOIN LATERAL (SELECT id, version_number FROM form_versions WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1) fv ON true
             WHERE f.id = $1`, [newForm.id]
        );

        res.status(201).json({ form: finalResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DEBUG DUPLICATE] ERROR:', err);
        res.status(500).json({ error: 'Failed to duplicate' });
    } finally { client.release(); }
});

/**
 * POST /api/forms/:id/duplicate-with-records — Duplicate form and its data
 */
router.post('/:id/duplicate-with-records', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
        const access = await checkFormAccess(req.params.id, req.user.id, req.user.role);
        if (!access.exists || !access.hasAccess) return res.status(403).json({ error: 'Permission denied' });

        await client.query('BEGIN');
        const originalForm = access.form;
        
        // 1. Duplicate Form
        const newFormRes = await client.query(
            'INSERT INTO forms (name, user_id) VALUES ($1, $2) RETURNING *',
            [`Copy of ${originalForm.name} (with records)`, req.user.id]
        );
        const newForm = newFormRes.rows[0];

        // 2. Duplicate Versions & Fields & Submissions
        const versionsRes = await client.query('SELECT * FROM form_versions WHERE form_id = $1', [originalForm.id]);
        
        for (const oldVer of versionsRes.rows) {
            const newVerRes = await client.query(
                'INSERT INTO form_versions (form_id, version_number, created_at) VALUES ($1, $2, $3) RETURNING id',
                [newForm.id, oldVer.version_number, oldVer.created_at]
            );
            const newVerId = newVerRes.rows[0].id;

            // Duplicate Fields and keep mapping
            const fieldsRes = await client.query('SELECT * FROM form_fields WHERE form_version_id = $1', [oldVer.id]);
            const fieldMap = {}; // old_id -> new_id
            for (const f of fieldsRes.rows) {
                const newFieldRes = await client.query(
                    'INSERT INTO form_fields (form_version_id, label, type, options_json, field_order, validation_rules, data_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                    [newVerId, f.label, f.type, JSON.stringify(f.options_json), f.field_order, JSON.stringify(f.validation_rules), f.data_type]
                );
                fieldMap[f.id] = newFieldRes.rows[0].id;
            }

            // Duplicate Submissions for this version
            const subsRes = await client.query('SELECT * FROM submissions WHERE form_version_id = $1', [oldVer.id]);
            for (const s of subsRes.rows) {
                const newSubRes = await client.query(
                    'INSERT INTO submissions (form_version_id, submitted_at, updated_at, updated_by, data_json) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [newVerId, s.submitted_at, s.updated_at, s.updated_by, JSON.stringify(s.data_json)]
                );
                const newSubId = newSubRes.rows[0].id;

                // Duplicate Submission Values using field mapping
                await client.query(
                    `INSERT INTO submission_values (submission_id, field_id, value)
                     SELECT $1, 
                            ($3::int[])[array_position($2::int[], field_id)], 
                            value
                     FROM submission_values 
                     WHERE submission_id = $4 
                       AND field_id = ANY($2::int[])`,
                    [
                        newSubId, 
                        Object.keys(fieldMap).map(Number), 
                        Object.values(fieldMap).map(Number), 
                        s.id
                    ]
                );
            }
        }

        await client.query('COMMIT');
        
        const finalResult = await client.query(
            `SELECT f.*, fv.id as latest_version_id, fv.version_number
             FROM forms f
             LEFT JOIN LATERAL (SELECT id, version_number FROM form_versions WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1) fv ON true
             WHERE f.id = $1`, [newForm.id]
        );

        res.status(201).json({ form: finalResult.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DUPLICATE WITH RECORDS] ERROR:', err);
        res.status(500).json({ error: 'Failed to duplicate with records' });
    } finally { client.release(); }
});

/**
 * POST /api/forms/:id/lock — Lock form
 */
router.post('/:id/lock', authenticate, async (req, res) => {
    try {
        const ownership = await checkFormOwnership(req.params.id, req.user.id, req.user.role);
        if (!ownership.hasAccess) return res.status(403).json({ error: 'Permission denied' });
        await pool.query('UPDATE forms SET is_locked = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Locked' });
    } catch (err) { res.status(500).json({ error: 'Lock failed' }); }
});

/**
 * GET /api/forms/:id — Get details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const access = await checkFormAccess(req.params.id, req.user.id, req.user.role);
        if (!access.exists) return res.status(404).json({ error: 'Not found' });
        if (!access.hasAccess) return res.status(403).json({ error: 'Denied' });

        const result = await pool.query(
            `SELECT f.*, u.username as owner_username, fv.id as latest_version_id, fv.version_number
             FROM forms f
             LEFT JOIN users u ON f.user_id = u.id
             LEFT JOIN LATERAL (SELECT id, version_number FROM form_versions WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1) fv ON true
             WHERE f.id = $1`, [req.params.id]
        );
        res.json({ form: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

/**
 * PUT /api/forms/:id — Rename
 */
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { name } = req.body;
        const ownership = await checkFormOwnership(req.params.id, req.user.id, req.user.role);
        if (!ownership.hasAccess) return res.status(403).json({ error: 'Denied' });
        const result = await pool.query('UPDATE forms SET name = $1 WHERE id = $2 RETURNING *', [name.trim(), req.params.id]);
        res.json({ form: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Rename failed' }); }
});

/**
 * DELETE /api/forms/:id — Delete
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const ownership = await checkFormOwnership(req.params.id, req.user.id, req.user.role);
        if (!ownership.hasAccess) return res.status(403).json({ error: 'Denied' });
        await pool.query('DELETE FROM forms WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// ═══════════════════════════════════════ ADMIN ROUTES ═══════════════════════════════════════

/**
 * GET /api/forms/admin/all — Admin view all forms
 */
router.get('/admin/all', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const result = await pool.query(`
            SELECT f.*,
              u.username as owner_username,
              fv.id as latest_version_id,
              fv.version_number,
              COALESCE(sub_count.count, 0)::int as submission_count
            FROM forms f
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN LATERAL (
              SELECT id, version_number FROM form_versions
              WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1
            ) fv ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int as count FROM submissions
              WHERE form_version_id = fv.id
            ) sub_count ON true
            WHERE (u.role != 'admin') OR (f.user_id = $1::int)
            ORDER BY f.created_at DESC
        `, [req.user.id]);

        res.json({ forms: result.rows });
    } catch (err) {
        console.error('Admin list forms error:', err);
        res.status(500).json({ error: 'Failed to list forms' });
    }
});

/**
 * GET /api/forms/admin/user/:userId — Admin view specific user's forms
 */
router.get('/admin/user/:userId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const userCheck = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const targetUser = userCheck.rows[0];
        // If target is an admin, only they can see their own forms
        if (targetUser.role === 'admin' && req.user.id !== userId) {
             return res.status(403).json({ error: 'Cannot view other admins forms' });
        }

        const result = await pool.query(`
            SELECT f.*,
              fv.id as latest_version_id,
              fv.version_number,
              COALESCE(sub_count.count, 0)::int as submission_count
            FROM forms f
            LEFT JOIN LATERAL (
              SELECT id, version_number FROM form_versions
              WHERE form_id = f.id ORDER BY version_number DESC LIMIT 1
            ) fv ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int as count FROM submissions
              WHERE form_version_id = fv.id
            ) sub_count ON true
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
        `, [userId]);

        res.json({ forms: result.rows });
    } catch (err) {
        console.error('Admin list user forms error:', err);
        res.status(500).json({ error: 'Failed to list forms' });
    }
});

/**
 * GET /api/forms/admin/stats — Admin statistics
 */
router.get('/admin/stats', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const totalUsers = await pool.query('SELECT COUNT(*) as count FROM users');
        const totalForms = await pool.query('SELECT COUNT(*) as count FROM forms');
        const totalSubmissions = await pool.query('SELECT COUNT(*) as count FROM submissions');

        const userStats = await pool.query(`
            SELECT u.id, u.username, u.role, u.created_at,
              (SELECT COUNT(*) FROM forms WHERE user_id = u.id) as form_count,
              (SELECT COUNT(*) FROM submissions s
               INNER JOIN form_versions fv ON s.form_version_id = fv.id
               INNER JOIN forms f ON fv.form_id = f.id
               WHERE f.user_id = u.id) as submission_count
            FROM users u
            ORDER BY u.created_at DESC
        `);

        res.json({
            stats: {
                total_users: parseInt(totalUsers.rows[0].count),
                total_forms: parseInt(totalForms.rows[0].count),
                total_submissions: parseInt(totalSubmissions.rows[0].count),
                users: userStats.rows,
            }
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

module.exports = router;
