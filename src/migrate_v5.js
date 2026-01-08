require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Iniciando migração v5 (Timezone)...');

        // Altera colunas de timestamp para timestamptz para garantir fuso horário correto
        await pool.query(`
            ALTER TABLE atendentes ALTER COLUMN criado_em TYPE TIMESTAMPTZ;
            ALTER TABLE usuarios ALTER COLUMN criado_em TYPE TIMESTAMPTZ;
            ALTER TABLE conversas ALTER COLUMN criado_em TYPE TIMESTAMPTZ;
            ALTER TABLE conversas ALTER COLUMN atualizado_em TYPE TIMESTAMPTZ;
            ALTER TABLE mensagens ALTER COLUMN enviado_em TYPE TIMESTAMPTZ;
        `);

        console.log('✅ Migração v5 concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
