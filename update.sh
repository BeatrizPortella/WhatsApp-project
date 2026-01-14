#!/bin/bash
echo "🛑 Parando bot..."
pm2 stop whatsapp-bot

echo "🧹 Limpando instalação antiga..."
rm -rf node_modules
rm -rf package-lock.json
rm -rf .wwebjs_auth
echo "🧹 Limpando módulos antigos..."
rm -rf node_modules
rm -rf package-lock.json

echo "📦 Instalando via Tarball (HTTPS)..."
git pull origin main
npm install --no-git-tag-version

echo "🔄 Rodando migrações..."
node src/migrate_v7.js

echo "🚀 Reiniciando..."
pm2 restart whatsapp-bot --update-env

echo "✅ Concluído! Aguarde o QR Code."
