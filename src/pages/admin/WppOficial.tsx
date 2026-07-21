// WPP Oficial — disparador WhatsApp Cloud API (API oficial da Meta).
// Motor (backend) já existe: edges wa-sender / wa-webhook / wa-campaign-runner / wa-template
// + tabelas whatsapp_* (config, templates, campaigns, campaign_targets, threads, messages).
// 4 abas: Disparos · Conversas (inbox) · Templates · Gastos.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Send, MessageSquare, FileText, DollarSign, Plus, RefreshCw,
  Loader2, CheckCircle2, Rocket, Bot, Users, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SJC_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaW1ldWVmbmhhaWVtcmZpa2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzgyNzIsImV4cCI6MjA4Njk1NDI3Mn0.Y0DOXDbrPVzVw41f9oONjsz8ggwDYi3wZ71iPR0GCqs";

type Tab = "disparos" | "conversas" | "templates" | "gastos";

const AUDIENCE = [
  { v: "novos", label: "Leads novos (entraram há X dias)" },
  { v: "parados", label: "Leads parados há X dias" },
  { v: "esfriando", label: "Leads esfriando há X dias" },
  { v: "prospeccao", label: "Pool de prospecção" },
  { v: "csv", label: "Lista de números (colar)" },
];

const statusColor: Record<string, string> = {
  draft: "bg-slate-600", sending: "bg-blue-600", done: "bg-emerald-600",
  paused: "bg-amber-600", canceled: "bg-red-700", APPROVED: "bg-emerald-600", PENDING: "bg-amber-600",
  REJECTED: "bg-red-600", DRAFT: "bg-slate-600",
};

// O admin usa tema custom (data-theme), não a classe .dark do shadcn — então forço
// as variáveis de tema pro ESCURO só dentro desta tela, senão os campos ficam ilegíveis.
const WA_DARK = {
  "--background": "222 47% 11%", "--foreground": "0 0% 100%",
  "--input": "215 20% 32%", "--border": "215 20% 32%", "--ring": "142 70% 45%",
  "--muted": "215 25% 27%", "--muted-foreground": "215 16% 72%",
  "--popover": "222 47% 14%", "--popover-foreground": "0 0% 100%",
  "--accent": "215 25% 27%", "--accent-foreground": "0 0% 100%",
  "--card": "222 47% 13%", "--card-foreground": "0 0% 100%",
  "--primary": "142 70% 45%", "--primary-foreground": "0 0% 100%",
} as any;

// custo aproximado por mensagem de marketing (Brasil), em USD
const WA_RATE_USD = 0.0625;
const USD_BRL = 5.5;

// parseia texto colado ou CSV: "Nome,Telefone" | "Nome<tab>Telefone" | só telefone -> [{phone,name}]
function parseLeads(text: string): { phone: string; name: string | null }[] {
  return (text || "").split(/\r?\n/).map((line) => {
    line = line.trim(); if (!line) return null as any;
    const parts = line.split(/[,;\t]/).map((s) => s.trim()).filter(Boolean);
    let phone = "", name = "";
    if (parts.length >= 2) {
      const counts = parts.map((p) => p.replace(/\D/g, "").length);
      const pi = counts.indexOf(Math.max(...counts));
      phone = parts[pi].replace(/\D/g, "");
      name = parts.filter((_, i) => i !== pi).join(" ").trim();
    } else { phone = parts[0].replace(/\D/g, ""); }
    if (phone.length < 10) return null as any;
    if (!phone.startsWith("55") && phone.length <= 11) phone = "55" + phone;
    return { phone, name: name || null };
  }).filter(Boolean) as { phone: string; name: string | null }[];
}

