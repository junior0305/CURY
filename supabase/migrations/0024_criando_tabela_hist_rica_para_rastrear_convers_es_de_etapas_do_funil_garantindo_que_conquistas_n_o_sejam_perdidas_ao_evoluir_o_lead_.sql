
-- Tabela para registrar quando um lead atinge uma etapa específica do funil
CREATE TABLE IF NOT EXISTS public.funnel_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, -- Ex: 'VISIT_SCHEDULED', 'DOCS_REQUESTED', 'CONCLUDED'
  points_awarded NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Impede que o mesmo lead conte pontos para a mesma etapa mais de uma vez
  UNIQUE(lead_id, stage)
);

-- Habilitar RLS
ALTER TABLE public.funnel_history ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Public read funnel history" ON public.funnel_history FOR SELECT USING (true);
CREATE POLICY "System insert funnel history" ON public.funnel_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = broker_id);

-- Trigger para registrar a história automaticamente quando o status do lead mudar
CREATE OR REPLACE FUNCTION public.record_funnel_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou para algo relevante
  IF (NEW.status IN ('VISIT_SCHEDULED', 'DOCS_REQUESTED', 'CONCLUDED')) AND (OLD.status IS NULL OR NEW.status <> OLD.status) THEN
    INSERT INTO public.funnel_history (lead_id, broker_id, stage)
    VALUES (NEW.id, NEW.broker_id, NEW.status)
    ON CONFLICT (lead_id, stage) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_lead_status_change ON public.leads;
CREATE TRIGGER on_lead_status_change
  AFTER UPDATE OF status OR INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_funnel_progress();
