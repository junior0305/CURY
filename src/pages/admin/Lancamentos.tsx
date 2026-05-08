// /admin/financeiro/lancamentos — CRUD + Ranking + Validações

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Trophy, Plus, X, Loader2, CheckCircle2, AlertTriangle, Clock,
  Edit, Trash2, Eye
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RewardRule { action: "visita" | "documento" | "venda"; prize_per_unit: number; prize_pool?: number | null; }

interface Launch {
  id: string;
  name: string;
  description: string | null;
  hero_emoji: string | null;
  starts_at: string;
  ends_at: string;
  reward_rules: RewardRule[];
  ranking_visible: boolean;
  target_role: string[] | null;
  is_active: boolean;
  finalized_at: string | null;
  created_at: string;
}

interface PendingClaim {
  claim_id: string;
  launch_id: string;
  launch_name: string;
  broker_id: string;
  broker_name: string;
  manager_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  action_type: "visita" | "documento" | "venda";
  claimed_at: string;
}

interface Ranking {
  action_type: "visita" | "documento" | "venda";
  broker_id: string;
  broker_name: string;
  manager_name: string | null;
  total_count: number;
  verified_count: number;
  pending_count: number;
  rejected_count: number;
  prize_estimate: number;
  prize_paid: number;
  rank_position: number;
}

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

