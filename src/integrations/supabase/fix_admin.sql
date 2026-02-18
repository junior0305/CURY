-- Primeiro, garantimos que o perfil existe (caso o trigger tenha demorado)
-- Substitua o ID abaixo se necessário, ou use o email para localizar
UPDATE public.profiles 
SET role = 'SUPERINTENDENT' 
WHERE email = 'junior@crmpro.com';

-- Caso o perfil ainda não tenha sido criado pelo trigger, este comando força a criação:
INSERT INTO public.profiles (id, email, first_name, last_name, role)
SELECT id, email, 'Junior', 'Admin', 'SUPERINTENDENT'
FROM auth.users 
WHERE email = 'junior@crmpro.com'
ON CONFLICT (id) DO UPDATE SET role = 'SUPERINTENDENT';