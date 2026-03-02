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

export default function Campanhas() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
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
  });

  const loadCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ia_campaigns").select("*").order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar campanhas", description: error.message, variant: "destructive" });
    } else {
      setCampaigns(data || []);
    }
    setLoading(false);
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
      target_audience: { lead_status: [], days_without_contact: 3, tags: [], exclude_converted: true, source: 'crm' },
      message_templates: [{ id: 1, text: "" }],
      ai_instructions: "", scheduled_start: "", scheduled_end: "",
      working_hours: { start: "09:00", end: "18:00" },
      max_leads: null, max_messages_per_lead: 3,
      delay_between_messages_min: 120, delay_between_messages_max: 480,
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
      target_audience: campaign.target_audience, message_templates: campaign.message_templates,
      ai_instructions: campaign.ai_instructions || "", scheduled_start: campaign.scheduled_start || "",
      scheduled_end: campaign.scheduled_end || "", working_hours: campaign.working_hours,
      max_leads: campaign.max_leads, max_messages_per_lead: campaign.max_messages_per_lead,
      delay_between_messages_min: campaign.delay_between_messages_min,
      delay_between_messages_max: campaign.delay_between_messages_max,
    });
    setLeadSource(campaign.target_audience?.source || 'crm');
    setModalOpen(true);
  };

  const openCreate = () => { resetForm(); setModalOpen(true); };
  const addMessageTemplate = () => setFormData({ ...formData, message_templates: [...formData.message_templates, { id: formData.message_templates.length + 1, text: "" }] });
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