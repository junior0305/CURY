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
      console.log(`[LeadDetail] Atualizando status para ${status}...`);
      const res = await updateLeadStatus(leadId!, status, reason);
      
      const triggerActionMap: Record<string, string> = {
        'CONCLUDED': 'SALE',
        'VISIT_SCHEDULED': 'VISIT',
        'DOCS_REQUESTED': 'DOCS'
      };

      const triggerAction = triggerActionMap[status];
      
      if (triggerAction) {
        // Buscar TODAS as configs ativas para este gatilho específico
        const { data: configs } = await supabase
          .from('reward_configs')
          .select('*')
          .eq('action_type', triggerAction)
          .eq('is_active', true);

        if (configs && configs.length > 0) {
          console.log(`[LeadDetail] Disparando ${configs.length} premiações para ${triggerAction}...`);
          
          const achievementsToInsert = configs.map(config => ({
            user_id: lead.brokerId,
            lead_id: lead.id,
            action_type: triggerAction,
            reward_label: config.label,
            reward_value: config.amount_value,
            status: 'PENDING'
          }));

          const { error: achievementError } = await supabase
            .from('achievements')
            .insert(achievementsToInsert);
          
          if (achievementError) console.error("[LeadDetail] Erro ao gravar conquistas:", achievementError.message);
          else console.log("[LeadDetail] Conquistas gravadas com sucesso!");
        }
      }
      return res;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      queryClient.invalidateQueries({ queryKey: ['my-achievements'] });
      queryClient.invalidateQueries({ queryKey: ['public-achievements'] });
      
      const { status } = variables;
      
      // EXCEPTION: If status is CONCLUDED, ABANDONED or EXCLUDED, do NOT force mandatory task
      if (status !== 'CONCLUDED' && status !== 'ABANDONED' && status !== 'EXCLUDED') {
        toast.success("Ação registrada! Agora defina o próximo contato.");
        setIsTaskFormOpen(true);
      } else {
        toast.success(status === 'CONCLUDED' ? "🔥 VENDA CONCLUÍDA! Parabéns!" : "Lead atualizado.");
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
        
        {/* 1. Fluxo de Cadência - HIDDEN IF CONCLUDED */}
        {lead.status !== 'CONCLUDED' && (
          <CadenceFlow currentStatus={lead.status} onStatusChange={handleStatusChange} isBusy={isBusy} />
        )}

        {lead.status !== 'CONCLUDED' && <Separator />}

        {/* 2. Assistente de IA e Ações - HIDDEN IF CONCLUDED */}
        {lead.status !== 'CONCLUDED' && (
          <AIAssistant lead={lead} isBusy={isBusy} />
        )}

        {lead.status !== 'CONCLUDED' && <Separator />}

        {/* 3. Ações de Funil */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-700 uppercase tracking-tighter italic">
            {lead.status === 'CONCLUDED' ? 'Controle de Venda Finalizada' : 'Funil de Alta Performance'}
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            {lead.status === 'CONCLUDED' ? (
              <>
                {/* RESTRITO: Apenas Documentação ou Abandono */}
                <Button 
                  className="bg-amber-600 hover:bg-amber-700 rounded-xl font-bold col-span-1" 
                  onClick={() => handleStatusChange('DOCS_REQUESTED')}
                  disabled={isBusy}
                >
                  <FileText className="w-4 h-4 mr-2" /> Revisar Documentos
                </Button>
                
                <Dialog open={isExclusionDialogOpen} onOpenChange={setIsExclusionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" disabled={isBusy} className="rounded-xl font-bold col-span-1">
                      <XCircle className="w-4 h-4 mr-2" /> Cancelar Venda
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Cancelar Venda: {lead.name}</DialogTitle>
                      <DialogDescription>
                        A venda será cancelada e o lead irá para o Rework.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="reason">Motivo</Label>
                        <Select onValueChange={(val) => setSelectedExclusionReason(val as ExclusionReason)}>
                          <SelectTrigger id="reason">
                            <SelectValue placeholder="Selecione um motivo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NO_INTEREST">Desistência do cliente</SelectItem>
                            <SelectItem value="NO_PROFILE">Crédito Recusado</SelectItem>
                            <SelectItem value="null">Outro motivo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleAbandon} disabled={!selectedExclusionReason || isBusy} variant="destructive">
                      Confirmar Cancelamento
                    </Button>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                {/* FUNIL NORMAL */}
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
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black shadow-indigo-200 shadow-lg border-2 border-indigo-400" 
                  onClick={() => handleStatusChange('CONCLUDED')}
                  disabled={isBusy}
                >
                  <Trophy className="w-4 h-4 mr-2 text-amber-400" /> MARCAR VENDA
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadDetail;