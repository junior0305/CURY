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
