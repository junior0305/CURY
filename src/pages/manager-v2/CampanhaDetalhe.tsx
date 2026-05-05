// CampanhaDetalhe — detalhe da campanha + respostas inline + ações.
// Ações: Ativar (rascunho → ativa), Pausar, Retomar, Deletar (com confirmação).

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send, Loader2, Play, Pause, Trash2, Check, MessageSquare, ArrowLeft,
  Phone, Calendar, Sparkles, AlertTriangle, X, Smartphone,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

interface Campaign {
  id: string;
  name: string;
  status: string;
  leads_targeted: number | null;
  leads_contacted: number | null;
  leads_responded: number | null;
  leads_qualified: number | null;
  prospect_instance_ids: string[] | null;
  template_ids: string[] | null;
  created_at: string;
  working_hours: any;
  delay_between_messages_min: number | null;
  delay_between_messages_max: number | null;
}

interface CampaignLead {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  contacted_at: string | null;
  error_message: string | null;
}

interface Conversation {
  id: string;
  lead_name: string | null;
  lead_phone: string | null;
  last_message_at: string | null;
  messages_count: number | null;
}

export default function CampanhaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leadsList, setLeadsList] = useState<CampaignLead[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"leads" | "respostas">("leads");

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: cl }, { data: cv }] = await Promise.all([
      supabase.from("ia_campaigns").select("*").eq("id", id).maybeSingle(),
      supabase.from("campaign_leads").select("*").eq("campaign_id", id).order("created_at"),
      supabase
        .from("ia_conversations")
        .select("id, lead_name, lead_phone, last_message_at, messages_count")
        .eq("campaign_id", id)
        .gte("messages_count", 2)
        .order("last_message_at", { ascending: false })
        .limit(100),
    ]);
    setCampaign(c as Campaign);
    setLeadsList((cl as CampaignLead[]) || []);
    setConvs((cv as Conversation[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function changeStatus(newStatus: string) {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from("ia_campaigns").update({ status: newStatus }).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      newStatus === "active" ? "▶️ Campanha ativada — vai disparar no próximo ciclo do cron"
      : newStatus === "paused" ? "⏸️ Campanha pausada"
      : "Status atualizado"
    );
    load();
  }

  async function deleteCampaign() {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from("ia_campaigns").delete().eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("🗑️ Campanha deletada (conversas mantidas)");
    queryClient.invalidateQueries({ queryKey: ["v2-team-data"] });
    navigate("/manager/campanha");
  }

  if (loading) {
    return (
      <Shell title="Campanha" subtitle="" icon={Send} color="#10B981">
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> carregando…
        </div>
      </Shell>
    );
  }

  if (!campaign) {
    return (
      <Shell title="Campanha" subtitle="" icon={Send} color="#10B981">
        <div className="rounded-2xl bg-slate-900/60 border border-red-500/30 p-6 text-center">
          <p className="text-red-300 font-bold">Campanha não encontrada.</p>
          <Link to="/manager/campanha" className="text-cyan-400 text-sm mt-2 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Voltar
          </Link>
        </div>
      </Shell>
    );
  }

  const statusColor = campaign.status === "active" ? "#10B981"
    : campaign.status === "paused" ? "#F59E0B"
    : campaign.status === "draft" ? "#A78BFA"
    : "#71717A";

  const total = leadsList.length;
  const pending = leadsList.filter((l) => l.status === "pending").length;
  const contacted = leadsList.filter((l) => l.status === "contacted").length;
  const failed = leadsList.filter((l) => l.status === "failed").length;
  const respPct = contacted > 0 ? ((convs.length / contacted) * 100) : 0;

  return (
    <Shell
      title={campaign.name}
      subtitle={`${total} leads · criada em ${new Date(campaign.created_at).toLocaleDateString("pt-BR")}`}
      icon={Send}
      color={statusColor}
      actions={
        <div className="flex items-center gap-2">
          {campaign.status === "draft" && (
            <button
              onClick={() => changeStatus("active")}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Ativar
            </button>
          )}
          {campaign.status === "active" && (
            <button
              onClick={() => changeStatus("paused")}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Pause className="w-3 h-3" /> Pausar
            </button>
          )}
          {campaign.status === "paused" && (
            <button
              onClick={() => changeStatus("active")}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Retomar
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-xs font-bold transition disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Status banner */}
        <div
          className="rounded-2xl border p-4 flex items-center gap-3"
          style={{ background: `${statusColor}10`, borderColor: `${statusColor}40` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${statusColor}20`, border: `1px solid ${statusColor}40` }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: statusColor, boxShadow: campaign.status === "active" ? `0 0 8px ${statusColor}` : "none" }}
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: statusColor }}>
              Status: {campaign.status}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {campaign.status === "draft" && "Rascunho — não está disparando. Click em 'Ativar' pra começar."}
              {campaign.status === "active" && "🟢 Ativa — disparando no próximo ciclo do cron (a cada 2min)"}
              {campaign.status === "paused" && "Pausada — sem novos disparos. Pode retomar a qualquer momento."}
              {campaign.status === "completed" && "Concluída — todos os leads foram processados."}
            </p>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Metric label="Total" value={total} color="#94A3B8" />
          <Metric label="Pendentes" value={pending} color="#F59E0B" />
          <Metric label="Disparados" value={contacted} color="#06B6D4" />
          <Metric label="Falhas" value={failed} color="#EF4444" sub={failed > 0 ? "veja na lista" : ""} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <Metric label="Respostas" value={convs.length} color="#F472B6" sub={`${Math.round(respPct)}% taxa`} />
          <Metric label="Qualificados" value={campaign.leads_qualified || 0} color="#10B981" />
          <Metric label="Templates" value={campaign.template_ids?.length || 0} color="#A78BFA" sub="round-robin" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800/60">
          <button
            onClick={() => setTab("leads")}
            className={`px-4 py-2 text-xs font-bold transition border-b-2 ${
              tab === "leads"
                ? "text-emerald-300 border-emerald-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            Leads ({leadsList.length})
          </button>
          <button
            onClick={() => setTab("respostas")}
            className={`px-4 py-2 text-xs font-bold transition border-b-2 ${
              tab === "respostas"
                ? "text-pink-300 border-pink-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            Respostas ({convs.length})
          </button>
        </div>

        {tab === "leads" && (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 sticky top-0 border-b border-slate-800/60">
                  <tr className="text-[11px] uppercase tracking-widest text-slate-500">
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">Telefone</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Disparado em</th>
                    <th className="px-3 py-2 text-left">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsList.map((l) => {
                    const sColor = l.status === "contacted" ? "#10B981" : l.status === "failed" ? "#EF4444" : "#F59E0B";
                    return (
                      <tr key={l.id} className="border-b border-slate-800/30">
                        <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]">{l.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{l.phone}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[11px] uppercase tracking-widest font-bold"
                            style={{ background: `${sColor}15`, color: sColor }}>
                            {l.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">
                          {l.contacted_at ? new Date(l.contacted_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-3 py-2 text-red-400 text-[11px] truncate max-w-[200px]">
                          {l.error_message || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "respostas" && (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
            {convs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Nenhuma resposta ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {convs.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition">
                    <MessageSquare className="w-4 h-4 text-pink-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {c.lead_name || c.lead_phone || "—"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {c.messages_count} mensagens · última {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal confirmação delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-red-500/40 rounded-2xl p-6 max-w-md w-full"
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-base font-bold text-red-300">Deletar campanha?</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              A campanha "{campaign.name}" será removida. As <strong>conversas</strong> com leads
              continuam preservadas, só perdem o link com a campanha.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => { deleteCampaign(); setConfirmDelete(false); }}
                disabled={busy}
                className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 text-sm font-bold transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Deletar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </Shell>
  );
}

function Metric({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-3 border" style={{ background: `${color}06`, borderColor: `${color}30` }}>
      <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      <p className="text-2xl font-black tabular-nums mt-1" style={{ color }}>
        {value.toLocaleString("pt-BR")}
      </p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
