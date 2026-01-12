require('dotenv').config();
// Força resolução IPv4 para evitar erros de conexão com banco de dados em redes sem IPv6 configurado
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const {
    listarConversas,
    listarMensagens,
    listarAtendentes,
    obterAtendente,
    salvarMensagemAtendente,
    atualizarStatusConversa,
    autenticarUsuario,
    cadastrarUsuario,
    limparConversa,
    deletarConversa,
    alternarFixarConversa,
    salvarNotaInterna
} = require('./database');
const {
    enviarMensagem,
    enviarMidia,
    getConnectionStatus,
    getQRCode,
    connectToWhatsApp
} = require('./bot-whatsapp-web');

// Configuração do Multer para upload de mídias
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../public/media');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Limite de 50MB
});

const app = express();
const PORT = process.env.PORT || 3000;

const compression = require('compression');

// Middlewares
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Inicia a conexão com WhatsApp quando o servidor iniciar
// Agora ele roda no mesmo processo para que o QR Code apareça na interface web!
connectToWhatsApp();

// ==================== ROTAS DA API ====================

/**
 * GET /api/conversas
 * Lista todas as conversas
 */
app.get('/api/conversas', async (req, res) => {
    try {
        const conversas = await listarConversas();
        res.json({ success: true, data: conversas });
    } catch (error) {
        console.error('Erro ao listar conversas:', error);
        res.status(500).json({ success: false, error: 'Erro ao listar conversas' });
    }
});

/**
 * GET /api/mensagens/:conversaId
 * Lista mensagens de uma conversa específica
 */
app.get('/api/mensagens/:conversaId', async (req, res) => {
    try {
        const { conversaId } = req.params;
        const mensagens = await listarMensagens(conversaId);
        res.json({ success: true, data: mensagens });
    } catch (error) {
        console.error('Erro ao listar mensagens:', error);
        res.status(500).json({ success: false, error: 'Erro ao listar mensagens' });
    }
});

/**
 * GET /api/atendentes
 * Lista todos os atendentes ativos
 */
app.get('/api/atendentes', async (req, res) => {
    try {
        const atendentes = await listarAtendentes();
        res.json({ success: true, data: atendentes });
    } catch (error) {
        console.error('Erro ao listar atendentes:', error);
        res.status(500).json({ success: false, error: 'Erro ao listar atendentes' });
    }
});

/**
 * POST /api/enviar
 * Envia mensagem para um cliente
 * Body: { numero, texto, atendenteId }
 */
app.post('/api/enviar', async (req, res) => {
    try {
        const { numero, texto, atendenteId } = req.body;

        // Validações
        if (!numero || !texto || !atendenteId) {
            return res.status(400).json({
                success: false,
                error: 'Parâmetros obrigatórios: numero, texto, atendenteId'
            });
        }

        // Obtém informações do atendente
        const atendente = await obterAtendente(atendenteId);
        if (!atendente) {
            return res.status(404).json({
                success: false,
                error: 'Atendente não encontrado'
            });
        }

        // Envia mensagem via WhatsApp (o próprio bot salva no banco agora)
        await enviarMensagem(numero, texto, atendenteId, atendente.nome);

        res.json({
            success: true,
            message: 'Mensagem enviada com sucesso',
            atendente: atendente.nome
        });

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao enviar mensagem: ' + error.message
        });
    }
});

/**
 * POST /api/enviar-nota
 * Salva uma nota interna
 */
