"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForDashboard, updateLeadStatus } from "@/integrations/supabase/leads";
import { Lead, LeadStatus, ExclusionReason } from "@/types/lead";
import { Loader2, Zap, Phone, MessageSquare, Calendar, FileText, Trophy, XCircle, ArrowLeft, Send, Flame, MapPin, Brain, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QuickScheduleModal } from "@/components/broker/QuickScheduleModal";
import { LeadTimeline } from "@/components/broker/LeadTimeline";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { addHours, isAfter } from "date-fns";
import { cn } from "@/lib/utils";

interface LeadDetailProps {
  leadId: string | null;
  onLeadUpdated: () => void;
  onBack?: () => void;
}

const PIPELINE_STEPS = [
  { id: "NEW",             label: "Novo",   icon: Zap,          color: "bg-sky-500",     ring: "ring-sky-500/40" },
  { id: "IN_PROGRESS",     label: "Atend.", icon: MessageSquare, color: "bg-blue-500",    ring: "ring-blue-500/40" },
  { id: "VISIT_SCHEDULED", label: "Visita", icon: Calendar,     color: "bg-emerald-500", ring: "ring-emerald-500/40" },
  { id: "DOCS_REQUESTED",  label: "Docs",   icon: FileText,     color: "bg-amber-500",   ring: "ring-amber-500/40" },
  { id: "CONCLUDED",       label: "Venda",  icon: Trophy,       color: "bg-indigo-600",  ring: "ring-indigo-500/40" },
];

