require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    try {
        console.log('🚀 Iniciando migração v4 (Conversas Fixadas)...');

        // 1. Adiciona coluna fixada na tabela conversas
        await pool.query(`
            ALTER TABLE conversas ADD COLUMN IF NOT EXISTS fixada BOOLEAN DEFAULT false;
        `);

        console.log('✅ Migração v4 concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
