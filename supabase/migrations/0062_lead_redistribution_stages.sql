-- Migration 0062: Estágios de redistribuição de leads
-- Permite rastrear quantas vezes um lead foi redistribuído e para onde foi
-- Suporta as regras: lead próprio (7 dias) → equipe → cross-team

-- Campos na tabela leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS redistribution_stage    INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redistributed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_broker_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN leads.redistribution_stage IS
  '0 = original, 1 = redistribuído dentro da equipe, 2 = redistribuído cross-team';
COMMENT ON COLUMN leads.redistributed_at IS
  'Timestamp da última redistribuição (usado para calcular timeout do estágio seguinte)';
COMMENT ON COLUMN leads.original_broker_id IS
  'Corretor que recebeu o lead originalmente (antes de qualquer redistribuição)';

-- Configurações do agente (insere só se não existir)
INSERT INTO system_settings (key, value, description) VALUES
  ('agente_redistribuicao_proprio_threshold_h', 168,
   'Horas sem interação para redistribuir lead próprio (no_redistribute=true). Padrão: 168h = 7 dias'),
  ('agente_redistribuicao_stage2_threshold_h', 48,
   'Horas sem resposta após redistribuição stage 1 para acionar cross-team. Padrão: 48h'),
  ('agente_redistribuicao_aviso_proprio_h', 120,
   'Horas sem interação para enviar aviso ao corretor de lead próprio antes de redistribuir. Padrão: 120h = 5 dias')
ON CONFLICT (key) DO NOTHING;

-- Índices para performance das queries do agente
CREATE INDEX IF NOT EXISTS idx_leads_redistribution_stage
  ON leads (redistribution_stage) WHERE status IN ('NEW', 'IN_PROGRESS', 'DOCS_REQUESTED');

CREATE INDEX IF NOT EXISTS idx_leads_redistributed_at
  ON leads (redistributed_at) WHERE redistribution_stage > 0;
