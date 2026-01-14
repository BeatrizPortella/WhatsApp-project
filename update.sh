#!/bin/bash
echo "🛑 Parando bot..."
pm2 stop whatsapp-bot

echo "🧹 Limpando instalação antiga..."
rm -rf node_modules
rm -rf package-lock.json
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache
rm -rf auth_info

echo "📥 Baixando última versão da lib..."
git pull origin main
npm install

echo "🚀 Reiniciando..."
pm2 restart whatsapp-bot --update-env

echo "✅ Concluído! Aguarde o QR Code."
