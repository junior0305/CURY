import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Award, Settings } from "lucide-react";

interface XPAction {
  id: string;
  name: string;
  description: string;
  action_type: 'POSITIVE' | 'NEGATIVE';
  trigger_event: string;
  xp_value: number;
  is_active: boolean;
}

interface BrokerRank {
  id: string;
  level: number;
  name: string;
  icon: string;
  xp_min: number;
  xp_max: number;
  bonus_percentage: number;
  perks: string[];
}

export default function Gamificacao() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'actions' | 'ranks'>('actions');
  const [actions, setActions] = useState<XPAction[]>([]);
  const [ranks, setRanks] = useState<BrokerRank[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [rankModalOpen, setRankModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<XPAction | null>(null);
  const [editingRank, setEditingRank] = useState<BrokerRank | null>(null);

  // Form states
  const [actionForm, setActionForm] = useState({
    name: '',
    description: '',
    action_type: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE',
    trigger_event: '',
    xp_value: 0,
  });

  const [rankForm, setRankForm] = useState({
    level: 1,
    name: '',
    icon: '🎖️',
    xp_min: 0,
    xp_max: 499,
    bonus_percentage: 0,
    perks: [''],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    const { data: actionsData } = await supabase
      .from('xp_actions')
      .select('*')
      .order('action_type', { ascending: false })
      .order('xp_value', { ascending: false });

    const { data: ranksData } = await supabase
      .from('broker_ranks')
      .select('*')
      .order('level', { ascending: true });

    setActions(actionsData || []);
    setRanks(ranksData || []);
    setLoading(false);
  };

  const openActionModal = (action?: XPAction) => {
    if (action) {
      setEditingAction(action);
      setActionForm({
        name: action.name,
        description: action.description || '',
        action_type: action.action_type,
        trigger_event: action.trigger_event,
        xp_value: action.xp_value,
      });
    } else {
      setEditingAction(null);
      setActionForm({
        name: '',
        description: '',
        action_type: 'POSITIVE',
        trigger_event: '',
        xp_value: 0,
      });
    }
    setActionModalOpen(true);
  };

  const openRankModal = (rank?: BrokerRank) => {
    if (rank) {
      setEditingRank(rank);
      setRankForm({
        level: rank.level,
        name: rank.name,
        icon: rank.icon,
        xp_min: rank.xp_min,
        xp_max: rank.xp_max,
        bonus_percentage: rank.bonus_percentage,
        perks: rank.perks || [''],
      });
    } else {
      setEditingRank(null);
      const nextLevel = ranks.length > 0 ? Math.max(...ranks.map(r => r.level)) + 1 : 1;
      setRankForm({
        level: nextLevel,
        name: '',
        icon: '🎖️',
        xp_min: 0,
        xp_max: 499,
        bonus_percentage: 0,
        perks: [''],
      });
    }
    setRankModalOpen(true);
  };

  const saveAction = async () => {
    if (!actionForm.name || !actionForm.trigger_event) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    const data = {
      ...actionForm,
      updated_at: new Date().toISOString(),
    };

    if (editingAction) {
      const { error } = await supabase
        .from('xp_actions')
        .update(data)
        .eq('id', editingAction.id);

      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase
        .from('xp_actions')
        .insert(data);

      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: editingAction ? "Ação atualizada!" : "Ação criada!" });
    setActionModalOpen(false);
    loadData();
  };

  const saveRank = async () => {
    if (!rankForm.name) {
      toast({ title: "Preencha o nome da patente", variant: "destructive" });
      return;
    }

    const data = {
      ...rankForm,
      perks: rankForm.perks.filter(p => p.trim() !== ''),
      updated_at: new Date().toISOString(),
    };

    if (editingRank) {
      const { error } = await supabase
        .from('broker_ranks')
        .update(data)
        .eq('id', editingRank.id);

      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase
        .from('broker_ranks')
        .insert(data);

      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: editingRank ? "Patente atualizada!" : "Patente criada!" });
    setRankModalOpen(false);
    loadData();
  };

  const deleteAction = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta ação?")) return;

    const { error } = await supabase
      .from('xp_actions')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Ação excluída!" });
    loadData();
  };

  const deleteRank = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta patente?")) return;

    const { error } = await supabase
      .from('broker_ranks')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Patente excluída!" });
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-2">
            <Settings className="w-7 h-7 text-purple-400" />
            Gamificação
          </h3>
          <p className="text-sm text-gray-500">Configure o sistema de XP e patentes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('actions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab === 'actions'
              ? "bg-blue-900/40 text-blue-300 border border-blue-500/30"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Ações & XP
          <Badge className="bg-slate-700">{actions.length}</Badge>
        </button>
        <button
          onClick={() => setTab('ranks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab === 'ranks'
              ? "bg-purple-900/40 text-purple-300 border border-purple-500/30"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Award className="w-4 h-4" />
          Patentes
          <Badge className="bg-slate-700">{ranks.length}</Badge>
        </button>
      </div>

      {/* Ações */}
      {tab === 'actions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openActionModal()} className="bg-blue-600 hover:bg-blue-500">
              <Plus className="w-4 h-4 mr-2" />
              Nova Ação
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ações Positivas */}
            <Card className="border-2 border-green-700/50 bg-green-950/20">
              <CardHeader>
                <h4 className="text-white font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  Ações Positivas (+XP)
                </h4>
              </CardHeader>
              <CardContent className="space-y-2">
                {actions.filter(a => a.action_type === 'POSITIVE').map(action => (
                  <div key={action.id} className="bg-slate-800/60 rounded-lg p-3 border border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-white">{action.name}</div>
                        <div className="text-xs text-gray-400">{action.description}</div>
                        <div className="text-xs text-green-400 mt-1">+{action.xp_value} XP</div>
                      </div>
                      <div className="flex gap-1">
                        <Button onClick={() => openActionModal(action)} size="sm" variant="outline" className="border-gray-600">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button onClick={() => deleteAction(action.id)} size="sm" variant="outline" className="border-red-500/30 text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Ações Negativas */}
            <Card className="border-2 border-red-700/50 bg-red-950/20">
              <CardHeader>
                <h4 className="text-white font-bold flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  Ações Negativas (-XP)
                </h4>
              </CardHeader>
              <CardContent className="space-y-2">
                {actions.filter(a => a.action_type === 'NEGATIVE').map(action => (
                  <div key={action.id} className="bg-slate-800/60 rounded-lg p-3 border border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-white">{action.name}</div>
                        <div className="text-xs text-gray-400">{action.description}</div>
                        <div className="text-xs text-red-400 mt-1">{action.xp_value} XP</div>
                      </div>
                      <div className="flex gap-1">
                        <Button onClick={() => openActionModal(action)} size="sm" variant="outline" className="border-gray-600">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button onClick={() => deleteAction(action.id)} size="sm" variant="outline" className="border-red-500/30 text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Patentes */}
      {tab === 'ranks' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openRankModal()} className="bg-purple-600 hover:bg-purple-500">
              <Plus className="w-4 h-4 mr-2" />
              Nova Patente
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {ranks.map(rank => (
              <Card key={rank.id} className="border-2 border-purple-700/50 bg-purple-950/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{rank.icon}</span>
                      <div>
                        <div className="text-white font-bold">{rank.name}</div>
                        <div className="text-xs text-gray-400">Nível {rank.level}</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button onClick={() => openRankModal(rank)} size="sm" variant="outline" className="border-gray-600">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button onClick={() => deleteRank(rank.id)} size="sm" variant="outline" className="border-red-500/30 text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-slate-800/60 rounded p-2 text-xs">
                    <div className="text-gray-400">Requisito XP</div>
                    <div className="text-white font-mono">{rank.xp_min.toLocaleString()} - {rank.xp_max.toLocaleString()}</div>
                  </div>
                  {rank.bonus_percentage > 0 && (
                    <div className="bg-green-900/20 rounded p-2 text-xs">
                      <div className="text-green-400">Bônus Comissão</div>
                      <div className="text-white font-bold">+{rank.bonus_percentage}%</div>
                    </div>
                  )}
                  {rank.perks && rank.perks.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-400">Benefícios:</div>
                      {rank.perks.map((perk, i) => (
                        <div key={i} className="text-xs text-purple-300">• {perk}</div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal Ação */}
      <Dialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
        <DialogContent className="bg-slate-900 border-blue-500 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {editingAction ? "Editar Ação" : "Nova Ação"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Ação *</Label>
              <Input
                value={actionForm.name}
                onChange={e => setActionForm({ ...actionForm, name: e.target.value })}
                placeholder="Ex: Venda Fechada"
                className="bg-slate-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={actionForm.description}
                onChange={e => setActionForm({ ...actionForm, description: e.target.value })}
                placeholder="Ex: Fechar uma venda com cliente"
                className="bg-slate-800 border-gray-600 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select value={actionForm.action_type} onValueChange={(v: 'POSITIVE' | 'NEGATIVE') => setActionForm({ ...actionForm, action_type: v })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="POSITIVE">Positiva (+XP)</SelectItem>
                    <SelectItem value="NEGATIVE">Negativa (-XP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor de XP *</Label>
                <Input
                  type="number"
                  value={actionForm.xp_value}
                  onChange={e => setActionForm({ ...actionForm, xp_value: parseInt(e.target.value) || 0 })}
                  placeholder="Ex: 200"
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
            </div>
            <div>
              <Label>Trigger Event (código do evento) *</Label>
              <Input
                value={actionForm.trigger_event}
                onChange={e => setActionForm({ ...actionForm, trigger_event: e.target.value })}
                placeholder="Ex: CLOSE_SALE, COACH_SCORE_HIGH"
                className="bg-slate-800 border-gray-600 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Código único para identificar quando aplicar esta ação</p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={() => setActionModalOpen(false)} variant="outline" className="flex-1 border-gray-600">
                Cancelar
              </Button>
              <Button onClick={saveAction} className="flex-1 bg-blue-600">
                {editingAction ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Patente */}
      <Dialog open={rankModalOpen} onOpenChange={setRankModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {editingRank ? "Editar Patente" : "Nova Patente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Nível *</Label>
                <Input
                  type="number"
                  value={rankForm.level}
                  onChange={e => setRankForm({ ...rankForm, level: parseInt(e.target.value) || 1 })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label>Nome *</Label>
                <Input
                  value={rankForm.name}
                  onChange={e => setRankForm({ ...rankForm, name: e.target.value })}
                  placeholder="Ex: Soldado"
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label>Ícone (emoji)</Label>
                <Input
                  value={rankForm.icon}
                  onChange={e => setRankForm({ ...rankForm, icon: e.target.value })}
                  placeholder="🪖"
                  className="bg-slate-800 border-gray-600 text-white text-center text-2xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>XP Mínimo *</Label>
                <Input
                  type="number"
                  value={rankForm.xp_min}
                  onChange={e => setRankForm({ ...rankForm, xp_min: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label>XP Máximo *</Label>
                <Input
                  type="number"
                  value={rankForm.xp_max}
                  onChange={e => setRankForm({ ...rankForm, xp_max: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-gray-600 text-white"
                />
              </div>
            </div>
            <div>
              <Label>Bônus de Comissão (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={rankForm.bonus_percentage}
                onChange={e => setRankForm({ ...rankForm, bonus_percentage: parseFloat(e.target.value) || 0 })}
                placeholder="Ex: 5"
                className="bg-slate-800 border-gray-600 text-white"
              />
            </div>
            <div>
              <Label>Benefícios</Label>
              {rankForm.perks.map((perk, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input
                    value={perk}
                    onChange={e => {
                      const newPerks = [...rankForm.perks];
                      newPerks[i] = e.target.value;
                      setRankForm({ ...rankForm, perks: newPerks });
                    }}
                    placeholder="Ex: Acesso a relatórios avançados"
                    className="bg-slate-800 border-gray-600 text-white"
                  />
                  <Button
                    onClick={() => setRankForm({ ...rankForm, perks: rankForm.perks.filter((_, idx) => idx !== i) })}
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => setRankForm({ ...rankForm, perks: [...rankForm.perks, ''] })}
                variant="outline"
                size="sm"
                className="border-purple-500/30 text-purple-400 mt-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Benefício
              </Button>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={() => setRankModalOpen(false)} variant="outline" className="flex-1 border-gray-600">
                Cancelar
              </Button>
              <Button onClick={saveRank} className="flex-1 bg-purple-600">
                {editingRank ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}