require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function cleanupAtendentes() {
    try {
        console.log('🧹 Limpando atendentes antigos e mantendo apenas Chalison e Chaene...');

        // 1. Desvincula mensagens dos atendentes que não são Chalison nem Chaene
        await pool.query(`
            UPDATE mensagens 
            SET atendente_id = NULL 
            WHERE atendente_id NOT IN (
                SELECT id FROM atendentes WHERE nome IN ('Chalison', 'Chaene')
            )
        `);

        // 2. Desvincula conversas dos atendentes que não são Chalison nem Chaene
        await pool.query(`
            UPDATE conversas 
            SET atendente_id = NULL 
            WHERE atendente_id NOT IN (
                SELECT id FROM atendentes WHERE nome IN ('Chalison', 'Chaene')
            )
        `);

        // 3. Deleta usuários vinculados a atendentes que serão removidos
        await pool.query(`
            DELETE FROM usuarios 
            WHERE atendente_id NOT IN (
                SELECT id FROM atendentes WHERE nome IN ('Chalison', 'Chaene')
            )
        `);

        // 4. Deleta os atendentes que não são Chalison nem Chaene
        await pool.query(`
            DELETE FROM atendentes 
            WHERE nome NOT IN ('Chalison', 'Chaene')
        `);

        // 5. Garante que Chalison e Chaene existem (caso tenham sido deletados ou ainda não existam)
        await pool.query("INSERT INTO atendentes (nome) SELECT 'Chalison' WHERE NOT EXISTS (SELECT 1 FROM atendentes WHERE nome = 'Chalison')");
        await pool.query("INSERT INTO atendentes (nome) SELECT 'Chaene' WHERE NOT EXISTS (SELECT 1 FROM atendentes WHERE nome = 'Chaene')");

        console.log('✅ Tudo limpo! Agora o sistema possui apenas Chalison e Chaene como atendentes.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro crítico na limpeza:', error);
        process.exit(1);
    }
}

cleanupAtendentes();
