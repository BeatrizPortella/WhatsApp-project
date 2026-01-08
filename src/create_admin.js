require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function createAdmin() {
    try {
        console.log('🚀 Criando usuário administrador...');

        // 1. Busca o ID do Chalison para vincular
        const resAtendente = await pool.query("SELECT id FROM atendentes WHERE nome = 'Chalison' LIMIT 1");

        if (resAtendente.rows.length === 0) {
            console.error('❌ Erro: Atendente Chalison não encontrado. Execute o script de limpeza primeiro.');
            process.exit(1);
        }

        const atendenteId = resAtendente.rows[0].id;

        // 2. Insere o usuário admin
        // Usuário: admin
        // Senha: admin123 (Você pode alterar depois)
        await pool.query(`
            INSERT INTO usuarios (atendente_id, usuario, senha, nivel) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (usuario) DO UPDATE SET 
                nivel = 'admin',
                atendente_id = EXCLUDED.atendente_id
        `, [atendenteId, 'admin', 'admin123', 'admin']);

        console.log('✅ Usuário administrador criado com sucesso!');
        console.log('👤 Usuário: admin');
        console.log('🔑 Senha: admin123');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao criar admin:', error);
        process.exit(1);
    }
}

createAdmin();
