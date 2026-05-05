// CoachIndex — lista de corretores do time como cards clicáveis.
// Status por corretor (saudável / atenção / crítico) baseado em KPIs.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { GraduationCap, Loader2, ArrowRight, Power, PowerOff, AlertTriangle, CheckCircle2, TrendingDown } from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lead_assignment_enabled: boolean | null;
}

interface Stats {
  broker: Broker;
  ativos: number;
  vendasSemana: number;
  pipeline: number;
  parados24: number;
  quentesIgnorados: number;
  status: "saudavel" | "atencao" | "critico";
  avgTprMin: number | null;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function CoachIndex() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data: brokers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, lead_assignment_enabled")
        .eq("manager_id", userId)
        .eq("role", "BROKER");

      if (!brokers) { setLoading(false); return; }

      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

      const computed = await Promise.all(
        (brokers as Broker[]).map(async (b) => {
          const { data: leads } = await supabase
            .from("leads")
            .select("id, status, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, created_at")
            .eq("broker_id", b.id)
            .limit(500);

          const list = leads || [];
          const ativos = list.filter((l) => !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)).length;
          const vendasSemana = list.filter(
            (l) => l.status === "CONCLUDED" && l.last_interaction_at &&
              new Date(l.last_interaction_at) >= weekAgo
          ).length;
          const pipeline = list.filter((l) =>
            ["DOCS_REQUESTED", "VISIT_SCHEDULED", "VISITA_REALIZADA"].includes(l.status)
          ).length;
          const parados24 = list.filter((l) => {
            if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)) return false;
            if (!l.last_interaction_at) return false;
            return (Date.now() - new Date(l.last_interaction_at).getTime()) / 3600000 > 24;
          }).length;
          const quentesIgnorados = list.filter((l: any) => {
            if (!l.last_lead_response_at) return false;
            const respH = (Date.now() - new Date(l.last_lead_response_at).getTime()) / 3600000;
            const brokerH = l.last_broker_whatsapp_at
              ? (Date.now() - new Date(l.last_broker_whatsapp_at).getTime()) / 3600000
              : Infinity;
            return respH > 2 && respH < 48 && brokerH > respH;
          }).length;

          // TPR (mesmo cálculo do OperationHealth)
          const tprData = list
            .filter((l: any) => l.last_broker_whatsapp_at)
            .map((l: any) => {
              const c = new Date(l.created_at).getTime();
              const f = new Date(l.last_broker_whatsapp_at).getTime();
              return (f - c) / 60000;
            })
            .filter((m) => m >= 0 && m < 60 * 24 * 7);
          const avgTprMin = tprData.length > 0
            ? Math.round(tprData.reduce((s, d) => s + d, 0) / tprData.length)
            : null;

          // Status do corretor
          let status: Stats["status"] = "saudavel";
          if (b.lead_assignment_enabled === false) status = "atencao";
          if (quentesIgnorados >= 3 || parados24 >= 5 || (avgTprMin !== null && avgTprMin > 60)) {
            status = "critico";
          } else if (quentesIgnorados > 0 || parados24 >= 2 || (avgTprMin !== null && avgTprMin > 20)) {
            status = "atencao";
          }
          if (vendasSemana >= 3 && status !== "critico") status = "saudavel";

