
-- Adicionar controle de tempo do último cutucão no lead
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMP WITH TIME ZONE;

-- Adicionar contador de advertências no perfil do usuário
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;
