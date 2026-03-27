# Painel de Controle do Sistema — Design Spec
**Data:** 2026-03-27

## Problema
O admin não consegue saber se os módulos do sistema estão funcionando, por que falham, ou como corrigir sem rodar SQL ou pedir ao desenvolvedor. O Monitor atual mostra apenas contadores agregados — não informa se a Sentinela está ativa, se o Cérebro está processando, ou se a instância WhatsApp está conectada.

## Objetivo
Substituir o `MonitorScheduler` por um **Painel de Controle do Sistema** que mostra o status de cada módulo em tempo real, a causa de problemas em linguagem clara, e permite ações corretivas direto na tela.

---

## Localização
- **Rota:** Admin → Automação → aba "Monitor" (renomear para "Sistema")
- **Arquivo substituído:** `src/components/admin/MonitorScheduler.tsx` → `src/components/admin/SistemaControl.tsx`
- **AdminLayout.tsx:** trocar import e label da aba

---

## Os 11 Módulos Monitorados

### Grupo 1 — Recepção de Leads
| Módulo | Fonte de dados | Saudável quando |
|---|---|---|
| **Boas-vindas** | `distribution_logs` (last entry) + `automation_logs` WHERE entity_type='welcome' | enviou welcome há menos de 24h sem erro |
| **Incoming Lead** | `distribution_logs` (last entry) | recebeu lead nas últimas 24h |

### Grupo 2 — Automações de Follow-up
| Módulo | Fonte de dados | Saudável quando |
|---|---|---|
| **Follow-up (Scheduler)** | `scheduler_runs` (last row) | rodou há menos de 2h, status='success' |
| **Cadências** | `cadence_executions` WHERE status='active' + `cadence_templates` WHERE is_active=true | há templates ativos configurados |
| **Cérebro Central** | `cerebro_runs` (last row) + `system_settings` WHERE key='cerebro_enabled' | flag=true + rodou junto com scheduler |

### Grupo 3 — IA
| Módulo | Fonte de dados | Saudável quando |
|---|---|---|
| **Sentinela IA** | `ai_sentinela_config` (is_enabled, monthly_spent_usd, monthly_budget_usd) + `ai_sentinela_sessions` | is_enabled=true + orçamento disponível |
| **IA Coach** | `ai_coach_queue` (last processed) + `ai_coach_analysis` (last row) | processou item nas últimas 48h sem erro |
| **Análise IA** | `ia_conversations` (last updated) + `ia_messages` (last row) | houve conversa com mensagem nas últimas 24h |

### Grupo 4 — Infraestrutura WhatsApp
| Módulo | Fonte de dados | Saudável quando |
|---|---|---|
| **Webhook** | `leads` (MAX last_lead_response_at) | recebeu mensagem de lead nas últimas 24h |
| **WhatsApp (Evolution)** | `bot_instances` (status field) | pelo menos 1 instância com status='open' |
| **Notificações** | `system_settings` WHERE key='notify_brokers_enabled' + `internal_notifications` (last row) | flag=true + notificação enviada nas últimas 24h |

---

## Estados de cada módulo

| Estado | Cor | Significado |
|---|---|---|
| **Funcionando** | 🟢 verde | Operando normalmente dentro do esperado |
| **Ocioso** | 🟡 amarelo | Habilitado mas sem atividade recente (pode ser normal) |
| **Erro** | 🔴 vermelho | Última execução falhou ou configuração inválida |
| **Desabilitado** | ⚫ cinza | Flag desligada intencionalmente |

---

## Ações por módulo

