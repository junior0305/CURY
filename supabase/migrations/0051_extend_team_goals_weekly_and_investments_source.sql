-- Extender team_goals: suporte semanal + metadados
ALTER TABLE public.team_goals
  ADD COLUMN IF NOT EXISTS week_start DATE,          -- NULL = meta mensal; data = início da semana (segunda)
  ADD COLUMN IF NOT EXISTS goal_type  TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'weekly'
  ADD COLUMN IF NOT EXISTS set_by     UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS notes      TEXT;

-- Remove restrição antiga e cria uma composta que suporta os dois modos
ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_team_id_month_key;

ALTER TABLE public.team_goals
  ADD CONSTRAINT team_goals_unique_goal
  UNIQUE (team_id, goal_type, month, week_start);

-- Política: manager pode inserir/atualizar metas da própria equipe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'team_goals'
    AND policyname = 'Managers can manage own team goals'
  ) THEN
    CREATE POLICY "Managers can manage own team goals" ON public.team_goals
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'MANAGER'
        AND profiles.team_id = team_goals.team_id
      )
    );
  END IF;
END $$;

-- ─── Extender team_investments ────────────────────────────────────────────────
ALTER TABLE public.team_investments
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manager', -- 'manager' | 'broker' | 'superintendent'
  ADD COLUMN IF NOT EXISTS week_start DATE;  -- NULL = sem semana específica; data = segunda da semana
