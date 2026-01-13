// Estado global da aplicação
let conversaAtual = null;
let atendentes = [];
let intervalAtualizacao = null;
let usuarioLogado = null;
let autoScroll = true;
let lastConversasJSON = null;
let lastMensagensJSON = null;
let idsMensagensRenderizadas = new Set();
let ultimaConversaId = null;

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', () => {
    verificarLogin();
    monitorarConexao(); // Nova função
    carregarAtendentes();
    carregarConversas();
    iniciarAtualizacaoAutomatica();

    // Evento de scroll para controle de auto-scroll
    const container = document.getElementById('mensagens-container');
    container.addEventListener('scroll', () => {
        const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        autoScroll = atBottom;

        // Esconde botão de scroll se estiver no fundo
        const btnScroll = document.getElementById('btn-scroll-bottom');
        if (atBottom && btnScroll) {
            btnScroll.style.display = 'none';
        }
    });
});

/**
 * Verifica se o usuário está logado e se o WhatsApp está conectado
 */
async function verificarLogin() {
    const usuarioStr = localStorage.getItem('usuario');

    // 1. Verifica WhatsApp
    try {
        const response = await fetch('/api/whatsapp/status');
        const data = await response.json();
        if (!data.connected) {
            window.location.href = '/setup.html';
            return;
        }
    } catch (error) {
        console.error('Erro ao verificar WhatsApp');
    }

    // 2. Verifica Login
    if (!usuarioStr) {
        window.location.href = '/login.html';
        return;
    }

    usuarioLogado = JSON.parse(usuarioStr);
    // Atualiza UI com info do usuário
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.innerHTML = `<i data-lucide="log-out"></i> Sair (${usuarioLogado.usuario})`;
        if (window.lucide) lucide.createIcons();
    }

    // Bloqueia select de atendentes para não-admins
    setTimeout(() => {
        const select = document.getElementById('atendente-select');
        if (select) {
            select.value = usuarioLogado.atendente_id;
            if (usuarioLogado.nivel !== 'admin') {
                select.disabled = true;
                select.title = "Você só pode responder como você mesmo.";
            }
        }
    }, 1000);
}

/**
 * Logout
 */
function logout() {
    localStorage.removeItem('usuario');
    window.location.href = '/';
}

/**
 * Carrega lista de atendentes
 */
async function carregarAtendentes() {
    try {
        const response = await fetch('/api/atendentes');
        const result = await response.json();

        if (result.success) {
            atendentes = result.data;
            preencherSelectAtendentes();
        }
    } catch (error) {
        console.error('Erro ao carregar atendentes:', error);
    }
}

/**
 * Preenche o select de atendentes
 */
function preencherSelectAtendentes() {
    const select = document.getElementById('atendente-select');
    select.innerHTML = '<option value="">Selecione o atendente</option>';

    atendentes.forEach(atendente => {
        const option = document.createElement('option');
        option.value = atendente.id;
        option.textContent = atendente.nome;
        select.appendChild(option);
    });
}

/**
 * Carrega lista de conversas
 */
