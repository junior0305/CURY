import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Users, Plus, Pencil, Trash2, Phone, Mail, Shield, Bot, MessageSquare, RefreshCw, Smartphone, Settings, Bell, Save, UserCheck, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  team_id: string | null;
  manager_id: string | null;
  lead_assignment_enabled: boolean;
  evolution_instance: string | null;
  qualification_ai_enabled: boolean;
  bot_instance_id: string | null;
  automation_settings: {
    welcome_enabled: boolean;
    follow_up_enabled: boolean;
    ai_assist_enabled: boolean;
  };
  created_at: string;
  bot_instances?: BotInstance;
  teams?: Team;
  managers?: Profile;
}

interface BotInstance {
  id: string;
  name: string;
  phone: string;
  instance_name: string;
  status: string;
}

interface Team {
  id: string;
  name: string;
}

type Tab = "users" | "bots" | "settings";

export default function Tropas() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<Profile[]>([]);
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  
  const [notificationBotId, setNotificationBotId] = useState<string>("");
  const [notifyManagers, setNotifyManagers] = useState(true);
  const [notifyBrokers, setNotifyBrokers] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    full_name: "",
    phone: "",
    role: "broker",
    is_active: true,
    team_id: null as string | null,
    manager_id: null as string | null,
    lead_assignment_enabled: false,
    evolution_instance: "",
    qualification_ai_enabled: false,
    bot_instance_id: null as string | null,
    automation_settings: {
      welcome_enabled: false,
      follow_up_enabled: true,
      ai_assist_enabled: true,
    },
  });

  const [botFormData, setBotFormData] = useState({
    name: "",
    phone: "",
    evolution_api_url: "https://api.ape77.com.br",
    evolution_api_key: "",
    instance_name: "",
    status: "active",
  });

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*, bot_instances(*), teams:team_id(id, name), managers:profiles!manager_id(id, email, first_name, full_name)")
      .order("email", { ascending: true });
    
    if (error) {
      toast({ title: "Erro ao carregar usuários", description: error.message, variant: "destructive" });
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  const loadBots = async () => {
    const { data } = await supabase.from("bot_instances").select("*").order("name");
    if (data) setBots(data);
  };

  const loadTeams = async () => {
    const { data } = await supabase.from("teams").select("id, name").order("name");
    if (data) setTeams(data);
  };

  const loadManagers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, first_name, full_name")
      .in("role", ["MANAGER", "ADMIN", "SUPERINTENDENT"])
      .eq("is_active", true)
      .order("email");
    if (data) setManagers(data);
  };

  const loadSystemSettings = async () => {
    const { data: botSetting } = await supabase.from("system_settings").select("value").eq("key", "notification_bot_instance_id").maybeSingle();
    if (botSetting?.value) setNotificationBotId(botSetting.value);

    const { data: managerSetting } = await supabase.from("system_settings").select("value").eq("key", "notify_managers_enabled").maybeSingle();
    if (managerSetting?.value !== undefined) setNotifyManagers(managerSetting.value);

    const { data: brokerSetting } = await supabase.from("system_settings").select("value").eq("key", "notify_brokers_enabled").maybeSingle();
    if (brokerSetting?.value !== undefined) setNotifyBrokers(brokerSetting.value);
  };

  useEffect(() => {
    loadUsers();
    loadBots();
    loadTeams();
    loadManagers();
    loadSystemSettings();
  }, []);

  const handleSaveUser = async () => {
    if (!formData.email.trim()) {
      toast({ title: "Email obrigatório", variant: "destructive" });
      return;
    }

    try {
      if (editUser) {
        const { error } = await supabase.from("profiles").update({
          first_name: formData.first_name,
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          is_active: formData.is_active,
          team_id: formData.team_id,
          manager_id: formData.manager_id,
          lead_assignment_enabled: formData.lead_assignment_enabled,
          evolution_instance: formData.evolution_instance,
          qualification_ai_enabled: formData.qualification_ai_enabled,
          bot_instance_id: formData.bot_instance_id,
          automation_settings: formData.automation_settings,
        }).eq("id", editUser.id);
        
        if (error) throw error;
        toast({ title: "✅ Usuário atualizado!" });
    
      } else {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password || 'senha_temporaria_123',
            firstName: formData.first_name,
            lastName: formData.last_name,
            role: formData.role,
            teamId: formData.team_id,
            managerId: formData.manager_id,
            phone: formData.phone,
          }
        });
        
        console.log('Edge Function Response DATA:', JSON.stringify(data, null, 2));
        console.log('Edge Function Response ERROR:', JSON.stringify(error, null, 2));        
        if (error) {
          console.error('Edge Function Error:', error);
          throw error;
        }
        
        // Verificar se data tem erro interno
        if (data && data.error) {
          console.error('Edge Function returned error:', data.error);
          throw new Error(data.error);
        }
          
          // Atualizar campos adicionais que a Edge Function não cobre
          if (data?.user?.id) {
            await supabase.from("profiles").update({
              full_name: formData.full_name,
              lead_assignment_enabled: formData.lead_assignment_enabled,
              evolution_instance: formData.evolution_instance,
              qualification_ai_enabled: formData.qualification_ai_enabled,
              bot_instance_id: formData.bot_instance_id,
              automation_settings: formData.automation_settings,
            }).eq("id", data.user.id);
          }
          
          toast({ title: "✅ Usuário criado!" });
        }
        
        setModalOpen(false);
        resetForm();
        loadUsers();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveBot = async () => {
    if (!botFormData.name || !botFormData.phone || !botFormData.instance_name) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("bot_instances").insert({
        name: botFormData.name,
        phone: botFormData.phone,
        evolution_api_url: botFormData.evolution_api_url,
        evolution_api_key: botFormData.evolution_api_key,
        instance_name: botFormData.instance_name,
        status: botFormData.status,
        health_score: 100,
        persona_name: botFormData.name,
        persona_style: "casual",
        daily_limit: 200,
        weight: 10,
        priority: 5,
      });
      
      if (error) throw error;
      toast({ title: "✅ Bot cadastrado!" });
      setBotModalOpen(false);
      resetBotForm();
      loadBots();
    } catch (error: any) {
      toast({ title: "❌ Erro ao cadastrar bot", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await supabase.from("system_settings").upsert({ key: "notification_bot_instance_id", value: notificationBotId, description: "ID da instância usada para notificações do sistema" }, { onConflict: "key" });
      await supabase.from("system_settings").upsert({ key: "notify_managers_enabled", value: notifyManagers, description: "Ativar notificações para managers" }, { onConflict: "key" });
      await supabase.from("system_settings").upsert({ key: "notify_brokers_enabled", value: notifyBrokers, description: "Ativar notificações para brokers" }, { onConflict: "key" });
      toast({ title: "✅ Configurações salvas!" });
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const testNotification = async () => {
    if (!notificationBotId) {
      toast({ title: "⚠️ Selecione uma instância primeiro", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "🧪 Enviando teste..." });
      const { data: bot } = await supabase.from("bot_instances").select("phone").eq("id", notificationBotId).single();
      
      if (!bot?.phone) {
        toast({ title: "❌ Bot sem telefone", variant: "destructive" });
        return;
      }

      const { error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: { botId: notificationBotId, phone: bot.phone, message: "🧪 Teste de notificação do sistema!\n\nSe você recebeu esta mensagem, as notificações estão funcionando corretamente. ✅", conversationId: null },
      });

      if (error) throw error;
      toast({ title: "✅ Teste enviado!", description: `Verifique o WhatsApp ${bot.phone}` });
    } catch (error: any) {
      toast({ title: "❌ Erro no teste", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Desativar este usuário?")) return;
    const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao desativar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Usuário desativado" });
      loadUsers();
    }
  };

  const resetForm = () => {
    setFormData({
      email: "", first_name: "", full_name: "", phone: "", role: "broker", is_active: true,
      team_id: null, manager_id: null, lead_assignment_enabled: false, evolution_instance: "",
      qualification_ai_enabled: false, bot_instance_id: null,
      automation_settings: { welcome_enabled: false, follow_up_enabled: true, ai_assist_enabled: true },
    });
    setEditUser(null);
  };

  const resetBotForm = () => {
    setBotFormData({ name: "", phone: "", evolution_api_url: "https://api.ape77.com.br", evolution_api_key: "", instance_name: "", status: "active" });
  };

  const openEdit = (user: Profile) => {
    setEditUser(user);
    setFormData({
      email: user.email, first_name: user.first_name || "", full_name: user.full_name || "", phone: user.phone || "",
      role: user.role, is_active: user.is_active, team_id: user.team_id, manager_id: user.manager_id,
      lead_assignment_enabled: user.lead_assignment_enabled, evolution_instance: user.evolution_instance || "",
      qualification_ai_enabled: user.qualification_ai_enabled, bot_instance_id: user.bot_instance_id,
      automation_settings: user.automation_settings || { welcome_enabled: false, follow_up_enabled: true, ai_assist_enabled: true },
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const getRoleBadge = (role: string) => {
    const styles = {
      ADMIN: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", label: "Admin" },
      SUPERINTENDENT: { bg: "bg-purple-900/40", text: "text-purple-300", border: "border-purple-500/30", label: "Super" },
      MANAGER: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-500/30", label: "Manager" },
      BROKER: { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", label: "Corretor" },
      user: { bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", label: "Usuário" },
    };
    const style = styles[role as keyof typeof styles] || styles.user;
    return <Badge className={`${style.bg} ${style.text} border ${style.border}`}>{style.label}</Badge>;
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-blue-400 animate-pulse" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Gerenciar Usuários e Sistema</h3>
          <p className="text-sm text-gray-500">Configure corretores, bots e notificações</p>
        </div>
        {tab === "users" && (
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 font-bold gap-2">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Button>
        )}
        {tab === "bots" && (
          <Button onClick={() => setBotModalOpen(true)} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-900/20 gap-2">
            <Smartphone className="w-4 h-4" />
            Cadastrar Bot
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("users")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "users" ? "bg-blue-900/40 text-blue-300 border border-blue-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Users className="w-4 h-4" /> Usuários
          <span className="text-xs bg-slate-700 rounded px-1.5">{users.filter(u => u.is_active).length}</span>
        </button>
        <button onClick={() => setTab("bots")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "bots" ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Bot className="w-4 h-4" /> Bots
          <span className="text-xs bg-slate-700 rounded px-1.5">{bots.filter(b => b.status === 'active').length}</span>
        </button>
        <button onClick={() => setTab("settings")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "settings" ? "bg-green-900/40 text-green-300 border border-green-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Settings className="w-4 h-4" /> Configurações
        </button>
      </div>

      {tab === "users" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.filter(u => u.is_active).map(user => (
            <Card key={user.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-blue-500/50 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-5 h-5 text-blue-400 shrink-0" />
                      <h4 className="text-white font-bold text-base truncate">{user.first_name || user.full_name || user.email}</h4>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getRoleBadge(user.role)}
                      {user.team_id && user.teams && (
                        <Badge className="bg-orange-900/40 text-orange-300 border-orange-500/30 text-xs">
                          <Building className="w-3 h-3 mr-1" />
                          {user.teams.name}
                        </Badge>
                      )}
                      {user.bot_instance_id && (
                        <Badge className="bg-purple-900/40 text-purple-300 border-purple-500/30 text-xs">
                          <Bot className="w-3 h-3 mr-1" />
                          Bot
                        </Badge>
                      )}
                      {user.lead_assignment_enabled && (
                        <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs">
                          <UserCheck className="w-3 h-3 mr-1" />
                          Auto
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="text-white truncate">{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="text-white">{user.phone}</span>
                    </div>
                  )}
                  {user.manager_id && user.managers && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-white text-xs">Manager: {user.managers.first_name || user.managers.email}</span>
                    </div>
                  )}
                </div>

                {user.role === 'broker' && (
                  <div className="pt-2 border-t border-gray-700/50">
                    <div className="text-xs font-bold text-gray-400 mb-2">Status:</div>
                    <div className="space-y-1.5 text-xs">
                      {user.qualification_ai_enabled && (
                        <div className="flex items-center gap-1">
                          <Bot className="w-3 h-3 text-purple-400" />
                          <span className="text-purple-300">IA Autônoma</span>
                        </div>
                      )}
                      {user.automation_settings?.welcome_enabled && (
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-green-400" />
                          <span className="text-green-300">Boas-vindas ativo</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => openEdit(user)} variant="outline" size="sm" className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-700">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button onClick={() => handleDelete(user.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tab === "bots" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bots.filter(b => b.status === 'active').map(bot => (
            <Card key={bot.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-purple-500/50 transition-all">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  <h4 className="text-white font-bold">{bot.name}</h4>
                  <Badge className="bg-purple-900/40 text-purple-300 border-purple-500/30 text-xs ml-auto">{bot.instance_name}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefone:</span>
                    <span className="text-white font-mono">{bot.phone}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-2 border-gray-700/50 bg-slate-800/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-green-400" />
                <h4 className="text-white font-bold">Configurações de Notificações</h4>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase mb-2 block">Instância para Notificações</Label>
                <Select value={notificationBotId} onValueChange={setNotificationBotId}>
                  <SelectTrigger className="bg-slate-900 border-gray-600 text-white">
                    <SelectValue placeholder="Escolha uma instância" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    {bots.filter(b => b.status === 'active').map(bot => (
                      <SelectItem key={bot.id} value={bot.id}>{bot.name} ({bot.phone})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-4 border-t border-gray-700/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-400" />
                      Notificar Managers
                    </div>
                    <div className="text-xs text-gray-400">Resumo diário de leads sem resposta (9h)</div>
                  </div>
                  <Switch checked={notifyManagers} onCheckedChange={setNotifyManagers} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-green-400" />
                      Notificar Brokers
                    </div>
                    <div className="text-xs text-gray-400">Avisar quando lead é atribuído</div>
                  </div>
                  <Switch checked={notifyBrokers} onCheckedChange={setNotifyBrokers} />
                </div>
              </div>
              <div className="pt-4 border-t border-gray-700/50 flex gap-2">
                <Button onClick={testNotification} variant="outline" className="flex-1 border-purple-500/30 text-purple-400 hover:bg-purple-900/20">
                  🧪 Teste
                </Button>
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="flex-1 bg-green-600 hover:bg-green-500">
                  {savingSettings ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-blue-500 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              {editUser ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome *</Label>
                <Input value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} placeholder="João" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Email *</Label>
                <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!!editUser} placeholder="joao@email.com" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone</Label>
                <Input value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="11999999999" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Função</Label>
                <Select value={formData.role} onValueChange={value => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
  <SelectItem value="ADMIN">Admin</SelectItem>
  <SelectItem value="SUPERINTENDENT">Super</SelectItem>
  <SelectItem value="MANAGER">Manager</SelectItem>
  <SelectItem value="BROKER">Corretor</SelectItem>
</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Equipe</Label>
                <Select value={formData.team_id || "none"} onValueChange={value => setFormData({ ...formData, team_id: value === "none" ? null : value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Manager</Label>
                <Select value={formData.manager_id || "none"} onValueChange={value => setFormData({ ...formData, manager_id: value === "none" ? null : value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {managers.map(mgr => (
                      <SelectItem key={mgr.id} value={mgr.id}>{mgr.first_name || mgr.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.role === 'BROKER' && (
              <>
                <div>
                  <Label className="text-gray-400 text-xs uppercase">Bot/Instância</Label>
                  <Select value={formData.bot_instance_id || "none"} onValueChange={value => setFormData({ ...formData, bot_instance_id: value === "none" ? null : value })}>
                    <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-gray-600">
                      <SelectItem value="none">Nenhum</SelectItem>
                      {bots.map(bot => (
                        <SelectItem key={bot.id} value={bot.id}>{bot.name} ({bot.phone})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs uppercase">Nome da Instância Evolution</Label>
                  <Input value={formData.evolution_instance} onChange={e => setFormData({ ...formData, evolution_instance: e.target.value })} placeholder="ex: joao_silva" className="bg-slate-800 border-gray-600 text-white" />
                  <p className="text-xs text-gray-500 mt-1">Nome exato da instância no Evolution API</p>
                </div>

                <div className="border-2 border-purple-500/30 bg-purple-950/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Recebe Leads Automaticamente</div>
                      <div className="text-xs text-gray-400">Sistema distribui leads para este corretor</div>
                    </div>
                    <Switch checked={formData.lead_assignment_enabled} onCheckedChange={checked => setFormData({ ...formData, lead_assignment_enabled: checked })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">IA Atende Sozinha</div>
                      <div className="text-xs text-gray-400">IA responde sem precisar do corretor</div>
                    </div>
                    <Switch checked={formData.qualification_ai_enabled} onCheckedChange={checked => setFormData({ ...formData, qualification_ai_enabled: checked })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Boas-vindas</div>
                    <Switch checked={formData.automation_settings.welcome_enabled} onCheckedChange={checked => setFormData({ ...formData, automation_settings: { ...formData.automation_settings, welcome_enabled: checked } })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Follow-up</div>
                    <Switch checked={formData.automation_settings.follow_up_enabled} onCheckedChange={checked => setFormData({ ...formData, automation_settings: { ...formData.automation_settings, follow_up_enabled: checked } })} />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
              <Label className="text-gray-300">Usuário ativo</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setModalOpen(false)} variant="outline" className="flex-1 border-gray-600">Cancelar</Button>
              <Button onClick={handleSaveUser} className="flex-1 bg-blue-600">{editUser ? "Salvar" : "Criar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={botModalOpen} onOpenChange={setBotModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-purple-400" />
              Cadastrar Bot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome</Label>
                <Input value={botFormData.name} onChange={e => setBotFormData({ ...botFormData, name: e.target.value })} placeholder="Dudu" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone</Label>
                <Input value={botFormData.phone} onChange={e => setBotFormData({ ...botFormData, phone: e.target.value })} placeholder="5511999999999" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase">Nome da Instância</Label>
              <Input value={botFormData.instance_name} onChange={e => setBotFormData({ ...botFormData, instance_name: e.target.value })} placeholder="Dudu" className="bg-slate-800 border-gray-600 text-white" />
              <p className="text-xs text-gray-500 mt-1">Nome exato da instância no Evolution API</p>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase">API Key Evolution</Label>
              <Input value={botFormData.evolution_api_key} onChange={e => setBotFormData({ ...botFormData, evolution_api_key: e.target.value })} type="password" placeholder="sua-api-key" className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 rounded p-3 text-xs text-blue-300">
              ℹ️ <strong>Webhook URL:</strong> Configure no Evolution API:
              <code className="block mt-1 bg-slate-900/60 p-2 rounded text-xs">
                https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/webhook_receiver
              </code>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setBotModalOpen(false)} variant="outline" className="flex-1 border-gray-600">Cancelar</Button>
              <Button onClick={handleSaveBot} className="flex-1 bg-purple-600">Cadastrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
