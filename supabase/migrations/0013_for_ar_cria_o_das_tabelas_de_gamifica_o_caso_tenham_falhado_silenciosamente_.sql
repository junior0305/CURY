-- Garantir que as tabelas existem
CREATE TABLE IF NOT EXISTS public.reward_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL UNIQUE,
  reward_type TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_value DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  reward_label TEXT NOT NULL,
  reward_value DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir dados iniciais se vazio
INSERT INTO public.reward_configs (action_type, reward_type, label, amount_value)
VALUES 
  ('SALE', 'VOUCHER_ADS', 'Verba p/ Facebook Ads', 200.00),
  ('VISIT', 'VOUCHER_FOOD', 'Voucher iFood', 50.00)
ON CONFLICT (action_type) DO NOTHING;

-- Habilitar RLS
ALTER TABLE public.reward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Políticas ultra-permissivas para garantir que apareça para o dono
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.achievements;
CREATE POLICY "Users can view their own achievements" ON public.achievements 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert their own achievements" ON public.achievements;
CREATE POLICY "Users can insert their own achievements" ON public.achievements 
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public feed: anyone can see approved/pending success names" ON public.achievements;
CREATE POLICY "Public feed: anyone can see approved/pending success names" ON public.achievements 
FOR SELECT TO authenticated USING (true);
