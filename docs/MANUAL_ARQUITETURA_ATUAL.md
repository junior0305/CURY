# Manual de Arquitetura Atual — Comandra CRM

> **Atualizado: 24/09/2026.** Fonte: leitura direta do servidor de produção vivo (Supabase self-hosted) + auditoria de código. Esta versão substitui a de abr/2026, que estava obsoleta (descrevia o sistema antes da migração self-hosted, do disparador oficial, da hierarquia e da camada copiloto).
>
> **Legenda de limpeza:** ✅ em uso · ⚠️ redundante/substituído · ⛔ obsoleto/morto (apagar) · 💡 melhoria sugerida.

---

## 0. Estado em uma frase

O sistema está **ocioso, não quebrado**. O **núcleo** (entrada de lead, distribuição, orquestrador, disparador oficial, guardião, scoring, pool frio, coach, faxinas) está **de pé**. A **camada Comandra copiloto** (dopamina, bom-dia, custódio, handoff, CAPI) **caiu na migração de 13/09** e não voltou. Três bloqueios impedem o reuso: **(1)** intake de lead quase parado, **(2)** só ~20 de 135 chips vivos, **(3)** camada copiloto com crons zerados.

**Números de referência (set/2026):** 0 leads em 24h / 9 em 7 dias · 20 chips abertos, 52 deslogados, 58 fantasmas · 7 dias → 1 mensagem automática (o resto foi manual).

---

## 1. Como está montado (infraestrutura)

| Camada | O quê |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Framer Motion. Servido em `comandra.com.br` pelo Portainer (rebuild do Git no boot; toda mudança precisa `git push` + `docker service update --force cury_agente-app`). |
| **Backend** | Supabase **self-hosted** no VPS `187.127.44.223`: Postgres 17, PostgREST, GoTrue (auth), edge functions em Deno, Storage, pg_cron, pg_net. Migrado da Supabase paga em **13/09/2026**. |
| **WhatsApp** | Dois canais: **Cloud API oficial** (o disparador — por WABA/número, `wa-*`) e **Evolution API** (os chips dos corretores, para a conversa do dia a dia). |
| **IA** | Anthropic / OpenAI / Gemini via `ai_coach_llm_config` (fallback automático). |

**Armadilha operacional conhecida:** o serviço `supabase_functions` roda **múltiplos containers** (réplicas). Ao editar uma edge, é preciso reiniciar **todos**: `docker restart $(docker ps -q -f name=supabase_functions)`. Reiniciar um só deixa os outros servindo código velho — foi a causa de vários "o fix não pegou".

---

## 2. Hierarquia e papéis (nova — set/2026)

Cadeia: **Admin → Diretor → Superintendente → Gerente → Corretor** (+ Secretária, à parte).

| Papel | Landing no login | Painel |
|---|---|---|
| ADMIN | `/admin` | `AdminLayout` (Tropas, Equipes, Pipeline, IA, Anúncios, Financeiro…) |
| DIRECTOR | `/admin` | mesmo do super (painel próprio do diretor: **pendente**) |
| SUPERINTENDENT | `/super` | `Superintendente.tsx` (rollup dos gerentes) + drill `/manager?manager=<id>` |
| MANAGER | `/manager` | `ManagerV10` |
| BROKER | `/dashboard` | `Atender.tsx` |
| SECRETARY | `/secretaria` | `Secretaria.tsx` |

**Cadastro e organograma:** Admin → **Equipe → Tropas**. O dropdown de gestor é ciente do nível (super pendura no diretor, gerente no super, corretor no gerente). A aba **Hierarquia** mostra a árvore com contagens e sinaliza quem está sem gestor. RPC `superintendente_rollup(p_super, p_dias)`. `DIRECTOR` não gera chip.

---

## 3. Fluxo do lead (entrada → distribuição → atendimento)

