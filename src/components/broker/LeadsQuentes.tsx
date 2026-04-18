import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { fetchLeadsForDashboard, registerBrokerContact, updateLeadStatus } from "@/integrations/supabase/leads";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Lead, LeadStatus } from "@/types/lead";
import { MessageSquare, ChevronRight, Check, X, Flame, Zap, FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const NEXT_STATUS: Partial<Record<LeadStatus, { status: LeadStatus; label: string }>> = {
  NEW:             { status: "IN_PROGRESS",     label: "Iniciar atend." },
  IN_PROGRESS:     { status: "VISIT_SCHEDULED", label: "Agendar visita" },
  VISIT_SCHEDULED: { status: "DOCS_REQUESTED",  label: "Pedir docs" },
  DOCS_REQUESTED:  { status: "CONCLUDED",        label: "Fechar venda 🎉" },
};

const INTENCAO_CFG = {
  quente: {
    card:   "bg-red-950/50 border-red-500/50",
    badge:  "bg-red-500/20 text-red-300 border-red-500/30",
    dot:    "bg-red-400",
    label:  "🔥 Quente",
    order:  0,
  },
  morno: {
    card:   "bg-amber-950/35 border-amber-500/40",
    badge:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
    dot:    "bg-amber-400",
    label:  "🟡 Morno",
    order:  1,
  },
  frio: {
    card:   "bg-slate-800/50 border-gray-700/40",
    badge:  "bg-slate-600/20 text-slate-400 border-slate-600/30",
    dot:    "bg-slate-500",
    label:  "🔵 Frio",
    order:  2,
  },
  sem_info: {
    card:   "bg-slate-800/40 border-gray-700/30",
    badge:  "bg-slate-700/30 text-slate-500 border-slate-600/20",
    dot:    "bg-slate-600",
    label:  "—",
    order:  3,
  },
} as const;

const TEMA_LABEL: Record<string, string> = {
  visita:         "quer visitar",
  documentacao:   "enviando docs",
  preco:          "perguntando preço",
  entrada:        "dúvida na entrada",
  localizacao:    "avaliando localização",
  sem_info:       "",
};

const MOMENTO_LABEL: Record<string, string> = {
  decidido:   "decidido",
  comparando: "comparando opções",
  explorando: "explorando",
};

const STATUS_ICON: Partial<Record<LeadStatus, React.ElementType>> = {
  DOCS_REQUESTED:  FileText,
  VISIT_SCHEDULED: Calendar,
  NEW:             Zap,
  IN_PROGRESS:     Flame,
};

const TERMINAL: LeadStatus[] = ["CONCLUDED", "ABANDONED", "EXCLUDED"];

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1)    return "agora";
  if (diff < 60)   return `${diff}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface LeadsQuentesProps {
  /** Limite de cards exibidos (default 6) */
  limit?: number;
}

export function LeadsQuentes({ limit = 6 }: LeadsQuentesProps) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const [pendingAdvance, setPendingAdvance] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Leads do broker ────────────────────────────────────────────────────────
  const { data: allLeads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  // ── lead_state (intencao / tema / momento) ─────────────────────────────────
  const myActiveLeadIds = allLeads
    .filter(l => l.brokerId === userId && !TERMINAL.includes(l.status))
    .map(l => l.id);

  const { data: stateMap = new Map<string, any>() } = useQuery({
    queryKey: ["lead-states", myActiveLeadIds.join(",")],
    enabled: myActiveLeadIds.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_state")
        .select("lead_id, intencao, tema, momento")
        .in("lead_id", myActiveLeadIds);
      const map = new Map<string, any>();
      (data ?? []).forEach(s => map.set(s.lead_id, s));
      return map;
    },
  });

  // ── Mutation para avançar fase ─────────────────────────────────────────────
  const advanceMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      updateLeadStatus(leadId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      setPendingAdvance(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    },
  });

  const triggerAdvance = useCallback((e: React.MouseEvent, leadId: string) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingAdvance(leadId);
    timerRef.current = setTimeout(() => setPendingAdvance(null), 5000);
  }, []);

  const cancelAdvance = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingAdvance(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const openWhatsApp = useCallback((e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    registerBrokerContact(lead.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
    });
    const num = lead.phone?.replace(/\D/g, "") || "";
    if (num) window.open(`https://wa.me/${num}`, "_blank");
  }, [queryClient]);

  // ── Ordenação ──────────────────────────────────────────────────────────────
  const sortedLeads = [...allLeads]
    .filter(l => l.brokerId === userId && !TERMINAL.includes(l.status))
    .sort((a, b) => {
      const sa = stateMap.get(a.id);
      const sb = stateMap.get(b.id);
      const ia = INTENCAO_CFG[(sa?.intencao ?? "sem_info") as keyof typeof INTENCAO_CFG]?.order ?? 3;
      const ib = INTENCAO_CFG[(sb?.intencao ?? "sem_info") as keyof typeof INTENCAO_CFG]?.order ?? 3;
      if (ia !== ib) return ia - ib;
      // Secundário: mais recente resposta do lead
      const ra = new Date(a.lastLeadResponseAt || a.lastInteractionAt || a.createdAt).getTime();
      const rb = new Date(b.lastLeadResponseAt || b.lastInteractionAt || b.createdAt).getTime();
      return rb - ra;
    })
    .slice(0, limit);

  if (sortedLeads.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Título de zona */}
      <div className="flex items-center gap-2 px-0.5">
        <Flame className="w-3.5 h-3.5 text-red-400" />
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          Leads em campo
        </p>
      </div>

      {sortedLeads.map(lead => {
        const state    = stateMap.get(lead.id);
        const intencao = (state?.intencao ?? "sem_info") as keyof typeof INTENCAO_CFG;
        const cfg      = INTENCAO_CFG[intencao] ?? INTENCAO_CFG.sem_info;
        const tema     = TEMA_LABEL[state?.tema] || "";
        const momento  = MOMENTO_LABEL[state?.momento] || "";
        const next     = NEXT_STATUS[lead.status];
        const isPending   = pendingAdvance === lead.id;
        const isAdvancing = advanceMutation.isPending && pendingAdvance === lead.id;
        const StatusIcon  = STATUS_ICON[lead.status] ?? Zap;
        const responseTime = timeAgo(lead.lastLeadResponseAt);

        return (
          <div
            key={lead.id}
            className={cn(
              "rounded-xl border p-3 space-y-2.5 transition-all",
              cfg.card
            )}
          >
            {/* ── Linha 1: intencao badge + nome + tempo ──────────────────── */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  {intencao !== "sem_info" && (
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider",
                      cfg.badge
                    )}>
                      {cfg.label}
                    </span>
                  )}
                  <StatusIcon className="w-3 h-3 text-gray-600" />
                </div>
                <p className="text-sm font-black text-white truncate leading-tight">{lead.name}</p>
                {(tema || momento) && (
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    {[tema, momento].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              {/* Tempo desde última resposta do lead */}
              <div className="shrink-0 text-right">
                <p className="text-[9px] text-gray-600 uppercase tracking-wider">respondeu</p>
                <p className={cn(
                  "text-xs font-black",
                  lead.lastLeadResponseAt && Date.now() - new Date(lead.lastLeadResponseAt).getTime() < 2 * 3600000
                    ? "text-emerald-400"
                    : "text-gray-500"
                )}>
                  {responseTime}
                </p>
              </div>
            </div>

            {/* ── Linha 2: ações ──────────────────────────────────────────── */}
            {isPending && next ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    advanceMutation.mutate({ leadId: lead.id, status: next.status });
                  }}
                  disabled={isAdvancing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition-all active:scale-95 disabled:opacity-60"
                >
                  <Check className="w-3 h-3" />
                  {isAdvancing ? "Avançando..." : `Confirmar → ${next.label}`}
                </button>
                <button
                  onClick={cancelAdvance}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-700/60 text-gray-500 hover:text-white hover:bg-slate-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* WhatsApp */}
                <button
                  onClick={(e) => openWhatsApp(e, lead)}
                  disabled={!lead.phone}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-black transition-all active:scale-95 disabled:opacity-40"
                >
                  <MessageSquare className="w-3 h-3" />
                  WhatsApp
                </button>

                {/* Avançar → */}
                {next && (
                  <button
                    onClick={(e) => triggerAdvance(e, lead.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/70 text-gray-400 hover:text-white text-[11px] font-bold transition-all active:scale-95 border border-gray-700/40 hover:border-gray-600"
                  >
                    <ChevronRight className="w-3 h-3" />
                    {next.label}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
