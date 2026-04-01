-- Configurações padrão dos Agentes Autônomos.
-- Cada agente tem um par de chaves: *_enabled (liga/desliga) + parâmetros específicos.
-- Valores armazenados como TEXT para uniformidade com as demais system_settings.

-- ── Agente 1: Redistribuição Automática ──────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_redistribuicao_enabled',    'false', 'Liga/desliga a redistribuição automática de leads sem resposta do corretor.'),
  ('agente_redistribuicao_threshold_h','4',     'Horas sem resposta do corretor para redistribuir o lead automaticamente.')
ON CONFLICT (key) DO NOTHING;

-- ── Agente 2: Relatório Diário ────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_relatorio_enabled',  'false',                      'Liga/desliga o relatório diário enviado por WhatsApp para admins e gerentes.'),
  ('agente_relatorio_hora_brt', to_jsonb('21:00'::text),     'Horário BRT do envio do relatório diário (formato HH:MM).')
ON CONFLICT (key) DO NOTHING;

-- ── Agente 3: Recuperação de Abandonados ─────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_recuperacao_enabled',          'false', 'Liga/desliga a recuperação automática de leads abandonados.'),
  ('agente_recuperacao_dias',             '15',    'Dias após o abandono para tentar reativar o lead.'),
  ('agente_recuperacao_max_tentativas',   '2',     'Número máximo de tentativas de reativação por lead.')
ON CONFLICT (key) DO NOTHING;

-- ── Agente 4: Anti-Sobrecarga ─────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_sobrecarga_enabled',   'false', 'Liga/desliga o controle de sobrecarga de leads por corretor.'),
  ('agente_sobrecarga_max_leads', '30',    'Número máximo de leads ativos por corretor antes de pausar a distribuição.')
ON CONFLICT (key) DO NOTHING;

-- ── Agente 5: Scoring de Leads ────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_scoring_enabled', 'false', 'Liga/desliga o scoring automático de leads para priorização no Cérebro.')
ON CONFLICT (key) DO NOTHING;