1. **Entrada:** Facebook/Meta → **Make** → edge `incoming-lead` (`source='facebook_make'`). Também entram `cold_pool` (repescagem) e `secretary_quick_entries`. ⚠️ **Ponto crítico:** o Make deve apontar para a URL do servidor **novo** (`comandra.com.br/supabase/...`), não para a antiga Supabase paga.
2. **Guardas automáticas no insert:** geo-guard por DDD (fora de `geo_allowed_ufs` → `EXCLUDED`), scoring heurístico (`lead_score`).
3. **Distribuição:** round-robin por `distribution_queues` (por região/campanha). Corretor elegível = `lead_assignment_enabled=true`.
4. **Notificação:** o corretor recebe aviso de novo lead pelo chip do gerente (fallback: chip do Junior) — só se `real_state='open'`.
5. **Atendimento:** corretor trabalha no `Atender.tsx` (conversa espelhada da Evolution, etiquetas, notas, avançar status).

**Funil (status de `leads`):** `NEW → IN_PROGRESS → NEGOTIATING → VISIT_SCHEDULED → VISITA_REALIZADA → DOCS_REQUESTED → CONCLUDED`; laterais: `ABANDONED`, `FOLLOW_UP_AUTO`, `REACTIVATED`, `EXCLUDED`.

**Venda (fonte canônica):** `leads` em `CONCLUDED` + `secretary_quick_entries` tipo 'venda' via `goals_team_sales_count`.

---

## 4. O motor automático — como funciona

Quase tudo que roda sozinho passa por **um** orquestrador: a edge **`followup_scheduler`**, disparada **de hora em hora** (cron job 1, `0 * * * *`, 24/24 execuções ok). Ela chama por dentro os agentes:

```
followup_scheduler (1×/hora)
  → cérebro-orquestrador · sistema-guardian · ai-sentinela (quentes)
  → agente-scoring · agente-qualificacao-ia · agente-recuperacao-abandonados
  → agente-visitas · agente-documentacao · agente-anti-sobrecarga
  → check-bot-health · notify-disconnected-managers · announcement-reminder
```

**Consequência importante:** vários crons individuais desses agentes estão **vazios ou truncados** (a migração de 13/09 quebrou os comandos `net.http_post` de várias linhas) — mas, para os agentes acima, **não faz falta**, porque o orquestrador já os executa. Prova: o cron do guardião está quebrado, e mesmo assim ele gera alerta toda hora (139 `internal_notifications` em 7 dias).

**O que NÃO passa pelo orquestrador** (tem cron próprio e portanto parou quando o cron zerou) = a **camada copiloto** (§7 e §8).

---

## 5. Agentes — ligados x desligados (`system_settings`)

| ✅ Ligados | ⛔ Desligados (por escolha) |
|---|---|
| scoring de leads | recuperação de abandonados (`agente_recuperacao_enabled=false`) |
| sentinela de quentes | redistribuição automática (`agente_redistribuicao_enabled=false`) |
| cérebro orquestrador | anti-sobrecarga (`agente_sobrecarga_enabled=false`) |
| prospecção | monitor de saúde de chip (`chip_health_enabled=false`) |
| relatório diário 21h | Ana no intake (`hold_leads_for_ai=false`) |
| briefing do corretor | alerta de gerente offline (`manager_offline_alert_enabled=false`) |
| classificação retroativa | |
| blocklist automática · simulação de "digitando" | |
| notificações gerente/corretor/desconectado | |

**Observação:** cérebro, sentinela e prospecção estão **ligados** mas produziram **zero** mensagens no período. Não é bug do agente — falta lead entrando e chip vivo. **O motor está ligado no ponto morto.**

Preços de referência (custo de disparo): `wa_preco_marketing=0.3217`, `wa_preco_utility=0.0350`. Forecast: `forecast_quente_rate=0.45`, `forecast_frio_rate=0.10`.

---

## 6. Crons — inventário e limpeza

**63 agendamentos. ~17 trabalham de verdade; ~19 são lixo para apagar; ~18 são a camada copiloto (decisão).**

