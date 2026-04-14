import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BarChart3, TrendingUp, TrendingDown, MessageSquare,
  Target, Zap, Clock, CheckCircle2, Bot, Activity,
  RefreshCw, Smartphone, Trophy,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChipStat {
  id: string;
  name: string;
  instance_name: string;
  status: string;
  is_prospecting: boolean;
  messages_today: number;
  total_messages_sent: number;
  conversations: number;
  qualified: number;
}

interface TemplateStat {
  campaignName: string;
  text: string;
  sent: number;
  responded: number;
  qualified: number;
  responseRate: number;
  qualifiedRate: number;
}

interface AnalyticsData {
  totalBots: number;
  onlineBots: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  messagesToday: number;
  leadsContacted: number;
  leadsResponded: number;
  leadsQualified: number;
  leadsConverted: number;
  conversionRate: number;
  responseRate: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  hourlyActivity: Array<{ hour: number; count: number }>;
  chipStats: ChipStat[];
  templateStats: TemplateStat[];
}

const EMPTY: AnalyticsData = {
  totalBots: 0, onlineBots: 0, totalCampaigns: 0, activeCampaigns: 0,
  totalConversations: 0, activeConversations: 0, totalMessages: 0, messagesToday: 0,
  leadsContacted: 0, leadsResponded: 0, leadsQualified: 0, leadsConverted: 0,
  conversionRate: 0, responseRate: 0,
  sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
  hourlyActivity: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
  chipStats: [],
  templateStats: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(s: string, n = 90) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function Bar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="flex-1 bg-slate-700/40 rounded-full h-2 overflow-hidden">
      <div className={cn("h-2 rounded-full transition-all", cls)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ── Chips ─────────────────────────────────────────────────────────
      const { data: bots } = await supabase
        .from("bot_instances")
        .select("id,name,instance_name,status,is_prospecting,messages_today,total_messages_sent")
        .order("messages_today", { ascending: false });

      const totalBots = bots?.length || 0;
      const onlineBots = bots?.filter(b => b.status === "open" || b.status === "active").length || 0;
      const messagesToday = bots?.reduce((s, b) => s + (b.messages_today || 0), 0) || 0;

      // ── Campanhas ─────────────────────────────────────────────────────
      const { data: campaigns } = await supabase
        .from("ia_campaigns")
        .select("id,name,status,message_templates,leads_contacted,leads_responded,leads_qualified,leads_converted");

      const totalCampaigns = campaigns?.length || 0;
      const activeCampaigns = campaigns?.filter(c => c.status === "active").length || 0;
      const leadsContacted = campaigns?.reduce((s, c) => s + (c.leads_contacted || 0), 0) || 0;
      const leadsResponded = campaigns?.reduce((s, c) => s + (c.leads_responded || 0), 0) || 0;
      const leadsQualified = campaigns?.reduce((s, c) => s + (c.leads_qualified || 0), 0) || 0;
      const leadsConverted = campaigns?.reduce((s, c) => s + (c.leads_converted || 0), 0) || 0;
      const conversionRate = leadsContacted > 0 ? (leadsConverted / leadsContacted) * 100 : 0;
      const responseRate = leadsContacted > 0 ? (leadsResponded / leadsContacted) * 100 : 0;

      // ── Conversas (somente prospecção — is_crm_lead = false) ──────────
      const { data: conversations } = await supabase
        .from("ia_conversations")
        .select("id,status,sentiment,messages_count,bot_instance_id,campaign_id")
        .eq("is_crm_lead", false);

      const totalConversations = conversations?.length || 0;
      const activeConversations = conversations?.filter(c => c.status === "active").length || 0;
      const positive = conversations?.filter(c => c.sentiment === "positive").length || 0;
      const neutral = conversations?.filter(c => c.sentiment === "neutral" || c.sentiment === "unknown").length || 0;
      const negative = conversations?.filter(c => c.sentiment === "negative").length || 0;

      // ── Ranking de chips ──────────────────────────────────────────────
      // contar conversas e qualificados por chip
      const convByBot: Record<string, { conv: number; qual: number }> = {};
      for (const c of conversations || []) {
        if (!c.bot_instance_id) continue;
        if (!convByBot[c.bot_instance_id]) convByBot[c.bot_instance_id] = { conv: 0, qual: 0 };
        convByBot[c.bot_instance_id].conv++;
        if (c.status === "qualified" || c.status === "escalated") convByBot[c.bot_instance_id].qual++;
      }
      const chipStats: ChipStat[] = (bots || [])
        .map(b => ({
          id: b.id,
          name: b.name,
          instance_name: b.instance_name,
          status: b.status,
          is_prospecting: b.is_prospecting,
          messages_today: b.messages_today || 0,
          total_messages_sent: b.total_messages_sent || 0,
          conversations: convByBot[b.id]?.conv || 0,
          qualified: convByBot[b.id]?.qual || 0,
        }))
        .filter(b => b.messages_today > 0 || b.total_messages_sent > 0)
        .sort((a, b) => b.messages_today - a.messages_today);

      // ── Aderência das mensagens ───────────────────────────────────────
      // Agrupa conversas por campanha para calcular taxa de resposta por template
      const convByCampaign: Record<string, { conv: number; responded: number; qualified: number }> = {};
      for (const c of conversations || []) {
        if (!c.campaign_id) continue;
        if (!convByCampaign[c.campaign_id]) convByCampaign[c.campaign_id] = { conv: 0, responded: 0, qualified: 0 };
        convByCampaign[c.campaign_id].conv++;
        if ((c.messages_count || 0) > 1) convByCampaign[c.campaign_id].responded++;
        if (c.status === "qualified" || c.status === "escalated") convByCampaign[c.campaign_id].qualified++;
      }

      const templateStats: TemplateStat[] = [];
      for (const camp of campaigns || []) {
        const stats = convByCampaign[camp.id];
        if (!stats || stats.conv === 0) continue;
        const templates: Array<{ text: string }> = camp.message_templates || [];
        // Se campanha tem apenas um template, mostrar o template completo com as estatísticas
        // Se múltiplos, mostrar cada template com taxa estimada (proporcional)
        for (const tpl of templates) {
          if (!tpl.text?.trim()) continue;
          templateStats.push({
            campaignName: camp.name,
            text: tpl.text,
            sent: Math.round(stats.conv / templates.length),
            responded: Math.round(stats.responded / templates.length),
            qualified: Math.round(stats.qualified / templates.length),
            responseRate: stats.conv > 0 ? (stats.responded / stats.conv) * 100 : 0,
            qualifiedRate: stats.conv > 0 ? (stats.qualified / stats.conv) * 100 : 0,
          });
        }
      }
      templateStats.sort((a, b) => b.responseRate - a.responseRate);

      // ── Total mensagens — derivado dos chips (somente prospecção) ─────
      const totalMessages = bots?.reduce((s, b) => s + (b.total_messages_sent || 0), 0) || 0;

      // ── Atividade por hora (hoje) — filtrado por conversas de prospecção
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const prospectingConvIds = (conversations || []).map(c => c.id);
      const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));

      if (prospectingConvIds.length > 0) {
        const { data: todayMsgs } = await supabase
          .from("ia_messages")
          .select("sent_at")
          .in("conversation_id", prospectingConvIds.slice(0, 500))
          .gte("sent_at", todayStart.toISOString())
          .eq("direction", "outgoing");

        for (const m of todayMsgs || []) {
          if (m.sent_at) {
            const h = new Date(m.sent_at).getHours();
            hourBuckets[h].count++;
          }
        }
      }

      setData({
        totalBots, onlineBots, totalCampaigns, activeCampaigns,
        totalConversations, activeConversations,
        totalMessages, messagesToday,
        leadsContacted, leadsResponded, leadsQualified, leadsConverted,
        conversionRate, responseRate,
        sentimentBreakdown: { positive, neutral, negative },
        hourlyActivity: hourBuckets,
        chipStats,
        templateStats,
      });
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Analytics error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxHour = Math.max(...data.hourlyActivity.map(h => h.count), 1);
  const maxChipToday = Math.max(...data.chipStats.map(c => c.messages_today), 1);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-orange-400" />
            Analytics & Performance
          </h3>
          <p className="text-sm text-gray-500">
            {lastUpdate ? `Atualizado às ${lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Carregando..."}
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5 border-gray-700 text-gray-400 hover:text-white">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Taxa de Resposta", value: `${data.responseRate.toFixed(1)}%`, sub: `${data.leadsResponded} responderam`, icon: MessageSquare, color: "blue" },
          { label: "Qualificados", value: data.leadsQualified, sub: `de ${data.leadsContacted} contactados`, icon: CheckCircle2, color: "green" },
          { label: "Mensagens hoje", value: data.messagesToday.toLocaleString(), sub: `${data.totalMessages.toLocaleString()} total`, icon: Zap, color: "purple" },
          { label: "Conversas ativas", value: data.activeConversations, sub: `${data.totalConversations} total`, icon: Activity, color: "orange" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label} className={`border-2 border-${color}-500/30 bg-${color}-950/20`}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className={`text-xs text-gray-400 flex items-center gap-1.5`}>
                <Icon className={`w-3.5 h-3.5 text-${color}-400`} />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-black text-white">{value}</div>
              <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Funil + Sentimento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-slate-700/50 bg-slate-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-white font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Contactados", value: data.leadsContacted, pct: 100, cls: "bg-blue-500" },
              { label: "Responderam", value: data.leadsResponded, pct: (data.leadsResponded / Math.max(data.leadsContacted, 1)) * 100, cls: "bg-purple-500" },
              { label: "Qualificados", value: data.leadsQualified, pct: (data.leadsQualified / Math.max(data.leadsContacted, 1)) * 100, cls: "bg-yellow-500" },
              { label: "Convertidos", value: data.leadsConverted, pct: (data.leadsConverted / Math.max(data.leadsContacted, 1)) * 100, cls: "bg-green-500" },
            ].map(s => (
              <div key={s.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{s.label}</span>
                  <span className="text-white font-bold">{s.value}</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2.5">
                  <div className={cn("h-2.5 rounded-full transition-all", s.cls)} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-slate-700/50 bg-slate-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-white font-bold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />Sentimento das Conversas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Positivo", value: data.sentimentBreakdown.positive, icon: TrendingUp, cls: "bg-green-900/20 border-green-500/30 text-green-400" },
                { label: "Neutro", value: data.sentimentBreakdown.neutral, icon: Activity, cls: "bg-yellow-900/20 border-yellow-500/30 text-yellow-400" },
                { label: "Negativo", value: data.sentimentBreakdown.negative, icon: TrendingDown, cls: "bg-red-900/20 border-red-500/30 text-red-400" },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className={cn("text-center p-3 rounded-lg border", cls)}>
                  <Icon className="w-6 h-6 mx-auto mb-1" />
                  <div className="text-2xl font-black text-white">{value}</div>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden">
              <div className="bg-green-500 transition-all" style={{ width: `${(data.sentimentBreakdown.positive / Math.max(data.totalConversations, 1)) * 100}%` }} />
              <div className="bg-yellow-500 transition-all" style={{ width: `${(data.sentimentBreakdown.neutral / Math.max(data.totalConversations, 1)) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(data.sentimentBreakdown.negative / Math.max(data.totalConversations, 1)) * 100}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 text-center">
              <div className="bg-slate-900/40 rounded-lg p-3">
                <div className="text-lg font-black text-white">{data.totalCampaigns}</div>
                <p className="text-xs text-gray-500">Campanhas total</p>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3">
                <div className="text-lg font-black text-emerald-400">{data.activeCampaigns}</div>
                <p className="text-xs text-gray-500">Ativas agora</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking de Chips */}
      <Card className="border border-slate-700/50 bg-slate-800/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-white font-bold flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            Ranking de Chips — Envios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.chipStats.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhum chip com envios registrados.</p>
          ) : (
            <div className="space-y-2">
              {data.chipStats.map((chip, i) => {
                const isOnline = chip.status === "open" || chip.status === "active";
                return (
                  <div key={chip.id} className="flex items-center gap-3">
                    {/* posição */}
                    <span className={cn("text-xs font-black w-5 text-center shrink-0",
                      i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-600"
                    )}>{i + 1}</span>
                    {/* status dot */}
                    <span className={cn("w-2 h-2 rounded-full shrink-0", isOnline ? "bg-emerald-400" : "bg-slate-600")} />
                    {/* nome */}
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold text-white truncate">{chip.name}</p>
                      {chip.is_prospecting && <span className="text-[10px] text-blue-400">Prospecção</span>}
                    </div>
                    {/* barra */}
                    <Bar value={chip.messages_today} max={maxChipToday} cls="bg-cyan-500" />
                    {/* números */}
                    <div className="text-right shrink-0 w-28">
                      <span className="text-cyan-300 font-black text-sm">{chip.messages_today}</span>
                      <span className="text-gray-600 text-xs"> hoje</span>
                      <div className="text-gray-500 text-xs">{chip.total_messages_sent.toLocaleString()} total</div>
                    </div>
                    {/* conversas qualificadas */}
                    {chip.qualified > 0 && (
                      <Badge className="bg-green-900/30 text-green-300 border-green-500/30 text-[10px] shrink-0">
                        {chip.qualified} qual.
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aderência das Mensagens */}
      <Card className="border border-slate-700/50 bg-slate-800/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-white font-bold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Aderência das Mensagens
            <span className="text-xs font-normal text-gray-500 ml-1">— qual template gerou mais resposta</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.templateStats.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhuma campanha com dados de resposta ainda.</p>
          ) : (
            <div className="space-y-3">
              {data.templateStats.map((tpl, i) => (
                <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-black",
                          i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-600"
                        )}>#{i + 1}</span>
                        <Badge className="bg-blue-900/30 text-blue-300 border-blue-500/30 text-[10px]">{tpl.campaignName}</Badge>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{truncate(tpl.text)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn("text-xl font-black",
                        tpl.responseRate >= 30 ? "text-green-400" :
                        tpl.responseRate >= 15 ? "text-yellow-400" : "text-gray-400"
                      )}>
                        {tpl.responseRate.toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-gray-500">resposta</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-700/40 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={cn("h-1.5 rounded-full",
                          tpl.responseRate >= 30 ? "bg-green-500" :
                          tpl.responseRate >= 15 ? "bg-yellow-500" : "bg-slate-500"
                        )}
                        style={{ width: `${Math.min(tpl.responseRate, 100)}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs shrink-0">
                      <span className="text-gray-500">{tpl.sent} enviados</span>
                      <span className="text-blue-300">{tpl.responded} resp.</span>
                      {tpl.qualified > 0 && <span className="text-green-300">{tpl.qualified} qual.</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atividade por Hora */}
      <Card className="border border-slate-700/50 bg-slate-800/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-white font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Envios por Hora — Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-0.5 h-32">
            {data.hourlyActivity.map(item => {
              const pct = maxHour > 0 ? (item.count / maxHour) * 100 : 0;
              const now = new Date().getHours();
              const isCurrent = item.hour === now;
              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 px-1.5 py-0.5 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {item.count} msg{item.count !== 1 ? "s" : ""}
                  </div>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={cn("w-full rounded-t transition-all", isCurrent ? "bg-cyan-400" : "bg-blue-500/60 hover:bg-blue-500")}
                      style={{ height: `${Math.max(pct, item.count > 0 ? 4 : 0)}%`, minHeight: item.count > 0 ? "3px" : "0" }}
                    />
                  </div>
                  {item.hour % 4 === 0 && (
                    <span className="text-[9px] text-gray-600">{item.hour}h</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">Hora atual destacada em ciano</p>
        </CardContent>
      </Card>

    </div>
  );
}