export default function Lancamentos() {
  const [tab, setTab] = useState("lista");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-900/40 border border-amber-500/30">
          <Trophy className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-wider uppercase">Lançamentos</h2>
          <p className="text-gray-500 text-sm">Campanhas com prêmio em dinheiro por venda/visita/pasta de produto específico</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-900/80 border border-gray-700/50 p-1">
          <TabsTrigger value="lista" className="data-[state=active]:bg-amber-900/40">Lançamentos</TabsTrigger>
          <TabsTrigger value="validacoes" className="data-[state=active]:bg-amber-900/40">Validações pendentes</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-4"><LaunchesList /></TabsContent>
        <TabsContent value="validacoes" className="mt-4"><PendingClaims /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab Lançamentos ───────────────────────────────────────────────────────

function LaunchesList() {
  const [list, setList] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Launch | "new" | null>(null);
  const [viewing, setViewing] = useState<Launch | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("product_launches").select("*").order("created_at", { ascending: false });
    setList((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function archive(l: Launch) {
    if (!confirm(`Encerrar "${l.name}"? Não dispara mais prompts e admin valida claims pendentes.`)) return;
    await supabase.from("product_launches").update({ is_active: false }).eq("id", l.id);
    toast.success("Encerrado");
    load();
  }

  async function remove(l: Launch) {
    if (!confirm(`DELETAR "${l.name}"? Apaga todos claims associados.`)) return;
    await supabase.from("product_launches").delete().eq("id", l.id);
    toast.success("Deletado");
    load();
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-2">
        <Plus className="w-4 h-4" /> Novo lançamento
      </button>

      {loading && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}
      {!loading && list.length === 0 && (
        <div className="text-center py-10 text-gray-500 rounded-xl border border-gray-700/50">
          Nenhum lançamento. Crie o primeiro.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map(l => {
          const ended = !l.is_active || new Date(l.ends_at) < new Date();
          return (
            <div key={l.id} className="rounded-xl border p-3 space-y-2"
              style={{
                borderColor: ended ? "rgba(100,100,100,0.30)" : "rgba(245,158,11,0.55)",
                background: ended ? "rgba(0,0,0,0.30)" : "rgba(245,158,11,0.10)",
                opacity: ended ? 0.6 : 1,
              }}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <div className="text-2xl">{l.hero_emoji || "🚀"}</div>
                  <div>
                    <div className="font-black text-white">{l.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(l.starts_at).toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                      {" → "}
                      {new Date(l.ends_at).toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                    </div>
                    {ended && <span className="text-[9px] bg-gray-700/60 text-gray-400 px-1.5 rounded mt-1 inline-block">ENCERRADO</span>}
                    {!ended && <span className="text-[9px] bg-emerald-900/60 text-emerald-300 px-1.5 rounded mt-1 inline-block animate-pulse">ATIVO</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setViewing(l)} title="Ranking" className="p-1.5 text-gray-400 hover:text-white"><Eye className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditing(l)} title="Editar" className="p-1.5 text-gray-400 hover:text-white"><Edit className="w-3.5 h-3.5" /></button>
                  {l.is_active && <button onClick={() => archive(l)} title="Encerrar" className="p-1.5 text-amber-400"><X className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => remove(l)} title="Deletar" className="p-1.5 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.reward_rules.map((r, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 font-bold">
                    {r.action} · {fmtMoney(r.prize_per_unit)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <LaunchForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {viewing && <LaunchRanking launch={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ─── Form ──────────────────────────────────────────────────────────────────

function LaunchForm({ initial, onClose, onSaved }: { initial: Launch | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    hero_emoji: initial?.hero_emoji || "🚀",
    starts_at: initial?.starts_at ? new Date(initial.starts_at).toISOString().substring(0, 16) : "",
    ends_at: initial?.ends_at ? new Date(initial.ends_at).toISOString().substring(0, 16) : "",
    rules: (initial?.reward_rules || [{ action: "venda", prize_per_unit: 1500 }]) as RewardRule[],
    target_role: (initial?.target_role || ["BROKER"]) as string[],
  });
  const [saving, setSaving] = useState(false);

  function toggleAction(action: "visita" | "documento" | "venda") {
    setForm(f => {
      const has = f.rules.find(r => r.action === action);
      if (has) return { ...f, rules: f.rules.filter(r => r.action !== action) };
      return { ...f, rules: [...f.rules, { action, prize_per_unit: action === "venda" ? 1500 : action === "documento" ? 200 : 50 }] };
    });
  }

  function setRulePrice(action: string, price: number) {
    setForm(f => ({ ...f, rules: f.rules.map(r => r.action === action ? { ...r, prize_per_unit: price } : r) }));
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    if (!form.starts_at || !form.ends_at) return toast.error("Datas obrigatórias");
    if (form.rules.length === 0) return toast.error("Selecione ao menos uma ação a premiar");
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description || null,
        hero_emoji: form.hero_emoji || "🚀",
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        reward_rules: form.rules,
        target_role: form.target_role.length > 0 ? form.target_role : null,
        is_active: true,
      };
      if (initial) {
        const { error } = await supabase.from("product_launches").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Atualizado");
      } else {
        const { error } = await supabase.from("product_launches").insert(payload);
        if (error) throw error;
        toast.success("🏆 Lançamento publicado!");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-slate-950 border-amber-500/30 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-amber-300">{initial ? "✏️ Editar lançamento" : "🏆 Novo lançamento"}</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Emoji</label>
              <input value={form.hero_emoji} onChange={e => setForm(f => ({...f, hero_emoji: e.target.value}))} maxLength={4}
                className="w-full text-2xl text-center bg-slate-900 border border-gray-700 rounded-lg py-1.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Nome do produto *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Leopoldina"
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Descrição</label>
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={3}
              placeholder="Detalhes do lançamento..."
              className="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Início</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({...f, starts_at: e.target.value}))}
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Fim</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({...f, ends_at: e.target.value}))}
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-200" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Premiar (selecione + valor)</label>
            <div className="space-y-2">
              {(["visita","documento","venda"] as const).map(action => {
                const rule = form.rules.find(r => r.action === action);
                const enabled = !!rule;
                return (
                  <div key={action} className="flex items-center gap-2 p-2 rounded-lg border" style={{
                    borderColor: enabled ? "rgba(16,185,129,0.50)" : "rgba(100,100,100,0.30)",
                    background: enabled ? "rgba(16,185,129,0.08)" : "transparent",
                  }}>
                    <input type="checkbox" checked={enabled} onChange={() => toggleAction(action)} />
                    <span className="text-sm font-bold text-gray-200 capitalize flex-1">{action}</span>
                    {enabled && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">R$</span>
                        <input type="number" value={rule.prize_per_unit}
                          onChange={e => setRulePrice(action, Number(e.target.value))}
                          className="w-20 bg-slate-900 border border-gray-700 rounded px-2 py-1 text-sm text-emerald-300 font-bold text-right" />
                        <span className="text-xs text-gray-500">/un</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Público</label>
            <div className="flex flex-wrap gap-2">
              {["BROKER","MANAGER"].map(r => (
                <button key={r} onClick={() => setForm(f => ({ ...f, target_role: f.target_role.includes(r) ? f.target_role.filter(x => x !== r) : [...f.target_role, r] }))}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition"
                  style={{ background: form.target_role.includes(r) ? "rgba(245,158,11,0.30)" : "transparent",
                           borderColor: form.target_role.includes(r) ? "#f59e0b" : "rgba(100,100,100,0.30)",
                           color: form.target_role.includes(r) ? "#fcd34d" : "#9ca3af" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 text-gray-300 text-sm font-bold">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {initial ? "Salvar" : "Publicar"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Drawer Ranking ────────────────────────────────────────────────────────

function LaunchRanking({ launch, onClose }: { launch: Launch; onClose: () => void }) {
  const [list, setList] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    supabase.rpc("get_launch_rankings", { p_launch_id: launch.id }).then(({data}) => {
      setList((data as any) || []); setLoading(false);
    });
  }, [launch.id]);

  const actions = launch.reward_rules.map(r => r.action);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-slate-950 border-amber-500/30 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-amber-300">{launch.hero_emoji} {launch.name}</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          {loading && <div><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
          {actions.map(a => {
            const rows = list.filter(r => r.action_type === a);
            return (
              <div key={a}>
                <h3 className="text-sm font-black text-amber-200 uppercase tracking-wider mb-2">Ranking · {a}</h3>
                {rows.length === 0 ? (
                  <div className="text-xs text-gray-500 italic">Sem registros ainda.</div>
                ) : (
                  <div className="space-y-1">
                    {rows.map(r => (
                      <div key={r.broker_id} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-800/40 last:border-0">
                        <span className="w-7 text-amber-400 font-bold">#{r.rank_position}</span>
                        <span className="flex-1 text-gray-200">{r.broker_name}</span>
                        <span className="text-emerald-400 text-xs">{r.verified_count} val</span>
                        <span className="text-amber-400 text-xs">{r.pending_count} pend</span>
                        <span className="text-emerald-300 font-bold w-20 text-right">{fmtMoney(r.prize_estimate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Tab Validações Pendentes ──────────────────────────────────────────────

export function PendingClaims() {
  const [list, setList] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc("get_pending_claims", { p_launch_id: null });
    setList((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function decide(c: PendingClaim, status: "verified" | "rejected") {
    let reason: string | undefined;
    if (status === "rejected") {
      reason = prompt("Motivo da rejeição (opcional):") || undefined;
    }
    setBusy(c.claim_id);
    const { error } = await supabase.rpc("verify_launch_claim", { p_claim_id: c.claim_id, p_status: status, p_reason: reason });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "verified" ? "✅ Aprovado" : "Rejeitado");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400">
        Cada claim aqui é um corretor afirmando que fez visita/pasta/venda do produto. Você confirma se é verdade pra liberar o pix.
      </div>

      {loading && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}
      {!loading && list.length === 0 && (
        <div className="text-center py-10 text-gray-500 rounded-xl border border-gray-700/50">
          Nenhuma validação pendente. ✨
        </div>
      )}

      {list.map(c => (
        <div key={c.claim_id} className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 flex items-center gap-3 flex-wrap">
          <div className="text-2xl">🏆</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm">
              <strong className="text-amber-200">{c.broker_name}</strong>
              <span className="text-gray-500 mx-1">·</span>
              <span className="text-amber-300 capitalize">{c.action_type}</span>
              <span className="text-gray-500 mx-1">no</span>
              <strong className="text-emerald-300">{c.launch_name}</strong>
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Lead: {c.lead_name || "—"} {c.lead_phone ? `(${c.lead_phone})` : ""}
              <span className="mx-1">·</span>
              Manager: {c.manager_name || "—"}
              <span className="mx-1">·</span>
              {new Date(c.claimed_at).toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => decide(c, "rejected")} disabled={busy === c.claim_id}
              className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs font-bold flex items-center gap-1 disabled:opacity-50">
              <AlertTriangle className="w-3.5 h-3.5" /> Rejeitar
            </button>
            <button onClick={() => decide(c, "verified")} disabled={busy === c.claim_id}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1 disabled:opacity-50">
              {busy === c.claim_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Aprovar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
