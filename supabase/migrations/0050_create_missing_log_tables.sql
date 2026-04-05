-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0050: Cria tabelas de log que estavam faltando
-- Problema: Logs.tsx consultava tabelas que nunca foram criadas.
-- Efeito: todos os inserts de edge functions falhavam silenciosamente,
--         e a UI mostrava tudo zerado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. automation_rules — referenciada por joins em automation_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,  -- 'follow_up' | 'redistribuicao' | 'welcome' | 'sentinela' | etc.
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_automation_rules" ON public.automation_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','MANAGER','ADMIN')
    )
  );

-- 2. automation_logs — usada por 8+ edge functions (agentes, follow-up, sentinela, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id         UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  entity_type     TEXT,      -- 'redistribuicao' | 'follow_up' | 'welcome' | 'sentinela' | etc.
  entity_id       TEXT,      -- id do lead ou outra entidade
  status          TEXT,      -- 'success' | 'error' | 'skipped'
  message_sent    TEXT,      -- descrição da ação tomada
  recipient_phone TEXT,
  error_message   TEXT,
  executed_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_automation_logs" ON public.automation_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','MANAGER','ADMIN')
    )
  );

-- Service role (edge functions) pode inserir sem RLS
CREATE POLICY "service_insert_automation_logs" ON public.automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_automation_logs_entity ON public.automation_logs (entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed_at ON public.automation_logs (executed_at DESC);

-- 3. webhook_logs — registro de webhooks recebidos (Make, N8N, Zapier)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_key  TEXT,      -- 'make' | 'n8n' | 'zapier' | 'evolution'
  payload          JSONB,
  status_code      INTEGER,
  response_body    TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_webhook_logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','MANAGER','ADMIN')
    )
  );

CREATE POLICY "service_insert_webhook_logs" ON public.webhook_logs
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);

-- 4. ai_context_analysis — análises de IA por conversa (Sentinela + Coach)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_context_analysis (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id  UUID REFERENCES public.ia_conversations(id) ON DELETE CASCADE,
  lead_id          UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  analysis_type    TEXT,   -- 'sentinela' | 'coach' | 'scoring' | 'qualification'
  ai_decision      TEXT,   -- decisão tomada pela IA
  ai_reasoning     TEXT,   -- raciocínio / justificativa
  scheduled_action TEXT,   -- ação agendada como resultado
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_context_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_ai_context_analysis" ON public.ai_context_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','MANAGER','ADMIN')
    )
  );

CREATE POLICY "service_insert_ai_context_analysis" ON public.ai_context_analysis
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_ai_context_lead ON public.ai_context_analysis (lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_context_created_at ON public.ai_context_analysis (created_at DESC);

-- 5. Garantir que distribution_logs tem INSERT policy (service role já bypassa,
--    mas garante que a tabela aceita inserts via authenticated se necessário)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'distribution_logs' AND policyname = 'service_insert_distribution_logs'
  ) THEN
    EXECUTE 'CREATE POLICY "service_insert_distribution_logs" ON public.distribution_logs FOR INSERT TO authenticated WITH CHECK (TRUE)';
  END IF;
END $$;
