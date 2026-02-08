-- 1. Corrigir RLS dos Leads: Broker só vê o seu, Manager vê do time, Super vê tudo.
-- Já tínhamos uma política, vamos torná-la mais rigorosa para SELECT.
DROP POLICY IF EXISTS "Allow users to see their leads" ON public.leads;

CREATE POLICY "Leads access policy" ON public.leads
FOR SELECT TO authenticated
USING (
  -- O próprio dono (Broker)
  (auth.uid() = broker_id) 
  OR 
  -- O gestor direto do dono
  (EXISTS (
    SELECT 1 FROM public.profiles manager_p
    WHERE manager_p.id = auth.uid() 
    AND manager_p.role = 'MANAGER'
    AND manager_p.id = leads.manager_id
  ))
  OR
  -- Superintendente ou Admin vê tudo
  (EXISTS (
    SELECT 1 FROM public.profiles admin_p
    WHERE admin_p.id = auth.uid() 
    AND admin_p.role IN ('SUPERINTENDENT', 'ADMIN')
  ))
);

-- 2. Corrigir RLS das Conquistas (Achievements): Broker só vê a sua na Galeria.
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.achievements;

CREATE POLICY "Individual achievements access" ON public.achievements
FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id)
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles admin_p
    WHERE admin_p.id = auth.uid() 
    AND admin_p.role IN ('SUPERINTENDENT', 'ADMIN')
  ))
);

-- 3. Corrigir Permissão de Update para o Admin aprovar prêmios
-- Estava dando erro de "ok mas continuava lá" porque o Admin não tinha permissão de UPDATE na tabela.
DROP POLICY IF EXISTS "Admins can update achievements" ON public.achievements;
CREATE POLICY "Admins can update achievements" ON public.achievements
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('SUPERINTENDENT', 'ADMIN')
  )
)
WITH CHECK (true);

-- 4. Garantir que o Ticker público continue vendo apenas os APROVADOS (sem quebrar privacidade)
DROP POLICY IF EXISTS "Public feed: anyone can see approved/pending success names" ON public.achievements;
CREATE POLICY "Public feed: anyone can see approved names" ON public.achievements
FOR SELECT TO authenticated
USING (status = 'APPROVED');
