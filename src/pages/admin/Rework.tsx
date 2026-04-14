import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Upload, Users, ArrowRight, CheckCircle2,
  XCircle, AlertTriangle, FileText, Download, Shuffle, UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  lead_assignment_enabled: boolean;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string | null;
  broker_id: string | null;
  tag: string | null;
  created_at: string;
}

type Tab = "redistribute" | "upload";

interface CsvRow { name: string; phone: string; email?: string; tag?: string; source?: string; }
interface ParseResult { valid: CsvRow[]; errors: string[]; }
interface Queue { id: string; name: string; broker_ids: string[]; last_assigned_index: number; }

export default function Rework() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("redistribute");
  const [brokers, setBrokers] = useState<Profile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Redistribution
  const [fromBroker, setFromBroker] = useState("");
  const [toBroker, setToBroker] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [redistributing, setRedistributing] = useState(false);

  // CSV Upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; errors: number } | null>(null);
  const [assignMode, setAssignMode] = useState<"broker" | "queue">("broker");
  const [assignTo, setAssignTo] = useState("");
  const [assignQueue, setAssignQueue] = useState("");
  const [queues, setQueues] = useState<Queue[]>([]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: p }, { data: l }, { data: q }] = await Promise.all([
      supabase.from("profiles").select("id,first_name,last_name,email,role,lead_assignment_enabled").order("first_name"),
      supabase.from("leads").select("id,name,phone,email,status,broker_id,tag,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("distribution_queues").select("id,name,broker_ids,last_assigned_index").eq("is_active", true).order("name"),
    ]);
    setBrokers((p || []).filter(pr => pr.role === "BROKER"));
    setLeads(l || []);
    setQueues(q || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const brokerName = (id: string | null) => {
    const b = brokers.find(b => b.id === id);
    return b ? `${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email : "Sem corretor";
  };

  const filteredLeads = leads.filter(l => {
    if (!fromBroker) return false;
    if (l.broker_id !== fromBroker) return false;
    if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
    return true;
  });

  const toggleLead = (id: string) => {
    setSelectedLeads(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAll = () => setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
  const clearAll = () => setSelectedLeads(new Set());

  const handleRedistribute = async () => {
    if (!toBroker || selectedLeads.size === 0) return toast({ title: "Selecione destino e leads", variant: "destructive" });
    setRedistributing(true);
    const selectedIds = Array.from(selectedLeads);
    const now = new Date().toISOString();
    const { error } = await supabase.from("leads").update({
      broker_id: toBroker,
      status: "NEW",
      last_interaction_at: now,
      last_broker_whatsapp_at: null, // Zera contador — lead é novo para o corretor destino
    }).in("id", selectedIds);
    setRedistributing(false);
    if (error) return toast({ title: "Erro ao redistribuir", description: error.message, variant: "destructive" });

    // Notifica o corretor destino para tocar o som no dashboard
    const redistributedLeads = leads.filter(l => selectedIds.includes(l.id));
    if (redistributedLeads.length > 0) {
      const notifMsg = redistributedLeads.length === 1
        ? `🔄 Lead redistribuído: ${redistributedLeads[0].name}. Acesse sua fila e atenda agora!`
        : `🔄 ${redistributedLeads.length} leads redistribuídos para você. Acesse sua fila agora!`;
      await supabase.from("internal_notifications").insert({
        to_id: toBroker,
        type: "LEAD_REDISTRIBUTED",
        message: notifMsg,
      });
    }

    toast({ title: `✅ ${selectedLeads.size} lead${selectedLeads.size > 1 ? "s" : ""} redistribuído${selectedLeads.size > 1 ? "s" : ""}!` });
    setSelectedLeads(new Set());
    loadData();
  };

  // ─── CSV Parser ──────────────────────────────────────────────────────────────
  const parseCSV = (text: string): ParseResult => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { valid: [], errors: ["Arquivo vazio ou sem dados"] };

    // Auto-detecta delimitador: ; ou , ou \t
    const firstLine = lines[0];
    const delim = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

    const splitLine = (line: string) => line.split(delim).map(c => c.trim().replace(/^"|"$/g, ""));

    const headers = splitLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx   = headers.findIndex(h => h.includes("nome") || h === "name");
    const phoneIdx  = headers.findIndex(h => h.includes("telefone") || h.includes("phone") || h.includes("celular") || h.includes("fone") || h.includes("whatsapp"));
    const emailIdx  = headers.findIndex(h => h.includes("email"));
    const tagIdx    = headers.findIndex(h => h.includes("tag") || h.includes("produto") || h.includes("product"));
    const sourceIdx = headers.findIndex(h => h.includes("source") || h.includes("fonte") || h.includes("origem"));

    if (nameIdx === -1) return { valid: [], errors: ["Coluna 'nome' ou 'name' não encontrada"] };
    if (phoneIdx === -1) return { valid: [], errors: ["Coluna 'telefone', 'phone' ou 'celular' não encontrada"] };

    const valid: CsvRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = splitLine(lines[i]);
      const name = cols[nameIdx]?.trim();
      // Remove prefixo p:+ e caracteres não numéricos (exceto +)
      const rawPhone = cols[phoneIdx] || "";
      const phone = rawPhone.replace(/^[a-zA-Z]+:/i, "").replace(/[^0-9+]/g, "");
      if (!name || name.length < 2) { errors.push(`Linha ${i + 1}: nome inválido`); continue; }
      if (!phone || phone.length < 8) { errors.push(`Linha ${i + 1}: telefone inválido`); continue; }
      valid.push({
        name, phone,
        email: emailIdx >= 0 ? cols[emailIdx]?.trim() || undefined : undefined,
        tag: tagIdx >= 0 ? cols[tagIdx]?.trim() || undefined : undefined,
        source: sourceIdx >= 0 ? cols[sourceIdx]?.trim() || undefined : undefined,
      });
    }
    return { valid, errors };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setParseResult(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!parseResult || parseResult.valid.length === 0) return toast({ title: "Nenhum dado válido para importar", variant: "destructive" });

    setUploading(true);
    let inserted = 0; let errors = 0;

    // Distribuição por fila (round-robin)
    if (assignMode === "queue" && assignQueue) {
      const { data: freshQueue } = await supabase
        .from("distribution_queues").select("broker_ids,last_assigned_index").eq("id", assignQueue).single();
      if (!freshQueue?.broker_ids?.length) {
        setUploading(false);
        return toast({ title: "Regra sem corretores ativos", variant: "destructive" });
      }
      let idx = freshQueue.last_assigned_index || 0;
      const rows = parseResult.valid.map(r => {
        const broker_id = freshQueue.broker_ids[idx % freshQueue.broker_ids.length];
        idx++;
        return { name: r.name, phone: r.phone, email: r.email || null, tag: r.tag || null, broker_id, status: "NEW" };
      });
      // Atualiza índice da fila
      await supabase.from("distribution_queues").update({ last_assigned_index: idx }).eq("id", assignQueue);
      // Insere em lotes de 50
      for (let i = 0; i < rows.length; i += 50) {
        const { error, data } = await supabase.from("leads").insert(rows.slice(i, i + 50)).select("id");
        if (error) errors += Math.min(50, rows.length - i);
        else inserted += data?.length || 0;
      }
    } else {
      // Atribuição direta a um corretor (ou sem corretor)
      const batches: CsvRow[][] = [];
      for (let i = 0; i < parseResult.valid.length; i += 50) batches.push(parseResult.valid.slice(i, i + 50));
      for (const batch of batches) {
        const rows = batch.map(r => ({
          name: r.name, phone: r.phone,
          email: r.email || null, tag: r.tag || null,
          broker_id: assignTo || null,
          status: "NEW",
        }));
        const { error, data } = await supabase.from("leads").insert(rows).select("id");
        if (error) errors += batch.length;
        else inserted += data?.length || 0;
      }
    }

    setUploading(false);
    setUploadResult({ inserted, errors });
    if (inserted > 0) toast({ title: `✅ ${inserted} leads importados!` });
    if (errors > 0) toast({ title: `⚠️ ${errors} leads com erro`, variant: "destructive" });
    loadData();
  };

  const downloadTemplate = () => {
    const csv = "nome,telefone,email,tag,source\nJoão Silva,11999999999,joao@email.com,produto-a,facebook\nMaria Santos,21988888888,,produto-b,instagram";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "template_leads.csv"; a.click();
  };

  const STATUSES = ["ALL", "NEW", "CONTACTED", "PROPOSAL", "SALE", "LOST"];

  const leadsByBroker = brokers.map(b => ({
    broker: b,
    count: leads.filter(l => l.broker_id === b.id).length,
  })).sort((a, b) => b.count - a.count);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw className="w-10 h-10 text-orange-400 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <RefreshCw className="w-7 h-7 text-orange-400" />
            Rework & Importação
          </h2>
          <p className="text-gray-500 text-sm mt-1">Redistribua leads entre corretores ou importe novos via CSV</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("redistribute")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "redistribute" ? "bg-orange-900/40 text-orange-300 border border-orange-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <ArrowRight className="w-4 h-4" /> Redistribuição
        </button>
        <button onClick={() => setTab("upload")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "upload" ? "bg-blue-900/40 text-blue-300 border border-blue-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Upload className="w-4 h-4" /> Upload CSV
        </button>
      </div>

      {/* ─── Redistribuição ──────────────────────────────────────────────────── */}
      {tab === "redistribute" && (
        <div className="space-y-5">
          {/* Distribuição atual */}
          <div className="bg-slate-800/40 border border-gray-700/50 rounded-xl p-4">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Leads por corretor</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {leadsByBroker.filter(b => b.count > 0).map(({ broker, count }) => (
                <div key={broker.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2">
                  <span className="text-white text-xs truncate">{`${broker.first_name || ""} ${broker.last_name || ""}`.trim() || broker.email}</span>
                  <Badge variant="secondary" className="shrink-0 ml-2">{count}</Badge>
                </div>
              ))}
              {leadsByBroker.filter(b => b.count > 0).length === 0 && (
                <p className="text-gray-600 text-sm col-span-full">Nenhum lead distribuído ainda.</p>
              )}
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">De (corretor origem)</Label>
              <select value={fromBroker} onChange={e => { setFromBroker(e.target.value); setSelectedLeads(new Set()); }}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                <option value="">Selecionar corretor...</option>
                {brokers.map(b => (
                  <option key={b.id} value={b.id}>
                    {`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email}
                    {" "}({leads.filter(l => l.broker_id === b.id).length} leads)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Status do Lead</Label>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectedLeads(new Set()); }}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                {STATUSES.map(s => <option key={s} value={s}>{s === "ALL" ? "Todos os status" : s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Para (corretor destino)</Label>
              <select value={toBroker} onChange={e => setToBroker(e.target.value)}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                <option value="">Selecionar destino...</option>
                {brokers.filter(b => b.id !== fromBroker).map(b => (
                  <option key={b.id} value={b.id}>
                    {`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista de leads */}
          {fromBroker && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-sm">
                  {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} encontrado{filteredLeads.length !== 1 ? "s" : ""}
                  {selectedLeads.size > 0 && <span className="text-orange-300 ml-2">• {selectedLeads.size} selecionado{selectedLeads.size > 1 ? "s" : ""}</span>}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs text-gray-400 hover:text-white h-7 px-2">Todos</Button>
                  <Button size="sm" variant="ghost" onClick={clearAll} className="text-xs text-gray-400 hover:text-white h-7 px-2">Nenhum</Button>
                </div>
              </div>

              {filteredLeads.length === 0 ? (
                <div className="text-center py-10 text-gray-600 text-sm">Nenhum lead com este filtro.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {filteredLeads.map(lead => {
                    const selected = selectedLeads.has(lead.id);
                    return (
                      <button key={lead.id} onClick={() => toggleLead(lead.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${selected ? "border-orange-500/50 bg-orange-900/20" : "border-gray-700/40 bg-slate-800/30 hover:border-gray-600"}`}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-orange-600 border-orange-500" : "border-gray-600"}`}>
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-medium">{lead.name}</span>
                          <span className="text-gray-500 text-xs ml-2">{lead.phone}</span>
                        </div>
                        {lead.status && <Badge variant="secondary" className="text-xs shrink-0">{lead.status}</Badge>}
                        {lead.tag && <span className="text-xs text-purple-400 shrink-0">{lead.tag}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <Button onClick={handleRedistribute} disabled={redistributing || selectedLeads.size === 0 || !toBroker}
                className="mt-4 w-full bg-orange-600 hover:bg-orange-500 font-bold gap-2">
                {redistributing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {redistributing ? "Redistribuindo..." : `Redistribuir ${selectedLeads.size} lead${selectedLeads.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Upload CSV ──────────────────────────────────────────────────────── */}
      {tab === "upload" && (
        <div className="space-y-5">
          {/* Template */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-blue-300 font-semibold text-sm">Baixe o template CSV</p>
              <p className="text-gray-400 text-xs mt-0.5">Colunas: nome, telefone, email (op), tag (op), source (op)</p>
            </div>
            <Button size="sm" onClick={downloadTemplate} variant="outline" className="border-blue-500/40 text-blue-300 hover:bg-blue-900/30 gap-1.5 shrink-0">
              <Download className="w-4 h-4" /> Template
            </Button>
          </div>

          {/* Modo de atribuição */}
          <div className="space-y-3">
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Modo de atribuição</Label>
            <div className="flex gap-2">
              <button onClick={() => setAssignMode("broker")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${assignMode === "broker" ? "bg-blue-900/40 border-blue-500/50 text-blue-300" : "border-gray-700/40 text-gray-500 hover:text-gray-300"}`}>
                <UserCheck className="w-4 h-4" /> Corretor específico
              </button>
              <button onClick={() => setAssignMode("queue")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${assignMode === "queue" ? "bg-purple-900/40 border-purple-500/50 text-purple-300" : "border-gray-700/40 text-gray-500 hover:text-gray-300"}`}>
                <Shuffle className="w-4 h-4" /> Regra de distribuição
              </button>
            </div>

            {assignMode === "broker" ? (
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                <option value="">Sem corretor (não atribuído)</option>
                {brokers.map(b => (
                  <option key={b.id} value={b.id}>
                    {`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email}
                  </option>
                ))}
              </select>
            ) : (
              <select value={assignQueue} onChange={e => setAssignQueue(e.target.value)}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                <option value="">Selecionar regra...</option>
                {queues.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.name} ({q.broker_ids?.length || 0} corretores)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Upload area */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-600 hover:border-blue-500/50 rounded-xl p-10 text-center cursor-pointer transition-all group"
          >
            <Upload className="w-10 h-10 text-gray-600 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
            <p className="text-gray-400 group-hover:text-white transition-colors font-medium">
              {csvFile ? csvFile.name : "Clique para selecionar o arquivo CSV"}
            </p>
            <p className="text-gray-600 text-xs mt-1">Suporte a .csv</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Preview */}
          {parseResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                  <div>
                    <p className="text-2xl font-black text-green-400">{parseResult.valid.length}</p>
                    <p className="text-xs text-gray-400">Válidos</p>
                  </div>
                </div>
                <div className={`${parseResult.errors.length > 0 ? "bg-red-900/20 border-red-500/30" : "bg-slate-800/40 border-gray-700/30"} border rounded-xl p-4 flex items-center gap-3`}>
                  <XCircle className={`w-8 h-8 ${parseResult.errors.length > 0 ? "text-red-400" : "text-gray-600"}`} />
                  <div>
                    <p className={`text-2xl font-black ${parseResult.errors.length > 0 ? "text-red-400" : "text-gray-600"}`}>{parseResult.errors.length}</p>
                    <p className="text-xs text-gray-400">Erros</p>
                  </div>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-3 max-h-32 overflow-y-auto">
                  {parseResult.errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />{e}
                    </p>
                  ))}
                  {parseResult.errors.length > 10 && <p className="text-xs text-gray-500 mt-1">...e mais {parseResult.errors.length - 10} erros</p>}
                </div>
              )}

              {/* Prévia dos primeiros */}
              {parseResult.valid.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-700/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/60 border-b border-gray-700/50">
                        {["Nome", "Telefone", "Email", "Tag"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.valid.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-b border-gray-700/20">
                          <td className="px-3 py-2 text-white">{r.name}</td>
                          <td className="px-3 py-2 text-gray-300 font-mono">{r.phone}</td>
                          <td className="px-3 py-2 text-gray-400">{r.email || "—"}</td>
                          <td className="px-3 py-2 text-purple-400">{r.tag || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseResult.valid.length > 5 && (
                    <p className="text-xs text-gray-600 p-3">...e mais {parseResult.valid.length - 5} leads</p>
                  )}
                </div>
              )}

              <Button onClick={handleUpload} disabled={uploading || parseResult.valid.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 font-bold gap-2">
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Importando..." : `Importar ${parseResult.valid.length} leads`}
              </Button>
            </div>
          )}

          {/* Resultado */}
          {uploadResult && (
            <div className={`rounded-xl p-4 border ${uploadResult.errors === 0 ? "bg-green-900/20 border-green-500/30" : "bg-yellow-900/20 border-yellow-500/30"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-white font-bold">{uploadResult.inserted} leads importados com sucesso!</span>
                {uploadResult.errors > 0 && <span className="text-yellow-400 text-sm">({uploadResult.errors} com erro)</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
