-- Não há comando direto para checar Edge Functions via SQL, mas podemos checar se o usuário tem permissões
SELECT rolname, rolsuper, rolinherit FROM pg_roles WHERE rolname = 'authenticator';
