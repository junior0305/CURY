// Leads & Mídia do superintendente: de onde vem o lead de cada equipe (anúncio, disparo, pescados) e o
// que acontece com ele, as campanhas de todas as contas das equipes juntas (lidas ao vivo no Facebook
// pela edge fb-conta-gerente, no período escolhido) e os pontos de melhoria que saem desses números.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEscopoSuper } from "./escopo";

const sb = supabase as any;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const brl = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
const brl2 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + n.toFixed(2).replace(".", ","));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const diaSP = (desloc = 0) => new Date(Date.now() - 3 * 3600e3 - desloc * 86400e3).toISOString().slice(0, 10);
type Canal = "anuncio" | "disparo" | "pescados" | "outros";
const CANAIS: [Canal, string][] = [["anuncio", "Anúncio"], ["disparo", "Disparo"], ["pescados", "Pescados"], ["outros", "Outros"]];
type Periodo = "hoje" | "ontem" | "7d" | "30d" | "datas";

function canalDe(l: any): Canal {
  const src = String(l.source ?? "").toLowerCase();
  if (src === "cold_pool" || l.original_broker_id) return "pescados";
  if (src.startsWith("facebook") || l.fb_page_id || l.fb_campaign_id) return "anuncio";
  if (src === "wa_oficial" || src === "campaign" || src.includes("disparo")) return "disparo";
  return "outros";
}
const atendido = (l: any) => {
  const c = new Date(l.created_at).getTime();
  return !!l.last_broker_whatsapp_at || l.status !== "NEW" || (l.contact_attempts ?? 0) > 0
    || (l.last_interaction_at && new Date(l.last_interaction_at).getTime() > c + 5 * 60e3);
};
const avancou = (l: any) => ["VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"].includes(l.status);

