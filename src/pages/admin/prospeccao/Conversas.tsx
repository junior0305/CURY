import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, RefreshCw, Search, Bot, CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  status: string;
  messages_count: number;
  created_at: string;
  bot_name: string | null;
  bot_instance: string | null;
  campaign_name: string | null;
  sentiment: string | null;
}

interface Message {
  id: string;
  direction: string;
  sender_type: string;
  message_text: string;
  created_at: string;
}

interface BotOption { id: string; name: string; }
interface CampaignOption { id: string; name: string; }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:           { label: "Ativo",       cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  qualified:        { label: "Qualificado", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  escalated:        { label: "Escalado",    cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  no_interest:      { label: "Sem interesse", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  waiting_response: { label: "Aguardando", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function Conversas() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [search, setSearch] = useState("");
  const [filterBot, setFilterBot] = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: botData }, { data: campaignData }, { data: convData }] = await Promise.all([
      supabase.from("bot_instances").select("id,name").order("name"),
      supabase.from("ia_campaigns").select("id,name").order("name"),
      supabase
        .from("ia_conversations")
        .select(`
          id, lead_name, lead_phone, status, messages_count, created_at, sentiment,
          bot_instances!bot_instance_id(name, instance_name),
          ia_campaigns!campaign_id(name)
        `)
        .eq("is_crm_lead", false)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    setBots((botData || []).map(b => ({ id: b.id, name: b.name })));
    setCampaigns((campaignData || []).map(c => ({ id: c.id, name: c.name })));
    setConversations(
      (convData || []).map((c: any) => ({
        id: c.id,
        lead_name: c.lead_name,
        lead_phone: c.lead_phone,
        status: c.status,
        messages_count: c.messages_count || 0,
        created_at: c.created_at,
        sentiment: c.sentiment,
        bot_name: c.bot_instances?.name ?? null,
        bot_instance: c.bot_instances?.instance_name ?? null,
        campaign_name: c.ia_campaigns?.name ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConversation = async (conv: Conversation) => {
    setSelected(conv);
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("ia_messages")
      .select("id,direction,sender_type,message_text,created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoadingMsgs(false);
  };

  const filtered = conversations.filter(c => {
    if (filterBot !== "all" && c.bot_name !== filterBot) return false;
    if (filterCampaign !== "all" && c.campaign_name !== filterCampaign) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.lead_name || "").toLowerCase().includes(q) &&
          !(c.lead_phone || "").includes(q)) return false;
    }
    return true;
  });

  const total = conversations.length;
  const active = conversations.filter(c => c.status === "active").length;
  const qualified = conversations.filter(c => c.status === "qualified" || c.status === "escalated").length;
  const noInterest = conversations.filter(c => c.status === "no_interest").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-purple-400" />
            Conversas de Prospecção
          </h3>
          <p className="text-sm text-gray-500">Conversas iniciadas pelos chips — últimas 200</p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm"
          className="gap-1.5 border-gray-700 text-gray-400 hover:text-white">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total",        value: total,      icon: MessageSquare, cls: "border-slate-600 bg-slate-800/40",       val: "text-white" },
          { label: "Ativas",       value: active,     icon: Zap,           cls: "border-blue-500/30 bg-blue-950/20",      val: "text-blue-300" },
          { label: "Qualificadas", value: qualified,  icon: CheckCircle2,  cls: "border-emerald-500/30 bg-emerald-950/20",val: "text-emerald-300" },
          { label: "Sem interesse",value: noInterest, icon: XCircle,       cls: "border-red-500/30 bg-red-950/20",        val: "text-red-300" },
        ].map(({ label, value, icon: Icon, cls, val }) => (
          <Card key={label} className={cn("border", cls)}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={cn("w-5 h-5 shrink-0", val)} />
              <div>
                <div className={cn("text-2xl font-black", val)}>{value}</div>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 bg-slate-900 border-slate-700 text-white text-sm h-8"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] bg-slate-900 border-slate-700 text-white text-xs h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBot} onValueChange={setFilterBot}>
          <SelectTrigger className="w-[140px] bg-slate-900 border-slate-700 text-white text-xs h-8">
            <SelectValue placeholder="Chip" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all">Todos chips</SelectItem>
            {bots.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCampaign} onValueChange={setFilterCampaign}>
          <SelectTrigger className="w-[160px] bg-slate-900 border-slate-700 text-white text-xs h-8">
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            <SelectItem value="all">Todas campanhas</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStatus !== "all" || filterBot !== "all" || filterCampaign !== "all" || search) && (
          <Button variant="ghost" size="sm" className="text-slate-500 text-xs h-8"
            onClick={() => { setFilterStatus("all"); setFilterBot("all"); setFilterCampaign("all"); setSearch(""); }}>
            Limpar
          </Button>
        )}
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} conversas</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <MessageSquare className="w-14 h-14 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">Nenhuma conversa encontrada</p>
          <p className="text-xs mt-1">Ajuste os filtros ou aguarde novas prospecções</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(conv => {
            const statusCfg = STATUS_CFG[conv.status] || { label: conv.status, cls: "bg-slate-700 text-slate-400 border-slate-600" };
            return (
              <div
                key={conv.id}
                onClick={() => openConversation(conv)}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:bg-slate-700/40 cursor-pointer transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-purple-900/40 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {conv.lead_name || conv.lead_phone || "Lead sem nome"}
                    </span>
                    {conv.campaign_name && (
                      <Badge className="bg-blue-900/30 text-blue-300 border-blue-500/30 text-[10px]">
                        {conv.campaign_name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {conv.bot_name && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Bot className="w-3 h-3" />{conv.bot_name}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{timeAgo(conv.created_at)}
                    </span>
                    <span className="text-[11px] text-slate-500">{conv.messages_count} msgs</span>
                  </div>
                </div>
                <Badge className={cn("border text-[10px] shrink-0", statusCfg.cls)}>
                  {statusCfg.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de transcrição */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              {selected?.lead_name || selected?.lead_phone || "Conversa"}
              {selected && (
                <Badge className={cn("ml-2 border text-[10px]",
                  STATUS_CFG[selected.status]?.cls || "bg-slate-700 text-slate-400 border-slate-600")}>
                  {STATUS_CFG[selected.status]?.label || selected.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10 text-slate-500 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Carregando mensagens...
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-slate-500 py-10 text-sm">Nenhuma mensagem encontrada.</p>
            ) : (
              messages.map(msg => {
                const isBot = msg.direction === "outgoing";
                return (
                  <div key={msg.id} className={cn("flex", isBot ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      isBot
                        ? "bg-purple-800/50 text-purple-100 rounded-br-sm"
                        : "bg-slate-700/60 text-slate-200 rounded-bl-sm"
                    )}>
                      <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                      <p className={cn("text-[10px] mt-1", isBot ? "text-purple-400" : "text-slate-500")}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
