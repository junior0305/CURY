# Manual de Arquitetura Atual — CRM

Documento de referência para o assistente de IA: visão geral do fluxo de dados, filas, módulos, integrações, regras de negócio, relatórios, premiações e interações com o lead.

---

## 1. Fluxo de Dados: Do Lead à Distribuição

### 1.1 Entrada do lead (Make / Webhook → Supabase)

1. **Origem**: Make, Zapier, Facebook Ads ou qualquer sistema que envie HTTP POST para o webhook de entrada.
2. **Endpoint**: Edge Function `incoming-lead`  
   URL: `https://[projeto].supabase.co/functions/v1/incoming-lead`  
   Header obrigatório: `Authorization: Bearer [anon key]`.
3. **Payload esperado** (JSON):
   - `name` ou `nome` ou `fullName` → nome do lead
   - `phone` ou `telefone` ou `cellphone` ou `whatsapp` ou `contact` → **obrigatório**
   - `email`, `tag`, `source`/`origin`/`origem`, `message`/`mensagem` (opcionais)
   - Suporta estruturas aninhadas: `payload.data.attributes` ou `payload.attributes` ou `payload` direto.
4. **Validação**: Se não houver `phone`, retorna 400.

### 1.2 Processamento na Edge Function `incoming-lead`

- **Distribuição atual**: NÃO usa a tabela `distribution_queues`. Usa apenas:
  - `profiles` com `lead_assignment_enabled = true` (select atual: `id, first_name, last_name` — para preencher `manager_id` no lead, o select deve incluir `manager_id`).
  - Escolha do corretor: **aleatória** entre os perfis com fila ativa (não é round-robin real).
- **Se não houver corretor com fila ativa**:
  - Insere em `distribution_logs` com `status: 'NO_BROKER_AVAILABLE'`.
  - Retorna 200 com `error: 'No brokers available'` (para o Make não reenviar).
- **Inserção do lead** em `leads`:
  - `name`, `phone`, `email`, `tag` (tag pode receber message/origin)
  - `status: 'NEW'`, `broker_id: chosenBroker.id`, `manager_id: chosenBroker.manager_id`
  - `last_interaction_at`, `created_at`
- **Log de sucesso**: `distribution_logs` com `lead_name`, `lead_phone`, `assigned_to_name`, `queue_name` (origin), `status: 'SUCCESS'`.

### 1.3 Resumo do fluxo

```
Make/Facebook/Webhook → POST /functions/v1/incoming-lead
  → Valida phone
  → Busca profiles com lead_assignment_enabled = true
  → Escolhe 1 corretor (random)
  → INSERT leads (broker_id, manager_id, status NEW)
  → INSERT distribution_logs (SUCCESS ou NO_BROKER_AVAILABLE)
```

---

## 2. Lógica de Filas

### 2.1 Onde as filas são usadas

- **Admin → aba “Regras” (Lead Distribution)**:
  - CRUD em `distribution_queues`.
  - Cada fila tem: `name`, `match_field` ('titulo' | 'tag'), `match_value`, `broker_ids` (array de UUID), `is_active`, `last_assigned_index`.
  - O Admin escolhe **equipe** e depois **corretores** (checkboxes) para vincular à fila.
- **Importante**: A Edge Function `incoming-lead` **não consulta** `distribution_queues`. Ela só usa `profiles.lead_assignment_enabled`. As filas em `distribution_queues` são configuração para uso futuro ou para outro fluxo (ex.: se um dia a função passar a fazer match por tag/origem e round-robin por fila).

### 2.2 Como o Admin escolhe corretores/equipes/economia

- **Corretores/Equipes**:
  - **Time (Users)**: cadastro de usuários, role (SUPERINTENDENT, MANAGER, BROKER, ADMIN), `manager_id`, `team_id`, `lead_assignment_enabled`, telefone.
  - **Equipes (Teams)**: tabela `teams`; em “Regras” o Admin seleciona uma equipe e depois os corretores dessa equipe para compor a fila (broker_ids).
  - **Fila ativa para receber lead**: o corretor precisa ter `lead_assignment_enabled = true` no perfil (User Management).
- **Economia**: na aba “Economia” do Admin (ver seção 7).

### 2.3 Estrutura da tabela de filas

- **distribution_queues**: id, name, match_field, match_value, broker_ids (array), is_active, last_assigned_index, created_at.
- **Type (front)**: `DistributionQueue` em `src/types/queue.ts` (teamIds é legado; no banco usa-se broker_ids).

---

## 3. Módulos Existentes

### 3.1 Área Admin (`/admin`)

