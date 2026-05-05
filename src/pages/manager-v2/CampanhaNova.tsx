// CampanhaNova — builder de campanha em tela cheia.
// Wizard 4 passos: Lista → Chip → Templates → Preview.
// Cria como rascunho — manager confirma "ativar" depois.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import {
  Send, Upload, Smartphone, FileText, Eye, Check, Loader2,
  ArrowLeft, ArrowRight, X, AlertTriangle, Sparkles, Phone, MessageSquare,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

type Step = 1 | 2 | 3 | 4;

interface UploadLead {
  name: string;
  phone: string;
  email?: string;
  isValid: boolean;
  warning?: string;
}

interface Bot {
  id: string;
  name: string;
  status: string;
  daily_limit: number | null;
  messages_today: number | null;
  health_score: number | null;
  paused_safety_at: string | null;
}

interface Template {
  id: string;
  name: string;
  message: string;
  is_active: boolean;
  is_draft: boolean;
}

const STEPS = [
  { n: 1, title: "Lista", desc: "Importar leads" },
  { n: 2, title: "Chip", desc: "Quem dispara" },
  { n: 3, title: "Templates", desc: "Mensagens" },
  { n: 4, title: "Preview", desc: "Revisar e criar" },
];

function normalizePhone(raw: string): { phone: string; valid: boolean; warning?: string } {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return { phone: "", valid: false, warning: "vazio" };
  digits = digits.replace(/^0+/, "");
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    digits = "55" + digits;
  }
  if (digits.length < 12 || digits.length > 13) {
    return { phone: digits, valid: false, warning: `${digits.length} dígitos (esperado 12-13)` };
  }
  return { phone: digits, valid: true };
}

function parseCsv(text: string): UploadLead[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Tenta detectar header
  const first = lines[0].toLowerCase();
  const hasHeader = /name|nome|phone|tel|email/.test(first);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ""));
    const name = parts[0] || "Sem nome";
    const phoneRaw = parts[1] || "";
    const email = parts[2] || "";
    const norm = normalizePhone(phoneRaw);
    return {
      name,
      phone: norm.phone,
      email,
      isValid: norm.valid,
      warning: norm.warning,
    };
  });
}

