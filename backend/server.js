require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const admissionsRoutes = require('./routes/admissions.routes');
const paymentsRoutes = require('./routes/payments.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();
const PORT = process.env.PORT || 4000;

// ---- CORS ----
// CLIENT_ORIGIN can be a single origin or a comma-separated list
// (e.g. your Netlify URL + http://localhost:5500 while developing).
const allowedOrigins = (process.env.CLIENT_ORIGIN || '*')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // base64 animal/profile photos can be sizeable

// ---- Health check ----
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        return res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch (err) {
        return res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
    }
});

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);

// ---- 404 ----
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Error handler ----
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
    console.log(`🚀 VetCare Pro API listening on port ${PORT}`);
});
