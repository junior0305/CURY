// OperationHealth — Saúde da Operação:
//  - Capacidade vs Vazão
//  - Saturação dos corretores
//  - Health Score (70% vendas + 30% outros)
//  - Alertas estratégicos com ação (incl. solicitar contratação → Secretaria)

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, UserPlus, Pause, GraduationCap,
  TrendingUp, Loader2, Heart,
} from "lucide-react";

const CAPACITY_PER_BROKER = 10; // leads/dia saudáveis
const SATURATION_THRESHOLD = 0.8; // 80% da capacidade já é amarelo

interface Props {
  managerId: string;
  brokers: any[];
  leads: any[];
  goalMonth: number | null;
  vendasMonth: number;
}

interface Metrics {
  vazaoDiaria: number;       // leads/dia média 7d
  capacidadeDiaria: number;  // brokers ativos × 10
  saturacao: number;         // 0..1
  ativosTime: number;        // brokers com lead_assignment_enabled = true
  saturados: number;         // brokers no limite
  tprMedioMin: number | null;
  conversaoSemana: number | null;
  healthScore: number;       // 0..100
}

function statusFor(metrics: Metrics): { color: string; label: string; severity: "ok" | "warn" | "crit" } {
  if (metrics.healthScore >= 70) return { color: "#10B981", label: "Saudável", severity: "ok" };
  if (metrics.healthScore >= 45) return { color: "#F59E0B", label: "Atenção", severity: "warn" };
  return { color: "#EF4444", label: "Crítico", severity: "crit" };
}

