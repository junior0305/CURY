import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import {
  Home, FileText, DollarSign, UserPlus, Calendar, Clock,
  Plus, RefreshCw, LogOut, ChevronLeft, ChevronRight,
  Loader2, X, Search, Building2, Briefcase, Phone, Mail, IdCard,
  TrendingUp, Activity, History,
} from "lucide-react";

type Period = "week" | "month";

interface Summary {
  period_type: Period;
  period_start: string;
  period_end: string;
  totals: {
    visitas: number; pastas: number; vendas: number;
    vendas_valor_total: number; comissao_total: number;
    contratacoes: number; plantoes: number; plantoes_corretores_unicos: number;
  };
  per_broker: Array<{
    broker_id: string; broker_name: string; manager_name: string | null;
    visitas: number; pastas: number; vendas: number;
    vendas_valor: number; comissao: number; plantoes: number;
  }>;
  recent_actions: Array<{
    id: string; action_type: string; entity_type: string; entity_id: string;
    notes: string | null; created_at: string; actor_name: string | null;
  }>;
}

type ModalKind = "visita" | "pasta" | "venda" | "contratacao" | "plantao" | null;

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function periodLabel(s: Summary | null): string {
  if (!s) return "—";
  if (s.period_type === "month") {
    return new Date(s.period_start + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  const start = new Date(s.period_start + "T00:00:00");
  const end = new Date(s.period_end);
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${f(start)} → ${f(end)}`;
}

export default function Secretaria() {
  const { user, signOut } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const anchorIso = anchor.toISOString().substring(0, 10);
      const { data, error } = await supabase.rpc("get_secretary_summary", {
        p_period_type: period, p_anchor_date: anchorIso,
      });
      if (error) throw error;
      setSummary(data as Summary);
    } catch (e: any) {
      toast.error("Erro ao carregar: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [period, anchor]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  function shiftPeriod(direction: -1 | 1) {
    const d = new Date(anchor);
    if (period === "month") d.setMonth(d.getMonth() + direction);
    else d.setDate(d.getDate() + direction * 7);
    setAnchor(d);
  }

  const t = summary?.totals;

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Briefcase className="w-6 h-6 text-fuchsia-400" />
          <div>
            <h1 className="text-base font-black uppercase tracking-wider">Operações</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              Painel da secretária · {user?.first_name || ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period toggle */}
          <div className="flex bg-slate-900 rounded-lg p-1 border border-gray-700/50">
            <button onClick={() => setPeriod("week")}
              className={`px-3 py-1 text-xs font-medium rounded ${period === "week" ? "bg-fuchsia-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              Semana
            </button>
            <button onClick={() => setPeriod("month")}
              className={`px-3 py-1 text-xs font-medium rounded ${period === "month" ? "bg-fuchsia-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              Mês
            </button>
          </div>
          {/* Period nav */}
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-gray-700/50 px-1">
            <button onClick={() => shiftPeriod(-1)} className="p-1.5 hover:bg-slate-800 rounded text-gray-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-gray-200 px-2 min-w-[140px] text-center">{periodLabel(summary)}</span>
            <button onClick={() => shiftPeriod(1)} className="p-1.5 hover:bg-slate-800 rounded text-gray-300">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={loadSummary} disabled={loading} className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-gray-300 border border-gray-700/50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={signOut} className="p-2 bg-slate-900 hover:bg-red-900/40 rounded-lg text-gray-300 hover:text-red-200 border border-gray-700/50">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Stats cards */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Visitas"        value={fmtNum(t?.visitas)}         icon={Home}        color="amber" />
        <StatCard label="Pastas"         value={fmtNum(t?.pastas)}          icon={FileText}    color="blue" />
        <StatCard label="Vendas"         value={fmtNum(t?.vendas)}          icon={DollarSign}  color="emerald"
                  hint={t?.vendas_valor_total ? `${fmtMoney(t.vendas_valor_total)} • Comis: ${fmtMoney(t.comissao_total)}` : undefined} />
        <StatCard label="Contratações"   value={fmtNum(t?.contratacoes)}    icon={UserPlus}    color="cyan" />
        <StatCard label="Plantões"       value={fmtNum(t?.plantoes)}        icon={Calendar}    color="fuchsia"
                  hint={t?.plantoes_corretores_unicos ? `${t.plantoes_corretores_unicos} corretores únicos` : undefined} />
      </div>

      {/* Atalhos */}
      <div className="px-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">⚡ Atalhos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <ShortcutButton label="+ Visita" icon={Home}       color="amber"   onClick={() => setModal("visita")} />
          <ShortcutButton label="+ Pasta" icon={FileText}    color="blue"    onClick={() => setModal("pasta")} />
          <ShortcutButton label="+ Venda" icon={DollarSign}  color="emerald" onClick={() => setModal("venda")} />
          <ShortcutButton label="+ Contratação" icon={UserPlus} color="cyan" onClick={() => setModal("contratacao")} />
          <ShortcutButton label="+ Plantão" icon={Calendar}  color="fuchsia" onClick={() => setModal("plantao")} />
        </div>
      </div>

      {/* Per-broker breakdown */}
      <div className="p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">👥 Performance por corretor</h2>
        <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Corretor</th>
                  <th className="text-left px-3 py-2">Gerente</th>
                  <th className="text-right px-3 py-2">Visitas</th>
                  <th className="text-right px-3 py-2">Pastas</th>
                  <th className="text-right px-3 py-2">Vendas</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-right px-3 py-2">Comissão</th>
                  <th className="text-right px-3 py-2">Plantões</th>
                </tr>
              </thead>
              <tbody>
                {loading && (!summary || summary.per_broker.length === 0) && (
                  <tr><td colSpan={8} className="text-center text-gray-500 py-6">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando...
                  </td></tr>
                )}
                {!loading && summary && summary.per_broker.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-500 py-6">Sem atividade neste período</td></tr>
                )}
                {summary?.per_broker.map(b => (
                  <tr key={b.broker_id} className="border-t border-gray-700/40 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-gray-100 font-medium">{b.broker_name}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{b.manager_name || "—"}</td>
                    <td className="px-3 py-2 text-right text-amber-300">{b.visitas || "—"}</td>
                    <td className="px-3 py-2 text-right text-blue-300">{b.pastas || "—"}</td>
                    <td className="px-3 py-2 text-right text-emerald-300 font-bold">{b.vendas || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono text-xs">{fmtMoney(b.vendas_valor)}</td>
                    <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">{fmtMoney(b.comissao)}</td>
                    <td className="px-3 py-2 text-right text-fuchsia-300">{b.plantoes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Histórico de ações */}
      <div className="p-4 pb-12">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 inline-flex items-center gap-1.5">
          <History className="w-3 h-3" /> Histórico de ações no período
        </h2>
        <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl">
          {summary?.recent_actions.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">Nenhuma ação registrada</p>
          ) : (
            <ul className="divide-y divide-gray-800 max-h-[400px] overflow-y-auto">
              {summary?.recent_actions.map(a => (
                <li key={a.id} className="px-3 py-2 text-xs flex items-start gap-2">
                  <Activity className="w-3 h-3 text-fuchsia-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-gray-200">
                      <span className="font-bold">{a.action_type}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span className="text-gray-400">{a.entity_type}</span>
                      {a.notes && <span className="text-gray-500"> — {a.notes}</span>}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      {a.actor_name || "—"} · {fmtDateTime(a.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Modais */}
      {modal === "visita"      && <VisitaModal      onClose={() => setModal(null)} onSaved={() => { setModal(null); loadSummary(); }} />}
      {modal === "pasta"       && <PastaModal       onClose={() => setModal(null)} onSaved={() => { setModal(null); loadSummary(); }} />}
      {modal === "venda"       && <VendaModal       onClose={() => setModal(null)} onSaved={() => { setModal(null); loadSummary(); }} />}
      {modal === "contratacao" && <ContratacaoModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadSummary(); }} />}
      {modal === "plantao"     && <PlantaoModal     onClose={() => setModal(null)} onSaved={() => { setModal(null); loadSummary(); }} />}
    </div>
  );
}

// ─── Componentes ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, hint }: { label: string; value: string; icon: any; color: string; hint?: string }) {
  const map: Record<string, string> = {
    amber:   "from-amber-900/40 to-amber-900/10 border-amber-500/30 text-amber-200",
    blue:    "from-blue-900/40 to-blue-900/10 border-blue-500/30 text-blue-200",
    emerald: "from-emerald-900/40 to-emerald-900/10 border-emerald-500/30 text-emerald-200",
    cyan:    "from-cyan-900/40 to-cyan-900/10 border-cyan-500/30 text-cyan-200",
    fuchsia: "from-fuchsia-900/40 to-fuchsia-900/10 border-fuchsia-500/30 text-fuchsia-200",
  };
  return (
    <div className={`bg-gradient-to-br ${map[color]} border rounded-xl p-3`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-3xl font-black mt-1">{value}</div>
      {hint && <div className="text-[10px] opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}

function ShortcutButton({ label, icon: Icon, color, onClick }: { label: string; icon: any; color: string; onClick: () => void }) {
  const map: Record<string, string> = {
    amber:   "bg-amber-700/80 hover:bg-amber-600 border-amber-500/40",
    blue:    "bg-blue-700/80 hover:bg-blue-600 border-blue-500/40",
    emerald: "bg-emerald-700/80 hover:bg-emerald-600 border-emerald-500/40",
    cyan:    "bg-cyan-700/80 hover:bg-cyan-600 border-cyan-500/40",
    fuchsia: "bg-fuchsia-700/80 hover:bg-fuchsia-600 border-fuchsia-500/40",
  };
  return (
    <button onClick={onClick}
      className={`${map[color]} border text-white rounded-xl py-3 px-4 font-bold flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02]`}>
      <Icon className="w-5 h-5" /> {label}
    </button>
  );
}

// ─── Modais ──────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-950 border border-fuchsia-500/40 rounded-t-2xl md:rounded-2xl w-full md:max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-950 border-b border-gray-800 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full bg-slate-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 ${props.className || ""}`} />;
}

// Normaliza phone BR → 55DDDNNNN (sem +). Retorna null se inválido.
function normalizePhoneBR(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (/^[1-9][1-9][0-9]{8,9}$/.test(digits)) return "55" + digits;
  if (/^55[1-9][1-9][0-9]{8,9}$/.test(digits)) return digits;
  if (/^[0-9]{12,15}$/.test(digits)) return digits;
  return null;
}

// Lead picker — busca por nome/telefone, retorna lead selecionado.
// Se nada encontrado e busca parece phone, oferece cadastrar novo.
function LeadPicker({ value, onChange, placeholder = "Buscar lead por nome ou telefone..." }: { value: any; onChange: (l: any) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingName, setCreatingName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const qDigits = q.replace(/\D/g, "");
      let query = supabase.from("leads")
        .select("id, name, phone, status, broker_id, profiles:broker_id(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (qDigits.length >= 3) query = query.or(`name.ilike.%${q}%,phone.ilike.%${qDigits}%`);
      else query = query.ilike("name", `%${q}%`);
      const { data } = await query;
      setResults(data || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Detecta se a query parece um phone válido (>=10 dígitos)
  const qDigits = q.replace(/\D/g, "");
  const phoneNormalized = normalizePhoneBR(q);
  const looksLikePhone = qDigits.length >= 10 && phoneNormalized;

  async function handleCreate() {
    if (!creatingName.trim() || !phoneNormalized) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    setCreatingBusy(true);
    try {
      // Re-checa duplicidade pelo phone normalizado
      const { data: existing } = await supabase
        .from("leads")
        .select("id, name, phone, status, broker_id, profiles:broker_id(first_name, last_name)")
        .eq("phone", phoneNormalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        toast.warning(`Já existe lead com esse telefone: ${existing.name}`);
        onChange(existing);
        setShowCreate(false);
        setQ("");
        return;
      }
      const { data: newLead, error } = await supabase
        .from("leads")
        .insert({
          name: creatingName.trim(),
          phone: phoneNormalized,
          status: "NEW",
          source: "secretaria_manual",
          last_interaction_at: new Date().toISOString(),
        })
        .select("id, name, phone, status, broker_id, profiles:broker_id(first_name, last_name)")
        .single();
      if (error) throw error;
      toast.success(`✅ Lead "${newLead.name}" cadastrado`);
      onChange(newLead);
      setShowCreate(false);
      setCreatingName("");
      setQ("");
    } catch (e: any) {
      toast.error(`Erro: ${e.message || e}`);
    } finally {
      setCreatingBusy(false);
    }
  }

  if (value) {
    return (
      <div className="bg-fuchsia-950/30 border border-fuchsia-500/40 rounded-lg p-2 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-100 font-medium">{value.name}</div>
          <div className="text-[11px] text-gray-400">{value.phone} · {value.status} · {value.profiles?.first_name || "Sem corretor"}</div>
        </div>
        <button onClick={() => { onChange(null); setQ(""); }} className="text-xs text-gray-300 hover:text-white">Trocar</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" />
      {q.length >= 2 && !showCreate && (
        <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-gray-700 rounded-lg max-h-60 overflow-y-auto shadow-xl">
          {searching && <div className="p-2 text-center text-xs text-gray-500"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Buscando...</div>}
          {!searching && results.length === 0 && (
            <div className="p-2">
              <div className="text-center text-xs text-gray-500 mb-2">Nenhum lead encontrado</div>
              {looksLikePhone ? (
                <button
                  onClick={() => { setCreatingName(""); setShowCreate(true); }}
                  className="w-full px-3 py-2 rounded-md text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 transition"
                >
                  ➕ Cadastrar novo lead com {phoneNormalized}
                </button>
              ) : (
                <div className="text-[10px] text-gray-600 text-center">
                  Digite o telefone completo (com DDD) pra cadastrar manualmente
                </div>
              )}
            </div>
          )}
          {results.map(r => (
            <button key={r.id} onClick={() => { onChange(r); setQ(""); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b border-gray-800 last:border-0">
              <div className="text-sm text-gray-100">{r.name}</div>
              <div className="text-[11px] text-gray-500">{r.phone} · {r.status} · {r.profiles?.first_name || "Sem corretor"}</div>
            </button>
          ))}
        </div>
      )}

      {/* Form de cadastro inline */}
      {showCreate && (
        <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-emerald-500/40 rounded-lg shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Cadastrar lead</span>
            <button
              onClick={() => { setShowCreate(false); setCreatingName(""); }}
              className="text-[11px] text-gray-400 hover:text-white"
            >
              cancelar
            </button>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Telefone</label>
            <div className="text-sm font-mono text-gray-200 px-2 py-1.5 rounded bg-slate-800 border border-gray-700">
              {phoneNormalized || "—"}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Nome do lead</label>
            <Input
              autoFocus
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              placeholder="ex: Maria Silva"
              className="mt-1"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creatingBusy || !creatingName.trim() || !phoneNormalized}
            className="w-full px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40"
          >
            {creatingBusy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            Cadastrar e selecionar
          </button>
        </div>
      )}
    </div>
  );
}

// Broker picker
function BrokerPicker({ value, onChange }: { value: any; onChange: (b: any) => void }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("id, first_name, last_name, manager_id, manager:profiles!manager_id(first_name)")
      .eq("role", "BROKER").order("first_name").limit(200)
      .then(({ data }) => setList(data || []));
  }, []);
  return (
    <select value={value?.id || ""} onChange={(e) => onChange(list.find(b => b.id === e.target.value) || null)}
      className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200">
      <option value="">Selecione...</option>
      {list.map(b => (
        <option key={b.id} value={b.id}>
          {b.first_name} {b.last_name || ""} {b.manager ? `(${b.manager.first_name})` : ""}
        </option>
      ))}
    </select>
  );
}

// Manager picker
function ManagerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("profiles").select("id, first_name, last_name").eq("role", "MANAGER").order("first_name")
      .then(({ data }) => setList(data || []));
  }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200">
      <option value="">Selecione gerente...</option>
      {list.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name || ""}</option>)}
    </select>
  );
}

// ─── Modal: Visita ──────────────────────────────────────────────────────────

function VisitaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [data, setData] = useState<string>(new Date().toISOString().substring(0, 10));
  const [produto, setProduto] = useState<string>("");
  const [obs, setObs] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (lead?.product) setProduto(lead.product || ""); }, [lead]);

  async function save() {
    if (!lead) return toast.error("Selecione o lead");
    setSaving(true);
    try {
      const updates: any = { status: "VISIT_SCHEDULED", last_interaction_at: new Date(data + "T12:00:00").toISOString() };
      if (produto) updates.product = produto;
      const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (error) throw error;
      await supabase.rpc("log_audit", {
        p_action_type: "VISIT_SCHEDULED", p_entity_type: "lead", p_entity_id: lead.id,
        p_payload: { data, produto, obs },
        p_notes: `Visita ${lead.name} ${produto ? "· " + produto : ""} em ${data}${obs ? " · " + obs : ""}`,
      });
      toast.success("Visita registrada");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="🏠 Registrar Visita" onClose={onClose}>
      <Field label="Lead"><LeadPicker value={lead} onChange={setLead} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data da visita"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
        <Field label="Produto"><Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="ex: BACANA_ZS" /></Field>
      </div>
      <Field label="Observação (opcional)"><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Detalhes da visita..." /></Field>
      <SaveButton saving={saving} onClick={save} />
    </ModalShell>
  );
}

