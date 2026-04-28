-- Permite que o corretor pause mensagens automáticas por lead
-- quando está em conversa ativa e não quer que o bot interfira.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pause_auto_messages BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leads.pause_auto_messages IS
  'Quando true, suspende todos os envios automáticos de WhatsApp para este lead '
  '(ai-sentinela, agente-sentinela-quentes, agente-recuperacao). '
  'Controlado pelo próprio corretor via dashboard.';

CREATE INDEX IF NOT EXISTS idx_leads_pause_auto_messages
  ON leads (pause_auto_messages)
  WHERE pause_auto_messages = FALSE;
