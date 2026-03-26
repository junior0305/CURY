# Manager Dashboard — Design Spec
**Data:** 2026-03-26

## Problema
O gerente precisa, toda manhã: (1) registrar presença da equipe bloqueando corretores ausentes de receber leads, e (2) distribuir leads sem dono e redistribuir leads parados. O `ManagerDashboard.tsx` atual busca todos os leads e perfis da base inteira — sem filtro por equipe.

## Escopo
Todos os dados exibidos são filtrados pelo `manager_id` do gerente logado. Nenhum dado de outras equipes aparece.

---

## Estrutura da Página

### Topo fixo — Cards de resumo
Sempre visíveis, acima das tabs.

| Card | Dado | Fonte |
|---|---|---|
| Presentes hoje | X de Y corretores com `lead_assignment_enabled = true` | profiles |
| Leads novos | Leads criados hoje na equipe | leads.created_at |
| Parados +24h | Leads ativos sem interação há +24h | leads.last_interaction_at |
| Aguardando docs | Leads com `status = DOCS_REQUESTED` | leads.status |
| Vendas da semana | Leads com `status = CONCLUDED` nos últimos 7 dias | leads.status + updated_at |

---

### Tab 1 — Presença
- Lista todos os corretores da equipe do gerente (`manager_id = gerente.id`, `role = BROKER`)
- Cada corretor tem um toggle **Presente / Ausente**
- Toggle grava `lead_assignment_enabled` via `updateProfile()` em `profiles.ts`
- Ausente = `lead_assignment_enabled: false` → sai da fila de distribuição automática
- **Sem reset automático** — gerente reativa manualmente no dia seguinte
- Corretor ausente aparece com badge cinza no ranking e fila

---

### Tab 2 — Distribuição
Duas seções dentro da mesma tab:

**Sem Corretor**
- Leads com `broker_id = null` ou `broker_id` de corretor inativo/excluído
- Gerente clica no lead → dropdown com corretores presentes → confirma atribuição
- Atualiza `leads.broker_id`

**Parados (+24h)**
- Leads com corretor atribuído, status ativo (`NEW`, `IN_PROGRESS`, `DOCS_REQUESTED`), e `last_interaction_at < now - 24h`
- Gerente pode reatribuir para outro corretor
- Atualiza `leads.broker_id`

---

### Tab 3 — Ranking
- Tabela dos corretores da equipe
- Colunas: posição, nome, leads ativos, vendas (semana), conversão %, tempo médio de resposta
- Ordenável por qualquer coluna
- Ícone 🔴 em corretores ausentes

---

### Tab 4 — Fila
- Lista corretores com `lead_assignment_enabled = true` na ordem da fila
- Mostra quantos leads ativos cada um tem
- Referência visual para o gerente ver quem está sobrecarregado antes de redistribuir

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/pages/ManagerDashboard.tsx` | Refatorar: filtrar por equipe, adicionar tabs, cards de resumo |
| `src/integrations/supabase/profiles.ts` | Adicionar `fetchTeamBrokers(managerId)` e `fetchTeamLeads(managerId)` |

## Arquivos a Criar

| Arquivo | Conteúdo |
|---|---|
| `src/components/manager/AttendancePanel.tsx` | Tab 1 — presença com toggles |
| `src/components/manager/DistributionPanel.tsx` | Tab 2 — sem dono + parados com reatribuição |
| `src/components/manager/TeamRanking.tsx` | Tab 3 — tabela de ranking |
| `src/components/manager/LeadQueue.tsx` | Tab 4 — fila de distribuição |
| `src/components/manager/ManagerSummaryCards.tsx` | Cards de resumo do topo |

---

## Decisões Técnicas
- Queries filtradas no Supabase (não no cliente) para evitar over-fetching
- `updateProfile()` já existe em `profiles.ts` — reutilizar para o toggle de presença
- Atribuição de lead: UPDATE `leads SET broker_id = X WHERE id = Y`
- Dados das tabs carregados sob demanda (lazy) — só busca quando a tab é aberta
