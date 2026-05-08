// ProspeccaoMode — modo alternativo do dashboard do broker.
// Fluxo em 3 etapas:
//   1. Seleção de área (tag) — broker escolhe onde quer prospectar
//   2. Carrossel single-card — vê 1 cold por vez, sem phone/email visível
//   3. Acabou — opção de mudar área ou recarregar
//
// Regras de negócio:
//   - Limite 15 ativos sem 1ª msg (RPC claim_cold_contact)
//   - Skip persistente por 7d (RPC skip_cold_contact + filtro no pool)
//   - Telefone/email só revelam após Pegar (anti-extração)
//   - Cooldown 24h: cron return_unworked_cold

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Snowflake, Hand, Send, RefreshCw, X, AlertTriangle, Loader2,
  Phone, ArrowLeft, ArrowRight, MapPin, CheckCircle2, Plus,
  ChevronRight, Tag, WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ColdContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tag: string | null;
  custom_fields: any;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
  first_msg_sent_at: string | null;
  manager_id: string | null;
}

interface Props {
  brokerId: string;
  managerId?: string | null;
  botInstanceId?: string | null;
  onExit: () => void;
}

const SUGGESTED_OPENERS = [
  "Olá {nome}, tudo bem? Vi que você teve interesse em sair do aluguel — conseguiu avançar? Posso te ajudar a entender se hoje você teria condição com o Minha Casa Minha Vida.",
  "Oi {nome}! Trabalho com financiamento Minha Casa Minha Vida e algumas oportunidades novas chegaram aqui. Posso te mandar duas perguntas rápidas pra ver se faz sentido pra você?",
  "Oi {nome}, tudo certo? Estou olhando aqui contatos de quem chegou a se interessar e ainda não fechou — quer que eu te ajude a simular sua aprovação?",
];

function fmtAgo(iso?: string | null) {
  if (!iso) return "—";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "agora";
  if (m < 60) return `${Math.floor(m)}min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 60 / 24)}d`;
}