- **Time (Users)**: lista de perfis, edição (nome, role, manager, equipe, telefone, `lead_assignment_enabled`), exclusão via Edge Function `delete-user`.
- **Equipes (Teams)**: CRUD de equipes (`teams`), exibição de quantidade de membros.
- **Economia**: regras de premiação (reward_configs), campanhas ativas (active_campaigns), pedidos de resgate (achievements PENDING), aprovar/recusar resgates.
- **Regras (Leads)**: Lead Distribution — criar/editar/remover filas de distribuição (distribution_queues), seleção de equipe e corretores.
- **Logs**: histórico de entrada (distribution_logs) — ontem e hoje; refetch a cada 10s.
- **Rework**: leads com status ABANDONED; seleção de corretores de destino; “Recuperar” (redistribuição aleatória entre selecionados); importação de planilha (xlsx/csv) com distribuição round-robin entre corretores selecionados.
- **Webhooks**: IntegrationsManagement — URL de entrada (incoming-lead), Bearer token, documentação do payload; URL de saída (N8N/WhatsApp), teste de envio, logs (webhook_logs).
- **Ajustes**: AudioSettings (sons do app).
- **Radar de Leads Parados** (Superintendente/Gerente): leads com ≥4h sem interação (desconsiderando 21h–08h), agrupados por gerente; ações “Cutucar” (notificação interna + WhatsApp ao gerente/corretor) e “Resgatar” (transferir leads para outro corretor). Resgate de leads que falharam na distribuição (NO_BROKER_AVAILABLE).
- **Estatísticas**: AdminStats; pódio (LeaderboardPodium) com base em leads.

### 3.2 Área Usuário (Corretor / Dashboard)

- **Dashboard** (`/dashboard`): abas “Missão”, “Lead”, “Stats”.
  - Lista de leads (fetchLeadsForDashboard: exclui ABANDONED e EXCLUDED), ordenada por `last_interaction_at`.
  - Filtros: ACTIVE, ALL, por status (NEW, IN_PROGRESS, etc.).
  - Real-time: canal Supabase para INSERT em `leads` com `broker_id = user.id` → toque “novo lead” e toast.
  - Detalhe do lead: pipeline (NEW → IN_PROGRESS → VISIT_SCHEDULED → DOCS_REQUESTED → CONCLUDED), notas (lead_notes), timeline (notas + funnel_history), exclusão com motivo, agendamento rápido.
  - Tarefas: TaskCenter, TaskForm (tasks por lead/usuário).
  - KPIs: BrokerKPIs (funil por status), LeaderboardPodium, CampaignHeroBanner (campanhas ativas + funnel_history), MissionToday.
  - Modais: Intel (táticas/estatísticas), My Rewards (conquistas), áudio (useAudioArena).

### 3.3 Motor de Gamificação

- **Tabelas**: `reward_configs`, `achievements`, `funnel_history`, `active_campaigns`.
- **Trigger no banco**: ao UPDATE (ou INSERT) de `leads.status`, a função `record_funnel_progress()` insere em `funnel_history` (lead_id, broker_id, stage) quando status ∈ VISIT_SCHEDULED, DOCS_REQUESTED, CONCLUDED (UNIQUE lead_id + stage).
- **Cálculo de conquistas**: `src/utils/gamification.ts` — `checkAndAwardAchievements(lead, actionType, brokerId)`:
  - Lê regras ativas em `reward_configs` para o action_type (SALE, VISIT, DOCS).
  - Se target_count ≤ 1: concede achievement (PENDING).
  - Se target_count > 1: conta registros em `funnel_history` (broker_id + stage) e concede quando a contagem é múltipla da meta.
- **Uso no app**: `checkAndAwardAchievements` **não é chamado** automaticamente no fluxo de atualização de status no front (LeadDetail chama apenas `updateLeadStatus`). O trigger só preenche `funnel_history`; a concessão de prêmios por regra depende de ser invocada (ex.: em backend ou em chamada explícita após update).
- **Campanhas**: `active_campaigns` — título, target_action (VISIT, SALE, DOCS), target_count, reward_amount, ends_at; exibidas no Dashboard (CampaignHeroBanner) e gerenciadas na Economia do Admin.

---

## 4. Integrações Ativas

### 4.1 Entrada (receber leads)

- **Webhook**: `POST /functions/v1/incoming-lead`.
- **Autenticação**: Bearer token (anon key) no header Authorization.
- **Origem típica**: Make (Integromat), Zapier, Facebook Lead Ads, qualquer HTTP que envie JSON no formato documentado em IntegrationsManagement.

### 4.2 Saída (envio de mensagens)

