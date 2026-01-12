require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Iniciando Verificação Completa do Banco de Dados...');

        // 1. Tabela Atendentes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS atendentes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tabela atendentes verificada.');

        // 2. Inserir Atendentes Padrão
        await pool.query(`
            INSERT INTO atendentes (nome) VALUES 
                ('Chalison'),
                ('Chaene')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✅ Atendentes padrão inseridos.');

        // 3. Tabela Usuários (CRÍTICO PARA LOGIN)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                atendente_id INTEGER REFERENCES atendentes(id) ON DELETE CASCADE,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha TEXT NOT NULL,
                nivel VARCHAR(20) DEFAULT 'operador',
                criado_em TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tabela usuarios verificada.');

        // 4. Inserir Usuário Admin Padrão
        // Senha simples para teste inicial, ideal seria hash
        const chalison = await pool.query("SELECT id FROM atendentes WHERE nome = 'Chalison' LIMIT 1");
        if (chalison.rows.length > 0) {
            await pool.query(`
                INSERT INTO usuarios (atendente_id, usuario, senha, nivel)
                VALUES ($1, 'admin', 'admin', 'admin')
                ON CONFLICT (usuario) DO NOTHING;
            `, [chalison.rows[0].id]);
            console.log('✅ Usuário admin (senha: admin) verificado.');
        }

        // 5. Tabela Conversas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,
                numero_cliente VARCHAR(50) NOT NULL UNIQUE,
                nome_cliente VARCHAR(100),
                atendente_id INTEGER REFERENCES atendentes(id),
                status VARCHAR(20) DEFAULT 'aguardando',
                fixada BOOLEAN DEFAULT false,
                criado_em TIMESTAMP DEFAULT NOW(),
                atualizado_em TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tabela conversas verificada.');

        // 6. Tabela Mensagens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mensagens (
                id SERIAL PRIMARY KEY,
                conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
                remetente_tipo VARCHAR(10) NOT NULL,
                atendente_id INTEGER REFERENCES atendentes(id),
                conteudo TEXT NOT NULL,
                media_url TEXT,
                media_type VARCHAR(20),
                whatsapp_id VARCHAR(100) UNIQUE,
                tipo VARCHAR(20) DEFAULT 'mensagem',
                enviado_em TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tabela mensagens verificada.');

        // 7. Visualizações (Novo Feature)
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
        console.log('✅ Tabela visualizações verificada.');

        console.log('\n🎉 BANCO DE DADOS 100% PRONTO PARA LOGIN!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
