-- Tabela de cadências de follow-up
CREATE TABLE IF NOT EXISTS public.cadence_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Passos de cada cadência
CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id  UUID REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days  INTEGER NOT NULL,
  media_type  TEXT NOT NULL,
  content     TEXT,
  media_url   TEXT,
  caption     TEXT,
  variables   JSONB DEFAULT '["nome", "broker"]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_steps     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadence_templates_read" ON public.cadence_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cadence_templates_write" ON public.cadence_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')));

CREATE POLICY "cadence_steps_read" ON public.cadence_steps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cadence_steps_write" ON public.cadence_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN','SUPERINTENDENT')));
