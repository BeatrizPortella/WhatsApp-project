require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkDuplicates() {
    try {
        console.log('🔍 Buscando atendentes...');
        const res = await pool.query('SELECT * FROM atendentes ORDER BY nome');
        console.log('📋 Lista Completa:', res.rows.map(a => `${a.id}: ${a.nome}`));

        const duplicates = await pool.query(`
            SELECT nome, COUNT(*) as count, string_agg(id::text, ', ') as ids
            FROM atendentes 
            GROUP BY nome 
            HAVING COUNT(*) > 1
        `);

        if (duplicates.rows.length > 0) {
            console.log('\n⚠️ DUPLICATAS ENCONTRADAS:');
            duplicates.rows.forEach(d => {
                console.log(`- ${d.nome}: ${d.count} vezes (IDs: ${d.ids})`);
            });
        } else {
            console.log('\n✅ Nenhuma duplicata encontrada.');
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await pool.end();
    }
}

checkDuplicates();
