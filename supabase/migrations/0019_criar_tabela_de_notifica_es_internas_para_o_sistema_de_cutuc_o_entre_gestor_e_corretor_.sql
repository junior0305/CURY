CREATE TABLE IF NOT EXISTS public.internal_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'STALE_LEAD_ALERT',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Users see their own notifications" ON public.internal_notifications 
FOR SELECT TO authenticated USING (to_id = auth.uid());

CREATE POLICY "Users can insert notifications to their reports" ON public.internal_notifications 
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" ON public.internal_notifications 
FOR UPDATE TO authenticated USING (to_id = auth.uid());
