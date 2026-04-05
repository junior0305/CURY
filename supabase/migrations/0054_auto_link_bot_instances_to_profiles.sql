-- Auto-vincula bot_instance_id nos profiles onde ainda está NULL,
-- fazendo match pelo primeiro nome do usuário com o nome da instância.
-- Isso garante que a cadeia de notificações funcione sem depender de configuração manual.

UPDATE public.profiles p
SET bot_instance_id = b.id
FROM public.bot_instances b
WHERE p.bot_instance_id IS NULL
  AND LOWER(b.name) ILIKE '%' || LOWER(SPLIT_PART(COALESCE(p.first_name, SPLIT_PART(p.full_name, ' ', 1), ''), ' ', 1)) || '%'
  AND SPLIT_PART(COALESCE(p.first_name, SPLIT_PART(p.full_name, ' ', 1), ''), ' ', 1) <> '';
