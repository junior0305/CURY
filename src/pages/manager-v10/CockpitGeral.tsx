// Cockpit Geral de Comando (mockup aprovado pelo Junior, 15/11: https://claude.ai/artifact/TJsADYSzcdHG3dUJUgV8SP).
// Tela de entrada do gestor numa rota PRÓPRIA (/manager/cockpit) para ver no ar sem derrubar a HojeGerente aprovada.
// Reusa EXATAMENTE os hooks da HojeGerente (useDadosEquipe/usePastas/usePeriodo/buscarPlantao) para os números baterem.
// Blocos: Dados de Agora clicáveis (plantão/online/atendimento), cartões (meta, fechamento, plantão, leads de anúncio),
// projeção honesta (conta à mostra), pacing semana × passada, gráfico semana a semana, "o que fazer" e a tropa com
// roleta de 1 clique. Repassar abre o RedistribuirDrawer (escolhe 1+ corretores, divide) — nada de toast fake.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { useDadosEquipe, ORIGENS, origemDe, chaveCliente, type LeadH, type Origem } from "@/hooks/useDadosEquipe";
import { usePastas } from "@/hooks/usePastas";
import { usePeriodo, diaSP, getSegunda } from "@/hooks/usePeriodo";
import { diasUteisRestantes } from "@/hooks/useManagerV10";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { buscarPlantao } from "@/utils/c2sMatching";
import { chaveNome, chaveGerente, gerenteC2S } from "@/hooks/useDiretoria";
import { atendido, esperando, ehPago } from "@/lib/situacaoLead";
import { cobrarFila } from "@/hooks/useLeads";
import RedistribuirDrawer, { type CorretorRico } from "@/components/leads/RedistribuirDrawer";

