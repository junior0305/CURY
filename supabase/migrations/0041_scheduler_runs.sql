-- Histórico de execuções do followup_scheduler (para monitoramento)
CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error')),
  critical        INTEGER NOT NULL DEFAULT 0,
  cold            INTEGER NOT NULL DEFAULT 0,
  cadence         INTEGER NOT NULL DEFAULT 0,
  stale           INTEGER NOT NULL DEFAULT 0,
  sentinela       INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_ran_at
  ON public.scheduler_runs (ran_at DESC);

-- RLS: apenas admin/superintendent pode ver
ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduler_runs_read" ON public.scheduler_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')
  ));

CREATE POLICY "scheduler_runs_insert" ON public.scheduler_runs
  FOR INSERT TO authenticated
  WITH CHECK (true);
