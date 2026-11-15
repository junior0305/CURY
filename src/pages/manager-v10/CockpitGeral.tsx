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
type PainelTipo = "plantao" | "online" | "atendimento" | "leads";

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
    <div className="mgr10 app2">
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

          <article className="cg-card click" onClick={() => setPainel("plantao")}>
            <div className="cg-card-h"><span>Em fechamento</span><span className="cg-tag roxo">Pastas quentes</span></div>
            <div className="cg-val"><b className="roxo">{fechamento.length}</b><i>pastas</i></div>
            <div className="cg-card-f"><span>Prováveis até domingo</span><b>{provaveis}</b></div>
            {vgvFechamento > 0 && <div className="cg-card-nota">VGV em jogo <b>{brl(vgvFechamento)}</b></div>}
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
                <h3>{painel === "plantao" ? "Quem está no plantão" : painel === "online" ? "Quem está logado no CRM" : painel === "atendimento" ? "Quem está em atendimento" : "Leads de hoje · só anúncio"}</h3>
                <p>{painel === "plantao" ? "Check-in físico no stand (C2S) hoje." : painel === "online" ? "Ativos no Comandra nos últimos 15 minutos." : painel === "atendimento" ? "Cliente respondeu nas últimas 2 horas." : `${leadsHojeAnuncio.length} novos · ${leadsHojeSemContato} sem contato.`}</p>
              </div>
              <button className="cg-side-x" onClick={() => setPainel(null)}>✕</button>
            </header>
            <div className="cg-side-b">
              {painel === "leads" ? (
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
.cg{display:flex;flex-direction:column;gap:18px;padding-bottom:60px}
.cg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.cg-top h1{font-size:22px;font-weight:900;letter-spacing:-.02em}
.cg-top p{font-size:12.5px;color:var(--cv-text-muted,#6B7A90);margin-top:2px}
.cg-top p b{color:var(--cv-amber,#C77700)}
.cg-agora{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.cg-agora-lbl{font-size:12px;color:var(--cv-text-muted,#6B7A90);font-weight:700}
.mgr10 .cg-badge{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:11.5px;font-weight:700;background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#DCE6F5);color:var(--cv-text-main,#1a2435);padding:5px 11px;border-radius:999px;cursor:pointer}
.mgr10 .cg-badge:hover{border-color:#38BDF8}
.cg-dot{width:7px;height:7px;border-radius:50%}
.cg-dot.azul{background:#38BDF8;box-shadow:0 0 6px #38BDF8}.cg-dot.verde{background:#10B981;box-shadow:0 0 6px #10B981}.cg-dot.ambar{background:#F59E0B;box-shadow:0 0 6px #F59E0B}
.cg-ver{font-size:10px;color:var(--cv-text-dim,#8A97A8);font-weight:700}

.cg-cards{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:14px}
.cg-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:15px 17px;display:flex;flex-direction:column;gap:9px}
.cg-card.click{cursor:pointer}.cg-card.click:hover{border-color:#38BDF8}
.cg-card.hero{border:2px solid #1FA97C;background:linear-gradient(135deg,rgba(16,185,129,.1),rgba(14,165,233,.05))}
.cg-card-h{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted,#6B7A90)}
.cg-tag{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px}
.cg-tag.verde{background:rgba(16,185,129,.16);color:#0D7C66}.cg-tag.roxo{background:rgba(168,85,247,.16);color:#8A3FD1}.cg-tag.azul{background:rgba(14,165,233,.16);color:#0284C7}
.cg-val{display:flex;align-items:baseline;gap:7px;font-family:"JetBrains Mono",monospace}
.cg-val b{font-size:32px;font-weight:900;line-height:1}.cg-val i{font-style:normal;font-size:14px;color:var(--cv-text-muted,#6B7A90);font-weight:700}
.cg-val b.roxo,.roxo{color:#8A3FD1}.cg-val b.azul,.azul{color:#0284C7}.cg-val b.brand,.brand{color:var(--brand,#1F5C9E)}.verde{color:#0D7C66}.ambar{color:#C77700}
.cg-bar{height:8px;border-radius:999px;background:var(--cv-sunk,#EEF2F8);overflow:hidden}
.cg-bar-fill{height:100%;border-radius:999px;background:#10B981}
.cg-card-f{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--cv-text-muted,#6B7A90)}
.cg-card-f b{color:var(--cv-text-main,#1a2435)}
.cg-card-nota{font-size:11px;color:var(--cv-text-muted,#6B7A90);border-top:1px solid var(--cv-border,#EEF2F8);padding-top:6px}
.cg-card-nota.azul{color:#0284C7;font-weight:700;border:0;padding-top:0}

.cg-pred{display:grid;grid-template-columns:1.1fr 2fr;gap:20px;align-items:center;background:linear-gradient(135deg,rgba(14,165,233,.06),rgba(16,185,129,.06));border:1px solid rgba(16,185,129,.3);border-radius:16px;padding:18px 22px}
.cg-pred-box{border-right:1px solid var(--cv-border,#DCE6F5);padding-right:18px}
.cg-pred-h{font-size:11.5px;font-weight:800;color:#0D7C66;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
.cg-pred-val{font-size:30px;font-weight:900;font-family:"JetBrains Mono",monospace;line-height:1.1}.cg-pred-val span{font-size:16px;color:var(--cv-text-muted,#6B7A90);font-weight:700}
.cg-pred-sub{font-size:13px;font-weight:700;color:#0D7C66;margin-top:3px}
.cg-pred-nota{font-size:11px;color:var(--cv-text-muted,#6B7A90);margin-top:6px;line-height:1.5}
.cg-pred-tit{font-size:12px;font-weight:800;margin-bottom:8px}
.cg-pred-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cg-fator{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:10px;padding:11px 13px}
.cg-fator span{font-size:11px;color:var(--cv-text-dim,#8A97A8);font-weight:800;text-transform:uppercase}
.cg-fator b{display:block;font-size:17px;font-weight:900;font-family:"JetBrains Mono",monospace;margin:3px 0}
.cg-fator i{font-style:normal;font-size:11px;color:var(--cv-text-muted,#6B7A90)}
.cg-pred-rod{font-size:11px;color:var(--cv-text-dim,#8A97A8);margin-top:10px}

.cg-sec-h,.cg-box-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;gap:10px;flex-wrap:wrap}
.cg-sec-h h2,.cg-box-h h2{font-size:15px;font-weight:800}
.cg-sec-h span,.cg-box-h span{font-size:11.5px;color:var(--cv-text-muted,#6B7A90)}
.cg-pacing,.cg-box,.cg-panel{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:16px 18px}
.cg-pacing-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:11px}
.cg-pcol{background:var(--cv-sunk,#F7FAFF);border:1px solid var(--cv-border,#EEF2F8);border-radius:9px;padding:9px 11px;display:flex;flex-direction:column;gap:5px}
.cg-pcol-t{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--cv-text-muted,#6B7A90)}
.cg-pcol-n{font-size:17px;font-weight:900;font-family:"JetBrains Mono",monospace}.cg-pcol-n i{font-style:normal;font-size:12px;color:var(--cv-text-dim,#8A97A8);font-weight:600}
.cg-pbar{height:6px;border-radius:999px;background:var(--cv-border,#EEF2F8);overflow:hidden}.cg-pbar-f{height:100%;border-radius:999px}

.cg-duas{display:grid;grid-template-columns:1.6fr 1fr;gap:16px}
.cg-mtabs{display:inline-flex;gap:2px;background:var(--cv-sunk,#F7FAFF);border:1px solid var(--cv-border,#EEF2F8);border-radius:8px;padding:3px;margin-bottom:12px}
.mgr10 .cg-mtab{font:inherit;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;border:0;background:transparent;color:var(--cv-text-muted,#6B7A90);cursor:pointer}
.mgr10 .cg-mtab.on{background:var(--cv-surface,#fff);color:var(--brand,#1F5C9E);font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.cg-chart{display:grid;grid-template-columns:repeat(6,1fr);align-items:end;height:160px;gap:10px}
.cg-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px}
.cg-col-v{font-size:12px;font-weight:800;font-family:"JetBrains Mono",monospace}
.cg-pillar{width:100%;max-width:44px;border-radius:6px 6px 0 0;background:var(--brand-soft,#9DB8DC);transition:height .3s}
.cg-pillar.atual{background:linear-gradient(180deg,#38BDF8,#0284C7);box-shadow:0 0 14px rgba(56,189,248,.35)}
.cg-col-l{text-align:center}.cg-col-l b{display:block;font-size:11px}.cg-col-l em{font-style:normal;font-size:10px;color:var(--brand,#1F5C9E);font-weight:700}
.cg-acoes{display:flex;flex-direction:column;gap:9px}
.cg-acao{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 13px;border-radius:9px;border:1px solid var(--cv-border,#EEF2F8);border-left-width:4px;background:var(--cv-sunk,#F7FAFF)}
.cg-acao.amb{border-left-color:#E8912B}.cg-acao.azu{border-left-color:#0EA5E9}.cg-acao.rox{border-left-color:#A855F7}.cg-acao.ok{border-left-color:#10B981}
.cg-acao b{display:block;font-size:13px}.cg-acao i{font-style:normal;font-size:11.5px;color:var(--cv-text-muted,#6B7A90)}
.mgr10 .cg-acao-link{font-size:12px;font-weight:800;color:var(--brand,#1F5C9E);text-decoration:none;white-space:nowrap;background:var(--brand-soft-bg,rgba(31,92,158,.1));padding:5px 10px;border-radius:7px}

.cg-panel-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.cg-panel-h h3{font-size:16px;font-weight:800}.cg-panel-h span{font-size:12px;color:var(--cv-text-muted,#6B7A90)}
.cg-tbl{display:flex;flex-direction:column}
.cg-tr{display:grid;grid-template-columns:minmax(0,1.6fr) 110px 110px minmax(0,1.3fr) 120px minmax(0,1.5fr);gap:10px;align-items:center;padding:11px 6px;border-top:1px solid var(--cv-border,#EEF2F8);font-size:13px}
.cg-th{border:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--cv-text-muted,#6B7A90);font-weight:800}
.cg-tr .r{text-align:right}
.cg-corr{display:flex;align-items:center;gap:10px;min-width:0}
.cg-corr b{font-size:13.5px;font-weight:700;display:block}.cg-corr small{font-size:11px;color:var(--cv-text-muted,#6B7A90)}
.cg-av{width:34px;height:34px;border-radius:50%;background:var(--cv-sunk,#192640);border:1.5px solid var(--cv-border,#2A3A58);display:grid;place-items:center;font-size:12px;font-weight:800;flex:none;color:var(--cv-text-main,#1a2435)}
.cg-av.sm{width:30px;height:30px;font-size:11px}
.cg-b{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px}
.cg-b.azul{color:#0284C7;background:rgba(14,165,233,.12)}.cg-b.verde{color:#0D7C66;background:rgba(16,185,129,.12)}.cg-b.cinza{color:var(--cv-text-dim,#8A97A8)}
.cg-prod b{font-weight:800}.cg-prod small{color:var(--cv-text-muted,#6B7A90)}
.mgr10 .cg-rol{font:inherit;font-size:11.5px;font-weight:800;padding:6px 11px;border-radius:999px;cursor:pointer;border:1px solid transparent}
.mgr10 .cg-rol.on{background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.4);color:#0D7C66}
.mgr10 .cg-rol.off{background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.3);color:#B4322A}
.mgr10 .cg-rol:disabled{opacity:.5}
.cg-acts{display:inline-flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.mgr10 .cg-act{font:inherit;font-size:12px;font-weight:700;padding:6px 10px;border-radius:7px;cursor:pointer;border:1px solid transparent;text-decoration:none;white-space:nowrap}
.mgr10 .cg-act.rep{background:rgba(14,165,233,.12);color:#0284C7;border-color:rgba(14,165,233,.3)}
.mgr10 .cg-act.cob{background:rgba(16,185,129,.12);color:#0D7C66;border-color:rgba(16,185,129,.3)}
.mgr10 .cg-act.ver{background:var(--cv-sunk,#EEF2F8);color:var(--cv-text-muted,#5B6B80);border-color:var(--cv-border,#E7EDF6)}
.cg-vazio{padding:22px 6px;font-size:13px;color:var(--cv-text-muted,#6B7A90)}

.cg-scrim{position:fixed;inset:0;z-index:70;background:rgba(9,12,18,.42);backdrop-filter:blur(3px);display:flex;justify-content:flex-end}
.cg-side{width:min(440px,96vw);height:100%;background:var(--cv-surface,#fff);display:flex;flex-direction:column;box-shadow:-18px 0 50px rgba(9,12,18,.3);animation:cgin .22s cubic-bezier(.22,.7,.3,1)}
@keyframes cgin{from{transform:translateX(28px);opacity:.4}to{transform:none;opacity:1}}
.cg-side-h{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--cv-border,#E7EDF6)}
.cg-side-h h3{font-size:16px;font-weight:800}.cg-side-h p{font-size:12px;color:var(--cv-text-muted,#6B7A90);margin-top:2px}
.mgr10 .cg-side-x{background:none;border:0;font-size:20px;cursor:pointer;color:var(--cv-text-muted,#6B7A90)}
.cg-side-b{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:9px}
.cg-lrow{display:flex;align-items:center;gap:11px;border:1px solid var(--cv-border,#E7EDF6);border-radius:12px;padding:10px 12px}
.cg-lrow-i{flex:1;min-width:0}.cg-lrow-i b{font-size:13.5px;font-weight:700;display:block}.cg-lrow-i small{font-size:11.5px;color:var(--cv-text-muted,#6B7A90)}
.cg-lead{border:1px solid var(--cv-border,#E7EDF6);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:9px}
.cg-lead.urg{border-left:3px solid #E8912B}
.cg-lead-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.cg-lead-n{font-size:14px;font-weight:800}.cg-lead-m{font-size:11.5px;color:var(--cv-text-muted,#6B7A90);margin-top:1px}
.cg-lead-e{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap}
.cg-lead-e.ok{background:rgba(16,185,129,.12);color:#0D7C66}.cg-lead-e.al{background:rgba(245,158,11,.14);color:#C77700}
.cg-lead-acts{display:flex;gap:8px}
.mgr10 .cg-lead-b{flex:1;font:inherit;font-size:12.5px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.mgr10 .cg-lead-b.cham{background:rgba(245,158,11,.14);color:#C77700;border-color:rgba(245,158,11,.3)}
.mgr10 .cg-lead-b.mud{background:rgba(14,165,233,.12);color:#0284C7;border-color:rgba(14,165,233,.3)}

@media (max-width:1050px){
  .cg-cards{grid-template-columns:1fr 1fr}
  .cg-pred{grid-template-columns:1fr}.cg-pred-box{border-right:0;border-bottom:1px solid var(--cv-border,#DCE6F5);padding:0 0 14px}
  .cg-pacing-grid{grid-template-columns:repeat(3,1fr)}
  .cg-duas{grid-template-columns:1fr}
  .cg-th{display:none}.cg-tr{grid-template-columns:1fr auto;gap:6px}.cg-corr{grid-column:1/-1}.cg-acts{grid-column:1/-1;justify-content:flex-start}
}
`;
