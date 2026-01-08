require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate_v2() {
    try {
        console.log('🚀 Iniciando Migração V2 (Segurança e Perfis)...');

        // 1. Adicionar nome_cliente em conversas
        await pool.query('ALTER TABLE conversas ADD COLUMN IF NOT EXISTS nome_cliente VARCHAR(100)');

        // 2. Criar tabela de usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                atendente_id INTEGER REFERENCES atendentes(id) ON DELETE CASCADE,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha TEXT NOT NULL,
                nivel VARCHAR(20) DEFAULT 'operador',
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        // 3. Atualizar/Inserir atendentes solicitados
        // Primeiro, limpa exemplos antigos se necessário ou apenas garante os novos
        await pool.query("INSERT INTO atendentes (nome) SELECT 'Chalison' WHERE NOT EXISTS (SELECT 1 FROM atendentes WHERE nome = 'Chalison')");
        await pool.query("INSERT INTO atendentes (nome) SELECT 'Chaene' WHERE NOT EXISTS (SELECT 1 FROM atendentes WHERE nome = 'Chaene')");

        console.log('✅ Migração V2 concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração V2:', error);
        process.exit(1);
    }
}

migrate_v2();
