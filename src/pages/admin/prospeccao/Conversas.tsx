import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, TrendingUp, AlertTriangle, CheckCircle, Eye, RefreshCw, Target, Award, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CoachAnalysis {
  id: string;
  conversation_id: string;
  broker_id: string;
  quality_score: number;
  severity: string;
  errors: Array<{ type: string; description: string }>;
  positives: string[];
  summary: string;
  conversation_origin: string;
  created_at: string;
  broker_name?: string;
  lead_name?: string;
}

interface BrokerPerformance {
  broker_id: string;
  broker_name: string;
  conversations_analyzed: number;
  avg_quality_score: number;
  total_errors: number;
}

type Tab = "dashboard" | "analyses" | "performance";

export default function Conversas() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [analyses, setAnalyses] = useState<CoachAnalysis[]>([]);
  const [performance, setPerformance] = useState<BrokerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState<CoachAnalysis | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Filtros
  const [filterBroker, setFilterBroker] = useState<string>("all");
  const [filterScore, setFilterScore] = useState<string>("all");
  const [filterOrigin, setFilterOrigin] = useState<string>("all");

  // Stats
  const [stats, setStats] = useState({
    avgScore: 0,
    totalAnalyzed: 0,
    topPerformer: "",
    alertsCount: 0,
  });

  const loadData = async () => {
    setLoading(true);

    // Buscar análises recentes (últimos 7 dias)
    const { data: analysesData } = await supabase
      .from("ai_coach_analysis")
      .select(`
        *,
        profiles!ai_coach_analysis_broker_id_fkey(first_name, full_name, email)
      `)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    // Processar análises
    const processedAnalyses = (analysesData || []).map(a => ({
      ...a,
      broker_name: a.profiles?.first_name || a.profiles?.full_name || a.profiles?.email || "Corretor",
    }));

    setAnalyses(processedAnalyses);

    // Buscar performance agregada (últimos 30 dias)
    const { data: perfData } = await supabase
      .from("broker_daily_performance")
      .select(`
        broker_id,
        conversations_analyzed,
        avg_quality_score,
        total_errors,
        profiles!broker_daily_performance_broker_id_fkey(first_name, full_name, email)
      `)
      .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Agregar por corretor
    const brokerMap: Record<string, any> = {};
    (perfData || []).forEach(p => {
      if (!brokerMap[p.broker_id]) {
        brokerMap[p.broker_id] = {
          broker_id: p.broker_id,
          broker_name: p.profiles?.first_name || p.profiles?.full_name || p.profiles?.email || "Corretor",
          conversations_analyzed: 0,
          avg_quality_score: 0,
          total_errors: 0,
          _scoreSum: 0,
          _days: 0,
        };
      }
      brokerMap[p.broker_id].conversations_analyzed += p.conversations_analyzed || 0;
      brokerMap[p.broker_id]._scoreSum += (p.avg_quality_score || 0) * (p.conversations_analyzed || 0);
      brokerMap[p.broker_id].total_errors += p.total_errors || 0;
      brokerMap[p.broker_id]._days++;
    });

    const perfArray = Object.values(brokerMap).map(b => ({
      ...b,
      avg_quality_score: b.conversations_analyzed > 0 ? b._scoreSum / b.conversations_analyzed : 0,
    })).sort((a, b) => b.avg_quality_score - a.avg_quality_score);

    setPerformance(perfArray);

    // Calcular stats
    const avgScore = processedAnalyses.length > 0
      ? processedAnalyses.reduce((sum, a) => sum + (a.quality_score || 0), 0) / processedAnalyses.length
      : 0;

    const alertsCount = processedAnalyses.filter(a => a.quality_score < 60).length;

    setStats({
      avgScore: Math.round(avgScore),
      totalAnalyzed: processedAnalyses.length,
      topPerformer: perfArray[0]?.broker_name || "N/A",
      alertsCount,
    });

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400 bg-green-900/40 border-green-500/30";
    if (score >= 60) return "text-yellow-400 bg-yellow-900/40 border-yellow-500/30";
    return "text-red-400 bg-red-900/40 border-red-500/30";
  };

  const getSeverityBadge = (severity: string) => {
    const styles = {
      low: "bg-blue-900/40 text-blue-300 border-blue-500/30",
      medium: "bg-yellow-900/40 text-yellow-300 border-yellow-500/30",
      high: "bg-orange-900/40 text-orange-300 border-orange-500/30",
      critical: "bg-red-900/40 text-red-300 border-red-500/30",
    };
    return styles[severity as keyof typeof styles] || styles.medium;
  };

  const getOriginLabel = (origin: string) => {
    const labels = {
      ai_welcome: "Boas-vindas IA",
      followup: "Follow-up",
      prospecting: "Prospecção",
      organic: "Orgânico",
    };
    return labels[origin as keyof typeof labels] || origin || "Desconhecido";
  };

  const filteredAnalyses = analyses.filter(a => {
    if (filterBroker !== "all" && a.broker_id !== filterBroker) return false;
    if (filterScore !== "all") {
      if (filterScore === "low" && a.quality_score >= 60) return false;
      if (filterScore === "medium" && (a.quality_score < 60 || a.quality_score >= 80)) return false;
      if (filterScore === "high" && a.quality_score < 80) return false;
    }
    if (filterOrigin !== "all" && a.conversation_origin !== filterOrigin) return false;
    return true;
  });

  const openDetail = (analysis: CoachAnalysis) => {
    setSelectedAnalysis(analysis);
    setDetailModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-400" />
            Coach IA
          </h3>
          <p className="text-sm text-gray-500">Análise inteligente de conversas e performance</p>
        </div>
        <Button onClick={loadData} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-900/20">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTab("dashboard")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab === "dashboard"
              ? "bg-purple-900/40 text-purple-300 border border-purple-500/30"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          <Activity className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setTab("analyses")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab === "analyses"
              ? "bg-blue-900/40 text-blue-300 border border-blue-500/30"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          <Target className="w-4 h-4" />
          Análises
          <span className="text-xs bg-slate-700 rounded px-1.5">{filteredAnalyses.length}</span>
        </button>
        <button
          onClick={() => setTab("performance")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab === "performance"
              ? "bg-green-900/40 text-green-300 border border-green-500/30"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          <Award className="w-4 h-4" />
          Performance
        </button>
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2 border-purple-700/50 bg-purple-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <h4 className="text-sm font-bold text-gray-400">Score Médio</h4>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-purple-300">{stats.avgScore}/100</div>
              <p className="text-xs text-gray-500 mt-1">Últimos 7 dias</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-700/50 bg-blue-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-400" />
                <h4 className="text-sm font-bold text-gray-400">Conversas Analisadas</h4>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-blue-300">{stats.totalAnalyzed}</div>
              <p className="text-xs text-gray-500 mt-1">Últimos 7 dias</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-700/50 bg-green-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-green-400" />
                <h4 className="text-sm font-bold text-gray-400">Top Performer</h4>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-black text-green-300 truncate">{stats.topPerformer}</div>
              <p className="text-xs text-gray-500 mt-1">Melhor score médio</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-red-700/50 bg-red-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h4 className="text-sm font-bold text-gray-400">Alertas</h4>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-red-300">{stats.alertsCount}</div>
              <p className="text-xs text-gray-500 mt-1">Score &lt; 60</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Análises */}
      {tab === "analyses" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <Select value={filterBroker} onValueChange={setFilterBroker}>
              <SelectTrigger className="w-48 bg-slate-900 border-gray-600 text-white">
                <SelectValue placeholder="Todos os corretores" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-gray-600">
                <SelectItem value="all">Todos os corretores</SelectItem>
                {performance.map(p => (
                  <SelectItem key={p.broker_id} value={p.broker_id}>{p.broker_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterScore} onValueChange={setFilterScore}>
              <SelectTrigger className="w-40 bg-slate-900 border-gray-600 text-white">
                <SelectValue placeholder="Todos os scores" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-gray-600">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="low">Baixo (&lt;60)</SelectItem>
                <SelectItem value="medium">Médio (60-79)</SelectItem>
                <SelectItem value="high">Alto (≥80)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterOrigin} onValueChange={setFilterOrigin}>
              <SelectTrigger className="w-40 bg-slate-900 border-gray-600 text-white">
                <SelectValue placeholder="Todas origens" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-gray-600">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ai_welcome">Boas-vindas</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="prospecting">Prospecção</SelectItem>
                <SelectItem value="organic">Orgânico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {filteredAnalyses.map(analysis => (
              <Card key={analysis.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-purple-500/50 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-bold truncate">{analysis.broker_name}</span>
                        <Badge className={getScoreColor(analysis.quality_score)}>
                          {analysis.quality_score}/100
                        </Badge>
                        <Badge className={getSeverityBadge(analysis.severity)}>
                          {analysis.severity}
                        </Badge>
                        {analysis.conversation_origin && (
                          <Badge variant="outline" className="text-xs border-gray-600">
                            {getOriginLabel(analysis.conversation_origin)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2">{analysis.summary}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {analysis.errors.length > 0 && (
                          <span>❌ {analysis.errors.length} erro(s)</span>
                        )}
                        {analysis.positives.length > 0 && (
                          <span>✅ {analysis.positives.length} ponto(s) positivo(s)</span>
                        )}
                        <span>{new Date(analysis.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => openDetail(analysis)}
                      size="sm"
                      variant="outline"
                      className="border-purple-500/30 text-purple-400 hover:bg-purple-900/20"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredAnalyses.length === 0 && (
              <Card className="border-2 border-gray-700/50 bg-slate-800/40">
                <CardContent className="p-8 text-center">
                  <Brain className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500">Nenhuma análise encontrada</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Performance */}
      {tab === "performance" && (
        <div className="space-y-3">
          {performance.map((broker, index) => (
            <Card key={broker.broker_id} className="border-2 border-gray-700/50 bg-slate-800/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? "bg-yellow-900/40 text-yellow-300" :
                      index === 1 ? "bg-gray-700/40 text-gray-300" :
                      index === 2 ? "bg-orange-900/40 text-orange-300" :
                      "bg-slate-700/40 text-gray-400"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-white font-bold">{broker.broker_name}</div>
                      <div className="text-xs text-gray-500">
                        {broker.conversations_analyzed} conversas analisadas
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-2xl font-black ${getScoreColor(broker.avg_quality_score)}`}>
                        {Math.round(broker.avg_quality_score)}
                      </div>
                      <div className="text-xs text-gray-500">score médio</div>
                    </div>
                    {broker.total_errors > 0 && (
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-400">{broker.total_errors}</div>
                        <div className="text-xs text-gray-500">erros</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {performance.length === 0 && (
            <Card className="border-2 border-gray-700/50 bg-slate-800/40">
              <CardContent className="p-8 text-center">
                <Award className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">Nenhum dado de performance disponível</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Brain className="w-6 h-6 text-purple-400" />
              Análise Detalhada
            </DialogTitle>
          </DialogHeader>
          {selectedAnalysis && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getScoreColor(selectedAnalysis.quality_score)}>
                  Score: {selectedAnalysis.quality_score}/100
                </Badge>
                <Badge className={getSeverityBadge(selectedAnalysis.severity)}>
                  {selectedAnalysis.severity}
                </Badge>
                {selectedAnalysis.conversation_origin && (
                  <Badge variant="outline" className="border-gray-600">
                    {getOriginLabel(selectedAnalysis.conversation_origin)}
                  </Badge>
                )}
              </div>

              <div className="bg-slate-800/60 rounded-lg p-4 border border-gray-700">
                <h4 className="text-sm font-bold text-gray-400 mb-2">RESUMO</h4>
                <p className="text-white">{selectedAnalysis.summary}</p>
              </div>

              {selectedAnalysis.errors.length > 0 && (
                <div className="bg-red-950/20 rounded-lg p-4 border border-red-500/30">
                  <h4 className="text-sm font-bold text-red-400 mb-3">❌ ERROS DETECTADOS</h4>
                  <div className="space-y-2">
                    {selectedAnalysis.errors.map((error, i) => (
                      <div key={i} className="bg-red-900/20 rounded p-3 border-l-2 border-red-500">
                        <div className="text-xs text-red-300 font-mono mb-1">{error.type}</div>
                        <div className="text-sm text-white">{error.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedAnalysis.positives.length > 0 && (
                <div className="bg-green-950/20 rounded-lg p-4 border border-green-500/30">
                  <h4 className="text-sm font-bold text-green-400 mb-3">✅ PONTOS POSITIVOS</h4>
                  <ul className="space-y-1">
                    {selectedAnalysis.positives.map((positive, i) => (
                      <li key={i} className="text-sm text-white flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        {positive}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-gray-500 text-center pt-2">
                Analisado em {new Date(selectedAnalysis.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}