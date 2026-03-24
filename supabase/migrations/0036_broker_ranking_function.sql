-- ═══════════════════════════════════════════════════════════════
-- FUNÇÃO DE RANKING DE CORRETORES (SECURITY DEFINER)
-- Permite que qualquer autenticado veja o ranking sem expor
-- dados privados dos leads (nome, telefone, etc.)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_broker_ranking(p_start_date TIMESTAMPTZ)
RETURNS TABLE (
  broker_id         UUID,
  sales_count       INTEGER,
  visits_count      INTEGER,
  docs_count        INTEGER,
  in_progress_count INTEGER,
  new_leads_count   INTEGER,
  score             NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.broker_id,
    COUNT(CASE WHEN l.status = 'CONCLUDED'        AND l.last_interaction_at >= p_start_date THEN 1 END)::INTEGER AS sales_count,
    COUNT(CASE WHEN l.status = 'VISIT_SCHEDULED'  AND l.last_interaction_at >= p_start_date THEN 1 END)::INTEGER AS visits_count,
    COUNT(CASE WHEN l.status = 'DOCS_REQUESTED'   AND l.last_interaction_at >= p_start_date THEN 1 END)::INTEGER AS docs_count,
    COUNT(CASE WHEN l.status = 'IN_PROGRESS'      AND l.last_interaction_at >= p_start_date THEN 1 END)::INTEGER AS in_progress_count,
    COUNT(CASE WHEN l.created_at                  >= p_start_date THEN 1 END)::INTEGER AS new_leads_count,
    (
      COUNT(CASE WHEN l.status = 'CONCLUDED'        AND l.last_interaction_at >= p_start_date THEN 1 END) * 500 +
      COUNT(CASE WHEN l.status = 'DOCS_REQUESTED'   AND l.last_interaction_at >= p_start_date THEN 1 END) * 50 +
      COUNT(CASE WHEN l.status = 'VISIT_SCHEDULED'  AND l.last_interaction_at >= p_start_date THEN 1 END) * 20 +
      COUNT(CASE WHEN l.status = 'IN_PROGRESS'      AND l.last_interaction_at >= p_start_date THEN 1 END) * 2 +
      COUNT(CASE WHEN l.created_at                  >= p_start_date THEN 1 END) * 0.5
    )::NUMERIC AS score
  FROM public.leads l
  WHERE l.broker_id IS NOT NULL
    AND l.status NOT IN ('ABANDONED', 'EXCLUDED')
  GROUP BY l.broker_id;
END;
$$;

-- Qualquer usuário autenticado pode chamar esta função
GRANT EXECUTE ON FUNCTION public.get_broker_ranking(TIMESTAMPTZ) TO authenticated;
