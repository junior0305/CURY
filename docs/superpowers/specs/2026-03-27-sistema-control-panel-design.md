# Painel de Controle do Sistema — Design Spec
**Data:** 2026-03-27

## Problema
O admin não consegue saber se os módulos do sistema estão funcionando, por que falham, ou como corrigir sem rodar SQL ou pedir ao desenvolvedor. O Monitor atual mostra apenas contadores agregados — não informa se a Sentinela está ativa, se o Cérebro está processando, ou se a instância WhatsApp está conectada.

## Objetivo
Substituir o `MonitorScheduler` por um **Painel de Controle do Sistema** que mostra o status de cada módulo em tempo real, a causa de problemas em linguagem clara, e permite ações corretivas direto na tela.

---

## Localização
- **Rota:** Admin → Automação → aba "Monitor" (label renomeia para "Sistema")
- **Arquivo substituído:** `src/components/admin/MonitorScheduler.tsx` → `src/components/admin/SistemaControl.tsx`
- **AdminLayout.tsx:** trocar import de `MonitorScheduler` para `SistemaControl` + mudar label de `"Monitor"` para `"Sistema"`

---

## Os 11 Módulos Monitorados

### Grupo 1 — Recepção de Leads

**Boas-vindas**
- Fonte: `distribution_logs` (última entrada com `status='SUCCESS'`)
- Saudável quando: há registro nas últimas 24h
- Ocioso: habilitado mas sem lead novo nas últimas 24h (normal fora do horário comercial)
- Ação: mostrar último lead recebido (nome, telefone, timestamp)

**Incoming Lead**
- Fonte: `distribution_logs` (última entrada)
- Saudável quando: há registro nas últimas 24h
- Ação: mostrar quantidade de leads recebidos hoje

---

### Grupo 2 — Automações de Follow-up

**Follow-up (Scheduler)**
- Fonte: `scheduler_runs` (última linha, ordenado por `ran_at` DESC)
- Saudável quando: `status='success'` e `ran_at` há menos de 2h
- Erro: mostrar `error_message` em texto claro
- Ação: botão **Rodar Agora** (fire-and-forget para `followup_scheduler`)

**Cadências**
- Fonte: `cadence_templates` WHERE `is_active=true` (contagem)
- Saudável quando: há pelo menos 1 template ativo
- Ocioso: nenhum template ativo configurado
- Ação: link para aba IaBuilder (abrir `/admin` → grupo Automação → aba ia-builder)

**Cérebro Central**
- Fonte: `system_settings` WHERE `key='cerebro_enabled'` + `cerebro_runs` (última linha)
- Saudável quando: `value='true'` E `cerebro_runs` tem execução recente com `status='success'`
- Desabilitado quando: `value='false'`
- Ação: **Toggle ativar/desativar** (UPDATE `system_settings` SET value) + botão **Ver fila** (count de `lead_activation_queue` WHERE `status='pending'`)

---

### Grupo 3 — Inteligência Artificial

**Sentinela IA**
- Fonte: `ai_sentinela_config` (campos: `is_enabled`, `monthly_spent_usd`, `monthly_budget_usd`)
- Saudável quando: `is_enabled=true` E `monthly_spent_usd < monthly_budget_usd`
- Erro de orçamento: `monthly_spent_usd >= monthly_budget_usd`
- Ação: **Toggle ativar/desativar** (UPDATE `ai_sentinela_config`) + mostrar barra de orçamento (`monthly_spent_usd / monthly_budget_usd`) + link para IaBuilder

**IA Coach**
- Fonte: `ai_coach_queue` (última linha processada) + `ai_coach_analysis` (última linha)
- Saudável quando: `ai_coach_queue` tem item com `status='completed'` nas últimas 48h
- Ocioso: nenhuma análise nas últimas 48h (normal se não há conversas)
- Ação: mostrar timestamp da última análise

**Análise IA**
- Fonte: `ia_conversations` (MAX `last_message_at`) + `ia_messages` (última linha)
- Saudável quando: houve mensagem em `ia_messages` nas últimas 24h
- Ocioso: sem conversas recentes
- Ação: mostrar última conversa processada (lead name + timestamp)

---

### Grupo 4 — Infraestrutura WhatsApp

**Webhook**
- Fonte: `leads` (MAX `last_lead_response_at`)
- Saudável quando: houve resposta de lead nas últimas 24h
- Ocioso: sem mensagens recebidas (pode ser normal à noite)
- Ação: mostrar timestamp do último evento recebido

