-- Adiciona flag protect_own_leads na tabela profiles.
-- Quando true, o Agente de Redistribuição nunca redistribui os leads desse corretor.
-- Útil para corretores que investem dinheiro próprio para gerar leads.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS protect_own_leads BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.protect_own_leads IS
  'Quando true, o Agente de Redistribuição nunca redistribui os leads deste corretor automaticamente.';
