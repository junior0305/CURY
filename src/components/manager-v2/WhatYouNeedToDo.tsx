// WhatYouNeedToDo — bloco "Hoje você precisa…"
// Card "Cobrar [Broker]" consolidado: 1 card com top broker + "e mais N",
// click expande inline com lista de leads + ações por lead.

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, UserX, Flame, ArrowRight, Check, X, MessageSquare, RotateCcw, Eye, ChevronDown } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  status: string;
  broker_id: string | null;
  created_at: string;
  last_interaction_at: string | null;
  last_lead_response_at: string | null;
  last_broker_whatsapp_at: string | null;
  contact_attempts: number | null;
  no_redistribute: boolean | null;
  negotiating_since: string | null;
  manager_id?: string;
  tag?: string;
}

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lead_assignment_enabled: boolean | null;
}

type ActionKind =
  | "charge_consolidated"
  | "ausentes_consolidated"
  | "show_unassigned"
  | "info";

interface Action {
  id: string;
  priority: 1 | 2 | 3;
  icon: any;
  color: string;
  title: string;
  detail: string;
  cta: string;
  kind: ActionKind;
  payload?: { brokerIds?: string[]; leads?: Lead[] };
}

function hoursSince(iso: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function generateActions(
  leads: Lead[],
  brokers: Broker[],
  unassigned: Lead[]
): Action[] {
  const actions: Action[] = [];

  const brokerName = new Map<string, string>();
  brokers.forEach((b) => brokerName.set(b.id, b.first_name || "—"));

  // 1) Leads quentes parados — CONSOLIDADO em 1 card
  const quentesParados = leads.filter((l) => {
    if (!l.last_lead_response_at) return false;
    const respH = hoursSince(l.last_lead_response_at);
    const brokerH = l.last_broker_whatsapp_at ? hoursSince(l.last_broker_whatsapp_at) : Infinity;
    return respH > 2 && respH < 48 && brokerH > respH;
  });

  if (quentesParados.length > 0) {
    // Top broker = quem tem mais leads quentes
    const porBroker = new Map<string, number>();
    quentesParados.forEach((l) => {
      if (!l.broker_id) return;
      porBroker.set(l.broker_id, (porBroker.get(l.broker_id) || 0) + 1);
    });
    const ranked = Array.from(porBroker.entries()).sort((a, b) => b[1] - a[1]);
    const topName = ranked[0] ? brokerName.get(ranked[0][0]) || "—" : "—";
    const outros = Math.max(0, ranked.length - 1);

    const title = outros > 0 ? `Cobrar ${topName} e mais ${outros}` : `Cobrar ${topName}`;
    const detail =
      `${quentesParados.length} lead${quentesParados.length > 1 ? "s" : ""} respondeu e o corretor não` +
      (quentesParados.length > 1 ? "" : "");

    actions.push({
      id: "cobrar-consolidado",
      priority: 1,
      icon: Flame,
      color: "#EF4444",
      title,
      detail,
      cta: "Ver leads",
      kind: "charge_consolidated",
      payload: { leads: quentesParados, brokerIds: ranked.map((r) => r[0]) },
    });
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
      kind: "show_unassigned",
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
    const ausentesIds = new Set(ausentesComLeads.map((b) => b.id));
    const leadsDeAusentes = leads.filter(
      (l) =>
        l.broker_id != null &&
        ausentesIds.has(l.broker_id) &&
        !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)
    );
    actions.push({
      id: "ausentes-consolidado",
      priority: 2,
      icon: AlertTriangle,
      color: "#F97316",
      title: `${ausentesComLeads.length} corretor${
        ausentesComLeads.length > 1 ? "es" : ""
      } ausente${ausentesComLeads.length > 1 ? "s" : ""} com leads`,
      detail: `${leadsDeAusentes.length} lead${leadsDeAusentes.length > 1 ? "s" : ""} de ${ausentesComLeads
        .slice(0, 3)
        .map((b) => b.first_name)
        .filter(Boolean)
        .join(", ")}${ausentesComLeads.length > 3 ? "…" : ""}`,
      cta: "Ver leads",
      kind: "ausentes_consolidated",
      payload: { brokerIds: Array.from(ausentesIds), leads: leadsDeAusentes },
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
      kind: "info",
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

interface Props {
  leads: any[];
  brokers: any[];
  unassigned: any[];
  managerName?: string;
  onShowUnassigned?: () => void;
  // Novos: ações por lead nas expansões "Cobrar" e "Ausentes"
  onOpenLead?: (lead: any) => void;
  onChargeLead?: (lead: any) => void;
  onRedistributeLead?: (leadId: string, newBrokerId: string) => void;
}

export default function WhatYouNeedToDo({
  leads, brokers, unassigned, managerName,
  onShowUnassigned,
  onOpenLead, onChargeLead, onRedistributeLead,
}: Props) {
  const actions = useMemo(
    () => generateActions(leads as Lead[], brokers as Broker[], unassigned as Lead[]),
    [leads, brokers, unassigned]
  );

  const [expanded, setExpanded] = useState<string | null>(null);

  const brokerNameById = useMemo(() => {
    const map = new Map<string, string>();
    (brokers as Broker[]).forEach((b) => map.set(b.id, b.first_name || "—"));
    return map;
  }, [brokers]);

  const activeBrokers = useMemo(
    () => (brokers as Broker[]).filter((b) => b.lead_assignment_enabled !== false),
    [brokers]
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
          const isExpandable = a.kind === "charge_consolidated" || a.kind === "ausentes_consolidated";
          const isOpen = expanded === a.id;
          const handleClick = () => {
            if (isExpandable) {
              setExpanded(isOpen ? null : a.id);
              return;
            }
            if (a.kind === "show_unassigned") {
              onShowUnassigned?.();
            }
          };
          return (
            <motion.button
              key={a.id}
              onClick={handleClick}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group rounded-xl p-3.5 text-left transition-all border cursor-pointer relative"
              style={{
                background: isOpen
                  ? `linear-gradient(135deg, ${a.color}25, rgba(24,24,27,0.7))`
                  : `linear-gradient(135deg, ${a.color}10, rgba(24,24,27,0.6))`,
                borderColor: isOpen ? `${a.color}80` : `${a.color}40`,
                boxShadow: isOpen ? `0 0 0 1px ${a.color}40 inset, 0 0 14px ${a.color}30` : "none",
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
                className="flex items-center gap-1 mt-2.5 text-[11px] font-bold transition"
                style={{ color: a.color, opacity: isOpen ? 1 : 0.0 }}
              >
                {isExpandable ? (
                  <>
                    {isOpen ? "Recolher" : a.cta}
                    <ChevronDown
                      className="w-3 h-3 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                    />
                  </>
                ) : (
                  <>
                    {a.cta} <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </div>
              {!isOpen && (
                <div
                  className="flex items-center gap-1 mt-2.5 text-[11px] font-bold opacity-0 group-hover:opacity-100 transition absolute bottom-3.5 left-3.5"
                  style={{ color: a.color }}
                >
                  {isExpandable ? (
                    <>{a.cta}<ChevronDown className="w-3 h-3" /></>
                  ) : (
                    <>{a.cta} <ArrowRight className="w-3 h-3" /></>
                  )}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Expansão inline: lista de leads (Cobrar ou Ausentes) */}
      <AnimatePresence>
        {expanded && (() => {
          const action = actions.find((a) => a.id === expanded);
          if (!action || (action.kind !== "charge_consolidated" && action.kind !== "ausentes_consolidated")) return null;
          const list = (action.payload?.leads || []) as Lead[];
          const isCobrar = action.kind === "charge_consolidated";
          const accent = action.color;
          const headline = isCobrar
            ? `${list.length} lead${list.length > 1 ? "s" : ""} respondeu, corretor não`
            : `${list.length} lead${list.length > 1 ? "s" : ""} de corretores ausentes`;
          const sortedList = list.slice().sort((a, b) => {
            if (isCobrar) {
              return hoursSince(b.last_lead_response_at) - hoursSince(a.last_lead_response_at);
            }
            return hoursSince(b.last_interaction_at) - hoursSince(a.last_interaction_at);
          });
          return (
            <motion.div
              key={`exp-${expanded}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3 overflow-hidden"
            >
              <div
                className="rounded-xl border"
                style={{ background: `${accent}08`, borderColor: `${accent}50` }}
              >
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between"
                  style={{ borderColor: `${accent}30` }}
                >
                  <p className="text-xs font-bold flex items-center gap-2" style={{ color: accent }}>
                    {isCobrar ? <Flame className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {headline}
                  </p>
                  <button
                    onClick={() => setExpanded(null)}
                    className="p-1 rounded hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-[380px] overflow-y-auto" style={{}}>
                  <div className="divide-y" style={{ borderColor: `${accent}10` }}>
                    {sortedList.map((l) => {
                      const respH = hoursSince(l.last_lead_response_at);
                      const lastH = hoursSince(l.last_interaction_at);
                      const broker = brokerNameById.get(l.broker_id || "") || "—";
                      const subline = isCobrar
                        ? `${broker} · respondeu há ${formatHours(respH)} · ${l.status}`
                        : `${broker} (ausente) · sem ação há ${formatHours(lastH)} · ${l.status}`;
                      return (
                        <div key={l.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-100 truncate">
                              {l.name || l.phone || "Lead"}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{subline}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => onOpenLead?.(l)}
                              title="Ler conversa"
                              className="p-1.5 rounded-md bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-slate-100 border border-slate-700/40 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {!isCobrar ? null : (
                              <button
                                onClick={() => onChargeLead?.(l)}
                                title="Alertar corretor"
                                className="p-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition flex items-center gap-1"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onRedistributeLead && (
                              <RedistMenu
                                leadId={l.id}
                                currentBrokerId={l.broker_id || undefined}
                                brokers={activeBrokers}
                                onPick={(bid) => onRedistributeLead(l.id, bid)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ─── Mini-menu: Redistribuir → escolher novo corretor ───────────────────────
// Usa position: fixed pra escapar do scroll do painel pai (max-h overflow-y-auto).
function RedistMenu({
  currentBrokerId,
  brokers,
  onPick,
}: {
  leadId: string;
  currentBrokerId?: string;
  brokers: Broker[];
  onPick: (newBrokerId: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const candidates = brokers.filter((b) => b.id !== currentBrokerId);
  const MENU_WIDTH = 180;
  const MENU_MAX_H = 260;

  function recalc() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Por padrão abre embaixo, alinhado à direita do botão
    let top = r.bottom + 4;
    let left = r.right - MENU_WIDTH;
    // Se for cortar embaixo, abre pra cima
    if (top + MENU_MAX_H > vh - 8) top = Math.max(8, r.top - MENU_MAX_H - 4);
    // Se for cortar à esquerda, gruda na borda
    if (left < 8) left = 8;
    if (left + MENU_WIDTH > vw - 8) left = vw - MENU_WIDTH - 8;
    setCoords({ top, left });
  }

  function handleToggle() {
    if (!open) recalc();
    setOpen((v) => !v);
  }

  // Fecha em qualquer scroll/resize enquanto aberto (anchor moveria)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Redistribuir"
        className="p-1.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      {open && coords && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setOpen(false)}
          />
          <div
            className="z-[61] rounded-lg bg-slate-900 border border-slate-700 shadow-2xl py-1 overflow-y-auto"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: MENU_WIDTH,
              maxHeight: MENU_MAX_H,
              overscrollBehavior: "contain",
              boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              Mover para:
            </p>
            {candidates.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-slate-500">Nenhum corretor ativo</p>
            ) : (
              candidates.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onPick(b.id);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-300 transition"
                >
                  {b.first_name || "—"}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
