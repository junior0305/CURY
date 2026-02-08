-- 1. Garantir que a coluna existe e é booleana
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'profiles' AND COLUMN_NAME = 'lead_assignment_enabled') THEN
    ALTER TABLE public.profiles ADD COLUMN lead_assignment_enabled BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Ajustar RLS para permitir que o Admin atualize qualquer perfil
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated
USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('SUPERINTENDENT', 'MANAGER')
  )
);
