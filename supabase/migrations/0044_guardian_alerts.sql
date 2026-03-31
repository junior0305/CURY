-- Tabela de alertas e heartbeat do Sistema Guardian.
-- O guardian roda a cada execução do scheduler e registra anomalias detectadas.

CREATE TABLE IF NOT EXISTS public.guardian_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type   TEXT NOT NULL,  -- 'bot_offline' | 'queue_stuck' | 'zero_sends_streak' | 'failed_buildup' | 'heartbeat'
  severity     TEXT NOT NULL DEFAULT 'info'
                 CHECK (severity IN ('info','medium','high')),
  message      TEXT NOT NULL,
  auto_fixed   BOOLEAN NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_alerts_recent
  ON public.guardian_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guardian_alerts_unresolved
  ON public.guardian_alerts(check_type, resolved_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.guardian_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardian_alerts_read" ON public.guardian_alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "guardian_alerts_write" ON public.guardian_alerts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')
  ));

-- Adicionar guardian_alert_phone em system_settings se não existir
INSERT INTO public.system_settings (key, value)
VALUES ('guardian_alert_phone', null)
ON CONFLICT (key) DO NOTHING;
