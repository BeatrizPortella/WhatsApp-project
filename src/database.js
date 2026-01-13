require('dotenv').config();
const { Pool } = require('pg');



const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err) => {
    console.error('❌ Erro inesperado no cliente do banco:', err);
});

// Testa conexão ao iniciar
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('✅ Banco de dados conectado com sucesso:', res.rows[0].now);
    }
});

/**
 * Obtém ou cria uma conversa para um cliente
 * @param {string} numeroCliente - Número do cliente (formato: 5511999999999@s.whatsapp.net)
 * @param {string} nomeCliente - Nome do cliente vindo do WhatsApp (opcional)
 * @returns {Promise<number>} ID da conversa
 */
async function obterOuCriarConversa(numeroCliente, nomeCliente = null) {
    try {
        // Tenta inserir ou retorna o ID existente
        const resultado = await pool.query(
            `INSERT INTO conversas (numero_cliente, nome_cliente, status, atualizado_em)
             VALUES ($1, $2, 'aguardando', NOW())
             ON CONFLICT (numero_cliente) 
             DO UPDATE SET 
                nome_cliente = COALESCE(EXCLUDED.nome_cliente, conversas.nome_cliente),
                atualizado_em = NOW()
             RETURNING id`,
            [numeroCliente, nomeCliente]
        );

        return resultado.rows[0].id;

    } catch (error) {
        console.error('❌ Erro ao obter/criar conversa:', error);
        throw error;
    }
}

/**
 * Salva mensagem do cliente no banco
 * @param {string} numeroCliente - Número do cliente
 * @param {string} conteudo - Conteúdo da mensagem
 * @param {string} mediaUrl - URL da mídia (opcional)
 * @param {string} mediaType - Tipo da mídia (opcional)
 * @param {string} nomeCliente - Nome do cliente vindo do WhatsApp (opcional)
 * @param {string} whatsappId - ID único da mensagem no WhatsApp (opcional)
 */
async function salvarMensagemCliente(numeroCliente, conteudo, mediaUrl = null, mediaType = null, nomeCliente = null, whatsappId = null) {
    try {
        const conversaId = await obterOuCriarConversa(numeroCliente, nomeCliente);

        await pool.query(
            `INSERT INTO mensagens (conversa_id, remetente_tipo, conteudo, media_url, media_type, whatsapp_id, enviado_em)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (whatsapp_id) DO NOTHING`,
            [conversaId, 'cliente', conteudo, mediaUrl, mediaType, whatsappId]
        );

    } catch (error) {
        console.error('❌ Erro ao salvar mensagem do cliente:', error);
        throw error;
    }
}

/**
 * Salva mensagem do atendente no banco
 * @param {string} numeroCliente - Número do cliente
 * @param {number} atendenteId - ID do atendente
 * @param {string} conteudo - Conteúdo da mensagem (sem prefixo do nome)
 * @param {string} mediaUrl - URL da mídia (opcional)
 * @param {string} mediaType - Tipo da mídia (opcional)
 * @param {string} whatsappId - ID único da mensagem no WhatsApp (opcional)
 */
async function salvarMensagemAtendente(numeroCliente, atendenteId, conteudo, mediaUrl = null, mediaType = null, whatsappId = null) {
    try {
        const conversaId = await obterOuCriarConversa(numeroCliente);

        // Atualiza conversa para associar ao atendente
        await pool.query(
            'UPDATE conversas SET atendente_id = $1, status = $2 WHERE id = $3',
            [atendenteId, 'em_atendimento', conversaId]
        );

        // Salva mensagem
        await pool.query(
            `INSERT INTO mensagens (conversa_id, remetente_tipo, atendente_id, conteudo, media_url, media_type, whatsapp_id, enviado_em, tipo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
             ON CONFLICT (whatsapp_id) DO NOTHING`,
            [conversaId, 'atendente', atendenteId, conteudo, mediaUrl, mediaType, whatsappId, 'mensagem']
        );

    } catch (error) {
        console.error('❌ Erro ao salvar mensagem do atendente:', error);
        throw error;
    }
}

/**
 * Salva nota interna
 * @param {string} numeroCliente - Número do cliente
 * @param {number} atendenteId - ID do atendente
 * @param {string} conteudo - Conteúdo da nota
 */
async function salvarNotaInterna(numeroCliente, atendenteId, conteudo) {
    try {
        const conversaId = await obterOuCriarConversa(numeroCliente);

        await pool.query(
            `INSERT INTO mensagens (conversa_id, remetente_tipo, atendente_id, conteudo, tipo, enviado_em)
             VALUES ($1, 'atendente', $2, $3, 'nota', NOW())`,
            [conversaId, atendenteId, conteudo]
        );

    } catch (error) {
        console.error('❌ Erro ao salvar nota interna:', error);
        throw error;
    }
}

/**
 * Lista todas as conversas
 * @returns {Promise<Array>} Lista de conversas
 */
