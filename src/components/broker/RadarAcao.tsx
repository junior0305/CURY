import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForDashboard, registerBrokerContact } from "@/integrations/supabase/leads";
import { supabase } from "@/integrations/supabase/client";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import { Lead, LeadStatus } from "@/types/lead";
import { Task } from "@/types/task";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, ChevronLeft, Flame, Calendar, FileText,
  Zap, Clock, Bot, MessageSquare, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type UrgencyLevel = "critico" | "urgente" | "importante" | "novo";

type UrgentAction = {
  lead: Lead;
  level: UrgencyLevel;
  label: string;
  action: string;
  icon: React.ElementType;
  /** Contexto de lead_state — quando disponível */
  stateCtx?: string;
};

// ─── Nível de urgência por lead ───────────────────────────────────────────────

function getUrgencyLevel(
  lead: Lead,
  tasks: Task[],
  now: number,
  botActiveIds: Set<string>,
): UrgentAction | null {
  if (["ABANDONED", "EXCLUDED", "CONCLUDED"].includes(lead.status)) return null;

  const hoursSince = (now - new Date(lead.lastInteractionAt || lead.createdAt || now).getTime()) / 3600000;
  const isBotActive = botActiveIds.has(lead.id);

  // 1. DOCS — lead pronto para fechar (máxima prioridade)
  if (lead.status === "DOCS_REQUESTED") {
    const dias = Math.floor(hoursSince / 24);
    return {
      lead, level: "critico", icon: FileText,
      label: "🔥 Docs pendentes",
      action: dias >= 1
        ? `${lead.name} não enviou os docs há ${dias}d — cobrar agora para não perder a venda`
        : `${lead.name} está com documentação pendente — cobrar envio`,
    };
  }

  // 2. VISITA — compromisso real marcado
  if (lead.status === "VISIT_SCHEDULED") {
    return {
      lead, level: "urgente", icon: Calendar,
      label: "🏠 Visita marcada",
      action: `Confirmar visita com ${lead.name} e preparar os detalhes do imóvel`,
    };
  }

  // 3. Lead respondeu recentemente (< 2h) — está esperando
  const lastResp = lead.lastLeadResponseAt;
  if (lastResp) {
    const minsAgo = Math.floor((now - new Date(lastResp).getTime()) / 60000);
    if (minsAgo < 120) {
      return {
        lead, level: "critico", icon: Flame,
        label: `${minsAgo < 60 ? `${minsAgo}min atrás` : `${Math.floor(minsAgo / 60)}h atrás`}`,
        action: `${lead.name} respondeu e está esperando — atenda agora enquanto está quente`,
      };
    }
  }

  // 4. Bot ativo — automação cuidando
  if (isBotActive) {
    return {
      lead, level: "novo", icon: Bot,
      label: "🤖 Bot em contato",
      action: `Automação ativa para ${lead.name} — acompanhe e assuma quando responder`,
    };
  }

  // 5. NOVO sem contato
  if (lead.status === "NEW") {
    const hLabel = hoursSince < 1 ? `${Math.round(hoursSince * 60)}min` : `${Math.floor(hoursSince)}h`;
    return {
      lead, level: hoursSince > 1 ? "importante" : "urgente", icon: Zap,
      label: `Novo — ${hLabel} sem contato`,
      action: `Enviar apresentação agora — contato em < 5 min aumenta conversão em 3x`,
    };
  }

  // 6. IN_PROGRESS parado > 24h sem tarefa
  if (lead.status === "IN_PROGRESS" && hoursSince >= 24) {
    const hasPendingTask = tasks.some(t => t.leadId === lead.id);
    if (!hasPendingTask) {
      return {
        lead, level: "importante", icon: Clock,
        label: `Parado ${Math.floor(hoursSince)}h`,
        action: `${lead.name} sem atividade — agendar próxima ação para não perder`,
      };
    }
  }

  return null;
}

// ─── Estilos por nível ────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<UrgencyLevel, {
  wrap: string; border: string; dot: string;
  badge: string; btn: string;
}> = {
  critico:    {
    wrap:   "bg-red-950/40",
    border: "border-red-500/50",
    dot:    "bg-red-400",
    badge:  "bg-red-500/20 text-red-300 border-red-500/30",
    btn:    "bg-red-600 hover:bg-red-500 text-white",
  },
  urgente:    {
    wrap:   "bg-emerald-950/30",
    border: "border-emerald-500/40",
    dot:    "bg-emerald-400",
    badge:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    btn:    "bg-emerald-600 hover:bg-emerald-500 text-white",
  },
  importante: {
    wrap:   "bg-amber-950/30",
    border: "border-amber-500/40",
    dot:    "bg-amber-400",
    badge:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
    btn:    "bg-amber-600 hover:bg-amber-500 text-white",
  },
  novo:       {
    wrap:   "bg-sky-950/30",
    border: "border-sky-500/30",
    dot:    "bg-sky-400",
    badge:  "bg-sky-500/20 text-sky-300 border-sky-500/30",
    btn:    "bg-sky-600 hover:bg-sky-500 text-white",
  },
};

