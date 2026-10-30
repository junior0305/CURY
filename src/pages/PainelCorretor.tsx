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
import Ficha from "@/components/painel-corretor/Ficha";
import Pescar from "@/components/painel-corretor/Pescar";
import {
  LeadPC, COLS, diaSP, horaSP, dataCurta, primeiroNome, comArtigo, linhaMeta, esperando, escudo, ultimoRegistro,
  diasUteis, MES, QUANDO, quandoISO, origem,
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

  // ── classificação do "Agora" ──────────────────────────────────────────────────
  const hojeD = diaSP(Date.now());
  const regua = (l: LeadPC) => {
    if (l.source !== "cold_pool" || diaSP(l.created_at) < REGUA_DESDE || esperando(l) || !["NEW", "IN_PROGRESS"].includes(l.status)) return null;
    const pesca = diaSP(l.created_at);
    const dias = [...(porLead.get(l.id)?.dias ?? new Set<string>())].filter((d) => d >= pesca);
    const feitos = Math.min(4, dias.length);
    if (feitos >= 4 || dias.includes(hojeD)) return null;
    const d = Math.round((Date.parse(hojeD + "T12:00:00Z") - Date.parse(pesca + "T12:00:00Z")) / 864e5);
    if (d < OFFS_REGUA[feitos]) return null;
    return { n: feitos + 1, atrasado: d > OFFS_REGUA[feitos] };
  };
  const classe = (l: LeadPC): { t: Tipo; tag: string; u: number } | null => {
    if (esperando(l)) return { t: "resp", tag: `💬 Respondeu · há ${haMin(l.last_lead_response_at!)}`, u: 100 };
    if (l.status === "NEW" && !(l.contact_attempts || 0) && l.source !== "cold_pool") return { t: "new", tag: `🔥 Novo · há ${haMin(l.created_at)}`, u: 95 };
    const adiado = l.next_action_date && Date.parse(l.next_action_date) > Date.now() && diaSP(l.next_action_date) > hojeD;
    if (l.visit_scheduled_at && diaSP(l.visit_scheduled_at) === hojeD && l.status === "VISIT_SCHEDULED") return { t: "vis", tag: `📅 Visita ${horaSP(l.visit_scheduled_at)}`, u: 85 };
    if (adiado) return null;
    if (l.next_action_date && diaSP(l.next_action_date) <= hojeD) {
      const atr = Date.parse(l.next_action_date) < Date.now();
      return { t: "ret", tag: `📞 Retorno ${diaSP(l.next_action_date) < hojeD ? dataCurta(l.next_action_date) : horaSP(l.next_action_date)}${atr ? " · atrasado" : ""}`, u: atr ? 90 : 80 };
    }
    const rg = regua(l);
    if (rg) return { t: "pes", tag: `🎣 ${rg.n}º toque ${rg.atrasado ? "atrasado" : "hoje"}`, u: rg.atrasado ? 75 : 60 };
    if (l.status === "NEGOTIATING") {
      const base = [l.negotiating_since, porLead.get(l.id)?.ult, l.last_lead_response_at].filter(Boolean).sort().slice(-1)[0] as string | undefined;
      const dias = base ? Math.floor((Date.now() - Date.parse(base)) / 864e5) : 0;
      if (dias >= 3) return { t: "par", tag: `⏳ Sem avanço há ${dias} dias`, u: 70 };
    }
    return null;
  };
  const agora = useMemo(() => ativos.map((l) => ({ l, c: classe(l) })).filter((x) => x.c).sort((a, b) => b.c!.u - a.c!.u) as { l: LeadPC; c: { t: Tipo; tag: string; u: number } }[],
    [ativos, porLead]); // eslint-disable-line
  const nNew = agora.filter((x) => x.c.t === "new").length;
  const nRet = agora.filter((x) => x.c.t === "ret").length;
  const visHoje = agora.filter((x) => x.c.t === "vis");
  const lista = agora.filter((x) => !filtro || x.c.t === filtro || (filtro === "new" && x.c.t === "resp"));

  // ── meta do mês ────────────────────────────────────────────────────────────────
  const metaVendas = Number(metaP?.dono?.meta) > 0 ? Number(metaP.dono.meta) : 1;
  const metaDoGerente = Number(metaP?.dono?.meta) > 0;
  const vendasMes = Number(metaP?.dono?.realizado) || 0;
  const du = diasUteis();
  const alvoMes = { atendidos: POR_VENDA.atendidos * metaVendas, visitas: POR_VENDA.visitas * metaVendas, docs: POR_VENDA.docs * metaVendas };
  const atMes = Number(trilha?.atendidos_mes) || 0, atHoje = Number(trilha?.atendidos_hoje) || 0;
  const visMes = Number(trilha?.visitas_mes) || 0, docsMes = Number(trilha?.docs_mes) || 0;
  const alvoHoje = Math.max(1, Math.min(15, Math.ceil(Math.max(0, alvoMes.atendidos - (atMes - atHoje)) / du.restam)));
  const faltaDocs = Math.max(0, alvoMes.docs - docsMes), faltaVis = Math.max(0, alvoMes.visitas - visMes);
  const ritmo = du.hojeN > 1 ? Math.round(((docsMes / POR_VENDA.docs) / du.hojeN) * du.total * 10) / 10 : null;
  const proxVisita = useMemo(() => ativos.filter((l) => l.status === "VISIT_SCHEDULED" && l.visit_scheduled_at && Date.parse(l.visit_scheduled_at) > Date.now() - 3 * 3.6e6)
    .sort((a, b) => a.visit_scheduled_at!.localeCompare(b.visit_scheduled_at!))[0] || null, [ativos]);
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
        if (comoQ === "Agendar visita") { setComo(null); atualizar(); setAgendar(l.id); return; }
        const iso = quandoISO(comoQ);
        await setLeadReturnDate(l.id, iso);
        await addLeadNote(l.id, uid, `Combinado retorno em ${dataCurta(iso)} ${horaSP(iso)}`).catch(() => {});
        toast.success(`Registrado: ${comoOut.toLowerCase()} · próximo passo ${comoQ.toLowerCase()} · 🛡️ protegido por 48h`);
      }
      setComo(null); atualizar();
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
    hoje: [`${saud}${nomeEu ? ", " + nomeEu : ""}`, hojeTxt], cli: ["Clientes", `${ativos.length} com você`], pes: ["Pescar", "contatos da sua região"],
    disp: ["Disparar", "pelo número oficial da sua equipe"], eu: ["Eu", `seu mês de ${MES()}`],
  };

  const card = (l: LeadPC, c: { t: Tipo; tag: string }) => {
    const esc = escudo(l, ultimoRegistro(l, porLead.get(l.id)?.ult));
    return (
      <div key={l.id} className="card" role="button" tabIndex={0} aria-label={`Abrir ${l.name}`}
        onPointerDown={(e) => pd(e, l.id)} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pc}
        onKeyDown={(e) => { if (e.key === "Enter") setSelId(l.id); }}>
        <div className="row"><b>{l.name}</b><span className={`tag ${TAGC[c.t]}`}>{c.tag}</span></div>
        <span className="meta">{linhaMeta(l) || origem(l) || "—"}</span>
        <div className="row"><span className={`shield ${esc.k}`}>🛡️ {esc.txt}</span>
          <span className="acts"><button className="btn" type="button" onClick={() => { setAdiar(l.id); setAdiarQ("Amanhã 10h"); }}>Adiar</button>
            <button className="btn wa" type="button" onClick={() => chamar(l, "WhatsApp")}>Chamar</button></span></div>
      </div>
    );
  };

  const metaCard = (
    <div className="card plain goal">
      <div className="row"><b>🏠 Meta: {metaVendas} apartamento{metaVendas > 1 ? "s" : ""} no mês</b><span className="meta">dia {Math.min(du.hojeN, du.total)} de {du.total}</span></div>
      <span className="meta">{metaDoGerente ? `meta sugerida pelo seu gerente${perfil?.gerente ? ", " + perfil.gerente : ""}` : "meta padrão: 1 por corretor (seu gerente pode mudar)"}</span>
      <div className="gl"><span>Hoje</span><span>{atHoje} de {alvoHoje} clientes atendidos {atHoje >= alvoHoje ? "✅" : ""}</span></div>
      <div className="prog"><i style={{ width: `${Math.min(100, (100 * atHoje) / alvoHoje)}%` }} /></div>
      <div className="gl"><span>Visitas no mês</span><span>{visMes} de {alvoMes.visitas}{proxVisita ? <> · <b className="ok">próxima: {comArtigo(proxVisita.name)}, {diaSP(proxVisita.visit_scheduled_at!) === hojeD ? horaSP(proxVisita.visit_scheduled_at!) : dataCurta(proxVisita.visit_scheduled_at!)}</b></> : faltaVis ? <> · <b className="no">falta{faltaVis > 1 ? "m" : ""} {faltaVis}</b></> : " ✅"}</span></div>
      <div className="gl"><span>Documentos no mês</span><span>{docsMes} de {alvoMes.docs}{faltaDocs ? <> · <b className="no">falta{faltaDocs > 1 ? "m" : ""} {faltaDocs}</b></> : " ✅"}</span></div>
      <span className="meta">{vendasMes >= metaVendas ? `🎉 Meta do mês batida: ${vendasMes} venda${vendasMes > 1 ? "s" : ""}!`
        : faltaDocs === 1 ? "Falta pouco: mais uma pasta com documentos fecha a conta do mês."
        : ritmo != null ? `Seu ritmo: ${String(ritmo).replace(".", ",")} venda${ritmo === 1 ? "" : "s"} no mês. Cada pasta com documentos deixa a conta mais perto.` : "Comece pelos clientes de hoje."}</span>
    </div>
  );

  return (
    <div className={`pc${claro ? " claro" : ""}`}>
      <div className="pc-app">
        <header className="pc-top">
          <div><h1>{titulo[aba][0]}</h1><small>{titulo[aba][1]}</small></div>
          <div className="r">
            <button className="tema" type="button" onClick={trocarTema} aria-label={claro ? "Mudar para tela escura" : "Mudar para tela clara"} title="Claro / escuro">{claro ? "🌙" : "☀️"}</button>
            {aba === "hoje" && <button className="btn" type="button" onClick={() => { setDiaOk(new Set()); setFechaDia(true); }}>Fechar o dia</button>}
          </div>
        </header>

        <main className="pc-body">
          {aba === "hoje" && <>
            <div className="stats">
              <button type="button" className={`st${nNew ? " hot" : ""}${filtro === "new" ? " on" : ""}`} onClick={() => setFiltro(filtro === "new" ? "" : "new")}><b>{nNew}</b><span>novos esperando</span></button>
              <button type="button" className={`st${filtro === "ret" ? " on" : ""}`} onClick={() => setFiltro(filtro === "ret" ? "" : "ret")}><b>{nRet}</b><span>retornos hoje</span></button>
              <button type="button" className={`st${filtro === "vis" ? " on" : ""}`} onClick={() => setFiltro(filtro === "vis" ? "" : "vis")}><b>{visHoje.length}</b><span>{visHoje.length === 1 ? `visita às ${horaSP(visHoje[0].l.visit_scheduled_at!)}` : "visitas hoje"}</span></button>
            </div>
            <div className="lbl">Agora{filtro ? " · filtrado" : ""}</div>
            {lista.length ? lista.slice(0, 40).map(({ l, c }) => card(l, c)) : <p className="hint vazio">Tudo em dia por aqui. 🎉</p>}
            {lista.length > 0 && <p className="hint">Arraste o card → para chamar · ← para adiar</p>}
            <div className="lbl">Rumo ao apartamento do mês</div>
            {metaCard}
          </>}

          {aba === "cli" && <>
            <input className="inp" aria-label="Buscar cliente" placeholder="Buscar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="chips">{[["", "Todos"], ["NEW", "Novos"], ["NEGOTIATING", "Conversando"], ["VISIT_SCHEDULED", "Visita"], ["DOCS_REQUESTED", "Documentos"]].map(([k, r]) =>
              <button type="button" key={k} className={cliFase === k ? "on" : ""} onClick={() => setCliFase(k)}>{r}</button>)}</div>
            {ativos.filter((l) => (!cliFase || l.status === cliFase || (cliFase === "NEW" && l.status === "IN_PROGRESS")) && (!busca || (l.name || "").toLowerCase().includes(busca.toLowerCase())))
              .slice(0, 200).map((l) => (
                <button key={l.id} type="button" className="card" onClick={() => setSelId(l.id)}>
                  <div className="row"><b>{l.name}</b><span className={`tag ${esperando(l) ? "t-resp" : l.status === "NEW" ? "t-new" : l.status === "VISIT_SCHEDULED" ? "t-vis" : "t-mut"}`}>{esperando(l) ? "Respondeu" : STATUS_TXT[l.status] || l.status}</span></div>
                  <span className="meta">{linhaMeta(l) || origem(l) || "—"}</span>
                </button>))}
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
            <div className="card plain"><span className="lbl" style={{ margin: 0 }}>Tempo até o 1º contato</span>
              <span className="num">{trilha?.min_1o_contato != null ? (trilha.min_1o_contato < 60 ? `${trilha.min_1o_contato} min` : `${Math.round(trilha.min_1o_contato / 60)}h`) : "—"}</span>
              <span className="meta">{trilha?.min_1o_contato != null ? `metade dos seus leads de ${MES()} foi chamada até aí` : "aparece quando você chamar os leads novos pelo Comandra"}{trilha?.min_1o_contato_equipe != null ? ` · equipe: ${trilha.min_1o_contato_equipe < 60 ? trilha.min_1o_contato_equipe + " min" : Math.round(trilha.min_1o_contato_equipe / 60) + "h"}` : ""}</span></div>
            <div className="card plain"><span className="lbl" style={{ margin: 0 }}>Trilha de {MES()} · {metaVendas} apartamento{metaVendas > 1 ? "s" : ""}</span>
              <span className="meta">{metaDoGerente ? `meta sugerida pelo seu gerente${perfil?.gerente ? ", " + perfil.gerente : ""}` : "meta padrão: 1 por corretor"}</span>
              {([["Clientes atendidos", atMes, alvoMes.atendidos], ["Visitas atendidas", visMes, alvoMes.visitas], ["Documentos (pastas)", docsMes, alvoMes.docs], ["Venda", vendasMes, metaVendas]] as [string, number, number][]).map(([n, a, m]) => (
                <div key={n} style={{ display: "grid", gap: 4 }}><div className="gl"><span>{n}</span><span>{a} de {m}</span></div><div className="prog"><i style={{ width: `${Math.min(100, (100 * a) / Math.max(1, m))}%` }} /></div></div>))}
              <span className="meta">Quanto mais você faz, menor fica a meta dos próximos dias.</span></div>
            <div className="card plain"><span className="lbl" style={{ margin: 0 }}>Por que esses números</span>
              <span className="meta">A cada 5 visitas atendidas sai 1 venda, e a cada 3 pastas com documentos sai 1 venda. Em dias úteis: 3 clientes atendidos por dia, 1 visita a cada 4 dias e 1 pasta a cada semana e meia.
                {trilha?.fonte === "c2s_junix" ? " Visitas pelo check-in do plantão e pastas e vendas pelo Junix." : " Visitas e documentos contam pelo que você marca na ficha (Veio, Documentos)."}</span></div>
            <a className="btn" style={{ textAlign: "center", textDecoration: "none" }} href="/painel-completo">Painel completo (simulador, Fecha a Conta) ↗</a>
            <button className="btn" type="button" onClick={() => signOut()}>Sair da conta</button>
          </>}
        </main>

        <nav className="nav" aria-label="Seções">
          {([["hoje", "☀️", "Hoje"], ["cli", "👥", "Clientes"], ["pes", "🎣", "Pescar"], ["disp", "📣", "Disparar"], ["eu", "👤", "Eu"]] as [Aba, string, string][]).map(([k, i, r]) => (
            <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => { setAba(k); setFiltro(""); }} aria-current={aba === k ? "page" : undefined}>
              {k === "hoje" && nNew > 0 && <span className="pip">{nNew}</span>}<i>{i}</i>{r}</button>))}
        </nav>
      </div>

      {sel && <Ficha lead={sel} userId={uid} revelado={revelados.has(sel.id)} onFechar={() => setSelId(null)}
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
      {agendar && (() => { const l = leads.find((x) => x.id === agendar); return (
        <AgendarVisita leadId={agendar} nome={l?.name || null} brokerId={uid} onFechar={() => setAgendar(null)}
          onFeito={(resumo) => { setAgendar(null); atualizar(); toast.success(resumo); }} />); })()}
    </div>
  );
}
