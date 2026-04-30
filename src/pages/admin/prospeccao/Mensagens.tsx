import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Search, TrendingUp, TrendingDown, Send, CheckCircle2, MessageSquare, Sparkles, RefreshCw, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  message: string;
  category: string | null;
  is_active: boolean;
  sent_count: number;
  response_count: number;
  qualified_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FormData {
  name: string;
  message: string;
  category: string;
  is_active: boolean;
}

const EMPTY_FORM: FormData = { name: "", message: "", category: "", is_active: true };

function rate(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function performanceBadge(responseRate: number) {
  if (responseRate >= 20) return { label: "Alta", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: TrendingUp };
  if (responseRate >= 10) return { label: "Média", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", icon: Sparkles };
  return { label: "Baixa", cls: "bg-red-500/20 text-red-300 border-red-500/40", icon: TrendingDown };
}

export default function Mensagens() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"response_rate" | "sent" | "name" | "recent">("response_rate");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prospecting_message_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar templates: " + error.message);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach(t => { if (t.category) set.add(t.category); });
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    let list = templates;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.message.toLowerCase().includes(q));
    }
    if (filterCategory !== "all") {
      list = filterCategory === "__none__" ? list.filter(t => !t.category) : list.filter(t => t.category === filterCategory);
    }
    if (filterStatus !== "all") {
      list = list.filter(t => t.is_active === (filterStatus === "active"));
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "sent": return b.sent_count - a.sent_count;
        case "recent": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "response_rate":
        default: return rate(b.response_count, b.sent_count) - rate(a.response_count, a.sent_count);
      }
    });
    return list;
  }, [templates, search, filterCategory, filterStatus, sortBy]);

  const totalStats = useMemo(() => {
    return templates.reduce((acc, t) => ({
      sent: acc.sent + t.sent_count,
      responded: acc.responded + t.response_count,
      qualified: acc.qualified + t.qualified_count,
    }), { sent: 0, responded: 0, qualified: 0 });
  }, [templates]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ name: t.name, message: t.message, category: t.category || "", is_active: t.is_active });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      toast.error("Nome e mensagem são obrigatórios");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      message: form.message.trim(),
      category: form.category.trim() || null,
      is_active: form.is_active,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("prospecting_message_templates").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("prospecting_message_templates").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(editing ? "Template atualizado" : "Template criado");
      setOpen(false);
      load();
    }
  };

  const toggleActive = async (t: Template) => {
    const { error } = await supabase
      .from("prospecting_message_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success(t.is_active ? "Desativado" : "Ativado"); load(); }
  };

  return (
    <div className="space-y-6">
      {/* Header com KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-pink-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-900/40 border border-pink-500/30">
                <MessageSquare className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{templates.length}</div>
                <div className="text-xs text-gray-500">Templates totais</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-500/30"><Send className="w-5 h-5 text-blue-400" /></div>
              <div>
                <div className="text-2xl font-black text-white">{totalStats.sent}</div>
                <div className="text-xs text-gray-500">Mensagens enviadas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30"><MessageSquare className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <div className="text-2xl font-black text-white">{totalStats.responded}<span className="text-sm text-gray-500 ml-2">({rate(totalStats.responded, totalStats.sent)}%)</span></div>
                <div className="text-xs text-gray-500">Respostas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-900/40 border border-amber-500/30"><CheckCircle2 className="w-5 h-5 text-amber-400" /></div>
              <div>
                <div className="text-2xl font-black text-white">{totalStats.qualified}<span className="text-sm text-gray-500 ml-2">({rate(totalStats.qualified, totalStats.sent)}%)</span></div>
                <div className="text-xs text-gray-500">Qualificações</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou texto..." className="pl-9 bg-slate-900/80 border-gray-700 text-white" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full md:w-[180px] bg-slate-900/80 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="__none__">Sem categoria</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full md:w-[140px] bg-slate-900/80 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
          <SelectTrigger className="w-full md:w-[180px] bg-slate-900/80 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="response_rate">Taxa de resposta</SelectItem>
            <SelectItem value="sent">Mais enviadas</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
            <SelectItem value="recent">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={load} variant="outline" size="icon" className="bg-slate-900/80 border-gray-700">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </Button>
        <Button onClick={openNew} className="bg-pink-600 hover:bg-pink-500 text-white">
          <Plus className="w-4 h-4 mr-1" /> Nova mensagem
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-900/40 border-gray-800 border-dashed">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Nenhum template encontrado</h3>
            <p className="text-gray-500 text-sm mb-4">
              {templates.length === 0 ? "Crie seu primeiro template de mensagem para usar nos disparos." : "Ajuste os filtros ou crie um novo template."}
            </p>
            <Button onClick={openNew} className="bg-pink-600 hover:bg-pink-500">
              <Plus className="w-4 h-4 mr-1" /> Criar primeiro template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(t => {
            const respRate = rate(t.response_count, t.sent_count);
            const qualRate = rate(t.qualified_count, t.sent_count);
            const perf = performanceBadge(respRate);
            const PerfIcon = perf.icon;
            return (
              <Card key={t.id} className={cn(
                "bg-gradient-to-br from-slate-900 to-slate-950 border transition-all",
                t.is_active ? "border-gray-700 hover:border-pink-500/40" : "border-gray-800 opacity-60"
              )}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-white truncate">{t.name}</h3>
                        {t.category && <Badge variant="outline" className="bg-slate-800 border-gray-700 text-gray-300 text-xs">{t.category}</Badge>}
                        {!t.is_active && <Badge className="bg-gray-700/50 text-gray-400 text-xs">Inativo</Badge>}
                      </div>
                      {t.sent_count > 0 && (
                        <Badge variant="outline" className={cn("text-xs gap-1", perf.cls)}>
                          <PerfIcon className="w-3 h-3" /> {perf.label} performance
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => toggleActive(t)} className={cn("h-8 w-8", t.is_active ? "text-emerald-400 hover:bg-emerald-900/30" : "text-gray-500 hover:bg-gray-800")} title={t.is_active ? "Desativar" : "Ativar"}>
                        {t.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} className="h-8 w-8 text-blue-400 hover:bg-blue-900/30" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 rounded-lg p-3 border border-gray-800">
                    <p className="text-sm text-gray-300 line-clamp-3 whitespace-pre-wrap">{t.message}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950/40 rounded-lg p-2 border border-gray-800">
                      <div className="text-lg font-black text-blue-300">{t.sent_count}</div>
                      <div className="text-[10px] uppercase text-gray-500 tracking-wider">Enviadas</div>
                    </div>
                    <div className="bg-slate-950/40 rounded-lg p-2 border border-gray-800">
                      <div className="text-lg font-black text-emerald-300">{respRate}%</div>
                      <div className="text-[10px] uppercase text-gray-500 tracking-wider">Resposta ({t.response_count})</div>
                    </div>
                    <div className="bg-slate-950/40 rounded-lg p-2 border border-gray-800">
                      <div className="text-lg font-black text-amber-300">{qualRate}%</div>
                      <div className="text-[10px] uppercase text-gray-500 tracking-wider">Qualif. ({t.qualified_count})</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar template" : "Novo template de mensagem"}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Use <code className="bg-slate-800 px-1.5 py-0.5 rounded text-pink-300">{"{nome}"}</code> para personalizar com o nome do lead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-gray-300">Nome interno</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Abertura - pergunta sobre renda" className="bg-slate-950 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">Categoria (opcional)</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: abertura, followup, reativacao" list="categories-list" className="bg-slate-950 border-gray-700 text-white mt-1" />
              <datalist id="categories-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <Label className="text-gray-300">Mensagem</Label>
              <Textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Olá {nome}, tudo bem?" rows={6} className="bg-slate-950 border-gray-700 text-white mt-1 font-mono text-sm" />
              <div className="text-xs text-gray-500 mt-1">{form.message.length} caracteres</div>
            </div>
            <div className="flex items-center justify-between bg-slate-950/60 rounded-lg p-3 border border-gray-800">
              <div>
                <div className="text-sm font-medium text-white">Template ativo</div>
                <div className="text-xs text-gray-500">Templates inativos não entram no round-robin do disparador</div>
              </div>
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-gray-700">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-pink-600 hover:bg-pink-500">
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
