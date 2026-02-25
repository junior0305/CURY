import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity, Target, TrendingUp, AlertTriangle, FileText,
  Percent, CheckCircle2, Zap, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Tooltip, Legend,
} from "recharts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokerId: string;
  userName?: string;
}

export function IntelTacticsModal({ open, onOpenChange, brokerId, userName }: Props) {

  // Dados do corretor
  const { data: stats } = useQuery({
    queryKey: ["intel-stats", brokerId],
    queryFn: async () => {
      const { data: leads } = await supabase
        .from("leads")
        .select("status, created_at, last_interaction_at")
        .eq("broker_id", brokerId);

      const all      = leads || [];
      const total    = all.length;
      const newL     = all.filter(l => l.status === "NEW").length;
      const active   = all.filter(l => l.status === "IN_PROGRESS").length;
      const visits   = all.filter(l => l.status === "VISIT_SCHEDULED").length;
      const docs     = all.filter(l => l.status === "DOCS_REQUESTED").length;
      const sales    = all.filter(l => l.status === "CONCLUDED").length;
      const lost     = all.filter(l => l.status === "ABANDONED").length;
      const worked   = total - newL;

      // Taxas de conversão por etapa
      const tAtend    = total  > 0 ? (worked / total)          * 100 : 0;
      const tVisit    = worked > 0 ? (visits  / worked)         * 100 : 0;
      const tDocs     = visits > 0 ? ((docs + sales) / visits)  * 100 : 0;
      const tClose    = (docs + sales) > 0 ? (sales / (docs + sales)) * 100 : 0;

      // Eficiência geral (produto das taxas / fator de escala)
      const efficiency = Math.min(100, (tAtend * tVisit * tDocs * tClose) / 100000 * 10);

      // Tier
      const tier = efficiency >= 70 ? "S" : efficiency >= 50 ? "A" : efficiency >= 30 ? "B" : "C";
      const tierColor = efficiency >= 70 ? "text-yellow-400" : efficiency >= 50 ? "text-emerald-400" : efficiency >= 30 ? "text-blue-400" : "text-gray-500";

      return { total, newL, active, visits, docs, sales, lost, worked, tAtend, tVisit, tDocs, tClose, efficiency, tier, tierColor };
    },
    enabled: open && !!brokerId,
  });

  // Média da tropa (todos os brokers)
  const { data: troop } = useQuery({
    queryKey: ["intel-troop"],
    queryFn: async () => {
      const { data: leads } = await supabase.from("leads").select("status");
      const all    = leads || [];
      const total  = all.length;
      const newL   = all.filter(l => l.status === "NEW").length;
      const worked = total - newL;
      const visits = all.filter(l => l.status === "VISIT_SCHEDULED").length;
      const docs   = all.filter(l => l.status === "DOCS_REQUESTED").length;
      const sales  = all.filter(l => l.status === "CONCLUDED").length;
      return {
        tAtend: total  > 0 ? ((worked) / total)          * 100 : 0,
        tVisit: worked > 0 ? (visits  / worked)           * 100 : 0,
        tDocs:  visits > 0 ? ((docs + sales) / visits)    * 100 : 0,
        tClose: (docs + sales) > 0 ? (sales / (docs + sales)) * 100 : 0,
      };
    },
    enabled: open,
  });

  const name = userName ? userName.split(" ")[0] : "Você";

  const radarData = [
    { subject: "Engajamento", A: Math.round(stats?.tAtend || 0), B: Math.round(troop?.tAtend || 0) },
    { subject: "Persuasão",   A: Math.round(stats?.tVisit || 0), B: Math.round(troop?.tVisit || 0) },
    { subject: "Técnica",     A: Math.round(stats?.tDocs  || 0), B: Math.round(troop?.tDocs  || 0) },
    { subject: "Fechamento",  A: Math.round(stats?.tClose || 0), B: Math.round(troop?.tClose || 0) },
  ];

  // Gera ordens de melhoria baseadas nos dados reais
  const orders: { icon: any; color: string; bg: string; border: string; title: string; body: string }[] = [];

  if ((stats?.docs || 0) > 0) {
    orders.push({
      icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20",
      title: `⚡ Ataque à Mina de Ouro — ${stats!.docs} leads`,
      body: `Você tem ${stats!.docs} cliente${stats!.docs > 1 ? "s" : ""} com documentação pendente. São os mais próximos de fechar. Pare de prospectar novos e resolva esses hoje.`,
    });
  }

  if (stats && troop && stats.tVisit < troop.tVisit - 10) {
    orders.push({
      icon: TrendingUp, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20",
      title: "📅 Gargalo em Visitas",
      body: `Sua taxa de agendamento (${Math.round(stats.tVisit)}%) está abaixo da tropa (${Math.round(troop.tVisit)}%). Use o "Falso Dilema": ofereça dois horários em vez de perguntar se o cliente quer ir.`,
    });
  }

  if (stats && troop && stats.tClose < troop.tClose - 10) {
    orders.push({
      icon: Percent, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20",
      title: "🎯 Fechamento Abaixo da Média",
      body: `Você chega em proposta mas não fecha. Taxa: ${Math.round(stats.tClose)}% vs tropa: ${Math.round(troop.tClose)}%. Identifique a objeção mais comum e prepare um script específico.`,
    });
  }

  if (stats && stats.newL > stats.worked * 0.4) {
    orders.push({
      icon: AlertTriangle, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20",
      title: "📞 Leads Novos Parados",
      body: `${stats.newL} leads ainda não foram atendidos. Cada hora sem contato reduz a chance de conversão em 10x. Inicie a cadência imediatamente.`,
    });
  }

  if (orders.length === 0) {
    orders.push({
      icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
      title: "✅ Operação em Ordem",
      body: "Sua performance está acima ou alinhada com a média da tropa em todos os indicadores. Mantenha o ritmo e foque em volume.",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col gap-0 p-0 bg-slate-900 border-gray-700 rounded-2xl text-white">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-700/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-white tracking-tight">
                {userName ? `Dossiê Tático — ${userName}` : "Meu Cockpit de Guerra"}
              </DialogTitle>
              <DialogDescription className="text-gray-500 text-xs font-medium mt-0.5">
                Inteligência de performance em tempo real
              </DialogDescription>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2 bg-slate-800 border border-gray-700/50 px-4 py-2 rounded-xl">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tier</span>
              <span className={cn("text-2xl font-black", stats.tierColor)}>{stats.tier}</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">

          {/* ── BLOCO 1: Mina de Ouro ── */}
          <section>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-amber-400" /> Mina de Ouro
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Docs Pendentes", value: stats?.docs ?? "—",  color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20",  note: "Dinheiro na mão" },
                { label: "Visitas Agendadas", value: stats?.visits ?? "—", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", note: "Quase lá" },
                { label: "Vendas Fechadas", value: stats?.sales ?? "—",  color: "text-indigo-400", bg: "bg-indigo-500/10",  border: "border-indigo-500/20",  note: "Concluídos" },
                { label: "Leads Perdidos",  value: stats?.lost ?? "—",  color: "text-rose-400",   bg: "bg-rose-500/10",   border: "border-rose-500/20",   note: "Analisar motivo" },
              ].map(({ label, value, color, bg, border, note }) => (
                <div key={label} className={cn("rounded-xl border p-4", bg, border)}>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">{label}</p>
                  <p className={cn("text-3xl font-black leading-none", color)}>{value}</p>
                  <p className="text-[10px] text-gray-600 mt-1.5">{note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── BLOCO 2: Taxa de Fechamento ── */}
          <section>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <Percent className="w-3.5 h-3.5 text-indigo-400" /> Taxa de Fechamento por Etapa
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Atendimento",  mine: stats?.tAtend, troop: troop?.tAtend },
                { label: "→ Visita",     mine: stats?.tVisit, troop: troop?.tVisit },
                { label: "→ Proposta",   mine: stats?.tDocs,  troop: troop?.tDocs  },
                { label: "→ Venda",      mine: stats?.tClose, troop: troop?.tClose },
              ].map(({ label, mine, troop: troopVal }) => {
                const m = Math.round(mine || 0);
                const t = Math.round(troopVal || 0);
                const diff = m - t;
                const Icon = diff > 5 ? ArrowUp : diff < -5 ? ArrowDown : Minus;
                const iconColor = diff > 5 ? "text-emerald-400" : diff < -5 ? "text-rose-400" : "text-gray-500";
                return (
                  <div key={label} className="bg-slate-800/50 border border-gray-700/40 rounded-xl p-4">
                    <p className="text-xs text-gray-500 font-bold mb-2">{label}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-white">{m}%</span>
                      <Icon className={cn("w-4 h-4", iconColor)} />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1.5">Tropa: {t}%</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── BLOCO 3: Radar de Competências + Eficiência Tática ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Radar */}
            <section className="lg:col-span-2 bg-slate-800/40 border border-gray-700/40 rounded-2xl p-4">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-indigo-400" /> Radar de Competências vs Tropa
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "#6b7280", fontSize: 10, fontWeight: "bold" }}
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name={name} dataKey="A" stroke="#6366f1" strokeWidth={2.5} fill="#6366f1" fillOpacity={0.25} />
                    <Radar name="Tropa" dataKey="B" stroke="#4b5563" strokeWidth={1.5} fill="#4b5563" fillOpacity={0.1} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "bold", color: "#9ca3af" }} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #374151", borderRadius: "12px", color: "#fff" }}
                      itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Eficiência Tática */}
            <section className="bg-slate-800/40 border border-gray-700/40 rounded-2xl p-5 flex flex-col justify-between">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-yellow-400" /> Eficiência Tática
              </h3>

              {/* Tier grande */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className={cn(
                  "text-8xl font-black leading-none mb-3",
                  stats?.tierColor || "text-gray-600"
                )}>
                  {stats?.tier ?? "—"}
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {stats?.tier === "S" ? "Performance Excepcional" :
                   stats?.tier === "A" ? "Acima da Média" :
                   stats?.tier === "B" ? "Em Desenvolvimento" : "Precisa de Atenção"}
                </p>
              </div>

              {/* Barra de eficiência */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-gray-600 mb-1.5">
                  <span>Eficiência Geral</span>
                  <span className="font-bold text-white">{Math.round(stats?.efficiency || 0)}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      (stats?.efficiency || 0) >= 70 ? "bg-yellow-400" :
                      (stats?.efficiency || 0) >= 50 ? "bg-emerald-500" :
                      (stats?.efficiency || 0) >= 30 ? "bg-blue-500" : "bg-gray-600"
                    )}
                    style={{ width: `${stats?.efficiency || 0}%` }}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* ── BLOCO 4 + 5: Ordens de Melhoria ── */}
          <section>
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Ordens de Melhoria
            </h3>
            <div className="space-y-2.5">
              {orders.map((order, i) => (
                <div key={i} className={cn("rounded-xl border p-4 flex gap-3", order.bg, order.border)}>
                  <order.icon className={cn("w-5 h-5 shrink-0 mt-0.5", order.color)} />
                  <div>
                    <p className={cn("text-xs font-black mb-1", order.color)}>{order.title}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{order.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}