const LeadDetail = ({ leadId, onLeadUpdated, onBack }: LeadDetailProps) => {
  const queryClient = useQueryClient();
  const [isExclusionDialogOpen, setIsExclusionDialogOpen] = useState(false);
  const [selectedExclusionReason, setSelectedExclusionReason] = useState<ExclusionReason | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [isSendingNote, setIsSendingNote] = useState(false);
  const [showQualModal, setShowQualModal] = useState(false);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const lead = leads.find(l => l.id === leadId);

  const { data: timelineEvents = [], refetch: refetchTimeline } = useQuery({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data: notes } = await supabase.from("lead_notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: true });
      const { data: history } = await supabase.from("funnel_history").select("*").eq("lead_id", leadId).order("created_at", { ascending: true });

      // Histórico de mensagens da IA
      const { data: conv } = await supabase
        .from("ia_conversations").select("id")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const iaMessages: any[] = [];
      if (conv) {
        const { data: msgs } = await supabase
          .from("ia_messages")
          .select("id, message_text, direction, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(30);
        (msgs || []).forEach(m => {
          iaMessages.push({
            id: `ia-${m.id}`,
            type: m.direction === "incoming" ? "IA_IN" : "IA_OUT",
            content: m.message_text,
            createdAt: m.created_at,
          });
        });
      }

      return [
        ...(notes || []).map((n: any) => ({ id: n.id, type: "NOTE", content: n.content, createdAt: n.created_at, authorName: "Você" })),
        ...(history || []).map((h: any) => ({ id: h.id, type: "STATUS_CHANGE", content: `Mudou para: ${h.stage}`, createdAt: h.created_at })),
        lead ? { id: "creation", type: "CREATION", content: `Lead Criado: ${lead.name}`, createdAt: lead.createdAt } : null,
        ...iaMessages,
      ].filter(Boolean).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    },
    enabled: !!leadId,
  });

  const { data: qualAgents = [] } = useQuery({
    queryKey: ["qual-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_agents").select("id, name").eq("trigger_type", "QUALIFICATION").eq("is_active", true);
      return data || [];
    },
  });

  const activateQualMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await supabase.from("leads").update({
        qualification_mode: true,
        qualification_agent_id: agentId,
        qualification_step: 1,
      }).eq("id", leadId);
    },
    onSuccess: () => {
      toast.success("IA de Qualificação ativada!");
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      setShowQualModal(false);
    },
    onError: () => toast.error("Erro ao ativar qualificação"),
  });

  const deactivateQualMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("leads").update({
        qualification_mode: false,
        qualification_step: 1,
      }).eq("id", leadId);
    },
    onSuccess: () => {
      toast.success("IA de Qualificação desativada");
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: LeadStatus; reason?: ExclusionReason }) => {
      await updateLeadStatus(leadId!, status, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-timeline"] });
      toast.success("Status atualizado!");
      onLeadUpdated();
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const sendNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!leadId) return;
      const { error } = await supabase.from("lead_notes").insert({ lead_id: leadId, content, broker_id: lead?.brokerId });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteContent("");
      refetchTimeline();
      // Nota interna NÃO atualiza last_interaction_at nem dispara status mutation
    },
  });

  const handleSendNote = () => {
    if (!noteContent.trim()) return;
    setIsSendingNote(true);
    sendNoteMutation.mutate(noteContent, { onSettled: () => setIsSendingNote(false) });
  };

  const handleWhatsApp = () => {
    if (!lead) return;
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, "")}`, "_blank");
    sendNoteMutation.mutate("Clicou para abrir WhatsApp");
  };

  const handleCall = () => {
    if (!lead) return;
    window.location.href = `tel:${lead.phone}`;
    sendNoteMutation.mutate("Clicou para ligar");
  };

  if (!leadId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-800/20">
        <div className="bg-slate-800/60 p-6 rounded-full shadow-inner mb-4 border border-gray-700/40">
          <Zap className="w-12 h-12 text-indigo-800" />
        </div>
        <h2 className="text-xl font-bold text-gray-500">Console Tático</h2>
        <p className="text-gray-700 max-w-xs mx-auto mt-2 text-sm">Selecione um alvo na lista para iniciar as operações.</p>
      </div>
    );
  }

  if (isLoading || !lead) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-800/20">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const currentStepIndex = PIPELINE_STEPS.findIndex(s => s.id === lead.status);
  // "Quente" = lead RESPONDEU nas últimas 24h (não quando o corretor agiu)
  const lastLeadResp = lead.lastLeadResponseAt ? new Date(lead.lastLeadResponseAt) : null;
  const isHot  = !!lastLeadResp && isAfter(lastLeadResp, addHours(new Date(), -24));
  const isCold = !lastLeadResp || !isAfter(lastLeadResp, addHours(new Date(), -168));

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      <QuickScheduleModal
        open={isScheduleOpen}
        onOpenChange={setIsScheduleOpen}
        leadId={leadId}
        onScheduled={() => { onLeadUpdated(); refetchTimeline(); }}
      />

      {/* Header */}
      <header className="flex-none bg-slate-800/80 border-b border-gray-700/50 p-4 flex flex-col gap-4 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden -ml-2 text-gray-500 hover:text-white hover:bg-slate-700">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <Avatar className="h-10 w-10 border-2 border-gray-700/60 shrink-0">
              <AvatarFallback className={cn("font-black text-white text-sm", isHot ? "bg-rose-600" : "bg-indigo-600")}>
                {lead.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-white truncate max-w-[160px] sm:max-w-sm leading-none">{lead.name}</h2>
                <Badge className={cn(
                  "text-[9px] font-black uppercase border-none",
                  isHot ? "bg-rose-500/20 text-rose-300" : isCold ? "bg-sky-500/20 text-sky-300" : "bg-amber-500/20 text-amber-300"
                )}>
                  {isHot ? "🔥 Quente" : isCold ? "❄️ Frio" : "⚡ Morno"}
                </Badge>
                {lead.tag && (
                  <Badge className="bg-slate-700/60 text-gray-400 border-gray-600/40 text-[9px] font-black uppercase flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {lead.tag}
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-gray-500 mt-1">{lead.phone}</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-600 hover:text-red-400 hover:bg-red-900/20 shrink-0">
                <XCircle className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-gray-700">
              <DropdownMenuItem onClick={() => setIsExclusionDialogOpen(true)} className="text-rose-400 font-bold hover:bg-rose-900/20 focus:bg-rose-900/20">
                Confirmar Perda do Lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Pipeline Stepper */}
        <div className="w-full bg-slate-900/60 rounded-xl p-1.5 relative">
          <div className="absolute left-6 right-6 top-1/2 h-px bg-gray-700/60 -translate-y-2 hidden sm:block" />
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar gap-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const isActive = idx === currentStepIndex;
              const isPast = idx < currentStepIndex;
              const isNext = idx === currentStepIndex + 1;
              const isLocked = idx > currentStepIndex + 1;
              return (
                <button key={step.id}
                  disabled={isLocked}
                  onClick={() => updateStatusMutation.mutate({ status: step.id as LeadStatus })}
                  className={cn(
                    "relative z-10 flex flex-col items-center transition-all duration-200 min-w-[56px] flex-shrink-0",
                    isLocked ? "cursor-not-allowed opacity-30" : "cursor-pointer active:scale-95"
                  )}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                    isActive
                      ? `${step.color} border-transparent text-white scale-110 ring-2 ring-offset-1 ring-offset-slate-900 ${step.ring}`
                      : isPast
                        ? "bg-slate-700 border-gray-600 text-gray-500"
                        : isNext
                          ? "bg-slate-800 border-gray-600 text-gray-500 hover:border-gray-500"
                          : "bg-slate-800 border-gray-800 text-gray-700"
                  )}>
                    <step.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={cn(
                    "text-[9px] font-bold mt-1 uppercase tracking-wide",
                    isActive ? "text-white" : "text-gray-600"
                  )}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Timeline */}
      <div className="flex-1 overflow-hidden bg-slate-900/50 relative">
        <LeadTimeline events={timelineEvents} />
      </div>

      {/* Footer de ações */}
      <div className="flex-none bg-slate-800/80 border-t border-gray-700/50 p-3 z-20">
        {/* Input de nota */}
        <div className="flex gap-2 mb-3">
          <Textarea
            placeholder="Nota interna (privada, não enviada ao lead)..."
            className="min-h-[40px] h-[40px] max-h-[80px] resize-none rounded-xl bg-slate-700/60 border-gray-600/50 text-white placeholder-gray-600 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-sm py-2"
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendNote(); } }}
          />
          <Button size="icon"
            className="h-[40px] w-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-500 shrink-0"
            onClick={handleSendNote}
            disabled={isSendingNote || !noteContent.trim()}>
            {isSendingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Botões de ação */}
        <div className="grid grid-cols-4 gap-2">
          <Button onClick={handleWhatsApp}
            className="col-span-2 bg-emerald-700 hover:bg-emerald-600 text-white font-black rounded-xl h-12 active:scale-95 transition-transform shadow-lg shadow-emerald-900/40">
            <MessageSquare className="w-4 h-4 mr-2" /> WhatsApp
          </Button>
          <Button variant="outline" onClick={handleCall}
            className="col-span-1 border-gray-600/50 bg-slate-700/40 text-gray-300 hover:bg-slate-700 hover:text-white font-bold rounded-xl h-12 flex flex-col items-center justify-center gap-0">
            <Phone className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] uppercase">Ligar</span>
          </Button>
          <Button variant="outline" onClick={() => setIsScheduleOpen(true)}
            className="col-span-1 border-gray-600/50 bg-slate-700/40 text-gray-300 hover:bg-slate-700 hover:text-amber-400 font-bold rounded-xl h-12 flex flex-col items-center justify-center gap-0">
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] uppercase">Agendar</span>
          </Button>
        </div>

        {/* Botão IA Qualificação */}
        {(lead as any).qualificationMode ? (
          <div className="mt-2 flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-300">IA Qualificadora ativa — Etapa {(lead as any).qualificationStep || 1}</span>
            </div>
            <button onClick={() => deactivateQualMutation.mutate()}
              className="text-xs text-gray-500 hover:text-rose-400 transition-colors font-bold">
              Desativar
            </button>
          </div>
        ) : (
          <button onClick={() => setShowQualModal(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 text-xs font-bold transition-all">
            <Brain className="w-3.5 h-3.5" />
            Ativar IA de Qualificação
          </button>
        )}
      </div>

      {/* Modal: Ativar IA Qualificação */}
      <Dialog open={showQualModal} onOpenChange={setShowQualModal}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              Ativar IA de Qualificação
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              A IA vai assumir a conversa e conduzir o lead até a decisão de visita ou documentação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {qualAgents.map((agent: any) => (
              <button key={agent.id}
                onClick={() => activateQualMutation.mutate(agent.id)}
                disabled={activateQualMutation.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/15 transition-all text-left">
                <BrainCircuit className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <p className="font-bold text-white text-sm">{agent.name}</p>
                  <p className="text-xs text-gray-500">Clique para ativar</p>
                </div>
              </button>
            ))}
            {qualAgents.length === 0 && (
              <p className="text-center text-gray-600 text-sm py-4">
                Nenhum agente de qualificação criado ainda.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Perder lead */}
      <Dialog open={isExclusionDialogOpen} onOpenChange={setIsExclusionDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Perder Lead?</DialogTitle>
            <DialogDescription className="text-gray-500">
              Isso move o lead para o Rework. Escolha o motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select onValueChange={val => setSelectedExclusionReason(val as ExclusionReason)}>
              <SelectTrigger className="h-12 rounded-xl bg-slate-800 border-gray-600 text-gray-300">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-gray-700 text-white">
                <SelectItem value="WRONG_NUMBER">Número Errado</SelectItem>
                <SelectItem value="NO_INTEREST">Sem Interesse</SelectItem>
                <SelectItem value="NO_PROFILE">Sem Perfil</SelectItem>
                <SelectItem value="NO_CONTACT">Sem Contato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => {
            if (selectedExclusionReason) {
              updateStatusMutation.mutate({ status: "ABANDONED", reason: selectedExclusionReason });
              setIsExclusionDialogOpen(false);
            }
          }}
            disabled={!selectedExclusionReason}
            variant="destructive"
            className="w-full h-12 rounded-xl font-black bg-red-700 hover:bg-red-600">
            Confirmar Perda
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadDetail;
