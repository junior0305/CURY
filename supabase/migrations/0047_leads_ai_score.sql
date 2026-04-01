-- Coluna de scoring de leads para o Agente de Scoring.
-- Score de 0 a 100 calculado pelo agente com base em sinais de engajamento.
-- Valor padrão 50 (neutro). Usado pelo Cérebro para priorização futura.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_score INTEGER NOT NULL DEFAULT 50
    CHECK (ai_score >= 0 AND ai_score <= 100);

CREATE INDEX IF NOT EXISTS idx_leads_ai_score
  ON public.leads(ai_score DESC)
  WHERE status IN ('NEW', 'IN_PROGRESS', 'DOCS_REQUESTED');

COMMENT ON COLUMN public.leads.ai_score IS
  'Score de prioridade calculado pelo Agente de Scoring (0-100). Maior = mais provável de converter.';
