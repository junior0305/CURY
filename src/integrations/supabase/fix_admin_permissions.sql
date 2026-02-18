-- LIBERAR PERMISSÕES PARA ADMINISTRADORES E SUPERINTENDENTES

-- 1. Tabela de Equipes (Teams)
DROP POLICY IF EXISTS "Admins can manage teams" ON public.teams;
CREATE POLICY "Admins can manage teams" ON public.teams
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN')
  )
);

DROP POLICY IF EXISTS "Everyone can view teams" ON public.teams;
CREATE POLICY "Everyone can view teams" ON public.teams
FOR SELECT TO authenticated
USING (true);

-- 2. Tabela de Metas (Team Goals)
DROP POLICY IF EXISTS "Admins can manage goals" ON public.team_goals;
CREATE POLICY "Admins can manage goals" ON public.team_goals
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN')
  )
);

-- 3. Tabela de Filas de Distribuição (Distribution Queues)
DROP POLICY IF EXISTS "Admins can manage queues" ON public.distribution_queues;
CREATE POLICY "Admins can manage queues" ON public.distribution_queues
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN')
  )
);

-- 4. Tabela de Configurações de Prêmios (Reward Configs)
DROP POLICY IF EXISTS "Admins can manage rewards" ON public.reward_configs;
CREATE POLICY "Admins can manage rewards" ON public.reward_configs
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN')
  )
);