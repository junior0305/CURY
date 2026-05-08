// ColdPool — admin sobe CSV pra alimentar cold_contacts (pool de prospecção).
//
// Filtros (dedup em 6 níveis):
//   1. Phone formato inválido
//   2. Duplicado dentro do CSV
//   3. Já existe em cold_contacts (status available/claimed)
//   4. Já existe como lead ATIVO (não terminal)
//   5. Lead terminal não-recuperável (CONCLUDED, ABANDONED <90d, EXCLUDED com motivo
//      diferente de NO_CONTACT)
//   6. Telefone na phone_blocklist (opt-out global)

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
  XCircle, Snowflake, Users, Tag, Hash, Trash2,
} from "lucide-react";
import ColdPoolMetrics from "@/components/admin/ColdPoolMetrics";

interface ParsedRow {
  raw: Record<string, string>;
  name: string;
  phone: string;       // normalizado (5511...)
  email?: string | null;
  tag?: string | null;
  notes?: string | null;
  custom_fields: Record<string, any>;
}

interface RejectBucket {
  reason: string;
  rows: ParsedRow[];
  color: string;
}

const SLOT_COLORS = {
  ok:           "#10B981",
  invalid:      "#94A3B8",
  dup_csv:      "#A78BFA",
  in_pool:      "#06B6D4",
  active_lead:  "#F59E0B",
  terminal:     "#EF4444",
  blocked:      "#475569",
};

// Normaliza telefone BR → 55DDDNNNNNNNNN (sem +). Aceita varios formatos.
function normalizePhone(raw: string): { phone: string | null; reason?: string } {
  if (!raw) return { phone: null, reason: "vazio" };
  const cleaned = String(raw).replace(/[^0-9+]/g, "");
  const digits = cleaned.replace(/^\+/, "");
  if (!digits) return { phone: null, reason: "sem dígitos" };
  // 11 dígitos com DDD válido (sem 55) → adiciona 55
  if (/^[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: "55" + digits };
  // Já tem 55 + DDD
  if (/^55[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: digits };
  // Outros formatos com país (10-15 dígitos)
  if (/^[0-9]{12,15}$/.test(digits)) return { phone: digits };
  return { phone: null, reason: `formato inválido (${digits.length}d)` };
}

// Parser de CSV simples — aceita vírgula, ponto-e-vírgula ou tab. Aspas em campos.
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detecta separador pela primeira linha (escolhe o que aparece mais)
  const first = lines[0];
  const seps = [",", ";", "\t"];
  const sep = seps.reduce((best, s) =>
    (first.split(s).length > first.split(best).length ? s : best), seps[0]);

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        result.push(cur);
        cur = "";
      } else cur += ch;
    }
    result.push(cur);
    return result.map((s) => s.trim());
  }

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

