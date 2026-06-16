// WallOfFameManagers — comparação com pares (Pastas / Visitas / Vendas / Δ).
// Toggle semana/mês + navegação temporal (volta até 2 meses).
// Reutiliza dados de leads dos brokers de cada manager.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getSecretaryCounts } from "@/integrations/supabase/secretaryMetrics";
import {
  Trophy, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Loader2,
} from "lucide-react";

type Period = "week" | "month";
type ManagerRow = {
  manager_id: string;
  first_name: string;
  pastas: number;     // DOCS_REQUESTED
  visitas: number;    // VISIT_SCHEDULED + VISITA_REALIZADA
  vendas: number;     // CONCLUDED no período
  vendas_anterior: number;
  is_me: boolean;
};

interface Props {
  managerId: string;
}

// Calcula janelas (start, end) do período
function calcWindow(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * offset);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const label = offset === 0
      ? "Esta semana"
      : offset === 1
      ? "Semana passada"
      : `${offset} semanas atrás`;
    return { start, end, label };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  const label = offset === 0
    ? "Este mês"
    : offset === 1
    ? "Mês passado"
    : start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { start, end, label };
}

export default function WallOfFameManagers({ managerId }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ManagerRow[]>([]);

  const { start, end, label } = useMemo(() => calcWindow(period, offset), [period, offset]);
  const prevWindow = useMemo(() => calcWindow(period, offset + 1), [period, offset]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: managers } = await supabase
        .from("profiles")
        .select("id, first_name")
        .eq("role", "MANAGER")
        .limit(50);

      if (!managers) { setLoading(false); return; }

      const computed: ManagerRow[] = await Promise.all(
        managers.map(async (m: any) => {
          const { data: brokers } = await supabase
            .from("profiles").select("id").eq("manager_id", m.id).eq("role", "BROKER");
          const ids = (brokers || []).map((b: any) => b.id);
          if (ids.length === 0) {
            return {
              manager_id: m.id, first_name: m.first_name || "—",
              pastas: 0, visitas: 0, vendas: 0, vendas_anterior: 0,
              is_me: m.id === managerId,
            };
          }

          // Pastas: DOCS_REQUESTED ainda no período
          // Visitas: VISIT_SCHEDULED ou VISITA_REALIZADA com last_interaction no período
          // Vendas: CONCLUDED com last_interaction no período
          const [pastasRes, visitasRes, vendasRes, vendasAntRes] = await Promise.all([
            supabase.from("leads")
              .select("id", { count: "exact", head: true })
              .in("broker_id", ids)
              .eq("status", "DOCS_REQUESTED")
              .gte("last_interaction_at", start.toISOString())
              .lt("last_interaction_at", end.toISOString()),
            supabase.from("leads")
              .select("id", { count: "exact", head: true })
              .in("broker_id", ids)
              .in("status", ["VISIT_SCHEDULED", "VISITA_REALIZADA"])
              .gte("last_interaction_at", start.toISOString())
              .lt("last_interaction_at", end.toISOString()),
            supabase.from("leads")
              .select("id", { count: "exact", head: true })
              .in("broker_id", ids)
              .eq("status", "CONCLUDED")
              .gte("last_interaction_at", start.toISOString())
              .lt("last_interaction_at", end.toISOString()),
            supabase.from("leads")
              .select("id", { count: "exact", head: true })
              .in("broker_id", ids)
              .eq("status", "CONCLUDED")
              .gte("last_interaction_at", prevWindow.start.toISOString())
              .lt("last_interaction_at", prevWindow.end.toISOString()),
          ]);

          const sec = await getSecretaryCounts(ids, start.toISOString(), end.toISOString());
          return {
            manager_id: m.id,
            first_name: m.first_name || "—",
            pastas: pastasRes.count || 0,
            visitas: (visitasRes.count || 0) + sec.visitas,
            vendas: (vendasRes.count || 0) + sec.vendas,
            vendas_anterior: vendasAntRes.count || 0,
            is_me: m.id === managerId,
          };
        })
      );

      computed.sort((a, b) => b.vendas - a.vendas || b.visitas - a.visitas || b.pastas - a.pastas);
      setRows(computed);
      setLoading(false);
    })();
  }, [managerId, period, offset]);

  const myPos = rows.findIndex((r) => r.is_me) + 1;
  const me = rows.find((r) => r.is_me);

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
              Wall of Fame · Managers
            </h3>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle semana/mês */}
          <div className="flex bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/60">
            {(["week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOffset(0); }}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition ${
                  period === p ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
          {/* Navegação temporal */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => Math.min(o + 1, period === "week" ? 8 : 2))}
              disabled={offset >= (period === "week" ? 8 : 2)}
              className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 flex items-center justify-center text-slate-400 disabled:opacity-30"
              title={period === "week" ? "Semana anterior" : "Mês anterior"}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setOffset((o) => Math.max(o - 1, 0))}
              disabled={offset === 0}
              className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 flex items-center justify-center text-slate-400 disabled:opacity-30"
              title="Mais recente"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> calculando…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-slate-500 text-sm">Sem managers cadastrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900/40 border-b border-slate-800/60">
              <tr className="text-[11px] uppercase tracking-widest text-slate-500">
                <th className="px-4 py-2 text-left font-bold">#</th>
                <th className="px-4 py-2 text-left font-bold">Manager</th>
                <th className="px-3 py-2 text-center font-bold">Pastas</th>
                <th className="px-3 py-2 text-center font-bold">Visitas</th>
                <th className="px-3 py-2 text-center font-bold">Vendas</th>
                <th className="px-3 py-2 text-center font-bold">Δ vs anterior</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const delta = r.vendas - r.vendas_anterior;
                const TrendIcon =
                  delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                const trendColor =
                  delta > 0 ? "#10B981" : delta < 0 ? "#EF4444" : "#71717A";
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

                return (
                  <motion.tr
                    key={r.manager_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    className={`border-b border-slate-800/30 transition ${
                      r.is_me
                        ? "bg-amber-500/[0.06] border-amber-500/30"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">
                      {medal || `#${i + 1}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold ${
                            r.is_me ? "text-amber-300" : "text-slate-200"
                          }`}
                        >
                          {r.first_name}
                        </span>
                        {r.is_me && (
                          <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                            VOCÊ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums">
                      {r.pastas}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-violet-300 tabular-nums">
                      {r.visitas}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black tabular-nums">
                      <span
                        className={r.is_me ? "text-amber-300 text-base" : "text-emerald-300"}
                      >
                        {r.vendas}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold tabular-nums"
                        style={{ color: trendColor }}
                      >
                        <TrendIcon className="w-3 h-3" />
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer com tip de coaching se ele caiu */}
      {!loading && me && me.vendas < me.vendas_anterior && (
        <div className="px-4 py-2.5 border-t border-slate-800/60 bg-red-500/[0.05] flex items-center gap-2">
          <span className="text-xs text-red-300">
            💡 Você caiu {me.vendas_anterior - me.vendas} venda(s) vs período anterior.
          </span>
          <span className="text-[11px] text-slate-500">
            Use o botão "Fale com o Coach" pra entender o porquê.
          </span>
        </div>
      )}
    </div>
  );
}
