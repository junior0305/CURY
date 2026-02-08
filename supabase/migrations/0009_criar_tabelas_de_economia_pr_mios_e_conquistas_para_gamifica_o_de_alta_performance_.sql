-- 1. Tabela de Configuração de Prêmios (Admin define o valor)
CREATE TABLE IF NOT EXISTS public.reward_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL UNIQUE, -- 'SALE', 'VISIT', 'DOCS'
  reward_type TEXT NOT NULL, -- 'PIX', 'VOUCHER_ADS', 'VOUCHER_FOOD'
  label TEXT NOT NULL,
  amount_value DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Conquistas (Quem ganhou o quê)
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  reward_label TEXT NOT NULL,
  reward_value DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Inserir valores padrão iniciais
INSERT INTO public.reward_configs (action_type, reward_type, label, amount_value)
VALUES 
  ('SALE', 'VOUCHER_ADS', 'Verba p/ Facebook Ads', 200.00),
  ('SALE', 'PIX', 'Prêmio em Dinheiro (PIX)', 500.00),
  ('VISIT', 'VOUCHER_FOOD', 'Voucher iFood', 50.00)
ON CONFLICT (action_type) DO NOTHING;

-- 4. Habilitar RLS
ALTER TABLE public.reward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- 5. Políticas
CREATE POLICY "Anyone can view active reward configs" ON public.reward_configs FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage reward configs" ON public.reward_configs FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERINTENDENT')));

CREATE POLICY "Users can view their own achievements" ON public.achievements FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERINTENDENT', 'MANAGER')));
CREATE POLICY "Public feed: anyone can see approved/pending success names" ON public.achievements FOR SELECT TO authenticated USING (true);
