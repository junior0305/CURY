import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTeamBrokers } from "@/integrations/supabase/profiles";
import { fetchTeamLeads } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Shield, LogOut, Users, Target, Zap, Trophy,
  AlertTriangle, FileText, UserCheck, GitMerge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import AttendancePanel from "./AttendancePanel";
import DistributionPanel from "./DistributionPanel";
import TeamRanking from "./TeamRanking";
import LeadQueue from "./LeadQueue";

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

export default function ManagerDashboard() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [xpData, setXpData] = useState<Record<string, { xp: number; level: number; levelName: string }>>({});
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // ── Dados da equipe (filtrados pelo managerId) ─────────────────────────────
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

  // ── XP dos corretores ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!brokerIds.length) return;
    supabase
      .from("broker_xp")
      .select("broker_id, total_xp, level, level_name")
      .in("broker_id", brokerIds)
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach(d => {
          map[d.broker_id] = { xp: d.total_xp, level: d.level, levelName: d.level_name };
        });
        setXpData(map);
      });
  }, [brokerIds]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel("manager-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
        setLastUpdated(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Métricas para os cards de resumo ──────────────────────────────────────
  const today = new Date().toDateString();
  const stats = useMemo(() => {
    const present = brokers.filter(b => b.leadAssignmentEnabled).length;
    const newToday = teamLeads.filter(l => new Date(l.createdAt).toDateString() === today).length;
    const stalled = teamLeads.filter(l =>
      !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status) &&
      hoursAgo(l.lastInteractionAt || l.createdAt) > 24
    ).length;
    const docs = teamLeads.filter(l => l.status === "DOCS_REQUESTED").length;
    const weekAgo = Date.now() - 7 * 24 * 3600000;
    const sales = teamLeads.filter(l =>
      l.status === "CONCLUDED" && new Date(l.lastInteractionAt).getTime() > weekAgo
    ).length;
    return { present, total: brokers.length, newToday, stalled, docs, sales };
  }, [brokers, teamLeads, today]);

  if (loadingBrokers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-900/50 border border-blue-500/30">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white font-black text-lg uppercase tracking-wide">Centro de Comando</h1>
              <p className="text-gray-500 text-xs">
                Equipe • Atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-gray-500 hover:text-red-400 gap-1.5">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

        {/* ─── Cards de Resumo ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            {
              label: "Presentes",
              value: `${stats.present}/${stats.total}`,
              icon: UserCheck,
              color: stats.present < stats.total ? "text-amber-400" : "text-emerald-400",
              bg: stats.present < stats.total ? "border-amber-500/20 bg-amber-900/10" : "border-emerald-500/20 bg-emerald-900/10",
            },
            {
              label: "Novos hoje",
              value: stats.newToday,
              icon: Zap,
              color: "text-yellow-400",
              bg: "border-yellow-500/20 bg-yellow-900/10",
            },
            {
              label: "Parados +24h",
              value: stats.stalled,
              icon: AlertTriangle,
              color: stats.stalled > 0 ? "text-red-400" : "text-gray-500",
              bg: stats.stalled > 0 ? "border-red-500/30 bg-red-900/10" : "border-gray-700/30 bg-slate-800/20",
            },
            {
              label: "Aguard. docs",
              value: stats.docs,
              icon: FileText,
              color: stats.docs > 0 ? "text-purple-400" : "text-gray-500",
              bg: stats.docs > 0 ? "border-purple-500/20 bg-purple-900/10" : "border-gray-700/30 bg-slate-800/20",
            },
            {
              label: "Vendas 7d",
              value: stats.sales,
              icon: Trophy,
              color: stats.sales > 0 ? "text-green-400" : "text-gray-500",
              bg: stats.sales > 0 ? "border-green-500/20 bg-green-900/10" : "border-gray-700/30 bg-slate-800/20",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={cn("rounded-xl border p-3 flex flex-col items-center gap-1 text-center", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
              <p className={cn("text-xl font-black leading-none", color)}>{value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* ─── Tabs ─────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="attendance">
          <TabsList className="grid grid-cols-4 w-full bg-slate-800/60 border border-gray-700/40 rounded-xl p-1 h-auto">
            <TabsTrigger
              value="attendance"
              className="rounded-lg text-xs font-bold py-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-gray-500"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              Presença
            </TabsTrigger>
            <TabsTrigger
              value="distribution"
              className="rounded-lg text-xs font-bold py-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-gray-500"
            >
              <GitMerge className="w-3.5 h-3.5 mr-1" />
              Distribuir
            </TabsTrigger>
            <TabsTrigger
              value="ranking"
              className="rounded-lg text-xs font-bold py-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-gray-500"
            >
              <Trophy className="w-3.5 h-3.5 mr-1" />
              Ranking
            </TabsTrigger>
            <TabsTrigger
              value="queue"
              className="rounded-lg text-xs font-bold py-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-gray-500"
            >
              <Target className="w-3.5 h-3.5 mr-1" />
              Fila
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="attendance">
              <AttendancePanel brokers={brokers} />
            </TabsContent>

            <TabsContent value="distribution">
              <DistributionPanel
                brokers={brokers}
                teamLeads={teamLeads}
                onAssigned={() => queryClient.invalidateQueries({ queryKey: ["teamLeads"] })}
              />
            </TabsContent>

            <TabsContent value="ranking">
              <TeamRanking brokers={brokers} leads={teamLeads} xpData={xpData} />
            </TabsContent>

            <TabsContent value="queue">
              <LeadQueue brokers={brokers} leads={teamLeads} />
            </TabsContent>
          </div>
        </Tabs>

      </div>
    </div>
  );
}
