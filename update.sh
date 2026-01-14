#!/bin/bash
echo "🛑 Parando bot..."
pm2 stop whatsapp-bot

echo "🧹 Limpando instalação antiga..."
rm -rf node_modules
rm -rf package-lock.json
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache
rm -rf auth_info

echo "🔧 Configurando Git para usar HTTPS..."
git config --global url."https://github.com/".insteadOf git@github.com:
git config --global url."https://".insteadOf git://

echo "📦 Instalando dependências..."
git pull origin main
rm -rf node_modules
npm install

echo "🚀 Reiniciando..."
pm2 restart whatsapp-bot --update-env

echo "✅ Concluído! Aguarde o QR Code."