const sb = supabase as any;
const nf = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const somaDias = (dia: string, n: number) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ini2 = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();
const pctN = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const ENCERRADO = new Set(["CONCLUDED", "EXCLUDED", "ABANDONED", "LOST"]);
const AVANCOU = new Set(["VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "NEGOTIATING", "CONCLUDED"]);
type Metrica = "leads" | "checkins" | "visitas" | "pastas" | "vendas";
type PainelTipo = "plantao" | "online" | "atendimento" | "leads" | "fechamento";

export default function CockpitGeral() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const qc = useQueryClient();
  const managerId = useEffectiveManagerId() ?? session?.user?.id ?? "";
  const como = managerId !== session?.user?.id ? managerId : undefined;
  loadFonts();

  const { data: pastasData } = usePastas(managerId);
  const { periodo: per } = usePeriodo();
  const [metrica, setMetrica] = useState<Metrica>("leads");
  const [painel, setPainel] = useState<PainelTipo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [repassar, setRepassar] = useState<{ nome: string; leadIds: string[] } | null>(null);
  const [indo, setIndo] = useState(false);

  const hoje = diaSP(new Date());
  const segAtual = getSegunda(new Date());
  const segPassada = somaDias(segAtual, -7);
  const domPassado = somaDias(segAtual, -1);
  const iniMes = hoje.slice(0, 8) + "01";
  const segIniMes = getSegunda(new Date(iniMes + "T12:00:00Z"));
  const desde = [segIniMes, segPassada, per.de].sort()[0];
  const { v10, brokers, leads, origens, metricas, vendas } = useDadosEquipe(managerId, desde);
  const diasParaFechar = 7 - (new Date(hoje + "T12:00:00Z").getUTCDay() || 7);

  // ── plantão de hoje (C2S, mesma conta da HojeGerente) ──
  const { data: plantaoHoje } = useQuery({
    queryKey: ["cg-plantao", managerId],
    enabled: !!managerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: ger }, plantao] = await Promise.all([
        sb.from("profiles").select("first_name").eq("id", managerId).maybeSingle(),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => [] as any[]),
      ]);
      const kg = chaveGerente((ger as any)?.first_name);
      const daEquipe = (plantao as any[]).filter((r) => r.created_at?.slice(0, 10) >= hoje && chaveGerente(gerenteC2S(r.gerente)) === kg);
      return new Set(daEquipe.map((r) => chaveNome(r.corretor)));
    },
  });
  const noPlantao = (nome: string | null) => !!plantaoHoje?.has(chaveNome(nome));

  // ── presença ao vivo (online/roleta) de cada corretor ──
  const { data: presenca } = useQuery({
    queryKey: ["cg-presenca", managerId, brokers.length],
    enabled: brokers.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = (await sb.from("profiles").select("id,last_seen_at,lead_assignment_enabled,roleta_entrou_em").in("id", brokers.map((b) => b.id))).data ?? [];
      const m = new Map<string, { online: boolean; roleta: boolean; visto: number }>();
      for (const p of r) m.set(p.id, {
        online: !!p.last_seen_at && (Date.now() - new Date(p.last_seen_at).getTime()) < 15 * 60_000,
        roleta: p.lead_assignment_enabled !== false,
        visto: p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0,
      });
      return m;
    },
  });

  const pagos = useMemo(() => leads.filter((l) => ehPago(l)), [leads]);
  const diaL = (l: LeadH) => diaSP(new Date(l.created_at));
  const entre = (d: string, a: string, b: string) => d >= a && d <= b;
  const pastas = pastasData?.minhas ?? [];
  const ativos = useMemo(() => pagos.filter((l) => !ENCERRADO.has(l.status ?? "")), [pagos]);
  const nomeBroker = (id: string | null) => brokers.find((b) => b.id === id)?.first_name ?? "sem corretor";
  const atendendoRecente = (l: LeadH) => {
    const r = l.last_lead_response_at ? Date.now() - new Date(l.last_lead_response_at).getTime() : Infinity;
    return r < 2 * 3.6e6;
  };

  // ── janelas (semana, semana passada, período, mês) ──
  const janela = (a: string, b: string) => {
    const ls = pagos.filter((l) => entre(diaL(l), a, b));
    const ms = metricas.filter((m) => entre(m.data, a, b));
    return {
      leads: ls.length,
      contato: ls.length ? Math.round((ls.filter((l) => atendido(l)).length / ls.length) * 100) : 0,
      atendidos: ls.filter((l) => atendido(l)).length,
      visitas: ms.reduce((s, m) => s + (m.atendimentos || 0), 0),
      checkins: ms.reduce((s, m) => s + (m.checkins || 0), 0),
      pastas: pastas.filter((p) => p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm)), a, b)).length,
      vendas: vendas.filter((v) => entre(v.dia, a, b)).length,
    };
  };
  const sem = janela(segAtual, hoje);
  const semAnt = janela(segPassada, domPassado);
  const doPer = janela(per.de, per.ate);
  const doMes = janela(iniMes, hoje);
  const funilDoMes = per.de === per.ate;
  const doFunil = funilDoMes ? doMes : doPer;

  // ── mês / meta / projeção ──
  const meta = v10?.metaMes ?? null;
  const vendasMes = doMes.vendas;
  const vgvMes = vendas.filter((v) => v.dia >= iniMes).reduce((s, v) => s + v.vgv, 0);
  const d0 = new Date(hoje + "T12:00:00Z");
  const diasNoMes = new Date(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0).getDate();
  const projecao = Math.round((vendasMes / Math.max(1, d0.getUTCDate())) * diasNoMes);
  const restantes = diasUteisRestantes(new Date());
  const pctMeta = meta ? Math.min(100, Math.round((vendasMes / meta) * 100)) : null;
  const faltam = meta ? Math.max(0, meta - vendasMes) : null;

  // ── em fechamento (Laudo/Proposta/Emissão) ──
  const fechamento = pastas.filter((p) => p.etapaOrdem >= 6 && p.etapaOrdem <= 9).sort((a, b) => b.etapaOrdem - a.etapaOrdem || b.dias - a.dias);
  const provaveis = fechamento.filter((p) => p.etapaOrdem >= 7).length;
  const vgvFechamento = fechamento.reduce((s, p) => s + (Number((p as any).vgv) || 0), 0);

  // ── projeção honesta: pipeline que ainda pode virar venda ──
  const pastasCredito = pastas.filter((p) => p.etapaOrdem >= 4 && p.etapaOrdem <= 9).length;
  const estPastas = Math.round(pastasCredito * 0.37);
  const estVisitas = Math.round(doMes.visitas * 0.28);
  const estPipe = estPastas + estVisitas;

  // ── leads de hoje (só anúncio) ──
  const leadsHojeAnuncio = useMemo(() => pagos.filter((l) => diaL(l) === hoje && origemDe(l) === "anuncio"), [pagos, hoje]);
  const leadsHojeSemContato = leadsHojeAnuncio.filter((l) => !atendido(l)).length;

  // ── dados de agora ──
  const online = useMemo(() => brokers.filter((b) => presenca?.get(b.id)?.online), [brokers, presenca]);
  const noPlantaoLista = useMemo(() => brokers.filter((b) => noPlantao(b.first_name)), [brokers, plantaoHoje]);
  const atendendoIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of ativos) if (atendendoRecente(l) && l.broker_id) s.add(l.broker_id);
    return s;
  }, [ativos]);
  const atendendoLista = useMemo(() => brokers.filter((b) => atendendoIds.has(b.id)), [brokers, atendendoIds]);

  // ── "o que fazer para salvar a semana" ──
  const esperandoLista = ativos.filter((l) => {
    if (!esperando(l)) return false;
    const h = (Date.now() - new Date(l.last_lead_response_at as string).getTime()) / 3.6e6;
    return h >= 0.5 && h <= 48;
  });
  const inicioHoje = new Date(`${hoje}T03:00:00Z`).getTime();
  const semEntrar = brokers.map((b) => ({
    nome: b.first_name ?? "—",
    n: ativos.filter((l) => l.broker_id === b.id && Date.now() - new Date(l.created_at).getTime() < 2 * 864e5 && !atendido(l)).length,
    visto: presenca?.get(b.id)?.visto ?? 0,
  })).filter((x) => x.n > 0 && x.visto < inicioHoje).sort((a, b) => b.n - a.n);
  const pastasParadas = pastas.filter((p) => p.etapaOrdem >= 4 && p.etapaOrdem <= 9 && p.dias >= 4);

  // ── pacing semana × passada ──
  const comp: { k: string; a: number; b: number; txt?: (n: number) => string; cor: string }[] = [
    { k: "Leads pagos", a: sem.leads, b: semAnt.leads, cor: "var(--brand,#1F5C9E)" },
    { k: "Com contato", a: sem.contato, b: semAnt.contato, txt: (n) => `${n}%`, cor: sem.contato < semAnt.contato ? "#B4322A" : "#1D6B45" },
    { k: "Visitas", a: sem.visitas, b: semAnt.visitas, cor: "var(--brand,#1F5C9E)" },
    { k: "Check-ins", a: sem.checkins, b: semAnt.checkins, cor: "var(--brand,#1F5C9E)" },
    { k: "Pastas", a: sem.pastas, b: semAnt.pastas, cor: "var(--brand,#1F5C9E)" },
    { k: "Vendas", a: sem.vendas, b: semAnt.vendas, cor: "#1D6B45" },
  ];
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : a > 0 ? 100 : 0);

  // ── gráfico mês semana a semana (mesma lógica da HojeGerente) ──
  const semanas = useMemo(() => {
    const out: { ini: string; fim: string }[] = [];
    for (let s = segIniMes; s.slice(0, 7) <= hoje.slice(0, 7) && out.length < 6; s = somaDias(s, 7)) {
      if (somaDias(s, 6) < iniMes) continue;
      out.push({ ini: s, fim: somaDias(s, 6) });
    }
    while (out.length < 6 && out[out.length - 1] && somaDias(out[out.length - 1].fim, 1).slice(5, 7) === iniMes.slice(5, 7)) {
      const s = somaDias(out[out.length - 1].fim, 1);
      out.push({ ini: s, fim: somaDias(s, 6) });
    }
    return out;
  }, [segIniMes, iniMes, hoje]);
  const ROT: Record<Metrica, string> = { leads: "Leads", checkins: "Check-ins", visitas: "Visitas", pastas: "Pastas", vendas: "Vendas" };
  const origemCliente = (nome: string | null | undefined): Origem => origens?.porNome.get(chaveCliente(nome)) ?? "sem";
  const fatias = (a: string, b: string): { total: number; partes: Partial<Record<Origem, number>> } => {
    const partes: Partial<Record<Origem, number>> = {};
    const soma = (o: Origem, n = 1) => { partes[o] = (partes[o] ?? 0) + n; };
    if (metrica === "leads") {
      for (const l of pagos) if (entre(diaL(l), a, b)) { const o = origemDe(l); if (o === "anuncio" || o === "disparo") soma(o); }
    } else if (metrica === "checkins") {
      const n = metricas.filter((m) => entre(m.data, a, b)).reduce((s, m) => s + (m.checkins || 0), 0);
      if (n) soma("plantao", n);
    } else if (metrica === "visitas") {
      for (const v of origens?.visitas ?? []) if (entre(v.dia, a, b)) soma(v.origem);
      const c2s = metricas.filter((m) => entre(m.data, a, b)).reduce((s, m) => s + (m.atendimentos || 0), 0);
      if (c2s) soma("plantao", c2s);
    } else if (metrica === "pastas") {
      for (const p of pastas) if (p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm)), a, b)) soma(origemCliente(p.cliente));
    } else {
      const total = vendas.filter((v) => entre(v.dia, a, b)).length;
      let conhecidas = 0;
      for (const p of pastas) {
        if (p.etapaOrdem !== 10 || !p.etapaDesde || !entre(diaSP(new Date(p.etapaDesde)), a, b) || conhecidas >= total) continue;
        const o = origemCliente(p.cliente);
        if (o !== "sem") { soma(o); conhecidas++; }
      }
      if (total - conhecidas > 0) soma("sem", total - conhecidas);
    }
    return { total: Object.values(partes).reduce((s, n) => s + (n ?? 0), 0), partes };
  };
  const barras = semanas.map((w, i) => {
    const futura = w.ini > hoje;
    const f = futura ? null : fatias(w.ini, w.fim < hoje ? w.fim : hoje);
    return { ...w, i, v: f ? f.total : null, atual: w.ini === segAtual, futura };
  });
  const maxB = Math.max(1, ...barras.map((b) => b.v ?? 0));

  // ── tropa (corretores com presença + produção real) ──
  const tropa = useMemo(() => {
    return brokers.map((b) => {
      const meus = ativos.filter((l) => l.broker_id === b.id);
      const toc = meus.filter((l) => atendido(l)).length;
      const adv = meus.filter((l) => AVANCOU.has(l.status ?? "")).length;
      const semToque = meus.filter((l) => !atendido(l)).length;
      const pr = presenca?.get(b.id);
      return {
        id: b.id, nome: b.first_name ?? "—",
        carteira: meus.length, semToque, contato: pctN(toc, meus.length), avanca: pctN(adv, Math.max(1, toc)),
        vendas: vendas.filter((v) => v.corretor === chaveNome(b.first_name) && v.dia >= iniMes).length,
        online: !!pr?.online, roleta: pr?.roleta ?? true, plantao: noPlantao(b.first_name),
        atendendo: atendendoIds.has(b.id),
      };
    }).sort((a, b) => b.semToque - a.semToque || b.carteira - a.carteira);
  }, [brokers, ativos, presenca, vendas, plantaoHoje, atendendoIds]);
  const naRoleta = tropa.filter((t) => t.roleta).length;
  const pedindoRoleta = useMemo(() => tropa.filter((t) => t.plantao && !t.roleta), [tropa]);

  const ricos: CorretorRico[] = useMemo(() => tropa.map((t) => ({
    id: t.id, nome: t.nome, carteira: t.carteira, contato: t.contato, avanca: t.avanca, online: t.online, plantao: t.plantao,
  })), [tropa]);

  // ── ações ──
  const alternarRoleta = async (id: string, nome: string, on: boolean) => {
    setOcupado(id);
    try {
      await definirRecebimento(id, !on);
      toast.success(`${nome} ${!on ? "entrou na" : "saiu da"} roleta (vale até meia-noite).`);
      qc.invalidateQueries({ queryKey: ["cg-presenca", managerId] });
    } catch (e: any) { toast.error(`Não consegui mudar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  };
  const abrirRepassar = (brokerId: string, nome: string) => {
    const ids = ativos.filter((l) => l.broker_id === brokerId && !atendido(l)).map((l) => l.id);
    if (!ids.length) { toast.info(`${nome} não tem lead sem atendimento para repassar.`); return; }
    setRepassar({ nome, leadIds: ids });
  };
  const confirmarRepasse = async (destinoIds: string[]) => {
    if (!repassar || !destinoIds.length || indo) return;
    setIndo(true);
    try {
      const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: repassar.leadIds, p_para: destinoIds, p_como: como || null, p_motivo: "Repasse pelo Cockpit Geral" });
      if (error) throw error;
      toast.success(`${r?.feitos ?? 0} repassado(s)${r?.pulados ? ` · ${r.pulados} pulado(s)` : ""}.`);
      setRepassar(null);
      qc.invalidateQueries({ queryKey: ["hoje-leads", managerId] });
    } catch (e: any) { toast.error(e?.message ?? "Não consegui repassar."); } finally { setIndo(false); }
  };
  const cobrar = async (ids: string[], nome: string) => {
    if (!ids.length) { toast.info(`${nome} não tem lead parado para cobrar.`); return; }
    try { const r = await cobrarFila(ids, managerId, "cockpit"); const ok = r.corretores.filter((c) => c.avisado_no_whats).length;
      toast.success(ok ? `Cobrado no WhatsApp.` : "Cobrança registrada."); }
    catch (e: any) { toast.error(e?.message ?? "Não consegui cobrar."); }
  };

  const nome = v10?.manager?.first_name || "Gestor";

  return (
    <div className={`mgr10 app2 cgx ${mode === "light" ? "cgx-light" : "cgx-dark"}`}>
      <style>{CSS}</style>
      <RailV10 atual="tempo" sub={`${nome} · ${brokers.length} corretores`} mode={mode} toggle={toggle} />

      <main className="shell2 cg">
        <header className="cg-top">
          <div>
            <h1>Cockpit Geral de Comando</h1>
            <p>Semana de {dm(segAtual)} a {dm(somaDias(segAtual, 6))} · <b>{diasParaFechar === 0 ? "a semana fecha hoje à meia-noite" : `faltam ${diasParaFechar} dia${diasParaFechar > 1 ? "s" : ""} para fechar`}</b></p>
            <div className="cg-agora">
              <span className="cg-agora-lbl">● Dados de agora:</span>
              <button className="cg-badge" onClick={() => setPainel("plantao")}><span className="cg-dot azul" /> <b>{noPlantaoLista.length} no plantão</b> <span className="cg-ver">ver ▾</span></button>
              <button className="cg-badge" onClick={() => setPainel("online")}><span className="cg-dot verde" /> <b>{online.length} logados</b> <span className="cg-ver">ver ▾</span></button>
              <button className="cg-badge" onClick={() => setPainel("atendimento")}><span className="cg-dot ambar" /> <b>{atendendoLista.length} em atendimento</b> <span className="cg-ver">ver ▾</span></button>
              {pedindoRoleta.length > 0 && (
                <button className="cg-badge cg-pulse" onClick={() => setPainel("plantao")}>
                  <span className="cg-dot roxo" /> <b>✋ {pedindoRoleta.length} no plantão fora da roleta</b> <span className="cg-mini">ativar</span>
                </button>
              )}
            </div>
          </div>
          <SeletorPeriodo />
        </header>

        {/* ── cartões ── */}
        <section className="cg-cards">
          <article className="cg-card hero">
            <div className="cg-card-h"><span>Vendas do mês &amp; meta</span>{meta != null && <span className="cg-tag verde">Meta {meta}</span>}</div>
            <div className="cg-val"><b>{vendasMes}</b>{meta != null && <i>/ {meta}</i>}</div>
            {pctMeta != null && <div className="cg-bar"><div className="cg-bar-fill" style={{ width: `${pctMeta}%` }} /></div>}
            <div className="cg-card-f"><span>VGV <b>{brl(vgvMes)}</b></span>{pctMeta != null && <span className="cg-verde">{pctMeta}%</span>}</div>
            {faltam != null && faltam > 0 && <div className="cg-card-nota">Faltam <b>{faltam} venda{faltam > 1 ? "s" : ""}</b> para 100% · ~{restantes} dias úteis</div>}
          </article>

          <article className="cg-card click" onClick={() => setPainel("fechamento")}>
            <div className="cg-card-h"><span>Em fechamento</span><span className="cg-tag roxo">Pastas quentes</span></div>
            <div className="cg-val"><b className="roxo">{fechamento.length}</b><i>pastas</i></div>
            <div className="cg-card-f"><span>Prováveis até domingo</span><b>{provaveis}</b></div>
            <div className="cg-card-nota roxoNota">Clique p/ ver as pastas quentes ▾</div>
          </article>

          <article className="cg-card click" onClick={() => setPainel("plantao")}>
            <div className="cg-card-h"><span>Plantão hoje</span><span className="cg-tag azul">C2S</span></div>
            <div className="cg-val"><b className="azul">{noPlantaoLista.length}</b><i>check-ins</i></div>
            <div className="cg-card-f"><span>No time</span><b>{brokers.length} corretores</b></div>
            <div className="cg-card-nota azul">Clique p/ ver quem está no stand ▾</div>
          </article>

          <article className="cg-card click" onClick={() => setPainel("leads")}>
            <div className="cg-card-h"><span>Leads hoje</span><span className="cg-tag azul">Só anúncio</span></div>
            <div className="cg-val"><b className="azul">{leadsHojeAnuncio.length}</b><i>novos</i></div>
            <div className="cg-card-f"><span>Sem contato ainda</span><b className={leadsHojeSemContato ? "ambar" : "verde"}>{leadsHojeSemContato}</b></div>
            <div className="cg-card-nota azul">Clique p/ atender agora ▾</div>
          </article>
        </section>

        {/* ── projeção honesta ── */}
        <section className="cg-pred">
          <div className="cg-pred-box">
            <div className="cg-pred-h">🧠 Projeção de fechamento do mês</div>
            <div className="cg-pred-val">{Math.max(vendasMes, Math.min(projecao, vendasMes + estPipe))} a {vendasMes + estPipe}<span> vendas</span></div>
            <div className="cg-pred-sub">{meta != null && <>Meta {meta} · </>}<b>{vendasMes} já fechada{vendasMes !== 1 ? "s" : ""}</b> + pipeline abaixo</div>
            <div className="cg-pred-nota">Cenário a partir do funil real do Junix e C2S, não é promessa. ~{restantes} dias úteis no mês.</div>
          </div>
          <div className="cg-pred-fatores">
            <div className="cg-pred-tit">Como chegamos nessa conta — pipeline que ainda pode virar venda:</div>
            <div className="cg-pred-grid">
              <div className="cg-fator"><span>Pastas em crédito</span><b className="roxo">{pastasCredito} ativas</b><i>taxa 37% ➔ ~{estPastas} vendas</i></div>
              <div className="cg-fator"><span>Visitas no mês</span><b className="azul">{doMes.visitas}</b><i>taxa 28% ➔ ~{estVisitas} vendas</i></div>
              <div className="cg-fator"><span>Leads na esteira</span><b className="brand">{doMes.leads}</b><i>alimentam o topo do funil</i></div>
            </div>
            <div className="cg-pred-rod">Somando o pipeline ≈ {estPipe} venda(s) além das já fechadas. Taxas recalculadas a cada venda registrada no Junix.</div>
          </div>
        </section>

        {/* ── pacing semana × passada ── */}
        <section className="cg-pacing">
          <div className="cg-sec-h"><h2>Esta semana × semana passada</h2><span>esta: {dm(segAtual)} → hoje · passada: {dm(segPassada)} a {dm(domPassado)}</span></div>
          <div className="cg-pacing-grid">
            {comp.map((c) => (
              <div className="cg-pcol" key={c.k}>
                <span className="cg-pcol-t">{c.k}</span>
                <div className="cg-pcol-n" style={{ color: c.cor }}>{c.txt ? c.txt(c.a) : nf(c.a)} <i>/ {c.txt ? c.txt(c.b) : nf(c.b)}</i></div>
                <div className="cg-pbar"><div className="cg-pbar-f" style={{ width: `${pct(c.a, c.b)}%`, background: c.cor }} /></div>
              </div>
            ))}
          </div>
        </section>

        {/* ── gráfico semana a semana + o que fazer ── */}
        <div className="cg-duas">
          <div className="cg-box">
            <div className="cg-box-h"><h2>{hoje.slice(5, 7) === per.de.slice(5, 7) ? "Mês" : "Período"} semana a semana</h2><span>segunda a domingo</span></div>
            <div className="cg-mtabs">
              {(["leads", "checkins", "visitas", "pastas", "vendas"] as Metrica[]).map((m) => (
                <button key={m} className={`cg-mtab${metrica === m ? " on" : ""}`} onClick={() => setMetrica(m)}>{ROT[m]}</button>
              ))}
            </div>
            <div className="cg-chart">
              {barras.map((b) => (
                <div className="cg-col" key={b.i}>
                  <span className="cg-col-v" style={b.atual ? { color: "var(--brand,#1F5C9E)" } : b.futura ? { color: "var(--cv-text-dim,#8A97A8)" } : {}}>{b.v == null ? "—" : nf(b.v)}</span>
                  <div className={`cg-pillar${b.atual ? " atual" : ""}`} style={{ height: `${b.v == null ? 3 : Math.max(4, Math.round((b.v / maxB) * 120))}px` }} />
                  <span className="cg-col-l"><b style={b.atual ? { color: "var(--brand,#1F5C9E)" } : {}}>{dm(b.ini)}</b>{b.atual && <em>agora</em>}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cg-box">
            <div className="cg-box-h"><h2>O que fazer para salvar a semana</h2></div>
            <div className="cg-acoes">
              {semEntrar.length > 0 && (
                <div className="cg-acao amb">
                  <div><b>{semEntrar.length} corretor{semEntrar.length > 1 ? "es" : ""} com lead na mão sem tocar hoje</b>
                    <i>{semEntrar.slice(0, 3).map((x) => `${x.nome} ${x.n}`).join(" · ")}</i></div>
                </div>
              )}
              {esperandoLista.length > 0 && (
                <div className="cg-acao azu">
                  <div><b>{esperandoLista.length} cliente{esperandoLista.length > 1 ? "s" : ""} respondeu e está sem retorno (+30min)</b>
                    <i>o maior atraso é com {nomeBroker(esperandoLista[0]?.broker_id)}</i></div>
                </div>
              )}
              {pastasParadas.length > 0 && (
                <div className="cg-acao rox">
                  <div><b>{pastasParadas.length} pasta{pastasParadas.length > 1 ? "s" : ""} parada{pastasParadas.length > 1 ? "s" : ""} há 4 dias ou mais</b>
                    <i>documentação ou análise pendente</i></div>
                  <Link className="cg-acao-link" to="/manager/pastas">Ver pastas</Link>
                </div>
              )}
              {!semEntrar.length && !esperandoLista.length && !pastasParadas.length && (
                <div className="cg-acao ok"><div><b>Nada pegando fogo agora ✓</b><i>plantão, contatos e pastas sob controle</i></div></div>
              )}
            </div>
          </div>
        </div>

        {/* ── tropa + roleta ── */}
        <section className="cg-panel">
          <div className="cg-panel-h">
            <div><h3>Presença da tropa &amp; roleta</h3><span>{naRoleta} de {brokers.length} na roleta · ligue/pause com 1 clique</span></div>
          </div>
          <div className="cg-tbl">
            <div className="cg-tr cg-th">
              <span>Corretor</span><span>Plantão</span><span>CRM</span><span>Produção</span><span>Roleta</span><span className="r">Ações rápidas</span>
            </div>
            {tropa.map((t) => (
              <div className="cg-tr" key={t.id}>
                <span className="cg-corr">
                  <span className="cg-av" style={{ borderColor: t.online ? "#10B981" : "var(--cv-border,#2A3A58)" }}>{ini2(t.nome)}</span>
                  <span><b>{t.nome}</b><small>{t.carteira} na carteira{t.semToque ? ` · ${t.semToque} sem toque` : ""}</small></span>
                </span>
                <span>{t.plantao ? <em className="cg-b azul">🏢 no stand</em> : <em className="cg-b cinza">—</em>}</span>
                <span>{t.online ? <em className="cg-b verde">● online</em> : <em className="cg-b cinza">○ ausente</em>}</span>
                <span className="cg-prod"><b>{t.vendas}</b> venda{t.vendas !== 1 ? "s" : ""}{t.contato != null ? <small> · {t.contato}% contato</small> : null}</span>
                <span>
                  <button className={`cg-rol${t.roleta ? " on" : " off"}`} disabled={ocupado === t.id} onClick={() => alternarRoleta(t.id, t.nome, t.roleta)}>
                    {t.roleta ? "● Na roleta" : "○ Pausado"}
                  </button>
                </span>
                <span className="r cg-acts">
                  <button className="cg-act rep" onClick={() => abrirRepassar(t.id, t.nome)}>⚡ Repassar</button>
                  <button className="cg-act cob" onClick={() => cobrar(ativos.filter((l) => l.broker_id === t.id && !atendido(l)).map((l) => l.id), t.nome)}>💬 Cobrar</button>
                  <Link className="cg-act ver" to={`/manager/leads?corretor=${t.id}`}>👁️ Ver</Link>
                </span>
              </div>
            ))}
            {!tropa.length && <div className="cg-vazio">Sem corretores na equipe.</div>}
          </div>
        </section>
      </main>

      {/* ── painel lateral: dados de agora / leads de hoje ── */}
      {painel && (
        <div className="cg-scrim" onClick={(e) => { if (e.target === e.currentTarget) setPainel(null); }}>
          <aside className="cg-side">
            <header className="cg-side-h">
              <div>
                <h3>{painel === "plantao" ? "Quem está no plantão" : painel === "online" ? "Quem está logado no CRM" : painel === "atendimento" ? "Quem está em atendimento" : painel === "fechamento" ? "Pastas em fechamento" : "Leads de hoje · só anúncio"}</h3>
                <p>{painel === "plantao" ? "Check-in físico no stand (C2S) hoje." : painel === "online" ? "Ativos no Comandra nos últimos 15 minutos." : painel === "atendimento" ? "Cliente respondeu nas últimas 2 horas." : painel === "fechamento" ? "Laudo, Proposta e Emissão — podem virar venda em dias." : `${leadsHojeAnuncio.length} novos · ${leadsHojeSemContato} sem contato.`}</p>
              </div>
              <button className="cg-side-x" onClick={() => setPainel(null)}>✕</button>
            </header>
            <div className="cg-side-b">
              {painel === "fechamento" ? (
                fechamento.length ? fechamento.map((p) => (
                  <div className="cg-lrow" key={(p as any).proposta_id ?? p.cliente}>
                    <span className="cg-lrow-i"><b>{p.cliente}</b><small>{p.corretor || "sem corretor"} · {p.etapa}</small></span>
                    <span className="cg-b" style={{ color: p.dias >= 4 ? "#C77700" : "#0D7C66", background: "transparent", whiteSpace: "nowrap" }}>parada há {p.dias}d</span>
                  </div>
                )) : <p className="cg-vazio">Nenhuma pasta em fechamento agora.</p>
              ) : painel === "leads" ? (
                leadsHojeAnuncio.length ? leadsHojeAnuncio.map((l) => {
                  const esp = Math.round((Date.now() - new Date(l.last_lead_response_at ?? l.created_at).getTime()) / 6e4);
                  const alerta = !atendido(l) && esp >= 60;
                  return (
                    <div className={`cg-lead${alerta ? " urg" : ""}`} key={l.id}>
                      <div className="cg-lead-top">
                        <div><div className="cg-lead-n">{l.name || "Lead"}</div><div className="cg-lead-m">com <b>{nomeBroker(l.broker_id)}</b> · {l.fb_campaign || "anúncio"}</div></div>
                        <span className={`cg-lead-e ${atendido(l) ? "ok" : alerta ? "al" : "ok"}`}>{atendido(l) ? "em atendimento" : alerta ? `há ${Math.floor(esp / 60)}h${String(esp % 60).padStart(2, "0")} sem toque` : "novo"}</span>
                      </div>
                      <div className="cg-lead-acts">
                        <button className="cg-lead-b cham" onClick={() => cobrar([l.id], nomeBroker(l.broker_id))}>📣 Chamar corretor</button>
                        <button className="cg-lead-b mud" onClick={() => { setPainel(null); setRepassar({ nome: l.name || "lead", leadIds: [l.id] }); }}>🔄 Mudar lead</button>
                      </div>
                    </div>
                  );
                }) : <p className="cg-vazio">Nenhum lead de anúncio hoje.</p>
              ) : (
                (painel === "plantao" ? noPlantaoLista : painel === "online" ? online : atendendoLista).length ? (
                  (painel === "plantao" ? noPlantaoLista : painel === "online" ? online : atendendoLista).map((b) => {
                    const t = tropa.find((x) => x.id === b.id);
                    const cor = painel === "plantao" ? "#38BDF8" : painel === "atendimento" ? "#F59E0B" : "#10B981";
                    return (
                      <div className="cg-lrow" key={b.id}>
                        <span className="cg-av sm" style={{ borderColor: cor }}>{ini2(b.first_name ?? "?")}</span>
                        <span className="cg-lrow-i"><b>{b.first_name ?? "—"}</b><small>{t ? `${t.carteira} na carteira${t.semToque ? ` · ${t.semToque} sem toque` : ""}` : ""}</small></span>
                        {t && <span className="cg-b" style={{ color: cor, background: "transparent" }}>{t.roleta ? "na roleta" : "pausado"}</span>}
                      </div>
                    );
                  })
                ) : <p className="cg-vazio">Ninguém neste estado agora.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── drawer de repasse (escolhe 1+ corretores) ── */}
      {repassar && (
        <RedistribuirDrawer n={repassar.leadIds.length} corretores={ricos} indo={indo}
          onConfirm={(ids) => confirmarRepasse(ids)} onFechar={() => setRepassar(null)} />
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap');

/* ── paleta do mockup (escuro padrão + claro) escopada no cockpit ── */
.cgx.cgx-dark{
  --cgbg:#070B14;--surf:#0E1626;--card:#131E33;--sub:#192640;--bd:#233558;--bds:#1A2844;
  --tx:#F8FAFC;--tm:#94A3B8;--td:#64748B;--sh:0 8px 24px rgba(0,0,0,.45);--shs:0 2px 8px rgba(0,0,0,.35);
}
.cgx.cgx-light{
  --cgbg:#EEF2F8;--surf:#FFFFFF;--card:#FFFFFF;--sub:#EDF1F7;--bd:#D7DFEC;--bds:#E6ECF4;
  --tx:#0F1B2D;--tm:#5B6B80;--td:#8A97A8;--sh:0 8px 24px rgba(16,30,54,.10);--shs:0 1px 3px rgba(16,30,54,.08);
}
.cgx .shell2.cg{background:var(--cgbg);color:var(--tx);font-family:Archivo,system-ui,sans-serif}
.cg{display:flex;flex-direction:column;gap:20px;padding:0 34px 90px;zoom:1.12}
.cg>*{flex:0 0 auto;min-width:0}
.cg .mono,.cg-val,.cg-pred-val,.cg-pcol-n,.cg-col-v,.cg-prod{font-family:"JetBrains Mono",monospace}

.cg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;position:sticky;top:0;z-index:30;background:var(--cgbg);background:color-mix(in srgb,var(--cgbg) 94%,transparent);backdrop-filter:blur(14px);padding:18px 0 14px;border-bottom:1px solid var(--bd)}
.cg-top h1{font-size:26px;font-weight:900;letter-spacing:-.02em;color:var(--tx)}
.cg-top p{font-size:14.5px;color:var(--tm);margin-top:3px}
.cg-top p b{color:var(--amber,#F59E0B)}
.cg-agora{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:9px}
.cg-agora-lbl{font-size:13px;color:var(--tm);font-weight:700}
.cgx .cg-badge{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13px;font-weight:700;background:var(--surf);border:1px solid var(--bd);color:var(--tx);padding:5px 12px;border-radius:999px;cursor:pointer;transition:all .15s}
.cgx .cg-badge:hover{border-color:#38BDF8;transform:translateY(-1px)}
.cg-dot{width:7px;height:7px;border-radius:50%;flex:none}
.cg-dot.azul{background:#38BDF8;box-shadow:0 0 8px #38BDF8}.cg-dot.verde{background:#10B981;box-shadow:0 0 8px #10B981}.cg-dot.ambar{background:#F59E0B;box-shadow:0 0 8px #F59E0B}
.cg-dot.roxo{background:#C084FC;box-shadow:0 0 8px #C084FC}
@keyframes cgPulse{0%,100%{box-shadow:0 0 10px rgba(168,85,247,.35)}50%{box-shadow:0 0 22px rgba(168,85,247,.7)}}
@keyframes cgDot{0%,100%{opacity:1}50%{opacity:.4}}
.cg-dot{animation:cgDot 2s infinite}
.cgx .cg-badge.cg-pulse{background:linear-gradient(135deg,rgba(168,85,247,.22),rgba(245,158,11,.18));border:1.5px solid #A855F7;color:var(--tx);animation:cgPulse 2.4s infinite}
.cgx .cg-badge.cg-pulse:hover{background:rgba(168,85,247,.35);border-color:#C084FC;transform:translateY(-1px)}
.cg-mini{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#A855F7;color:#fff;padding:2px 7px;border-radius:999px}
.cgx .cg-act:active,.cgx .cg-rol:active,.cgx .cg-badge:active,.cgx .cg-lead-b:active{transform:scale(.96)}
.cgx.cgx-dark .cg-card:hover{box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 0 1px rgba(59,130,246,.35)}
.cgx.cgx-dark .cg-card.hero{box-shadow:0 4px 24px rgba(16,185,129,.22)}
.cg-ver{font-size:11px;color:var(--td);font-weight:800;text-transform:uppercase;letter-spacing:.03em}

/* cartões */
.cg-cards{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:14px}
.cg-card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shs);transition:all .2s}
.cg-card.click{cursor:pointer}
.cg-card:hover{border-color:#3b82f6;transform:translateY(-2px)}
.cg-card.hero{border:2px solid #10B981;background:linear-gradient(135deg,rgba(16,185,129,.16),rgba(14,165,233,.1));box-shadow:0 6px 22px rgba(16,185,129,.2)}
.cg-card-h{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--tm)}
.cg-tag{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:999px}
.cg-tag.verde{background:rgba(16,185,129,.2);color:#10B981;border:1px solid rgba(16,185,129,.4)}
.cg-tag.roxo{background:rgba(168,85,247,.2);color:#C084FC}.cg-tag.azul{background:rgba(56,189,248,.18);color:#38BDF8}
.cg-val{display:flex;align-items:baseline;gap:8px}
.cg-val b{font-size:40px;font-weight:900;line-height:1;color:var(--tx)}.cg-val i{font-style:normal;font-size:17px;color:var(--tm);font-weight:700}
.cg-val b.roxo,.roxo{color:#C084FC}.cg-val b.azul,.azul{color:#38BDF8}.cg-val b.brand,.brand{color:#38BDF8}.verde{color:#10B981}.ambar{color:#F59E0B}
.cg-bar{height:8px;border-radius:999px;background:var(--sub);overflow:hidden;margin:2px 0}
.cg-bar-fill{height:100%;border-radius:999px;background:#10B981;transition:width .4s}
.cg-card-f{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--tm)}
.cg-card-f b{color:var(--tx)}
.cg-card-nota{font-size:12px;color:var(--tm);border-top:1px solid var(--bds);padding-top:7px}
.cg-card-nota.azul{color:#38BDF8;font-weight:700;border:0;padding-top:0}.cg-card-nota.roxoNota{color:#C084FC;font-weight:700;border:0;padding-top:0}

/* projeção */
.cg-pred{display:grid;grid-template-columns:1.15fr 2fr;gap:22px;align-items:center;background:linear-gradient(135deg,rgba(14,165,233,.08),rgba(16,185,129,.08) 50%,rgba(168,85,247,.06));border:1px solid rgba(16,185,129,.35);border-radius:18px;padding:20px 24px;box-shadow:0 8px 26px rgba(16,30,54,.12)}
.cg-pred-box{border-right:1px solid rgba(255,255,255,.1);padding-right:20px}
.cg-pred-h{font-size:12.5px;font-weight:800;color:#10B981;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.cg-pred-val{font-size:38px;font-weight:900;line-height:1.1;color:var(--tx)}.cg-pred-val span{font-size:21px;color:var(--tm);font-weight:700}
.cg-pred-sub{font-size:14.5px;font-weight:800;color:#10B981;margin-top:4px}
.cg-pred-nota{font-size:12px;color:var(--tm);margin-top:6px;line-height:1.5}
.cg-pred-tit{font-size:13px;font-weight:800;color:var(--tx);margin-bottom:8px}
.cg-pred-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cg-fator{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:12px 14px}
.cg-fator span{font-size:12px;color:var(--td);font-weight:800;text-transform:uppercase}
.cg-fator b{display:block;font-size:21px;font-weight:900;font-family:"JetBrains Mono",monospace;margin:3px 0}
.cg-fator i{font-style:normal;font-size:12px;color:var(--tm)}
.cg-pred-rod{font-size:12px;color:var(--td);margin-top:10px}

/* seções */
.cg-sec-h,.cg-box-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;gap:10px;flex-wrap:wrap}
.cg-sec-h h2,.cg-box-h h2{font-size:18.5px;font-weight:800;color:var(--tx)}
.cg-sec-h span,.cg-box-h span{font-size:13px;color:var(--tm)}
.cg-pacing,.cg-box,.cg-panel{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px 20px;box-shadow:var(--shs)}
.cg-pacing-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.cg-pcol{background:var(--surf);border:1px solid var(--bds);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.cg-pcol-t{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--tm)}
.cg-pcol-n{font-size:21px;font-weight:900}.cg-pcol-n i{font-style:normal;font-size:14.5px;color:var(--td);font-weight:600}
.cg-pbar{height:6px;border-radius:999px;background:var(--sub);overflow:hidden}.cg-pbar-f{height:100%;border-radius:999px}

/* gráfico + o que fazer */
.cg-duas{display:grid;grid-template-columns:1.6fr 1fr;gap:18px}
.cg-mtabs{display:inline-flex;gap:2px;background:var(--surf);border:1px solid var(--bds);border-radius:8px;padding:3px;margin-bottom:14px;width:fit-content}
.cgx .cg-mtab{font:inherit;font-size:13px;font-weight:700;padding:6px 14px;border-radius:6px;border:0;background:transparent;color:var(--tm);cursor:pointer;transition:all .15s}
.cgx .cg-mtab.on{background:var(--sub);color:#38BDF8;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.cg-chart{display:grid;grid-template-columns:repeat(6,1fr);align-items:end;height:150px;gap:12px;border-bottom:1px solid var(--bd);padding-bottom:8px}
.cg-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px}
.cg-col-v{font-size:14.5px;font-weight:800;color:var(--tx)}
.cg-pillar{width:100%;max-width:48px;border-radius:6px 6px 0 0;background:#1E3A8A;transition:height .3s}
.cg-pillar.atual{background:#0284C7;border:2px solid #38BDF8;box-shadow:0 0 16px rgba(56,189,248,.4)}
.cg-col-l{text-align:center}.cg-col-l b{display:block;font-size:13px;color:var(--tx)}.cg-col-l em{font-style:normal;font-size:11.5px;color:#38BDF8;font-weight:700;display:block;margin-top:2px}
.cg-acoes{display:flex;flex-direction:column;gap:10px}
.cg-acao{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;border:1px solid var(--bds);border-left-width:4px;background:var(--surf)}
.cg-acao.amb{border-left-color:#F59E0B;background:rgba(245,158,11,.05)}.cg-acao.azu{border-left-color:#0EA5E9;background:rgba(14,165,233,.05)}.cg-acao.rox{border-left-color:#A855F7;background:rgba(168,85,247,.05)}.cg-acao.ok{border-left-color:#10B981;background:rgba(16,185,129,.05)}
.cg-acao b{display:block;font-size:14.5px;color:var(--tx)}.cg-acao i{font-style:normal;font-size:12.5px;color:var(--tm)}
.cgx .cg-acao-link{font-size:13px;font-weight:800;color:#38BDF8;text-decoration:none;white-space:nowrap;background:rgba(14,165,233,.12);padding:5px 10px;border-radius:7px;border:1px solid rgba(14,165,233,.3)}
.cgx .cg-acao-link:hover{background:#0EA5E9;color:#fff}

/* tropa */
.cg-panel{padding:0;overflow:hidden}
.cg-panel-h{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)}
.cg-panel-h h3{font-size:18.5px;font-weight:800;color:var(--tx)}.cg-panel-h span{font-size:13px;color:var(--tm)}
.cg-tbl{display:flex;flex-direction:column}
.cg-tr{display:grid;grid-template-columns:minmax(0,1.6fr) 110px 110px minmax(0,1.3fr) 120px minmax(0,1.6fr);gap:10px;align-items:center;padding:13px 20px;border-top:1px solid var(--bds);font-size:14.5px;color:var(--tx)}
.cg-tr:hover{background:rgba(255,255,255,.02)}
.cg-th{border:0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--tm);font-weight:800;background:var(--sub);background:color-mix(in srgb,var(--cgbg) 60%,var(--card))}
.cg-tr .r{text-align:right}
.cg-corr{display:flex;align-items:center;gap:10px;min-width:0}
.cg-corr b{font-size:15px;font-weight:700;display:block;color:var(--tx)}.cg-corr small{font-size:12px;color:var(--tm)}
.cg-av{width:34px;height:34px;border-radius:50%;background:var(--sub);border:1.5px solid var(--bd);display:grid;place-items:center;font-size:13px;font-weight:800;flex:none;color:var(--tx)}
.cg-av.sm{width:30px;height:30px;font-size:12px}
.cg-b{font-size:12px;font-weight:700;padding:3px 8px;border-radius:5px}
.cg-b.azul{color:#60A5FA;background:rgba(59,130,246,.15)}.cg-b.verde{color:#10B981;background:rgba(16,185,129,.15)}.cg-b.cinza{color:var(--td)}
.cg-prod b{font-weight:800;color:var(--tx)}.cg-prod small{color:var(--tm)}
.cgx .cg-rol{font:inherit;font-size:12.5px;font-weight:800;padding:6px 12px;border-radius:999px;cursor:pointer;border:1px solid transparent;transition:all .2s}
.cgx .cg-rol.on{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.4);color:#10B981}
.cgx .cg-rol.on:hover{background:rgba(244,63,94,.15);border-color:#F43F5E;color:#F43F5E}
.cgx .cg-rol.off{background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.35);color:#FDA4AF}
.cgx .cg-rol.off:hover{background:rgba(16,185,129,.2);border-color:#10B981;color:#10B981}
.cgx .cg-rol:disabled{opacity:.5}
.cg-acts{display:inline-flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.cgx .cg-act{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:13px;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;border:1px solid transparent;text-decoration:none;white-space:nowrap;transition:all .15s}
.cgx .cg-act.rep{background:rgba(14,165,233,.12);color:#38BDF8;border-color:rgba(14,165,233,.3)}.cgx .cg-act.rep:hover{background:#0EA5E9;color:#fff}
.cgx .cg-act.cob{background:rgba(16,185,129,.12);color:#10B981;border-color:rgba(16,185,129,.3)}.cgx .cg-act.cob:hover{background:#10B981;color:#fff}
.cgx .cg-act.ver{background:rgba(148,163,184,.12);color:var(--tm);border-color:var(--bd)}.cgx .cg-act.ver:hover{background:var(--sub);color:var(--tx)}
.cg-vazio{padding:24px 20px;font-size:14.5px;color:var(--tm)}

/* painel lateral */
.cg-scrim{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}
.cg-side{width:min(440px,96vw);height:100%;background:var(--surf);display:flex;flex-direction:column;box-shadow:-18px 0 50px rgba(0,0,0,.6);animation:cgin .22s cubic-bezier(.22,.7,.3,1);font-family:Archivo,system-ui,sans-serif;color:var(--tx)}
@keyframes cgin{from{transform:translateX(28px);opacity:.4}to{transform:none;opacity:1}}
.cg-side-h{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 22px;border-bottom:1px solid var(--bd)}
.cg-side-h h3{font-size:18.5px;font-weight:800;color:var(--tx)}.cg-side-h p{font-size:13px;color:var(--tm);margin-top:2px}
.cgx .cg-side-x{background:none;border:0;font-size:20px;cursor:pointer;color:var(--tm)}
.cg-side-b{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.cg-lrow{display:flex;align-items:center;gap:11px;border:1px solid var(--bd);border-radius:12px;padding:11px 13px;background:var(--card)}
.cg-lrow-i{flex:1;min-width:0}.cg-lrow-i b{font-size:15px;font-weight:700;display:block;color:var(--tx)}.cg-lrow-i small{font-size:12.5px;color:var(--tm)}
.cg-lead{border:1px solid var(--bd);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:var(--card)}
.cg-lead.urg{border-left:3px solid #F59E0B}
.cg-lead-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.cg-lead-n{font-size:16px;font-weight:800;color:var(--tx)}.cg-lead-m{font-size:12.5px;color:var(--tm);margin-top:1px}
.cg-lead-e{font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap}
.cg-lead-e.ok{background:rgba(16,185,129,.15);color:#10B981}.cg-lead-e.al{background:rgba(245,158,11,.15);color:#F59E0B}
.cg-lead-acts{display:flex;gap:8px}
.cgx .cg-lead-b{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:14px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:all .15s}
.cgx .cg-lead-b.cham{background:rgba(245,158,11,.14);color:#F59E0B;border-color:rgba(245,158,11,.3)}.cgx .cg-lead-b.cham:hover{background:#F59E0B;color:#fff}
.cgx .cg-lead-b.mud{background:rgba(14,165,233,.12);color:#38BDF8;border-color:rgba(14,165,233,.3)}.cgx .cg-lead-b.mud:hover{background:#0EA5E9;color:#fff}

@media (max-width:1050px){
  .cg{padding:0 16px 80px}
  .cg-cards{grid-template-columns:1fr 1fr}
  .cg-pred{grid-template-columns:1fr}.cg-pred-box{border-right:0;border-bottom:1px solid var(--bd);padding:0 0 14px}
  .cg-pacing-grid{grid-template-columns:repeat(3,1fr)}
  .cg-duas{grid-template-columns:1fr}
  .cg-th{display:none}.cg-tr{grid-template-columns:1fr auto;gap:6px}.cg-corr{grid-column:1/-1}.cg-acts{grid-column:1/-1;justify-content:flex-start}
}
`;