// Resolve aliases comuns (nome/name, telefone/phone, etc)
function pickField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export default function ColdPool() {
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [selectedManager, setSelectedManager] = useState<string>("none"); // "none" = pool geral
  const [defaultTag, setDefaultTag] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<null | {
    inserted: number;
    buckets: RejectBucket[];
  }>(null);
  const [batches, setBatches] = useState<{ batch_id: string; count: number; first_at: string; tag: string | null }[]>([]);

  useEffect(() => { loadManagers(); loadBatches(); }, []);

  async function loadManagers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("role", ["MANAGER","SUPERINTENDENT"])
      .order("first_name");
    setManagers((data || []).map((m: any) => ({
      id: m.id,
      name: [m.first_name, m.last_name].filter(Boolean).join(" ") || "(sem nome)",
    })));
  }

  async function loadBatches() {
    const { data } = await supabase
      .from("cold_contacts")
      .select("batch_id, tag, created_at")
      .not("batch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const byBatch = new Map<string, { count: number; first_at: string; tag: string | null }>();
    for (const r of (data as any[]) || []) {
      const b = r.batch_id;
      if (!byBatch.has(b)) byBatch.set(b, { count: 0, first_at: r.created_at, tag: r.tag });
      byBatch.get(b)!.count += 1;
    }
    setBatches(Array.from(byBatch.entries())
      .map(([batch_id, v]) => ({ batch_id, ...v }))
      .sort((a, b) => b.first_at.localeCompare(a.first_at))
      .slice(0, 10));
  }

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setParsed(null);
    const text = await f.text();
    const { rows } = parseCSV(text);
    if (rows.length === 0) {
      toast.error("CSV vazio ou inválido");
      return;
    }
    const list: ParsedRow[] = [];
    for (const row of rows) {
      const name  = pickField(row, "name", "nome", "lead", "contato");
      const phone = pickField(row, "phone", "telefone", "celular", "whatsapp", "fone", "tel");
      const email = pickField(row, "email", "e-mail");
      const tag   = pickField(row, "tag", "região", "regiao", "area", "bairro", "campanha");
      const notes = pickField(row, "notes", "observações", "observacoes", "obs");
      const renda   = pickField(row, "renda", "renda_declarada");
      const tipo    = pickField(row, "tipo_trabalho", "trabalho", "ocupacao");
      const product = pickField(row, "product", "produto", "empreendimento");

      const norm = normalizePhone(phone);
      const custom: Record<string, any> = {};
      if (renda)   custom.renda = renda;
      if (tipo)    custom.tipo_trabalho = tipo;
      if (product) custom.product = product;
      // Inclui qualquer outro campo "extra" do CSV em custom_fields
      for (const [k, v] of Object.entries(row)) {
        if (!v) continue;
        if (["name","nome","phone","telefone","celular","whatsapp","fone","tel","email","e-mail","tag","região","regiao","area","bairro","campanha","notes","observações","observacoes","obs","renda","renda_declarada","tipo_trabalho","trabalho","ocupacao","product","produto","empreendimento"].includes(k)) continue;
        custom[k] = v;
      }
      list.push({
        raw: row,
        name: name || "Sem nome",
        phone: norm.phone || phone,
        email: email || null,
        tag: tag || defaultTag || null,
        notes: notes || null,
        custom_fields: custom,
      });
    }
    setParsed(list);
    toast.success(`${list.length} linhas lidas — confira e processe`);
  }

  async function processUpload() {
    if (!parsed || parsed.length === 0) return;
    setProcessing(true);

    // Re-aplica defaultTag se foi ajustado depois do parse
    const enriched = parsed.map((r) => ({
      ...r,
      tag: r.tag || defaultTag || null,
    }));

    // ── Buckets ────────────────────────────────────────────────
    const invalid: ParsedRow[] = [];
    const dupCsv:  ParsedRow[] = [];
    const inPool:  ParsedRow[] = [];
    const active:  ParsedRow[] = [];
    const terminal:ParsedRow[] = [];
    const blocked: ParsedRow[] = [];
    const accepted:ParsedRow[] = [];

    // 1+2: invalid + dup CSV
    const seenPhones = new Set<string>();
    const candidates: ParsedRow[] = [];
    for (const r of enriched) {
      const norm = normalizePhone(r.phone);
      if (!norm.phone) { invalid.push(r); continue; }
      if (seenPhones.has(norm.phone)) { dupCsv.push(r); continue; }
      seenPhones.add(norm.phone);
      candidates.push({ ...r, phone: norm.phone });
    }

    if (candidates.length === 0) {
      finishWithResult(0, invalid, dupCsv, [], [], [], []);
      return;
    }

    const phones = candidates.map((c) => c.phone);

    // 3: já em cold_contacts (available/claimed/promoted)
    const phonesInPoolSet = new Set<string>();
    {
      const { data } = await supabase
        .from("cold_contacts")
        .select("phone")
        .in("phone", phones)
        .in("status", ["available","claimed","promoted"]);
      (data as any[] || []).forEach((row) => phonesInPoolSet.add(row.phone));
    }

    // 4+5: leads existentes
    const leadByPhone = new Map<string, { status: string; exclusion_reason: string | null; lost_reason: string | null; last_interaction_at: string | null }>();
    {
      const { data } = await supabase
        .from("leads")
        .select("phone, status, exclusion_reason, lost_reason, last_interaction_at")
        .in("phone", phones)
        .order("created_at", { ascending: false });
      (data as any[] || []).forEach((row) => {
        if (!leadByPhone.has(row.phone)) leadByPhone.set(row.phone, row);
      });
    }

    // 6: phone_blocklist
    const phonesBlocked = new Set<string>();
    {
      const { data } = await supabase
        .from("phone_blocklist")
        .select("phone")
        .in("phone", phones);
      (data as any[] || []).forEach((row) => phonesBlocked.add(row.phone));
    }

    const ACTIVE_STATUSES = ["NEW","IN_PROGRESS","NEGOTIATING","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED","REACTIVATED","FOLLOW_UP_AUTO"];
    const NINETY_DAYS_AGO = Date.now() - 90 * 24 * 3600 * 1000;

    for (const c of candidates) {
      if (phonesBlocked.has(c.phone))   { blocked.push(c); continue; }
      if (phonesInPoolSet.has(c.phone)) { inPool.push(c);  continue; }
      const lead = leadByPhone.get(c.phone);
      if (lead) {
        if (lead.status === "CONCLUDED")              { terminal.push(c); continue; }
        if (ACTIVE_STATUSES.includes(lead.status))    { active.push(c);   continue; }
        if (lead.status === "ABANDONED") {
          const lastTs = lead.last_interaction_at ? new Date(lead.last_interaction_at).getTime() : 0;
          if (lastTs > NINETY_DAYS_AGO)               { terminal.push(c); continue; }
          // ≥90d → reinsere
        }
        if (lead.status === "EXCLUDED") {
          if (lead.exclusion_reason !== "NO_CONTACT") { terminal.push(c); continue; }
          // NO_CONTACT → reinsere
        }
      }
      accepted.push(c);
    }

    // ── Insert em chunks de 200 ────────────────────────────────
    const batchId = crypto.randomUUID();
    let insertedCount = 0;
    if (accepted.length > 0) {
      const managerId = selectedManager === "none" ? null : selectedManager;
      const rows = accepted.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        tag: c.tag,
        notes: c.notes,
        custom_fields: c.custom_fields,
        manager_id: managerId,
        batch_id: batchId,
        status: "available",
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from("cold_contacts").insert(chunk);
        if (error) {
          toast.error(`Erro ao inserir: ${error.message}`);
          break;
        }
        insertedCount += chunk.length;
      }
    }

    finishWithResult(insertedCount, invalid, dupCsv, inPool, active, terminal, blocked);

    function finishWithResult(
      ok = 0,
      _invalid: ParsedRow[] = [],
      _dupCsv: ParsedRow[] = [],
      _inPool: ParsedRow[] = [],
      _active: ParsedRow[] = [],
      _terminal: ParsedRow[] = [],
      _blocked: ParsedRow[] = [],
    ) {
      setResult({
        inserted: ok,
        buckets: [
          { reason: "Telefone inválido",                 rows: _invalid,  color: SLOT_COLORS.invalid },
          { reason: "Duplicado dentro do CSV",           rows: _dupCsv,   color: SLOT_COLORS.dup_csv },
          { reason: "Já está no pool",                   rows: _inPool,   color: SLOT_COLORS.in_pool },
          { reason: "Já é lead ativo",                   rows: _active,   color: SLOT_COLORS.active_lead },
          { reason: "Lead terminal não recuperável",     rows: _terminal, color: SLOT_COLORS.terminal },
          { reason: "Telefone na blocklist (opt-out)",   rows: _blocked,  color: SLOT_COLORS.blocked },
        ],
      });
      setProcessing(false);
      if (ok > 0) toast.success(`✅ ${ok} contatos adicionados ao pool`);
      loadBatches();
    }
  }

  function reset() {
    setFile(null);
    setParsed(null);
    setResult(null);
  }

  // Visual ──────────────────────────────────────────────────────
  const previewRows = parsed?.slice(0, 5) || [];

  return (
    <div className="crm-themed min-h-screen p-6" style={{ background: "var(--crm-bg)", color: "var(--crm-text)" }}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.40)" }}>
            <Snowflake className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Pool de Prospecção</h1>
            <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>
              Sobe planilha de contatos frios. Brokers reivindicam manualmente no Modo Prospecção.
            </p>
          </div>
        </div>

        {/* Indicadores */}
        <ColdPoolMetrics />

        {/* Step 1: Upload + config */}
        {!parsed && !result && (
          <section className="rounded-2xl border p-5 space-y-4"
                   style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                       style={{ color: "var(--crm-text-muted)" }}>
                  <Users className="w-3 h-3" /> Manager
                </label>
                <select
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ border: "1px solid var(--crm-border)", color: "var(--crm-text)" }}
                >
                  <option value="none">Pool geral (todos os brokers)</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                       style={{ color: "var(--crm-text-muted)" }}>
                  <Tag className="w-3 h-3" /> Tag default (opcional)
                </label>
                <input
                  type="text"
                  value={defaultTag}
                  onChange={(e) => setDefaultTag(e.target.value)}
                  placeholder="ex: JAGUARE, BARRA_FUNDA…"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ border: "1px solid var(--crm-border)", color: "var(--crm-text)" }}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--crm-text-muted)" }}>
                  Aplicada se a linha do CSV não tiver coluna `tag`.
                </p>
              </div>
            </div>

            <div className="rounded-xl border-2 border-dashed p-8 text-center"
                 style={{ borderColor: "var(--crm-border-mid)" }}>
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3" style={{ color: "#06B6D4" }} />
              <p className="text-sm font-bold mb-1">Selecione o CSV</p>
              <p className="text-[11px] mb-4" style={{ color: "var(--crm-text-muted)" }}>
                Colunas esperadas: <code>name, phone</code> (obrigatórias) +
                <code className="ml-1">email, tag, renda, tipo_trabalho, notes</code> (opcionais).
                Aceita vírgula, ponto-e-vírgula ou tab. Aliases comuns: nome, telefone, celular.
              </p>
              <input
                id="csv-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <label
                htmlFor="csv-input"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider cursor-pointer transition"
                style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.40)", color: "#06B6D4" }}
              >
                <Upload className="w-3.5 h-3.5" /> Selecionar arquivo
              </label>
            </div>
          </section>
        )}

        {/* Step 2: Preview + processar */}
        {parsed && !result && (
          <section className="rounded-2xl border p-5 space-y-4"
                   style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold">{file?.name}</p>
                <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>
                  {parsed.length} linhas lidas · destino:
                  <span className="font-bold ml-1" style={{ color: "var(--crm-text)" }}>
                    {selectedManager === "none" ? "Pool geral" : managers.find(m => m.id === selectedManager)?.name || "—"}
                  </span>
                  {defaultTag && <> · tag default: <span className="font-bold" style={{ color: "var(--crm-text)" }}>{defaultTag}</span></>}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={reset}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition"
                        style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)", color: "var(--crm-text-muted)" }}>
                  Cancelar
                </button>
                <button onClick={processUpload} disabled={processing}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition"
                        style={{ background: "linear-gradient(135deg, #06B6D4, #0EA5E9)", color: "white", opacity: processing ? 0.6 : 1 }}>
                  {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Processar
                </button>
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--crm-border)" }}>
              <table className="w-full text-xs">
                <thead style={{ background: "var(--crm-glass)" }}>
                  <tr>
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ color: "var(--crm-text-muted)" }}>Nome</th>
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ color: "var(--crm-text-muted)" }}>Telefone</th>
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ color: "var(--crm-text-muted)" }}>Tag</th>
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ color: "var(--crm-text-muted)" }}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--crm-border)" }}>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px]">{r.phone}</td>
                      <td className="px-3 py-1.5">{r.tag || "—"}</td>
                      <td className="px-3 py-1.5">{r.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <p className="text-[11px] text-center py-2" style={{ background: "var(--crm-glass)", color: "var(--crm-text-muted)" }}>
                  + {parsed.length - 5} linhas (preview das 5 primeiras)
                </p>
              )}
            </div>
          </section>
        )}

        {/* Step 3: Resultado */}
        {result && (
          <section className="rounded-2xl border overflow-hidden"
                   style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
            <div className="p-5 border-b flex items-center justify-between"
                 style={{ borderColor: "var(--crm-border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                     style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.40)" }}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-bold">{result.inserted} contatos adicionados</p>
                  <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>
                    {result.buckets.reduce((s, b) => s + b.rows.length, 0)} pulados (veja motivos abaixo)
                  </p>
                </div>
              </div>
              <button onClick={reset}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                      style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.40)", color: "#06B6D4" }}>
                Subir outro CSV
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px" style={{ background: "var(--crm-border)" }}>
              <Stat label="Inseridos"    value={result.inserted} color={SLOT_COLORS.ok} icon={CheckCircle2} />
              {result.buckets.map((b, i) => (
                <Stat key={i} label={b.reason} value={b.rows.length} color={b.color}
                      icon={b.rows.length > 0 ? AlertTriangle : XCircle} />
              ))}
            </div>

            {/* Detalhe pulados — ver primeiros itens de cada bucket */}
            {result.buckets.some((b) => b.rows.length > 0) && (
              <details className="border-t p-4 text-xs" style={{ borderColor: "var(--crm-border)" }}>
                <summary className="cursor-pointer font-bold uppercase tracking-wider"
                         style={{ color: "var(--crm-text-muted)" }}>
                  Ver detalhes dos pulados
                </summary>
                <div className="mt-3 space-y-3">
                  {result.buckets.filter((b) => b.rows.length > 0).map((b, i) => (
                    <div key={i} className="rounded-lg p-2" style={{ background: "var(--crm-glass)" }}>
                      <p className="text-[11px] font-bold mb-1" style={{ color: b.color }}>
                        {b.reason} ({b.rows.length})
                      </p>
                      <ul className="space-y-0.5">
                        {b.rows.slice(0, 5).map((r, j) => (
                          <li key={j} style={{ color: "var(--crm-text-muted)" }}>
                            • {r.name} · {r.phone}
                          </li>
                        ))}
                        {b.rows.length > 5 && (
                          <li style={{ color: "var(--crm-text-muted)" }}>
                            … + {b.rows.length - 5} outros
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {/* Histórico de batches */}
        <section className="rounded-2xl border p-5"
                 style={{ background: "var(--crm-card-soft)", borderColor: "var(--crm-border)" }}>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
              style={{ color: "var(--crm-text-muted)" }}>
            <Hash className="w-3 h-3" /> Últimos batches enviados
          </h3>
          {batches.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>Nenhum batch ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {batches.map((b) => (
                <div key={b.batch_id} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg"
                     style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}>
                  <span className="font-mono text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
                    {b.batch_id.slice(0, 8)}
                  </span>
                  <span className="font-bold">{b.count} contatos</span>
                  {b.tag && <span className="px-1.5 py-0.5 rounded text-[10px]"
                                  style={{ background: "rgba(6,182,212,0.10)", color: "#06B6D4" }}>{b.tag}</span>}
                  <span className="ml-auto" style={{ color: "var(--crm-text-muted)" }}>
                    {new Date(b.first_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <div className="px-3 py-3" style={{ background: "var(--crm-bg)" }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold"
           style={{ color: "var(--crm-text-muted)" }}>
        <Icon className="w-3 h-3" style={{ color }} />
        {label}
      </div>
      <p className="text-2xl font-black tabular-nums mt-1" style={{ color }}>{value}</p>
    </div>
  );
}
