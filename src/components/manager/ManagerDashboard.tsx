import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchTeamBrokers, toggleBrokerPresence } from "@/integrations/supabase/profiles";
import { fetchTeamLeads, fetchUnassignedLeads, updateLeadBroker } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import { LOST_REASON_LABEL } from "@/types/lead";
import type { User } from "@/types/user";
import { toast } from "sonner";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import {
  LogOut, Trophy, AlertTriangle, Zap,
  CheckCircle2, Clock, UserCheck, UserX, GitMerge,
  RefreshCw, TrendingUp, Target, Shield,
  Bell, X, Send, Trash2, RotateCcw, Filter, Eye,
  Search, MessageSquare, Phone, Brain, Bot, Flame, Minus,
  Loader2, Sparkles,
} from "lucide-react";
import { LeadMonitorDrawer } from "./LeadMonitorDrawer";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(16,185,129,0.3)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function brokerSemaphore(broker: User, leads: Lead[]): "green" | "yellow" | "red" | "off" {
  if (!broker.leadAssignmentEnabled) return "off";
  const bl = leads.filter(l => l.brokerId === broker.id);
  const lastContact = bl
    .map(l => l.lastBrokerWhatsappAt)
    .filter(Boolean)
    .map(d => new Date(d!).getTime())
    .sort((a, b) => b - a)[0];
  if (!lastContact) return "red";
  const h = (Date.now() - lastContact) / 3600000;
  if (h < 1) return "green";
  if (h < 4) return "yellow";
  return "red";
}

