-- Permite que cada usuário salve sua preferência de tema (dark/light)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'dark'
  CHECK (theme_preference IN ('dark', 'light'));
