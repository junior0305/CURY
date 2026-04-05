-- Configurações para novos agentes: Briefing do Corretor e Sentinela de Leads Quentes.

-- ── Agente: Briefing Matinal do Corretor ─────────────────────────────────────
-- Envia às 08:00 BRT um briefing personalizado para cada corretor com:
--   leads quentes, fila ativa, ranking e tarefas do dia.
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_briefing_corretor_enabled', 'false',
   'Liga/desliga o briefing matinal enviado por WhatsApp a cada corretor (08h BRT).')
ON CONFLICT (key) DO NOTHING;

-- ── Agente: Sentinela de Leads Quentes ───────────────────────────────────────
-- Alerta gerentes quando leads quentes ficam sem resposta do corretor.
-- Roda a cada 5min via cron (Supabase Dashboard → Cron Jobs).
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_sentinela_quentes_enabled', 'false',
   'Liga/desliga os alertas de sentinela para leads quentes parados (cron 5min).')
ON CONFLICT (key) DO NOTHING;

-- ── Agente: Classificação Retroativa ─────────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('agente_classificacao_retro_enabled', 'false',
   'Liga/desliga a classificação retroativa de leads sem lead_state (execução manual ou cron diário).')
ON CONFLICT (key) DO NOTHING;
