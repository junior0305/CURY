import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Bot, Plus, Pencil, Trash2, Save, MessageSquare, Brain, Video, Mic, Image, FileText, Play, Clock, ArrowRight, Hand, Shield, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIProfile {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

interface CadenceTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  cadence_steps?: CadenceStep[];
}

interface CadenceStep {
  id: string;
  cadence_id: string;
  step_number: number;
  delay_days: number;
  media_type: string;
  content: string | null;
  media_url: string | null;
  caption: string | null;
}

interface WelcomeTemplate {
  id: string;
  name: string;
  message: string;
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

type Tab = "profiles" | "cadence" | "welcome";

interface SentinelaConfig {
  id?: string;
  is_enabled: boolean;
  provider: string;
  model_name: string;
  max_tokens: number;
  monthly_budget_usd: number;
  monthly_spent_usd: number;
  window_start_brt: string;
  window_end_brt: string;
  stale_threshold_h: number;
  max_messages_session: number;
  default_profile_id: string | null;
}

interface ProfileMapRow {
  id?: string;
  match_field: "tag" | "source";
  match_value: string;
  profile_id: string;
  priority: number;
}

export default function IaBuilder() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("profiles");
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [cadences, setCadences] = useState<CadenceTemplate[]>([]);
  const [welcomeTemplates, setWelcomeTemplates] = useState<WelcomeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [cadenceModalOpen, setCadenceModalOpen] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<AIProfile | null>(null);
  const [editCadence, setEditCadence] = useState<CadenceTemplate | null>(null);
  const [editWelcome, setEditWelcome] = useState<WelcomeTemplate | null>(null);

  const [profileFormData, setProfileFormData] = useState({
    name: "",
    description: "",
    system_prompt: "",
    is_active: true,
  });