async function listarConversas() {
    try {
        const resultado = await pool.query(`
            SELECT * 
            FROM (
                SELECT 
                    c.*,
                    a.nome as atendente_nome,
                    (
                        SELECT conteudo 
                        FROM mensagens 
                        WHERE conversa_id = c.id 
                        ORDER BY enviado_em DESC 
                        LIMIT 1
                    ) as ultima_mensagem,
                    (
                        SELECT enviado_em 
                        FROM mensagens 
                        WHERE conversa_id = c.id 
                        ORDER BY enviado_em DESC 
                        LIMIT 1
                    ) as ultima_mensagem_em,
                    (
                        SELECT COUNT(*)::int
                        FROM mensagens 
                        WHERE conversa_id = c.id 
                        AND remetente_tipo = 'cliente'
                        AND enviado_em > COALESCE(
                            (SELECT MAX(enviado_em) FROM mensagens WHERE conversa_id = c.id AND remetente_tipo = 'atendente'),
                            '1970-01-01'
                        )
                    ) as mensagens_nao_lidas
                FROM conversas c
                LEFT JOIN atendentes a ON c.atendente_id = a.id
            ) sub
            ORDER BY 
                fixada DESC,
                COALESCE(ultima_mensagem_em, atualizado_em) DESC
        `);

        return resultado.rows;

    } catch (error) {
        console.error('❌ Erro ao listar conversas:', error);
        throw error;
    }
}

/**
 * Lista mensagens de uma conversa
 * @param {number} conversaId - ID da conversa
 * @returns {Promise<Array>} Lista de mensagens
 */
async function listarMensagens(conversaId) {
    try {
        const resultado = await pool.query(`
        SELECT
            m.id,
            m.conversa_id,
            m.remetente_tipo,
            m.conteudo,
            m.media_url,
            m.media_type,
            m.enviado_em,
            m.tipo,
            a.nome as atendente_nome
            FROM mensagens m
            LEFT JOIN atendentes a ON m.atendente_id = a.id
            WHERE m.conversa_id = $1
            ORDER BY m.enviado_em ASC
            `, [conversaId]);

        return resultado.rows;

    } catch (error) {
        console.error('❌ Erro ao listar mensagens:', error);
        throw error;
    }
}

/**
 * Lista todos os atendentes
 * @returns {Promise<Array>} Lista de atendentes
 */
async function listarAtendentes() {
    try {
        const resultado = await pool.query(`
            SELECT id, nome, ativo, criado_em
            FROM atendentes
            WHERE ativo = true
            ORDER BY nome ASC
            `);

        return resultado.rows;

    } catch (error) {
        console.error('❌ Erro ao listar atendentes:', error);
        throw error;
    }
}

/**
 * Obtém informações de um atendente
 * @param {number} atendenteId - ID do atendente
 * @returns {Promise<Object>} Dados do atendente
 */
async function obterAtendente(atendenteId) {
    try {
        const resultado = await pool.query(
            'SELECT id, nome, ativo FROM atendentes WHERE id = $1',
            [atendenteId]
        );

        return resultado.rows[0] || null;

    } catch (error) {
        console.error('❌ Erro ao obter atendente:', error);
        throw error;
    }
}

/**
 * Atualiza status da conversa
 * @param {number} conversaId - ID da conversa
 * @param {string} status - Novo status (aguardando, em_atendimento, finalizado)
 */
async function atualizarStatusConversa(conversaId, status) {
    try {
        await pool.query(
            'UPDATE conversas SET status = $1, atualizado_em = NOW() WHERE id = $2',
            [status, conversaId]
        );

    } catch (error) {
        console.error('❌ Erro ao atualizar status da conversa:', error);
        throw error;
    }
}

/**
 * Autentica um usuário
 */
async function autenticarUsuario(usuario, senha) {
    const result = await pool.query(
        `SELECT u.*, a.nome 
         FROM usuarios u 
         JOIN atendentes a ON u.atendente_id = a.id 
         WHERE u.usuario = $1 AND u.senha = $2`,
        [usuario, senha]
    );
    return result.rows[0];
}

/**
 * Cadastra um novo usuário
 */
async function cadastrarUsuario(atendenteId, usuario, senha) {
    await pool.query(
        'INSERT INTO usuarios (atendente_id, usuario, senha) VALUES ($1, $2, $3)',
        [atendenteId, usuario, senha]
    );
}

/**
 * Limpa histórico de mensagens de uma conversa
 */
async function limparConversa(id) {
    await pool.query('DELETE FROM mensagens WHERE conversa_id = $1', [id]);
}

/**
 * Exclui uma conversa e todas as suas mensagens
 */
async function deletarConversa(id) {
    await pool.query('DELETE FROM conversas WHERE id = $1', [id]);
}

/**
 * Fixa ou desfixa uma conversa no topo
 */
async function alternarFixarConversa(id, fixada) {
    await pool.query('UPDATE conversas SET fixada = $1 WHERE id = $2', [fixada, id]);
}

module.exports = {
    pool,
    obterOuCriarConversa,
    salvarMensagemCliente,
    salvarMensagemAtendente,
    listarConversas,
    listarMensagens,
    listarAtendentes,
    obterAtendente,
    atualizarStatusConversa,
    autenticarUsuario,
    cadastrarUsuario,
    limparConversa,
    deletarConversa,
    limparConversa,
    deletarConversa,
    alternarFixarConversa,
    salvarNotaInterna
};
