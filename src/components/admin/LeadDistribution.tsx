import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DistributionQueue } from "@/types/queue";
import { Plus, Trash2, Loader2, Save, ChevronRight, Zap, RefreshCw, Edit, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams, fetchProfiles } from "@/integrations/supabase/profiles";
import { Team, User as AppUser } from "@/types/user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CARD = {
  background: "rgba(8,14,28,0.85)",
  border: "1px solid rgba(26,39,68,0.9)",
};
const CARD_INNER = {
  background: "rgba(5,10,20,0.9)",
  border: "1px solid rgba(26,39,68,0.7)",
};

const LeadDistribution = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<(Team & { memberCount?: number })[]>({
    queryKey: ["teams"],
    queryFn: fetchTeams,
  });

  const { data: allProfiles = [], isLoading: isLoadingProfiles } = useQuery<AppUser[]>({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  const { data: queues = [], isLoading: isLoadingQueues } = useQuery<DistributionQueue[]>({
    queryKey: ["queues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_queues")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(q => ({
        id: q.id,
        name: q.name,
        matchField: q.match_field as "titulo" | "tag",
        matchValue: q.match_value,
        brokerIds: q.broker_ids || [],
        isActive: q.is_active,
        lastAssignedIndex: q.last_assigned_index,
        teamIds: [],
      }));
    },
  });

  const brokers = useMemo(() => allProfiles.filter(u => u.role === "BROKER"), [allProfiles]);

  const [form, setForm] = useState<Partial<DistributionQueue & { brokerIds: string[] }>>({
    name: "",
    matchField: "titulo",
    matchValue: "",
    brokerIds: [],
    isActive: true,
  });

  const saveQueueMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingQueueId) {
        const { error } = await supabase
          .from("distribution_queues")
          .update({
            name: payload.name,
            match_field: payload.matchField,
            match_value: payload.matchValue,
            broker_ids: payload.brokerIds,
            is_active: payload.isActive,
          })
          .eq("id", editingQueueId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("distribution_queues").insert({
          name: payload.name,
          match_field: payload.matchField,
          match_value: payload.matchValue,
          broker_ids: payload.brokerIds,
          is_active: payload.isActive,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues"] });
      toast({ title: editingQueueId ? "Fila atualizada!" : "Fila criada!" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteQueueMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("distribution_queues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues"] });
      toast({ title: "Fila removida." });
    },
  });

  const resetForm = () => {
    setForm({ name: "", matchField: "titulo", matchValue: "", brokerIds: [], isActive: true });
    setEditingQueueId(null);
    setActiveTeamId(null);
  };

  const brokersInSelectedTeam = useMemo(
    () => (activeTeamId ? brokers.filter(b => b.teamId === activeTeamId) : []),
    [brokers, activeTeamId]
  );

  const handleToggleBroker = (id: string) => {
    const ids = form.brokerIds || [];
    setForm({ ...form, brokerIds: ids.includes(id) ? ids.filter(b => b !== id) : [...ids, id] });
  };

  const handleEditQueue = (q: DistributionQueue) => {
    setEditingQueueId(q.id);
    setForm({
      name: q.name,
      matchField: q.matchField,
      matchValue: q.matchValue,
      brokerIds: (q as any).brokerIds || [],
      isActive: q.isActive,
    });
  };

  const isLoading = isLoadingTeams || isLoadingProfiles || isLoadingQueues;
  const selectedCount = form.brokerIds?.length || 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#0066ff" }} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Formulário ─────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-1 rounded-2xl p-5 space-y-5 sticky top-4 h-fit" style={CARD}>
        <div className="flex items-center gap-2">
          {editingQueueId
            ? <RefreshCw className="w-4 h-4" style={{ color: "#00aaff" }} />
            : <Plus className="w-4 h-4" style={{ color: "#00aaff" }} />
          }
          <h2 className="font-black text-white text-sm uppercase tracking-widest">
            {editingQueueId ? "Editar Fila" : "Nova Fila"}
          </h2>
        </div>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>
            Nome da Fila
          </Label>
          <Input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Leads São Paulo"
            className="rounded-xl text-white placeholder-gray-700 h-9 text-sm"
            style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}
          />
        </div>

        {/* Regra de match */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>
            Regra de Entrada
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={form.matchField}
              onValueChange={(val: any) => setForm({ ...form, matchField: val })}
            >
              <SelectTrigger
                className="rounded-xl text-white h-9 text-xs"
                style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-gray-700 text-white">
                <SelectItem value="titulo">Título</SelectItem>
                <SelectItem value="tag">Tag</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Valor"
              value={form.matchValue}
              onChange={e => setForm({ ...form, matchValue: e.target.value })}
              className="rounded-xl text-white placeholder-gray-700 h-9 text-xs"
              style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}
            />
          </div>
          <p className="text-[10px]" style={{ color: "#2a3a5a" }}>
            Leads onde o campo <span style={{ color: "#00aaff" }}>{form.matchField}</span> contém <span style={{ color: "#00aaff" }}>"{form.matchValue || "..."}"</span> entrarão nessa fila
          </p>
        </div>

        {/* Seleção de corretores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>
              Corretores da Fila
            </Label>
            {selectedCount > 0 && (
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,102,255,0.2)", color: "#00aaff", border: "1px solid rgba(0,170,255,0.3)" }}
              >
                {selectedCount} selecionado{selectedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2" style={{ height: 200 }}>
            {/* Coluna equipes */}
            <div className="rounded-xl overflow-hidden" style={CARD_INNER}>
              <div className="px-2 py-1.5 border-b" style={{ borderColor: "rgba(26,39,68,0.7)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#2a3a5a" }}>Equipes</p>
              </div>
              <ScrollArea className="h-[160px]">
                {teams.length === 0
                  ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>Sem equipes</p>
                  : teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => setActiveTeamId(team.id)}
                      className="w-full flex items-center justify-between px-2.5 py-2 text-xs transition-all"
                      style={{
                        color: activeTeamId === team.id ? "#ffffff" : "#4a5a7a",
                        background: activeTeamId === team.id ? "rgba(0,102,255,0.15)" : "transparent",
                      }}
                    >
                      <span className="truncate">{team.name}</span>
                      <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                    </button>
                  ))
                }
              </ScrollArea>
            </div>

            {/* Coluna corretores */}
            <div className="rounded-xl overflow-hidden" style={CARD_INNER}>
              <div className="px-2 py-1.5 border-b" style={{ borderColor: "rgba(26,39,68,0.7)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#2a3a5a" }}>Corretores</p>
              </div>
              <ScrollArea className="h-[160px]">
                {!activeTeamId
                  ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>← Selecione equipe</p>
                  : brokersInSelectedTeam.length === 0
                    ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>Sem corretores</p>
                    : brokersInSelectedTeam.map(broker => {
                      const checked = form.brokerIds?.includes(broker.id);
                      return (
                        <button
                          key={broker.id}
                          onClick={() => handleToggleBroker(broker.id)}
                          className="w-full flex items-center justify-between px-2.5 py-2 text-xs transition-all"
                          style={{
                            color: checked ? "#ffffff" : "#4a5a7a",
                            background: checked ? "rgba(0,102,255,0.12)" : "transparent",
                          }}
                        >
                          <span className="truncate">{broker.name}</span>
                          <Checkbox
                            checked={!!checked}
                            onCheckedChange={() => handleToggleBroker(broker.id)}
                            className="h-3 w-3 pointer-events-none"
                          />
                        </button>
                      );
                    })
                }
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          {editingQueueId && (
            <Button
              variant="ghost"
              onClick={resetForm}
              className="flex-1 h-9 text-xs rounded-xl"
              style={{ color: "#4a5a7a", border: "1px solid rgba(26,39,68,0.9)" }}
            >
              Cancelar
            </Button>
          )}
          <Button
            onClick={() => saveQueueMutation.mutate(form)}
            disabled={!form.name || saveQueueMutation.isPending}
            className="flex-1 h-9 text-xs font-black rounded-xl"
            style={{
              background: "linear-gradient(135deg, #0055cc 0%, #0066ff 100%)",
              boxShadow: "0 0 16px rgba(0,102,255,0.35)",
            }}
          >
            {saveQueueMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Save className="w-3.5 h-3.5 mr-1.5" />{editingQueueId ? "Atualizar" : "Criar Fila"}</>
            }
          </Button>
        </div>
      </div>

      {/* ── Lista de filas ──────────────────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4" style={{ color: "#00aaff" }} />
          <h2 className="font-black text-white text-sm uppercase tracking-widest">
            Filas Ativas
          </h2>
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-full ml-1"
            style={{ background: "rgba(0,102,255,0.15)", color: "#00aaff", border: "1px solid rgba(0,170,255,0.2)" }}
          >
            {queues.length}
          </span>
        </div>

        {queues.length === 0 && (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ border: "1px dashed rgba(26,39,68,0.9)", background: "rgba(5,10,20,0.5)" }}
          >
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-10" style={{ color: "#0066ff" }} />
            <p className="text-sm font-bold" style={{ color: "#2a3a5a" }}>Nenhuma fila criada</p>
            <p className="text-xs mt-1" style={{ color: "#1a2a3a" }}>
              Crie uma fila para distribuir leads automaticamente aos corretores
            </p>
          </div>
        )}

        {queues.map(q => {
          const qBrokerIds: string[] = (q as any).brokerIds || [];
          const qBrokers = qBrokerIds.map(id => brokers.find(b => b.id === id)).filter(Boolean) as AppUser[];
          return (
            <div key={q.id} className="rounded-2xl overflow-hidden" style={CARD}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(0,102,255,0.15)", border: "1px solid rgba(0,170,255,0.2)" }}
                  >
                    <Zap className="w-4 h-4" style={{ color: "#00aaff" }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-white text-sm truncate">{q.name}</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: "#4a5a7a" }}>
                      Se <span style={{ color: "#00aaff" }}>{q.matchField}</span> contém{" "}
                      <span
                        className="px-1.5 py-0.5 rounded font-bold"
                        style={{ background: "rgba(0,102,255,0.15)", color: "#00e5ff" }}
                      >
                        "{q.matchValue}"
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    onClick={() => handleEditQueue(q)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-blue-500/10"
                    style={{ color: "#4a5a7a" }}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteQueueMutation.mutate(q.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                    style={{ color: "#4a5a7a" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                className="px-5 py-3 flex items-center gap-2 flex-wrap"
                style={{ borderTop: "1px solid rgba(26,39,68,0.7)" }}
              >
                <Users className="w-3 h-3 shrink-0" style={{ color: "#2a3a5a" }} />
                {qBrokers.length === 0
                  ? <span className="text-[10px] italic" style={{ color: "#3a2a2a" }}>Sem corretores vinculados</span>
                  : qBrokers.map(b => (
                    <span
                      key={b.id}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(0,30,60,0.8)", color: "#00aaff", border: "1px solid rgba(0,102,255,0.2)" }}
                    >
                      {b.name}
                    </span>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadDistribution;
