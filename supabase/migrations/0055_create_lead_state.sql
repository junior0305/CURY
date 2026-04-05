-- ─────────────────────────────────────────────────────────────────────────────
-- lead_state: estado centralizado de cada lead.
-- É o "caderno único" que todos os agentes leem antes de agir e atualizam
-- depois de agir. Resolve a desconexão entre módulos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_state (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  -- Classificação do lead (atualizada a cada interação relevante)
  intencao      TEXT        NOT NULL DEFAULT 'sem_info'
                CHECK (intencao IN ('quente','morno','frio','desqualificado','sem_info')),
  tema          TEXT        NOT NULL DEFAULT 'sem_info'
                CHECK (tema IN ('preco','entrada','localizacao','documentacao','visita','sem_info')),
  momento       TEXT        NOT NULL DEFAULT 'explorando'
                CHECK (momento IN ('explorando','comparando','decidido','sumiu')),

  -- Último evento registrado (rastreia o que aconteceu por último)
  ultimo_evento TEXT        NOT NULL DEFAULT 'lead_criado',

  -- Controle de automação
  modo          TEXT        NOT NULL DEFAULT 'automatico'
                CHECK (modo IN ('automatico','humano_ativo','pausado')),
  proxima_acao  TEXT        NOT NULL DEFAULT 'aguardar'
                CHECK (proxima_acao IN ('aguardar','follow_up','alertar_gerente','redistribuir','encerrar')),
  bloqueado     BOOLEAN     NOT NULL DEFAULT false,
  bloqueado_por UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Rastreabilidade
  atualizado_por TEXT       NOT NULL DEFAULT 'sistema',
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_state_lead_id_unique UNIQUE (lead_id)
);

-- ─── Histórico de mudanças de estado ─────────────────────────────────────────
-- Cada vez que o estado muda, uma linha é inserida aqui.
-- Alimenta o diagnóstico diário e o relatório do gerente.

CREATE TABLE IF NOT EXISTS public.lead_state_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  intencao      TEXT,
  tema          TEXT,
  momento       TEXT,
  ultimo_evento TEXT,
  modo          TEXT,
  proxima_acao  TEXT,
  bloqueado     BOOLEAN,
  atualizado_por TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS lead_state_lead_id_idx       ON public.lead_state (lead_id);
CREATE INDEX IF NOT EXISTS lead_state_intencao_idx      ON public.lead_state (intencao);
CREATE INDEX IF NOT EXISTS lead_state_modo_idx          ON public.lead_state (modo);
CREATE INDEX IF NOT EXISTS lead_state_bloqueado_idx     ON public.lead_state (bloqueado);
CREATE INDEX IF NOT EXISTS lead_state_history_lead_idx  ON public.lead_state_history (lead_id);
CREATE INDEX IF NOT EXISTS lead_state_history_time_idx  ON public.lead_state_history (criado_em DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.lead_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_state_history ENABLE ROW LEVEL SECURITY;

-- Service role acessa tudo (edge functions usam service role)
CREATE POLICY "service_role_all_lead_state"
  ON public.lead_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_lead_state_history"
  ON public.lead_state_history FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Corretores leem estado dos próprios leads
CREATE POLICY "broker_read_own_lead_state"
  ON public.lead_state FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE broker_id = auth.uid()
    )
  );

-- Gerentes leem estado dos leads da equipe
CREATE POLICY "manager_read_team_lead_state"
  ON public.lead_state FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN public.profiles p ON p.id = l.broker_id
      WHERE p.manager_id = auth.uid()
    )
  );

-- Admin/Superintendent leem tudo
CREATE POLICY "admin_read_all_lead_state"
  ON public.lead_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('ADMIN','SUPERINTENDENT')
    )
  );

-- Corretor pode bloquear/pausar o próprio lead (override manual)
CREATE POLICY "broker_update_own_lead_state"
  ON public.lead_state FOR UPDATE
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads WHERE broker_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- ─── Trigger: grava histórico automaticamente a cada UPDATE ──────────────────
CREATE OR REPLACE FUNCTION public.fn_lead_state_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.lead_state_history (
    lead_id, intencao, tema, momento, ultimo_evento,
    modo, proxima_acao, bloqueado, atualizado_por
  ) VALUES (
    NEW.lead_id, NEW.intencao, NEW.tema, NEW.momento, NEW.ultimo_evento,
    NEW.modo, NEW.proxima_acao, NEW.bloqueado, NEW.atualizado_por
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_state_history
  AFTER INSERT OR UPDATE ON public.lead_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_lead_state_history();

-- ─── Função helper: upsert seguro do estado ──────────────────────────────────
-- Usada pelas edge functions para criar/atualizar estado sem conflito.
-- Só atualiza campos que foram passados (demais mantêm valor atual).

CREATE OR REPLACE FUNCTION public.upsert_lead_state(
  p_lead_id       UUID,
  p_intencao      TEXT    DEFAULT NULL,
  p_tema          TEXT    DEFAULT NULL,
  p_momento       TEXT    DEFAULT NULL,
  p_ultimo_evento TEXT    DEFAULT NULL,
  p_modo          TEXT    DEFAULT NULL,
  p_proxima_acao  TEXT    DEFAULT NULL,
  p_bloqueado     BOOLEAN DEFAULT NULL,
  p_bloqueado_por UUID    DEFAULT NULL,
  p_atualizado_por TEXT   DEFAULT 'sistema'
)
RETURNS public.lead_state LANGUAGE plpgsql AS $$
DECLARE
  result public.lead_state;
BEGIN
  INSERT INTO public.lead_state (
    lead_id, intencao, tema, momento, ultimo_evento,
    modo, proxima_acao, bloqueado, bloqueado_por, atualizado_por, atualizado_em
  ) VALUES (
    p_lead_id,
    COALESCE(p_intencao,      'sem_info'),
    COALESCE(p_tema,          'sem_info'),
    COALESCE(p_momento,       'explorando'),
    COALESCE(p_ultimo_evento, 'lead_criado'),
    COALESCE(p_modo,          'automatico'),
    COALESCE(p_proxima_acao,  'aguardar'),
    COALESCE(p_bloqueado,     false),
    p_bloqueado_por,
    p_atualizado_por,
    NOW()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    intencao       = COALESCE(p_intencao,       lead_state.intencao),
    tema           = COALESCE(p_tema,            lead_state.tema),
    momento        = COALESCE(p_momento,         lead_state.momento),
    ultimo_evento  = COALESCE(p_ultimo_evento,   lead_state.ultimo_evento),
    modo           = COALESCE(p_modo,            lead_state.modo),
    proxima_acao   = COALESCE(p_proxima_acao,    lead_state.proxima_acao),
    bloqueado      = COALESCE(p_bloqueado,       lead_state.bloqueado),
    bloqueado_por  = COALESCE(p_bloqueado_por,   lead_state.bloqueado_por),
    atualizado_por = p_atualizado_por,
    atualizado_em  = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;
