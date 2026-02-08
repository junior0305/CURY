-- Adicionar a coluna notes na tabela leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes TEXT;

-- Atualizar o cache do esquema (isso acontece automaticamente no Supabase, mas o comando garante a estrutura)
COMMENT ON COLUMN public.leads.notes IS 'Observações e informações extras do lead (ex: renda, interesse)';
