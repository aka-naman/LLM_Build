require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.example') });
try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
} catch (_) { }

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const fieldRoutes = require('./routes/fields');
const submissionRoutes = require('./routes/submissions');
const exportRoutes = require('./routes/export');
const autocompleteRoutes = require('./routes/autocomplete');
const adminUserRoutes = require('./routes/admin-users');
const permissionRoutes = require('./routes/permissions');
const notificationRoutes = require('./routes/notifications');
const explorerRoutes = require('./routes/explorer');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/forms', formRoutes); // Contains /:id/duplicate, /:id
app.use('/api/forms', submissionRoutes); // Contains /:formId/submissions
app.use('/api/forms', fieldRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/autocomplete', autocompleteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/explorer', explorerRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static uploads
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve static frontend in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const os = require('os');
const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '0.0.0.0';
};

app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n🚀 Agra Sandhani API running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIP}:${PORT}`);
});

module.exports = app;
