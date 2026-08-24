// TeamRankingPanel — corretores ranqueados.
// Click no avatar = toggle presença (lead_assignment_enabled).
// Click no card (resto) = navega para /coach/:brokerId (Fase 2).

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Trophy, Power, PowerOff, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  status: string;
  broker_id: string | null;
  last_interaction_at: string | null;
}

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lead_assignment_enabled: boolean | null;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

interface BrokerStats {
  broker: Broker;
  vendasHoje: number;
  vendasSemana: number;
  pipeline: number;
  ativos: number;
  score: number;
}

function computeStats(brokers: Broker[], leads: Lead[]): BrokerStats[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  return brokers
    .map((b) => {
      const myLeads = leads.filter((l) => l.broker_id === b.id);
      const vendasHoje = myLeads.filter(
        (l) =>
          l.status === "CONCLUDED" &&
          l.last_interaction_at &&
          new Date(l.last_interaction_at) >= todayStart
      ).length;
      const vendasSemana = myLeads.filter(
        (l) =>
          l.status === "CONCLUDED" &&
          l.last_interaction_at &&
          new Date(l.last_interaction_at) >= weekAgo
      ).length;
      const pipeline = myLeads.filter((l) =>
        ["DOCS_REQUESTED", "VISIT_SCHEDULED", "VISITA_REALIZADA"].includes(l.status)
      ).length;
      const ativos = myLeads.filter(
        (l) => !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)
      ).length;

      const raw = vendasSemana * 20 + pipeline * 5;
      const score = Math.min(100, raw);

      return { broker: b, vendasHoje, vendasSemana, pipeline, ativos, score };
    })
    .sort((a, b) => b.vendasSemana - a.vendasSemana || b.pipeline - a.pipeline || b.ativos - a.ativos);
}

interface Props {
  brokers: any[];
  leads: any[];
}

export default function TeamRankingPanel({ brokers, leads }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false); // colapsado por padrão pra cockpit limpo

  const stats = useMemo(
    () => computeStats(brokers as Broker[], leads as Lead[]),
    [brokers, leads]
  );

  const totalVendasSemana = stats.reduce((s, b) => s + b.vendasSemana, 0);
  const ausentes = stats.filter((s) => s.broker.lead_assignment_enabled === false).length;
  const topBroker = stats.find((s) => s.vendasSemana > 0);

  async function togglePresence(broker: Broker, e: React.MouseEvent) {
    e.stopPropagation();
    if (busyId) return;
    const newState = !(broker.lead_assignment_enabled ?? true);
    // Footgun guard: desligar recebimento tem consequência — confirma antes de marcar ausente
    if (!newState && !window.confirm(`Marcar ${broker.first_name} como AUSENTE?\n\nEle PARA de receber leads novos automaticamente até ser reativado.`)) {
      return;
    }
    setBusyId(broker.id);
    const { error } = await supabase
      .from("profiles")
      .update({ lead_assignment_enabled: newState })
      .eq("id", broker.id);
    setBusyId(null);
    if (error) {
      toast.error("Falha: " + error.message);
      return;
    }
    toast.success(
      newState
        ? `✅ ${broker.first_name} marcado como ativo`
        : `🚫 ${broker.first_name} marcado como ausente`
    );
    queryClient.invalidateQueries({ queryKey: ["v2-team-data"] });
  }

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
      {/* Header clicável — sempre visível */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Equipe · Semana
          </h3>
          <span className="text-[11px] text-slate-500">
            {stats.length} corretor{stats.length !== 1 ? "es" : ""}
            {ausentes > 0 && (
              <span className="text-amber-400 ml-1">· {ausentes} ausente{ausentes > 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {topBroker && (
            <span className="text-[11px] text-emerald-400 font-bold hidden sm:inline">
              🏆 {topBroker.broker.first_name}
            </span>
          )}
          <span className="text-base font-black text-amber-400 tabular-nums">
            {totalVendasSemana}
          </span>
          <span className="text-[11px] text-slate-500 font-normal">vendas</span>
          <ChevronDown
            className="w-4 h-4 text-slate-500 transition-transform ml-1"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </div>
      </button>

      {/* Lista expandida */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-slate-800/60"
          >
            <div className="divide-y divide-slate-800/40">
        {stats.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-6">Sem corretores no time.</p>
        )}
        {stats.map((s, i) => {
          const name = s.broker.first_name || "—";
          const isTop = i === 0 && s.vendasSemana > 0;
          const ausente = s.broker.lead_assignment_enabled === false;
          const barColor = ausente
            ? "#71717A"
            : isTop
            ? "#10B981"
            : s.score > 30
            ? "#F59E0B"
            : "#EF4444";

          return (
            <motion.div
              key={s.broker.id}
              whileHover={{ x: 2, background: "rgba(255,255,255,0.02)" }}
              className="w-full px-4 py-3 flex items-center gap-3 transition cursor-pointer"
              onClick={() => navigate(`/manager/coach/${s.broker.id}`)}
              title="Click pra abrir Coach 1:1 (em breve)"
            >
              {/* Avatar — click toggle presença */}
              <button
                onClick={(e) => togglePresence(s.broker, e)}
                disabled={busyId === s.broker.id}
                className="relative shrink-0 group/avatar"
                title={ausente ? "Click pra marcar ATIVO" : "Click pra marcar AUSENTE"}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-black transition-transform group-hover/avatar:scale-105"
                  style={{
                    background: `${barColor}15`,
                    border: `1.5px solid ${barColor}50`,
                    color: barColor,
                  }}
                >
                  {initials(name)}
                </div>
                {isTop && !ausente && (
                  <span className="absolute -top-1 -right-1 text-[11px]">🏆</span>
                )}
                {/* Indicador de status */}
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 flex items-center justify-center"
                  style={{ background: ausente ? "#71717A" : "#10B981" }}
                >
                  {ausente ? (
                    <PowerOff className="w-1.5 h-1.5 text-slate-900" />
                  ) : (
                    <Power className="w-1.5 h-1.5 text-emerald-900" />
                  )}
                </div>
              </button>

              {/* Nome + métricas */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-sm font-bold truncate ${
                      ausente ? "text-slate-500 line-through" : "text-slate-100"
                    }`}
                  >
                    {name}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.vendasHoje > 0 && (
                      <span className="text-[11px] font-black text-emerald-400">
                        +{s.vendasHoje} hoje
                      </span>
                    )}
                    <span
                      className="text-base font-black tabular-nums"
                      style={{ color: barColor }}
                    >
                      {s.vendasSemana}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <motion.div
                      // scaleX em vez de width: width dispara layout+paint a cada
                      // frame; scaleX roda na GPU. transformOrigin left mantém a
                      // barra crescendo da esquerda.
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: s.score / 100 }}
                      transition={{ duration: 0.18, delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
                      className="h-full w-full rounded-full origin-left"
                      style={{ background: barColor, boxShadow: `0 0 6px ${barColor}80` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0 w-16 text-right">
                    {s.pipeline} pipe · {s.ativos} ativ
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
            </div>

            <div className="px-4 py-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
              <p className="text-slate-600">click no avatar pra ativar/pausar</p>
              <p className="text-slate-500">click no nome → Coach 1:1</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
