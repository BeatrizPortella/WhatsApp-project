-- ============================================
-- SCRIPT SQL PARA SUPABASE
-- Sistema de Atendimento WhatsApp
-- ============================================

-- Tabela de atendentes
CREATE TABLE IF NOT EXISTS atendentes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de usuários para login
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    atendente_id INTEGER REFERENCES atendentes(id) ON DELETE CASCADE,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    nivel VARCHAR(20) DEFAULT 'operador', -- 'operador' ou 'admin'
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversas (
    id SERIAL PRIMARY KEY,
    numero_cliente VARCHAR(50) NOT NULL UNIQUE,
    nome_cliente VARCHAR(100),
    atendente_id INTEGER REFERENCES atendentes(id),
    status VARCHAR(20) DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'em_atendimento', 'finalizado')),
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS mensagens (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    remetente_tipo VARCHAR(10) NOT NULL CHECK (remetente_tipo IN ('cliente', 'atendente')),
    atendente_id INTEGER REFERENCES atendentes(id),
    conteudo TEXT NOT NULL,
    media_url TEXT,
    media_type VARCHAR(20),
    enviado_em TIMESTAMP DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_conversas_numero ON conversas(numero_cliente);
CREATE INDEX IF NOT EXISTS idx_conversas_status ON conversas(status);
CREATE INDEX IF NOT EXISTS idx_conversas_atualizado ON conversas(atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_enviado ON mensagens(enviado_em DESC);

-- Trigger para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_conversa
BEFORE UPDATE ON conversas
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();

-- Inserir atendentes solicitados
INSERT INTO atendentes (nome) VALUES 
    ('Chalison'),
    ('Chaene')
ON CONFLICT DO NOTHING;

-- Verificar dados inseridos
SELECT * FROM atendentes;

-- ============================================
-- QUERIES ÚTEIS PARA MANUTENÇÃO
-- ============================================

-- Ver todas as conversas ativas
-- SELECT c.*, a.nome as atendente 
-- FROM conversas c 
-- LEFT JOIN atendentes a ON c.atendente_id = a.id 
-- WHERE c.status != 'finalizado' 
-- ORDER BY c.atualizado_em DESC;

-- Ver mensagens de uma conversa específica
-- SELECT m.*, a.nome as atendente 
-- FROM mensagens m 
-- LEFT JOIN atendentes a ON m.atendente_id = a.id 
-- WHERE m.conversa_id = 1 
-- ORDER BY m.enviado_em ASC;

-- Estatísticas de atendimento
-- SELECT 
--     a.nome,
--     COUNT(DISTINCT c.id) as total_conversas,
--     COUNT(m.id) as total_mensagens
-- FROM atendentes a
-- LEFT JOIN conversas c ON c.atendente_id = a.id
-- LEFT JOIN mensagens m ON m.atendente_id = a.id
-- GROUP BY a.id, a.nome;
