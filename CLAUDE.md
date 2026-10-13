# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm build:dev    # Build in dev mode
pnpm lint         # ESLint
pnpm preview      # Preview production build
```

No test suite is configured.

## What This Is

A **gamified real estate CRM** built for imobiliárias (real estate agencies). It manages lead distribution, broker performance tracking, and motivation through gamification (missions, achievements, leaderboard, economy/rewards).

## Architecture

**Stack:** React 18 + TypeScript + Vite + Supabase (backend) + shadcn/ui + Tailwind CSS + React Router v6 + TanStack Query + Capacitor (mobile).

**Auth & Roles:** `src/components/AuthProvider.tsx` manages session and role. Four roles drive routing:
- `BROKER` → `/dashboard`
- `MANAGER` → `/manager`
- `ADMIN` / `SUPERINTENDENT` → `/admin`, `/command-center`, `/user-management`

Routes are defined in `src/App.tsx` with role-based `ProtectedRoute` wrappers.

**Supabase integration:** Client at `src/integrations/supabase/client.ts`. Type-safe query helpers in `src/integrations/supabase/leads.ts`, `profiles.ts`, `tasks.ts`. Database types are in those files. All data access goes through Supabase (no separate API layer).

**Key pages:**
- `src/pages/Dashboard.tsx` — broker view: leads, tasks, gamification
- `src/pages/ManagerDashboard.tsx` — manager view: team KPIs, leaderboard, campaigns
- `src/pages/Admin.tsx` — admin view: stats, lead distribution, team management
- `src/pages/CommandCenter.tsx` — admin: integrations, automations, system config

**Component structure:**
- `src/components/broker/` — broker-specific components (lead list/detail, missions, AI assistant)
- `src/components/dashboard/` — shared dashboard widgets (KPIs, funnel, leaderboard, campaign banner, achievement ticker)
- `src/components/admin/` — admin panels (user management, lead distribution/rework/redistribution, integrations)
- `src/components/gamification/` — gamification system (missions panel, gamification bar)
- `src/components/ui/` — shadcn/ui base components (do not edit these directly)

**Gamification system:** `src/hooks/useGamification.ts` + `src/utils/gamification.ts` handle XP, level, missions, achievements, economy (virtual currency), and rewards. Tables: `achievements`, `daily_missions`, `economy_transactions`, `rewards`.

**Lead flow:** Leads come in via the `incoming-lead` Supabase Edge Function (called from Make/Facebook integrations) and are distributed to brokers via a queue system. Distribution logic is managed in the admin panel.

**Edge Functions** (`supabase/functions/`): `incoming-lead`, `orchestrator`, `followup_scheduler`, `send-whatsapp`, `create-user`, `delete-user`, `set-admin-role`, `ai-smart-suggestions`, `ai_coach_processor`, `webhook_receiver`.

**Migrations** are in `supabase/migrations/` — numbered sequentially, written in Portuguese.

## Conventions

- Routes stay in `src/App.tsx` (per AI_RULES.md)
- Pages go in `src/pages/`, components in `src/components/`
- Always use shadcn/ui components; create new components instead of modifying `src/components/ui/`
- Use Tailwind for all styling; use lucide-react for icons
- Path alias `@/` maps to `src/`
- Several files have `_old`, `_backup`, `.backup.tsx` variants — these are unused drafts, prefer the canonical filename

## Trabalho em paralelo (mais de uma IA no mesmo repositório)

Mais de uma sessão de IA trabalha neste repositório e publica no mesmo site (comandra.com.br). Leia esta seção antes de mexer e **acrescente aqui** o que você construir ou decidir com o Junior (seção "Registro" no fim).

### Quem cuida de quê
- **Sessão Estratégia:** `src/components/estrategia/*` (Estratégia, Sala de Guerra, Minha Estratégia, Conselho de estratégia).
- **Sessão Diretoria:** `src/components/diretoria/*` (EquipesCards, PastasPainel, pastasAnalise, AnunciosSaude), `src/hooks/useDiretoria.ts`, robôs do servidor `/root/econ/*.py`.
- **Compartilhados:** `src/components/manager-v10/RailV10.tsx` (menu do gerente **e** do super: no /manager só Tempo real, Time e B.I. são abas internas; o resto é link), `src/pages/Diretoria.tsx` e `src/styles/diretoria.css`. Só acrescente; não reescreva nem reordene o que existe. Classes CSS novas com prefixo próprio.

### Commit e publicação
1. Antes de mexer: `git pull` e `git status`.
2. `git add` **só dos seus arquivos** (nunca `git add src` inteiro). Faça o commit **antes** de buildar: o `dist` leva tudo o que está no disco, inclusive trabalho pela metade de outra sessão.
3. Publicar: `npx vite build` → `git add <seus arquivos> dist` → commit → `git push origin main` → `ssh root@187.127.44.223 'docker service update --force --detach cury_agente-app'` → conferir o hash do `index-*.js` em comandra.com.br.
4. Edge functions ficam no servidor (`/root/supabase/volumes/functions/<fn>/index.ts`), não neste repositório: editar lá e `docker service update --force --detach supabase_functions`. Tabela nova exige reiniciar `supabase_rest`.

### IA (OpenAI)
- IA **só na aba Estratégia** (decisão do Junior). As outras abas usam regras fixas.
- Reusar a edge **`estrategia-ia`**: prompt em `system_settings.estrategia_ia_prompt` ({PAPEL} vira diretor/super/gerente), modelo em `estrategia_ia_modelo` (gpt-5.1). Gera em segundo plano e a tela consulta `public.estrategia_ia` pelo id (o GPT-5.1 leva ~60 s; o gateway corta em 60 s). Exemplo: `src/components/estrategia/Conselho.tsx`.
- A chave da edge é a variável **`ESTRATEGIA_OPENAI_KEY`**. **Nunca** colocar `OPENAI_API_KEY` no serviço `supabase_functions`: 15 edges antigas (webhook_receiver, wa-webhook, ai-sentinela, cerebro, copilot…) leem essa variável e voltariam a usar IA sozinhas, inclusive no WhatsApp.

### Regras da casa (valem para tudo que manda mensagem, cobra ou conta venda)
- **WhatsApp:** chip do gerente → chip do super **da mesma equipe** → chip do Junior (`system_settings.notification_bot_instance_id`). Nunca chip de super para outra equipe; nunca chip de corretor.
- **Cobrança:** o diretor cobra o **superintendente** primeiro (não passar por cima). Cobrar o gerente direto é opcional, e o super recebe `internal_notifications` tipo `COBRANCA_DIRETOR`.
- **Venda** só conta em "Venda Confirmada" no Junix (`junix_vendas`, data = assinatura do cliente).
- **Adajes:** vendas de antes de 12/10/2026 não contam no placar do diretor (`junix_vendas.fora_do_placar`); contam no painel dela.
- **Leads:** nada de redistribuir automaticamente; quem decide é o gerente.
- **Pastas:** previsão sempre com `lerPastas` / `resumoPastas` (`src/components/diretoria/pastasAnalise.ts`), que tiram da conta duplicadas, reprovadas e paradas há 60+ dias. Assim Hoje, Pastas e Estratégia mostram o mesmo número.
- **Anúncios:** a aba Leads e investimento lê `public.fb_saude` (robô `/root/econ/fb_saude.py`, de hora em hora). Lead de formulário e conversa de WhatsApp têm referências separadas. O painel não escreve no Facebook (versão 1).

### Registro (cada sessão acrescenta uma linha: data · sessão · o que fez/decidiu)
- 13/10 · Diretoria · Equipes em cards (ritmo da meta, indicadores, gargalo, cobrar/combinar); Pastas nova (pipeline real, ataque de hoje, limpeza, por equipe); aba B.I. no diretor; Saúde dos anúncios; edge `estrategia-ia` + Conselho de estratégia (só responde quando perguntado).
- 13/10 · Estratégia · (a preencher pela sessão Estratégia: Sala de Guerra, Minha Estratégia, alocação de verba, campanhas de incentivo)
- 13/10 · Diretoria · Conserto: no /manager toda aba abria o B.I. (RailV10 mandava todas as abas para onAba). Agora só o /super resolve tudo por dentro.
- 13/10 · Diretoria · Lead do Make: `incoming-lead` agora lê o field_data (região, renda, trabalho, demais respostas → `leads.regiao_interesse`, `form_respostas`) e troca o ID da campanha pelo nome (`leads.campanha_nome`, via view `fb_campanhas_nome` sobre `fb_saude`). Ficha do corretor e aviso de WhatsApp mostram. Backup da edge: `/root/incoming-lead.antes-form-10131816.ts`.
