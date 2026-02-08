-- Adicionar coluna de telefone se não existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Garantir que a RLS continue permitindo a leitura
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles 
FOR SELECT TO authenticated USING (true);
