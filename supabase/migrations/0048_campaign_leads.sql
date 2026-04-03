-- Tabela de leads importados para campanhas de prospecção
CREATE TABLE IF NOT EXISTS public.campaign_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES public.ia_campaigns(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Lead',
  email         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | contacted | responded | converted | failed
  contacted_at  TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_status
  ON public.campaign_leads(campaign_id, status);

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_leads_admin"
  ON public.campaign_leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPERINTENDENT', 'MANAGER')
    )
  );