async function carregarConversas() {
    try {
        const response = await fetch('/api/conversas');
        const result = await response.json();

        if (result.success) {
            const currentJSON = JSON.stringify(result.data);
            if (currentJSON !== lastConversasJSON) {
                lastConversasJSON = currentJSON;
                renderizarConversas(result.data);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar conversas:', error);
        // Só mostra erro se o container estiver vazio (primeira carga)
        if (!document.getElementById('conversas-lista').innerHTML.trim()) {
            document.getElementById('conversas-lista').innerHTML =
                '<div class="loading">Erro ao carregar conversas</div>';
        }
    }
}

/**
 * Renderiza lista de conversas na sidebar
 */
function renderizarConversas(conversas) {
    const container = document.getElementById('conversas-lista');

    if (conversas.length === 0) {
        container.innerHTML = '<div class="loading">Nenhuma conversa ainda</div>';
        return;
    }

    container.innerHTML = conversas.map(conversa => {
        const numero = formatarNumero(conversa.numero_cliente);
        const hora = formatarHora(conversa.ultima_mensagem_em || conversa.criado_em);
        const preview = conversa.ultima_mensagem || 'Sem mensagens';
        const naoLidas = parseInt(conversa.mensagens_nao_lidas) || 0;
        const ativa = conversaAtual?.id === conversa.id ? 'ativa' : '';
        const fixada = conversa.fixada ? 'fixada' : '';

        return `
            <div class="conversa-item ${ativa} ${fixada}" onclick="abrirConversa(${conversa.id}, '${conversa.numero_cliente}', '${conversa.status}', '${conversa.nome_cliente || ''}', ${conversa.fixada})">
                <div class="conversa-header">
                    <div class="conversa-nome-container">
                        ${conversa.fixada ? '<i data-lucide="pin" class="icon-pin-sidebar"></i>' : ''}
                        <span class="conversa-numero">${conversa.nome_cliente || numero}</span>
                    </div>
                    <span class="conversa-hora">${hora}</span>
                </div>
                <div class="conversa-preview">${preview}</div>
                <div class="conversa-footer">
                    <div class="conversa-meta">
                        ${conversa.atendente_nome ?
                `<span class="conversa-atendente"><i data-lucide="user" class="icon-small"></i> ${conversa.atendente_nome}</span>` :
                ''
            }
                        <span class="badge-status status-${conversa.status}">${traduzirStatus(conversa.status)}</span>
                    </div>
                    ${naoLidas > 0 ?
                `<span class="badge-nao-lidas">${naoLidas}</span>` :
                ''
            }
                </div>
            </div>
        `;
    }).join('');

    // Processa novos ícones
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Abre uma conversa específica
 */
async function abrirConversa(id, numero, status, nome, fixada) {
    conversaAtual = { id, numero, status, nome, fixada };

    // Atualiza UI
    document.getElementById('chat-vazio').style.display = 'none';
    document.getElementById('chat-ativo').style.display = 'flex';
    document.getElementById('chat-numero').textContent = nome || formatarNumero(numero);
    document.getElementById('chat-status').textContent = traduzirStatus(status);

    // Atualiza indicador de atendente
    const attendantEl = document.getElementById('chat-attendant');
    const conversaFull = JSON.parse(lastConversasJSON || '[]').find(c => c.id === id);
    if (conversaFull && conversaFull.atendente_nome) {
        attendantEl.textContent = `🔵 Em atendimento por ${conversaFull.atendente_nome}`;
        attendantEl.style.display = 'block';
    } else {
        attendantEl.style.display = 'none';
    }

    document.getElementById('status-select').value = status;

    // Atualiza ícone de fixar
    const btnFixar = document.querySelector('.btn-fixar');
    if (fixada) {
        btnFixar.classList.add('ativa');
        btnFixar.title = "Desafixar do topo";
    } else {
        btnFixar.classList.remove('ativa');
        btnFixar.title = "Fixar no topo";
    }

    // Reseta cache de mensagens para forçar renderização da nova conversa
    lastMensagensJSON = null;
    idsMensagensRenderizadas.clear();
    ultimaConversaId = id;
    document.getElementById('mensagens-container').innerHTML = '';

    // Carrega mensagens
    await carregarMensagens(id);

    // Atualiza lista de conversas para marcar como ativa
    carregarConversas();
}

/**
 * Carrega mensagens de uma conversa
 */
async function carregarMensagens(conversaId) {
    try {
        const response = await fetch(`/api/mensagens/${conversaId}`);
        const result = await response.json();

        if (result.success) {
            const currentJSON = JSON.stringify(result.data);
            if (currentJSON !== lastMensagensJSON) {
                lastMensagensJSON = currentJSON;
                renderizarMensagens(result.data);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        // Não apaga as mensagens atuais se houver erro na atualização em background
    }
}

/**
 * Renderiza mensagens no chat
 */
function renderizarMensagens(mensagens) {
    const container = document.getElementById('mensagens-container');

    if (mensagens.length === 0) {
        container.innerHTML = '<div class="loading">Nenhuma mensagem ainda</div>';
        idsMensagensRenderizadas.clear();
        return;
    }

    // Se houve mudança radical (limpeza de mensagens), limpa container
    if (mensagens.length < idsMensagensRenderizadas.size) {
        container.innerHTML = '';
        idsMensagensRenderizadas.clear();
    }

    // Remove mensagem de "ninhuma mensagem" se ela existir
    if (container.querySelector('.loading')) {
        container.innerHTML = '';
    }

    mensagens.forEach(msg => {
        // Se a mensagem já foi renderizada, ignora
        if (idsMensagensRenderizadas.has(msg.id)) return;

        const tipo = msg.remetente_tipo; // 'cliente' ou 'atendente'
        const hora = formatarHora(msg.enviado_em);
        let conteudo = msg.conteudo;

        // Se for mensagem de atendente, destaca o nome
        if (tipo === 'atendente' && msg.atendente_nome) {
            conteudo = `<span class="mensagem-atendente-nome">${msg.atendente_nome}:</span> ${conteudo}`;
        }

        // Se for nota interna
        let classeExtra = '';
        if (msg.tipo === 'nota') {
            classeExtra = 'nota';
            conteudo = `📝 <i>Nota Interna:</i><br>${msg.conteudo}`;
        }

        const msgHTML = `
            <div class="mensagem ${tipo} ${classeExtra}" data-id="${msg.id}">
                <div class="mensagem-conteudo">
                    ${msg.media_url ? renderizarMedia(msg.media_url, msg.media_type) : ''}
                    <div class="mensagem-texto">${conteudo}</div>
                    <div class="mensagem-hora">${hora}</div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', msgHTML);
        idsMensagensRenderizadas.add(msg.id);
    });

    // Processa novos ícones
    if (window.lucide) {
        lucide.createIcons();
    }

    // Scroll para o final se autoScroll estiver ativo
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    } else {
        // Mostra botão para descer se não estiver no fundo
        mostrarBotaoScroll();
    }
}

/**
 * Mostra botão flutuante para descer para o fim do chat
 */
function mostrarBotaoScroll() {
    let btn = document.getElementById('btn-scroll-bottom');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'btn-scroll-bottom';
        btn.innerHTML = '⬇ Novas mensagens';
        btn.onclick = () => {
            const container = document.getElementById('mensagens-container');
            container.scrollTop = container.scrollHeight;
            autoScroll = true;
            btn.style.display = 'none';
        };
        document.querySelector('.chat-area').appendChild(btn);
    }
    btn.style.display = 'block';
}

/**
 * Renderiza o elemento de mídia HTML adequado
 */
function renderizarMedia(url, tipo) {
    switch (tipo) {
        case 'image':
            return `<img src="${url}" class="media-preview" onclick="window.open('${url}', '_blank')">`;
        case 'video':
            return `<video src="${url}" controls class="media-video"></video>`;
        case 'audio':
            return `<audio src="${url}" controls class="media-audio"></audio>`;
        default:
            return `<a href="${url}" target="_blank" class="media-link">📎 Abrir arquivo</a>`;
    }
}

/**
 * Envia mensagem
 */
async function enviarMensagem() {
    const input = document.getElementById('mensagem-input');
    const selectAtendente = document.getElementById('atendente-select');

    const texto = input.value.trim();
    const atendenteId = (usuarioLogado && usuarioLogado.nivel !== 'admin')
        ? usuarioLogado.atendente_id
        : selectAtendente.value;

    // Validações
    if (!texto) {
        alert('Digite uma mensagem');
        return;
    }

    if (!atendenteId) {
        alert('Selecione um atendente');
        return;
    }

    if (!conversaAtual) {
        alert('Selecione uma conversa');
        return;
    }

    try {
        // Verifica se é nota interna
        const isNota = document.getElementById('nota-interna-check').checked;
        const endpoint = isNota ? '/api/enviar-nota' : '/api/enviar';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numero: conversaAtual.numero,
                texto: texto,
                atendenteId: parseInt(atendenteId)
            })
        });

        const result = await response.json();

        if (result.success) {
            // Limpa input e checkbox
            input.value = '';
            if (isNota) document.getElementById('nota-interna-check').checked = false;

            // Recarrega mensagens
            await carregarMensagens(conversaAtual.id);

            // Atualiza lista de conversas
            carregarConversas();
        } else {
            alert('Erro ao enviar mensagem: ' + result.error);
        }

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        alert('Erro ao enviar mensagem. Verifique a conexão.');
    }
}

/**
 * Atualiza status da conversa
 */
async function atualizarStatus() {
    if (!conversaAtual) return;

    const select = document.getElementById('status-select');
    const novoStatus = select.value;

    try {
        const response = await fetch(`/api/conversa/${conversaAtual.id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });

        const result = await response.json();

        if (result.success) {
            conversaAtual.status = novoStatus;
            document.getElementById('chat-status').textContent = traduzirStatus(novoStatus);
            carregarConversas();
        }

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

/**
 * Limpa o histórico de uma conversa
 */
async function limparConversa() {
    if (!conversaAtual) return;

    if (!confirm('Tem certeza que deseja apagar TODAS as mensagens desta conversa?')) return;

    try {
        const response = await fetch(`/api/conversa/${conversaAtual.id}/limpar`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            alert('Conversa limpa com sucesso!');
            carregarMensagens(conversaAtual.id);
        }
    } catch (error) {
        console.error('Erro ao limpar conversa:', error);
    }
}

/**
 * Exclui a conversa completa do banco de dados
 */
async function deletarConversa() {
    if (!conversaAtual) return;

    if (!confirm('Tem certeza que deseja EXCLUIR esta conversa completamente do sistema? Isso não pode ser desfeito.')) return;

    try {
        const response = await fetch(`/api/conversa/${conversaAtual.id}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            alert('Conversa excluída com sucesso!');
            conversaAtual = null;
            document.getElementById('chat-ativo').style.display = 'none';
            document.getElementById('chat-vazio').style.display = 'flex';
            carregarConversas();
        }
    } catch (error) {
        console.error('Erro ao excluir conversa:', error);
        alert('Erro ao excluir conversa.');
    }
}

/**
 * Fixa ou desfixa a conversa atual
 */
async function alternarFixar() {
    if (!conversaAtual) return;

    const novoEstado = !conversaAtual.fixada;

    try {
        const response = await fetch(`/api/conversa/${conversaAtual.id}/fixar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fixada: novoEstado })
        });
        const result = await response.json();

        if (result.success) {
            conversaAtual.fixada = novoEstado;

            // Atualiza o botão
            const btnFixar = document.querySelector('.btn-fixar');
            if (novoEstado) {
                btnFixar.classList.add('ativa');
                btnFixar.title = "Desafixar do topo";
            } else {
                btnFixar.classList.remove('ativa');
                btnFixar.title = "Fixar no topo";
            }

            carregarConversas();
        }
    } catch (error) {
        console.error('Erro ao fixar conversa:', error);
    }
}

/**
 * Inicia uma nova conversa
 */
async function novaConversa() {
    const numero = prompt('Digite o número do WhatsApp (ex: 5511999999999):');
    if (!numero) return;

    const numeroFormatado = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;

    try {
        const response = await fetch('/api/conversas');
        const result = await response.json();

        // Verifica se já existe
        const existente = result.data.find(c => c.numero_cliente === numeroFormatado);

        if (existente) {
            abrirConversa(existente.id, existente.numero_cliente, existente.status, existente.nome_cliente);
        } else {
            // Cria nova enviando uma mensagem invisível ou apenas abrindo
            // Como obterOuCriarConversa é chamado no bot, vamos simular abrindo o chat
            // Para simplificar, vamos pedir para o bot iniciar (se implementado)
            // Por enquanto, vamos apenas informar
            alert('Para iniciar, envie a primeira mensagem para este número.');
            // O sistema criará a conversa assim que a primeira mensagem for enviada
        }
    } catch (error) {
        console.error('Erro ao buscar conversa:', error);
    }
}

/**
 * Permite enviar mensagem com Enter
 */
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        enviarMensagem();
    }
}

/**
 * Inicia atualização automática das conversas
 */
function iniciarAtualizacaoAutomatica() {
    // Atualiza a cada 5 segundos
    intervalAtualizacao = setInterval(() => {
        carregarConversas();

        // Se há conversa aberta, atualiza mensagens
        if (conversaAtual) {
            carregarMensagens(conversaAtual.id);
        }
    }, 5000);
}

/**
 * Envia um arquivo/mídia pelo portal
 */
async function enviarArquivo() {
    const fileInput = document.getElementById('arquivo-input');
    if (!fileInput.files || fileInput.files.length === 0) return;
    if (!conversaAtual) {
        alert('Selecione uma conversa primeiro');
        return;
    }
    const atendenteId = (usuarioLogado && usuarioLogado.nivel !== 'admin')
        ? usuarioLogado.atendente_id
        : document.getElementById('atendente-select').value;
    if (!atendenteId) {
        alert('Selecione um atendente');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('numero', conversaAtual.numero);
    formData.append('atendenteId', atendenteId);

    // Opcional: pedir legenda
    const legenda = prompt('Digite uma legenda (opcional):', '');
    if (legenda !== null) {
        formData.append('legenda', legenda);
    }

    try {
        // Feedback visual
        document.querySelector('.btn-anexo').textContent = '⏳';

        const response = await fetch('/api/enviar-midia', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // Limpa input
            fileInput.value = '';
            // Recarrega mensagens
            await carregarMensagens(conversaAtual.id);
        } else {
            alert('Erro ao enviar arquivo: ' + result.error);
        }
    } catch (error) {
        console.error('Erro ao enviar arquivo:', error);
        alert('Erro de conexão ao enviar arquivo');
    } finally {
        document.querySelector('.btn-anexo').textContent = '📎';
    }
}

// ========== FUNÇÕES AUXILIARES ==========

/**
 * Formata número de telefone
 */
function formatarNumero(numero) {
    // Remove @s.whatsapp.net
    const limpo = numero.replace('@s.whatsapp.net', '');

    // Formata: +55 11 99999-9999
    if (limpo.length >= 12) {
        return `+${limpo.slice(0, 2)} ${limpo.slice(2, 4)} ${limpo.slice(4, 9)}-${limpo.slice(9)}`;
    }

    return limpo;
}

/**
 * Formata hora
 */
function formatarHora(dataISO) {
    if (!dataISO) return '';

    const data = new Date(dataISO);
    const agora = new Date();

    const optionsTime = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' };
    const optionsDate = { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' };

    // Compara datas usando o timezone de Brasília
    const dataBR = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(data);
    const agoraBR = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(agora);

    // Se for hoje, mostra só a hora
    if (dataBR === agoraBR) {
        return data.toLocaleTimeString('pt-BR', optionsTime);
    }

    // Ontem
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    const ontemBR = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(ontem);

    if (dataBR === ontemBR) {
        return 'Ontem';
    }

    // Caso contrário, mostra a data
    return data.toLocaleDateString('pt-BR', optionsDate);
}

/**
 * Traduz status para português
 */
function traduzirStatus(status) {
    const traducoes = {
        'aguardando': 'Aguardando',
        'em_atendimento': 'Em Atendimento',
        'finalizado': 'Finalizado'
    };

    return traducoes[status] || status;
}

/**
 * Monitora status da conexão
 */
function monitorarConexao() {
    setInterval(async () => {
        try {
            const response = await fetch('/api/whatsapp/status');
            const data = await response.json();
            const banner = document.getElementById('connection-banner');

            if (!data.connected) {
                banner.style.display = 'flex';
                // Bloqueia inputs
                document.getElementById('mensagem-input').disabled = true;
                document.querySelector('.btn-enviar').disabled = true;
            } else {
                banner.style.display = 'none';
                document.getElementById('mensagem-input').disabled = false;
                document.querySelector('.btn-enviar').disabled = false;
            }
        } catch (error) {
            console.error('Erro ao verificar conexão:', error);
        }
    }, 5000);
}

/**
 * Força reconexão
 */
async function reconnectWhatsApp() {
    if (!confirm('Deseja reiniciar a conexão?')) return;
    try {
        await fetch('/api/whatsapp/reconnect', { method: 'POST' });
        alert('Reinicialização solicitada. Aguarde.');
        window.location.reload();
    } catch (e) {
        alert('Erro ao solicitar reconexão');
    }
}

// --- Lógica de Gravação de Áudio ---
let mediaRecorder;
let audioChunks = [];
let recordingTimer;
let recordingSeconds = 0;

document.addEventListener('DOMContentLoaded', () => { 
    // Listeners de Áudio (Adicionados dinamicamente)
    setTimeout(() => {
        const btnGravar = document.getElementById('btn-gravar-audio');
        if(btnGravar) btnGravar.addEventListener('click', iniciarGravacao);

        const btnCancelar = document.getElementById('btn-cancelar-gravacao');
        if(btnCancelar) btnCancelar.addEventListener('click', cancelarGravacao);

        const btnEnviar = document.getElementById('btn-enviar-audio');
        if(btnEnviar) btnEnviar.addEventListener('click', finalizarEnvioAudio);
    }, 1000); // Delay para garantir carregamento do DOM
});

async function iniciarGravacao() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Seu navegador não suporta gravação de áudio.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.start();

        // Interface
        document.getElementById('input-normal-ui').style.display = 'none';
        document.getElementById('recording-ui').style.display = 'flex';
        
        // Timer
        recordingSeconds = 0;
        document.getElementById('recording-timer').innerText = "00:00";
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const min = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
            const sec = (recordingSeconds % 60).toString().padStart(2, '0');
            document.getElementById('recording-timer').innerText = min+":"+sec;
        }, 1000);

    } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Erro ao acessar microfone. Verifique as permissões.');
    }
}

