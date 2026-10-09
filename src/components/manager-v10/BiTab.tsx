/**
 * B.I. Diretoria — Tela 1 (Fechamento & Comparativo: Vendas × Visitas × Documentos).
 * PORTE FIEL do mockup_bi_diretoria.html (h-screen-1): faixa navy, 4 cartões-gradiente,
 * grade de 3 colunas, tabelas com data-bars, mini-gráfico semanal, rosca e barras por equipe.
 * CSS do mockup embutido e escopado sob `.biv1` (paleta própria, look dark self-contido).
 * Cartões do topo (fontes da Econ):
 *   · Vendas → junix_vendas (Junix/ImobFlow)   · Pastas → junix_pastas (pipeline de propostas do Junix)
 *   · Check-in no plantão → c2s_plantao   · Visitas de cliente no estande → c2s_checkins (C2S)
 * Tabelas/rankings abaixo ainda via RPC bi_fechamento(p_dias, p_escopo, p_manager).
 * Telas 2/3/4 = "em breve" (falta dado de anúncios/bancário/RH).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PlantaoEmpresa from "./PlantaoEmpresa";

type Nivel = "gerente" | "corretor";

const BI_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap');
.biv1{--canvas-bg:#DCE3EC;--navy-header:#0A192F;--navy-cury:#0D3868;--navy-cury-dark:#082649;--navy-row-1:#0F3E73;--navy-row-2:#144985;--navy-hover:#1E5CA8;--navy-panel:#0B1D36;--gold:#FACC15;--green-bright:#4ADE80;--red-bright:#F87171;--sans:'Archivo',-apple-system,BlinkMacSystemFont,sans-serif;--mono:'JetBrains Mono',monospace;background:var(--canvas-bg);border-radius:14px;overflow:hidden;font-family:var(--sans);color:#0F172A;-webkit-font-smoothing:antialiased}
.biv1 *{box-sizing:border-box}
.biv1 .top-tabs-bar{background:#050E1D;padding:7px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1E3A8A;gap:10px;flex-wrap:wrap}
.biv1 .ttb-left{display:flex;gap:8px;flex-wrap:wrap}
.biv1 .ttb-btn{background:#0F2544;color:#94A3B8;border:1px solid #1E4275;padding:7px 16px;border-radius:7px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:var(--sans);transition:all .15s}
.biv1 .ttb-btn:hover{color:#fff;background:#173763}
.biv1 .ttb-btn.active{background:linear-gradient(90deg,#2563EB,#6D28D9);color:#fff;border-color:#60A5FA;box-shadow:0 0 12px rgba(59,130,246,.45)}
.biv1 .ttb-right{font-size:11.5px;color:#93C5FD;font-weight:600}
.biv1 .top-hero{background:var(--navy-header);color:#fff;padding:12px 22px 46px;border-bottom:1px solid #1E293B}
.biv1 .top-hero-inner{max-width:1640px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.biv1 .brand-cluster{display:flex;align-items:center;gap:14px}
.biv1 .brand-mark{display:flex;align-items:center;gap:8px;padding-right:14px;border-right:2px solid rgba(255,255,255,.18)}
.biv1 .brand-mark img{width:30px;height:30px;object-fit:contain}
.biv1 .brand-mark strong{font-size:22px;font-weight:800;letter-spacing:.04em}
.biv1 .hero-title-block h1{font-size:20px;font-weight:800;letter-spacing:.01em;text-transform:uppercase}
.biv1 .hero-filter-badge{display:inline-block;margin-top:2px;background:rgba(250,204,21,.16);border:1px solid rgba(250,204,21,.45);color:var(--gold);font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px}
.biv1 .hero-controls{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}
.biv1 .hc-box{background:#132847;border:1px solid #264B7F;border-radius:7px;padding:4px 8px}
.biv1 .hc-box label{display:block;font-size:9.5px;font-weight:700;color:#93C5FD;text-transform:uppercase;margin-bottom:2px}
.biv1 .hc-box select{background:#081528;color:#fff;border:1px solid #335E99;border-radius:4px;padding:3px 6px;font-size:11.5px;font-weight:700;font-family:var(--sans);cursor:pointer}
.biv1 .hc-buttons{display:inline-flex;background:#132847;border:1px solid #264B7F;border-radius:7px;padding:3px;gap:3px}
.biv1 .hc-btn{border:none;background:transparent;color:#CBD5E1;padding:6px 12px;border-radius:5px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:var(--sans)}
.biv1 .hc-btn.active{background:var(--gold);color:#081528;font-weight:800}
.biv1 .main-wrap{max-width:1640px;margin:-34px auto 0;padding:0 20px 22px}
.biv1 .hero-kpi-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px}
@media(max-width:1020px){.biv1 .hero-kpi-4{grid-template-columns:repeat(2,1fr)}}
.biv1 .gk-card{border-radius:12px;padding:13px 16px;color:#fff;display:flex;align-items:center;gap:13px;box-shadow:0 8px 20px rgba(8,25,48,.22);position:relative;overflow:hidden}
.biv1 .gk-card.purple{background:linear-gradient(135deg,#5B21B6,#4338CA)}
.biv1 .gk-card.pink{background:linear-gradient(135deg,#E11D48,#DB2777)}
.biv1 .gk-card.green{background:linear-gradient(135deg,#059669,#0D9488)}
.biv1 .gk-card.blue{background:linear-gradient(135deg,#1D4ED8,#0284C7)}
.biv1 .gk-icon{width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.3);display:grid;place-items:center;font-size:20px;flex-shrink:0}
.biv1 .gk-body{flex:1;min-width:0}
.biv1 .gk-lbl{font-size:11.5px;font-weight:700;opacity:.92;text-transform:uppercase;letter-spacing:.02em}
.biv1 .gk-val{font-family:var(--mono);font-size:23px;font-weight:800;letter-spacing:-.02em;margin:1px 0 3px}
.biv1 .gk-delta{font-size:11px;font-weight:700;background:rgba(0,0,0,.2);padding:2px 8px;border-radius:999px;display:inline-block}
.biv1 .hybrid-grid{display:grid;grid-template-columns:1.12fr 1.52fr 330px;gap:12px;align-items:stretch}
@media(max-width:1280px){.biv1 .hybrid-grid{grid-template-columns:1fr}}
.biv1 .panel-cury{background:var(--navy-cury);border:1px solid #1C508D;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(8,38,73,.2);color:#fff}
.biv1 .p-hdr-bar{background:var(--navy-cury-dark);color:#fff;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2A5C9A;font-size:13.5px;font-weight:800;gap:8px;flex-wrap:wrap}
.biv1 .p-hdr-bar small{font-size:11px;color:#93C5FD;font-weight:600}
.biv1 .cascade-filter-bar{background:#07203F;padding:8px 10px;border-bottom:1px solid #1E4982;display:flex;flex-direction:column;gap:6px}
.biv1 .cf-top-row{display:grid;grid-template-columns:1fr 1.1fr 1.3fr auto;gap:6px;align-items:end}
@media(max-width:900px){.biv1 .cf-top-row{grid-template-columns:1fr 1fr}}
.biv1 .cf-field label{display:block;font-size:9.5px;font-weight:800;color:#93C5FD;text-transform:uppercase;margin-bottom:2px}
.biv1 .cf-field select,.biv1 .cf-field input{width:100%;background:#0D325E;color:#fff;border:1px solid #2E64A6;border-radius:5px;padding:4px 7px;font-size:11.5px;font-weight:700;font-family:var(--sans)}
.biv1 .cf-field input::placeholder{color:#94A3B8;font-weight:500}
.biv1 .cf-mode-tabs{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;padding-top:2px}
.biv1 .mode-pill-group{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.biv1 .m-pill{background:#123766;color:#CBD5E1;border:1px solid #285999;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--sans);transition:all .12s}
.biv1 .m-pill:hover{background:#1B4B8A;color:#fff}
.biv1 .m-pill.active{background:var(--gold);color:#082649;border-color:#FEF08A;font-weight:800}
.biv1 .tbl-scroll{max-height:230px;overflow-y:auto}
.biv1 .tbl-scroll.tall-475{max-height:465px}
.biv1 .tbl-scroll::-webkit-scrollbar{width:6px}
.biv1 .tbl-scroll::-webkit-scrollbar-track{background:#082649}
.biv1 .tbl-scroll::-webkit-scrollbar-thumb{background:#3B82F6;border-radius:3px}
.biv1 table.h-tbl{width:100%;border-collapse:collapse;font-size:11.8px;color:#fff}
.biv1 .h-tbl thead th{position:sticky;top:0;background:#061D39;color:#CBD5E1;font-weight:700;padding:7px 8px;text-align:left;border-bottom:1px solid #2E62A1;font-size:10.6px;z-index:2;white-space:nowrap}
.biv1 .h-tbl tbody tr{background:var(--navy-row-1);border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;transition:background .1s}
.biv1 .h-tbl tbody tr:nth-child(even){background:var(--navy-row-2)}
.biv1 .h-tbl tbody tr:hover{background:var(--navy-hover)}
.biv1 .h-tbl tbody tr.selected{background:#2563EB!important;box-shadow:inset 4px 0 0 var(--gold);font-weight:700}
.biv1 .h-tbl td{padding:6px 8px;white-space:nowrap;vertical-align:middle}
.biv1 .h-tbl .r{text-align:right;font-family:var(--mono)}
.biv1 .h-tbl thead th.r{font-family:var(--sans)}
.biv1 .h-tbl tfoot td{position:sticky;bottom:0;background:#061D39;color:#fff;font-weight:800;padding:7px 8px;border-top:2px solid #38BDF8;font-size:11.8px}
.biv1 .cell-bar-wrap{display:flex;align-items:center;justify-content:flex-end;gap:6px}
.biv1 .mini-bar-track{width:52px;height:8px;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden;flex-shrink:0}
.biv1 .mini-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#38BDF8,#4ADE80)}
.biv1 .mgr-cell{display:flex;align-items:center;gap:7px}
.biv1 .mgr-badge{width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;font-size:9.5px;font-weight:800;color:#082649;background:#93C5FD;flex-shrink:0}
.biv1 .wk-chart-mini{display:flex;align-items:flex-end;justify-content:space-around;height:102px;padding:16px 8px 6px;background:#082649;border-bottom:1px solid #1E4982;gap:8px}
.biv1 .wk-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;position:relative;cursor:pointer}
.biv1 .wk-col-val{font-family:var(--mono);font-size:10px;color:#E2E8F0;font-weight:700;margin-bottom:3px}
.biv1 .wk-col-bar{width:100%;max-width:44px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#A78BFA,#6D28D9)}
.biv1 .wk-col-lbl{font-size:9.5px;color:#93C5FD;font-weight:700;margin-top:3px;text-align:center}
.biv1 .right-visual-panel{background:var(--navy-panel);border:1px solid #1E3A8A;border-radius:10px;padding:14px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;gap:12px;box-shadow:0 6px 18px rgba(8,25,48,.25)}
.biv1 .rvp-title{font-size:13px;font-weight:800;color:#F8FAFC;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
.biv1 .donut-row{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.04);padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.08)}
.biv1 .donut-circle{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.biv1 .donut-inner{width:62px;height:62px;border-radius:50%;background:var(--navy-panel);display:flex;flex-direction:column;align-items:center;justify-content:center}
.biv1 .donut-inner strong{font-family:var(--mono);font-size:14px;color:#4ADE80}
.biv1 .donut-inner small{font-size:9px;color:#94A3B8}
.biv1 .sup-bars-list{display:flex;flex-direction:column;gap:7px}
.biv1 .sb-row{display:grid;grid-template-columns:88px 1fr;align-items:center;gap:8px;font-size:11px;cursor:pointer}
.biv1 .sb-row:hover .sb-fill{filter:brightness(1.15)}
.biv1 .sb-name{text-align:right;font-weight:700;color:#CBD5E1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.biv1 .sb-track{background:rgba(255,255,255,.08);height:22px;border-radius:5px;overflow:hidden}
.biv1 .sb-fill{height:100%;background:linear-gradient(90deg,#059669,#10B981);border-radius:5px;display:flex;align-items:center;justify-content:space-between;padding:0 8px;color:#fff;font-family:var(--mono);font-size:10.5px;font-weight:800;white-space:nowrap;min-width:0}
.biv1 .up-txt{color:var(--green-bright);font-weight:800}
.biv1 .dn-txt{color:var(--red-bright);font-weight:800}
.biv1 .bi-soon{padding:60px 20px;text-align:center;color:#CBD5E1}
.biv1 .bi-soon b{color:#fff;font-size:16px}
`;

const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const nf1 = (n: number) => (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const moneyM = (n: number) => (n / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "M";
const moneyFull = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => (n ?? 0) + "%";
const delta = (v: number, a: number) => (a > 0 ? Math.round(((v - a) / a) * 100) : v > 0 ? 100 : 0);

export default function BiTab({ scope, managerId }: { scope: "gerente" | "super"; managerId?: string }) {
  const [dias, setDias] = useState(30);
  const [screen, setScreen] = useState(1);
  const [nivel, setNivel] = useState<Nivel>("gerente");
  const [busca, setBusca] = useState("");
  const [selMgr, setSelMgr] = useState("ALL");

  // B.I. da DIRETORIA (empresa inteira): informação COMPARTILHADA — todo gerente/super
  // vê o mesmo consolidado, não filtrado por equipe. p_manager sempre null → toda a diretoria.
  const { data, isLoading } = useQuery({
    queryKey: ["biFechamento", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bi_fechamento", { p_dias: dias, p_escopo: "diretoria", p_manager: null });
      if (error) throw error;
      return data as any;
    },
  });

  // VENDAS = Junix (ImobFlow), venda a venda com VGV real — espelhado em junix_vendas
  // pelo /root/junix/vendas.py. Só gestor lê (a linha traz comissão de todos os níveis).
  const { data: vendasJunix = [] } = useQuery({
    queryKey: ["junixVendas", dias],
    queryFn: async () => {
      const desde = new Date(Date.now() - 3 * 3600 * 1000 - (dias - 1) * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("junix_vendas" as any)
        .select("oc, empreendimento, bloco, unidade, fase, data_contrato, diretor, superintendente, gerente, corretor, vgv, qtd, sinal_status")
        .eq("ativo", true).gte("data_contrato", desde).order("data_contrato", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  // Plantão, visitas (C2S) e pastas (Junix) da diretoria. O C2S traz a rede inteira no
  // check-in, então filtra pela diretoria do token (a mesma que o Junix enxerga).
  const DIRETORIA_C2S = "Diretor Gilberto Junior";
  const { data: op } = useQuery({
    queryKey: ["biOperacaoEcon", dias],
    queryFn: async () => {
      const desde = new Date(Date.now() - 3 * 3600 * 1000 - (dias - 1) * 86400000).toISOString().slice(0, 10);
      const plantao: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("c2s_plantao" as any).select("dia, corretor, gerente")
          .eq("diretor", DIRETORIA_C2S).gte("dia", desde).range(from, from + 999);
        if (error) throw error;
        plantao.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const { data: vis } = await supabase.from("c2s_checkins" as any).select("corretor, visit_type")
        .eq("diretor", DIRETORIA_C2S).gte("created_at", desde + "T03:00:00Z");
      const visitasRows = (vis || []) as any[];
      const { data: pastas } = await supabase.from("junix_pastas" as any).select("etapa, etapa_ordem");
      // gerente que bate check-in no proprio nome (ex.: "JAGUAR" na equipe do Jaguar) nao conta como corretor
      const nomeGer = (g: string) => (g || "").replace(/^ger[eê]n(te|cia)\s+/i, "").trim().toUpperCase();
      const soCorretores = plantao.filter((r: any) => (r.corretor || "").trim() && (r.corretor || "").trim().toUpperCase() !== nomeGer(r.gerente));
      const presencas = new Set(soCorretores.map((r: any) => `${r.corretor.trim().toUpperCase()}|${r.dia}`)).size;
      const corretoresPlantao = new Set(soCorretores.map((r: any) => r.corretor.trim().toUpperCase())).size;
      const diasComDado = new Set(soCorretores.map((r: any) => r.dia)).size;
      const hojeSP = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      const presentesHoje = new Set(soCorretores.filter((r: any) => r.dia === hojeSP).map((r: any) => r.corretor.trim().toUpperCase())).size;
      const mediaDia = diasComDado ? presencas / diasComDado : 0;
      const ps = (pastas || []) as any[];
      return {
        presencas, corretoresPlantao, presentesHoje, mediaDia,
        visitas: visitasRows.length,
        primeirasVisitas: visitasRows.filter((v) => /primeira/i.test(v.visit_type || "")).length,
        corretoresVisita: new Set(visitasRows.map((v) => (v.corretor || "").trim().toUpperCase()).filter(Boolean)).size,
        pastasAndamento: ps.filter((x) => x.etapa_ordem >= 1 && x.etapa_ordem <= 9).length,
        pastasDocs: ps.filter((x) => x.etapa_ordem === 4).length,
        pastasAnalise: ps.filter((x) => x.etapa_ordem >= 5 && x.etapa_ordem <= 9).length,
        pastasConfirmadas: ps.filter((x) => x.etapa_ordem === 10).length,
      };
    },
  });

  const vjQtd = vendasJunix.reduce((a, v) => a + Number(v.qtd || 1), 0);
  const vjVgv = vendasJunix.reduce((a, v) => a + Number(v.vgv || 0), 0);
  const vjConfirmadas = vendasJunix.filter((v) => /confirmada/i.test(v.fase || "")).length;

  const t = data?.totais;
  const ticket = Number(t?.ticket_medio || 320000);
  const gerentes = (data?.por_gerente || []) as any[];
  const corretores = (data?.por_corretor || []) as any[];
  const vgvTot = Number(t?.vendas || 0) * ticket;

  // linhas do centro conforme nível + filtros
  const linhas = useMemo(() => {
    let arr = (nivel === "corretor" ? corretores : gerentes).slice();
    if (nivel === "corretor" && selMgr !== "ALL") arr = arr.filter((l) => (l.gerente_apelido || "") === selMgr);
    if (busca.trim()) { const q = busca.toLowerCase(); arr = arr.filter((l) => (l.nome || l.apelido || "").toLowerCase().includes(q)); }
    return arr.sort((a, b) => Number(b.vendas || 0) - Number(a.vendas || 0));
  }, [gerentes, corretores, nivel, selMgr, busca]);

  const maxCenter = Math.max(1, ...linhas.map((l) => Number(l.vendas || 0)));
  const topGer = useMemo(() => gerentes.slice().sort((a, b) => Number(b.vendas || 0) - Number(a.vendas || 0)).slice(0, 8), [gerentes]);
  const maxGer = Math.max(1, ...topGer.map((l) => Number(l.vendas || 0)));
  // produtos (não temos por-empreendimento): reaproveita os gerentes como linhas do painel esquerdo
  const prod = topGer.slice(0, 7);
  const maxProd = Math.max(1, ...prod.map((l) => Number(l.vendas || 0)));

  const nomeDe = (l: any) => l.nome || l.apelido || "—";
  const rowVgv = (l: any) => Number(l.vendas || 0) * ticket;

  return (
    <div className="biv1">
      <style>{BI_CSS}</style>

      {/* BARRA DAS 4 TELAS */}
      <div className="top-tabs-bar">
        <div className="ttb-left">
          <button className={`ttb-btn${screen === 1 ? " active" : ""}`} onClick={() => setScreen(1)}>🏆 TELA 1: Vendas × Visitas × Docs</button>
          <button className={`ttb-btn${screen === 2 ? " active" : ""}`} onClick={() => setScreen(2)}>📣 TELA 2: Anúncios, Regiões & Canais</button>
          <button className={`ttb-btn${screen === 3 ? " active" : ""}`} onClick={() => setScreen(3)}>🏦 TELA 3: Análises Bancárias & Repasses</button>
          <button className={`ttb-btn${screen === 4 ? " active" : ""}`} onClick={() => setScreen(4)}>👥 TELA 4: Turnover, Contratações & Retenção</button>
          <button className={`ttb-btn${screen === 5 ? " active" : ""}`} onClick={() => setScreen(5)}>📍 TELA 5: Plantão — Empresa toda</button>
        </div>
        <div className="ttb-right">📊 Dados reais · Junix + C2S + Comandra</div>
      </div>

      {screen === 5 ? (
        <PlantaoEmpresa />
      ) : screen !== 1 ? (
        <div className="bi-soon"><b>Em breve.</b><div style={{ marginTop: 8 }}>Esta tela precisa de dados de anúncios / bancário / RH que ainda não estão no sistema.</div></div>
      ) : (
        <>
          {/* FAIXA NAVY DO TOPO */}
          <header className="top-hero">
            <div className="top-hero-inner">
              <div className="brand-cluster">
                <div className="brand-mark"><img src="/comandra-icon.png" alt="" /><strong>COMANDRA</strong></div>
                <div className="hero-title-block">
                  <h1>Fechamento &amp; Comparativo — Vendas × Visitas × Documentos</h1>
                  <span className="hero-filter-badge">
                    DIRETORIA (visão compartilhada) · {nf(gerentes.length)} Gerentes · {nf(corretores.length)} Corretores · Últimos {dias} dias
                  </span>
                </div>
              </div>
              <div className="hero-controls">
                <div className="hc-box">
                  <label>Período</label>
                  <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                    <option value={1}>Hoje</option>
                    <option value={7}>Semana (7 dias)</option>
                    <option value={30}>Mês (30 dias)</option>
                  </select>
                </div>
                <div className="hc-buttons">
                  <button className={`hc-btn${nivel === "gerente" ? " active" : ""}`} onClick={() => setNivel("gerente")}>🧑‍💼 {nf(gerentes.length)} Gerentes</button>
                  <button className={`hc-btn${nivel === "corretor" ? " active" : ""}`} onClick={() => setNivel("corretor")}>🏃‍♂️ {nf(corretores.length)} Corretores</button>
                </div>
              </div>
            </div>
          </header>

          <div className="main-wrap">
            {isLoading || !t ? (
              <div className="panel-cury" style={{ padding: 40, textAlign: "center", color: "#CBD5E1" }}>Somando a operação…</div>
            ) : (
              <>
                {/* 4 CARTÕES GRADIENTE */}
                <div className="hero-kpi-4">
                  <div className="gk-card purple">
                    <div className="gk-icon">💰</div>
                    <div className="gk-body">
                      <div className="gk-lbl">Vendas (Junix) & VGV</div>
                      <div className="gk-val">{nf(vjQtd)} un · R$ {moneyM(vjVgv)}</div>
                      <div className="gk-delta">{nf(vjConfirmadas)} confirmadas · {nf(vendasJunix.length - vjConfirmadas)} com pendência</div>
                    </div>
                  </div>
                  <div className="gk-card pink">
                    <div className="gk-icon">🏠</div>
                    <div className="gk-body">
                      <div className="gk-lbl">Visitas no plantão (C2S)</div>
                      <div className="gk-val">{nf(op?.visitas ?? 0)} visitas</div>
                      <div className="gk-delta">{nf(op?.primeirasVisitas ?? 0)} primeira visita · {nf(op?.corretoresVisita ?? 0)} corretores atenderam</div>
                    </div>
                  </div>
                  <div className="gk-card green">
                    <div className="gk-icon">📁</div>
                    <div className="gk-body">
                      <div className="gk-lbl">Pastas (Junix)</div>
                      <div className="gk-val">{nf(op?.pastasAndamento ?? 0)} em andamento</div>
                      <div className="gk-delta">{nf(op?.pastasDocs ?? 0)} anexando docs · {nf(op?.pastasAnalise ?? 0)} em análise · {nf(op?.pastasConfirmadas ?? 0)} confirmada(s)</div>
                    </div>
                  </div>
                  <div className="gk-card blue">
                    <div className="gk-icon">📍</div>
                    <div className="gk-body">
                      <div className="gk-lbl">Check-ins no plantão (C2S)</div>
                      <div className="gk-val">{dias === 1 ? `${nf(op?.presentesHoje ?? 0)} hoje` : `${nf1(op?.mediaDia ?? 0)} por dia`}</div>
                      <div className="gk-delta">{dias === 1 ? `${nf(op?.presencas ?? 0)} check-ins` : `hoje ${nf(op?.presentesHoje ?? 0)} · ${nf(op?.corretoresPlantao ?? 0)} diferentes em ${dias} dias`}</div>
                    </div>
                  </div>
                </div>

                {/* VENDAS DO PERÍODO — JUNIX */}
                <div className="panel-cury" style={{ marginBottom: 12 }}>
                  <div className="p-hdr-bar"><span>🏆 Vendas do período — Junix</span><small>{nf(vjQtd)} un · R$ {moneyFull(vjVgv)} VGV</small></div>
                  <div className="tbl-scroll">
                    <table className="h-tbl">
                      <thead><tr><th>Contrato</th><th>Corretor</th><th>Gerente</th><th>Superint.</th><th>Empreendimento</th><th>Unidade</th><th>Fase</th><th style={{ textAlign: "right" }}>VGV</th></tr></thead>
                      <tbody>
                        {vendasJunix.length ? vendasJunix.map((v) => (
                          <tr key={`${v.oc}-${v.unidade}`}>
                            <td>{v.data_contrato ? new Date(v.data_contrato + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                            <td><b>{v.corretor || "—"}</b></td>
                            <td>{v.gerente || "—"}</td>
                            <td>{v.superintendente || "—"}</td>
                            <td>{(v.empreendimento || "").replace(/^CONDOM[IÍ]NIO\s+/i, "")}</td>
                            <td>{[v.bloco, v.unidade].filter(Boolean).join(" · ")}</td>
                            <td><span className={/confirmada/i.test(v.fase || "") ? "up-txt" : "dn-txt"}>{v.fase || "—"}</span></td>
                            <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>R$ {moneyFull(Number(v.vgv || 0))}</td>
                          </tr>
                        )) : <tr><td colSpan={8} style={{ textAlign: "center", color: "#CBD5E1", padding: 16 }}>Nenhuma venda no Junix neste período.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GRADE DE 3 COLUNAS */}
                <div className="hybrid-grid">

                  {/* ESQUERDA */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="panel-cury">
                      <div className="p-hdr-bar"><span>🏢 Vendas × Visitas × Docs por Gerente</span><small>top da equipe</small></div>
                      <div className="tbl-scroll">
                        <table className="h-tbl">
                          <thead><tr><th>Gerente</th><th className="r">Visitas</th><th className="r">Docs</th><th className="r">VGV</th><th className="r">Vendas</th><th className="r">Δ %</th></tr></thead>
                          <tbody>
                            {prod.map((l) => {
                              const v = Number(l.vendas || 0); const d = delta(v, Number(l.vendas_ant || 0));
                              return (
                                <tr key={"p" + nomeDe(l)}>
                                  <td>{nomeDe(l)}</td>
                                  <td className="r">{nf(Number(l.visitas || 0))}</td>
                                  <td className="r">{nf(Number(l.docs || 0))}</td>
                                  <td className="r">{moneyFull(rowVgv(l))}</td>
                                  <td className="r"><div className="cell-bar-wrap"><span>{nf(v)}</span><div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${Math.round((v / maxProd) * 100)}%` }} /></div></div></td>
                                  <td className={`r ${d >= 0 ? "up-txt" : "dn-txt"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}%</td>
                                </tr>
                              );
                            })}
                            {!prod.length ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 18, color: "#93C5FD" }}>Sem dados no período.</td></tr> : null}
                          </tbody>
                          <tfoot><tr><td>Total</td><td className="r">{nf(t.visitas)}</td><td className="r">{nf(t.docs)}</td><td className="r">{moneyFull(vgvTot)}</td><td className="r">{nf(t.vendas)}</td><td className="r up-txt">▲ {delta(Number(t.vendas), Number(t.vendas_ant))}%</td></tr></tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="panel-cury">
                      <div className="p-hdr-bar"><span>⚖️ Período atual × anterior</span><small>vendas</small></div>
                      <div className="wk-chart-mini">
                        {(() => {
                          const a = Number(t.vendas_ant || 0); const c = Number(t.vendas || 0); const mx = Math.max(1, a, c);
                          return (
                            <>
                              <div className="wk-col"><div className="wk-col-val">{nf1(a)} un</div><div className="wk-col-bar" style={{ height: `${Math.round((a / mx) * 70) + 6}px` }} /><div className="wk-col-lbl">Anterior</div></div>
                              <div className="wk-col"><div className="wk-col-val">{nf1(c)} un</div><div className="wk-col-bar" style={{ height: `${Math.round((c / mx) * 70) + 6}px`, background: "linear-gradient(180deg,#4ADE80,#059669)" }} /><div className="wk-col-lbl">Atual</div></div>
                            </>
                          );
                        })()}
                      </div>
                      <table className="h-tbl">
                        <thead><tr><th>Período</th><th className="r">Visitas</th><th className="r">Docs</th><th className="r">VGV</th><th className="r">Vendas</th><th className="r">Δ</th></tr></thead>
                        <tbody>
                          <tr><td>Anterior</td><td className="r">—</td><td className="r">—</td><td className="r">{moneyFull(Number(t.vendas_ant || 0) * ticket)}</td><td className="r">{nf1(Number(t.vendas_ant || 0))}</td><td className="r">—</td></tr>
                          <tr className="selected"><td>Atual ({dias}d)</td><td className="r">{nf(t.visitas)}</td><td className="r">{nf(t.docs)}</td><td className="r">{moneyFull(vgvTot)}</td><td className="r">{nf1(Number(t.vendas))}</td><td className={`r ${delta(Number(t.vendas), Number(t.vendas_ant)) >= 0 ? "up-txt" : "dn-txt"}`}>{delta(Number(t.vendas), Number(t.vendas_ant)) >= 0 ? "✔" : "▼"} {delta(Number(t.vendas), Number(t.vendas_ant))}%</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* CENTRO */}
                  <div className="panel-cury">
                    <div className="p-hdr-bar"><span>🏆 Ranking &amp; Comparativo — {nivel === "corretor" ? `${nf(linhas.length)} Corretores` : `${nf(linhas.length)} Gerentes`}</span></div>
                    <div className="cascade-filter-bar">
                      <div className="cf-mode-tabs">
                        <div className="mode-pill-group">
                          <span style={{ fontSize: 10.5, color: "#93C5FD", fontWeight: 800, alignSelf: "center", marginRight: 4 }}>VISUALIZAR POR:</span>
                          <button className={`m-pill${nivel === "gerente" ? " active" : ""}`} onClick={() => setNivel("gerente")}>🧑‍💼 Gerentes ({nf(gerentes.length)})</button>
                          <button className={`m-pill${nivel === "corretor" ? " active" : ""}`} onClick={() => setNivel("corretor")}>🏃‍♂️ Corretores ({nf(corretores.length)})</button>
                        </div>
                      </div>
                      <div className="cf-top-row">
                        <div className="cf-field">
                          <label>Filtrar por Gerente</label>
                          <select value={selMgr} onChange={(e) => { setSelMgr(e.target.value); setNivel("corretor"); }} disabled={nivel !== "corretor"}>
                            <option value="ALL">👥 Todos os gerentes</option>
                            {gerentes.map((g) => <option key={nomeDe(g)} value={g.apelido || g.nome}>{nomeDe(g)}</option>)}
                          </select>
                        </div>
                        <div className="cf-field">
                          <label>Ordenar</label>
                          <select disabled><option>Por vendas (maior → menor)</option></select>
                        </div>
                        <div className="cf-field">
                          <label>Status</label>
                          <select disabled><option>Todos</option></select>
                        </div>
                        <div className="cf-field">
                          <label>🔍 Buscar nome</label>
                          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: Datti, Rafael…" />
                        </div>
                      </div>
                    </div>
                    <div className="tbl-scroll tall-475">
                      <table className="h-tbl">
                        <thead>
                          <tr>
                            <th>Rank · {nivel === "corretor" ? "Corretor (Gerente)" : "Gerente"}</th>
                            <th className="r">Check-in</th>
                            <th className="r">Visitas</th>
                            <th className="r">Docs</th>
                            <th className="r">vs ant.</th>
                            <th className="r">Vendas</th>
                            <th className="r">Δ</th>
                            <th className="r">VGV</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((l, i) => {
                            const v = Number(l.vendas || 0); const d = delta(v, Number(l.vendas_ant || 0));
                            return (
                              <tr key={"c" + nomeDe(l) + i}>
                                <td><div className="mgr-cell"><span className="mgr-badge">{i + 1}</span><span>{nomeDe(l)}{nivel === "corretor" && l.gerente_apelido ? <small style={{ color: "#93C5FD", fontWeight: 600 }}> · {l.gerente_apelido}</small> : null}</span></div></td>
                                <td className="r">{nf(Number(l.checkins || 0))}</td>
                                <td className="r">{nf(Number(l.visitas || 0))}</td>
                                <td className="r">{nf(Number(l.docs || 0))}</td>
                                <td className="r">{nf1(Number(l.vendas_ant || 0))}</td>
                                <td className="r"><div className="cell-bar-wrap"><span>{nf(v)}</span><div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${Math.round((v / maxCenter) * 100)}%` }} /></div></div></td>
                                <td className={`r ${d >= 0 ? "up-txt" : "dn-txt"}`}>{d >= 0 ? "✔" : "▼"} {Math.abs(d)}%</td>
                                <td className="r">{moneyFull(rowVgv(l))}</td>
                              </tr>
                            );
                          })}
                          {!linhas.length ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "#93C5FD" }}>Sem dados no período.</td></tr> : null}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total Consolidado</td>
                            <td className="r">{nf(t.checkins)}</td>
                            <td className="r">{nf(t.visitas)}</td>
                            <td className="r">{nf(t.docs)}</td>
                            <td className="r">{nf1(Number(t.vendas_ant))}</td>
                            <td className="r">{nf1(Number(t.vendas))}</td>
                            <td className="r up-txt">✔ {delta(Number(t.vendas), Number(t.vendas_ant))}%</td>
                            <td className="r">{moneyFull(vgvTot)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* DIREITA */}
                  <aside className="right-visual-panel">
                    <div>
                      <div className="rvp-title"><span>🎯 Check-in → Visita</span><span style={{ color: "var(--green-bright)", fontFamily: "var(--mono)" }}>{pct(t.presenca_pct)}</span></div>
                      <div className="donut-row">
                        <div className="donut-circle" style={{ background: `conic-gradient(#10B981 0% ${t.presenca_pct}%, #38BDF8 ${t.presenca_pct}% ${Math.min(100, Number(t.presenca_pct) + 20)}%, #1E3A8A ${Math.min(100, Number(t.presenca_pct) + 20)}% 100%)` }}>
                          <div className="donut-inner"><strong>{nf(t.visitas)}</strong><small>Visitas</small></div>
                        </div>
                        <div style={{ fontSize: 11.5, color: "#CBD5E1", lineHeight: 1.55 }}>
                          <div>📍 <strong>{nf(t.checkins)}</strong> Check-ins</div>
                          <div>👀 <strong style={{ color: "#4ADE80" }}>{nf(t.visitas)}</strong> Visitas (atend.)</div>
                          <div>📁 <strong style={{ color: "#38BDF8" }}>{nf(t.docs_ok)}</strong> Pastas OK</div>
                          <div>💰 <strong style={{ color: "var(--gold)" }}>{nf(t.vendas)}</strong> Vendas</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div className="rvp-title"><span>🏅 Vendas por Gerente</span><small style={{ color: "#93C5FD", fontSize: 10.5 }}>Clique p/ ver corretores</small></div>
                      <div className="sup-bars-list">
                        {topGer.map((g, i) => {
                          const v = Number(g.vendas || 0); const d = delta(v, Number(g.vendas_ant || 0));
                          return (
                            <div className="sb-row" key={"g" + nomeDe(g)} onClick={() => { setSelMgr(g.apelido || g.nome); setNivel("corretor"); }}>
                              <div className="sb-name">{i + 1}. {nomeDe(g)}</div>
                              <div className="sb-track"><div className="sb-fill" style={{ width: `${Math.max(18, Math.round((v / maxGer) * 100))}%` }}><span>{nf(v)} un · R$ {moneyM(rowVgv(g))}</span><span>{d >= 0 ? "✔" : "✖"} {d}%</span></div></div>
                            </div>
                          );
                        })}
                        {!topGer.length ? <div style={{ color: "#93C5FD", fontSize: 11.5 }}>Sem dados no período.</div> : null}
                      </div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "10px 12px", fontSize: 11.5 }}>
                      <div style={{ fontWeight: 800, color: "var(--gold)", marginBottom: 5 }}>⚡ Atalho</div>
                      <button onClick={() => { setSelMgr("ALL"); setNivel("corretor"); }} style={{ width: "100%", background: "linear-gradient(90deg,#2563EB,#3B82F6)", color: "#fff", border: "none", padding: 8, borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                        🏃‍♂️ Abrir Ranking de Corretores ➔
                      </button>
                    </div>
                  </aside>
                </div>

                <div style={{ fontSize: 11, color: "#475569", marginTop: 10, padding: "0 4px" }}>
                  Cartões: vendas e pastas = Junix · check-in e visitas = C2S. Tabelas abaixo: vendas registradas no Comandra; R$ realizado = valor informado no Comandra (leads.sale_value); VGV das tabelas = estimativa (vendas × ticket médio R$ {Math.round(ticket / 1000)} mil).
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