// ─── Componente ───────────────────────────────────────────────────────────────

interface RadarAcaoProps {
  onSelectLead: (id: string) => void;
  botActiveLeadIds?: Set<string>;
}

export function RadarAcao({ onSelectLead, botActiveLeadIds = new Set() }: RadarAcaoProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const now = Date.now();

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchOpenTasks,
  });

  // lead_state para enriquecer o contexto das ações
  const myActiveIds = leads
    .filter(l => l.brokerId === session?.user.id && !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status))
    .map(l => l.id);

  const { data: stateMap = new Map<string, any>() } = useQuery({
    queryKey: ["lead-states", myActiveIds.join(",")],
    enabled: myActiveIds.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_state")
        .select("lead_id, intencao, tema, momento")
        .in("lead_id", myActiveIds);
      const map = new Map<string, any>();
      (data ?? []).forEach(s => map.set(s.lead_id, s));
      return map;
    },
  });

  // ── Compila ações urgentes ────────────────────────────────────────────────
  const urgentActions = useMemo(() => {
    const myLeads = leads.filter(l => l.brokerId === session?.user.id);
    const order: Record<UrgencyLevel, number> = { critico: 0, urgente: 1, importante: 2, novo: 3 };

    const actions: UrgentAction[] = [];
    for (const lead of myLeads) {
      const action = getUrgencyLevel(lead, tasks, now, botActiveLeadIds);
      if (!action) continue;

      // Enriquece com lead_state
      const state = stateMap.get(lead.id);
      if (state) {
        const parts: string[] = [];
        if (state.intencao && state.intencao !== "sem_info") {
          parts.push(state.intencao === "quente" ? "🔥 Quente" : state.intencao === "morno" ? "🟡 Morno" : "🔵 Frio");
        }
        if (state.tema && state.tema !== "sem_info") {
          const TEMA: Record<string, string> = {
            visita: "quer visitar", documentacao: "docs pendentes",
            preco: "dúvida preço", entrada: "dúvida entrada", localizacao: "avaliando local",
          };
          parts.push(TEMA[state.tema] || state.tema);
        }
        if (state.momento && state.momento !== "explorando") {
          parts.push(state.momento === "decidido" ? "decidido" : "comparando");
        }
        if (parts.length) action.stateCtx = parts.join(" · ");
      }

      actions.push(action);
    }

    return actions.sort((a, b) => order[a.level] - order[b.level]);
  }, [leads, tasks, session?.user.id, stateMap]);

  // ── Estado "Tudo em dia ✓" ────────────────────────────────────────────────
  if (urgentActions.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-black text-emerald-300">Tudo em dia ✓</p>
          <p className="text-xs text-emerald-500/70 mt-0.5">
            Sem ações urgentes no momento. Bom trabalho!
          </p>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(index, urgentActions.length - 1);
  const current = urgentActions[safeIndex];
  const style = LEVEL_STYLES[current.level];
  const Icon = current.icon;

  return (
    <div className={cn("rounded-xl border p-3 space-y-2.5", style.wrap, style.border)}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", style.dot)} />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
            O que fazer agora
          </span>
        </div>
        {urgentActions.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={safeIndex === 0}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-gray-600 tabular-nums">
              {safeIndex + 1}/{urgentActions.length}
            </span>
            <button
              onClick={() => setIndex(i => Math.min(urgentActions.length - 1, i + 1))}
              disabled={safeIndex === urgentActions.length - 1}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Corpo do card ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg border shrink-0", style.badge)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-white font-black text-sm truncate">{current.lead.name}</p>
            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", style.badge)}>
              {current.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-snug">{current.action}</p>
          {current.stateCtx && (
            <p className="text-[10px] text-gray-600 mt-0.5">{current.stateCtx}</p>
          )}
        </div>
      </div>

      {/* ── Ações: WhatsApp direto + Abrir lead ────────────────────────────── */}
      <div className="flex gap-1.5">
        {current.lead.phone && (
          <button
            onClick={() => {
              registerBrokerContact(current.lead.id).then(() => {
                queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
              });
              window.open(`https://wa.me/${current.lead.phone.replace(/\D/g, "")}`, "_blank");
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-black transition-all active:scale-95"
          >
            <MessageSquare className="w-3 h-3" />
            WhatsApp
          </button>
        )}
        <Button
          size="sm"
          onClick={() => onSelectLead(current.lead.id)}
          className={cn("flex-1 h-8 text-[11px] font-black gap-1", style.btn)}
        >
          Ver lead
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
