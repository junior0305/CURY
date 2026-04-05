-- Module 1: lock por fila — impede redistribuição de leads de campanhas pessoais/grupos

-- 1. Campo na fila: quando ativado, leads atribuídos por essa fila não são redistribuídos
ALTER TABLE distribution_queues
  ADD COLUMN IF NOT EXISTS lock_after_assignment BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN distribution_queues.lock_after_assignment IS
  'Quando TRUE, leads distribuídos por essa fila ficam travados ao corretor atribuído e nunca são redistribuídos automaticamente (uso para campanhas pessoais e caixa-único).';

-- 2. Campo no lead: marcado quando atribuído via fila com lock_after_assignment = true
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS no_redistribute BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leads.no_redistribute IS
  'Quando TRUE, o agente de redistribuição ignora este lead. Setado automaticamente quando o lead entra por uma fila com lock_after_assignment = true.';

-- Índice para o agente de redistribuição filtrar rápido
CREATE INDEX IF NOT EXISTS idx_leads_no_redistribute ON leads (no_redistribute) WHERE no_redistribute = FALSE;
