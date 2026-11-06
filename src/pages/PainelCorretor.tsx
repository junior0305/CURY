/**
 * Painel novo do corretor (30/10) — mockup aprovado: https://claude.ai/artifact/UkxnsjMAhBVWrUuyxEG2GB
 * Hoje · Clientes · Pescar · Disparar · Eu. O aviso de lead novo chega no WhatsApp SEM telefone, com o link
 * comandra.com.br/l/<código> que abre a ficha aqui. O número fica escondido até o toque em WhatsApp/Ligar;
 * esse toque é a tentativa registrada (e a hora do 1º contato, trigger trg_primeiro_contato). Na volta,
 * "Como foi?" registra o resultado em dois toques. Nada é enviado ao cliente.
 * Meta: 1 venda no mês (ou a que o gerente definiu em metas) = 5 visitas atendidas + 3 pastas com documentos.
 * O painel antigo (simulador, Fecha a Conta, etiquetas) segue em /painel-completo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { addLeadNote, waLink } from "@/integrations/supabase/atender";
import { registerContactAttempt, updateLeadStatus, setLeadNegotiating, setLeadReturnDate } from "@/integrations/supabase/leads";
import { DisparoCorretor } from "@/components/broker/DisparoCorretor";
import AgendarVisita from "@/components/broker/AgendarVisita";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import LeadForm from "@/components/broker/LeadForm";
import { Sheet } from "@/components/ui/sheet";
import type { Task } from "@/types/task";
import Ficha from "@/components/painel-corretor/Ficha";
import Pescar from "@/components/painel-corretor/Pescar";
import AvisoLeadPush from "@/components/painel-corretor/AvisoLeadPush";
import MeuPlacar from "@/components/painel-corretor/MeuPlacar";
import InicioCorretor from "@/components/painel-corretor/InicioCorretor";
import { montarFila, contarGrupos, GRUPOS, ORDEM } from "@/components/painel-corretor/fila";
import { LOST_REASON_LABEL } from "@/types/lead";
import type { LostReason } from "@/types/lead";
import CorretorPainel from "@/pages/CorretorPainel";
import {
  LeadPC, COLS, diaSP, horaSP, dataCurta, primeiroNome, comArtigo, linhaMeta, esperando, escudo, ultimoRegistro,
  diasUteis, MES, QUANDO, quandoISO, origem, casaBusca, ehNovo, ha, rendaCurta, TRABALHO,
} from "@/components/painel-corretor/util";
import "@/styles/painel-corretor.css";

type Aba = "hoje" | "cli" | "pes" | "disp" | "eu";
type Tipo = "new" | "ret" | "vis" | "resp" | "pes" | "par";
const TAGC: Record<Tipo, string> = { new: "t-new", ret: "t-ret", vis: "t-vis", resp: "t-resp", pes: "t-ret", par: "t-ret" };
const PREFIXO_TENTATIVA = "Tentativa de contato";
const REGUA_DESDE = "2026-10-17";
const OFFS_REGUA = [0, 1, 3, 7];
const FECHADO = new Set(["CONCLUDED", "ABANDONED", "EXCLUDED"]);
const POR_VENDA = { atendidos: 66, visitas: 5, docs: 3 }; // Econ, 90 dias até 30/10/2026
const STATUS_TXT: Record<string, string> = { NEW: "Novo", IN_PROGRESS: "Atendendo", NEGOTIATING: "Conversando", VISIT_SCHEDULED: "Visita", VISITA_REALIZADA: "Veio", DOCS_REQUESTED: "Documentos", CONCLUDED: "Venda", FOLLOW_UP_AUTO: "Atendendo", REACTIVATED: "Voltou" };

const lerTema = () => { try { return localStorage.getItem("pc_tema") === "claro"; } catch { return false; } };
const haMin = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} dias`; };

export default function PainelCorretor() {
  const { user, signOut } = useAuth();
  const uid = user?.id || "";
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("hoje");
  const [claro, setClaro] = useState(lerTema);
  const [filtro, setFiltro] = useState<"" | "new" | "ret" | "vis">("");
  const [busca, setBusca] = useState("");
  const [cliFase, setCliFase] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [novoCliente, setNovoCliente] = useState(false);
  const [filaOn, setFilaOn] = useState(false);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [descFila, setDescFila] = useState(false);
  const [revelados, setRevelados] = useState<Set<string>>(new Set());
  const [como, setComo] = useState<{ id: string; canal: string } | null>(null);
  const [comoOut, setComoOut] = useState("Conversamos");
  const [comoQ, setComoQ] = useState("Amanhã 10h");
  const [adiar, setAdiar] = useState<string | null>(null);
  const [adiarQ, setAdiarQ] = useState("Amanhã 10h");
  const [agendar, setAgendar] = useState<string | null>(null);
  const [fechaDia, setFechaDia] = useState(false);
  const [diaOk, setDiaOk] = useState<Set<string>>(new Set());
  const voltarDe = useRef<{ id: string; canal: string } | null>(null);
  // notebook/desktop: menu na lateral, lista no meio e a ficha aberta ao lado (celular continua igual)
  const [desk, setDesk] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => { const m = window.matchMedia("(min-width: 1024px)"); const f = () => setDesk(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);

  const trocarTema = () => setClaro((c) => { try { localStorage.setItem("pc_tema", c ? "escuro" : "claro"); } catch { /* sem storage */ } return !c; });

  // ── dados ───────────────────────────────────────────────────────────────────
  const { data: leads = [] } = useQuery<LeadPC[]>({
    queryKey: ["pcLeads", uid], enabled: !!uid, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select(COLS).eq("broker_id", uid).not("status", "in", '("ABANDONED","EXCLUDED")').order("created_at", { ascending: false }).limit(1500);
      if (error) throw error; return (data as any) || [];
    },
  });
  const ativos = useMemo(() => leads.filter((l) => !FECHADO.has(l.status) && !/test lead|dummy data/i.test(l.name || "")), [leads]);

  // notas dos últimos 45 dias dos leads ativos: régua do pescado, último registro (escudo) e o "Fechar o dia"
  const ids = useMemo(() => ativos.slice(0, 400).map((l) => l.id), [ativos]);
  const { data: notas = [] } = useQuery<{ lead_id: string; content: string; created_at: string }[]>({
    queryKey: ["pcNotasLista", ids.join(",")], enabled: ids.length > 0, refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("lead_notes").select("lead_id, content, created_at").in("lead_id", ids).gte("created_at", new Date(Date.now() - 45 * 864e5).toISOString());
      return (data as any) || [];
    },
  });
  const { data: tarefasAbertas = [] } = useQuery<Task[]>({ queryKey: ["pcTarefas", "todas"], refetchInterval: 60_000, queryFn: fetchOpenTasks });
  const tarefaDe = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tarefasAbertas) if (t.leadId && !m.has(t.leadId)) m.set(t.leadId, t); // já vem da mais próxima para a mais distante
    return m;
  }, [tarefasAbertas]);
  const porLead = useMemo(() => {
    const m = new Map<string, { dias: Set<string>; ult: string | null; hoje: boolean }>();
    const hoje = diaSP(Date.now());
    for (const n of notas) {
      const c = m.get(n.lead_id) || { dias: new Set<string>(), ult: null, hoje: false };
      if (n.content.startsWith(PREFIXO_TENTATIVA)) c.dias.add(diaSP(n.created_at));
      if (!c.ult || n.created_at > c.ult) c.ult = n.created_at;
      if (diaSP(n.created_at) === hoje) c.hoje = true;
      m.set(n.lead_id, c);
    }
    return m;
  }, [notas]);

  const { data: trilha } = useQuery<any>({
    queryKey: ["pcTrilha", uid], enabled: !!uid, refetchInterval: 120_000,
    queryFn: async () => { const { data } = await (supabase as any).rpc("trilha_corretor"); return data || {}; },
  });
  const mesIni = useMemo(() => { const h = diaSP(Date.now()); return h.slice(0, 8) + "01"; }, []);
  const { data: metaP } = useQuery<any>({
    queryKey: ["metas-painel", mesIni, "eu"], enabled: !!uid, staleTime: 60_000,
    queryFn: async () => { const { data } = await supabase.rpc("metas_painel" as any, { p_mes: mesIni, p_dono: null }); return data; },
  });
  const { data: perfil } = useQuery<any>({
    queryKey: ["pcPerfil", uid], enabled: !!uid,
    queryFn: async () => {
      const { data: p } = await supabase.from("profiles").select("first_name, disparo_enabled, disparo_cota_diaria, manager_id").eq("id", uid).maybeSingle();
      let numero = null, gerente = "";
      if (p?.manager_id) {
        const { data } = await supabase.from("whatsapp_config").select("id, label, display_number, waba_id").eq("owner_id", p.manager_id).eq("is_active", true).limit(1);
        numero = data?.[0] || null;
        const { data: g } = await supabase.from("profiles").select("first_name").eq("id", p.manager_id).maybeSingle();
        gerente = primeiroNome(g?.first_name);
      }
      return { ...p, numero, gerente };
    },
  });
  const nomeEu = primeiroNome(perfil?.first_name) || "";

  // ── link do aviso: /l/<código> guarda o código e cai aqui ────────────────────
  useEffect(() => {
    if (!uid) return;
    let cod = ""; try { cod = localStorage.getItem("pc_lead_pendente") || ""; } catch { /* */ }
    const q = new URLSearchParams(window.location.search).get("lead") || "";
    if (!cod && !q) return;
    (async () => {
      let id = q;
      if (cod) { const { data } = await (supabase as any).rpc("lead_por_codigo", { p_codigo: cod }); id = data || ""; try { localStorage.removeItem("pc_lead_pendente"); } catch { /* */ } }
      if (id) { setAba("hoje"); setSelId(id); } else if (cod) toast.error("Esse cliente não está mais com você. Fale com seu gerente.");
    })();
  }, [uid]);

  // ── fila do Atender (regras em painel-corretor/fila.ts, as mesmas do computador) ──
  const hojeD = diaSP(Date.now());
  const filaHoje = useMemo(() => montarFila(leads, tarefaDe), [leads, tarefaDe]);
  const gruposN = useMemo(() => contarGrupos(leads, tarefaDe), [leads, tarefaDe]);
  const nNew = gruposN.resp + gruposN.novo;
  const filaRest = filaHoje.filter((x) => !feitos.has(x.l.id));
  const atual = filaRest[0] || null;
  const proximo = (id: string) => { setFeitos((f) => new Set(f).add(id)); setDescFila(false); };
  const descartarFila = async (l: LeadPC, m: NonNullable<LostReason>) => {
    try { await updateLeadStatus(l.id, "ABANDONED", null, m); toast.success(`${l.name} descartado · ${LOST_REASON_LABEL[m]}`); proximo(l.id); atualizar(); }
    catch { toast.error("Não consegui descartar"); }
  };
  const ultimaNota = (id: string) => notas.filter((n) => n.lead_id === id && !n.content.startsWith(PREFIXO_TENTATIVA)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;

  // ── meta do mês (o detalhe fica no Meu Placar) ────────────────────────────────────────────────────────────────
  const metaVendas = Number(metaP?.dono?.meta) > 0 ? Number(metaP.dono.meta) : 1;
  const metaDoGerente = Number(metaP?.dono?.meta) > 0;
  const du = diasUteis();
  const alvoMes = { atendidos: POR_VENDA.atendidos * metaVendas, visitas: POR_VENDA.visitas * metaVendas, docs: POR_VENDA.docs * metaVendas };
  const atMes = Number(trilha?.atendidos_mes) || 0, atHoje = Number(trilha?.atendidos_hoje) || 0;
  const alvoHoje = Math.max(1, Math.min(15, Math.ceil(Math.max(0, alvoMes.atendidos - (atMes - atHoje)) / du.restam)));
  const bateuAntes = useRef<boolean | null>(null);
  useEffect(() => {
    if (!trilha) return;
    const bateu = atHoje >= alvoHoje;
    if (bateuAntes.current === false && bateu) toast.success("🎉 Bateu a meta de hoje! Mais perto do apartamento do mês.", { duration: 6000 });
    bateuAntes.current = bateu;
  }, [atHoje, alvoHoje, trilha]);

  // ── chamar / como foi ──────────────────────────────────────────────────────────
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["pcLeads"] }); qc.invalidateQueries({ queryKey: ["pcNotasLista"] }); qc.invalidateQueries({ queryKey: ["pcTrilha"] }); };
  const chamar = async (l: LeadPC, canal: "WhatsApp" | "Ligação") => {
    setRevelados((s) => new Set(s).add(l.id));
    // abre primeiro (o navegador do celular bloqueia janela aberta depois de await)
    if (canal === "WhatsApp") window.open(waLink(l.phone), "_blank", "noopener"); else window.location.href = `tel:${(l.phone || "").replace(/\D/g, "")}`;
    voltarDe.current = { id: l.id, canal };
    try {
      await registerContactAttempt(l.id);
      await addLeadNote(l.id, uid, `${PREFIXO_TENTATIVA} · ${canal}`);
      if (l.status === "NEW") await updateLeadStatus(l.id, "IN_PROGRESS").catch(() => {});
      atualizar();
    } catch { toast.error("Não consegui registrar o toque. Registre depois em \"Registrar como foi\"."); }
  };
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && voltarDe.current) { setComo(voltarDe.current); setComoOut("Conversamos"); setComoQ("Amanhã 10h"); voltarDe.current = null; } };
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", vis);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); };
  }, []);
  const salvarComo = async () => {
    if (!como) return;
    const l = leads.find((x) => x.id === como.id); if (!l) { setComo(null); return; }
    try {
      if (comoOut === "Número errado") {
        await updateLeadStatus(l.id, "ABANDONED", null, "NUMERO_ERRADO");
        toast.success(`${l.name} descartado · número errado`);
      } else {
        if (comoOut === "Conversamos") {
          await addLeadNote(l.id, uid, `Conversamos · ${como.canal}`);
          const agoraIso = new Date().toISOString();
          await supabase.from("leads").update({ last_broker_whatsapp_at: agoraIso, last_interaction_at: agoraIso }).eq("id", l.id);
          if (["NEW", "IN_PROGRESS", "FOLLOW_UP_AUTO", "REACTIVATED"].includes(l.status)) await setLeadNegotiating(l.id).catch(() => {});
        }
        if (comoQ === "Agendar visita") { setComo(null); setFeitos((f) => new Set(f).add(l.id)); atualizar(); setAgendar(l.id); return; }
        const iso = quandoISO(comoQ);
        await setLeadReturnDate(l.id, iso);
        await addLeadNote(l.id, uid, `Combinado retorno em ${dataCurta(iso)} ${horaSP(iso)}`).catch(() => {});
        toast.success(`Registrado: ${comoOut.toLowerCase()} · próximo passo ${comoQ.toLowerCase()} · 🛡️ protegido por 48h`);
      }
      setComo(null); setFeitos((f) => new Set(f).add(l.id)); atualizar();
    } catch { toast.error("Não consegui registrar. Tente de novo."); }
  };
  const salvarAdiar = async () => {
    const l = leads.find((x) => x.id === adiar); if (!l) { setAdiar(null); return; }
    try { const iso = quandoISO(adiarQ); await setLeadReturnDate(l.id, iso); toast.success(`${primeiroNome(l.name)} volta ${adiarQ.toLowerCase()} na sua fila`); setAdiar(null); atualizar(); }
    catch { toast.error("Não consegui adiar"); }
  };
  const doDia = useMemo(() => ativos.filter((l) => !porLead.get(l.id)?.hoje && ["IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED"].includes(l.status))
    .sort((a, b) => (porLead.get(b.id)?.ult || b.created_at).localeCompare(porLead.get(a.id)?.ult || a.created_at)).slice(0, 12), [ativos, porLead]);
  const salvarDia = async () => {
    const sel = [...diaOk]; const agoraIso = new Date().toISOString();
    try {
      for (const id of sel) {
        await addLeadNote(id, uid, "Conversamos · fora do Comandra (fechar o dia)");
        await supabase.from("leads").update({ last_broker_whatsapp_at: agoraIso, last_interaction_at: agoraIso }).eq("id", id);
      }
      toast.success(`${sel.length} conversa${sel.length === 1 ? "" : "s"} registrada${sel.length === 1 ? "" : "s"} · o resto aparece amanhã`);
      setFechaDia(false); setDiaOk(new Set()); atualizar();
    } catch { toast.error("Não consegui registrar todas. Tente de novo."); }
  };

  // ── arrastar card: → chamar, ← adiar ─────────────────────────────────────────────
  const drag = useRef<{ el: HTMLElement; x: number; dx: number; id: string } | null>(null);
  const pd = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { el: e.currentTarget as HTMLElement, x: e.clientX, dx: 0, id }; drag.current.el.classList.add("drag");
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
  };
  // rolar a lista cancela o gesto: não abre ficha nem chama
  const pc = () => { const d = drag.current; if (!d) return; drag.current = null; d.el.classList.remove("drag"); d.el.style.transform = ""; };
  const pm = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; d.dx = e.clientX - d.x; if (Math.abs(d.dx) > 6) d.el.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 40}deg)`; };
  const pu = () => {
    const d = drag.current; if (!d) return; drag.current = null; d.el.classList.remove("drag"); d.el.style.transform = "";
    const l = leads.find((x) => x.id === d.id); if (!l) return;
    if (d.dx > 90) chamar(l, "WhatsApp"); else if (d.dx < -90) { setAdiar(l.id); setAdiarQ("Amanhã 10h"); } else if (Math.abs(d.dx) < 6) setSelId(l.id);
  };

  const sel = selId ? leads.find((l) => l.id === selId) || null : null;
  const saud = (() => { const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; })();
  const hojeTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const titulo: Record<Aba, [string, string]> = {
    hoje: filaOn ? ["Atender", "um cliente por vez, na ordem certa"] : [`${saud}${nomeEu ? ", " + nomeEu : ""}`, hojeTxt], cli: ["Clientes", `${ativos.length} com você`], pes: ["Pescar", "contatos da sua região"],
    disp: ["Disparar", "pelo número oficial da sua equipe"], eu: ["Meu Placar", `seu mês de ${MES()}`],
  };

  const novos = useMemo(() => ativos.filter(ehNovo), [ativos]);
  // mesmas regras do Meu Placar (meu_placar): quente = respondeu em 48h e espera o corretor; parado = 3+ dias sem contato
  const ehQuente = (l: LeadPC) => !!l.last_lead_response_at && Date.parse(l.last_lead_response_at) > Date.now() - 48 * 3.6e6 && (!l.last_broker_whatsapp_at || l.last_lead_response_at > l.last_broker_whatsapp_at);
  const ehParado = (l: LeadPC) => ["IN_PROGRESS", "NEGOTIATING", "FOLLOW_UP_AUTO", "REACTIVATED"].includes(l.status)
    && Date.parse(l.last_broker_whatsapp_at || l.last_interaction_at || l.created_at) < Date.now() - 3 * 864e5 && (!l.next_action_date || Date.parse(l.next_action_date) < Date.now());
  const clientesFiltrados = ativos.filter((l) => (!cliFase || (cliFase === "NOVO" ? ehNovo(l) : cliFase === "HOJE" ? diaSP(l.created_at) === hojeD
    : cliFase === "QUENTE" ? ehQuente(l) : cliFase === "PARADO" ? ehParado(l) : l.status === cliFase || (cliFase === "NEW" && l.status === "IN_PROGRESS"))) && casaBusca(l, busca));
  const cliCard = (l: LeadPC) => (
    <button key={l.id} type="button" className={`card${desk && selId === l.id ? " sel" : ""}`} onClick={() => setSelId(l.id)}>
      <div className="row"><b>{l.name}</b><span className={`tag ${esperando(l) ? "t-resp" : ehNovo(l) ? "t-new" : l.status === "VISIT_SCHEDULED" ? "t-vis" : "t-mut"}`}>{esperando(l) ? "Respondeu" : ehNovo(l) ? `🔥 Novo · há ${ha(l.created_at)}` : STATUS_TXT[l.status] || l.status}</span></div>
      <span className="meta">{linhaMeta(l) || origem(l) || "—"}</span>
      <span className="meta">chegou {diaSP(l.created_at) === hojeD ? "hoje" : dataCurta(l.created_at)} às {horaSP(l.created_at)}</span>
    </button>);
  const buscaInput = <input className="inp" type="search" aria-label="Buscar cliente" placeholder="🔎 Buscar por nome, telefone ou link do aviso…" value={busca} onChange={(e) => setBusca(e.target.value)} />;

  // Notebook/desktop: o painel de sempre (CorretorPainel), no padrão do antigo — pedido do Junior (30/10).
  // O painel novo é o do celular.
  if (desk) return <CorretorPainel />;

  return (
    <div className={`pc${claro ? " claro" : ""}`}>
      <div className={`pc-app${desk ? " desk" : ""}`}>
        <div className={`pc-col${desk && !["hoje", "cli"].includes(aba) ? " wide" : ""}`}>
        <header className="pc-top">
          <div><h1>{titulo[aba][0]}</h1><small>{titulo[aba][1]}</small></div>
          <div className="r">
            <button className="tema" type="button" onClick={trocarTema} aria-label={claro ? "Mudar para tela escura" : "Mudar para tela clara"} title="Claro / escuro">{claro ? "🌙" : "☀️"}</button>
            {aba === "hoje" && <button className="btn" type="button" onClick={() => { setDiaOk(new Set()); setFechaDia(true); }}>Fechar o dia</button>}
            {aba === "hoje" && !filaOn && <button className="btn pri" type="button" aria-label="Novo cliente" onClick={() => setNovoCliente(true)}>+</button>}
          </div>
        </header>

        <main className="pc-body">
          {aba === "hoje" && !filaOn && <InicioCorretor uid={uid} c={{ titulo: "lbl", meta: "meta", btn: "btn", pri: "btn pri", inp: "inp" }}
            onAtender={() => { if (filaRest.length) setFilaOn(true); else setAba("cli"); }} onPlacar={() => setAba("eu")} onAbrir={setSelId} />}

          {aba === "hoje" && filaOn && <>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" type="button" onClick={() => setFilaOn(false)} aria-label="Voltar para a tela principal">←</button>
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                <span className="meta">{atual ? `cliente ${feitos.size + 1} de ${feitos.size + filaRest.length}` : "fila concluída"}</span>
                <div className="prog"><i style={{ width: `${(100 * feitos.size) / Math.max(1, feitos.size + filaRest.length)}%` }} /></div>
              </div>
            </div>
            <div className="chips">{ORDEM.map((g) => { const n = filaRest.filter((x) => x.g === g).length;
              return n ? <span key={g} className="tag" style={{ background: GRUPOS[g].cor, color: "#fff" }}>{n} {GRUPOS[g].rot.toLowerCase()}</span> : null; })}</div>
            {atual ? (() => { const l = atual.l, nota = ultimaNota(l.id); return (
              <div className="card plain" style={{ border: `2px solid ${GRUPOS[atual.g].cor}`, gap: 12 }}>
                <span className="tag" style={{ alignSelf: "flex-start", background: GRUPOS[atual.g].cor, color: "#fff", fontWeight: 800 }}>{atual.motivo}</span>
                <button type="button" onClick={() => setSelId(l.id)} style={{ all: "unset", cursor: "pointer", fontSize: 24, fontWeight: 800 }}>{l.name}</button>
                <div className="gl"><span>Região</span><span>{l.regiao_interesse || "—"}</span></div>
                <div className="gl"><span>Renda</span><span>{rendaCurta(l.renda_declarada) || "—"}</span></div>
                <div className="gl"><span>Trabalho</span><span>{TRABALHO(l.tipo_trabalho) || "—"}</span></div>
                <div className="gl"><span>Fase</span><span>{STATUS_TXT[l.status] || l.status}</span></div>
                {nota && <span className="meta">📝 {dataCurta(nota.created_at)} {horaSP(nota.created_at)} · {nota.content}</span>}
                <div className="row">
                  <button className="btn wa" type="button" style={{ flex: 1 }} onClick={() => chamar(l, "WhatsApp")}>🟢 Chamar no WhatsApp</button>
                  <button className="btn" type="button" onClick={() => chamar(l, "Ligação")}>📞 Ligar</button>
                </div>
                <span className="meta">Depois de chamar, registre como foi e o próximo cliente aparece.</span>
                <div className="row">
                  <button className="btn" type="button" style={{ flex: 1 }} onClick={() => proximo(l.id)}>Pular por agora</button>
                  <button className="btn" type="button" style={{ flex: 1 }} onClick={() => setDescFila(!descFila)}>🗑️ Descartar</button>
                </div>
                {descFila && <div className="chips">{(["SEM_PERFIL", "NUMERO_ERRADO", "SEM_RETORNO", "DESISTIU", "JA_COMPROU", "RENDA_FORA_FAIXA"] as NonNullable<LostReason>[]).map((m) =>
                  <button key={m} type="button" onClick={() => descartarFila(l, m)}>{LOST_REASON_LABEL[m]}</button>)}</div>}
              </div>); })()
              : <div className="card plain" style={{ textAlign: "center", padding: "28px 16px" }}><b>Fila em dia! 🎉</b>
                  <span className="meta">Você passou por todos os clientes de hoje.</span>
                  <button className="btn pri" type="button" onClick={() => { setFilaOn(false); setAba("cli"); }}>Ver todos os clientes</button></div>}
            <button className="btn" type="button" onClick={() => { setFilaOn(false); setAba("cli"); }}>Ver todos os {ativos.length} em lista</button>
            <p className="hint">Ordem: responderam · novos (menos de 24h) · retornos e tarefas de hoje · visitas de hoje · pescados · parados · nunca chamados (até 10 por dia)</p>
          </>}

          {aba === "cli" && <>
            <button className="btn full" type="button" onClick={() => setNovoCliente(true)}>+ Novo cliente</button>
            {buscaInput}
            <div className="chips">{[["", "Todos"], ["NOVO", `🔥 Novos · ${novos.length}`], ["HOJE", "Chegaram hoje"], ["QUENTE", "Quentes"], ["PARADO", "Parados"], ["NEGOTIATING", "Conversando"], ["VISIT_SCHEDULED", "Visita"], ["DOCS_REQUESTED", "Documentos"]].map(([k, r]) =>
              <button type="button" key={k} className={cliFase === k ? "on" : ""} onClick={() => setCliFase(k)}>{r}</button>)}</div>
            <span className="meta">{clientesFiltrados.length} cliente{clientesFiltrados.length === 1 ? "" : "s"} · mais recentes primeiro</span>
            {clientesFiltrados.slice(0, 200).map(cliCard)}
          </>}

          {aba === "pes" && uid && <Pescar userId={uid} onPegou={(id) => { setAba("hoje"); setSelId(id); }} />}

          {aba === "disp" && (perfil?.disparo_enabled && perfil?.numero ? (
            <DisparoCorretor managerId={perfil.manager_id} configId={perfil.numero.id} wabaId={perfil.numero.waba_id} cota={perfil.disparo_cota_diaria || 0} brokerId={uid} brokerNome={perfil.first_name} />
          ) : (
            <div className="card plain" style={{ textAlign: "center", padding: "32px 18px" }}>
              <div style={{ fontSize: 34 }}>🔒</div>
              <b>Disparo ainda não liberado para você</b>
              <span className="meta">{perfil?.numero ? "Seu gerente libera a cota de disparos para a sua conta." : "Sua equipe ainda não tem número oficial de WhatsApp."} O disparo sai pelo número oficial da equipe, nunca pelo seu.</span>
              <button className="btn pri" type="button" onClick={async () => {
                if (!perfil?.manager_id) { toast.error("Você não tem gerente definido. Fale com o admin."); return; }
                const { error } = await supabase.from("internal_notifications").insert({ to_id: perfil.manager_id, from_id: uid, type: "DISPARO_LIBERACAO_PEDIDO",
                  message: `🙋 ${perfil.first_name || "Um corretor"} pediu liberação para disparar. Libere em Disparar › Corretores.` });
                if (error) toast.error("Não consegui enviar o pedido."); else toast.success("Pedido enviado ao seu gerente ✅");
              }}>🙋 Pedir liberação ao gerente</button>
            </div>
          ))}

          {aba === "eu" && <>
            <MeuPlacar uid={uid} titulo={false} onAbrir={(id) => { setAba("hoje"); setSelId(id); }}
              onFiltro={(f) => { setAba("cli"); setBusca(""); setCliFase(f === "quentes" ? "QUENTE" : "PARADO"); }}
              numeros={<div className="mp-grade">
                <span><b>{atHoje} de {alvoHoje}</b><span className="mp-m">atendidos hoje</span></span>
                <span><b>{atMes}</b><span className="mp-m">atendidos no mês</span></span>
                <span><b>{trilha?.min_1o_contato != null ? (trilha.min_1o_contato < 60 ? `${trilha.min_1o_contato} min` : `${Math.round(trilha.min_1o_contato / 60)}h`) : "—"}</b>
                  <span className="mp-m">até o 1º contato{trilha?.min_1o_contato_equipe != null ? ` · equipe ${trilha.min_1o_contato_equipe < 60 ? trilha.min_1o_contato_equipe + " min" : Math.round(trilha.min_1o_contato_equipe / 60) + "h"}` : ""}</span></span>
                <span><b>{metaVendas}</b><span className="mp-m">meta de vendas{metaDoGerente ? " do gerente" : ""}</span></span>
              </div>} />
            <AvisoLeadPush uid={uid} sempre />
            <a className="btn" style={{ textAlign: "center", textDecoration: "none" }} href="/painel-completo">Painel completo (simulador, Fecha a Conta) ↗</a>
            <button className="btn" type="button" onClick={() => signOut()}>Sair da conta</button>
          </>}
        </main>
        </div>

        {desk && ["hoje", "cli"].includes(aba) && (
          <aside className="pc-side" aria-label="Ficha do cliente">
            {sel ? <Ficha inline lead={sel} userId={uid} revelado={revelados.has(sel.id)} onFechar={() => setSelId(null)}
              onChamar={(canal) => chamar(sel, canal)} onAgendar={() => setAgendar(sel.id)} onComoFoi={() => { setComo({ id: sel.id, canal: "WhatsApp" }); setComoOut("Conversamos"); setComoQ("Amanhã 10h"); }} />
              : <div className="pc-vazio"><div style={{ fontSize: 44 }}>👈</div><b>Escolha um cliente na lista</b>
                  <span className="meta">A ficha abre aqui do lado. O número aparece quando você tocar em WhatsApp ou Ligar.</span></div>}
          </aside>
        )}

        <nav className="nav" aria-label="Seções">
          {([["hoje", "☀️", "Hoje"], ["cli", "👥", "Clientes"], ["pes", "🎣", "Pescar"], ["disp", "📣", "Disparar"], ["eu", "🏆", "Placar"]] as [Aba, string, string][]).map(([k, i, r]) => (
            <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => { setAba(k); setFiltro(""); }} aria-current={aba === k ? "page" : undefined}>
              {k === "hoje" && nNew > 0 && <span className="pip">{nNew}</span>}<i>{i}</i>{r}</button>))}
        </nav>
      </div>

      {sel && !(desk && ["hoje", "cli"].includes(aba)) && <Ficha lead={sel} userId={uid} revelado={revelados.has(sel.id)} onFechar={() => setSelId(null)}
        onChamar={(canal) => chamar(sel, canal)} onAgendar={() => setAgendar(sel.id)} onComoFoi={() => { setComo({ id: sel.id, canal: "WhatsApp" }); setComoOut("Conversamos"); setComoQ("Amanhã 10h"); }} />}

      {(como || adiar || fechaDia) && <div className="dim" onClick={() => { setComo(null); setAdiar(null); setFechaDia(false); }} />}
      {como && (() => { const l = leads.find((x) => x.id === como.id); return (
        <section className="sheet" aria-label="Como foi">
          <h3>Como foi com {comArtigo(l?.name)}?</h3>
          <div className="out">{[["✅", "Conversamos"], ["📵", "Não atendeu"], ["📭", "Caixa postal"], ["❌", "Número errado"]].map(([e, r]) =>
            <button key={r} type="button" className={comoOut === r ? "on" : ""} onClick={() => setComoOut(r)}>{e} {r}</button>)}</div>
          {comoOut !== "Número errado" && <><span className="lbl" style={{ margin: 0 }}>E o próximo passo?</span>
            <div className="chips">{["Hoje 18h", "Amanhã 10h", "Em 2 dias", "Agendar visita"].map((q) => <button key={q} type="button" className={comoQ === q ? "on" : ""} onClick={() => setComoQ(q)}>{q}</button>)}</div></>}
          <button className="btn pri full" type="button" onClick={salvarComo}>Registrar</button>
        </section>); })()}
      {adiar && (() => { const l = leads.find((x) => x.id === adiar); return (
        <section className="sheet" aria-label="Adiar">
          <h3>Adiar {primeiroNome(l?.name) || "cliente"} para quando?</h3>
          <div className="chips">{QUANDO.map((q) => <button key={q} type="button" className={adiarQ === q ? "on" : ""} onClick={() => setAdiarQ(q)}>{q}</button>)}</div>
          <button className="btn pri full" type="button" onClick={salvarAdiar}>Adiar</button>
        </section>); })()}
      {fechaDia && (
        <section className="sheet" aria-label="Fechar o dia">
          <h3>Você falou com estes hoje?</h3>
          <p className="meta" style={{ margin: "-6px 0 0" }}>Toque em cada um com quem você conversou fora do Comandra. O resto aparece amanhã.</p>
          {doDia.length ? doDia.map((l) => (
            <button key={l.id} type="button" className={`chk${diaOk.has(l.id) ? " ok" : ""}`} onClick={() => setDiaOk((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}>
              <span>{l.name}</span><span>{diaOk.has(l.id) ? "✅ conversamos" : "toque para confirmar"}</span></button>))
            : <p className="hint">Você já registrou todo mundo hoje. 🎉</p>}
          <button className="btn pri full" type="button" onClick={salvarDia}>Fechar o dia</button>
        </section>
      )}
      <Sheet open={novoCliente} onOpenChange={setNovoCliente}>
        {novoCliente && uid && <LeadForm onOpenChange={setNovoCliente} brokerId={uid} managerId={perfil?.manager_id ?? null} onCriado={setSelId} />}
      </Sheet>
      {agendar && (() => { const l = leads.find((x) => x.id === agendar); return (
        <AgendarVisita leadId={agendar} nome={l?.name || null} brokerId={uid} onFechar={() => setAgendar(null)}
          onFeito={(resumo) => { setAgendar(null); atualizar(); toast.success(resumo); }} />); })()}
    </div>
  );
}
