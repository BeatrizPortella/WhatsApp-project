require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {
    salvarMensagemCliente,
    salvarMensagemAtendente,
    salvarMensagemDoCelular,
    obterOuCriarConversa
} = require('./database');
const fs = require('fs');
const path = require('path');

let client = null;
let qrCodeData = null;
let isConnected = false;

/**
 * Conecta ao WhatsApp Web usando whatsapp-web.js
 */
async function connectToWhatsApp() {
    console.log('🚀 Iniciando bot WhatsApp...\n');

    // Cria cliente WhatsApp
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './auth_info'
        }),
        webVersionCache: {
            type: 'none'
        },
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disk-cache-size=0',
                '--bypass-csp'
            ]
        }
    });

    // Evento: QR Code gerado
    client.on('qr', async (qr) => {
        console.log('\n🔐 QR CODE DISPONÍVEL NA INTERFACE WEB!');
        console.log('   Acesse: http://SEU_IP:3000/setup.html\n');

        // Gerar QR Code em base64 para exibir na web
        const QRCode = require('qrcode');
        qrCodeData = await QRCode.toDataURL(qr);
        isConnected = false;
    });

    // Evento: Autenticando
    client.on('authenticated', () => {
        console.log('✅ Autenticado com sucesso!');
    });

    // Evento: Autenticação falhou
    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        console.log('💡 Tente deletar a pasta auth_info e escanear novamente\n');
    });

    // Evento: Cliente pronto
    client.on('ready', async () => {
        console.log('✅ WhatsApp conectado com sucesso!');
        console.log('📱 Aguardando mensagens...\n');
        isConnected = true;
        qrCodeData = null; // Limpa QR Code após conectar

        // Sincroniza histórico recente
        await sincronizarHistoricoRecente();
    });

    // Evento: Desconectado
    client.on('disconnected', (reason) => {
        console.log('❌ WhatsApp desconectado. Motivo:', reason);
        console.log('🔄 Reinicie o bot para reconectar\n');
    });

    // Evento: Mensagem criada (recebida ou enviada)
    client.on('message_create', async (message) => {
        try {
            // Ignora mensagens de status e grupos
            if (message.from === 'status@broadcast' || message.from.includes('@g.us')) {
                return;
            }

            // Se for enviada por mim (celular ou bot)
            if (message.fromMe) {
                // Se foi enviada pelo bot, ela já foi salva pela função enviarMensagem
                // Mas graças ao ON CONFLICT no banco, podemos tentar salvar sem medo de duplicar
                // Porém, para performance, ideal seria identificar. 
                // Como não temos flag fácil, confiamos no ON CONFLICT (idempotência).
                await processarMensagemIndividual(message);
                return;
            }

            // Mensagem recebida de terceiros
            await processarMensagemIndividual(message);

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    });

    // Evento: Carregando (mostra progresso)
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Carregando: ${percent}% - ${message}`);
    });

    // Inicializa o cliente
    try {
        await client.initialize();
    } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp:', error);
        process.exit(1);
    }

    return client;
}

/**
 * Função auxiliar para processar e salvar uma mensagem individual (recebida ou enviada)
 * Garante o download de mídias e evita duplicatas via banco de dados
 */
async function processarMensagemIndividual(message) {
    const from = message.from;
    const fromMe = message.fromMe;
    const to = message.to;
    const number = fromMe ? to : from;

    let text = '';
    let mediaUrl = null;
    let mediaType = null;

    try {
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media) {
                mediaType = media.mimetype.split('/')[0];
                const ext = media.mimetype.split('/')[1].split(';')[0];
                const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
                const filePath = path.join(__dirname, '../public/media', fileName);

                if (!fs.existsSync(path.join(__dirname, '../public/media'))) {
                    fs.mkdirSync(path.join(__dirname, '../public/media'), { recursive: true });
                }

                fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
                mediaUrl = `/media/${fileName}`;

                switch (mediaType) {
                    case 'image': text = message.body ? `📷 Imagem: ${message.body}` : '📷 Imagem'; break;
                    case 'video': text = message.body ? `🎥 Vídeo: ${message.body}` : '🎥 Vídeo'; break;
                    case 'audio': text = '🎵 Áudio'; break;
                    case 'application': text = message.body ? `📄 Documento: ${message.body}` : '📄 Documento'; break;
                    default: text = message.body || '📎 Mídia';
                }
            }
        } else {
            text = message.body || '';
        }

        if (fromMe) {
            await salvarMensagemDoCelular(to, text, mediaUrl, mediaType, message.id.id, message.timestamp);
        } else {
            const contact = await message.getContact();
            const pushname = contact.pushname || null;
            await salvarMensagemCliente(from, text, mediaUrl, mediaType, pushname, message.id.id, message.timestamp);
        }
    } catch (err) {
        console.error('❌ Erro ao processar mensagem individual:', err);
    }
}

/**
 * Sincroniza as mensagens das últimas 24 horas
 */
async function sincronizarHistoricoRecente() {
    console.log('🔄 Sincronizando histórico das últimas 24 horas...');
    try {
        const chats = await client.getChats();
        const vinteQuatroHorasAtras = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        let count = 0;

        for (const chat of chats) {
            // Ignora grupos e status
            if (chat.isGroup || chat.id._serialized === 'status@broadcast') continue;

            // Busca mensagens recentes
            const messages = await chat.fetchMessages({ limit: 40 });

            for (const msg of messages) {
                if (msg.timestamp >= vinteQuatroHorasAtras) {
                    await processarMensagemIndividual(msg);
                    count++;
                }
            }
        }
        console.log(`✅ Sincronização concluída! ${count} mensagens verificadas.`);
    } catch (error) {
        console.error('❌ Erro na sincronização de histórico:', error);
    }
}

/**
 * Envia mensagem com identificação do atendente
 * @param {string} numero - Número do destinatário (formato: 5511999999999@c.us)
 * @param {string} texto - Texto da mensagem
 * @param {number} atendenteId - ID do atendente
 * @param {string} nomeAtendente - Nome do atendente
 */
async function enviarMensagem(numero, texto, atendenteId, nomeAtendente, quotedMessageId = null) {
    try {
        if (!client) {
            throw new Error('WhatsApp não está conectado. Inicie o bot primeiro.');
        }

        // Verifica se o cliente está pronto
        const state = await client.getState();
        if (state !== 'CONNECTED') {
            throw new Error(`WhatsApp não está pronto. Estado atual: ${state}`);
        }

        // Garante que o número está no formato correto (@c.us)
        let numeroFormatado = numero;
        if (!numero.includes('@')) {
            numeroFormatado = `${numero}@c.us`;
        } else if (numero.includes('@s.whatsapp.net')) {
            // Converte formato Baileys para whatsapp-web.js
            numeroFormatado = numero.replace('@s.whatsapp.net', '@c.us');
        }

        // Formata a mensagem com o nome do atendente em negrito em linha separada
        const mensagemCompleta = `*${nomeAtendente}*\n${texto}`;

        // Opções de envio (Reply)
        const options = {};
        if (quotedMessageId) {
            options.quotedMessageId = quotedMessageId;
        }

        // Tenta buscar o chat antes de enviar (Workaround para bug do WWebJS)
        console.log(`📨 Enviando mensagem para ${numeroFormatado}...`);
        try {
            const chat = await client.getChatById(numeroFormatado);
            await chat.sendMessage(mensagemCompleta, options);
        } catch (innerError) {
            console.warn('⚠️ Falha ao enviar via chat object, tentando via client direct...', innerError);
            await client.sendMessage(numeroFormatado, mensagemCompleta, options);
        }

        console.log(`✅ Mensagem enviada por ${nomeAtendente} para ${numeroFormatado}`);

        // Salva no banco com o ID real do WhatsApp para evitar duplicidade no futuro
        await salvarMensagemAtendente(numero, atendenteId, texto, null, null, response.id.id);

        return { success: true, messageId: response.id.id };

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error.message);
        throw new Error(`Erro ao enviar mensagem: ${error.message}`);
    }
}

/**
 * Envia uma mídia para um número
 * @param {string} numero - Número do cliente
 * @param {string} filePath - Caminho do arquivo físico
 * @param {number} atendenteId - ID do atendente
 * @param {string} caption - Legenda (opcional)
 * @param {string} mediaUrl - URL relativa para o banco (opcional)
 * @param {string} mediaType - Tipo (image, video, etc)
 */
async function enviarMidia(numero, filePath, atendenteId, caption = '', mediaUrl = null, mediaType = null) {
    try {
        if (!client || !isConnected) {
            throw new Error('WhatsApp não está conectado.');
        }

        // Garante que o número está no formato correto
        let numeroFormatado = numero;
        if (!numero.includes('@')) {
            numeroFormatado = `${numero}@c.us`;
        } else if (numero.includes('@s.whatsapp.net')) {
            numeroFormatado = numero.replace('@s.whatsapp.net', '@c.us');
        }

        const media = MessageMedia.fromFilePath(filePath);

        let sendOptions = { caption };
        if (media.mimetype.startsWith('audio/') || filePath.endsWith('.webm') || filePath.endsWith('.mp3')) {
            sendOptions = { sendAudioAsVoice: true }; // Envia como Nota de Voz (PTT)
        }

        const response = await client.sendMessage(numeroFormatado, media, sendOptions);

        console.log(`✅ Mídia enviada para ${numeroFormatado}`);

        // Salva registro no banco
        await salvarMensagemAtendente(numero, atendenteId, caption || 'Mídia', mediaUrl, mediaType, response.id.id);

        return { success: true, messageId: response.id.id };
    } catch (error) {
        console.error('❌ Erro ao enviar mídia:', error.message);
        throw error;
    }
}

/**
 * Obtém o cliente do WhatsApp (para uso em outros módulos)
 */
function getClient() {
    return client;
}

/**
 * Obtém o status da conexão WhatsApp
 */
function getConnectionStatus() {
    return {
        connected: isConnected,
        hasClient: client !== null,
        qr: qrCodeData
    };
}

/**
 * Obtém o QR Code em base64
 */
function getQRCode() {
    return qrCodeData;
}

// Exporta funções
module.exports = {
    connectToWhatsApp,
    enviarMensagem,
    enviarMidia,
    getClient,
    getConnectionStatus,
    getQRCode
};

// Inicia a conexão se este arquivo for executado diretamente
if (require.main === module) {
    connectToWhatsApp();
}
