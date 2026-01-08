require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkTime() {
    const res = await pool.query('SELECT NOW() as db_now, CURRENT_TIMESTAMP as ct');
    console.log('Database NOW():', res.rows[0].db_now);
    console.log('System Date():', new Date());
    process.exit(0);
}

checkTime();
