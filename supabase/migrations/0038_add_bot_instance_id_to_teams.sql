-- Adiciona instância WhatsApp por equipe para notificações de novos leads
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS bot_instance_id UUID REFERENCES public.bot_instances(id) ON DELETE SET NULL;