export default function OperationHealth({
  managerId, brokers, leads, goalMonth, vendasMonth,
}: Props) {
  const [tprMin, setTprMin] = useState<number | null>(null);
  const [vazao7d, setVazao7d] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // TPR: tempo médio entre lead criado e 1ª msg do broker (últimos 7d)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const sevenAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const brokerIds = brokers.map((b) => b.id);
      if (brokerIds.length === 0) { setLoading(false); return; }

      // Vazão = leads criados últimos 7d / 7
      const { count: created7 } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("broker_id", brokerIds)
        .gte("created_at", sevenAgo);
      setVazao7d((created7 || 0) / 7);

      // TPR: pega leads com last_broker_whatsapp_at, calcula diff vs created_at
      const { data: tprLeads } = await supabase
        .from("leads")
        .select("created_at, last_broker_whatsapp_at")
        .in("broker_id", brokerIds)
        .not("last_broker_whatsapp_at", "is", null)
        .gte("created_at", sevenAgo)
        .limit(200);

      if (tprLeads && tprLeads.length > 0) {
        const diffs = tprLeads
          .map((l: any) => {
            const c = new Date(l.created_at).getTime();
            const f = new Date(l.last_broker_whatsapp_at).getTime();
            return (f - c) / 60000;
          })
          .filter((m) => m >= 0 && m < 60 * 24 * 7);
        if (diffs.length > 0) {
          setTprMin(diffs.reduce((s, d) => s + d, 0) / diffs.length);
        }
      }

      setLoading(false);
    })();
  }, [managerId, brokers]);

  const metrics = useMemo<Metrics>(() => {
    const ativosTime = brokers.filter((b) => b.lead_assignment_enabled !== false).length;
    const capacidadeDiaria = ativosTime * CAPACITY_PER_BROKER;
    const saturacao = capacidadeDiaria > 0 ? Math.min(2, vazao7d / capacidadeDiaria) : 0;
    const saturados = brokers.filter((b) => {
      const myLeads = leads.filter(
        (l) => l.broker_id === b.id && !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)
      ).length;
      return myLeads >= CAPACITY_PER_BROKER * SATURATION_THRESHOLD;
    }).length;

    // Conversão semanal: vendasMonth não é semana, simplificamos com proxy mensal
    const conversaoSemana = goalMonth && goalMonth > 0 ? (vendasMonth / goalMonth) * 100 : null;

    // Health Score: 70% vendas (vs meta), 10% conversão pipeline, 10% TPR (-1 ponto cada 5min), 10% absorção
    const wVendas = goalMonth ? Math.min(100, (vendasMonth / goalMonth) * 100) : 0;
    const wConv = conversaoSemana !== null ? Math.min(100, conversaoSemana) : 0;
    const wTpr =
      tprMin === null
        ? 50
        : Math.max(0, Math.min(100, 100 - tprMin));
    const wAbs = saturacao <= 1 ? 100 - saturacao * 30 : Math.max(0, 70 - (saturacao - 1) * 50);

    const healthScore = Math.round(wVendas * 0.7 + wConv * 0.1 + wTpr * 0.1 + wAbs * 0.1);

    return {
      vazaoDiaria: Math.round(vazao7d * 10) / 10,
      capacidadeDiaria,
      saturacao,
      ativosTime,
      saturados,
      tprMedioMin: tprMin !== null ? Math.round(tprMin) : null,
      conversaoSemana,
      healthScore,
    };
  }, [brokers, leads, vazao7d, tprMin, goalMonth, vendasMonth]);

  const status = statusFor(metrics);

  // Alertas estratégicos
  const alertas: { id: string; icon: any; color: string; title: string; cta: string; action?: () => void }[] = [];
  if (metrics.saturacao > 1.05) {
    alertas.push({
      id: "contratar",
      icon: UserPlus,
      color: "#EF4444",
      title: `Time sobrecarregado · ${Math.round((metrics.saturacao - 1) * 100)}% acima da capacidade`,
      cta: "Solicitar contratação",
      action: () => {
        toast.success("📨 Pedido enviado pra Secretaria com motivo + dados.");
        // TODO Fase 2: persiste em hiring_requests
      },
    });
  }
  if (metrics.saturacao < 0.5 && metrics.vazaoDiaria < 5) {
    alertas.push({
      id: "vazao-baixa",
      icon: TrendingUp,
      color: "#F59E0B",
      title: "Vazão de leads baixa esta semana",
      cta: "Aumentar prospecção",
    });
  }
  if (metrics.tprMedioMin !== null && metrics.tprMedioMin > 30) {
    alertas.push({
      id: "tpr-lento",
      icon: AlertTriangle,
      color: "#F97316",
      title: `TPR médio lento: ${metrics.tprMedioMin}min`,
      cta: "Treinar velocidade",
    });
  }
  if (goalMonth && vendasMonth < goalMonth * 0.4) {
    alertas.push({
      id: "meta-risco",
      icon: GraduationCap,
      color: "#A78BFA",
      title: "Meta do mês em risco — pausar campanhas e focar em fechamento",
      cta: "Pausar campanhas",
    });
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">calculando saúde…</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-3.5 h-3.5" style={{ color: status.color }} />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Saúde da Operação
          </h3>
        </div>
        <span
          className="text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ background: `${status.color}20`, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      {/* Health Score grande */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-slate-800/60">
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <motion.circle
              cx="32" cy="32" r="28" fill="none"
              stroke={status.color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 28}
              initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - metrics.healthScore / 100) }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              style={{ filter: `drop-shadow(0 0 8px ${status.color}60)` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black tabular-nums" style={{ color: status.color }}>
              {metrics.healthScore}
            </span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Health Score</p>
          <p className="text-sm text-slate-300 mt-1">
            70% meta de vendas · 10% conversão · 10% velocidade · 10% absorção
          </p>
        </div>
      </div>

      {/* KPIs operacionais */}
      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <KpiBox
          icon={Activity}
          label="Vazão / dia"
          value={metrics.vazaoDiaria.toFixed(1)}
          sub={`capacidade: ${metrics.capacidadeDiaria}`}
          color={metrics.saturacao > 1 ? "#EF4444" : "#06B6D4"}
        />
        <KpiBox
          icon={UserPlus}
          label="Saturação time"
          value={`${Math.round(metrics.saturacao * 100)}%`}
          sub={`${metrics.saturados}/${metrics.ativosTime} no limite`}
          color={metrics.saturacao > 0.9 ? "#EF4444" : metrics.saturacao > 0.7 ? "#F59E0B" : "#10B981"}
        />
      </div>

      {metrics.tprMedioMin !== null && (
        <div className="px-3 pt-2 pb-3">
          <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 p-3 flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">TPR médio</span>
            <span
              className="text-base font-black tabular-nums"
              style={{
                color:
                  metrics.tprMedioMin <= 10
                    ? "#10B981"
                    : metrics.tprMedioMin <= 30
                    ? "#F59E0B"
                    : "#EF4444",
              }}
            >
              {metrics.tprMedioMin}min
            </span>
            <span className="text-[11px] text-slate-500 ml-auto">
              {metrics.tprMedioMin <= 10
                ? "Excelente"
                : metrics.tprMedioMin <= 30
                ? "Aceitável"
                : "Lento — perde lead"}
            </span>
          </div>
        </div>
      )}

      {/* Alertas estratégicos */}
      {alertas.length > 0 && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 px-1">
            Decisões estratégicas
          </p>
          {alertas.map((a) => {
            const Icon = a.icon;
            return (
              <motion.button
                key={a.id}
                onClick={a.action}
                whileHover={{ x: 2 }}
                className="w-full rounded-xl border p-2.5 flex items-center gap-2.5 text-left transition"
                style={{
                  background: `${a.color}10`,
                  borderColor: `${a.color}40`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${a.color}20` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: a.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-100 leading-tight">{a.title}</p>
                  <p className="text-[11px] mt-0.5 font-bold" style={{ color: a.color }}>
                    {a.cta} →
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {alertas.length === 0 && (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-emerald-400 font-bold">✨ Operação saudável</p>
          <p className="text-[11px] text-slate-500 mt-0.5">nenhuma decisão urgente</p>
        </div>
      )}
    </div>
  );
}

function KpiBox({
  icon: Icon, label, value, sub, color,
}: {
  icon: any; label: string; value: string | number; sub: string; color: string;
}) {
  return (
    <div
      className="rounded-xl p-3 border"
      style={{ background: `${color}06`, borderColor: `${color}30` }}
    >
      <div
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold mb-1"
        style={{ color: `${color}DD` }}
      >
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-xl font-black tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}
