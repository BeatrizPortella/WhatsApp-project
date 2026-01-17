require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { salvarMensagemCliente, obterOuCriarConversa, salvarMensagemAtendente } = require('./database');

let sock = null;

/**
 * Conecta ao WhatsApp Web usando Baileys
 */
async function connectToWhatsApp() {
    try {
        // Carrega ou cria o estado de autenticação
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        // Busca a versão mais recente do Baileys
        const { version } = await fetchLatestBaileysVersion();

        // Cria a conexão com o WhatsApp
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }), // 'silent' para produção, 'debug' para desenvolvimento
            browser: ['Sistema Atendimento', 'Chrome', '1.0.0'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
            defaultQueryTimeoutMs: 60000
        });

        // Evento de atualização de conexão
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Exibe QR Code para autenticação
            if (qr) {
                console.log('\n🔐 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:\n');
                qrcode.generate(qr, { small: true });
                console.log('\nAbra o WhatsApp > Aparelhos conectados > Conectar aparelho\n');
            }

            // Trata desconexão
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log('❌ Conexão fechada.');
                console.log('   Status Code:', statusCode);
                console.log('   Motivo:', lastDisconnect?.error?.message || 'Desconhecido');

                if (shouldReconnect) {
                    console.log('🔄 Reconectando em 5 segundos...\n');
                    setTimeout(() => connectToWhatsApp(), 5000);
                } else {
                    console.log('⚠️  Você foi desconectado. Delete a pasta "auth_info" e escaneie o QR Code novamente.\n');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                console.log('📱 Aguardando mensagens...\n');
            }
        });

        // Salva credenciais quando atualizadas
        sock.ev.on('creds.update', saveCreds);

        // Processa mensagens recebidas
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return; // Ignora mensagens antigas

                const msg = messages[0];

                // Ignora mensagens enviadas por você ou mensagens de status
                if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
                    return;
                }

                const from = msg.key.remoteJid; // Número do cliente
                const messageContent = msg.message.conversation
                    || msg.message.extendedTextMessage?.text
                    || msg.message.imageMessage?.caption
                    || msg.message.videoMessage?.caption
                    || '[Mídia não suportada]';

                console.log(`📩 Nova mensagem de ${from}:`);
                console.log(`   ${messageContent}\n`);

                // Salva mensagem no banco de dados
                await salvarMensagemCliente(from, messageContent);

            } catch (error) {
                console.error('❌ Erro ao processar mensagem:', error);
            }
        });

        return sock;

    } catch (error) {
        console.error('❌ Erro ao conectar ao WhatsApp:', error);
        console.log('🔄 Tentando reconectar em 10 segundos...');
        setTimeout(() => connectToWhatsApp(), 10000);
    }
}

/**
 * Envia mensagem com identificação do atendente
 * @param {string} numero - Número do destinatário (formato: 5511999999999@s.whatsapp.net)
 * @param {string} texto - Texto da mensagem
 * @param {number} atendenteId - ID do atendente
 * @param {string} nomeAtendente - Nome do atendente
 */
async function enviarMensagem(numero, texto, atendenteId, nomeAtendente, quotedMessageId = null) {
    try {
        if (!sock) {
            throw new Error('WhatsApp não está conectado');
        }

        // Formata a mensagem com o nome do atendente em negrito
        const mensagemCompleta = `*${nomeAtendente}*\n${texto}`;

        // Constrói opções de envio
        const options = {};
        if (quotedMessageId) {
            // Extrai apenas o ID final caso venha no formato completo
            let quotedId = quotedMessageId;
            if (quotedMessageId.includes('_')) {
                const parts = quotedMessageId.split('_');
                quotedId = parts[parts.length - 1];
            }
            try {
                // Carrega a mensagem completa para garantir estrutura correta
                const quotedMsg = await sock.loadMessage(numero, quotedId);
                options.quoted = quotedMsg;
            } catch (loadErr) {
                console.warn('⚠️ Não foi possível carregar a mensagem citada, enviando com chave simples:', loadErr.message);
                options.quoted = { key: { remoteJid: numero, id: quotedId, fromMe: false } };
            }
        }


        // Tenta enviar mensagem
        let result;
        try {
            result = await sock.sendMessage(numero, { text: mensagemCompleta }, options);
        } catch (err) {
            // Se o erro for marcadoUnread, tenta reconectar e reenviar
            if (err.message && (err.message.includes('markedUnread') || err.message.includes('undefined'))) {
                console.warn('⚠️ markedUnread error, reconectando e tentando novamente...');
                await connectToWhatsApp(); // reconecta
                result = await sock.sendMessage(numero, { text: mensagemCompleta }, options);
            } else {
                throw err;
            }
        }

        console.log(`✅ Mensagem enviada por ${nomeAtendente} para ${numero}`);
        // Salva no BD (ID da mensagem enviada)
        const whatsappId = result?.key?.id || null;
        await salvarMensagemAtendente(numero, atendenteId, texto, null, null, whatsappId, null, quotedMessageId);
        return { success: true, messageId: whatsappId };
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        throw error;
    }
}

/**
 * Marca mensagem como lida
 * @param {string} numero - Número do remetente
 * @param {string} messageId - ID da mensagem
 */
async function marcarComoLida(numero, messageId) {
    try {
        if (!sock) return;

        await sock.readMessages([{
            remoteJid: numero,
            id: messageId,
            participant: undefined
        }]);

    } catch (error) {
        console.error('❌ Erro ao marcar como lida:', error);
    }
}

/**
 * Obtém o socket do WhatsApp (para uso em outros módulos)
 */
function getSocket() {
    return sock;
}

// Exporta funções
module.exports = {
    connectToWhatsApp,
    enviarMensagem,
    marcarComoLida,
    getSocket
};

// Inicia a conexão se este arquivo for executado diretamente
if (require.main === module) {
    console.log('🚀 Iniciando bot WhatsApp...\n');
    connectToWhatsApp();
}
