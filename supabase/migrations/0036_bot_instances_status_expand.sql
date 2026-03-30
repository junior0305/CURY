-- Expande o CHECK constraint de bot_instances.status para incluir
-- os valores retornados pela Evolution API: 'open' e 'connecting'
-- Necessário para o health check automático atualizar o status real de cada instância.

ALTER TABLE public.bot_instances
  DROP CONSTRAINT IF EXISTS bot_instances_status_check;

ALTER TABLE public.bot_instances
  ADD CONSTRAINT bot_instances_status_check
  CHECK (status IN ('active', 'paused', 'offline', 'blocked', 'open', 'connecting'));
