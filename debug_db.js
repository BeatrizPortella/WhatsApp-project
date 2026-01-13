require('dotenv').config();
const db = require('./src/database');

console.log('Exports from database.js:', Object.keys(db));

if (!db.pool) {
    console.error('❌ Pool is undefined!');
    process.exit(1);
}

async function checkAtendentes() {
    try {
        const res = await db.pool.query('SELECT * FROM atendentes');
        console.log('📋 Atendentes no Banco:', res.rows);

        const duplicates = await db.pool.query(`
            SELECT nome, COUNT(*) 
            FROM atendentes 
            GROUP BY nome 
            HAVING COUNT(*) > 1
        `);

        if (duplicates.rows.length > 0) {
            console.log('⚠️ Duplicatas encontradas:', duplicates.rows);
        } else {
            console.log('✅ Sem duplicatas por nome.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Erro na query:', error);
        process.exit(1);
    }
}

checkAtendentes();
