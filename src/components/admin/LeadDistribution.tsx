import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DistributionQueue } from "@/types/queue";
import { Plus, Trash2, Loader2, Save, ChevronRight, Zap, RefreshCw, Edit, Users, Lock, Unlock, MapPin, Radio } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams, fetchProfiles } from "@/integrations/supabase/profiles";
import { Team, User as AppUser } from "@/types/user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

const CARD = {
  background: "rgba(8,14,28,0.85)",
  border: "1px solid rgba(26,39,68,0.9)",
};
const CARD_INNER = {
  background: "rgba(5,10,20,0.9)",
  border: "1px solid rgba(26,39,68,0.7)",
};

const CANAL_OPTIONS = [
  "Facebook", "Google", "Instagram", "Portais", "Indicação", "Site", "WhatsApp", "Outdoor", "Outro",
];

const CANAL_COLORS: Record<string, string> = {
  Facebook:   "#1877F2",
  Google:     "#EA4335",
  Instagram:  "#E1306C",
  Portais:    "#F59E0B",
  Indicação:  "#10B981",
  Site:       "#818CF8",
  WhatsApp:   "#25D366",
  Outdoor:    "#F97316",
  Outro:      "#64748b",
};

function canalColor(canal: string | null | undefined) {
  if (!canal) return "#334155";
  return CANAL_COLORS[canal] ?? "#64748b";
}

