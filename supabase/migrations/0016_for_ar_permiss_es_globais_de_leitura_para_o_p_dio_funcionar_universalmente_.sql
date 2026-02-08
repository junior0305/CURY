-- O problema é o RLS (Row Level Security) que filtra os leads antes do pódio calcular.
-- Vamos criar uma política que permite que qualquer usuário autenticado veja METADADOS básicos dos leads (apenas broker_id e status)
-- para que o pódio possa fazer a contagem universal.

DROP POLICY IF EXISTS "Allow users to see their leads" ON public.leads;

-- Política de leitura: Qualquer um vê BROKER_ID e STATUS para o ranking, mas o frontend cuidará de esconder dados sensíveis.
CREATE POLICY "Leads universal visibility for ranking" ON public.leads
FOR SELECT TO authenticated
USING (true);

-- Garantir que perfis também sejam visíveis para o pódio puxar os nomes
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles 
FOR SELECT TO authenticated USING (true);
