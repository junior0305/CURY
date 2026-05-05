// SmartActionCards — 4 cards expansíveis: Quentes, Parados, Sem corretor, Respostas.
// Click no card → expande lista inline com ações inline (👁️ 🔔 🔄).

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Clock, UserX, MessageSquare, Eye, Bell, RotateCcw,
  ChevronDown, ChevronRight,
} from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  broker_id: string | null;
  created_at: string;
  last_interaction_at: string | null;
  last_lead_response_at?: string | null;
  last_broker_whatsapp_at?: string | null;
  contact_attempts?: number | null;
  tag?: string | null;
}

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  leads: Lead[];
  brokers: Broker[];
  unassigned: Lead[];
  managerId: string;
  onMonitor: (lead: Lead) => void;
  onCharge: (lead: Lead) => void;
  onRedist: (leadId: string, newBrokerId: string) => void;
}

function hoursSince(iso: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function formatHours(h: number) {
  if (h === Infinity) return "—";
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function SmartActionCards({ leads, brokers, unassigned, onMonitor, onCharge, onRedist }: Props) {
  const brokerMap = useMemo(() => {
    const m = new Map<string, string>();
    brokers.forEach((b) => m.set(b.id, b.first_name || "—"));
    return m;
  }, [brokers]);

  // Categorias
  const categories = useMemo(() => {
    const quentes = leads.filter((l) => {
      if (!l.last_lead_response_at) return false;
      const respH = hoursSince(l.last_lead_response_at);
      const brokerH = l.last_broker_whatsapp_at ? hoursSince(l.last_broker_whatsapp_at) : Infinity;
      return respH > 0 && respH < 48 && brokerH > respH;
    });

    const parados = leads.filter((l) => {
      if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)) return false;
      const lastH = hoursSince(l.last_interaction_at);
      return lastH > 24;
    });

    const respostasNovas = leads.filter((l) => {
      if (!l.last_lead_response_at) return false;
      return hoursSince(l.last_lead_response_at) < 6;
    });

    return [
      {
        id: "quentes",
        label: "Esperando você",
        sub: "lead respondeu, broker não",
        count: quentes.length,
        leads: quentes,
        color: "#EF4444",
        icon: Flame,
        urgent: quentes.length > 0,
      },
      {
        id: "respostas",
        label: "Respostas novas",
        sub: "última 6h",
        count: respostasNovas.length,
        leads: respostasNovas,
        color: "#F472B6",
        icon: MessageSquare,
        urgent: respostasNovas.length > 0,
      },
      {
        id: "parados",
        label: "Parados +24h",
        sub: "sem interação recente",
        count: parados.length,
        leads: parados,
        color: "#F59E0B",
        icon: Clock,
        urgent: parados.length > 5,
      },
      {
        id: "sem-corretor",
        label: "Sem corretor",
        sub: "fila órfã",
        count: unassigned.length,
        leads: unassigned,
        color: "#A78BFA",
        icon: UserX,
        urgent: unassigned.length > 0,
      },
    ];
  }, [leads, unassigned]);

  const [expanded, setExpanded] = useState<string | null>(
    categories.find((c) => c.urgent)?.id || null
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          Ação no time
        </h2>
        <span className="text-[11px] text-slate-600">click em cada card pra expandir</span>
      </div>

      {/* Grid de 4 smart cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {categories.map((cat) => {
          const isOpen = expanded === cat.id;
          const Icon = cat.icon;
          return (
            <motion.button
              key={cat.id}
              onClick={() => setExpanded(isOpen ? null : cat.id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-xl p-3.5 text-left border transition-all relative overflow-hidden"
              style={{
                background: isOpen
                  ? `linear-gradient(135deg, ${cat.color}18, rgba(24,24,27,0.7))`
                  : `linear-gradient(135deg, ${cat.color}08, rgba(24,24,27,0.5))`,
                borderColor: isOpen ? `${cat.color}80` : `${cat.color}30`,
                boxShadow: isOpen ? `0 0 24px ${cat.color}30` : "none",
              }}
            >
              {cat.urgent && cat.count > 0 && (
                <motion.div
                  className="absolute top-2 right-2 w-2 h-2 rounded-full"
                  style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}` }}
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}40` }}
                >
                  <Icon className="w-4 h-4" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-3xl font-black tabular-nums leading-none"
                      style={{ color: cat.color }}
                    >
                      {cat.count}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-200 mt-1">{cat.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{cat.sub}</p>
                </div>
                <ChevronDown
                  className="w-4 h-4 text-slate-500 shrink-0 transition-transform"
                  style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Lista expandida */}
      <AnimatePresence mode="wait">
        {expanded && (
          <motion.div
            key={expanded}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mt-2.5"
          >
            <ExpandedList
              category={categories.find((c) => c.id === expanded)!}
              brokerMap={brokerMap}
              brokers={brokers}
              onMonitor={onMonitor}
              onCharge={onCharge}
              onRedist={onRedist}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ExpandedList({
  category,
  brokerMap,
  brokers,
  onMonitor,
  onCharge,
  onRedist,
}: {
  category: { id: string; label: string; color: string; leads: Lead[] };
  brokerMap: Map<string, string>;
  brokers: Broker[];
  onMonitor: (lead: Lead) => void;
  onCharge: (lead: Lead) => void;
  onRedist: (leadId: string, newBrokerId: string) => void;
}) {
  const list = category.leads.slice(0, 12);
  const [redistOpen, setRedistOpen] = useState<string | null>(null);

  if (list.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ background: "rgba(24,24,27,0.4)", borderColor: `${category.color}30` }}
      >
        <p className="text-sm text-slate-400">Nada nesta categoria. ✨</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "rgba(24,24,27,0.6)",
        borderColor: `${category.color}40`,
        boxShadow: `0 0 24px ${category.color}10`,
      }}
    >
      <div className="px-4 py-2.5 border-b border-slate-800/60 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300">
          {category.label}{" "}
          <span className="text-slate-500 font-normal">({category.leads.length} total)</span>
        </h3>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <div className="divide-y divide-slate-800/50">
        {list.map((lead) => {
          const lastH = hoursSince(lead.last_interaction_at);
          const respH = hoursSince(lead.last_lead_response_at || null);
          const broker = lead.broker_id ? brokerMap.get(lead.broker_id) : null;
          return (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{lead.name}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                  {broker ? (
                    <span>👤 {broker}</span>
                  ) : (
                    <span className="text-amber-400 font-bold">sem corretor</span>
                  )}
                  <span>·</span>
                  <span>📥 {formatHours(lastH)}</span>
                  {category.id === "quentes" && respH < Infinity && (
                    <>
                      <span>·</span>
                      <span className="text-red-400 font-bold">
                        respondeu há {formatHours(respH)}
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[11px] uppercase tracking-wider">
                    {lead.status.replace("_", " ").toLowerCase()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 relative">
                <ActionBtn icon={Eye} label="Ver" color="#06B6D4"
                  onClick={() => onMonitor(lead)} />
                {broker && (
                  <ActionBtn icon={Bell} label="Cobrar" color="#EF4444"
                    onClick={() => onCharge(lead)} />
                )}
                <ActionBtn icon={RotateCcw} label="Mover" color="#A78BFA"
                  onClick={() => setRedistOpen(redistOpen === lead.id ? null : lead.id)} />

                {/* Popover de redistribuir */}
                {redistOpen === lead.id && (
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2 min-w-[180px]"
                    style={{ boxShadow: "0 12px 24px rgba(0,0,0,0.6)" }}
                  >
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 mb-1">
                      Mover pra:
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      {brokers.filter((b) => b.id !== lead.broker_id).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => { onRedist(lead.id, b.id); setRedistOpen(null); }}
                          className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-violet-500/15 hover:text-violet-200 rounded transition"
                        >
                          {b.first_name}
                        </button>
                      ))}
                      {brokers.filter((b) => b.id !== lead.broker_id).length === 0 && (
                        <p className="text-xs text-slate-500 px-2 py-2">Sem outros corretores no time.</p>
                      )}
                    </div>
                    <button
                      onClick={() => setRedistOpen(null)}
                      className="w-full text-left px-2 py-1 text-[10px] text-slate-600 hover:text-slate-400 mt-1 border-t border-slate-800"
                    >
                      cancelar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      {category.leads.length > list.length && (
        <div className="px-4 py-2.5 border-t border-slate-800/60 text-center">
          <button className="text-xs text-slate-400 hover:text-slate-200 transition">
            Ver todos ({category.leads.length}) →
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, color, onClick,
}: { icon: any; label: string; color: string; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      title={label}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition border"
      style={{
        background: `${color}10`,
        borderColor: `${color}30`,
        color,
      }}
    >
      <Icon className="w-3.5 h-3.5" />
    </motion.button>
  );
}