export default function WppOficial() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("disparos");
  return (
    <div className="min-h-screen bg-slate-950 text-white" style={WA_DARK}>
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate("/admin")} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Rocket className="w-6 h-6 text-green-400" /> WPP Oficial
            </h1>
            <p className="text-xs text-slate-400">Disparador WhatsApp API oficial · número +55 11 91339-0468</p>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-3 mb-5 text-sm text-slate-300 leading-relaxed">
          <b className="text-white">Pra que serve:</b> mandar mensagem pelo WhatsApp <b>oficial da empresa</b> e conversar com quem responde — sem depender do chip de ninguém.
          <div className="mt-1 text-slate-400">
            <b className="text-slate-200">Passo a passo:</b> 1️⃣ crie um <b>Template</b> (a mensagem) e espere a Meta aprovar → 2️⃣ monte um <b>Disparo</b> (escolhe o template, o público e a equipe que atende) → 3️⃣ quem responder aparece em <b>Conversas</b> pra fechar a venda.
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            ["disparos", "Disparos", Send],
            ["conversas", "Conversas", MessageSquare],
            ["templates", "Templates", FileText],
            ["gastos", "Gastos", DollarSign],
          ] as [Tab, string, any][]).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${tab === k ? "bg-green-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "disparos" && <Disparos />}
        {tab === "conversas" && <Conversas />}
        {tab === "templates" && <Templates />}
        {tab === "gastos" && <Gastos />}
      </div>
    </div>
  );
}

// ─────────────────────────────── EXPORTAR LEADS (SP) ───────────────────────────────
// Baixa leads do SP (MCMV) em CSV nome,telefone(55) — filtrável por região/campanha.
// Usa o endpoint export-leads-csv (projeto SP), protegido por token.
function ExportLeads() {
  const [regiao, setRegiao] = useState("");
  const [campanha, setCampanha] = useState("");
  const BASE = "https://vaghxnypfphhxiobnhpk.supabase.co/functions/v1/export-leads-csv";
  const TOKEN = "cury-sp-leads-2026-x7k9";
  function baixar() {
    const p = new URLSearchParams({ token: TOKEN });
    if (regiao.trim()) p.set("regiao", regiao.trim());
    if (campanha.trim()) p.set("campanha", campanha.trim());
    window.open(`${BASE}?${p.toString()}`, "_blank");
  }
  return (
    <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
      <h3 className="font-bold mb-1 flex items-center gap-2"><Download className="w-4 h-4 text-green-400" /> Exportar leads (SP · MCMV) — CSV nome,telefone</h3>
      <p className="text-xs text-slate-400 mb-3">Baixa os leads em CSV (telefone já com 55). Em branco = <b>todos</b>; ou filtre por região e/ou campanha. Região usa <code className="bg-slate-800 px-1 rounded">_</code> no lugar de espaço (ex: <code className="bg-slate-800 px-1 rounded">ZONA_SUL</code>, <code className="bg-slate-800 px-1 rounded">AGUA_BRANCA</code>).</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Região (opcional) — ex: LEOPOLDINA" value={regiao} onChange={(e) => setRegiao(e.target.value)} />
        <Input placeholder="Campanha (opcional) — ex: EQ_DATTI_ZS" value={campanha} onChange={(e) => setCampanha(e.target.value)} />
        <Button onClick={baixar} className="bg-green-600 hover:bg-green-500 shrink-0"><Download className="w-4 h-4 mr-1" /> Baixar CSV</Button>
      </div>
      <div className="flex gap-3 mt-2 text-[11px]">
        <a className="text-green-400 hover:underline" href={`${BASE}?token=${TOKEN}&list=regioes`} target="_blank" rel="noreferrer">ver regiões disponíveis</a>
        <a className="text-green-400 hover:underline" href={`${BASE}?token=${TOKEN}&list=campanhas`} target="_blank" rel="noreferrer">ver campanhas</a>
      </div>
    </div>
  );
}

