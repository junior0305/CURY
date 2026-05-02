import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send, UserCheck, UserX, Search, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Bot { id: string; name: string; instance_name: string; status: string; team_manager_id: string|null; }
interface Manager { id: string; first_name: string|null; last_name: string|null; }

export default function AtribuirChips({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos"|"orfaos"|"atribuidos">("todos");
  const [pendingChanges, setPendingChanges] = useState<Record<string, string|null>>({});

  const { data: bots = [], isLoading } = useQuery<Bot[]>({
    queryKey: ["allBotInstances"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bot_instances")
        .select("id, name, instance_name, status, team_manager_id")
        .order("name");
      return (data || []) as Bot[];
    },
  });

  const { data: managers = [] } = useQuery<Manager[]>({
    queryKey: ["allManagers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("role", "MANAGER")
        .order("first_name");
      return (data || []) as Manager[];
    },
  });

  const managerById = useMemo(() => Object.fromEntries(managers.map(m => [m.id, m])), [managers]);

  const filteredBots = useMemo(() => {
    return bots.filter(b => {
      const q = search.trim().toLowerCase();
      if (q && !b.name.toLowerCase().includes(q) && !b.instance_name.toLowerCase().includes(q)) return false;
      const effective = pendingChanges[b.id] !== undefined ? pendingChanges[b.id] : b.team_manager_id;
      if (filter === "orfaos" && effective) return false;
      if (filter === "atribuidos" && !effective) return false;
      return true;
    });
  }, [bots, search, filter, pendingChanges]);

  const stats = useMemo(() => ({
    total: bots.length,
    orfaos: bots.filter(b => !(pendingChanges[b.id] !== undefined ? pendingChanges[b.id] : b.team_manager_id)).length,
    atribuidos: bots.filter(b => !!(pendingChanges[b.id] !== undefined ? pendingChanges[b.id] : b.team_manager_id)).length,
  }), [bots, pendingChanges]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(pendingChanges);
      for (const [botId, managerId] of updates) {
        const { error } = await supabase.from("bot_instances")
          .update({ team_manager_id: managerId })
          .eq("id", botId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${Object.keys(pendingChanges).length} chip(s) atualizado(s)`);
      setPendingChanges({});
      queryClient.invalidateQueries({ queryKey: ["allBotInstances"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const SaveButton = Object.keys(pendingChanges).length > 0 ? (
    <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
      className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2"
      style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.5)", color: "#10B981" }}>
      <CheckCircle2 className="w-4 h-4" />
      Salvar {Object.keys(pendingChanges).length} mudança(s)
    </button>
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Define qual chip pertence a qual gerente — usado nas campanhas de prospecção do Manager</p>
          {SaveButton}
        </div>
        {renderBody()}
      </div>
    );
  }

  function renderBody() {
    return (
      <>
      {/* Stats + filtros */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: stats.total, color: "#94A3B8", filter: "todos" as const },
            { label: "Atribuídos", value: stats.atribuidos, color: "#10B981", filter: "atribuidos" as const },
            { label: "Órfãos", value: stats.orfaos, color: "#F59E0B", filter: "orfaos" as const },
          ].map(s => (
            <button key={s.filter} onClick={() => setFilter(s.filter)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: filter === s.filter ? `${s.color}18` : "rgba(15,23,42,0.5)",
                border: `1px solid ${filter === s.filter ? `${s.color}50` : "rgba(51,65,85,0.5)"}`,
              }}>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mt-1">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou instance_name…"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm outline-none"
          />
        </div>

        {/* Lista */}
        <div className="space-y-1.5">
          {isLoading && <p className="text-center text-sm text-gray-500 py-8">Carregando…</p>}
          {!isLoading && filteredBots.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">Nenhum chip nesta combinação de filtros</p>
          )}
          {filteredBots.map(b => {
            const effective = pendingChanges[b.id] !== undefined ? pendingChanges[b.id] : b.team_manager_id;
            const manager = effective ? managerById[effective] : null;
            const isDirty = pendingChanges[b.id] !== undefined;
            const statusColor = b.status === "open" ? "#10B981" : b.status === "connecting" ? "#F59E0B" : "#64748B";
            return (
              <div key={b.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  background: isDirty ? "rgba(167,139,250,0.06)" : "rgba(15,23,42,0.4)",
                  border: `1px solid ${isDirty ? "rgba(167,139,250,0.4)" : "rgba(51,65,85,0.4)"}`,
                }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{b.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{b.instance_name} · status: {b.status}</div>
                </div>
                {manager ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <UserCheck className="w-3 h-3" /> {manager.first_name}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <UserX className="w-3 h-3" /> Órfão
                  </div>
                )}
                <select
                  value={effective || ""}
                  onChange={e => setPendingChanges(p => ({ ...p, [b.id]: e.target.value || null }))}
                  className="px-2 py-1.5 rounded-md bg-slate-800 border border-slate-600 text-xs outline-none min-w-[140px]"
                >
                  <option value="">— sem dono —</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name || ""}</option>
                  ))}
                </select>
                {isDirty && (
                  <button onClick={() => setPendingChanges(p => { const c = { ...p }; delete c[b.id]; return c; })}
                    className="text-[10px] text-gray-500 hover:text-gray-300">desfazer</button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-700/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin")} className="p-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-400" />
              Atribuir Chips à Equipe
            </h1>
            <p className="text-xs text-gray-500">Define qual chip pertence a qual gerente — usado nas campanhas de prospecção</p>
          </div>
        </div>
        {SaveButton}
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {renderBody()}
      </main>
    </div>
  );
}