- **Edge Function**: `send-whatsapp`.
  - Body: `{ phone, message, overrideUrl? }`.
  - URL de destino: lida de `system_integrations.value` onde `key = 'WHATSAPP_N8N_URL'`, ou `overrideUrl` se informado.
  - Payload enviado ao N8N: JSON `{ Contato: cleanPhone, Mensagem: message }` (DDD brasileiro 55 adicionado se número tiver 10 ou 11 dígitos).
  - Cada tentativa é registrada em `webhook_logs` (integration_key, payload, status_code, error_message).
- **Uso**: parabéns por venda (updateLeadStatus CONCLUDED → invoke send-whatsapp para o corretor); cutucão do Radar (gerente/corretor); teste manual na aba Webhooks.

### 4.3 Outras Edge Functions

- **create-user**, **create-admin**, **delete-user**: gestão de usuários.
- **ai-smart-suggestions**: sugestões (uso específico no app).

### 4.4 APIs / Tabelas Supabase

- **Supabase**: auth (profiles), `leads`, `profiles`, `teams`, `tasks`, `lead_notes`, `distribution_queues`, `distribution_logs`, `reward_configs`, `achievements`, `funnel_history`, `active_campaigns`, `system_integrations`, `webhook_logs`, `internal_notifications`, `team_goals`, `team_investments`.

---

## 5. Regras de Negócio: Temporizadores e Autonomia dos Gerentes

### 5.1 Temporizadores / “Lead parado”

- **Janela de atendimento**: 08h–21h. O período 21h–08h não conta para “horas sem interação”.
- **Lead parado (stale)**: ≥ 4 horas sem interação (com base em `last_interaction_at`), excluindo status CONCLUDED e EXCLUDED. Opcional: ignorar lead “cutucado” nos últimos 10 min (`last_nudge_at`).
- **Onde**: Radar de Leads Parados (Admin), ordenação/prioridade na lista do corretor (LeadList).

### 5.2 Prioridade na lista do corretor (LeadList)

- Cálculo de “horas sem interação” igual ao acima (21h–08h não conta).
- **Prioridade** (0 a 4):
  - 4: STALE (≥4h sem interação, não concluído/excluído).
  - 3: status NEW.
  - 2: tarefa atrasada ou vencendo em ≤15 min.
  - 1: tarefa hoje.
  - 0: baixa.
- Ordenação: prioridade mais alta primeiro; dentro da mesma prioridade, lógica interna (ex.: próxima tarefa, last_interaction_at).

### 5.3 Autonomia dos gerentes para remanejar leads

- **Superintendente**:
  - Resgatar leads que falharam na distribuição (NO_BROKER_AVAILABLE) → escolher um corretor e atribuir em lote.
  - Radar: cutucar gerente (notificação + WhatsApp) ou “Resgate cirúrgico” (selecionar leads parados e transferir para outro corretor).
- **Gerente (MANAGER)**:
  - Vê o mesmo Radar (leads da sua equipe).
  - Pode cutucar corretores e fazer resgate cirúrgico (transferir leads parados para outro corretor da equipe).
- **RLS**: corretores atualizam apenas seus leads; gestores podem atualizar leads da equipe (políticas em `leads`).

---

## 6. Relatórios Existentes

- **Admin**: AdminStats; LeaderboardPodium (vendas/leads); Distribution Logs (entrada de leads); lista de leads (adminLeads) para Rework e Radar.
- **Command Center (QG de Comando)** (`/command-center`):
  - **Estratégia**: tendência de vendas (6 meses); totais do mês (vendas, leads, conversão); performance por equipe (mês vs anterior, metas, visitas, “soldados”); matriz de eficiência (volume vs conversão por corretor); “Cemitério de Leads” (pie por motivo de exclusão/abandono); tabela “Raio-X dos Pelotões” (equipe, soldados, leads, visitas, vendas, conversão).
  - **Finanças**: custo total (prêmios + aportes manuais); ROI por equipe; gráfico de investimento; fatia do orçamento (pie); diário de aportes manuais; registro de prêmios aprovados.
  - Metas por equipe no mês (`team_goals`); lançamento de investimentos manuais (`team_investments`).
- **Dashboard (corretor)**: BrokerKPIs (funil por status), LeaderboardPodium, campanhas ativas, MissionToday; Intel (estatísticas individuais / funil de vazamento).

---

## 7. Regras de Premiações, Prioridades e Resgates

### 7.1 Premiações (reward_configs)

- **Gatilhos**: SALE (venda), VISIT (visita agendada), DOCS (documento recebido).
- **Campos**: action_type, label, reward_type (PIX, etc.), amount_value, target_count (ex.: “a cada 3 vendas”), is_active.
- **Admin**: criar/editar/ativar/desativar/remover regras na aba Economia.

