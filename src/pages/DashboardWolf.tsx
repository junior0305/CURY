import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare, Phone, Calendar, X, Send, Zap,
  Flame, Trophy, Star, TrendingUp,
  Shield, Volume2, VolumeX, LogOut, Bell, CheckCircle2, Loader2,
  Bot, UserCheck, Brain, PlusCircle, FileText, ChevronRight,
  AlertTriangle, XCircle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsForDashboard, updateLeadStatus, confirmLeadVisit } from "@/integrations/supabase/leads";
import { fetchOpenTasks, createTask } from "@/integrations/supabase/tasks";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead, LeadStatus, ExclusionReason, LostReason } from "@/types/lead";
import { LOST_REASON_LABEL, TIPO_TRABALHO_LABEL } from "@/types/lead";
import type { Task } from "@/types/task";
import type { User } from "@/types/user";
import { toast } from "sonner";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import { RadarAcao } from "@/components/broker/RadarAcao";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import { MetaStrip } from "@/components/broker/MetaStrip";

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const WOLF_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');

  .wolf-ui { font-family:'Rajdhani',sans-serif; }
  .wolf-display { font-family:'Orbitron',monospace; letter-spacing:0.05em; }

  .hex-bg {
    background-color: var(--crm-bg, #080B14);
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,212,255,.06) 0%,transparent 60%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 54,16 54,44 28,58 2,44 2,16' fill='none' stroke='%2300D4FF' stroke-width='0.4' opacity='var(--crm-hex-poly-op,0.12)'/%3E%3C/svg%3E");
    background-size:auto,56px 48px;
  }
  .scanlines::after {
    content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,212,255,.018) 3px,rgba(0,212,255,.018) 4px);
    opacity: var(--crm-scan, 1);
  }

  @keyframes neonBreathe {
    0%,100%{opacity:1;filter:drop-shadow(0 0 4px #00D4FF);}
    50%{opacity:.75;filter:drop-shadow(0 0 12px #00D4FF);}
  }
  @keyframes urgencyFlash {
    0%,100%{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);}
    50%{background:rgba(239,68,68,.35);border-color:rgba(239,68,68,.8);}
  }
  @keyframes crownFloat {
    0%,100%{transform:translateY(0) rotate(-4deg);}
    50%{transform:translateY(-5px) rotate(4deg);}
  }
  @keyframes rank1Glow {
    0%,100%{box-shadow:0 0 15px rgba(245,158,11,.3),0 0 30px rgba(245,158,11,.1);}
    50%{box-shadow:0 0 30px rgba(245,158,11,.6),0 0 60px rgba(245,158,11,.25);}
  }
  @keyframes confettiFall {
    0%{transform:translateY(-10px) rotate(0deg);opacity:1;}
    100%{transform:translateY(500px) rotate(720deg);opacity:0;}
  }
  @keyframes overtakeFlash {
    0%,100%{background:transparent;}
    20%,60%{background:rgba(245,158,11,.08);}
  }
  @keyframes pipelinePulse {
    0%,100%{box-shadow:0 0 0 0 rgba(0,212,255,.4);}
    50%{box-shadow:0 0 0 6px rgba(0,212,255,0);}
  }
  @keyframes tickerScroll {
    0%{transform:translateX(0);}
    100%{transform:translateX(-50%);}
  }
  @keyframes slideInUp {
    from{transform:translateY(8px);opacity:0;}
    to{transform:translateY(0);opacity:1;}
  }

  .anim-neon-breathe{animation:neonBreathe 2.5s ease-in-out infinite;}
  .anim-urgency{animation:urgencyFlash 1s ease-in-out infinite;}
  .anim-crown{animation:crownFloat 2s ease-in-out infinite;}
  .anim-rank1{animation:rank1Glow 2s ease-in-out infinite;}
  .anim-overtake{animation:overtakeFlash .6s ease-in-out;}
  .anim-slide-up{animation:slideInUp .3s ease-out forwards;}

  .ticker-track{animation:tickerScroll 30s linear infinite;}
  .ticker-track:hover{animation-play-state:paused;}

  .border-neon-cyan{border:1px solid rgba(0,212,255,.25);box-shadow:0 0 10px rgba(0,212,255,.08),inset 0 0 10px rgba(0,212,255,.04);}
  .border-neon-gold{border:1px solid rgba(245,158,11,.35);box-shadow:0 0 14px rgba(245,158,11,.12);}

  .btn-whatsapp{background:linear-gradient(135deg,#059669,#10B981);box-shadow:0 4px 18px rgba(16,185,129,.4);transition:all .2s;}
  .btn-whatsapp:hover{box-shadow:0 4px 28px rgba(16,185,129,.65);transform:translateY(-1px);}
  .btn-danger{background:linear-gradient(135deg,#991B1B,#EF4444);box-shadow:0 4px 18px rgba(239,68,68,.3);transition:all .2s;}
  .btn-danger:hover{box-shadow:0 4px 28px rgba(239,68,68,.5);transform:translateY(-1px);}
  .btn-ghost{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);transition:all .2s;}
  .btn-ghost:hover{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.4);}

  .queue-item{transition:all .18s ease;cursor:pointer;}
  .queue-item:hover{background:rgba(0,212,255,.07) !important;border-color:rgba(0,212,255,.3) !important;transform:translateX(2px);}

  .pipeline-btn{transition:all .25s ease;}
  .pipeline-btn.active{animation:pipelinePulse 1.5s ease-out infinite;}
  .pipeline-btn:not(.active):hover{transform:translateY(-2px);}

  .filter-chip{transition:all .2s ease;cursor:pointer;}
  .filter-chip:hover{transform:translateY(-1px);}

  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(0,212,255,.25);border-radius:2px;}
`;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const PIPELINE = [
  { id:"NEW",              label:"NOVO",      color:"#38BDF8", bg:"rgba(56,189,248,.15)"  },
  { id:"IN_PROGRESS",      label:"ATEND.",    color:"#818CF8", bg:"rgba(129,140,248,.15)" },
  { id:"VISIT_SCHEDULED",  label:"VISITA",    color:"#34D399", bg:"rgba(52,211,153,.15)"  },
  { id:"VISITA_REALIZADA", label:"COMPAR.",   color:"#10B981", bg:"rgba(16,185,129,.15)"  },
  { id:"DOCS_REQUESTED",   label:"DOCS",      color:"#FBBF24", bg:"rgba(251,191,36,.15)"  },
  { id:"CONCLUDED",        label:"VENDA",     color:"#F59E0B", bg:"rgba(245,158,11,.2)"   },
];

const STATUS_STYLE: Record<string,{bg:string;text:string;label:string;emoji:string}> = {
  NEW:              { bg:"rgba(56,189,248,.15)",  text:"#38BDF8", label:"NOVO",      emoji:"⚡" },
  IN_PROGRESS:      { bg:"rgba(129,140,248,.15)", text:"#818CF8", label:"ATEND.",    emoji:"💬" },
  VISIT_SCHEDULED:  { bg:"rgba(52,211,153,.15)",  text:"#34D399", label:"VISITA",    emoji:"📅" },
  VISITA_REALIZADA: { bg:"rgba(16,185,129,.15)",  text:"#10B981", label:"COMPAR.",   emoji:"🏠" },
  DOCS_REQUESTED:   { bg:"rgba(251,191,36,.15)",  text:"#FBBF24", label:"DOCS",      emoji:"📄" },
  CONCLUDED:        { bg:"rgba(245,158,11,.2)",   text:"#F59E0B", label:"VENDA",     emoji:"🏆" },
};

const FILTER_OPTIONS: { id:"ALL"|LeadStatus; label:string; emoji:string }[] = [
  { id:"ALL",             label:"TODOS",  emoji:"" },
  { id:"NEW",             label:"NOVO",   emoji:"⚡" },
  { id:"IN_PROGRESS",     label:"ATEND.", emoji:"💬" },
  { id:"VISIT_SCHEDULED", label:"VISITA", emoji:"📅" },
  { id:"DOCS_REQUESTED",  label:"DOCS",   emoji:"📄" },
];

const INTENT_STYLE: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  quente:        { label: "QUENTE",  emoji: "🔥", color: "#EF4444", bg: "rgba(239,68,68,.15)"   },
  morno:         { label: "MORNO",   emoji: "🟡", color: "#F59E0B", bg: "rgba(245,158,11,.13)"  },
  frio:          { label: "FRIO",    emoji: "🔵", color: "#38BDF8", bg: "rgba(56,189,248,.12)"  },
  desqualificado:{ label: "DESQ.",   emoji: "⚫", color: "#64748B", bg: "rgba(100,116,139,.1)"  },
  sem_info:      { label: "?",       emoji: "⚪", color: "#475569", bg: "rgba(71,85,105,.1)"    },
};

const TEMA_LABEL: Record<string, string> = {
  preco: "Preço", entrada: "Entrada", localizacao: "Localização",
  documentacao: "Docs", sem_info: "—",
};
const TEMA_COLOR: Record<string, string> = {
  preco: "#EF4444", entrada: "#F59E0B", localizacao: "#10B981",
  documentacao: "#818CF8", sem_info: "#475569",
};

/** Dica contextual por tema — sem chamada de IA, custo zero */
const TEMA_DICA: Record<string, string> = {
  preco:         "Foco em preço. Destaque a valorização e o baixo custo de entrada do programa.",
  entrada:       "Dúvida sobre entrada. Apresente simulações de financiamento e subsídio MCMV.",
  localizacao:   "Quer saber do entorno. Compartilhe fotos do bairro, acesso e equipamentos próximos.",
  documentacao:  "Pendência documental. Envie o checklist de documentos e ofereça ajuda para agilizar.",
};

// Pontuação por status (espelha o sistema de XP)
const XP_BY_STATUS: Partial<Record<LeadStatus, number>> = {
  IN_PROGRESS:     10,
  VISIT_SCHEDULED: 30,
  DOCS_REQUESTED:  50,
  CONCLUDED:       200,
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/** Minutos desde lastInteractionAt */
function minutesSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

/** Texto da próxima ação baseado em tarefas + status + staleness */
function calcNextAction(lead: Lead, tasks: Task[]): string {
  const open = tasks
    .filter(t => t.leadId === lead.id && t.status === "OPEN")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  if (open.length > 0) return open[0].title;

  const mins = minutesSince(lead.lastInteractionAt);
  if (lead.status === "NEW") return "Primeiro contato — ligar agora";
  if (mins > 60) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `Sem resposta há ${h}h${m > 0 ? ` ${m}min` : ""} — retomar contato`;
  }
  if (lead.status === "IN_PROGRESS")     return "Manter contato ativo";
  if (lead.status === "VISIT_SCHEDULED") return "Confirmar visita agendada";
  if (lead.status === "DOCS_REQUESTED")  return "Cobrar documentação pendente";
  if (lead.status === "CONCLUDED")       return "Negócio fechado — parabéns! 🏆";
  return "Atualizar status do lead";
}

/** Prioridade numérica para ordenação da fila */
function calcPriority(lead: Lead, tasks: Task[]): number {
  const mins = minutesSince(lead.lastInteractionAt);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const hasTaskToday = tasks.some(
    t => t.leadId === lead.id && t.status === "OPEN" && new Date(t.dueAt) <= todayEnd
  );
  if (lead.status === "NEW")          return 1;
  if (mins > 60)                      return 2;
  if (hasTaskToday)                   return 3;
  if (lead.status === "IN_PROGRESS")  return 4;
  if (lead.status === "DOCS_REQUESTED") return 5;
  if (lead.status === "VISIT_SCHEDULED") return 6;
  return 7;
}

/** Formata telefone para link do WhatsApp (remove não-dígitos, adiciona 55) */
function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

/** Iniciais para avatar */
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

/* ─────────────────────────────────────────────
   RANKING QUERY
───────────────────────────────────────────── */
interface RankItem {
  id: string;
  name: string;
  avatar: string;
  pts: number;
  weekVisits: number;
  avgResponseMin: number;
}

async function fetchBrokerRanking(): Promise<RankItem[]> {
  const [{ data: profiles }, { data: leads }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").eq("role", "BROKER"),
    supabase
      .from("leads")
      .select("broker_id, status, created_at")
      .not("broker_id", "is", null)
      .not("status", "in", '("EXCLUDED","ABANDONED")')
      // leads do mês atual
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  if (!profiles || !leads) return [];

  const scoreMap: Record<string, { pts: number; visits: number }> = {};
  for (const lead of leads) {
    const bid = lead.broker_id;
    if (!scoreMap[bid]) scoreMap[bid] = { pts: 0, visits: 0 };
    scoreMap[bid].pts += XP_BY_STATUS[lead.status as LeadStatus] ?? 0;
    if (lead.status === "VISIT_SCHEDULED" || lead.status === "CONCLUDED") {
      scoreMap[bid].visits += 1;
    }
  }

  return profiles
    .map(p => {
      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Corretor";
      const score = scoreMap[p.id] ?? { pts: 0, visits: 0 };
      return {
        id: p.id,
        name,
        avatar: initials(name),
        pts: score.pts,
        weekVisits: score.visits,
        avgResponseMin: 0, // sem dados históricos de resposta por enquanto
      };
    })
    .filter(r => r.pts > 0 || true) // mostrar todos os brokers
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3);
}

/* ─────────────────────────────────────────────
   TICKER — usa conquistas reais via realtime
───────────────────────────────────────────── */
const TICKER_FALLBACK = [
  { icon:"⚡", text:"Atenda os leads novos o quanto antes — primeiros 5min são ouro!", color:"#00D4FF" },
  { icon:"🎯", text:"Meta: responder todo lead em menos de 2 minutos",               color:"#10B981" },
  { icon:"🔥", text:"Consistência bate talento — foque no processo diário",           color:"#F97316" },
  { icon:"🚀", text:"Quem agenda visita primeiro fecha mais — agende hoje",           color:"#818CF8" },
];

function AchievementTicker({ items, highlight }: { items: typeof TICKER_FALLBACK; highlight: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden flex items-center shrink-0" style={{
      height: 38,
      background: highlight
        ? "linear-gradient(90deg,rgba(245,158,11,.2),rgba(245,158,11,.08),rgba(245,158,11,.2))"
        : "var(--crm-ticker-bg, rgba(5,8,18,.9))",
      borderTop: "1px solid rgba(0,212,255,.15)",
      borderBottom: "1px solid rgba(0,212,255,.15)",
      boxShadow: highlight ? "0 0 20px rgba(245,158,11,.25)" : "none",
      transition: "all .5s ease",
    }}>
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-3 gap-2 shrink-0"
        style={{ background: "linear-gradient(90deg,var(--crm-ticker-fade,#080B14) 65%,transparent)", minWidth: 120 }}>
        <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" style={{ filter: "drop-shadow(0 0 4px #F59E0B)" }} />
        <span className="wolf-display text-[9px] font-bold tracking-widest whitespace-nowrap" style={{ color: "#F59E0B" }}>WALL OF FAME</span>
      </div>
      <div className="ticker-track flex gap-10 pl-32 items-center whitespace-nowrap">
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 shrink-0">
            <span className="text-sm">{item.icon}</span>
            <span className="text-xs font-bold" style={{ color: item.color, textShadow: `0 0 8px ${item.color}60` }}>{item.text}</span>
            <span className="text-slate-700 text-xs mx-2">◆</span>
          </div>
        ))}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none"
        style={{ background: "linear-gradient(270deg,var(--crm-ticker-fade,#080B14),transparent)" }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   LOGO
───────────────────────────────────────────── */
function ComandraLogo({ size = 34 }: { size?: number }) {
  return (
    <img src="/comandra-icon.png" alt="Comandra" width={size} height={size}
      className="anim-neon-breathe object-contain"
      style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,.6))" }} />
  );
}

/* ─────────────────────────────────────────────
   CONFETTI
───────────────────────────────────────────── */
function Confetti({ active }: { active: boolean }) {
  const pieces = useRef(Array.from({ length: 36 }, (_, i) => ({
    id: i,
    color: ["#00D4FF","#10B981","#F59E0B","#7C3AED","#EF4444","#FBBF24"][i % 6],
    left: `${(i / 36) * 100 + Math.random() * 4}%`,
    delay: `${Math.random() * .9}s`,
    duration: `${1.4 + Math.random()}s`,
    size: `${6 + Math.random() * 8}px`,
    circle: i % 3 === 0,
  }))).current;
  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: "-12px", left: p.left,
          width: p.size, height: p.size, background: p.color,
          borderRadius: p.circle ? "50%" : "2px",
          animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   URGENCY BADGE
───────────────────────────────────────────── */
function UrgencyBadge({ lastInteractionAt }: { lastInteractionAt: string }) {
  const [mins, setMins] = useState(() => minutesSince(lastInteractionAt));
  useEffect(() => {
    const t = setInterval(() => setMins(minutesSince(lastInteractionAt)), 30000);
    return () => clearInterval(t);
  }, [lastInteractionAt]);

  const h = Math.floor(mins / 60), m = mins % 60;
  const label = h > 0 ? `${h}h ${m}min` : `${m}min`;
  const stale = mins > 60;

  if (stale) return (
    <div className="anim-urgency flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border">
      <Zap className="w-3 h-3 text-red-400" />
      <span className="text-red-300">{label.toUpperCase()}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ background: "rgba(0,212,255,.1)", border: "1px solid rgba(0,212,255,.25)" }}>
      <Zap className="w-3 h-3 text-cyan-400" />
      <span className="text-cyan-300">{label.toUpperCase()}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function DashboardWolf() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const { t } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { playSound } = useAudioArena();

  // ── State ──────────────────────────────────────────────────────────────────
  const [filter, setFilter]             = useState<"ALL" | LeadStatus>("ALL");
  const [activeLead, setActiveLead]     = useState<Lead | null>(null);
  const [activeStatus, setActiveStatus] = useState<string>("");
  const [noteText, setNoteText]         = useState("");
  const [isMuted, setIsMuted]           = useState(false);
  const [confetti, setConfetti]         = useState(false);
  const [rankFlash, setRankFlash]       = useState(false);
  const [saleToast, setSaleToast]       = useState<string | null>(null);
  const [tickerHL, setTickerHL]         = useState(false);
  const [dismissed, setDismissed]       = useState<Set<string>>(new Set());
  const [tickerItems, setTickerItems]   = useState(TICKER_FALLBACK);
  const [mutating, setMutating]         = useState(false);
  const [humanMode, setHumanMode]       = useState(false);
  const [humanModeLoading, setHumanModeLoading] = useState(false);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"battle" | "arena">("battle");
  const [lostSheetOpen, setLostSheetOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const isBroker = role === "BROKER";
  const isPower  = role === "ADMIN" || role === "SUPERINTENDENT";

  const { data: allLeads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["wolfLeads"],
    queryFn: fetchLeadsForDashboard,
    refetchInterval: 30000,
    enabled: !!user,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["wolfTasks"],
    queryFn: fetchOpenTasks,
    refetchInterval: 60000,
    enabled: !!user,
  });

  const { data: ranking = [] } = useQuery<RankItem[]>({
    queryKey: ["wolfRanking"],
    queryFn: fetchBrokerRanking,
    refetchInterval: 120000,
    enabled: !!user,
  });

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["wolfProfiles"],
    queryFn: fetchProfiles,
    enabled: !!user,
  });

  // ── Lead states (intencao / tema / momento) ────────────────────────────────
  const myLeadsIds = useMemo(() => allLeads.filter(l => isPower || l.brokerId === user?.id).map(l => l.id), [allLeads, user?.id, isPower]);
  const { data: statesData = [] } = useQuery({
    queryKey: ["wolfLeadStates", myLeadsIds.join(",")],
    queryFn: async () => {
      if (!myLeadsIds.length) return [];
      const { data } = await supabase
        .from("lead_state")
        .select("lead_id, intencao, tema, momento")
        .in("lead_id", myLeadsIds);
      return (data || []) as { lead_id: string; intencao: string; tema: string; momento: string }[];
    },
    enabled: myLeadsIds.length > 0,
    refetchInterval: 60000,
  });
  const leadStateMap = useMemo(
    () => new Map(statesData.map(s => [s.lead_id, s])),
    [statesData]
  );

  // ── Bot-active lead IDs (automação / sentinela em andamento) ──────────────
  const { data: botActiveLeadIds = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ["wolfBotActiveLeads"],
    queryFn: async () => {
      const [{ data: queueItems }, { data: sentinelaSessions }] = await Promise.all([
        supabase.from("lead_activation_queue").select("lead_id").eq("status", "pending"),
        supabase.from("ai_sentinela_sessions").select("lead_id").eq("status", "active"),
      ]);
      const ids = new Set<string>();
      (queueItems || []).forEach((q: any) => ids.add(q.lead_id));
      (sentinelaSessions || []).forEach((s: any) => ids.add(s.lead_id));
      return ids;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  // ── My profile ─────────────────────────────────────────────────────────────
  const myProfile = profiles.find(p => p.id === user?.id);
  const myName    = myProfile?.name || user?.email?.split("@")[0] || "Corretor";
  const myInitials = initials(myName);

  // ── My ranking position ────────────────────────────────────────────────────
  const myRankPos = useMemo(() => {
    const pos = ranking.findIndex(r => r.id === user?.id);
    return pos >= 0 ? pos + 1 : null;
  }, [ranking, user?.id]);

  // ── Leads filtrados por corretor ───────────────────────────────────────────
  const myLeads = useMemo(() => {
    if (isPower) return allLeads;
    return allLeads.filter(l => l.brokerId === user?.id);
  }, [allLeads, user?.id, isPower]);

  // ── Enriched leads (priority + nextAction) ─────────────────────────────────
  const enriched = useMemo(() => myLeads.map(l => ({
    ...l,
    priority:   calcPriority(l, tasks),
    nextAction: calcNextAction(l, tasks),
    isStale:    minutesSince(l.lastInteractionAt) > 60,
  })), [myLeads, tasks]);

  // ── Fila filtrada ──────────────────────────────────────────────────────────
  const intentRank: Record<string, number> = { quente: 0, morno: 1, frio: 2, sem_info: 3, desqualificado: 4 };
  const filteredLeads = useMemo(() => {
    const base = enriched.filter(l => !dismissed.has(l.id));
    const scoped = filter === "ALL" ? base : base.filter(l => l.status === filter);
    return [...scoped].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ia = leadStateMap.get(a.id)?.intencao || "sem_info";
      const ib = leadStateMap.get(b.id)?.intencao || "sem_info";
      return (intentRank[ia] ?? 3) - (intentRank[ib] ?? 3);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, filter, dismissed, leadStateMap]);

  // ── Contagens por status ───────────────────────────────────────────────────
  const counts = useMemo(() => {
    const base = enriched.filter(l => !dismissed.has(l.id));
    const map: Record<string, number> = { ALL: base.length };
    base.forEach(l => { map[l.status] = (map[l.status] || 0) + 1; });
    return map;
  }, [enriched, dismissed]);

  // ── Auto-select first lead when filter changes ─────────────────────────────
  useEffect(() => {
    if (filteredLeads.length > 0) {
      setActiveLead(filteredLeads[0]);
      setActiveStatus(filteredLeads[0].status);
    } else {
      setActiveLead(null);
      setActiveStatus("");
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-select on initial load ────────────────────────────────────────────
  useEffect(() => {
    if (!activeLead && filteredLeads.length > 0) {
      setActiveLead(filteredLeads[0]);
      setActiveStatus(filteredLeads[0].status);
    }
  }, [filteredLeads]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: novo lead atribuído ──────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("wolf-new-leads")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "leads",
        filter: `broker_id=eq.${user.id}`,
      }, (payload) => {
        const lead = payload.new as any;
        qc.invalidateQueries({ queryKey: ["wolfLeads"] });
        if (!isMuted) playSound("NEW_LEAD");
        toast.info(`⚡ Novo Lead: ${lead.name}`, { description: "Atenda agora — primeiros minutos são decisivos!" });
        setTickerItems(prev => [
          { icon: "⚡", text: `NOVO LEAD: ${lead.name} — atender agora!`, color: "#00D4FF" },
          ...prev.slice(0, 3),
        ]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, isMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: updates de leads ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("wolf-lead-updates")
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "leads",
        filter: `broker_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["wolfLeads"] });
        qc.invalidateQueries({ queryKey: ["wolfRanking"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carrega modo humano quando lead muda ──────────────────────────────────
  useEffect(() => {
    if (!activeLead?.id) { setHumanMode(false); return; }
    supabase
      .from("lead_state")
      .select("modo, bloqueado")
      .eq("lead_id", activeLead.id)
      .maybeSingle()
      .then(({ data }) => setHumanMode(data?.modo === "humano_ativo" || !!data?.bloqueado));
  }, [activeLead?.id]);

  const handleToggleHumanMode = async () => {
    if (!activeLead?.id || !user?.id) return;
    setHumanModeLoading(true);
    const newMode = !humanMode;
    await supabase.rpc("upsert_lead_state", {
      p_lead_id:        activeLead.id,
      p_modo:           newMode ? "humano_ativo" : "automatico",
      p_bloqueado:      newMode,
      p_bloqueado_por:  newMode ? user.id : null,
      p_ultimo_evento:  newMode ? "override_manual" : "override_liberado",
      p_atualizado_por: "corretor",
    });
    setHumanMode(newMode);
    setHumanModeLoading(false);
    toast.success(newMode ? "Automação pausada — você está no controle" : "Automação reativada");
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelect = (lead: typeof filteredLeads[number]) => {
    setActiveLead(lead);
    setActiveStatus(lead.status);
  };

  const handlePipelineClick = async (stepId: string) => {
    if (!activeLead || mutating) return;
    setActiveStatus(stepId);
    // Otimista: atualiza local imediatamente
    setActiveLead(prev => prev ? { ...prev, status: stepId as LeadStatus } : prev);

    if (stepId === "CONCLUDED") {
      setConfetti(true);
      setSaleToast(activeLead.name);
      setTickerHL(true);
      if (!isMuted) playSound("SALE");
      setTickerItems(prev => [
        { icon: "🏆", text: `${myName} fechou negócio com ${activeLead.name}! 🎉`, color: "#F59E0B" },
        ...prev.slice(0, 3),
      ]);
      setTimeout(() => setConfetti(false), 3000);
      setTimeout(() => setSaleToast(null), 4500);
      setTimeout(() => setTickerHL(false), 5000);
    }

    try {
      setMutating(true);
      await updateLeadStatus(activeLead.id, stepId as LeadStatus);
      qc.invalidateQueries({ queryKey: ["wolfLeads"] });
      qc.invalidateQueries({ queryKey: ["wolfRanking"] });
      toast.success(`Lead movido para ${STATUS_STYLE[stepId]?.label || stepId}`);
    } catch (err) {
      toast.error("Erro ao atualizar status. Tente novamente.");
      // Reverter
      setActiveStatus(activeLead.status);
      setActiveLead(activeLead);
    } finally {
      setMutating(false);
    }
  };

  const handleDiscard = () => {
    if (!activeLead || mutating) return;
    setLostSheetOpen(true);
  };

  const handleConfirmLost = async (reason: LostReason) => {
    if (!activeLead || mutating) return;
    const next = filteredLeads.find(l => l.id !== activeLead.id);
    setDismissed(prev => new Set([...prev, activeLead.id]));
    if (next) { setActiveLead(next); setActiveStatus(next.status); }
    else { setActiveLead(null); setActiveStatus(""); }
    setLostSheetOpen(false);

    try {
      setMutating(true);
      await updateLeadStatus(activeLead.id, "ABANDONED", null, reason);
      qc.invalidateQueries({ queryKey: ["wolfLeads"] });
      qc.invalidateQueries({ queryKey: ["wolfRanking"] });
    } catch {
      toast.error("Erro ao registrar perda.");
      setDismissed(prev => { const s = new Set(prev); s.delete(activeLead.id); return s; });
    } finally {
      setMutating(false);
    }
  };

  const handleVisitaRealizada = async (leadId: string) => {
    try {
      setMutating(true);
      await updateLeadStatus(leadId, "VISITA_REALIZADA");
      qc.invalidateQueries({ queryKey: ["wolfLeads"] });
      toast.success("Visita confirmada — solicite a documentação agora!");
    } catch { toast.error("Erro ao confirmar visita."); }
    finally { setMutating(false); }
  };

  const handleNaoCompareceu = async (leadId: string) => {
    try {
      setMutating(true);
      await updateLeadStatus(leadId, "ABANDONED", null, "NAO_COMPARECEU");
      qc.invalidateQueries({ queryKey: ["wolfLeads"] });
      toast.info("Registrado como não compareceu.");
    } catch { toast.error("Erro ao registrar."); }
    finally { setMutating(false); }
  };

  const handleSaveNote = async () => {
    if (!activeLead || !noteText.trim() || !user?.id) return;
    try {
      await createTask({
        userId: user.id,
        leadId: activeLead.id,
        type: "FOLLOW_UP",
        title: noteText.trim(),
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["wolfTasks"] });
      toast.success("Tarefa criada para amanhã");
    } catch {
      toast.error("Erro ao salvar nota");
    }
  };

  const handleWhatsApp = (lead: Pick<Lead, "phone" | "name">, e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.open(whatsappLink(lead.phone), "_blank");
  };

  // ── Loading / redirect ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  const st = activeLead ? STATUS_STYLE[activeStatus || activeLead.status] : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{WOLF_STYLES}</style>
      <Confetti active={confetti} />

      {/* Sale Toast */}
      <AnimatePresence>
        {saleToast && (
          <motion.div
            initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
            className="fixed top-16 right-4 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl"
            style={{
              background: "linear-gradient(135deg,rgba(16,185,129,.97),rgba(5,150,105,.97))",
              boxShadow: "0 0 40px rgba(16,185,129,.5),0 4px 20px rgba(0,0,0,.5)",
              border: "1px solid rgba(16,185,129,.6)"
            }}>
            <Trophy className="w-5 h-5 text-white" />
            <div>
              <div className="wolf-display text-white font-bold text-xs uppercase tracking-widest">VENDA CONFIRMADA</div>
              <div className="text-emerald-200 text-xs mt-0.5">{saleToast} — negócio fechado! 🎉</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="wolf-ui hex-bg scanlines relative flex flex-col h-screen overflow-hidden" style={{ color: t.text }}>

        {/* ── HEADER ── */}
        <header className="shrink-0 flex items-center justify-between px-4 h-12 z-10"
          style={{ background: t.surfaceAlpha, borderBottom: "1px solid rgba(0,212,255,.15)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2.5">
            <ComandraLogo size={30} />
            <div>
              <div className="wolf-display text-xs font-bold tracking-widest" style={{ color: "#00D4FF" }}>COMANDRA</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-widest leading-none">War Room</div>
            </div>
            <div className="w-px h-6 mx-2 bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400 font-semibold">AO VIVO</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Nome do corretor */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs"
                style={{ background: "linear-gradient(135deg,#7C3AED,#00D4FF)" }}>
                {myInitials}
              </div>
              <span className="text-xs text-slate-300 font-semibold">{myName}</span>
            </div>
            {/* Ranking */}
            {myRankPos && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                style={{ background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.25)" }}>
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                <span className="wolf-display text-xs text-violet-300 font-bold">#{myRankPos} RANKING</span>
              </div>
            )}
            {/* Leads hoje */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
              style={{ background: "rgba(0,212,255,.08)", border: "1px solid rgba(0,212,255,.2)" }}>
              <Flame className="w-3.5 h-3.5 text-cyan-400" />
              <span className="wolf-display text-xs text-cyan-300 font-bold">{counts.ALL || 0} LEADS</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                  style={{ background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.35)", color: "#10B981" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,.28)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,.15)"; }}>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span className="wolf-display hidden sm:inline">Novo Lead</span>
                </button>
              </SheetTrigger>
              <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id ?? ""} managerId={myProfile?.managerId ?? null} />
            </Sheet>
            <ThemeToggle compact />
            <button onClick={() => setIsMuted(m => !m)} className="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center">
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
            </button>
            <button className="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button onClick={signOut} className="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center">
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </header>

        {/* ── TICKER ── */}
        <AchievementTicker items={tickerItems} highlight={tickerHL} />

        {/* ── META DO MÊS ── */}
        {isBroker && <MetaStrip />}

        {/* ── WHATSAPP CONNECTION BANNER ── */}
        <WhatsAppQRBanner />

        {/* ── MAIN ── */}
        <main className="flex flex-1 overflow-hidden gap-3 p-3 pb-16 md:pb-3 min-h-0">

          {/* LEFT — Campo de Batalha */}
          <div className={`flex-col gap-2.5 min-h-0 overflow-hidden w-full md:flex-[60] ${mobileTab === "battle" ? "flex" : "hidden md:flex"}`}>

            {/* Loading skeleton */}
            {leadsLoading && (
              <div className="border-neon-cyan rounded-2xl p-4 flex items-center justify-center" style={{ minHeight: 200, background: t.surfaceAlpha }}>
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              </div>
            )}

            {/* Active Lead Card */}
            {!leadsLoading && activeLead && st && (
              <AnimatePresence mode="wait">
                <motion.div key={activeLead.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: .2 }}
                  className="border-neon-cyan rounded-2xl p-4 flex flex-col gap-3 shrink-0"
                  style={{ background: t.surfaceAlpha }}>

                  {/* Lead info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{ background: st.bg, color: st.text }}>{st.emoji} {st.label}</span>
                        {(() => {
                          const ls = leadStateMap.get(activeLead.id);
                          if (!ls || ls.intencao === "sem_info") return null;
                          const is = INTENT_STYLE[ls.intencao] || INTENT_STYLE.sem_info;
                          return (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                              style={{ background: is.bg, color: is.color, border: `1px solid ${is.color}50` }}>
                              {is.emoji} {is.label}
                            </span>
                          );
                        })()}
                        {(() => {
                          const ls = leadStateMap.get(activeLead.id);
                          if (!ls || !ls.tema || ls.tema === "sem_info") return null;
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{ background: "rgba(255,255,255,.05)", color: TEMA_COLOR[ls.tema] || "#64748B", border: "1px solid rgba(255,255,255,.1)" }}>
                              {TEMA_LABEL[ls.tema] || ls.tema}
                            </span>
                          );
                        })()}
                        <span className="text-[10px] text-slate-500 font-semibold">{activeLead.tag || "Lead"}</span>
                      </div>
                      <h2 className="wolf-display text-lg font-bold text-white leading-tight truncate">{activeLead.name}</h2>
                      <p className="text-sm text-cyan-400 font-semibold">{activeLead.phone}</p>
                    </div>
                    <UrgencyBadge lastInteractionAt={activeLead.lastInteractionAt} />
                  </div>

                  {/* AI insight by tema */}
                  {(() => {
                    const ls = leadStateMap.get(activeLead.id);
                    const dica = ls?.tema ? TEMA_DICA[ls.tema] : null;
                    if (!dica) return null;
                    return (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                        style={{ background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.2)" }}>
                        <Brain className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-violet-200 leading-relaxed">{dica}</span>
                      </div>
                    );
                  })()}

                  {/* Next action hint */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(0,212,255,.06)", border: "1px solid rgba(0,212,255,.15)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-xs text-cyan-200 font-semibold">
                      {(activeLead as any).nextAction || calcNextAction(activeLead, tasks)}
                    </span>
                  </div>

                  {/* Pipeline */}
                  <div className="flex items-center gap-1">
                    {PIPELINE.map((step, i) => {
                      const active = step.id === activeStatus;
                      const passed = PIPELINE.findIndex(s => s.id === activeStatus) > i;
                      return (
                        <button key={step.id}
                          onClick={() => handlePipelineClick(step.id)}
                          disabled={mutating}
                          className={`pipeline-btn flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[9px] font-bold uppercase ${active ? "active" : ""}`}
                          style={{
                            background: active ? step.bg : passed ? t.glass : "rgba(255,255,255,.02)",
                            border: active ? `1px solid ${step.color}50` : `1px solid ${t.border}`,
                            color: active ? step.color : passed ? t.textMuted : t.textSubtle,
                            opacity: mutating ? .6 : 1,
                          }}>
                          {active && <div className="w-1.5 h-1.5 rounded-full"
                            style={{ background: step.color, boxShadow: `0 0 6px ${step.color}` }} />}
                          {step.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Renda / Tipo trabalho (Facebook) */}
                  {(activeLead.rendaDeclarada || activeLead.tipoTrabalho) && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                      style={{ background: "rgba(129,140,248,.08)", border: "1px solid rgba(129,140,248,.2)" }}>
                      <span className="text-[10px] text-indigo-300 font-semibold">
                        {[
                          activeLead.rendaDeclarada ? `R$ ${activeLead.rendaDeclarada}` : "",
                          activeLead.tipoTrabalho ? TIPO_TRABALHO_LABEL[activeLead.tipoTrabalho] : "",
                        ].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-[9px] text-indigo-500 ml-auto">via Facebook</span>
                    </div>
                  )}

                  {/* Actions — contextuais por status */}
                  {(() => {
                    const s = activeStatus || activeLead.status;
                    return (
                      <div className="flex gap-2 flex-wrap">
                        {/* WhatsApp — sempre */}
                        <button
                          onClick={() => handleWhatsApp(activeLead)}
                          className="btn-whatsapp flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-black text-white text-sm uppercase tracking-wide flex-1 min-w-[120px]">
                          <MessageSquare className="w-4 h-4" /> WhatsApp
                        </button>

                        {/* Ligar — sempre */}
                        <a href={`tel:${activeLead.phone}`}
                          className="btn-ghost flex flex-col items-center justify-center gap-0.5 h-11 w-14 rounded-xl text-slate-300 hover:text-white cursor-pointer shrink-0">
                          <Phone className="w-4 h-4" />
                          <span className="text-[9px] uppercase font-bold">Ligar</span>
                        </a>

                        {/* Avançar funil — contextual */}
                        {s === "NEW" && (
                          <button onClick={() => handlePipelineClick("IN_PROGRESS")} disabled={mutating}
                            className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                            style={{ background: "rgba(129,140,248,.2)", border: "1px solid rgba(129,140,248,.4)", color: "#818CF8" }}>
                            <ChevronRight className="w-3.5 h-3.5" /> Iniciar
                          </button>
                        )}

                        {s === "IN_PROGRESS" && (
                          <button onClick={() => handlePipelineClick("VISIT_SCHEDULED")} disabled={mutating}
                            className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                            style={{ background: "rgba(52,211,153,.2)", border: "1px solid rgba(52,211,153,.4)", color: "#34D399" }}>
                            <Calendar className="w-3.5 h-3.5" /> Agendar Visita
                          </button>
                        )}

                        {s === "VISIT_SCHEDULED" && (
                          <>
                            <button onClick={() => handleVisitaRealizada(activeLead.id)} disabled={mutating}
                              className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                              style={{ background: "rgba(16,185,129,.2)", border: "1px solid rgba(16,185,129,.4)", color: "#10B981" }}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Compareceu
                            </button>
                            <button onClick={() => handleNaoCompareceu(activeLead.id)} disabled={mutating}
                              className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                              style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#EF4444" }}>
                              <XCircle className="w-3.5 h-3.5" /> Não veio
                            </button>
                          </>
                        )}

                        {s === "VISITA_REALIZADA" && (
                          <button onClick={() => handlePipelineClick("DOCS_REQUESTED")} disabled={mutating}
                            className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                            style={{ background: "rgba(251,191,36,.2)", border: "1px solid rgba(251,191,36,.4)", color: "#FBBF24" }}>
                            <FileText className="w-3.5 h-3.5" /> Solicitar Docs
                          </button>
                        )}

                        {s === "DOCS_REQUESTED" && (
                          <button onClick={() => handlePipelineClick("CONCLUDED")} disabled={mutating}
                            className="flex items-center gap-1.5 h-11 px-3 rounded-xl font-black text-xs uppercase tracking-wide shrink-0 transition-all"
                            style={{ background: "rgba(245,158,11,.2)", border: "1px solid rgba(245,158,11,.4)", color: "#F59E0B" }}>
                            <Trophy className="w-3.5 h-3.5" /> Fechar Venda 🏆
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Override de automação */}
                  <button
                    onClick={handleToggleHumanMode}
                    disabled={humanModeLoading}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all"
                    style={{
                      background: humanMode ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${humanMode ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {humanMode
                        ? <UserCheck className="w-3.5 h-3.5" style={{ color: "#7C3AED" }} />
                        : <Bot className="w-3.5 h-3.5" style={{ color: "#475569" }} />
                      }
                      <span className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: humanMode ? "#A78BFA" : "#475569" }}>
                        {humanMode ? "Modo Manual — automação pausada" : "Modo Automático"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {humanModeLoading
                        ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#475569" }} />
                        : <div className="w-7 h-4 rounded-full relative transition-all"
                            style={{ background: humanMode ? "#7C3AED" : "rgba(255,255,255,0.1)" }}>
                            <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
                              style={{ left: humanMode ? "14px" : "2px" }} />
                          </div>
                      }
                    </div>
                  </button>

                  {/* Note + Discard */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex gap-2 rounded-xl px-3 py-2 items-center"
                      style={{ background: t.glass, border: `1px solid ${t.border}` }}>
                      <input value={noteText} onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSaveNote()}
                        placeholder="Nota rápida (Enter para salvar como tarefa)..."
                        className="flex-1 bg-transparent text-sm placeholder-slate-600 outline-none"
                        style={{ color: t.text }} />
                      <button onClick={handleSaveNote} disabled={!noteText.trim()}
                        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all hover:bg-cyan-500/20"
                        style={{ color: "#00D4FF" }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button onClick={handleDiscard} disabled={mutating}
                      className="btn-danger flex items-center gap-1.5 px-3 h-10 rounded-xl font-black text-white text-xs uppercase tracking-wide shrink-0"
                      style={{ opacity: mutating ? .6 : 1 }}>
                      <X className="w-3.5 h-3.5" /> Perdido
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* Empty state */}
            {!leadsLoading && !activeLead && (
              <div className="border-neon-cyan rounded-2xl p-8 flex flex-col items-center justify-center gap-3" style={{ background: t.surfaceAlpha }}>
                <CheckCircle2 className="w-10 h-10 text-emerald-400 opacity-60" />
                <p className="wolf-display text-sm text-slate-400">Fila limpa — bom trabalho!</p>
                <p className="text-xs text-slate-600">Todos os leads foram atendidos</p>
              </div>
            )}

            {/* ── FILTER CHIPS ── */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {FILTER_OPTIONS.map(opt => {
                const count = counts[opt.id] || 0;
                if (opt.id !== "ALL" && count === 0) return null;
                const active = filter === opt.id;
                const col = opt.id === "ALL" ? "#00D4FF" : STATUS_STYLE[opt.id]?.text || "#00D4FF";
                return (
                  <button key={opt.id}
                    onClick={() => setFilter(opt.id)}
                    className="filter-chip flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{
                      background: active ? `${col}20` : t.glass,
                      border: active ? `1px solid ${col}60` : `1px solid ${t.border}`,
                      color: active ? col : "#475569",
                      boxShadow: active ? `0 0 10px ${col}30` : "none",
                    }}>
                    {opt.emoji && <span>{opt.emoji}</span>}
                    <span>{opt.label}</span>
                    <span className="wolf-display text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{
                        background: active ? `${col}25` : "rgba(255,255,255,.08)",
                        color: active ? col : "#64748B",
                      }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* ── RADAR DE AÇÃO ── */}
            <RadarAcao onSelectLead={(id) => { const lead = filteredLeads.find(l => l.id === id); if (lead) handleSelect(lead); }} botActiveLeadIds={botActiveLeadIds} />

            {/* ── LEAD QUEUE ── */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5 min-h-0">
              <AnimatePresence>
                {filteredLeads.length === 0 && !leadsLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-10 text-slate-600">
                    <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm font-semibold">Nenhum lead neste filtro</p>
                  </motion.div>
                )}
                {filteredLeads.map((lead, i) => {
                  const isActive = lead.id === activeLead?.id;
                  const s = STATUS_STYLE[lead.status];
                  const isStale = minutesSince(lead.lastInteractionAt) > 60;
                  return (
                    <motion.div key={lead.id}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }} transition={{ delay: i * .04 }}
                      onClick={() => handleSelect(lead)}
                      className="queue-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{
                        background: isActive ? "rgba(0,212,255,.1)" : t.glass,
                        border: isActive ? "1px solid rgba(0,212,255,.4)" : `1px solid ${t.border}`,
                      }}>

                      {/* Priority dot */}
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: isStale ? "#EF4444" : lead.status === "NEW" ? "#00D4FF" : s?.text,
                          boxShadow: isStale ? "0 0 6px #EF4444" : lead.status === "NEW" ? "0 0 6px #00D4FF" : "none",
                        }} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white truncate leading-tight">{lead.name}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase"
                            style={{ background: s?.bg, color: s?.text }}>{s?.label}</span>
                          {(() => {
                            const ls = leadStateMap.get(lead.id);
                            if (!ls || ls.intencao === "sem_info") return null;
                            const is = INTENT_STYLE[ls.intencao] || INTENT_STYLE.sem_info;
                            return (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0"
                                style={{ background: is.bg, color: is.color }}>{is.emoji}</span>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {(lead as any).nextAction || calcNextAction(lead, tasks)}
                        </div>
                      </div>

                      {/* Urgency */}
                      {isStale && (
                        <span className="text-[9px] font-bold text-red-400 shrink-0 whitespace-nowrap">
                          ⚡ {minutesSince(lead.lastInteractionAt)}min
                        </span>
                      )}

                      {/* WhatsApp inline */}
                      <button onClick={e => handleWhatsApp(lead, e)}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: "rgba(16,185,129,.2)", border: "1px solid rgba(16,185,129,.3)" }}>
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT — ARENA */}
          <div className={`flex-col gap-3 overflow-y-auto min-h-0 pr-0.5 w-full md:flex-[40] ${mobileTab === "arena" ? "flex" : "hidden md:flex"}`}>

            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="wolf-display text-sm font-bold uppercase tracking-wider" style={{ color: "#F59E0B" }}>ARENA</span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">RANKING DO MÊS</span>
            </div>

            {/* Podium */}
            <div className={`border-neon-gold rounded-2xl p-4 flex flex-col gap-3 ${rankFlash ? "anim-overtake" : ""}`}
              style={{ background: t.surfaceAlpha }}>

              {ranking.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-xs">
                  Sem dados de ranking ainda este mês
                </div>
              ) : (
                <>
                  {/* #1 */}
                  <motion.div layout
                    className="anim-rank1 rounded-xl p-3 flex items-center gap-3"
                    style={{ background: "linear-gradient(135deg,rgba(245,158,11,.12),rgba(245,158,11,.06))", border: "1px solid rgba(245,158,11,.35)" }}>
                    <div className="relative shrink-0">
                      <div className="anim-crown absolute -top-4 left-1/2 -translate-x-1/2 text-base">👑</div>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-sm wolf-display"
                        style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#080B14", boxShadow: "0 0 20px rgba(245,158,11,.5)" }}>
                        {ranking[0].avatar}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white text-sm">{ranking[0].name}</span>
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">#1</span>
                        {ranking[0].id === user?.id && (
                          <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold">VOCÊ</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="wolf-display text-amber-400 text-xs font-bold">{ranking[0].pts} PTS</span>
                        {ranking[0].weekVisits > 0 && <span className="text-[9px] text-slate-500">📅 {ranking[0].weekVisits} visitas</span>}
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden bg-slate-800">
                        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 1.2, delay: .3 }}
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg,#F59E0B,#FBBF24)", boxShadow: "0 0 8px rgba(245,158,11,.6)" }} />
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                  </motion.div>

                  {/* #2 #3 */}
                  {ranking.slice(1).map((r, i) => {
                    const pct = ranking[0].pts > 0
                      ? Math.round((r.pts / ranking[0].pts) * 100)
                      : 0;
                    return (
                      <motion.div key={r.id} layout
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .1 * (i + 1) }}
                        className="rounded-xl p-3 flex items-center gap-3"
                        style={{ background: t.glass, border: `1px solid ${t.border}` }}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs wolf-display text-slate-300 shrink-0"
                          style={{ background: i === 0 ? "rgba(148,163,184,.12)" : "rgba(180,83,9,.08)", border: i === 0 ? "1px solid rgba(148,163,184,.2)" : "1px solid rgba(180,83,9,.2)" }}>
                          {r.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 text-sm">{r.name}</span>
                            <span className="text-[9px] text-slate-600 font-bold">#{i + 2}</span>
                            {r.id === user?.id && (
                              <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold">VOCÊ</span>
                            )}
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, delay: .5 + i * .2 }}
                              className="h-full rounded-full"
                              style={{ background: i === 0 ? "rgba(148,163,184,.5)" : "rgba(180,83,9,.5)" }} />
                          </div>
                        </div>
                        <span className="wolf-display text-xs font-bold text-slate-400 shrink-0">{r.pts}</span>
                      </motion.div>
                    );
                  })}

                  {/* Insight do líder */}
                  <div className="rounded-xl p-3" style={{ background: "rgba(0,212,255,.06)", border: "1px solid rgba(0,212,255,.15)" }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Star className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">SEGREDO DO LÍDER</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-bold text-white">{ranking[0].name}</span> este mês:{" "}
                      {ranking[0].weekVisits > 0 && (
                        <><span className="text-cyan-300">{ranking[0].weekVisits} visitas agendadas</span> · </>
                      )}
                      <span className="wolf-display text-amber-300 font-bold">{ranking[0].pts} pts</span>
                      {" "}acumulados
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Stats pessoais */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">SEUS NÚMEROS</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Leads Ativos",  value: counts.ALL || 0,                    color: "#00D4FF" },
                  { label: "Novos",          value: counts.NEW || 0,                    color: "#38BDF8" },
                  { label: "Em Atend.",      value: counts.IN_PROGRESS || 0,            color: "#818CF8" },
                  { label: "Visitas",        value: counts.VISIT_SCHEDULED || 0,        color: "#34D399" },
                ].map(stat => (
                  <div key={stat.label} className="flex flex-col px-3 py-2.5 rounded-xl"
                    style={{ background: t.glass, border: `1px solid ${t.border}` }}>
                    <span className="wolf-display text-xl font-black" style={{ color: stat.color }}>{stat.value}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ── SHEET: MOTIVO DE PERDA ── */}
        <Sheet open={lostSheetOpen} onOpenChange={setLostSheetOpen}>
          <SheetContent side="bottom" className="bg-[#080B14] border-white/10 text-white rounded-t-2xl pb-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Por que esse lead foi perdido?
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-2">
              {(Object.entries(LOST_REASON_LABEL) as [NonNullable<LostReason>, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleConfirmLost(key)}
                  disabled={mutating}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.15)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,.35)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.08)"; }}>
                  {label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── MOBILE BOTTOM TAB BAR ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex h-14 shrink-0"
          style={{ background: "rgba(8,11,20,0.97)", borderTop: "1px solid rgba(0,212,255,.15)", backdropFilter: "blur(12px)" }}>
          <button
            onClick={() => setMobileTab("battle")}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all"
            style={{ color: mobileTab === "battle" ? "#00D4FF" : "#475569" }}>
            <Shield className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Campo</span>
          </button>
          <div className="w-px my-3" style={{ background: "rgba(0,212,255,.1)" }} />
          <button
            onClick={() => setMobileTab("arena")}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all"
            style={{ color: mobileTab === "arena" ? "#F59E0B" : "#475569" }}>
            <Trophy className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Arena</span>
          </button>
        </nav>

      </div>
    </>
  );
}
