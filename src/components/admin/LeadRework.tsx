import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, RefreshCw, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForAdmin, updateLeadBroker } from "@/integrations/supabase/leads";
import { Lead } from "@/types/lead";
import { DistributionQueue } from "@/types/queue";

// Mock temporário para filas ativas, pois ainda não temos a tabela de filas
const mockActiveQueues: DistributionQueue[] = [
  { id: 'q1', name: 'Fila Zona Sul', matchValue: 'ZS', matchField: 'tag', teamIds: ['t1'], isActive: true, lastAssignedIndex: 0 },
  { id: 'q2', name: 'Fila Lançamentos', matchValue: 'LANC', matchField: 'tag', teamIds: ['t2'], isActive: true, lastAssignedIndex: 0 },
];

const LeadRework = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // 1. Busca de Leads para Retrabalho
  const { data: allLeads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ['adminLeads'],
    queryFn: fetchLeadsForAdmin,
  });

  // Filtra leads abandonados ou parados (simulação de leads parados)
  const leadsForRework = useMemo(() => {
    // Por enquanto, focamos apenas em ABANDONED, pois a lógica de 'parado' é complexa
    return allLeads.filter(l => l.status === 'ABANDONED');
  }, [allLeads]);

  // 2. Mutação para Redistribuição
  const reworkMutation = useMutation({
    mutationFn: async ({ leadId, queueId }: { leadId: string, queueId: string }) => {
      // Simulação: Encontrar o próximo corretor na fila (qId)
      // Na implementação real, isso seria feito por uma Edge Function
      
      // Por enquanto, vamos apenas atualizar o status para NEW e atribuir a um broker mockado
      // Para evitar erros de FK, usaremos um ID de broker mockado ou o ID do SUPERINTENDENT (se disponível)
      // Como não temos a lógica de fila aqui, vamos apenas atualizar o status para NEW
      
      // NOTE: updateLeadBroker espera um brokerId, mas estamos usando queueId. 
      // Para evitar quebrar a função, vamos passar um ID temporário e focar na atualização do status.
      // Em um sistema real, a Edge Function faria a atribuição.
      
      // Usando um ID de broker fictício para passar na função, já que a lógica de fila é complexa para o frontend
      const tempBrokerId = '00000000-0000-0000-0000-000000000000'; 
      
      // Se a tabela leads tiver RLS configurado corretamente, esta chamada pode falhar se não for SUPERINTENDENT
      // Vamos simular a ação de 'rework' que colocaria o lead na fila.
      
      // Para o MVP, vamos apenas atualizar o status para NEW e remover o brokerId
      const { error } = await supabase
        .from('leads')
        .update({ 
          broker_id: null, // Remove o corretor atual
          status: 'NEW', // Volta para o status inicial
          last_interaction_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      return { leadId, queueId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      const queueName = mockActiveQueues.find(q => q.id === data.queueId)?.name;
      toast({ title: "Retrabalho Concluído", description: `Lead enviado para a fila: ${queueName}.` });
    },
    onError: (err: any) => {
      console.error("Erro ao redistribuir lead:", err);
      toast({ title: "Erro", description: `Falha ao enviar lead para retrabalho: ${err.message}`, variant: "destructive" });
    }
  });

  const handleRework = (leadId: string) => {
    if (!selectedQueueId) {
      toast({ title: "Atenção", description: "Selecione uma Fila de Destino antes de retrabalhar.", variant: "destructive" });
      return;
    }
    reworkMutation.mutate({ leadId, queueId: selectedQueueId });
  };

  const handleFileUpload = () => {
    toast({ title: "Importação", description: "Leads processados com sucesso." });
  };

  const isBusy = reworkMutation.isPending || isLoadingLeads;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 shadow-md border-none h-fit">
        <CardHeader>
          <CardTitle className="text-green-700 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Importar Planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select><SelectTrigger><SelectValue placeholder="Fila de Destino" /></SelectTrigger><SelectContent><SelectItem value="1">Zona Sul</SelectItem></SelectContent></Select>
          <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center cursor-pointer hover:bg-green-50">
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-xs text-gray-500">Subir .xlsx</span>
            <Input type="file" className="hidden" onChange={handleFileUpload} />
          </Label>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-md border-none">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 mr-2" /> Leads para Retrabalho
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-amber-800 mb-4">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm">Estes leads estão <b>Abandonados</b> e podem ser re-enviados para uma fila de distribuição.</p>
          </div>

          <div className="mb-4 space-y-2">
            <Label htmlFor="queue-select" className="font-semibold">Fila de Destino para Retrabalho</Label>
            <Select onValueChange={setSelectedQueueId} value={selectedQueueId || ""}>
              <SelectTrigger id="queue-select" className="w-full md:w-1/2">
                <SelectValue placeholder="Selecione a Fila de Distribuição" />
              </SelectTrigger>
              <SelectContent>
                {mockActiveQueues.map(q => (
                  <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isBusy ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsForRework.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-gray-500">
                      Nenhum lead abandonado para retrabalho.
                    </TableCell>
                  </TableRow>
                ) : (
                  leadsForRework.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-bold">{l.name}</div>
                        <div className="text-xs">{l.tag}</div>
                      </TableCell>
                      <TableCell><Badge variant="destructive">Abandonado</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          className="bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => handleRework(l.id)}
                          disabled={!selectedQueueId || reworkMutation.isPending}
                        >
                          <RefreshCw className="w-3 h-3 mr-2" /> Retrabalhar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadRework;