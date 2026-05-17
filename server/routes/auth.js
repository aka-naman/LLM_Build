const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const pool = require('../db/pool');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const registerSchema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    password: Joi.string().min(6).max(100).required(),
});

const loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { username, password } = value;

        // Check if any user exists
        const countResult = await pool.query('SELECT COUNT(*) FROM users');
        const userCount = parseInt(countResult.rows[0].count);

        // If users exist, require authentication and admin role
        if (userCount > 0) {
            // Manual check for JWT in headers since we want a custom error for register
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Only admins can create new users' });
            }
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.role !== 'admin') {
                    return res.status(403).json({ error: 'Only admins can create new users' });
                }
            } catch (err) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }
        }

        // Check if username exists
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // First user becomes admin
        const role = userCount === 0 ? 'admin' : 'user';

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
            [username, passwordHash, role]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
            expiresIn: '24h',
        });

        res.status(201).json({ user, token });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const { username, password } = value;

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
            expiresIn: '24h',
        });

        res.json({
            user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at },
            token,
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
    try {
        await pool.query('DELETE FROM form_permissions WHERE user_id = $1', [req.user.id]);
        res.json({ message: 'Logged out and permissions cleared' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'Logout failed' });
    }
});

module.exports = router;
