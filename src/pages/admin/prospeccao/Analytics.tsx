import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Target,
  Zap,
  Clock,
  CheckCircle2,
  Bot,
  Users,
  Activity,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnalyticsData {
  totalBots: number;
  activeBots: number;
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
  avgResponseTime: number;
  topBot: { name: string; conversations: number } | null;
  topCampaign: { name: string; conversions: number } | null;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  hourlyActivity: Array<{ hour: number; count: number }>;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData>({
    totalBots: 0,
    activeBots: 0,
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalConversations: 0,
    activeConversations: 0,
    totalMessages: 0,
    messagesToday: 0,
    leadsContacted: 0,
    leadsResponded: 0,
    leadsQualified: 0,
    leadsConverted: 0,
    conversionRate: 0,
    responseRate: 0,
    avgResponseTime: 0,
    topBot: null,
    topCampaign: null,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    hourlyActivity: [],
  });
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);

    try {
      // Bots
      const { data: bots } = await supabase.from("bot_instances").select("*");
      const totalBots = bots?.length || 0;
      const activeBots = bots?.filter(b => b.status === "active").length || 0;
      const messagesToday = bots?.reduce((sum, b) => sum + b.messages_today, 0) || 0;

      // Campanhas
      const { data: campaigns } = await supabase.from("ia_campaigns").select("*");
      const totalCampaigns = campaigns?.length || 0;
      const activeCampaigns = campaigns?.filter(c => c.status === "active").length || 0;
      const leadsContacted = campaigns?.reduce((sum, c) => sum + c.leads_contacted, 0) || 0;
      const leadsResponded = campaigns?.reduce((sum, c) => sum + c.leads_responded, 0) || 0;
      const leadsQualified = campaigns?.reduce((sum, c) => sum + c.leads_qualified, 0) || 0;
      const leadsConverted = campaigns?.reduce((sum, c) => sum + c.leads_converted, 0) || 0;

      // Top Campaign
      const topCampaign = campaigns?.reduce((max, c) => 
        c.leads_converted > (max?.leads_converted || 0) ? c : max, 
        campaigns[0]
      );

      // Conversas
      const { data: conversations } = await supabase.from("ia_conversations").select("*");
      const totalConversations = conversations?.length || 0;
      const activeConversations = conversations?.filter(c => c.status === "active").length || 0;

      // Sentiment
      const positive = conversations?.filter(c => c.sentiment === "positive").length || 0;
      const neutral = conversations?.filter(c => c.sentiment === "neutral").length || 0;
      const negative = conversations?.filter(c => c.sentiment === "negative").length || 0;

      // Top Bot
      const botConvCounts = conversations?.reduce((acc, conv) => {
        if (conv.bot_instance_id) {
          acc[conv.bot_instance_id] = (acc[conv.bot_instance_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      const topBotId = botConvCounts ? 
        Object.entries(botConvCounts).sort(([, a], [, b]) => b - a)[0]?.[0] : null;
      
      const topBotData = topBotId ? bots?.find(b => b.id === topBotId) : null;

      // Mensagens
      const { count: totalMessages } = await supabase
        .from("ia_messages")
        .select("*", { count: "exact", head: true });

      // Métricas calculadas
      const conversionRate = leadsContacted > 0 ? (leadsConverted / leadsContacted) * 100 : 0;
      const responseRate = leadsContacted > 0 ? (leadsResponded / leadsContacted) * 100 : 0;

      // Atividade por hora (simulado - você pode calcular do banco)
      const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: Math.floor(Math.random() * 50), // Substituir por dados reais
      }));

      setData({
        totalBots,
        activeBots,
        totalCampaigns,
        activeCampaigns,
        totalConversations,
        activeConversations,
        totalMessages: totalMessages || 0,
        messagesToday,
        leadsContacted,
        leadsResponded,
        leadsQualified,
        leadsConverted,
        conversionRate,
        responseRate,
        avgResponseTime: 120, // Calcular real depois
        topBot: topBotData ? { name: topBotData.name, conversations: botConvCounts![topBotId] } : null,
        topCampaign: topCampaign ? { name: topCampaign.name, conversions: topCampaign.leads_converted } : null,
        sentimentBreakdown: { positive, neutral, negative },
        hourlyActivity,
      });
    } catch (error) {
      console.error("Erro ao carregar analytics:", error);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-orange-400" />
            Analytics & Performance
          </h3>
          <p className="text-sm text-gray-500">Visão geral do desempenho do exército de IAs</p>
        </div>
        <Button onClick={loadAnalytics} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-green-500/30 bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{data.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">
              {data.leadsConverted} de {data.leadsContacted} leads
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-500/30 bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              Taxa de Resposta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{data.responseRate.toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">
              {data.leadsResponded} responderam
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-500/30 bg-purple-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              Mensagens Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{data.messagesToday}</div>
            <p className="text-xs text-gray-500 mt-1">{data.totalMessages} total</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-500/30 bg-orange-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-400" />
              Conversas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{data.activeConversations}</div>
            <p className="text-xs text-gray-500 mt-1">{data.totalConversations} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Recursos e Funil */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recursos */}
        <Card className="border-2 border-gray-700/50 bg-slate-800/40">
          <CardHeader>
            <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
              <Bot className="w-5 h-5 text-green-400" />
              Recursos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-900/40 border border-green-500/30">
                  <Bot className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-bold">Bots Ativos</p>
                  <p className="text-xs text-gray-500">{data.activeBots} de {data.totalBots} online</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white">{data.activeBots}</div>
                <Badge variant="secondary" className="text-xs">
                  {((data.activeBots / Math.max(data.totalBots, 1)) * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-500/30">
                  <Target className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-bold">Campanhas Ativas</p>
                  <p className="text-xs text-gray-500">{data.activeCampaigns} de {data.totalCampaigns} rodando</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white">{data.activeCampaigns}</div>
                <Badge variant="secondary" className="text-xs">
                  {((data.activeCampaigns / Math.max(data.totalCampaigns, 1)) * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Funil de Conversão */}
        <Card className="border-2 border-gray-700/50 bg-slate-800/40">
          <CardHeader>
            <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Contactados", value: data.leadsContacted, color: "blue", width: 100 },
              { label: "Responderam", value: data.leadsResponded, color: "purple", width: (data.leadsResponded / Math.max(data.leadsContacted, 1)) * 100 },
              { label: "Qualificados", value: data.leadsQualified, color: "yellow", width: (data.leadsQualified / Math.max(data.leadsContacted, 1)) * 100 },
              { label: "Convertidos", value: data.leadsConverted, color: "green", width: (data.leadsConverted / Math.max(data.leadsContacted, 1)) * 100 },
            ].map((stage, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{stage.label}</span>
                  <span className="text-white font-bold">{stage.value}</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full bg-${stage.color}-500 transition-all`}
                    style={{ width: `${stage.width}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top Performers e Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Performers */}
        <Card className="border-2 border-gray-700/50 bg-slate-800/40">
          <CardHeader>
            <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.topBot && (
              <div className="p-4 rounded-lg bg-slate-900/60 border border-yellow-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Melhor Bot</span>
                  <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-500/30">🏆 MVP</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">{data.topBot.name}</p>
                    <p className="text-xs text-gray-500">{data.topBot.conversations} conversas</p>
                  </div>
                  <Bot className="w-8 h-8 text-yellow-400" />
                </div>
              </div>
            )}

            {data.topCampaign && (
              <div className="p-4 rounded-lg bg-slate-900/60 border border-green-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Melhor Campanha</span>
                  <Badge className="bg-green-900/40 text-green-300 border-green-500/30">🎯 Top</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">{data.topCampaign.name}</p>
                    <p className="text-xs text-gray-500">{data.topCampaign.conversions} conversões</p>
                  </div>
                  <Target className="w-8 h-8 text-green-400" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Análise de Sentimento */}
        <Card className="border-2 border-gray-700/50 bg-slate-800/40">
          <CardHeader>
            <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              Análise de Sentimento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 rounded-lg bg-green-900/20 border border-green-500/30">
                <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-2xl font-black text-white">{data.sentimentBreakdown.positive}</div>
                <p className="text-xs text-gray-500">Positivo</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                <Activity className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-2xl font-black text-white">{data.sentimentBreakdown.neutral}</div>
                <p className="text-xs text-gray-500">Neutro</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-red-900/20 border border-red-500/30">
                <TrendingDown className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <div className="text-2xl font-black text-white">{data.sentimentBreakdown.negative}</div>
                <p className="text-xs text-gray-500">Negativo</p>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-700/50">
              <p className="text-xs text-gray-500 mb-2">Distribuição:</p>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div
                  className="bg-green-500"
                  style={{
                    width: `${(data.sentimentBreakdown.positive / Math.max(data.totalConversations, 1)) * 100}%`,
                  }}
                />
                <div
                  className="bg-yellow-500"
                  style={{
                    width: `${(data.sentimentBreakdown.neutral / Math.max(data.totalConversations, 1)) * 100}%`,
                  }}
                />
                <div
                  className="bg-red-500"
                  style={{
                    width: `${(data.sentimentBreakdown.negative / Math.max(data.totalConversations, 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Atividade por Hora (Simplificado) */}
      <Card className="border-2 border-gray-700/50 bg-slate-800/40">
        <CardHeader>
          <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Atividade por Hora
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1 h-48">
            {data.hourlyActivity.map(item => (
              <div key={item.hour} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-blue-500/20 hover:bg-blue-500/40 transition-all rounded-t relative group">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all"
                    style={{ height: `${(item.count / 50) * 100}%`, minHeight: "4px" }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {item.count} msgs
                  </div>
                </div>
                <span className="text-[10px] text-gray-500">{item.hour}h</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}