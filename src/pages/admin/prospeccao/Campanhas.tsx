import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Rocket,
  Plus,
  Play,
  Pause,
  Pencil,
  Trash2,
  Target,
  MessageSquare,
  Clock,
  Users,
  TrendingUp,
  Upload,
  FileSpreadsheet,
  RefreshCw,
  Brain,
  Smartphone,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  target_audience: any;
  message_templates: any;
  ai_instructions: string | null;
  ai_profile_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  working_hours: any;
  max_leads: number | null;
  max_messages_per_lead: number;
  delay_between_messages_min: number;
  delay_between_messages_max: number;
  leads_targeted: number;
  leads_contacted: number;
  leads_responded: number;
  leads_qualified: number;
  leads_converted: number;
  use_broker_chip: boolean;
  prospect_instance_ids: string[] | null;
  bot_instance_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AIProfile {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  is_active: boolean;
}

interface ChipStat {
  chip_name: string;
  instance_name: string;
  conversations: number;
  messages: number;
}

interface CampaignStats {
  total_conversations: number;
  total_messages: number;
  chips: ChipStat[];
  pending_leads: number;
}

export default function Campanhas() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
  const [botOptions, setBotOptions] = useState<any[]>([]);
  const [chipSearch, setChipSearch] = useState("");
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [campaignStats, setCampaignStats] = useState<Record<string, CampaignStats>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [leadSource, setLeadSource] = useState<'crm' | 'upload'>('crm');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "draft",
    ai_profile_id: null as string | null,
    bot_instance_id: null as string | null,
    prospect_instance_ids: [] as string[],
    target_audience: {
      lead_status: [],
      days_without_contact: 3,
      tags: [],
      exclude_converted: true,
      source: 'crm',
    },
    message_templates: [{ id: 1, text: "" }],
    ai_instructions: "",
    scheduled_start: "",
    scheduled_end: "",
    working_hours: { start: "09:00", end: "18:00" },
    max_leads: null as number | null,
    max_messages_per_lead: 3,
    delay_between_messages_min: 120,
    delay_between_messages_max: 480,
    use_broker_chip: false,
  });

  const loadCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ia_campaigns").select("*").order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar campanhas", description: error.message, variant: "destructive" });
    } else {
      setCampaigns(data || []);
      if (data && data.length > 0) {
        loadCampaignStats(data);
      }
    }
    setLoading(false);
  };

  const loadCampaignStats = async (campaignList: Campaign[]) => {
    const campaignIds = campaignList.map(c => c.id);

    // All chip IDs referenced by any campaign (prospect or single bot)
    const allChipIds = Array.from(new Set(campaignList.flatMap(c => [
      ...(c.prospect_instance_ids || []),
      ...(c.bot_instance_id ? [c.bot_instance_id] : []),
    ])));

    const [{ data: convData }, { data: pendingData }, { data: botsData }] = await Promise.all([
      supabase
        .from("ia_conversations")
        .select("campaign_id, messages_count, bot_instance_id, bot_instances!bot_instance_id(name, instance_name)")
        .in("campaign_id", campaignIds),
      supabase
        .from("campaign_leads")
        .select("campaign_id")
        .in("campaign_id", campaignIds)
        .eq("status", "pending"),
      allChipIds.length > 0
        ? supabase.from("bot_instances").select("id, name, instance_name").in("id", allChipIds)
        : Promise.resolve({ data: [] }),
    ]);

    const botById: Record<string, { name: string; instance_name: string }> = {};
    for (const b of (botsData || [])) botById[b.id] = b;

    const stats: Record<string, CampaignStats> = {};

    for (const campaign of campaignList) {
      const id = campaign.id;
      const convs = (convData || []).filter((c: any) => c.campaign_id === id);
      const pending = (pendingData || []).filter((p: any) => p.campaign_id === id).length;

      const chipMap: Record<string, ChipStat> = {};

      // Pre-populate configured chips with 0 so they always appear
      const configuredIds = campaign.prospect_instance_ids?.length
        ? campaign.prospect_instance_ids
        : campaign.bot_instance_id ? [campaign.bot_instance_id] : [];

      for (const chipId of configuredIds) {
        const b = botById[chipId];
        if (!b) continue;
        const key = b.instance_name || b.name;
        if (!chipMap[key]) chipMap[key] = { chip_name: b.name, instance_name: b.instance_name, conversations: 0, messages: 0 };
      }

      // Fill in real send counts from conversations
      let totalMsgs = 0;
      for (const conv of convs) {
        const bot = (conv as any).bot_instances;
        if (!bot) continue;
        const key = bot.instance_name || bot.name;
        if (!chipMap[key]) chipMap[key] = { chip_name: bot.name, instance_name: bot.instance_name, conversations: 0, messages: 0 };
        chipMap[key].conversations += 1;
        chipMap[key].messages += conv.messages_count || 0;
        totalMsgs += conv.messages_count || 0;
      }

      stats[id] = {
        total_conversations: convs.length,
        total_messages: totalMsgs,
        chips: Object.values(chipMap).sort((a, b) => b.messages - a.messages),
        pending_leads: pending,
      };
    }

    setCampaignStats(stats);
  };

  const loadAIProfiles = async () => {
    const { data, error } = await supabase.from("ai_profiles").select("*").eq("is_active", true).order("name");
    if (error) {
      console.error("Erro ao carregar perfis:", error);
    } else {
      setAiProfiles(data || []);
    }
  };

  useEffect(() => {
    loadCampaigns();
    loadAIProfiles();
    // load available prospecting bots + identify team (manager) of each
    (async () => {
      const [{ data: bots }, { data: profiles }] = await Promise.all([
        supabase.from('bot_instances').select('*').eq('is_prospecting', true).in('status', ['active', 'open']).order('name', { ascending: true }),
        supabase.from('profiles').select('id, first_name, role, manager_id, bot_instance_id').not('bot_instance_id', 'is', null),
      ]);
      const ownerByBot = new Map<string, any>((profiles || []).map((p: any) => [p.bot_instance_id, p]));
      const managerById = new Map<string, any>((profiles || []).filter((p: any) => p.role === 'MANAGER').map((p: any) => [p.id, p]));
      const enriched = (bots || []).map((b: any) => {
        const owner = ownerByBot.get(b.id);
        let team = 'Sem equipe';
        if (owner) {
          if (owner.role === 'MANAGER') team = owner.first_name || team;
          else if (owner.manager_id) team = managerById.get(owner.manager_id)?.first_name || team;
        }
        return { ...b, team_name: team };
      });
      setBotOptions(enriched);
    })();

    const channel = supabase.channel("ia_campaigns_changes").on("postgres_changes", { event: "*", schema: "public", table: "ia_campaigns" }, loadCampaigns).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleUploadLeads = async (campaignId: string) => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão não encontrada');
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('campaignId', campaignId);
      formData.append('columnMapping', JSON.stringify({}));
      const { data, error } = await supabase.functions.invoke('upload_campaign_leads', { body: formData, headers: { Authorization: `Bearer ${session.access_token}` } });
      if (error) throw error;
      toast({ title: "✅ Leads importados!", description: `${data.imported} leads adicionados` });
      return data.imported;
    } catch (error: any) {
      toast({ title: "❌ Erro ao importar", description: error.message, variant: "destructive" });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!formData.message_templates[0]?.text.trim()) {
      toast({ title: "Adicione uma mensagem", variant: "destructive" });
      return;
    }
    if (leadSource === 'upload' && !uploadFile && !editCampaign) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      name: formData.name,
      description: formData.description || null,
      status: formData.status,
      ai_profile_id: formData.ai_profile_id,
      bot_instance_id: formData.bot_instance_id || null,
      prospect_instance_ids: Array.isArray(formData.prospect_instance_ids) ? formData.prospect_instance_ids : [],
      target_audience: { ...formData.target_audience, source: leadSource },
      message_templates: formData.message_templates,
      ai_instructions: formData.ai_instructions || null,
      scheduled_start: formData.scheduled_start || null,
      scheduled_end: formData.scheduled_end || null,
      working_hours: formData.working_hours,
      max_leads: formData.max_leads,
      max_messages_per_lead: formData.max_messages_per_lead,
      delay_between_messages_min: formData.delay_between_messages_min,
      delay_between_messages_max: formData.delay_between_messages_max,
      use_broker_chip: formData.use_broker_chip,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editCampaign) {
        const { error } = await supabase.from("ia_campaigns").update(payload).eq("id", editCampaign.id);
        if (error) throw error;
        if (leadSource === 'upload' && uploadFile) await handleUploadLeads(editCampaign.id);
        toast({ title: "✅ Campanha atualizada!" });
      } else {
        const { data: newCampaign, error } = await supabase.from("ia_campaigns").insert(payload).select().single();
        if (error) throw error;
        if (leadSource === 'upload' && uploadFile && newCampaign) await handleUploadLeads(newCampaign.id);
        toast({ title: "✅ Campanha criada!" });
      }
      setModalOpen(false);
      resetForm();
      loadCampaigns();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase.from("ia_campaigns").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deletar campanha?")) return;
    const { error } = await supabase.from("ia_campaigns").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao deletar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Removida" });
      loadCampaigns();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "", description: "", status: "draft", ai_profile_id: null,
      bot_instance_id: null, prospect_instance_ids: [],
      target_audience: { lead_status: [], days_without_contact: 3, tags: [], exclude_converted: true, source: 'crm' },
      message_templates: [{ id: 1, text: "" }],
      ai_instructions: "", scheduled_start: "", scheduled_end: "",
      working_hours: { start: "09:00", end: "18:00" },
      max_leads: null, max_messages_per_lead: 3,
      delay_between_messages_min: 120, delay_between_messages_max: 480,
      use_broker_chip: false,
    });
    setEditCampaign(null);
    setCurrentStep(1);
    setLeadSource('crm');
    setUploadFile(null);
  };

  const openEdit = (campaign: Campaign) => {
    setEditCampaign(campaign);
    setFormData({
      name: campaign.name, description: campaign.description || "", status: campaign.status,
      ai_profile_id: campaign.ai_profile_id,
      bot_instance_id: campaign.bot_instance_id || null,
      prospect_instance_ids: campaign.prospect_instance_ids || [],
      target_audience: campaign.target_audience, message_templates: campaign.message_templates,
      ai_instructions: campaign.ai_instructions || "", scheduled_start: campaign.scheduled_start || "",
      scheduled_end: campaign.scheduled_end || "", working_hours: campaign.working_hours,
      max_leads: campaign.max_leads, max_messages_per_lead: campaign.max_messages_per_lead,
      delay_between_messages_min: campaign.delay_between_messages_min,
      delay_between_messages_max: campaign.delay_between_messages_max,
      use_broker_chip: campaign.use_broker_chip ?? false,
    });
    setLeadSource(campaign.target_audience?.source || 'crm');
    setModalOpen(true);
  };

  const openCreate = () => { resetForm(); setModalOpen(true); };
  const addMessageTemplate = () => setFormData({ ...formData, message_templates: [...(formData.message_templates || []), { id: (formData.message_templates || []).length + 1, text: "" }] });
  const removeMessageTemplate = (id: number) => setFormData({ ...formData, message_templates: formData.message_templates.filter(t => t.id !== id) });
  const updateMessageTemplate = (id: number, text: string) => setFormData({ ...formData, message_templates: formData.message_templates.map(t => t.id === id ? { ...t, text } : t) });

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: { bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", label: "Rascunho" },
      active: { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", label: "Ativa" },
      paused: { bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-500/30", label: "Pausada" },
      completed: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-500/30", label: "Concluída" },
      cancelled: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", label: "Cancelada" },
    };
    const style = styles[status as keyof typeof styles] || styles.draft;
    return <Badge className={`${style.bg} ${style.text} border ${style.border}`}>{style.label}</Badge>;
  };

  const calculateConversionRate = (campaign: Campaign) => {
    if (campaign.leads_contacted === 0) return 0;
    return ((campaign.leads_converted / campaign.leads_contacted) * 100).toFixed(1);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Rocket className="w-10 h-10 text-blue-400 animate-pulse" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-blue-500/30 bg-blue-950/20"><CardHeader className="pb-3"><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Rocket className="w-4 h-4 text-blue-400" />Total</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-white">{campaigns.length}</div></CardContent></Card>
        <Card className="border-2 border-green-500/30 bg-green-950/20"><CardHeader className="pb-3"><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Play className="w-4 h-4 text-green-400" />Ativas</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-white">{campaigns.filter(c => c.status === "active").length}</div></CardContent></Card>
        <Card className="border-2 border-purple-500/30 bg-purple-950/20"><CardHeader className="pb-3"><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><Target className="w-4 h-4 text-purple-400" />Leads Alvo</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-white">{campaigns.reduce((sum, c) => sum + c.leads_targeted, 0)}</div></CardContent></Card>
        <Card className="border-2 border-orange-500/30 bg-orange-950/20"><CardHeader className="pb-3"><CardTitle className="text-sm text-gray-400 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-orange-400" />Conversões</CardTitle></CardHeader><CardContent><div className="text-3xl font-black text-white">{campaigns.reduce((sum, c) => sum + c.leads_converted, 0)}</div></CardContent></Card>
      </div>
      <div className="flex items-center justify-between">
        <div><h3 className="text-xl font-black text-white">Campanhas</h3><p className="text-sm text-gray-500">Prospecção com IA</p></div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 font-bold gap-2"><Plus className="w-4 h-4" />Nova Campanha</Button>
      </div>
      {campaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-500"><Rocket className="w-20 h-20 mx-auto mb-4 opacity-20" /><h3 className="text-xl font-bold mb-2">Nenhuma campanha criada</h3><p className="text-sm mb-4">Crie sua primeira campanha</p><Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500"><Plus className="w-4 h-4 mr-2" />Criar Campanha</Button></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map(campaign => (
            <Card key={campaign.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-blue-500/50 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1"><Rocket className="w-5 h-5 text-blue-400 shrink-0" /><h4 className="text-white font-bold text-base truncate">{campaign.name}</h4></div>
                    {campaign.description && <p className="text-sm text-gray-500 line-clamp-2">{campaign.description}</p>}
                    <div className="flex items-center gap-2 mt-1">{getStatusBadge(campaign.status)}{campaign.target_audience?.source === 'upload' && <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs"><FileSpreadsheet className="w-3 h-3 mr-1" />Lista Importada</Badge>}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-900/40 rounded-lg p-2"><div className="text-xl font-black text-blue-300">{campaign.leads_contacted}</div><div className="text-xs text-gray-500">Contactados</div></div>
                  <div className="bg-slate-900/40 rounded-lg p-2"><div className="text-xl font-black text-purple-300">{campaign.leads_responded}</div><div className="text-xs text-gray-500">Responderam</div></div>
                  <div className="bg-slate-900/40 rounded-lg p-2"><div className="text-xl font-black text-green-300">{campaign.leads_converted}</div><div className="text-xs text-gray-500">Convertidos</div></div>
                </div>
                {campaign.leads_contacted > 0 && <div className="bg-slate-900/60 rounded-lg p-2 flex items-center justify-between"><span className="text-xs text-gray-500">Conversão:</span><span className="text-sm font-bold text-green-400">{calculateConversionRate(campaign)}%</span></div>}

                {/* Stats de envio por chip */}
                {(() => {
                  const s = campaignStats[campaign.id];
                  const totalMsgs = s?.total_messages ?? 0;
                  const totalConvs = s?.total_conversations ?? 0;
                  const pending = s?.pending_leads ?? 0;
                  const chips = s?.chips ?? [];
                  return (
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
                      {/* Header totais */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/40">
                        <Send className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-1">Instâncias & Disparos</span>
                        <span className="text-xs font-black text-cyan-300">{totalMsgs} msgs</span>
                        <span className="text-[11px] text-slate-500">·</span>
                        <span className="text-[11px] text-slate-400">{totalConvs} convs</span>
                        {pending > 0 && (
                          <><span className="text-[11px] text-slate-500">·</span>
                          <span className="text-[11px] text-yellow-400 font-semibold">{pending} pendentes</span></>
                        )}
                      </div>
                      {/* Linhas por chip */}
                      {chips.length > 0 ? (
                        <div className="divide-y divide-slate-800/60">
                          {chips.map(chip => {
                            const pct = totalMsgs > 0 ? Math.round((chip.messages / totalMsgs) * 100) : 0;
                            return (
                              <div key={chip.instance_name} className="flex items-center gap-2.5 px-3 py-2">
                                <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-xs font-semibold text-white truncate">{chip.chip_name}</span>
                                    <span className="text-xs font-black text-cyan-400 ml-2 shrink-0">{chip.messages} msgs</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                                      <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 shrink-0">{chip.conversations} conv</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-center text-[11px] text-slate-600 italic">Nenhum chip configurado</div>
                      )}
                    </div>
                  );
                })()}

                <div className="pt-2 border-t border-gray-700/50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-gray-500"><span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Mensagens:</span><span className="text-white">{campaign.message_templates?.length || 0} variações</span></div>
                  <div className="flex items-center justify-between text-gray-500"><span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Delay:</span><span className="text-white">{campaign.delay_between_messages_min}-{campaign.delay_between_messages_max}s</span></div>
                  {campaign.max_leads && <div className="flex items-center justify-between text-gray-500"><span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Limite:</span><span className="text-white">{campaign.max_leads} leads</span></div>}
                </div>
                <div className="flex gap-2 pt-2">
                  {campaign.status === "draft" && (
                    <Button onClick={async () => {
                      try {
                        toast({ title: "🚀 Iniciando..." });
                        await handleStatusChange(campaign.id, "active");
                        const { data, error } = await supabase.functions.invoke('orchestrator', { body: { campaignId: campaign.id } });
                        if (error) throw error;
                        toast({ title: "✅ Iniciada!", description: `${data.processed} leads distribuídos` });
                        loadCampaigns();
                      } catch (error: any) {
                        toast({ title: "❌ Erro", description: error.message, variant: "destructive" });
                      }
                    }} size="sm" className="flex-1 bg-green-600 hover:bg-green-500 gap-1.5"><Play className="w-3.5 h-3.5" />Iniciar</Button>
                  )}
                  {campaign.status === "active" && <Button onClick={() => handleStatusChange(campaign.id, "paused")} size="sm" className="flex-1 bg-yellow-600 hover:bg-yellow-500 gap-1.5"><Pause className="w-3.5 h-3.5" />Pausar</Button>}
                  {campaign.status === "paused" && <Button onClick={() => handleStatusChange(campaign.id, "active")} size="sm" className="flex-1 bg-green-600 hover:bg-green-500 gap-1.5"><Play className="w-3.5 h-3.5" />Retomar</Button>}
                  <Button onClick={() => openEdit(campaign)} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-slate-700"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button onClick={() => handleDelete(campaign.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-blue-500 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2"><Rocket className="w-6 h-6 text-blue-400" />{editCampaign ? "Editar" : "Nova Campanha"}</DialogTitle>
            <DialogDescription className="text-gray-400">Configure sua campanha</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-4">{[1, 2, 3].map(step => <div key={step} className={`flex-1 h-1.5 rounded-full ${step <= currentStep ? "bg-blue-500" : "bg-gray-700"}`} />)}</div>
          <div className="space-y-4">
            {currentStep === 1 && (
              <>
                <div><Label className="text-gray-400 text-xs uppercase">Nome *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Reativação" className="bg-slate-800 border-gray-600 text-white" /></div>
                <div><Label className="text-gray-400 text-xs uppercase">Descrição</Label><Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Objetivo da campanha..." className="bg-slate-800 border-gray-600 text-white min-h-[80px]" /></div>

                <div className="border-2 border-purple-500/30 bg-purple-950/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <Label className="text-gray-200 font-bold">Perfil de IA</Label>
                  </div>
                  <Select value={formData.ai_profile_id || "none"} onValueChange={value => setFormData({ ...formData, ai_profile_id: value === "none" ? null : value })}>
                    <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione um perfil (opcional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-gray-600">
                      <SelectItem value="none">Nenhum</SelectItem>
                      {aiProfiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {formData.ai_profile_id && aiProfiles.find(p => p.id === formData.ai_profile_id)?.description && (
                    <div className="mt-2 p-2 bg-purple-900/20 rounded border border-purple-500/30">
                      <p className="text-xs text-purple-300">{aiProfiles.find(p => p.id === formData.ai_profile_id)?.description}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">{formData.ai_profile_id ? "✅ Perfil selecionado" : "ℹ️ Configure manualmente no próximo passo"}</p>

                  {/* Toggle: usar chip do corretor */}
                  <div className="mt-4 flex items-center justify-between p-3 bg-slate-800/60 rounded-lg border border-gray-700">
                    <div>
                      <p className="text-sm font-semibold text-white">Usar chip do corretor</p>
                      <p className="text-xs text-gray-500 mt-0.5">Cada lead recebe mensagem pelo chip pessoal do seu corretor. Requer leads do CRM com corretor atribuído.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(fd => ({ ...fd, use_broker_chip: !fd.use_broker_chip }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${formData.use_broker_chip ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.use_broker_chip ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Seleção de chips — muda conforme o toggle */}
                  <div className="mt-3">
                    {formData.use_broker_chip ? (
                      <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                        <p className="text-xs font-semibold text-blue-300 mb-1">Chip de fallback (quando corretor não tem chip)</p>
                        <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto">
                          {botOptions.length === 0 ? (
                            <p className="text-xs text-gray-500 py-2">Nenhum chip de prospecção online no momento.</p>
                          ) : (
                            botOptions.map(bot => (
                              <label key={bot.id} className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
                                <input
                                  type="radio"
                                  name="fallback_chip"
                                  checked={formData.bot_instance_id === bot.id}
                                  onChange={() => setFormData(fd => ({ ...fd, bot_instance_id: bot.id }))}
                                  className="accent-blue-500"
                                />
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                <span className="text-white text-sm font-semibold">{bot.name}</span>
                                <span className="text-gray-500 text-xs">{bot.instance_name}</span>
                              </label>
                            ))
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Se o corretor não tiver chip cadastrado, o sistema usará o chip selecionado acima.</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <p className="text-xs font-semibold text-gray-300">Chips de prospecção <span className="text-gray-500 font-normal">(selecione 1 ou mais)</span></p>
                          <input
                            type="text"
                            value={chipSearch}
                            onChange={e => setChipSearch(e.target.value)}
                            placeholder="Buscar chip..."
                            className="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-white w-40 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        {(() => {
                          const q = chipSearch.trim().toLowerCase();
                          const filtered = botOptions.filter(b =>
                            !q || (b.name||'').toLowerCase().includes(q) ||
                                  (b.instance_name||'').toLowerCase().includes(q) ||
                                  (b.team_name||'').toLowerCase().includes(q)
                          );
                          const groups = new Map<string, any[]>();
                          for (const b of filtered) {
                            const t = b.team_name || 'Sem equipe';
                            if (!groups.has(t)) groups.set(t, []);
                            groups.get(t)!.push(b);
                          }
                          const sortedGroups = Array.from(groups.entries()).sort(([a],[b]) => {
                            if (a === 'Sem equipe') return 1;
                            if (b === 'Sem equipe') return -1;
                            return a.localeCompare(b);
                          });
                          const selected = new Set(Array.isArray(formData.prospect_instance_ids) ? formData.prospect_instance_ids : []);
                          return (
                            <div className="grid grid-cols-1 gap-1 max-h-72 overflow-y-auto p-2 bg-slate-800 rounded-lg border border-gray-700">
                              {filtered.length === 0 ? (
                                <p className="text-xs text-gray-500 py-2 text-center">{botOptions.length === 0 ? "Nenhum chip de prospecção online." : "Nenhum chip bate com a busca."}</p>
                              ) : sortedGroups.map(([team, bots]) => {
                                const teamSelected = bots.filter(b => selected.has(b.id)).length;
                                const allSelected = teamSelected === bots.length;
                                const isCollapsed = collapsedTeams.has(team);
                                return (
                                  <div key={team} className="rounded-md overflow-hidden">
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900/60 sticky top-0 z-10">
                                      <button
                                        type="button"
                                        onClick={() => setCollapsedTeams(s => { const n = new Set(s); n.has(team) ? n.delete(team) : n.add(team); return n; })}
                                        className="flex items-center gap-1.5 text-xs font-bold text-gray-200"
                                      >
                                        <span className="text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
                                        <span>🎯 {team.toUpperCase()}</span>
                                        <span className="text-[10px] text-gray-500 font-normal">({teamSelected}/{bots.length})</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setFormData(fd => {
                                          const cur = new Set(Array.isArray(fd.prospect_instance_ids) ? fd.prospect_instance_ids : []);
                                          if (allSelected) bots.forEach(b => cur.delete(b.id));
                                          else bots.forEach(b => cur.add(b.id));
                                          return { ...fd, prospect_instance_ids: Array.from(cur) };
                                        })}
                                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${allSelected ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}
                                      >
                                        {allSelected ? 'Limpar equipe' : 'Selecionar equipe'}
                                      </button>
                                    </div>
                                    {!isCollapsed && bots.map(bot => (
                                      <label key={bot.id} className="flex items-center gap-2.5 p-2 pl-4 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={selected.has(bot.id)}
                                          onChange={e => {
                                            const checked = e.target.checked;
                                            setFormData(fd => {
                                              const cur = new Set(Array.isArray(fd.prospect_instance_ids) ? fd.prospect_instance_ids : []);
                                              if (checked) cur.add(bot.id); else cur.delete(bot.id);
                                              return { ...fd, prospect_instance_ids: Array.from(cur) };
                                            });
                                          }}
                                          className="accent-blue-500 w-4 h-4"
                                        />
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                        <span className="text-white text-sm font-semibold">{bot.name}</span>
                                        <span className="text-gray-500 text-xs">{bot.instance_name}</span>
                                        <span className="ml-auto text-xs text-cyan-400">{bot.messages_today || 0} hoje</span>
                                      </label>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        <p className="text-xs text-gray-500 mt-2">
                          {Array.isArray(formData.prospect_instance_ids) && formData.prospect_instance_ids.length > 0
                            ? `✅ ${formData.prospect_instance_ids.length} chip(s) selecionado(s) — round-robin entre eles`
                            : "ℹ️ Sem seleção: usa todos os chips de prospecção disponíveis"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs uppercase mb-3 block">Fonte dos Leads *</Label>
                  <div className="space-y-3">
                    <div onClick={() => setLeadSource('crm')} className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${leadSource === 'crm' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-slate-800/50 hover:border-gray-600'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${leadSource === 'crm' ? 'border-blue-500' : 'border-gray-600'}`}>{leadSource === 'crm' && <div className="w-3 h-3 rounded-full bg-blue-500" />}</div>
                        <div className="flex-1"><h4 className="text-white font-bold text-sm">Buscar do CRM</h4><p className="text-xs text-gray-500">Leads já cadastrados</p></div>
                      </div>
                      {leadSource === 'crm' && (
                        <div className="mt-3 pl-8 space-y-3">
                          <div><Label className="text-gray-400 text-xs">Status</Label><Select value={formData.target_audience.lead_status[0] || ""} onValueChange={value => setFormData({ ...formData, target_audience: { ...formData.target_audience, lead_status: [value] } })}><SelectTrigger className="bg-slate-900 border-gray-600 text-white"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent className="bg-slate-800 border-gray-600"><SelectItem value="NEW">Novos</SelectItem><SelectItem value="CONTACTED">Contactados</SelectItem><SelectItem value="QUALIFIED">Qualificados</SelectItem><SelectItem value="LOST">Perdidos</SelectItem></SelectContent></Select></div>
                          <div><Label className="text-gray-400 text-xs">Dias sem contato</Label><Input type="number" min={1} value={formData.target_audience.days_without_contact} onChange={e => setFormData({ ...formData, target_audience: { ...formData.target_audience, days_without_contact: parseInt(e.target.value) } })} className="bg-slate-900 border-gray-600 text-white" /></div>
                        </div>
                      )}
                    </div>
                    <div onClick={() => setLeadSource('upload')} className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${leadSource === 'upload' ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-slate-800/50 hover:border-gray-600'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${leadSource === 'upload' ? 'border-green-500' : 'border-gray-600'}`}>{leadSource === 'upload' && <div className="w-3 h-3 rounded-full bg-green-500" />}</div>
                        <div className="flex-1"><h4 className="text-white font-bold text-sm">Importar Lista</h4><p className="text-xs text-gray-500">Upload CSV/Excel</p></div>
                      </div>
                      {leadSource === 'upload' && (
                        <div className="mt-3 pl-8">
                          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setUploadFile(file); toast({ title: `📄 ${file.name}` }); } }} className="hidden" id="file-upload" />
                          <label htmlFor="file-upload" className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-900/10 transition-all">
                            {uploadFile ? <><FileSpreadsheet className="w-5 h-5 text-green-400" /><span className="text-white text-sm">{uploadFile.name}</span></> : <><Upload className="w-5 h-5 text-gray-500" /><span className="text-gray-500 text-sm">Selecionar arquivo</span></>}
                          </label>
                          <p className="text-xs text-gray-500 mt-2">CSV ou Excel (.xlsx, .xls)<br />Colunas: <strong>Telefone</strong> (obrigatório), Nome, Email</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <Button onClick={() => setCurrentStep(2)} className="w-full bg-blue-600 hover:bg-blue-500" disabled={leadSource === 'upload' && !uploadFile}>Próximo →</Button>
              </>
            )}
            {currentStep === 2 && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2"><Label className="text-gray-400 text-xs uppercase">Mensagens *</Label><Button type="button" onClick={addMessageTemplate} size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-900/20"><Plus className="w-3.5 h-3.5 mr-1" />Adicionar</Button></div>
                  <div className="space-y-3">
                    {formData.message_templates.map((template, index) => (
                      <div key={template.id} className="relative bg-slate-800/50 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between mb-2"><span className="text-xs text-gray-500">Mensagem {index + 1}</span>{formData.message_templates.length > 1 && <Button type="button" onClick={() => removeMessageTemplate(template.id)} size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></Button>}</div>
                        <Textarea value={template.text} onChange={e => updateMessageTemplate(template.id, e.target.value)} placeholder="Use {nome} para personalizar" className="bg-slate-900 border-gray-600 text-white min-h-[100px]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs uppercase">Instruções {formData.ai_profile_id && "(Opcional)"}</Label>
                  <Textarea value={formData.ai_instructions} onChange={e => setFormData({ ...formData, ai_instructions: e.target.value })} placeholder={formData.ai_profile_id ? "Instruções extras..." : "Como a IA deve conduzir a conversa..."} className="bg-slate-800 border-gray-600 text-white min-h-[100px]" />
                  <p className="text-xs text-gray-500 mt-1">{formData.ai_profile_id ? "ℹ️ O perfil já tem instruções. Use apenas para regras específicas." : "⚠️ Configure as instruções completas aqui."}</p>
                </div>
                <div className="flex gap-2"><Button onClick={() => setCurrentStep(1)} variant="outline" className="flex-1 border-gray-600 text-gray-300">← Voltar</Button><Button onClick={() => setCurrentStep(3)} className="flex-1 bg-blue-600 hover:bg-blue-500">Próximo →</Button></div>
              </>
            )}
            {currentStep === 3 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-gray-400 text-xs uppercase">Horário Início</Label><Input type="time" value={formData.working_hours.start} onChange={e => setFormData({ ...formData, working_hours: { ...formData.working_hours, start: e.target.value } })} className="bg-slate-800 border-gray-600 text-white" /></div>
                  <div><Label className="text-gray-400 text-xs uppercase">Horário Fim</Label><Input type="time" value={formData.working_hours.end} onChange={e => setFormData({ ...formData, working_hours: { ...formData.working_hours, end: e.target.value } })} className="bg-slate-800 border-gray-600 text-white" /></div>
                </div>
                <div><Label className="text-gray-400 text-xs uppercase">Máximo de Leads</Label><Input type="number" min={1} value={formData.max_leads || ""} onChange={e => setFormData({ ...formData, max_leads: e.target.value ? parseInt(e.target.value) : null })} placeholder="Ilimitado" className="bg-slate-800 border-gray-600 text-white" /></div>
                <div><Label className="text-gray-400 text-xs uppercase">Mensagens por Lead</Label><Input type="number" min={1} max={10} value={formData.max_messages_per_lead} onChange={e => setFormData({ ...formData, max_messages_per_lead: parseInt(e.target.value) })} className="bg-slate-800 border-gray-600 text-white" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-gray-400 text-xs uppercase">Delay Min (seg)</Label><Input type="number" min={30} value={formData.delay_between_messages_min} onChange={e => setFormData({ ...formData, delay_between_messages_min: parseInt(e.target.value) })} className="bg-slate-800 border-gray-600 text-white" /></div>
                  <div><Label className="text-gray-400 text-xs uppercase">Delay Max (seg)</Label><Input type="number" min={60} value={formData.delay_between_messages_max} onChange={e => setFormData({ ...formData, delay_between_messages_max: parseInt(e.target.value) })} className="bg-slate-800 border-gray-600 text-white" /></div>
                </div>
                <div className="flex gap-2 pt-2"><Button onClick={() => setCurrentStep(2)} variant="outline" className="flex-1 border-gray-600 text-gray-300">← Voltar</Button><Button onClick={handleSave} disabled={uploading} className="flex-1 bg-blue-600 hover:bg-blue-500 font-bold">{uploading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importando...</> : editCampaign ? "Salvar" : "Criar Campanha"}</Button></div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}