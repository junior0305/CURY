-- ═══════════════════════════════════════════════════════════════
-- SISTEMA DE SAÚDE DE LEADS
-- Rastreamento de interações, health score e métricas de boas-vindas
-- ═══════════════════════════════════════════════════════════════

-- 1. NOVOS CAMPOS NA TABELA LEADS
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_lead_response_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_responded_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_template_id    UUID,
  ADD COLUMN IF NOT EXISTS health_score           INTEGER DEFAULT 100;

-- 2. FUNÇÃO DE CÁLCULO DO HEALTH SCORE
-- Retorna 0-100 baseado no comportamento real de atendimento
CREATE OR REPLACE FUNCTION public.calc_lead_health_score(
  p_status                    TEXT,
  p_created_at                TIMESTAMPTZ,
  p_last_broker_whatsapp_at   TIMESTAMPTZ,
  p_welcome_responded_at      TIMESTAMPTZ,
  p_last_lead_response_at     TIMESTAMPTZ,
  p_next_action_date          TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 100;
BEGIN
  -- Leads finalizados não precisam de monitoramento
  IF p_status IN ('EXCLUDED', 'ABANDONED', 'CONCLUDED') THEN
    RETURN 100;
  END IF;

  -- Corretor nunca mandou mensagem e lead tem mais de 4h (sem boas-vindas manual)
  IF p_last_broker_whatsapp_at IS NULL
     AND p_created_at < NOW() - INTERVAL '4 hours' THEN
    score := score - 40;
  END IF;

  -- CRÍTICO: lead respondeu à boas-vindas mas corretor ignorou por mais de 2h
  IF p_welcome_responded_at IS NOT NULL
     AND (p_last_broker_whatsapp_at IS NULL OR p_last_broker_whatsapp_at < p_welcome_responded_at)
     AND p_welcome_responded_at < NOW() - INTERVAL '2 hours' THEN
    score := score - 50;
  END IF;

  -- Sem contato do corretor há mais de 24h sem data agendada
  IF p_last_broker_whatsapp_at IS NOT NULL
     AND p_last_broker_whatsapp_at < NOW() - INTERVAL '24 hours'
     AND (p_next_action_date IS NULL OR p_next_action_date < NOW()) THEN
    score := score - 20;
  END IF;

  -- Silêncio prolongado (72h)
  IF p_last_broker_whatsapp_at IS NOT NULL
     AND p_last_broker_whatsapp_at < NOW() - INTERVAL '72 hours' THEN
    score := score - 15;
  END IF;

  -- next_action_date no futuro = tudo certo, corretor agendou retorno
  IF p_next_action_date IS NOT NULL AND p_next_action_date > NOW() THEN
    score := LEAST(score + 20, 100);
  END IF;

  -- next_action_date passou sem ação do corretor
  IF p_next_action_date IS NOT NULL
     AND p_next_action_date < NOW()
     AND (p_last_broker_whatsapp_at IS NULL OR p_last_broker_whatsapp_at < p_next_action_date) THEN
    score := score - 25;
  END IF;

  RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- 3. TRIGGER: recalcula health_score automaticamente ao atualizar campos relevantes
CREATE OR REPLACE FUNCTION public.trg_update_lead_health_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.health_score := public.calc_lead_health_score(
    NEW.status,
    NEW.created_at,
    NEW.last_broker_whatsapp_at,
    NEW.welcome_responded_at,
    NEW.last_lead_response_at,
    NEW.next_action_date
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_health_score ON public.leads;
CREATE TRIGGER trg_lead_health_score
  BEFORE INSERT OR UPDATE OF
    status, last_broker_whatsapp_at, welcome_responded_at,
    last_lead_response_at, next_action_date
  ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_update_lead_health_score();

-- 4. ATUALIZAR SCORE DE TODOS OS LEADS EXISTENTES
UPDATE public.leads
SET health_score = public.calc_lead_health_score(
  status, created_at, last_broker_whatsapp_at,
  welcome_responded_at, last_lead_response_at, next_action_date
);

-- 5. TABELA DE MÉTRICAS DE TEMPLATES DE BOAS-VINDAS
CREATE TABLE IF NOT EXISTS public.welcome_template_stats (
  template_id     UUID        PRIMARY KEY REFERENCES public.welcome_templates(id) ON DELETE CASCADE,
  total_sent      INTEGER     DEFAULT 0,
  total_responded INTEGER     DEFAULT 0,
  response_rate   NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_sent = 0 THEN 0
    ELSE ROUND((total_responded::NUMERIC / total_sent) * 100, 2)
    END
  ) STORED,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para welcome_template_stats
ALTER TABLE public.welcome_template_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "welcome_stats_read" ON public.welcome_template_stats;
CREATE POLICY "welcome_stats_read" ON public.welcome_template_stats
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "welcome_stats_write_admin" ON public.welcome_template_stats;
CREATE POLICY "welcome_stats_write_admin" ON public.welcome_template_stats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN','SUPERINTENDENT')));

-- 6. FUNÇÃO AUXILIAR: registrar envio de template e atualizar stats
CREATE OR REPLACE FUNCTION public.record_welcome_template_sent(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.welcome_template_stats (template_id, total_sent)
  VALUES (p_template_id, 1)
  ON CONFLICT (template_id)
  DO UPDATE SET total_sent = welcome_template_stats.total_sent + 1,
                updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.record_welcome_template_responded(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.welcome_template_stats
  SET total_responded = total_responded + 1, updated_at = NOW()
  WHERE template_id = p_template_id;
END;
$$ LANGUAGE plpgsql;
