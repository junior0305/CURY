"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForDashboard, updateLeadStatus } from "@/integrations/supabase/leads";
import { Lead, LeadStatus, ExclusionReason } from "@/types/lead";
import { Card } from "@/components/ui/card";
import { Loader2, Zap, Phone, MessageSquare, Calendar, FileText, CheckCircle, Trophy, MoreHorizontal, ArrowLeft, ArrowRight, Share2, Flame, RefreshCcw, XCircle, Pencil, AlertCircle, Send, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QuickScheduleModal } from "@/components/broker/QuickScheduleModal";
import { LeadTimeline } from "@/components/broker/LeadTimeline";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { addHours, formatDistanceToNow, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface LeadDetailProps {
  leadId: string | null;
  onLeadUpdated: () => void;
  onBack?: () => void; // Optional back function for mobile
}

const LeadDetail = ({ leadId, onLeadUpdated, onBack }: LeadDetailProps) => {
  const queryClient = useQueryClient();
  const [isExclusionDialogOpen, setIsExclusionDialogOpen] = useState(false);
  const [selectedExclusionReason, setSelectedExclusionReason] = useState<ExclusionReason | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [isSendingNote, setIsSendingNote] = useState(false);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['dashboardLeads'],
    queryFn: fetchLeadsForDashboard,
  });

  const lead = leads.find(l => l.id === leadId);

  // Define Pipeline Steps
  const pipelineSteps = [
    { id: 'NEW', label: 'Novo', icon: Zap, color: 'bg-sky-500' },
    { id: 'IN_PROGRESS', label: 'Atend.', icon: MessageSquare, color: 'bg-blue-500' },
    { id: 'VISIT_SCHEDULED', label: 'Visita', icon: Calendar, color: 'bg-emerald-500' },
    { id: 'DOCS_REQUESTED', label: 'Docs', icon: FileText, color: 'bg-amber-500' },
    { id: 'CONCLUDED', label: 'Venda', icon: Trophy, color: 'bg-indigo-600' },
  ];

  const currentStepIndex = lead ? pipelineSteps.findIndex(s => s.id === lead.status) : -1;

  // Fetch Timeline Events (Notes + Audit Logs)
  const { data: timelineEvents = [], refetch: refetchTimeline } = useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      // 1. Fetch Notes
      const { data: notes } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      // 2. Fetch Status History (Funnel History)
      const { data: history } = await supabase
        .from('funnel_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      // 3. Merge & Sort
      const mixedEvents = [
        ...(notes || []).map((n: any) => ({
          id: n.id,
          type: 'NOTE',
          content: n.content,
          createdAt: n.created_at,
          authorName: 'Você' // Ideally fetch profile name
        })),
        ...(history || []).map((h: any) => ({
          id: h.id,
          type: 'STATUS_CHANGE',
          content: `Mudou para: ${h.stage}`,
          createdAt: h.created_at
        })),
        // Add Creation Event
        lead ? {
          id: 'creation',
          type: 'CREATION',
          content: `Lead Criado: ${lead.name}`,
          createdAt: lead.createdAt
        } : null
      ].filter(Boolean).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return mixedEvents;
    },
    enabled: !!leadId
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: LeadStatus, reason?: ExclusionReason }) => {
      await updateLeadStatus(leadId!, status, reason);
      
      // Auto-award logic if applicable (Simplified here, assumes gamification utils handle specifics or triggers)
      // For now just basic status update.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
      toast.success("Status atualizado!");
      onLeadUpdated();
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`)
  });

  const sendNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!leadId) return;
      const { error } = await supabase.from('lead_notes').insert({
        lead_id: leadId,
        content: content,
        broker_id: lead?.brokerId // Optional if RLS handles auth.uid()
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteContent("");
      refetchTimeline();
      // Update last interaction
      updateStatusMutation.mutate({ status: lead!.status }); 
    }
  });

  const handleSendNote = () => {
    if (!noteContent.trim()) return;
    setIsSendingNote(true);
    sendNoteMutation.mutate(noteContent, {
      onSettled: () => setIsSendingNote(false)
    });
  };

  const handleWhatsApp = () => {
    if (!lead) return;
    const phone = lead.phone.replace(/\D/g, '');
    const url = `https://wa.me/${phone}`;
    window.open(url, '_blank');
    // Log action automatically
    sendNoteMutation.mutate("Clicou para abrir WhatsApp");
  };

  const handleCall = () => {
    if (!lead) return;
    window.location.href = `tel:${lead.phone}`;
    sendNoteMutation.mutate("Clicou para ligar");
  };

  if (!leadId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
        <div className="bg-white p-6 rounded-full shadow-sm mb-4">
          <Zap className="w-12 h-12 text-indigo-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-700">Console Tático</h2>
        <p className="text-slate-400 max-w-xs mx-auto mt-2">Selecione um alvo na lista para iniciar as operações de combate.</p>
      </div>
    );
  }

  if (isLoading || !lead) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // Calculate Temperature
  const lastInter = new Date(lead.lastInteractionAt);
  const isHot = isAfter(lastInter, addHours(new Date(), -24));
  const isCold = !isAfter(lastInter, addHours(new Date(), -168)); // 7 days
  const tempColor = isHot ? "text-rose-500" : isCold ? "text-sky-500" : "text-amber-500";
  const tempIcon = isHot ? Flame : isCold ? Zap : Zap;

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      <QuickScheduleModal 
        open={isScheduleOpen} 
        onOpenChange={setIsScheduleOpen} 
        leadId={leadId}
        onScheduled={() => {
          onLeadUpdated();
          refetchTimeline();
        }}
      />

      {/* 1. HUD HEADER (Sticky) */}
      <header className="flex-none bg-white border-b border-slate-100 p-4 flex flex-col gap-4 z-20 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden -ml-2">
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </Button>
            )}
            <Avatar className="h-10 w-10 border-2 border-slate-100">
              <AvatarFallback className={cn("font-black text-white", isHot ? "bg-rose-500" : "bg-indigo-500")}>
                {lead.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-slate-900 leading-none truncate max-w-[150px] sm:max-w-md">{lead.name}</h2>
                <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-wider border-none", tempColor, "bg-opacity-10 bg-current")}>
                  {isHot ? 'QUENTE 🔥' : isCold ? 'FRIO ❄️' : 'MORNO ⚡'}
                </Badge>
                
                {/* Interest Tag in Header */}
                {lead.tag && (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-black uppercase tracking-tight flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {lead.tag}
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 mt-1">{lead.phone}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-rose-400 hover:text-rose-600 hover:bg-rose-50">
                    <XCircle className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsExclusionDialogOpen(true)} className="text-rose-600 font-bold">
                    Confirmar Perda do Lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>

        {/* PROGRESS STEPPER (Pipeline Bar) - Mobile Optimized with Scroll */}
        <div className="w-full bg-slate-50 rounded-xl p-1 relative group/stepper">
           {/* Connecting Line (Hidden on very small screens if needed, or scaled) */}
           <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-slate-200 -z-0 hidden sm:block" />
           
           <div className="flex items-center justify-between overflow-x-auto sm:overflow-visible no-scrollbar gap-2 sm:gap-0 px-1">
             {pipelineSteps.map((step, idx) => {
               const isActive = idx === currentStepIndex;
               const isPast = idx < currentStepIndex;
               const isFuture = idx > currentStepIndex;
               
               return (
                 <button
                   key={step.id}
                   disabled={isFuture && idx !== currentStepIndex + 1}
                   onClick={() => updateStatusMutation.mutate({ status: step.id as LeadStatus })}
                   className={cn(
                     "relative z-10 flex flex-col items-center group transition-all duration-300 min-w-[60px] sm:min-w-0 flex-shrink-0",
                     isFuture && idx !== currentStepIndex + 1 ? "cursor-not-allowed opacity-50" : "cursor-pointer active:scale-95"
                   )}
                 >
                   <div className={cn(
                     "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-sm",
                     isActive ? `${step.color} border-white text-white scale-110 ring-2 ring-offset-1 ring-slate-200` : 
                     isPast ? "bg-slate-200 border-slate-200 text-slate-500" : 
                     "bg-white border-slate-300 text-slate-300"
                   )}>
                     <step.icon className="w-3.5 h-3.5" />
                   </div>
                   <span className={cn(
                     "text-[8px] sm:text-[9px] font-bold mt-1 uppercase tracking-wider transition-colors truncate w-full text-center",
                     isActive ? "text-slate-800" : "text-slate-400"
                   )}>
                     {step.label}
                   </span>
                 </button>
               )
             })}
           </div>
        </div>
      </header>

      {/* 2. TIMELINE (Scrollable Body) */}
      <div className="flex-1 overflow-hidden bg-slate-50/50 relative">
        <LeadTimeline events={timelineEvents} />
        
        {/* Floating Date Badge (Optional, nice touch) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none opacity-0 sm:opacity-100 transition-opacity">
          <span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">
            Hoje
          </span>
        </div>
      </div>

      {/* 3. TACTICAL DECK (Footer Fixed) */}
      <div className="flex-none bg-white border-t border-slate-200 p-3 sm:p-4 z-20 pb-safe">
        
        {/* Quick Input */}
        <div className="flex gap-2 mb-3">
          <Textarea 
            placeholder="Digite uma nota rápida ou script..." 
            className="min-h-[40px] h-[40px] max-h-[80px] resize-none rounded-xl border-slate-200 focus:ring-indigo-500 text-sm py-2"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendNote();
              }
            }}
          />
          <Button 
            size="icon" 
            className="h-[40px] w-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 shrink-0"
            onClick={handleSendNote}
            disabled={isSendingNote || !noteContent.trim()}
          >
            {isSendingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Big Actions Grid */}
        <div className="grid grid-cols-4 gap-2">
          <Button 
            className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl h-12 shadow-sm flex flex-col items-center justify-center gap-0 active:scale-95 transition-transform"
            onClick={handleWhatsApp}
          >
            <div className="flex items-center gap-1.5 text-xs sm:text-sm uppercase tracking-wide">
              <MessageSquare className="w-4 h-4" /> WhatsApp
            </div>
          </Button>

          <Button 
            variant="outline"
            className="col-span-1 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 font-bold rounded-xl h-12 flex flex-col items-center justify-center gap-0"
            onClick={handleCall}
          >
            <Phone className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] uppercase">Ligar</span>
          </Button>

          <Button 
            variant="outline"
            className="col-span-1 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-amber-600 font-bold rounded-xl h-12 flex flex-col items-center justify-center gap-0"
            onClick={() => setIsScheduleOpen(true)}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[9px] uppercase">Agendar</span>
          </Button>
        </div>
      </div>

      {/* Exclusion Dialog (Kept from original) */}
      <Dialog open={isExclusionDialogOpen} onOpenChange={setIsExclusionDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Perder Lead?</DialogTitle>
            <DialogDescription>
              Isso move o lead para o Rework. Escolha o motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select onValueChange={(val) => setSelectedExclusionReason(val as ExclusionReason)}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WRONG_NUMBER">Número Errado</SelectItem>
                <SelectItem value="NO_INTEREST">Sem Interesse</SelectItem>
                <SelectItem value="NO_PROFILE">Sem Perfil</SelectItem>
                <SelectItem value="NO_CONTACT">Sem Contato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={() => {
              if (selectedExclusionReason) {
                updateStatusMutation.mutate({ status: 'ABANDONED', reason: selectedExclusionReason });
                setIsExclusionDialogOpen(false);
              }
            }} 
            disabled={!selectedExclusionReason} 
            variant="destructive"
            className="w-full h-12 rounded-xl font-black"
          >
            Confirmar Perda
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadDetail;