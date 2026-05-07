// SmartActionCards — 4 cards expansíveis: Quentes, Parados, Sem corretor, Respostas.
// Click no card → expande lista inline com ações inline (👁️ 🔔 🔄).

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Eye, Bell, RotateCcw, Sparkles, Trash2, Zap, Undo2,
  ChevronDown, ChevronRight,
} from "lucide-react";
import LeadsNovosPanel from "@/components/manager-v2/LeadsNovosPanel";

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
  lost_reason?: string | null;
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
  onRestore?: (leadId: string) => void;
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

export default function SmartActionCards({ leads, brokers, onMonitor, onCharge, onRedist, onRestore }: Props) {
  const brokerMap = useMemo(() => {
    const m = new Map<string, string>();
    brokers.forEach((b) => m.set(b.id, b.first_name || "—"));
    return m;
  }, [brokers]);

  // Categorias
  const categories = useMemo(() => {
    const parados = leads.filter((l) => {
      if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)) return false;
      const lastH = hoursSince(l.last_interaction_at);
      return lastH > 24;
    });

    const novosHoje = leads.filter((l) => hoursSince(l.created_at) < 24);

    // SLA: lead com corretor mas SEM 1ª resposta do broker há +2h, ainda em status ativo
    const semResposta = leads.filter((l) => {
      if (!l.broker_id) return false;
      if (l.last_broker_whatsapp_at) return false;
      if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)) return false;
      const ageH = hoursSince(l.created_at);
      return ageH >= 2;
    });

    // Descartados pelos corretores (status=ABANDONED)
    const descartados = leads.filter((l) => l.status === "ABANDONED");

    return [
      {
        id: "leads-novos",
        label: "Leads novos",
        sub: "hoje · click pra ver período",
        count: novosHoje.length,
        leads: novosHoje,
        color: "#06B6D4",
        icon: Sparkles,
        urgent: false,
      },
      {
        id: "sem-resposta-2h",
        label: "Sem 1ª resposta",
        sub: "+2h · SLA estourando",
        count: semResposta.length,
        leads: semResposta,
        color: "#EF4444",
        icon: Zap,
        urgent: semResposta.length > 0,
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
        id: "descarte",
        label: "Descartados",
        sub: "click pra restaurar",
        count: descartados.length,
        leads: descartados,
        color: "#94A3B8",
        icon: Trash2,
        urgent: false,
      },
    ];
  }, [leads]);

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
                  ? `linear-gradient(135deg, ${cat.color}18, var(--crm-card-strong))`
                  : `linear-gradient(135deg, ${cat.color}08, var(--crm-card-soft))`,
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
            {expanded === "leads-novos" ? (
              <LeadsNovosPanel
                allLeads={leads as any}
                brokers={brokers}
                brokerMap={brokerMap}
                onMonitor={onMonitor}
                onCharge={onCharge}
                onRedist={onRedist}
              />
            ) : (
              <ExpandedList
                category={categories.find((c) => c.id === expanded)!}
                brokerMap={brokerMap}
                brokers={brokers}
                onMonitor={onMonitor}
                onCharge={onCharge}
                onRedist={onRedist}
                onRestore={onRestore}
              />
            )}
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
  onRestore,
}: {
  category: { id: string; label: string; color: string; leads: Lead[] };
  brokerMap: Map<string, string>;
  brokers: Broker[];
  onMonitor: (lead: Lead) => void;
  onCharge: (lead: Lead) => void;
  onRedist: (leadId: string, newBrokerId: string) => void;
  onRestore?: (leadId: string) => void;
}) {
  const list = category.leads.slice(0, 12);
  const [redistOpen, setRedistOpen] = useState<string | null>(null);

  if (list.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ background: "var(--crm-card-soft)", borderColor: `${category.color}30` }}
      >
        <p className="text-sm text-slate-400">Nada nesta categoria. ✨</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "var(--crm-card)",
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
                  {category.id === "sem-resposta-2h" && (
                    <>
                      <span>·</span>
                      <span className="text-red-400 font-bold">
                        sem 1ª msg há {formatHours(hoursSince(lead.created_at))}
                      </span>
                    </>
                  )}
                  {category.id === "descarte" && (lead as any).lost_reason && (
                    <>
                      <span>·</span>
                      <span className="text-amber-400 font-medium" title="Motivo do descarte">
                        ⚠️ {String((lead as any).lost_reason).replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                  {category.id !== "sem-resposta-2h" && category.id !== "descarte" && (
                    <>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[11px] uppercase tracking-wider">
                        {lead.status.replace("_", " ").toLowerCase()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 relative">
                <ActionBtn icon={Eye} label="Ver" color="#06B6D4"
                  onClick={() => onMonitor(lead)} />
                {category.id === "descarte" && onRestore && (
                  <ActionBtn icon={Undo2} label="Restaurar" color="#10B981"
                    onClick={() => onRestore(lead.id)} />
                )}
                {broker && category.id !== "descarte" && (
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
