-- ── 0042_cerebro.sql ─────────────────────────────────────────────────────────
-- Cérebro Central: fila de ativação inteligente + aprendizado preditivo
-- Substitui o modelo reativo do followup_scheduler (Blocos 1, 2, 4, 5) por
-- um sistema de fila proativa onde cada lead tem ações pré-agendadas.

-- ── 1. lead_activation_queue ─────────────────────────────────────────────────
-- Uma linha por ação agendada para o lead.
-- Criada pelo incoming-lead após boas-vindas.
-- Cancelada pelo webhook_receiver quando lead responde.
CREATE TABLE IF NOT EXISTS public.lead_activation_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL CHECK (action_type IN (
    'toque_1',      -- template +3h após welcome
    'toque_2',      -- template +5h após welcome
    'sentinela',    -- LLM personalizado +8h após welcome
    'last_chance',  -- última mensagem +24h após welcome
    'broker_warmup',  -- aquecimento 35min após lead responder sem retorno do corretor
    'docs_reminder',  -- urgência de documentos para DOCS_REQUESTED 48h+
    'broker_alert',   -- notificação interna para corretor (2h sem retorno)
    'manager_alert'   -- notificação interna para gerente (4h sem retorno)
  )),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sent','cancelled','failed'
  )),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  cancel_reason TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_queue_pending
  ON public.lead_activation_queue(scheduled_for, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_activation_queue_lead
  ON public.lead_activation_queue(lead_id, status);

-- ── 2. cerebro_learning ──────────────────────────────────────────────────────
-- Rastreia resultados de cada ação para aprendizado futuro.
CREATE TABLE IF NOT EXISTS public.cerebro_learning (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type            TEXT NOT NULL,
  lead_source            TEXT,
  lead_tag               TEXT,
  sent_hour_brt          INTEGER, -- hora BRT (0-23) em que a ação foi executada
  responded              BOOLEAN DEFAULT false,
  response_time_minutes  INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. cerebro_runs ──────────────────────────────────────────────────────────
-- Log de cada execução do Cérebro para monitoramento.
CREATE TABLE IF NOT EXISTS public.cerebro_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','partial')),
  processed     INTEGER NOT NULL DEFAULT 0,
  rescheduled   INTEGER NOT NULL DEFAULT 0,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms   INTEGER,
  details       JSONB
);

-- ── 4. Flag de habilitação ────────────────────────────────────────────────────
-- Começa desabilitado para rollout gradual e seguro.
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'cerebro_enabled',
  'false',
  'Ativa o Cérebro Central (fila de ativação inteligente). Substitui Blocos 1, 2, 4 e 5 do followup_scheduler. Habilitar apenas após testar a fila de ativação.'
)
ON CONFLICT (key) DO NOTHING;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.lead_activation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_learning       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_runs           ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (Edge Functions usam service role)
-- Admins e superintendentes podem ler via frontend

CREATE POLICY "cerebro_queue_admin" ON public.lead_activation_queue
  FOR ALL USING (
    auth.jwt() ->> 'role' IN ('ADMIN','SUPERINTENDENT')
  );

CREATE POLICY "cerebro_learning_admin" ON public.cerebro_learning
  FOR ALL USING (
    auth.jwt() ->> 'role' IN ('ADMIN','SUPERINTENDENT')
  );

CREATE POLICY "cerebro_runs_admin" ON public.cerebro_runs
  FOR ALL USING (
    auth.jwt() ->> 'role' IN ('ADMIN','SUPERINTENDENT')
  );
