import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, RefreshCw, Search, CheckCircle2, XCircle, Clock, Webhook, Users, Bot, MessageSquare, Zap, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DistributionLog {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  assigned_to_name: string | null;
  queue_name: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
}

interface WebhookLog {
  id: string;
  integration_key: string | null;
  payload: any;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  created_at: string;
}

interface AutomationLog {
  id: string;
  rule_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string | null;
  message_sent: string | null;
  recipient_phone: string | null;
  error_message: string | null;
  executed_at: string;
  automation_rules?: {
    name: string;
    type: string;
  };
}

interface AIAnalysis {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  analysis_type: string | null;
  ai_decision: string | null;
  ai_reasoning: string | null;
  scheduled_action: string | null;
  created_at: string;
}

interface FailedMessage {
  id: string;
  conversation_id: string | null;
  message_text: string | null;
  failed_at: string | null;
  error_message: string | null;
  bot_instance_id: string | null;
  bot_name: string | null;
  lead_phone: string | null;
}

type Tab = "distribution" | "webhook" | "automation" | "ai" | "failed";

export default function Logs() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("distribution");
  const [distLogs, setDistLogs] = useState<DistributionLog[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<AIAnalysis[]>([]);
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testFormData, setTestFormData] = useState({
    phone: "",
    bot_id: "",
    message: "Olá {nome}! 👋 Seja bem-vindo(a)! Sou assistente virtual e estou aqui para te ajudar. Em que posso te auxiliar?",
    name: "Teste Automação",
  });
  const [bots, setBots] = useState<any[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadBotsForTest = async () => {
    const { data } = await supabase
      .from("bot_instances")
      .select("*")
      .eq("status", "active")
      .order("name");
    setBots(data || []);
  };

  const loadData = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const [{ data: dLogs }, { data: wLogs }, { data: aLogs }, { data: aiLogs }, { data: fMsgs }] = await Promise.all([
      supabase.from("distribution_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("automation_logs").select("*, automation_rules(name, type)").order("executed_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("ai_context_analysis").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      // failed outgoing messages
      supabase
        .from('ia_messages')
        .select('ia_messages.id, ia_messages.conversation_id, ia_messages.message_text, ia_messages.failed_at, ia_messages.error_message, ia_conversations.bot_instance_id, bot_instances.name as bot_name, ia_conversations.lead_phone')
        .eq('ia_messages.direction', 'outgoing')
        .not('ia_messages.failed_at', 'is', null)
        .join('ia_conversations','ia_conversations.id','ia_messages.conversation_id')
        .join('bot_instances','bot_instances.id','ia_conversations.bot_instance_id')
        .order('ia_messages.failed_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1),
    ]);

    setDistLogs(dLogs || []);
    setWebhookLogs(wLogs || []);
    setAutomationLogs(aLogs || []);
    setAiAnalyses(aiLogs || []);
    // map failed messages
    const fm = (fMsgs || []).map((r: any) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      message_text: r.message_text,
      failed_at: r.failed_at,
      error_message: r.error_message,
      bot_instance_id: r.bot_instance_id,
      bot_name: r.bot_name,
      lead_phone: r.lead_phone,
    })) as FailedMessage[];
    setFailedMessages(fm || []);
    setLoading(false);
  };

  useEffect(() => { 
    loadData();
    loadBotsForTest();
  }, [page]);

  const testAutomation = async () => {
    if (!testFormData.phone || !testFormData.bot_id) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    try {
      const selectedBot = bots.find(b => b.id === testFormData.bot_id);
      
      toast({ title: "🧪 Enviando teste...", description: `Via ${selectedBot?.name}` });

      let message = testFormData.message.replace(/{nome}/g, testFormData.name);

      const { error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: {
          botId: testFormData.bot_id,
          phone: testFormData.phone,
          message: message,
          conversationId: null,
        },
      });

      if (error) throw error;

      toast({ title: "✅ Mensagem enviada!", description: `Verifique o WhatsApp ${testFormData.phone}` });
      
      await supabase.from("automation_logs").insert({
        rule_id: null,
        entity_type: "test",
        entity_id: null,
        status: "success",
        message_sent: message,
        recipient_phone: testFormData.phone,
      });

      setTestModalOpen(false);
      setTimeout(() => loadData(), 2000);
    } catch (error: any) {
      toast({ title: "❌ Erro no teste", description: error.message, variant: "destructive" });
    }
  };

  const resendFailed = async (msg: FailedMessage) => {
    try {
      setResendingId(msg.id);
      if (!msg.bot_instance_id) throw new Error('Bot instance not found for this message');
      const { data: conv } = await supabase.from('ia_conversations').select('*').eq('id', msg.conversation_id).maybeSingle();
      const phone = conv?.lead_phone || msg.lead_phone;
      const { error } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: msg.bot_instance_id, phone, message: msg.message_text || '', conversationId: msg.conversation_id }
      });
      if (error) throw error;
      toast({ title: '✅ Reenviado', description: `Mensagem reenviada para ${phone}` });
      // refresh lists
      await loadData();
    } catch (e: any) {
      toast({ title: '❌ Erro ao reenviar', description: e.message, variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const fmt = (date: string) => new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filteredDist = distLogs.filter(l =>
    !search || [l.lead_name, l.lead_phone, l.assigned_to_name, l.queue_name].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredWebhook = webhookLogs.filter(l =>
    !search || l.integration_key?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(l.payload)?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAutomation = automationLogs.filter(l =>
    !search || l.recipient_phone?.includes(search) || l.message_sent?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAI = aiAnalyses.filter(l =>
    !search || l.ai_reasoning?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredFailed = failedMessages.filter(f =>
    !search || (f.message_text || '').toLowerCase().includes(search.toLowerCase()) || (f.lead_phone || '').includes(search)
  );

  const statusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">—</Badge>;
    const s = status.toUpperCase();
    if (s === "OK" || s === "SUCCESS" || s === "ASSIGNED")
      return <Badge className={`${"bg-green-900/40 text-green-300 border-green-500/30"}`}><CheckCircle2 className="w-3 h-3" />{status}</Badge>;
    if (s === "ERROR" || s === "FAILED")
      return <Badge className={`${"bg-red-900/40 text-red-300 border-red-500/30"}`}><XCircle className="w-3 h-3" />{status}</Badge>;
    return <Badge className={`${"bg-yellow-900/40 text-yellow-300 border-yellow-500/30"}`}><Clock className="w-3 h-3" />{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-green-400" />
            Logs do Sistema
          </h2>
          <p className="text-gray-500 text-sm mt-1">Histórico de distribuições, automações e IA</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setTestModalOpen(true)} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-900/20 gap-2">
            <Zap className="w-4 h-4" /> Testar Automação
          </Button>
          <Button onClick={loadData} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800 gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("distribution")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "distribution" ? "bg-green-900/40 text-green-300 border border-green-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Users className="w-4 h-4" /> Distribuição
          <span className="text-xs bg-slate-700 rounded px-1.5">{distLogs.length}</span>
        </button>
        <button onClick={() => setTab("webhook")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "webhook" ? "bg-indigo-900/40 text-indigo-300 border border-indigo-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Webhook className="w-4 h-4" /> Webhooks
          <span className="text-xs bg-slate-700 rounded px-1.5">{webhookLogs.length}</span>
        </button>
        <button onClick={() => setTab("automation")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "automation" ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Bot className="w-4 h-4" /> Automações
          <span className="text-xs bg-slate-700 rounded px-1.5">{automationLogs.length}</span>
        </button>
        <button onClick={() => setTab("ai")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "ai" ? "bg-orange-900/40 text-orange-300 border border-orange-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Brain className="w-4 h-4" /> Análises IA
          <span className="text-xs bg-slate-700 rounded px-1.5">{aiAnalyses.length}</span>
        </button>
        <button onClick={() => setTab("failed")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "failed" ? "bg-red-900/40 text-red-300 border border-red-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <XCircle className="w-4 h-4" /> Não Enviadas
          <span className="text-xs bg-slate-700 rounded px-1.5">{failedMessages.length}</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nos logs..." className="pl-10 bg-slate-800/50 border-gray-700 text-white placeholder:text-gray-500" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-green-400 animate-spin" />
        </div>
      ) : tab === "distribution" ? (
        <div>
          {filteredDist.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum log de distribuição encontrado.</p>
              <p className="text-sm mt-1">Os logs aparecerão aqui quando leads forem distribuídos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 bg-slate-800/60">
                    {["Data", "Lead", "Telefone", "Atribuído Para", "Fila", "Status"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDist.map((log, i) => (
                    <tr key={log.id} className={`border-b border-gray-700/30 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-slate-900/20"}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmt(log.created_at)}</td>
                      <td className="px-4 py-3 text-white font-medium">{log.lead_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{log.lead_phone || "—"}</td>
                      <td className="px-4 py-3 text-blue-300">{log.assigned_to_name || "—"}</td>
                      <td className="px-4 py-3 text-purple-300 text-xs">{log.queue_name || "—"}</td>
                      <td className="px-4 py-3">
                        <div>{statusBadge(log.status)}</div>
                        {log.error_message && <p className="text-xs text-red-400 mt-1 max-w-xs truncate">{log.error_message}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === "webhook" ? (
        <div>
          {filteredWebhook.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Webhook className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum log de webhook encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredWebhook.map(log => (
                <div key={log.id} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-indigo-400" />
                      <span className="text-white font-mono text-sm">{log.integration_key || "entrada"}</span>
                      {log.status_code && (
                        <Badge className={`text-xs ${log.status_code < 300 ? "bg-green-900/40 text-green-300 border-green-500/30" : "bg-red-900/40 text-red-300 border-red-500/30"}`}>
                          HTTP {log.status_code}
                        </Badge>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs">{fmt(log.created_at)}</span>
                  </div>
                  {log.payload && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Ver payload</summary>
                      <pre className="mt-2 text-xs text-gray-400 bg-slate-900/60 rounded p-2 overflow-x-auto max-h-40">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                  {log.error_message && <p className="text-xs text-red-400 mt-2">{log.error_message}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "automation" ? (
        <div>
          {filteredAutomation.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum log de automação encontrado.</p>
              <p className="text-sm mt-1">Clique em "Testar Automação" para criar um teste.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAutomation.map(log => (
                <div key={log.id} className="bg-slate-800/40 border border-purple-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-purple-400" />
                      <span className="text-white font-semibold text-sm">{log.automation_rules?.name || "Automação"}</span>
                      <Badge className="text-xs bg-purple-900/40 text-purple-300 border-purple-500/30">
                        {log.automation_rules?.type || log.entity_type || "—"}
                      </Badge>
                      {statusBadge(log.status)}
                    </div>
                    <span className="text-gray-500 text-xs">{fmt(log.executed_at)}</span>
                  </div>
                  
                  {log.recipient_phone && (
                    <div className="mt-2 text-xs text-gray-400">
                      <span className="text-gray-500">Para:</span> <span className="text-white font-mono">{log.recipient_phone}</span>
                    </div>
                  )}
                  
                  {log.message_sent && (
                    <div className="mt-2 bg-slate-900/60 rounded p-3 border-l-2 border-purple-500/30">
                      <p className="text-xs text-gray-300">{log.message_sent}</p>
                    </div>
                  )}
                  
                  {log.error_message && (
                    <div className="mt-2 bg-red-900/20 border border-red-500/30 rounded p-2">
                      <p className="text-xs text-red-400">{log.error_message}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "ai" ? (
        <div>
          {filteredAI.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma análise de IA encontrada.</p>
              <p className="text-sm mt-1">A IA registrará análises quando avaliar follow-ups.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAI.map(log => (
                <div key={log.id} className="bg-slate-800/40 border border-orange-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-orange-400" />
                      <span className="text-white font-semibold text-sm">{log.analysis_type?.replace(/_/g, ' ').toUpperCase()}</span>
                      <Badge className={`text-xs ${log.ai_decision === 'approved' ? 'bg-green-900/40 text-green-300 border-green-500/30' : 'bg-red-900/40 text-red-300 border-red-500/30'}`}>
                        {log.ai_decision === 'approved' ? 'Aprovado' : 'Rejeitado'}
                      </Badge>
                    </div>
                    <span className="text-gray-500 text-xs">{fmt(log.created_at)}</span>
                  </div>
                  
                  {log.ai_reasoning && (
                    <div className="mt-3 bg-orange-900/20 border border-orange-500/30 rounded p-3">
                      <div className="text-xs text-orange-300 font-semibold mb-1">Análise da IA:</div>
                      <p className="text-sm text-orange-100">{log.ai_reasoning}</p>
                    </div>
                  )}
                  
                  {log.scheduled_action && (
                    <div className="mt-2 text-xs">
                      <span className="text-gray-500">Agendamento detectado:</span>{' '}
                      <span className="text-white">{new Date(log.scheduled_action).toLocaleString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {filteredFailed.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <XCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma mensagem não enviada encontrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFailed.map(msg => (
                <div key={msg.id} className="bg-slate-800/40 border border-red-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-white font-semibold text-sm">{msg.bot_name || '—'}</span>
                      <Badge className="text-xs bg-red-900/40 text-red-300 border-red-500/30">Falhou</Badge>
                    </div>
                    <span className="text-gray-500 text-xs">{fmt(msg.failed_at || new Date().toISOString())}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Para</div>
                      <div className="text-white font-mono">{msg.lead_phone || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Mensagem</div>
                      <div className="text-sm text-gray-300 bg-slate-900 p-2 rounded max-h-40 overflow-y-auto">{msg.message_text}</div>
                    </div>
                  </div>

                  {msg.error_message && <div className="mt-3 text-xs text-red-400">{msg.error_message}</div>}

                  <div className="mt-3 flex items-center gap-2">
                    <Button onClick={() => resendFailed(msg)} disabled={!!resendingId} className="bg-red-600 hover:bg-red-500">
                      {resendingId === msg.id ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Reenviando...</> : 'Reenviar'}
                    </Button>
                    <Button variant="outline" onClick={() => navigator.clipboard.writeText(msg.message_text || '')} className="border-gray-600 text-gray-300">Copiar Mensagem</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="border-gray-600 text-gray-300 hover:bg-slate-800">← Anterior</Button>
        <span className="text-gray-500 text-sm self-center">Página {page + 1}</span>
        <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={distLogs.length < PAGE_SIZE && webhookLogs.length < PAGE_SIZE}
          className="border-gray-600 text-gray-300 hover:bg-slate-800">Próxima →</Button>
      </div>

      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Zap className="w-6 h-6 text-purple-400" />
              Testar Envio de Mensagem
            </DialogTitle>
            <DialogDescription className="text-gray-400">Configure e teste uma mensagem de boas-vindas</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome do Lead (Teste)</Label>
                <Input value={testFormData.name} onChange={e => setTestFormData({ ...testFormData, name: e.target.value })} placeholder="João Silva" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone (com DDD) *</Label>
                <Input value={testFormData.phone} onChange={e => setTestFormData({ ...testFormData, phone: e.target.value })} placeholder="5511999999999" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">Instância/Bot para Envio *</Label>
              <Select value={testFormData.bot_id} onValueChange={value => setTestFormData({ ...testFormData, bot_id: value })}>
                <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione o bot" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-gray-600">
                  {bots.map(bot => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name} ({bot.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">Mensagem de Boas-vindas</Label>
              <Textarea value={testFormData.message} onChange={e => setTestFormData({ ...testFormData, message: e.target.value })} placeholder="Use {nome} para personalizar" className="bg-slate-800 border-gray-600 text-white min-h-[120px]" rows={5} />
              <p className="text-xs text-gray-500 mt-1">Use {"{nome}"} para inserir o nome do lead</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-300">
              💡 <strong>Preview:</strong>
              <div className="mt-2 bg-slate-900 p-2 rounded text-white">
                {testFormData.message.replace(/{nome}/g, testFormData.name)}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setTestModalOpen(false)} variant="outline" className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={testAutomation} className="flex-1 bg-purple-600 hover:bg-purple-500 font-bold">
                <Zap className="w-4 h-4 mr-2" />
                Enviar Teste
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