          return {
            broker: b, ativos, vendasSemana, pipeline, parados24, quentesIgnorados, status, avgTprMin,
          };
        })
      );

      computed.sort((a, b) => {
        const ord = { critico: 0, atencao: 1, saudavel: 2 };
        return ord[a.status] - ord[b.status] || b.vendasSemana - a.vendasSemana;
      });
      setStats(computed);
      setLoading(false);
    })();
  }, [userId]);

  const summary = useMemo(() => ({
    total: stats.length,
    criticos: stats.filter((s) => s.status === "critico").length,
    atencao: stats.filter((s) => s.status === "atencao").length,
    saudaveis: stats.filter((s) => s.status === "saudavel").length,
  }), [stats]);

  return (
    <Shell title="Coach 1:1" subtitle="briefing por corretor com IA" icon={GraduationCap} color="#A78BFA">
      {loading ? (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-8 flex items-center justify-center text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> calculando saúde do time…
        </div>
      ) : (
        <>
          {/* Resumo no topo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <SummaryCard label="Time" value={summary.total} sub="corretores" color="#94A3B8" />
            <SummaryCard label="Críticos" value={summary.criticos} sub="precisam coaching urgente" color="#EF4444" pulse={summary.criticos > 0} />
            <SummaryCard label="Atenção" value={summary.atencao} sub="merecem 1:1 esta semana" color="#F59E0B" />
            <SummaryCard label="Saudáveis" value={summary.saudaveis} sub="seguem performando" color="#10B981" />
          </div>

          <div className="mb-3 px-1 flex items-center justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Selecione um corretor pra ver o briefing
            </h2>
            <span className="text-[11px] text-slate-600">ordenado por urgência de coaching</span>
          </div>

          {stats.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-8 text-center text-slate-500 text-sm">
              Sem corretores no time.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {stats.map((s, i) => (
                <BrokerCard key={s.broker.id} stat={s} delay={i * 0.04} />
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function SummaryCard({ label, value, sub, color, pulse }: { label: string; value: number; sub: string; color: string; pulse?: boolean }) {
  return (
    <div
      className="rounded-xl p-3 border relative overflow-hidden"
      style={{ background: `${color}08`, borderColor: `${color}30` }}
    >
      {pulse && (
        <motion.div
          className="absolute top-2 right-2 w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <div className="text-[11px] uppercase tracking-widest font-black mb-1" style={{ color }}>
        {label}
      </div>
      <div className="text-2xl font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function BrokerCard({ stat, delay }: { stat: Stats; delay: number }) {
  const { broker, vendasSemana, ativos, pipeline, parados24, quentesIgnorados, status, avgTprMin } = stat;
  const ausente = broker.lead_assignment_enabled === false;
  const name = `${broker.first_name || ""} ${broker.last_name || ""}`.trim() || "—";
  const colorMap = { saudavel: "#10B981", atencao: "#F59E0B", critico: "#EF4444" };
  const iconMap = { saudavel: CheckCircle2, atencao: AlertTriangle, critico: TrendingDown };
  const labelMap = { saudavel: "Saudável", atencao: "Atenção", critico: "Crítico" };
  const color = ausente ? "#71717A" : colorMap[status];
  const StatusIcon = ausente ? PowerOff : iconMap[status];

  return (
    <Link to={`/manager/coach/${broker.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
        whileHover={{ y: -3 }}
        className="rounded-2xl p-4 border transition-all cursor-pointer relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${color}10, rgba(15,23,42,0.6))`,
          borderColor: `${color}40`,
          boxShadow: status === "critico" && !ausente ? `0 0 20px ${color}25` : "none",
        }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0"
            style={{ background: `${color}20`, border: `1.5px solid ${color}50`, color }}
          >
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold truncate ${ausente ? "text-slate-500 line-through" : "text-slate-100"}`}>
              {name}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <StatusIcon className="w-3 h-3" style={{ color }} />
              <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color }}>
                {ausente ? "Ausente" : labelMap[status]}
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <Mini label="Vendas sem" value={vendasSemana} color="#10B981" />
          <Mini label="Pipeline" value={pipeline} color="#06B6D4" />
          <Mini label="Ativos" value={ativos} color="#94A3B8" />
        </div>

        {/* Sinais de problema */}
        <div className="flex flex-wrap gap-1.5">
          {quentesIgnorados > 0 && (
            <Pill color="#EF4444">{quentesIgnorados} 🔥 ignorados</Pill>
          )}
          {parados24 > 0 && (
            <Pill color="#F59E0B">{parados24} parados +24h</Pill>
          )}
          {avgTprMin !== null && avgTprMin > 30 && (
            <Pill color="#F97316">TPR {avgTprMin}min</Pill>
          )}
          {!ausente && status === "saudavel" && vendasSemana >= 3 && (
            <Pill color="#10B981">🏆 performando</Pill>
          )}
          {ausente && (
            <Pill color="#71717A">precisa marcar presença</Pill>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
      <div className="text-lg font-black tabular-nums leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[11px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {children}
    </span>
  );
}
