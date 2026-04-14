import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, RefreshCw, FileSpreadsheet, Loader2, AlertTriangle, Users, CheckSquare, Square, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForAdmin } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import { Lead } from "@/types/lead";
import { DistributionQueue } from "@/types/queue";
import { User } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { read, utils } from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Mock temporário para filas ativas, pois ainda não temos a tabela de filas
const mockActiveQueues: DistributionQueue[] = [
  { id: 'q1', name: 'Fila Zona Sul', matchValue: 'ZS', matchField: 'tag', teamIds: ['t1'], isActive: true, lastAssignedIndex: 0 },
  { id: 'q2', name: 'Fila Lançamentos', matchValue: 'LANC', matchField: 'tag', teamIds: ['t2'], isActive: true, lastAssignedIndex: 0 },
];

const LeadRework = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // CORREÇÃO: Permitir seleção MÚLTIPLA de corretores
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  
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

  const toggleBroker = (id: string) => {
    setSelectedBrokerIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllBrokers = () => {
    if (selectedBrokerIds.length === brokers.length) {
      setSelectedBrokerIds([]);
    } else {
      setSelectedBrokerIds(brokers.map(b => b.id));
    }
  };

  // Filtra leads abandonados
  const leadsForRework = useMemo(() => {
    return allLeads.filter(l => l.status === 'ABANDONED');
  }, [allLeads]);

  // 3. Mutação para Redistribuição (Rework Individual)
  const reworkMutation = useMutation({
    mutationFn: async ({ leadId, targetIds }: { leadId: string, targetIds: string[] }) => {
      if (targetIds.length === 0) throw new Error("Selecione pelo menos um corretor.");

      // Sorteio (Round Robin Simples) entre os selecionados
      const randomBrokerId = targetIds[Math.floor(Math.random() * targetIds.length)];
      const broker = brokers.find(b => b.id === randomBrokerId);
      
      const { error } = await supabase
        .from('leads')
        .update({
          broker_id: randomBrokerId,
          manager_id: broker?.managerId || null,
          status: 'NEW',
          last_interaction_at: new Date().toISOString(),
          last_broker_whatsapp_at: null, // Zera contador — lead é novo para o corretor destino
          exclusion_reason: null,
          notes: `Lead recuperado e distribuído para ${broker?.name}.`
        })
        .eq('id', leadId);

      if (error) throw error;
      return { leadId, brokerName: broker?.name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      toast({ title: "Retrabalho Concluído", description: `Lead enviado para: ${data.brokerName}.` });
    },
    onError: (err: any) => {
      console.error("Erro ao redistribuir lead:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const handleRework = (leadId: string) => {
    if (selectedBrokerIds.length === 0) {
      toast({ title: "Atenção", description: "Selecione pelo menos um corretor de destino.", variant: "destructive" });
      return;
    }
    reworkMutation.mutate({ leadId, targetIds: selectedBrokerIds });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (selectedBrokerIds.length === 0) {
      toast({ title: "Erro", description: "Selecione os CORRETORES DE DESTINO antes de importar.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      console.log("Dados importados:", jsonData);

      const validLeads = jsonData.map((row: any) => {
        const keys = Object.keys(row);
        const findKey = (pattern: RegExp) => keys.find(k => pattern.test(k));

        const nameKey = findKey(/nome|name|cliente/i);
        const phoneKey = findKey(/telefone|phone|celular|whatsapp|tel/i);
        const emailKey = findKey(/email|mail|e-mail/i);
        const tagKey = findKey(/tag|origem|interesse|campanha/i);
        
        const name = row[nameKey || ''] || "Lead Importado";
        const phoneRaw = row[phoneKey || ''];
        const phone = phoneRaw ? String(phoneRaw).replace(/[^0-9+]/g, '') : null;
        
        return {
          name: name,
          phone: phone,
          email: row[emailKey || ''] || null,
          tag: row[tagKey || ''] || 'Importação Planilha',
          status: 'NEW',
          last_interaction_at: new Date().toISOString()
        };
      }).filter((l: any) => l.name && l.phone && l.phone.length >= 8);

      if (validLeads.length === 0) {
        toast({ title: "Erro", description: "Nenhum lead válido encontrado.", variant: "destructive" });
        return;
      }

      // DISTRIBUIÇÃO ROUND ROBIN ENTRE OS SELECIONADOS
      const leadsToInsert = validLeads.map((lead, index) => {
        const brokerId = selectedBrokerIds[index % selectedBrokerIds.length];
        const broker = brokers.find(b => b.id === brokerId);
        return {
           ...lead,
           broker_id: brokerId,
           manager_id: broker?.managerId || null,
           notes: `Importado e distribuído para ${broker?.name}`
        };
      });

      console.log(`Inserindo ${leadsToInsert.length} leads...`, leadsToInsert);

      const { error } = await supabase.from('leads').insert(leadsToInsert);

      if (error) throw error;

      toast({ title: "Sucesso!", description: `${leadsToInsert.length} leads importados e distribuídos entre ${selectedBrokerIds.length} corretores!` });
      queryClient.invalidateQueries({ queryKey: ['adminLeads'] });
      
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Não limpa a seleção para facilitar múltiplas importações
      
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
      {/* CARD 1: SELEÇÃO DE DESTINO (COMUM A AMBOS) */}
      <Card className="md:col-span-1 shadow-md border-none h-fit bg-slate-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800 flex items-center gap-2 text-base">
            <Users className="w-5 h-5 text-indigo-600" /> Quem recebe os leads?
          </CardTitle>
          <p className="text-xs text-slate-500">Selecione um ou mais corretores para criar uma "Fila Virtual".</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs font-bold"
            onClick={selectAllBrokers}
          >
            {selectedBrokerIds.length === brokers.length ? "Desmarcar Todos" : "Selecionar Todos"}
          </Button>

          <ScrollArea className="h-[300px] w-full rounded-md border border-slate-200 bg-white p-2">
            <div className="space-y-2">
              {brokers.map((broker) => (
                <div 
                  key={broker.id} 
                  className={cn(
                    "flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-colors",
                    selectedBrokerIds.includes(broker.id) ? "bg-indigo-50 border border-indigo-100" : "hover:bg-slate-50"
                  )}
                  onClick={() => toggleBroker(broker.id)}
                >
                  <Checkbox 
                    id={broker.id} 
                    checked={selectedBrokerIds.includes(broker.id)}
                    onCheckedChange={() => toggleBroker(broker.id)}
                    className="data-[state=checked]:bg-indigo-600 border-slate-300"
                  />
                  <label
                    htmlFor={broker.id}
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    {broker.name}
                  </label>
                  {selectedBrokerIds.includes(broker.id) && <CheckSquare className="w-3 h-3 text-indigo-600" />}
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="pt-2 border-t border-slate-200">
             <p className="text-xs font-bold text-slate-600 text-center">
               {selectedBrokerIds.length} corretores selecionados
             </p>
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-2 space-y-6">
        {/* CARD 2: IMPORTAÇÃO */}
        <Card className="shadow-md border-none">
          <CardHeader>
            <CardTitle className="text-green-700 flex items-center gap-2 text-lg"><FileSpreadsheet className="w-5 h-5" /> Importar Planilha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex gap-3">
              <div className="bg-green-100 p-2 rounded-full h-fit"><Upload className="w-4 h-4 text-green-700" /></div>
              <div>
                <p className="text-sm font-bold text-green-800">Distribuição Automática</p>
                <p className="text-xs text-green-700">Os leads da planilha serão divididos igualmente entre os {selectedBrokerIds.length > 0 ? selectedBrokerIds.length : '...'} corretores selecionados ao lado.</p>
              </div>
            </div>

            <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center cursor-pointer hover:bg-slate-50 transition-colors group bg-white">
              <FileSpreadsheet className="w-10 h-10 text-slate-300 group-hover:text-green-600 mb-2 transition-colors" />
              <span className="text-sm font-bold text-slate-600">Clique para carregar planilha</span>
              <span className="text-xs text-slate-400 mt-1">Formatos: .xlsx, .csv</span>
              <Input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} ref={fileInputRef} disabled={selectedBrokerIds.length === 0} />
            </Label>
          </CardContent>
        </Card>

        {/* CARD 3: RETRABALHO */}
        <Card className="shadow-md border-none">
          <CardHeader>
            <CardTitle className="text-indigo-700 flex items-center gap-2 text-lg">
              <RefreshCw className="w-5 h-5 mr-2" /> Leads Abandonados
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                          <div className="text-xs text-slate-400">{l.tag}</div>
                        </TableCell>
                        <TableCell><Badge variant="destructive" className="text-[10px]">ABANDONADO</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            className="bg-indigo-600 hover:bg-indigo-700 text-xs font-bold"
                            onClick={() => handleRework(l.id)}
                            disabled={selectedBrokerIds.length === 0 || reworkMutation.isPending}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" /> Recuperar
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
    </div>
  );
};

export default LeadRework;