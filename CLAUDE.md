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
- IA **só na aba Estratégia** (decisão do Junior), mais o Assistente de mídia do super (pedido do Junior em 14/10). As outras abas usam regras fixas.
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
- 13/10 · Diretoria · Lead de teste da Meta ("test lead: dummy data") não vai para corretor: `incoming-lead` grava em `webhook_logs` (integration_key `fb_teste`) e a tela Integrações lista. `fb-leadgen` (ligação direta) repassa no formato do Make (page_id, form_id, campanha=ID, nomes, field_data). Trava de duplicado por `fb_lead_id` (índice `leads_fb_lead_id_novos` + checagem). App Meta "CRM Comandra Leads" ainda em modo desenvolvimento.
- 14/10 · Diretoria · Cockpit do gerente (CockpitGerenteV3, da outra sessão): atendido = WhatsApp do corretor OU status≠NEW OU tentativa OU interação; pescado não é 'parado'; Poder de fogo = gasto real fb_saude (dono_id) + CPL 7d; saldo do corretor só lead pago; nome da campanha; dia em horário SP.
- 14/10 · Diretoria · `system_settings.welcome_oficial.enabled=false` (Junior pediu parar): o boas-vindas pelo número oficial (template simulacao, em incoming-lead) nunca enviou, 30/30 falharam com "(#100) Parameter name is missing or empty". O boas-vindas pelo chip do corretor já pula sozinho quando o chip está offline.
- 14/10 · Diretoria · cron 58 `ana-capture-new-leads` DESLIGADO (Junior autorizou): template `ana_novo_lead_mcmv` não existe na Meta (#132001, 123/141 falhas) e mesmo assim marcava ana_contacted_at + pause_auto_messages. Religar só com template aprovado. (job é do supabase_admin)
- 14/10 · Diretoria · Crontab do servidor reescrito em UTC (o cron do Ubuntu ignora CRON_TZ; tudo rodava 3h antes). Backup em `/root/crontab.antes-fuso-*`. Horário novo = SP + 3.
- 14/10 · Diretoria · Segurança: `cobrar-corretor` tira o "quem cobra" do login (não do corpo) e só cobra corretor da própria árvore; `junix_alertas` com RLS e sem acesso anon/authenticated.
- 14/10 · Diretoria · **Régua da Equipe** (cobranças configuráveis): tabelas `regua_catalogo` (sugestão do sistema), `regua_regras` (ajuste diretor→super→gerente; vale o mais perto do corretor, dentro da faixa do diretor), `regua_pausas`; `cobrancas.regra/estado` (estado 'pronta' = líder envia do próprio WhatsApp). Edge `regua-cobranca` (modo rodar / previa). Tela `src/components/regua/ReguaEquipe.tsx`: aba "Régua" no /super (diretor edita o nível empresa) e `/manager/regua`. Regras nascem DESLIGADAS. Mapa das 66 funções de mensagem: https://claude.ai/artifact/MfCDCcs4b6bW8STEypvK2a
- 14/10 · Diretoria · Régua v2: cada regra é uma escada de 1 a 3 toques (`regua_catalogo.etapas_sugeridas`, `regua_regras.etapas` = [{prazo, para: corretor|gerente|super, assina: comandra|gerente|super|diretor, texto}]); os 3 resgates viraram `resgate_plantao`. `cobrancas.etapa` + `sobre_ids`. Backup da edge v1: `/root/regua-cobranca.v1.ts`.
- 14/10 · Diretoria · **Faxina de mensagens** (Junior aprovou): 45 edges movidas para `/root/edge-apagadas-20261014/` (lista em `/root/edge-apagar-20261014.txt`); triggers fisgada/vitoria/desculpa/inbox removidos; followup_scheduler só chama anti-sobrecarga, scoring, relatório, lembrete de comunicado, check-bot-health (backup `/root/followup_scheduler.antes-faxina-1014.ts`). Botões tirados: notificar desconectados (SistemaControl, CommandCenter), disparar resumo/corretores (Tropas); BriefingOps usa cobrar-corretor. `orchestrator` ficou (tela antiga de Prospecção). Régua ganhou `visita_parada` e `docs_parados`.
- 14/10 · Diretoria · **Configurações** (`src/components/config/Configuracoes.tsx`): menu do gerente troca Integrações+Régua por "Configurações" (`/manager/config`, `?secao=avisos|equipe|whatsapp|facebook`); no /super a aba "regua" virou "config" (diretor e super). Seções: Avisos e cobranças (ReguaEquipe), Equipe (EquipeLista+CadastrarCorretor+VincularNomes), Meu WhatsApp (QR via get-whatsapp-qr), Facebook e leads (IntegracaoFacebook). `/integracoes` continua (fluxo do revisor da Meta); `/manager/regua` redireciona.
- 14/10 · Diretoria · Conserto no /super (efeito do commit 15779c2 de 13/10): PastasSuper passou a exigir `supers` e LeadsAnunciosSuper `superNome`, mas o Superintendente.tsx não mandava → as duas abas quebravam ao abrir. Agora passa `supers` (useDiretoria, só quando a aba Pastas abre) e `superNome`.
- 14/10 · Diretoria · Disparar (/manager/whatsapp): scorecard somava `c.responderam` (campo inexistente → NaN); trocado por `c.respostas`.
- 14/10 · Diretoria · **Anúncios do gerente** (`/manager/anuncios` → `src/components/anuncios/AnunciosGerente.tsx`; a antiga `pages/manager-v10/Anuncios.tsx` ficou sem rota): layout novo, lê `fb_saude` (dono_id) — cartões gasto/CPL×casa/Facebook×Comandra/responderam, abas Alertas do tráfego, Campanhas (conjuntos/anúncios, cara/campeã), Entrega, Pixel. **Régua `alerta_trafego`**: alertas do fb_saude → gestor de tráfego (`system_settings.gestor_trafego_{dono}`), escada 0h gestor · 24h gerente · 48h super; `regua_alertas_vistos` guarda quando cada alerta apareceu; `cobrancas.chaves` (conta|tipo) evita repetir; `regua_regras.opcoes.tipos` = quais alertas mandam. Cadastro do gestor em Configurar → Facebook e leads.
- 14/10 · Diretoria · Anúncios: aba Campanhas com seletor Hoje/Ontem/7 dias/30 dias/Escolher datas (lê ao vivo a edge `fb-conta-gerente`, que ganhou `campanha_id` → conjuntos e anúncios no período, conversas, e trava de acesso: só dono, quem está acima ou diretor/admin; backup `/root/fb-conta-gerente.antes-1014.ts`). Aba "Comparar gerentes" via RPC `anuncios_comparativo()` (security definer, só números de fb_saude de todas as contas). Cartão de custo por lead mostra a posição entre as contas.
- 14/10 · Diretoria · /super: menu só na lateral (RailV10 usa ABAS_SUPER também para diretor/admin em /super; ganhou Campanhas, Plano, Gastos); a fileira de abas no alto saiu. Painel geral novo `src/components/superintendente/PainelGeralSuper.tsx` (período, faixa de alerta, cartões, meta, abas Suas equipes / Resultado por fonte) no lugar do consolidado antigo. Diretor clicando "Painel Geral" vai para /diretor.
- 14/10 · Diretoria · **Painel do super reorganizado** (`src/components/super2/*`): menu = Painel geral · Sala de Guerra (abas Plano/Verba/Gastos; Verba = verba da diretoria + quais gerentes aportam, linha "Aporte Tropa" em gastos; projeção pelo custo por venda real, sem "IA") · Pastas (PastasPainel da diretoria com `modoSuper`, pastas ligadas pelo CORRETOR do Comandra — no Junix a árvore é outra, ver `super2/escopo.ts`) · Leads & Mídia (período, equipe × canal, campanhas de todas as contas ao vivo, pontos de melhoria) · Minha Tropa (TimeTab do gerente com seletor de equipe) · B.I. · Configurar. Abas Campanhas/Plano/Gastos soltas saíram. SalaDeGuerraSuper/PastasSuper/LeadsAnunciosSuper/TimeSuper ficaram sem uso. "Revisor Meta" movido para baixo do diretor.
- 14/10 · Diretoria · Super: seletor de período único `super2/Periodo.tsx` (Hoje/Ontem/7/30/datas na URL ?per=); Leads e Mídia viraram abas separadas (`super2/Leads.tsx`, `super2/Midia.tsx` com contas agrupadas e Assistente de IA = edge `estrategia-ia` modo novo "midia"; Junior pediu IA aqui, exceção à regra "IA só na Estratégia"); Pastas filtra por data de cadastro + lista com filtro por situação/gerente; Minha Tropa abre no Geral (equipes lado a lado + ranking de corretores).
- 14/10 · Diretoria · **Contas de anúncio** (fonte única = `fb_bm_tokens`, índice único em account_id; trigger `trg_fb_contas_soltar_dono` tira o dono de quem é desligado). Edge `fb-contas` (listar / atribuir / ativa; só ADMIN/DIRECTOR editam; descobre contas que os tokens enxergam). Tela `src/components/config/ContasAnuncio.tsx` em Configurar → Facebook e leads (diretor agora vê essa seção).
- 14/10 · Diretoria · **Fontes de dados** (Configurar, só diretor): tabela `fontes_dados` + segredos no cofre (`supabase_vault`, funções `fontes_gravar_segredo` / `fontes_config`, só servidor), edge `fontes-dados` (listar/salvar/testar C2S, Junix, Salesforce). Robôs c2s.py, plantao.py, junix.py, salesforce/sync*.py leem por `/root/econ/fontes.py` (tela primeiro, .env por baixo; backups *.antes-fontes). Econ marcado como "funcionando pelo arquivo do servidor".
- 14/10 · Diretoria · **Nada fixo do Econ no código**: `system_settings.empresa` (nome, nome_comercial, diretoria_c2s, c2s_empresas, junix_url, apelidos_gerente, apelidos_super, notas_ia) lido por `src/lib/empresa.ts` (carregado em main.tsx antes do app), edge wa-webhook, robôs (via `fontes.empresa()`) e SQL (`empresa_cfg`, `apelido_gerente` em superintendente_rollup/preview_desligar; backups /root/*.antes-empresa.sql). Mock de produtos da Cury na SalaDeGuerraCampanha removido. Robôs da Cury e do Salesforce tirados do crontab (já falhavam; backup /root/crontab.antes-cury-*).
- 14/10 · Diretoria · Configurar → **Dados da empresa** (só diretor): edita `system_settings.empresa` pela RPC `salvar_empresa` (nome, nome comercial, diretoria no C2S, apelidos de gerente/super, notas para a IA).
- 14/10 · Diretoria · Tela do diretor ganhou a aba "Configurar" (mesma tela Configuracoes, nível diretor).
- 14/10 · Diretoria · Configurar → Equipe: diretor cadastra superintendente, gerente e corretor; super cadastra gerente e corretor (`src/components/config/CadastrarLider.tsx`, edge create-user já permitia).
