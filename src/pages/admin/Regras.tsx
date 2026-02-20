import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings, Plus, Pencil, Trash2, Users, RefreshCw,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Queue {
  id: string;
  name: string;
  match_field: string;
  match_value: string;
  broker_ids: string[];
  is_active: boolean;
  last_assigned_index: number;
  created_at: string;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  lead_assignment_enabled: boolean;
}

const MATCH_FIELDS = [
  { value: "tag", label: "Tag do Lead" },
  { value: "source", label: "Fonte (source)" },
  { value: "product", label: "Produto" },
  { value: "campaign", label: "Campanha" },
  { value: "*", label: "Todos os leads (padrão)" },
];

export default function Regras() {
  const { toast } = useToast();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [brokers, setBrokers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);

  // form
  const [formName, setFormName] = useState("");
  const [formMatchField, setFormMatchField] = useState("*");
  const [formMatchValue, setFormMatchValue] = useState("*");
  const [formBrokerIds, setFormBrokerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [{ data: qData }, { data: pData }] = await Promise.all([
      supabase.from("distribution_queues").select("*").order("created_at"),
      supabase.from("profiles").select("id,first_name,last_name,email,role,lead_assignment_enabled").order("first_name"),
    ]);
    setQueues(qData || []);
    setBrokers((pData || []).filter(p => p.role === "BROKER"));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const resetForm = () => {
    setFormName(""); setFormMatchField("*"); setFormMatchValue("*"); setFormBrokerIds([]);
  };

  const openCreate = () => { resetForm(); setEditQueue(null); setModalOpen(true); };
  const openEdit = (q: Queue) => {
    setEditQueue(q);
    setFormName(q.name);
    setFormMatchField(q.match_field);
    setFormMatchValue(q.match_value);
    setFormBrokerIds(q.broker_ids || []);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast({ title: "Nome obrigatório", variant: "destructive" });
    if (formBrokerIds.length === 0) return toast({ title: "Adicione ao menos 1 corretor", variant: "destructive" });
    setSaving(true);
    const payload = {
      name: formName.trim(),
      match_field: formMatchField,
      match_value: formMatchField === "*" ? "*" : formMatchValue.trim() || "*",
      broker_ids: formBrokerIds,
    };
    const { error } = editQueue
      ? await supabase.from("distribution_queues").update(payload).eq("id", editQueue.id)
      : await supabase.from("distribution_queues").insert({ ...payload, last_assigned_index: 0, is_active: true });
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: editQueue ? "✅ Fila atualizada!" : "✅ Fila criada!" });
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteQueue) return;
    const { error } = await supabase.from("distribution_queues").delete().eq("id", deleteQueue.id);
    if (error) return toast({ title: "Erro ao excluir", variant: "destructive" });
    toast({ title: "🗑️ Fila removida." });
    setDeleteQueue(null);
    loadData();
  };

  const toggleActive = async (q: Queue) => {
    await supabase.from("distribution_queues").update({ is_active: !q.is_active }).eq("id", q.id);
    loadData();
  };

  const resetIndex = async (q: Queue) => {
    await supabase.from("distribution_queues").update({ last_assigned_index: 0 }).eq("id", q.id);
    toast({ title: "🔄 Índice resetado — próximo lead vai para o 1º da fila." });
    loadData();
  };

  const toggleBroker = (id: string) => {
    setFormBrokerIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const brokerName = (id: string) => {
    const b = brokers.find(b => b.id === id);
    return b ? `${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email : id;
  };

  const nextBroker = (q: Queue) => {
    if (!q.broker_ids?.length) return "—";
    const idx = (q.last_assigned_index || 0) % q.broker_ids.length;
    return brokerName(q.broker_ids[idx]);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Settings className="w-10 h-10 text-purple-400 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-purple-400" />
            Filas de Distribuição
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Leads são distribuídos em round-robin para os corretores de cada fila
          </p>
        </div>
        <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-500 font-bold gap-2">
          <Plus className="w-4 h-4" /> Nova Fila
        </Button>
      </div>

      {/* Info box */}
      <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <p className="text-purple-300 font-semibold mb-1">Como funciona</p>
          Quando um lead chega via webhook, o sistema verifica o campo de match. A primeira fila ativa que combinar recebe o lead e distribui para o próximo corretor da fila (round-robin). Use <span className="text-white font-mono">*</span> para capturar todos os leads sem regra específica.
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total de Filas", value: queues.length, color: "text-purple-400" },
          { label: "Ativas", value: queues.filter(q => q.is_active).length, color: "text-green-400" },
          { label: "Corretores", value: brokers.length, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/40 border border-gray-700/50 rounded-xl p-4 text-center">
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Lista de filas */}
      {queues.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Nenhuma fila criada ainda.</p>
          <p className="text-sm mt-1">Crie sua primeira fila para começar a distribuir leads.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queues.map((q, idx) => {
            const isExpanded = expanded.has(q.id);
            const memberBrokers = brokers.filter(b => q.broker_ids?.includes(b.id));
            return (
              <div key={q.id} className={`rounded-xl border overflow-hidden transition-all ${q.is_active ? "border-purple-500/40 bg-slate-800/40" : "border-gray-700/40 bg-slate-900/40 opacity-60"}`}>
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggleExpand(q.id)} className="flex items-center gap-3 flex-1 text-left">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-lg">{q.name}</span>
                        <Badge variant={q.is_active ? "default" : "secondary"} className={q.is_active ? "bg-green-900/50 text-green-300 border-green-500/30" : ""}>
                          {q.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                        {q.match_field !== "*" && (
                          <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-xs font-mono">
                            {q.match_field} = {q.match_value}
                          </Badge>
                        )}
                        {q.match_field === "*" && (
                          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">padrão</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {memberBrokers.length} corretor{memberBrokers.length !== 1 ? "es" : ""} •
                        Próximo: <span className="text-purple-300">{nextBroker(q)}</span>
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => resetIndex(q)} title="Resetar índice round-robin"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-yellow-400 hover:bg-yellow-900/20">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(q)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-slate-700">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(q)} title={q.is_active ? "Desativar" : "Ativar"}
                      className={`h-8 w-8 p-0 ${q.is_active ? "text-green-400 hover:text-red-400 hover:bg-red-900/20" : "text-gray-500 hover:text-green-400 hover:bg-green-900/20"}`}>
                      {q.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteQueue(q)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-700/50 bg-slate-900/40 p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">
                      Corretores na fila ({memberBrokers.length})
                    </p>
                    {memberBrokers.length === 0 ? (
                      <p className="text-gray-600 text-sm">Nenhum corretor adicionado.</p>
                    ) : (
                      <div className="space-y-2">
                        {q.broker_ids?.map((bid, bidIdx) => {
                          const b = brokers.find(b => b.id === bid);
                          if (!b) return null;
                          const isCurrent = bidIdx === (q.last_assigned_index % q.broker_ids.length);
                          return (
                            <div key={bid} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isCurrent ? "bg-purple-900/30 border border-purple-500/30" : "bg-slate-800/50"}`}>
                              <span className="text-xs text-gray-500 w-5 text-center font-mono">{bidIdx + 1}</span>
                              <Users className={`w-4 h-4 ${isCurrent ? "text-purple-400" : "text-gray-500"}`} />
                              <span className={`text-sm font-medium flex-1 ${isCurrent ? "text-purple-200" : "text-white"}`}>
                                {`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email}
                              </span>
                              {isCurrent && <Badge className="bg-purple-600/50 text-purple-200 text-xs border-0">próximo</Badge>}
                              {!b.lead_assignment_enabled && (
                                <Badge variant="secondary" className="text-xs">sem leads</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-400" />
              {editQueue ? "Editar Fila" : "Nova Fila de Distribuição"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Nome da Fila *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="Ex: Fila Produto A" className="bg-slate-800 border-gray-600 text-white" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Campo de Match</Label>
                <select value={formMatchField} onChange={e => { setFormMatchField(e.target.value); setFormMatchValue("*"); }}
                  className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                  {MATCH_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Valor</Label>
                <Input value={formMatchValue} onChange={e => setFormMatchValue(e.target.value)}
                  placeholder={formMatchField === "*" ? "* (todos)" : "Ex: produto-a"}
                  disabled={formMatchField === "*"}
                  className="bg-slate-800 border-gray-600 text-white disabled:opacity-40" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">
                Corretores na Fila ({formBrokerIds.length} selecionados)
              </Label>
              {brokers.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum corretor (BROKER) cadastrado ainda.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {brokers.map(b => {
                    const selected = formBrokerIds.includes(b.id);
                    const posIdx = formBrokerIds.indexOf(b.id);
                    return (
                      <button key={b.id} onClick={() => toggleBroker(b.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${selected ? "border-purple-500/50 bg-purple-900/30 text-white" : "border-gray-700/50 bg-slate-800/50 text-gray-400 hover:text-white hover:border-gray-600"}`}>
                        <div className={`w-6 h-6 rounded border flex items-center justify-center text-xs font-bold shrink-0 ${selected ? "bg-purple-600 border-purple-500 text-white" : "border-gray-600"}`}>
                          {selected ? posIdx + 1 : ""}
                        </div>
                        <span className="flex-1 text-sm font-medium">
                          {`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email}
                        </span>
                        {!b.lead_assignment_enabled && (
                          <span className="text-xs text-gray-600">sem leads</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-600">A ordem de seleção define a ordem do round-robin.</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-800">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-500 font-bold">
                {saving ? "Salvando..." : editQueue ? "Salvar" : "Criar Fila"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal deletar */}
      <AlertDialog open={!!deleteQueue} onOpenChange={open => !open && setDeleteQueue(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Excluir Fila
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem certeza que quer excluir a fila <strong className="text-white">{deleteQueue?.name}</strong>? Leads não serão mais distribuídos por ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-300 hover:bg-slate-800">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 font-bold">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
