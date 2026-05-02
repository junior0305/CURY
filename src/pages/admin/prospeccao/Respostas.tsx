import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RefreshCw, MessageSquare, Bot, User as UserIcon, UserCheck, UserX,
  Bell, Send, Eye, Filter, Loader2, Inbox,
} from "lucide-react";

interface ConvRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  bot_name: string | null;
  bot_instance_id: string | null;
  msgs_lead: number;
  msgs_out_ia: number;
  msgs_out_broker: number;
  last_msg_at: string;
  last_msg_sender: "ia" | "broker" | "lead" | string;
  last_outgoing_at: string | null;
  last_outgoing_sender: "ia" | "broker" | string | null;
  // From lead lookup
  lead_status: string | null;
  broker_id: string | null;
  broker_name: string | null;
  manager_name: string | null;
  manager_bot_instance_id: string | null;
  broker_phone: string | null;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  manager_id: string | null;
  bot_instance_id: string | null;
  phone: string | null;
}

const WINDOW_OPTIONS = [
  { v: 24,  label: "24h" },
  { v: 168, label: "7d"  },
  { v: 720, label: "30d" },
] as const;

function senderLabel(s: string|null) {
  if (s === "ia")     return { label: "IA",      color: "#A78BFA", icon: Bot };
  if (s === "broker") return { label: "Corretor",color: "#10B981", icon: UserIcon };
  if (s === "lead")   return { label: "Lead",    color: "#00D4FF", icon: MessageSquare };
  return { label: "—", color: "#64748B", icon: MessageSquare };
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function Respostas() {
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowH, setWindowH] = useState<number>(168);
  const [filterStatus, setFilterStatus] = useState<"todos"|"sem_corretor"|"com_corretor"|"ia_atendendo"|"esperando_humano">("todos");
  const [filterCampaign, setFilterCampaign] = useState<string>("todas");
  const [campaigns, setCampaigns] = useState<{id: string; name: string}[]>([]);
  const [allBrokers, setAllBrokers] = useState<Profile[]>([]);
  const [assigningConv, setAssigningConv] = useState<string|null>(null);
  const [busyConv, setBusyConv] = useState<string|null>(null);

  // ── Carregar campanhas + brokers (usados pelo dropdown) ────────────────────
  useEffect(() => {
    supabase.from("ia_campaigns").select("id, name").order("name")
      .then(({ data }) => setCampaigns(data || []));
    supabase.from("profiles").select("id, first_name, last_name, role, manager_id, bot_instance_id, phone")
      .eq("role", "BROKER").eq("lead_assignment_enabled", true)
      .then(({ data }) => setAllBrokers((data || []) as Profile[]));
  }, []);

  // ── Carregar conversas com resposta ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - windowH * 3600000).toISOString();

    // 1) Conversas com pelo menos 1 mensagem incoming na janela
    let q = supabase
      .from("ia_conversations")
      .select(`
        id, lead_id, lead_name, lead_phone, campaign_id,
        bot_instance_id,
        ia_campaigns!campaign_id(name),
        bot_instances!bot_instance_id(name)
      `)
      .gte("last_message_at", cutoff)
      .gte("messages_count", 2)
      .not("campaign_id", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (filterCampaign !== "todas") q = q.eq("campaign_id", filterCampaign);

    const { data: convs } = await q;
    if (!convs || convs.length === 0) { setRows([]); setLoading(false); return; }

    // 2) Pra cada conv, pegar mensagens (em batch)
    const convIds = convs.map((c: any) => c.id);
    const { data: msgs } = await supabase
      .from("ia_messages")
      .select("conversation_id, direction, sender_type, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: true });

    type MsgAgg = { msgs_lead: number; msgs_out_ia: number; msgs_out_broker: number; last_msg_at: string; last_msg_sender: string; last_outgoing_at: string|null; last_outgoing_sender: string|null };
    const aggMap = new Map<string, MsgAgg>();
    for (const c of convs) aggMap.set(c.id, { msgs_lead: 0, msgs_out_ia: 0, msgs_out_broker: 0, last_msg_at: "", last_msg_sender: "", last_outgoing_at: null, last_outgoing_sender: null });
    for (const m of msgs || []) {
      const a = aggMap.get(m.conversation_id);
      if (!a) continue;
      if (m.direction === "incoming") a.msgs_lead++;
      else if (m.sender_type === "ia") a.msgs_out_ia++;
      else if (m.sender_type === "broker") a.msgs_out_broker++;
      a.last_msg_at = m.created_at;
      a.last_msg_sender = m.direction === "incoming" ? "lead" : (m.sender_type || "");
      if (m.direction === "outgoing") {
        a.last_outgoing_at = m.created_at;
        a.last_outgoing_sender = m.sender_type || null;
      }
    }

    // 3) Filtra só convs com pelo menos 1 msg do lead
    const withResponse = convs.filter((c: any) => (aggMap.get(c.id)?.msgs_lead ?? 0) > 0);

    // 4) Buscar dados dos leads (broker) em batch
    const leadIds = withResponse.map((c: any) => c.lead_id).filter(Boolean) as string[];
    const leadMap = new Map<string, any>();
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select(`id, status, broker_id, profiles:broker_id(id, first_name, last_name, manager_id, phone)`)
        .in("id", leadIds);
      (leads || []).forEach((l: any) => leadMap.set(l.id, l));
    }

    // 5) Buscar bot_instance_id dos managers (pra cobrança via WhatsApp)
    const managerIds = Array.from(new Set(
      Array.from(leadMap.values()).map((l: any) => l.profiles?.manager_id).filter(Boolean)
    ));
    const managerBotMap = new Map<string, { bot_instance_id: string|null; first_name: string|null }>();
    if (managerIds.length > 0) {
      const { data: managers } = await supabase
        .from("profiles").select("id, first_name, bot_instance_id")
        .in("id", managerIds);
      (managers || []).forEach((m: any) => managerBotMap.set(m.id, { bot_instance_id: m.bot_instance_id, first_name: m.first_name }));
    }

    // 6) Montar rows
    const out: ConvRow[] = withResponse.map((c: any) => {
      const a = aggMap.get(c.id)!;
      const lead = c.lead_id ? leadMap.get(c.lead_id) : null;
      const broker = lead?.profiles;
      const manager = broker?.manager_id ? managerBotMap.get(broker.manager_id) : null;
      return {
        id: c.id,
        lead_id: c.lead_id,
        lead_name: c.lead_name,
        lead_phone: c.lead_phone,
        campaign_id: c.campaign_id,
        campaign_name: c.ia_campaigns?.name || null,
        bot_name: c.bot_instances?.name || null,
        bot_instance_id: c.bot_instance_id,
        msgs_lead: a.msgs_lead,
        msgs_out_ia: a.msgs_out_ia,
        msgs_out_broker: a.msgs_out_broker,
        last_msg_at: a.last_msg_at,
        last_msg_sender: a.last_msg_sender,
        last_outgoing_at: a.last_outgoing_at,
        last_outgoing_sender: a.last_outgoing_sender,
        lead_status: lead?.status || null,
        broker_id: broker?.id || null,
        broker_name: broker ? `${broker.first_name || ""} ${broker.last_name || ""}`.trim() : null,
        manager_name: manager?.first_name || null,
        manager_bot_instance_id: manager?.bot_instance_id || null,
        broker_phone: broker?.phone || null,
      };
    });

    setRows(out);
    setLoading(false);
  }, [windowH, filterCampaign]);

  useEffect(() => { load(); }, [load]);

  // ── Filtros derivados ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterStatus === "sem_corretor"   && r.broker_id) return false;
      if (filterStatus === "com_corretor"   && !r.broker_id) return false;
      if (filterStatus === "ia_atendendo"   && r.last_outgoing_sender !== "ia") return false;
      if (filterStatus === "esperando_humano") {
        // Lead falou por último E sem resposta humana há >2h
        if (r.last_msg_sender !== "lead") return false;
        const hours = r.last_msg_at ? (Date.now() - new Date(r.last_msg_at).getTime()) / 3600000 : 0;
        if (hours < 2) return false;
      }
      return true;
    });
  }, [rows, filterStatus]);

  const stats = useMemo(() => ({
    total: rows.length,
    com_corretor: rows.filter(r => r.broker_id).length,
    sem_corretor: rows.filter(r => !r.broker_id).length,
    ia_atendeu: rows.filter(r => r.msgs_out_ia > 0).length,
    humano_atendeu: rows.filter(r => r.msgs_out_broker > 0).length,
    esperando_humano: rows.filter(r => {
      if (r.last_msg_sender !== "lead") return false;
      const h = r.last_msg_at ? (Date.now() - new Date(r.last_msg_at).getTime()) / 3600000 : 0;
      return h >= 2;
    }).length,
  }), [rows]);

  // ── Atribuir corretor a um lead ────────────────────────────────────────────
  async function assignBroker(row: ConvRow, brokerId: string) {
    setBusyConv(row.id);
    try {
      const broker = allBrokers.find(b => b.id === brokerId);
      if (!broker) throw new Error("Corretor não encontrado");

      // Se conv já tem lead_id, só atualiza broker
      if (row.lead_id) {
        const { error } = await supabase.from("leads")
          .update({ broker_id: brokerId, manager_id: broker.manager_id, status: "REACTIVATED", last_interaction_at: new Date().toISOString() })
          .eq("id", row.lead_id);
        if (error) throw error;
      } else {
        // Cria novo lead a partir da conversation
        const { data: newLead, error } = await supabase.from("leads").insert({
          name: row.lead_name || "Lead da prospecção",
          phone: row.lead_phone || "",
          status: "REACTIVATED",
          broker_id: brokerId,
          manager_id: broker.manager_id,
          tag: row.campaign_name ? `CAMP_${row.campaign_name}` : "CAMPANHA",
          last_interaction_at: new Date().toISOString(),
          contact_attempts: 0,
        }).select().single();
        if (error) throw error;
        // Vincula a conversation ao lead novo
        await supabase.from("ia_conversations")
          .update({ lead_id: newLead.id, is_crm_lead: true })
          .eq("id", row.id);
      }

      // Auditoria
      await supabase.from("lead_notes").insert({
        lead_id: row.lead_id || undefined,
        content: `Lead atribuído a ${broker.first_name} via aba Respostas (Admin) — origem campanha "${row.campaign_name || "—"}"`,
        type: "SYSTEM",
      }).then(() => {}, () => {});

      toast.success(`Lead atribuído a ${broker.first_name}`);
      setAssigningConv(null);
      await load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setBusyConv(null);
    }
  }

  // ── Cobrar corretor (Dashboard + WhatsApp) ─────────────────────────────────
  async function chargeBroker(row: ConvRow) {
    if (!row.broker_id) { toast.error("Lead sem corretor"); return; }
    setBusyConv(row.id);
    try {
      const hoursWaiting = row.last_msg_at ? Math.round((Date.now() - new Date(row.last_msg_at).getTime()) / 3600000) : 0;
      const message = `🔔 *Cobrança do gerente*\n\nO lead *${row.lead_name || row.lead_phone}* respondeu sua campanha e está aguardando há ${hoursWaiting}h.\n\nAtenda agora.`;

      // Notification interna
      await supabase.from("internal_notifications").insert({
        to_id: row.broker_id,
        type: "MANAGER_ALERT",
        title: "Lead da campanha aguardando atendimento",
        message: `${row.lead_name || row.lead_phone} respondeu há ${hoursWaiting}h. Atenda agora.`,
        related_lead_id: row.lead_id,
      }).then(() => {}, () => {});

      // WhatsApp se possível
      if (row.broker_phone && row.manager_bot_instance_id) {
        const { data: result } = await supabase.functions.invoke("send_whatsapp_message", {
          body: { botId: row.manager_bot_instance_id, phone: row.broker_phone, message },
        });
        if (result?.success) {
          toast.success(`✅ Cobrança enviada (Dashboard + WhatsApp)`);
        } else {
          toast.warning(`Cobrança salva no Dashboard. WhatsApp falhou: ${result?.error || "—"}`);
        }
      } else {
        toast.success(`Cobrança salva no Dashboard ${!row.manager_bot_instance_id ? "(manager sem bot configurado)" : "(corretor sem telefone)"}`);
      }
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setBusyConv(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Inbox className="w-5 h-5 text-orange-400" />
          Leads que responderam
        </h3>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-slate-800 hover:bg-slate-700 text-gray-300 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: "Total",            value: stats.total,            color: "#94A3B8", filter: "todos" as const },
          { label: "Com corretor",     value: stats.com_corretor,     color: "#10B981", filter: "com_corretor" as const },
          { label: "Sem corretor",     value: stats.sem_corretor,     color: "#F59E0B", filter: "sem_corretor" as const },
          { label: "IA atendeu",       value: stats.ia_atendeu,       color: "#A78BFA", filter: "ia_atendendo" as const },
          { label: "Humano atendeu",   value: stats.humano_atendeu,   color: "#00D4FF", filter: "todos" as const },
          { label: "Esperando humano", value: stats.esperando_humano, color: "#EF4444", filter: "esperando_humano" as const },
        ].map(s => (
          <button key={s.label} onClick={() => setFilterStatus(s.filter)}
            className="rounded-lg p-2.5 text-left transition-all"
            style={{
              background: filterStatus === s.filter ? `${s.color}18` : "rgba(15,23,42,0.5)",
              border: `1px solid ${filterStatus === s.filter ? `${s.color}50` : "rgba(51,65,85,0.5)"}`,
            }}>
            <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filtros janela + campanha */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-1 border border-slate-700/50">
          <Filter className="w-3.5 h-3.5 text-gray-500 ml-1" />
          {WINDOW_OPTIONS.map(o => (
            <button key={o.v} onClick={() => setWindowH(o.v)}
              className="px-2 py-1 rounded text-[11px] font-bold"
              style={{
                background: windowH === o.v ? "rgba(249,115,22,0.18)" : "transparent",
                color: windowH === o.v ? "#F97316" : "#94A3B8",
              }}>
              {o.label}
            </button>
          ))}
        </div>
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)}
          className="px-3 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-700 text-gray-300 outline-none">
          <option value="todas">Todas as campanhas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            <Inbox className="w-10 h-10 opacity-20 mx-auto mb-3" />
            Nenhum lead nesta combinação de filtros
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-slate-800/60 border-b border-slate-700/50">
              <tr>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Lead</th>
                <th className="text-left px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Campanha · Chip</th>
                <th className="text-center px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Trocas</th>
                <th className="text-left px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Última msg da conv</th>
                <th className="text-left px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Última outgoing</th>
                <th className="text-left px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Corretor</th>
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-gray-500">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const lastSender = senderLabel(r.last_msg_sender);
                const lastOut    = senderLabel(r.last_outgoing_sender);
                const LastIcon = lastSender.icon;
                const OutIcon  = lastOut.icon;
                const hoursWaiting = r.last_msg_sender === "lead" && r.last_msg_at
                  ? (Date.now() - new Date(r.last_msg_at).getTime()) / 3600000 : 0;
                const isCold = hoursWaiting >= 2;
                return (
                  <tr key={r.id} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-white text-[12px]">{r.lead_name || "(sem nome)"}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{r.lead_phone}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-[11px] text-gray-300">{r.campaign_name || "—"}</div>
                      <div className="text-[10px] text-gray-500">via {r.bot_name || "—"}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-[10px] text-cyan-300">{r.msgs_lead}</span>
                      <span className="text-[10px] text-gray-600 mx-0.5">·</span>
                      <span className="text-[10px] text-purple-300">{r.msgs_out_ia}</span>
                      <span className="text-[10px] text-gray-600 mx-0.5">·</span>
                      <span className="text-[10px] text-emerald-300">{r.msgs_out_broker}</span>
                      <div className="text-[9px] text-gray-600 mt-0.5">lead·IA·broker</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${lastSender.color}15`, color: lastSender.color, border: `1px solid ${lastSender.color}30` }}>
                        <LastIcon className="w-3 h-3" /> {lastSender.label}
                      </span>
                      <div className="text-[10px] text-gray-500 mt-0.5">há {timeAgo(r.last_msg_at)}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      {r.last_outgoing_at ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${lastOut.color}15`, color: lastOut.color, border: `1px solid ${lastOut.color}30` }}>
                            <OutIcon className="w-3 h-3" /> {lastOut.label}
                          </span>
                          <div className="text-[10px] text-gray-500 mt-0.5">há {timeAgo(r.last_outgoing_at)}</div>
                        </>
                      ) : <span className="text-[10px] text-gray-600">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {r.broker_name ? (
                        <>
                          <div className="text-[11px] text-emerald-300 font-bold">{r.broker_name.split(" ")[0]}</div>
                          {r.manager_name && <div className="text-[9px] text-gray-500">eq. {r.manager_name}</div>}
                        </>
                      ) : (
                        <span className="text-[10px] text-amber-400 font-bold">— sem corretor</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!r.broker_name && (
                          <button onClick={() => setAssigningConv(assigningConv === r.id ? null : r.id)}
                            disabled={busyConv === r.id}
                            className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                            style={{ background: "rgba(0,212,255,0.12)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)" }}>
                            <UserCheck className="w-3 h-3" /> Atribuir
                          </button>
                        )}
                        {r.broker_name && (
                          <button onClick={() => chargeBroker(r)} disabled={busyConv === r.id}
                            className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                            style={{
                              background: isCold ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.12)",
                              color: isCold ? "#EF4444" : "#F59E0B",
                              border: `1px solid ${isCold ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.3)"}`
                            }}>
                            <Bell className="w-3 h-3" /> Cobrar
                          </button>
                        )}
                      </div>
                      {assigningConv === r.id && (
                        <div className="mt-1.5 flex flex-wrap gap-1 justify-end max-w-[260px]">
                          {allBrokers.slice(0, 30).map(b => (
                            <button key={b.id} onClick={() => assignBroker(r, b.id)} disabled={busyConv === r.id}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-600">
                              {b.first_name}
                            </button>
                          ))}
                          <button onClick={() => setAssigningConv(null)} className="px-1.5 py-0.5 text-[10px] text-gray-500">cancelar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-gray-600">
        Aparecem conversas de campanhas com pelo menos 1 resposta do lead na janela selecionada. "Cobrar" envia notif Dashboard + WhatsApp pelo bot do gerente do corretor.
      </p>
    </div>
  );
}
