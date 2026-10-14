// Mídia do superintendente: as contas de anúncio das equipes (lidas ao vivo no Facebook pela edge
// fb-conta-gerente, no período do seletor único), cada conta com as campanhas dela, os pontos de atenção
// por regra fixa e um assistente de IA (edge estrategia-ia, modo "midia") que lê os mesmos números
// e diz o que cortar, o que escalar e o que pedir ao gestor de tráfego. A IA nunca mexe na conta.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper, SeletorPeriodoSuper } from "./Periodo";

const sb = supabase as any;
const brl = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
const brl2 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + n.toFixed(2).replace(".", ","));

type Conta = { dono: string; donoId: string; conta: string; gasto: number; saldo: string | null; campanhas: any[] };

export default function Midia({ superId }: { superId: string }) {
  const { supers } = useEscopoSuper(superId);
  const p = usePeriodoSuper("7d");
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const donos = useMemo(() => [...supers.map((s) => ({ id: s.id, nome: s.nome })), ...gerentes.map((g) => ({ id: g.id, nome: g.nome }))], [supers, gerentes]);
  const [aberta, setAberta] = useState<Record<string, boolean>>({});

  const { data: contas, isLoading } = useQuery({
    queryKey: ["s2-midia", superId, p.janela.de, p.janela.ate, donos.length],
    enabled: donos.length > 0, staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await Promise.all(donos.map(async (d) => {
        const { data } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: d.id, de: p.janela.de, ate: p.janela.ate } });
        const x = data as any;
        if (!x || x.semConta || x.error) return null;
        const campanhas = (x.campanhas ?? []).map((c: any) => ({ ...c, resultado: Number(c.leads || 0) + Number(c.conversas || 0) }))
          .filter((c: any) => Number(c.gasto) > 0 || c.ativa).sort((a: any, b: any) => Number(b.gasto) - Number(a.gasto));
        return { dono: d.nome, donoId: d.id, conta: x.conta, gasto: Number(x.gasto || 0), saldo: x.saldo ?? null, campanhas } as Conta;
      }));
      return (r.filter(Boolean) as Conta[]).sort((a, b) => b.gasto - a.gasto);
    },
  });

  const gasto = (contas ?? []).reduce((a, c) => a + c.gasto, 0);
  const todas = (contas ?? []).flatMap((c) => c.campanhas.map((x: any) => ({ ...x, dono: c.dono })));
  const res = todas.reduce((a, c) => a + c.resultado, 0);
  const form = todas.reduce((a, c) => a + Number(c.leads || 0), 0);
  const conv = todas.reduce((a, c) => a + Number(c.conversas || 0), 0);
  const media = res ? gasto / res : null;
  const ativas = todas.filter((c) => c.ativa).length;
  const selo = (gastoC: number, n: number) => !media || gastoC < 30 ? null : !n ? <em className="red">sem lead</em>
    : gastoC / n >= 2 * media ? <em className="red">cara</em> : gastoC / n <= 0.6 * media && n >= 3 ? <em className="grn">campeã</em> : null;

  const atencao = useMemo(() => {
    const out: { g: "red" | "org" | "grn"; t: string; d: string }[] = [];
    if (!media) return out;
    for (const c of contas ?? []) {
      const n = c.campanhas.reduce((a: number, x: any) => a + x.resultado, 0);
      if (c.gasto >= 100 && !n) out.push({ g: "red", t: `${c.dono}: ${brl(c.gasto)} sem nenhum lead`, d: "Conferir formulário, público e se as campanhas estão entregando." });
      else if (c.gasto >= 100 && c.gasto / n >= 1.5 * media) out.push({ g: "org", t: `${c.dono} paga ${(c.gasto / n / media).toFixed(1).replace(".", ",")}× a média por lead`, d: `${brl2(c.gasto / n)} por lead contra ${brl2(media)} das suas equipes.` });
    }
    const semLead = todas.filter((c) => Number(c.gasto) >= 50 && !c.resultado);
    if (semLead.length) out.push({ g: "red", t: `${semLead.length} campanha(s) gastando sem lead · ${brl(semLead.reduce((a, c) => a + Number(c.gasto), 0))}`, d: semLead.slice(0, 4).map((c) => `${c.nome} (${c.dono})`).join("; ") + "." });
    const campeas = todas.filter((c) => c.resultado >= 3 && Number(c.gasto) / c.resultado <= 0.6 * media);
    if (campeas.length) out.push({ g: "grn", t: `${campeas.length} campanha(s) rendendo bem: candidatas a mais verba`, d: campeas.slice(0, 4).map((c) => `${c.nome} (${c.dono}): ${brl2(Number(c.gasto) / c.resultado)} por lead`).join("; ") + "." });
    return out;
  }, [contas, todas, media]);

  return (
    <div className="md">
      <style>{CSS}</style>
      <header className="md-top">
        <div><h1>Mídia</h1><p>As contas de anúncio das suas equipes, lidas direto no Facebook · {p.texto}</p></div>
        <SeletorPeriodoSuper p={p} />
      </header>

      <div className="md-kpis">
        <div className="md-kpi"><span>Gasto</span><b>{isLoading ? "…" : brl(gasto)}</b><small>{(contas ?? []).length} conta(s) · {ativas} campanha(s) ativa(s)</small></div>
        <div className="md-kpi"><span>Leads do Facebook</span><b>{isLoading ? "…" : res}</b><small>{form} formulário · {conv} conversa</small></div>
        <div className="md-kpi"><span>Custo por lead</span><b>{isLoading ? "…" : brl2(media)}</b><small>média das suas equipes no período</small></div>
        <div className="md-kpi"><span>Sem lead</span><b className={todas.some((c) => Number(c.gasto) >= 50 && !c.resultado) ? "md-ruim" : ""}>{isLoading ? "…" : brl(todas.filter((c) => !c.resultado).reduce((a, c) => a + Number(c.gasto), 0))}</b><small>gasto em campanha que não trouxe nenhum lead</small></div>
      </div>

      <Assistente fatos={{
        periodo: p.texto, gasto_total: Math.round(gasto), leads_total: res, formularios: form, conversas: conv, custo_medio_por_lead: media ? Math.round(media * 100) / 100 : null,
        contas: (contas ?? []).map((c) => ({ equipe: c.dono, conta: c.conta, gasto: Math.round(c.gasto),
          campanhas: c.campanhas.slice(0, 15).map((x: any) => ({ nome: x.nome, ativa: !!x.ativa, gasto: Math.round(Number(x.gasto)), formularios: Number(x.leads || 0), conversas: Number(x.conversas || 0),
            custo_por_lead: x.resultado ? Math.round((Number(x.gasto) / x.resultado) * 100) / 100 : null })) })),
      }} pronto={!isLoading && (contas ?? []).length > 0} />

      {atencao.length ? (
        <section className="md-sec">
          <h2>Pontos de atenção</h2>
          {atencao.map((m, i) => <div key={i} className={`md-at ${m.g}`}><span className="md-dot" /><div><b>{m.t}</b><p>{m.d}</p></div></div>)}
        </section>
      ) : null}

      <section className="md-sec">
        <h2>Contas e campanhas <small>clique na conta para abrir as campanhas</small></h2>
        {isLoading ? <div className="md-card md-vazio">Lendo as contas no Facebook…</div> : !(contas ?? []).length ? <div className="md-card md-vazio">Nenhuma conta de anúncio ligada às suas equipes.</div> : (
          <div className="md-card md-tab">
            <div className="md-tr md-th"><span>Conta</span><span>Gasto</span><span>Leads</span><span>Por lead</span><span>Campanhas</span></div>
            {(contas ?? []).map((c) => {
              const n = c.campanhas.reduce((a: number, x: any) => a + x.resultado, 0);
              const ab = !!aberta[c.donoId];
              const caras = c.campanhas.filter((x: any) => Number(x.gasto) >= 30 && (!x.resultado || (media && Number(x.gasto) / x.resultado >= 2 * media))).length;
              return (
                <div key={c.donoId}>
                  <button className="md-tr md-conta" onClick={() => setAberta((v) => ({ ...v, [c.donoId]: !v[c.donoId] }))} aria-expanded={ab}>
                    <span className="md-nome">{ab ? "▾" : "▸"} <b>{c.dono}</b><small>{c.conta}</small></span>
                    <span className="mono">{brl(c.gasto)}</span>
                    <span className="mono">{n}</span>
                    <span className="mono">{n ? brl2(c.gasto / n) : "—"}{n ? selo(c.gasto, n) : null}</span>
                    <span className="mono">{c.campanhas.length}{caras ? <em className="red">{caras} com problema</em> : null}</span>
                  </button>
                  {ab ? c.campanhas.map((x: any) => (
                    <div key={x.id} className="md-tr md-camp">
                      <span className="md-nome"><i className={x.ativa ? "on" : ""} />{x.nome}</span>
                      <span className="mono">{brl(Number(x.gasto))}</span>
                      <span className="mono">{x.resultado}{x.conversas ? <small> ({x.leads} form · {x.conversas} conv.)</small> : null}</span>
                      <span className="mono">{x.resultado ? brl2(Number(x.gasto) / x.resultado) : "—"}{selo(Number(x.gasto), x.resultado)}</span>
                      <span />
                    </div>
                  )) : null}
                </div>
              );
            })}
            <small className="md-nota">"Cara" = o dobro da média das suas equipes no período; "campeã" = 40% abaixo, com 3 leads ou mais. Conversa de anúncio abre direto no WhatsApp da equipe e não passa pelo Comandra.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function Assistente({ fatos, pronto }: { fatos: any; pronto: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { data: lin } = useQuery({
    queryKey: ["s2-ia", id], enabled: !!id,
    refetchInterval: (a: any) => ((a?.state ? a.state.data : a)?.status === "pendente" ? 3000 : false), // v4 passa o dado, v5 a query
    queryFn: async () => (await sb.from("estrategia_ia").select("status,modo,resposta").eq("id", id).maybeSingle()).data,
  });
  const pedir = async (modo: "midia" | "pergunta") => {
    if (modo === "pergunta" && !pergunta.trim()) { toast.error("Escreva a pergunta."); return; }
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("estrategia-ia", { body: { modo, fatos, pergunta: modo === "pergunta" ? pergunta : undefined } });
    setEnviando(false);
    if (error || (data as any)?.error) { toast.error("A IA não respondeu: " + ((data as any)?.error || error?.message)); return; }
    setId((data as any).id);
  };
  const r = lin?.resposta;
  return (
    <section className="md-ia">
      <div className="md-ia-h">
        <div><b>Assistente de mídia</b><span>lê os números desta tela e diz o que cortar, o que escalar e o que pedir ao gestor de tráfego. Não mexe na conta.</span></div>
        <button className="md-btn prim" disabled={!pronto || enviando || lin?.status === "pendente"} onClick={() => pedir("midia")}>
          {lin?.status === "pendente" ? "Analisando… (leva até 1 min)" : "Analisar com IA"}
        </button>
      </div>
      <div className="md-ia-q">
        <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ou pergunte: onde coloco mais R$ 2 mil esta semana?" aria-label="Pergunta para a IA"
          onKeyDown={(e) => { if (e.key === "Enter") pedir("pergunta"); }} />
        <button className="md-btn" disabled={!pronto || enviando} onClick={() => pedir("pergunta")}>Perguntar</button>
      </div>
      {lin?.status === "erro" ? <p className="md-ruim">A IA falhou: {r?.erro}</p> : null}
      {lin?.status === "pronto" && r ? (
        lin.modo === "midia" ? (
          <div className="md-ia-r">
            <p className="md-leitura">{r.leitura}</p>
            <div className="md-ia-g">
              {r.cortar?.length ? <div><h4 className="red">Cortar ou reduzir</h4>{r.cortar.map((x: any, i: number) => <p key={i}><b>{x.campanha}</b> · {x.conta}<br />{x.por_que}</p>)}</div> : null}
              {r.escalar?.length ? <div><h4 className="grn">Pôr mais verba</h4>{r.escalar.map((x: any, i: number) => <p key={i}><b>{x.campanha}</b> · {x.conta}<br />{x.por_que}</p>)}</div> : null}
              {r.ajustes?.length ? <div><h4>Ajustar</h4>{r.ajustes.map((x: any, i: number) => <p key={i}><b>{x.o_que}</b> · {x.onde}<br />{x.por_que}</p>)}</div> : null}
            </div>
            {r.pedir_ao_gestor?.length ? <div className="md-gestor"><h4>Mandar ao gestor de tráfego</h4><ul>{r.pedir_ao_gestor.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div> : null}
            {r.dados_que_faltam?.length ? <small className="md-nota">Faltou para decidir melhor: {r.dados_que_faltam.join("; ")}</small> : null}
          </div>
        ) : (
          <div className="md-ia-r">
            <p className="md-leitura">{r.resposta}</p>
            {r.plano?.length ? <ul>{r.plano.map((x: any, i: number) => <li key={i}>{x.acao}{x.responsavel ? ` · ${x.responsavel}` : ""}{x.prazo_dias ? ` · ${x.prazo_dias} dia(s)` : ""}</li>)}</ul> : null}
          </div>
        )
      ) : null}
    </section>
  );
}

const CSS = `
.mgr10 .md{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .md-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .md-top h1{font-size:28px}
.mgr10 .md-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .md-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.mgr10 .md-kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px}
.mgr10 .md-kpi span{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mgr10 .md-kpi b{font-size:30px;font-weight:800;font-family:"JetBrains Mono",monospace}
.mgr10 .md-kpi small{font-size:12.5px;color:var(--ink-3)}
.mgr10 .md-ruim{color:var(--red)}
.mgr10 .md-sec{display:grid;gap:10px}
.mgr10 .md-sec h2{font-size:17px}
.mgr10 .md-sec h2 small{font-size:12.5px;color:var(--ink-3);font-weight:500;margin-left:8px}
.mgr10 .md-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;min-width:0}
.mgr10 .md-vazio{color:var(--ink-3);font-size:14px}
.mgr10 .md-at{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.mgr10 .md-at p{font-size:13.5px;color:var(--ink-2);margin-top:2px;overflow-wrap:anywhere}
.mgr10 .md-at.red{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.mgr10 .md-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--amber)}
.mgr10 .md-at.red .md-dot{background:var(--red)} .mgr10 .md-at.grn .md-dot{background:var(--good)}
.mgr10 .md-tab{padding:0;overflow:hidden}
.mgr10 .md-tr{display:grid;grid-template-columns:minmax(0,3fr) repeat(4,minmax(80px,1fr));gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--hair);font-size:13.5px;width:100%;text-align:left}
.mgr10 .md-th{border-top:0;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk)}
.mgr10 .md-conta{font-weight:600}
.mgr10 .md-conta:hover{background:var(--sunk)}
.mgr10 .md-camp{background:var(--sunk);font-size:13px;color:var(--ink-2)}
.mgr10 .md-camp .md-nome{padding-left:22px}
.mgr10 .md-nome{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere;flex-wrap:wrap}
.mgr10 .md-nome small{color:var(--ink-3);font-size:12px;font-weight:400}
.mgr10 .md-nome i{width:8px;height:8px;border-radius:50%;background:var(--ink-3);flex-shrink:0}
.mgr10 .md-nome i.on{background:var(--good)}
.mgr10 .md-tr small{color:var(--ink-3);font-size:11.5px}
.mgr10 .md em{font-style:normal;font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;margin-left:6px;white-space:nowrap}
.mgr10 .md em.red{color:var(--red);background:var(--red-air)} .mgr10 .md em.grn{color:var(--good);background:var(--good-air)}
.mgr10 .md-nota{display:block;padding:10px 16px;color:var(--ink-3);font-size:12px;border-top:1px solid var(--hair)}
.mgr10 .md-ia{background:var(--card);border:1px solid color-mix(in srgb,var(--blue) 40%,var(--line));border-radius:var(--r);padding:16px;display:grid;gap:12px}
.mgr10 .md-ia-h{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.mgr10 .md-ia-h div{display:grid;gap:2px;max-width:70ch}
.mgr10 .md-ia-h span{font-size:13px;color:var(--ink-2)}
.mgr10 .md-ia-q{display:flex;gap:8px;flex-wrap:wrap}
.mgr10 .md-ia-q input{flex:1;min-width:220px;font:inherit;color:var(--ink);background:var(--sunk);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.mgr10 .md-btn{font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.mgr10 .md-btn.prim{background:var(--blue);border-color:var(--blue);color:#fff}
.mgr10 .md-btn:disabled{opacity:.5;cursor:default}
.mgr10 .md-ia-r{display:grid;gap:12px;border-top:1px solid var(--hair);padding-top:12px}
.mgr10 .md-leitura{font-size:15px;line-height:1.55}
.mgr10 .md-ia-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.mgr10 .md-ia-g div,.mgr10 .md-gestor{background:var(--sunk);border-radius:10px;padding:12px;display:grid;gap:8px;align-content:start}
.mgr10 .md-ia-g p{font-size:13.5px;color:var(--ink-2)}
.mgr10 .md-ia h4{font-size:13px;text-transform:uppercase;letter-spacing:.06em}
.mgr10 .md-ia h4.red{color:var(--red)} .mgr10 .md-ia h4.grn{color:var(--good)}
.mgr10 .md-ia ul{margin:0;padding-left:18px;display:grid;gap:4px;font-size:13.5px}
`;
