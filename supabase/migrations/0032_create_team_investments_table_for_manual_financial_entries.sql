
CREATE TABLE IF NOT EXISTS public.team_investments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  investor_id UUID REFERENCES public.profiles(id),
  category TEXT NOT NULL, -- 'MARKETING', 'INFRA', 'BONUS_OFF', 'EVENTS'
  amount DECIMAL(10,2) NOT NULL,
  investment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.team_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage investments" ON public.team_investments
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('ADMIN', 'SUPERINTENDENT', 'MANAGER')
  )
);

CREATE POLICY "Everyone views investments" ON public.team_investments
FOR SELECT TO authenticated
USING (true);