### ✅ Em uso (manter)
`followup_scheduler` (1×/h, orquestrador) · `wa-campaign-runner` (2min, disparador oficial, janela até 19:30) · `wa-numero-vigia` (vigia número/WABA) · `agente-scoring` (2×/h) · `ana-capture-new-leads` (10min) · cold-pool (`return_unworked`, `return_no_response`, `recalc_temperatures`, `degrade_to_pool`) · coach (`process-queue`, `metrics-batch`, `pact-reminder`) · `cleanup_webhook_logs` (3h) · `comandra-maintenance-cleanup` (4h33) · `reuniao-snapshot-semanal` · `agente-classificacao-retro`.
> Os crons próprios de cérebro/guardião/check-chip estão quebrados, mas rodam pelo orquestrador — ver §4.

### ⛔ Apagar já — one-shot datado que já passou
`cobranca-managers-junior-20260601` (37), `cobranca-managers-15h-20260601` (38), `cobranca-managers-dia2-20260602` (39). Hardcoded para jun/2026, nunca mais disparam.

### ⛔ Apagar já — desligados/substituídos
`agente-duplicar-leads` ×13 (jobs 24–36, agente **pausado**: retrabalho afogava lead pago) · `copilot-managers-daily` (40, copilot desligado 14/06) · `manager-notifications-daily` (2) · `notify-managers-daily` (5).

### ⛔ Apagar já — quebrados mas redundantes (o orquestrador já faz)
`cerebro-orquestrador` day/night (9,10), `sistema-guardian` (11), `chip-health-monitor` (14), `monitor-lead-notifications` (16) — truncados, erram toda hora, mas cobertos pelo `followup_scheduler`. Vazios redundantes: `campaign-dispatcher-tick` (17, coberto por `wa-campaign-runner`), `evo-status-sync` (50), `check-bot-health-15min` (53).

### ⚠️ Decisão (camada copiloto — restaurar ou apagar) — ver §8
`dopamina-morning/evening` (42,43, truncados) · `dopamina-report/shield` (46,47) · `bom-dia`/`enforce` (59,60) · `custodio` (56) · `manager-briefing` (55) · `handoff-loop` (57) · `antinoshow-vespera/dia` (48,49) · `rescue`/`rescue-dormant` (44,45) · `repassar-held-leads` (61) · `comandra-capi` (51) · `detector-template-repetido` (23) · `auto-template-tuner` (22) · `ai-coach-daily` (4).
> Todos com cron vazio/truncado e **não** cobertos pelo orquestrador → estão **parados** hoje.

---

## 7. Edge functions — inventário

**100 edges reais** em `/root/supabase/volumes/functions/` (+ `main` = router e `hello` = template, que são infra). A **fonte da verdade é o servidor**, não o repo (o repo tinha ~50 fn vs ~100 em produção, várias forkadas). Sempre `download → editar → deploy` e reiniciar **todos** os containers.

### ✅ Núcleo em uso
`followup_scheduler` (orquestrador) · `incoming-lead` · `webhook_receiver` · `send_whatsapp_message` (enviador núcleo, 59 refs) · `wa-campaign-runner` · `wa-sender` (disparador oficial) · `wa-webhook` · `wa-numero-vigia` · `wa-template` · `wa-onboard` · `sistema-guardian` · `cerebro-orquestrador` · `ai-sentinela` · `ai_coach_processor` · `agente-scoring` · `agente-qualificacao-ia` · `agente-visitas` · `agente-relatorio-diario` · `agente-recuperacao-abandonados` · `agente-anti-sobrecarga` · `agente-documentacao` · `announcement-reminder` · `notify-disconnected-managers` · `check-bot-health` · `cobrar-corretor` · `corretor-vincular` · `ana-*` · `comandra-capi`.
> Muitos agentes são chamados **de dentro** do `followup_scheduler` (fan-out) — não têm cron próprio e mesmo assim rodam.

