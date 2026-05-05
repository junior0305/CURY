// ManagerV2 — Cockpit do Super Gestor.
// Layout: TopNav + Wall of Fame + Termômetro + Hoje você precisa
//         + Smart Action Cards | Equipe + Saúde + CoachChat drawer + Campaigns

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";

import MetaThermometer from "@/components/manager-v2/MetaThermometer";
import WhatYouNeedToDo from "@/components/manager-v2/WhatYouNeedToDo";
import SmartActionCards from "@/components/manager-v2/SmartActionCards";
import TeamRankingPanel from "@/components/manager-v2/TeamRankingPanel";
import CampaignsActivity from "@/components/manager-v2/CampaignsActivity";
import TopNav from "@/components/manager-v2/TopNav";
import StatusBanner from "@/components/manager-v2/StatusBanner";
import OperationHealth from "@/components/manager-v2/OperationHealth";
import CoachChat, {
  CoachChatButton, getCoachTodayCount,
} from "@/components/manager-v2/CoachChat";
import CoachTipPopup from "@/components/manager-v2/CoachTipPopup";

// ─── Hook: dados base do time ────────────────────────────────────────────────
function useTeamData(managerId: string | undefined) {
  return useQuery({
    queryKey: ["v2-team-data", managerId],
    enabled: !!managerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: managerProfile }, { data: brokers }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, bot_instance_id, team_id")
          .eq("id", managerId!)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, phone, bot_instance_id, lead_assignment_enabled")
          .eq("manager_id", managerId!)
          .eq("role", "BROKER"),
      ]);

      const brokerIds = (brokers || []).map((b: any) => b.id);
      let leads: any[] = [];
      if (brokerIds.length > 0) {
        const { data } = await supabase
          .from("leads")
          .select(
            "id, name, phone, status, broker_id, manager_id, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, no_redistribute, negotiating_since, tag"
          )
          .in("broker_id", brokerIds)
          .order("created_at", { ascending: false })
          .limit(500);
        leads = data || [];
      }

      const sinCorretor = await supabase
        .from("leads")
        .select(
          "id, name, phone, status, broker_id, manager_id, created_at, last_interaction_at, tag"
        )
        .is("broker_id", null)
        .eq("manager_id", managerId!)
        .order("created_at", { ascending: false })
        .limit(50);

      // Goal mensal + vendas mensais (usado pelo OperationHealth)
      let monthlyGoal: number | null = null;
      let monthlySales = 0;
      if (managerProfile?.team_id) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString().slice(0, 10);
        const { data: goalRows } = await supabase
          .from("team_goals")
          .select("sales_target")
          .eq("team_id", managerProfile.team_id)
          .eq("goal_type", "monthly")
          .gte("month", monthStart)
          .order("created_at", { ascending: false })
          .limit(1);
        monthlyGoal = (goalRows as any)?.[0]?.sales_target ?? null;
      }
      if (brokerIds.length > 0) {
        const monthStart = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        ).toISOString();
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("broker_id", brokerIds)
          .eq("status", "CONCLUDED")
          .gte("last_interaction_at", monthStart);
        monthlySales = count || 0;
      }

      return {
        manager: managerProfile,
        brokers: brokers || [],
        leads,
        unassigned: sinCorretor.data || [],
        monthlyGoal,
        monthlySales,
      };
    },
  });
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function ManagerV2() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data, isLoading } = useTeamData(userId);

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachCount, setCoachCount] = useState(getCoachTodayCount());
  const [coachQuestion, setCoachQuestion] = useState<string | null>(null);

  function askCoach(question: string) {
    setCoachQuestion(question);
    setCoachOpen(true);
  }

  // Quando fecha o drawer, re-checa o counter (incrementou enquanto aberto)
  useEffect(() => {
    if (!coachOpen) setCoachCount(getCoachTodayCount());
  }, [coachOpen]);

  // Inter font
  useEffect(() => {
    if (document.querySelector('link[data-v2-inter]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    link.setAttribute("data-v2-inter", "true");
    document.head.appendChild(link);
  }, []);

  if (!userId || isLoading || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          background: "radial-gradient(ellipse at center, #0F172A, #020617)",
        }}
      >
        <div className="text-slate-400 text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 animate-pulse" />
          carregando seu painel…
        </div>
      </div>
    );
  }

  const { manager, brokers, leads, unassigned, monthlyGoal, monthlySales } = data;
  const firstName = manager?.first_name || "Gestor";

  return (
    <div
      className="min-h-screen text-slate-100 antialiased relative"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        background: `
          radial-gradient(ellipse 90% 60% at 50% -10%, rgba(56,189,248,0.10), transparent 70%),
          radial-gradient(ellipse 60% 45% at 0% 100%, rgba(14,116,144,0.08), transparent 65%),
          radial-gradient(ellipse 60% 45% at 100% 80%, rgba(59,130,246,0.06), transparent 65%),
          linear-gradient(180deg, #020617 0%, #0F172A 50%, #0B1220 100%)
        `,
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/manager-v1"
              className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center gap-1"
              title="Versão antiga (backup)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">v1 (backup)</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                Olá, <span className="text-cyan-300">{firstName}</span>
                <span className="text-slate-500 font-medium ml-2 text-sm">Painel v2</span>
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">
                {brokers.length} corretores · {leads.length} leads ativos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CoachChatButton onClick={() => setCoachOpen(true)} count={coachCount} />
            <span className="text-[11px] uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-1 font-bold hidden sm:inline">
              BETA
            </span>
          </div>
        </div>
      </header>

      {/* ─── Top Nav ─────────────────────────────────────────────────────── */}
      <TopNav />

      {/* ─── Status Banner (mensagem curta, link Liga) ──────────────────── */}
      <section className="px-4 sm:px-6 pt-4">
        <StatusBanner managerId={userId} managerName={firstName} />
      </section>

      {/* ─── Termômetro de Meta — pulse + glow quando crítico ───────────── */}
      <section className="px-4 sm:px-6 mt-3">
        <MetaThermometer managerId={userId} teamId={manager?.team_id} />
      </section>

      {/* ─── "Hoje você precisa…" ─ personalizado ──────────────────────── */}
      <section className="px-4 sm:px-6 mt-4">
        <WhatYouNeedToDo
          leads={leads}
          brokers={brokers}
          unassigned={unassigned}
          managerName={firstName}
        />
      </section>

      {/* ─── Grid principal: Ação + Equipe/Saúde ────────────────────────── */}
      <main className="px-4 sm:px-6 mt-4 pb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <SmartActionCards
            leads={leads}
            brokers={brokers}
            unassigned={unassigned}
            managerId={userId}
          />
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="space-y-4"
        >
          <TeamRankingPanel brokers={brokers} leads={leads} />
          <OperationHealth
            managerId={userId}
            brokers={brokers}
            leads={leads}
            goalMonth={monthlyGoal}
            vendasMonth={monthlySales}
          />
        </motion.aside>
      </main>

      {/* ─── Footer: Atividade (campanhas) ──────────────────────────────── */}
      <footer className="px-4 sm:px-6 pb-8">
        <CampaignsActivity managerId={userId} brokers={brokers} />
      </footer>

      {/* ─── Coach Chat Drawer ─────────────────────────────────────────── */}
      <CoachChat
        open={coachOpen}
        onClose={() => { setCoachOpen(false); setCoachQuestion(null); }}
        managerName={firstName}
        initialQuestion={coachQuestion}
      />

      {/* ─── Pop-up dica do Coach (aparece 2.5s após carregar) ──────────── */}
      <CoachTipPopup
        managerName={firstName}
        monthlySales={monthlySales}
        monthlyGoal={monthlyGoal}
        daysLeftMonth={Math.max(1, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate())}
        daysInMonth={new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}
        onAsk={askCoach}
      />
    </div>
  );
}