// ─── Modal: Pasta ────────────────────────────────────────────────────────────

function PastaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [data, setData] = useState<string>(new Date().toISOString().substring(0, 10));
  const [banco, setBanco] = useState<string>("Caixa");
  const [obs, setObs] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!lead) return toast.error("Selecione o lead");
    setSaving(true);
    try {
      const { error } = await supabase.from("leads").update({
        status: "DOCS_REQUESTED",
        last_interaction_at: new Date(data + "T12:00:00").toISOString(),
      }).eq("id", lead.id);
      if (error) throw error;
      await supabase.rpc("log_audit", {
        p_action_type: "DOCS_RECEIVED", p_entity_type: "lead", p_entity_id: lead.id,
        p_payload: { data, banco, obs },
        p_notes: `Pasta ${lead.name} · ${banco} em ${data}${obs ? " · " + obs : ""}`,
      });
      toast.success("Pasta registrada");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="📁 Registrar Pasta" onClose={onClose}>
      <Field label="Lead"><LeadPicker value={lead} onChange={setLead} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data envio docs"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
        <Field label="Banco">
          <select value={banco} onChange={(e) => setBanco(e.target.value)}
            className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200">
            <option>Caixa</option><option>BB</option><option>Itaú</option><option>Bradesco</option><option>Santander</option><option>Outro</option>
          </select>
        </Field>
      </div>
      <Field label="Observação"><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Pendências, etc." /></Field>
      <SaveButton saving={saving} onClick={save} />
    </ModalShell>
  );
}

