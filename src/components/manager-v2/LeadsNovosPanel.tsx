// LeadsNovosPanel — painel expandido do card "Leads novos"
// Seletor de período + 4 KPIs + lista com mini-pipeline de automação por lead.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Bell, RotateCcw, Hand, Sparkles, MessageCircle, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  welcome_template_id?: string | null;
  welcome_responded_at?: string | null;
  followup_started_at?: string | null;
  ai_qualification_attempts?: number | null;
  ai_qualified_at?: string | null;
}

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

type Period = "today" | "3d" | "7d";

interface Props {
  allLeads: Lead[];
  brokers: Broker[];
  brokerMap: Map<string, string>;
  onMonitor: (lead: Lead) => void;
  onCharge: (lead: Lead) => void;
  onRedist: (leadId: string, newBrokerId: string) => void;
}

function hoursSince(iso: string | null | undefined) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function formatHours(h: number) {
  if (h === Infinity) return "—";
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

function periodHours(p: Period) {
  if (p === "today") return 24;
  if (p === "3d") return 72;
  return 168;
}

export default function LeadsNovosPanel({
  allLeads,
  brokers,
  brokerMap,
  onMonitor,
  onCharge,
  onRedist,
}: Props) {
  const [period, setPeriod] = useState<Period>("today");
  const [iaLeadIds, setIaLeadIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const cutoff = Date.now() - periodHours(period) * 3600000;
    return allLeads
      .filter((l) => new Date(l.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [allLeads, period]);

  // Lazy: detecta IA respondendo via ia_messages (sender_type='ia')
  useEffect(() => {
    if (filtered.length === 0) {
      setIaLeadIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = filtered.map((l) => l.id);
      const { data } = await supabase
        .from("ia_messages")
        .select("lead_id")
        .in("lead_id", ids)
        .eq("sender_type", "ia")
        .limit(2000);
      if (cancelled) return;
      const set = new Set<string>();
      (data || []).forEach((row: any) => row.lead_id && set.add(row.lead_id));
      setIaLeadIds(set);
    })();
    return () => {
      cancelled = true;
    };
  }, [filtered]);

  // KPIs (descontando leads jovens demais pra ter recebido boas-vindas — < 5min)
  const kpis = useMemo(() => {
    const eligible = filtered.filter((l) => hoursSince(l.created_at) > 0.083);
    const total = filtered.length;
    const welcomeCount = filtered.filter(
      (l) => l.welcome_template_id || l.welcome_responded_at
    ).length;
    const iaCount = filtered.filter((l) => iaLeadIds.has(l.id)).length;
    const brokerCount = filtered.filter((l) => l.last_broker_whatsapp_at).length;
    return {
      total,
      eligible: eligible.length,
      welcomeCount,
      welcomePct: total > 0 ? Math.round((welcomeCount / total) * 100) : 0,
      iaCount,
      iaPct: total > 0 ? Math.round((iaCount / total) * 100) : 0,
      brokerCount,
      brokerPct: total > 0 ? Math.round((brokerCount / total) * 100) : 0,
    };
  }, [filtered, iaLeadIds]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "var(--crm-card)",
        borderColor: "rgba(56,189,248,0.4)",
        boxShadow: "0 0 24px rgba(56,189,248,0.10)",
      }}
    >
      {/* Header com seletor de período */}
      <div className="px-4 py-2.5 border-b border-slate-800/60 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Leads novos
          <span className="text-slate-500 font-normal">({kpis.total} no período)</span>
        </h3>
        <div className="flex gap-1">
          {(
            [
              { v: "today", label: "Hoje" },
              { v: "3d", label: "3d" },
              { v: "7d", label: "7d" },
            ] as const
          ).map((p) => {
            const active = period === p.v;
            return (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v)}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold transition"
                style={{
                  background: active ? "rgba(6,182,212,0.18)" : "var(--crm-glass)",
                  border: `1px solid ${active ? "rgba(6,182,212,0.5)" : "rgba(51,65,85,0.5)"}`,
                  color: active ? "#06B6D4" : "#94A3B8",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800/40">
        <Kpi label="Entrou" value={kpis.total} sub="" color="#06B6D4" icon={Sparkles} />
        <Kpi
          label="Boas-vindas"
          value={kpis.welcomeCount}
          sub={`${kpis.welcomePct}%`}
          color="#10B981"
          icon={Hand}
          warn={kpis.total > 0 && kpis.welcomePct < 70}
        />
        <Kpi
          label="IA conversou"
          value={kpis.iaCount}
          sub={`${kpis.iaPct}%`}
          color="#A78BFA"
          icon={MessageCircle}
        />
        <Kpi
          label="Corretor entrou"
          value={kpis.brokerCount}
          sub={`${kpis.brokerPct}%`}
          color="#F59E0B"
          icon={UserCheck}
          warn={kpis.total > 5 && kpis.brokerPct < 50}
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Nenhum lead novo no período.</p>
      ) : (
        <div className="divide-y divide-slate-800/50 max-h-[420px] overflow-y-auto">
          {filtered.slice(0, 30).map((l) => {
            const broker = l.broker_id ? brokerMap.get(l.broker_id) : null;
            const hasWelcome = !!(l.welcome_template_id || l.welcome_responded_at);
            const hasIa = iaLeadIds.has(l.id);
            const hasBroker = !!l.last_broker_whatsapp_at;
            const ageH = hoursSince(l.created_at);
            return (
              <div
                key={l.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-100 truncate">
                    {l.name || l.phone || "Lead"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    {broker ? (
                      <span>👤 {broker}</span>
                    ) : (
                      <span className="text-amber-400 font-bold">sem corretor</span>
                    )}
                    <span>·</span>
                    <span>📥 há {formatHours(ageH)}</span>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] uppercase tracking-wider">
                      {l.status.replace("_", " ").toLowerCase()}
                    </span>
                  </div>
                  {/* Mini pipeline */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <PipelineDot ok={hasWelcome} label="Boas-vindas" color="#10B981" />
                    <PipelineDot ok={hasIa} label="IA" color="#A78BFA" />
                    <PipelineDot ok={hasBroker} label="Corretor" color="#F59E0B" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ActionBtn icon={Eye} color="#06B6D4" onClick={() => onMonitor(l)} />
                  {l.broker_id && (
                    <ActionBtn icon={Bell} color="#EF4444" onClick={() => onCharge(l)} />
                  )}
                  <RedistMenu
                    candidates={brokers.filter((b) => b.id !== l.broker_id)}
                    onPick={(bid) => onRedist(l.id, bid)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > 30 && (
        <div className="px-4 py-2 border-t border-slate-800/60 text-center text-[11px] text-slate-500">
          Mostrando 30 de {filtered.length}.
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  sub,
  color,
  icon: Icon,
  warn,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
  icon: any;
  warn?: boolean;
}) {
  return (
    <div className="bg-slate-950/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
        <Icon className="w-3 h-3" style={{ color }} />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
          {value}
        </span>
        {sub && (
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: warn ? "#F59E0B" : "#475569" }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function PipelineDot({ ok, label, color }: { ok: boolean; label: string; color: string }) {
  return (
    <span
      title={`${label}: ${ok ? "ok" : "pendente"}`}
      className="flex items-center gap-1 text-[10px]"
      style={{ color: ok ? color : "#475569" }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: ok ? color : "transparent",
          border: ok ? "none" : "1px solid #475569",
        }}
      />
      {label}
    </span>
  );
}

function ActionBtn({
  icon: Icon,
  color,
  onClick,
}: {
  icon: any;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="w-7 h-7 rounded-md flex items-center justify-center transition border"
      style={{ background: `${color}15`, borderColor: `${color}40`, color }}
    >
      <Icon className="w-3.5 h-3.5" />
    </motion.button>
  );
}

// Mini-menu redistribuir com position:fixed (escapa do scroll do painel)
function RedistMenu({
  candidates,
  onPick,
}: {
  candidates: Broker[];
  onPick: (id: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const MENU_WIDTH = 200;
  const MENU_MAX_H = 280;

  function recalc() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let top = r.bottom + 4;
    let left = r.right - MENU_WIDTH;
    if (top + MENU_MAX_H > vh - 8) top = Math.max(8, r.top - MENU_MAX_H - 4);
    if (left < 8) left = 8;
    if (left + MENU_WIDTH > vw - 8) left = vw - MENU_WIDTH - 8;
    setCoords({ top, left });
  }

  function handleToggle() {
    if (!open) recalc();
    setOpen((v) => !v);
  }

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
      <motion.button
        ref={btnRef}
        onClick={handleToggle}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="w-7 h-7 rounded-md flex items-center justify-center transition border"
        style={{ background: "#A78BFA15", borderColor: "#A78BFA40", color: "#A78BFA" }}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </motion.button>
      {open && coords && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="z-[61] rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-2 overflow-y-auto"
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
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 mb-1">
              Mover pra:
            </p>
            {candidates.length === 0 ? (
              <p className="text-xs text-slate-500 px-2 py-2">Sem outros corretores no time.</p>
            ) : (
              candidates.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onPick(b.id);
                    setOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-violet-500/15 hover:text-violet-200 rounded transition"
                >
                  {b.first_name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
