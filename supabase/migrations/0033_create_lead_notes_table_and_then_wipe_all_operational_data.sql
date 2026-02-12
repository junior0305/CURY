
-- 1. Criar tabela de notas (Chat History) se não existir
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notes visibility" ON public.lead_notes
FOR ALL TO authenticated
USING (true); -- Simplificado para MVP, mas idealmente filtraria por dono do lead

-- 2. Limpeza Profunda (Agora com a tabela correta)
SET session_replication_role = 'replica';

TRUNCATE TABLE 
  public.lead_notes,
  public.tasks,
  public.funnel_history,
  public.achievements,
  public.distribution_logs,
  public.internal_notifications,
  public.team_investments,
  public.team_goals,
  public.leads
CASCADE;

SET session_replication_role = 'origin';

-- 3. Resetar contadores de advertência dos usuários
UPDATE public.profiles SET warning_count = 0;
