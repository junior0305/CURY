
-- Adicionar coluna de quantidade alvo nas regras de recompensa
ALTER TABLE public.reward_configs 
ADD COLUMN IF NOT EXISTS target_count INTEGER DEFAULT 1;

-- Limpar conquistas antigas (Resetar o Dashboard)
DELETE FROM public.achievements;

-- Limpar logs de áudio lidos (já que resetamos as conquistas)
DELETE FROM public.audio_notifications_read;
