#!/bin/bash

# Script anti-travamento (Cria Memória Swap)
# Ideal para AWS EC2 t2.micro (1GB RAM)

echo "📊 Verificando memória atual..."
free -h

if grep -q "swapfile" /etc/fstab; then
    echo "✅ Swap já existe. Nada a fazer."
else
    echo "🛠️ Criando Swap de 2GB..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    
    echo "💾 Tornando permanente..."
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    
    # Ajusta para usar swap apenas quando necessário
    sudo sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    
    echo "✅ Sucesso! Memória extra criada."
    free -h
fi
