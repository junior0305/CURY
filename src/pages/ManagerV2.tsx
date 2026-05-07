// ManagerV2 — Cockpit do Super Gestor.
// Layout: TopNav + Wall of Fame + Termômetro + Hoje você precisa
//         + Smart Action Cards | Equipe + Saúde + CoachChat drawer + Campaigns

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { LeadMonitorDrawer } from "@/components/manager/LeadMonitorDrawer";

import MetaThermometer from "@/components/manager-v2/MetaThermometer";
import WhatYouNeedToDo from "@/components/manager-v2/WhatYouNeedToDo";
import SmartActionCards from "@/components/manager-v2/SmartActionCards";
import TeamRankingPanel from "@/components/manager-v2/TeamRankingPanel";
import CampaignsActivity from "@/components/manager-v2/CampaignsActivity";
import TopNav from "@/components/manager-v2/TopNav";
import StatusBanner from "@/components/manager-v2/StatusBanner";
import OperationHealth from "@/components/manager-v2/OperationHealth";
import OperacoesSheet from "@/components/manager-v2/OperacoesSheet";
import CoachChat, {
  CoachChatButton, getCoachTodayCount,
} from "@/components/manager-v2/CoachChat";
import CoachTipPopup from "@/components/manager-v2/CoachTipPopup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";

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
            "id, name, phone, status, broker_id, manager_id, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, no_redistribute, negotiating_since, tag, welcome_template_id, welcome_responded_at, followup_started_at, ai_qualification_attempts, ai_qualified_at, lost_reason"
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
  const { mode } = useTheme();
  const isDark = mode === "dark";

  const queryClient = useQueryClient();
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachCount, setCoachCount] = useState(getCoachTodayCount());
  const [coachQuestion, setCoachQuestion] = useState<string | null>(null);
  const [monitorLead, setMonitorLead] = useState<any>(null);
  const [opsOpen, setOpsOpen] = useState(false);

  // Throttle de cobrança: protege chip do manager de virar "robô" + evita spam ao mesmo corretor
  const chargeRef = useRef<{ globalAt: number; perBroker: Map<string, number> }>({
    globalAt: 0,
    perBroker: new Map(),
  });
  const GLOBAL_COOLDOWN_S = 30;   // 30s entre quaisquer 2 cobranças (proteção chip)
  const BROKER_COOLDOWN_S = 120;  // 2min entre cobranças do MESMO corretor

  function askCoach(question: string) {
    setCoachQuestion(question);
    setCoachOpen(true);
  }

  // ─── Handlers das ações dos cards ────────────────────────────────────
  function openMonitor(rawLead: any) {
    // Converte snake_case (supabase) → camelCase (formato esperado pelo drawer v1)
    setMonitorLead({
      id: rawLead.id,
      name: rawLead.name,
      phone: rawLead.phone,
      status: rawLead.status,
      brokerId: rawLead.broker_id,
      managerId: rawLead.manager_id,
      createdAt: rawLead.created_at,
      lastInteractionAt: rawLead.last_interaction_at,
      lastLeadResponseAt: rawLead.last_lead_response_at,
      lastBrokerWhatsappAt: rawLead.last_broker_whatsapp_at,
      contactAttempts: rawLead.contact_attempts,
      noRedistribute: rawLead.no_redistribute,
      tag: rawLead.tag,
    });
  }

  async function chargeBroker(rawLead: any, customMessage?: string) {
    const broker = (data?.brokers || []).find((b: any) => b.id === rawLead.broker_id);
    if (!broker) { toast.error("Lead sem corretor"); return; }

    // ── Throttle ──────────────────────────────────────────────────────────
    const now = Date.now();
    const globalGap = (now - chargeRef.current.globalAt) / 1000;
    if (globalGap < GLOBAL_COOLDOWN_S) {
      const wait = Math.ceil(GLOBAL_COOLDOWN_S - globalGap);
      toast.warning(`⏳ Aguarde ${wait}s antes da próxima cobrança (proteção do seu chip)`);
      return;
    }
    const lastForBroker = chargeRef.current.perBroker.get(broker.id) || 0;
    const brokerGap = (now - lastForBroker) / 1000;
    if (brokerGap < BROKER_COOLDOWN_S) {
      const wait = Math.ceil(BROKER_COOLDOWN_S - brokerGap);
      toast.warning(`⏳ ${broker.first_name} foi cobrado há pouco. Espere ${wait}s.`);
      return;
    }

    const leadName = rawLead.name || rawLead.phone || "Lead";

    // 1. Insere notificação in-app
    await supabase.from("internal_notifications").insert({
      to_id: broker.id,
      from_id: userId,
      type: "MANAGER_NUDGE",
      message: customMessage || `🚨 Atenção em ${leadName} — abra agora.`,
    });

    // 2. WhatsApp via chip do manager (se disponível)
    if (data?.manager?.bot_instance_id && broker.phone) {
      try {
        await supabase.functions.invoke("send_whatsapp_message", {
          body: {
            botId: data.manager.bot_instance_id,
            phone: broker.phone,
            message: customMessage ||
              `🚨 *Cobrança do gerente*\n\nO lead *${leadName}* (${rawLead.phone}) precisa de você AGORA. Atende, por favor.`,
          },
        });
      } catch { /* notif in-app já garante o aviso */ }
    }

    // Atualiza timestamps após sucesso
    chargeRef.current.globalAt = Date.now();
    chargeRef.current.perBroker.set(broker.id, Date.now());

    toast.success(`✅ ${broker.first_name} foi cobrado`);
  }

  async function chargeAllOfBroker(brokerId: string) {
    const broker = (data?.brokers || []).find((b: any) => b.id === brokerId);
    if (!broker) return;
    const leads = (data?.leads || []).filter((l: any) => {
      if (l.broker_id !== brokerId) return false;
      if (!l.last_lead_response_at) return false;
      const respH = (Date.now() - new Date(l.last_lead_response_at).getTime()) / 3600000;
      const brokerH = l.last_broker_whatsapp_at
        ? (Date.now() - new Date(l.last_broker_whatsapp_at).getTime()) / 3600000 : Infinity;
      return respH > 2 && respH < 48 && brokerH > respH;
    });
    if (leads.length === 0) {
      toast.warning(`${broker.first_name} não tem leads quentes parados agora`);
      return;
    }
    await chargeBroker(leads[0],
      `🚨 *${broker.first_name}*, você tem *${leads.length} lead${leads.length > 1 ? "s" : ""} quente${leads.length > 1 ? "s" : ""}* esperando resposta há mais de 2h. Atende AGORA — esses convertem 3x mais quando rápido.`
    );
  }

  async function restoreLead(leadId: string) {
    const { error } = await supabase
      .from("leads")
      .update({
        status: "NEW",
        broker_id: null,
        last_interaction_at: new Date().toISOString(),
      })
      .eq("id", leadId);
    if (error) { toast.error(error.message); return; }
    toast.success("✅ Lead restaurado pra fila");
    queryClient.invalidateQueries({ queryKey: ["v2-team-data"] });
  }

  async function redistributeLead(leadId: string, newBrokerId: string) {
    const newBroker = (data?.brokers || []).find((b: any) => b.id === newBrokerId);
    if (!newBroker) { toast.error("Corretor inválido"); return; }
    const { error } = await supabase
      .from("leads")
      .update({
        broker_id: newBrokerId,
        manager_id: newBroker.manager_id || userId,
        status: "REACTIVATED",
        last_interaction_at: new Date().toISOString(),
      })
      .eq("id", leadId);
    if (error) { toast.error(error.message); return; }
    // Notifica novo corretor
    await supabase.from("internal_notifications").insert({
      to_id: newBrokerId,
      from_id: userId,
      type: "NEW_LEAD",
      message: `🎯 Novo lead atribuído a você pelo gerente. Abra no painel.`,
    });
    toast.success(`✅ Lead movido pra ${newBroker.first_name}`);
    queryClient.invalidateQueries({ queryKey: ["v2-team-data"] });
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
        className="crm-themed min-h-screen flex items-center justify-center"
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          background: "var(--crm-bg)",
          color: "var(--crm-text-muted)",
        }}
      >
        <div className="text-sm flex items-center gap-2">
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
      className="crm-themed min-h-screen text-slate-100 antialiased relative"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--crm-text)",
        background: isDark
          ? `radial-gradient(ellipse 90% 60% at 50% -10%, rgba(56,189,248,0.10), transparent 70%),
             radial-gradient(ellipse 60% 45% at 0% 100%, rgba(14,116,144,0.08), transparent 65%),
             radial-gradient(ellipse 60% 45% at 100% 80%, rgba(59,130,246,0.06), transparent 65%),
             linear-gradient(180deg, #020617 0%, #0F172A 50%, #0B1220 100%)`
          : `radial-gradient(ellipse 90% 60% at 50% -10%, rgba(56,189,248,0.10), transparent 70%),
             radial-gradient(ellipse 60% 45% at 0% 100%, rgba(14,116,144,0.05), transparent 65%),
             linear-gradient(180deg, #EEF2F7 0%, #F8FAFC 50%, #EEF2F7 100%)`,
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "var(--crm-surface)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
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
            <button
              onClick={() => setOpsOpen(true)}
              title="Buscar lead ou adicionar lead manual"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:inline">Buscar</span>
              <span className="w-px h-3 bg-cyan-500/30 hidden sm:block" />
              <UserPlus className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:inline">Lead</span>
            </button>
            <ThemeToggle compact />
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
          onShowUnassigned={() => {
            toast.info("💡 Os leads sem corretor aparecem no card 'Sem corretor' na 'Ação no time' abaixo. Click pra atribuir.");
          }}
          onOpenLead={openMonitor}
          onChargeLead={(lead) => chargeBroker(lead)}
          onRedistributeLead={redistributeLead}
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
            onMonitor={openMonitor}
            onCharge={(l) => chargeBroker(l)}
            onRedist={redistributeLead}
            onRestore={restoreLead}
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

      {/* ─── Operações: buscar / novo lead / descartados ───────────────── */}
      {userId && (
        <OperacoesSheet
          open={opsOpen}
          onClose={() => setOpsOpen(false)}
          managerId={userId}
          managerName={firstName}
          brokers={brokers as any[]}
          onSelectLead={(l: any) => openMonitor(l)}
        />
      )}

      {/* ─── Lead Monitor Drawer (👁️ ação) ─────────────────────────────── */}
      <AnimatePresence>
        {monitorLead && (
          <LeadMonitorDrawer
            lead={monitorLead}
            broker={
              monitorLead.brokerId
                ? (() => {
                    const b = (brokers as any[]).find((b: any) => b.id === monitorLead.brokerId);
                    if (!b) return null;
                    return {
                      id: b.id,
                      name: `${b.first_name || ""} ${b.last_name || ""}`.trim() || "—",
                      phone: b.phone,
                      botInstanceId: b.bot_instance_id,
                    } as any;
                  })()
                : null
            }
            onClose={() => setMonitorLead(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