// ─── Modal: Venda ────────────────────────────────────────────────────────────

function VendaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [pv, setPv] = useState<string>("");
  const [produto, setProduto] = useState<string>("");
  const [unidade, setUnidade] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [comissao, setComissao] = useState<string>("");
  const [data, setData] = useState<string>(new Date().toISOString().substring(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (lead?.product) setProduto(lead.product || ""); }, [lead]);

  async function save() {
    if (!lead) return toast.error("Selecione o lead");
    if (!valor) return toast.error("Informe o valor da venda");
    setSaving(true);
    try {
      const updates: any = {
        status: "CONCLUDED",
        last_interaction_at: new Date(data + "T12:00:00").toISOString(),
        pv_number: pv || null,
        unidade: unidade || null,
        sale_value: Number(valor.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) || null,
        commission_value: comissao ? Number(comissao.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) : null,
      };
      if (produto) updates.product = produto;
      const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (error) throw error;
      await supabase.rpc("log_audit", {
        p_action_type: "SALE_RECORDED", p_entity_type: "lead", p_entity_id: lead.id,
        p_payload: { pv, produto, unidade, valor: updates.sale_value, comissao: updates.commission_value, data },
        p_notes: `Venda ${lead.name} · PV ${pv || "—"} · ${unidade || ""} · ${fmtMoney(updates.sale_value)}`,
      });
      toast.success("Venda registrada");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  const corretor = lead?.profiles ? `${lead.profiles.first_name} ${lead.profiles.last_name || ""}`.trim() : null;

  return (
    <ModalShell title="💰 Registrar Venda" onClose={onClose}>
      <Field label="Lead"><LeadPicker value={lead} onChange={setLead} /></Field>
      {lead && (
        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/40 rounded p-2">
          <div><span className="text-gray-500">Corretor:</span> <strong className="text-gray-200">{corretor || "—"}</strong></div>
          <div><span className="text-gray-500">Status atual:</span> <strong className="text-gray-200">{lead.status}</strong></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número PV"><Input value={pv} onChange={(e) => setPv(e.target.value)} placeholder="ex: PV-2026-001234" /></Field>
        <Field label="Data assinatura"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Produto"><Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="ex: BACANA_ZS" /></Field>
        <Field label="Unidade"><Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="ex: Apto 1502 Bl B" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor da venda" hint="R$ — só números"><Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="280000" /></Field>
        <Field label="Comissão"><Input value={comissao} onChange={(e) => setComissao(e.target.value)} placeholder="8400" /></Field>
      </div>
      <SaveButton saving={saving} onClick={save} />
    </ModalShell>
  );
}

// ─── Modal: Contratação ─────────────────────────────────────────────────────

function ContratacaoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [managerId, setManagerId] = useState("");
  const [hiredAt, setHiredAt] = useState(new Date().toISOString().substring(0, 10));
  const [contractNumber, setContractNumber] = useState("");
  const [hasCreci, setHasCreci] = useState<boolean>(false);
  const [creci, setCreci] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!firstName || !email || !managerId) return toast.error("Nome, email e gerente são obrigatórios");
    setSaving(true);
    try {
      // Cria via edge function (ela cuida do user em auth.users)
      const { data: result, error } = await supabase.functions.invoke("create-user", {
        body: {
          first_name: firstName, last_name: lastName, email, phone,
          role: "BROKER", manager_id: managerId,
          hired_at: hiredAt, contract_number: contractNumber || null,
          has_creci: hasCreci, creci: hasCreci ? creci : null,
        },
      });
      if (error) throw error;
      const newId = result?.user_id || result?.id;
      if (newId) {
        // Garante que campos extras estão salvos (em caso da edge func não suportar)
        await supabase.from("profiles").update({
          hired_at: hiredAt, contract_number: contractNumber || null,
          has_creci: hasCreci, creci: hasCreci ? creci : null,
        }).eq("id", newId);
      }
      await supabase.rpc("log_audit", {
        p_action_type: "BROKER_HIRED", p_entity_type: "profile", p_entity_id: newId || null,
        p_payload: { first_name: firstName, email, manager_id: managerId, hired_at: hiredAt, contract_number: contractNumber, has_creci: hasCreci },
        p_notes: `Nova contratação: ${firstName} ${lastName} (${contractNumber || "sem nº"})`,
      });
      toast.success("Corretor contratado");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="👤 Nova Contratação" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primeiro nome"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="João" /></Field>
        <Field label="Sobrenome"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Silva" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@cury.com.br" /></Field>
        <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11988888888" /></Field>
      </div>
      <Field label="Gerente (delegado)" hint="Gerente direto deste corretor">
        <ManagerPicker value={managerId} onChange={setManagerId} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de início"><Input type="date" value={hiredAt} onChange={(e) => setHiredAt(e.target.value)} /></Field>
        <Field label="Nº de contratação"><Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="ex: 4521" /></Field>
      </div>
      <Field label="Tem CRECI?">
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-1 text-sm text-gray-200">
            <input type="radio" checked={hasCreci} onChange={() => setHasCreci(true)} /> Sim
          </label>
          <label className="inline-flex items-center gap-1 text-sm text-gray-200">
            <input type="radio" checked={!hasCreci} onChange={() => setHasCreci(false)} /> Não
          </label>
        </div>
      </Field>
      {hasCreci && (
        <Field label="Número CRECI"><Input value={creci} onChange={(e) => setCreci(e.target.value)} placeholder="ex: 12345-F" /></Field>
      )}
      <SaveButton saving={saving} onClick={save} />
    </ModalShell>
  );
}

// ─── Modal: Plantão ─────────────────────────────────────────────────────────

function PlantaoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [broker, setBroker] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [location, setLocation] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!broker) return toast.error("Selecione o corretor");
    setSaving(true);
    try {
      const { data: row, error } = await supabase.from("plantao_checkins").insert({
        broker_id: broker.id, plantao_date: date, location: location || null,
        check_in_at: checkIn ? new Date(date + "T" + checkIn).toISOString() : null,
        check_out_at: checkOut ? new Date(date + "T" + checkOut).toISOString() : null,
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;
      await supabase.rpc("log_audit", {
        p_action_type: "PLANTAO_CHECKIN", p_entity_type: "plantao", p_entity_id: row?.id || null,
        p_payload: { broker_id: broker.id, broker_name: broker.first_name, date, location, check_in: checkIn, check_out: checkOut },
        p_notes: `Check-in plantão · ${broker.first_name} ${broker.last_name || ""} · ${location || ""} · ${date}`,
      });
      toast.success("Plantão registrado");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="📅 Check-in Plantão" onClose={onClose}>
      <Field label="Corretor"><BrokerPicker value={broker} onChange={setBroker} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Local"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex: Stand BACANA_ZS" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in" hint="opcional"><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
        <Field label="Check-out" hint="opcional"><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
      </div>
      <Field label="Observação"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <SaveButton saving={saving} onClick={save} />
    </ModalShell>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end pt-2">
      <button onClick={onClick} disabled={saving}
        className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Salvar
      </button>
    </div>
  );
}