// ─────────────────────────────── DISPAROS ───────────────────────────────
function Disparos() {
  const [camps, setCamps] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ name: "", template_id: "", audience_source: "novos", dias: 7, tag: "", target_queue_id: "", ai_autoreply: false, throttle_per_min: 10, csv: "", scheduled_at: "", region: "SJC" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [c, t, q] = await Promise.all([
      supabase.from("whatsapp_campaigns").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("whatsapp_templates").select("id,name,category,meta_status,body_text,variables").order("created_at", { ascending: false }),
      supabase.from("distribution_queues").select("id,name").eq("is_active", true),
    ]);
    setCamps(c.data || []); setTemplates(t.data || []); setQueues(q.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function criar() {
    if (!form.name || !form.template_id) { toast.error("Nome e template são obrigatórios"); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const filter: any = {};
    if (["novos", "parados", "esfriando"].includes(form.audience_source)) filter.dias = Number(form.dias) || 7;
    if (form.audience_source === "prospeccao" && form.tag) filter.tag = form.tag;
    const { data: camp, error } = await supabase.from("whatsapp_campaigns").insert({
      name: form.name, template_id: form.template_id, audience_source: form.audience_source,
      audience_filter: filter, target_queue_id: form.target_queue_id || null,
      region: form.region || "SJC",
      ai_autoreply: form.ai_autoreply, throttle_per_min: Number(form.throttle_per_min) || 10,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: "draft", created_by: u?.user?.id || null,
    }).select("id").single();
    if (error) { toast.error("Falha: " + error.message); setBusy(false); return; }
    // CSV/lista: insere os números (com nome) como alvos
    if (form.audience_source === "csv" && form.csv.trim()) {
      const rows = parseLeads(form.csv).map((r) => ({ campaign_id: camp.id, phone: r.phone, name: r.name, status: "pending" }));
      if (rows.length) { await supabase.from("whatsapp_campaign_targets").insert(rows); await supabase.from("whatsapp_campaigns").update({ audience_count: rows.length }).eq("id", camp.id); }
    }
    toast.success("Disparo criado (rascunho)");
    setForm({ ...form, name: "", csv: "" });
    setBusy(false); load();
  }

  async function cancelar(c: any) {
    if (!confirm(`Cancelar o disparo "${c.name}"? Ele NÃO vai sair.`)) return;
    await supabase.from("whatsapp_campaigns").update({ status: "canceled" }).eq("id", c.id);
    toast.success("Disparo cancelado"); load();
  }

  function handleFile(e: any) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev: any) => ({ ...prev, csv: String(reader.result || "") }));
    reader.readAsText(f);
  }

  async function disparar(camp: any) {
    const agendado = camp.scheduled_at && new Date(camp.scheduled_at) > new Date();
    const quando = agendado ? `agendado para ${new Date(camp.scheduled_at).toLocaleString("pt-BR")}` : "sai agora";
    if (!confirm(`Aprovar "${camp.name}"? (${quando}). O sistema envia o template pra todo o público, com throttle.`)) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("whatsapp_campaigns").update({ status: "sending", approved_by: u?.user?.id || null, approved_at: new Date().toISOString() }).eq("id", camp.id);
    toast.success(agendado ? "Aprovado e AGENDADO ✅" : "Disparo aprovado — começa a sair nos próximos minutos");
    load();
  }

  const tplApproved = templates.filter((t) => t.meta_status === "APPROVED");

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="md:col-span-2"><ExportLeads /></div>
      {/* Compositor / novo disparo */}
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <h3 className="font-bold mb-1 flex items-center gap-2"><Plus className="w-4 h-4" /> Novo disparo</h3>
        <p className="text-xs text-slate-400 mb-3">Escolha um <b>template aprovado</b>, o <b>público</b> (quem recebe) e a <b>fila</b> (equipe que atende quem responder). Cria como rascunho — só sai depois que você clicar <b>Aprovar &amp; disparar</b>.</p>
        <div className="space-y-3">
          <Input placeholder="Nome do disparo (só pra você se organizar)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="text-xs text-slate-400">Template aprovado</label>
            <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
              <SelectTrigger><SelectValue placeholder={tplApproved.length ? "Escolha o template" : "Nenhum aprovado ainda (aba Templates)"} /></SelectTrigger>
              <SelectContent style={WA_DARK}>{tplApproved.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.category}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Público</label>
            <Select value={form.audience_source} onValueChange={(v) => setForm({ ...form, audience_source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent style={WA_DARK}>{AUDIENCE.map((a) => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {["novos", "parados", "esfriando"].includes(form.audience_source) && (
            <Input type="number" placeholder="Quantos dias" value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} />
          )}
          {form.audience_source === "prospeccao" && (
            <Input placeholder="Tag/região (opcional)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
          )}
          {form.audience_source === "csv" && (
            <div className="space-y-2 bg-slate-800/40 rounded-lg p-2">
              <label className="text-xs text-slate-300 font-semibold">Lista de números</label>
              <input type="file" accept=".csv,.txt" onChange={handleFile}
                className="block text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white" />
              <p className="text-[11px] text-slate-500">Modelo: 1 linha por lead — <code className="bg-slate-700 px-1 rounded">Nome,Telefone</code> (ou só o telefone). Ex: <code className="bg-slate-700 px-1 rounded">João,11999998888</code>. Sem 55/DDD a gente completa o que dá.</p>
              <Textarea placeholder="…ou cole aqui (Nome,Telefone ou só o número — 1 por linha)" rows={4} value={form.csv} onChange={(e) => setForm({ ...form, csv: e.target.value })} />
              {form.csv.trim() && <p className="text-[11px] text-green-400">{parseLeads(form.csv).length} contatos válidos detectados</p>}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400">Enviar por qual número</label>
            <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha o número" /></SelectTrigger>
              <SelectContent style={WA_DARK}>
                <SelectItem value="SJC">SJC — Consórcio (+55 11 91339-0468)</SelectItem>
                <SelectItem value="SP">SP — Ana / MCMV (+55 11 95502-0447)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 mt-1">SP usa a <b>Ana</b> (motor MCMV). SJC usa o consórcio.</p>
          </div>
          <div>
            <label className="text-xs text-slate-400">Fila que recebe os interessados</label>
            <Select value={form.target_queue_id} onValueChange={(v) => setForm({ ...form, target_queue_id: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha a fila" /></SelectTrigger>
              <SelectContent style={WA_DARK}>{queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
            <span className="text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-purple-400" /> IA responde sozinha</span>
            <Switch checked={form.ai_autoreply} onCheckedChange={(v) => setForm({ ...form, ai_autoreply: v })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Ritmo:</span>
            <Input type="number" className="w-20" value={form.throttle_per_min} onChange={(e) => setForm({ ...form, throttle_per_min: e.target.value })} />
            <span className="text-xs text-slate-400">msgs/min</span>
          </div>
          <div>
            <label className="text-xs text-slate-400">Agendar para (opcional) — vazio = dispara na hora que aprovar</label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          {(() => {
            const selTpl = templates.find((t) => t.id === form.template_id);
            const count = form.audience_source === "csv" ? parseLeads(form.csv).length : null;
            const usd = count != null ? count * WA_RATE_USD : null;
            return (
              <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
                <div className="text-xs text-slate-400 font-semibold">Prévia da mensagem</div>
                {selTpl ? (
                  <div className="text-sm bg-slate-900 rounded-lg p-2 border border-slate-700 whitespace-pre-wrap">{String(selTpl.body_text || "").replace(/\{\{1\}\}/g, "[nome]")}</div>
                ) : <div className="text-xs text-slate-500">Escolha um template pra ver a prévia.</div>}
                <div className="text-xs text-slate-300">
                  💰 Custo estimado: {count != null
                    ? <span><b>{count}</b> × ~US$ {WA_RATE_USD.toFixed(3)} = <b>~US$ {usd!.toFixed(2)}</b> (~R$ {(usd! * USD_BRL).toFixed(0)})</span>
                    : <span>depende do público (~US$ {WA_RATE_USD.toFixed(3)}/contato)</span>}
                </div>
                <div className="text-[10px] text-slate-500">Marketing é pago; respostas dentro de 24h são grátis. Cobrança em USD.</div>
              </div>
            );
          })()}
          <Button onClick={criar} disabled={busy} className="w-full bg-green-600 hover:bg-green-500">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar disparo (rascunho)"}
          </Button>
        </div>
      </div>

      {/* Lista de disparos */}
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Disparos</h3>
          <button onClick={load}><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {camps.length === 0 && <p className="text-sm text-slate-500">Nenhum disparo ainda.</p>}
            {camps.map((c) => (
              <div key={c.id} className="bg-slate-800/60 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{c.name}</span>
                  <Badge className={statusColor[c.status] || "bg-slate-600"}>{c.status}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  público: {c.audience_source} · {c.audience_count || 0} contatos {c.ai_autoreply && "· 🤖 IA"}
                </div>
                {c.scheduled_at && new Date(c.scheduled_at) > new Date() && (
                  <div className="text-xs text-amber-400 mt-1">🕒 agendado: {new Date(c.scheduled_at).toLocaleString("pt-BR")}</div>
                )}
                <div className="text-xs text-slate-300 mt-1 flex flex-wrap gap-x-3">
                  <span>✅ {c.sent_count}</span><span>📬 {c.delivered_count}</span><span>👁️ {c.read_count}</span>
                  <span>💬 {c.reply_count}</span><span>⚠️ {c.failed_count}</span>
                </div>
                <div className="text-xs mt-1 flex flex-wrap gap-x-3 items-center">
                  <span className="text-green-400 font-bold">🔥 {c.interessados_count || 0} apertaram 1</span>
                  <span className="text-red-400 font-bold">🚫 {c.optout_count || 0} apertaram 2</span>
                  {Number(c.cost_total) > 0 && <span className="text-amber-400">💰 R$ {Number(c.cost_total).toFixed(2)}</span>}
                </div>
                <div className="flex gap-2 mt-2">
                  {c.status === "draft" && (
                    <Button size="sm" onClick={() => disparar(c)} className="bg-blue-600 hover:bg-blue-500 h-7 text-xs">
                      <Rocket className="w-3 h-3 mr-1" /> {c.scheduled_at ? "Aprovar & agendar" : "Aprovar & disparar"}
                    </Button>
                  )}
                  {(c.status === "draft" || (c.status === "sending" && (c.sent_count || 0) === 0 && c.scheduled_at && new Date(c.scheduled_at) > new Date())) && (
                    <Button size="sm" variant="ghost" onClick={() => cancelar(c)} className="h-7 text-xs text-red-400 hover:text-red-300">
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── CONVERSAS (inbox) ───────────────────────────────
function Conversas() {
  const [threads, setThreads] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // O disparador vive TODO no SJC. A tela le/escreve via edge wa-inbox (valida o usuario logado de qualquer empresa),
  // por isso as conversas de SP aparecem no admin de qualquer ambiente.
  async function waInbox(action: string, extra: any = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/wa-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SJC_ANON, "Authorization": "Bearer " + SJC_ANON },
      body: JSON.stringify({ action, user_token: session?.access_token, ...extra }),
    });
    return r.json().catch(() => ({}));
  }
  async function loadThreads() {
    const j = await waInbox("threads");
    setThreads(j.threads || []);
  }
  async function openThread(t: any) {
    setSel(t);
    const j = await waInbox("messages", { thread_id: t.id });
    setMsgs(j.messages || []);
    if ((t.unread || 0) > 0) { await waInbox("read", { thread_id: t.id }); loadThreads(); }
    setTimeout(() => endRef.current?.scrollIntoView(), 100);
  }
  async function enviar() {
    if (!reply.trim() || !sel) return;
    setBusy(true);
    const j = await waInbox("send", { to: sel.phone, text: reply });
    const err = j?.result?.error || j?.error;
    if (err) { toast.error(err?.hint || err?.message || "Falha (janela 24h fechada?)"); setBusy(false); return; }
    setReply(""); await openThread(sel); setBusy(false);
  }
  useEffect(() => { loadThreads(); }, []);
  const windowOpen = sel?.window_open_until && new Date(sel.window_open_until) > new Date();
  const [filtro, setFiltro] = useState("all");
  const origem = (t: any) => t.region === "SP" ? { label: "🟢 SP", cls: "bg-green-900 text-green-300" } : t.region === "SJC_MCMV" ? { label: "🏠 SJC", cls: "bg-blue-900 text-blue-300" } : { label: "💰 Consórcio", cls: "bg-amber-900 text-amber-300" };
  const matchF = (t: any) => filtro === "all" ? true : filtro === "sp" ? t.region === "SP" : filtro === "sjc" ? t.region === "SJC_MCMV" : filtro === "cons" ? (t.region === "SJC" || !t.region) : true;
  const filtered = threads.filter(matchF);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 max-h-[75vh] overflow-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="font-bold text-sm">Conversas</span>
          <button onClick={loadThreads}><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex gap-1 mb-2 flex-wrap">
          {([["all","Todos"],["sp","🟢 SP"],["sjc","🏠 SJC"],["cons","💰 Consórcio"]] as [string,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${filtro===k ? "bg-green-600 text-white" : "bg-slate-800 text-slate-300"}`}>{l}</button>
          ))}
        </div>
        {filtered.length === 0 && <p className="text-xs text-slate-500 p-2">Nenhuma conversa aqui.</p>}
        {filtered.map((t) => { const o = origem(t); return (
          <button key={t.id} onClick={() => openThread(t)}
            className={`w-full text-left px-3 py-2 rounded-lg mb-1 ${sel?.id === t.id ? "bg-slate-700" : "hover:bg-slate-800"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold truncate">{t.contact_name || t.phone}</span>
              {(t.unread || 0) > 0 && <span className="bg-green-500 text-black text-[10px] rounded-full px-1.5">{t.unread}</span>}
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className={`text-[9px] px-1 rounded ${o.cls}`}>{o.label}</span>
              {t.sdr_stage && <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-300">{t.sdr_stage}</span>}
              {t.sdr_qualified_at && <span className="text-[9px] px-1 rounded bg-green-600 text-black font-bold">✓ {t.handoff_to || "qualificado"}</span>}
            </div>
            <span className="text-[10px] text-slate-500">{t.phone}</span>
          </button>
        ); })}
      </div>

      <div className="md:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col max-h-[75vh]">
        {!sel ? <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Escolha uma conversa</div> : (
          <>
            <div className="p-3 border-b border-slate-800">
              <span className="font-bold">{sel.contact_name || sel.phone}</span>
              <span className="text-xs text-slate-400 ml-2">{windowOpen ? "🟢 janela 24h aberta" : "🔴 fora das 24h (só template)"}</span>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "outbound" ? "bg-green-700" : "bg-slate-700"}`}>
                    {m.body || `[${m.msg_type}]`}
                    <div className="text-[10px] text-slate-300/70 mt-0.5">{m.status || ""}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="p-3 border-t border-slate-800 flex gap-2">
              <Input placeholder={windowOpen ? "Responder…" : "Fora das 24h — só template"} value={reply}
                onChange={(e) => setReply(e.target.value)} disabled={!windowOpen}
                onKeyDown={(e) => e.key === "Enter" && enviar()} />
              <Button onClick={enviar} disabled={busy || !windowOpen || !reply.trim()} className="bg-green-600">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── TEMPLATES ───────────────────────────────
function Templates() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: "", category: "UTILITY", body_text: "", footer_text: "", header_image_url: "" });
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function iaEscrever() {
    setAiBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-template", { body: { action: "suggest", category: form.category, brief } });
    if (error || !data?.ok) { toast.error(data?.error?.message || "IA não respondeu"); setAiBusy(false); return; }
    setForm((f: any) => ({ ...f, body_text: data.text })); toast.success("IA escreveu — revise e envie"); setAiBusy(false);
  }

  async function load() {
    const { data } = await supabase.from("whatsapp_templates").select("*").order("created_at", { ascending: false });
    setList(data || []);
  }
  async function refresh() {
    await supabase.functions.invoke("wa-template", { body: { action: "refresh" } });
    toast.success("Status atualizado da Meta"); load();
  }
  async function criar() {
    if (!form.name || !form.body_text) { toast.error("Nome e texto obrigatórios"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-template", { body: { action: "create", ...form } });
    if (error || data?.error) { toast.error(data?.error?.error_user_msg || data?.error?.message || "Falha ao criar"); setBusy(false); return; }
    toast.success("Template enviado pra Meta — status PENDING"); setForm({ name: "", category: "UTILITY", body_text: "", footer_text: "", header_image_url: "" }); setBrief("");
    setBusy(false); load();
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <h3 className="font-bold mb-1 flex items-center gap-2"><Plus className="w-4 h-4" /> Novo template</h3>
        <p className="text-xs text-slate-400 mb-3">
          <b className="text-slate-200">Template</b> é a mensagem que a Meta precisa <b>aprovar</b> antes de você mandar pra quem <b>ainda não te respondeu</b>. Escreva algo <b>curto e educado</b>. Coloque <code className="text-green-400 bg-slate-800 px-1 rounded">{"{{1}}"}</code> onde entra o <b>nome</b> da pessoa.
        </p>
        <div className="space-y-3">
          {/* IA escreve o texto */}
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-lg p-2.5 space-y-2">
            <div className="text-xs text-purple-300 font-semibold flex items-center gap-1"><Bot className="w-3.5 h-3.5" /> Deixa a IA escrever (texto de fácil aprovação)</div>
            <Textarea rows={2} placeholder="Diga o objetivo em 1 linha. Ex: retomar contato com quem parou de responder e chamar pra visita" value={brief} onChange={(e) => setBrief(e.target.value)} />
            <Button size="sm" onClick={iaEscrever} disabled={aiBusy} className="w-full bg-purple-600 hover:bg-purple-500">
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "🤖 IA escrever pra mim"}
            </Button>
          </div>
          <button type="button" onClick={() => setForm({ name: "primeiro_contato", category: "UTILITY", body_text: "Ola {{1}}! Tudo bem? Vi que voce tem interesse em imoveis Minha Casa Minha Vida. Posso te enviar as opcoes disponiveis na sua regiao?", footer_text: "", header_image_url: "" })}
            className="text-xs text-green-400 hover:underline">✨ ou preencher com um exemplo pronto</button>
          <Input placeholder="nome_do_template (só minúsculo e _, ex: primeiro_contato)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="text-xs text-slate-400">Tipo de mensagem</label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent style={WA_DARK}>
                <SelectItem value="UTILITY">Utility — barato (aviso/retomada, sem oferta)</SelectItem>
                <SelectItem value="MARKETING">Marketing — oferta/promoção (mais caro)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea rows={4} placeholder="Texto da mensagem. Use {{1}} pro nome (ex: Olá {{1}}!)" value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} />
          <div>
            <label className="text-xs text-slate-400">Imagem do cabeçalho (opcional) — cole a URL de uma imagem</label>
            <Input placeholder="https://.../imagem.jpg" value={form.header_image_url} onChange={(e) => setForm({ ...form, header_image_url: e.target.value })} />
            {form.header_image_url ? <img src={form.header_image_url} alt="" className="mt-2 rounded-lg max-h-32 border border-slate-700" onError={(e: any) => { e.currentTarget.style.display = "none"; }} /> : null}
          </div>
          <Input placeholder="Rodapé (opcional)" value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
          <p className="text-[11px] text-slate-500">A Meta analisa e decide categoria/aprovação (minutos–48h). Com imagem pode demorar um pouco mais.</p>
          <Button onClick={criar} disabled={busy} className="w-full bg-green-600 hover:bg-green-500">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar pra aprovação"}
          </Button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Templates</h3>
          <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="w-4 h-4 mr-1" /> Atualizar</Button>
        </div>
        <div className="space-y-2 max-h-[70vh] overflow-auto">
          {list.map((t) => (
            <div key={t.id} className="bg-slate-800/60 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{t.name}</span>
                <Badge className={statusColor[t.meta_status] || "bg-slate-600"}>{t.meta_status}</Badge>
              </div>
              <div className="text-xs text-slate-400 mt-1">{t.category}</div>
              <div className="text-xs text-slate-300 mt-1 line-clamp-2">{t.body_text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── GASTOS ───────────────────────────────
function Gastos() {
  const [camps, setCamps] = useState<any[]>([]);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, m] = await Promise.all([
        supabase.from("whatsapp_campaigns").select("name,sent_count,delivered_count,read_count,reply_count,failed_count,cost_total,interessados_count,optout_count").order("created_at", { ascending: false }).limit(50),
        supabase.from("whatsapp_messages").select("pricing_category").eq("direction", "outbound").not("pricing_category", "is", null),
      ]);
      setCamps(c.data || []);
      const agg: Record<string, number> = {};
      (m.data || []).forEach((x: any) => { agg[x.pricing_category] = (agg[x.pricing_category] || 0) + 1; });
      setByCat(agg); setLoading(false);
    })();
  }, []);

  const totalSent = camps.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalReply = camps.reduce((s, c) => s + (c.reply_count || 0), 0);
  const totalInteressados = camps.reduce((s, c) => s + (c.interessados_count || 0), 0);
  const totalGasto = camps.reduce((s, c) => s + (Number(c.cost_total) || 0), 0);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Enviadas", totalSent, "text-blue-400"], ["🔥 Interessados (1)", totalInteressados, "text-green-400"],
          ["💰 Gasto ~R$", totalGasto.toFixed(2), "text-amber-400"],
          ["Msgs cobradas", Object.values(byCat).reduce((a, b) => a + b, 0), "text-purple-400"]].map(([l, v, c]: any) => (
          <div key={l} className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
            <div className={`text-2xl font-black ${c}`}>{v}</div>
            <div className="text-xs text-slate-400">{l}</div>
          </div>
        ))}
      </div>
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <h3 className="font-bold mb-2">Por categoria (custo real da Meta)</h3>
        {Object.keys(byCat).length === 0 ? <p className="text-sm text-slate-500">Sem dados ainda — aparece quando os disparos entregarem.</p> : (
          <div className="space-y-1">{Object.entries(byCat).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="text-slate-300">{v} msgs</span></div>
          ))}</div>
        )}
        <p className="text-[11px] text-slate-500 mt-3">Utility ≈ centavos · Marketing ≈ mais caro · Service (dentro de 24h) = grátis. O valor por msg vem do webhook da Meta.</p>
      </div>
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
        <h3 className="font-bold mb-2">Por disparo</h3>
        <div className="space-y-1">{camps.map((c, i) => (
          <div key={i} className="flex justify-between text-sm gap-2"><span className="truncate">{c.name}</span>
            <span className="text-slate-300 whitespace-nowrap">{c.sent_count} env · 🔥{c.interessados_count || 0} · 🚫{c.optout_count || 0} · R$ {(Number(c.cost_total) || 0).toFixed(2)}</span></div>
        ))}</div>
      </div>
    </div>
  );
}
