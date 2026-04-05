import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchTeamBrokers, toggleBrokerPresence } from "@/integrations/supabase/profiles";
import { fetchTeamLeads, fetchUnassignedLeads, updateLeadBroker } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import { toast } from "sonner";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import {
  LogOut, Users, Trophy, AlertTriangle, Zap,
  CheckCircle2, Clock, UserCheck, UserX, GitMerge,
  RefreshCw, TrendingUp, Target, Shield,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function brokerSemaphore(broker: User, leads: Lead[]): "green" | "yellow" | "red" | "off" {
  if (!broker.leadAssignmentEnabled) return "off";
  const bl = leads.filter(l => l.brokerId === broker.id);
  const lastContact = bl
    .map(l => l.lastBrokerWhatsappAt)
    .filter(Boolean)
    .map(d => new Date(d!).getTime())
    .sort((a, b) => b - a)[0];
  if (!lastContact) return "red";
  const h = (Date.now() - lastContact) / 3600000;
  if (h < 1) return "green";
  if (h < 4) return "yellow";
  return "red";
}

const SEMAPHORE_COLORS = {
  green:  { neon: "#10B981", label: "Ativo",    bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)" },
  yellow: { neon: "#F59E0B", label: "Regular",  bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)" },
  red:    { neon: "#EF4444", label: "Inativo",  bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.3)" },
  off:    { neon: "#334155", label: "Ausente",  bg: "rgba(15,23,42,0.4)",   border: "rgba(51,65,85,0.3)" },
};

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimNum({ value }: { value: number }) {
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    let step = 0; const steps = 18;
    const diff = value - disp;
    if (diff === 0) return;
    const t = setInterval(() => {
      step++;
      setDisp(Math.round(disp + diff * (step / steps)));
      if (step >= steps) { clearInterval(t); setDisp(value); }
    }, 18);
    return () => clearInterval(t);
  }, [value]);
  return <>{disp}</>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, neon, pulse, delay = 0 }: {
  label: string; value: number | string; icon: React.ElementType;
  neon: string; pulse?: boolean; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="relative rounded-2xl p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{
        background: `${neon}08`,
        border: `1px solid ${neon}30`,
        boxShadow: `0 0 16px ${neon}0A`,
      }}
    >
      <div className="absolute top-0 left-4 right-4 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${neon}60,transparent)` }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>{label}</span>
        <Icon className={cn("w-3.5 h-3.5", pulse && "animate-pulse")} style={{ color: neon }} />
      </div>
      <p className="text-2xl font-black leading-none" style={{ color: neon, textShadow: `0 0 16px ${neon}50` }}>
        {typeof value === "number" ? <AnimNum value={value} /> : value}
      </p>
    </motion.div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, color = "#00D4FF", count }: {
  label: string; icon: React.ElementType; color?: string; count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
      {count !== undefined && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{
          background: `${color}18`, color, border: `1px solid ${color}30`
        }}>{count}</span>
      )}
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }} />
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-2xl p-4", className)}
      style={{ background: "rgba(8,11,20,0.7)", border: "1px solid #1E293B" }}
    >
      {children}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type PanelTab = "alertas" | "presenca" | "fila" | "ranking";

