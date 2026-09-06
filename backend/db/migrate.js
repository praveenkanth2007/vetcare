/* Run with: node db/migrate.js */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    try {
        await pool.query(sql);
        console.log('✅ Migration complete — all tables ready.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
