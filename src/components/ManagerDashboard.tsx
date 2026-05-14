import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Shield, LogOut, AlertTriangle, Clock, TrendingUp,
  Users, Target, Zap, Trophy, CheckCircle2,
  ChevronRight, RefreshCw, Flame, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGamification } from "@/hooks/useGamification";
import { Loader2 } from "lucide-react";

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface BrokerCard {
  broker: User;
  leads: Lead[];
  newLeads: number;
  inProgress: number;
  visits: number;       // VISIT_SCHEDULED + VISITA_REALIZADA
  docs: number;         // DOCS_REQUESTED
  negotiating: number;  // NEGOTIATING
  concluded: number;
  abandoned: number;
  stalledLeads: Lead[];      // leads sem interação > 24h
  avgResponseHours: number;
  xp: number;
  level: number;
  levelName: string;
  missionsCompleted: number;
  missionsTotal: number;
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 3600;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

const LEVEL_COLORS: Record<number, string> = {
  1: "text-slate-400", 2: "text-green-400", 3: "text-blue-400",
  4: "text-violet-400", 5: "text-amber-400", 6: "text-orange-400",
  7: "text-red-400", 8: "text-pink-400", 9: "text-yellow-300", 10: "text-yellow-200",
};

const ALERT_THRESHOLDS = {
  STALLED_HOURS: 24,  // lead sem interação
  LOW_CONVERSION: 0.05, // menos de 5% de conclusão
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { user, role, signOut } = useAuth();
  const [xpData, setXpData] = useState<Record<string, { xp: number; level: number; levelName: string }>>({});
  const [missionsData, setMissionsData] = useState<Record<string, { completed: number; total: number }>>({});
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [brokerLeadsView, setBrokerLeadsView] = useState<{
    broker: User; statuses: string[]; label: string; icon: string;
  } | null>(null);

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["managerLeads"],
    queryFn: fetchLeadsForDashboard,
    refetchInterval: 30000,
  });

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["managerProfiles"],
    queryFn: fetchProfiles,
    refetchInterval: 60000,
  });

  // Minha equipe
  const myBrokers = useMemo(() =>
    profiles.filter(p => p.role === "BROKER" && p.managerId === user?.id),
    [profiles, user?.id]
  );

  // Buscar XP e missões de todos os brokers da equipe
  useEffect(() => {
    if (myBrokers.length === 0) return;
    const ids = myBrokers.map(b => b.id);

    const loadXP = async () => {
      const { data } = await supabase
        .from("broker_xp")
        .select("broker_id, total_xp, level, level_name")
        .in("broker_id", ids);
      const map: Record<string, any> = {};
      (data || []).forEach(d => {
        map[d.broker_id] = { xp: d.total_xp, level: d.level, levelName: d.level_name };
      });
      setXpData(map);
    };

    const loadMissions = async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("daily_missions")
        .select("broker_id, completed")
        .in("broker_id", ids)
        .eq("date", today);
      const map: Record<string, { completed: number; total: number }> = {};
      ids.forEach(id => { map[id] = { completed: 0, total: 0 }; });
      (data || []).forEach(d => {
        if (!map[d.broker_id]) map[d.broker_id] = { completed: 0, total: 0 };
        map[d.broker_id].total++;
        if (d.completed) map[d.broker_id].completed++;
      });
      setMissionsData(map);
    };

    loadXP();
    loadMissions();
    setLastUpdated(new Date());
  }, [myBrokers]);

  // Realtime: novos leads
  useEffect(() => {
    const channel = supabase.channel("manager-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        setLastUpdated(new Date());
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => {
        setLastUpdated(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Montar cards dos brokers
  const brokerCards: BrokerCard[] = useMemo(() =>
    myBrokers.map(broker => {
      const brokerLeads = leads.filter(l => l.brokerId === broker.id);
      const stalledLeads = brokerLeads.filter(l =>
        l.status !== "CONCLUDED" && l.status !== "ABANDONED" && l.status !== "EXCLUDED" &&
        hoursAgo(l.lastInteractionAt) > ALERT_THRESHOLDS.STALLED_HOURS &&
        // Não conta como "parado" se está conversando ativamente (quente/morno)
        l.leadTemperature !== 'quente' && l.leadTemperature !== 'morno'
      );
      const concluded = brokerLeads.filter(l => l.status === "CONCLUDED").length;
      const activeLeads = brokerLeads.filter(l => l.status !== "EXCLUDED" && l.status !== "ABANDONED").length;
      const responseTimes = brokerLeads
        .filter(l => l.status !== "NEW")
        .map(l => hoursAgo(l.createdAt) - hoursAgo(l.lastInteractionAt))
        .filter(h => h > 0);
      const avgResponse = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      return {
        broker,
        leads: brokerLeads,
        newLeads: brokerLeads.filter(l => l.status === "NEW").length,
        inProgress: brokerLeads.filter(l => l.status === "IN_PROGRESS").length,
        visits: brokerLeads.filter(l => l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA").length,
        docs: brokerLeads.filter(l => l.status === "DOCS_REQUESTED").length,
        negotiating: brokerLeads.filter(l => l.status === "NEGOTIATING").length,
        concluded,
        abandoned: brokerLeads.filter(l => l.status === "ABANDONED").length,
        stalledLeads,
        avgResponseHours: Math.max(0, avgResponse),
        xp: xpData[broker.id]?.xp || 0,
        level: xpData[broker.id]?.level || 1,
        levelName: xpData[broker.id]?.levelName || "Recruta",
        missionsCompleted: missionsData[broker.id]?.completed || 0,
        missionsTotal: missionsData[broker.id]?.total || 0,
      };
    }).sort((a, b) => b.concluded - a.concluded), // ordenar por vendas
    [myBrokers, leads, xpData, missionsData]
  );

  // Métricas da equipe
  const teamStats = useMemo(() => {
    const today = new Date().toDateString();
    const teamLeads = leads.filter(l => myBrokers.some(b => b.id === l.brokerId));
    const todayLeads = teamLeads.filter(l => new Date(l.createdAt).toDateString() === today);
    return {
      totalLeads: teamLeads.length,
      totalSales: brokerCards.reduce((s, c) => s + c.concluded, 0),
      totalStalled: brokerCards.reduce((s, c) => s + c.stalledLeads.length, 0),
      totalNew: brokerCards.reduce((s, c) => s + c.newLeads, 0),
      avgConversion: brokerCards.length > 0
        ? brokerCards.reduce((s, c) => s + (c.leads.length > 0 ? c.concluded / c.leads.length : 0), 0) / brokerCards.length
        : 0,
      // Breakdown de origem dos novos de hoje — resolve confusão tipo Iracema
      newTodayTotal: todayLeads.length,
      newTodayFunnel: todayLeads.filter(l => l.source === "facebook_make").length,
      newTodayCold:   todayLeads.filter(l => l.source === "cold_pool").length,
      newTodayBroker: todayLeads.filter(l => l.source === "broker_manual").length,
      newTodayManager: todayLeads.filter(l => l.source === "manager_manual").length,
    };
  }, [brokerCards, leads, myBrokers]);

  if (profiles.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-900/50 border border-blue-500/30">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white font-black text-lg uppercase tracking-wide">Centro de Comando</h1>
              <p className="text-gray-500 text-xs">Visão tática da sua equipe • Atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-gray-500 hover:text-red-400 gap-1.5">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ─── KPIs da Equipe ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Corretores", value: myBrokers.length, icon: Users, color: "text-blue-400", bg: "border-blue-500/20 bg-blue-900/10" },
            { label: "Leads Totais", value: teamStats.totalLeads, icon: Target, color: "text-purple-400", bg: "border-purple-500/20 bg-purple-900/10" },
            { label: "Novos Hoje", value: teamStats.totalNew, icon: Zap, color: "text-yellow-400", bg: "border-yellow-500/20 bg-yellow-900/10" },
            { label: "Vendas", value: teamStats.totalSales, icon: Trophy, color: "text-green-400", bg: "border-green-500/20 bg-green-900/10" },
            {
              label: "Parados +24h",
              value: teamStats.totalStalled,
              icon: AlertTriangle,
              color: teamStats.totalStalled > 0 ? "text-red-400" : "text-gray-500",
              bg: teamStats.totalStalled > 0 ? "border-red-500/30 bg-red-900/10" : "border-gray-700/30 bg-slate-800/20"
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={cn("rounded-xl border p-4 flex items-center gap-3", bg)}>
              <Icon className={cn("w-7 h-7 shrink-0", color)} />
              <div>
                <p className={cn("text-2xl font-black leading-none", color)}>{value}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Breakdown de origem dos novos hoje — resolve confusão tipo Iracema ── */}
        {teamStats.newTodayTotal > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span className="text-gray-500">Origem dos {teamStats.newTodayTotal} novos hoje:</span>
            {teamStats.newTodayFunnel > 0 && (
              <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                    title="Vieram do funil Facebook/Make">🎯 {teamStats.newTodayFunnel} funil</span>
            )}
            {teamStats.newTodayCold > 0 && (
              <span className="px-2 py-0.5 rounded-md font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25"
                    title="Recuperados via prospecção ativa dos corretores">🎣 {teamStats.newTodayCold} prospecção</span>
            )}
            {teamStats.newTodayBroker > 0 && (
              <span className="px-2 py-0.5 rounded-md font-bold bg-sky-500/10 text-sky-300 border border-sky-500/25"
                    title="Indicações cadastradas pelos corretores">✋ {teamStats.newTodayBroker} indicação</span>
            )}
            {teamStats.newTodayManager > 0 && (
              <span className="px-2 py-0.5 rounded-md font-bold bg-violet-500/10 text-violet-300 border border-violet-500/25"
                    title="Cadastrados manualmente por você">👔 {teamStats.newTodayManager} manager</span>
            )}
          </div>
        )}

        {/* ─── Cards dos Corretores ─────────────────────────────────────────── */}
        <div>
          <h2 className="text-gray-400 text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Situação da Tropa
          </h2>

          {myBrokers.length === 0 ? (
            <div className="text-center py-20 text-gray-600 border border-gray-700/30 rounded-xl">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum corretor atribuído a você ainda.</p>
              <p className="text-sm mt-1">Peça ao admin definir seu manager_id nos perfis dos corretores.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {brokerCards.map((card, rank) => (
                <BrokerStatusCard key={card.broker.id} card={card} rank={rank + 1}
                  onLeadsClick={(statuses, label, icon) =>
                    setBrokerLeadsView({ broker: card.broker, statuses, label, icon })} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Alertas Táticos ─────────────────────────────────────────────── */}
        {teamStats.totalStalled > 0 && (
          <div>
            <h2 className="text-red-400 text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Alertas — Leads Parados
            </h2>
            <div className="space-y-2">
              {brokerCards.flatMap(card =>
                card.stalledLeads.map(lead => ({
                  lead,
                  broker: card.broker,
                  hours: Math.floor(hoursAgo(lead.lastInteractionAt)),
                }))
              ).sort((a, b) => b.hours - a.hours).slice(0, 10).map(({ lead, broker, hours }) => (
                <div key={lead.id} className="flex items-center gap-3 bg-red-900/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{lead.name}</p>
                    <p className="text-gray-400 text-xs truncate">
                      {broker.name} • {lead.tag || "sem tag"} • status: {lead.status}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-red-400 font-black text-sm">{hours}h</p>
                    <p className="text-gray-600 text-xs">sem interação</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Ranking da Equipe ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-gray-400 text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" /> Ranking da Equipe
          </h2>
          <div className="bg-slate-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50 bg-slate-800/60">
                  {["#", "Corretor", "Nível", "Vendas", "Leads Ativos", "Parados", "Missões"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brokerCards.map((card, i) => (
                  <tr key={card.broker.id} className={cn("border-b border-gray-700/20 hover:bg-slate-800/30 transition-colors", i === 0 && "bg-yellow-900/5")}>
                    <td className="px-4 py-3">
                      <span className={cn("font-black text-lg", i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600")}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-slate-700 text-white text-xs font-bold">{initials(card.broker.name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-white font-medium">{card.broker.name.split(" ")[0]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-bold text-xs", LEVEL_COLORS[card.level] || "text-gray-400")}>
                        {card.levelName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-black", card.concluded > 0 ? "text-green-400" : "text-gray-600")}>{card.concluded}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{card.inProgress + card.newLeads}</td>
                    <td className="px-4 py-3">
                      {card.stalledLeads.length > 0
                        ? <span className="text-red-400 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{card.stalledLeads.length}</span>
                        : <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-purple-300">{card.missionsCompleted}/{card.missionsTotal}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── DRAWER: Lista de leads por broker/status (clica em 🏠/📄/💼) ──────── */}
      <Sheet open={!!brokerLeadsView} onOpenChange={(v) => !v && setBrokerLeadsView(null)}>
        <SheetContent side="right" className="sm:max-w-md bg-slate-900 border-gray-700 p-0 overflow-y-auto">
          {brokerLeadsView && (() => {
            const blv = brokerLeadsView;
            const leadsDoBroker = leads
              .filter(l => l.brokerId === blv.broker.id && blv.statuses.includes(l.status))
              .sort((a, b) => new Date(b.lastInteractionAt || b.createdAt).getTime()
                            - new Date(a.lastInteractionAt || a.createdAt).getTime());
            return (
              <>
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-800">
                  <SheetTitle className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-2xl">{blv.icon}</span>
                    {blv.label} de {(blv.broker.name || "—").split(" ")[0]}
                  </SheetTitle>
                  <SheetDescription className="text-gray-500 text-xs">
                    {leadsDoBroker.length} lead{leadsDoBroker.length !== 1 ? "s" : ""} em {blv.statuses.join(" + ")}
                  </SheetDescription>
                </SheetHeader>
                <div className="px-3 py-3 space-y-1.5">
                  {leadsDoBroker.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">Nenhum lead nessa fase</p>
                  ) : leadsDoBroker.map(lead => {
                    const h = hoursAgo(lead.lastInteractionAt || lead.createdAt);
                    const hoursLabel = h < 1 ? `${Math.round(h*60)}min` : h < 24 ? `${Math.floor(h)}h` : `${Math.floor(h/24)}d`;
                    return (
                      <div key={lead.id} className="rounded-lg border border-gray-800 bg-slate-800/40 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700/60 text-gray-400 shrink-0">
                            {lead.status.replace("_"," ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
                          <span>{lead.phone}</span>
                          {lead.tag && <><span>·</span><span>{lead.tag}</span></>}
                          <span>·</span>
                          <span>há {hoursLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Card individual do corretor ──────────────────────────────────────────────
function BrokerStatusCard({ card, rank, onLeadsClick }: { card: BrokerCard; rank: number; onLeadsClick?: (statuses: string[], label: string, icon: string) => void }) {
  const { broker, leads, newLeads, inProgress, visits, docs, negotiating, concluded, stalledLeads, avgResponseHours, level, levelName, missionsCompleted, missionsTotal } = card;
  const convRate = leads.length > 0 ? ((concluded / leads.length) * 100).toFixed(1) : "0.0";
  const hasAlerts = stalledLeads.length > 0;
  const isOnFire = concluded >= 2 || (leads.length > 0 && concluded / leads.length > 0.2);

  return (
    <div className={cn(
      "rounded-2xl border p-4 space-y-3 transition-all",
      hasAlerts ? "border-red-500/30 bg-red-900/5" : "border-gray-700/40 bg-slate-800/30",
      rank === 1 && "border-yellow-500/30 bg-yellow-900/5"
    )}>
      {/* Header do card */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-11 w-11">
            <AvatarFallback className={cn("font-black text-sm", rank === 1 ? "bg-yellow-900/60 text-yellow-200" : "bg-slate-700 text-white")}>
              {initials(broker.name)}
            </AvatarFallback>
          </Avatar>
          {rank === 1 && <span className="absolute -top-1 -right-1 text-sm">👑</span>}
          {isOnFire && rank > 1 && <span className="absolute -top-1 -right-1 text-sm">🔥</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black truncate">{broker.name}</p>
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-bold", LEVEL_COLORS[level] || "text-gray-500")}>{levelName}</span>
            <span className="text-gray-600 text-xs">•</span>
            <span className="text-gray-500 text-xs">{card.xp.toLocaleString()} XP</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-green-400 leading-none">{concluded}</p>
          <p className="text-xs text-gray-500">vendas</p>
        </div>
      </div>

      {/* Stats do pipeline */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Novos", value: newLeads, color: "text-yellow-400" },
          { label: "Atend.", value: inProgress, color: "text-blue-400" },
          { label: "Conv.", value: `${convRate}%`, color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/40 rounded-lg p-2 text-center">
            <p className={cn("font-black text-lg leading-none", color)}>{value}</p>
            <p className="text-xs text-gray-600 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline avançado: visitas / docs / negociação — clique abre lista */}
      {(visits > 0 || docs > 0 || negotiating > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => visits > 0 && onLeadsClick?.(["VISIT_SCHEDULED","VISITA_REALIZADA"], "Visitas", "🏠")}
                  disabled={visits === 0}
                  className={cn("bg-emerald-900/15 border border-emerald-500/20 rounded-lg p-2 text-center transition", visits > 0 && "hover:bg-emerald-900/25 hover:border-emerald-500/40 cursor-pointer", visits === 0 && "opacity-60 cursor-default")}
                  title={visits > 0 ? "Clique pra ver os leads" : ""}>
            <p className={cn("font-black text-lg leading-none", visits > 0 ? "text-emerald-400" : "text-gray-600")}>🏠 {visits}</p>
            <p className="text-xs text-gray-600 mt-0.5">Visitas</p>
          </button>
          <button onClick={() => docs > 0 && onLeadsClick?.(["DOCS_REQUESTED"], "Documentos", "📄")}
                  disabled={docs === 0}
                  className={cn("bg-orange-900/15 border border-orange-500/20 rounded-lg p-2 text-center transition", docs > 0 && "hover:bg-orange-900/25 hover:border-orange-500/40 cursor-pointer", docs === 0 && "opacity-60 cursor-default")}
                  title={docs > 0 ? "Clique pra ver os leads" : ""}>
            <p className={cn("font-black text-lg leading-none", docs > 0 ? "text-orange-400" : "text-gray-600")}>📄 {docs}</p>
            <p className="text-xs text-gray-600 mt-0.5">Docs</p>
          </button>
          <button onClick={() => negotiating > 0 && onLeadsClick?.(["NEGOTIATING"], "Negociação", "💼")}
                  disabled={negotiating === 0}
                  className={cn("bg-violet-900/15 border border-violet-500/20 rounded-lg p-2 text-center transition", negotiating > 0 && "hover:bg-violet-900/25 hover:border-violet-500/40 cursor-pointer", negotiating === 0 && "opacity-60 cursor-default")}
                  title={negotiating > 0 ? "Clique pra ver os leads" : ""}>
            <p className={cn("font-black text-lg leading-none", negotiating > 0 ? "text-violet-400" : "text-gray-600")}>💼 {negotiating}</p>
            <p className="text-xs text-gray-600 mt-0.5">Negoc.</p>
          </button>
        </div>
      )}

      {/* Missões */}
      {missionsTotal > 0 && (
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Missões hoje</span>
              <span className="text-yellow-400 font-bold">{missionsCompleted}/{missionsTotal}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all"
                style={{ width: `${missionsTotal > 0 ? (missionsCompleted / missionsTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Alerta leads parados */}
      {hasAlerts && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-red-300 text-xs flex-1">
            <span className="font-bold">{stalledLeads.length} lead{stalledLeads.length > 1 ? "s" : ""}</span> parado{stalledLeads.length > 1 ? "s" : ""} há mais de 24h
          </p>
        </div>
      )}

      {/* Tempo médio de resposta */}
      {avgResponseHours > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          Tempo médio de resposta:
          <span className={cn("font-bold", avgResponseHours < 2 ? "text-green-400" : avgResponseHours < 8 ? "text-yellow-400" : "text-red-400")}>
            {avgResponseHours < 1 ? `${Math.floor(avgResponseHours * 60)}min` : `${avgResponseHours.toFixed(1)}h`}
          </span>
        </div>
      )}
    </div>
  );
}
