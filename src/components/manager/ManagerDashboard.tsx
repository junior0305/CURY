import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchTeamBrokers, toggleBrokerPresence } from "@/integrations/supabase/profiles";
import { fetchTeamLeads, fetchUnassignedLeads, updateLeadBroker } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import { toast } from "sonner";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import {
  LogOut, Trophy, AlertTriangle, Zap,
  CheckCircle2, Clock, UserCheck, UserX, GitMerge,
  RefreshCw, TrendingUp, Target, Shield,
  Bell, X, Send, Trash2, RotateCcw, Filter, Eye,
  Search, MessageSquare, Phone, Brain, Bot, Flame, Minus,
  Loader2,
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

// ─── Metas Bar ───────────────────────────────────────────────────────────────

function MetasBar({ teamId, brokerIds }: { teamId: string | null; brokerIds: string[] }) {
  const [goal, setGoal]     = useState<number | null>(null);
  const [actual, setActual] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!teamId) { setLoaded(true); return; }
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10);

    Promise.all([
      supabase.from("team_goals").select("sales_target")
        .eq("team_id", teamId)
        .eq("goal_type", "monthly")
        .gte("month", monthStart).lt("month", monthEnd)
        .order("created_at", { ascending: false })
        .limit(1),
      brokerIds.length > 0
        ? supabase.from("leads").select("id", { count: "exact", head: true })
            .in("broker_id", brokerIds).eq("status", "CONCLUDED")
            .gte("updated_at", monthStart).lt("updated_at", monthEnd)
        : Promise.resolve({ count: 0 }),
    ]).then(([{ data: goalRows }, { count }]) => {
      setGoal((goalRows as any)?.[0]?.sales_target ?? null);
      setActual(count ?? 0);
      setLoaded(true);
    });
  }, [teamId, brokerIds.join(",")]);

  if (!loaded) return null;

  // Se não tem equipe vinculada ao perfil do gerente
  if (!teamId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 mx-4 mt-2 rounded-xl px-4 py-2 flex items-center gap-3"
        style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        <Target className="w-3.5 h-3.5 shrink-0" style={{ color: "#EF4444" }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#EF4444" }}>
          Perfil sem equipe vinculada — peça ao admin para associar sua equipe em Usuários
        </span>
      </motion.div>
    );
  }

  const month = new Date().toLocaleDateString("pt-BR", { month: "long" });

  // Sem meta cadastrada — mostra aviso
  if (!goal) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 mx-4 mt-2 rounded-xl px-4 py-2 flex items-center gap-3"
        style={{ background: "rgba(71,85,105,0.08)", border: "1px solid rgba(71,85,105,0.25)" }}
      >
        <Target className="w-3.5 h-3.5 shrink-0" style={{ color: "#475569" }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
          Meta de {month} não definida — peça ao seu admin para configurar em Financeiro → Metas
        </span>
        <span className="text-xs font-black ml-auto" style={{ color: "#334155" }}>{actual} vendas realizadas</span>
      </motion.div>
    );
  }

  const pct   = Math.min(100, Math.round((actual / goal) * 100));
  const color = pct >= 90 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444";
  const label = pct >= 90 ? "No Prazo" : pct >= 60 ? "Em Risco" : "Abaixo";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="shrink-0 mx-4 mt-2 rounded-xl px-4 py-2.5 flex items-center gap-4"
      style={{ background: `${color}0a`, border: `1px solid ${color}30` }}
    >
      <Target className="w-4 h-4 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
            Meta {month}: {actual} / {goal} vendas
          </span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
            {label} · {pct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 8px ${color}60` }}
          />
        </div>
      </div>
      <span className="text-xl font-black shrink-0" style={{ color, textShadow: `0 0 12px ${color}50` }}>
        {pct}%
      </span>
    </motion.div>
  );
}

// ─── Alert Modal ─────────────────────────────────────────────────────────────

function AlertModal({ broker, fromId, onClose }: {
  broker: User; fromId: string; onClose: () => void;
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
          message: `🔔 *Alerta do Gerente*\n\n${msg.trim()}`,
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

  const QUICK = [
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
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "#475569" }}>Enviar alerta</p>
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

type RightTab  = "alertas" | "presenca" | "fila" | "ranking" | "intel";
type LeftPanel = "urgente" | "redistribuir" | "descarte" | "busca";

export default function ManagerDashboard() {
  const { user, signOut } = useAuth();
  const { t } = useTheme();
  const queryClient       = useQueryClient();
  const [lastUpdated, setLastUpdated]   = useState(new Date());
  const [xpData, setXpData]             = useState<Record<string, { xp: number; level: number; levelName: string }>>({});
  const [rightTab, setRightTab]         = useState<RightTab>("alertas");
  const [leftPanel, setLeftPanel]       = useState<LeftPanel>("urgente");
  const [alertBroker, setAlertBroker]   = useState<User | null>(null);
  const [monitorLead, setMonitorLead]   = useState<Lead | null>(null);
  const [teamId, setTeamId]             = useState<string | null>(null);
  const [redistFilter, setRedistFilter] = useState<string>("todos");
  const [searchQuery, setSearchQuery]   = useState<string>("");

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
        .update({ status: "NEW", broker_id: null, updated_at: new Date().toISOString() })
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
    return teamLeads.filter(lead => {
      const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
      return (
        lead.name?.toLowerCase().includes(q) ||
        lead.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
        lead.tag?.toLowerCase().includes(q) ||
        (lead as any).origin?.toLowerCase().includes(q) ||
        broker?.name?.toLowerCase().includes(q) ||
        STATUS_LABELS[lead.status]?.label?.toLowerCase().includes(q)
      );
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
        <div className="flex items-center gap-3">
          <img src="/comandra-logo.png" alt="Comandra" className="h-7 w-7 object-contain"
            style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.7))" }} />
          <div>
            <p className="font-black text-xs uppercase tracking-[0.2em]"
              style={{ color: t.text, textShadow: "0 0 12px rgba(0,212,255,0.4)" }}>
              Centro de Comando
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

      {/* ── META BAR ────────────────────────────────────────────────────────── */}
      <MetasBar teamId={teamId} brokerIds={brokers.map(b => b.id)} />

      {/* ── KPI BAR ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-7 gap-2 px-4 pt-2 pb-0">
        <KpiCard delay={0.00} label="Presentes"    value={`${stats.present}/${stats.total}`} icon={UserCheck}     neon={stats.present < stats.total ? "#F59E0B" : "#10B981"} />
        <KpiCard delay={0.04} label="Novos hoje"   value={stats.newToday}                    icon={Zap}           neon="#00D4FF" />
        <KpiCard delay={0.08} label="Ativos"       value={stats.active}                      icon={Target}        neon="#818CF8" />
        <KpiCard delay={0.12} label="Parados +24h" value={stats.stalled}                     icon={AlertTriangle} neon={stats.stalled > 0 ? "#EF4444" : "#10B981"} pulse={stats.stalled > 0} />
        <KpiCard delay={0.16} label="Sem corretor" value={stats.unassigned}                  icon={UserX}         neon={stats.unassigned > 0 ? "#EF4444" : "#10B981"} pulse={stats.unassigned > 0} />
        <KpiCard delay={0.20} label="Descartados"  value={stats.discarded}                   icon={Trash2}        neon={stats.discarded > 0 ? "#F59E0B" : "#334155"} />
        <KpiCard delay={0.24} label="Vendas 7d"    value={stats.sales7d}                     icon={Trophy}        neon="#F59E0B" />
      </div>

      {/* ── MAIN SPLIT ──────────────────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden gap-3 p-3 min-h-0">

        {/* ── ESQUERDA ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 flex-[55] min-h-0 overflow-hidden">

          {/* Left panel tabs */}
          <div className="flex gap-1.5 shrink-0">
            {([
              { v: "urgente",      label: "Urgentes",     icon: AlertTriangle, color: "#EF4444" },
              { v: "redistribuir", label: "Redistribuir", icon: RotateCcw,     color: "#00D4FF" },
              { v: "descarte",     label: "Descarte",     icon: Trash2,        color: "#F59E0B", badge: stats.discarded },
              { v: "busca",        label: "Buscar",       icon: Search,        color: "#10B981" },
            ] as { v: LeftPanel; label: string; icon: React.ElementType; color: string; badge?: number }[]).map(tab => (
              <button key={tab.v} onClick={() => setLeftPanel(tab.v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-1 justify-center relative"
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
                className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">

                {/* Sem corretor */}
                {unassigned.length > 0 && (
                  <Panel>
                    <SectionHeader label="Sem Corretor" icon={UserX} color="#EF4444" count={unassigned.length} />
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                      {unassigned.slice(0, 10).map((lead, i) => (
                        <motion.div key={lead.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2"
                          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                            <p className="text-[10px]" style={{ color: "#475569" }}>
                              {Math.floor(hoursAgo(lead.createdAt))}h · {lead.tag || "sem tag"}
                            </p>
                          </div>
                          <Select onValueChange={brokerId => assignMutation.mutate({ leadId: lead.id, brokerId })}>
                            <SelectTrigger className="w-28 h-7 text-xs rounded-lg"
                              style={{ borderColor: "rgba(239,68,68,0.3)", background: "var(--crm-surface)", color: "var(--crm-text-muted,#94A3B8)" }}>
                              <SelectValue placeholder="Atribuir..." />
                            </SelectTrigger>
                            <SelectContent>
                              {presentBrokers.map(b => (
                                <SelectItem key={b.id} value={b.id} className="text-xs">{b.name.split(" ")[0]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </motion.div>
                      ))}
                    </div>
                  </Panel>
                )}

                {/* Parados +24h */}
                <Panel className="flex-1 min-h-0 flex flex-col">
                  <SectionHeader label="Parados +24h" icon={AlertTriangle} color="#F59E0B" count={stalledLeads.length} />
                  {stalledLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: "#334155" }}>
                      <CheckCircle2 className="w-8 h-8" style={{ color: "#10B981" }} />
                      <p className="text-sm font-bold" style={{ color: "#10B981" }}>Equipe em dia!</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
                      {stalledLeads.map((lead, i) => {
                        const h      = Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt));
                        const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
                        const urgent = h > 48;
                        return (
                          <motion.div key={lead.id}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                            style={{
                              background: urgent ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.05)",
                              border: `1px solid ${urgent ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)"}`,
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{lead.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs font-black" style={{ color: urgent ? "#F87171" : "#FCD34D" }}>
                                  {h}h parado
                                </span>
                                <span style={{ color: "#334155" }}>·</span>
                                <span className="text-xs" style={{ color: "#475569" }}>
                                  {broker?.name.split(" ")[0] || "—"}
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
                                style={{ borderColor: urgent ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)", background: "var(--crm-surface)", color: "var(--crm-text-muted,#94A3B8)" }}>
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
                                {lead.notes && ` · "${lead.notes.slice(0, 30)}..."`}
                              </p>
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

          </AnimatePresence>
        </div>

        {/* ── DIREITA ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 flex-[45] min-h-0 overflow-hidden">

          {/* Tab selector */}
          <div className="flex gap-1.5 shrink-0">
            {([
              { v: "alertas",  label: "Semáforo",  icon: Shield },
              { v: "ranking",  label: "Ranking",   icon: Trophy },
              { v: "intel",    label: "Inteligência", icon: Brain },
              { v: "presenca", label: "Presença",  icon: UserCheck },
              { v: "fila",     label: "Fila",      icon: GitMerge },
            ] as { v: RightTab; label: string; icon: React.ElementType }[]).map(tab => (
              <button key={tab.v} onClick={() => setRightTab(tab.v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex-1 justify-center"
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
                <tab.icon className="w-3 h-3" />
                {tab.label}
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
              {rightTab === "alertas" && (
                <Panel className="h-full overflow-y-auto">
                  <SectionHeader label="Status da Equipe" icon={Shield} color="#00D4FF" />
                  <div className="space-y-2">
                    {brokers.map((broker, i) => {
                      const sem        = brokerSemaphore(broker, teamLeads);
                      const c          = SEMAPHORE_COLORS[sem];
                      const bl         = teamLeads.filter(l => l.brokerId === broker.id);
                      const activeCount = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
                      const lastTs     = bl.map(l => l.lastBrokerWhatsappAt).filter(Boolean)
                        .map(d => new Date(d!).getTime()).sort((a, b) => b - a)[0];
                      const lastH      = lastTs ? Math.floor((Date.now() - lastTs) / 3600000) : null;

                      return (
                        <motion.div key={broker.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                          style={{ background: c.bg, border: `1px solid ${c.border}` }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                            style={{ background: `${c.neon}20`, color: c.neon, border: `1px solid ${c.neon}40` }}>
                            {initials(broker.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{broker.name.split(" ")[0]}</p>
                            <p className="text-[10px]" style={{ color: c.neon }}>
                              {c.label} · {activeCount} ativos
                              {lastH !== null ? ` · ${lastH}h atrás` : ""}
                            </p>
                          </div>
                          {/* Botão de alerta */}
                          <button
                            onClick={() => setAlertBroker(broker)}
                            className="p-2 rounded-lg transition-all hover:scale-105 shrink-0"
                            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}
                            title="Enviar alerta"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: c.neon, boxShadow: sem !== "off" ? `0 0 6px ${c.neon}` : "none" }} />
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
                    <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color: "#334155" }}>
                      <Bell className="w-3 h-3" /> = alerta
                    </span>
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

              {/* INTELIGÊNCIA */}
              {rightTab === "intel" && (() => {
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

              {/* PRESENÇA */}
              {rightTab === "presenca" && (
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

              {/* FILA */}
              {rightTab === "fila" && (
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

            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 flex items-center gap-6 px-5 h-10"
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
            broker={alertBroker}
            fromId={user!.id}
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
