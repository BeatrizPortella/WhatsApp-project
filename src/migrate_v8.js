require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('🔄 Iniciando migração V8: Adicionar suporte a respostas (quoted messages)...');

    try {
        const client = await pool.connect();
        try {
            // Adiciona a coluna quoted_msg_id se não existir
            await client.query(`
                ALTER TABLE mensagens 
                ADD COLUMN IF NOT EXISTS quoted_msg_id TEXT DEFAULT NULL;
            `);
            console.log('✅ Coluna quoted_msg_id adicionada (ou já existia)');

            // Opcional: Criar índice para performance em buscas de mensagens originais
            // await client.query(`
            //     CREATE INDEX IF NOT EXISTS idx_mensagens_quoted_id ON mensagens(quoted_msg_id);
            // `);

        } finally {
            client.release();
        }

        console.log('✅ Migração V8 concluída com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
