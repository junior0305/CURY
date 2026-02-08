-- 1. Tabela de Campanhas Ativas (Hero Banner)
CREATE TABLE IF NOT EXISTS public.active_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  target_action TEXT NOT NULL, -- 'VISIT', 'SALE', 'DOCS'
  target_count INTEGER NOT NULL DEFAULT 10,
  reward_amount DECIMAL(10,2) NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.active_campaigns ENABLE ROW LEVEL SECURITY;

-- 3. Políticas
CREATE POLICY "Anyone can view active campaigns" ON public.active_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage active campaigns" ON public.active_campaigns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERINTENDENT')));

-- 4. Inserir campanha inicial de exemplo
INSERT INTO public.active_campaigns (title, description, target_action, target_count, reward_amount, ends_at)
VALUES ('SEMANA VISITA TURBINADA', 'Agende 10 visitas e ganhe prêmio extra no PIX!', 'VISIT', 10, 150.00, NOW() + interval '7 days')
ON CONFLICT DO NOTHING;
