
-- Criar bucket de áudio se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-arena', 'audio-arena', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir que qualquer pessoa autenticada faça upload (Para o Admin)
CREATE POLICY "Admin upload audio" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-arena');

-- Permitir leitura pública (Para os corretores ouvirem)
CREATE POLICY "Public read audio" ON storage.objects
FOR SELECT USING (bucket_id = 'audio-arena');

-- Permitir deleção/update para o Admin
CREATE POLICY "Admin update audio" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'audio-arena');

CREATE POLICY "Admin delete audio" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'audio-arena');
