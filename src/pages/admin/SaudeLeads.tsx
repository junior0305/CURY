import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, UserX, PhoneOff, Clock, CalendarX, RefreshCw, ChevronDown, ChevronUp, ArrowRightLeft, Phone, Trash2, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Lead = {
  id: string;
  name: string;
  phone: string;
  tag: string | null;
  status: string;
  broker_id: string | null;
  created_at: string;
  last_broker_whatsapp_at: string | null;
  last_lead_response_at: string | null;
  welcome_responded_at: string | null;
  next_action_date: string | null;
  broker: { first_name: string; last_name: string | null } | null;
};

function ago(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { locale: ptBR, addSuffix: true });
}

// ─── Linha da fila ────────────────────────────────────────────────────────────

function QueueRow({ lead, onReassign, onDelete, highlight }: {
  lead: Lead;
  onReassign: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  highlight?: string;
}) {
  const brokerName = lead.broker
    ? `${lead.broker.first_name} ${lead.broker.last_name ?? ""}`.trim()
    : "Sem corretor";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 hover:bg-slate-800/40 transition-colors group">
      {/* Lead */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white text-sm truncate">{lead.name}</span>
          {lead.tag && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-700/60 text-gray-400 border border-gray-700/40 uppercase">
              {lead.tag}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <Phone className="w-3 h-3" />{lead.phone}
          </span>
          <span className="text-[11px] text-gray-600">{brokerName}</span>
        </div>
      </div>

      {/* Motivo */}
      {highlight && (
        <span className="text-[11px] font-bold text-amber-400 shrink-0 hidden sm:block max-w-[160px] text-right leading-tight">
          {highlight}
        </span>
      )}

      {/* Ações */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReassign(lead.id)}
          className="h-7 px-2.5 text-[11px] font-bold text-indigo-400 hover:text-white hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 gap-1 transition-all"
        >
          <ArrowRightLeft className="w-3 h-3" /> Redistribuir
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(lead.id, lead.name)}
          className="h-7 w-7 p-0 text-gray-600 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-500/20 transition-all opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Seção colapsável ─────────────────────────────────────────────────────────

function QueueSection({ title, count, icon: Icon, color, leads, onReassign, onDelete, getHighlight, defaultOpen = false }: {
  title: string;
  count: number;
  icon: React.ElementType;
  color: "red" | "orange" | "amber" | "slate";
  leads: Lead[];
  onReassign: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  getHighlight?: (l: Lead) => string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  if (count === 0) return null;

  const colors = {
    red:    { badge: "bg-red-500/20 text-red-300 border-red-500/30",    header: "border-red-500/30 bg-red-900/10",    icon: "text-red-400" },
    orange: { badge: "bg-orange-500/20 text-orange-300 border-orange-500/30", header: "border-orange-500/30 bg-orange-900/10", icon: "text-orange-400" },
    amber:  { badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",  header: "border-amber-500/30 bg-amber-900/10",  icon: "text-amber-400" },
    slate:  { badge: "bg-slate-500/20 text-slate-300 border-slate-500/30",  header: "border-gray-700/40 bg-slate-800/40",  icon: "text-gray-400" },
  };
  const c = colors[color];
  const visible = showAll ? leads : leads.slice(0, 8);

  return (
    <div className={cn("rounded-xl border overflow-hidden", c.header)}>
      {/* Header clicável */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <Icon className={cn("w-4 h-4 shrink-0", c.icon)} />
        <span className="font-black text-white text-sm flex-1">{title}</span>
        <span className={cn("text-[11px] font-black px-2 py-0.5 rounded-full border", c.badge)}>
          {count}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        }
      </button>

      {/* Lista */}
      {open && (
        <div className="border-t border-gray-700/30">
          {visible.map(lead => (
            <QueueRow
              key={lead.id}
              lead={lead}
              onReassign={onReassign}
              onDelete={onDelete}
              highlight={getHighlight?.(lead)}
            />
          ))}
          {!showAll && leads.length > 8 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2.5 text-[11px] font-bold text-gray-500 hover:text-gray-300 hover:bg-slate-800/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Ver mais {leads.length - 8} leads
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Principal ────────────────────────────────────────────────────────────────

export default function SaudeLeads() {
  const queryClient = useQueryClient();
  const [reassignLeadId, setReassignLeadId] = useState<string | null>(null);
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [filterBroker, setFilterBroker] = useState("all");
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleteLeadName, setDeleteLeadName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["health-leads-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone,tag,status,broker_id,created_at,last_broker_whatsapp_at,last_lead_response_at,welcome_responded_at,next_action_date,broker:profiles!broker_id(first_name,last_name)")
        .neq("status", "ABANDONED")
        .neq("status", "EXCLUDED")
        .neq("status", "CONCLUDED")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as Lead[];
    },
    refetchInterval: 60000,
  });

  const [brokerSearch, setBrokerSearch] = useState("");

  const { data: brokers = [] } = useQuery<{ id: string; first_name: string; last_name: string; team_id: string | null; team_name: string | null }[]>({
    queryKey: ["active-brokers-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, team_id, teams:team_id(name)")
        .eq("role", "BROKER")
        .eq("lead_assignment_enabled", true)
        .order("first_name");
      return (data || []).map((b: any) => ({
        id: b.id,
        first_name: b.first_name,
        last_name: b.last_name,
        team_id: b.team_id,
        team_name: b.teams?.name ?? null,
      }));
    },
  });

  // Brokers filtrados pela busca e agrupados por equipe
  const brokersByTeam = useMemo(() => {
    const q = brokerSearch.toLowerCase();
    const filtered = q
      ? brokers.filter(b => `${b.first_name} ${b.last_name ?? ""}`.toLowerCase().includes(q))
      : brokers;
    const groups: Record<string, typeof filtered> = {};
    for (const b of filtered) {
      const key = b.team_name ?? "Sem equipe";
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [brokers, brokerSearch]);

  const removeLead = (id: string) => {
    queryClient.setQueryData<Lead[]>(["health-leads-v2"], old => (old ?? []).filter(l => l.id !== id));
  };

  const handleReassign = async () => {
    if (!reassignLeadId || !selectedBrokerId) return;
    setReassigning(true);
    const { error } = await supabase
      .from("leads")
      .update({ broker_id: selectedBrokerId })
      .eq("id", reassignLeadId);
    setReassigning(false);
    if (error) { toast.error("Erro ao redistribuir"); return; }

    // Notifica o corretor destino para tocar o som no dashboard
    const lead = leads.find(l => l.id === reassignLeadId);
    if (lead) {
      await supabase.from("internal_notifications").insert({
        to_id: selectedBrokerId,
        type: "LEAD_REDISTRIBUTED",
        message: `🔄 Lead redistribuído: ${lead.name}. Acesse sua fila e atenda agora!`,
      });
    }

    toast.success("Lead redistribuído!");
    removeLead(reassignLeadId);
    setReassignLeadId(null);
    setSelectedBrokerId("");
  };

  const handleDelete = async () => {
    if (!deleteLeadId) return;
    setDeleting(true);
    const { error } = await supabase
      .from("leads")
      .update({ status: "EXCLUDED" })
      .eq("id", deleteLeadId);
    setDeleting(false);
    if (error) { toast.error("Erro ao excluir lead"); return; }
    toast.success(`Lead "${deleteLeadName}" excluído.`);
    removeLead(deleteLeadId);
    setDeleteLeadId(null);
    setDeleteLeadName("");
  };

  const openDelete = (id: string, name: string) => {
    setDeleteLeadId(id);
    setDeleteLeadName(name);
  };

  const now = Date.now();

  // Filtro por corretor
  const filtered = filterBroker === "all"
    ? leads
    : filterBroker === "none"
    ? leads.filter(l => !l.broker_id)
    : leads.filter(l => l.broker_id === filterBroker);

  // ── Grupos de problemas ──────────────────────────────────────────────────────

  // 1. Sem corretor
  const semCorretor = filtered.filter(l => !l.broker_id);

  // 2. Lead respondeu e está esperando (>2h sem resposta do corretor)
  const esperandoResposta = filtered.filter(l =>
    l.welcome_responded_at &&
    (!l.last_broker_whatsapp_at || new Date(l.last_broker_whatsapp_at) < new Date(l.welcome_responded_at)) &&
    now - new Date(l.welcome_responded_at).getTime() > 2 * 3600000
  );

  // 3. Nunca tocados (corretor tem lead mas nunca enviou nada)
  const nuncaTocados = filtered.filter(l =>
    l.broker_id &&
    !l.last_broker_whatsapp_at &&
    !esperandoResposta.find(e => e.id === l.id)
  );

  // 4. Parados +48h (último contato do corretor há mais de 48h)
  const parados = filtered.filter(l =>
    l.broker_id &&
    l.last_broker_whatsapp_at &&
    now - new Date(l.last_broker_whatsapp_at).getTime() > 48 * 3600000 &&
    !esperandoResposta.find(e => e.id === l.id)
  );

  // 5. Sem próxima ação (não está em nenhuma categoria crítica acima)
  const criticalIds = new Set([
    ...semCorretor, ...esperandoResposta, ...nuncaTocados, ...parados
  ].map(l => l.id));

  const semAcao = filtered.filter(l =>
    !criticalIds.has(l.id) &&
    !l.next_action_date
  );

  const total = semCorretor.length + esperandoResposta.length + nuncaTocados.length + parados.length;

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Fila de Intervenção
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Leads que precisam de ação imediata — {total} pendentes
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro por corretor */}
          <Select value={filterBroker} onValueChange={setFilterBroker}>
            <SelectTrigger className="h-8 text-xs bg-slate-800 border-gray-700 text-gray-300 w-[160px]">
              <SelectValue placeholder="Filtrar corretor" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-gray-700">
              <SelectItem value="all" className="text-white text-xs">Todos os corretores</SelectItem>
              <SelectItem value="none" className="text-white text-xs">Sem corretor</SelectItem>
              {brokers.map(b => (
                <SelectItem key={b.id} value={b.id} className="text-white text-xs">
                  {b.first_name} {b.last_name ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["health-leads-v2"] })}
            className="h-8 text-gray-400 hover:text-white gap-1.5 text-xs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-16 text-sm">Carregando fila...</div>
      ) : total === 0 && semAcao.length === 0 ? (
        <div className="text-center py-16 border border-emerald-500/20 rounded-xl bg-emerald-900/10">
          <p className="text-emerald-400 font-bold text-sm">Tudo em ordem!</p>
          <p className="text-gray-600 text-xs mt-1">Nenhum lead requer intervenção agora.</p>
        </div>
      ) : (
        <div className="space-y-3">

          <QueueSection
            title="Sem Corretor Atribuído"
            count={semCorretor.length}
            icon={UserX}
            color="red"
            leads={semCorretor}
            onReassign={setReassignLeadId}
            onDelete={openDelete}
            getHighlight={l => `Chegou ${ago(l.created_at)}`}
            defaultOpen
          />

          <QueueSection
            title="Lead Aguardando Resposta"
            count={esperandoResposta.length}
            icon={Clock}
            color="orange"
            leads={esperandoResposta}
            onReassign={setReassignLeadId}
            onDelete={openDelete}
            getHighlight={l => `Respondeu ${ago(l.welcome_responded_at)}`}
            defaultOpen
          />

          <QueueSection
            title="Nunca Tocados pelo Corretor"
            count={nuncaTocados.length}
            icon={PhoneOff}
            color="amber"
            leads={nuncaTocados}
            onReassign={setReassignLeadId}
            onDelete={openDelete}
            getHighlight={l => `${ago(l.created_at)}`}
            defaultOpen
          />

          <QueueSection
            title="Parados há mais de 48h"
            count={parados.length}
            icon={AlertTriangle}
            color="amber"
            leads={parados}
            onReassign={setReassignLeadId}
            onDelete={openDelete}
            getHighlight={l => `Último contato ${ago(l.last_broker_whatsapp_at)}`}
          />

          <QueueSection
            title="Sem Próxima Ação Agendada"
            count={semAcao.length}
            icon={CalendarX}
            color="slate"
            leads={semAcao}
            onReassign={setReassignLeadId}
            onDelete={openDelete}
            getHighlight={l => {
              const broker = l.broker ? `${l.broker.first_name}` : "Sem corretor";
              return broker;
            }}
          />

        </div>
      )}

      {/* Dialog redistribuição */}
      <Dialog open={!!reassignLeadId} onOpenChange={open => { if (!open) { setReassignLeadId(null); setSelectedBrokerId(""); setBrokerSearch(""); }}}>
        <DialogContent className="bg-slate-900 border border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Redistribuir Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={brokerSearch}
                onChange={e => setBrokerSearch(e.target.value)}
                placeholder="Buscar corretor..."
                className="pl-9 bg-slate-800 border-gray-600 text-white placeholder:text-gray-500 h-9"
              />
            </div>

            {/* Lista agrupada por equipe */}
            <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
              {brokersByTeam.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">Nenhum corretor encontrado</p>
              )}
              {brokersByTeam.map(([teamName, members]) => (
                <div key={teamName}>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1 mb-1">{teamName}</p>
                  <div className="space-y-1">
                    {members.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBrokerId(b.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                          selectedBrokerId === b.id
                            ? "bg-indigo-600 text-white font-bold"
                            : "bg-slate-800 text-gray-300 hover:bg-slate-700"
                        )}
                      >
                        {b.first_name} {b.last_name ?? ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedBrokerId && (
              <p className="text-xs text-indigo-400 font-medium">
                ✓ {brokers.find(b => b.id === selectedBrokerId)?.first_name} selecionado
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReassignLeadId(null); setSelectedBrokerId(""); setBrokerSearch(""); }} className="text-gray-400">
              Cancelar
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!selectedBrokerId || reassigning}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {reassigning ? "Redistribuindo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog exclusão */}
      <Dialog open={!!deleteLeadId} onOpenChange={open => { if (!open) { setDeleteLeadId(null); setDeleteLeadName(""); }}}>
        <DialogContent className="bg-slate-900 border border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-4 h-4" /> Excluir Lead
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-gray-300 text-sm">
              Tem certeza que deseja excluir <strong className="text-white">"{deleteLeadName}"</strong>?
            </p>
            <p className="text-gray-500 text-xs mt-2">
              O lead será marcado como EXCLUDED e não aparecerá mais no sistema.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteLeadId(null); setDeleteLeadName(""); }} className="text-gray-400">
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-700 hover:bg-red-600 text-white"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
