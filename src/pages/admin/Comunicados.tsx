// /admin/comunicados — CRUD de avisos pra broker.
// Lista + form + métricas de leitura/RSVP.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Megaphone, Plus, Trash2, Edit, X, Loader2, Eye, CheckCircle2,
  Clock, Calendar, AlertTriangle, GraduationCap, Pin
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Category = "operacional" | "evento" | "treinamento" | "critico";

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  category: Category;
  emoji: string | null;
  pinned: boolean;
  requires_rsvp: boolean;
  rsvp_options: string[] | null;
  show_frequency: "once" | "until_response" | "until_event" | null;
  starts_at: string | null;
  expires_at: string | null;
  target_role: string[] | null;
  target_team_id: string[] | null;
  created_at: string;
  reminder_sent_at: string | null;
}

const CAT_META: Record<Category, { label: string; emoji: string; color: string; icon: any }> = {
  operacional:  { label: "Operacional",  emoji: "📌", color: "#3b82f6", icon: Megaphone },
  evento:       { label: "Evento",       emoji: "🎉", color: "#a855f7", icon: Calendar },
  treinamento:  { label: "Treinamento",  emoji: "🎓", color: "#10b981", icon: GraduationCap },
  critico:      { label: "Crítico",      emoji: "⚠️", color: "#ef4444", icon: AlertTriangle },
};

