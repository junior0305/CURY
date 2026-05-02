import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send, Plus, Upload, Play, Pause, X, Loader2, FileText, Users,
  CheckCircle2, AlertCircle, Trash2, Eye,
} from "lucide-react";

interface Props { managerId: string; }

interface Campaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "completed";
  created_at: string;
  prospect_instance_ids: string[] | null;
  template_ids: string[] | null;
  delay_between_messages_min: number;
  delay_between_messages_max: number;
  leads_targeted: number;
  leads_contacted: number;
  leads_responded: number;
}

interface Template { id: string; name: string; message: string; category: string|null; is_active: boolean; }
interface Bot { id: string; name: string; status: string; team_manager_id: string|null; }

export function TeamProspeccaoTab({ managerId }: Props) {
  const queryClient = useQueryClient();
  const [showBuilder, setShowBuilder] = useState(false);
  const [activeCampaignDetailId, setActiveCampaignDetailId] = useState<string | null>(null);

  // Campanhas do manager
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["teamCampaigns", managerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ia_campaigns")
        .select("id, name, status, created_at, prospect_instance_ids, template_ids, delay_between_messages_min, delay_between_messages_max, leads_targeted, leads_contacted, leads_responded")
        .eq("created_by", managerId)
        .eq("scope", "team")
        .order("created_at", { ascending: false });
      return (data || []) as Campaign[];
    },
    refetchInterval: 15000,
  });

  // Stats por campanha (pending vs contacted) — busca em batch
  const { data: leadStats = {} } = useQuery<Record<string, { pending: number; contacted: number; total: number }>>({
    queryKey: ["teamCampaignStats", campaigns.map(c => c.id).join(",")],
    queryFn: async () => {
      if (campaigns.length === 0) return {};
      const ids = campaigns.map(c => c.id);
      const { data } = await supabase
        .from("campaign_leads")
        .select("campaign_id, status")
        .in("campaign_id", ids);
      const map: Record<string, { pending: number; contacted: number; total: number }> = {};
      for (const id of ids) map[id] = { pending: 0, contacted: 0, total: 0 };
      for (const r of data || []) {
        const m = map[r.campaign_id];
        if (!m) continue;
        m.total++;
        if (r.status === "pending") m.pending++;
        if (r.status === "contacted") m.contacted++;
      }
      return map;
    },
    enabled: campaigns.length > 0,
    refetchInterval: 15000,
  });

  const hasActive = campaigns.some(c => c.status === "active");

  // ── Mutations ────────────────────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data } = await supabase.rpc("try_activate_campaign", {
        p_campaign_id: campaignId,
        p_manager_id: managerId,
      });
      return data as { ok: boolean; reason?: string; existing_name?: string };
    },
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success("Campanha iniciada!");
        queryClient.invalidateQueries({ queryKey: ["teamCampaigns", managerId] });
      } else if (res?.reason === "already_running") {
        toast.error(`Você já tem outra campanha rodando: "${res.existing_name}". Pause antes de iniciar outra.`);
      } else {
        toast.error("Não foi possível ativar (status incompatível)");
      }
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase.from("ia_campaigns")
        .update({ status: "paused" }).eq("id", campaignId).eq("created_by", managerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha pausada");
      queryClient.invalidateQueries({ queryKey: ["teamCampaigns", managerId] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase.from("ia_campaigns")
        .update({ status: "completed" }).eq("id", campaignId).eq("created_by", managerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha encerrada");
      queryClient.invalidateQueries({ queryKey: ["teamCampaigns", managerId] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
      {/* Header com botão Nova Campanha */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#10B981" }}>
          {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowBuilder(true)}
          className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
          style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.4)" }}
        >
          <Plus className="w-3 h-3" />
          Nova
        </button>
      </div>

      {/* Lista de campanhas */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-0">
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <Send className="w-5 h-5" style={{ color: "#10B981" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold" style={{ color: "var(--crm-text)" }}>Nenhuma campanha de prospecção</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--crm-text-muted)" }}>
                Suba uma planilha ou adicione contatos manualmente
              </p>
            </div>
          </div>
        ) : (
          campaigns.map(c => {
            const stats = leadStats[c.id] || { pending: 0, contacted: 0, total: 0 };
            const progress = stats.total > 0 ? (stats.contacted / stats.total) * 100 : 0;
            const statusColor = c.status === "active" ? "#10B981"
                              : c.status === "paused" ? "#F59E0B"
                              : c.status === "completed" ? "#64748B" : "#A78BFA";
            return (
              <div key={c.id} className="rounded-xl px-3 py-2.5"
                style={{ background: "var(--crm-glass)", border: `1px solid ${statusColor}30` }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold truncate" style={{ color: "var(--crm-text)" }}>{c.name}</span>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
                      <span className="font-mono">{stats.contacted}/{stats.total}</span> enviados · {(c.prospect_instance_ids?.length ?? 0)} chips · delay {c.delay_between_messages_min}–{c.delay_between_messages_max}s
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(148,163,184,0.15)" }}>
                      <div className="h-full transition-all" style={{ width: `${progress}%`, background: statusColor }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {c.status === "draft" && (
                      <button onClick={() => activateMutation.mutate(c.id)} disabled={activateMutation.isPending || (hasActive && !campaigns.find(x => x.status === "active" && x.id === c.id))}
                        className="px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <Play className="w-3 h-3" /> Iniciar
                      </button>
                    )}
                    {c.status === "active" && (
                      <button onClick={() => pauseMutation.mutate(c.id)} disabled={pauseMutation.isPending}
                        className="px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"
                        style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
                        <Pause className="w-3 h-3" /> Pausar
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button onClick={() => activateMutation.mutate(c.id)}
                        className="px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <Play className="w-3 h-3" /> Retomar
                      </button>
                    )}
                    {(c.status === "active" || c.status === "paused" || c.status === "draft") && (
                      <button onClick={() => { if (confirm("Encerrar campanha? Não dá pra desfazer.")) cancelMutation.mutate(c.id); }}
                        className="px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"
                        style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                        <X className="w-3 h-3" /> Encerrar
                      </button>
                    )}
                    <button onClick={() => setActiveCampaignDetailId(activeCampaignDetailId === c.id ? null : c.id)}
                      className="px-2 py-1 rounded-md text-[9px]"
                      style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)" }}>
                      <Eye className="w-3 h-3" style={{ color: "#00D4FF" }} />
                    </button>
                  </div>
                </div>
                {/* Detail expandido */}
                {activeCampaignDetailId === c.id && (
                  <div className="mt-2 pt-2 border-t flex flex-col gap-1 text-[10px]" style={{ borderColor: "var(--crm-border)", color: "var(--crm-text-muted)" }}>
                    <div>📅 Criada: {new Date(c.created_at).toLocaleString("pt-BR")}</div>
                    <div>✅ Contactados: {stats.contacted}</div>
                    <div>⏳ Pendentes: {stats.pending}</div>
                    <div>💬 Responderam: {c.leads_responded || 0}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Builder */}
      {showBuilder && (
        <CampaignBuilder
          managerId={managerId}
          hasActive={hasActive}
          onClose={() => { setShowBuilder(false); queryClient.invalidateQueries({ queryKey: ["teamCampaigns", managerId] }); }}
        />
      )}
    </div>
  );
}

// ─── Builder Modal ────────────────────────────────────────────────────────────

function CampaignBuilder({ managerId, hasActive, onClose }: { managerId: string; hasActive: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [delayMin, setDelayMin] = useState(120);
  const [delayMax, setDelayMax] = useState(420);
  const [csvText, setCsvText] = useState("");
  const [inlineLeads, setInlineLeads] = useState<{ name: string; phone: string }[]>([{ name: "", phone: "" }]);
  const [uploadMode, setUploadMode] = useState<"csv" | "inline">("csv");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Templates globais ativos
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["teamTemplates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospecting_message_templates")
        .select("id, name, message, category, is_active")
        .eq("is_active", true)
        .order("name");
      return (data || []) as Template[];
    },
  });

  // Chips do manager
  const { data: bots = [] } = useQuery<Bot[]>({
    queryKey: ["teamBots", managerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bot_instances")
        .select("id, name, status, team_manager_id")
        .eq("team_manager_id", managerId)
        .in("status", ["open", "active"])
        .order("name");
      return (data || []) as Bot[];
    },
  });

  const validInline = useMemo(() => inlineLeads.filter(l => l.name.trim() && l.phone.trim()), [inlineLeads]);

  const canProceedStep1 = name.trim().length > 2 && selectedTemplates.length >= 3 && selectedBots.length >= 1;
  const canProceedStep2 = uploadMode === "csv" ? csvText.trim().length > 10 : validInline.length >= 1;

  const handleCreate = async () => {
    if (hasActive) {
      toast.error("Você já tem uma campanha ativa. Pause/encerre antes de criar outra.");
      return;
    }
    setSubmitting(true);
    try {
      // 1) Cria campanha em draft
      const { data: campaign, error: cErr } = await supabase
        .from("ia_campaigns")
        .insert({
          name: name.trim(),
          status: "draft",
          target_audience: { source: "upload" },
          template_ids: selectedTemplates,
          prospect_instance_ids: selectedBots,
          delay_between_messages_min: delayMin,
          delay_between_messages_max: delayMax,
          created_by: managerId,
          scope: "team",
        })
        .select()
        .single();
      if (cErr) throw cErr;

      // 2) Upload de leads
      const body: any = { campaignId: campaign.id, source: uploadMode };
      if (uploadMode === "csv") body.csvText = csvText;
      else body.inlineLeads = validInline;

      const { data: uploadRes, error: upErr } = await supabase.functions.invoke("upload_campaign_leads_v2", { body });
      if (upErr) throw upErr;
      const r = uploadRes as any;
      if (r?.error) throw new Error(r.error);

      let msg = `✅ Campanha "${campaign.name}" criada · ${r.inserted} leads importados`;
      if (r.duplicates_internal > 0) msg += ` · ${r.duplicates_internal} duplicados na planilha`;
      if (r.duplicates_existing > 0) msg += ` · ${r.duplicates_existing} já existiam`;
      if (r.invalid?.length > 0) msg += ` · ${r.invalid.length} inválidos`;
      if (r.capped) msg += ` · cap 500 atingido`;
      toast.success(msg);
      onClose();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl rounded-2xl p-5 max-h-[90vh] flex flex-col"
        style={{ background: "var(--crm-surface-hex, #0D1117)", border: "1px solid rgba(16,185,129,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: "var(--crm-text)" }}>
              <Send className="w-5 h-5" style={{ color: "#10B981" }} />
              Nova Campanha
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--crm-text-muted)" }}>Etapa {step} de 3</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: "var(--crm-text-muted)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>Nome da campanha</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Reativação MCMV Maio"
                  className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                  style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>
                  Templates de mensagem ({selectedTemplates.length} de {templates.length} · mínimo 3 pra A/B test)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg p-2" style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}>
                  {templates.length === 0 && <p className="text-xs text-center py-2" style={{ color: "var(--crm-text-muted)" }}>Nenhum template ativo. Peça pro admin cadastrar.</p>}
                  {templates.map(t => (
                    <label key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5">
                      <input type="checkbox" checked={selectedTemplates.includes(t.id)}
                        onChange={() => setSelectedTemplates(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                        className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold" style={{ color: "var(--crm-text)" }}>{t.name}</div>
                        <div className="text-[10px] line-clamp-2" style={{ color: "var(--crm-text-muted)" }}>{t.message}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>
                  Chips da equipe ({selectedBots.length} de {bots.length})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {bots.length === 0 && <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>Nenhum chip atribuído à sua equipe. Peça pro admin atribuir em Atribuir Chips.</p>}
                  {bots.map(b => (
                    <button key={b.id}
                      onClick={() => setSelectedBots(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                      style={{
                        background: selectedBots.includes(b.id) ? "rgba(16,185,129,0.18)" : "var(--crm-glass)",
                        border: `1px solid ${selectedBots.includes(b.id) ? "rgba(16,185,129,0.5)" : "var(--crm-border-mid)"}`,
                        color: selectedBots.includes(b.id) ? "#10B981" : "var(--crm-text)",
                      }}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>Delay min (s)</label>
                  <input type="number" min={60} value={delayMin} onChange={e => setDelayMin(Math.max(60, Number(e.target.value) || 60))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                    style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>Delay max (s)</label>
                  <input type="number" min={delayMin} value={delayMax} onChange={e => setDelayMax(Math.max(delayMin, Number(e.target.value) || delayMin))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                    style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                  />
                </div>
              </div>
              <p className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
                Cada chip respeita seu próprio cooldown — quanto mais chips, mais rápido a campanha completa.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex gap-2">
                <button onClick={() => setUploadMode("csv")}
                  className="flex-1 px-3 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5"
                  style={{
                    background: uploadMode === "csv" ? "rgba(16,185,129,0.18)" : "var(--crm-glass)",
                    border: `1px solid ${uploadMode === "csv" ? "rgba(16,185,129,0.5)" : "var(--crm-border-mid)"}`,
                    color: uploadMode === "csv" ? "#10B981" : "var(--crm-text)",
                  }}>
                  <FileText className="w-3.5 h-3.5" /> CSV / Excel
                </button>
                <button onClick={() => setUploadMode("inline")}
                  className="flex-1 px-3 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5"
                  style={{
                    background: uploadMode === "inline" ? "rgba(16,185,129,0.18)" : "var(--crm-glass)",
                    border: `1px solid ${uploadMode === "inline" ? "rgba(16,185,129,0.5)" : "var(--crm-border-mid)"}`,
                    color: uploadMode === "inline" ? "#10B981" : "var(--crm-text)",
                  }}>
                  <Plus className="w-3.5 h-3.5" /> Manual (até 20)
                </button>
              </div>

              {uploadMode === "csv" && (
                <>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>
                      Cole conteúdo do CSV (separado por vírgula, ponto-vírgula ou tab)
                    </label>
                    <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
                      placeholder={`nome,telefone\nJoão Silva,11991234567\nMaria Santos,5511987654321`}
                      rows={10}
                      className="w-full px-3 py-2 rounded-lg outline-none text-xs font-mono"
                      style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                    />
                  </div>
                  <input type="file" accept=".csv,.txt" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const text = await f.text();
                    setCsvText(text);
                    toast.success(`${f.name} carregado`);
                  }} className="text-[11px]" />
                  <p className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
                    Headers aceitos: nome/name/cliente · telefone/phone/whatsapp/celular. Cap 500. Phones sem 55 viram 5511XXXX automaticamente.
                  </p>
                </>
              )}

              {uploadMode === "inline" && (
                <div className="space-y-2">
                  {inlineLeads.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={l.name} placeholder="Nome"
                        onChange={e => { const arr=[...inlineLeads]; arr[i]={...arr[i], name:e.target.value}; setInlineLeads(arr); }}
                        className="flex-1 px-2 py-1.5 rounded-md outline-none text-sm"
                        style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                      />
                      <input type="text" value={l.phone} placeholder="Telefone"
                        onChange={e => { const arr=[...inlineLeads]; arr[i]={...arr[i], phone:e.target.value}; setInlineLeads(arr); }}
                        className="flex-1 px-2 py-1.5 rounded-md outline-none text-sm"
                        style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}
                      />
                      <button onClick={() => setInlineLeads(arr => arr.filter((_, idx) => idx !== i))}
                        className="p-1.5 rounded-md" style={{ color: "var(--crm-text-muted)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {inlineLeads.length < 20 && (
                    <button onClick={() => setInlineLeads(arr => [...arr, { name: "", phone: "" }])}
                      className="px-3 py-1.5 rounded-md text-[11px] font-bold"
                      style={{ background: "var(--crm-glass)", border: "1px dashed var(--crm-border-mid)", color: "var(--crm-text-muted)" }}>
                      + adicionar
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg p-3" style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--crm-text)" }}>Revisão</p>
                <ul className="text-[11px] space-y-1" style={{ color: "var(--crm-text-muted)" }}>
                  <li>📌 Nome: <strong style={{ color: "var(--crm-text)" }}>{name}</strong></li>
                  <li>💬 {selectedTemplates.length} templates · {selectedBots.length} chips · delay {delayMin}–{delayMax}s</li>
                  <li>📋 {uploadMode === "csv" ? `CSV (${csvText.split("\n").filter(l=>l.trim()).length} linhas)` : `${validInline.length} contatos manuais`}</li>
                </ul>
              </div>
              {hasActive && (
                <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
                  <p className="text-[11px]" style={{ color: "#F59E0B" }}>
                    Você já tem outra campanha ativa. Esta será criada em <strong>draft</strong> — pause a outra e ative manualmente.
                  </p>
                </div>
              )}
              <p className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
                A campanha será criada em rascunho. Importação valida e mostra duplicados/inválidos antes de iniciar.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between mt-4 shrink-0">
          {step > 1 ? (
            <button onClick={() => setStep((step - 1) as any)}
              className="px-3 py-2 rounded-lg text-[11px] font-bold"
              style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}>
              Voltar
            </button>
          ) : <div />}
          {step < 3 && (
            <button onClick={() => setStep((step + 1) as any)}
              disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
              className="px-4 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50"
              style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.5)", color: "#10B981" }}>
              Próximo →
            </button>
          )}
          {step === 3 && (
            <button onClick={handleCreate} disabled={submitting}
              className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.5)", color: "#10B981" }}>
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Criar Campanha
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
