import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, RefreshCw, Search, CheckCircle2, XCircle, Clock, Webhook, Users } from "lucide-react";

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

type Tab = "distribution" | "webhook";

export default function Logs() {
  const [tab, setTab] = useState<Tab>("distribution");
  const [distLogs, setDistLogs] = useState<DistributionLog[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadData = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const [{ data: dLogs }, { data: wLogs }] = await Promise.all([
      supabase.from("distribution_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
      supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    ]);
    setDistLogs(dLogs || []);
    setWebhookLogs(wLogs || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [page]);

  const fmt = (date: string) => new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filteredDist = distLogs.filter(l =>
    !search || [l.lead_name, l.lead_phone, l.assigned_to_name, l.queue_name].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredWebhook = webhookLogs.filter(l =>
    !search || l.integration_key?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(l.payload)?.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">—</Badge>;
    const s = status.toUpperCase();
    if (s === "OK" || s === "SUCCESS" || s === "ASSIGNED")
      return <Badge className="bg-green-900/40 text-green-300 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3" />{status}</Badge>;
    if (s === "ERROR" || s === "FAILED")
      return <Badge className="bg-red-900/40 text-red-300 border-red-500/30 gap-1"><XCircle className="w-3 h-3" />{status}</Badge>;
    return <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-500/30 gap-1"><Clock className="w-3 h-3" />{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-green-400" />
            Logs do Sistema
          </h2>
          <p className="text-gray-500 text-sm mt-1">Histórico de distribuições e integrações</p>
        </div>
        <Button onClick={loadData} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800 gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
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
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nos logs..." className="pl-10 bg-slate-800/50 border-gray-700 text-white placeholder:text-gray-500" />
      </div>

      {/* Conteúdo */}
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
      ) : (
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
      )}

      {/* Paginação */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="border-gray-600 text-gray-300 hover:bg-slate-800">← Anterior</Button>
        <span className="text-gray-500 text-sm self-center">Página {page + 1}</span>
        <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={distLogs.length < PAGE_SIZE && webhookLogs.length < PAGE_SIZE}
          className="border-gray-600 text-gray-300 hover:bg-slate-800">Próxima →</Button>
      </div>
    </div>
  );
}