### ⛔ Órfãs / mortas — apagar (zero chamador em cron, edge, banco ou frontend)
`agente-redistribuicao` · `agente-sentinela-quentes` (versão antiga; a viva é `ai-sentinela`) · `automation_engine` · `batch-followup-once` · `cadence_executor` · `cleanup-webhook-logs` (o cron faz o DELETE inline, não chama a edge) · `coach_executive_summary` · `coach_manager_summary` · `comandra-kit-coach` · `comandra-primeiro-contato` · `comandra-prospect-followup` · `generate-message` · `rescue-pending-leads-notify` · `comandra-demo` · `host-demo` · `evo-db-diag` · `evo-db-probe` · `evo-dead-list` · `evo-delete-dead` · `fb-access-audit` · `fb-account-finder`. **(~21 edges.)**

### ⚠️ Duplicadas / a consolidar (não apagar às cegas)
- **Uploads:** `upload_campaign_leads` (v1) × `upload_campaign_leads_v2` (nova) — aposentar a v1 após confirmar que nenhuma tela usa.
- **Enviadores:** `send_whatsapp_message` (núcleo) × `wa-sender` (Cloud API) × `send-whatsapp` (só no front, geração antiga) — revisar `send-whatsapp`.
- **Notificação de gerentes:** `notify-managers` × `notify-disconnected-managers` × `manager_notification_scheduler` — sobreposição; consolidar.

### 🔒 Manter mesmo parecendo órfãs
- **Webhook/entrada externa:** `webhook_receiver`, `incoming-lead`, `wa-webhook`, `wa-sender`.
- **QR / pareamento de chip:** `get-whatsapp-qr`, `comandra-qr`, `wa-onboard`, `setup-evolution-webhooks`.
- **Ferramentas admin manuais:** `create-admin` (BootstrapAdmin), `set-admin-role` (ProfileDebug), `create-user`, `delete-user` — uso pontual, não recorrente.
- **Infra:** `main` (router), `hello` (template).

### 🔧 Vivas, mas sem gatilho por causa dos crons zerados (13/09)
~20 edges existem e deveriam rodar, mas o cron delas está vazio/truncado (ver §6/§8) — o conserto é **reparar o `cron.job`**, não apagar a edge: `comandra-dopamina`, `comandra-rescue`, `comandra-anti-noshow`, `comandra-custodio`, `comandra-manager-briefing`, `comandra-handoff`, `comandra-morning`, `repassar-held-leads`, `detector-template-repetido`, `auto-template-tuner`, `capi-effect-snapshot`, etc.

---

## 8. Frontend — rotas, telas e limpeza

### ✅ Rotas em uso
`/` (Index) · `/login` · `/dashboard` e `/atender` (Atender — dashboard do corretor atual) · `/super` (Superintendente) · `/manager` + `/manager/*` (**ManagerV10** — leads, pastas, anúncios, disparar, coach, campanha, liga, análise, pool) · `/admin` (AdminLayout) · `/command-center` · `/user-management` · `/atribuir-chips` · `/cold-pool` · `/admin/replicacao` · `/admin/ouro-ana` · `/secretaria` · `/force-password-change` · `/bootstrap-admin` · `/dashboard-classico` (DashboardFoco, secundário).

> **Nota:** a pasta `pages/manager-v2/` **não é legado** — Coach, Campanha, Liga e Análise dela são montados nas rotas `/manager/*` do painel v10 atual.

### ⛔ Arquivos órfãos — apagar já (zero referências vivas)
Variantes de App: `src/App_old.tsx`, `src/Appolsold1.tsx`.
Páginas: `pages/pages_ManagerDashboard.tsx`, `pages/ManagerV2Sub.tsx`, `pages/manager-v2/WhatsAppOficial.tsx`, `pages/CommandCenter-old.tsx`, `pages/Dashboard (1).tsx`, `pages/Dashboard - cópia.tsx`, `pages/Dashboard.backup.tsx`, `pages/Dashboard_func.tsx`, `pages/Dashboard_ok.tsx`, `pages/admin/Economia - cópia.tsx`.
Componentes/hooks/integrations com sufixo morto: `components/AuthProvider._oldtsx.tsx`, `components/broker/LeadDetail_old.tsx`, `LeadDetail_old1.tsx`, `LeadForm_old.tsx`, `LeadList_old.tsx`, `MissionToday_old.tsx`, `components/dashboard/CampaignHeroBanner_func.tsx`, `CampaignHeroBanner_old.tsx`, `LeaderboardPodium_old.tsx`, `components/gamification/DailyMissionsPanel_old.tsx`, `hooks/useGamification._oldts.ts`, `useGamification_old.ts`, `hooks/useRivalWatch-old.ts`, `integrations/supabase/leads_old.ts`, `leads_old1.ts`.
Duplicata órfã: `components/admin/UserManagement.tsx` (o vivo é `pages/UserManagement.tsx`).

