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
        console.log('🚀 Iniciando migração v3 (WhatsApp ID e Histórico)...');

        // 1. Adiciona whatsapp_id para evitar duplicatas em sincronização
        await pool.query(`
            ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS whatsapp_id VARCHAR(100) UNIQUE;
        `);

        console.log('✅ Migração concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