function maskEmail(email?: string | null): string {
  if (!email) return "—";
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, user.length - 2))}@${domain}`;
}

type Step = "select_area" | "carousel" | "done";

export default function ProspeccaoMode({ brokerId, managerId, botInstanceId, onExit }: Props) {
  const [step, setStep] = useState<Step>("select_area");
  const [areaTag, setAreaTag] = useState<string | null>(null);
  const [chipStatus, setChipStatus] = useState<string | null>(null);
  const [areas, setAreas] = useState<{ tag: string; count: number }[]>([]);
  const [pool, setPool] = useState<ColdContact[]>([]);
  const [idx, setIdx] = useState(0);
  const [mine, setMine] = useState<ColdContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [poolLimit, setPoolLimit] = useState<{limit:number;tier:string;current_claimed:number;available:number;promoted_30d:number;conversion_pct:number}|null>(null);

  async function reloadPoolLimit() {
    const { data } = await supabase.rpc("get_broker_pool_limit", { p_broker_id: brokerId });
    if (data) setPoolLimit(data as any);
  }
  useEffect(() => { reloadPoolLimit(); }, [brokerId]);

  // ── Carrega áreas (tags com count, excluindo skips dos últimos 7d)
  async function loadAreas() {
    setLoading(true);
    // Skips do broker nos últimos 7d
    const { data: skips } = await supabase
      .from("cold_skip")
      .select("contact_id")
      .eq("broker_id", brokerId)
      .gte("skipped_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    const skipIds = new Set((skips || []).map((s: any) => s.contact_id));

    const orFilter = managerId
      ? `manager_id.eq.${managerId},manager_id.is.null`
      : "manager_id.is.null";

    const { data } = await supabase
      .from("cold_contacts")
      .select("id, tag")
      .eq("status", "available")
      .or(orFilter)
      .limit(2000);

    const byTag = new Map<string, number>();
    for (const row of (data as any[]) || []) {
      if (skipIds.has(row.id)) continue;
      const t = row.tag || "Sem área";
      byTag.set(t, (byTag.get(t) || 0) + 1);
    }
    const list = Array.from(byTag.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    setAreas(list);

    // "Meus" sempre carrega independente de etapa
    const { data: mineRes } = await supabase
      .from("cold_contacts")
      .select("*")
      .eq("status", "claimed")
      .eq("claimed_by", brokerId)
      .order("claimed_at", { ascending: false });
    setMine((mineRes as any) || []);

    setLoading(false);
  }

  // ── Carrega pool da área escolhida (filtra skips 7d)
  async function loadAreaPool(tag: string) {
    setLoading(true);
    const { data: skips } = await supabase
      .from("cold_skip")
      .select("contact_id")
      .eq("broker_id", brokerId)
      .gte("skipped_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    const skipIds = (skips || []).map((s: any) => s.contact_id);

    const orFilter = managerId
      ? `manager_id.eq.${managerId},manager_id.is.null`
      : "manager_id.is.null";

    let q = supabase
      .from("cold_contacts")
      .select("*")
      .eq("status", "available")
      .or(orFilter)
      .order("created_at", { ascending: true })
      .limit(200);

    if (tag === "Sem área") q = q.is("tag", null);
    else q = q.eq("tag", tag);

    const { data } = await q;
    let list = ((data as any[]) || []) as ColdContact[];
    if (skipIds.length > 0) list = list.filter((c) => !skipIds.includes(c.id));

    setPool(list);
    setIdx(0);
    setStep(list.length === 0 ? "done" : "carousel");
    setLoading(false);
  }

  useEffect(() => { loadAreas(); }, [brokerId, managerId]);

  // Verifica status do chip a cada 30s — força broker manter conexão ativa
  useEffect(() => {
    if (!botInstanceId) { setChipStatus(null); return; }
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from("bot_instances")
        .select("status")
        .eq("id", botInstanceId)
        .maybeSingle();
      if (!cancelled) setChipStatus((data as any)?.status ?? null);
    };
    check();
    const t = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [botInstanceId]);

  const chipOnline = !!chipStatus && ["open", "active", "online", "connected"].includes(chipStatus);

  const current = pool[idx];
  const activeWithoutMsg = mine.filter((c) => !c.first_msg_sent_at).length;
  const limit1 = 15;
  const remaining = Math.max(0, limit1 - activeWithoutMsg);

  async function handlePick() {
    if (!current || busy) return;
    if (!chipOnline) {
      toast.error("WhatsApp desconectado. Reconecta antes de pegar leads.");
      return;
    }
    if (remaining === 0) {
      toast.warning("Você atingiu 15 ativos sem 1ª msg. Trabalhe esses primeiro.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_cold_contact", {
      p_broker_id: brokerId,
      p_contact_id: current.id,
    });
    setBusy(false);
    if (error) {
      const msg = error.message || "";
      toast.error(
        msg.includes("chip_offline") ? "Seu WhatsApp está desconectado. Reconecta antes de pegar leads." :
        msg.includes("no_chip") ? "Você não tem chip vinculado. Avise o gerente." :
        msg.includes("limit_total_reached") ? `Você atingiu seu limite total no pool (${poolLimit?.limit ?? 50}). Promova ou skipe alguns antes de pegar mais.` :
        msg.includes("limit_active") ? "Você já tem 15 cold ativos sem 1ª msg." :
        msg.includes("already_claimed") ? "Outro broker pegou esse antes de você." :
        `Erro: ${msg}`
      );
      // tira do array local
      setPool((p) => p.filter((c) => c.id !== current.id));
      return;
    }
    toast.success(`✅ ${current.name.split(" ")[0]} é seu — manda a 1ª msg!`);
    if (data) setMine((m) => [data as any, ...m]);
    reloadPoolLimit();
    // remove da pool e avança
    const next = pool.filter((c) => c.id !== current.id);
    setPool(next);
    if (next.length === 0) setStep("done");
    else setIdx(Math.min(idx, next.length - 1));
  }

  async function handleSkip() {
    if (!current || busy) return;
    setBusy(true);
    await supabase.rpc("skip_cold_contact", {
      p_broker_id: brokerId,
      p_contact_id: current.id,
    });
    setBusy(false);
    const next = pool.filter((c) => c.id !== current.id);
    setPool(next);
    if (next.length === 0) setStep("done");
    else setIdx(Math.min(idx, next.length - 1));
  }

  async function handleReturn(c: ColdContact) {
    if (busy) return;
    setBusy(true);
    await supabase.rpc("return_cold_contact", {
      p_broker_id: brokerId,
      p_contact_id: c.id,
    });
    setBusy(false);
    setMine((m) => m.filter((x) => x.id !== c.id));
    toast.info("Devolveu pro pool.");
  }

  function startMsg(c: ColdContact) {
    const opener = SUGGESTED_OPENERS[Math.floor(Math.random() * SUGGESTED_OPENERS.length)];
    setMsgText(opener.replace(/\{nome\}/gi, c.name.split(" ")[0]));
    setOpenMsg(c.id);
  }

  async function sendFirstMsg(c: ColdContact) {
    if (busy) return;
    if (!msgText.trim()) { toast.warning("Mensagem vazia"); return; }
    if (!botInstanceId) {
      toast.error("Você não tem chip vinculado. Avise o gerente.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: { botId: botInstanceId, phone: c.phone, message: msgText, send_source: "broker_manual" },
      });
      if (error) throw error;
      await supabase.rpc("mark_cold_first_msg", { p_broker_id: brokerId, p_contact_id: c.id });
      toast.success(`📨 1ª msg enviada pro ${c.name.split(" ")[0]}`);
      setOpenMsg(null);
      setMsgText("");
      setMine((m) => m.map((x) => x.id === c.id ? { ...x, first_msg_sent_at: new Date().toISOString() } : x));
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || "envio falhou"}`);
    } finally {
      setBusy(false);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      {/* Header sticky */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition"
            style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)", color: "var(--crm-text-muted)" }}
          >
            <ArrowLeft className="w-3 h-3" /> Sair
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
               style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.30)" }}>
            <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] uppercase tracking-widest font-black text-cyan-300">Modo prospecção</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
          <span>
            <span className="font-bold" style={{ color: "var(--crm-text)" }}>{activeWithoutMsg}</span>/{limit1} s/ 1ª msg
          </span>
          {poolLimit && (
            <span className={poolLimit.available === 0 ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>
              · {poolLimit.current_claimed}/{poolLimit.limit} total
              {poolLimit.tier === "pro" && <span title={`${poolLimit.promoted_30d} vendas em 30d, ${poolLimit.conversion_pct}%`}> 🥈</span>}
              {poolLimit.tier === "elite" && <span title={`${poolLimit.promoted_30d} vendas em 30d, ${poolLimit.conversion_pct}%`}> 🏆</span>}
            </span>
          )}
        </div>
      </div>

      {/* Aviso de chip desconectado — bloqueia toda ação de claim */}
      {!chipOnline && (
        <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.50)" }}>
          <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold" style={{ color: "#FCA5A5" }}>
              WhatsApp desconectado
            </p>
            <p className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
              Reconecta seu chip antes de pegar leads. Você pode ver o pool, mas o botão "Pegar" só libera com WA online.
            </p>
          </div>
        </div>
      )}

      {/* Aviso quando bateu limite 15 */}
      {chipOnline && remaining === 0 && (
        <div className="rounded-lg px-3 py-2 flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.30)" }}>
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-xs" style={{ color: "var(--crm-text)" }}>
            Você tem 15 cold ativos sem 1ª msg. Manda em algum dos seus pra liberar espaço.
          </p>
        </div>
      )}

      {/* ─── ETAPA 1: Seleção de área ─── */}
      {step === "select_area" && (
        <section className="rounded-2xl border overflow-hidden"
                 style={{ background: "var(--crm-card)", borderColor: "rgba(56,189,248,0.30)" }}>
          <div className="px-5 py-4 border-b flex items-center gap-2"
               style={{ borderColor: "var(--crm-border)" }}>
            <MapPin className="w-4 h-4 text-cyan-400" />
            <h3 className="foco-disp text-sm font-black uppercase tracking-widest"
                style={{ color: "var(--crm-text)" }}>Onde quer prospectar?</h3>
          </div>
          <div className="p-3">
            {loading ? (
              <div className="flex items-center justify-center py-10" style={{ color: "var(--crm-text-muted)" }}>
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : areas.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "var(--crm-text-muted)" }}>
                Pool vazio. Volta mais tarde — admin vai subir mais contatos.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {areas.map((a) => (
                  <button
                    key={a.tag}
                    onClick={() => { setAreaTag(a.tag); loadAreaPool(a.tag); }}
                    className="rounded-xl p-4 text-left transition hover:brightness-110 active:scale-[.98]"
                    style={{
                      background: "var(--crm-glass)",
                      border: "1px solid rgba(56,189,248,0.30)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-bold" style={{ color: "var(--crm-text)" }}>
                          {a.tag}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--crm-text-muted)" }}>
                          {a.count} disponíve{a.count > 1 ? "is" : "l"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-cyan-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── ETAPA 2: Carrossel single-card ─── */}
      {step === "carousel" && current && (
        <section className="rounded-3xl border overflow-hidden relative"
                 style={{
                   background: `linear-gradient(135deg, rgba(56,189,248,0.08), var(--crm-card-strong))`,
                   borderColor: "rgba(56,189,248,0.40)",
                   boxShadow: "0 0 40px rgba(56,189,248,0.15)",
                 }}>
          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between"
               style={{ borderColor: "var(--crm-border)" }}>
            <div className="flex items-center gap-2">
              <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-cyan-300">
                {areaTag} · Carta {idx + 1} de {pool.length}
              </span>
            </div>
            <button
              onClick={() => { setStep("select_area"); setAreaTag(null); setPool([]); setIdx(0); }}
              className="text-[10px] uppercase tracking-wider hover:underline"
              style={{ color: "var(--crm-text-muted)" }}
            >
              ← Mudar área
            </button>
          </div>

          {/* Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="px-6 py-8 sm:py-10"
            >
              <div className="text-center space-y-4">
                <h2 className="foco-disp text-3xl sm:text-4xl font-black leading-tight"
                    style={{ color: "var(--crm-text)" }}>
                  {current.name}
                </h2>

                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  {current.tag && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold"
                          style={{ background: "rgba(56,189,248,0.12)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.30)" }}>
                      <Tag className="w-3 h-3" /> {current.tag}
                    </span>
                  )}
                  {current.custom_fields?.renda && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold"
                          style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.30)" }}>
                      💰 Renda R$ {current.custom_fields.renda}
                    </span>
                  )}
                  {current.email && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md"
                          style={{ background: "var(--crm-glass)", color: "var(--crm-text-muted)", border: "1px solid var(--crm-border)" }}>
                      📧 {maskEmail(current.email)}
                    </span>
                  )}
                </div>

                <p className="text-[11px] flex items-center justify-center gap-1.5" style={{ color: "var(--crm-text-muted)" }}>
                  <Phone className="w-3 h-3" /> Telefone aparece quando você pegar
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Footer ações */}
          <div className="px-5 py-3 border-t flex items-center gap-2"
               style={{ borderColor: "var(--crm-border)" }}>
            <button
              onClick={handleSkip}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition disabled:opacity-50"
              style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)", color: "var(--crm-text-muted)" }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Próximo
            </button>
            <button
              onClick={handlePick}
              disabled={busy || remaining === 0 || !chipOnline}
              title={!chipOnline ? "Reconecte o WhatsApp pra pegar leads" : remaining === 0 ? "Limite de 15 ativos atingido" : "Pegar este lead"}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition disabled:opacity-40"
              style={{
                background: (!chipOnline || remaining === 0) ? "var(--crm-glass)" : "linear-gradient(135deg, #06B6D4, #0EA5E9)",
                color: (!chipOnline || remaining === 0) ? "var(--crm-text-muted)" : "white",
                boxShadow: (!chipOnline || remaining === 0) ? "none" : "0 4px 18px rgba(6,182,212,0.4)",
              }}
            >
              {!chipOnline ? <WifiOff className="w-3.5 h-3.5" /> : busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {!chipOnline ? "WhatsApp off" : "Pegar este"}
            </button>
          </div>
        </section>
      )}

      {/* ─── ETAPA 3: Acabou ─── */}
      {step === "done" && (
        <section className="rounded-2xl border overflow-hidden text-center px-5 py-10"
                 style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4"
               style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.40)" }}>
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <h3 className="foco-disp text-lg font-black mb-1" style={{ color: "var(--crm-text)" }}>
            Você viu todas {areaTag ? `de ${areaTag}` : ""}
          </h3>
          <p className="text-xs max-w-sm mx-auto leading-relaxed mb-5" style={{ color: "var(--crm-text-muted)" }}>
            Os que você pulou voltam a aparecer pra você daqui a 7 dias.
            Admin libera novos contatos conforme sobe.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => { setStep("select_area"); setAreaTag(null); setPool([]); setIdx(0); loadAreas(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition"
              style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.40)", color: "#06B6D4" }}
            >
              <MapPin className="w-3.5 h-3.5" /> Mudar área
            </button>
            <button
              onClick={() => { if (areaTag) loadAreaPool(areaTag); }}
              disabled={!areaTag}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-40"
              style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)", color: "var(--crm-text)" }}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Verificar novos
            </button>
          </div>
        </section>
      )}

      {/* ─── MEUS COLD ATIVOS (sempre embaixo, dados completos) ─── */}
      {mine.length > 0 && (
        <section className="rounded-xl border overflow-hidden"
                 style={{ background: "var(--crm-card-soft)", borderColor: "var(--crm-border)" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between"
               style={{ borderColor: "var(--crm-border)" }}>
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"
                style={{ color: "var(--crm-text)" }}>
              <Hand className="w-3.5 h-3.5 text-cyan-400" />
              Meus em prospecção ({mine.length})
            </h3>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--crm-border)" }}>
            {mine.map((c) => {
              const sent = !!c.first_msg_sent_at;
              const isOpen = openMsg === c.id;
              return (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--crm-text)" }}>
                        {c.name}
                      </p>
                      <p className="text-[11px] flex items-center flex-wrap gap-x-1.5" style={{ color: "var(--crm-text-muted)" }}>
                        <Phone className="w-3 h-3" /> {c.phone}
                        {c.tag && <><span>·</span><Tag className="w-3 h-3" /> {c.tag}</>}
                        <span>·</span>
                        {sent ? (
                          <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 1ª msg há {fmtAgo(c.first_msg_sent_at)}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold">
                            sem 1ª msg · pego há {fmtAgo(c.claimed_at)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!sent && (
                        <button
                          onClick={() => startMsg(c)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition"
                          style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.40)", color: "#10B981" }}
                        >
                          <Send className="w-3 h-3" /> 1ª msg
                        </button>
                      )}
                      <button
                        onClick={() => handleReturn(c)}
                        title="Devolver ao pool"
                        className="px-2 py-1.5 rounded-md text-[11px] transition"
                        style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "#EF4444" }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isOpen && !sent && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-2"
                      >
                        <div className="rounded-lg p-2.5"
                             style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border)" }}>
                          <textarea
                            value={msgText}
                            onChange={(e) => setMsgText(e.target.value)}
                            rows={3}
                            className="w-full text-sm rounded-md p-2 bg-transparent resize-none outline-none"
                            style={{ color: "var(--crm-text)", border: "1px solid var(--crm-border)" }}
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => sendFirstMsg(c)}
                              disabled={busy || !msgText.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-50"
                              style={{ background: "#10B981", color: "white" }}
                            >
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Enviar agora
                            </button>
                            <button
                              onClick={() => { setOpenMsg(null); setMsgText(""); }}
                              className="text-[11px] underline"
                              style={{ color: "var(--crm-text-muted)" }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