app.post('/api/enviar-nota', async (req, res) => {
    try {
        const { numero, texto, atendenteId } = req.body;
        if (!numero || !texto || !atendenteId) return res.status(400).json({ error: 'Dados incompletos' });

        await salvarNotaInterna(numero, atendenteId, texto);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/whatsapp/reconnect
 * Força reconexão
 */
app.post('/api/whatsapp/reconnect', async (req, res) => {
    try {
        console.log('🔄 Reconexão manual solicitada...');
        await connectToWhatsApp();
        res.json({ success: true, message: 'Reconexão iniciada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/conversa/:conversaId/status
 * Atualiza status de uma conversa
 * Body: { status }
 */
app.put('/api/conversa/:conversaId/status', async (req, res) => {
    try {
        const { conversaId } = req.params;
        const { status } = req.body;

        // Validação
        const statusValidos = ['aguardando', 'em_atendimento', 'finalizado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status inválido. Use: aguardando, em_atendimento ou finalizado'
            });
        }

        await atualizarStatusConversa(conversaId, status);

        res.json({
            success: true,
            message: 'Status atualizado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar status'
        });
    }
});

/**
 * GET /api/status
 * Verifica status do servidor e conexão WhatsApp
 */
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        servidor: 'online',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/whatsapp/status
 * Retorna status da conexão WhatsApp e QR Code se disponível
 */
app.get('/api/whatsapp/status', (req, res) => {
    try {
        const status = getConnectionStatus();
        res.json(status);
    } catch (error) {
        res.json({
            connected: false,
            hasClient: false,
            qr: null
        });
    }
});

/**
 * GET /api/whatsapp/qr
 * Retorna apenas o QR Code em base64
 */
app.get('/api/whatsapp/qr', (req, res) => {
    try {
        const qr = getQRCode();
        if (qr) {
            res.json({ success: true, qr });
        } else {
            res.json({ success: false, message: 'QR Code não disponível' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota raiz - redireciona dinamicamente baseada no status do WhatsApp
app.get('/', (req, res) => {
    try {
        const { connected } = getConnectionStatus();
        if (connected) {
            // Se o WhatsApp já estiver conectado, vai para o login
            res.redirect('/login.html');
        } else {
            // Se não estiver conectado, vai para a configuração do QR Code
            res.redirect('/setup.html');
        }
    } catch (error) {
        res.sendFile(path.join(__dirname, '../public/setup.html'));
    }
});

// Serve o dashboard principal
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * POST /api/login
 * Autentica um usuário
 */
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const data = await autenticarUsuario(usuario, senha);

        if (data) {
            res.json({ success: true, data });
        } else {
            res.status(401).json({ success: false, error: 'Usuário ou senha inválidos' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, error: 'Erro interno no servidor' });
    }
});

/**
 * POST /api/cadastro
 * Cadastra um novo usuário
 */
app.post('/api/cadastro', async (req, res) => {
    try {
        const { atendenteId, usuario, senha } = req.body;
        await cadastrarUsuario(atendenteId, usuario, senha);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ success: false, error: 'Usuário já existe ou erro no banco' });
    }
});

/**
 * DELETE /api/conversa/:id/limpar
 * Apaga todas as mensagens de uma conversa
 */
app.delete('/api/conversa/:id/limpar', async (req, res) => {
    try {
        const { id } = req.params;
        await limparConversa(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao limpar conversa' });
    }
});
/**
 * Exclui uma conversa completa
 */
app.delete('/api/conversa/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await deletarConversa(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao excluir conversa' });
    }
});

/**
 * Fixa ou desfixa uma conversa
 */
app.patch('/api/conversa/:id/fixar', async (req, res) => {
    try {
        const { id } = req.params;
        const { fixada } = req.body;
        await alternarFixarConversa(id, fixada);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao fixar conversa' });
    }
});
/**
 * POST /api/enviar-midia
 * Envia uma mídia/arquivo via WhatsApp
 */
app.post('/api/enviar-midia', upload.single('arquivo'), async (req, res) => {
    try {
        const { numero, atendenteId, legenda } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        // Envia via WhatsApp (o próprio bot salva no banco agora)
        const mediaUrl = `/media/${file.filename}`;
        const mediaType = file.mimetype.split('/')[0];

        await enviarMidia(numero, file.path, atendenteId, legenda || '', mediaUrl, mediaType);

        res.json({ success: true, mediaUrl });
    } catch (error) {
        console.error('Erro ao enviar mídia:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tratamento de erros 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Rota não encontrada'
    });
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌐 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Interface de atendimento: http://localhost:${PORT}\n`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

module.exports = app;
