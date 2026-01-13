require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log('🔌 Testando conexão...');
        await pool.query('SELECT NOW()');
        console.log('✅ Conexão OK!');

        console.log('🔍 Buscando tabela usuarios...');
        const resTable = await pool.query("SELECT to_regclass('public.usuarios')");
        if (!resTable.rows[0].to_regclass) {
            console.error('❌ Tabela usuarios NÃO existe!');
            return;
        }
        console.log('✅ Tabela usuarios existe.');

        console.log('🔍 Buscando usuário admin...');
        const resUser = await pool.query("SELECT * FROM usuarios WHERE usuario = 'admin'");
        if (resUser.rows.length === 0) {
            console.error('❌ Usuário admin NÃO encontrado!');
        } else {
            console.log('✅ Usuário admin ENCONTRADO!');
            console.log('Dados:', resUser.rows[0]);
        }
    } catch (error) {
        console.error('❌ ERRO FATAL:', error);
    } finally {
        pool.end();
    }
}

check();