  const [cadenceFormData, setCadenceFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  });

  const [welcomeFormData, setWelcomeFormData] = useState({
    name: "",
    message: "",
    is_active: true,
  });

  const [cadenceSteps, setCadenceSteps] = useState<Partial<CadenceStep>[]>([
    { step_number: 1, delay_days: 0, media_type: "text", content: "" },
  ]);

  const defaultSentinelaConfig: SentinelaConfig = {
    is_enabled: false,
    provider: "gemini",
    model_name: "gemini-2.0-flash",
    max_tokens: 300,
    monthly_budget_usd: 10,
    monthly_spent_usd: 0,
    window_start_brt: "18:00",
    window_end_brt: "21:30",
    stale_threshold_h: 48,
    max_messages_session: 6,
    default_profile_id: null,
  };
  const [sentinelaConfig, setSentinelaConfig] = useState<SentinelaConfig>(defaultSentinelaConfig);
  const [profileMapRows, setProfileMapRows] = useState<ProfileMapRow[]>([]);
  const [sentinelaLoading, setSentinelaLoading] = useState(false);

  const loadProfiles = async () => {
    const { data, error } = await supabase
      .from("ai_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ title: "Erro ao carregar perfis", description: error.message, variant: "destructive" });
    } else {
      setProfiles(data || []);
    }
  };

  const loadCadences = async () => {
    const { data, error } = await supabase
      .from("cadence_templates")
      .select("*, cadence_steps(*)")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ title: "Erro ao carregar cadências", description: error.message, variant: "destructive" });
    } else {
      setCadences(data || []);
    }
  };

  const loadWelcomeTemplates = async () => {
    const { data, error } = await supabase
      .from("welcome_templates")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ title: "Erro ao carregar templates", description: error.message, variant: "destructive" });
    } else {
      setWelcomeTemplates(data || []);
    }
  };

  const loadSentinelaConfig = async () => {
    const { data: cfg } = await supabase.from("ai_sentinela_config").select("*").maybeSingle();
    if (cfg) setSentinelaConfig(cfg);
    const { data: maps } = await supabase.from("ai_sentinela_profile_map").select("*").order("priority", { ascending: false });
    setProfileMapRows(maps || []);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProfiles(), loadCadences(), loadWelcomeTemplates(), loadSentinelaConfig()]).finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async () => {
    if (!profileFormData.name || !profileFormData.system_prompt) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    try {
      if (editProfile) {
        const { error } = await supabase.from("ai_profiles").update(profileFormData).eq("id", editProfile.id);
        if (error) throw error;
        toast({ title: "✅ Perfil atualizado!" });
      } else {
        const { error } = await supabase.from("ai_profiles").insert(profileFormData);
        if (error) throw error;
        toast({ title: "✅ Perfil criado!" });
      }
      
      setProfileModalOpen(false);
      resetProfileForm();
      loadProfiles();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveCadence = async () => {
    if (!cadenceFormData.name || cadenceSteps.length === 0) {
      toast({ title: "Adicione pelo menos 1 passo", variant: "destructive" });
      return;
    }

    try {
      let cadenceId = editCadence?.id;

      if (editCadence) {
        const { error } = await supabase.from("cadence_templates").update(cadenceFormData).eq("id", editCadence.id);
        if (error) throw error;
        await supabase.from("cadence_steps").delete().eq("cadence_id", editCadence.id);
      } else {
        const { data, error } = await supabase.from("cadence_templates").insert(cadenceFormData).select().single();
        if (error) throw error;
        cadenceId = data.id;
      }

      const stepsToInsert = cadenceSteps.map(step => ({
        cadence_id: cadenceId,
        step_number: step.step_number,
        delay_days: step.delay_days,
        media_type: step.media_type,
        content: step.content,
        media_url: step.media_url,
        caption: step.caption,
      }));

      const { error: stepsError } = await supabase.from("cadence_steps").insert(stepsToInsert);
      if (stepsError) throw stepsError;

      toast({ title: editCadence ? "✅ Cadência atualizada!" : "✅ Cadência criada!" });
      setCadenceModalOpen(false);
      resetCadenceForm();
      loadCadences();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveWelcome = async () => {
    if (!welcomeFormData.name || !welcomeFormData.message) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    try {
      if (editWelcome) {
        const { error } = await supabase.from("welcome_templates").update(welcomeFormData).eq("id", editWelcome.id);
        if (error) throw error;
        toast({ title: "✅ Template atualizado!" });
      } else {
        const { error } = await supabase.from("welcome_templates").insert(welcomeFormData);
        if (error) throw error;
        toast({ title: "✅ Template criado!" });
      }
      
      setWelcomeModalOpen(false);
      resetWelcomeForm();
      loadWelcomeTemplates();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("Desativar este perfil?")) return;
    const { error } = await supabase.from("ai_profiles").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Perfil desativado" });
      loadProfiles();
    }
  };

  const handleDeleteCadence = async (id: string) => {
    if (!confirm("Desativar esta cadência?")) return;
    const { error } = await supabase.from("cadence_templates").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Cadência desativada" });
      loadCadences();
    }
  };

  const handleDeleteWelcome = async (id: string) => {
    if (!confirm("Desativar este template?")) return;
    const { error } = await supabase.from("welcome_templates").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Template desativado" });
      loadWelcomeTemplates();
    }
  };

  const resetProfileForm = () => {
    setProfileFormData({ name: "", description: "", system_prompt: "", is_active: true });
    setEditProfile(null);
  };

  const resetCadenceForm = () => {
    setCadenceFormData({ name: "", description: "", is_active: true });
    setCadenceSteps([{ step_number: 1, delay_days: 0, media_type: "text", content: "" }]);
    setEditCadence(null);
  };

  const resetWelcomeForm = () => {
    setWelcomeFormData({ name: "", message: "", is_active: true });
    setEditWelcome(null);
  };

  const openEditProfile = (profile: AIProfile) => {
    setEditProfile(profile);
    setProfileFormData({ name: profile.name, description: profile.description || "", system_prompt: profile.system_prompt, is_active: profile.is_active });
    setProfileModalOpen(true);
  };

  const openEditCadence = (cadence: CadenceTemplate) => {
    setEditCadence(cadence);
    setCadenceFormData({ name: cadence.name, description: cadence.description || "", is_active: cadence.is_active });
    setCadenceSteps(cadence.cadence_steps || []);
    setCadenceModalOpen(true);
  };

  const openEditWelcome = (welcome: WelcomeTemplate) => {
    setEditWelcome(welcome);
    setWelcomeFormData({ name: welcome.name, message: welcome.message, is_active: welcome.is_active });
    setWelcomeModalOpen(true);
  };

  const addCadenceStep = () => {
    setCadenceSteps([...cadenceSteps, { step_number: cadenceSteps.length + 1, delay_days: 3, media_type: "text", content: "" }]);
  };

  const removeCadenceStep = (index: number) => {
    const newSteps = cadenceSteps.filter((_, i) => i !== index);
    setCadenceSteps(newSteps.map((step, i) => ({ ...step, step_number: i + 1 })));
  };

  const updateCadenceStep = (index: number, field: string, value: any) => {
    const newSteps = [...cadenceSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setCadenceSteps(newSteps);
  };

  const handleSaveSentinela = async () => {
    setSentinelaLoading(true);
    try {
      const { error } = await supabase.from("ai_sentinela_config").upsert(
        { ...sentinelaConfig, updated_at: new Date().toISOString() },
        { onConflict: "_singleton" }
      );
      if (error) throw error;

      // Recriar mapeamentos: delete all then reinsert
      await supabase.from("ai_sentinela_profile_map").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const validRows = profileMapRows.filter(r => r.match_value && r.profile_id);
      if (validRows.length > 0) {
        const { error: mapErr } = await supabase.from("ai_sentinela_profile_map").insert(
          validRows.map(({ id: _id, ...r }) => r)
        );
        if (mapErr) throw mapErr;
      }

      toast({ title: "✅ Sentinela IA salvo!" });
      await loadSentinelaConfig();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSentinelaLoading(false);
    }
  };

  const addProfileMapRow = () => {
    setProfileMapRows([...profileMapRows, { match_field: "tag", match_value: "", profile_id: "", priority: 0 }]);
  };

  const removeProfileMapRow = (index: number) => {
    setProfileMapRows(profileMapRows.filter((_, i) => i !== index));
  };

  const updateProfileMapRow = (index: number, field: string, value: any) => {
    const updated = [...profileMapRows];
    updated[index] = { ...updated[index], [field]: value };
    setProfileMapRows(updated);
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case "text": return <FileText className="w-4 h-4" />;
      case "audio": return <Mic className="w-4 h-4" />;
      case "video": return <Video className="w-4 h-4" />;
      case "image": return <Image className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            IA Builder
          </h3>
          <p className="text-sm text-gray-500">Configure perfis de IA, mensagens de boas-vindas e fluxos de cadência</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("profiles")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "profiles" ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Brain className="w-4 h-4" /> Perfis de IA
          <span className="text-xs bg-slate-700 rounded px-1.5">{profiles.filter(p => p.is_active).length}</span>
        </button>
        <button onClick={() => setTab("welcome")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "welcome" ? "bg-green-900/40 text-green-300 border border-green-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Hand className="w-4 h-4" /> Boas-vindas
          <span className="text-xs bg-slate-700 rounded px-1.5">{welcomeTemplates.filter(w => w.is_active).length}</span>
        </button>
        <button onClick={() => setTab("cadence")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "cadence" ? "bg-blue-900/40 text-blue-300 border border-blue-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Play className="w-4 h-4" /> Cadência Follow-up
          <span className="text-xs bg-slate-700 rounded px-1.5">{cadences.filter(c => c.is_active).length}</span>
        </button>
        <span className="text-xs text-slate-500 flex items-center gap-1 px-3 py-2 border border-slate-700/50 rounded-lg">
          <Shield className="w-3.5 h-3.5" /> Sentinela → Central IA
        </span>
      </div>
      {tab === "profiles" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetProfileForm(); setProfileModalOpen(true); }} className="bg-purple-600 hover:bg-purple-500 gap-2">
              <Plus className="w-4 h-4" />
              Novo Perfil
            </Button>
          </div>

          {profiles.filter(p => p.is_active).length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Brain className="w-20 h-20 mx-auto mb-4 opacity-20" />
              <h3 className="text-xl font-bold mb-2">Nenhum perfil criado</h3>
              <p className="text-sm mb-4">Crie perfis de IA reutilizáveis para conversação automática</p>
              <Button onClick={() => { resetProfileForm(); setProfileModalOpen(true); }} className="bg-purple-600 hover:bg-purple-500">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Perfil
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {profiles.filter(p => p.is_active).map(profile => (
                <Card key={profile.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-purple-500/50 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Brain className="w-5 h-5 text-purple-400 shrink-0" />
                          <h4 className="text-white font-bold text-base truncate">{profile.name}</h4>
                        </div>
                        {profile.description && <p className="text-sm text-gray-500 line-clamp-2">{profile.description}</p>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-slate-900/60 rounded p-3 max-h-32 overflow-y-auto">
                      <p className="text-xs text-gray-400 whitespace-pre-wrap">{profile.system_prompt.substring(0, 200)}...</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => openEditProfile(profile)} variant="outline" size="sm" className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-700">
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button onClick={() => handleDeleteProfile(profile.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : tab === "welcome" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetWelcomeForm(); setWelcomeModalOpen(true); }} className="bg-green-600 hover:bg-green-500 gap-2">
              <Plus className="w-4 h-4" />
              Novo Template
            </Button>
          </div>

          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <Hand className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-green-300 font-bold text-sm mb-1">📝 Mensagens de Boas-vindas</h4>
                <p className="text-xs text-green-200/80">Estas mensagens são enviadas automaticamente quando um lead é criado. Use <code className="bg-green-900/40 px-1 rounded">{"{nome}"}</code> e <code className="bg-green-900/40 px-1 rounded">{"{broker}"}</code> para personalizar.</p>
                <p className="text-xs text-green-200/80 mt-2">✅ <strong>Vantagem:</strong> Não consome tokens da IA - mensagens prontas e otimizadas!</p>
              </div>
            </div>
          </div>

          {welcomeTemplates.filter(w => w.is_active).length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Hand className="w-20 h-20 mx-auto mb-4 opacity-20" />
              <h3 className="text-xl font-bold mb-2">Nenhum template criado</h3>
              <p className="text-sm mb-4">Crie templates de boas-vindas para primeira mensagem</p>
              <Button onClick={() => { resetWelcomeForm(); setWelcomeModalOpen(true); }} className="bg-green-600 hover:bg-green-500">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Template
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {welcomeTemplates.filter(w => w.is_active).map(template => (
                <Card key={template.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-green-500/50 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Hand className="w-5 h-5 text-green-400 shrink-0" />
                          <h4 className="text-white font-bold text-sm truncate">{template.name}</h4>
                        </div>
                        <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs">
                          Usado {template.usage_count}x
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-slate-900/60 rounded p-3 min-h-[100px] max-h-32 overflow-y-auto">
                      <p className="text-xs text-gray-300 whitespace-pre-wrap">{template.message}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => openEditWelcome(template)} variant="outline" size="sm" className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-700">
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button onClick={() => handleDeleteWelcome(template.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : tab === "cadence" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetCadenceForm(); setCadenceModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500 gap-2">
              <Plus className="w-4 h-4" />
              Nova Cadência
            </Button>
          </div>

          {cadences.filter(c => c.is_active).length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Play className="w-20 h-20 mx-auto mb-4 opacity-20" />
              <h3 className="text-xl font-bold mb-2">Nenhuma cadência criada</h3>
              <p className="text-sm mb-4">Crie fluxos de follow-up com texto, áudio e vídeo</p>
              <Button onClick={() => { resetCadenceForm(); setCadenceModalOpen(true); }} className="bg-blue-600 hover:bg-blue-500">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Cadência
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {cadences.filter(c => c.is_active).map(cadence => (
                <Card key={cadence.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-blue-500/50 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Play className="w-5 h-5 text-blue-400 shrink-0" />
                          <h4 className="text-white font-bold text-base">{cadence.name}</h4>
                          <Badge className="bg-blue-900/40 text-blue-300 border-blue-500/30 text-xs">
                            {cadence.cadence_steps?.length || 0} passos
                          </Badge>
                        </div>
                        {cadence.description && <p className="text-sm text-gray-500">{cadence.description}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => openEditCadence(cadence)} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-slate-700">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button onClick={() => handleDeleteCadence(cadence.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {cadence.cadence_steps?.sort((a, b) => a.step_number - b.step_number).map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-2 shrink-0">
                          <div className="bg-slate-900/60 rounded-lg p-3 min-w-[140px] border border-gray-700/50">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                step.media_type === 'text' ? 'bg-green-900/40 text-green-300' :
                                step.media_type === 'audio' ? 'bg-purple-900/40 text-purple-300' :
                                step.media_type === 'video' ? 'bg-red-900/40 text-red-300' :
                                'bg-blue-900/40 text-blue-300'
                              }`}>
                                {getMediaIcon(step.media_type)}
                              </div>
                              <span className="text-xs text-gray-400">Dia {step.delay_days}</span>
                            </div>
                            <div className="text-xs text-white font-semibold capitalize">{step.media_type}</div>
                          </div>
                          {idx < (cadence.cadence_steps?.length || 0) - 1 && (
                            <ArrowRight className="w-4 h-4 text-gray-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : tab === ("sentinela" as string) ? (
        <div className="space-y-6">
          {/* A. Banner de orçamento */}
          <Card className="border-2 border-orange-500/30 bg-orange-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-bold text-orange-300">Orçamento mensal</span>
                </div>
                <span className={`text-sm font-mono font-bold ${
                  sentinelaConfig.monthly_spent_usd >= sentinelaConfig.monthly_budget_usd ? "text-red-400" :
                  sentinelaConfig.monthly_spent_usd / sentinelaConfig.monthly_budget_usd > 0.8 ? "text-yellow-400" :
                  "text-green-400"
                }`}>
                  ${sentinelaConfig.monthly_spent_usd.toFixed(4)} / ${sentinelaConfig.monthly_budget_usd.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    sentinelaConfig.monthly_spent_usd >= sentinelaConfig.monthly_budget_usd ? "bg-red-500" :
                    sentinelaConfig.monthly_spent_usd / sentinelaConfig.monthly_budget_usd > 0.8 ? "bg-yellow-500" :
                    "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(100, (sentinelaConfig.monthly_spent_usd / sentinelaConfig.monthly_budget_usd) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* B. Toggle + modelo */}
          <Card className="border-gray-700/50 bg-slate-800/40">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold">Sentinela IA</p>
                  <p className="text-xs text-gray-500">Agente LLM autônomo para leads parados</p>
                </div>
                <Switch
                  checked={sentinelaConfig.is_enabled}
                  onCheckedChange={v => setSentinelaConfig({ ...sentinelaConfig, is_enabled: v })}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Modelo LLM</Label>
                <Select
                  value={`${sentinelaConfig.provider}::${sentinelaConfig.model_name}`}
                  onValueChange={v => {
                    const [provider, model_name] = v.split("::");
                    setSentinelaConfig({ ...sentinelaConfig, provider, model_name });
                  }}
                >
                  <SelectTrigger className="bg-slate-900 border-gray-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="gemini::gemini-2.0-flash">Gemini 2.0 Flash — ~$0.0004/conversa</SelectItem>
                    <SelectItem value="anthropic::claude-haiku-4-5">Claude Haiku 4.5 — ~$0.003/conversa</SelectItem>
                    <SelectItem value="anthropic::claude-sonnet-4-6">Claude Sonnet 4.6 — ~$0.010/conversa</SelectItem>
                    <SelectItem value="openai::gpt-4o-mini">GPT-4o Mini — ~$0.001/conversa</SelectItem>
                    <SelectItem value="openai::gpt-4o">GPT-4o — ~$0.008/conversa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* C. Configurações numéricas */}
          <Card className="border-gray-700/50 bg-slate-800/40">
            <CardContent className="pt-4">
              <Label className="text-gray-400 text-xs uppercase mb-3 block">Parâmetros operacionais</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Orçamento mensal (USD)</Label>
                  <Input
                    type="number" min={0} step={0.5}
                    value={sentinelaConfig.monthly_budget_usd}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, monthly_budget_usd: parseFloat(e.target.value) || 0 })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Inatividade mínima (horas)</Label>
                  <Input
                    type="number" min={1}
                    value={sentinelaConfig.stale_threshold_h}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, stale_threshold_h: parseInt(e.target.value) || 48 })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Início da janela (BRT)</Label>
                  <Input
                    type="time"
                    value={sentinelaConfig.window_start_brt}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, window_start_brt: e.target.value })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Fim da janela (BRT)</Label>
                  <Input
                    type="time"
                    value={sentinelaConfig.window_end_brt}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, window_end_brt: e.target.value })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Máx mensagens por sessão</Label>
                  <Input
                    type="number" min={1} max={20}
                    value={sentinelaConfig.max_messages_session}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, max_messages_session: parseInt(e.target.value) || 6 })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Máx tokens por resposta</Label>
                  <Input
                    type="number" min={50} max={1000}
                    value={sentinelaConfig.max_tokens}
                    onChange={e => setSentinelaConfig({ ...sentinelaConfig, max_tokens: parseInt(e.target.value) || 300 })}
                    className="bg-slate-900 border-gray-600 text-white mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* D. Perfil padrão */}
          <Card className="border-gray-700/50 bg-slate-800/40">
            <CardContent className="pt-4">
              <Label className="text-gray-400 text-xs uppercase mb-2 block">Perfil de IA padrão</Label>
              <Select
                value={sentinelaConfig.default_profile_id || "none"}
                onValueChange={v => setSentinelaConfig({ ...sentinelaConfig, default_profile_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="bg-slate-900 border-gray-600 text-white">
                  <SelectValue placeholder="Selecione um perfil..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-gray-600">
                  <SelectItem value="none">Nenhum (Sentinela desativada sem perfil)</SelectItem>
                  {profiles.filter(p => p.is_active).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Usado quando nenhum mapeamento tag/source corresponder ao lead</p>
            </CardContent>
          </Card>

          {/* E. Mapeamentos tag/source → perfil */}
          <Card className="border-gray-700/50 bg-slate-800/40">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-400 text-xs uppercase">Mapeamentos tag/source → perfil</Label>
                <Button onClick={addProfileMapRow} size="sm" variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-900/20">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar mapeamento
                </Button>
              </div>
              {profileMapRows.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Nenhum mapeamento. Todos os leads usarão o perfil padrão.</p>
              ) : (
                <div className="space-y-2">
                  {profileMapRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[120px_1fr_1fr_80px_36px] gap-2 items-center">
                      <Select value={row.match_field} onValueChange={v => updateProfileMapRow(idx, "match_field", v)}>
                        <SelectTrigger className="bg-slate-900 border-gray-600 text-white text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-gray-600">
                          <SelectItem value="tag">tag</SelectItem>
                          <SelectItem value="source">source</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="valor (ex: mcmv)"
                        value={row.match_value}
                        onChange={e => updateProfileMapRow(idx, "match_value", e.target.value)}
                        className="bg-slate-900 border-gray-600 text-white text-xs h-8"
                      />
                      <Select value={row.profile_id || "none"} onValueChange={v => updateProfileMapRow(idx, "profile_id", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-slate-900 border-gray-600 text-white text-xs h-8">
                          <SelectValue placeholder="Perfil..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-gray-600">
                          <SelectItem value="none">Selecione...</SelectItem>
                          {profiles.filter(p => p.is_active).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" placeholder="prior."
                        value={row.priority}
                        onChange={e => updateProfileMapRow(idx, "priority", parseInt(e.target.value) || 0)}
                        className="bg-slate-900 border-gray-600 text-white text-xs h-8"
                      />
                      <Button onClick={() => removeProfileMapRow(idx)} variant="ghost" size="sm" className="text-red-400 hover:bg-red-900/20 h-8 w-8 p-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* F. Salvar */}
          <div className="flex justify-end">
            <Button onClick={handleSaveSentinela} disabled={sentinelaLoading} className="bg-orange-600 hover:bg-orange-500 font-bold gap-2">
              <Save className="w-4 h-4" />
              {sentinelaLoading ? "Salvando..." : "Salvar configuração"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* MODAL PERFIL */}
      <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Brain className="w-6 h-6 text-purple-400" />
              {editProfile ? "Editar Perfil" : "Novo Perfil de IA"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">Configure a personalidade para conversação automática</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-400 text-xs uppercase">Nome do Perfil *</Label>
              <Input value={profileFormData.name} onChange={e => setProfileFormData({ ...profileFormData, name: e.target.value })} placeholder="Ex: MCMV - Minha Casa Minha Vida" className="bg-slate-800 border-gray-600 text-white" />
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">Descrição</Label>
              <Textarea value={profileFormData.description} onChange={e => setProfileFormData({ ...profileFormData, description: e.target.value })} placeholder="Breve descrição do perfil..." className="bg-slate-800 border-gray-600 text-white min-h-[60px]" />
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">System Prompt (Instruções Completas) *</Label>
              <Textarea value={profileFormData.system_prompt} onChange={e => setProfileFormData({ ...profileFormData, system_prompt: e.target.value })} placeholder="Você é um especialista em MCMV que ajuda leads a conseguir financiamento..." className="bg-slate-800 border-gray-600 text-white min-h-[300px] font-mono text-sm" />
              <p className="text-xs text-gray-500 mt-1">Defina a personalidade, tom, objetivos e regras da IA</p>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={profileFormData.is_active} onCheckedChange={checked => setProfileFormData({ ...profileFormData, is_active: checked })} />
              <Label className="text-gray-300">Perfil ativo</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setProfileModalOpen(false)} variant="outline" className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={handleSaveProfile} className="flex-1 bg-purple-600 hover:bg-purple-500 font-bold">
                <Save className="w-4 h-4 mr-2" />
                {editProfile ? "Salvar Alterações" : "Criar Perfil"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL BOAS-VINDAS */}
      <Dialog open={welcomeModalOpen} onOpenChange={setWelcomeModalOpen}>
        <DialogContent className="bg-slate-900 border-green-500 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Hand className="w-6 h-6 text-green-400" />
              {editWelcome ? "Editar Template" : "Novo Template de Boas-vindas"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">Mensagem enviada automaticamente ao criar lead</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-400 text-xs uppercase">Nome do Template *</Label>
              <Input value={welcomeFormData.name} onChange={e => setWelcomeFormData({ ...welcomeFormData, name: e.target.value })} placeholder="Ex: Boas-vindas Casual" className="bg-slate-800 border-gray-600 text-white" />
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase">Mensagem *</Label>
              <Textarea value={welcomeFormData.message} onChange={e => setWelcomeFormData({ ...welcomeFormData, message: e.target.value })} placeholder="Olá {nome}! 👋 Seja bem-vindo(a)! Sou {broker}..." className="bg-slate-800 border-gray-600 text-white min-h-[150px]" />
              <p className="text-xs text-gray-500 mt-1">Use <code className="bg-slate-700 px-1 rounded">{"{nome}"}</code> e <code className="bg-slate-700 px-1 rounded">{"{broker}"}</code> para personalizar</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-300">
              💡 <strong>Preview:</strong>
              <div className="mt-2 bg-slate-900 p-2 rounded text-white text-sm">
                {welcomeFormData.message.replace(/{nome}/g, 'João Silva').replace(/{broker}/g, 'Carlos')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={welcomeFormData.is_active} onCheckedChange={checked => setWelcomeFormData({ ...welcomeFormData, is_active: checked })} />
              <Label className="text-gray-300">Template ativo</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setWelcomeModalOpen(false)} variant="outline" className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={handleSaveWelcome} className="flex-1 bg-green-600 hover:bg-green-500 font-bold">
                <Save className="w-4 h-4 mr-2" />
                {editWelcome ? "Salvar Alterações" : "Criar Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* MODAL CADÊNCIA */}
      <Dialog open={cadenceModalOpen} onOpenChange={setCadenceModalOpen}>
        <DialogContent className="bg-slate-900 border-blue-500 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Play className="w-6 h-6 text-blue-400" />
              {editCadence ? "Editar Cadência" : "Nova Cadência de Follow-up"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">Configure o fluxo automático com texto, áudio e vídeo</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome da Cadência *</Label>
                <Input value={cadenceFormData.name} onChange={e => setCadenceFormData({ ...cadenceFormData, name: e.target.value })} placeholder="Ex: Cadência MCMV Completa" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Descrição</Label>
                <Input value={cadenceFormData.description} onChange={e => setCadenceFormData({ ...cadenceFormData, description: e.target.value })} placeholder="Sequência otimizada para leads..." className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>

            <div className="border-2 border-blue-500/30 bg-blue-950/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <Label className="text-gray-200 font-bold">Passos da Cadência</Label>
                </div>
                <Button onClick={addCadenceStep} size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-900/20">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar Passo
                </Button>
              </div>

              <div className="space-y-3">
                {cadenceSteps.map((step, index) => (
                  <div key={index} className="bg-slate-800/60 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-900/40 text-blue-300 flex items-center justify-center font-bold text-sm shrink-0">
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-gray-400 text-xs">Tipo de Mensagem</Label>
                            <Select value={step.media_type} onValueChange={value => updateCadenceStep(index, 'media_type', value)}>
                              <SelectTrigger className="bg-slate-900 border-gray-600 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-800 border-gray-600">
                                <SelectItem value="text">📝 Texto</SelectItem>
                                <SelectItem value="audio">🎤 Áudio</SelectItem>
                                <SelectItem value="video">🎥 Vídeo</SelectItem>
                                <SelectItem value="image">🖼️ Imagem</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-gray-400 text-xs">Delay (dias após anterior)</Label>
                            <Input type="number" min={0} value={step.delay_days} onChange={e => updateCadenceStep(index, 'delay_days', parseInt(e.target.value))} className="bg-slate-900 border-gray-600 text-white" />
                          </div>
                        </div>

                        {step.media_type === 'text' ? (
                          <div>
                            <Label className="text-gray-400 text-xs">Mensagem</Label>
                            <Textarea value={step.content || ""} onChange={e => updateCadenceStep(index, 'content', e.target.value)} placeholder="Use {nome} e {broker} para personalizar..." className="bg-slate-900 border-gray-600 text-white min-h-[80px]" />
                            <p className="text-xs text-gray-500 mt-1">Variáveis: {"{nome}"}, {"{broker}"}</p>
                          </div>
                        ) : (
                          <>
                            <div>
                              <Label className="text-gray-400 text-xs">URL da Mídia ({step.media_type})</Label>
                              <Input value={step.media_url || ""} onChange={e => updateCadenceStep(index, 'media_url', e.target.value)} placeholder="https://exemplo.com/arquivo.mp3" className="bg-slate-900 border-gray-600 text-white" />
                              <p className="text-xs text-gray-500 mt-1">URL pública do arquivo de {step.media_type}</p>
                            </div>
                            <div>
                              <Label className="text-gray-400 text-xs">Legenda/Caption</Label>
                              <Textarea value={step.caption || ""} onChange={e => updateCadenceStep(index, 'caption', e.target.value)} placeholder="Texto que acompanha a mídia..." className="bg-slate-900 border-gray-600 text-white min-h-[60px]" />
                            </div>
                          </>
                        )}
                      </div>

                      {cadenceSteps.length > 1 && (
                        <Button onClick={() => removeCadenceStep(index)} variant="ghost" size="sm" className="text-red-400 hover:bg-red-900/20 shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded p-3 text-xs text-blue-300">
                💡 <strong>Dica:</strong> Comece com texto, depois áudio pessoal, e finalize com vídeo tour. Deixe 3-5 dias entre cada passo.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={cadenceFormData.is_active} onCheckedChange={checked => setCadenceFormData({ ...cadenceFormData, is_active: checked })} />
              <Label className="text-gray-300">Cadência ativa</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setCadenceModalOpen(false)} variant="outline" className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={handleSaveCadence} className="flex-1 bg-blue-600 hover:bg-blue-500 font-bold">
                <Save className="w-4 h-4 mr-2" />
                {editCadence ? "Salvar Alterações" : "Criar Cadência"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