function cancelarGravacao() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Libera mic
    }
    clearInterval(recordingTimer);
    
    // Restaura UI
    document.getElementById('input-normal-ui').style.display = 'flex';
    document.getElementById('recording-ui').style.display = 'none';
}

function finalizarEnvioAudio() {
    if (!mediaRecorder) return;

    // Para e define o callback de envio
    mediaRecorder.onstop = async () => {
        clearInterval(recordingTimer);
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); 
        
        // Prepara upload
        const formData = new FormData();
        const atendente = JSON.parse(localStorage.getItem('usuario'));
        const filename = "audio_" + Date.now() + ".webm"; 
        
        formData.append('file', audioBlob, filename);
        formData.append('numero', numeroSelecionado); 
        formData.append('atendenteId', atendente.id);

        try {
            // Mostra enviando
            document.getElementById('recording-ui').style.display = 'none';
            document.getElementById('input-normal-ui').style.display = 'flex';

            console.log('Enviando áudio...', filename);

            const response = await fetch('/api/enviar-midia', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.success) {
                console.log('Áudio enviado!');
                // Pequeno delay para o back processar
                setTimeout(() => carregarMensagens(numeroSelecionado), 1000);
            } else {
                alert('Erro ao enviar áudio: ' + result.error);
            }
        } catch (error) {
            console.error('Erro no envio:', error);
            alert('Falha ao enviar áudio.');
        }

        // Limpa recursos
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.stop();
}
