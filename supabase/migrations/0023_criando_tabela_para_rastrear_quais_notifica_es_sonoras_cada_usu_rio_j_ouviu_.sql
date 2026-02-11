
-- Tabela para rastrear sons reproduzidos por usuário
CREATE TABLE IF NOT EXISTS public.audio_notifications_read (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Habilitar RLS
ALTER TABLE public.audio_notifications_read ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Users can see their own audio logs" ON public.audio_notifications_read
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own audio logs" ON public.audio_notifications_read
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
