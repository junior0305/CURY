-- ============================================================
-- 0060 · MCMV — Funil atualizado + campos de qualificação
-- ============================================================
-- Novidades:
--   1. Novo status VISITA_REALIZADA (visita compareceu de facto)
--   2. Campo lost_reason obrigatório ao marcar ABANDONED (Perdido)
--   3. Campos opcionais renda_declarada e tipo_trabalho (do Facebook)
--   4. Tabela mcmv_qualification — checklist das 4 perguntas por lead
-- ============================================================

-- 1. Novos campos na tabela leads ────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS renda_declarada   TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tipo_trabalho     TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason       TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visita_confirmada BOOLEAN     DEFAULT NULL;

-- Comentários descritivos
COMMENT ON COLUMN public.leads.renda_declarada   IS 'Renda declarada pelo lead no formulário do Facebook (opcional)';
COMMENT ON COLUMN public.leads.tipo_trabalho     IS 'Tipo de vínculo empregatício: CLT | AUTONOMO | FUNCIONARIO_PUBLICO (opcional, vem do Facebook)';
COMMENT ON COLUMN public.leads.lost_reason       IS 'Motivo de perda ao marcar ABANDONED: RENDA_FORA_FAIXA | JA_TEM_IMOVEL | JA_USOU_PROGRAMA | FGTS_INSUFICIENTE | REPROVADO_CREDITO | NAO_COMPARECEU | FOI_CONCORRENTE | DESISTIU | SEM_RETORNO';
COMMENT ON COLUMN public.leads.visita_confirmada IS 'true = lead confirmou presença antes da visita; false = não confirmou; null = não verificado';

-- 2. Tabela de qualificação MCMV ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.mcmv_qualification (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID    NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  renda_familiar  TEXT    DEFAULT NULL,   -- valor ou faixa declarada na conversa
  faixa_mcmv      TEXT    DEFAULT NULL,   -- FAIXA_1 | FAIXA_2 | FAIXA_3 | FORA
  fgts_disponivel TEXT    DEFAULT NULL,   -- valor estimado
  tem_imovel      BOOLEAN DEFAULT NULL,   -- tem imóvel no nome?
  ja_usou_mcmv    BOOLEAN DEFAULT NULL,   -- já usou o programa antes?
  tipo_trabalho   TEXT    DEFAULT NULL,   -- CLT | AUTONOMO | FUNCIONARIO_PUBLICO
  qualificado     BOOLEAN DEFAULT NULL,   -- resultado final: qualificado ou não
  nao_qualifica_motivo TEXT DEFAULT NULL, -- motivo caso qualificado = false
  preenchido_por  TEXT    DEFAULT NULL,   -- broker_id ou 'facebook_form'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lead_id)                        -- uma qualificação por lead
);

ALTER TABLE public.mcmv_qualification ENABLE ROW LEVEL SECURITY;

-- Corretores veem qualificação dos seus leads; gestores/supers veem tudo
CREATE POLICY "mcmv_qual_select" ON public.mcmv_qualification
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND (
        l.broker_id  = auth.uid() OR
        l.manager_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','ADMIN'))
      )
    )
  );

CREATE POLICY "mcmv_qual_insert" ON public.mcmv_qualification
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND (
        l.broker_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','ADMIN','MANAGER'))
      )
    )
  );

CREATE POLICY "mcmv_qual_update" ON public.mcmv_qualification
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND (
        l.broker_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SUPERINTENDENT','ADMIN','MANAGER'))
      )
    )
  );

-- service_role sempre pode
CREATE POLICY "mcmv_qual_service" ON public.mcmv_qualification
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- 3. Índices úteis ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_lost_reason       ON public.leads(lost_reason) WHERE lost_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tipo_trabalho     ON public.leads(tipo_trabalho) WHERE tipo_trabalho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mcmv_qual_lead_id       ON public.mcmv_qualification(lead_id);
CREATE INDEX IF NOT EXISTS idx_mcmv_qual_qualificado   ON public.mcmv_qualification(qualificado);

-- 4. Trigger updated_at na tabela de qualificação ────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mcmv_qual_updated_at ON public.mcmv_qualification;
CREATE TRIGGER trg_mcmv_qual_updated_at
  BEFORE UPDATE ON public.mcmv_qualification
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
