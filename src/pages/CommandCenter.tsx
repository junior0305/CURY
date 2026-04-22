import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OperationalIntelligence } from "@/components/admin/OperationalIntelligence";
import {
  Flame,
  Crosshair,
  Skull,
  Trophy,
  Users,
  TrendingUp,
  Swords,
  Plus,
  Shield,
  Activity,
  ArrowLeft,
  WifiOff,
  Send,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface WarStats {
  new_leads: number;
  active_battles: number;
  dying_leads: number;
  pending_achievements: number;
  total_soldiers: number;
  total_captains: number;
  total_generals: number;
}

interface Warrior {
  id: string;
  name: string;
  email: string;
  role: string;
  kills: number;
  active_battles: number;
  streak: number;
  rank_position: number;
  team_id: string | null;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<WarStats>({
    new_leads: 0,
    active_battles: 0,
    dying_leads: 0,
    pending_achievements: 0,
    total_soldiers: 0,
    total_captains: 0,
    total_generals: 0
  });
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ sent: number; skipped: number } | null>(null);
  const navigate = useNavigate();

  async function handleNotifyDisconnected() {
    setNotifying(true);
    setNotifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('notify-disconnected-brokers');
      if (error) throw error;
      setNotifyResult({ sent: data.sent ?? 0, skipped: data.skipped ?? 0 });
      if ((data.sent ?? 0) > 0) {
        toast.success(`✅ ${data.sent} corretor(es) notificados via WhatsApp do gerente`);
      } else {
        toast.info('Nenhuma notificação necessária (todos conectados ou já notificados hoje)');
      }
    } catch (err: any) {
      toast.error(`Erro ao notificar: ${err.message}`);
    } finally {
      setNotifying(false);
    }
  }

  useEffect(() => {
    loadWarData();
    
    const channel = supabase
      .channel('war-room-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        loadWarData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements' }, () => {
        loadWarData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadWarData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWarData = async () => {
    try {
      const { data: leadsData } = await supabase
        .from('leads')
        .select('status, last_interaction_at, broker_id');

      const newLeads = leadsData?.filter(l => l.status === 'NEW').length || 0;
      const activeBattles = leadsData?.filter(l => 
        ['IN_PROGRESS', 'VISIT_SCHEDULED', 'DOCS_REQUESTED'].includes(l.status)
      ).length || 0;
      
      const dyingLeads = leadsData?.filter(l => {
        if (!l.last_interaction_at || l.status === 'CONCLUDED' || l.status === 'ABANDONED') return false;
        const lastInteraction = new Date(l.last_interaction_at);
        const hoursSince = (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60);
        return hoursSince > 24; // Alerta após 24h sem toque
      }).length || 0;

      const { data: achievementsData } = await supabase
        .from('achievements')
        .select('status')
        .eq('status', 'PENDING');

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role, team_id');

      const soldiers = profilesData?.filter(p => p.role === 'BROKER').length || 0;
      const captains = profilesData?.filter(p => p.role === 'MANAGER').length || 0;
      const generals = profilesData?.filter(p => 
        ['ADMIN', 'SUPERINTENDENT'].includes(p.role)
      ).length || 0;

      setStats({
        new_leads: newLeads,
        active_battles: activeBattles,
        dying_leads: dyingLeads,
        pending_achievements: achievementsData?.length || 0,
        total_soldiers: soldiers,
        total_captains: captains,
        total_generals: generals
      });

      // Cálculo de performance real por guerreiro
      const formattedWarriors: Warrior[] = (profilesData || []).map((p) => {
        const myLeads = leadsData?.filter(l => l.broker_id === p.id) || [];
        const kills = myLeads.filter(l => l.status === 'CONCLUDED').length;
        const active = myLeads.filter(l => ['IN_PROGRESS', 'VISIT_SCHEDULED', 'DOCS_REQUESTED'].includes(l.status)).length;
        
        return {
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sem nome',
          email: p.email || '',
          role: p.role,
          kills: kills,
          active_battles: active,
          streak: 0,
          rank_position: 0, // Será definido no sort
          team_id: p.team_id
        };
      })
      .sort((a, b) => (b.kills * 10 + b.active_battles) - (a.kills * 10 + a.active_battles))
      .map((w, idx) => ({ ...w, rank_position: idx + 1 }));

      setWarriors(formattedWarriors);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar dados de guerra:', error);
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'ADMIN' || role === 'SUPERINTENDENT') return '👑';
    if (role === 'MANAGER') return '🎖️';
    return '⚔️';
  };

  const getRoleName = (role: string) => {
    if (role === 'ADMIN' || role === 'SUPERINTENDENT') return 'GENERAL';
    if (role === 'MANAGER') return 'CAPITÃO';
    return 'SOLDADO';
  };

  const getRoleColor = (role: string) => {
    if (role === 'ADMIN' || role === 'SUPERINTENDENT') return 'text-yellow-400';
    if (role === 'MANAGER') return 'text-blue-400';
    return 'text-green-400';
  };

  const captainsRanking = warriors.filter(w => w.role === 'MANAGER');
  const soldiersRanking = warriors.filter(w => w.role === 'BROKER');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl font-black animate-pulse flex items-center gap-3">
          <Activity className="w-8 h-8 animate-spin" />
          CARREGANDO COMANDO CENTRAL...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900 p-4 md:p-6">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin')}
          className="text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao Admin
        </Button>
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-4xl md:text-6xl font-black text-white mb-2 tracking-wider flex items-center justify-center gap-3 flex-wrap">
          <Swords className="w-10 h-10 md:w-12 md:h-12 text-red-500 animate-pulse" />
          COMANDO CENTRAL
          <Swords className="w-10 h-10 md:w-12 md:h-12 text-red-500 animate-pulse" />
        </h1>
        <p className="text-gray-400 text-sm md:text-lg">Controle Total das Operações de Guerra</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-green-500" />
          <span className="text-gray-400">
            {stats.total_generals} Generais • {stats.total_captains} Capitães • {stats.total_soldiers} Soldados
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <Card className={cn(
          "border-2 transition-all hover:scale-105 cursor-pointer",
          stats.new_leads > 0 ? "border-red-500 bg-red-950/50 animate-pulse" : "border-gray-700 bg-slate-900/50"
        )}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300 flex items-center gap-2">
              <Flame className={cn("w-4 h-4 md:w-5 md:h-5", stats.new_leads > 0 ? "text-red-500" : "text-gray-500")} />
              <span className="hidden md:inline">NOVOS ALVOS</span>
              <span className="md:hidden">NOVOS</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 md:pb-4">
            <div className="text-3xl md:text-4xl font-black text-white mb-1">
              {stats.new_leads}
            </div>
            <p className="text-xs text-gray-400">Esperando ataque</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-500 bg-slate-900/50 hover:scale-105 transition-all cursor-pointer">
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300 flex items-center gap-2">
              <Crosshair className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              <span className="hidden md:inline">BATALHAS</span>
              <span className="md:hidden">ATIVAS</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 md:pb-4">
            <div className="text-3xl md:text-4xl font-black text-white mb-1">
              {stats.active_battles}
            </div>
            <p className="text-xs text-gray-400">Em combate</p>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-2 transition-all hover:scale-105 cursor-pointer",
          stats.dying_leads > 0 ? "border-orange-500 bg-orange-950/50" : "border-gray-700 bg-slate-900/50"
        )}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300 flex items-center gap-2">
              <Skull className={cn("w-4 h-4 md:w-5 md:h-5", stats.dying_leads > 0 ? "text-orange-500" : "text-gray-500")} />
              <span className="hidden md:inline">EM RISCO</span>
              <span className="md:hidden">RISCO</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 md:pb-4">
            <div className="text-3xl md:text-4xl font-black text-white mb-1">
              {stats.dying_leads}
            </div>
            <p className="text-xs text-gray-400">Sem contato +24h</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-500 bg-slate-900/50 hover:scale-105 transition-all cursor-pointer">
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300 flex items-center gap-2">
              <Trophy className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
              <span className="hidden md:inline">CONQUISTAS</span>
              <span className="md:hidden">PRÊMIOS</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 md:pb-4">
            <div className="text-3xl md:text-4xl font-black text-white mb-1">
              {stats.pending_achievements}
            </div>
            <p className="text-xs text-gray-400">Pendentes</p>
          </CardContent>
        </Card>
      </div>

      {/* ── ALERTA: CORRETORES DESCONECTADOS ── */}
      <Card className="border-2 border-orange-500 bg-orange-950/20 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-black text-white flex items-center gap-2">
            <WifiOff className="w-5 h-5 text-orange-400" />
            CORRETORES COM WHATSAPP DESCONECTADO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 mb-4">
            Corretores com chip offline não recebem nem enviam mensagens automáticas.
            Ao clicar abaixo, o sistema envia um WhatsApp pelo chip do gerente responsável
            avisando cada corretor para reconectar o QR Code.
            <span className="text-orange-300 font-semibold"> Não reenvia para quem já foi notificado nas últimas 8h.</span>
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              onClick={handleNotifyDisconnected}
              disabled={notifying}
              className="bg-orange-600 hover:bg-orange-500 text-white font-bold gap-2"
            >
              {notifying
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                : <><Send className="w-4 h-4" /> Notificar Desconectados</>
              }
            </Button>
            {notifyResult && (
              <span className="text-sm text-gray-300">
                Último disparo: <span className="text-green-400 font-bold">{notifyResult.sent} enviados</span>
                {notifyResult.skipped > 0 && <span className="text-gray-500"> · {notifyResult.skipped} pulados</span>}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="intel" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-900/50 border border-gray-700">
          <TabsTrigger value="intel" className="data-[state=active]:bg-cyan-900/50 text-xs md:text-sm">
            🧠 INTEL
          </TabsTrigger>
          <TabsTrigger value="captains" className="data-[state=active]:bg-blue-900/50 text-xs md:text-sm">
            🎖️ CAPITÃES
          </TabsTrigger>
          <TabsTrigger value="soldiers" className="data-[state=active]:bg-red-900/50 text-xs md:text-sm">
            ⚔️ SOLDADOS
          </TabsTrigger>
          <TabsTrigger value="troops" className="data-[state=active]:bg-purple-900/50 text-xs md:text-sm">
            👥 TROPAS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intel" className="mt-4 md:mt-6">
          <OperationalIntelligence />
        </TabsContent>

        <TabsContent value="captains" className="mt-4 md:mt-6">
          <Card className="border-2 border-blue-500 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
                RANKING DOS CAPITÃES ({captainsRanking.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {captainsRanking.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Nenhum capitão registrado</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {captainsRanking.map((warrior, idx) => (
                    <div
                      key={warrior.id}
                      className={cn(
                        "flex items-center justify-between p-3 md:p-4 rounded-lg border-2 transition-all hover:scale-[1.02] cursor-pointer",
                        idx === 0 ? "border-yellow-500 bg-yellow-950/20" :
                        idx === 1 ? "border-gray-400 bg-gray-950/20" :
                        idx === 2 ? "border-orange-600 bg-orange-950/20" :
                        "border-gray-700 bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "text-2xl md:text-3xl font-black w-8 md:w-12 text-center flex-shrink-0",
                          idx === 0 ? "text-yellow-500" :
                          idx === 1 ? "text-gray-400" :
                          idx === 2 ? "text-orange-600" :
                          "text-gray-600"
                        )}>
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl md:text-2xl flex-shrink-0">🎖️</span>
                            <span className="text-white font-bold text-sm md:text-lg truncate">{warrior.name}</span>
                          </div>
                          <div className="text-xs md:text-sm text-gray-400 mt-1">
                            {warrior.kills} kills • {warrior.active_battles} ativos
                          </div>
                        </div>
                      </div>
                      {idx < 3 && (
                        <div className="text-2xl md:text-4xl flex-shrink-0">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="soldiers" className="mt-4 md:mt-6">
          <Card className="border-2 border-red-500 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
                RANKING DOS SOLDADOS ({soldiersRanking.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {soldiersRanking.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Crosshair className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Nenhum soldado registrado</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {soldiersRanking.map((warrior, idx) => (
                    <div
                      key={warrior.id}
                      className={cn(
                        "flex items-center justify-between p-3 md:p-4 rounded-lg border-2 transition-all hover:scale-[1.02] cursor-pointer",
                        idx === 0 ? "border-yellow-500 bg-yellow-950/20" :
                        idx === 1 ? "border-gray-400 bg-gray-950/20" :
                        idx === 2 ? "border-orange-600 bg-orange-950/20" :
                        "border-gray-700 bg-slate-800/50"
                      )}
                    >
                      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "text-2xl md:text-3xl font-black w-8 md:w-12 text-center flex-shrink-0",
                          idx === 0 ? "text-yellow-500" :
                          idx === 1 ? "text-gray-400" :
                          idx === 2 ? "text-orange-600" :
                          "text-gray-600"
                        )}>
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl md:text-2xl flex-shrink-0">⚔️</span>
                            <span className="text-white font-bold text-sm md:text-lg truncate">{warrior.name}</span>
                          </div>
                          <div className="text-xs md:text-sm text-gray-400 mt-1">
                            {warrior.kills} kills • {warrior.active_battles} ativos
                          </div>
                        </div>
                      </div>
                      {idx < 3 && (
                        <div className="text-2xl md:text-4xl flex-shrink-0">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="troops" className="mt-4 md:mt-6">
          <Card className="border-2 border-purple-500 bg-slate-900/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
                TODAS AS TROPAS ({warriors.length})
              </CardTitle>
              <Button
                onClick={() => navigate('/admin')}
                className="bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden md:inline">Recrutar</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 md:space-y-3">
                {warriors.map((warrior) => (
                  <div
                    key={warrior.id}
                    className="flex items-center justify-between p-3 md:p-4 rounded-lg border-2 border-gray-700 bg-slate-800/50 hover:border-purple-500 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <span className="text-2xl md:text-3xl flex-shrink-0">{getRoleIcon(warrior.role)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-bold text-sm md:text-base truncate">{warrior.name}</div>
                        <div className={cn("text-xs md:text-sm font-medium", getRoleColor(warrior.role))}>
                          {getRoleName(warrior.role)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{warrior.email}</div>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row items-end md:items-center gap-1 md:gap-2 flex-shrink-0">
                      <Badge variant="secondary" className="text-xs">{warrior.kills} kills</Badge>
                      <Badge variant="outline" className="text-xs">{warrior.active_battles} ativos</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}