export default function CampanhaNova() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Step 1: lista
  const [campaignName, setCampaignName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [uploadLeads, setUploadLeads] = useState<UploadLead[]>([]);

  // Step 2: chip
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBots, setSelectedBots] = useState<Set<string>>(new Set());

  // Step 3: templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

  // Step 4: criar
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: botData }, { data: tmplData }] = await Promise.all([
        supabase
          .from("bot_instances")
          .select("id, name, status, daily_limit, messages_today, health_score, paused_safety_at, is_prospecting")
          .eq("is_prospecting", true)
          .order("name"),
        supabase
          .from("prospecting_message_templates")
          .select("id, name, message, is_active, is_draft")
          .eq("is_active", true)
          .eq("is_draft", false)
          .order("name"),
      ]);
      setBots((botData as Bot[]) || []);
      setTemplates((tmplData as Template[]) || []);
    })();
  }, []);

  // Parse CSV ao colar
  useEffect(() => {
    if (!csvText.trim()) { setUploadLeads([]); return; }
    setUploadLeads(parseCsv(csvText));
  }, [csvText]);

  const validLeads = useMemo(() => uploadLeads.filter((l) => l.isValid), [uploadLeads]);
  const invalidLeads = useMemo(() => uploadLeads.filter((l) => !l.isValid), [uploadLeads]);

  function canAdvance(): { ok: boolean; reason?: string } {
    if (step === 1) {
      if (!campaignName.trim()) return { ok: false, reason: "Defina um nome pra campanha" };
      if (validLeads.length === 0) return { ok: false, reason: "Importe pelo menos 1 lead válido" };
      return { ok: true };
    }
    if (step === 2) {
      if (selectedBots.size === 0) return { ok: false, reason: "Selecione pelo menos 1 chip" };
      return { ok: true };
    }
    if (step === 3) {
      if (selectedTemplates.size === 0) return { ok: false, reason: "Escolha pelo menos 1 template" };
      return { ok: true };
    }
    return { ok: true };
  }

  function nextStep() {
    const c = canAdvance();
    if (!c.ok) { toast.warning(c.reason); return; }
    setStep((s) => (s + 1) as Step);
  }

  async function createCampaign() {
    if (!userId) return;
    setCreating(true);
    try {
      const { data: campaign, error } = await supabase
        .from("ia_campaigns")
        .insert({
          name: campaignName.trim(),
          status: "draft", // sempre rascunho — manager ativa manualmente depois
          target_audience: { source: "upload" },
          prospect_instance_ids: Array.from(selectedBots),
          template_ids: Array.from(selectedTemplates),
          working_hours: { start: "09:00", end: "18:00" },
          delay_between_messages_min: 120,
          delay_between_messages_max: 420,
          max_messages_per_lead: 3,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Insere os campaign_leads
      const inserts = validLeads.map((l) => ({
        campaign_id: campaign.id,
        name: l.name,
        phone: l.phone,
        email: l.email || null,
        status: "pending",
      }));

      if (inserts.length > 0) {
        const { error: errLeads } = await supabase.from("campaign_leads").insert(inserts);
        if (errLeads) throw errLeads;
      }

      toast.success(`✅ Campanha "${campaignName}" criada como rascunho`);
      navigate(`/manager/campanha/${campaign.id}`);
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Shell title="Nova Campanha" subtitle="builder em tela cheia" icon={Send} color="#10B981">
      {/* Progress steps */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const active = step === s.n;
            const done = step > s.n;
            return (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => done && setStep(s.n as Step)}
                  className="flex items-center gap-2 group"
                  disabled={!done}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition ${
                      done
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                        : active
                        ? "bg-emerald-500/30 border-2 border-emerald-500 text-emerald-200"
                        : "bg-slate-800/60 border border-slate-700 text-slate-500"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : s.n}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className={`text-xs font-bold ${active || done ? "text-slate-200" : "text-slate-500"}`}>
                      {s.title}
                    </p>
                    <p className="text-[11px] text-slate-500">{s.desc}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px ${done ? "bg-emerald-500/40" : "bg-slate-800"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {step === 1 && (
            <Step1
              name={campaignName}
              setName={setCampaignName}
              csvText={csvText}
              setCsvText={setCsvText}
              uploadLeads={uploadLeads}
              validLeads={validLeads}
              invalidLeads={invalidLeads}
            />
          )}
          {step === 2 && (
            <Step2 bots={bots} selectedBots={selectedBots} setSelectedBots={setSelectedBots} />
          )}
          {step === 3 && (
            <Step3
              templates={templates}
              selectedTemplates={selectedTemplates}
              setSelectedTemplates={setSelectedTemplates}
              sampleName={validLeads[0]?.name || "João da Silva"}
            />
          )}
          {step === 4 && (
            <Step4
              campaignName={campaignName}
              validLeads={validLeads}
              selectedBots={Array.from(selectedBots).map((id) => bots.find((b) => b.id === id)!).filter(Boolean)}
              selectedTemplates={Array.from(selectedTemplates).map((id) => templates.find((t) => t.id === id)!).filter(Boolean)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer com nav */}
      <div className="mt-6 flex items-center justify-between sticky bottom-0 bg-slate-950/80 backdrop-blur-md py-3 -mx-4 sm:-mx-6 px-4 sm:px-6 border-t border-slate-800/50">
        <button
          onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : navigate("/manager/campanha")}
          className="px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {step > 1 ? "Voltar" : "Cancelar"}
        </button>
        {step < 4 ? (
          <button
            onClick={nextStep}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center gap-1.5 transition"
          >
            Próximo <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={createCampaign}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Criar campanha (rascunho)
          </button>
        )}
      </div>
    </Shell>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({ name, setName, csvText, setCsvText, uploadLeads, validLeads, invalidLeads }: any) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4">
        <label className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2 block">
          Nome da campanha
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: ZS_Faixa1_Maio"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
            Lista de leads (CSV)
          </label>
          <span className="text-[11px] text-slate-500">
            formato: <code className="bg-slate-800 px-1 rounded">nome, telefone, email</code>
          </span>
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={"João Silva, 11987654321, joao@email.com\nMaria, 11999998888\n..."}
          rows={8}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition font-mono text-[11px]"
        />
        <div className="flex items-center gap-3 mt-2 text-[11px]">
          <span className="text-emerald-400 font-bold">✅ {validLeads.length} válidos</span>
          {invalidLeads.length > 0 && (
            <span className="text-red-400 font-bold">❌ {invalidLeads.length} inválidos</span>
          )}
          <span className="text-slate-500 ml-auto">total: {uploadLeads.length}</span>
        </div>

        {uploadLeads.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-slate-800/60">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/80 sticky top-0">
                <tr className="text-[11px] uppercase tracking-widest text-slate-500">
                  <th className="px-2 py-1.5 text-left">Nome</th>
                  <th className="px-2 py-1.5 text-left">Telefone</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {uploadLeads.slice(0, 50).map((l: UploadLead, i: number) => (
                  <tr key={i} className={`border-t border-slate-800/40 ${l.isValid ? "" : "bg-red-500/[0.04]"}`}>
                    <td className="px-2 py-1 text-slate-300 truncate max-w-[200px]">{l.name}</td>
                    <td className="px-2 py-1 text-slate-400 font-mono">{l.phone || "—"}</td>
                    <td className="px-2 py-1">
                      {l.isValid ? (
                        <span className="text-emerald-400 text-[11px]">OK</span>
                      ) : (
                        <span className="text-red-400 text-[11px]">{l.warning}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {uploadLeads.length > 50 && (
              <p className="text-[11px] text-slate-500 text-center py-1.5 border-t border-slate-800/40">
                + {uploadLeads.length - 50} linhas
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Step2({ bots, selectedBots, setSelectedBots }: { bots: Bot[]; selectedBots: Set<string>; setSelectedBots: (s: Set<string>) => void }) {
  function toggle(id: string) {
    const ns = new Set(selectedBots);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelectedBots(ns);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 px-1">
        Escolha os chips que vão disparar. Chips offline ou pausados ficam bloqueados.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {bots.map((b) => {
          const ready = b.status === "open" || b.status === "active";
          const paused = b.paused_safety_at !== null;
          const disabled = !ready || paused;
          const selected = selectedBots.has(b.id);
          const cap = b.daily_limit || 150;
          const sent = b.messages_today || 0;
          const capPct = (sent / cap) * 100;
          const colors = disabled ? "#71717A" : selected ? "#10B981" : "#06B6D4";

          return (
            <button
              key={b.id}
              onClick={() => !disabled && toggle(b.id)}
              disabled={disabled}
              className="rounded-xl p-3 border text-left transition disabled:cursor-not-allowed"
              style={{
                background: selected ? `${colors}15` : `${colors}06`,
                borderColor: selected ? `${colors}80` : `${colors}30`,
                opacity: disabled ? 0.5 : 1,
                boxShadow: selected ? `0 0 16px ${colors}30` : "none",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" style={{ color: colors }} />
                  <span className="text-sm font-bold text-slate-100">{b.name}</span>
                </div>
                {selected && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="px-1.5 py-0.5 rounded uppercase tracking-wider font-bold"
                  style={{ background: `${colors}20`, color: colors }}>
                  {paused ? "pausado" : b.status}
                </span>
                <span className="text-slate-500">
                  {sent}/{cap} hoje
                </span>
              </div>
              {!disabled && (
                <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, capPct)}%`,
                      background: capPct > 80 ? "#EF4444" : capPct > 50 ? "#F59E0B" : "#10B981",
                    }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step3({
  templates, selectedTemplates, setSelectedTemplates, sampleName,
}: { templates: Template[]; selectedTemplates: Set<string>; setSelectedTemplates: (s: Set<string>) => void; sampleName: string }) {
  function toggle(id: string) {
    const ns = new Set(selectedTemplates);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelectedTemplates(ns);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 px-1">
        Selecione múltiplos templates — o sistema faz round-robin ponderado por score.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {templates.map((t) => {
          const selected = selectedTemplates.has(t.id);
          const preview = t.message
            .replace(/\{nome\}/gi, sampleName.split(" ")[0])
            .replace(/\{name\}/gi, sampleName.split(" ")[0])
            .slice(0, 200);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className="rounded-xl p-3 border text-left transition"
              style={{
                background: selected ? "rgba(167,139,250,0.10)" : "rgba(15,23,42,0.4)",
                borderColor: selected ? "#A78BFA80" : "#3F3F4640",
                boxShadow: selected ? "0 0 16px rgba(167,139,250,0.20)" : "none",
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: selected ? "#A78BFA" : "#94A3B8" }}>
                  <FileText className="w-3 h-3 inline mr-1" /> {t.name}
                </span>
                {selected && <Check className="w-4 h-4 text-violet-400" />}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3 italic">
                "{preview}{t.message.length > 200 ? "…" : ""}"
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step4({
  campaignName, validLeads, selectedBots, selectedTemplates,
}: any) {
  const sampleLead = validLeads[0];
  const sampleTemplate = selectedTemplates[0];
  const previewMsg = sampleTemplate?.message
    .replace(/\{nome\}/gi, sampleLead?.name?.split(" ")[0] || "João")
    .replace(/\{name\}/gi, sampleLead?.name?.split(" ")[0] || "João");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-emerald-300">Resumo</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Resume label="Nome" value={campaignName} />
          <Resume label="Leads válidos" value={validLeads.length} />
          <Resume label="Chips" value={selectedBots.length} />
          <Resume label="Templates" value={selectedTemplates.length} />
        </div>
      </div>

      {sampleLead && sampleTemplate && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-cyan-300">
              Preview do envio
            </h3>
            <span className="text-[11px] text-slate-500 ml-auto">
              primeiro lead · primeiro template
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-lg bg-slate-900/60 border border-slate-800/60 p-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1.5">
                <Phone className="w-3 h-3" /> {sampleLead.phone}
                <span>·</span>
                <span className="font-bold">{sampleLead.name}</span>
              </div>
              <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 p-3 ml-3">
                <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">
                  {previewMsg}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              ⚠️ A campanha será criada como <strong>rascunho</strong>. Pra ativar e disparar, abra o detalhe da campanha e clique em "Ativar".
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Resume({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      <p className="text-base font-bold text-slate-100 mt-0.5 truncate">{value}</p>
    </div>
  );
}
