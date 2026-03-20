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
  const [retryMap, setRetryMap] = useState<Record<string, { attempts: number; last_error: string | null }>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);

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

    // Load base logs in parallel (distribution, webhook, automation, ai)
    const [dRes, wRes, aRes, aiRes] = await Promise.all([
      supabase.from("distribution_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("automation_logs").select("*, automation_rules(name, type)").order("executed_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("ai_context_analysis").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    ]);

    setDistLogs(dRes.data || []);
    setWebhookLogs(wRes.data || []);
    setAutomationLogs(aRes.data || []);
    setAiAnalyses(aiRes.data || []);

    // Fetch failed outgoing messages
    const { data: failedRaw } = await supabase
      .from('ia_messages')
      .select('id, conversation_id, message_text, failed_at, error_message')
      .eq('direction', 'outgoing')
      .not('failed_at', 'is', null)
      .order('failed_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const failed = failedRaw || [];
    const convIds = Array.from(new Set(failed.map((f: any) => f.conversation_id).filter(Boolean)));

    let convMap: Record<string, any> = {};
    let botMap: Record<string, any> = {};

    if (convIds.length > 0) {
      const { data: convs } = await supabase.from('ia_conversations').select('id, bot_instance_id, lead_phone, escalated_to').in('id', convIds);
      convMap = (convs || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc; }, {});
      const botIds = Array.from(new Set((convs || []).map((c: any) => c.bot_instance_id).filter(Boolean)));
      if (botIds.length > 0) {
        const { data: botsData } = await supabase.from('bot_instances').select('id, name').in('id', botIds);
        botMap = (botsData || []).reduce((acc: any, b: any) => { acc[b.id] = b; return acc; }, {});
      }
    }

    const fm = failed.map((r: any) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      message_text: r.message_text,
      failed_at: r.failed_at,
      error_message: r.error_message,
      bot_instance_id: convMap[r.conversation_id]?.bot_instance_id || null,
      bot_name: botMap[convMap[r.conversation_id]?.bot_instance_id || '']?.name || null,
      lead_phone: convMap[r.conversation_id]?.lead_phone || null,
    })) as FailedMessage[];

    setFailedMessages(fm || []);

    // Load retry info for these failed messages
    const failedIds = fm.map(f => f.id).filter(Boolean);
    if (failedIds.length > 0) {
      const { data: retries } = await supabase.from('webhook_retry').select('ia_message_id, attempts, last_error').in('ia_message_id', failedIds as string[]);
      const map: Record<string, any> = {};
      (retries || []).forEach((r: any) => { map[r.ia_message_id] = { attempts: r.attempts, last_error: r.last_error }; });
      setRetryMap(map);
    } else {
      setRetryMap({});
    }

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

  // Resend single (unchanged) but now record retry
  const resendFailed = async (msg: FailedMessage) => {
    try {
      setResendingId(msg.id);
      if (!msg.bot_instance_id) throw new Error('Bot instance not found for this message');
      const { data: conv } = await supabase.from('ia_conversations').select('*').eq('id', msg.conversation_id).maybeSingle();
      const phone = conv?.lead_phone || msg.lead_phone;
      const { error } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: msg.bot_instance_id, phone, message: msg.message_text || '', conversationId: msg.conversation_id }
      });
      if (error) {
        // log retry
        await supabase.from('webhook_retry').insert({ ia_message_id: msg.id, attempts: 1, last_error: error.message, next_try: new Date() });
        throw error;
      }

      toast({ title: '✅ Reenviado', description: `Mensagem reenviada para ${phone}` });
      // refresh lists
      await loadData();
    } catch (e: any) {
      toast({ title: '❌ Erro ao reenviar', description: e.message, variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  // Bulk resend with confirmation and concurrency control
  const resendAll = async () => {
    if (!confirm(`Confirmar reenvio de ${failedMessages.length} mensagens não enviadas?`)) return;
    const toResend = [...failedMessages];
    const concurrency = 3;
    let index = 0;
    const results: { id: string; ok: boolean; error?: any }[] = [];

    const worker = async () => {
      while (index < toResend.length) {
        const i = index++;
        const msg = toResend[i];
        try {
          await resendFailed(msg);
          results.push({ id: msg.id, ok: true });
        } catch (err) {
          results.push({ id: msg.id, ok: false, error: err });
        }
      }
    };

    const workers = Array.from({ length: concurrency }).map(() => worker());
    await Promise.all(workers);
    toast({ title: 'Reenvio concluído', description: `${results.filter(r => r.ok).length} enviados, ${results.filter(r => !r.ok).length} falharam` });
    await loadData();
  };

  // Generate aggregated report per bot / broker
  const generateReport = async () => {
    setReportOpen(true);
    // aggregate from failedMessages and conversation info
    const mapByBot: Record<string, number> = {};
    const mapByBroker: Record<string, { name: string; count: number }> = {};

    // fetch conversation -> broker mapping for failed messages
    const convIds = Array.from(new Set(failedMessages.map(f => f.conversation_id).filter(Boolean)));
    let convMap: Record<string, any> = {};
    if (convIds.length > 0) {
      const { data: convs } = await supabase.from('ia_conversations').select('id, bot_instance_id, escalated_to').in('id', convIds);
      convMap = (convs || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc; }, {});
      const botIds = Array.from(new Set(Object.values(convMap).map((c: any) => c.bot_instance_id).filter(Boolean)));
      if (botIds.length > 0) {
        const { data: botsData } = await supabase.from('bot_instances').select('id, name').in('id', botIds);
        const botNameMap = (botsData || []).reduce((acc: any, b: any) => { acc[b.id] = b.name; return acc; }, {});
        failedMessages.forEach(f => {
          const conv = convMap[f.conversation_id];
          const botId = conv?.bot_instance_id;
          const botName = botNameMap[botId] || 'Desconhecido';
          mapByBot[botName] = (mapByBot[botName] || 0) + 1;
          const brokerId = conv?.escalated_to;
          if (brokerId) {
            mapByBroker[brokerId] = mapByBroker[brokerId] || { name: brokerId, count: 0 };
            mapByBroker[brokerId].count += 1;
          }
        });
      }
    }

    const botRows = Object.entries(mapByBot).map(([botName, count]) => ({ botName, count }));
    // resolve broker names
    const brokerIds = Object.keys(mapByBroker);
    if (brokerIds.length > 0) {
      const { data: brokers } = await supabase.from('profiles').select('id, full_name').in('id', brokerIds);
      (brokers || []).forEach(b => { if (mapByBroker[b.id]) mapByBroker[b.id].name = b.full_name || b.id; });
    }
    const brokerRows = Object.entries(mapByBroker).map(([id, v]) => ({ brokerId: id, brokerName: v.name, count: v.count }));

    setReportData([{ title: 'Por Instância', rows: botRows }, { title: 'Por Corretor', rows: brokerRows }]);
  };

  const exportReportCSV = () => {
    const parts: string[] = [];
    reportData.forEach(section => {
      parts.push(section.title);
      const rows = section.rows;
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      parts.push(headers.join(','));
      rows.forEach((r: any) => parts.push(Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
      parts.push('');
    });
    const csv = parts.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_failures_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="flex justify-center gap-3 mt-4">
        <Button onClick={resendAll} variant="outline" className="border-red-500 text-red-400 hover:bg-red-900/20">
          <Zap className="w-4 h-4 mr-2" /> Reenviar Tudo
        </Button>
        <Button onClick={generateReport} variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-900/20">
          <Brain className="w-4 h-4 mr-2" /> Relatório
        </Button>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-slate-900 border-gray-500 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Relatório de Mensagens Não Enviadas</DialogTitle>
            <DialogDescription className="text-gray-400">Estatísticas por instância e corretor</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {reportData.map((section, i) => (
              <div key={i} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700/50 bg-slate-800/60">
                      {section.rows.length > 0 && Object.keys(section.rows[0]).map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, j) => (
                      <tr key={j} className="border-b border-gray-700/30 hover:bg-slate-800/30">
                        {section.rows.length > 0 && Object.keys(row).map(h => (
                          <td key={h} className="px-4 py-3 text-gray-400 text-xs">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={exportReportCSV} variant="outline" className="border-green-500 text-green-400 hover:bg-green-900/20">
              Exportar CSV
            </Button>
            <Button onClick={() => setReportOpen(false)} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
