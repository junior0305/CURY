-- SCRIPT CORRIGIDO (RODAR NO SQL EDITOR)

-- 1. Remover o usuário se ele já existir para evitar erros de duplicidade
DELETE FROM auth.users WHERE email = 'junior@crmpro.com';

-- 2. Criar o usuário na tabela de autenticação
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'junior@crmpro.com',
  extensions.crypt('admin123', extensions.gen_salt('bf')), -- Senha: admin123
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"first_name": "Junior", "last_name": "Admin", "role": "SUPERINTENDENT"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- 3. Criar ou atualizar o perfil na tabela pública com acesso total
-- Isso garante que mesmo que o trigger falhe, o perfil existirá
INSERT INTO public.profiles (id, email, first_name, last_name, role, updated_at)
SELECT id, email, 'Junior', 'Admin', 'SUPERINTENDENT', now()
FROM auth.users
WHERE email = 'junior@crmpro.com'
ON CONFLICT (id) DO UPDATE 
SET role = 'SUPERINTENDENT', 
    first_name = 'Junior', 
    last_name = 'Admin',
    updated_at = now();