export default function LeadsMidia({ superId }: { superId: string }) {
  const { supers } = useEscopoSuper(superId);
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [de, setDe] = useState(diaSP(6)); const [ate, setAte] = useState(diaSP(0));
  const janela = periodo === "hoje" ? { de: diaSP(0), ate: diaSP(0) } : periodo === "ontem" ? { de: diaSP(1), ate: diaSP(1) }
    : periodo === "7d" ? { de: diaSP(6), ate: diaSP(0) } : periodo === "30d" ? { de: diaSP(29), ate: diaSP(0) } : { de, ate };
  const iniUTC = `${janela.de}T03:00:00Z`;
  const fimUTC = new Date(new Date(`${janela.ate}T03:00:00Z`).getTime() + 86400e3).toISOString();

  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const brokerGer = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gerentes) for (const c of g.corretores_lista ?? []) m.set(c.id, g.id);
    return m;
  }, [gerentes]);

  // leads do período das equipes (por corretor)
  const { data: leads, isLoading } = useQuery({
    queryKey: ["s2-leads", superId, janela.de, janela.ate, brokerGer.size],
    enabled: brokerGer.size > 0, staleTime: 120_000,
    queryFn: async () => {
      const ids = [...brokerGer.keys()];
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        for (let pg = 0; ; pg += 1000) {
          const { data, error } = await sb.from("leads")
            .select("id,broker_id,source,fb_page_id,fb_campaign_id,original_broker_id,status,contact_attempts,last_broker_whatsapp_at,last_interaction_at,last_lead_response_at,created_at")
            .in("broker_id", ids.slice(i, i + 150)).gte("created_at", iniUTC).lt("created_at", fimUTC).range(pg, pg + 999);
          if (error) throw error;
          out.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
      }
      return out;
    },
  });

  // mídia: cada conta das equipes (gerentes + o próprio super), ao vivo no período
  const donosConta = useMemo(() => [...supers.map((s) => ({ id: s.id, nome: s.nome })), ...gerentes.map((g) => ({ id: g.id, nome: g.nome }))], [supers, gerentes]);
  const { data: midia, isLoading: carregandoMidia } = useQuery({
    queryKey: ["s2-midia", superId, janela.de, janela.ate, donosConta.length],
    enabled: donosConta.length > 0, staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await Promise.all(donosConta.map(async (d) => {
        const { data } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: d.id, de: janela.de, ate: janela.ate } });
        const x = data as any;
        if (!x || x.semConta || x.error) return null;
        return { dono: d.nome, donoId: d.id, conta: x.conta, gasto: Number(x.gasto || 0), campanhas: (x.campanhas ?? []) as any[] };
      }));
      return r.filter(Boolean) as { dono: string; donoId: string; conta: string; gasto: number; campanhas: any[] }[];
    },
  });
  const { data: comp } = useQuery({
    queryKey: ["anuncios-comparativo"], staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.rpc("anuncios_comparativo")).data ?? []) as any[],
  });

  // números por equipe × canal
  const tabela = useMemo(() => {
    type C = { n: number; atend: number; resp: number; avanc: number };
    const vazio = (): C => ({ n: 0, atend: 0, resp: 0, avanc: 0 });
    const porGer = new Map<string, Record<Canal, C>>();
    const tot: Record<Canal, C> = { anuncio: vazio(), disparo: vazio(), pescados: vazio(), outros: vazio() };
    for (const l of leads ?? []) {
      const g = brokerGer.get(l.broker_id); if (!g) continue;
      const k = canalDe(l);
      const row = porGer.get(g) ?? { anuncio: vazio(), disparo: vazio(), pescados: vazio(), outros: vazio() };
      for (const c of [row[k], tot[k]]) { c.n++; if (atendido(l)) c.atend++; if (l.last_lead_response_at) c.resp++; if (avancou(l)) c.avanc++; }
      porGer.set(g, row);
    }
    return { porGer, tot };
  }, [leads, brokerGer]);

  const campanhas = useMemo(() => (midia ?? []).flatMap((m) => m.campanhas.map((c: any) => ({ ...c, dono: m.dono, resultado: Number(c.leads || 0) + Number(c.conversas || 0) })))
    .filter((c) => Number(c.gasto) > 0 || c.ativa).sort((a, b) => Number(b.gasto) - Number(a.gasto)), [midia]);
  const gastoTotal = (midia ?? []).reduce((a, m) => a + m.gasto, 0);
  const resTotal = campanhas.reduce((a, c) => a + c.resultado, 0);
  const cplMedio = resTotal ? gastoTotal / resTotal : null;

  // pontos de melhoria (regras fixas, sem IA)
  const melhorias = useMemo(() => {
    const out: { g: "red" | "org" | "grn"; t: string; d: string }[] = [];
    for (const g of gerentes) {
      const row = tabela.porGer.get(g.id); if (!row) continue;
      const n = CANAIS.reduce((a, [k]) => a + row[k].n, 0);
      const semToque = n - CANAIS.reduce((a, [k]) => a + row[k].atend, 0);
      if (n >= 5 && semToque / n >= 0.3) out.push({ g: "red", t: `${g.nome}: ${semToque} de ${n} leads sem nenhum contato`, d: "Lead pago esfriando na carteira. Cobrar o gerente ou ligar a regra \"Lead novo sem primeiro contato\" em Configurar." });
      const a = row.anuncio, dsp = row.disparo;
      if (a.n >= 5 && dsp.n >= 5 && pct(dsp.atend, dsp.n) + 20 < pct(a.atend, a.n)) out.push({ g: "org", t: `${g.nome}: disparo é menos atendido que anúncio`, d: `${pct(dsp.atend, dsp.n)}% dos leads de disparo atendidos contra ${pct(a.atend, a.n)}% de anúncio. Resposta de disparo esfria rápido.` });
    }
    if (cplMedio) {
      const porDono = new Map<string, { g: number; r: number }>();
      for (const c of campanhas) { const x = porDono.get(c.dono) ?? { g: 0, r: 0 }; x.g += Number(c.gasto); x.r += c.resultado; porDono.set(c.dono, x); }
      for (const [dono, x] of porDono) {
        if (x.g >= 100 && x.r && x.g / x.r >= 1.5 * cplMedio) out.push({ g: "org", t: `${dono} paga ${(x.g / x.r / cplMedio).toFixed(1).replace(".", ",")}× a média por lead`, d: `${brl2(x.g / x.r)} por lead contra ${brl2(cplMedio)} das suas equipes no período. Rever público e criativo com o gestor de tráfego.` });
        if (x.g >= 100 && !x.r) out.push({ g: "red", t: `${dono}: ${brl(x.g)} gastos sem nenhum lead`, d: "Conferir formulário, público e se a campanha está entregando." });
      }
      const semLead = campanhas.filter((c) => Number(c.gasto) >= 50 && !c.resultado);
      if (semLead.length) out.push({ g: "red", t: `${semLead.length} campanha(s) gastando sem lead`, d: semLead.slice(0, 3).map((c) => `${c.nome} (${c.dono}): ${brl(Number(c.gasto))}`).join("; ") + "." });
      const campeas = campanhas.filter((c) => c.resultado >= 3 && Number(c.gasto) / c.resultado <= 0.6 * cplMedio);
      if (campeas.length) out.push({ g: "grn", t: `${campeas.length} campanha(s) bem abaixo da média: vale pôr mais verba`, d: campeas.slice(0, 3).map((c) => `${c.nome} (${c.dono}): ${brl2(Number(c.gasto) / c.resultado)} por lead`).join("; ") + "." });
    }
    const idsEscopo = new Set(donosConta.map((d) => d.id));
    for (const r of comp ?? []) if (idsEscopo.has(r.dono_id) && r.alertas >= 5) out.push({ g: "org", t: `Conta de ${r.dono} com ${r.alertas} alertas do robô`, d: "Abra Anúncios no painel do gerente para ver cada alerta e avisar o gestor de tráfego." });
    return out.sort((a, b) => ({ red: 0, org: 1, grn: 2 }[a.g] - { red: 0, org: 1, grn: 2 }[b.g]));
  }, [gerentes, tabela, campanhas, cplMedio, comp, donosConta]);

  const pills: [Periodo, string][] = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["datas", "Escolher datas"]];
  const totN = CANAIS.reduce((a, [k]) => a + tabela.tot[k].n, 0);

  return (
    <div className="lm">
      <style>{CSS}</style>
      <header className="lm-top">
        <div><h1>Leads & Mídia</h1><p>De onde vem o lead de cada equipe, o que acontece com ele e quanto custa</p></div>
        <div className="lm-per">
          <div className="lm-pills">{pills.map(([k, r]) => <button key={k} className={periodo === k ? "on" : ""} onClick={() => setPeriodo(k)}>{r}</button>)}</div>
          {periodo === "datas" ? <span className="lm-datas"><input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} aria-label="De" /> até <input type="date" value={ate} min={de} max={diaSP(0)} onChange={(e) => setAte(e.target.value)} aria-label="Até" /></span> : null}
        </div>
      </header>

      <section className="lm-sec">
        <h2>O que melhorar</h2>
        {!melhorias.length ? <div className="lm-card lm-vazio">{isLoading || carregandoMidia ? "Calculando…" : "Nenhum ponto de atenção no período."}</div> : null}
        {melhorias.map((m, i) => <div key={i} className={`lm-mel ${m.g}`}><span className="lm-dot" /><div><b>{m.t}</b><p>{m.d}</p></div></div>)}
      </section>

      <div className="lm-kpis">
        {CANAIS.map(([k, rot]) => {
          const c = tabela.tot[k];
          return (
            <div key={k} className="lm-kpi">
              <span>{rot}</span><b>{nf(c.n)}</b>
              <small>{pct(c.n, totN)}% dos leads · {pct(c.atend, c.n)}% atendidos · {pct(c.avanc, c.n)}% viraram visita ou mais</small>
            </div>
          );
        })}
      </div>

      <section className="lm-sec">
        <h2>Por equipe e canal <small>leads · % atendidos · % viraram visita ou mais</small></h2>
        {isLoading ? <div className="lm-card lm-vazio">Somando os leads…</div> : (
          <div className="lm-card lm-tw">
            <table>
              <thead><tr><th>Equipe</th>{CANAIS.map(([k, r]) => <th key={k}>{r}</th>)}<th>Total</th><th>Sem toque</th></tr></thead>
              <tbody>
                {gerentes.map((g) => {
                  const row = tabela.porGer.get(g.id);
                  const n = row ? CANAIS.reduce((a, [k]) => a + row[k].n, 0) : 0;
                  const at = row ? CANAIS.reduce((a, [k]) => a + row[k].atend, 0) : 0;
                  return (
                    <tr key={g.id}>
                      <td><b>{g.nome}</b></td>
                      {CANAIS.map(([k]) => { const c = row?.[k]; return <td key={k}>{c?.n ? <><b>{c.n}</b><small> · {pct(c.atend, c.n)}% · {pct(c.avanc, c.n)}%</small></> : <span className="lm-dim">—</span>}</td>; })}
                      <td><b>{n}</b></td>
                      <td className={n && (n - at) / n >= 0.3 ? "lm-ruim" : ""}>{n - at}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lm-sec">
        <h2>Campanhas de todas as equipes <small>{carregandoMidia ? "lendo o Facebook…" : `${brl(gastoTotal)} no período · ${brl2(cplMedio)} por lead`}</small></h2>
        {carregandoMidia ? <div className="lm-card lm-vazio">Lendo as contas no Facebook…</div> : !campanhas.length ? <div className="lm-card lm-vazio">Nenhuma campanha com gasto no período.</div> : (
          <div className="lm-card lm-tw">
            <table>
              <thead><tr><th>Campanha</th><th>Conta</th><th>Gasto</th><th>Leads</th><th>Por lead</th><th /></tr></thead>
              <tbody>
                {campanhas.map((c) => {
                  const custo = c.resultado ? Number(c.gasto) / c.resultado : null;
                  const selo = !cplMedio || Number(c.gasto) < 30 ? null : !c.resultado ? <em className="red">sem lead</em>
                    : custo! >= 2 * cplMedio ? <em className="red">cara</em> : custo! <= 0.6 * cplMedio && c.resultado >= 3 ? <em className="grn">campeã</em> : null;
                  return (
                    <tr key={`${c.dono}-${c.id}`}>
                      <td><span className="lm-nome"><i className={c.ativa ? "on" : ""} />{c.nome}</span></td>
                      <td>{c.dono}</td>
                      <td>{brl(Number(c.gasto))}</td>
                      <td>{c.resultado}{c.conversas ? <small> ({c.leads} form · {c.conversas} conv.)</small> : null}</td>
                      <td>{brl2(custo)}</td>
                      <td>{selo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <small className="lm-nota">"Cara" = o dobro da média das suas equipes no período; "campeã" = 40% abaixo, com 3 leads ou mais. Conversa de anúncio abre direto no WhatsApp da equipe.</small>
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.mgr10 .lm{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .lm-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .lm-top h1{font-size:28px}
.mgr10 .lm-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .lm-per{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.mgr10 .lm-pills{display:flex;gap:2px;background:var(--sunk);border-radius:10px;padding:3px;flex-wrap:wrap}
.mgr10 .lm-pills button{font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;color:var(--ink-3)}
.mgr10 .lm-pills button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.08)}
.mgr10 .lm-datas{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-2)}
.mgr10 .lm-datas input{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.mgr10 .lm-sec{display:grid;gap:10px}
.mgr10 .lm-sec h2{font-size:17px}
.mgr10 .lm-sec h2 small{font-size:12.5px;color:var(--ink-3);font-weight:500;margin-left:8px}
.mgr10 .lm-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;min-width:0}
.mgr10 .lm-vazio{color:var(--ink-3);font-size:14px}
.mgr10 .lm-mel{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.mgr10 .lm-mel p{font-size:13.5px;color:var(--ink-2);margin-top:2px;overflow-wrap:anywhere}
.mgr10 .lm-mel.red{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.mgr10 .lm-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--amber)}
.mgr10 .lm-mel.red .lm-dot{background:var(--red)} .mgr10 .lm-mel.grn .lm-dot{background:var(--good)}
.mgr10 .lm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.mgr10 .lm-kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px}
.mgr10 .lm-kpi span{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mgr10 .lm-kpi b{font-size:30px;font-weight:800;font-family:"JetBrains Mono",monospace}
.mgr10 .lm-kpi small{font-size:12.5px;color:var(--ink-3)}
.mgr10 .lm-tw{padding:0;overflow-x:auto}
.mgr10 .lm-tw table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
.mgr10 .lm-tw th,.mgr10 .lm-tw td{padding:10px 12px;text-align:left;border-top:1px solid var(--hair);white-space:nowrap}
.mgr10 .lm-tw thead th{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk);border-top:0}
.mgr10 .lm-tw td small{color:var(--ink-3);font-size:12px}
.mgr10 .lm-dim{color:var(--ink-3)} .mgr10 .lm-ruim{color:var(--red);font-weight:700}
.mgr10 .lm-nome{display:flex;align-items:center;gap:8px;white-space:normal}
.mgr10 .lm-nome i{width:8px;height:8px;border-radius:50%;background:var(--ink-3);flex-shrink:0}
.mgr10 .lm-nome i.on{background:var(--good)}
.mgr10 .lm em{font-style:normal;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px}
.mgr10 .lm em.red{color:var(--red);background:var(--red-air)} .mgr10 .lm em.grn{color:var(--good);background:var(--good-air)}
.mgr10 .lm-nota{display:block;padding:10px 12px;color:var(--ink-3);font-size:12px;border-top:1px solid var(--hair)}
`;
