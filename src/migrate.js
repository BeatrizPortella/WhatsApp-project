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
        console.log('🚀 Iniciando migração do banco de dados...');

        // Adiciona colunas para mídias
        await pool.query('ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media_url TEXT');
        await pool.query('ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS media_type VARCHAR(20)');

        console.log('✅ Banco de dados atualizado com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
