#!/bin/bash
echo "🛑 Parando bot..."
pm2 stop whatsapp-bot

echo "🧹 Limpando instalação antiga..."
rm -rf node_modules
rm -rf package-lock.json
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache
rm -rf auth_info

echo "📥 Baixando versão manual do GitHub..."
curl -L -o wwebjs.tar.gz https://github.com/pedroslopez/whatsapp-web.js/archive/refs/heads/webpack-exodus.tar.gz

echo "📦 Instalando dependências..."
git pull origin main
npm install

echo "🚀 Reiniciando..."
pm2 restart whatsapp-bot --update-env

echo "✅ Concluído! Aguarde o QR Code."