const SEMAPHORE_COLORS = {
  green:  { neon: "#10B981", label: "Ativo",   bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)" },
  yellow: { neon: "#F59E0B", label: "Regular", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)" },
  red:    { neon: "#EF4444", label: "Inativo", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.3)" },
  off:    { neon: "#334155", label: "Ausente", bg: "rgba(15,23,42,0.4)",   border: "rgba(51,65,85,0.3)" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NEW:        { label: "Novo",       color: "#00D4FF" },
  ATTENDING:  { label: "Atendendo",  color: "#818CF8" },
  VISIT:      { label: "Visita",     color: "#F59E0B" },
  DOCS:       { label: "Docs",       color: "#A78BFA" },
  CONCLUDED:  { label: "Venda",      color: "#10B981" },
  ABANDONED:  { label: "Descartado", color: "#EF4444" },
  NO_CONTACT: { label: "S/ Contato", color: "#475569" },
};

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimNum({ value }: { value: number }) {
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    let step = 0; const steps = 18;
    const diff = value - disp;
    if (diff === 0) return;
    const t = setInterval(() => {
      step++;
      setDisp(Math.round(disp + diff * (step / steps)));
      if (step >= steps) { clearInterval(t); setDisp(value); }
    }, 18);
    return () => clearInterval(t);
  }, [value]);
  return <>{disp}</>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, neon, pulse, delay = 0 }: {
  label: string; value: number | string; icon: React.ElementType;
  neon: string; pulse?: boolean; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="relative rounded-2xl p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{ background: `${neon}08`, border: `1px solid ${neon}30`, boxShadow: `0 0 16px ${neon}0A` }}
    >
      <div className="absolute top-0 left-4 right-4 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${neon}60,transparent)` }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${pulse ? "animate-pulse" : ""}`} style={{ color: neon }} />
      </div>
      <p className="text-2xl font-black leading-none" style={{ color: neon, textShadow: `0 0 16px ${neon}50` }}>
        {typeof value === "number" ? <AnimNum value={value} /> : value}
      </p>
    </motion.div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, color = "#00D4FF", count }: {
  label: string; icon: React.ElementType; color?: string; count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
      {count !== undefined && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>{count}</span>
      )}
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }} />
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className ?? ""}`}
      style={{ background: "var(--crm-surface, rgba(8,11,20,0.7))", border: "1px solid var(--crm-border-mid, #1E293B)" }}>
      {children}
    </div>
  );
}

// ─── Corrida para a Meta ─────────────────────────────────────────────────────

function MetaCorrida({ teamId, brokers, teamLeads }: {
  teamId: string | null;
  brokers: User[];
  teamLeads: Lead[];
}) {
  const [goal, setGoal]       = useState<number | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Início e fim do mês atual
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStr   = monthStart.toLocaleDateString("pt-BR", { month: "long" });

  // Dias restantes no mês
  const daysInMonth    = monthEnd.getDate() === 1
    ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    : 30;
  const dayOfMonth     = now.getDate();
  const daysRemaining  = Math.max(1, daysInMonth - dayOfMonth);

  useEffect(() => {
    if (!teamId) { setLoaded(true); return; }
    const ms = monthStart.toISOString().slice(0, 10);
    const me = monthEnd.toISOString().slice(0, 10);
    supabase.from("team_goals").select("sales_target")
      .eq("team_id", teamId)
      .eq("goal_type", "monthly")
      .gte("month", ms).lt("month", me)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        setGoal((data as any)?.[0]?.sales_target ?? null);
        setLoaded(true);
      });
  }, [teamId]);

  // Vendas do mês por corretor (CONCLUDED com last_interaction_at no mês)
  const brokerStats = useMemo(() => {
    return brokers.map(b => {
      const myLeads   = teamLeads.filter(l => l.brokerId === b.id);
      const vendas    = myLeads.filter(l => {
        if (l.status !== "CONCLUDED") return false;
        const d = new Date(l.lastInteractionAt || l.createdAt);
        return d >= monthStart && d < monthEnd;
      }).length;
      const emDocs    = myLeads.filter(l => l.status === "DOCS_REQUESTED").length;
      const emVisita  = myLeads.filter(l => ["VISIT_SCHEDULED","VISITA_AGENDADA"].includes(l.status)).length;
      const pipeline  = emDocs + emVisita;
      return { broker: b, vendas, emDocs, emVisita, pipeline };
    }).sort((a, b) => b.vendas - a.vendas || b.pipeline - a.pipeline);
  }, [brokers, teamLeads]);

  const totalVendas   = brokerStats.reduce((s, b) => s + b.vendas, 0);
  const totalPipeline = brokerStats.reduce((s, b) => s + b.pipeline, 0);

  // Ritmo
  const ritmoAtual    = dayOfMonth > 0 ? (totalVendas / dayOfMonth) : 0;
  const ritmoNecessario = goal ? Math.max(0, (goal - totalVendas) / daysRemaining) : 0;
  const metaIndividual  = goal && brokers.length > 0 ? Math.ceil(goal / brokers.length) : null;

  if (!loaded) return null;

  if (!teamId) {
    return (
      <div className="shrink-0 mx-4 mt-2 rounded-xl px-4 py-2 flex items-center gap-3"
        style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <Target className="w-3.5 h-3.5" style={{ color: "#EF4444" }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#EF4444" }}>
          Perfil sem equipe vinculada — peça ao admin para associar sua equipe em Usuários
        </span>
      </div>
    );
  }

  const pct   = goal ? Math.min(100, Math.round((totalVendas / goal) * 100)) : 0;
  const color = !goal ? "#475569" : pct >= 90 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444";
  const statusLabel = !goal ? "Sem Meta" : pct >= 90 ? "No Prazo" : pct >= 60 ? "Em Risco" : "Abaixo";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="shrink-0 mx-4 mt-2 rounded-xl overflow-hidden"
      style={{ border: `1px solid ${color}30`, background: `${color}08` }}
    >
      {/* ── Barra compacta ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:opacity-90 transition-opacity"
      >
        <Target className="w-4 h-4 shrink-0" style={{ color }} />

        {/* Barra de progresso */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
              Meta {monthStr}: {totalVendas} / {goal ?? "—"} vendas
            </span>
            <div className="flex items-center gap-2">
              {goal && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                  {statusLabel} · {pct}%
                </span>
              )}
              {totalPipeline > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
                  🔥 {totalPipeline} no pipeline
                </span>
              )}
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${color}70, ${color})`, boxShadow: `0 0 8px ${color}50` }}
            />
          </div>
        </div>

        {/* Ritmo */}
        {goal && (
          <div className="shrink-0 text-right hidden sm:block">
            <p className="text-[9px] uppercase tracking-wider" style={{ color: "#475569" }}>Ritmo</p>
            <p className="text-[11px] font-black" style={{ color: ritmoAtual >= ritmoNecessario ? "#10B981" : "#EF4444" }}>
              {ritmoAtual.toFixed(1)}<span className="font-normal text-[9px]">/dia</span>
            </p>
          </div>
        )}

        {/* Dias restantes */}
        <div className="shrink-0 text-right hidden sm:block">
          <p className="text-[9px] uppercase tracking-wider" style={{ color: "#475569" }}>Restam</p>
          <p className="text-[11px] font-black" style={{ color: "#94A3B8" }}>{daysRemaining}d</p>
        </div>

        {/* Toggle */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
          style={{ color: "#334155" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>

      {/* ── Seção expandida ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t" style={{ borderColor: `${color}20` }}>

              {/* ── Painel de ritmo ── */}
              <div className="grid grid-cols-4 gap-2 py-3">
                {[
                  { label: "Vendas no mês",  value: totalVendas,  sub: `meta: ${goal ?? "—"}`,        c: color },
                  { label: "Ritmo atual",    value: `${ritmoAtual.toFixed(1)}/d`,  sub: "vendas/dia",   c: ritmoAtual >= ritmoNecessario ? "#10B981" : "#EF4444" },
                  { label: "Ritmo necessário", value: `${ritmoNecessario.toFixed(1)}/d`, sub: `em ${daysRemaining} dias`, c: "#F59E0B" },
                  { label: "Pipeline quente",value: totalPipeline, sub: "docs + visitas",              c: "#10B981" },
                ].map(item => (
                  <div key={item.label} className="rounded-lg p-2 text-center"
                    style={{ background: `${item.c}08`, border: `1px solid ${item.c}20` }}>
                    <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>{item.label}</p>
                    <p className="text-base font-black" style={{ color: item.c }}>{item.value}</p>
                    <p className="text-[9px]" style={{ color: "#334155" }}>{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* ── Tabela de corretores ── */}
              {!goal && (
                <p className="text-[10px] text-center py-2" style={{ color: "#475569" }}>
                  Meta não definida — acesse Admin → Financeiro → Metas para configurar
                </p>
              )}

              {brokerStats.length > 0 && (
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  {/* Cabeçalho */}
                  <div className="grid text-[9px] font-black uppercase tracking-wider px-3 py-1.5"
                    style={{ background: "rgba(255,255,255,0.03)", color: "#334155",
                      gridTemplateColumns: "1fr 60px 60px 60px 100px 50px 50px" }}>
                    <span>Corretor</span>
                    <span className="text-center">Meta Ind.</span>
                    <span className="text-center">Vendas</span>
                    <span className="text-center">%</span>
                    <span className="text-center">Progresso</span>
                    <span className="text-center">Docs</span>
                    <span className="text-center">Visita</span>
                  </div>

                  {/* Linhas */}
                  {brokerStats.map(({ broker, vendas, emDocs, emVisita }, i) => {
                    const indTarget = metaIndividual ?? 0;
                    const indPct    = indTarget > 0 ? Math.min(100, Math.round((vendas / indTarget) * 100)) : 0;
                    const rowColor  = !indTarget ? "#475569" : indPct >= 90 ? "#10B981" : indPct >= 50 ? "#F59E0B" : "#EF4444";
                    const isLast    = i === brokerStats.length - 1;

                    return (
                      <motion.div
                        key={broker.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="grid items-center px-3 py-2 text-xs"
                        style={{
                          gridTemplateColumns: "1fr 60px 60px 60px 100px 50px 50px",
                          borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.03)",
                          borderBottom: isLast ? "none" : undefined,
                        }}
                      >
                        {/* Nome */}
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0"
                            style={{ background: `${rowColor}20`, color: rowColor, border: `1px solid ${rowColor}40` }}>
                            {initials(broker.name)}
                          </div>
                          <span className="font-semibold truncate" style={{ color: "#CBD5E1" }}>
                            {broker.name.split(" ")[0]}
                          </span>
                        </div>

                        {/* Meta individual */}
                        <span className="text-center font-bold" style={{ color: "#475569" }}>
                          {indTarget || "—"}
                        </span>

                        {/* Vendas */}
                        <span className="text-center font-black" style={{ color: rowColor }}>
                          {vendas}
                        </span>

                        {/* % */}
                        <span className="text-center font-bold text-[10px]" style={{ color: rowColor }}>
                          {indTarget > 0 ? `${indPct}%` : "—"}
                        </span>

                        {/* Barra */}
                        <div className="px-1">
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${indPct}%` }}
                              transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                              className="h-full rounded-full"
                              style={{ background: rowColor, boxShadow: `0 0 4px ${rowColor}60` }}
                            />
                          </div>
                        </div>

                        {/* Docs */}
                        <span className="text-center font-bold text-[11px]"
                          style={{ color: emDocs > 0 ? "#10B981" : "#1E293B" }}>
                          {emDocs > 0 ? `${emDocs} 📄` : "—"}
                        </span>

                        {/* Visita */}
                        <span className="text-center font-bold text-[11px]"
                          style={{ color: emVisita > 0 ? "#F59E0B" : "#1E293B" }}>
                          {emVisita > 0 ? `${emVisita} 🏠` : "—"}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Nota de alerta se muito abaixo do ritmo */}
              {goal && ritmoNecessario > ritmoAtual * 1.5 && (
                <div className="mt-2 rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-[10px]" style={{ color: "#EF4444" }}>
                    ⚡ Ritmo necessário ({ritmoNecessario.toFixed(1)}/dia) é {Math.round(ritmoNecessario / Math.max(ritmoAtual, 0.1))}x o ritmo atual.
                    Foque em converter os {totalPipeline} leads do pipeline (docs + visita) — são os mais próximos da venda.
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Alert Modal ─────────────────────────────────────────────────────────────

function AlertModal({ broker, fromId, lead, onClose }: {
  broker: User; fromId: string; lead?: { id: string; name: string }; onClose: () => void;
}) {
  const [msg, setMsg]                   = useState("");
  const [sending, setSending]           = useState(false);
  const [managerBotId, setManagerBotId] = useState<string | null>(null);
  const [botReady, setBotReady]         = useState<boolean | null>(null); // null=loading
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Resolve bot do gerente: FK direto → busca por nome → qualquer conectado
  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("bot_instance_id, first_name, full_name")
        .eq("id", fromId)
        .maybeSingle();

      // 1. FK já configurado
      if (profile?.bot_instance_id) {
        setManagerBotId(profile.bot_instance_id);
        setBotReady(true);
        return;
      }

      // 2. Resolve pelo nome (instância tem mesmo nome do usuário)
      const firstName = profile?.first_name || profile?.full_name?.split(" ")[0] || "";
      if (firstName) {
        const { data: botByName } = await supabase
          .from("bot_instances")
          .select("id, status")
          .ilike("name", `%${firstName}%`)
          .limit(1)
          .maybeSingle();
        if (botByName?.id) {
          setManagerBotId(botByName.id);
          setBotReady(true);
          return;
        }
      }

      // 3. Fallback: qualquer instância ativa (connected OU open — Evolution API usa "open")
      const { data: anyBot } = await supabase
        .from("bot_instances")
        .select("id")
        .in("status", ["connected", "open"])
        .limit(1)
        .maybeSingle();
      if (anyBot?.id) {
        setManagerBotId(anyBot.id);
        setBotReady(true);
      } else {
        setBotReady(false);
      }
    })();
  }, [fromId]);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);

    // 1. Salva notificação interna
    const { error } = await supabase.from("internal_notifications").insert({
      from_id: fromId,
      to_id: broker.id,
      message: msg.trim(),
      type: "MANAGER_ALERT",
    });

    if (error) { setSending(false); toast.error("Erro: " + error.message); return; }

    // 2. Envia via WhatsApp pelo bot do gerente (se tiver phone e bot configurado)
    let whatsappSent = false;
    let whatsappError = "";

    if (!broker.phone) {
      whatsappError = "corretor sem telefone";
    } else if (!managerBotId) {
      whatsappError = "nenhum bot configurado";
    } else {
      console.log("[AlertModal] Enviando WhatsApp — botId:", managerBotId, "phone:", broker.phone);
      const { data: result, error: fnError } = await supabase.functions.invoke("send_whatsapp_message", {
        body: {
          botId: managerBotId,
          phone: broker.phone,
          message: `🔔 *Alerta do Gerente*\n\n${lead ? `📌 Lead: *${lead.name}*\n\n` : ""}${msg.trim()}`,
        },
      });
      console.log("[AlertModal] Resultado:", result, "Erro fn:", fnError);
      whatsappSent = result?.success || false;
      if (!whatsappSent) whatsappError = fnError?.message || result?.error || `HTTP ${result?.status || "?"}`;

      // Fallback: se o bot do gerente falhou, tenta qualquer conectado
      if (!whatsappSent) {
        console.log("[AlertModal] Bot primário falhou, tentando fallback...");
        const { data: fallbacks } = await supabase
          .from("bot_instances").select("id, name")
          .in("status", ["connected", "open"]).neq("id", managerBotId).limit(3);
        for (const fb of fallbacks || []) {
          const { data: fbRes, error: fbErr } = await supabase.functions.invoke("send_whatsapp_message", {
            body: { botId: fb.id, phone: broker.phone, message: `🔔 *Alerta do Gerente*\n\n${msg.trim()}` },
          });
          console.log("[AlertModal] Fallback", fb.name, ":", fbRes, fbErr);
          if (fbRes?.success) { whatsappSent = true; whatsappError = ""; break; }
        }
      }
    }

    setSending(false);
    if (whatsappSent) {
      toast.success(`✅ Alerta enviado para ${broker.name.split(" ")[0]} — Dashboard + WhatsApp`);
    } else if (whatsappError) {
      toast.warning(`🔔 Alerta salvo no Dashboard. WhatsApp falhou: ${whatsappError}`);
    } else {
      toast.success(`🔔 Alerta salvo para ${broker.name.split(" ")[0]} no Dashboard`);
    }
    onClose();
  };

  const QUICK = lead
    ? [
        `Responda o cliente *${lead.name}* agora!`,
        `Retorne a ligação perdida de *${lead.name}*.`,
        `Atualize o status de *${lead.name}*.`,
        `Agende uma visita com *${lead.name}* hoje.`,
      ]
    : [
        "Responda o cliente agora!",
        "Retorne essa ligação perdida.",
        "Atualize o status do lead.",
        "Agende uma visita hoje.",
      ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: "var(--crm-surface-hex, #0D1117)", border: "1px solid rgba(0,212,255,0.25)", boxShadow: "0 0 40px rgba(0,212,255,0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
              style={{ background: "rgba(0,212,255,0.15)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)" }}>
              {initials(broker.name)}
            </div>
            <div>
              <p className="text-sm font-black text-white">{broker.name.split(" ")[0]}</p>
              {lead ? (
                <p className="text-[10px]" style={{ color: "#00D4FF" }}>Lead: {lead.name}</p>
              ) : (
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "#475569" }}>Enviar alerta</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "#475569" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Channel indicators */}
        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#475569" }}>Canais:</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">Dashboard</span>
          </div>
          {botReady === null ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.2)" }}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: "#64748B" }} />
              <span className="text-[10px] font-bold" style={{ color: "#64748B" }}>WhatsApp</span>
            </div>
          ) : botReady && broker.phone ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400">WhatsApp</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-[10px] font-bold text-red-400">
                {!broker.phone ? "Sem telefone" : "Sem bot"}
              </span>
            </div>
          )}
        </div>

        {/* Quick messages */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK.map(q => (
            <button key={q} onClick={() => setMsg(q)}
              className="text-[10px] px-2.5 py-1 rounded-full transition-all hover:opacity-80"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
              {q}
            </button>
          ))}
        </div>

        {/* Text area */}
        <textarea
          ref={inputRef}
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Escreva o alerta personalizado..."
          rows={3}
          className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.2)", color: "#e2e8f0" }}
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) send(); }}
        />
        <p className="text-[10px] mt-1 mb-3" style={{ color: "#334155" }}>Ctrl+Enter para enviar</p>

        <button
          onClick={send}
          disabled={sending || !msg.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
          style={{
            background: msg.trim() ? "linear-gradient(135deg, #0044cc, #0066ff)" : "rgba(255,255,255,0.04)",
            color: msg.trim() ? "#fff" : "#334155",
            border: `1px solid ${msg.trim() ? "rgba(0,212,255,0.4)" : "#1E293B"}`,
            boxShadow: msg.trim() ? "0 0 16px rgba(0,170,255,0.3)" : "none",
          }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? "Enviando..." : botReady && broker.phone ? "Enviar — Dashboard + WhatsApp" : "Enviar — Dashboard"}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type RightTab  = "equipe" | "velocidade" | "ranking";
type LeftPanel = "urgente" | "recentes" | "redistribuir" | "descarte" | "busca";
type RecentWindow = 6 | 12 | 24;

export default function ManagerDashboard() {
  const { user, signOut } = useAuth();
  const { t } = useTheme();
  const queryClient       = useQueryClient();
  const [lastUpdated, setLastUpdated]   = useState(new Date());
  const [xpData, setXpData]             = useState<Record<string, { xp: number; level: number; levelName: string }>>({});
  const [rightTab, setRightTab]         = useState<RightTab>("equipe");
  const [expandedUrgente, setExpandedUrgente] = useState<"nocontact" | "unassigned" | "stalled" | null>("nocontact");
  const [leftPanel, setLeftPanel]       = useState<LeftPanel>("urgente");
  const [alertBroker, setAlertBroker]   = useState<{ broker: User; lead?: { id: string; name: string } } | null>(null);
  const [monitorLead, setMonitorLead]   = useState<Lead | null>(null);
  const [teamId, setTeamId]             = useState<string | null>(null);
  const [redistFilter, setRedistFilter] = useState<string>("todos");
  const [searchQuery, setSearchQuery]   = useState<string>("");
  const [mobileView, setMobileView]     = useState<"leads" | "equipe">("leads");
  const [recentWindow, setRecentWindow] = useState<RecentWindow>(24);
  const [recentOnlyNew, setRecentOnlyNew] = useState<boolean>(false);

  // Manager's team_id
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => setTeamId(data?.team_id ?? null));
  }, [user?.id]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: brokers = [], isLoading: loadingBrokers } = useQuery<User[]>({
    queryKey: ["teamBrokers", user?.id],
    queryFn: () => fetchTeamBrokers(user!.id),
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  const brokerIds = useMemo(() => brokers.map(b => b.id), [brokers]);

  const { data: teamLeads = [], isLoading: loadingLeads } = useQuery<Lead[]>({
    queryKey: ["teamLeads", brokerIds],
    queryFn: () => fetchTeamLeads(brokerIds),
    enabled: brokerIds.length > 0,
    refetchInterval: 30000,
  });

  const { data: unassigned = [] } = useQuery<Lead[]>({
    queryKey: ["unassignedLeads"],
    queryFn: fetchUnassignedLeads,
    refetchInterval: 30000,
  });

  // Lead states da equipe para o painel de Inteligência
  const teamLeadIds = useMemo(() => teamLeads.map(l => l.id), [teamLeads]);
  const { data: leadStates = [] } = useQuery<any[]>({
    queryKey: ["teamLeadStates", teamLeadIds],
    queryFn: async () => {
      if (!teamLeadIds.length) return [];
      const { data } = await supabase
        .from("lead_state")
        .select("lead_id, intencao, tema, momento, modo, bloqueado, ultimo_evento, atualizado_em")
        .in("lead_id", teamLeadIds);
      return data || [];
    },
    enabled: teamLeadIds.length > 0,
    refetchInterval: 30000,
  });

  const leadStateMap = useMemo(() => {
    const map: Record<string, any> = {};
    leadStates.forEach(s => { map[s.lead_id] = s; });
    return map;
  }, [leadStates]);

  // XP
  useEffect(() => {
    if (!brokerIds.length) return;
    supabase.from("broker_xp").select("broker_id, total_xp, level, level_name")
      .in("broker_id", brokerIds)
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach(d => { map[d.broker_id] = { xp: d.total_xp, level: d.level, levelName: d.level_name }; });
        setXpData(map);
      });
  }, [brokerIds]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("manager-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
        queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
        setLastUpdated(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: ({ leadId, brokerId }: { leadId: string; brokerId: string }) =>
      updateLeadBroker(leadId, brokerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      toast.success("Lead redistribuído!");
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const discardRestore = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase.from("leads")
        .update({ status: "NEW", broker_id: null })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
      toast.success("Lead restaurado para fila!");
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const [presencePending, setPresencePending] = useState<string | null>(null);
  const presenceMutation = useMutation({
    mutationFn: ({ id, present }: { id: string; present: boolean }) =>
      toggleBrokerPresence(id, present),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teamBrokers"] }),
    onError: (err: any) => toast.error("Erro: " + err.message),
    onSettled: () => setPresencePending(null),
  });

  // ── Computed metrics ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const activeLeads = teamLeads.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status));
    const stalled     = activeLeads.filter(l => hoursAgo(l.lastInteractionAt || l.createdAt) > 24);
    const weekAgo     = Date.now() - 7 * 86400000;
    const sales7d     = teamLeads.filter(l =>
      l.status === "CONCLUDED" && new Date(l.lastInteractionAt).getTime() > weekAgo
    ).length;
    const newToday    = teamLeads.filter(l => new Date(l.createdAt).toDateString() === today).length;
    const present     = brokers.filter(b => b.leadAssignmentEnabled).length;
    const discarded   = teamLeads.filter(l => l.status === "ABANDONED").length;
    return {
      present, total: brokers.length, active: activeLeads.length,
      stalled: stalled.length, sales7d, newToday,
      unassigned: unassigned.length, discarded,
    };
  }, [brokers, teamLeads, unassigned]);

  const stalledLeads = useMemo(() =>
    teamLeads
      .filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)
        && hoursAgo(l.lastInteractionAt || l.createdAt) > 24)
      .sort((a, b) => hoursAgo(b.lastInteractionAt || b.createdAt) - hoursAgo(a.lastInteractionAt || a.createdAt))
      .slice(0, 30),
    [teamLeads]
  );

  const discardedLeads = useMemo(() =>
    teamLeads.filter(l => l.status === "ABANDONED")
      .sort((a, b) => new Date(b.lastInteractionAt || b.createdAt).getTime() - new Date(a.lastInteractionAt || a.createdAt).getTime()),
    [teamLeads]
  );

  const allActiveLeads = useMemo(() => {
    let leads = teamLeads.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status));
    if (redistFilter !== "todos") leads = leads.filter(l => l.brokerId === redistFilter);
    return leads.sort((a, b) => hoursAgo(b.lastInteractionAt || b.createdAt) - hoursAgo(a.lastInteractionAt || a.createdAt));
  }, [teamLeads, redistFilter]);

  const brokerMap = useMemo(() => Object.fromEntries(brokers.map(b => [b.id, b])), [brokers]);

  // Leads sem nenhum contato do bot há mais de 2h (crítico)
  const noContactLeads = useMemo(() =>
    teamLeads
      .filter(l =>
        l.brokerId &&
        !l.lastBrokerWhatsappAt &&
        !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status) &&
        hoursAgo(l.createdAt) >= 2
      )
      .sort((a, b) => hoursAgo(b.createdAt) - hoursAgo(a.createdAt)),
    [teamLeads]
  );

  // Velocidade de resposta
  const velocidadeStats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const uncontacted = teamLeads
      .filter(l => l.brokerId && !l.lastBrokerWhatsappAt && !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status))
      .map(l => ({ ...l, minsWaiting: Math.floor((now - new Date(l.createdAt).getTime()) / 60000) }))
      .sort((a, b) => b.minsWaiting - a.minsWaiting);
    const brokerTimes: Record<string, number[]> = {};
    teamLeads
      .filter(l => l.lastBrokerWhatsappAt && new Date(l.createdAt).getTime() > weekAgo && l.brokerId)
      .forEach(l => {
        const mins = Math.floor((new Date(l.lastBrokerWhatsappAt!).getTime() - new Date(l.createdAt).getTime()) / 60000);
        if (mins >= 0 && mins < 1440) {
          if (!brokerTimes[l.brokerId!]) brokerTimes[l.brokerId!] = [];
          brokerTimes[l.brokerId!].push(mins);
        }
      });
    const brokerAvg = Object.fromEntries(
      Object.entries(brokerTimes).map(([id, times]) => [
        id, Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      ])
    );
    return { uncontacted, brokerAvg };
  }, [teamLeads]);

  const rankingRows = useMemo(() =>
    brokers.map(broker => {
      const bl        = teamLeads.filter(l => l.brokerId === broker.id);
      const concluded = bl.filter(l => l.status === "CONCLUDED").length;
      const active    = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
      const xp        = xpData[broker.id] || { xp: 0, level: 1, levelName: "Recruta" };
      const sem       = brokerSemaphore(broker, teamLeads);
      return { broker, concluded, active, xp, sem };
    }).sort((a, b) => b.concluded - a.concluded),
    [brokers, teamLeads, xpData]
  );

  const presentBrokers = brokers.filter(b => b.leadAssignmentEnabled);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, "");

    // Score por relevância: match em nome > phone > tag > corretor > status
    const scored: { lead: Lead; score: number }[] = [];
    for (const lead of teamLeads) {
      const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
      const name   = (lead.name || "").toLowerCase();
      const phone  = (lead.phone || "").replace(/\D/g, "");
      const tag    = (lead.tag || "").toLowerCase();
      const bName  = (broker?.name || "").toLowerCase();
      const stLbl  = (STATUS_LABELS[lead.status]?.label || "").toLowerCase();

      let score = 0;
      if (name.startsWith(q))                                        score = Math.max(score, 100);
      else if (name.includes(q))                                     score = Math.max(score, 80);
      // phone: só se a query tiver pelo menos 3 dígitos
      if (qDigits.length >= 3 && phone.includes(qDigits))            score = Math.max(score, 70);
      if (tag.includes(q))                                           score = Math.max(score, 50);
      if (bName.includes(q))                                         score = Math.max(score, 30);
      if (stLbl.includes(q))                                         score = Math.max(score, 10);

      if (score > 0) scored.push({ lead, score });
    }

    return scored
      .sort((a, b) => b.score - a.score || new Date(b.lead.createdAt).getTime() - new Date(a.lead.createdAt).getTime())
      .map(s => s.lead);
  }, [searchQuery, teamLeads, brokerMap]);

  if (loadingBrokers) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00D4FF" }} />
      </div>
    );
  }

  return (
    <div
      className="crm-themed flex flex-col h-screen overflow-hidden"
      style={{
        background: t.bg,
        backgroundImage: `
          linear-gradient(${t.gridLine} 1px, transparent 1px),
          linear-gradient(90deg, ${t.gridLine} 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
        color: t.text,
      }}
    >

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 h-12 z-10"
        style={{ borderBottom: "1px solid rgba(0,212,255,0.1)", background: t.surfaceAlpha }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <img src="/comandra-logo.png" alt="Comandra" className="h-7 w-7 object-contain shrink-0"
            style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.7))" }} />
          <div>
            <p className="font-black text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em]"
              style={{ color: t.text, textShadow: "0 0 12px rgba(0,212,255,0.4)" }}>
              <span className="hidden sm:inline">Centro de Comando</span>
              <span className="sm:hidden">Comando</span>
            </p>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: t.textSubtle }}>
              {brokers.length} corretores · {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>

        {/* Semáforo rápido */}
        <div className="hidden sm:flex items-center gap-1.5">
          {brokers.map(b => {
            const sem = brokerSemaphore(b, teamLeads);
            const c   = SEMAPHORE_COLORS[sem];
            return (
              <div key={b.id} title={`${b.name} — ${c.label}`}
                className="w-2 h-2 rounded-full"
                style={{ background: c.neon, boxShadow: sem !== "off" ? `0 0 5px ${c.neon}` : "none" }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button onClick={signOut}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{ color: t.textSubtle }}
            onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
            onMouseLeave={e => (e.currentTarget.style.color = t.textSubtle)}
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </header>

      {/* ── WHATSAPP BANNER ─────────────────────────────────────────────────── */}
      <WhatsAppQRBanner />

      {/* ── CORRIDA PARA A META ─────────────────────────────────────────────── */}
      <MetaCorrida teamId={teamId} brokers={brokers} teamLeads={teamLeads} />

      {/* ── KPI BAR ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-7 gap-1.5 sm:gap-2 px-3 sm:px-4 pt-2 pb-0">
        <KpiCard delay={0.00} label="Presentes"    value={`${stats.present}/${stats.total}`} icon={UserCheck}     neon={stats.present < stats.total ? "#F59E0B" : "#10B981"} />
        <KpiCard delay={0.04} label="Novos hoje"   value={stats.newToday}                    icon={Zap}           neon="#00D4FF" />
        <KpiCard delay={0.08} label="Ativos"       value={stats.active}                      icon={Target}        neon="#818CF8" />
        <KpiCard delay={0.12} label="Parados +24h" value={stats.stalled}                     icon={AlertTriangle} neon={stats.stalled > 0 ? "#EF4444" : "#10B981"} pulse={stats.stalled > 0} />
        <KpiCard delay={0.16} label="Sem corretor" value={stats.unassigned}                  icon={UserX}         neon={stats.unassigned > 0 ? "#EF4444" : "#10B981"} pulse={stats.unassigned > 0} />
        <KpiCard delay={0.20} label="Descartados"  value={stats.discarded}                   icon={Trash2}        neon={stats.discarded > 0 ? "#F59E0B" : "#334155"} />
        <KpiCard delay={0.24} label="Vendas 7d"    value={stats.sales7d}                     icon={Trophy}        neon="#F59E0B" />
      </div>

      {/* ── MAIN SPLIT ──────────────────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden gap-3 p-3 min-h-0 pb-16 md:pb-3">

        {/* ── ESQUERDA ─────────────────────────────────────────────────────── */}
        <div className={`flex-col gap-2 overflow-y-auto md:overflow-hidden md:min-h-0 w-full md:flex-[55] md:w-auto ${mobileView === "leads" ? "flex" : "hidden"} md:flex`}>

          {/* Left panel tabs — desktop: flex fixo / mobile: scroll horizontal */}
          <div className="flex gap-1.5 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {([
              { v: "urgente",      label: "Urgentes",     icon: AlertTriangle, color: "#EF4444" },
              { v: "recentes",     label: "Recentes",     icon: Sparkles,      color: "#A78BFA" },
              { v: "redistribuir", label: "Redistribuir", icon: RotateCcw,     color: "#00D4FF" },
              { v: "descarte",     label: "Descarte",     icon: Trash2,        color: "#F59E0B", badge: stats.discarded },
              { v: "busca",        label: "Buscar",       icon: Search,        color: "#10B981" },
            ] as { v: LeftPanel; label: string; icon: React.ElementType; color: string; badge?: number }[]).map(tab => (
              <button key={tab.v} onClick={() => setLeftPanel(tab.v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 md:flex-1 md:justify-center relative"
                style={leftPanel === tab.v ? {
                  background: `${tab.color}15`,
                  color: tab.color,
                  border: `1px solid ${tab.color}40`,
                  boxShadow: `0 0 10px ${tab.color}20`,
                } : {
                  background: "var(--crm-glass, rgba(8,11,20,0.6))",
                  color: "var(--crm-text-subtle, #334155)",
                  border: "1px solid var(--crm-border-mid, #1E293B)",
                }}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                    style={{ background: tab.color, color: "#000" }}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── URGENTES ────────────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {leftPanel === "urgente" && (
              <motion.div key="urgente" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
                className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">

                {/* ── Card 1: Sem contato >2h ── */}
                {(() => {
                  const isOpen = expandedUrgente === "nocontact";
                  const count  = noContactLeads.length;
                  const color  = "#EF4444";
                  return (
                    <div className="rounded-2xl overflow-hidden shrink-0"
                      style={{ border: `1px solid ${count > 0 ? "rgba(239,68,68,0.35)" : "#1E293B"}`, background: count > 0 ? "rgba(239,68,68,0.05)" : "var(--crm-glass)" }}>
                      <button
                        onClick={() => setExpandedUrgente(isOpen ? null : "nocontact")}
                        className="w-full flex items-center gap-3 px-4 py-3 transition-all"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${count > 0 ? "animate-pulse" : ""}`}
                          style={{ background: count > 0 ? "rgba(239,68,68,0.15)" : "rgba(51,65,85,0.3)", border: `1px solid ${count > 0 ? "rgba(239,68,68,0.3)" : "#1E293B"}` }}>
                          <Bot className="w-4 h-4" style={{ color: count > 0 ? color : "#334155" }} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-black" style={{ color: count > 0 ? "#fff" : "#475569" }}>Bot nunca enviou</p>
                          <p className="text-[10px]" style={{ color: count > 0 ? "#F87171" : "#334155" }}>
                            {count === 0 ? "Todos os leads foram contatados" : `${count} lead${count > 1 ? "s" : ""} sem 1º contato há +2h`}
                          </p>
                        </div>
                        <span className="text-lg font-black shrink-0" style={{ color: count > 0 ? color : "#334155" }}>{count}</span>
                        <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      <AnimatePresence>
                        {isOpen && count > 0 && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden">
                            <div className="px-3 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
                              {noContactLeads.map((lead, i) => {
                                const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                                const h = Math.floor(hoursAgo(lead.createdAt));
                                return (
                                  <div key={lead.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                                      <p className="text-[10px]" style={{ color: "#475569" }}>
                                        {broker?.name.split(" ")[0] || "—"} · {h}h sem contato
                                      </p>
                                    </div>
                                    {broker && (
                                      <button onClick={() => setAlertBroker({ broker, lead: { id: lead.id, name: lead.name } })}
                                        className="p-1.5 rounded-lg shrink-0 transition hover:scale-105"
                                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#F87171" }}>
                                        <Bell className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}

                {/* ── Card 2: Sem corretor ── */}
                {(() => {
                  const isOpen = expandedUrgente === "unassigned";
                  const count  = unassigned.length;
                  const color  = "#F59E0B";
                  return (
                    <div className="rounded-2xl overflow-hidden shrink-0"
                      style={{ border: `1px solid ${count > 0 ? "rgba(245,158,11,0.35)" : "#1E293B"}`, background: count > 0 ? "rgba(245,158,11,0.04)" : "var(--crm-glass)" }}>
                      <button
                        onClick={() => setExpandedUrgente(isOpen ? null : "unassigned")}
                        className="w-full flex items-center gap-3 px-4 py-3 transition-all"
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: count > 0 ? "rgba(245,158,11,0.15)" : "rgba(51,65,85,0.3)", border: `1px solid ${count > 0 ? "rgba(245,158,11,0.3)" : "#1E293B"}` }}>
                          <UserX className="w-4 h-4" style={{ color: count > 0 ? color : "#334155" }} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-black" style={{ color: count > 0 ? "#fff" : "#475569" }}>Sem corretor</p>
                          <p className="text-[10px]" style={{ color: count > 0 ? "#FCD34D" : "#334155" }}>
                            {count === 0 ? "Todos os leads estão atribuídos" : `${count} lead${count > 1 ? "s" : ""} na fila sem atribuição`}
                          </p>
                        </div>
                        <span className="text-lg font-black shrink-0" style={{ color: count > 0 ? color : "#334155" }}>{count}</span>
                        <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      <AnimatePresence>
                        {isOpen && count > 0 && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden">
                            <div className="px-3 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
                              {unassigned.map(lead => (
                                <div key={lead.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                                  style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                                    <p className="text-[10px]" style={{ color: "#475569" }}>
                                      {Math.floor(hoursAgo(lead.createdAt))}h · {lead.tag || "sem tag"}
                                    </p>
                                  </div>
                                  <Select onValueChange={brokerId => assignMutation.mutate({ leadId: lead.id, brokerId })}>
                                    <SelectTrigger className="w-28 h-7 text-xs rounded-lg shrink-0"
                                      style={{ borderColor: "rgba(245,158,11,0.3)", background: "var(--crm-surface)", color: "var(--crm-text-muted,#94A3B8)" }}>
                                      <SelectValue placeholder="Atribuir..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {presentBrokers.map(b => (
                                        <SelectItem key={b.id} value={b.id} className="text-xs">{b.name.split(" ")[0]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}

                {/* ── Card 3: Parados +24h ── */}
                {(() => {
                  const isOpen = expandedUrgente === "stalled";
                  const count  = stalledLeads.length;
                  const color  = count > 0 ? "#F59E0B" : "#10B981";
                  return (
                    <div className="rounded-2xl overflow-hidden shrink-0 flex-1 min-h-0 flex flex-col"
                      style={{ border: `1px solid ${count > 0 ? "rgba(245,158,11,0.25)" : "#1E293B"}`, background: "var(--crm-glass)" }}>
                      <button
                        onClick={() => setExpandedUrgente(isOpen ? null : "stalled")}
                        className="w-full flex items-center gap-3 px-4 py-3 transition-all shrink-0"
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: count > 0 ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.1)", border: `1px solid ${count > 0 ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.2)"}` }}>
                          <Clock className="w-4 h-4" style={{ color }} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-black" style={{ color: count > 0 ? "#fff" : "#10B981" }}>Parados +24h</p>
                          <p className="text-[10px]" style={{ color: count > 0 ? "#FCD34D" : "#10B981" }}>
                            {count === 0 ? "Equipe em dia! Nenhum lead parado" : `${count} lead${count > 1 ? "s" : ""} sem interação há mais de 24h`}
                          </p>
                        </div>
                        <span className="text-lg font-black shrink-0" style={{ color }}>{count}</span>
                        <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      <AnimatePresence>
                        {isOpen && count > 0 && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden flex-1 min-h-0">
                            <div className="px-3 pb-3 space-y-1.5 max-h-64 overflow-y-auto">
                              {stalledLeads.map((lead, i) => {
                                const h      = Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt));
                                const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                                const urgent = h > 48;
                                return (
                                  <div key={lead.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                                    style={{ background: urgent ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.04)", border: `1px solid ${urgent ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.12)"}` }}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs font-black" style={{ color: urgent ? "#F87171" : "#FCD34D" }}>{h}h</span>
                                        <span className="text-xs" style={{ color: "#475569" }}>{broker?.name.split(" ")[0] || "—"}</span>
                                      </div>
                                    </div>
                                    <button onClick={() => setMonitorLead(lead)}
                                      className="p-1.5 rounded-lg shrink-0 transition hover:scale-105"
                                      style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    {broker && (
                                      <button onClick={() => setAlertBroker({ broker, lead: { id: lead.id, name: lead.name } })}
                                        className="p-1.5 rounded-lg shrink-0 transition hover:scale-105"
                                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#F87171" }}>
                                        <Bell className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ── REDISTRIBUIR ──────────────────────────────────────────────── */}
            {leftPanel === "redistribuir" && (
              <motion.div key="redistribuir" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
                className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
                <Panel className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <SectionHeader label="Todos os Leads Ativos" icon={RotateCcw} color="#00D4FF" count={allActiveLeads.length} />
                    <div className="flex items-center gap-1.5 ml-auto shrink-0">
                      <Filter className="w-3 h-3" style={{ color: "#475569" }} />
                      <select
                        value={redistFilter}
                        onChange={e => setRedistFilter(e.target.value)}
                        className="text-[10px] rounded-lg px-2 py-1 font-bold"
                        style={{ background: "#111827", border: "1px solid #1E293B", color: "#94A3B8" }}
                      >
                        <option value="todos">Todos os corretores</option>
                        {brokers.map(b => (
                          <option key={b.id} value={b.id}>{b.name.split(" ")[0]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {allActiveLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: "#334155" }}>
                      <CheckCircle2 className="w-8 h-8" style={{ color: "#10B981" }} />
                      <p className="text-sm font-bold" style={{ color: "#10B981" }}>Sem leads ativos</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                      {allActiveLeads.map((lead, i) => {
                        const broker  = lead.brokerId ? brokerMap[lead.brokerId] : null;
                        const h       = Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt));
                        const st      = STATUS_LABELS[lead.status] ?? { label: lead.status, color: "#475569" };
                        return (
                          <motion.div key={lead.id}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                            style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.1)" }}
                          >
                            <div className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: st.color, boxShadow: `0 0 4px ${st.color}` }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${st.color}20`, color: st.color }}>{st.label}</span>
                                <span className="text-[10px]" style={{ color: "#334155" }}>
                                  {broker?.name.split(" ")[0] || "Sem corretor"} · {h}h
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => setMonitorLead(lead)}
                              className="p-1.5 rounded-lg shrink-0 transition hover:scale-105"
                              title="Monitorar conversa"
                              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <Select
                              defaultValue={lead.brokerId || ""}
                              onValueChange={brokerId => assignMutation.mutate({ leadId: lead.id, brokerId })}
                            >
                              <SelectTrigger className="w-28 h-7 text-xs rounded-lg shrink-0"
                                style={{ borderColor: "rgba(0,212,255,0.2)", background: "var(--crm-surface)", color: "var(--crm-text-muted,#94A3B8)" }}>
                                <SelectValue placeholder="Mover..." />
                              </SelectTrigger>
                              <SelectContent>
                                {brokers.map(b => (
                                  <SelectItem key={b.id} value={b.id} className="text-xs">{b.name.split(" ")[0]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </motion.div>
            )}

            {/* ── DESCARTE ──────────────────────────────────────────────────── */}
            {leftPanel === "descarte" && (
              <motion.div key="descarte" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
                className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <Panel className="flex-1 min-h-0 flex flex-col">
                  <SectionHeader label="Repositório de Descarte" icon={Trash2} color="#F59E0B" count={discardedLeads.length} />
                  <p className="text-[10px] mb-3" style={{ color: "#334155" }}>
                    Leads descartados pelos corretores. Restaure para retrabalho sem perder histórico.
                  </p>
                  {discardedLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: "#334155" }}>
                      <Trash2 className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Nenhum lead descartado</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                      {discardedLeads.map((lead, i) => {
                        const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                        return (
                          <motion.div key={lead.id}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                            style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)" }}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#F59E0B" }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                              <p className="text-[10px]" style={{ color: "#475569" }}>
                                {broker?.name.split(" ")[0] || "—"} · {lead.tag || "sem tag"}
                                {(lead as any).notes && ` · "${(lead as any).notes.slice(0, 30)}..."`}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 max-w-full"
                                  style={{
                                    background: lead.lostReason ? "rgba(239,68,68,0.1)" : "rgba(148,163,184,0.08)",
                                    color: lead.lostReason ? "#EF4444" : "#94A3B8",
                                    border: `1px solid ${lead.lostReason ? "rgba(239,68,68,0.25)" : "rgba(148,163,184,0.2)"}`,
                                  }}
                                  title={lead.lostReason ? "Motivo do descarte" : "Sem motivo registrado"}>
                                  ⚠️ <span className="truncate">{lead.lostReason ? LOST_REASON_LABEL[lead.lostReason] : "Sem motivo"}</span>
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => discardRestore.mutate(lead.id)}
                              disabled={discardRestore.isPending}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all hover:opacity-80 shrink-0"
                              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restaurar
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </motion.div>
            )}
            {/* ── BUSCA ──────────────────────────────────────────────────────── */}
            {leftPanel === "busca" && (
              <motion.div key="busca" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
                className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">

                {/* Campo de busca */}
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "#10B981" }} />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Nome, telefone, tag, corretor ou status..."
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "var(--crm-surface)",
                      border: searchQuery ? "1px solid rgba(16,185,129,0.5)" : "1px solid var(--crm-border-mid)",
                      color: "var(--crm-text)",
                      boxShadow: searchQuery ? "0 0 0 3px rgba(16,185,129,0.08)" : "none",
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition hover:opacity-80"
                      style={{ background: "var(--crm-glass)", color: "var(--crm-text-muted)" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Resultados */}
                <Panel className="flex-1 min-h-0 flex flex-col">
                  {!searchQuery ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <Search className="w-5 h-5" style={{ color: "#10B981" }} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold" style={{ color: "var(--crm-text)" }}>Buscar na base da equipe</p>
                        <p className="text-[11px] mt-1" style={{ color: "var(--crm-text-muted)" }}>
                          {teamLeads.length} leads disponíveis para busca
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {["Nome", "Telefone", "Tag", "Corretor", "Status"].map(hint => (
                          <span key={hint} className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981" }}>
                            {hint}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8">
                      <Search className="w-8 h-8 opacity-20" style={{ color: "var(--crm-text-muted)" }} />
                      <p className="text-sm font-bold" style={{ color: "var(--crm-text-muted)" }}>
                        Nenhum resultado para "{searchQuery}"
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#10B981" }}>
                          {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
                          "{searchQuery}"
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                        {searchResults.map((lead, i) => {
                          const broker  = lead.brokerId ? brokerMap[lead.brokerId] : null;
                          const st      = STATUS_LABELS[lead.status];
                          const h       = hoursAgo(lead.lastInteractionAt || lead.createdAt);
                          const stale   = h > 24;
                          const phone   = lead.phone?.replace(/\D/g, "");
                          const waLink  = phone ? `https://wa.me/55${phone}` : null;
                          return (
                            <motion.div key={lead.id}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i * 0.03, 0.3) }}
                              className="rounded-xl px-3 py-2.5"
                              style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}
                            >
                              <div className="flex items-start gap-2">
                                {/* Status dot */}
                                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                  style={{ background: st?.color || "#475569", boxShadow: stale ? "0 0 5px #EF4444" : "none" }} />

                                <div className="flex-1 min-w-0">
                                  {/* Nome + badge */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold truncate" style={{ color: "var(--crm-text)" }}>
                                      {highlightMatch(lead.name, searchQuery)}
                                    </span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                                      style={{ background: `${st?.color}18`, color: st?.color, border: `1px solid ${st?.color}30` }}>
                                      {st?.label}
                                    </span>
                                    {stale && (
                                      <span className="text-[9px] font-bold text-red-400">⚡ {Math.floor(h)}h</span>
                                    )}
                                  </div>

                                  {/* Telefone + tag */}
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[11px]" style={{ color: "#00D4FF" }}>
                                      {highlightMatch(lead.phone || "", searchQuery)}
                                    </span>
                                    {lead.tag && (
                                      <>
                                        <span style={{ color: "var(--crm-text-subtle)" }}>·</span>
                                        <span className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
                                          {highlightMatch(lead.tag, searchQuery)}
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  {/* Corretor */}
                                  {broker && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black"
                                        style={{ background: "linear-gradient(135deg,#7C3AED,#00D4FF)", color: "#fff" }}>
                                        {initials(broker.name)}
                                      </div>
                                      <span className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
                                        {highlightMatch(broker.name.split(" ")[0], searchQuery)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Ações */}
                                <div className="flex items-center gap-1 shrink-0">
                                  {waLink && (
                                    <a href={waLink} target="_blank" rel="noopener noreferrer"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:scale-105"
                                      style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}
                                      title="WhatsApp"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
                                    </a>
                                  )}
                                  <button
                                    onClick={() => setMonitorLead(lead)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:scale-105"
                                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)" }}
                                    title="Ver conversa"
                                  >
                                    <Eye className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Panel>
              </motion.div>
            )}

            {/* ── RECENTES ───────────────────────────────────────────────────── */}
            {leftPanel === "recentes" && (() => {
              const cutoff = Date.now() - recentWindow * 3600000;
              const recentLeads = teamLeads
                .filter(l => l.createdAt && new Date(l.createdAt).getTime() >= cutoff)
                .filter(l => !recentOnlyNew || l.status === "NEW")
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const semBroker = recentLeads.filter(l => !l.brokerId).length;
              const color = "#A78BFA";

              return (
                <motion.div key="recentes" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
                  className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">

                  {/* Filtros */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>Janela</span>
                    {([6, 12, 24] as RecentWindow[]).map(w => (
                      <button key={w} onClick={() => setRecentWindow(w)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        style={recentWindow === w ? {
                          background: `${color}15`, color, border: `1px solid ${color}40`, boxShadow: `0 0 8px ${color}20`,
                        } : {
                          background: "var(--crm-glass)", color: "var(--crm-text-subtle)", border: "1px solid var(--crm-border-mid)",
                        }}>
                        {w}h
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Switch checked={recentOnlyNew} onCheckedChange={setRecentOnlyNew} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: recentOnlyNew ? color : "var(--crm-text-muted)" }}>
                        Só NEW
                      </span>
                    </div>
                  </div>

                  <Panel className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
                        {recentLeads.length} lead{recentLeads.length !== 1 ? "s" : ""} chegou{recentLeads.length !== 1 ? "ram" : ""}
                      </span>
                      {semBroker > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                          {semBroker} sem corretor
                        </span>
                      )}
                    </div>

                    {recentLeads.length === 0 ? (
                      <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
                          <Sparkles className="w-5 h-5" style={{ color }} />
                        </div>
                        <p className="text-sm font-bold text-center" style={{ color: "var(--crm-text-muted)" }}>
                          Nenhum lead novo nas últimas {recentWindow}h
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                        {recentLeads.map((lead, i) => {
                          const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                          const st = STATUS_LABELS[lead.status] ?? { label: lead.status, color: "#475569" };
                          const minsAgo = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 60000);
                          const ago = minsAgo < 60 ? `${minsAgo}min` : minsAgo < 1440 ? `${Math.floor(minsAgo / 60)}h` : `${Math.floor(minsAgo / 1440)}d`;
                          return (
                            <motion.div key={lead.id}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i * 0.02, 0.2) }}
                              className="rounded-xl px-3 py-2.5"
                              style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}>
                              <div className="flex items-start gap-2.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm font-bold truncate" style={{ color: "var(--crm-text)" }}>{lead.name}</span>
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0"
                                      style={{ background: `${st.color}15`, color: st.color, border: `1px solid ${st.color}30` }}>
                                      {st.label}
                                    </span>
                                  </div>
                                  <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: "var(--crm-text-muted)" }}>
                                    <span className="font-mono">há {ago}</span>
                                    {lead.tag && <><span>·</span><span className="truncate">{lead.tag}</span></>}
                                  </div>
                                  {(lead.product || lead.rendaDeclarada || lead.tipoTrabalho) && (
                                    <div className="flex items-center gap-1 flex-wrap mt-1">
                                      {lead.product && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                          style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }}
                                          title="Produto/empreendimento">
                                          📦 <span className="truncate max-w-[120px]">{lead.product}</span>
                                        </span>
                                      )}
                                      {lead.rendaDeclarada && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                          style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.25)" }}
                                          title="Renda declarada">
                                          💰 {lead.rendaDeclarada}
                                        </span>
                                      )}
                                      {lead.tipoTrabalho && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                                          style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.25)" }}
                                          title="Tipo de trabalho">
                                          💼 {lead.tipoTrabalho === "CLT" ? "CLT" : lead.tipoTrabalho === "AUTONOMO" ? "Autônomo" : "Func. Público"}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  {broker ? (
                                    <button onClick={() => { setRightTab("equipe"); setMobileView("equipe"); }}
                                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all hover:opacity-80"
                                      style={{ background: `${color}10`, border: `1px solid ${color}30` }}
                                      title={`Ver ${broker.name} no painel da equipe`}>
                                      <UserCheck className="w-3 h-3" style={{ color }} />
                                      <span className="text-[10px] font-black uppercase tracking-wide" style={{ color }}>{broker.name.split(" ")[0]}</span>
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg"
                                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                                      <UserX className="w-3 h-3" style={{ color: "#EF4444" }} />
                                      <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#EF4444" }}>Sem corretor</span>
                                    </span>
                                  )}
                                  <button onClick={() => setMonitorLead(lead)}
                                    className="px-2 py-1 rounded-lg transition-all hover:opacity-80"
                                    style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)" }}
                                    title="Abrir conversa do lead">
                                    <Eye className="w-3 h-3" style={{ color: "#00D4FF" }} />
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </Panel>
                </motion.div>
              );
            })()}

          </AnimatePresence>
        </div>

        {/* ── DIREITA ──────────────────────────────────────────────────────── */}
        <div className={`flex-col gap-2 overflow-y-auto md:overflow-hidden md:min-h-0 w-full md:flex-[45] md:w-auto ${mobileView === "equipe" ? "flex" : "hidden"} md:flex`}>

          {/* Tab selector — 3 abas consolidadas */}
          <div className="flex gap-1.5 shrink-0">
            {([
              { v: "equipe"     as RightTab, label: "Equipe",  icon: Shield },
              { v: "velocidade" as RightTab, label: "SLA",     icon: Zap, badge: velocidadeStats.uncontacted.filter(l => l.minsWaiting > 15).length },
              { v: "ranking"    as RightTab, label: "Ranking", icon: Trophy },
            ]).map(tab => (
              <button key={tab.v} onClick={() => setRightTab(tab.v)}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-1 justify-center"
                style={rightTab === tab.v ? {
                  background: "linear-gradient(135deg, #0044cc, #0066ff)",
                  color: "#fff",
                  border: "1px solid rgba(0,212,255,0.4)",
                  boxShadow: "0 0 12px rgba(0,170,255,0.3)",
                } : {
                  background: "var(--crm-glass, rgba(8,11,20,0.6))",
                  color: "var(--crm-text-subtle, #334155)",
                  border: "1px solid var(--crm-border-mid, #1E293B)",
                }}
              >
                <tab.icon className="w-3 h-3 shrink-0" />
                {tab.label}
                {(tab.badge ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center animate-pulse"
                    style={{ background: "#EF4444", color: "#fff" }}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={rightTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-h-0 overflow-hidden"
            >

              {/* SEMÁFORO */}
              {rightTab === "equipe" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Equipe" icon={Shield} color="#00D4FF" count={brokers.length} />
                  <div className="space-y-2">
                    {brokers.map((broker, i) => {
                      const sem         = brokerSemaphore(broker, teamLeads);
                      const c           = SEMAPHORE_COLORS[sem];
                      const bl          = teamLeads.filter(l => l.brokerId === broker.id);
                      const activeCount  = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
                      const lastTs       = bl.map(l => l.lastBrokerWhatsappAt).filter(Boolean)
                        .map(d => new Date(d!).getTime()).sort((a, b) => b - a)[0];
                      const lastH        = lastTs ? Math.floor((Date.now() - lastTs) / 3600000) : null;
                      const isPresent    = broker.leadAssignmentEnabled;
                      const load         = activeCount === 0 ? "Livre" : activeCount < 20 ? "Normal" : "Cheio";
                      const loadColor    = activeCount === 0 ? "#10B981" : activeCount < 20 ? "#F59E0B" : "#EF4444";
                      const isLoading    = presencePending === broker.id;

                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="rounded-xl px-3 py-2.5"
                          style={{ background: c.bg, border: `1px solid ${c.border}`, opacity: isPresent ? 1 : 0.65 }}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Avatar + status dot */}
                            <div className="relative shrink-0">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
                                style={{ background: `${c.neon}20`, color: c.neon, border: `1px solid ${c.neon}40` }}>
                                {initials(broker.name)}
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                                style={{ background: c.neon, borderColor: "var(--crm-surface, #080B14)" }} />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate leading-tight">{broker.name.split(" ")[0]}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] font-bold" style={{ color: c.neon }}>{c.label}</span>
                                <span style={{ color: "#1E293B" }}>·</span>
                                <span className="text-[9px]" style={{ color: "#475569" }}>{activeCount} leads</span>
                                {lastH !== null && (
                                  <>
                                    <span style={{ color: "#1E293B" }}>·</span>
                                    <span className="text-[9px]" style={{ color: "#334155" }}>{lastH}h atrás</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Carga */}
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: `${loadColor}15`, color: loadColor, border: `1px solid ${loadColor}30` }}>
                              {load}
                            </span>

                            {/* Presença toggle */}
                            <Switch
                              checked={isPresent}
                              onCheckedChange={() => {
                                setPresencePending(broker.id);
                                presenceMutation.mutate({ id: broker.id, present: !isPresent });
                              }}
                              disabled={isLoading}
                              className="data-[state=checked]:bg-emerald-500 shrink-0"
                            />

                            {/* Alerta */}
                            <button onClick={() => setAlertBroker({ broker })}
                              className="p-1.5 rounded-lg transition-all hover:scale-105 shrink-0"
                              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}
                              title="Enviar alerta">
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-3 pt-3" style={{ borderTop: "1px solid #1E293B" }}>
                    {(["green","yellow","red","off"] as const).map(s => (
                      <span key={s} className="flex items-center gap-1 text-[10px]" style={{ color: "#334155" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: SEMAPHORE_COLORS[s].neon }} />
                        {SEMAPHORE_COLORS[s].label}
                      </span>
                    ))}
                  </div>
                </Panel>
              )}

              {/* RANKING */}
              {rightTab === "ranking" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Ranking da Equipe" icon={Trophy} color="#F59E0B" />
                  <div className="space-y-2">
                    {rankingRows.map(({ broker, concluded, active, xp, sem }, i) => {
                      const c      = SEMAPHORE_COLORS[sem];
                      const medal  = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                      const maxConc = Math.max(...rankingRows.map(r => r.concluded), 1);
                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="rounded-xl px-3 py-2.5"
                          style={{
                            background: i === 0 ? "rgba(245,158,11,0.06)" : "var(--crm-glass)",
                            border: `1px solid ${i === 0 ? "rgba(245,158,11,0.2)" : "var(--crm-border-mid,#1E293B)"}`,
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base w-6 text-center shrink-0">
                              {medal || <span className="text-xs font-black" style={{ color: "#334155" }}>{i + 1}</span>}
                            </span>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                              style={{ background: `${c.neon}20`, color: c.neon, border: `1px solid ${c.neon}30` }}>
                              {initials(broker.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-black" style={{ color: concluded > 0 ? "#34D399" : "#334155" }}>{concluded} vendas</span>
                                  <span className="text-[10px]" style={{ color: "#334155" }}>{active} ativos</span>
                                </div>
                              </div>
                              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                                <motion.div
                                  initial={{ width: 0 }} animate={{ width: `${(concluded / maxConc) * 100}%` }}
                                  transition={{ duration: 0.7, delay: i * 0.05 }}
                                  className="h-full rounded-full"
                                  style={{ background: i === 0 ? "linear-gradient(90deg, #F59E0B80, #F59E0B)" : "linear-gradient(90deg, #10B98180, #10B981)" }}
                                />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* INTELIGÊNCIA — removida (fundida no painel de urgentes) */}
              {false && (() => {
                const activeLeads = teamLeads.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status));
                const withState   = activeLeads.map(l => ({ lead: l, state: leadStateMap[l.id] ?? null }));
                const hot    = withState.filter(x => x.state?.intencao === "quente");
                const warm   = withState.filter(x => x.state?.intencao === "morno");
                const cold   = withState.filter(x => x.state?.intencao === "frio");
                const noState = withState.filter(x => !x.state);

                const TEMA_LABEL: Record<string,string> = {
                  preco: "Preço", entrada: "Entrada", localizacao: "Local",
                  documentacao: "Docs", visita: "Visita", sem_info: "",
                };

                const renderGroup = (items: typeof withState, color: string, label: string, icon: React.ReactNode) => (
                  items.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        {icon}
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
                          {label} ({items.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map(({ lead, state }) => {
                          const broker = brokers.find(b => b.id === lead.brokerId);
                          const isHuman = state?.modo === "humano_ativo" || state?.bloqueado;
                          const tema = state?.tema && state.tema !== "sem_info" ? TEMA_LABEL[state.tema] : null;
                          const mins = state?.atualizado_em
                            ? Math.round((Date.now() - new Date(state.atualizado_em).getTime()) / 60000)
                            : null;
                          return (
                            <div key={lead.id} className="rounded-xl px-3 py-2 flex items-center gap-2"
                              style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold text-white truncate">{lead.name?.split(" ")[0]}</p>
                                  {tema && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                                      style={{ background: `${color}18`, color }}>
                                      {tema}
                                    </span>
                                  )}
                                  {isHuman && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                                      style={{ background: "rgba(124,58,237,0.15)", color: "#A78BFA" }}>
                                      manual
                                    </span>
                                  )}
                                </div>
                                <p className="text-[9px] mt-0.5 truncate" style={{ color: "#475569" }}>
                                  {broker?.name?.split(" ")[0] ?? "?"}
                                  {state?.momento && state.momento !== "explorando" ? ` · ${state.momento}` : ""}
                                  {mins !== null ? ` · ${mins < 60 ? `${mins}min` : `${Math.round(mins/60)}h`}` : ""}
                                </p>
                              </div>
                              <button
                                onClick={() => setMonitorLead(lead)}
                                className="p-1.5 rounded-lg transition-all hover:scale-105 shrink-0"
                                style={{ background: `${color}15`, color }}
                                title="Ver lead">
                                <Eye className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                );

                return (
                  <Panel className="h-full overflow-y-auto">
                    <SectionHeader label="Inteligência de Leads" icon={Brain} color="#7C3AED" />
                    {/* Resumo */}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {[
                        { label: "Quentes", count: hot.length, color: "#EF4444" },
                        { label: "Mornos",  count: warm.length, color: "#F59E0B" },
                        { label: "Frios",   count: cold.length, color: "#3B82F6" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="rounded-xl px-2 py-2 text-center"
                          style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
                          <p className="text-lg font-black" style={{ color }}>{count}</p>
                          <p className="text-[9px] uppercase font-bold" style={{ color: "#475569" }}>{label}</p>
                        </div>
                      ))}
                    </div>
                    {hot.length === 0 && warm.length === 0 && cold.length === 0 && noState.length === 0 && (
                      <p className="text-xs text-center py-8" style={{ color: "#334155" }}>
                        Nenhum lead ativo com classificação ainda.
                      </p>
                    )}
                    {renderGroup(hot,  "#EF4444", "Quentes — Ação Imediata", <Flame className="w-3 h-3" style={{ color: "#EF4444" }} />)}
                    {renderGroup(warm, "#F59E0B", "Mornos — Acompanhar",     <Zap   className="w-3 h-3" style={{ color: "#F59E0B" }} />)}
                    {renderGroup(cold, "#3B82F6", "Frios — Cadência",        <Minus className="w-3 h-3" style={{ color: "#3B82F6" }} />)}
                    {noState.length > 0 && (
                      <div className="mt-2 pt-2" style={{ borderTop: "1px solid #1E293B" }}>
                        <p className="text-[9px] uppercase font-bold mb-1.5 px-1" style={{ color: "#334155" }}>
                          Sem classificação ({noState.length})
                        </p>
                        {noState.slice(0, 5).map(({ lead }) => (
                          <div key={lead.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-1"
                            style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid)" }}>
                            <p className="text-xs" style={{ color: "#475569" }}>{lead.name?.split(" ")[0]}</p>
                            <Bot className="w-3 h-3" style={{ color: "#334155" }} />
                          </div>
                        ))}
                        {noState.length > 5 && (
                          <p className="text-[9px] text-center mt-1" style={{ color: "#334155" }}>
                            +{noState.length - 5} leads aguardando classificação
                          </p>
                        )}
                      </div>
                    )}
                  </Panel>
                );
              })()}

              {/* PRESENÇA — fundida em Equipe */}
              {false && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Presença" icon={UserCheck} color="#10B981" />
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                      <UserCheck className="w-4 h-4" style={{ color: "#10B981" }} />
                      <div>
                        <p className="text-xl font-black" style={{ color: "#34D399" }}>{stats.present}</p>
                        <p className="text-[10px]" style={{ color: "#475569" }}>Presentes</p>
                      </div>
                    </div>
                    <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid,#1E293B)" }}>
                      <UserX className="w-4 h-4" style={{ color: "#334155" }} />
                      <div>
                        <p className="text-xl font-black" style={{ color: "#475569" }}>{stats.total - stats.present}</p>
                        <p className="text-[10px]" style={{ color: "#334155" }}>Ausentes</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {brokers.map((broker, i) => {
                      const isPresent = broker.leadAssignmentEnabled;
                      const isLoading = presencePending === broker.id;
                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                          style={{
                            background: isPresent ? "rgba(16,185,129,0.06)" : "var(--crm-glass)",
                            border: `1px solid ${isPresent ? "rgba(16,185,129,0.2)" : "var(--crm-border-mid,#1E293B)"}`,
                            opacity: isPresent ? 1 : 0.6,
                          }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                            style={{ background: isPresent ? "rgba(16,185,129,0.2)" : "rgba(51,65,85,0.5)", color: isPresent ? "#34D399" : "#475569" }}>
                            {initials(broker.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: isPresent ? "#fff" : "#475569" }}>{broker.name.split(" ")[0]}</p>
                            <p className="text-[10px]" style={{ color: "#334155" }}>{isPresent ? "Recebendo leads" : "Fora da fila"}</p>
                          </div>
                          <Switch
                            checked={isPresent}
                            onCheckedChange={() => {
                              setPresencePending(broker.id);
                              presenceMutation.mutate({ id: broker.id, present: !isPresent });
                            }}
                            disabled={isLoading}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* FILA — fundida em Equipe */}
              {false && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Fila de Distribuição" icon={GitMerge} color="#818CF8" />
                  {presentBrokers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "#334155" }}>
                      <UserX className="w-8 h-8" />
                      <p className="text-sm">Nenhum corretor ativo</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {brokers.filter(b => b.leadAssignmentEnabled).map((broker, i) => {
                        const activeCount = teamLeads.filter(l =>
                          l.brokerId === broker.id && !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)
                        ).length;
                        const load      = activeCount === 0 ? "green" : activeCount < 20 ? "yellow" : "red";
                        const loadNeon  = load === "green" ? "#10B981" : load === "yellow" ? "#F59E0B" : "#EF4444";
                        const loadLabel = load === "green" ? "Livre" : load === "yellow" ? "Normal" : "Cheio";
                        return (
                          <motion.div key={broker.id}
                            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                            style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid,#1E293B)" }}
                          >
                            <span className="text-xs font-black w-5 text-center shrink-0" style={{ color: "#334155" }}>{i + 1}</span>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                              style={{ background: "rgba(129,140,248,0.15)", color: "#818CF8" }}>
                              {initials(broker.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                              <p className="text-[10px]" style={{ color: "#475569" }}>{activeCount} leads ativos</p>
                            </div>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: `${loadNeon}18`, color: loadNeon, border: `1px solid ${loadNeon}30` }}>
                              {loadLabel}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                  {brokers.filter(b => !b.leadAssignmentEnabled).length > 0 && (
                    <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1E293B" }}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Fora da fila</p>
                      {brokers.filter(b => !b.leadAssignmentEnabled).map(b => (
                        <div key={b.id} className="flex items-center gap-2 py-1.5 opacity-40">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black"
                            style={{ background: "rgba(51,65,85,0.5)", color: "#475569" }}>
                            {initials(b.name)}
                          </div>
                          <p className="text-xs" style={{ color: "#475569" }}>{b.name.split(" ")[0]}</p>
                          <span className="text-[9px] ml-auto" style={{ color: "#334155" }}>ausente</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )}

              {/* VELOCIDADE / SLA */}
              {rightTab === "velocidade" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="SLA — Velocidade de Resposta" icon={Zap} color="#F59E0B" />

                  {/* Leads aguardando 1º contato */}
                  {velocidadeStats.uncontacted.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#F59E0B" }}>
                        ⏱ Aguardando 1º contato ({velocidadeStats.uncontacted.length})
                      </p>
                      <div className="space-y-1.5">
                        {velocidadeStats.uncontacted.slice(0, 12).map((lead, i) => {
                          const mins = lead.minsWaiting;
                          const slaBreach = mins > 30;
                          const slaWarn   = mins > 10;
                          const c = slaBreach ? "#EF4444" : slaWarn ? "#F59E0B" : "#10B981";
                          const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                          return (
                            <motion.div key={lead.id}
                              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className="flex items-center gap-2 rounded-xl px-3 py-2"
                              style={{ background: `${c}08`, border: `1px solid ${c}25` }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{lead.name}</p>
                                <p className="text-[10px]" style={{ color: "#475569" }}>
                                  {broker?.name.split(" ")[0] || "—"} · {lead.tag || "sem tag"}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-black" style={{ color: c }}>
                                  {mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}m` : ""}`}
                                </p>
                                <p className="text-[9px] font-bold uppercase" style={{ color: c }}>
                                  {slaBreach ? "SLA BREACH" : slaWarn ? "Atenção" : "OK"}
                                </p>
                              </div>
                              <button onClick={() => setAlertBroker({ broker: broker!, lead: { id: lead.id, name: lead.name } })} disabled={!broker}
                                className="shrink-0 p-1.5 rounded-lg transition hover:scale-105"
                                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
                                <Bell className="w-3 h-3" />
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 mb-4">
                      <CheckCircle2 className="w-8 h-8" style={{ color: "#10B981" }} />
                      <p className="text-sm font-bold" style={{ color: "#10B981" }}>Todos os leads foram contatados!</p>
                    </div>
                  )}

                  {/* Velocidade média por corretor */}
                  <div style={{ borderTop: "1px solid #1E293B", paddingTop: 12 }}>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                      Tempo médio de resposta (7 dias)
                    </p>
                    <div className="space-y-2">
                      {brokers.map((broker, i) => {
                        const avg = velocidadeStats.brokerAvg[broker.id];
                        const hasData = avg !== undefined;
                        const c = !hasData ? "#334155" : avg <= 10 ? "#10B981" : avg <= 30 ? "#F59E0B" : "#EF4444";
                        const label = !hasData ? "sem dados" : avg <= 10 ? "Excelente" : avg <= 30 ? "Atenção" : "Crítico";
                        return (
                          <motion.div key={broker.id}
                            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2"
                            style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid,#1E293B)" }}
                          >
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0"
                              style={{ background: `${c}18`, color: c, border: `1px solid ${c}30` }}>
                              {initials(broker.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                              <div className="h-1 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.05)", width: "80%" }}>
                                {hasData && (
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (avg / 60) * 100)}%` }}
                                    transition={{ duration: 0.6, delay: i * 0.04 }}
                                    className="h-full rounded-full"
                                    style={{ background: c }}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-black" style={{ color: c }}>
                                {hasData ? (avg < 60 ? `${avg}min` : `${Math.floor(avg / 60)}h`) : "—"}
                              </p>
                              <p className="text-[9px] uppercase font-bold" style={{ color: c }}>{label}</p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </Panel>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV — fixed, igual ao dashboard do corretor ────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex h-14"
        style={{ background: "rgba(8,11,20,.97)", borderTop: "1px solid rgba(0,212,255,.15)", backdropFilter: "blur(12px)" }}>
        <button onClick={() => setMobileView("leads")}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-all"
          style={{ color: mobileView === "leads" ? "#EF4444" : "#475569" }}>
          <AlertTriangle className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">Leads</span>
          {(stats.stalled + stats.unassigned) > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-20px)] w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
              style={{ background: "#EF4444", color: "#fff" }}>{stats.stalled + stats.unassigned}</span>
          )}
        </button>
        <div className="w-px my-3" style={{ background: "#1E293B" }} />
        <button onClick={() => setMobileView("equipe")}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all"
          style={{ color: mobileView === "equipe" ? "#00D4FF" : "#475569" }}>
          <Shield className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">
            {rightTab === "equipe" ? "Equipe" : rightTab === "velocidade" ? "SLA" : "Ranking"}
          </span>
        </button>
      </nav>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 hidden md:flex items-center gap-6 px-5 h-10"
        style={{ borderTop: "1px solid rgba(0,212,255,0.08)", background: "var(--crm-surface)" }}
      >
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" style={{ color: "#00D4FF" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#00D4FF" }}>
            {stats.sales7d} vendas esta semana
          </span>
        </div>
        <div className="h-3 w-px" style={{ background: "#1E293B" }} />
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" style={{ color: "#475569" }} />
          <span className="text-[10px]" style={{ color: "#334155" }}>
            {stats.stalled} leads precisam de atenção
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" style={{ color: "#334155" }} />
          <span className="text-[10px]" style={{ color: "#334155" }}>Auto-refresh 30s</span>
        </div>
      </footer>

      {/* ── ALERT MODAL ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {alertBroker && (
          <AlertModal
            broker={alertBroker.broker}
            fromId={user!.id}
            lead={alertBroker.lead}
            onClose={() => setAlertBroker(null)}
          />
        )}
      </AnimatePresence>

      {/* ── MONITOR DE CONVERSAS ────────────────────────────────────────────── */}
      <AnimatePresence>
        {monitorLead && (
          <LeadMonitorDrawer
            lead={monitorLead}
            broker={monitorLead.brokerId ? (brokerMap[monitorLead.brokerId] ?? null) : null}
            onClose={() => setMonitorLead(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
