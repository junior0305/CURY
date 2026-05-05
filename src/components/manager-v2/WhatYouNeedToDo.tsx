// WhatYouNeedToDo — bloco "Hoje você precisa…"
// Por enquanto: gera ações por regras simples. IA via ai-smart-suggestions vem na Fase 2.

import { motion } from "framer-motion";
import { useMemo } from "react";
import { AlertTriangle, Bell, UserX, Flame, ArrowRight, Check } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  status: string;
  broker_id: string | null;
  created_at: string;
  last_interaction_at: string | null;
  last_lead_response_at: string | null;
  last_broker_whatsapp_at: string | null;
  contact_attempts: number | null;
  no_redistribute: boolean | null;
  negotiating_since: string | null;
}

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lead_assignment_enabled: boolean | null;
}

interface Action {
  id: string;
  priority: 1 | 2 | 3;
  icon: any;
  color: string;
  title: string;
  detail: string;
  cta: string;
}

function hoursSince(iso: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function generateActions(
  leads: Lead[],
  brokers: Broker[],
  unassigned: Lead[]
): Action[] {
  const actions: Action[] = [];

  // Mapa: broker_id → nome
  const brokerName = new Map<string, string>();
  brokers.forEach((b) => brokerName.set(b.id, b.first_name || "—"));

  // 1) Leads quentes parados (lead respondeu há >2h e broker não respondeu)
  const quentesParados = leads.filter((l) => {
    if (!l.last_lead_response_at) return false;
    const respH = hoursSince(l.last_lead_response_at);
    const brokerH = l.last_broker_whatsapp_at
      ? hoursSince(l.last_broker_whatsapp_at)
      : Infinity;
    return respH > 2 && respH < 48 && brokerH > respH;
  });

  // Agrupa por broker
  const quentesPorBroker = new Map<string, number>();
  quentesParados.forEach((l) => {
    if (!l.broker_id) return;
    quentesPorBroker.set(l.broker_id, (quentesPorBroker.get(l.broker_id) || 0) + 1);
  });
  for (const [bid, count] of quentesPorBroker.entries()) {
    if (count > 0) {
      actions.push({
        id: `cobrar-${bid}`,
        priority: 1,
        icon: Flame,
        color: "#EF4444",
        title: `Cobrar ${brokerName.get(bid)}`,
        detail: `${count} lead${count > 1 ? "s" : ""} respondeu e foi ignorado`,
        cta: "Cobrar agora",
      });
    }
  }

  // 2) Leads sem corretor
  if (unassigned.length > 0) {
    actions.push({
      id: "sem-corretor",
      priority: 1,
      icon: UserX,
      color: "#F59E0B",
      title: `${unassigned.length} lead${unassigned.length > 1 ? "s" : ""} sem corretor`,
      detail: "esperando atribuição na fila",
      cta: "Atribuir",
    });
  }

  // 3) Brokers ausentes (lead_assignment_enabled = false) com leads ativos
  const ausentesComLeads = brokers.filter((b) => {
    if (b.lead_assignment_enabled !== false) return false;
    return leads.some(
      (l) => l.broker_id === b.id && !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)
    );
  });
  if (ausentesComLeads.length > 0) {
    actions.push({
      id: "ausentes",
      priority: 2,
      icon: AlertTriangle,
      color: "#F97316",
      title: `${ausentesComLeads.length} corretor${
        ausentesComLeads.length > 1 ? "es" : ""
      } ausente${ausentesComLeads.length > 1 ? "s" : ""} com leads`,
      detail: ausentesComLeads
        .slice(0, 3)
        .map((b) => b.first_name)
        .filter(Boolean)
        .join(", "),
      cta: "Redistribuir",
    });
  }

  // 4) Leads NEGOTIATING parados >7d
  const negotiatingParados = leads.filter((l) => {
    if (l.status !== "NEGOTIATING") return false;
    if (!l.negotiating_since) return false;
    const days = hoursSince(l.negotiating_since) / 24;
    return days > 7;
  });
  if (negotiatingParados.length > 0) {
    actions.push({
      id: "neg-parados",
      priority: 2,
      icon: Bell,
      color: "#A78BFA",
      title: `${negotiatingParados.length} negociação${
        negotiatingParados.length > 1 ? "ões" : ""
      } parada${negotiatingParados.length > 1 ? "s" : ""} +7d`,
      detail: "podem virar perda — revise pessoalmente",
      cta: "Ver lista",
    });
  }

  // Ordena por prioridade, limita 4
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

interface Props {
  leads: any[];
  brokers: any[];
  unassigned: any[];
  managerName?: string;
}

export default function WhatYouNeedToDo({ leads, brokers, unassigned, managerName }: Props) {
  const actions = useMemo(
    () => generateActions(leads as Lead[], brokers as Broker[], unassigned as Lead[]),
    [leads, brokers, unassigned]
  );

  if (actions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/30 p-5 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
          <Check className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-emerald-300">Tudo sob controle, gestor.</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Nenhuma ação urgente agora. Bom momento pra coachear seu time.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h2 className="text-sm font-bold text-slate-200">
          {managerName ? <>Manager <span className="text-cyan-300">{managerName}</span>, esses são seus movimentos pra hoje:</> : "Hoje você precisa"}
        </h2>
        <span className="text-[11px] text-slate-600">
          IA real na Fase 2
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              className="group rounded-xl p-3.5 text-left transition-all border"
              style={{
                background: `linear-gradient(135deg, ${a.color}10, rgba(24,24,27,0.6))`,
                borderColor: `${a.color}40`,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${a.color}20`, border: `1px solid ${a.color}40` }}
                >
                  <Icon className="w-4 h-4" style={{ color: a.color }} />
                </div>
                {a.priority === 1 && (
                  <span
                    className="text-[11px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded animate-pulse"
                    style={{ background: `${a.color}20`, color: a.color }}
                  >
                    URGENTE
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-slate-100 leading-tight">{a.title}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">{a.detail}</p>
              <div
                className="flex items-center gap-1 mt-2.5 text-[11px] font-bold opacity-0 group-hover:opacity-100 transition"
                style={{ color: a.color }}
              >
                {a.cta} <ArrowRight className="w-3 h-3" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