export default function Comunicados() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("announcements")
      .select("*").order("created_at", { ascending: false }).limit(100);
    setList((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function archive(a: Announcement) {
    if (!confirm(`Arquivar "${a.title}"? Depois disso pára de aparecer pros corretores.`)) return;
    const { error } = await supabase.from("announcements").update({ pinned: false, expires_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Arquivado");
    load();
  }

  async function remove(a: Announcement) {
    if (!confirm(`DELETAR "${a.title}"? Apaga registros de leitura também.`)) return;
    const { error } = await supabase.from("announcements").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Deletado");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-900/40 border border-blue-500/30">
            <Megaphone className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-wider uppercase">Comunicados</h2>
            <p className="text-gray-500 text-sm">Avisos que aparecem como card no dashboard do broker</p>
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo aviso
        </button>
      </div>

      {loading && <div className="text-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline mr-2" />Carregando...</div>}

      {!loading && list.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-gray-700/50 bg-slate-900/40 text-gray-500">
          <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
          Nenhum aviso ainda. Crie o primeiro pra avisar a equipe.
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map(a => <AnnouncementRow key={a.id} a={a} onEdit={() => setEditing(a)} onArchive={() => archive(a)} onDelete={() => remove(a)} />)}
        </div>
      )}

      {editing && <AnnouncementForm
        initial={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />}
    </div>
  );
}

// ─── Card de cada aviso ────────────────────────────────────────────────────

function AnnouncementRow({ a, onEdit, onArchive, onDelete }: { a: Announcement; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);
  const meta = CAT_META[a.category];
  const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
  const isArchived = !a.pinned;

  async function loadStats() {
    setShowStats(true);
    const { data } = await supabase.rpc("get_announcement_stats", { p_announcement_id: a.id });
    setStats(data);
  }

  return (
    <div className="rounded-xl border p-3 space-y-2"
      style={{
        borderColor: isArchived || isExpired ? "rgba(100,100,100,0.30)" : `${meta.color}55`,
        background: isArchived || isExpired ? "rgba(0,0,0,0.30)" : `${meta.color}11`,
        opacity: isArchived || isExpired ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="text-2xl">{a.emoji || meta.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5" style={{ color: meta.color }}>
              {meta.label}
              {a.requires_rsvp && <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1.5 rounded">RSVP</span>}
              {a.show_frequency === "until_response" && <span className="text-[9px] bg-blue-900/40 text-blue-300 px-1.5 rounded" title="Lembra 1x/dia até broker responder">⏰ 1x/dia</span>}
              {a.show_frequency === "until_event" && <span className="text-[9px] bg-amber-900/40 text-amber-300 px-1.5 rounded" title="Lembra 1x/dia até a data do evento">⏰ até evento</span>}
              {isArchived && <span className="text-[9px] bg-gray-700/60 text-gray-400 px-1.5 rounded">ARQUIVADO</span>}
              {isExpired && !isArchived && <span className="text-[9px] bg-red-900/40 text-red-300 px-1.5 rounded">EXPIRADO</span>}
            </div>
            <div className="font-bold text-white text-sm">{a.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={loadStats} title="Ver métricas" className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-slate-800"><Eye className="w-3.5 h-3.5" /></button>
          <button onClick={onEdit} title="Editar" className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-slate-800"><Edit className="w-3.5 h-3.5" /></button>
          {!isArchived && <button onClick={onArchive} title="Arquivar" className="p-1.5 rounded text-amber-400 hover:bg-amber-900/40"><Pin className="w-3.5 h-3.5" /></button>}
          <button onClick={onDelete} title="Deletar" className="p-1.5 rounded text-red-400 hover:bg-red-900/40"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {a.body && <p className="text-xs text-gray-400 line-clamp-2">{a.body}</p>}

      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        {a.starts_at && <span><Clock className="w-3 h-3 inline mr-0.5" />{new Date(a.starts_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
        {a.expires_at && <span>Expira: {new Date(a.expires_at).toLocaleDateString("pt-BR")}</span>}
      </div>

      {showStats && stats && (
        <div className="mt-2 pt-2 border-t border-gray-700/40 text-xs space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="font-bold text-blue-300">{stats.total_eligible}</div><div className="text-[10px] text-gray-500">Elegíveis</div></div>
            <div><div className="font-bold text-emerald-300">{stats.reads}</div><div className="text-[10px] text-gray-500">Lidos</div></div>
            <div><div className="font-bold text-amber-300">{stats.pending}</div><div className="text-[10px] text-gray-500">Pendentes</div></div>
          </div>
          {a.rsvp_options && a.rsvp_options.length > 0 && stats.by_option && (
            <div className="pt-2 border-t border-gray-700/40">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Por opção:</div>
              <div className="flex flex-wrap gap-1.5">
                {a.rsvp_options.map(opt => (
                  <span key={opt} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-gray-700 text-gray-300">
                    <strong>{stats.by_option[opt] || 0}</strong> {opt}
                  </span>
                ))}
                {stats.by_option["__no_response__"] && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700/40 text-gray-400">
                    <strong>{stats.by_option["__no_response__"]}</strong> só leu
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Form criar/editar ─────────────────────────────────────────────────────

function AnnouncementForm({ initial, onClose, onSaved }: { initial: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    body: initial?.body || "",
    category: (initial?.category || "operacional") as Category,
    emoji: initial?.emoji || "",
    rsvp_options_text: (initial?.rsvp_options || []).join("\n"),
    show_frequency: (initial?.show_frequency || "once") as "once" | "until_response" | "until_event",
    starts_at: initial?.starts_at ? new Date(initial.starts_at).toISOString().substring(0, 16) : "",
    expires_at: initial?.expires_at ? new Date(initial.expires_at).toISOString().substring(0, 16) : "",
    target_role: (initial?.target_role || ["BROKER"]) as string[],
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return toast.error("Informe o título");
    setSaving(true);
    try {
      const opts = form.rsvp_options_text.split("\n").map(s => s.trim()).filter(Boolean);
      const payload: any = {
        title: form.title.trim(),
        body: form.body || null,
        category: form.category,
        emoji: form.emoji || null,
        requires_rsvp: opts.length > 0,
        rsvp_options: opts.length > 0 ? opts : null,
        show_frequency: form.show_frequency,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        target_role: form.target_role.length > 0 ? form.target_role : null,
        pinned: true,
      };
      if (initial) {
        const { error } = await supabase.from("announcements").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Aviso atualizado");
      } else {
        const { error } = await supabase.from("announcements").insert(payload);
        if (error) throw error;
        toast.success("Aviso publicado!");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  function toggleRole(r: string) {
    setForm(f => ({ ...f, target_role: f.target_role.includes(r) ? f.target_role.filter(x => x !== r) : [...f.target_role, r] }));
  }

  const meta = CAT_META[form.category];

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-slate-950 border-slate-800 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white">{initial ? "✏️ Editar aviso" : "➕ Novo aviso"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {/* Categoria */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Categoria</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CAT_META) as Category[]).map(c => {
                const m = CAT_META[c];
                const Ic = m.icon;
                const active = form.category === c;
                return (
                  <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                    className="px-3 py-2 rounded-lg border text-sm font-bold flex items-center gap-2 transition"
                    style={{ background: active ? `${m.color}33` : "transparent", borderColor: active ? m.color : "rgba(100,100,100,0.30)", color: active ? m.color : "#9ca3af" }}>
                    <Ic className="w-4 h-4" />{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Emoji</label>
              <input value={form.emoji} onChange={e => setForm(f => ({...f, emoji: e.target.value}))} placeholder={meta.emoji} maxLength={4}
                className="w-full text-2xl text-center bg-slate-900 border border-gray-700 rounded-lg py-1.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Título *</label>
              <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Pizza terça às 19h"
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Mensagem</label>
            <textarea value={form.body} onChange={e => setForm(f => ({...f, body: e.target.value}))} rows={4}
              placeholder="Detalhes do aviso. Pode ter quebras de linha."
              className="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">
              Opções de resposta (uma por linha)
            </label>
            <textarea
              value={form.rsvp_options_text}
              onChange={e => setForm(f => ({...f, rsvp_options_text: e.target.value}))}
              rows={3}
              placeholder={"Vou\nNão posso\nTalvez"}
              className="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Vazio = só botão "Entendi" (confirmar leitura). Com opções = broker escolhe uma + tem link "só confirmar leitura".
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">
              Frequência de exibição
            </label>
            <div className="space-y-1.5">
              {([
                { v: "once", t: "Uma vez", d: "Aparece até o broker confirmar. Após isso, some." },
                { v: "until_response", t: "1x/dia até o broker responder", d: "Lembra todo dia até ele dar Entendi/RSVP." },
                { v: "until_event", t: "1x/dia até a data do evento", d: "Lembra todo dia até starts_at, mesmo se já respondeu. (Requer 'Data do evento')" },
              ] as const).map(opt => (
                <label key={opt.v} className="flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition"
                  style={{
                    borderColor: form.show_frequency === opt.v ? "rgba(59,130,246,0.55)" : "rgba(100,100,100,0.30)",
                    background: form.show_frequency === opt.v ? "rgba(59,130,246,0.10)" : "transparent",
                  }}>
                  <input type="radio" name="freq" checked={form.show_frequency === opt.v}
                    onChange={() => setForm(f => ({...f, show_frequency: opt.v}))} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-200">{opt.t}</div>
                    <div className="text-[10px] text-gray-500">{opt.d}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Data do evento</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({...f, starts_at: e.target.value}))}
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Expira em</label>
              <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({...f, expires_at: e.target.value}))}
                className="w-full bg-slate-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-200" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5 block">Público</label>
            <div className="flex flex-wrap gap-2">
              {["BROKER", "MANAGER", "ADMIN", "SECRETARY"].map(r => (
                <button key={r} onClick={() => toggleRole(r)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition"
                  style={{ background: form.target_role.includes(r) ? "rgba(59,130,246,0.30)" : "transparent",
                           borderColor: form.target_role.includes(r) ? "#3b82f6" : "rgba(100,100,100,0.30)",
                           color: form.target_role.includes(r) ? "#93c5fd" : "#9ca3af" }}>
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Vazio = todos os usuários autenticados</p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-bold">
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {initial ? "Salvar" : "Publicar"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
