/* Aba Equipes do diretor — porte do protótipo aprovado (equipes-proto.html, 13/10).
 * Um card por superintendência, pior primeiro: vendas do mês contra o ritmo da meta derramada,
 * 4 indicadores proporcionais com referência, o gargalo e a ação (cobrar / combinar).
 *   Meta e vendas do mês  ← metas_painel do diretor (vendas_mes_de do super)
 *   Fora do placar        ← junix_vendas.fora_do_placar (ex.: Adajes antes de 12/10)
 *   Plantão / visita      ← C2S (consolidado; super sem gerente no Comandra lê o C2S pelo nome)
 *   Pastas / vendas       ← Junix (consolidado, no período) */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import { useMetasDiretoria, chaveGerente, chaveNome, colado, superJunix, diaSP, gerenteC2S, nomesSuperC2S,
  type SuperDiretoria } from "@/hooks/useDiretoria";
import { CombinarAcao, type Combinar } from "@/components/estrategia/Estrategia";

// Referências da casa (aprovadas no protótipo de 13/10)
const REF = { presenca: 0.6, plantoesMes: 12, plantoesPorVisita: 8, conversao: 0.4 };

type K = "presenca" | "plantoes" | "visita" | "fecha";
type Ind = { k: K; nm: string; sub?: string; val?: string; ref?: string; r?: number | null; falta?: string };
const GARGALO: Record<K, [string, string, string]> = {
  presenca: ["PRESENÇA", "Pouca gente no plantão hoje. Cobrar quem não apareceu.", "subir a presença no plantão"],
  plantoes: ["FREQUÊNCIA", "O corretor vai pouco ao plantão. A escala precisa ser cobrada.", "cumprir a escala de plantão"],
  visita: ["VISITA", "Tem plantão, mas não vira visita. Revisar a abordagem no estande.", "transformar plantão em visita"],
  fecha: ["FECHAMENTO", "Pasta não vira venda. Cobrar documentação e assinatura.", "fechar as pastas abertas"],
};
const st = (r: number | null | undefined) => r == null ? "gray" : r >= 0.9 ? "grn" : r >= 0.6 ? "org" : "red";
const ST_TXT: Record<string, string> = { grn: "ok", org: "atenção", red: "abaixo", gray: "sem dado" };
const COR: Record<string, string> = { grn: "c-grn", org: "c-org", red: "c-red", gray: "c-gray" };
const v1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");
const mi = (n: number) => n >= 1e6 ? `R$ ${(n / 1e6).toFixed(2).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${Math.round(n / 1e3)} mil` : "R$ 0";
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

type Ger = { id?: string; nome: string; corretores: number; hoje: number; plantoes: number; visitas: number | null; vendas: number | null; spark: number[] };