export default function ManagerDashboard() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [xpData, setXpData] = useState<Record<string, { xp: number; level: number; levelName: string }>>({});
  const [rightTab, setRightTab] = useState<PanelTab>("alertas");

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: brokers = [], isLoading: loadingBrokers } = useQuery<User[]>({
    queryKey: ["teamBrokers", user?.id],
    queryFn: () => fetchTeamBrokers(user!.id),
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  const brokerIds = useMemo(() => brokers.map(b => b.id), [brokers]);

  const { data: teamLeads = [], isLoading: loadingLeads } = useQuery<Lead[]>({
    queryKey: ["teamLeads", brokerIds],
    queryFn: () => fetchTeamLeads(brokerIds),
    enabled: brokerIds.length > 0,
    refetchInterval: 30000,
  });

  const { data: unassigned = [] } = useQuery<Lead[]>({
    queryKey: ["unassignedLeads"],
    queryFn: fetchUnassignedLeads,
    refetchInterval: 30000,
  });

  // XP
  useEffect(() => {
    if (!brokerIds.length) return;
    supabase.from("broker_xp").select("broker_id, total_xp, level, level_name")
      .in("broker_id", brokerIds)
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach(d => { map[d.broker_id] = { xp: d.total_xp, level: d.level, levelName: d.level_name }; });
        setXpData(map);
      });
  }, [brokerIds]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("manager-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
        queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
        setLastUpdated(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: ({ leadId, brokerId }: { leadId: string; brokerId: string }) =>
      updateLeadBroker(leadId, brokerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      toast.success("Lead atribuído!");
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const [presencePending, setPresencePending] = useState<string | null>(null);
  const presenceMutation = useMutation({
    mutationFn: ({ id, present }: { id: string; present: boolean }) =>
      toggleBrokerPresence(id, present),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teamBrokers"] }),
    onError: (err: any) => toast.error("Erro: " + err.message),
    onSettled: () => setPresencePending(null),
  });

  // ── Computed metrics ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const activeLeads = teamLeads.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status));
    const stalled = activeLeads.filter(l => hoursAgo(l.lastInteractionAt || l.createdAt) > 24);
    const weekAgo = Date.now() - 7 * 86400000;
    const sales7d = teamLeads.filter(l =>
      l.status === "CONCLUDED" && new Date(l.lastInteractionAt).getTime() > weekAgo
    ).length;
    const newToday = teamLeads.filter(l => new Date(l.createdAt).toDateString() === today).length;
    const present = brokers.filter(b => b.leadAssignmentEnabled).length;
    return {
      present, total: brokers.length, active: activeLeads.length,
      stalled: stalled.length, sales7d, newToday, unassigned: unassigned.length,
    };
  }, [brokers, teamLeads, unassigned]);

  const stalledLeads = useMemo(() =>
    teamLeads
      .filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status) && hoursAgo(l.lastInteractionAt || l.createdAt) > 24)
      .sort((a, b) => hoursAgo(b.lastInteractionAt || b.createdAt) - hoursAgo(a.lastInteractionAt || a.createdAt))
      .slice(0, 25),
    [teamLeads]
  );

  const brokerMap = useMemo(() => Object.fromEntries(brokers.map(b => [b.id, b])), [brokers]);

  const rankingRows = useMemo(() =>
    brokers.map(broker => {
      const bl = teamLeads.filter(l => l.brokerId === broker.id);
      const concluded = bl.filter(l => l.status === "CONCLUDED").length;
      const active = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
      const xp = xpData[broker.id] || { xp: 0, level: 1, levelName: "Recruta" };
      const sem = brokerSemaphore(broker, teamLeads);
      return { broker, concluded, active, xp, sem };
    }).sort((a, b) => b.concluded - a.concluded),
    [brokers, teamLeads, xpData]
  );

  if (loadingBrokers) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080B14" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00D4FF" }} />
      </div>
    );
  }

  const presentBrokers = brokers.filter(b => b.leadAssignmentEnabled);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: "#080B14",
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.015) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
        color: "#E2E8F0",
      }}
    >

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 h-12 z-10"
        style={{ borderBottom: "1px solid rgba(0,212,255,0.1)", background: "rgba(8,11,20,0.8)" }}
      >
        {/* Left */}
        <div className="flex items-center gap-3">
          <img src="/comandra-logo.png" alt="Comandra" className="h-7 w-7 object-contain"
            style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.7))" }} />
          <div>
            <p className="font-black text-xs uppercase tracking-[0.2em]"
              style={{ color: "#fff", textShadow: "0 0 12px rgba(0,212,255,0.4)" }}>
              Centro de Comando
            </p>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: "#334155" }}>
              {brokers.length} corretores · atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Semáforo rápido da equipe */}
        <div className="hidden sm:flex items-center gap-1.5">
          {brokers.map(b => {
            const sem = brokerSemaphore(b, teamLeads);
            const c = SEMAPHORE_COLORS[sem];
            return (
              <div key={b.id} title={`${b.name} — ${c.label}`}
                className="w-2 h-2 rounded-full"
                style={{ background: c.neon, boxShadow: sem !== "off" ? `0 0 5px ${c.neon}` : "none" }}
              />
            );
          })}
        </div>

        {/* Right */}
        <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
          style={{ color: "#334155" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
          onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
        >
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </header>

      {/* ── WHATSAPP BANNER ───────────────────────────────────────────────── */}
      <WhatsAppQRBanner />

      {/* ── KPI BAR ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 pt-3 pb-0">
        <KpiCard delay={0.00} label="Presentes"    value={`${stats.present}/${stats.total}`} icon={UserCheck} neon={stats.present < stats.total ? "#F59E0B" : "#10B981"} />
        <KpiCard delay={0.05} label="Novos hoje"   value={stats.newToday}  icon={Zap}           neon="#00D4FF" />
        <KpiCard delay={0.10} label="Ativos"       value={stats.active}    icon={Target}        neon="#818CF8" />
        <KpiCard delay={0.15} label="Parados +24h" value={stats.stalled}   icon={AlertTriangle} neon={stats.stalled > 0 ? "#EF4444" : "#10B981"} pulse={stats.stalled > 0} />
        <KpiCard delay={0.20} label="Sem corretor" value={stats.unassigned} icon={UserX}         neon={stats.unassigned > 0 ? "#EF4444" : "#10B981"} pulse={stats.unassigned > 0} />
        <KpiCard delay={0.25} label="Vendas 7d"    value={stats.sales7d}   icon={Trophy}        neon="#F59E0B" />
      </div>

      {/* ── MAIN SPLIT ────────────────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden gap-3 p-3 min-h-0">

        {/* ── ESQUERDA: Leads que precisam de ação ────────────────────────── */}
        <div className="flex flex-col gap-3 flex-[55] min-h-0 overflow-hidden">

          {/* Sem corretor */}
          {unassigned.length > 0 && (
            <Panel>
              <SectionHeader label="Sem Corretor" icon={UserX} color="#EF4444" count={unassigned.length} />
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                {unassigned.slice(0, 10).map((lead, i) => (
                  <motion.div key={lead.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                      <p className="text-[10px]" style={{ color: "#475569" }}>
                        {Math.floor(hoursAgo(lead.createdAt))}h · {lead.tag || "sem tag"}
                      </p>
                    </div>
                    <Select onValueChange={brokerId => assignMutation.mutate({ leadId: lead.id, brokerId })}>
                      <SelectTrigger className="w-32 h-7 text-xs rounded-lg" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(8,11,20,0.8)", color: "#94A3B8" }}>
                        <SelectValue placeholder="Atribuir..." />
                      </SelectTrigger>
                      <SelectContent>
                        {presentBrokers.map(b => (
                          <SelectItem key={b.id} value={b.id} className="text-xs">{b.name.split(" ")[0]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </motion.div>
                ))}
              </div>
            </Panel>
          )}

          {/* Parados +24h */}
          <Panel className="flex-1 min-h-0 flex flex-col">
            <SectionHeader label="Parados +24h" icon={AlertTriangle} color="#F59E0B" count={stalledLeads.length} />
            {stalledLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: "#334155" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "#10B981" }} />
                <p className="text-sm font-bold" style={{ color: "#10B981" }}>Equipe em dia!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                {stalledLeads.map((lead, i) => {
                  const h = Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt));
                  const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                  const urgent = h > 48;
                  return (
                    <motion.div key={lead.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{
                        background: urgent ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.05)",
                        border: `1px solid ${urgent ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)"}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-black" style={{ color: urgent ? "#F87171" : "#FCD34D" }}>
                            {h}h parado
                          </span>
                          <span style={{ color: "#334155" }}>·</span>
                          <span className="text-xs truncate" style={{ color: "#475569" }}>
                            {broker?.name.split(" ")[0] || "—"}
                          </span>
                          {lead.tag && (
                            <>
                              <span style={{ color: "#334155" }}>·</span>
                              <span className="text-[10px] truncate" style={{ color: "#334155" }}>{lead.tag}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Select
                        defaultValue={lead.brokerId || ""}
                        onValueChange={brokerId => assignMutation.mutate({ leadId: lead.id, brokerId })}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs rounded-lg shrink-0"
                          style={{ borderColor: urgent ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)", background: "rgba(8,11,20,0.8)", color: "#94A3B8" }}>
                          <SelectValue placeholder="Redistribuir..." />
                        </SelectTrigger>
                        <SelectContent>
                          {presentBrokers.map(b => (
                            <SelectItem key={b.id} value={b.id} className="text-xs">{b.name.split(" ")[0]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* ── DIREITA: Controle da equipe ──────────────────────────────────── */}
        <div className="flex flex-col gap-3 flex-[45] min-h-0 overflow-hidden">

          {/* Tab selector */}
          <div className="flex gap-1.5 shrink-0">
            {([
              { v: "alertas",  label: "Semáforo",  icon: Shield },
              { v: "ranking",  label: "Ranking",   icon: Trophy },
              { v: "presenca", label: "Presença",  icon: UserCheck },
              { v: "fila",     label: "Fila",      icon: GitMerge },
            ] as { v: PanelTab; label: string; icon: React.ElementType }[]).map(tab => (
              <button key={tab.v} onClick={() => setRightTab(tab.v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-1 justify-center"
                style={rightTab === tab.v ? {
                  background: "linear-gradient(135deg, #0044cc, #0066ff)",
                  color: "#fff",
                  border: "1px solid rgba(0,212,255,0.4)",
                  boxShadow: "0 0 12px rgba(0,170,255,0.3)",
                } : {
                  background: "rgba(8,11,20,0.6)",
                  color: "#334155",
                  border: "1px solid #1E293B",
                }}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={rightTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-h-0 overflow-hidden"
            >

              {/* SEMÁFORO */}
              {rightTab === "alertas" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Status da Equipe" icon={Shield} color="#00D4FF" />
                  <div className="space-y-2">
                    {brokers.map((broker, i) => {
                      const sem = brokerSemaphore(broker, teamLeads);
                      const c = SEMAPHORE_COLORS[sem];
                      const bl = teamLeads.filter(l => l.brokerId === broker.id);
                      const activeCount = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
                      const lastTs = bl.map(l => l.lastBrokerWhatsappAt).filter(Boolean)
                        .map(d => new Date(d!).getTime()).sort((a, b) => b - a)[0];
                      const lastH = lastTs ? Math.floor((Date.now() - lastTs) / 3600000) : null;

                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                          style={{ background: c.bg, border: `1px solid ${c.border}` }}
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                            style={{ background: `${c.neon}20`, color: c.neon, border: `1px solid ${c.neon}40` }}>
                            {initials(broker.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                            <p className="text-[10px]" style={{ color: c.neon }}>
                              {c.label} · {activeCount} leads ativos
                              {lastH !== null ? ` · último há ${lastH}h` : ""}
                            </p>
                          </div>
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: c.neon, boxShadow: sem !== "off" ? `0 0 6px ${c.neon}` : "none" }} />
                        </motion.div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #1E293B" }}>
                    {(["green","yellow","red","off"] as const).map(s => (
                      <span key={s} className="flex items-center gap-1 text-[10px]" style={{ color: "#334155" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: SEMAPHORE_COLORS[s].neon }} />
                        {SEMAPHORE_COLORS[s].label}
                      </span>
                    ))}
                  </div>
                </Panel>
              )}

              {/* RANKING */}
              {rightTab === "ranking" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Ranking da Equipe" icon={Trophy} color="#F59E0B" />
                  <div className="space-y-2">
                    {rankingRows.map(({ broker, concluded, active, xp, sem }, i) => {
                      const c = SEMAPHORE_COLORS[sem];
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                      const maxConc = Math.max(...rankingRows.map(r => r.concluded), 1);
                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="rounded-xl px-3 py-2.5"
                          style={{
                            background: i === 0 ? "rgba(245,158,11,0.06)" : "rgba(8,11,20,0.5)",
                            border: `1px solid ${i === 0 ? "rgba(245,158,11,0.2)" : "#1E293B"}`,
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base w-6 text-center shrink-0">
                              {medal || <span className="text-xs font-black" style={{ color: "#334155" }}>{i + 1}</span>}
                            </span>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                              style={{ background: `${c.neon}20`, color: c.neon, border: `1px solid ${c.neon}30` }}>
                              {initials(broker.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-black" style={{ color: concluded > 0 ? "#34D399" : "#334155" }}>{concluded} vendas</span>
                                  <span className="text-[10px]" style={{ color: "#334155" }}>{active} ativos</span>
                                </div>
                              </div>
                              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                                <motion.div
                                  initial={{ width: 0 }} animate={{ width: `${(concluded / maxConc) * 100}%` }}
                                  transition={{ duration: 0.7, delay: i * 0.05 }}
                                  className="h-full rounded-full"
                                  style={{ background: i === 0 ? "linear-gradient(90deg, #F59E0B80, #F59E0B)" : "linear-gradient(90deg, #10B98180, #10B981)" }}
                                />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* PRESENÇA */}
              {rightTab === "presenca" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Presença" icon={UserCheck} color="#10B981" />
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                      <UserCheck className="w-4 h-4" style={{ color: "#10B981" }} />
                      <div>
                        <p className="text-xl font-black" style={{ color: "#34D399" }}>{stats.present}</p>
                        <p className="text-[10px]" style={{ color: "#475569" }}>Presentes</p>
                      </div>
                    </div>
                    <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
                      <UserX className="w-4 h-4" style={{ color: "#334155" }} />
                      <div>
                        <p className="text-xl font-black" style={{ color: "#475569" }}>{stats.total - stats.present}</p>
                        <p className="text-[10px]" style={{ color: "#334155" }}>Ausentes</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {brokers.map((broker, i) => {
                      const isPresent = broker.leadAssignmentEnabled;
                      const isLoading = presencePending === broker.id;
                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                          style={{
                            background: isPresent ? "rgba(16,185,129,0.06)" : "rgba(8,11,20,0.4)",
                            border: `1px solid ${isPresent ? "rgba(16,185,129,0.2)" : "#1E293B"}`,
                            opacity: isPresent ? 1 : 0.6,
                          }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                            style={{ background: isPresent ? "rgba(16,185,129,0.2)" : "rgba(51,65,85,0.5)", color: isPresent ? "#34D399" : "#475569" }}>
                            {initials(broker.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: isPresent ? "#fff" : "#475569" }}>{broker.name.split(" ")[0]}</p>
                            <p className="text-[10px]" style={{ color: "#334155" }}>{isPresent ? "Recebendo leads" : "Fora da fila"}</p>
                          </div>
                          <Switch
                            checked={isPresent}
                            onCheckedChange={() => {
                              setPresencePending(broker.id);
                              presenceMutation.mutate({ id: broker.id, present: !isPresent });
                            }}
                            disabled={isLoading}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* FILA */}
              {rightTab === "fila" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Fila de Distribuição" icon={GitMerge} color="#818CF8" />
                  {presentBrokers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "#334155" }}>
                      <UserX className="w-8 h-8" />
                      <p className="text-sm">Nenhum corretor ativo</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {brokers
                        .filter(b => b.leadAssignmentEnabled)
                        .map((broker, i) => {
                          const activeCount = teamLeads.filter(l =>
                            l.brokerId === broker.id && !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)
                          ).length;
                          const load = activeCount === 0 ? "green" : activeCount < 20 ? "yellow" : "red";
                          const loadNeon = load === "green" ? "#10B981" : load === "yellow" ? "#F59E0B" : "#EF4444";
                          const loadLabel = load === "green" ? "Livre" : load === "yellow" ? "Normal" : "Cheio";
                          return (
                            <motion.div key={broker.id}
                              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                              style={{ background: "rgba(8,11,20,0.5)", border: "1px solid #1E293B" }}
                            >
                              <span className="text-xs font-black w-5 text-center shrink-0" style={{ color: "#334155" }}>{i + 1}</span>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                                style={{ background: "rgba(129,140,248,0.15)", color: "#818CF8" }}>
                                {initials(broker.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                                <p className="text-[10px]" style={{ color: "#475569" }}>{activeCount} leads ativos</p>
                              </div>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: `${loadNeon}18`, color: loadNeon, border: `1px solid ${loadNeon}30` }}>
                                {loadLabel}
                              </span>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}

                  {brokers.filter(b => !b.leadAssignmentEnabled).length > 0 && (
                    <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1E293B" }}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Fora da fila</p>
                      {brokers.filter(b => !b.leadAssignmentEnabled).map(b => (
                        <div key={b.id} className="flex items-center gap-2 py-1.5 opacity-40">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black"
                            style={{ background: "rgba(51,65,85,0.5)", color: "#475569" }}>
                            {initials(b.name)}
                          </div>
                          <p className="text-xs" style={{ color: "#475569" }}>{b.name.split(" ")[0]}</p>
                          <span className="text-[9px] ml-auto" style={{ color: "#334155" }}>ausente</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}

            </motion.div>
          </AnimatePresence>

        </div>
      </main>

      {/* ── FOOTER: mini métricas ──────────────────────────────────────────── */}
      <footer
        className="shrink-0 flex items-center gap-6 px-5 h-10"
        style={{ borderTop: "1px solid rgba(0,212,255,0.08)", background: "rgba(8,11,20,0.6)" }}
      >
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" style={{ color: "#00D4FF" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#00D4FF" }}>
            {stats.sales7d} vendas esta semana
          </span>
        </div>
        <div className="h-3 w-px" style={{ background: "#1E293B" }} />
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" style={{ color: "#475569" }} />
          <span className="text-[10px]" style={{ color: "#334155" }}>
            {stats.stalled} leads precisam de atenção
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" style={{ color: "#334155" }} />
          <span className="text-[10px]" style={{ color: "#334155" }}>
            Auto-refresh 30s
          </span>
        </div>
      </footer>

    </div>
  );
}
