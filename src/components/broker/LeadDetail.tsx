"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForDashboard, updateLeadStatus } from "@/integrations/supabase/leads";
import { Lead, LeadStatus, ExclusionReason } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle, Phone, MessageSquare, Calendar, FileText, XCircle, CheckCircle, Send, Zap, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import CadenceFlow from "./CadenceFlow";
import AIAssistant from "./AIAssistant";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TaskForm from "./TaskForm";

interface LeadDetailProps {
  leadId: string | null;
  onLeadUpdated: () => void;
}

const statusLabels: Record<LeadStatus, string> = {
  NEW: "NOVO",
  IN_PROGRESS: "EM ATENDIMENTO",
  VISIT_SCHEDULED: "VISITA AGENDADA",
  DOCS_REQUESTED: "DOCUMENTO SOLICITADO",
  CONCLUDED: "VENDA CONCLUÍDA",
  EXCLUDED: "EXCLUÍDO",
  ABANDONED: "ABANDONADO",
};

const exclusionReasons: Record<string, string> = {
  WRONG_NUMBER: "Número errado / Inexistente",
  NO_INTEREST: "Sem interesse no momento",
  NO_PROFILE: "Sem perfil de compra",
  NO_CONTACT: "Não respondeu após tentativas",
  null: "Outro motivo",
};

