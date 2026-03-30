-- Tabela de execuções de cadência por lead.
-- Controla qual passo da cadência cada lead está, quando enviar o próximo, e o status.
-- Necessário para o Bloco 3 do followup_scheduler funcionar.

CREATE TABLE IF NOT EXISTS public.cadence_executions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id       UUID REFERENCES public.cadence_templates(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  current_step     INTEGER NOT NULL DEFAULT 0,
  next_execution_at TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','stopped')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  stopped_reason   TEXT,
  error_message    TEXT,
  message          TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cadence_executions_active
  ON public.cadence_executions(status, next_execution_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cadence_executions_lead
  ON public.cadence_executions(lead_id);

ALTER TABLE public.cadence_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadence_executions_read" ON public.cadence_executions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cadence_executions_write" ON public.cadence_executions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')
  ));
