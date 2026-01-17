require('dotenv').config();

// Wrapper que reutiliza a implementação baseada em Baileys (src/bot.js)
const {
    connectToWhatsApp,
    enviarMensagem,
    marcarComoLida,
    getSocket,
    getQRCode
} = require('./bot');

/**
 * Função placeholder para envio de mídia (não implementada ainda).
 * Você pode implementar usando Baileys `sock.sendMessage` com `image`, `video`, etc.
 */
async function enviarMidia() {
    throw new Error('Função enviarMidia ainda não implementada');
}

/**
 * Retorna o estado da conexão (CONNECTED ou DISCONNECTED).
 */
function getConnectionStatus() {
    return getSocket() ? 'CONNECTED' : 'DISCONNECTED';
}

/**
 * Baileys já imprime o QR Code no terminal, portanto aqui retornamos null.
 * Caso queira exibir na UI, será necessário capturar o evento `qr` dentro bot.js.
 */
// getQRCode já está sendo importado de './bot' na linha 9 e exportado na linha 39.
// Portanto, não precisamos redeclarar uma função dummy aqui.
// Esta linha é apenas para garantir que a função dummy anterior seja removida.

module.exports = {
    connectToWhatsApp,
    enviarMensagem,
    enviarMidia,
    getConnectionStatus,
    getQRCode,
    marcarComoLida,
    getSocket
};
