// Aba Estratégia do diretor: as 5 perguntas da reunião de segunda. Cada uma termina num botão que
// vira compromisso (responsável, prazo, lembrete no WhatsApp) — a pergunta 5 confere se foi feito.
//   1 meta ← metas_painel (diretor e cada super)       2 pastas ← junix_pastas
//   3 dinheiro ← gastos por canal + Facebook + leads por origem
//   4 time ← rollup do super + C2S (plantão, visita)  5 compromissos ← compromissos
import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConsolidadoSuper, type LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import { donoJunix, type PastaJunix, type PessoaMeta, type SuperDiretoria } from "@/hooks/useDiretoria";
import { useEstrutura, useGastos, hojeSP } from "@/hooks/usePlano";
import { useCompromissos, useCompromissoAcoes, vencido, type Compromisso, type Lembrete } from "@/hooks/useCompromissos";
import GastosPlano from "@/components/plano/GastosPlano";
import Conselho from "./Conselho";
import SalaDeGuerraCampanha from "./SalaDeGuerraCampanha";
import MinhaEstrategia from "./MinhaEstrategia";
import { lerPastas, resumoPastas } from "@/components/diretoria/pastasAnalise";
import { empresa } from "@/lib/empresa";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const somaDias = (n: number) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const ETAPAS = ["Pendência", "Cadastro", "Simular", "Selecionar Unidade", "Anexar Documento", "Sem Análise",
  "Laudo / Pré-Análise", "Proposta", "Parecer", "Emissão", "Venda Confirmada"];
const FECHA_NO_MES = new Set(["Proposta", "Parecer", "Emissão", "Venda Confirmada"]);

export interface Combinar { sobre: string; pergunta: number; titulo: string; responsavelId?: string | null; prazoDias?: number }
type MetaPainel = { dono: PessoaMeta; filhos: PessoaMeta[] };