### ⚠️ Legado ainda montado — apagar exige remover a rota antes
`/manager-v1` (ManagerDashboard + `components/manager/ManagerDashboard.tsx`, 164KB) · `/manager-v2` (ManagerV2, mantido como "rollback rápido") · `/manager-v3` (ManagerV3, 88KB, experimento) · `/dashboard-wolf` (DashboardWolf) · `pages/Dashboard.tsx` (import inerte em App.tsx, não montado em rota).

---

## 9. Saúde real (medições set/2026)

- **Intake:** 0 leads/24h, 9/7 dias, último em 20/09. Fonte quase toda `facebook_make`.
- **Chips (`real_state`):** 20 `open`, 52 `logged_out`, 58 `not_found` (fantasmas), 4 `restarting`, 1 `banned`.
- **Mensagens 24h:** 125 saídas, **todas `broker_manual`**; 14 entradas. 7 dias: 283 saídas, só **1 automática** (boas-vindas).
- **Guardião:** vivo (alertas `bot_offline`, `heartbeat`, `leads_orphaned`, `negotiating_stale` de hora em hora).

---

## 10. Bloqueios para reativar + ordem sugerida

1. **Reconectar chips** — só ~20 vivos. Exige re-pareamento (QR) por corretor. Definir **quem** volta primeiro (equipe/corretores) evita reconectar fantasma.
2. **Reativar entrada de lead** — confirmar Make → `incoming-lead` (URL nova) e ligar campanha/lista. Sem lead, o motor fica no ponto morto.
3. **Decidir a camada copiloto** — restaurar os ~18 crons zerados (as edges existem, só o agendamento caiu) **ou** aposentar. Só faz sentido depois de chip + intake, senão "fala no vazio".

---

## 11. Melhorias sugeridas (💡)

- **Higiene de crons:** apagar os ~19 crons-lixo (§6) — reduz ruído e risco de comportamento inesperado.
- **Higiene de código:** apagar os ~25 arquivos órfãos (§8) e, num segundo passo, remover as rotas v1/v2/v3/wolf com seus arquivos.
- **Chips fantasmas:** `not_found` (58) e `logged_out` (52) inflam o painel e o rodízio — fazer uma faxina de `bot_instances` mantendo só os de corretores reais que voltam.
- **Monitor de saúde de cron:** hoje um cron com comando vazio "passa" como sucesso — criar um check que acuse comando vazio/truncado teria pego a quebra da migração no dia.
- **Painel do Diretor:** o rollup do super existe; falta o nível acima (diretor → superintendentes).

---

## Resumo para o assistente de IA

Ambiente **só SP**, **self-hosted** no VPS `187.127.44.223` (Supabase completo + pg_cron + pg_net). Fonte da verdade das edges é o **servidor**, não o repo — sempre `download→editar→deploy` e reiniciar **todos** os containers `supabase_functions`. Deploy do frontend = `pnpm build` + `git push` + `docker service update --force cury_agente-app`. O motor automático é o **`followup_scheduler`** (1×/h) que orquestra os agentes; a **camada copiloto** (dopamina/bom-dia/custódio/handoff/CAPI) tem cron próprio e está **parada** desde a migração de 13/09. Sistema hoje **ocioso**: intake ~0, ~20 chips vivos, quase nenhuma mensagem automática. Antes de qualquer afirmação, **conferir o banco/servidor** — o estado muda.