### 7.2 Conquistas (achievements)

- **Fluxo**: quando uma regra é atingida (via `checkAndAwardAchievements`), insere em `achievements` com status PENDING.
- **Admin**: em Economia, lista “Pedidos de Resgate” (PENDING); ações Aprovar (APPROVED) ou Recusar (CANCELLED).
- **Contagem para metas > 1**: usa `funnel_history` (broker_id + stage equivalente ao action_type).

### 7.3 Campanhas ativas (active_campaigns)

- Título, target_action (VISIT, SALE, DOCS), target_count, reward_amount, ends_at, is_active.
- Admin: criar, editar, remover; exibição no Dashboard (CampaignHeroBanner).

### 7.4 Prioridades de exibição / ação

- Na lista do corretor: prioridade por STALE (4), NEW (3), tarefa atrasada ou próxima (2), tarefa hoje (1), demais (0).
- No Admin: alerta de “Leads em perigo” quando existem logs NO_BROKER_AVAILABLE; destaque do Radar para leads parados por gerente.

---

## 8. Recebimento e Interações com o Lead; Funis e Regras de Resposta

### 8.1 Recebimento do lead

- Via webhook → `incoming-lead` → insert em `leads` com broker_id e manager_id.
- No Dashboard: real-time (Supabase channel) em INSERT em `leads` com `broker_id = user.id` → som + toast “Novo Lead”.

### 8.2 Funil de vendas (estágios)

- **Status**: NEW → IN_PROGRESS → VISIT_SCHEDULED → DOCS_REQUESTED → CONCLUDED; ou EXCLUDED / ABANDONED (com exclusion_reason).
- **Registro no funil**: trigger `record_funnel_progress` ao alterar `leads.status` → insert em `funnel_history` (lead_id, broker_id, stage) para VISIT_SCHEDULED, DOCS_REQUESTED, CONCLUDED (UNIQUE por lead_id + stage).
- **Uso**: timeline do lead (LeadDetail), LeaderboardPodium, CampaignHeroBanner, BrokerKPIs, gamificação (contagem para target_count > 1).

### 8.3 Regras para respostas / prioridades

- **Resposta ao lead**: não há automação de “resposta em X minutos” no código; a prioridade na lista (NEW = 3, STALE = 4) e o Radar (cutucão) servem para pressionar atendimento.
- **Prioridade na lista**: ver seção 5.2 (STALE, NEW, tarefas).
- **Notas**: `lead_notes` (lead_id, content, created_at); exibidas na timeline do LeadDetail.
- **Tarefas**: `tasks` (leadId, type, dueAt, status OPEN/DONE); uma “próxima tarefa” por lead define parte da prioridade (atrasada ou em 15 min = 2).

### 8.4 Automações pós-ação no lead

- **Status → CONCLUDED**: o front chama `updateLeadStatus(leadId, 'CONCLUDED')`; em `leads.ts` há lógica que invoca `send-whatsapp` para o corretor (mensagem de parabéns).
- **Cutucão (Radar)**: notificação em `internal_notifications` + `send-whatsapp` para gerente/corretor; atualização de `last_nudge_at` no lead e, se aplicável, incremento de `warning_count` no perfil do corretor.

---

## Resumo para o assistente de IA

- **Entrada de lead**: webhook `incoming-lead`; distribuição por `lead_assignment_enabled` (aleatória); não usa `distribution_queues` hoje.
- **Filas**: configuradas no Admin (distribution_queues + equipes/corretores); economia em reward_configs, achievements, active_campaigns.
- **Módulos**: Admin (time, equipes, economia, regras, logs, rework, webhooks, ajustes, radar); Dashboard (leads, tarefas, KPIs, pódio, campanhas); gamificação (funnel_history por trigger; checkAndAwardAchievements existe mas não é chamado no fluxo de update de status).
- **Integrações**: entrada (incoming-lead), saída (send-whatsapp → N8N), Supabase (auth + todas as tabelas listadas).
- **Regras**: lead parado ≥4h (08h–21h); prioridade STALE/NEW/tarefas; gerente/super podem cutucar e remanejar leads.
- **Relatórios**: Admin stats e logs; Command Center (estratégia + finanças); Dashboard (KPIs, pódio, campanhas).
- **Premiações**: reward_configs + achievements (PENDING → APPROVED/CANCELLED); campanhas ativas; resgates na aba Economia.
- **Interações/funil**: status do lead; trigger → funnel_history; notas e tarefas; prioridade por lista; parabéns por venda e cutucão via WhatsApp.

Este manual reflete o estado do código e do banco no momento da análise. Para alterações recentes, conferir commits e migrações.
