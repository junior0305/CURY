import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Plus,
  RefreshCw,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Signal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BotInstance {
  id: string;
  name: string;
  phone: string;
  evolution_api_url: string;
  evolution_api_key: string;
  status: string;
  health_score: number;
  persona_name: string;
  persona_style: string;
  daily_limit: number;
  messages_today: number;
  last_message_at: string | null;
  weight: number;
  priority: number;
  total_messages_sent: number;
  total_conversations: number;
  conversion_rate: number;
  created_at: string;
  updated_at: string;
  last_health_check: string | null;
}

export default function Exercito() {
  const { toast } = useToast();
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editBot, setEditBot] = useState<BotInstance | null>(null);
  const [showApiKey, setShowApiKey] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    evolution_api_url: "",
    evolution_api_key: "",
    persona_name: "Assistente",
    persona_style: "formal",
    daily_limit: 200,
    weight: 10,
    priority: 5,
    is_prospecting: false,
  });

  const loadBots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_instances")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar bots", description: error.message, variant: "destructive" });
    } else {
      setBots(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBots();

    // Realtime subscription
    const channel = supabase
      .channel("bot_instances_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_instances" }, () => {
        loadBots();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.phone || !formData.evolution_api_url || !formData.evolution_api_key) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    const payload = {
          name: formData.name,
          phone: formData.phone,
          evolution_api_url: formData.evolution_api_url,
          evolution_api_key: formData.evolution_api_key,
          persona_name: formData.persona_name,
          persona_style: formData.persona_style,
          daily_limit: formData.daily_limit,
          weight: formData.weight,
          priority: formData.priority,
          is_prospecting: formData.is_prospecting,
          updated_at: new Date().toISOString(),
        };
    
    if (editBot) {
      const { error } = await supabase.from("bot_instances").update(payload).eq("id", editBot.id);
      if (error) {
        toast({ title: "Erro ao atualizar bot", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ Bot atualizado!" });
    } else {
      const { error } = await supabase.from("bot_instances").insert(payload);
      if (error) {
        toast({ title: "Erro ao criar bot", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ Bot criado com sucesso!" });
    }

    setModalOpen(false);
    resetForm();
    loadBots();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este bot?")) return;
    const { error } = await supabase.from("bot_instances").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao deletar bot", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Bot removido" });
      loadBots();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      evolution_api_url: "",
      evolution_api_key: "",
      persona_name: "Assistente",
      persona_style: "formal",
      daily_limit: 200,
      weight: 10,
      priority: 5,
    });
    setEditBot(null);
  };

  const openEdit = (bot: BotInstance) => {
    setEditBot(bot);
    setFormData({
      name: bot.name,
      phone: bot.phone,
      evolution_api_url: bot.evolution_api_url,
      evolution_api_key: bot.evolution_api_key,
      persona_name: bot.persona_name,
      persona_style: bot.persona_style,
      daily_limit: bot.daily_limit,
      weight: bot.weight,
      priority: bot.priority,
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const toggleApiKey = (id: string) => {
    setShowApiKey(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", icon: CheckCircle2 },
      paused: { bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-500/30", icon: AlertCircle },
      offline: { bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", icon: XCircle },
      blocked: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", icon: XCircle },
    };
    const style = styles[status as keyof typeof styles] || styles.offline;
    const Icon = style.icon;
    return (
      <Badge className={`${style.bg} ${style.text} border ${style.border} gap-1.5`}>
        <Icon className="w-3 h-3" />
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-green-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-green-500/30 bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {bots.filter(b => b.status === "active").length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-500/30 bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-400" />
              Total de Bots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{bots.length}</div>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-500/30 bg-purple-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              Msgs Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {bots.reduce((sum, bot) => sum + bot.messages_today, 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-500/30 bg-orange-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-400" />
              Conversas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {bots.reduce((sum, bot) => sum + bot.total_conversations, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header com botão */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Instâncias Ativas</h3>
          <p className="text-sm text-gray-500">Gerencie seus robôs de prospecção</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadBots} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={openCreate} className="bg-green-600 hover:bg-green-500 font-bold gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Bot
          </Button>
        </div>
      </div>

      {/* Lista de bots */}
      {bots.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Bot className="w-20 h-20 mx-auto mb-4 opacity-20" />
          <h3 className="text-xl font-bold mb-2">Nenhum bot configurado</h3>
          <p className="text-sm mb-4">Adicione sua primeira instância WhatsApp para começar</p>
          <Button onClick={openCreate} className="bg-green-600 hover:bg-green-500">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Primeiro Bot
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bots.map(bot => (
            <Card key={bot.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-green-500/50 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2.5 rounded-lg bg-green-900/40 border border-green-500/30 shrink-0">
                      <Bot className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-white font-bold text-base truncate">{bot.name}</h4>
                      <p className="text-xs text-gray-500 font-mono truncate">{bot.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {getStatusBadge(bot.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Persona */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Persona:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{bot.persona_name}</span>
                    <Badge variant="secondary" className="text-xs">{bot.persona_style}</Badge>
                  </div>
                </div>

                {/* Health */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Saúde:</span>
                  <div className="flex items-center gap-2">
                    <Signal className={`w-4 h-4 ${getHealthColor(bot.health_score)}`} />
                    <span className={`font-bold ${getHealthColor(bot.health_score)}`}>
                      {bot.health_score}%
                    </span>
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Mensagens hoje:</span>
                  <span className="text-white font-medium">
                    {bot.messages_today} / {bot.daily_limit}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min((bot.messages_today / bot.daily_limit) * 100, 100)}%` }}
                  />
                </div>

                {/* API Key (oculta) */}
                <div className="pt-2 border-t border-gray-700/50">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-gray-500">API Key:</span>
                    <button
                      onClick={() => toggleApiKey(bot.id)}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      {showApiKey.has(bot.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showApiKey.has(bot.id) ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                  <code className="text-xs text-gray-400 font-mono break-all block bg-slate-900/60 rounded px-2 py-1">
                    {showApiKey.has(bot.id) ? bot.evolution_api_key : "•".repeat(32)}
                  </code>
                </div>

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => openEdit(bot)}
                    variant="outline"
                    size="sm"
                    className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-700"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Editar
                  </Button>
                  <Button
                    onClick={() => handleDelete(bot.id)}
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-green-500 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Bot className="w-6 h-6 text-green-400" />
              {editBot ? "Editar Bot" : "Adicionar Novo Bot"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Configure uma instância WhatsApp do Evolution API
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome do Bot *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Bot Junior"
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone *</Label>
                <Input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="5511999999999"
                  className="bg-slate-800 border-gray-600 text-white font-mono"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">URL Evolution API *</Label>
              <Input
                value={formData.evolution_api_url}
                onChange={e => setFormData({ ...formData, evolution_api_url: e.target.value })}
                placeholder="https://sua-evolution-api.com"
                className="bg-slate-800 border-gray-600 text-white font-mono"
              />
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">API Key *</Label>
              <Input
                type="password"
                value={formData.evolution_api_key}
                onChange={e => setFormData({ ...formData, evolution_api_key: e.target.value })}
                placeholder="Sua chave de API"
                className="bg-slate-800 border-gray-600 text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome da Persona</Label>
                <Input
                  value={formData.persona_name}
                  onChange={e => setFormData({ ...formData, persona_name: e.target.value })}
                  placeholder="Ex: Junior"
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Estilo da Persona</Label>
                <Select value={formData.persona_style} onValueChange={value => setFormData({ ...formData, persona_style: value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="consultivo">Consultivo</SelectItem>
                    <SelectItem value="agressivo">Agressivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Limite Diário</Label>
                <Input
                  type="number"
                  value={formData.daily_limit}
                  onChange={e => setFormData({ ...formData, daily_limit: parseInt(e.target.value) })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Peso (1-100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.weight}
                  onChange={e => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Prioridade (1-10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.priority}
                  onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={formData.is_prospecting} onChange={e => setFormData({ ...formData, is_prospecting: e.target.checked })} />
                <span className="text-sm text-gray-300">Usar esta instância para prospecção (pool de disparo)</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-green-600 hover:bg-green-500 font-bold">
                {editBot ? "Salvar Alterações" : "Criar Bot"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
