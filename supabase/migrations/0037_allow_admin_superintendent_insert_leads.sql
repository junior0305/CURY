-- Permite que ADMIN e SUPERINTENDENT insiram leads diretamente
-- (necessário para importação via CSV no Rework)
CREATE POLICY "Allow admin and superintendent to insert leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPERINTENDENT')
  )
);
