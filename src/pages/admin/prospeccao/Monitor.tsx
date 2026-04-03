import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Smartphone, MessageSquare, CheckCircle2,
  XCircle, Clock, Zap, Wifi, WifiOff, Activity,
} from "lucide-react";

interface BotStat {
  id: string;
  name: string;
  instance_name: string;
  status: string;
  is_prospecting: boolean;
  messages_today: number;
  total_messages_sent: number;
  last_message_at: string | null;
}

interface RecentConv {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  status: string;
  messages_count: number;
  created_at: string;
  bot_name: string | null;
  bot_instance: string | null;
  campaign_name: string | null;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const STATUS_DOT: Record<string, string> = {
  open:       "bg-emerald-400",
  active:     "bg-emerald-400",
  connecting: "bg-yellow-400 animate-pulse",
  offline:    "bg-red-500",
  close:      "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  open:       "Online",
  active:     "Online",
  connecting: "Conectando",
  offline:    "Offline",
  close:      "Offline",
};

const CONV_STATUS: Record<string, { label: string; cls: string }> = {
  active:           { label: "Ativo",      cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  qualified:        { label: "Qualificado",cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  escalated:        { label: "Escalado",   cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  no_interest:      { label: "Sem inter.", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  waiting_response: { label: "Aguardando", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
};

export default function Monitor() {
  const [bots, setBots]       = useState<BotStat[]>([]);
  const [convs, setConvs]     = useState<RecentConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: botData }, { data: convData }] = await Promise.all([
      supabase
        .from("bot_instances")
        .select("id,name,instance_name,status,is_prospecting,messages_today,total_messages_sent,last_message_at")
        .order("last_message_at", { ascending: false, nullsFirst: false }),

      supabase
        .from("ia_conversations")
        .select(`
          id, lead_name, lead_phone, status, messages_count, created_at,
          bot_instances!bot_instance_id(name, instance_name),
          ia_campaigns!campaign_id(name)
        `)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setBots(botData || []);
    setConvs(
      (convData || []).map((c: any) => ({
        id: c.id,
        lead_name: c.lead_name,
        lead_phone: c.lead_phone,
        status: c.status,
        messages_count: c.messages_count || 0,
        created_at: c.created_at,
        bot_name: c.bot_instances?.name ?? null,
        bot_instance: c.bot_instances?.instance_name ?? null,
        campaign_name: c.ia_campaigns?.name ?? null,
      }))
    );
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Totais
  const totalHoje   = bots.reduce((s, b) => s + (b.messages_today || 0), 0);
  const botsOnline  = bots.filter(b => b.status === "open" || b.status === "active").length;
  const botsProsp   = bots.filter(b => b.is_prospecting && (b.status === "open" || b.status === "active")).length;

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-900/40 border border-cyan-500/30">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">Monitor de Envios</h3>
            <p className="text-xs text-slate-500">Atualizado {timeAgo(lastUpdate.toISOString())}</p>
          </div>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-white"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-900/10 p-4 text-center">
          <div className="text-3xl font-black text-cyan-300">{totalHoje.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">Mensagens hoje</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 text-center">
          <div className="text-3xl font-black text-emerald-300">{botsOnline}</div>
          <div className="text-xs text-slate-500 mt-1">Chips online</div>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-4 text-center">
          <div className="text-3xl font-black text-blue-300">{botsProsp}</div>
          <div className="text-xs text-slate-500 mt-1">Prospecção ativa</div>
        </div>
      </div>

      {/* ── Chips ────────────────────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> Chips / Instâncias
        </h4>
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                  <th className="px-4 py-3 text-left">Chip</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-center">Tipo</th>
                  <th className="px-3 py-3 text-center text-cyan-400">Hoje</th>
                  <th className="px-3 py-3 text-center text-slate-400">Total</th>
                  <th className="px-3 py-3 text-left hidden sm:table-cell">Último envio</th>
                </tr>
              </thead>
              <tbody>
                {bots.map(bot => {
                  const dotCls   = STATUS_DOT[bot.status]   || "bg-slate-500";
                  const label    = STATUS_LABEL[bot.status] || bot.status;
                  const isOnline = bot.status === "open" || bot.status === "active";
                  return (
                    <tr key={bot.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-white">{bot.name}</div>
                        <div className="text-slate-500">{bot.instance_name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", dotCls)} />
                          <span className={isOnline ? "text-emerald-400" : "text-slate-500"}>{label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {bot.is_prospecting
                          ? <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]"><Zap className="w-2.5 h-2.5 mr-1" />Prospecção</Badge>
                          : <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px]"><MessageSquare className="w-2.5 h-2.5 mr-1" />Atendimento</Badge>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("font-black text-sm", (bot.messages_today || 0) > 0 ? "text-cyan-300" : "text-slate-700")}>
                          {bot.messages_today || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-400 font-semibold">
                        {bot.total_messages_sent || 0}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 hidden sm:table-cell">
                        {timeAgo(bot.last_message_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Conversas Recentes ────────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Conversas Recentes da IA ({convs.length})
        </h4>
        {convs.length === 0 ? (
          <div className="text-center py-10 text-slate-600 text-sm">Nenhuma conversa ainda</div>
        ) : (
          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                    <th className="px-4 py-3 text-left">Lead</th>
                    <th className="px-3 py-3 text-left hidden md:table-cell">Campanha</th>
                    <th className="px-3 py-3 text-center">Chip</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-center">Msgs</th>
                    <th className="px-3 py-3 text-left hidden sm:table-cell">Iniciado</th>
                  </tr>
                </thead>
                <tbody>
                  {convs.map(c => {
                    const st = CONV_STATUS[c.status] || { label: c.status, cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
                    return (
                      <tr key={c.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-white">{c.lead_name || "—"}</div>
                          <div className="text-slate-500">{c.lead_phone || ""}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 hidden md:table-cell">
                          {c.campaign_name || <span className="text-slate-700">Direto</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.bot_name
                            ? <span className="font-semibold text-white">{c.bot_name}</span>
                            : <span className="text-slate-700">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge className={cn("text-[10px] border", st.cls)}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn("font-black", c.messages_count > 0 ? "text-white" : "text-slate-700")}>
                            {c.messages_count}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 hidden sm:table-cell">
                          {timeAgo(c.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
