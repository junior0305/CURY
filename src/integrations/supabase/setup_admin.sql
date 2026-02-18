-- 1. Habilitar extensão de criptografia para a senha
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Criar o usuário na tabela de autenticação (auth.users)
-- Nota: O ID é gerado automaticamente
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
  crypt('admin123', gen_salt('bf')), -- Aqui a senha admin123 é criptografada
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
)
ON CONFLICT (email) DO NOTHING;

-- 3. Garantir que o perfil na tabela pública esteja correto e com nível de acesso total
-- O trigger 'handle_new_user' deve rodar sozinho, mas este comando garante o cargo
UPDATE public.profiles 
SET role = 'SUPERINTENDENT', 
    first_name = 'Junior', 
    last_name = 'Admin' 
WHERE email = 'junior@crmpro.com';