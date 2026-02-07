-- Tabela de Leads
CREATE TABLE public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', -- NEW, IN_PROGRESS, VISIT_SCHEDULED, DOCS_REQUESTED, EXCLUDED, ABANDONED
  broker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tag TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  exclusion_reason TEXT -- Novo campo para o motivo da exclusão
);

-- Habilitar RLS (OBRIGATÓRIO)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS

-- 1. SELECT: Corretores veem apenas seus leads. Gestores (MANAGER/SUPERINTENDENT) veem todos os leads da sua equipe/todos.
CREATE POLICY "Allow authenticated users to view their own leads or team leads" ON public.leads
FOR SELECT TO authenticated USING (
  (auth.uid() = broker_id) OR
  (auth.uid() = manager_id) OR
  (EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE (
      (profiles.id = auth.uid()) AND 
      (profiles.role = 'SUPERINTENDENT')
    )
  )) OR
  (EXISTS (
    SELECT 1
    FROM public.profiles AS manager_profile
    WHERE (
      (manager_profile.id = auth.uid()) AND 
      (manager_profile.role = 'MANAGER') AND
      (manager_profile.team_id = (SELECT team_id FROM public.profiles WHERE id = leads.broker_id))
    )
  ))
);

-- 2. INSERT: Apenas Edge Functions (via service_role) ou gestores podem inserir/atualizar leads.
-- Para simplificar, permitiremos INSERT apenas via service_role (Edge Functions)
CREATE POLICY "Allow service role to insert leads" ON public.leads
FOR INSERT WITH CHECK (
  (SELECT auth.role()) = 'service_role'
);

-- 3. UPDATE: Corretores podem atualizar seus leads. Gestores podem atualizar leads da equipe.
CREATE POLICY "Allow brokers to update their own leads" ON public.leads
FOR UPDATE TO authenticated USING (auth.uid() = broker_id) WITH CHECK (auth.uid() = broker_id);

CREATE POLICY "Allow managers/supers to update team leads" ON public.leads
FOR UPDATE TO authenticated USING (
  (EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE (
      (profiles.id = auth.uid()) AND 
      (profiles.role = 'SUPERINTENDENT')
    )
  )) OR
  (EXISTS (
    SELECT 1
    FROM public.profiles AS manager_profile
    WHERE (
      (manager_profile.id = auth.uid()) AND 
      (manager_profile.role = 'MANAGER') AND
      (manager_profile.team_id = (SELECT team_id FROM public.profiles WHERE id = leads.broker_id))
    )
  ))
);

-- 4. DELETE: Apenas service_role ou SUPERINTENDENT
CREATE POLICY "Allow service role or superintendent to delete leads" ON public.leads
FOR DELETE USING (
  (SELECT auth.role()) = 'service_role' OR
  (EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE (
      (profiles.id = auth.uid()) AND 
      (profiles.role = 'SUPERINTENDENT')
    )
  ))
);