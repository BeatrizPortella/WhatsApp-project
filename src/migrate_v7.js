require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Iniciando migração v7 (Citações)...');

        // Adiciona coluna para ID da mensagem citada
        await pool.query(`
            ALTER TABLE mensagens 
            ADD COLUMN IF NOT EXISTS quoted_msg_id VARCHAR(255);
        `);

        console.log('✅ Migração v7 concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