| Módulo | Ação disponível |
|---|---|
| **Boas-vindas** | Ver últimas enviadas (lista compacta) |
| **Incoming Lead** | Ver últimos leads recebidos |
| **Follow-up** | Rodar Agora + ver erro detalhado da última execução |
| **Cadências** | Link → IA Builder (configurar templates) |
| **Cérebro Central** | Toggle ativar/desativar (grava `system_settings.cerebro_enabled`) + ver itens pendentes na fila |
| **Sentinela IA** | Toggle ativar/desativar (grava `ai_sentinela_config.is_enabled`) + ver orçamento restante + link → IaBuilder |
| **IA Coach** | Ver última análise gerada |
| **Análise IA** | Ver última conversa processada |
| **Webhook** | Mostrar último evento recebido com timestamp |
| **WhatsApp** | Listar instâncias com status individual. Botão Reconectar (invoca endpoint Evolution) |
| **Notificações** | Toggle ativar/desativar (grava `system_settings.notify_brokers_enabled`) |

---

## Layout da tela

```
┌─────────────────────────────────────────────────────────┐
│  🔧 PAINEL DE CONTROLE DO SISTEMA        [Atualizar]    │
│  Última verificação: há 2min                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  RECEPÇÃO DE LEADS                                      │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Boas-vindas  │  │ Incoming Lead│                    │
│  │ 🟢 OK        │  │ 🟢 OK        │                    │
│  │ há 3h        │  │ há 1h        │                    │
│  │ [Ver últimas]│  │ [Ver últimos]│                    │
│  └──────────────┘  └──────────────┘                    │
│                                                         │
│  AUTOMAÇÕES DE FOLLOW-UP                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Follow-up    │  │ Cadências    │  │ Cérebro      │ │
│  │ 🔴 Erro      │  │ 🟡 Ocioso    │  │ ⚫ Desabili  │ │
│  │ "401 Unauth" │  │ 0 ativos     │  │              │ │
│  │ [Rodar Agora]│  │ [Configurar] │  │ [● Ativar]   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  INTELIGÊNCIA ARTIFICIAL                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Sentinela IA │  │ IA Coach     │  │ Análise IA   │ │
│  │ ⚫ Desabili  │  │ 🟢 OK        │  │ 🟢 OK        │ │
│  │ $0/$10 budget│  │ há 2h        │  │ há 45min     │ │
│  │ [● Ativar]   │  │ [Ver análise]│  │ [Ver conv.]  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  INFRAESTRUTURA WHATSAPP                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Webhook      │  │ WhatsApp     │  │ Notificações │ │
│  │ 🟢 OK        │  │ 🔴 Desconect │  │ 🟢 OK        │ │
│  │ há 12min     │  │ sjc-main ❌  │  │ 5 hoje       │ │
│  │ [Ver evento] │  │ [Reconectar] │  │ [● Desativar]│ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ── Histórico de execuções (últimas 10) ─────────────  │
│  [tabela compacta do scheduler_runs + cerebro_runs]     │
└─────────────────────────────────────────────────────────┘
```

---

## Arquivos a modificar/criar

| Arquivo | Mudança |
|---|---|
| `src/components/admin/SistemaControl.tsx` | CRIAR — componente principal do painel |
| `src/components/admin/MonitorScheduler.tsx` | DELETAR — substituído pelo SistemaControl |
| `src/pages/admin/AdminLayout.tsx` | Trocar import + label da aba de "Monitor" para "Sistema" |

---

## Decisões técnicas

- **Polling:** `useEffect` com `setInterval(fetch, 60000)` — atualiza a cada 60s automaticamente
- **Toggle Cérebro/Sentinela/Notificações:** UPDATE direto em `system_settings` ou `ai_sentinela_config` via Supabase client — sem edge function necessária
- **Rodar Agora:** fire-and-forget para `followup_scheduler` (padrão já existente no MonitorScheduler)
- **Reconectar WhatsApp:** chamar endpoint da Evolution API via edge function `send_whatsapp_message` com action='restart'
- **Erros em linguagem clara:** mapear códigos HTTP e mensagens comuns para texto em português (ex: "401" → "Credencial inválida — verifique o token da instância")
- **Histórico compacto:** manter tabela das últimas 10 execuções do scheduler + cerebro na parte inferior da tela
- **Sem nova migração:** todos os dados necessários já existem nas tabelas atuais
