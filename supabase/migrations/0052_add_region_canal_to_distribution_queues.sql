-- Adiciona campos de região e canal às filas de distribuição
-- Permite segmentar e visualizar no BI competitivo por origem geográfica e canal de marketing

ALTER TABLE public.distribution_queues
  ADD COLUMN IF NOT EXISTS region TEXT,   -- Ex: "Jaguaré", "Zona Oeste", "Morumbi", "Centro"
  ADD COLUMN IF NOT EXISTS canal  TEXT;   -- Ex: "Facebook", "Google", "Indicação", "Site", "Portais"
