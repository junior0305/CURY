-- ── 0058_fix_lead_activation_queue_status.sql ────────────────────────────────
-- Adiciona 'processing' ao CHECK constraint de lead_activation_queue.status
-- O cerebro-orquestrador usa status='processing' para claim atômico de itens,
-- mas a migração original (0042) não incluiu esse valor no constraint.
-- Isso causava falha silenciosa ao tentar marcar itens como 'processing',
-- resultando em 0 execuções registradas no cerebro_runs.

ALTER TABLE public.lead_activation_queue
  DROP CONSTRAINT IF EXISTS lead_activation_queue_status_check;

ALTER TABLE public.lead_activation_queue
  ADD CONSTRAINT lead_activation_queue_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed'));
