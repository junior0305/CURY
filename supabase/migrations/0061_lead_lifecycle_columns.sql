-- Migration 0061: Colunas de ciclo de vida do lead
-- Suporte a: tentativas de contato, follow-up automático, reativação, redistribuição
-- Aplicada em: SP (vaghxnypfphhxiobnhpk) e SJC (dcimeuefnhaiemrfiklj) em 2026-04-19

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_attempts     INT         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at      TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS negotiating_since    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followup_started_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_broker_id   UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS redistribution_count INT         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactivated_at       TIMESTAMPTZ DEFAULT NULL;

-- Novos valores de status adicionados ao enum LeadStatus no frontend (types/lead.ts):
-- NEGOTIATING      → corretor marcou como em negociação ativa
-- FOLLOW_UP_AUTO   → bot assumiu após 3 tentativas sem resposta
-- REACTIVATED      → lead respondeu ao bot, voltou ao corretor com prioridade

-- Nota: o campo status da tabela leads é VARCHAR — não há enum no banco,
-- os novos valores são aceitos sem ALTER TYPE.