export default function Estrategia({ diretorId, supers, pastas }: { diretorId: string; supers: SuperDiretoria[]; pastas: PastaJunix[] }) {
  const [visao, setVisao] = useState<"sala_de_guerra" | "diagnostico" | "minhas_estrategias">("sala_de_guerra");
  const [conselhoAberto, setConselhoAberto] = useState(false);
  const [combinar, setCombinar] = useState<Combinar | null>(null);
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const mes = inicioMes();

  const { data: c30 } = useConsolidadoSuper(diretorId, 30);
  const { data: cMes } = useConsolidadoSuper(diretorId, diaHoje);
  const linha = useMemo(() => new Map((c30?.linhas ?? []).map((l) => [l.id, l])), [c30]);

  const metasQ = useQueries({
    queries: [diretorId, ...supers.map((s) => s.id)].map((id) => ({
      queryKey: ["metas-painel", mes, id], staleTime: 60_000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mes, p_dono: id });
        if (error) throw error;
        return data as unknown as MetaPainel;
      },
    })),
  });
  const metaDir = metasQ[0]?.data;
  const metaSuper = new Map(supers.map((s, i) => [s.id, metasQ[i + 1]?.data]));

  const abrir = (c: Combinar) => setCombinar(c);

  // fatos para o Conselho de estratégia (IA): os mesmos números das 5 perguntas, já calculados
  const { data: compromissos } = useCompromissos();
  const { data: gastos } = useGastos(mes);
  const { data: cats } = useQuery({
    queryKey: ["gasto-categorias-canal"], staleTime: 10 * 60_000,
    queryFn: async () => ((await supabase.from("gasto_categorias" as any).select("id,canal").eq("ativa", true)).data ?? []) as unknown as { id: string; canal: Canal }[],
  });
  const pronto = !!metaDir && !!c30 && !!cMes && metasQ.every((q) => !q.isLoading);
  const fatos = useMemo(() => {
    if (!pronto || !metaDir) return {};
    const proj = (r: number) => Math.round((r / diaHoje) * diasMes * 10) / 10;
    const lidas = lerPastas(pastas).map((p) => ({ ...p, sup: supers.find((s) => s.id === donoJunix(supers, p.superintendente, p.gerente).superId)?.nome ?? "fora do Comandra" }));
    const rp = resumoPastas(lidas);
    const tit = (t: string | null) => (t ?? "—").replace(/\s+BN\s*$/i, "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    const canalDe = new Map((cats ?? []).map((c) => [c.id, c.canal]));
    const fb = (cMes?.linhas ?? []).reduce((a, l) => a + (l.gasto ?? 0), 0);
    const ld = (cMes?.linhas ?? []).reduce((a, l) => ({ anuncio: a.anuncio + l.leads.anuncio, disparo: a.disparo + l.leads.disparo, pescados: a.pescados + l.leads.pescados }), { anuncio: 0, disparo: 0, pescados: 0 });
    return {
      hoje: hojeSP(), dia_do_mes: diaHoje, dias_no_mes: diasMes,
      referencias_da_casa: { presenca_no_plantao: "60%", plantoes_por_corretor_no_mes: 12, visita_a_cada_plantoes: 8, pasta_vira_venda: "40%",
        chance_no_mes: "emissão 85%, proposta 50%, aprovada 60%, em análise 30%, documentos 20%, unidade 12%, cadastro 6%" },
      meta: {
        diretoria: {
          meta: (() => {
            const filhos = metaDir.filhos.filter((f) => f.papel === "SUPERINTENDENT");
            const soma = filhos.reduce((a, f) => a + (f.meta ?? 0), 0);
            return soma > 0 ? soma : (metaDir.dono.meta ?? 65);
          })(),
          vendido_no_placar: metaDir.dono.realizado,
          projecao_no_ritmo: proj(metaDir.dono.realizado),
        },
        superintendencias: supers.map((s) => { const m = metaSuper.get(s.id); return { nome: s.nome, meta: m?.dono.meta ?? null, vendido: m?.dono.realizado ?? 0,
          projecao_no_ritmo: proj(m?.dono.realizado ?? 0), gerentes: (m?.filhos ?? []).filter((f) => f.papel === "MANAGER").map((g) => ({ nome: g.nome, meta: g.meta, vendido: g.realizado })) }; }),
        observacao: empresa().notas_ia.join(" · "),
      },
      funil_30_dias: (() => {
        const ls30 = c30?.linhas ?? [];
        const leads = ls30.reduce((a, l) => ({ anuncio: a.anuncio + l.leads.anuncio, disparo: a.disparo + l.leads.disparo, pescados: a.pescados + l.leads.pescados, outros: a.outros + l.leads.outros }), { anuncio: 0, disparo: 0, pescados: 0, outros: 0 });
        const desde = Date.now() - 30 * 864e5;
        const c2sCor = supers.reduce((a, x) => a + (x.c2s?.gerentes.reduce((b, g) => b + g.corretores30, 0) ?? 0), 0);
        return {
          leads: { total: leads.anuncio + leads.disparo + leads.pescados + leads.outros, ...leads },
          plantoes: ls30.reduce((a, l) => a + l.plantaoDias, 0) + supers.reduce((a, x) => a + (x.c2s?.dias ?? 0), 0),
          visitas_lancadas_no_c2s: ls30.reduce((a, l) => a + l.visitas, 0),
          pastas_cadastradas: pastas.filter((p) => p.cadastrada_em && new Date(p.cadastrada_em).getTime() >= desde).length,
          vendas: Math.round(ls30.reduce((a, l) => a + l.vendas, 0) * 10) / 10,
          corretores: { no_comandra: supers.reduce((a, x) => a + x.gerentes.reduce((b, g) => b + g.corretores, 0), 0), so_no_c2s_sem_conta_no_comandra: c2sCor },
          observacoes: [...empresa().notas_ia, "pastas cadastradas = pastas abertas hoje no Junix cadastradas nos últimos 30 dias (as que já viraram venda ou foram arquivadas não entram)"].join("; "),
        };
      })(),
      pastas: { total: rp.total, clientes: rp.clientes, vivas: rp.vivas, previsao_de_vendas_no_mes: Math.round(rp.previsao * 10) / 10,
        reta_final: rp.reta.n, fora_da_conta: { duplicadas: rp.duplicadas, reprovadas: rp.reprovadas, paradas_60_dias: rp.mortas },
        por_superintendencia: supers.map((s) => { const ps = lidas.filter((p) => p.sup === s.nome && p.viva);
          return { nome: s.nome, vivas: ps.length, previsao: Math.round(ps.reduce((a, p) => a + p.chance, 0) * 10) / 10, reta_final: ps.filter((p) => p.reta).length }; }),
        reta_final_lista: lidas.filter((p) => p.reta).map((p) => ({ cliente: tit(p.cliente), empreendimento: tit(p.empreendimento), etapa: p.etapa, status: p.status, super: p.sup, gerente: tit(p.gerente), corretor: tit(p.corretor) })) },
      time_por_gerente: supers.flatMap((s) => s.gerentes.map((g) => { const l = linha.get(g.id);
        return { gerente: g.nome, super: s.nome, corretores_no_comandra: g.corretores, plantoes_30d: l?.plantaoDias ?? 0, visitas_30d: l?.visitas ?? 0,
          vendas_30d: l?.vendas ?? 0, leads_sem_nenhum_toque: l?.nuncaFalaram ?? 0, corretores_que_nunca_entraram: g.corretores_lista.filter((c) => !c.ultimo_acesso).length }; })),
      superintendencias_sem_gerente_no_comandra: supers.filter((s) => !s.gerentes.length).map((s) => ({ nome: s.nome,
        plantao_c2s: s.c2s ? { dias_de_plantao_no_periodo: s.c2s.dias, gerentes_no_c2s: s.c2s.gerentes.map((g) => g.nome) } : "sem plantão no C2S" })),
      dinheiro_no_mes: CANAIS.map(([k, nome]) => { const gs = (gastos ?? []).filter((g) => canalDe.get(g.categoria_id) === k);
        const gasto = gs.reduce((a, g) => a + g.realizado, 0) + (k === "anuncio" ? fb : 0);
        const leads = k === "anuncio" ? ld.anuncio : k === "disparo" ? ld.disparo : k === "prospeccao" ? ld.pescados : null;
        return { canal: nome, planejado: gs.reduce((a, g) => a + g.planejado, 0), gasto: Math.round(gasto), leads, custo_por_lead: leads && gasto ? Math.round(gasto / leads) : null }; }),
      compromissos: (compromissos ?? []).filter((c) => c.status !== "cancelado").slice(0, 25).map((c) => ({ titulo: c.titulo, responsavel: c.responsavel, prazo: c.prazo,
        situacao: c.status === "feito" ? `feito${c.resultado ? ": " + c.resultado : ""}` : vencido(c) ? "VENCIDO" : "aberto" })),
      pessoas: [...supers.map((s) => ({ id: s.id, nome: s.nome, papel: "superintendente" })),
        ...supers.flatMap((s) => s.gerentes.map((g) => ({ id: g.id, nome: g.nome, papel: `gerente (${s.nome})` })))],
    };
  }, [pronto, metaDir, metaSuper, supers, pastas, linha, cMes, cats, gastos, compromissos, diaHoje, diasMes]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="dir-per" style={{ background: "#E2E8F0", padding: 4 }}>
          <button
            className={visao === "sala_de_guerra" ? "on" : ""}
            onClick={() => setVisao("sala_de_guerra")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            <span>⚔️</span> Sala de Guerra (Reunião & Verba)
          </button>
          <button
            className={visao === "diagnostico" ? "on" : ""}
            onClick={() => setVisao("diagnostico")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            <span>🧠</span> Conselho IA & Diagnóstico (5 Perguntas)
          </button>
          <button
            className={visao === "minhas_estrategias" ? "on" : ""}
            onClick={() => setVisao("minhas_estrategias")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
          >
            <span>🎯</span> Minhas Estratégias (Lançamentos & Estoque)
          </button>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>
          {visao === "sala_de_guerra"
            ? "Modo Reunião Tática com os Superintendentes"
            : visao === "diagnostico"
            ? "Modo Rotina Executiva & Auditoria Semanal"
            : "Portfólio de Produtos, Lançamentos e Estoque do Diretor"}
        </span>
      </div>

      {visao === "sala_de_guerra" ? (
        <SalaDeGuerraCampanha
          diretorId={diretorId}
          supers={supers}
          metaDir={metaDir}
          metaSuper={metaSuper}
          linha={linha}
          c30={c30?.linhas ?? null}
          diaHoje={diaHoje}
          diasMes={diasMes}
          abrir={abrir}
        />
      ) : visao === "diagnostico" ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              className="dir-btn"
              onClick={() => setConselhoAberto(!conselhoAberto)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                background: conselhoAberto ? "var(--teal)" : "#fff",
                color: conselhoAberto ? "#fff" : "var(--teal)",
                borderColor: "var(--teal)",
              }}
            >
              <span>🧠</span>
              <span>{conselhoAberto ? "Recolher Conselho de IA ▲" : "Consultar Conselho de IA (Perguntas Abertas) ▼"}</span>
            </button>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Diagnóstico de fechamento e auditoria de gargalos abaixo:
            </span>
          </div>

          {conselhoAberto && <Conselho fatos={fatos} pronto={pronto} donoId={diretorId} abrir={abrir} />}

          <Pergunta2 pastas={pastas} supers={supers} metaDir={metaDir} abrir={abrir} />
          <Pergunta3 diretorId={diretorId} supers={supers} linhasMes={cMes?.linhas ?? null} mes={mes} />
          <Pergunta4 supers={supers} linha={linha} carregando={!c30} abrir={abrir} />
          <Pergunta5 abrir={abrir} />
        </>
      ) : (
        <MinhaEstrategia diretorId={diretorId} supers={supers} />
      )}

      {combinar && <CombinarAcao diretorId={diretorId} c={combinar} fechar={() => setCombinar(null)} />}
    </>
  );
}

function Cab({ n, titulo, children, veredito, tom }: { n: number; titulo: string; children: React.ReactNode; veredito?: string; tom?: "red" | "org" | "grn" }) {
  return (
    <div className="est-qh">
      <div>
        <div className="est-qn">PERGUNTA {n}</div>
        <h2>{titulo}</h2>
        <p className="est-ans">{children}</p>
      </div>
      {veredito ? <span className={`est-ver c-${tom ?? "org"}`}>{veredito}</span> : null}
    </div>
  );
}



/* ───────────── 2. PASTAS ───────────── */
function Pergunta2({ pastas, supers, metaDir, abrir }: { pastas: PastaJunix[]; supers: SuperDiretoria[]; metaDir?: MetaPainel; abrir: (c: Combinar) => void }) {
  // mesma leitura da aba Pastas: só conta pasta viva (sem duplicada, reprovada, parada 60+ dias ou já vendida)
  const lidas = lerPastas(pastas), rp = resumoPastas(lidas), vivas = lidas.filter((p) => p.viva);
  const porEtapa = new Map<string, number>();
  for (const p of vivas) porEtapa.set(p.etapa ?? "Outras", (porEtapa.get(p.etapa ?? "Outras") ?? 0) + 1);
  const ordem = [...ETAPAS.filter((e) => porEtapa.has(e)), ...[...porEtapa.keys()].filter((e) => !ETAPAS.includes(e))];
  const max = Math.max(1, ...porEtapa.values());
  const perto = rp.reta.n;
  const filhos = metaDir?.filhos.filter((f) => f.papel === "SUPERINTENDENT") ?? [];
  const somaSupers = filhos.reduce((a, f) => a + (f.meta ?? 0), 0);
  const vendido = metaDir?.dono.realizado ?? 0;
  const meta = somaSupers > 0 ? somaSupers : (metaDir?.dono.meta ?? 65);
  const teto = Math.round(vendido + rp.previsao);
  // paradas 7d+ por gerente
  const paradas = new Map<string, { nome: string; gerenteId: string | null; n: number; etapas: Set<string> }>();
  for (const p of vivas) {
    if ((p.dias ?? 0) < 7) continue;
    const k = p.gerente ?? "sem gerente";
    const d = donoJunix(supers, p.superintendente, p.gerente);
    const e = paradas.get(k) ?? { nome: k, gerenteId: d.gerenteId, n: 0, etapas: new Set<string>() };
    e.n++; e.etapas.add(p.etapa ?? "—"); paradas.set(k, e);
  }
  const lista = [...paradas.values()].sort((a, b) => b.n - a.n);
  const nomeGer = (id: string | null, txt: string) => supers.flatMap((s) => s.gerentes).find((g) => g.id === id)?.nome ?? txt;
  return (
    <section className="dir-card est-q">
      <Cab n={2} titulo="As pastas em andamento viram venda este mês?" veredito={teto >= meta ? "Funil sustenta a meta" : "Funil curto"} tom={teto >= meta ? "grn" : "red"}>
        Das {rp.total} pastas, <b>{rp.vivas} estão vivas</b> e <b>{perto}</b> na reta final (emissão, proposta ou aprovada). Pela chance de cada etapa, o mês fecha perto de <b>{teto} de {meta}</b>.
        {teto < meta ? <> <b>O funil não sustenta a meta</b>: falta gerar pasta, não só fechar.</> : null}
      </Cab>
      <div className="est-g2">
        <div className="est-box">
          <div className="dir-lbl">{rp.vivas} pastas vivas, por etapa · fora da conta: {rp.duplicadas} duplicadas, {rp.reprovadas} reprovadas, {rp.mortas} paradas 60+ dias</div>
          <div className="est-funil">
            {ordem.map((e) => (
              <div key={e} className={`est-frow${FECHA_NO_MES.has(e) ? " hot" : ""}`}>
                <span>{e}</span><div className="dir-bar"><i style={{ width: `${((porEtapa.get(e) ?? 0) / max) * 100}%` }} /></div>
                <span className="mono">{porEtapa.get(e)}</span>
              </div>
            ))}
          </div>
          <p className="dir-nota" style={{ margin: 0 }}>Verde-azulado: etapas que costumam virar venda dentro do mês. Detalhe e cobrança por pasta na aba Pastas.</p>
        </div>
        <div className="est-box">
          <div className="dir-lbl">Pastas paradas há 7 dias ou mais</div>
          <div className="est-warn info"><div>A contagem de dias na etapa começou em 12/10. Antes disso, só as pastas em cadastro têm a data real; as outras vão aparecer aqui conforme os dias passarem.</div></div>
          {lista.length ? lista.slice(0, 6).map((g) => (
            <div key={g.nome} className="est-item"><div><div className="t">{nomeGer(g.gerenteId, g.nome)} · {g.n} parada{g.n > 1 ? "s" : ""}</div>
              <div className="m">{[...g.etapas].join(", ")}</div></div>
              <button className="dir-btn-action" onClick={() => abrir({ sobre: `pastas paradas de ${nomeGer(g.gerenteId, g.nome)}`, pergunta: 2, responsavelId: g.gerenteId,
                titulo: `Destravar ${g.n} pasta${g.n > 1 ? "s" : ""} parada${g.n > 1 ? "s" : ""} (${[...g.etapas].join(", ")})` })}>Combinar ação</button></div>
          )) : <div className="dir-nota">Nenhuma pasta parada há 7 dias ou mais.</div>}
        </div>
      </div>
    </section>
  );
}

/* ───────────── 3. DINHEIRO ───────────── */
type Canal = "anuncio" | "disparo" | "acao_rua" | "prospeccao" | "outros";
const CANAIS: [Canal, string][] = [["anuncio", "Anúncio"], ["disparo", "Disparo"], ["acao_rua", "Ação de rua"], ["prospeccao", "Prospecção"], ["outros", "Outros gastos"]];

function Pergunta3({ diretorId, supers, linhasMes, mes }: { diretorId: string; supers: SuperDiretoria[]; linhasMes: LinhaConsolidado[] | null; mes: string }) {
  const [lancar, setLancar] = useState(false);
  const { data: cats } = useQuery({
    queryKey: ["gasto-categorias-canal"], staleTime: 10 * 60_000,
    queryFn: async () => ((await supabase.from("gasto_categorias" as any).select("id,canal").eq("ativa", true)).data ?? []) as unknown as { id: string; canal: Canal }[],
  });
  const { data: gastos } = useGastos(mes);
  const canalDe = new Map((cats ?? []).map((c) => [c.id, c.canal]));
  const fb = (linhasMes ?? []).reduce((a, l) => a + (l.gasto ?? 0), 0);
  const leads = (linhasMes ?? []).reduce((a, l) => ({ anuncio: a.anuncio + l.leads.anuncio, disparo: a.disparo + l.leads.disparo, pescados: a.pescados + l.leads.pescados, outros: a.outros + l.leads.outros }),
    { anuncio: 0, disparo: 0, pescados: 0, outros: 0 });
  const linhas = CANAIS.map(([k, nome]) => {
    const gs = (gastos ?? []).filter((g) => canalDe.get(g.categoria_id) === k);
    const planejado = gs.reduce((a, g) => a + g.planejado, 0);
    const gasto = gs.reduce((a, g) => a + g.realizado, 0) + (k === "anuncio" ? fb : 0);
    const nLeads = k === "anuncio" ? leads.anuncio : k === "disparo" ? leads.disparo : k === "prospeccao" ? leads.pescados : null;
    const medicao = k === "anuncio" ? ["automática", "c-grn"] : k === "disparo" || k === "prospeccao" ? ["só leads", "c-org"] : k === "acao_rua" ? ["sem medição", "c-red"] : ["—", "c-gray"];
    return { k, nome, planejado, gasto, nLeads, medicao };
  });
  const semMedicao = linhas.filter((l) => l.k === "acao_rua" && l.gasto > 0).length;
  // anúncio do mês por dono, para o "realizado" automático do lançamento de gastos
  const anuncioPorDono = new Map<string, number>([
    [diretorId, (linhasMes ?? []).find((l) => l.id === "super")?.gasto ?? 0],
    ...supers.map((s) => [s.id, (linhasMes ?? []).filter((l) => l.id === s.id || l.id === `outros:${s.id}` || s.gerentes.some((g) => g.id === l.id))
      .reduce((a, l) => a + (l.gasto ?? 0), 0)] as [string, number]),
  ]);
  return (
    <section className="dir-card est-q">
      <Cab n={3} titulo="Onde está o dinheiro, e o que ele trouxe?" veredito={semMedicao ? "Ação de rua sem medição" : "Venda ainda sem origem"} tom="org">
        Gasto do mês por canal e os leads que cada um trouxe. Canal sem origem marcada aparece como <b>sem medição</b>, sem número inventado.
      </Cab>
      <div className="est-tab">
        <table>
          <thead><tr><th>Canal</th><th>Planejado</th><th>Gasto no mês</th><th>Uso</th><th>Leads no mês</th><th>Custo/lead</th><th>Medição</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.k}>
                <td><b>{l.nome}</b></td>
                <td>{l.planejado ? brl(l.planejado) : "—"}</td>
                <td>{l.gasto ? brl(l.gasto) : "—"}</td>
                <td><div className="dir-bar" style={{ minWidth: 80 }}><i style={{ width: `${l.planejado ? Math.min(100, (l.gasto / l.planejado) * 100) : 0}%`,
                  background: l.planejado && l.gasto > l.planejado ? "var(--red)" : undefined }} /></div></td>
                <td>{l.nLeads ?? "—"}</td>
                <td>{l.nLeads && l.gasto ? brl(l.gasto / l.nLeads) : "—"}</td>
                <td><span className={`dir-chip ${l.medicao[1]}`}>{l.medicao[0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="est-g2">
        <div className="est-box">
          <div className="dir-lbl">O que ainda falta para ver custo por venda</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            <li><b>Ação de rua com QR próprio</b>: o lead que entra pelo panfleto chega marcado com a ação. Próxima etapa.</li>
            <li><b>Venda do Junix ligada ao lead</b> pelo telefone: aí cada canal mostra visitas, vendas e custo por venda.</li>
          </ol>
        </div>
        <div className="est-box">
          <div className="dir-lbl">Lançar gasto</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="dir-btn solid" onClick={() => setLancar((v) => !v)}>{lancar ? "Fechar lançamentos" : "+ Lançar ou planejar gasto"}</button>
          </div>
          <p className="dir-nota" style={{ margin: 0 }}>Diretor, super e gerente lançam cada um no próprio orçamento. O anúncio do Facebook entra sozinho.</p>
        </div>
      </div>
      {lancar ? <GastosPlano raizId={diretorId} mes={mes} podeCriarCategoria anuncio={anuncioPorDono} /> : null}
    </section>
  );
}

/* ───────────── 4. TIME ───────────── */
function Pergunta4({ supers, linha, carregando, abrir }: { supers: SuperDiretoria[]; linha: Map<string, LinhaConsolidado>; carregando: boolean; abrir: (c: Combinar) => void }) {
  if (carregando) return <section className="dir-card est-q"><div className="dir-vazio">Juntando plantão e visitas do C2S…</div></section>;
  const linhas = supers.flatMap((s) => s.gerentes.map((g) => {
    const l = linha.get(g.id);
    const plantao = l?.plantaoDias ?? 0, visitas = l?.visitas ?? 0;
    return { s, g, corretores: g.corretores, plantao, visitas, aCada: visitas ? plantao / visitas : null,
      semToque: l?.nuncaFalaram ?? 0, nunca: g.corretores_lista.filter((c) => !c.ultimo_acesso).length };
  }));
  const ref = linhas.filter((r) => r.visitas >= 2 && r.plantao >= 5).sort((a, b) => (a.aCada ?? 99) - (b.aCada ?? 99))[0];
  const semCorretor = linhas.filter((r) => r.corretores === 0);
  const supersSemTime = supers.filter((s) => s.gerentes.length && s.gerentes.every((g) => g.corretores === 0));
  const ord = [...linhas].sort((a, b) => (b.plantao - b.visitas * (ref?.aCada ?? 3)) - (a.plantao - a.visitas * (ref?.aCada ?? 3)));
  return (
    <section className="dir-card est-q">
      <Cab n={4} titulo="O time está trabalhando de verdade?" veredito={supersSemTime.length ? `${supersSemTime.map((s) => s.nome).join(", ")} fora do sistema` : semCorretor.length ? `${semCorretor.length} gerentes sem corretor` : undefined} tom="red">
        Cada gerente comparado com a referência da casa{ref ? <> (<b>{ref.g.nome}</b>: uma visita a cada {ref.aCada!.toFixed(1).replace(".", ",")} plantões)</> : ""}.
        {supersSemTime.length ? <> <b>As equipes de {supersSemTime.map((s) => s.nome).join(", ")} não têm corretor ativo no Comandra</b>: o painel não enxerga esse time.</> : null}
      </Cab>
      <div className="est-tab">
        <table>
          <thead><tr><th>Gerente</th><th>Super</th><th>Corretores</th><th>Plantões 30d</th><th>Visitas C2S</th><th>Visita a cada</th><th>Sem toque</th><th>Nunca entraram</th><th /></tr></thead>
          <tbody>
            {ord.map((r) => {
              const ruimVisita = r.plantao >= 5 && (r.aCada == null || (ref?.aCada != null && r.aCada > ref.aCada * 2));
              return (
                <tr key={r.g.id}>
                  <td><b>{r.g.nome}</b> {ref && r.g.id === ref.g.id ? <span className="dir-chip c-grn">referência</span> : null}</td>
                  <td style={{ fontFamily: "inherit" }}>{r.s.nome}</td>
                  <td className={r.corretores === 0 ? "ruim" : ""}>{r.corretores}</td>
                  <td>{r.plantao}</td>
                  <td>{r.visitas}</td>
                  <td className={ruimVisita ? "ruim" : ""}>{r.aCada != null ? `${r.aCada.toFixed(1).replace(".", ",")} plantões` : r.plantao ? "sem visita" : "—"}</td>
                  <td className={r.semToque >= 10 ? "ruim" : ""}>{r.semToque}</td>
                  <td className={r.nunca ? "ruim" : ""}>{r.nunca}</td>
                  <td className="ac">{ruimVisita || r.nunca || r.corretores === 0 || r.semToque >= 10 ? (
                    <button className="dir-btn-action" onClick={() => abrir({ sobre: r.g.nome, pergunta: 4, responsavelId: r.s.id,
                      titulo: r.corretores === 0 ? `Cadastrar os corretores do ${r.g.nome} no Comandra`
                        : r.nunca ? `${r.g.nome}: colocar os ${r.nunca} corretores que nunca entraram para usar o Comandra`
                        : r.semToque >= 10 ? `${r.g.nome}: zerar os ${r.semToque} leads sem toque`
                        : `${r.g.nome}: lançar as visitas no C2S e subir para uma visita a cada ${Math.ceil(ref?.aCada ?? 3)} plantões` })}>Cobrar super</button>) : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dir-nota" style={{ margin: 0 }}>Plantão e visita do C2S, últimos 30 dias. "Visita a cada X plantões" separa a equipe que trabalha da que só bate ponto; sem visita lançada no C2S, esse número não existe.</p>
    </section>
  );
}

/* ───────────── 5. COMPROMISSOS ───────────── */
const NOME_AVISO: Record<string, string> = { vespera: "lembrado na véspera", dia: "lembrado no dia", cobranca: "cobrado", subiu: "subiu ao chefe", manual: "lembrado" };

export function LinhaTempo({ c }: { c: Compromisso }) {
  const hoje = hojeSP();
  const passos: { txt: string; cls: string }[] = [{ txt: `combinado ${dm(c.criado_em.slice(0, 10))}`, cls: "ok" }];
  for (const a of c.avisos) passos.push({ txt: `${NOME_AVISO[a.tipo] ?? a.tipo} ${dm(a.em.slice(0, 10))}${a.whats ? "" : " (sem WhatsApp)"}`, cls: a.tipo === "cobranca" || a.tipo === "subiu" ? "late" : "ok" });
  if (c.pediu_prazo_em) passos.push({ txt: `pediu mais prazo ${dm(c.pediu_prazo_em.slice(0, 10))}`, cls: "now" });
  if (c.status === "feito") passos.push({ txt: `feito ${dm(c.feito_em?.slice(0, 10))}${c.feito_em && c.feito_em.slice(0, 10) <= c.prazo ? " no prazo" : ""}`, cls: "ok" });
  else if (c.prazo < hoje) passos.push({ txt: `venceu ${dm(c.prazo)}`, cls: "late" });
  else if (c.lembrete !== "nenhum") {
    const vespera = new Date(new Date(c.prazo + "T12:00:00").getTime() - 864e5).toISOString().slice(0, 10);
    const prox = c.lembrete === "vespera_dia" && vespera >= hoje && !c.avisos.some((a) => a.tipo === "vespera") ? vespera : c.prazo;
    if (!(prox === c.prazo && c.avisos.some((a) => a.tipo === "dia"))) passos.push({ txt: `próximo lembrete ${dm(prox)}`, cls: "now" });
  }
  return <div className="est-tl">{passos.map((p, i) => <span key={i} className={p.cls}>{p.txt}</span>)}</div>;
}

function Pergunta5({ abrir }: { abrir: (c: Combinar) => void }) {
  const { data: lista, isLoading } = useCompromissos();
  const ac = useCompromissoAcoes();
  const [filtro, setFiltro] = useState<"abertos" | "feitos">("abertos");
  const abertos = (lista ?? []).filter((c) => c.status === "aberto");
  const atrasados = abertos.filter(vencido);
  const feitos = (lista ?? []).filter((c) => c.status === "feito");
  const mostrar = filtro === "abertos" ? [...atrasados, ...abertos.filter((c) => !vencido(c))] : feitos;
  return (
    <section className="dir-card est-q">
      <Cab n={5} titulo="O que combinamos foi feito, e funcionou?" veredito={lista ? `${atrasados.length} atrasado${atrasados.length === 1 ? "" : "s"} · ${abertos.length - atrasados.length} no prazo` : undefined}
        tom={atrasados.length ? "red" : "grn"}>
        Tudo que nasce dos botões <b>Combinar ação</b> vem para cá e aparece em <b>Minhas tarefas</b> no painel do responsável. O lembrete vai no WhatsApp <b>na véspera</b> e <b>no dia</b>; vencido, o Jarvis cobra na manhã seguinte, e dois dias depois avisa o chefe.
      </Cab>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="dir-per">
          <button className={filtro === "abertos" ? "on" : ""} onClick={() => setFiltro("abertos")}>Em aberto ({abertos.length})</button>
          <button className={filtro === "feitos" ? "on" : ""} onClick={() => setFiltro("feitos")}>Feitos em 30 dias ({feitos.length})</button>
        </div>
        <button className="dir-btn" onClick={() => abrir({ sobre: "reunião de segunda", pergunta: 5, titulo: "" })}>+ Novo compromisso</button>
      </div>
      {isLoading ? <div className="dir-nota">Buscando compromissos…</div> : !mostrar.length ? (
        <div className="dir-nota">{filtro === "abertos" ? "Nenhum compromisso em aberto. Use os botões Combinar ação das perguntas acima." : "Nenhum compromisso fechado nos últimos 30 dias."}</div>
      ) : mostrar.map((c) => (
        <div key={c.id} className="est-item">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t">{c.titulo}</div>
            <div className="m">{c.responsavel} · prazo {dm(c.prazo)} · combinado por {c.criador}{c.pergunta ? ` · pergunta ${c.pergunta}` : ""}{c.sobre ? ` · sobre ${c.sobre}` : ""}</div>
            <LinhaTempo c={c} />
            {c.resultado ? <div className="m" style={{ marginTop: 4 }}><b style={{ color: "var(--grn)" }}>Resultado:</b> {c.resultado}</div> : null}
          </div>
          {c.status === "aberto" ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="dir-btn-action" onClick={() => ac.avisar(c.id, "lembrar")}>Lembrar agora</button>
              {vencido(c) ? <button className="dir-btn-action" onClick={() => ac.avisar(c.id, "subir")}>Avisar o chefe</button> : null}
              <button className="dir-btn" onClick={() => ac.alterar(c.id, { status: "cancelado" }, "Compromisso cancelado")}>Cancelar</button>
            </div>
          ) : <span className={`dir-chip ${c.resultado ? "c-grn" : "c-gray"}`}>{c.resultado ? "com resultado" : "feito"}</span>}
        </div>
      ))}
    </section>
  );
}

/* ───────────── COMBINAR AÇÃO ───────────── */
export function CombinarAcao({ diretorId, c, fechar }: { diretorId: string; c: Combinar; fechar: () => void }) {
  const { data: pessoas } = useEstrutura(diretorId);
  const ac = useCompromissoAcoes();
  const [titulo, setTitulo] = useState(c.titulo);
  const [resp, setResp] = useState(c.responsavelId ?? "");
  const [prazo, setPrazo] = useState(somaDias(Math.max(1, Math.min(60, c.prazoDias ?? 5))));
  const [lembrete, setLembrete] = useState<Lembrete>("vespera_dia");
  const [salvando, setSalvando] = useState(false);
  const grupo = (papel: string) => (pessoas ?? []).filter((p) => p.papel === papel);
  const salvar = async () => {
    if (!titulo.trim() || !resp) { toast.error("Diga o que vai ser feito e quem é o responsável."); return; }
    setSalvando(true);
    const ok = await ac.criar({ titulo: titulo.trim(), responsavel_id: resp, prazo, lembrete, sobre: c.sobre, pergunta: c.pergunta });
    setSalvando(false);
    if (ok) fechar();
  };
  return (
    <div className="dir-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) fechar(); }} onKeyDown={(e) => { if (e.key === "Escape") fechar(); }}>
      <div className="dir-modal-box" role="dialog" aria-modal="true" aria-labelledby="comb-t">
        <div><h3 id="comb-t" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Combinar ação</h3><div className="dir-nota">Sobre: {c.sobre}</div></div>
        <label className="est-fld" htmlFor="comb-o">O que vai ser feito
          <input id="comb-o" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Cadastrar os 4 corretores sem login" /></label>
        <label className="est-fld" htmlFor="comb-r">Responsável
          <select id="comb-r" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Escolha</option>
            {[["SUPERINTENDENT", "Superintendentes"], ["MANAGER", "Gerentes"], ["BROKER", "Corretores"]].map(([k, t]) => grupo(k).length ? (
              <optgroup key={k} label={t}>{grupo(k).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</optgroup>) : null)}
          </select></label>
        <div className="est-g2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="est-fld" htmlFor="comb-p">Prazo<input id="comb-p" type="date" min={hojeSP()} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
          <label className="est-fld" htmlFor="comb-l">Lembrete
            <select id="comb-l" value={lembrete} onChange={(e) => setLembrete(e.target.value as Lembrete)}>
              <option value="vespera_dia">Véspera e no dia</option><option value="dia">Só no dia</option><option value="nenhum">Sem lembrete</option>
            </select></label>
        </div>
        <p className="dir-nota" style={{ margin: 0 }}>O responsável vê em Minhas tarefas. Vencido sem marcar feito, o Jarvis cobra na manhã seguinte e, dois dias depois, avisa o chefe dele.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="dir-btn" onClick={fechar}>Cancelar</button>
          <button className="dir-btn solid" disabled={salvando} onClick={salvar}>{salvando ? "Combinando…" : "Combinar"}</button>
        </div>
      </div>
    </div>
  );
}