const LeadDetail = ({ leadId, onLeadUpdated }: LeadDetailProps) => {
  const queryClient = useQueryClient();
  const [isExclusionDialogOpen, setIsExclusionDialogOpen] = useState(false);
  const [selectedExclusionReason, setSelectedExclusionReason] = useState<ExclusionReason | null>(null);
  
  // States for mandatory next step
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<LeadStatus | null>(null);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['dashboardLeads'],
    queryFn: fetchLeadsForDashboard,
  });

  const lead = leads.find(l => l.id === leadId);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: LeadStatus, reason?: ExclusionReason }) => {
      const res = await updateLeadStatus(leadId!, status, reason);
      
      // Lógica de Ganho de Prêmio se for Venda ou Visita
      if (status === 'CONCLUDED' || status === 'VISIT_SCHEDULED') {
        const actionType = status === 'CONCLUDED' ? 'SALE' : 'VISIT';
        
        // Buscar config do prêmio no banco
        const { data: config } = await supabase
          .from('reward_configs')
          .select('*')
          .eq('action_type', actionType)
          .eq('is_active', true)
          .maybeSingle();

        if (config) {
          await supabase.from('achievements').insert({
            user_id: lead.brokerId,
            lead_id: lead.id,
            action_type: actionType,
            reward_label: config.label,
            reward_value: config.amount_value,
            status: 'PENDING'
          });
        }
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      toast.success("Ação registrada! Agora defina o próximo contato.");
      
      // AFTER status update, force opening TaskForm for mandatory follow-up
      if (pendingStatusUpdate !== 'ABANDONED' && pendingStatusUpdate !== 'EXCLUDED') {
        setIsTaskFormOpen(true);
      } else {
        onLeadUpdated();
      }
      setPendingStatusUpdate(null);
    },
    onError: (err: any) => {
      toast.error(`Falha ao atualizar status: ${err.message}`);
    }
  });

  if (!leadId) {
    return (
      <Card className="shadow-xl border-none h-[80vh] flex items-center justify-center p-8 text-center bg-indigo-50 border-indigo-200 border-dashed">
        <div className="text-gray-500">
          <Zap className="w-10 h-10 mx-auto mb-4 text-indigo-400" />
          <h2 className="text-xl font-bold">Selecione um Lead</h2>
          <p>Clique em um lead na lista ao lado para iniciar o fluxo de cadência e atendimento.</p>
        </div>
      </Card>
    );
  }

  if (isLoading || !lead) {
    return (
      <Card className="shadow-xl border-none h-[80vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </Card>
    );
  }

  const handleStatusChange = (status: LeadStatus) => {
    setPendingStatusUpdate(status);
    if (status === 'ABANDONED') {
      setIsExclusionDialogOpen(true);
      return;
    }
    updateStatusMutation.mutate({ status });
  };

  const handleAbandon = () => {
    if (!selectedExclusionReason) {
      toast.error("Selecione o motivo do abandono.");
      return;
    }
    setPendingStatusUpdate('ABANDONED');
    updateStatusMutation.mutate({ status: 'ABANDONED', reason: selectedExclusionReason });
    setIsExclusionDialogOpen(false);
  };

  const isBusy = updateStatusMutation.isPending;

  return (
    <Card className="shadow-xl border-none h-[80vh] flex flex-col rounded-3xl overflow-hidden bg-white ring-1 ring-slate-200">
      <TaskForm 
        open={isTaskFormOpen} 
        onOpenChange={(open) => {
          setIsTaskFormOpen(open);
          if (!open) onLeadUpdated(); // Finalize view once task is handled (or dismissed)
        }}
        userId={lead.brokerId || ''}
        leads={leads}
        defaultLeadId={lead.id}
      />
      
      <CardHeader className="p-6 border-b bg-white">
        <CardTitle className="text-2xl font-bold text-gray-900">{lead.name}</CardTitle>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <p className="flex items-center gap-1"><Phone className="w-4 h-4" /> {lead.phone}</p>
          <p className="flex items-center gap-1"><Zap className="w-4 h-4" /> {lead.tag}</p>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 flex-1 overflow-y-auto space-y-6">
        
        {/* 1. Fluxo de Cadência */}
        <CadenceFlow currentStatus={lead.status} onStatusChange={handleStatusChange} isBusy={isBusy} />

        <Separator />

        {/* 2. Assistente de IA e Ações */}
        <AIAssistant lead={lead} isBusy={isBusy} />

        <Separator />

        {/* 3. Ações de Funil */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-700 uppercase tracking-tighter italic">Funil de Alta Performance</h3>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              className="bg-blue-600 hover:bg-blue-700 rounded-xl font-bold" 
              onClick={() => handleStatusChange('IN_PROGRESS')}
              disabled={isBusy || lead.status === 'IN_PROGRESS'}
            >
              <CheckCircle className="w-4 h-4 mr-2" /> Atendimento
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold" 
              onClick={() => handleStatusChange('VISIT_SCHEDULED')}
              disabled={isBusy || lead.status === 'VISIT_SCHEDULED'}
            >
              <Calendar className="w-4 h-4 mr-2" /> Agendar Visita
            </Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 rounded-xl font-bold" 
              onClick={() => handleStatusChange('DOCS_REQUESTED')}
              disabled={isBusy || lead.status === 'DOCS_REQUESTED'}
            >
              <FileText className="w-4 h-4 mr-2" /> Pedir Documentos
            </Button>

            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black shadow-indigo-200 shadow-lg border-2 border-indigo-400 animate-in zoom-in duration-300" 
              onClick={() => handleStatusChange('CONCLUDED' as LeadStatus)}
              disabled={isBusy || lead.status === 'CONCLUDED'}
            >
              <Trophy className="w-4 h-4 mr-2 text-amber-400" /> MARCAR VENDA
            </Button>
            
            <Dialog open={isExclusionDialogOpen} onOpenChange={setIsExclusionDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={isBusy}>
                  <XCircle className="w-4 h-4 mr-2" /> Abandonar Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Abandonar Lead: {lead.name}</DialogTitle>
                  <DialogDescription>
                    Selecione o motivo do abandono. O lead será movido para a área de Retrabalho.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="reason">Motivo do Abandono</Label>
                    <Select onValueChange={(val) => setSelectedExclusionReason(val as ExclusionReason)}>
                      <SelectTrigger id="reason">
                        <SelectValue placeholder="Selecione um motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(exclusionReasons).filter(([key]) => key !== 'null').map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleAbandon} disabled={!selectedExclusionReason || isBusy} variant="destructive">
                  {isBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Confirmar Abandono
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadDetail;