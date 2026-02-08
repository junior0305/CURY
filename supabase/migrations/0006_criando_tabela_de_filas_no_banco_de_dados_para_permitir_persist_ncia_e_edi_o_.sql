-- Criar tabela de filas de distribuição
CREATE TABLE IF NOT EXISTS public.distribution_queues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'titulo',
  match_value TEXT NOT NULL,
  broker_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_assigned_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.distribution_queues ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Admin gerenciar filas
DROP POLICY IF EXISTS "admin_manage_queues" ON public.distribution_queues;
CREATE POLICY "admin_manage_queues" ON public.distribution_queues
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('SUPERINTENDENT', 'MANAGER', 'ADMIN')
  )
);