**WhatsApp (Evolution)**
- Fonte: `bot_instances` (campos: `name`, `status`, `instance_name`)
- Saudável quando: pelo menos 1 instância com `status='open'`
- Erro: mostrar nome(s) da(s) instância(s) com status diferente de `'open'`
- Ação: listar cada instância com seu status individual. **Sem botão Reconectar** — mostrar instrução: "Acesse o painel Evolution para reconectar"
- Nota: reconexão automática não é suportada pela edge function atual

**Notificações Internas**
- Fonte: `system_settings` WHERE `key='notify_brokers_enabled'` + `internal_notifications` (count hoje)
- Saudável quando: `value=true` E há notificações enviadas hoje
- Ação: **Toggle ativar/desativar** (UPDATE `system_settings`) + mostrar contagem de notificações hoje

---

## Estados de cada módulo

| Estado | Cor | Badge | Significado |
|---|---|---|---|
| **Funcionando** | 🟢 verde | "OK" | Operando normalmente |
| **Ocioso** | 🟡 amarelo | "Ocioso" | Habilitado mas sem atividade recente |
| **Erro** | 🔴 vermelho | "Erro" | Falha na última execução |
| **Desabilitado** | ⚫ cinza | "Desabilitado" | Flag desligada intencionalmente |

---

## Layout da tela

Grid de cards agrupados por seção. Cada card tem:
- **Título** do módulo + ícone
- **Badge** de status (colorido)
- **Linha de detalhe**: última atividade ou causa do erro em português
- **Ação**: botão ou link relevante (ou nada se não há ação disponível)

```
┌─────────────────────────────────────────────────────────┐
│  🔧 Controle do Sistema            [↻ Atualizar]        │
│  Verificado há 2min                                     │
├─────────────────────────────────────────────────────────┤
│  RECEPÇÃO DE LEADS                                      │
│  [ Boas-vindas 🟢 ]  [ Incoming Lead 🟢 ]               │
│                                                         │
│  AUTOMAÇÕES DE FOLLOW-UP                                │
│  [ Follow-up 🔴 ]  [ Cadências 🟡 ]  [ Cérebro ⚫ ]    │
│                                                         │
│  INTELIGÊNCIA ARTIFICIAL                                │
│  [ Sentinela ⚫ ]  [ IA Coach 🟢 ]  [ Análise IA 🟢 ]  │
│                                                         │
│  INFRAESTRUTURA WHATSAPP                                │
│  [ Webhook 🟢 ]  [ WhatsApp 🔴 ]  [ Notificações 🟢 ]  │
│                                                         │
│  ── Histórico (scheduler_runs + cerebro_runs, 10 itens) │
└─────────────────────────────────────────────────────────┘
```

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `src/components/admin/SistemaControl.tsx` | CRIAR — componente principal |
| `src/components/admin/MonitorScheduler.tsx` | DELETAR |
| `src/pages/admin/AdminLayout.tsx` | Trocar import + label "Monitor" → "Sistema" |

---

## Decisões técnicas

- **Polling:** `setInterval(fetch, 60000)` — atualiza a cada 60s
- **Toggle Cérebro:** `supabase.from('system_settings').update({value:'true'}).eq('key','cerebro_enabled')`
- **Toggle Sentinela:** `supabase.from('ai_sentinela_config').update({is_enabled:true})`
- **Toggle Notificações:** `supabase.from('system_settings').update({value:true}).eq('key','notify_brokers_enabled')`
- **Rodar Agora:** fire-and-forget `supabase.functions.invoke('followup_scheduler', {body:{}})` — padrão já existente
- **Cérebro Rodar:** quando `cerebro_enabled=true`, o `followup_scheduler` já chama o `cerebro-orquestrador` internamente — não há invocação separada
- **WhatsApp reconectar:** não implementado — mostrar instrução manual
- **Erros em português:** mapear mensagens comuns: `"401"` → `"Credencial inválida"`, `"timeout"` → `"Tempo esgotado"`, `"ECONNREFUSED"` → `"Serviço inacessível"`
- **Tabelas existentes confirmadas:** `ia_conversations`, `ia_messages`, `ai_coach_queue`, `ai_coach_analysis`, `bot_instances` existem no banco (criadas antes das migrations numeradas)
- **Sem nova migration necessária**
