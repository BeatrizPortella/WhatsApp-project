#!/bin/bash

echo "🚀 Iniciando configuração do servidor WhatsApp..."

# Ir para pasta do projeto
cd ~/whatsapp-project || exit 1

# Parar qualquer processo na porta 3000
echo "🔄 Parando processos antigos..."
sudo lsof -ti:3000 | xargs -r sudo kill -9 2>/dev/null
sleep 2

# Modificar server.js para escutar em 0.0.0.0
echo "⚙️  Configurando servidor..."
sed -i "s/app.listen(PORT, () => {/app.listen(PORT, '0.0.0.0', () => {/g" src/server.js

# Iniciar servidor
echo "✅ Iniciando servidor..."
node src/server.js
