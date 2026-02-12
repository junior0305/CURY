
CREATE TABLE IF NOT EXISTS public.team_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- Storing the first day of the month
  sales_target INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, month)
);

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team goals" ON public.team_goals
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('ADMIN', 'SUPERINTENDENT')
  )
);

CREATE POLICY "Everyone can view team goals" ON public.team_goals
FOR SELECT TO authenticated
USING (true);
