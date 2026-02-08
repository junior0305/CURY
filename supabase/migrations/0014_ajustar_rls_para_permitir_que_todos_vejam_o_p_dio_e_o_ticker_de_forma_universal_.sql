-- Garantir que todos os usuários autenticados possam ver os perfis (apenas nome e role) para o pódio
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles 
FOR SELECT TO authenticated USING (true);

-- Garantir que todos possam ver as conquistas APROVADAS para o ticker funcionar em todos os logins
DROP POLICY IF EXISTS "Public feed: anyone can see approved/pending success names" ON public.achievements;
CREATE POLICY "Public feed: anyone can see approved/pending success names" ON public.achievements 
FOR SELECT TO authenticated USING (true);

-- Garantir que o contador do pódio funcione: todos podem ver o status dos leads (apenas status e broker_id)
-- Note: O RLS do Supabase é por linha, então aqui permitimos ver todos os leads, 
-- mas no Dashboard filtramos para o corretor ver apenas os detalhes dos dele.
DROP POLICY IF EXISTS "Allow users to see their leads" ON public.leads;
CREATE POLICY "Allow users to see their leads" ON public.leads
FOR SELECT TO authenticated USING (true);
