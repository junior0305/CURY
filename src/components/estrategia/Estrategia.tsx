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

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const somaDias = (n: number) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const ETAPAS = ["Pendência", "Cadastro", "Simular", "Selecionar Unidade", "Anexar Documento", "Sem Análise",
  "Laudo / Pré-Análise", "Proposta", "Parecer", "Emissão", "Venda Confirmada"];
const FECHA_NO_MES = new Set(["Proposta", "Parecer", "Emissão", "Venda Confirmada"]);

interface Combinar { sobre: string; pergunta: number; titulo: string; responsavelId?: string | null }
type MetaPainel = { dono: PessoaMeta; filhos: PessoaMeta[] };

export default function Estrategia({ diretorId, supers, pastas }: { diretorId: string; supers: SuperDiretoria[]; pastas: PastaJunix[] }) {
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
  return (
    <>
      <Pergunta1 metaDir={metaDir} supers={supers} metaSuper={metaSuper} linha={linha} c30={c30?.linhas ?? null}
        diaHoje={diaHoje} diasMes={diasMes} mes={mes} abrir={abrir} />
      <Pergunta2 pastas={pastas} supers={supers} metaDir={metaDir} abrir={abrir} />
      <Pergunta3 diretorId={diretorId} supers={supers} linhasMes={cMes?.linhas ?? null} mes={mes} />
      <Pergunta4 supers={supers} linha={linha} carregando={!c30} abrir={abrir} />
      <Pergunta5 abrir={abrir} />
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

/* ───────────── 1. META ───────────── */
function MetaInline({ pessoa, mes }: { pessoa: PessoaMeta; mes: string }) {
  const qc = useQueryClient();
  const [txt, setTxt] = useState(pessoa.meta == null ? "" : String(pessoa.meta));
  if (!pessoa.pode_editar) return <>{pessoa.meta ?? "—"}</>;
  const salvar = async () => {
    const n = parseInt(txt, 10);
    if (Number.isNaN(n) || n === pessoa.meta) return;
    const { error } = await supabase.rpc("definir_meta" as any, { p_mes: mes, p_dono: pessoa.id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${pessoa.nome}: ${n}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  };
  return <input className="est-meta-in" type="number" min={0} inputMode="numeric" value={txt} placeholder="—" aria-label={`meta de ${pessoa.nome}`}
    onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function Pergunta1({ metaDir, supers, metaSuper, linha, c30, diaHoje, diasMes, mes, abrir }: {
  metaDir?: MetaPainel; supers: SuperDiretoria[]; metaSuper: Map<string, MetaPainel | undefined>; linha: Map<string, LinhaConsolidado>;
  c30: LinhaConsolidado[] | null; diaHoje: number; diasMes: number; mes: string; abrir: (c: Combinar) => void;
}) {
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  if (!metaDir) return <section className="dir-card est-q"><div className="dir-vazio">Buscando as metas…</div></section>;
  const proj = (r: number) => Math.round((r / diaHoje) * diasMes);
  const meta = metaDir.dono.meta ?? 0, vendido = metaDir.dono.realizado;
  const faltam = Math.max(0, meta - vendido);
  const semanas = Math.max(1, (diasMes - diaHoje) / 7);
  const porSemana = Math.ceil(faltam / semanas);
  const ritmoSemana = (vendido / diaHoje) * 7;
  const esperado = Math.round((meta * diaHoje) / diasMes);
  // conversão da casa (30 dias) — visita do C2S por venda
  const tot = (c30 ?? []).reduce((a, l) => ({ v: a.v + l.visitas, s: a.s + l.vendas }), { v: 0, s: 0 });
  const visitaPorVenda = tot.s > 0 && tot.v >= tot.s ? tot.v / tot.s : null;

  // meta derramada
  const filhosDir = metaDir.filhos.filter((f) => f.papel === "SUPERINTENDENT");
  const somaSupers = filhosDir.reduce((a, f) => a + (f.meta ?? 0), 0);
  const derrame = supers.map((s) => {
    const m = metaSuper.get(s.id);
    const gers = (m?.filhos ?? []).filter((f) => f.papel === "MANAGER");
    return { s, metaS: m?.dono.meta ?? null, gers, soma: gers.reduce((a, g) => a + (g.meta ?? 0), 0), semMeta: gers.filter((g) => g.meta == null) };
  });
  const problemas = [
    ...(meta && somaSupers !== meta ? [`os supers somam ${somaSupers} para ${meta} da diretoria`] : []),
    ...derrame.filter((d) => d.metaS != null && d.gers.length && d.soma !== d.metaS).map((d) => `os gerentes de ${d.s.nome} somam ${d.soma} para ${d.metaS}`),
    ...derrame.filter((d) => d.semMeta.length).map((d) => `${d.semMeta.length} gerente${d.semMeta.length > 1 ? "s" : ""} de ${d.s.nome} sem meta`),
  ];

  const linhaPessoa = (p: PessoaMeta, nivel: "sup" | "sub", superId: string) => {
    const pr = proj(p.realizado);
    const dev = p.meta != null ? Math.max(0, p.meta - p.realizado) : null;
    const ruim = p.meta != null && pr < p.meta;
    return (
      <tr key={p.id} className={nivel}>
        <td>{nivel === "sup" ? <button className="dir-abrir" onClick={() => setAberto((v) => ({ ...v, [superId]: !v[superId] }))}>
          <span className={`dir-seta${aberto[superId] ? " on" : ""}`} aria-hidden>▸</span> {p.nome}</button> : p.nome}</td>
        <td><MetaInline pessoa={p} mes={mes} /></td>
        <td>{p.realizado}</td>
        <td><div className="dir-bar" style={{ minWidth: 90 }}><i className={ruim ? "ruim" : ""} style={{ width: `${p.meta ? Math.min(100, (p.realizado / p.meta) * 100) : 0}%`, background: ruim ? "var(--red)" : undefined }} /></div></td>
        <td className={ruim ? "ruim" : ""}>{pr}</td>
        <td className={dev ? "ruim" : ""}>{dev == null ? <span className="dir-chip c-gray">sem meta</span> : dev}</td>
        <td className="ac">{p.meta == null && p.pode_editar ? <span className="dir-nota">defina ao lado</span>
          : dev ? <button className="dir-btn-action" onClick={() => abrir({ sobre: p.nome, pergunta: 1, responsavelId: p.id,
            titulo: `Plano para recuperar ${dev} venda${dev > 1 ? "s" : ""} até o fim do mês` })}>Combinar ação</button> : null}</td>
      </tr>
    );
  };

  return (
    <section className="dir-card est-q">
      <Cab n={1} titulo="Vamos bater a meta? Quem está devendo?" veredito={proj(vendido) >= meta ? "No ritmo da meta" : "Não fecha no ritmo atual"}
        tom={proj(vendido) >= meta ? "grn" : "red"}>
        No ritmo atual fechamos <b>{proj(vendido)} de {meta}</b>. Faltam <b>{faltam} vendas em {diasMes - diaHoje} dias</b>, cerca de <b>{porSemana} por semana</b>. Hoje fazemos {ritmoSemana.toFixed(1).replace(".", ",")}.
      </Cab>
      <div className="est-g2">
        <div className="est-box">
          <div className="dir-lbl">Meta da diretoria</div>
          <div className="est-big mono">{vendido}<span style={{ fontSize: 18, color: "var(--ink-3)" }}> / {meta}</span></div>
          <div className="est-pace" aria-label={`Vendido ${vendido}, esperado ${esperado} até hoje`}>
            <i style={{ width: `${meta ? Math.min(100, (vendido / meta) * 100) : 0}%` }} />
            <em style={{ left: `${(diaHoje / diasMes) * 100}%` }} /><b style={{ left: `${(diaHoje / diasMes) * 100}%` }}>devia estar em {esperado}</b>
          </div>
          <div className="dir-lbl">O que precisa acontecer por semana</div>
          <div className="est-g3">
            <div><div className="est-big mono" style={{ fontSize: 24 }}>{porSemana}</div><div className="dir-nota">vendas</div></div>
            <div><div className="est-big mono" style={{ fontSize: 24 }}>{visitaPorVenda ? Math.ceil(porSemana * visitaPorVenda) : "—"}</div>
              <div className="dir-nota">visitas no C2S{visitaPorVenda ? ` (${visitaPorVenda.toFixed(1).replace(".", ",")} por venda)` : ""}</div></div>
            <div><div className="est-big mono" style={{ fontSize: 24 }}>{tot.v}</div><div className="dir-nota">visitas lançadas em 30 dias</div></div>
          </div>
          {!visitaPorVenda ? <p className="dir-nota" style={{ margin: 0 }}>Com {tot.v} visitas lançadas no C2S para {tot.s} vendas em 30 dias, a conversão por visita não é confiável. O número aparece quando as equipes lançarem as visitas.</p> : null}
        </div>
        <div className="est-box">
          <div className="dir-lbl">Meta derramada</div>
          {problemas.length ? <div className="est-warn"><b style={{ color: "var(--org)" }}>!</b><div>A meta derramada <b>não fecha</b>: {problemas.join("; ")}.</div></div>
            : <div className="est-warn info"><div>A meta derramada fecha em todos os níveis.</div></div>}
          <div className="est-item"><div><div className="t">Diretoria → supers</div><div className="m">{filhosDir.map((f) => `${f.nome} ${f.meta ?? "—"}`).join(" · ")}</div></div>
            <span className={`dir-chip ${somaSupers === meta ? "c-grn" : "c-org"}`}>{somaSupers} de {meta}</span></div>
          {derrame.map((d) => (
            <div key={d.s.id} className="est-item"><div style={{ minWidth: 0 }}><div className="t">{d.s.nome} → gerentes</div>
              <div className="m">{d.gers.map((g) => `${g.nome} ${g.meta ?? "—"}`).join(" · ") || "nenhum gerente"}</div></div>
              <span className={`dir-chip ${!d.gers.length || d.semMeta.length === d.gers.length ? "c-red" : d.soma === d.metaS ? "c-grn" : "c-org"}`}>
                {d.semMeta.length === d.gers.length ? "sem meta" : `${d.soma} de ${d.metaS ?? "—"}`}</span></div>
          ))}
        </div>
      </div>
      <div className="est-tab">
        <table>
          <thead><tr><th>Equipe</th><th>Meta</th><th>Vendeu</th><th>Ritmo</th><th>Projeção</th><th>Devendo</th><th /></tr></thead>
          <tbody>
            {supers.map((s) => {
              const m = metaSuper.get(s.id);
              if (!m) return null;
              return [linhaPessoa(m.dono, "sup", s.id), ...(aberto[s.id] ? m.filhos.filter((f) => f.papel === "MANAGER").map((g) => linhaPessoa(g, "sub", s.id)) : [])];
            })}
          </tbody>
        </table>
      </div>
      <p className="dir-nota" style={{ margin: 0 }}>Vendas do Junix no mês. Clique no super para abrir os gerentes; a meta pode ser editada direto na tabela.</p>
    </section>
  );
}

/* ───────────── 2. PASTAS ───────────── */
function Pergunta2({ pastas, supers, metaDir, abrir }: { pastas: PastaJunix[]; supers: SuperDiretoria[]; metaDir?: MetaPainel; abrir: (c: Combinar) => void }) {
  const porEtapa = new Map<string, number>();
  for (const p of pastas) porEtapa.set(p.etapa ?? "Outras", (porEtapa.get(p.etapa ?? "Outras") ?? 0) + 1);
  const ordem = [...ETAPAS.filter((e) => porEtapa.has(e)), ...[...porEtapa.keys()].filter((e) => !ETAPAS.includes(e))];
  const max = Math.max(1, ...porEtapa.values());
  const perto = pastas.filter((p) => FECHA_NO_MES.has(p.etapa ?? "")).length;
  const vendido = metaDir?.dono.realizado ?? 0, meta = metaDir?.dono.meta ?? 0;
  const teto = vendido + perto;
  // paradas 7d+ por gerente
  const paradas = new Map<string, { nome: string; gerenteId: string | null; n: number; etapas: Set<string> }>();
  for (const p of pastas) {
    if ((p.dias ?? 0) < 7) continue;
    const k = p.gerente ?? "sem gerente";
    const d = donoJunix(supers, p.superintendente, p.gerente, p.corretor);
    const e = paradas.get(k) ?? { nome: k, gerenteId: d.gerenteId, n: 0, etapas: new Set<string>() };
    e.n++; e.etapas.add(p.etapa ?? "—"); paradas.set(k, e);
  }
  const lista = [...paradas.values()].sort((a, b) => b.n - a.n);
  const nomeGer = (id: string | null, txt: string) => supers.flatMap((s) => s.gerentes).find((g) => g.id === id)?.nome ?? txt;
  return (
    <section className="dir-card est-q">
      <Cab n={2} titulo="As pastas em andamento viram venda este mês?" veredito={teto >= meta ? "Funil sustenta a meta" : "Funil curto"} tom={teto >= meta ? "grn" : "red"}>
        Pastas perto de virar venda: <b>{perto}</b> (proposta, parecer, emissão, confirmada). Mesmo se todas fecharem, chegamos a <b>{teto} de {meta}</b>.
        {teto < meta ? <> <b>O funil não sustenta a meta</b>: falta gerar pasta, não só fechar.</> : null}
      </Cab>
      <div className="est-g2">
        <div className="est-box">
          <div className="dir-lbl">{pastas.length} pastas no Junix, por etapa</div>
          <div className="est-funil">
            {ordem.map((e) => (
              <div key={e} className={`est-frow${FECHA_NO_MES.has(e) ? " hot" : ""}`}>
                <span>{e}</span><div className="dir-bar"><i style={{ width: `${((porEtapa.get(e) ?? 0) / max) * 100}%` }} /></div>
                <span className="mono">{porEtapa.get(e)}</span>
              </div>
            ))}
          </div>
          <p className="dir-nota" style={{ margin: 0 }}>Verde-azulado: etapas que viram venda dentro do mês.</p>
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
function CombinarAcao({ diretorId, c, fechar }: { diretorId: string; c: Combinar; fechar: () => void }) {
  const { data: pessoas } = useEstrutura(diretorId);
  const ac = useCompromissoAcoes();
  const [titulo, setTitulo] = useState(c.titulo);
  const [resp, setResp] = useState(c.responsavelId ?? "");
  const [prazo, setPrazo] = useState(somaDias(5));
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
