/**
 * CorretorPainel — port fiel do mockup mockup_corretor_v2.html, ligado aos dados reais.
 * Rota de preview: /painel (não substitui /dashboard).
 * Contexto: o corretor NÃO usa mais Evolution. Sem espelho de conversa: o centro é a
 * FICHA + o REGISTRO manual do atendimento (reaproveita lead_notes). Contato com o
 * cliente pelo WhatsApp pessoal (waLink). Disparar é gated pelo admin; Pescar é shell.
 *
 * CSS: portado do mockup e ESCOPADO sob .cpv2 para não vazar no CSS global do app.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MessageCircle, Send, Fish, Moon, ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsForDashboard, updateLeadStatus, setLeadNegotiating, registerContactAttempt, undoContactAttempt, setLeadReturnDate } from "@/integrations/supabase/leads";
import { fetchLeadNotes, addLeadNote, waLink } from "@/integrations/supabase/atender";
import { DisparoCorretor } from "@/components/broker/DisparoCorretor";
import MetaCascata from "@/components/manager-v10/MetaCascata";
import type { Lead, LeadStatus, LostReason } from "@/types/lead";
import { TIPO_TRABALHO_LABEL, LOST_REASON_LABEL } from "@/types/lead";
import { useUnidadesFecha } from "@/hooks/useEstrategia";
import { empresa } from "@/lib/empresa";
import AgendarVisita from "@/components/broker/AgendarVisita";
import MetaMes from "@/components/painel-corretor/MetaMes";
import { mascarar, formatarFone, comArtigo, quandoISO, dataCurta as dataCurtaSP, horaSP } from "@/components/painel-corretor/util";

// ── stages do funil (iguais ao Atender atual) ───────────────────────────────
const STAGES: [LeadStatus, string][] = [
  ["NEW", "Novo"], ["IN_PROGRESS", "Atend."], ["NEGOTIATING", "Negoc."],
  ["VISIT_SCHEDULED", "Visita"], ["VISITA_REALIZADA", "Veio"], ["DOCS_REQUESTED", "Docs"], ["CONCLUDED", "Venda"],
];

// Motivos de descarte (mesma lista do Atender). Sai da fila como ABANDONED + lost_reason.
const DISCARD_REASONS: NonNullable<LostReason>[] = [
  "SEM_PERFIL", "NUMERO_ERRADO", "DESISTIU", "SEM_RETORNO", "CLIENTE_BLOQUEOU", "JA_COMPROU",
  "RENDA_FORA_FAIXA", "JA_TEM_IMOVEL", "JA_USOU_PROGRAMA", "RESTRICAO_CPF",
  "NAO_COMPARECEU", "FOI_CONCORRENTE", "LOCALIZACAO",
];

// ── RÉGUA / ANDAMENTO (17/10) ──────────────────────────────────────────────
// Régua só para pescados a partir de hoje; toques no dia da pesca, no seguinte, no 3º e no 7º dia.
// Um toque por dia (dias distintos com tentativa). Nesta etapa nada sai do corretor sozinho.
const REGUA_DESDE = "2026-10-17";
const OFFS_REGUA = [0, 1, 3, 7];
const PREFIXO_TENTATIVA = "Tentativa de contato";
const diaSP = (d: string | number | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const somaDias = (dia: string, n: number) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const fmtDia = (dia: string) => { const d = new Date(dia + "T12:00:00Z"); return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).replace(".", ""); };
const ehTentativa = (txt: string) => txt.startsWith(PREFIXO_TENTATIVA);
// O promote do Pescar grava last_lead_response_at = criação; só conta resposta depois disso.
const respostaReal = (l: Lead) => !!l.lastLeadResponseAt &&
  !(l.source === "cold_pool" && Math.abs(new Date(l.lastLeadResponseAt).getTime() - new Date(l.createdAt).getTime()) < 120_000);
const RESPONDEU_STATUS = new Set(["NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"]);

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const firstName = (name: string) => (name || "").trim().split(/\s+/)[0] || "cliente";
// Renda vem crua do formulário do Facebook (ex.: "r$_1.621,00_a_r$_4.700,00").
// Limpa underscores e normaliza "r$" → "R$" para exibição.
const fmtRenda = (v?: string | null) => {
  if (!v) return "—";
  return String(v).replace(/_/g, " ").replace(/r\$/gi, "R$").replace(/\s+/g, " ").trim();
};
const rendaNum = (l?: Lead | null) => {
  if (!l?.rendaDeclarada) return 0;
  const digits = String(l.rendaDeclarada).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

// Limpa o nome da região do pool: tira nome de equipe/prefixo de campanha e
// expande códigos de zona. Ex.: "EQ_DATTI_ZS" → "Zona Sul", "GIORGE_JAGUARE" → "Jaguare".
// (Carrão/Jaguaré são também bairros — não entram na lista de equipes.)
// tokens de equipe/campanha a remover (não são região)
const LIXO_TOKENS = new Set([
  "EQ", "CR", "DISPARO", "FEIRAO", "OFERTA", "ATIVA", "FACEBOOK", "MCMV",
  "DATTI", "DUDU", "DUDALINA", "GIORGE", "GIORGINA", "LILIANE", "LILI", "JAPA",
  "BACANA", "LUCIENE", "NOBILE", "ULLY", "ULLLY", "KENOBI", "JORDAN", "ODALYS",
  "AMSTERDA", "FAVORITA", "CAR", "NEO",
]);
const ZONA: Record<string, string> = { ZS: "Zona Sul", ZO: "Zona Oeste", ZN: "Zona Norte", ZL: "Zona Leste" };
function limparRegiao(raw?: string | null): string {
  if (!raw || !raw.trim() || /sem.?[aá]rea/i.test(raw)) return "Sem área";
  let toks = raw.trim().toUpperCase().split(/[_\-\s]+/).filter(Boolean).filter((t) => !LIXO_TOKENS.has(t));
  if (!toks.length) return "Geral";
  const parts = toks.map((t) => ZONA[t] || t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
  let label = parts.join(" ");
  // tags que são telefone/número ou genéricas → agrupa em "Geral"
  if (/^\d/.test(label) || /qtos?|qto/i.test(label)) return "Geral";
  return label;
}

// ── simulador MCMV (ESTIMATIVA client-side; não é cálculo oficial da Caixa) ──
function simular(renda: number, fgts: number) {
  const faixa = renda <= 2640 ? 1 : renda <= 4400 ? 2 : 3;
  // subsídio estimado: decresce conforme a renda sobe (teto ~55k faixa 1)
  const subsidioBase = faixa === 1 ? 55000 : faixa === 2 ? 34000 : 12000;
  const subsidio = Math.max(0, Math.round((subsidioBase * (1 - Math.min(1, (renda - 1800) / 6200))) / 100) * 100);
  // parcela: comprometimento ~27% da renda, teto plausível
  const parcela = Math.max(300, Math.round((renda * 0.27) / 10) * 10);
  return { faixa, subsidio, parcela };
}

const CorretorPainel = () => {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<"atender" | "disparar" | "pescar">("atender");
  const [filter, setFilter] = useState<"prio" | "pescados" | "visita" | "todos">("prio");
  // ?lead=<id> vem do painel novo ("Simulador e Fecha a Conta")
  const [selId, setSelId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("lead"));
  const [mobileDetail, setMobileDetail] = useState(() => !!new URLSearchParams(window.location.search).get("lead")); // celular: lista vs ficha
  const [tool, setTool] = useState<"sim" | "doc" | "msg">("sim");
  const [noteDraft, setNoteDraft] = useState("");
  const [caixaOpen, setCaixaOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  // 30/10: número escondido até o toque em WhatsApp/Ligar e "Como foi?" na volta (igual ao painel do celular)
  const [revelados, setRevelados] = useState<Set<string>>(new Set());
  const [como, setComo] = useState<{ id: string; nome: string; status: string; canal: string } | null>(null);
  const [comoOut, setComoOut] = useState("Conversamos");
  const [comoQ, setComoQ] = useState("Amanhã 10h");
  const voltarDe = useRef<{ id: string; nome: string; status: string; canal: string } | null>(null);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && voltarDe.current) { setComo(voltarDe.current); setComoOut("Conversamos"); setComoQ("Amanhã 10h"); voltarDe.current = null; } };
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", vis);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
  }, []);

  // ── LEADS REAIS ───────────────────────────────────────────────────────────
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["painelLeads"], queryFn: fetchLeadsForDashboard, refetchInterval: 30000, enabled: !!user,
  });

  const counts = useMemo(() => ({
    prio: leads.filter((l) => l.leadTemperature === "quente" || l.status === "NEW" || l.status === "IN_PROGRESS").length,
    pescados: leads.filter((l) => l.source === "cold_pool").length,
    visita: leads.filter((l) => l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA").length,
    todos: leads.length,
  }), [leads]);

  const rows = useMemo(() => {
    let r = leads;
    if (filter === "prio") r = leads.filter((l) => l.leadTemperature === "quente" || l.status === "NEW" || l.status === "IN_PROGRESS" || l.status === "NEGOTIATING");
    else if (filter === "pescados") r = leads.filter((l) => l.source === "cold_pool");
    else if (filter === "visita") r = leads.filter((l) => l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA");
    // "Cliente esperando" sempre no topo
    const esp = (l: Lead) => respostaReal(l) && (!l.lastBrokerWhatsappAt || new Date(l.lastLeadResponseAt) > new Date(l.lastBrokerWhatsappAt));
    return [...r.filter(esp), ...r.filter((l) => !esp(l))];
  }, [leads, filter]);

  // Notas que alimentam a régua (tentativas) e o andamento (última conversa) — uma consulta para a lista toda
  const idsRegua = useMemo(() => leads
    .filter((l) => (l.source === "cold_pool" && diaSP(l.createdAt) >= REGUA_DESDE) || l.status === "NEGOTIATING")
    .slice(0, 300).map((l) => l.id), [leads]);
  const { data: notasRegua = [] } = useQuery<{ lead_id: string; content: string; created_at: string }[]>({
    queryKey: ["painelNotasRegua", idsRegua.join(",")], enabled: idsRegua.length > 0, refetchInterval: 60000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 45 * 864e5).toISOString();
      const { data } = await supabase.from("lead_notes").select("lead_id, content, created_at").in("lead_id", idsRegua).gte("created_at", desde);
      return (data as any[]) || [];
    },
  });
  const porLead = useMemo(() => {
    const m = new Map<string, { dias: Set<string>; ultConversa: string | null }>();
    for (const n of notasRegua) {
      const cur = m.get(n.lead_id) || { dias: new Set<string>(), ultConversa: null };
      if (ehTentativa(n.content)) cur.dias.add(diaSP(n.created_at));
      else if (!cur.ultConversa || n.created_at > cur.ultConversa) cur.ultConversa = n.created_at;
      m.set(n.lead_id, cur);
    }
    return m;
  }, [notasRegua]);

  const esperando = (l: Lead) => respostaReal(l) && (!l.lastBrokerWhatsappAt || new Date(l.lastLeadResponseAt) > new Date(l.lastBrokerWhatsappAt));

  // Régua do pescado (antes de responder). null = fora da régua.
  const reguaDe = (l: Lead) => {
    if (l.source !== "cold_pool" || diaSP(l.createdAt) < REGUA_DESDE) return null;
    if (respostaReal(l) || RESPONDEU_STATUS.has(l.status) || l.status === "ABANDONED") return null;
    const hoje = diaSP(Date.now()); const pesca = diaSP(l.createdAt);
    const dias = [...(porLead.get(l.id)?.dias ?? new Set<string>())].filter((d) => d >= pesca);
    const feitos = Math.min(4, dias.length);
    const tocouHoje = dias.includes(hoje);
    const d = diasEntre(pesca, hoje);
    if (feitos >= 4) {
      const ult = dias.sort().slice(-1)[0];
      const limite = [somaDias(ult, 3), somaDias(pesca, 15)].sort()[0];
      return { feitos, atrasado: false, tipo: "completa" as const, badge: "Régua completa", txt: `${l.contactAttempts || feitos} tentativas · fica com você se tentar de novo até ${fmtDia(limite)}` };
    }
    const devido = OFFS_REGUA[feitos];
    if (tocouHoje || d < devido) {
      const prox = OFFS_REGUA[feitos];
      return { feitos, atrasado: false, tipo: "emdia" as const, badge: "Em dia", txt: `Em dia · ${feitos + 1}º toque ${prox <= d ? "amanhã" : "em " + fmtDia(somaDias(pesca, prox))}` };
    }
    if (d === devido) return { feitos, atrasado: false, tipo: "hoje" as const, badge: `${feitos + 1}º toque hoje`, txt: `Faça o ${feitos + 1}º toque hoje` };
    // a regra do servidor (00:10) devolve quem passou o dia do toque e o seguinte sem tentativa
    return { feitos, atrasado: true, tipo: "atrasado" as const, badge: "Atrasado · volta hoje à noite", txt: `${feitos + 1}º toque atrasado · faça hoje ou o lead volta pro pool à meia-noite` };
  };

  // Andamento depois que o cliente respondeu (Negociando). null = não se aplica.
  const andamentoDe = (l: Lead) => {
    if (l.status !== "NEGOTIATING") return null;
    const agora = Date.now();
    const ret = l.nextActionDate ? new Date(l.nextActionDate).getTime() : null;
    const retDia = l.nextActionDate ? diaSP(l.nextActionDate) : null;
    const hoje = diaSP(agora);
    if (retDia && retDia > hoje) return { nivel: "pausa" as const, dias: 0, badge: `Retorno ${retDia.slice(8, 10)}/${retDia.slice(5, 7)}`, txt: `Retorno combinado em ${fmtDia(retDia)} · contagem pausada até lá` };
    if (retDia && retDia === hoje) return { nivel: "laranja" as const, dias: 0, badge: "Retornar hoje", txt: "Hoje é o dia do retorno combinado" };
    const marcos = [l.negotiatingSince, respostaReal(l) ? l.lastLeadResponseAt : null, porLead.get(l.id)?.ultConversa ?? null, ret ? new Date(ret).toISOString() : null]
      .filter(Boolean).map((x) => new Date(x as string).getTime());
    const base = marcos.length ? Math.max(...marcos) : new Date(l.createdAt).getTime();
    const dias = Math.floor((agora - base) / 864e5);
    if (dias >= 15) return { nivel: "vermelho" as const, dias, badge: `Parado há ${dias} dias`, txt: `Parado há ${dias} dias · seu gerente decide se fica com você, vai para outro corretor ou é descartado` };
    if (dias >= 7) return { nivel: "vermelho" as const, dias, badge: `Parado há ${dias} dias`, txt: `Parado há ${dias} dias · seu gerente é avisado. Marque a visita, registre a conversa ou combine um retorno` };
    if (dias >= 3) return { nivel: "laranja" as const, dias, badge: `Sem avanço há ${dias} dias`, txt: `Sem avanço há ${dias} dias · marque a visita ou registre a conversa` };
    return { nivel: "ok" as const, dias, badge: "Negociando", txt: dias === 0 ? "Negociando · último avanço hoje" : `Negociando · último avanço há ${dias} dia${dias > 1 ? "s" : ""}` };
  };

  const sel = useMemo(() => leads.find((l) => l.id === selId) || rows[0] || null, [leads, rows, selId]);
  const ci = sel ? STAGES.findIndex(([k]) => k === sel.status) : -1;

  // ── REGISTRO (lead_notes reais) ─────────────────────────────────────────────
  const { data: notes = [] } = useQuery({
    queryKey: ["painelNotes", sel?.id], queryFn: () => fetchLeadNotes(sel!.id), enabled: !!sel?.id,
  });

  const saveNote = async () => {
    if (!sel || !user || !noteDraft.trim()) return;
    try {
      await addLeadNote(sel.id, user.id, noteDraft.trim());
      // anotar a conversa = o corretor falou com o cliente (conta como contato nos painéis do gestor)
      const agora = new Date().toISOString();
      await supabase.from("leads").update({ last_broker_whatsapp_at: agora, last_interaction_at: agora }).eq("id", sel.id);
      if (sel.status === "NEW") await updateLeadStatus(sel.id, "IN_PROGRESS").catch(() => {});
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["painelNotes", sel.id] });
      toast.success("Registro salvo");
    } catch { toast.error("Não consegui salvar o registro"); }
  };

  const advance = async (status: LeadStatus) => {
    if (!sel) return;
    try {
      if (status === "NEGOTIATING") await setLeadNegotiating(sel.id);
      else await updateLeadStatus(sel.id, status);
      const rotulo = STAGES.find(([k]) => k === status)?.[1] ?? status;
      if (user) await addLeadNote(sel.id, user.id, `Fase · ${rotulo}`).catch(() => {});
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      qc.invalidateQueries({ queryKey: ["painelNotes", sel.id] });
      qc.invalidateQueries({ queryKey: ["painelNotasRegua"] });
      toast.success("Status atualizado");
    } catch { toast.error("Não consegui atualizar o status"); }
  };

  // ── TENTATIVAS ─────────────────────────────────────────────────────────────
  const registrarTentativa = async (origem: string) => {
    if (!sel || !user) return;
    const lead = sel;
    try {
      const antesHoje = porLead.get(lead.id)?.dias.has(diaSP(Date.now())) ?? false;
      const regua = reguaDe(lead);
      await registerContactAttempt(lead.id);
      await addLeadNote(lead.id, user.id, `${PREFIXO_TENTATIVA} · ${origem}`);
      if (lead.status === "NEW") await updateLeadStatus(lead.id, "IN_PROGRESS").catch(() => {});
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      qc.invalidateQueries({ queryKey: ["painelNotes", lead.id] });
      qc.invalidateQueries({ queryKey: ["painelNotasRegua"] });
      toast.success(regua && antesHoje
        ? "Tentativa registrada. A régua conta um toque por dia; esta fica no histórico."
        : regua ? "Tentativa registrada · a régua avançou." : "Tentativa registrada.",
        { duration: 8000, action: { label: "Desfazer", onClick: () => desfazerTentativa(lead.id) } });
    } catch { toast.error("Não consegui registrar a tentativa"); }
  };
  const desfazerTentativa = async (leadId: string, noteId?: string) => {
    try {
      let alvo = noteId;
      if (!alvo) {
        const { data } = await supabase.from("lead_notes").select("id, created_at").eq("lead_id", leadId)
          .like("content", `${PREFIXO_TENTATIVA}%`).order("created_at", { ascending: false }).limit(1);
        const n = (data as any[])?.[0];
        if (!n || Date.now() - new Date(n.created_at).getTime() > 10 * 60_000) { toast.error("Só dá para desfazer nos primeiros 10 minutos."); return; }
        alvo = n.id;
      }
      await supabase.from("lead_notes").delete().eq("id", alvo);
      await undoContactAttempt(leadId);
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      qc.invalidateQueries({ queryKey: ["painelNotes", leadId] });
      qc.invalidateQueries({ queryKey: ["painelNotasRegua"] });
      toast.info("Tentativa desfeita.");
    } catch { toast.error("Não consegui desfazer"); }
  };
  const combinarRetorno = async (dia: string | null) => {
    if (!sel || !user) return;
    try {
      await setLeadReturnDate(sel.id, dia ? new Date(dia + "T12:00:00-03:00").toISOString() : null);
      if (dia) await addLeadNote(sel.id, user.id, `Combinado retorno em ${dia.slice(8, 10)}/${dia.slice(5, 7)}`).catch(() => {});
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      qc.invalidateQueries({ queryKey: ["painelNotes", sel.id] });
      toast.success(dia ? "Retorno combinado. A contagem fica pausada até lá." : "Retorno tirado.");
    } catch { toast.error("Não consegui salvar o retorno"); }
  };
  const chamarCom = (canal: "WhatsApp" | "Ligação") => {
    if (!sel) return;
    setRevelados((s) => new Set(s).add(sel.id));
    voltarDe.current = { id: sel.id, nome: sel.name, status: sel.status, canal };
    registrarTentativa(canal);
  };
  const salvarComo = async () => {
    if (!como || !user) return;
    try {
      if (comoOut === "Número errado") {
        await updateLeadStatus(como.id, "ABANDONED", null, "NUMERO_ERRADO");
        toast.success(`${como.nome} descartado · número errado`); setSelId(null);
      } else {
        if (comoOut === "Conversamos") {
          await addLeadNote(como.id, user.id, `Conversamos · ${como.canal}`);
          const agora = new Date().toISOString();
          await supabase.from("leads").update({ last_broker_whatsapp_at: agora, last_interaction_at: agora }).eq("id", como.id);
          if (["NEW", "IN_PROGRESS", "FOLLOW_UP_AUTO", "REACTIVATED"].includes(como.status)) await setLeadNegotiating(como.id).catch(() => {});
        }
        if (comoQ === "Agendar visita") { setSelId(como.id); setComo(null); setAgendarOpen(true); qc.invalidateQueries({ queryKey: ["painelLeads"] }); return; }
        const iso = quandoISO(comoQ);
        await setLeadReturnDate(como.id, iso);
        await addLeadNote(como.id, user.id, `Combinado retorno em ${dataCurtaSP(iso)} ${horaSP(iso)}`).catch(() => {});
        toast.success(`Registrado: ${comoOut.toLowerCase()} · próximo passo ${comoQ.toLowerCase()}`);
      }
      setComo(null);
      ["painelLeads", "painelNotes", "painelNotasRegua", "pcTrilha"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch { toast.error("Não consegui registrar. Tente de novo."); }
  };
  const focarNota = () => { const el = document.getElementById("cp-nota"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLInputElement | null)?.focus(); };

  const discard = async (reason: NonNullable<LostReason>) => {
    if (!sel) return;
    try {
      await updateLeadStatus(sel.id, "ABANDONED", null, reason);
      toast.success(`${sel.name} descartado · ${LOST_REASON_LABEL[reason]}`);
      setDiscardOpen(false); setSelId(null); setMobileDetail(false);
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
    } catch { toast.error("Não consegui descartar o lead"); }
  };

  // ── JARVIS no painel: "o que fazer agora" a partir dos leads do corretor ─────
  const jarvis = useMemo(() => {
    const now = Date.now();
    const h = (iso?: string | null) => (iso ? (now - new Date(iso).getTime()) / 3.6e6 : Infinity);
    const items: { id: string; u: number; icon: string; txt: string }[] = [];
    for (const l of leads) {
      if (l.status === "CONCLUDED" || l.status === "ABANDONED") continue;
      const nome = firstName(l.name);
      const respondeu = respostaReal(l) && (!l.lastBrokerWhatsappAt || new Date(l.lastLeadResponseAt) > new Date(l.lastBrokerWhatsappAt));
      const rg = reguaDe(l); const an = andamentoDe(l);
      if (respondeu) items.push({ id: l.id, u: 100, icon: "💬", txt: `${nome} respondeu e está esperando você` });
      else if (rg?.atrasado) items.push({ id: l.id, u: 88, icon: "⏰", txt: `Faça o ${rg.feitos + 1}º toque em ${nome} (atrasado)` });
      else if (an && an.nivel === "vermelho") items.push({ id: l.id, u: 86, icon: "🛑", txt: `${nome} está parado há ${an.dias} dias` });
      else if (an && an.badge === "Retornar hoje") items.push({ id: l.id, u: 85, icon: "📞", txt: `Hoje é o retorno combinado com ${nome}` });
      else if (an && an.nivel === "laranja") items.push({ id: l.id, u: 75, icon: "⏳", txt: `${nome} está sem avanço há ${an.dias} dias` });
      else if (rg?.tipo === "hoje") items.push({ id: l.id, u: 65, icon: "🎣", txt: `Faça o ${rg.feitos + 1}º toque em ${nome} hoje` });
      else if (l.leadTemperature === "quente" && h(l.lastInteractionAt) >= 2) items.push({ id: l.id, u: 90, icon: "🔥", txt: `${nome} está quente e parado há ${Math.round(h(l.lastInteractionAt))}h` });
      else if (l.status === "VISIT_SCHEDULED") items.push({ id: l.id, u: 80, icon: "📅", txt: `Confirme a visita de ${nome}` });
      else if (l.status === "DOCS_REQUESTED") items.push({ id: l.id, u: 70, icon: "📄", txt: `Cobre os documentos de ${nome}` });
      else if (l.status === "NEW" && (l.contactAttempts || 0) === 0) items.push({ id: l.id, u: 60, icon: "🆕", txt: `${nome} é novo — faça o 1º contato` });
    }
    return items.sort((a, b) => b.u - a.u);
  }, [leads, porLead]); // eslint-disable-line

  // ── SIMULADOR (sliders) ─────────────────────────────────────────────────────
  const [rRenda, setRRenda] = useState(3600);
  const [rFgts, setRFgts] = useState(14000);
  const [rDep, setRDep] = useState(true);
  useEffect(() => { if (sel) { setRRenda(rendaNum(sel) || 3600); } }, [sel?.id]); // eslint-disable-line
  const sim = simular(rRenda, rFgts);
  // Fecha a Conta REAL: unidades disponíveis do Junix + tabela da Caixa.
  const { data: fecha, isLoading: fechaLoading } = useUnidadesFecha(rRenda, rDep, !!sel);
  const fechaInfo = fecha?.[0];

  // ── DISPARAR: liberado quando o corretor tem um NÚMERO OFICIAL atrelado a ele ──
  // (whatsapp_config.owner_id === corretor). O gerente/super atrela na aba "Atrelar
  // número" do WPP Oficial, logo após cadastrar a WABA. Sem número → tela de bloqueio.
  // Disparo é liberado pelo GESTOR (profiles.disparo_enabled + cota) e sai pelo
  // NÚMERO do gestor (whatsapp_config.owner_id = manager). Sem os dois, bloqueado.
  const { data: dispInfo = null } = useQuery<any>({
    queryKey: ["dispInfo", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles")
        .select("disparo_enabled, disparo_cota_diaria, manager_id, first_name").eq("id", user!.id).maybeSingle();
      if (!prof) return { enabled: false, cota: 0, numero: null, managerId: null, brokerNome: null };
      let numero = null;
      if (prof.manager_id) {
        const { data } = await supabase.from("whatsapp_config")
          .select("id, label, display_number, waba_id").eq("owner_id", prof.manager_id).eq("is_active", true).limit(1);
        numero = data?.[0] || null;
      }
      return { enabled: !!prof.disparo_enabled, cota: prof.disparo_cota_diaria || 0, numero, managerId: prof.manager_id, brokerNome: prof.first_name };
    },
  });
  const dispEnabled = !!(dispInfo?.enabled && dispInfo?.numero);

  // ── REGIÃO: mapa campanha → região das filas (distribution_queues.match_value → region) ──
  const { data: regionByCampaign = {} } = useQuery<Record<string, string>>({
    queryKey: ["queueRegions"],
    queryFn: async () => {
      const { data } = await supabase.from("distribution_queues").select("match_value, region").not("region", "is", null);
      const m: Record<string, string> = {};
      (data || []).forEach((q: any) => { if (q.match_value && q.region) m[q.match_value] = q.region; });
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const regiaoDe = (l?: Lead | null) => l?.regiaoInteresse || (l?.fbCampaign ? regionByCampaign[l.fbCampaign] : "") || "";

  // ── ETIQUETAS (persistidas em lead_etiquetas) ───────────────────────────────
  const { data: etiquetasDB = [] } = useQuery<string[]>({
    queryKey: ["etiquetas", sel?.id],
    enabled: !!sel?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lead_etiquetas").select("etiqueta").eq("lead_id", sel!.id);
      return (data || []).map((r: any) => r.etiqueta);
    },
  });
  const hasTag = (k: string) => etiquetasDB.includes(k);
  const toggleTag = async (k: string) => {
    if (!sel) return;
    try {
      if (etiquetasDB.includes(k)) await supabase.from("lead_etiquetas").delete().eq("lead_id", sel.id).eq("etiqueta", k);
      else await supabase.from("lead_etiquetas").insert({ lead_id: sel.id, etiqueta: k, broker_id: user?.id });
      qc.invalidateQueries({ queryKey: ["etiquetas", sel.id] });
    } catch { toast.error("Não consegui salvar a etiqueta"); }
  };

  // ── DOCUMENTOS (Pasta, persistidos em lead_documentos) ──────────────────────
  const DOCS = [
    { key: "rg",       icon: "🪪", title: "RG / CNH" },
    { key: "fgts",     icon: "🏦", title: "Extrato FGTS" },
    { key: "holerite", icon: "📄", title: "Holerite" },
    { key: "endereco", icon: "🏠", title: "Comprovante de endereço" },
  ];
  const { data: docsDB = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["documentos", sel?.id],
    enabled: !!sel?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lead_documentos").select("documento, entregue").eq("lead_id", sel!.id);
      const m: Record<string, boolean> = {};
      (data || []).forEach((r: any) => { m[r.documento] = r.entregue; });
      return m;
    },
  });
  const toggleDoc = async (key: string) => {
    if (!sel) return;
    try {
      await supabase.from("lead_documentos").upsert(
        { lead_id: sel.id, documento: key, entregue: !docsDB[key], broker_id: user?.id, updated_at: new Date().toISOString() },
        { onConflict: "lead_id,documento" },
      );
      qc.invalidateQueries({ queryKey: ["documentos", sel.id] });
    } catch { toast.error("Não consegui salvar o documento"); }
  };
  const docsCount = DOCS.filter((d) => docsDB[d.key]).length;

  // ── PESCAR (pool cold_contacts): escolha por REGIÃO, 50/dia (Junior, 15/10), devolve em 48h ──
  const [regiaoSel, setRegiaoSel] = useState<string>(""); // "" = todas as regiões
  const { data: areasRaw = [] } = useQuery<{ tag: string; n: number }[]>({
    queryKey: ["poolAreas"], enabled: mode === "pescar", staleTime: 60000,
    queryFn: async () => { const { data } = await supabase.rpc("pool_areas"); return (data as any) || []; },
  });
  const regioes = useMemo(() => {
    const m = new Map<string, { label: string; count: number; tags: string[] }>();
    for (const a of areasRaw) {
      const label = limparRegiao(a.tag);
      const cur = m.get(label) || { label, count: 0, tags: [] };
      cur.count += Number(a.n) || 0; cur.tags.push(a.tag); m.set(label, cur);
    }
    return [...m.values()].sort((x, y) => y.count - x.count);
  }, [areasRaw]);
  const regiaoAtual = regioes.find((r) => r.label === regiaoSel) || null;
  const totalPool = regioes.reduce((s, r) => s + r.count, 0);

  const { data: pescaHoje = 0 } = useQuery<number>({
    queryKey: ["pescaHoje"], enabled: mode === "pescar" && !!user, refetchInterval: 20000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await supabase.from("cold_contacts").select("id", { count: "exact", head: true }).eq("claimed_by", user!.id).gte("claimed_at", since);
      return count || 0;
    },
  });

  // CARROSSEL: um candidato por vez (não pega até "Pegar"). Passar = skip (não volta 7d).
  const [fila, setFila] = useState<any[]>([]);
  const [carregandoFila, setCarregandoFila] = useState(false);
  const [busyCard, setBusyCard] = useState(false);
  const carregarFila = async () => {
    if (!user) return;
    setCarregandoFila(true);
    try {
      const { data: skips } = await supabase.from("cold_skip").select("contact_id").eq("broker_id", user.id).gte("skipped_at", new Date(Date.now() - 7 * 864e5).toISOString());
      const skipIds = new Set((skips || []).map((s: any) => s.contact_id));
      // Busca uma faixa maior e EMBARALHA para cada corretor: antes todos da mesma região viam os mesmos
      // 60 contatos na mesma ordem e disputavam o mesmo lead, um por vez (queixa do time da Monalisa, 17/10).
      // só contato da empresa toda (sem dono) ou de lista da própria cadeia (gerente/super/diretor dele) — Base de contatos, 20/10
      const { data: acima } = await (supabase as any).rpc("ids_acima", { p: user.id });
      const cadeia = ((acima ?? []) as any[]).map((r) => (typeof r === "string" ? r : r.ids_acima)).filter(Boolean);
      let q = supabase.from("cold_contacts").select("id, name, phone, tag").eq("status", "available").or(`previous_broker_id.is.null,previous_broker_id.neq.${user.id}`)
        .or(cadeia.length ? `dono_equipe.is.null,dono_equipe.in.(${cadeia.join(",")})` : "dono_equipe.is.null").order("created_at", { ascending: true }).limit(400);
      if (regiaoAtual) q = q.in("tag", regiaoAtual.tags);
      const { data } = await q;
      const lista = ((data as any[]) || []).filter((c) => !skipIds.has(c.id));
      for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
      setFila(lista.slice(0, 80));
    } finally { setCarregandoFila(false); }
  };
  useEffect(() => { if (mode === "pescar" && regioes.length) carregarFila(); }, [mode, regiaoSel, regioes.length]); // eslint-disable-line
  const atual = fila[0] || null;
  const proximoCard = () => { if (fila.length <= 1) carregarFila(); else setFila((f) => f.slice(1)); };
  // Se outro corretor pegar o contato que está na tela (ou um dos próximos), ele some sozinho.
  useEffect(() => {
    if (mode !== "pescar" || !fila.length) return;
    const t = setInterval(async () => {
      const ids = fila.slice(0, 8).map((c) => c.id);
      const { data } = await supabase.from("cold_contacts").select("id").in("id", ids).neq("status", "available");
      const foram = new Set(((data as any[]) || []).map((c) => c.id));
      if (foram.size) setFila((f) => { const r = f.filter((c) => !foram.has(c.id)); if (!r.length) carregarFila(); return r; });
    }, 15000);
    return () => clearInterval(t);
  }, [mode, fila]); // eslint-disable-line

  const pegar = async () => {
    if (!user || !atual || busyCard) return;
    setBusyCard(true);
    try {
      const { error: e1 } = await supabase.rpc("claim_cold_contact", { p_broker_id: user.id, p_contact_id: atual.id });
      if (e1) {
        // outro corretor pegou antes: sem erro, só passa para o próximo
        if (/already_claimed/i.test(String(e1.message || ""))) { toast.info("Outro corretor pegou esse agora. Aqui vai o próximo."); proximoCard(); return; }
        toast.error((e1 as any).details || e1.message || "Não consegui pegar."); return;
      }
      // Se o lead não for criado, não pode dizer "é seu": antes o erro era ignorado e o contato sumia (Fafa, 26/10).
      const { data: leadId, error: e2 } = await supabase.rpc("promote_cold_to_lead", { p_contact_id: atual.id });
      if (e2 || !leadId) {
        toast.error((e2 as any)?.details || (e2 as any)?.hint || e2?.message || "Não consegui criar o lead. Avise seu gerente.");
        qc.invalidateQueries({ queryKey: ["pescaHoje"] });
        return;
      }
      toast.success(`✅ ${firstName(atual.name || "Lead")} é seu! Já está nas suas fichas.`);
      qc.invalidateQueries({ queryKey: ["pescaHoje"] });
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      qc.invalidateQueries({ queryKey: ["poolAreas"] });
      proximoCard();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusyCard(false); }
  };
  const passar = async () => {
    if (!user || !atual || busyCard) return;
    setBusyCard(true);
    try { await supabase.rpc("skip_cold_contact", { p_broker_id: user.id, p_contact_id: atual.id }); }
    catch { /* segue */ }
    finally { proximoCard(); setBusyCard(false); }
  };

  const facts = sel ? [
    ["Renda Informada", fmtRenda(sel.rendaDeclarada)],
    ["Tipo de Trabalho", sel.tipoTrabalho ? TIPO_TRABALHO_LABEL[sel.tipoTrabalho] : "—"],
    ["Região de Interesse", regiaoDe(sel) || "—"],
    // lead de lista (gotejamento): o corretor não vê a origem, só a região (decisão do Junior, 20/10)
    ["Campanha / Origem", (sel.source as string) === "lista" ? (regiaoDe(sel) || "—") : (sel.campanhaNome || (sel.fbCampaign && !/^\d{10,}$/.test(sel.fbCampaign) ? sel.fbCampaign : "") || sel.product || sel.source || "—")],
  ] : [];
  // O que mais o cliente respondeu no formulário (o que busca, quando quer mudar…), fora o que já está acima.
  const outrasRespostas = Object.entries(sel?.formRespostas || {})
    .filter(([k]) => !/regi|bairro|zona|morar|cidade|localiza|renda|salari|ganha|trabalh|emprego|ocupa|profiss/i.test(k));

  const badgeFor = (l: Lead) => {
    if (esperando(l)) return { cls: "l-badge wait", txt: "Cliente esperando" };
    if (l.status === "VISIT_SCHEDULED") {
      const va = (l as any).visit_scheduled_at as string | null;
      return { cls: "l-badge", txt: va ? `Visita ${new Date(va).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}` : "Visita marcada" };
    }
    if (l.status === "VISITA_REALIZADA") return { cls: "l-badge", txt: "Compareceu" };
    if (l.status === "DOCS_REQUESTED") return { cls: "l-badge", txt: "Docs" };
    const an = andamentoDe(l);
    if (an) return { cls: `l-badge${an.nivel === "vermelho" ? " danger" : an.nivel === "laranja" ? " urgent" : ""}`, txt: an.badge };
    const rg = reguaDe(l);
    if (rg) return { cls: `l-badge${rg.atrasado ? " urgent" : ""}`, txt: rg.badge };
    if (l.leadTemperature === "quente") return { cls: "l-badge urgent", txt: "Quente" };
    if (respostaReal(l)) return { cls: "l-badge ready", txt: "Respondeu" };
    return { cls: "l-badge urgent", txt: "Falta retorno" };
  };

  return (
    <div className="cpv2">
      <style>{CSS}</style>
      <div className="app-frame">
        {/* RAIL / BOTTOM BAR */}
        <nav className="icon-rail" aria-label="Menu principal">
          <div className="rail-logo" title="Comandra">C</div>
          <div className="rail-nav">
            <button className={`rail-item${mode === "atender" ? " active" : ""}`} onClick={() => setMode("atender")} title="Atendimento">
              {counts.prio > 0 && <span className="rail-pip">{counts.prio}</span>}
              <MessageCircle size={22} /><span>Atender</span>
            </button>
            <button className={`rail-item${mode === "disparar" ? " active" : ""}`} onClick={() => setMode("disparar")} title="Disparador oficial">
              <Send size={22} /><span>Disparar</span>
            </button>
            <button className={`rail-item${mode === "pescar" ? " active" : ""}`} onClick={() => setMode("pescar")} title="Pescar leads">
              <Fish size={22} /><span>Pescar</span>
            </button>
          </div>
          <div className="rail-footer">
            <div className="ficha-pill"><span>Fichas</span><b>{counts.todos}</b></div>
            <button className="rail-btn" onClick={() => document.documentElement.classList.toggle("dark")} title="Tema"><Moon size={19} /></button>
            <button className="rail-btn" onClick={() => signOut()} title="Sair da conta"><LogOut size={19} /></button>
            <div className="rail-avatar">{initials((user as any)?.user_metadata?.name || (user as any)?.email || "Eu")}</div>
          </div>
        </nav>

        {/* ── MODO ATENDER ── */}
        {mode === "atender" && (
          <div className={`shell${mobileDetail ? " mobile-show-detail" : ""}`}>
            {/* Lista */}
            <aside className="sidebar">
              <div className="sidebar-head">
                <div className="sidebar-title-row">
                  <span className="sidebar-title">Atendimento</span>
                  <span className="roleta-tag">{counts.todos} fichas</span>
                </div>
                {/* meta do mês que o gerente definiu (some se não houver) */}
                <div style={{ margin: "8px 0" }}><MetaMes uid={user?.id || ""} /></div>
                <div className="filter-bar">
                  <button className={`f-pill${filter === "prio" ? " on" : ""}`} onClick={() => setFilter("prio")}>Prioridade ({counts.prio})</button>
                  <button className={`f-pill${filter === "pescados" ? " on" : ""}`} onClick={() => setFilter("pescados")}>🎣 Pescados ({counts.pescados})</button>
                  <button className={`f-pill${filter === "visita" ? " on" : ""}`} onClick={() => setFilter("visita")}>Visitas ({counts.visita})</button>
                  <button className={`f-pill${filter === "todos" ? " on" : ""}`} onClick={() => setFilter("todos")}>Todos ({counts.todos})</button>
                </div>
              </div>
              <div className="lead-list">
                {rows.map((l) => {
                  const b = badgeFor(l);
                  return (
                    <div key={l.id} className={`lead-row${sel?.id === l.id ? " selected" : ""}`} onClick={() => { setSelId(l.id); setMobileDetail(true); }}>
                      <div>
                        <div className="l-name">{l.name}{l.source === "cold_pool" && <span className="pescado-tag">🎣 Pescado</span>}</div>
                        <div className="l-meta">{[l.tipoTrabalho && TIPO_TRABALHO_LABEL[l.tipoTrabalho], fmtRenda(l.rendaDeclarada) !== "—" ? fmtRenda(l.rendaDeclarada) : null, regiaoDe(l) || null].filter(Boolean).join(" · ") || mascarar(l.phone)}</div>
                      </div>
                      <span className={b.cls}>{b.txt}</span>
                    </div>
                  );
                })}
                {!rows.length && <div style={{ padding: 40, textAlign: "center", color: "var(--faint)" }}>Nenhuma ficha aqui.</div>}
              </div>
            </aside>

            {/* Palco */}
            <main className="stage">
              <div className="stage-inner">
                {jarvis.length > 0 && (
                  <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent-border)", background: "var(--accent-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 14, color: "var(--accent)", marginBottom: 10 }}>
                      🤖 Comandra · o que fazer agora
                      <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 99, fontSize: 11, padding: "1px 7px", fontWeight: 800 }}>{jarvis.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {jarvis.slice(0, 3).map((j) => (
                        <button key={j.id} onClick={() => { setSelId(j.id); setMobileDetail(true); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", width: "100%" }}>
                          <span style={{ fontSize: 17 }}>{j.icon}</span>
                          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{j.txt}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>Ir →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sel ? (
                  <>
                    <div className="mobile-back-bar">
                      <button className="btn-back-list" onClick={() => setMobileDetail(false)}><ArrowLeft size={15} /> Voltar para a fila</button>
                      <span className="roleta-tag">{ci >= 0 ? STAGES[ci][1] : sel.status}</span>
                    </div>

                    {/* 1. Ficha */}
                    <div className="card">
                      <div className="lead-header">
                        <div>
                          <h1 className="lead-title">{sel.name}</h1>
                          <div className="lead-sub">{revelados.has(sel.id) ? formatarFone(sel.phone) : <>{mascarar(sel.phone)} <span style={{ fontSize: 11.5, color: "var(--faint)" }}>· o número aparece ao chamar</span></>}{sel.product ? <> • <span style={{ color: "var(--accent)", fontWeight: 600 }}>{sel.product}</span></> : null}</div>
                        </div>
                        <div className="contato-btns">
                          <a className="btn-primary" href={waLink(sel.phone)} target="_blank" rel="noreferrer" onClick={() => chamarCom("WhatsApp")}>🟢 Chamar no WhatsApp ↗</a>
                          <a className="btn-ghost btn-ligar" href={`tel:${(sel.phone || "").replace(/\D/g, "")}`} onClick={() => chamarCom("Ligação")}>📞 Ligar</a>
                        </div>
                      </div>
                      <div className="tent-row">
                        <span className="tent-lbl">Tentativas</span><b className="tent-n">{sel.contactAttempts || 0}</b>
                        <span className="tent-hint">o clique em WhatsApp ou Ligar já conta</span>
                      </div>
                      {(() => {
                        const rg = reguaDe(sel);
                        if (!rg) return null;
                        return (
                          <div className={`regua-line${rg.atrasado ? " late" : ""}`}>
                            <span className="regua-lbl">Régua</span>
                            <span className="regua-dots" aria-label={`${rg.feitos} de 4 toques`}>
                              {[0, 1, 2, 3].map((i) => <span key={i} className={`rd${i < rg.feitos ? " on" : i === rg.feitos && rg.atrasado ? " late" : ""}`} />)}
                            </span>
                            <span className="regua-txt">{rg.txt}</span>
                          </div>
                        );
                      })()}
                      {(() => {
                        const an = andamentoDe(sel);
                        if (!an) return null;
                        return (
                          <div className={`regua-line and-${an.nivel}`}>
                            <span className="regua-lbl">Andamento</span>
                            <span className="regua-txt">{an.txt}</span>
                            <span style={{ flex: 1 }} />
                            {an.nivel === "pausa" ? (
                              <button className="link-btn" onClick={() => combinarRetorno(null)}>tirar retorno</button>
                            ) : (
                              <label className="retorno-lbl">Combinado retorno em
                                <input type="date" min={somaDias(diaSP(Date.now()), 1)} onChange={(e) => e.target.value && combinarRetorno(e.target.value)} />
                              </label>
                            )}
                          </div>
                        );
                      })()}
                      <div className="lead-facts-grid">
                        {facts.map(([k, v]) => (
                          <div className="fact-cell" key={k}><span className="fact-lbl">{k}</span><span className="fact-val">{v}</span></div>
                        ))}
                        {outrasRespostas.map(([k, v]) => (
                          <div className="fact-cell" key={k}><span className="fact-lbl">{k}</span><span className="fact-val">{v}</span></div>
                        ))}
                      </div>
                      <div className="pipeline">
                        {STAGES.map(([k, lbl], i) => (
                          <div key={k} className={`pipe-step ro${i === ci ? " current" : i < ci ? " done" : ""}`}>{lbl}</div>
                        ))}
                      </div>
                      <button className="btn-discard" onClick={() => setDiscardOpen(true)}>🗑️ Descartar lead · sem interesse, número errado…</button>
                    </div>

                    {/* 2. Registro do atendimento (substitui o espelho de conversa) */}
                    <div className="card">
                      {(() => {
                        const tentar = () => registrarTentativa("Não respondeu ainda");
                        type B = [string, () => void, boolean];
                        const P: Record<string, { q: string; dica: string; b: B[] }> = {
                          NEW: { q: "Faça o primeiro contato", dica: "Chame no WhatsApp ou ligue. O clique já conta como tentativa.", b: [["Registrar tentativa", tentar, true], ["Respondeu", () => advance("NEGOTIATING"), false]] },
                          IN_PROGRESS: { q: "O cliente respondeu?", dica: "Respondeu: o lead sai da régua e é seu. Ainda não: registre a tentativa.", b: [["Respondeu", () => advance("NEGOTIATING"), true], ["Registrar tentativa", tentar, false]] },
                          NEGOTIATING: { q: "Marcou a visita?", dica: "Combine dia e hora. Se o cliente pediu para esperar, use \"Combinado retorno em\" lá em cima.", b: [["Agendar visita", () => setAgendarOpen(true), true], ["Registrar conversa", focarNota, false], ["Registrar tentativa", tentar, false]] },
                          VISIT_SCHEDULED: { q: "Ele veio à visita?", dica: "Depois da visita, peça os documentos no mesmo dia.", b: [["Compareceu", () => advance("VISITA_REALIZADA"), true], ["Não veio, remarcar", () => advance("NEGOTIATING"), false]] },
                          VISITA_REALIZADA: { q: "Pediu os documentos?", dica: "Marque o que já recebeu na aba Pasta, nas ferramentas abaixo.", b: [["Pedir documentos", () => advance("DOCS_REQUESTED"), true]] },
                          DOCS_REQUESTED: { q: "A pasta foi para a Caixa?", dica: "Quando a venda sair, marque aqui.", b: [["Venda feita", () => advance("CONCLUDED"), true]] },
                          CONCLUDED: { q: "Venda feita", dica: "Parabéns. O lead fica no seu histórico.", b: [] },
                        };
                        const p = P[sel.status] ?? P.IN_PROGRESS;
                        return (
                          <div className="proximo">
                            <span className="proximo-lbl">Próximo passo</span>
                            <div className="proximo-q">{p.q}</div>
                            <div className="proximo-dica">{p.dica}</div>
                            {p.b.length > 0 && (
                              <div className="proximo-btns">
                                {p.b.map(([t, fn, prim]) => <button key={t} className={prim ? "pb prim" : "pb"} onClick={fn}>{t}</button>)}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div className="action-prompt" style={{ marginTop: 14 }}>
                        <span className="prompt-label">Anotações</span>
                        <span className="prompt-hint">O que você conversou com o cliente (não é obrigatório)</span>
                      </div>
                      <div className="convo-log-area">
                        <div className="quick-tags">
                          <span className={`q-tag${hasTag("2dorms") ? " on" : ""}`} onClick={() => toggleTag("2dorms")}>{hasTag("2dorms") ? "✓" : "+"} Quer 2 dorms</span>
                          <span className={`q-tag${hasTag("fgts") ? " on" : ""}`} onClick={() => toggleTag("fgts")}>{hasTag("fgts") ? "✓" : "+"} Usa FGTS</span>
                          <span className={`q-tag${hasTag("renda") ? " on" : ""}`} onClick={() => toggleTag("renda")}>{hasTag("renda") ? "✓" : "+"} Compõe renda</span>
                          <span className={`q-tag${hasTag("spc") ? " on" : ""}`} onClick={() => toggleTag("spc")}>{hasTag("spc") ? "✓" : "+"} Restrição SPC</span>
                        </div>
                        <div className="note-input-row">
                          <input id="cp-nota" className="note-input" placeholder="Resumo do que conversaram…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNote()} />
                          <button className="btn-save-note" onClick={saveNote}>Salvar</button>
                        </div>
                        <div className="notes-history">
                          {notes.length ? notes.map((n) => (
                            <div className="note-line" key={n.id}>
                              <span className="note-time">{new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                              <span className={`note-tipo ${ehTentativa(n.content) ? "t" : n.content.startsWith("Fase · ") ? "f" : "c"}`}>{ehTentativa(n.content) ? "Tentativa" : n.content.startsWith("Fase · ") ? "Fase" : "Conversa"}</span>
                              <span style={{ flex: 1 }}>{ehTentativa(n.content) ? n.content.replace(`${PREFIXO_TENTATIVA} · `, "") : n.content.startsWith("Fase · ") ? n.content.slice(7) : n.content}</span>
                              {ehTentativa(n.content) && Date.now() - new Date(n.createdAt).getTime() < 10 * 60_000 && (
                                <button className="link-btn" onClick={() => desfazerTentativa(sel.id, n.id)}>desfazer</button>
                              )}
                            </div>
                          )) : <div className="note-line"><span style={{ color: "var(--faint)" }}>Nenhum registro ainda. Anote o que aconteceu para liberar o próximo lead.</span></div>}
                        </div>
                      </div>
                    </div>

                    {/* 3. Ferramentas */}
                    <div className="card">
                      <div className="tool-tabs">
                        <button className={`tool-tab${tool === "sim" ? " active" : ""}`} onClick={() => setTool("sim")}>🧮 Simulador + Projetos</button>
                        <button className={`tool-tab${tool === "doc" ? " active" : ""}`} onClick={() => setTool("doc")}>📁 Pasta ({docsCount}/{DOCS.length})</button>
                        <button className={`tool-tab${tool === "msg" ? " active" : ""}`} onClick={() => setTool("msg")}>💬 Mensagens</button>
                      </div>

                      {tool === "sim" && (
                        <div>
                          <div className="sim-grid">
                            <div className="field-box">
                              <div className="field-top"><span>Renda familiar (até 3)</span><span className="field-val">{brl(rRenda)}</span></div>
                              <input type="range" min={1800} max={8000} step={100} value={rRenda} onChange={(e) => setRRenda(+e.target.value)} />
                            </div>
                            <div className="field-box">
                              <div className="field-top"><span>Saldo FGTS</span><span className="field-val">{brl(rFgts)}</span></div>
                              <input type="range" min={0} max={60000} step={1000} value={rFgts} onChange={(e) => setRFgts(+e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, margin: "0 0 10px" }}>
                            <button className={`tool-tab${rDep ? " active" : ""}`} onClick={() => setRDep(true)}>Com dependente</button>
                            <button className={`tool-tab${!rDep ? " active" : ""}`} onClick={() => setRDep(false)}>Sem dependente</button>
                          </div>
                          <div className="kpi-strip">
                            <div><div className="kpi-label">Faixa</div><div className="kpi-num">{fechaInfo?.faixa ?? "—"}</div></div>
                            <div><div className="kpi-label">Caixa libera</div><div className="kpi-num">{fechaInfo ? brl(fechaInfo.financiamento) : "—"}</div></div>
                            <div><div className="kpi-label">Subsídio</div><div className="kpi-num" style={{ color: "var(--accent)" }}>{fechaInfo?.subsidio ? brl(fechaInfo.subsidio) : "—"}</div></div>
                          </div>
                          <div className="match-title"><span>🏢 Unidades que fecham a conta</span><span style={{ color: "var(--faint)", fontWeight: 600 }}>estoque{empresa().nome ? ` ${empresa().nome}` : ""} · estimativa planilha</span></div>
                          {fechaLoading ? (
                            <div style={{ color: "var(--muted)", padding: 12 }}>Buscando no estoque…</div>
                          ) : !fecha?.length ? (
                            <div style={{ color: "var(--muted)", padding: 12 }}>Sem unidades no estoque agora.</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
                              {fecha.map((u) => {
                                const semEntrada = u.entrada <= 0;
                                const cabeFgts = u.entrada <= rFgts;
                                const cor = semEntrada || cabeFgts ? "var(--accent)" : "var(--faint)";
                                const tag = semEntrada ? "sem entrada" : cabeFgts ? "cabe no FGTS" : "falta " + brl(u.entrada - rFgts);
                                return (
                                  <div key={u.cod_unidade} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "var(--card2, rgba(0,0,0,.04))" }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.empreendimento}</div>
                                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>un. {u.numero || "—"}{u.bloco ? " · " + u.bloco : ""}{u.dormitorios ? ` · ${u.dormitorios} dorm` : ""}{u.metragem ? ` · ${u.metragem}m²` : ""} · {brl(u.valor)}</div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                                      <div style={{ fontWeight: 800, fontSize: 13, color: cor }}>{semEntrada ? "sem entrada" : brl(u.entrada)}</div>
                                      <div style={{ fontSize: 10.5, color: cor, fontWeight: 600 }}>{tag}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="sim-actions" style={{ marginTop: 10 }}>
                            <a className="btn-primary" style={{ justifyContent: "center" }} href={sel && fecha?.[0] ? waLink(sel.phone, `Achei pra você: ${fecha[0].empreendimento}, ${brl(fecha[0].valor)}. Com sua renda a Caixa financia e ${fecha[0].entrada <= 0 ? "dá pra fechar sem entrada" : "a entrada fica ~" + brl(fecha[0].entrada)}. Quer ver?`) : "#"} target="_blank" rel="noreferrer">📲 Mandar a melhor opção no Whats</a>
                          </div>
                        </div>
                      )}

                      {tool === "doc" && (
                        <div className="docs-list">
                          {DOCS.map((d) => {
                            const ok = !!docsDB[d.key];
                            return (
                              <div className="doc-item" key={d.key} onClick={() => toggleDoc(d.key)} style={{ cursor: "pointer" }}>
                                <div className="doc-left"><span>{d.icon}</span><div><div className="doc-title">{d.title}</div><div className="doc-desc">{ok ? "Recebido ✓" : "Marcar quando receber"}</div></div></div>
                                <span className="doc-tag" style={ok ? { color: "var(--accent)", borderColor: "var(--accent)", fontWeight: 700 } : undefined}>{ok ? "✓ recebido" : "+ marcar"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {tool === "msg" && (
                        <div className="script-item">
                          <div className="script-text">"Oi {firstName(sel.name)}! Fiz sua simulação: com FGTS + subsídio de ~{brl(sim.subsidio)}, a parcela fica ~{brl(sim.parcela)}/mês. Quer que eu te mande o resumo?"</div>
                          <a className="btn-ghost" href={waLink(sel.phone, `Oi ${firstName(sel.name)}! Sua simulação: parcela ~${brl(sim.parcela)}/mês. Quer o resumo?`)} target="_blank" rel="noreferrer">Usar no Whats ↗</a>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>Selecione uma ficha na lista.</div>
                )}
              </div>
            </main>
          </div>
        )}

        {/* ── MODO DISPARAR ── */}
        {mode === "disparar" && (
          <div className="stage">
            <div className="disp-wrap">
              <div className="disp-top">
                <div>
                  <h1 className="lead-title">Disparar (API oficial Meta)</h1>
                  <p className="lead-sub">Reative leads da sua carteira pelo WhatsApp oficial com modelos Utility (R$ 0,035)</p>
                </div>
                <div className="disp-perm-bar">
                  <span className={`l-badge ${dispEnabled ? "ready" : "urgent"}`}>{dispEnabled ? `✓ Liberado · ${dispInfo.cota}/dia` : "🔒 Sem permissão do gestor"}</span>
                </div>
              </div>

              {!dispEnabled ? (
                <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
                  <h2 className="lead-title">Disparador oficial desabilitado para seu perfil</h2>
                  <p className="lead-sub" style={{ maxWidth: 480, margin: "8px auto 18px" }}>Seu gerente ainda não habilitou a cota de disparos para a sua conta. O disparo sai pelo número oficial da equipe.</p>
                  <button className="btn-primary" onClick={async () => {
                    if (!dispInfo?.managerId) { toast.error("Você não tem gerente definido — fale com o admin."); return; }
                    const { error } = await supabase.from("internal_notifications").insert({
                      to_id: dispInfo.managerId, from_id: user?.id, type: "DISPARO_LIBERACAO_PEDIDO",
                      message: `🙋 ${user?.email || "Um corretor"} pediu liberação para disparar. Libere em Disparar › Corretores.`,
                    });
                    if (error) { toast.error("Não consegui enviar o pedido."); return; }
                    toast.success("Pedido enviado ao seu gerente ✅");
                  }}>🙋 Pedir liberação ao gerente</button>
                </div>
              ) : (
                <DisparoCorretor
                  managerId={dispInfo.managerId}
                  configId={dispInfo.numero.id}
                  wabaId={dispInfo.numero.waba_id}
                  cota={dispInfo.cota}
                  brokerId={user!.id}
                  brokerNome={dispInfo.brokerNome}
                />
              )}
            </div>
          </div>
        )}

        {/* ── MODO PESCAR (shell fiel; ligação real pendente) ── */}
        {mode === "pescar" && (
          <div className="stage">
            <div className="stage-inner">
              <div className="card">
                <div className="lead-header">
                  <div>
                    <span className="l-badge urgent">🎣 Bolsa de oportunidades</span>
                    <h2 className="lead-title" style={{ marginTop: 6 }}>Pescar leads frios</h2>
                    <p className="lead-sub">Pegue leads do pool da equipe. Limitado a 50 leads por dia. Sem WhatsApp conectado obrigatório — você fala pelo seu WhatsApp pessoal.</p>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em", margin: "14px 0 6px" }}>Escolha a região do pool</div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <span className={`q-tag${!regiaoSel ? " on" : ""}`} onClick={() => setRegiaoSel("")}>Todas ({totalPool})</span>
                  {regioes.map((r) => (
                    <span key={r.label} className={`q-tag${regiaoSel === r.label ? " on" : ""}`} onClick={() => setRegiaoSel(r.label)}>{r.label} ({r.count})</span>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>Pescados hoje: <b style={{ color: "var(--accent)" }}>{pescaHoje}/50</b>{regiaoAtual ? <> · {regiaoAtual.label}: <b>{regiaoAtual.count}</b> no pool</> : null}</div>
              </div>

              {/* CARROSSEL: um nome por vez → Pegar ou Passar */}
              <div className="card" style={{ marginTop: 12 }}>
                {pescaHoje >= 50 ? (
                  <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--muted)" }}>
                    <div style={{ fontSize: 32 }}>✋</div>
                    <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8, color: "var(--text)" }}>Limite de 50 leads hoje atingido</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Trabalha os que você pegou e volta amanhã.</div>
                  </div>
                ) : carregandoFila && !atual ? (
                  <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Buscando leads…</div>
                ) : !atual ? (
                  <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--muted)" }}>
                    <div style={{ fontSize: 32 }}>🎣</div>
                    <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8, color: "var(--text)" }}>Acabaram os leads {regiaoAtual ? `em ${regiaoAtual.label}` : "no pool"}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Escolha outra região acima.</div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "12px 8px 4px" }}>
                    <div style={{ fontSize: 12, color: "var(--faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Próximo do pool</div>
                    <div style={{ fontSize: 26, fontWeight: 800, margin: "10px 0 2px", color: "var(--text)" }}>{atual.name || "Sem nome"}</div>
                    <div style={{ fontSize: 13.5, color: "var(--accent)", fontWeight: 700 }}>{limparRegiao(atual.tag)}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                      <button className="btn-ghost" style={{ flex: 1, height: 48, justifyContent: "center", fontSize: 15 }} disabled={busyCard} onClick={passar}>Passar ›</button>
                      <button className="btn-primary" style={{ flex: 2, height: 48, justifyContent: "center", fontSize: 15 }} disabled={busyCard} onClick={pegar}>🎣 Pegar — é meu</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL "espelho" (estimativa) */}
      <AnimatePresence>
        {caixaOpen && sel && (
          <motion.div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCaixaOpen(false); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            <motion.div className="caixa-sheet" initial={{ scale: reduce ? 1 : 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: reduce ? 1 : 0.96, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
              <div className="caixa-head"><div className="caixa-logo">🧮 SIMULAÇÃO (ESTIMATIVA)</div><span style={{ cursor: "pointer", fontWeight: 900 }} onClick={() => setCaixaOpen(false)}>✕</span></div>
              <div className="caixa-subbar">Pré-enquadramento MCMV — valores estimados</div>
              <div className="caixa-body">
                <div className="caixa-row"><span>Proponente:</span><b>{sel.name}</b></div>
                <div className="caixa-row"><span>Renda bruta:</span><b>{brl(rRenda)}</b></div>
                <div className="caixa-row"><span>Faixa:</span><b>Faixa {sim.faixa}</b></div>
                <div className="caixa-row"><span>Subsídio (est.):</span><b style={{ color: "#059669" }}>- {brl(sim.subsidio)}</b></div>
                <div className="caixa-row"><span>Saldo FGTS:</span><b style={{ color: "#059669" }}>- {brl(rFgts)}</b></div>
                <div className="caixa-highlight">
                  <div><div style={{ fontSize: 11, color: "#0369a1", fontWeight: 700 }}>PARCELA ESTIMADA</div><div style={{ fontSize: 19, fontWeight: 900, color: "#005ca9" }}>{brl(sim.parcela)} / mês</div></div>
                </div>
              </div>
              <div className="caixa-foot"><button className="btn-ghost" onClick={() => setCaixaOpen(false)}>Fechar</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL descartar (motivo obrigatório) */}
      <AnimatePresence>
        {agendarOpen && sel && user ? (
          <AgendarVisita key="agendar" leadId={sel.id} nome={sel.name} brokerId={user.id} onFechar={() => setAgendarOpen(false)}
            onFeito={async (resumo) => {
              setAgendarOpen(false);
              await addLeadNote(sel.id, user.id, `Fase · Visita marcada para ${resumo}`).catch(() => {});
              qc.invalidateQueries({ queryKey: ["painelLeads"] });
              qc.invalidateQueries({ queryKey: ["painelNotes", sel.id] });
              qc.invalidateQueries({ queryKey: ["painelNotasRegua"] });
              toast.success(`Visita marcada para ${resumo}. Ela já aparece na agenda da equipe.`);
            }} />
        ) : null}
        {discardOpen && sel && (
          <motion.div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDiscardOpen(false); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            <motion.div className="discard-sheet" initial={{ scale: reduce ? 1 : 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: reduce ? 1 : 0.96, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
              <div className="discard-head">
                <div className="discard-title">Descartar lead</div>
                <div className="discard-sub">{sel.name} — escolha o motivo</div>
              </div>
              <div className="discard-grid">
                {DISCARD_REASONS.map((r) => <button key={r} className="discard-reason" onClick={() => discard(r)}>{LOST_REASON_LABEL[r]}</button>)}
              </div>
              <div className="caixa-foot"><button className="btn-ghost" onClick={() => setDiscardOpen(false)}>Cancelar</button></div>
            </motion.div>
          </motion.div>
        )}
        {como && (
          <motion.div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setComo(null); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            <motion.div className="discard-sheet" role="dialog" aria-modal="true" aria-label="Como foi" initial={{ scale: reduce ? 1 : 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
              <div className="discard-head">
                <div className="discard-title">Como foi com {comArtigo(como.nome)}?</div>
                <div className="discard-sub">Dois toques e fica registrado. O contato já contou como tentativa.</div>
              </div>
              <div className="discard-grid">
                {[["✅", "Conversamos"], ["📵", "Não atendeu"], ["📭", "Caixa postal"], ["❌", "Número errado"]].map(([e, r]) => (
                  <button key={r} className="discard-reason" onClick={() => setComoOut(r)}
                    style={comoOut === r ? { borderColor: "#0d9488", background: "#f0fdfa", color: "#0f766e" } : undefined}>{e} {r}</button>))}
              </div>
              {comoOut !== "Número errado" && (
                <div style={{ padding: "0 20px 14px" }}>
                  <div className="discard-sub" style={{ marginBottom: 8 }}>E o próximo passo?</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["Hoje 18h", "Amanhã 10h", "Em 2 dias", "Agendar visita"].map((q) => (
                      <button key={q} className="discard-reason" style={{ padding: "7px 11px", ...(comoQ === q ? { borderColor: "#0d9488", background: "#f0fdfa", color: "#0f766e" } : {}) }} onClick={() => setComoQ(q)}>{q}</button>))}
                  </div>
                </div>
              )}
              <div className="caixa-foot">
                <button className="btn-ghost" onClick={() => setComo(null)}>Agora não</button>
                <button className="btn-primary" onClick={salvarComo}>Registrar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-aba "Disparar agora" — shell fiel; o disparo real via useDisparar entra num próximo passo.
function DisparoUnlocked() {
  const [subtab, setSubtab] = useState<"go" | "conv" | "tpl">("go");
  return (
    <div>
      <div className="disp-subtabs">
        <button className={`disp-subtab${subtab === "go" ? " on" : ""}`} onClick={() => setSubtab("go")}>🚀 1 · Disparar agora</button>
        <button className={`disp-subtab${subtab === "conv" ? " on" : ""}`} onClick={() => setSubtab("conv")}>💬 2 · Quem respondeu</button>
        <button className={`disp-subtab${subtab === "tpl" ? " on" : ""}`} onClick={() => setSubtab("tpl")}>📋 3 · Modelos Utility</button>
      </div>
      {subtab === "go" && (
        <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>
          Disparo do corretor liberado. A seleção de público e o envio pela conta oficial serão conectados aqui (mesmos hooks do painel do gerente) no próximo passo.
        </div>
      )}
      {subtab === "conv" && <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>Quem respondeu ao seu disparo aparecerá aqui (janela de 24h).</div>}
      {subtab === "tpl" && <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>Catálogo de modelos Utility aprovados pela Meta.</div>}
    </div>
  );
}

// ── CSS portado do mockup, escopado sob .cpv2 ───────────────────────────────
const CSS = `
.cpv2{--bg:#f4f7fc;--surface:#fff;--subtle:#edf2fa;--rail-bg:#0f172a;--rail-icon:#94a3b8;--rail-active:#fff;--rail-pill:rgba(20,184,166,.22);--border:#e2e8f0;--text:#0b1b36;--text-2:#556585;--text-3:#8796b0;--muted:#556585;--faint:#8796b0;--accent:#0d9488;--accent-hover:#0f766e;--accent-soft:#f0fdfa;--accent-border:#99f6e4;--caixa-blue:#005ca9;--warn:#d97706;--warn-soft:#fffbeb;--shadow:0 1px 3px rgba(11,27,54,.04),0 8px 24px rgba(11,27,54,.05);
  position:fixed;inset:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;}
html.dark .cpv2{--bg:#080e1c;--surface:#111927;--subtle:#18212f;--rail-bg:#060a14;--border:#1e293b;--text:#e9effa;--text-2:#9fb0cc;--text-3:#6c7d9c;--muted:#9fb0cc;--faint:#6c7d9c;--accent:#14b8a6;--accent-hover:#0d9488;--accent-soft:rgba(20,184,166,.12);--accent-border:rgba(20,184,166,.3);--warn:#f59e0b;--warn-soft:rgba(245,158,11,.12);--shadow:0 4px 24px rgba(0,0,0,.35);}
.cpv2 *{box-sizing:border-box;margin:0;padding:0;}
.cpv2 button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;transition:all .15s ease;}
.cpv2 input,.cpv2 textarea{font-family:inherit;color:inherit;}
.cpv2 input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
.cpv2 a{text-decoration:none;color:inherit;}
.cpv2 .app-frame{display:flex;width:100%;height:100%;overflow:hidden;}
.cpv2 .icon-rail{width:72px;background:var(--rail-bg);border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;align-items:center;padding:16px 0;flex-shrink:0;z-index:40;}
.cpv2 .rail-logo{width:40px;height:40px;border-radius:12px;background:var(--accent);color:#fff;font-weight:900;font-size:17px;display:grid;place-items:center;margin-bottom:22px;box-shadow:0 4px 14px rgba(13,148,136,.4);}
.cpv2 .rail-nav{display:flex;flex-direction:column;gap:10px;width:100%;align-items:center;}
.cpv2 .rail-item{position:relative;width:56px;padding:9px 0 7px;border-radius:12px;color:var(--rail-icon);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:600;}
.cpv2 .rail-item:hover{color:#fff;background:rgba(255,255,255,.06);}
.cpv2 .rail-item.active{color:var(--rail-active);background:var(--rail-pill);}
.cpv2 .rail-item.active::before{content:"";position:absolute;left:-8px;top:12px;bottom:12px;width:4px;border-radius:0 4px 4px 0;background:var(--accent);}
.cpv2 .rail-pip{position:absolute;top:4px;right:8px;background:var(--accent);color:#fff;font-size:10px;font-weight:800;min-width:17px;height:17px;padding:0 4px;border-radius:99px;display:grid;place-items:center;border:2px solid var(--rail-bg);}
.cpv2 .rail-footer{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:12px;}
.cpv2 .ficha-pill{display:flex;flex-direction:column;align-items:center;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.06);color:#cbd5e1;font-size:9.5px;font-weight:700;text-align:center;line-height:1.2;}
.cpv2 .ficha-pill b{color:#34d399;font-size:11px;}
.cpv2 .rail-btn{width:38px;height:38px;border-radius:10px;color:var(--rail-icon);display:grid;place-items:center;}
.cpv2 .rail-avatar{width:34px;height:34px;border-radius:50%;background:#0f766e;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;}
.cpv2 .shell{flex:1;display:grid;grid-template-columns:320px 1fr;min-width:0;height:100%;position:relative;}
.cpv2 .sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100%;min-height:0;}
.cpv2 .sidebar-head{padding:18px 18px 12px;border-bottom:1px solid var(--border);}
.cpv2 .sidebar-title-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.cpv2 .sidebar-title{font-size:17px;font-weight:800;letter-spacing:-.02em;}
.cpv2 .roleta-tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--accent-soft);color:var(--accent);}
.cpv2 .filter-bar{display:flex;gap:6px;flex-wrap:wrap;}
.cpv2 .f-pill{padding:5px 11px;border-radius:99px;font-size:12px;font-weight:600;color:var(--muted);}
.cpv2 .f-pill.on{background:var(--text);color:var(--surface);}
.cpv2 .lead-list{flex:1;overflow-y:auto;min-height:0;}
.cpv2 .lead-row{padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;}
.cpv2 .lead-row:hover{background:var(--subtle);}
.cpv2 .lead-row.selected{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent);}
.cpv2 .l-name{font-weight:600;font-size:14px;}
.cpv2 .l-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.cpv2 .l-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:var(--subtle);color:var(--muted);white-space:nowrap;}
.cpv2 .pescado-tag{font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;background:var(--accent-soft);color:var(--accent);margin-left:6px;white-space:nowrap;vertical-align:middle;}
.cpv2 .l-badge.urgent{background:var(--warn-soft);color:var(--warn);}
.cpv2 .l-badge.ready{background:var(--accent-soft);color:var(--accent);}
.cpv2 .l-badge.wait{background:var(--accent);color:#fff;font-weight:700;}
.cpv2 .l-badge.danger{background:rgba(185,28,28,.1);color:#b91c1c;}
html.dark .cpv2 .l-badge.danger{background:rgba(248,113,113,.14);color:#f87171;}
.cpv2 .contato-btns{display:flex;gap:8px;flex-wrap:wrap;}
.cpv2 .btn-ligar{display:inline-flex;align-items:center;padding:10px 16px;font-size:13.5px;border-radius:10px;}
.cpv2 .tent-row{display:flex;align-items:baseline;gap:8px;margin:10px 0 4px;font-size:12.5px;color:var(--muted);flex-wrap:wrap;}
.cpv2 .tent-lbl{font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:11px;}
.cpv2 .tent-n{font-size:18px;color:var(--text);}
.cpv2 .tent-hint{color:var(--faint);}
.cpv2 .regua-line{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 12px;border-radius:10px;background:var(--subtle);border:1px solid var(--border);margin:8px 0;}
.cpv2 .regua-line.late,.cpv2 .regua-line.and-laranja{background:var(--warn-soft);border-color:rgba(217,119,6,.35);}
.cpv2 .regua-line.late .regua-txt,.cpv2 .regua-line.and-laranja .regua-txt{color:var(--warn);}
.cpv2 .regua-line.and-vermelho{background:rgba(185,28,28,.07);border-color:rgba(185,28,28,.3);}
.cpv2 .regua-line.and-vermelho .regua-txt{color:#b91c1c;}
html.dark .cpv2 .regua-line.and-vermelho .regua-txt{color:#f87171;}
.cpv2 .regua-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.cpv2 .regua-dots{display:flex;gap:5px;}
.cpv2 .rd{width:11px;height:11px;border-radius:50%;border:2px solid var(--border);box-sizing:border-box;}
.cpv2 .rd.on{background:var(--text);border-color:var(--text);}
.cpv2 .rd.late{border-color:var(--warn);}
.cpv2 .regua-txt{font-size:13px;font-weight:600;color:var(--text);}
.cpv2 .retorno-lbl{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--text);}
.cpv2 .retorno-lbl input{min-height:34px;padding:0 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;}
.cpv2 .link-btn{background:none;border:0;color:var(--accent);font-weight:700;font-size:12.5px;cursor:pointer;padding:4px 6px;}
.cpv2 .pipe-step.ro{cursor:default;}
.cpv2 .proximo{border:1px solid var(--accent-border);background:var(--accent-soft);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;}
.cpv2 .proximo-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);}
.cpv2 .proximo-q{font-size:17px;font-weight:800;color:var(--text);}
.cpv2 .proximo-dica{font-size:13px;color:var(--muted);}
.cpv2 .proximo-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;}
.cpv2 .pb{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;font-size:13.5px;cursor:pointer;}
.cpv2 .pb.prim{background:var(--accent);border-color:var(--accent);color:#fff;}
.cpv2 .pb:hover{border-color:var(--accent);}
.cpv2 .note-tipo{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:99px;white-space:nowrap;}
.cpv2 .note-tipo.t{background:var(--subtle);color:var(--muted);}
.cpv2 .note-tipo.f{background:var(--accent-soft);color:var(--accent);}
.cpv2 .note-tipo.c{background:var(--warn-soft);color:var(--warn);}
.cpv2 .stage{overflow-y:auto;padding:28px 38px;display:flex;justify-content:center;height:100%;flex:1;min-width:0;}
.cpv2 .stage-inner{width:100%;max-width:760px;display:flex;flex-direction:column;gap:18px;padding-bottom:40px;}
.cpv2 .mobile-back-bar{display:none;align-items:center;justify-content:space-between;margin-bottom:4px;}
.cpv2 .btn-back-list{font-size:13.5px;font-weight:700;color:var(--accent);display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:var(--accent-soft);}
.cpv2 .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 26px;box-shadow:var(--shadow);}
.cpv2 .lead-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
.cpv2 .lead-title{font-size:21px;font-weight:700;letter-spacing:-.02em;}
.cpv2 .lead-sub{font-size:13px;color:var(--muted);margin-top:2px;}
.cpv2 .btn-primary{padding:10px 18px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}
.cpv2 .btn-primary:hover{background:var(--accent-hover);}
.cpv2 .lead-facts-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;padding:12px 14px;background:var(--subtle);border-radius:12px;}
.cpv2 .fact-cell{display:flex;flex-direction:column;}
.cpv2 .fact-lbl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.cpv2 .fact-val{font-size:13px;font-weight:700;color:var(--text);margin-top:2px;}
.cpv2 .pipeline{display:flex;align-items:center;gap:4px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);overflow-x:auto;}
.cpv2 .pipe-step{flex:1;text-align:center;padding:6px 4px;font-size:12px;font-weight:600;color:var(--muted);border-radius:7px;cursor:pointer;white-space:nowrap;}
.cpv2 .pipe-step.done{color:var(--accent);}
.cpv2 .pipe-step.current{background:var(--accent-soft);color:var(--accent);font-weight:700;}
.cpv2 .action-prompt{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:4px;}
.cpv2 .prompt-label{font-size:13.5px;font-weight:700;}
.cpv2 .prompt-hint{font-size:12px;color:var(--muted);}
.cpv2 .action-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.cpv2 .act-btn{padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);text-align:left;}
.cpv2 .act-btn:hover,.cpv2 .act-btn.chosen{border-color:var(--accent);background:var(--accent-soft);}
.cpv2 .act-title{font-size:13px;font-weight:600;display:block;}
.cpv2 .act-sub{font-size:11px;color:var(--muted);margin-top:1px;display:block;}
.cpv2 .convo-log-area{margin-top:14px;padding-top:14px;border-top:1px solid var(--border);}
.cpv2 .quick-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.cpv2 .q-tag{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:99px;border:1px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;}
.cpv2 .q-tag.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);}
.cpv2 .note-input-row{display:flex;gap:8px;}
.cpv2 .note-input{flex:1;height:38px;padding:0 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg);font-size:13px;outline:none;}
.cpv2 .btn-save-note{padding:0 16px;border-radius:9px;background:var(--text);color:var(--surface);font-size:12.5px;font-weight:600;}
.cpv2 .notes-history{margin-top:10px;display:flex;flex-direction:column;gap:6px;}
.cpv2 .note-line{font-size:12.5px;color:var(--muted);display:flex;gap:8px;align-items:baseline;}
.cpv2 .note-time{font-size:11px;font-weight:600;color:var(--faint);min-width:88px;font-variant-numeric:tabular-nums;}
.cpv2 .tool-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);padding-bottom:14px;margin-bottom:18px;overflow-x:auto;}
.cpv2 .tool-tab{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;}
.cpv2 .tool-tab.active{background:var(--text);color:var(--surface);}
.cpv2 .sim-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.cpv2 .field-box{display:flex;flex-direction:column;gap:6px;}
.cpv2 .field-top{display:flex;justify-content:space-between;font-size:13px;}
.cpv2 .field-val{font-weight:700;color:var(--accent);}
.cpv2 .kpi-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;padding:14px;border-radius:12px;background:var(--subtle);text-align:center;}
.cpv2 .kpi-label{font-size:10.5px;color:var(--muted);text-transform:uppercase;}
.cpv2 .kpi-num{font-size:16px;font-weight:700;margin-top:2px;}
.cpv2 .match-title{font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--muted);margin:16px 0 10px;display:flex;justify-content:space-between;}
.cpv2 .sim-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.cpv2 .btn-caixa{padding:11px 14px;border-radius:10px;background:var(--caixa-blue);color:#fff;font-weight:600;font-size:12.5px;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;}
.cpv2 .docs-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.cpv2 .doc-item{padding:14px 16px;border-radius:11px;border:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:space-between;cursor:pointer;}
.cpv2 .doc-item.done{background:var(--accent-soft);border-color:var(--accent-border);}
.cpv2 .doc-left{display:flex;align-items:center;gap:12px;}
.cpv2 .doc-title{font-weight:600;font-size:13.5px;}
.cpv2 .doc-desc{font-size:12px;color:var(--muted);}
.cpv2 .doc-tag{font-size:11.5px;font-weight:600;color:var(--accent);}
.cpv2 .script-item{padding:16px;border-radius:12px;border:1px solid var(--border);background:var(--bg);display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px;}
.cpv2 .script-text{font-size:13px;color:var(--muted);}
.cpv2 .btn-ghost{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-weight:600;font-size:12.5px;white-space:nowrap;}
.cpv2 .disp-wrap{max-width:1040px;margin:0 auto;width:100%;}
.cpv2 .disp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
.cpv2 .disp-perm-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);padding:8px 14px;border-radius:12px;font-size:12px;}
.cpv2 .disp-subtabs{display:inline-flex;gap:6px;padding:5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:18px;flex-wrap:wrap;}
.cpv2 .disp-subtab{padding:8px 14px;border-radius:8px;background:transparent;font-size:12.5px;font-weight:700;color:var(--text-2);display:flex;align-items:center;gap:6px;}
.cpv2 .disp-subtab.on{background:var(--text);color:var(--surface);}
.cpv2 .modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;z-index:600;padding:20px;}
.cpv2 .btn-discard{margin-top:12px;width:100%;height:38px;border:1px solid #f2d6d4;background:#fdeae7;color:#b0413b;font-weight:700;font-size:13px;border-radius:10px;cursor:pointer;}
.cpv2 .btn-discard:hover{background:#fbdcd7;}
.cpv2 .discard-sheet{width:100%;max-width:460px;background:#fff;color:#0f172a;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);}
.cpv2 .discard-head{padding:18px 20px 6px;} .cpv2 .discard-title{font-weight:800;font-size:16px;} .cpv2 .discard-sub{color:#64748b;font-size:13px;margin-top:2px;}
.cpv2 .discard-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 20px 18px;}
.cpv2 .discard-reason{text-align:left;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;color:#0f172a;cursor:pointer;}
.cpv2 .discard-reason:hover{border-color:#e5a29c;background:#fdeae7;color:#b0413b;}
@media (max-width:480px){.cpv2 .discard-grid{grid-template-columns:1fr;}}
.cpv2 .caixa-sheet{width:100%;max-width:540px;background:#fff;color:#0f172a;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);}
.cpv2 .caixa-head{background:linear-gradient(90deg,#005ca9,#0073d1);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;}
.cpv2 .caixa-logo{font-weight:900;font-size:15px;}
.cpv2 .caixa-subbar{background:#f39200;color:#fff;font-size:11px;font-weight:700;padding:5px 22px;text-transform:uppercase;}
.cpv2 .caixa-body{padding:20px 22px;font-size:13px;}
.cpv2 .caixa-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;}
.cpv2 .caixa-highlight{margin-top:14px;padding:14px;border-radius:10px;background:#f0f9ff;border:1px solid #bae6fd;display:flex;justify-content:space-between;align-items:center;}
.cpv2 .caixa-foot{padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;}
@media (max-width:820px){
  .cpv2 .app-frame{flex-direction:column-reverse;}
  .cpv2 .icon-rail{width:100%;height:64px;flex-direction:row;justify-content:space-around;padding:0 10px;border-right:none;border-top:1px solid rgba(255,255,255,.1);}
  .cpv2 .rail-logo,.cpv2 .ficha-pill,.cpv2 .rail-avatar{display:none;}
  .cpv2 .rail-nav{flex-direction:row;justify-content:space-around;width:auto;flex:1;}
  .cpv2 .rail-footer{margin-top:0;flex-direction:row;}
  .cpv2 .rail-item.active::before{display:none;}
  .cpv2 .shell{grid-template-columns:1fr;height:100%;}
  .cpv2 .stage{padding:16px 14px;}
  .cpv2 .card{padding:16px;}
  .cpv2 .lead-header{flex-direction:column;align-items:stretch;gap:12px;}
  .cpv2 .btn-primary{justify-content:center;width:100%;}
  .cpv2 .lead-facts-grid{grid-template-columns:1fr 1fr;}
  .cpv2 .action-row{grid-template-columns:1fr 1fr;}
  .cpv2 .sim-grid,.cpv2 .docs-list,.cpv2 .sim-actions{grid-template-columns:1fr;}
  .cpv2 .script-item{flex-direction:column;align-items:stretch;}
  .cpv2 .mobile-back-bar{display:flex;}
  .cpv2 .shell.mobile-show-detail .sidebar{display:none;}
  .cpv2 .shell:not(.mobile-show-detail) .stage{display:none;}
}
`;

export default CorretorPainel;
