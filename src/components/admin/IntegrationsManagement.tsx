import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Copy, Check, ExternalLink, Shield, Save, MessageCircle, Send, Radio, Activity, Loader2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const IntegrationsManagement = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();
  
  // State for Output Webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  
  const webhookIncomingUrl = "https://jcmovytbcghvvukaszyb.supabase.co/functions/v1/incoming-lead";
  const authToken = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbW92eXRiY2dodnZ1a2FzenliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTM1MzksImV4cCI6MjA4NTg4OTUzOX0.Iwcm9SHz8OT3xicgB_iMCqz1HHZg1SGJQnG8Xok8K0E";

  // 1. Fetch Integration Config
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['integration-config'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_integrations')
        .select('value')
        .eq('key', 'WHATSAPP_N8N_URL')
        .single();
      return data;
    }
  });

  // 2. Fetch Logs
  const { data: logs = [] } = useQuery({
    queryKey: ['webhook-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    refetchInterval: 5000 // Refresh logs every 5s
  });

  useEffect(() => {
    if (config?.value) {
      setWebhookUrl(config.value);
    }
  }, [config]);

  const saveConfigMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from('system_integrations')
        .upsert({ 
          key: 'WHATSAPP_N8N_URL', 
          value: url,
          description: 'Webhook do N8N para envio de mensagens WhatsApp'
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("URL de integração salva com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['integration-config'] });
    },
    onError: (err: any) => toast.error("Erro ao salvar: " + err.message)
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      setIsTesting(true);
      // Calls the Edge Function directly which uses the DB config
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: { 
          phone: testPhone, 
          message: "🔔 Teste de Conectividade CRM -> N8N. Se você recebeu isso, a integração está ativa!" 
        }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teste enviado! Verifique o WhatsApp.");
      queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
    },
    onError: (err: any) => toast.error("Falha no teste: " + err.message),
    onSettled: () => setIsTesting(false)
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copiado!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
          <Globe className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Console de Conectividade</h2>
          <p className="text-sm text-gray-500">Gerencie a entrada e saída de dados do seu CRM.</p>
        </div>
      </div>

      <Tabs defaultValue="output" className="w-full">
        <TabsList className="grid grid-cols-2 h-12 bg-slate-100 p-1 mb-6 rounded-xl w-full md:w-[400px]">
          <TabsTrigger value="output" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600">
            Saída (WhatsApp/N8N)
          </TabsTrigger>
          <TabsTrigger value="input" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:text-indigo-600">
            Entrada (Receber Leads)
          </TabsTrigger>
        </TabsList>

        {/* ABA DE SAÍDA (WHATSAPP/N8N) */}
        <TabsContent value="output" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* CONFIGURAÇÃO */}
            <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden h-fit">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <CardTitle className="text-indigo-700 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" /> Webhook de Saída (WhatsApp)
                </CardTitle>
                <CardDescription>Para onde devemos enviar as mensagens automáticas?</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">URL do Endpoint N8N</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={webhookUrl} 
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/..." 
                      className="h-11 rounded-xl bg-slate-50 border-slate-200" 
                    />
                    <Button 
                      onClick={() => saveConfigMutation.mutate(webhookUrl)}
                      disabled={saveConfigMutation.isPending || webhookUrl === config?.value}
                      className="h-11 px-6 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700"
                    >
                      {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    * O payload será enviado como <code>application/x-www-form-urlencoded</code> com os campos <strong>Contato</strong> e <strong>Mensagem</strong>.
                  </p>
                </div>

                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
                  <Label className="font-black text-indigo-800 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Teste de Conexão (Ping)
                  </Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Seu número (com DDD)" 
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="bg-white h-10 rounded-xl border-indigo-200"
                    />
                    <Button 
                      onClick={() => sendTestMutation.mutate()}
                      disabled={!testPhone || isTesting}
                      className="bg-indigo-600 text-white font-bold h-10 rounded-xl px-6"
                    >
                      {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      Enviar Teste
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* LOGS DE DISPARO */}
            <Card className="border-none shadow-xl bg-slate-900 text-white rounded-3xl overflow-hidden h-fit">
              <CardHeader className="p-6 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Radio className="w-5 h-5 text-emerald-400 animate-pulse" /> Monitoramento
                  </CardTitle>
                  <CardDescription className="text-slate-400">Últimas 10 tentativas de disparo.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['webhook-logs'] })} className="text-slate-400 hover:text-white">
                  Atualizar
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-400">
                    <thead className="bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="p-4">Hora</th>
                        <th className="p-4">Destino</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {logs.length === 0 ? (
                        <tr><td colSpan={4} className="p-6 text-center italic opacity-50">Nenhum log registrado ainda.</td></tr>
                      ) : (
                        logs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-4 font-mono text-[10px] text-slate-500">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </td>
                            <td className="p-4 font-bold text-slate-300">
                              {log.payload?.phone || '-'}
                            </td>
                            <td className="p-4 text-center">
                              {log.status_code >= 200 && log.status_code < 300 ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-none">OK {log.status_code}</Badge>
                              ) : (
                                <Badge className="bg-rose-500/20 text-rose-400 border-none">ERR {log.status_code || 'X'}</Badge>
                              )}
                            </td>
                            <td className="p-4 text-right max-w-[150px] truncate text-[10px]" title={log.error_message || 'Sucesso'}>
                              {log.error_message || 'Enviado'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA DE ENTRADA (DO FACEBOOK/MAKE) */}
        <TabsContent value="input">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
                <CardTitle className="text-indigo-700 flex items-center gap-2">
                  <Globe className="w-5 h-5" /> Webhook de Entrada
                </CardTitle>
                <CardDescription>Configure seu Make/Zapier para enviar leads para cá.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-3">
                  <Label className="font-bold text-slate-700">URL do Webhook</Label>
                  <div className="flex gap-2">
                    <Input value={webhookIncomingUrl} readOnly className="bg-slate-50 font-mono text-xs h-11 rounded-xl border-slate-200" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookIncomingUrl, 'url')} className="rounded-xl h-11 w-11 shrink-0">
                      {copied === 'url' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <Label className="font-black text-amber-800 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Chave de Autorização (Bearer Token)
                  </Label>
                  <div className="flex gap-2">
                    <Input value={authToken} readOnly className="bg-white font-mono text-[10px] h-11 rounded-xl border-amber-200 text-amber-900" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(authToken, 'token')} className="rounded-xl h-11 w-11 shrink-0 bg-white border-amber-200 hover:bg-amber-100">
                      {copied === 'token' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-slate-900 text-white rounded-3xl overflow-hidden">
              <CardHeader className="p-6 border-b border-slate-800">
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-indigo-400" /> Documentação JSON
                </CardTitle>
                <CardDescription className="text-slate-400">Exemplo de Payload esperado.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="bg-slate-800 rounded-2xl p-4 font-mono text-[10px] leading-relaxed overflow-x-auto text-indigo-300 border border-slate-700">
                  <pre>{`{
  "name": "Nome do Cliente",
  "phone": "+5511999999999",
  "email": "cliente@email.com",
  "tag": "Facebook Ads",
  "source": "Instagram"
}`}</pre>
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-400 italic">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                  <p>Certifique-se de enviar o header <strong>Authorization</strong> com a chave Bearer ao lado.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IntegrationsManagement;