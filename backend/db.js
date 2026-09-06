const { Pool } = require('pg');
require('dotenv').config();

// Neon/most managed Postgres providers require SSL. Local dev (localhost)
// usually does not have/need SSL certs, so we only force SSL when the
// connection string points somewhere other than localhost, or when
// explicitly told to via PGSSL=true.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const useSSL = process.env.PGSSL === 'true' || (!isLocal && process.env.NODE_ENV === 'production') || (!isLocal && process.env.PGSSL !== 'false');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool,
};
