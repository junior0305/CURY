import { useState, useMemo, useRef } from "react";
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
import { fetchLeadsForAdmin } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import { Lead } from "@/types/lead";
import { DistributionQueue } from "@/types/queue";
import { User } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { read, utils } from "xlsx";

// Mock temporário para filas ativas, pois ainda não temos a tabela de filas
const mockActiveQueues: DistributionQueue[] = [
  { id: 'q1', name: 'Fila Zona Sul', matchValue: 'ZS', matchField: 'tag', teamIds: ['t1'], isActive: true, lastAssignedIndex: 0 },
  { id: 'q2', name: 'Fila Lançamentos', matchValue: 'LANC', matchField: 'tag', teamIds: ['t2'], isActive: true, lastAssignedIndex: 0 },
];

const LeadRework = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  
  // CORREÇÃO: Permitir selecionar um Corretor Específico ou "Distribuir para Todos"
  const [targetBrokerId, setTargetBrokerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Busca de Leads para Retrabalho
  const { data: allLeads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ['adminLeads'],
    queryFn: fetchLeadsForAdmin,
  });
  
  // 2. Busca de Corretores Ativos
  const { data: brokers = [] } = useQuery<User[]>({
    queryKey: ['active-brokers'],
    queryFn: async () => {
      const users = await fetchProfiles();
      return users.filter(u => u.role === 'BROKER' || u.role === 'MANAGER');
    }
  });

  // Filtra leads abandonados
  const leadsForRework = useMemo(() => {
    return allLeads.filter(l => l.status === 'ABANDONED');
  }, [allLeads]);

  // 3. Mutação para Redistribuição (Rework Individual)
  const reworkMutation = useMutation({
    mutationFn: async ({ leadId, queueId }: { leadId: string, queueId: string }) => {
      // Na implementação real, a Edge Function faria a lógica de distribuição.
      // Por enquanto, vamos apenas atualizar o status para NEW e remover o brokerId para re-entrada na fila.
      
      const { error } = await supabase
        .from('leads')
        .update({ 
          broker_id: null, // Remove o corretor atual
          status: 'NEW', // Volta para o status inicial
          last_interaction_at: new Date().toISOString(),
          exclusion_reason: null, // Limpa o motivo do abandono
        })
        .eq('id', leadId);

      if (error) throw error;
      return { leadId, queueId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      const queueName = activeQueues.find((q: any) => q.id === data.queueId)?.name;
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!targetBrokerId) {
      toast({ title: "Erro", description: "Selecione um DESTINO (Corretor ou Distribuição) antes de importar.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Parse com header A (primeira linha como chaves)
      const jsonData = utils.sheet_to_json(worksheet);

      console.log("Dados importados:", jsonData);

      // Validação e normalização robusta das chaves
      const validLeads = jsonData.map((row: any) => {
        // Tenta encontrar colunas com nomes variados (case-insensitive)
        const keys = Object.keys(row);
        const findKey = (pattern: RegExp) => keys.find(k => pattern.test(k));

        const nameKey = findKey(/nome|name|cliente/i);
        const phoneKey = findKey(/telefone|phone|celular|whatsapp|tel/i);
        const emailKey = findKey(/email|mail|e-mail/i);
        const tagKey = findKey(/tag|origem|interesse|campanha/i);
        
        const name = row[nameKey || ''] || "Lead Importado";
        const phoneRaw = row[phoneKey || ''];
        
        // Limpeza básica de telefone se existir
        const phone = phoneRaw ? String(phoneRaw).replace(/[^0-9+]/g, '') : null;
        
        return {
          name: name,
          phone: phone,
          email: row[emailKey || ''] || null,
          tag: row[tagKey || ''] || 'Importação Planilha',
          status: 'NEW',
          last_interaction_at: new Date().toISOString()
        };
      }).filter((l: any) => l.name && l.phone && l.phone.length >= 8); // Filtro mínimo de validade

      if (validLeads.length === 0) {
        toast({ title: "Erro", description: "Nenhum lead válido encontrado. A planilha deve ter colunas de Nome e Telefone.", variant: "destructive" });
        return;
      }

      // DISTRIBUIÇÃO INTELIGENTE (CLIENT-SIDE)
      let leadsToInsert = [];
      
      if (targetBrokerId === 'DISTRIBUTE_ALL') {
         // Round Robin
         if (brokers.length === 0) {
            toast({ title: "Erro", description: "Não há corretores ativos para distribuir.", variant: "destructive" });
            return;
         }
         
         leadsToInsert = validLeads.map((lead, index) => {
            const broker = brokers[index % brokers.length];
            return {
               ...lead,
               broker_id: broker.id,
               manager_id: broker.managerId,
               notes: `Importado e distribuído automaticamente para ${broker.name}`
            };
         });
      } else {
         // Destino Único
         const broker = brokers.find(b => b.id === targetBrokerId);
         leadsToInsert = validLeads.map(lead => ({
            ...lead,
            broker_id: targetBrokerId,
            manager_id: broker?.managerId || null,
            notes: `Importado manualmente para ${broker?.name || 'Corretor'}`
         }));
      }

      console.log(`Inserindo ${leadsToInsert.length} leads...`, leadsToInsert);

      // Batch Insert (Supabase limita payload, mas para < 1000 linhas costuma ser ok. Se for muito grande, dividir em chunks)
      const { error } = await supabase.from('leads').insert(leadsToInsert);

      if (error) throw error;

      toast({ title: "Sucesso!", description: `${leadsToInsert.length} leads importados e distribuídos com sucesso!` });
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTargetBrokerId(null);
      
    } catch (err: any) {
      console.error("Erro na importação:", err);
      toast({ title: "Erro Crítico", description: err.message, variant: "destructive" });
    }
  };
  
  const downloadTemplate = () => {
    const ws = utils.json_to_sheet([
      { Nome: "João Silva", Telefone: "11999999999", Email: "joao@email.com", Tag: "Interesse Lapa" },
      { Nome: "Maria Souza", Telefone: "21988888888", Email: "maria@email.com", Tag: "Investidor" }
    ]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Modelo Importação");
    // @ts-ignore
    import("xlsx").then((xlsx) => {
        xlsx.writeFile(wb, "modelo_importacao_leads.xlsx");
    });
  };

  const isBusy = reworkMutation.isPending || isLoadingLeads;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 shadow-md border-none h-fit">
        <CardHeader>
          <CardTitle className="text-green-700 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Importar Planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Destino dos Leads</Label>
            <Select onValueChange={setTargetBrokerId} value={targetBrokerId || ""}>
              <SelectTrigger className="bg-slate-50 border-slate-200">
                <SelectValue placeholder="Selecione quem recebe..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DISTRIBUTE_ALL" className="font-bold text-indigo-600 bg-indigo-50">
                  🚀 Distribuir para Todos (Equitativo)
                </SelectItem>
                {brokers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center cursor-pointer hover:bg-green-50 transition-colors group">
              <Upload className="w-8 h-8 text-slate-300 group-hover:text-green-500 mb-2 transition-colors" />
              <span className="text-xs text-gray-500 font-medium text-center">
                Clique para subir .xlsx ou .csv <br/>
                <span className="text-[10px] text-slate-400">(Nome, Telefone, Email, Tag)</span>
              </span>
              <Input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} ref={fileInputRef} disabled={!targetBrokerId} />
            </Label>
            <Button variant="link" onClick={downloadTemplate} className="w-full text-xs text-slate-500">
              Baixar modelo de planilha
            </Button>
          </div>
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
                {activeQueues.map((q: any) => (
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