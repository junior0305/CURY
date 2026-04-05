import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  RefreshCw,
  BarChart2,
  RotateCcw,
  Scale,
  Target,
  Settings2,
  Sparkles,
  Bot,
  Bell,
  Flame,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AgentField {
  key: string;
  label: string;
  type: "number" | "time";
  default: string | number;
  min?: number;
  max?: number;
  hint?: string;
}

interface AgentDef {
  id: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  title: string;
  description: string;
  enabledKey: string;
  status: "available" | "coming_soon";
  fields: AgentField[];
  notes?: string;
}

// ── Registro de agentes (adicionar novos agentes aqui) ────────────────────────

const AGENTS: AgentDef[] = [
  {
    id: "redistribuicao",
    icon: RefreshCw,
    color: "text-blue-400",
    bgColor: "bg-blue-900/20",
    borderColor: "border-blue-500/30",
    title: "Redistribuição Automática",
    description:
      "Move leads sem resposta do corretor para outro corretor disponível após X horas.",
    enabledKey: "agente_redistribuicao_enabled",
    status: "available",
    fields: [
      {
        key: "agente_redistribuicao_threshold_h",
        label: "Redistribuir após (horas)",
        type: "number",
        default: 4,
        min: 1,
        max: 72,
        hint: "Horas sem resposta do corretor antes de redistribuir o lead para outro disponível.",
      },
    ],
    notes:
      'Corretores marcados como "protegidos" nunca têm leads redistribuídos automaticamente, independente do tempo.',
  },
  {
    id: "relatorio",
    icon: BarChart2,
    color: "text-purple-400",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-500/30",
    title: "Relatório Diário",
    description:
      "Envia resumo diário para admins e gerentes via WhatsApp no horário configurado.",
    enabledKey: "agente_relatorio_enabled",
    status: "available",
    fields: [
      {
        key: "agente_relatorio_hora_brt",
        label: "Horário de envio (BRT)",
        type: "time",
        default: "21:00",
        hint: "Horário no fuso de Brasília. O relatório inclui leads do dia, conversões e bots com problema.",
      },
    ],
    notes:
      "Usa a mesma instância de notificações já configurada no Sistema. Envia para todos os admins e gerentes com telefone cadastrado.",
  },
  {
    id: "recuperacao",
    icon: RotateCcw,
    color: "text-green-400",
    bgColor: "bg-green-900/20",
    borderColor: "border-green-500/30",
    title: "Recuperação de Abandonados",
    description:
      "Reativa leads abandonados após X dias com mensagem personalizada.",
    enabledKey: "agente_recuperacao_enabled",
    status: "available",
    fields: [
      {
        key: "agente_recuperacao_dias",
        label: "Dias de espera após abandono",
        type: "number",
        default: 15,
        min: 7,
        max: 90,
        hint: "Quantos dias após o abandono antes de tentar reativar o lead.",
      },
      {
        key: "agente_recuperacao_max_tentativas",
        label: "Máx. tentativas por lead",
        type: "number",
        default: 2,
        min: 1,
        max: 5,
        hint: "Após atingir o limite, o lead não será mais contatado automaticamente.",
      },
    ],
    notes:
      "Leads reativados voltam para status NEW. O corretor original é notificado para fazer o acompanhamento.",
  },
  {
    id: "sobrecarga",
    icon: Scale,
    color: "text-orange-400",
    bgColor: "bg-orange-900/20",
    borderColor: "border-orange-500/30",
    title: "Anti-Sobrecarga",
    description:
      "Pausa a distribuição para corretores com leads ativos acima do limite.",
    enabledKey: "agente_sobrecarga_enabled",
    status: "available",
    fields: [
      {
        key: "agente_sobrecarga_max_leads",
        label: "Máx. leads ativos por corretor",
        type: "number",
        default: 30,
        min: 5,
        max: 200,
        hint: "Ao atingir o limite, o corretor para de receber novos leads. Restaura automaticamente quando a carga cair para 80% do limite.",
      },
    ],
    notes:
      "Só pausa corretores que foram desativados por este agente. Corretores desabilitados manualmente não são afetados.",
  },
  {
    id: "scoring",
    icon: Target,
    color: "text-red-400",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-500/30",
    title: "Scoring de Leads",
    description:
      "Calcula e atualiza o score de cada lead com base em engajamento e recência.",
    enabledKey: "agente_scoring_enabled",
    status: "available",
    fields: [],
    notes:
      "Score de 0-100 atualizado a cada hora. Leva em conta: resposta ao contato inicial, status no funil, tempo desde a última interação e acessibilidade via bot.",
  },
  {
    id: "sentinela-quentes",
    icon: Flame,
    color: "text-orange-400",
    bgColor: "bg-orange-900/20",
    borderColor: "border-orange-500/30",
    title: "Sentinela de Leads Quentes",
    description:
      "Alerta gerentes via WhatsApp quando leads classificados como 'quentes' ficam sem resposta do corretor.",
    enabledKey: "agente_sentinela_quentes_enabled",
    status: "available",
    fields: [
      {
        key: "agente_sentinela_quentes_threshold_min",
        label: "Alertar após (minutos sem resposta)",
        type: "number",
        default: 30,
        min: 5,
        max: 240,
        hint: "Tempo sem resposta do corretor para um lead quente antes de alertar o gerente.",
      },
    ],
    notes:
      "Roda a cada 5 minutos via cron. Só alerta leads com intenção classificada como 'quente' pela IA (lead_state). Deduplica alertas — não reenvia para o mesmo lead dentro de 2h.",
  },
  {
    id: "briefing-corretor",
    icon: Bell,
    color: "text-cyan-400",
    bgColor: "bg-cyan-900/20",
    borderColor: "border-cyan-500/30",
    title: "Briefing Matinal do Corretor",
    description:
      "Envia às 08h BRT um resumo personalizado para cada corretor com leads quentes, ranking e tarefas do dia.",
    enabledKey: "agente_briefing_corretor_enabled",
    status: "available",
    fields: [],
    notes:
      "Disparado diariamente às 08:00 BRT. Inclui: leads quentes aguardando resposta, fila ativa por status, posição no ranking mensal e tarefas do dia. Deduplica — só envia uma vez por corretor por dia.",
  },
  {
    id: "classificacao-retro",
    icon: Brain,
    color: "text-violet-400",
    bgColor: "bg-violet-900/20",
    borderColor: "border-violet-500/30",
    title: "Classificação Retroativa",
    description:
      "Classifica com IA leads ativos que ainda não possuem intenção definida (lead_state sem_info).",
    enabledKey: "agente_classificacao_retro_enabled",
    status: "available",
    fields: [
      {
        key: "agente_classificacao_retro_batch",
        label: "Leads por execução (batch)",
        type: "number",
        default: 50,
        min: 10,
        max: 200,
        hint: "Quantos leads processar por vez. Valores menores reduzem custo de IA por execução.",
      },
    ],
    notes:
      "Usa Gemini Flash para classificar intenção, tema e momento com base no histórico de conversas. Roda diariamente às 09h BRT (ou manualmente). Processa apenas leads sem classificação prévia.",
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function Agentes() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const keys = AGENTS.flatMap((a) => [a.enabledKey, ...a.fields.map((f) => f.key)]);
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", keys);
    const map: Record<string, string> = {};
    for (const row of data || []) {
      map[row.key] = String(row.value ?? "");
    }
    setSettings(map);
    setLoading(false);
  };

  const isEnabled = (agent: AgentDef) => settings[agent.enabledKey] === "true";

  const openConfig = (agent: AgentDef) => {
    const vals: Record<string, string> = {
      [agent.enabledKey]: settings[agent.enabledKey] ?? "false",
    };
    for (const field of agent.fields) {
      vals[field.key] = settings[field.key] ?? String(field.default);
    }
    setLocalValues(vals);
    setSelectedAgent(agent);
  };

  const toggleEnabled = async (agent: AgentDef, enabled: boolean) => {
    const value = enabled ? "true" : "false";
    await supabase
      .from("system_settings")
      .upsert({ key: agent.enabledKey, value }, { onConflict: "key" });
    setSettings((prev) => ({ ...prev, [agent.enabledKey]: value }));
  };

  const saveAgentConfig = async () => {
    if (!selectedAgent) return;
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(localValues).map(([key, value]) =>
          supabase.from("system_settings").upsert({ key, value }, { onConflict: "key" })
        )
      );
      setSettings((prev) => ({ ...prev, ...localValues }));
      toast({
        title: "Configurações salvas",
        description: `${selectedAgent.title} atualizado.`,
      });
      setSelectedAgent(null);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const activeCount = AGENTS.filter(
    (a) => a.status === "available" && isEnabled(a)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-400" />
            Agentes Autônomos
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Agentes que executam tarefas automaticamente em segundo plano.
            Configure e ative cada agente individualmente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              "text-sm px-3 py-1 border",
              activeCount > 0
                ? "bg-green-900/30 text-green-300 border-green-500/30"
                : "bg-slate-800 text-gray-500 border-gray-700/40"
            )}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {activeCount} ativo{activeCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          const enabled = isEnabled(agent);
          const isAvailable = agent.status === "available";

          return (
            <Card
              key={agent.id}
              className={cn(
                "border transition-all duration-200",
                isAvailable
                  ? enabled
                    ? "bg-slate-900/80 border-gray-600/60 shadow-lg"
                    : "bg-slate-900/60 border-gray-700/50 hover:border-gray-600/60"
                  : "bg-slate-900/30 border-gray-800/30 opacity-50"
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  {/* Ícone */}
                  <div
                    className={cn(
                      "p-2.5 rounded-xl shrink-0 border",
                      agent.bgColor,
                      agent.borderColor
                    )}
                  >
                    <Icon className={cn("w-5 h-5", agent.color)} />
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">
                            {agent.title}
                          </span>
                          {!isAvailable ? (
                            <Badge className="text-xs bg-slate-800 text-gray-500 border-gray-700/40 border">
                              Em breve
                            </Badge>
                          ) : enabled ? (
                            <Badge className="text-xs bg-green-900/30 text-green-300 border-green-500/30 border">
                              ● Ativo
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-slate-800/60 text-gray-500 border-gray-700/40 border">
                              ○ Inativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">
                          {agent.description}
                        </p>
                      </div>

                      {/* Toggle */}
                      {isAvailable && (
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => toggleEnabled(agent, v)}
                          disabled={loading}
                          className="shrink-0 mt-0.5"
                        />
                      )}
                    </div>

                    {/* Botão configurar */}
                    {isAvailable && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openConfig(agent)}
                          className="text-xs text-gray-400 hover:text-white hover:bg-slate-700/60 gap-1.5 h-7 px-2.5"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Configurar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sheet de configuração */}
      <Sheet
        open={!!selectedAgent}
        onOpenChange={(open) => !open && setSelectedAgent(null)}
      >
        <SheetContent className="bg-slate-900 border-gray-700/50 text-white w-full sm:max-w-md">
          {selectedAgent && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-white flex items-center gap-2">
                  <selectedAgent.icon
                    className={cn("w-5 h-5", selectedAgent.color)}
                  />
                  {selectedAgent.title}
                </SheetTitle>
                <SheetDescription className="text-gray-400 text-sm leading-relaxed">
                  {selectedAgent.description}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5">
                {/* Toggle principal */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-gray-700/40">
                  <div>
                    <p className="text-white text-sm font-semibold">
                      Agente ativo
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Liga ou desliga este agente
                    </p>
                  </div>
                  <Switch
                    checked={localValues[selectedAgent.enabledKey] === "true"}
                    onCheckedChange={(v) =>
                      setLocalValues((prev) => ({
                        ...prev,
                        [selectedAgent.enabledKey]: v ? "true" : "false",
                      }))
                    }
                  />
                </div>

                {/* Campos de configuração */}
                {selectedAgent.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-gray-300 text-sm font-medium">
                      {field.label}
                    </Label>
                    <Input
                      type={field.type}
                      value={localValues[field.key] ?? String(field.default)}
                      min={field.min}
                      max={field.max}
                      onChange={(e) =>
                        setLocalValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="bg-slate-800 border-gray-600/60 text-white focus:border-amber-500/50"
                    />
                    {field.hint && (
                      <p className="text-gray-500 text-xs leading-relaxed">
                        {field.hint}
                      </p>
                    )}
                  </div>
                ))}

                {/* Nota informativa */}
                {selectedAgent.notes && (
                  <div className="p-3.5 rounded-xl bg-amber-900/10 border border-amber-500/20">
                    <p className="text-amber-300/80 text-xs leading-relaxed">
                      ℹ️ {selectedAgent.notes}
                    </p>
                  </div>
                )}

                {/* Salvar */}
                <Button
                  onClick={saveAgentConfig}
                  disabled={saving}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  {saving ? "Salvando..." : "Salvar configurações"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
