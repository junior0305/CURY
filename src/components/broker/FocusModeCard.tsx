import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchLeadsForDashboard, registerBrokerContact, updateLeadStatus, togglePauseAutoMessages } from "@/integrations/supabase/leads";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Lead, LeadStatus, NEXT_STATUS, LOST_REASON_LABEL, TIPO_TRABALHO_LABEL, LostReason } from "@/types/lead";
import { Task } from "@/types/task";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import { differenceInMinutes, differenceInHours } from "date-fns";
import {
  Flame, Zap, Calendar, FileText, Clock, Bot,
  MessageSquare, ChevronRight, ChevronLeft,
  CheckCircle2, X, Check, AlertTriangle, UserCheck, BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ─── Prioridade ───────────────────────────────────────────────────────────────

type Priority = "critico" | "urgente" | "importante" | "normal";

interface ActionItem {
  lead: Lead;
  priority: Priority;
  label: string;
  action: string;
  icon: React.ElementType;
  stateCtx?: string;
}

function getPriority(lead: Lead, tasks: Task[], now: number, botIds: Set<string>): ActionItem | null {
  if (["ABANDONED", "EXCLUDED", "CONCLUDED"].includes(lead.status)) return null;

  const hoursSince = (now - new Date(lead.lastInteractionAt || lead.createdAt).getTime()) / 3600000;

  // 1. Docs — quase fechando
  if (lead.status === "DOCS_REQUESTED") {
    const dias = Math.floor(hoursSince / 24);
    return {
      lead, priority: "critico", icon: FileText,
      label: "📄 Docs pendentes",
      action: dias >= 1
        ? `${lead.name} não enviou os docs há ${dias}d — cobrar agora`
        : `${lead.name} com documentação pendente — cobrar envio`,
    };
  }

  // 2. Visita realizada — avançar para docs
  if (lead.status === "VISITA_REALIZADA") {
    return {
      lead, priority: "critico", icon: FileText,
      label: "🏠 Visita feita",
      action: `${lead.name} compareceu ao plantão — solicitar documentação agora`,
    };
  }

  // 3. Lead respondeu recentemente
  if (lead.lastLeadResponseAt) {
    const mins = differenceInMinutes(now, new Date(lead.lastLeadResponseAt));
    if (mins < 120) {
      return {
        lead, priority: "critico", icon: Flame,
        label: `${mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h`} atrás`,
        action: `${lead.name} respondeu e está esperando — atenda agora`,
      };
    }
  }

  // 4. Visita agendada — verificar confirmação
  if (lead.status === "VISIT_SCHEDULED") {
    const confirmed = lead.visitaConfirmada;
    return {
      lead, priority: "urgente", icon: Calendar,
      label: confirmed === false ? "⚠️ Não confirmou" : confirmed === true ? "✅ Confirmado" : "🏠 Visita marcada",
      action: confirmed !== true
        ? `Confirmar presença de ${lead.name} antes da visita`
        : `Visita confirmada com ${lead.name} — preparar para o plantão`,
    };
  }

  // 5. Bot ativo
  if (botIds.has(lead.id)) {
    return {
      lead, priority: "normal", icon: Bot,
      label: "🤖 Bot ativo",
      action: `Automação em contato com ${lead.name} — acompanhe`,
    };
  }

  // 6. Novo sem contato
  if (lead.status === "NEW") {
    const h = hoursSince;
    const label = h < 1 ? `${Math.round(h * 60)}min sem contato` : `${Math.floor(h)}h sem contato`;
    return {
      lead, priority: h > 1 ? "importante" : "urgente", icon: Zap,
      label,
      action: `Primeiro contato com ${lead.name} — cada minuto conta`,
    };
  }

  // 7. Em atendimento parado > 24h
  if (lead.status === "IN_PROGRESS" && hoursSince >= 24) {
    if (!tasks.some(t => t.leadId === lead.id)) {
      return {
        lead, priority: "importante", icon: Clock,
        label: `Parado ${Math.floor(hoursSince)}h`,
        action: `${lead.name} sem atividade — definir próxima ação`,
      };
    }
  }

  // 8. Automação pausada — manter lead visível para o corretor conduzir manualmente
  if (lead.pauseAutoMessages) {
    return {
      lead, priority: "normal", icon: BellOff,
      label: "Bot pausado",
      action: `Follow-up automático pausado para ${lead.name} — conduza manualmente`,
    };
  }

  return null;
}

const PRIORITY_STYLE: Record<Priority, { wrap: string; border: string; dot: string; badge: string; btn: string }> = {
  critico:   { wrap: "bg-red-950/40",    border: "border-red-500/50",     dot: "bg-red-400",    badge: "bg-red-500/20 text-red-300 border-red-500/30",       btn: "bg-red-600 hover:bg-red-500 text-white" },
  urgente:   { wrap: "bg-emerald-950/30", border: "border-emerald-500/40", dot: "bg-emerald-400", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", btn: "bg-emerald-600 hover:bg-emerald-500 text-white" },
  importante:{ wrap: "bg-amber-950/30",  border: "border-amber-500/40",   dot: "bg-amber-400",  badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",   btn: "bg-amber-600 hover:bg-amber-500 text-white" },
  normal:    { wrap: "bg-sky-950/30",    border: "border-sky-500/30",     dot: "bg-sky-400",    badge: "bg-sky-500/20 text-sky-300 border-sky-500/30",         btn: "bg-sky-600 hover:bg-sky-500 text-white" },
};

// ─── Componente ───────────────────────────────────────────────────────────────

interface FocusModeCardProps {
  onSelectLead: (id: string) => void;
  botActiveLeadIds?: Set<string>;
}

export function FocusModeCard({ onSelectLead, botActiveLeadIds = new Set() }: FocusModeCardProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [lostSheetOpen, setLostSheetOpen] = useState(false);
  const [pendingLostLeadId, setPendingLostLeadId] = useState<string | null>(null);
  const [checkInLeadId, setCheckInLeadId] = useState<string | null>(null);
  const [pausingLeadId, setPausingLeadId] = useState<string | null>(null);
  const now = Date.now();

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchOpenTasks,
  });

  // lead_state para enriquecer contexto
  const myActiveIds = leads
    .filter(l => l.brokerId === session?.user.id && !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status))
    .map(l => l.id);

  const { data: stateMap = new Map() } = useQuery({
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

  const advanceMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      updateLeadStatus(leadId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] }),
  });

  const lostMutation = useMutation({
    mutationFn: ({ leadId, reason }: { leadId: string; reason: LostReason }) =>
      updateLeadStatus(leadId, "ABANDONED", null, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      setLostSheetOpen(false);
      setPendingLostLeadId(null);
    },
  });

  const actions = useMemo(() => {
    const order: Record<Priority, number> = { critico: 0, urgente: 1, importante: 2, normal: 3 };
    const myLeads = leads.filter(l => l.brokerId === session?.user.id);
    const items: ActionItem[] = [];

    for (const lead of myLeads) {
      const item = getPriority(lead, tasks, now, botActiveLeadIds);
      if (!item) continue;

      const state = stateMap.get(lead.id);
      if (state) {
        const parts: string[] = [];
        if (state.intencao && state.intencao !== "sem_info") {
          parts.push(state.intencao === "quente" ? "🔥 Quente" : state.intencao === "morno" ? "🟡 Morno" : "🔵 Frio");
        }
        if (lead.product)        parts.push(`📦 ${lead.product}`);
        if (lead.rendaDeclarada) parts.push(`R$ ${lead.rendaDeclarada}`);
        if (lead.tipoTrabalho)   parts.push(TIPO_TRABALHO_LABEL[lead.tipoTrabalho] ?? "");
        if (parts.length) item.stateCtx = parts.join(" · ");
      }

      items.push(item);
    }

    return items.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [leads, tasks, stateMap, session?.user.id, botActiveLeadIds, now]);

  // Tudo em dia
  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-black text-emerald-300">Tudo em dia ✓</p>
          <p className="text-xs text-emerald-500/70 mt-0.5">Sem ações urgentes. Continue assim!</p>
        </div>
      </div>
    );
  }

  const safeIdx = Math.min(index, actions.length - 1);
  const current = actions[safeIdx];
  const style = PRIORITY_STYLE[current.priority];
  const Icon = current.icon;
  const next = NEXT_STATUS[current.lead.status];

  return (
    <>
      <div className={cn("rounded-xl border p-3 space-y-2.5", style.wrap, style.border)}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", style.dot)} />
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Faça isso agora</span>
          </div>
          {actions.length > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
                className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30">
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[10px] text-gray-600 tabular-nums">{safeIdx + 1}/{actions.length}</span>
              <button onClick={() => setIndex(i => Math.min(actions.length - 1, i + 1))} disabled={safeIdx === actions.length - 1}
                className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30">
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Corpo */}
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

        {/* Ações */}
        <div className="flex flex-wrap gap-1.5">
          {current.lead.phone && (
            <button
              onClick={() => {
                registerBrokerContact(current.lead.id).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] })
                );
                window.open(`https://wa.me/${current.lead.phone.replace(/\D/g, "")}`, "_blank");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-black transition-all active:scale-95"
            >
              <MessageSquare className="w-3 h-3" />
              WhatsApp
            </button>
          )}

          {/* Check-in manual — falou fora do chip */}
          <button
            onClick={async () => {
              await registerBrokerContact(current.lead.id);
              await supabase.from("lead_notes").insert({
                lead_id: current.lead.id,
                content: "✅ Check-in: corretor confirmou contato com o cliente fora do chip",
              });
              queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
              setCheckInLeadId(current.lead.id);
              setTimeout(() => setCheckInLeadId(null), 3000);
            }}
            disabled={checkInLeadId === current.lead.id}
            title="Falei com o cliente agora (fora do chip)"
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-black transition-all active:scale-95",
              checkInLeadId === current.lead.id
                ? "bg-emerald-500/20 text-emerald-300 cursor-default"
                : "bg-white/5 hover:bg-sky-500/15 text-gray-400 hover:text-sky-300"
            )}
          >
            <UserCheck className="w-3 h-3 shrink-0" />
            {checkInLeadId === current.lead.id ? "✓" : ""}
          </button>

          {next && (
            <button
              onClick={() => advanceMutation.mutate({ leadId: current.lead.id, status: next.status })}
              disabled={advanceMutation.isPending}
              className={cn("flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-black transition-all active:scale-95 disabled:opacity-60", style.btn)}
            >
              <Check className="w-3 h-3" />
              {next.label}
            </button>
          )}

          {/* Toggle pausa automações */}
          <button
            onClick={async () => {
              const lead = current.lead;
              setPausingLeadId(lead.id);
              try {
                await togglePauseAutoMessages(lead.id, !lead.pauseAutoMessages);
                queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
              } finally {
                setPausingLeadId(null);
              }
            }}
            disabled={pausingLeadId === current.lead.id}
            title={current.lead.pauseAutoMessages ? "Automações pausadas — clique para reativar" : "Pausar follow-up automático"}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-black transition-all active:scale-95",
              current.lead.pauseAutoMessages
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300"
            )}
          >
            <BellOff className="w-3 h-3 shrink-0" />
            {current.lead.pauseAutoMessages ? "Pausado" : ""}
          </button>

          <button
            onClick={() => onSelectLead(current.lead.id)}
            className="ml-auto flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[11px] font-bold transition-all"
          >
            Ver lead
            <ChevronRight className="w-3 h-3" />
          </button>

          <button
            onClick={() => { setPendingLostLeadId(current.lead.id); setLostSheetOpen(true); }}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-red-950/50 text-gray-700 hover:text-red-400 transition-all"
            title="Marcar como perdido"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sheet: motivo de perda */}
      <Sheet open={lostSheetOpen} onOpenChange={setLostSheetOpen}>
        <SheetContent side="bottom" className="bg-[#0d1117] border-white/10 text-white rounded-t-2xl pb-8">
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
                onClick={() => pendingLostLeadId && lostMutation.mutate({ leadId: pendingLostLeadId, reason: key })}
                disabled={lostMutation.isPending}
                className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-red-950/40 border border-white/5 hover:border-red-500/30 text-sm text-gray-300 hover:text-white font-medium transition-all disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