export default function EquipesCards({ diretorId, supers, linhasDoSuper, dias, carregandoCons, abrirPainel }: {
  diretorId: string; supers: SuperDiretoria[]; linhasDoSuper: (s: SuperDiretoria) => LinhaConsolidado[];
  dias: number; carregandoCons: boolean; abrirPainel: (id: string) => void;
}) {
  const qc = useQueryClient();
  const mes = inicioMes();
  const { data: metas } = useMetasDiretoria(diretorId, mes);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [combinar, setCombinar] = useState<Combinar | null>(null);

  // vendas do mês que não contam no placar da diretoria, por super
  const { data: fora } = useQuery({
    queryKey: ["eq-fora-placar", mes],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("junix_vendas" as any).select("superintendente,qtd")
        .eq("ativo", true).eq("fora_do_placar", true).gte("data_venda", mes);
      return ((data ?? []) as any[]).map((r) => ({ sup: colado(superJunix(r.superintendente)), qtd: Number(r.qtd ?? 1) }));
    },
  });

  // presença dos últimos 7 dias por gerente (C2S), para o mini-gráfico
  const { data: sete } = useQuery({
    queryKey: ["eq-c2s-7d"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const de = diaSP(Date.now() - 6 * 864e5);
      const rows: any[] = [];
      for (let a = 0; ; a += 1000) {
        const { data } = await supabase.from("c2s_plantao" as any).select("dia,corretor,gerente,superintendente,diretor").gte("dia", de).range(a, a + 999);
        rows.push(...((data ?? []) as any[])); if (!data || data.length < 1000) break;
      }
      const diasL = Array.from({ length: 7 }, (_, i) => diaSP(Date.now() - (6 - i) * 864e5));
      const m = new Map<string, Set<string>[]>();
      const add = (k: string, dia: string, c: string) => {
        const i = diasL.indexOf(dia); if (i < 0) return;
        const arr = m.get(k) ?? diasL.map(() => new Set<string>()); arr[i].add(c); m.set(k, arr);
      };
      for (const r of rows) {
        const c = chaveNome(r.corretor);
        if (/gilberto/i.test(String(r.diretor ?? ""))) add(`g:${chaveGerente(r.gerente)}`, r.dia, c);
        add(`s:${r.superintendente}|${gerenteC2S(r.gerente)}`, r.dia, c);
      }
      return new Map([...m.entries()].map(([k, v]) => [k, v.map((x) => x.size)]));
    },
  });

  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const ritmo = hoje.getDate() / diasMes;

  // antes do primeiro ponto do dia (C2S sincroniza ao longo do dia), presença zerada não é gargalo
  const semPontoHoje = supers.every((s) => (s.c2s ? s.c2s.hoje : s.gerentes.reduce((a, g) => a + g.plantao_hoje, 0)) === 0);

  const cards = useMemo(() => supers.map((s) => {
    const ls = linhasDoSuper(s);
    const soma = (f: (l: LinhaConsolidado) => number) => ls.reduce((a, l) => a + f(l), 0);
    const c2s = s.c2s;
    const corretores = c2s ? c2s.gerentes.reduce((a, g) => a + g.corretores30, 0) : s.gerentes.reduce((a, g) => a + g.corretores, 0);
    const hojeN = c2s ? c2s.hoje : s.gerentes.reduce((a, g) => a + g.plantao_hoje, 0);
    const plantoes = c2s ? c2s.dias : soma((l) => l.plantaoDias);
    const semPlantao = !c2s && plantoes === 0 && hojeN === 0;
    const visitas = soma((l) => l.visitas), pastas = soma((l) => l.pastas), vgv = soma((l) => l.vgv);

    const inds: Ind[] = [];
    if (semPlantao) inds.push({ k: "presenca", nm: "Presença hoje", falta: "Plantão desta equipe não aparece no C2S. Sem ponto, não dá para medir." });
    else if (!corretores) inds.push({ k: "presenca", nm: "Presença hoje", falta: "Nenhum corretor cadastrado." });
    else if (semPontoHoje) inds.push({ k: "presenca", nm: "Presença hoje", falta: "O C2S ainda não trouxe nenhum ponto de hoje." });
    else { const r = hojeN / corretores; inds.push({ k: "presenca", nm: "Presença hoje", sub: `${hojeN} de ${corretores} corretores${c2s ? " (base C2S 30 dias)" : ""}`, val: `${Math.round(r * 100)}%`, ref: `ref ${REF.presenca * 100}%`, r: r / REF.presenca }); }

    const refPl = REF.plantoesMes * dias / 30;
    if (semPlantao) inds.push({ k: "plantoes", nm: "Plantões por corretor", falta: "Sem registro de plantão." });
    else if (corretores) { const v = plantoes / corretores; inds.push({ k: "plantoes", nm: "Plantões por corretor", sub: `${plantoes.toLocaleString("pt-BR")} plantões no período`, val: v1(v), ref: `ref ${v1(refPl)}`, r: v / refPl }); }

    if (c2s) inds.push({ k: "visita", nm: "Visitas", falta: "Aparecem quando os gerentes tiverem conta no Comandra." });
    else if (semPlantao) inds.push({ k: "visita", nm: "Visitas", sub: "sem plantão para comparar", val: String(visitas), r: null });
    else if (!visitas) inds.push({ k: "visita", nm: "Visitas", sub: "nenhuma visita lançada no C2S", val: "0", ref: `ref 1 a cada ${REF.plantoesPorVisita}`, r: plantoes ? 0 : null });
    else { const cada = plantoes / visitas; inds.push({ k: "visita", nm: "Visitas", sub: `${visitas} no período`, val: `1 a cada ${Math.round(cada)}`, ref: `ref 1 a cada ${REF.plantoesPorVisita} plantões`, r: REF.plantoesPorVisita / cada }); }

    // vendas da equipe no mês (mesmo número do destaque; inclui as que não contam no placar)
    const fm = metas?.filhos?.find((x) => x.id === s.id)?.realizado ?? 0;
    const conv = pastas ? fm / pastas : null;
    inds.push({ k: "fecha", nm: "Pasta vira venda", sub: `${v1(fm)} vendas da equipe no mês · ${pastas} pastas abertas`, val: conv == null ? "—" : `${Math.round(conv * 100)}%`, ref: `ref ${REF.conversao * 100}%`, r: conv == null ? null : conv / REF.conversao });

    const pior = inds.filter((i) => i.r != null).sort((a, b) => a.r! - b.r!)[0];
    const f = metas?.filhos?.find((x) => x.id === s.id);
    const meta = f?.meta ?? null, realizado = f?.realizado ?? 0;
    const foraN = (fora ?? []).filter((x) => s.tokens.some((t) => x.sup.includes(t))).reduce((a, x) => a + x.qtd, 0);
    const esperado = meta != null ? meta * ritmo : null;

    const ger: Ger[] = c2s
      ? c2s.gerentes.map((g) => ({ nome: g.nome, corretores: g.corretores30, hoje: g.hoje, plantoes: g.dias, visitas: null, vendas: null,
          spark: nomesSuperC2S(s.nome).map((n) => sete?.get(`s:${n}|${g.nome}`)).find(Boolean) ?? [] }))
      : s.gerentes.map((g) => { const l = ls.find((x) => x.id === g.id);
          return { id: g.id, nome: g.nome, corretores: g.corretores, hoje: g.plantao_hoje, plantoes: l?.plantaoDias ?? 0, visitas: l?.visitas ?? 0,
            vendas: l?.vendas ?? 0, spark: sete?.get(`g:${chaveGerente(g.nome)}`) ?? [] }; });

    return { s, inds, pior: pior && pior.r! < 0.9 ? pior : null, meta, realizado, foraN, esperado,
      gap: esperado != null ? realizado - esperado : null, vgv, corretores, hojeN, semPlantao, ger };
  }).sort((a, b) => (a.gap ?? Infinity) - (b.gap ?? Infinity)), [supers, linhasDoSuper, metas, fora, sete, dias, ritmo, semPontoHoje]);

  async function cobrar(c: typeof cards[number]) {
    const nome = c.s.nome.split(" ")[0];
    const g = c.pior ? GARGALO[c.pior.k][0].toLowerCase() : null;
    const ritmoTxt = c.gap == null ? `está com ${c.realizado} venda${c.realizado === 1 ? "" : "s"} no mês`
      : c.gap < 0 ? `está ${v1(-c.gap)} venda${-c.gap >= 1.5 ? "s" : ""} atrás do ritmo da meta (${c.realizado} de ${c.meta})`
      : `está no ritmo da meta (${c.realizado} de ${c.meta})`;
    const msg = `${nome}, a sua equipe ${ritmoTxt}.${g ? ` O gargalo hoje é ${g}.` : ""} O que você vai fazer até sexta?`;
    const { error } = await supabase.from("cobrancas" as any).insert({ de_id: diretorId, para_id: c.s.id, motivo: g ? `ritmo da meta · ${g}` : "ritmo da meta",
      canal: "whatsapp", enviada_em: new Date().toISOString() });
    if (error) { toast.error("Não registrei a cobrança: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["diretoria"] });
    const fone = String(c.s.phone ?? "").replace(/\D/g, "");
    if (fone) { window.open(`https://api.whatsapp.com/send?phone=${fone.startsWith("55") ? fone : "55" + fone}&text=${encodeURIComponent(msg)}`, "_blank"); toast.success(`Cobrança de ${nome} registrada. A mensagem abriu no seu WhatsApp.`); }
    else toast.info(`${nome} não tem telefone cadastrado. A cobrança ficou só no histórico.`);
  }

  // faixa Empresa
  const comMeta = cards.filter((c) => c.meta != null);
  const vendasEmp = cards.reduce((a, c) => a + c.realizado, 0);
  const placarEmp = cards.reduce((a, c) => a + c.realizado - c.foraN, 0);
  const metaEmp = comMeta.reduce((a, c) => a + c.meta!, 0), espEmp = comMeta.reduce((a, c) => a + c.esperado!, 0);
  const comPl = cards.filter((c) => !c.semPlantao && c.corretores);
  const hojeEmp = comPl.reduce((a, c) => a + c.hojeN, 0), corEmp = comPl.reduce((a, c) => a + c.corretores, 0);
  const semPl = cards.filter((c) => c.semPlantao).map((c) => c.s.nome.split(" ")[0]);
  const gCont = new Map<K, number>(); cards.forEach((c) => c.pior && gCont.set(c.pior.k, (gCont.get(c.pior.k) ?? 0) + 1));
  const topG = [...gCont.entries()].sort((a, b) => b[1] - a[1])[0];
  const atras = cards.filter((c) => c.gap != null && c.gap < -0.4).map((c) => c.s.nome.split(" ")[0]);
  const perTxt = dias === 1 ? "hoje" : `${dias} dias`;

  return (
    <>
      <div className="dir-card eqc-emp">
        <div>
          <div className="dir-lbl">Empresa · vendas no mês</div>
          <div className="eqc-big">{vendasEmp.toLocaleString("pt-BR")} <small>{metaEmp ? `de ${metaEmp}` : "· sem meta"}</small></div>
          {metaEmp ? <Ritmo feito={vendasEmp} esperado={espEmp} meta={metaEmp} /> : null}
          <div className="eqc-leg">{metaEmp ? <span>devia ter {v1(espEmp)} até hoje</span> : <span>defina as metas na aba Estratégia</span>}
            {placarEmp !== vendasEmp ? <span><b>{v1(placarEmp)}</b> no placar da diretoria</span> : null}</div>
        </div>
        <div><div className="dir-lbl">Presença hoje</div><div className="eqc-v">{corEmp ? `${hojeEmp} de ${corEmp}` : "—"}</div>
          <div className="eqc-s">{semPontoHoje ? "C2S ainda sem ponto de hoje" : corEmp ? `${Math.round(hojeEmp / corEmp * 100)}% · ref ${REF.presenca * 100}%` : ""}{semPl.length ? ` · sem ${semPl.join(", ")} (fora do C2S)` : ""}</div></div>
        <div><div className="dir-lbl">Gargalo mais comum</div><div className="eqc-v">{topG ? GARGALO[topG[0]][0] : "—"}</div>
          <div className="eqc-s">{topG ? `${topG[1]} de ${cards.length} superintendências · ${perTxt}` : carregandoCons ? "carregando…" : ""}</div></div>
        <div><div className="dir-lbl">Atrás do ritmo</div><div className="eqc-v">{atras.length ? atras.join(", ") : comMeta.length ? "ninguém" : "—"}</div>
          <div className="eqc-s">{comMeta.length ? `${atras.length} de ${comMeta.length} com meta` : "sem meta definida"}</div></div>
      </div>

      <div className="eqc-grid">
        {cards.map((c) => {
          const nome = c.s.nome.split(" ")[0], aberto = !!abertos[c.s.id];
          const alerta = c.gap != null && c.gap < -0.4;
          return (
            <article key={c.s.id} className={`dir-card eqc-card${alerta ? " alerta" : ""}`}>
              <div className="eqc-hd">
                <div><h3>{c.s.nome}</h3>
                  <div className="eqc-s">{c.corretores} corretores · {c.s.c2s ? c.s.c2s.gerentes.length : c.s.gerentes.length} gerentes · {mi(c.vgv)} no placar no período</div></div>
                <div className="eqc-chips">
                  {c.s.c2s ? <span className="dir-chip c-gray">plantão do C2S · gerentes sem conta</span> : null}
                  {c.semPlantao ? <span className="dir-chip c-org">fora do C2S</span> : null}
                </div>
              </div>

              <div className="eqc-hero">
                <div className="dir-lbl">Vendas no mês</div>
                <div className="eqc-lin">
                  <span className="eqc-n">{v1(c.realizado)}</span>
                  <span className="eqc-de">{c.meta != null ? `de ${c.meta} da meta` : "sem meta"}</span>
                  {c.gap == null ? <span className="dir-chip c-gray eqc-gap">definir na Estratégia</span>
                    : c.gap >= -0.4 ? <span className="dir-chip c-grn eqc-gap">no ritmo{c.gap >= 0.5 ? ` · +${v1(c.gap)}` : ""}</span>
                    : <span className="dir-chip c-red eqc-gap">−{v1(-c.gap)} contra o ritmo</span>}
                </div>
                {c.meta != null ? <><Ritmo feito={c.realizado} esperado={c.esperado!} meta={c.meta} />
                  <div className="eqc-leg"><span>devia ter {v1(c.esperado!)} até hoje</span><span>meta derramada da Estratégia</span></div></> : null}
                {c.foraN > 0 ? <div className="eqc-nota">{v1(c.realizado)} vendas da equipe aparecem no painel da superintendência. <b>{v1(c.realizado - c.foraN)} contam no placar da diretoria</b> ({v1(c.foraN)} são de antes de entrar na equipe).</div> : null}
              </div>

              <div className="eqc-inds">
                {c.inds.map((i) => i.falta
                  ? <div key={i.k} className="eqc-ind falta"><div className="nm">{i.nm}</div><div className="val">{i.falta}</div></div>
                  : <div key={i.k} className="eqc-ind"><div className="nm">{i.nm}<small>{i.sub}</small></div>
                      <div className="val">{carregandoCons && !c.s.c2s ? "…" : i.val}{i.ref ? <span className="ref">{i.ref}</span> : null}</div>
                      <span className={`dir-chip ${COR[st(i.r)]}`}>{ST_TXT[st(i.r)]}</span></div>)}
              </div>

              {c.pior ? <div className="eqc-diag">Gargalo: {GARGALO[c.pior.k][0]}<span>{GARGALO[c.pior.k][1]}</span></div>
                : <div className="eqc-diag ok">Sem gargalo nos indicadores com dado.<span>{c.semPlantao ? "Falta o plantão para fechar o quadro." : "Manter o ritmo."}</span></div>}

              <div className="eqc-acts">
                <button className="dir-btn solid" onClick={() => cobrar(c)}>Cobrar {nome}</button>
                <button className="dir-btn" onClick={() => setCombinar({ sobre: `Equipe ${c.s.nome}${c.pior ? ` · gargalo ${GARGALO[c.pior.k][0].toLowerCase()}` : ""}`,
                  pergunta: 4, titulo: c.pior ? `Equipe ${nome}: ${GARGALO[c.pior.k][2]}` : `Equipe ${nome}: manter o ritmo da meta`, responsavelId: c.s.id })}>Combinar ação</button>
                <button className="eqc-abrir" aria-expanded={aberto} onClick={() => setAbertos((v) => ({ ...v, [c.s.id]: !v[c.s.id] }))}>
                  {aberto ? "▾ esconder gerentes" : "▸ ver gerentes"}</button>
              </div>

              {aberto ? <div className="eqc-ger">
                {!c.ger.length ? <div className="eqc-s" style={{ padding: "12px 0" }}>Nenhum gerente desta equipe no Comandra nem no C2S.</div> : (
                  <div style={{ overflowX: "auto" }}><table>
                    <thead><tr><th>Gerente</th><th>Corretores</th><th>Hoje</th><th>Presença 7 dias</th><th>Plantões</th><th>Visitas</th><th>Vendas</th></tr></thead>
                    <tbody>{c.ger.map((g) => (
                      <tr key={g.id ?? g.nome}>
                        <td>{g.nome}{g.id ? <button className="dir-abrir" onClick={() => abrirPainel(g.id!)}>painel ›</button> : <span className="eqc-s"> · sem conta</span>}</td>
                        <td>{g.corretores}</td>
                        <td className={g.corretores && g.hoje / g.corretores < 0.3 && !c.semPlantao ? "r" : ""}>{c.semPlantao ? "—" : g.hoje}</td>
                        <td><Spark v={g.spark} max={Math.max(1, g.corretores * REF.presenca, ...g.spark)} /></td>
                        <td>{c.semPlantao ? "—" : g.plantoes}</td>
                        <td>{g.visitas == null ? "—" : g.visitas}</td>
                        <td>{g.vendas == null ? "—" : v1(g.vendas)}</td>
                      </tr>))}</tbody>
                  </table></div>)}
              </div> : null}
            </article>
          );
        })}
      </div>
      <div className="eqc-leg" style={{ marginTop: 14 }}>
        <span><i style={{ background: "var(--blue)" }} />vendas feitas</span>
        <span><i style={{ background: "var(--red)" }} />atraso contra o ritmo da meta</span>
        <span>▏ onde deveria estar hoje (dia {hoje.getDate()} de {diasMes})</span>
        <span>Referências: presença {REF.presenca * 100}% · {REF.plantoesMes} plantões/corretor no mês · 1 visita a cada {REF.plantoesPorVisita} plantões · {REF.conversao * 100}% das pastas viram venda</span>
      </div>
      {combinar && <CombinarAcao diretorId={diretorId} c={combinar} fechar={() => setCombinar(null)} />}
    </>
  );
}

function Ritmo({ feito, esperado, meta }: { feito: number; esperado: number; meta: number }) {
  const max = Math.max(meta, feito, 0.0001);
  const w = Math.min(100, feito / max * 100), e = Math.min(100, esperado / max * 100);
  return (
    <div className="eqc-ritmo" role="img" aria-label={`${v1(feito)} de ${meta}; deveria ter ${v1(esperado)} até hoje`}>
      <i style={{ width: `${w}%` }} />
      {e > w ? <b style={{ left: `${w}%`, width: `${e - w}%` }} /> : null}
      <em style={{ left: `calc(${e}% - 1px)` }} />
    </div>
  );
}

function Spark({ v, max }: { v: number[]; max: number }) {
  if (v.length < 2) return <span className="eqc-s">—</span>;
  const W = 84, H = 22;
  const pts = v.map((x, i) => [i * (W - 4) / (v.length - 1) + 2, H - 3 - Math.min(x, max) / max * (H - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={`presença 7 dias: ${v.join(", ")}`}>
      <path d={`${d} L${last[0].toFixed(1)} ${H - 2} L${pts[0][0].toFixed(1)} ${H - 2} Z`} fill="var(--blue-bg)" />
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth={1.6} />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill="var(--blue)" />
    </svg>
  );
}
