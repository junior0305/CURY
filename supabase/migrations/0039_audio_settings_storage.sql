-- Bucket público para sons personalizados (MP3/WAV/OGG)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-settings', 'audio-settings', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas RLS para bucket audio-settings
CREATE POLICY "audio_settings_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-settings');

CREATE POLICY "audio_settings_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio-settings');

CREATE POLICY "audio_settings_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio-settings');

CREATE POLICY "audio_settings_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'audio-settings');