// Tenta inferir canal e região de um match_value tipo "Amsterda_Jaguare"
function parseMatchValue(val: string): { canal: string; region: string } | null {
  if (!val.includes("_")) return null;
  const parts = val.split("_");
  return { canal: parts[0], region: parts.slice(1).join(" ") };
}

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
        lockAfterAssignment: q.lock_after_assignment ?? false,
        region: q.region ?? null,
        canal: q.canal ?? null,
        teamIds: [],
      }));
    },
  });

  const brokers = useMemo(() => allProfiles.filter(u => u.role === "BROKER"), [allProfiles]);

  const emptyForm = {
    name: "", matchField: "titulo" as const, matchValue: "",
    brokerIds: [] as string[], isActive: true, lockAfterAssignment: false,
    region: "", canal: "",
  };

  const [form, setForm] = useState(emptyForm);

  // Auto-preenche canal/região quando match_value tem "_"
  const handleMatchValueChange = (val: string) => {
    const parsed = parseMatchValue(val);
    setForm(f => ({
      ...f,
      matchValue: val,
      ...(parsed && !f.canal && !f.region ? { canal: parsed.canal, region: parsed.region } : {}),
    }));
  };

  const saveQueueMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const dbPayload = {
        name: payload.name,
        match_field: payload.matchField,
        match_value: payload.matchValue,
        broker_ids: payload.brokerIds,
        is_active: payload.isActive,
        lock_after_assignment: payload.lockAfterAssignment ?? false,
        region: payload.region?.trim() || null,
        canal: payload.canal?.trim() || null,
      };
      if (editingQueueId) {
        const { error } = await supabase.from("distribution_queues").update(dbPayload).eq("id", editingQueueId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("distribution_queues").insert(dbPayload);
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

  const resetForm = () => { setForm(emptyForm); setEditingQueueId(null); setActiveTeamId(null); setGhostBrokerCount(0); };

  const brokersInSelectedTeam = useMemo(
    () => (activeTeamId ? brokers.filter(b => b.teamId === activeTeamId) : []),
    [brokers, activeTeamId]
  );

  const handleToggleBroker = (id: string) => {
    const ids = form.brokerIds || [];
    setForm({ ...form, brokerIds: ids.includes(id) ? ids.filter(b => b !== id) : [...ids, id] });
  };

  const [ghostBrokerCount, setGhostBrokerCount] = useState(0);

  const handleEditQueue = (q: DistributionQueue) => {
    setEditingQueueId(q.id);
    const allIds: string[] = (q as any).brokerIds || [];
    const validIds = allIds.filter(id => brokers.some(b => b.id === id));
    const removed = allIds.length - validIds.length;
    setGhostBrokerCount(removed);
    setForm({
      name: q.name,
      matchField: q.matchField,
      matchValue: q.matchValue,
      brokerIds: validIds,
      isActive: q.isActive,
      lockAfterAssignment: q.lockAfterAssignment ?? false,
      region: q.region ?? "",
      canal: q.canal ?? "",
    });
  };

  if (isLoadingTeams || isLoadingProfiles || isLoadingQueues) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#0066ff" }} />
      </div>
    );
  }

  const selectedCount = form.brokerIds?.length || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Formulário ──────────────────────────────────────────────────────── */}
      <div className="lg:col-span-1 rounded-2xl p-5 space-y-4 sticky top-4 h-fit" style={CARD}>
        <div className="flex items-center gap-2">
          {editingQueueId
            ? <RefreshCw className="w-4 h-4" style={{ color: "#00aaff" }} />
            : <Plus className="w-4 h-4" style={{ color: "#00aaff" }} />}
          <h2 className="font-black text-white text-sm uppercase tracking-widest">
            {editingQueueId ? "Editar Fila" : "Nova Fila"}
          </h2>
        </div>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>Nome da Fila</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Facebook Jaguaré"
            className="rounded-xl text-white placeholder-gray-700 h-9 text-sm"
            style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}
          />
        </div>

        {/* Regra de match */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>Regra de Entrada</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.matchField} onValueChange={(val: any) => setForm({ ...form, matchField: val })}>
              <SelectTrigger className="rounded-xl text-white h-9 text-xs"
                style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-gray-700 text-white">
                <SelectItem value="titulo">Título</SelectItem>
                <SelectItem value="tag">Tag</SelectItem>
                <SelectItem value="source">Origem / Canal</SelectItem>
                <SelectItem value="campaign">Campanha</SelectItem>
                <SelectItem value="tipo_trabalho">Tipo de trabalho</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Valor" value={form.matchValue}
              onChange={e => handleMatchValueChange(e.target.value)}
              className="rounded-xl text-white placeholder-gray-700 h-9 text-xs"
              style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)" }}
            />
          </div>
          <p className="text-[10px]" style={{ color: "#2a3a5a" }}>
            Leads onde <span style={{ color: "#00aaff" }}>{form.matchField}</span> ={" "}
            <span className="px-1 rounded font-bold" style={{ background: "rgba(0,102,255,0.15)", color: "#00e5ff" }}>
              "{form.matchValue || "..."}"
            </span>
          </p>
          {form.matchField === "tipo_trabalho" && (
            <p className="text-[10px] rounded-lg px-2 py-1.5 mt-1" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)", color: "#38BDF8" }}>
              Valores válidos que chegam do Make: <strong>CLT</strong> · <strong>AUTONOMO</strong> · <strong>FUNCIONARIO_PUBLICO</strong>
            </p>
          )}
        </div>

        {/* ── REGIÃO + CANAL ─────────────────────────────────────────────── */}
        <div className="rounded-xl p-3 space-y-3" style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#00D4FF" }}>
            Segmentação · Região & Canal
          </p>

          {/* Canal */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "#475569" }}>
              <Radio className="w-3 h-3" /> Canal de marketing
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CANAL_OPTIONS.map(opt => {
                const active = form.canal === opt;
                const color  = canalColor(opt);
                return (
                  <button key={opt} type="button" onClick={() => setForm(f => ({ ...f, canal: active ? "" : opt }))}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all"
                    style={{
                      background: active ? `${color}22` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? `${color}66` : "rgba(255,255,255,0.08)"}`,
                      color: active ? color : "#334155",
                      boxShadow: active ? `0 0 8px ${color}33` : "none",
                    }}>
                    {opt}
                  </button>
                );
              })}
            </div>
            {/* Campo livre para canal customizado */}
            <Input value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
              placeholder="Ou digite um canal personalizado..."
              className="h-7 text-[11px] mt-1 rounded-lg"
              style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)", color: "#fff" }}
            />
          </div>

          {/* Região */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "#475569" }}>
              <MapPin className="w-3 h-3" /> Região / Bairro
            </Label>
            <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
              placeholder="Ex: Jaguaré, Zona Oeste, Morumbi..."
              className="h-8 text-xs rounded-lg"
              style={{ background: "rgba(5,10,20,0.9)", border: "1px solid rgba(26,39,68,0.9)", color: "#fff" }}
            />
          </div>
        </div>

        {/* Corretores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4a5a7a" }}>Corretores da Fila</Label>
            {selectedCount > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,102,255,0.2)", color: "#00aaff", border: "1px solid rgba(0,170,255,0.3)" }}>
                {selectedCount} selecionado{selectedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2" style={{ height: 180 }}>
            <div className="rounded-xl overflow-hidden" style={CARD_INNER}>
              <div className="px-2 py-1.5 border-b" style={{ borderColor: "rgba(26,39,68,0.7)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#2a3a5a" }}>Equipes</p>
              </div>
              <ScrollArea className="h-[140px]">
                {teams.length === 0
                  ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>Sem equipes</p>
                  : teams.map(team => (
                    <button key={team.id} onClick={() => setActiveTeamId(team.id)}
                      className="w-full flex items-center justify-between px-2.5 py-2 text-xs transition-all"
                      style={{
                        color: activeTeamId === team.id ? "#ffffff" : "#4a5a7a",
                        background: activeTeamId === team.id ? "rgba(0,102,255,0.15)" : "transparent",
                      }}>
                      <span className="truncate">{team.name}</span>
                      <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                    </button>
                  ))
                }
              </ScrollArea>
            </div>
            <div className="rounded-xl overflow-hidden" style={CARD_INNER}>
              <div className="px-2 py-1.5 border-b" style={{ borderColor: "rgba(26,39,68,0.7)" }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#2a3a5a" }}>Corretores</p>
              </div>
              <ScrollArea className="h-[140px]">
                {!activeTeamId
                  ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>← Selecione equipe</p>
                  : brokersInSelectedTeam.length === 0
                    ? <p className="text-[10px] text-center py-6" style={{ color: "#2a3a5a" }}>Sem corretores</p>
                    : brokersInSelectedTeam.map(broker => {
                      const checked = form.brokerIds?.includes(broker.id);
                      return (
                        <button key={broker.id} onClick={() => handleToggleBroker(broker.id)}
                          className="w-full flex items-center justify-between px-2.5 py-2 text-xs transition-all"
                          style={{
                            color: checked ? "#ffffff" : "#4a5a7a",
                            background: checked ? "rgba(0,102,255,0.12)" : "transparent",
                          }}>
                          <span className="truncate">{broker.name}</span>
                          <Checkbox checked={!!checked} onCheckedChange={() => handleToggleBroker(broker.id)}
                            className="h-3 w-3 pointer-events-none" />
                        </button>
                      );
                    })
                }
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Campanha Exclusiva */}
        <button type="button" onClick={() => setForm(f => ({ ...f, lockAfterAssignment: !f.lockAfterAssignment }))}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
          style={{
            background: form.lockAfterAssignment ? "rgba(245,158,11,.1)" : "rgba(255,255,255,.03)",
            border: form.lockAfterAssignment ? "1px solid rgba(245,158,11,.35)" : "1px solid rgba(26,39,68,.9)",
          }}>
          <div className="flex items-center gap-2">
            {form.lockAfterAssignment
              ? <Lock className="w-3.5 h-3.5 text-amber-400" />
              : <Unlock className="w-3.5 h-3.5" style={{ color: "#4a5a7a" }} />}
            <div className="text-left">
              <p className="text-xs font-bold" style={{ color: form.lockAfterAssignment ? "#FBBF24" : "#4a5a7a" }}>
                🔒 Campanha Exclusiva dos Corretores
              </p>
              <p className="text-[9px]" style={{ color: form.lockAfterAssignment ? "#d97706" : "#2a3a5a" }}>
                {form.lockAfterAssignment
                  ? "Leads pertencem APENAS aos corretores selecionados — nunca redistribuído"
                  : "Leads podem ser redistribuídos para outros corretores da equipe"}
              </p>
            </div>
          </div>
          <div className="w-8 h-4 rounded-full relative transition-all shrink-0"
            style={{ background: form.lockAfterAssignment ? "rgba(245,158,11,.6)" : "rgba(26,39,68,.9)" }}>
            <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
              style={{ left: form.lockAfterAssignment ? "calc(100% - 14px)" : "2px" }} />
          </div>
        </button>

        {/* Aviso: corretores excluídos do sistema removidos da fila */}
        {ghostBrokerCount > 0 && (
          <div className="px-3 py-2 rounded-lg text-[9px] leading-relaxed"
            style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171" }}>
            <span className="font-black">⚠️ {ghostBrokerCount} corretor{ghostBrokerCount > 1 ? "es removidos" : " removido"}:</span>{" "}
            {ghostBrokerCount > 1 ? "Esses corretores foram" : "Esse corretor foi"} excluído{ghostBrokerCount > 1 ? "s" : ""} do sistema e{" "}
            {ghostBrokerCount > 1 ? "foram retirados" : "foi retirado"} automaticamente desta fila.
            Clique em <span className="font-black">Atualizar</span> para confirmar.
          </div>
        )}

        {/* Aviso quando campanha exclusiva está ativa */}
        {form.lockAfterAssignment && form.brokerIds.length > 0 && (
          <div className="px-3 py-2 rounded-lg text-[9px] leading-relaxed"
            style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", color: "#d97706" }}>
            <span className="font-black">⚠️ Campanha de investimento próprio:</span> os {form.brokerIds.length} corretor(es) selecionado(s) receberão os leads em rodízio e o sistema nunca os redistribuirá para outros.
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          {editingQueueId && (
            <Button variant="ghost" onClick={resetForm} className="flex-1 h-9 text-xs rounded-xl"
              style={{ color: "#4a5a7a", border: "1px solid rgba(26,39,68,0.9)" }}>
              Cancelar
            </Button>
          )}
          <Button onClick={() => saveQueueMutation.mutate(form)}
            disabled={!form.name || saveQueueMutation.isPending}
            className="flex-1 h-9 text-xs font-black rounded-xl"
            style={{ background: "linear-gradient(135deg, #0055cc 0%, #0066ff 100%)", boxShadow: "0 0 16px rgba(0,102,255,0.35)" }}>
            {saveQueueMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Save className="w-3.5 h-3.5 mr-1.5" />{editingQueueId ? "Atualizar" : "Criar Fila"}</>}
          </Button>
        </div>
      </div>

      {/* ── Lista de filas ──────────────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4" style={{ color: "#00aaff" }} />
          <h2 className="font-black text-white text-sm uppercase tracking-widest">Filas Ativas</h2>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-1"
            style={{ background: "rgba(0,102,255,0.15)", color: "#00aaff", border: "1px solid rgba(0,170,255,0.2)" }}>
            {queues.length}
          </span>
        </div>

        {queues.length === 0 && (
          <div className="rounded-2xl p-12 text-center"
            style={{ border: "1px dashed rgba(26,39,68,0.9)", background: "rgba(5,10,20,0.5)" }}>
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-10" style={{ color: "#0066ff" }} />
            <p className="text-sm font-bold" style={{ color: "#2a3a5a" }}>Nenhuma fila criada</p>
            <p className="text-xs mt-1" style={{ color: "#1a2a3a" }}>Crie uma fila para distribuir leads automaticamente</p>
          </div>
        )}

        {queues.map(q => {
          const qBrokerIds: string[] = (q as any).brokerIds || [];
          const qBrokers = qBrokerIds.map(id => brokers.find(b => b.id === id)).filter(Boolean) as AppUser[];
          const cc = canalColor(q.canal);

          return (
            <div key={q.id} className="rounded-2xl overflow-hidden" style={CARD}>

              {/* ── Topo colorido por canal ────────────────────────────── */}
              <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${cc}88, ${cc}22)` }} />

              <div className="flex items-start justify-between px-5 pt-4 pb-3 gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Ícone canal */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${cc}18`, border: `1px solid ${cc}40` }}>
                    <Radio className="w-4 h-4" style={{ color: cc }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Nome + lock badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="font-black text-white text-sm">{q.name}</h3>
                      {q.lockAfterAssignment && (
                        <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: "rgba(245,158,11,.15)", color: "#FBBF24", border: "1px solid rgba(245,158,11,.3)" }}>
                          <Lock className="w-2.5 h-2.5" /> EXCLUSIVA
                        </span>
                      )}
                    </div>

                    {/* ── Região e Canal em destaque ──────────────────── */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {q.canal ? (
                        <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full"
                          style={{ background: `${cc}18`, color: cc, border: `1px solid ${cc}44` }}>
                          <Radio className="w-3 h-3" />
                          {q.canal}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full italic"
                          style={{ background: "rgba(255,255,255,0.03)", color: "#334155", border: "1px solid rgba(255,255,255,0.06)" }}>
                          sem canal
                        </span>
                      )}

                      {q.region ? (
                        <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full"
                          style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
                          <MapPin className="w-3 h-3" />
                          {q.region}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full italic"
                          style={{ background: "rgba(255,255,255,0.03)", color: "#334155", border: "1px solid rgba(255,255,255,0.06)" }}>
                          sem região
                        </span>
                      )}
                    </div>

                    {/* Regra de match */}
                    <p className="text-[11px]" style={{ color: "#4a5a7a" }}>
                      Se <span style={{ color: "#00aaff" }}>{q.matchField}</span> contém{" "}
                      <span className="px-1.5 py-0.5 rounded font-bold"
                        style={{ background: "rgba(0,102,255,0.15)", color: "#00e5ff" }}>
                        "{q.matchValue}"
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEditQueue(q)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-blue-500/10"
                    style={{ color: "#4a5a7a" }}>
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteQueueMutation.mutate(q.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                    style={{ color: "#4a5a7a" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Corretores */}
              <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap"
                style={{ borderTop: "1px solid rgba(26,39,68,0.7)" }}>
                <Users className="w-3 h-3 shrink-0" style={{ color: "#2a3a5a" }} />
                {qBrokers.length === 0 && qBrokerIds.length === 0
                  ? <span className="text-[10px] italic" style={{ color: "#3a2a2a" }}>Sem corretores vinculados</span>
                  : qBrokers.map(b => (
                    <span key={b.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(0,30,60,0.8)", color: "#00aaff", border: "1px solid rgba(0,102,255,0.2)" }}>
                      {b.name}
                    </span>
                  ))
                }
                {/* Corretores excluídos que ainda estão no array */}
                {qBrokerIds.length > qBrokers.length && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>
                    +{qBrokerIds.length - qBrokers.length} excluído{qBrokerIds.length - qBrokers.length > 1 ? "s" : ""} — edite para limpar
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadDistribution;
