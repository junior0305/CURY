CREATE TABLE IF NOT EXISTS public.distribution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_name TEXT,
  lead_phone TEXT,
  queue_name TEXT,
  assigned_to_name TEXT,
  status TEXT, -- 'SUCCESS', 'FAILED', 'NO_BROKER_AVAILABLE'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.distribution_logs ENABLE ROW LEVEL SECURITY;

-- Permitir que Admins vejam os logs
CREATE POLICY "admin_view_logs" ON public.distribution_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('SUPERINTENDENT', 'MANAGER', 'ADMIN')
  )
);
