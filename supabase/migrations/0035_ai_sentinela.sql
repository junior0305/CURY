-- ═══════════════════════════════════════════════════════════════
-- AI SENTINELA
-- Agente LLM autônomo para reengajamento de leads parados 48h+
-- Opera das 18h às 21h30 BRT com orçamento mensal configurável
-- ═══════════════════════════════════════════════════════════════

-- 1. CONFIGURAÇÃO GLOBAL (singleton)
CREATE TABLE IF NOT EXISTS public.ai_sentinela_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled           BOOLEAN NOT NULL DEFAULT false,
  provider             TEXT NOT NULL DEFAULT 'gemini'
                         CHECK (provider IN ('anthropic','openai','gemini')),
  model_name           TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  max_tokens           INTEGER NOT NULL DEFAULT 300,
  monthly_budget_usd   NUMERIC(10,4) NOT NULL DEFAULT 10.00,
  monthly_spent_usd    NUMERIC(10,4) NOT NULL DEFAULT 0.00,
  budget_reset_month   TEXT,
  window_start_brt     TIME NOT NULL DEFAULT '18:00',
  window_end_brt       TIME NOT NULL DEFAULT '21:30',
  stale_threshold_h    INTEGER NOT NULL DEFAULT 48,
  max_messages_session INTEGER NOT NULL DEFAULT 6,
  default_profile_id   UUID REFERENCES public.ai_profiles(id),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  _singleton           BOOLEAN UNIQUE DEFAULT true
);

COMMENT ON TABLE public.ai_sentinela_config IS
  'Configuração global do AI Sentinela. Apenas 1 linha (singleton via _singleton UNIQUE).';

-- 2. MAPEAMENTO TAG/SOURCE → PERFIL DE IA (multi-produto)
CREATE TABLE IF NOT EXISTS public.ai_sentinela_profile_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_field  TEXT NOT NULL CHECK (match_field IN ('tag','source')),
  match_value  TEXT NOT NULL,
  profile_id   UUID NOT NULL REFERENCES public.ai_profiles(id),
  priority     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_sentinela_map UNIQUE (match_field, match_value)
);

COMMENT ON TABLE public.ai_sentinela_profile_map IS
  'Mapeia tag ou source do lead para um perfil de IA específico (ex: tag=mcmv → Perfil MCMV).';

-- 3. SESSÕES ATIVAS (uma por lead)
CREATE TABLE IF NOT EXISTS public.ai_sentinela_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES public.leads(id),
  profile_id      UUID REFERENCES public.ai_profiles(id),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','completed','broker_takeover')),
  messages_sent   INTEGER NOT NULL DEFAULT 0,
  max_messages    INTEGER NOT NULL DEFAULT 6,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  end_reason      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentinela_sessions_lead
  ON public.ai_sentinela_sessions(lead_id, status);

COMMENT ON TABLE public.ai_sentinela_sessions IS
  'Sessões do AI Sentinela por lead. status=broker_takeover quando corretor assume a conversa.';

-- 4. RASTREAMENTO DE CUSTO POR MENSAGEM
CREATE TABLE IF NOT EXISTS public.ai_sentinela_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES public.ai_sentinela_sessions(id),
  lead_id       UUID REFERENCES public.leads(id),
  provider      TEXT NOT NULL,
  model_name    TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(10,6),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ai_sentinela_usage IS
  'Custo por chamada LLM do Sentinela. Trigger atualiza monthly_spent_usd na config.';

-- 5. TRIGGER: atualiza monthly_spent_usd automaticamente após cada registro de uso
CREATE OR REPLACE FUNCTION public.trg_sentinela_update_monthly_spend()
RETURNS TRIGGER AS $$
DECLARE
  current_month TEXT := TO_CHAR(NOW(), 'YYYY-MM');
  month_total   NUMERIC;
BEGIN
  SELECT COALESCE(SUM(cost_usd), 0) INTO month_total
    FROM public.ai_sentinela_usage
   WHERE TO_CHAR(created_at, 'YYYY-MM') = current_month;

  UPDATE public.ai_sentinela_config
     SET monthly_spent_usd = month_total,
         budget_reset_month = current_month,
         updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sentinela_spend ON public.ai_sentinela_usage;
CREATE TRIGGER trg_sentinela_spend
  AFTER INSERT ON public.ai_sentinela_usage
  FOR EACH ROW EXECUTE FUNCTION public.trg_sentinela_update_monthly_spend();

-- 6. RLS
ALTER TABLE public.ai_sentinela_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sentinela_profile_map  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sentinela_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sentinela_usage        ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "sentinela_config_select" ON public.ai_sentinela_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sentinela_profile_map_select" ON public.ai_sentinela_profile_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sentinela_sessions_select" ON public.ai_sentinela_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sentinela_usage_select" ON public.ai_sentinela_usage
  FOR SELECT TO authenticated USING (true);

-- Escrita: apenas service_role (edge functions) ou admin/superintendent
CREATE POLICY "sentinela_config_modify" ON public.ai_sentinela_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('ADMIN','SUPERINTENDENT')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('ADMIN','SUPERINTENDENT')
    )
  );

CREATE POLICY "sentinela_profile_map_modify" ON public.ai_sentinela_profile_map
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('ADMIN','SUPERINTENDENT')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('ADMIN','SUPERINTENDENT')
    )
  );

-- Sessions e usage: service_role via edge functions (sem política adicional — service_role bypassa RLS)
