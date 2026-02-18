-- SCRIPT MESTRE DE PERMISSÕES (RODAR NO SQL EDITOR)

-- 1. Garantir que RLS está ativo em tudo
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS PARA PROFILES (QUEM PODE VER QUEM)
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles 
FOR UPDATE TO authenticated 
USING (
  auth.uid() = id OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('SUPERINTENDENT', 'ADMIN'))
);

-- 3. POLÍTICAS PARA LEADS (VISÃO TÁTICA)
DROP POLICY IF EXISTS "leads_access_policy" ON public.leads;
CREATE POLICY "leads_access_policy" ON public.leads 
FOR ALL TO authenticated 
USING (
  broker_id = auth.uid() OR 
  manager_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('SUPERINTENDENT', 'ADMIN'))
);

-- 4. POLÍTICAS PARA TAREFAS
DROP POLICY IF EXISTS "tasks_access_policy" ON public.tasks;
CREATE POLICY "tasks_access_policy" ON public.tasks 
FOR ALL TO authenticated 
USING (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('SUPERINTENDENT', 'ADMIN'))
);

-- 5. POLÍTICAS PARA NOTAS DE LEADS
DROP POLICY IF EXISTS "notes_access_policy" ON public.lead_notes;
CREATE POLICY "notes_access_policy" ON public.lead_notes 
FOR ALL TO authenticated 
USING (
  broker_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('SUPERINTENDENT', 'ADMIN'))
);

-- 6. PERMISSÃO PARA EXECUTAR EDGE FUNCTIONS (IMPORTANTE)
-- Garante que usuários autenticados possam invocar funções
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;