
-- Garantir que a tabela distribution_logs tenha políticas de UPDATE para Admins/Superintendents
CREATE POLICY "admin_update_logs" ON public.distribution_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN', 'MANAGER')
  )
);

-- Reforçar a política de SELECT para garantir visibilidade
DROP POLICY IF EXISTS "admin_view_logs" ON public.distribution_logs;
CREATE POLICY "admin_view_logs" ON public.distribution_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('SUPERINTENDENT', 'ADMIN', 'MANAGER')
  )
);
