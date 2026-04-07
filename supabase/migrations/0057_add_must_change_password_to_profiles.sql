ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'Quando true, o usuário é forçado a trocar a senha no próximo login antes de acessar o sistema.';
