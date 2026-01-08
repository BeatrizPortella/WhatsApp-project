require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Iniciando migração v6 (Notas e Visualizações)...');

        // 1. Adiciona coluna 'tipo' na tabela de mensagens
        // Valores possíveis: 'mensagem' (padrão), 'nota'
        await pool.query(`
            ALTER TABLE mensagens 
            ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'mensagem';
        `);

        // 2. Cria tabela de visualizações para controle individual de leitura
        await pool.query(`
            CREATE TABLE IF NOT EXISTS visualizacoes_conversas (
                id SERIAL PRIMARY KEY,
                conversa_id INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                ultima_mensagem_lida_id INTEGER REFERENCES mensagens(id),
                lido_em TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(conversa_id, usuario_id)
            );
        `);

        console.log('✅ Migração v6 concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
