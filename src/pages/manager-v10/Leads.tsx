// LEADS — o que chegou, com quem está, e no que deu.
//
// Organizada por FILA DE PROBLEMA com ação em lote, porque o gerente de 40
// pessoas não trabalha lead a lead: ele redistribui, cobra e descarta.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useLeads, redistribuir, descartar, type LeadLinha } from "@/hooks/useLeads";
import { usePeriodo } from "@/hooks/usePeriodo";
import { Sec, Blank } from "@/components/manager-v10/ui";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();

type Modo = "online" | "plantao" | "escolher";

export default function Leads() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const { periodo } = usePeriodo();
  const qc = useQueryClient();
  const { data, isLoading } = useLeads(userId, periodo);

  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [res, setRes] = useState<string | null>(null);
  const [red, setRed] = useState<{ ids: string[] } | null>(null);
  const [modo, setModo] = useState<Modo>("online");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  loadFonts();

  const marcar = (fila: string, id: string) => setSel((s) => {
    const atual = new Set(s[fila] ?? []);
    atual.has(id) ? atual.delete(id) : atual.add(id);
    return { ...s, [fila]: atual };
  });

  async function confirmarRedistribuicao() {
    if (!red || !data) return;
    const alvo = modo === "online" ? data.corretores.filter((c) => c.online).map((c) => c.id)
               : modo === "plantao" ? data.corretores.filter((c) => c.plantao).map((c) => c.id)
               : [...marcados];
    if (!alvo.length) { toast.error("Escolha pelo menos um corretor."); return; }
    setSalvando(true);
    try {
      await redistribuir(red.ids, alvo, userId!);
      toast.success(`${red.ids.length} leads redistribuídos entre ${alvo.length} corretores.`);
      setRed(null); setSel({});
      qc.invalidateQueries({ queryKey: ["aba-leads"] });
    } catch (e: any) {
      toast.error(`Não consegui: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

  async function descartarLote(fila: string) {
    const ids = [...(sel[fila] ?? [])];
    if (!ids.length) { toast.error("Marque os leads primeiro."); return; }
    try {
      await descartar(ids);
      toast.success(`${ids.length} leads descartados.`);
      setSel((s) => ({ ...s, [fila]: new Set() }));
      qc.invalidateQueries({ queryKey: ["aba-leads"] });
    } catch (e: any) { toast.error(`Não consegui: ${e?.message ?? e}`); }
  }

  const corpo = () => {
    if (isLoading) return <Blank title="Carregando os leads…" />;
    if (!data) return null;
    const d = data;

    const alvoRed = modo === "online" ? d.corretores.filter((c) => c.online)
                  : modo === "plantao" ? d.corretores.filter((c) => c.plantao)
                  : d.corretores.filter((c) => marcados.has(c.id));

    const listaRes: LeadLinha[] | { nome: string; n: number }[] =
      res === "neg" ? d.negociando : res === "doc" ? d.documentos
      : res === "vis" ? d.porCorretorVisita : res === "ven" ? d.porCorretorVenda : [];

    return (
      <>
        {/* 0 · de onde vem o lead — o card do topo */}
        <Sec title="De onde vem o lead"
             tag={<span className="dim">{periodo.rotulo} · {d.chegaram} no total</span>}>
          <div className="orig">
            {([
              ["anuncio", "Anúncio", "pago no Meta / Google", d.origem.anuncio, d.origem.hoje.anuncio],
              ["app", "App da Cury", "lead do plantão", d.origem.app, d.origem.hoje.app],
              ["disparo", "Disparo", "WhatsApp oficial", d.origem.disparo, d.origem.hoje.disparo],
              ["proprio", "Próprio", "repescagem e manual", d.origem.proprio, d.origem.hoje.proprio],
            ] as [string, string, string, number, number][]).map(([k, titulo, sub, n, hoje]) => (
              <div className={`or-c or-${k}`} key={k}>
                <span className="or-t">{titulo}</span>
                <b className="mono">{n}</b>
                <i>{sub}</i>
                {hoje ? <em className="or-h">+{hoje} hoje</em> : null}
                {/* Dentro de anúncio, a rede — só aparece quando há mais de
                    uma, senão "100% Facebook" é ruído. Hoje só o Facebook
                    chega; Google e TikTok já têm lugar para quando entrarem. */}
                {k === "anuncio" && (d.origem.redes.google + d.origem.redes.tiktok) > 0 ? (
                  <div className="or-rede">
                    {d.origem.redes.facebook ? <span>Facebook {d.origem.redes.facebook}</span> : null}
                    {d.origem.redes.google ? <span>Google {d.origem.redes.google}</span> : null}
                    {d.origem.redes.tiktok ? <span>TikTok {d.origem.redes.tiktok}</span> : null}
                  </div>
                ) : k === "anuncio" && d.origem.anuncio > 0 ? (
                  <div className="or-rede"><span>tudo Facebook</span></div>
                ) : null}
              </div>
            ))}
          </div>
          {d.origem.app === 0 && d.origem.anuncio + d.origem.disparo > 0 ? (
            <p className="ld-say">
              O lead do <b>app da Cury</b> ainda não entra no Comandra — o corretor
              atende esse fora daqui. Quando ligarmos, ele aparece neste card e cai
              na conta do corretor como qualquer outro.
            </p>
          ) : null}
        </Sec>

        {/* 1 · o caminho do lead */}
        <Sec title="O caminho do lead"
             tag={<span className="dim">{periodo.rotulo} · {d.chegaramHoje} chegou hoje</span>}>
          <div className="ld-box">
            <div className="ld-cam">
              <div className="ld-cm"><b className="mono">{d.chegaram}</b>
                <span>chegaram<br />de anúncio, disparo e da Cury</span><i className="seta">→</i></div>
              <div className="ld-cm"><b className="mono">{d.encaminhados}</b>
                <span>foram para um corretor<br />distribuídos no rodízio</span><i className="seta">→</i></div>
              <div className={`ld-cm${d.perdidos ? " perdeu" : ""}`}><b className="mono">{d.perdidos}</b>
                <span>se perderam antes<br />{d.perdidos ? "DDD de outro estado" : "nenhum barrado"}</span></div>
            </div>
            <p className="ld-say">
              {d.perdidos
                ? <>Os {d.perdidos} que se perderam foram barrados por telefone de fora de São Paulo,
                    antes de chegar ao rodízio — <b>e o anúncio deles já estava pago</b>.</>
                : <>Todos os que passaram pela triagem foram para alguém — <b>nenhum lead ficou órfão</b>.</>}
            </p>
          </div>
        </Sec>

        {/* 2 · onde a conversa está */}
        <Sec title="Onde a conversa está"
             tag={<span className="dim">{d.conversa.perguntouSemResposta + d.conversa.nuncaFalaram
               + d.conversa.falouSemResposta + d.conversa.emAndamento} leads ativos</span>}>
          <div className="ld-box">
            <div className="ld-conv">
              <div className="ld-cv hot"><b className="mono">{d.conversa.perguntouSemResposta}</b>
                <span>o cliente perguntou<br />e o corretor não voltou</span></div>
              <div className="ld-cv warn"><b className="mono">{d.conversa.nuncaFalaram}</b>
                <span>ninguém nunca falou<br />com esse cliente</span></div>
              <div className="ld-cv"><b className="mono">{d.conversa.falouSemResposta}</b>
                <span>o corretor falou<br />e o cliente não respondeu</span></div>
              <div className="ld-cv ok"><b className="mono">{d.conversa.emAndamento}</b>
                <span>conversa em andamento<br />os dois se falando</span></div>
            </div>
          </div>
        </Sec>

        {/* 3 · as filas */}
        <Sec title="O que precisa de ação" tag={<span className="dim">{d.filas.length} filas</span>}>
          <div className="ld-filas">
            {d.filas.map((f) => {
              const on = abertas.has(f.chave);
              const marcadosFila = sel[f.chave] ?? new Set<string>();
              return (
                <div key={f.chave} className={`ld-fi t-${f.tom}${on ? " on" : ""}`}>
                  <div className="ld-fh" role="button" tabIndex={0}
                    onClick={() => setAbertas((s) => {
                      const n = new Set(s); n.has(f.chave) ? n.delete(f.chave) : n.add(f.chave); return n; })}
                    onKeyDown={(e) => { if (e.key === "Enter") setAbertas((s) => {
                      const n = new Set(s); n.has(f.chave) ? n.delete(f.chave) : n.add(f.chave); return n; }); }}>
                    <span className="ld-fc mono">{f.total}</span>
                    <span className="ld-ft"><b>{f.total} {f.titulo.toLowerCase()}</b><p>{f.porque}</p></span>
                    <span>{f.total > 0 && f.acoes[0] ? (
                      <button className="mini solid" onClick={(e) => {
                        e.stopPropagation();
                        if (f.acoes[0].startsWith("Redistribuir") || f.acoes[0] === "Distribuir")
                          setRed({ ids: f.leads.map((l) => l.id) });
                        else toast.info(`${f.acoes[0]} — em construção`);
                      }}>{f.acoes[0]}</button>) : null}</span>
                    <svg className="ld-car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" /></svg>
                  </div>

                  {on && (
                    <div className="ld-fd">
                      {f.disparo && (
                        <div className="ld-lote ld-disp">
                          <span><b>{f.disparo.qtd} pessoas</b> · pela API oficial, cerca de{" "}
                            <b>{brl(f.disparo.custo)}</b> o disparo inteiro</span>
                          <button className="mini solid" onClick={() =>
                            toast.info("Montar o disparo — leva para a aba Disparar")}>Montar o disparo</button>
                        </div>
                      )}
                      {f.leads.length === 0 ? (
                        <p className="ld-mais">Nada nesta fila.</p>
                      ) : (
                        <>
                          <div className="ld-lote">
                            <label>
                              <input type="checkbox"
                                checked={marcadosFila.size === f.leads.length && f.leads.length > 0}
                                onChange={(e) => setSel((s) => ({ ...s,
                                  [f.chave]: e.target.checked ? new Set(f.leads.map((l) => l.id)) : new Set() }))} />
                              selecionar todos
                            </label>
                            <button className="mini solid" disabled={!marcadosFila.size}
                              onClick={() => setRed({ ids: [...marcadosFila] })}>Redistribuir</button>
                            <button className="mini" disabled={!marcadosFila.size}
                              onClick={() => toast.info("Cobrar — em construção")}>Cobrar o corretor</button>
                            <button className="mini danger" disabled={!marcadosFila.size}
                              onClick={() => descartarLote(f.chave)}>Descartar</button>
                            <small>{marcadosFila.size
                              ? `${marcadosFila.size} selecionado${marcadosFila.size > 1 ? "s" : ""}`
                              : "as ações valem para os selecionados"}</small>
                          </div>
                          {f.leads.map((l) => (
                            <div key={l.id} className="ld-lr">
                              <input type="checkbox" checked={marcadosFila.has(l.id)}
                                onChange={() => marcar(f.chave, l.id)} />
                              <span><b>{l.nome ?? "sem nome"}</b>
                                <span className="tel">{l.telefone ?? "—"}</span></span>
                              <span className="cor">{l.corretor ? `com ${l.corretor}` : "sem corretor"}</span>
                              <span className={`qd${l.dias > 30 ? " hot" : ""}`}>{l.dias} dias</span>
                            </div>
                          ))}
                          {f.total > f.leads.length && (
                            <p className="ld-mais">mostrando {f.leads.length} de {f.total} — os mais antigos primeiro</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Sec>

        {/* 4 · no que deu */}
        <Sec title="No que os leads deram">
          <div className="ld-box">
            <div className="ld-res">
              {[["neg", d.resultado.negociacao, "em negociação", "sub"],
                ["doc", d.resultado.documentos, "com documentos em análise", "sub"],
                ["vis", d.resultado.visitas, "visitas no período", "cury"],
                ["ven", d.resultado.vendas, "vendas no período", "cury"]].map(([k, n, rot, f]) => (
                <button key={k as string} className="ld-rs" aria-pressed={res === k}
                  onClick={() => setRes((v) => (v === k ? null : (k as string)))}>
                  <b className="mono">{n as number}</b><span>{rot as string}</span>
                  <span className={`fonte ${f}`}>{f === "cury" ? "medido na Cury" : "subnotificado"}</span>
                </button>
              ))}
            </div>

            {res && (
              <div className="ld-reslista">
                <h4>{res === "neg" ? "Leads em negociação" : res === "doc" ? "Leads com documentos"
                  : res === "vis" ? "Visitas por corretor" : "Vendas por corretor"}</h4>
                {(listaRes as any[]).length === 0 ? <p className="ld-mais">Nada neste estágio.</p>
                  : (listaRes as any[]).slice(0, 10).map((x, i) => (
                    <div key={i} className="ld-lr sem-check">
                      <span><b>{x.nome ?? "—"}</b></span>
                      <span className="cor">{x.corretor ? `com ${x.corretor}` : ""}</span>
                      <span className="qd">{x.dias != null ? `${x.dias} dias neste estágio` : `${x.n}`}</span>
                    </div>
                  ))}
                <p className="ld-mais">
                  {res === "vis" || res === "ven"
                    ? "Vem da Cury com o nome do corretor, não com o do cliente — não dá para dizer qual lead virou qual."
                    : "O estágio depende do corretor mexer no status. Quem está há muito tempo aqui pode já ter comprado em outro lugar."}
                </p>
              </div>
            )}

            <p className="ld-say">
              <b>Visita e venda vêm da Cury</b>, contadas sozinhas — são o número confiável.
              <b> Negociação e documentos dependem do corretor mexer no status</b>, e por isso
              vêm por baixo do que realmente aconteceu.
            </p>
          </div>
        </Sec>

        {/* 5 · disparador */}
        {d.disparo.alvos > 0 && (
          <Sec title="Quem respondeu ao disparo" tag={<span className="dim">API oficial</span>}>
            <div className="ld-box">
              <div className="ld-dp">
                <div className="ld-dpc"><b className="mono">{d.disparo.enviadas}</b>
                  <span>mensagens enviadas<br />de {d.disparo.alvos} alvos</span></div>
                <div className="ld-dpc ok"><b className="mono">{d.disparo.responderam}</b>
                  <span>pessoas responderam<br />levantaram a mão</span></div>
                <div className={`ld-dpc${d.disparo.semRetorno ? " hot" : ""}`}>
                  <b className="mono">{d.disparo.semRetorno}</b>
                  <span>responderam e ninguém<br />voltou a falar</span></div>
                <div className={`ld-dpc${d.disparo.pendentes ? " hot" : ""}`}>
                  <b className="mono">{d.disparo.pendentes}</b>
                  <span>alvos nunca enviados<br />{d.disparo.pendentes ? "campanha parada" : "tudo enviado"}</span></div>
              </div>
              <div className="ld-cmp">
                {d.disparo.campanhas.map((c) => (
                  <div key={c.nome} className="ld-cmr">
                    <b>{c.nome}</b>
                    <span className={`st ${c.status}`}>{
                      c.status === "sending" ? "enviando" : c.status === "done" ? "terminada"
                      : c.status === "canceled" ? "cancelada" : c.status}</span>
                    <span className="q">{c.env} enviadas</span>
                    <span className="q">{c.resp} responderam</span>
                  </div>
                ))}
              </div>
              {d.disparo.semRetorno > 0 && (
                <p className="ld-say">
                  <b>{d.disparo.semRetorno} pessoas responderam e estão sem retorno.</b> São o
                  melhor lead que existe nesta tela — foram elas que procuraram você.
                </p>
              )}
            </div>
          </Sec>
        )}

        {/* 6 · repescagem */}
        {d.pool.length > 0 && (
          <Sec title="Repescagem" tag={<span className="dim">leads antigos devolvidos ao pool</span>}>
            <div className="ld-box">
              <div className="ld-pool">
                <div className="ld-pr cab">
                  <span /><span>corretor</span><span>na fila</span>
                  <span>contatou</span><span>trouxe de volta</span>
                </div>
                {d.pool.map((p) => {
                  const pc = p.fila ? Math.round((p.trouxe / p.fila) * 100) : 0;
                  return (
                    <div key={p.nome} className="ld-pr">
                      <span className="av">{ini(p.nome)}</span>
                      <b>{p.nome}</b>
                      <span className="n mono">{p.fila}</span>
                      <span className={`n mono${p.contatou ? "" : " zero"}`}>{p.contatou}</span>
                      <span className={`pc mono${pc >= 15 ? " bom" : pc === 0 ? " ruim" : ""}`}>
                        {p.trouxe} · {pc}%</span>
                    </div>
                  );
                })}
              </div>
              <p className="ld-say">
                A coluna que importa é a última: <b>quantos ele conseguiu trazer de volta</b>.
                Quem pega e não contata está bloqueando lead que outro trabalharia.
              </p>
            </div>
          </Sec>
        )}

        {/* 7 · descartados */}
        {d.descartes.length > 0 && (
          <Sec title="Por que os leads foram descartados"
               tag={<span className="dim">{d.descartes.reduce((a, x) => a + x.n, 0)} no total</span>}>
            <div className="ld-box">
              <div className="ld-dsc">
                {d.descartes.map((x) => (
                  <div key={x.motivo} className={`ld-dr${x.auto ? " auto" : ""}`}>
                    <b>{x.motivo}</b>
                    <span className="n mono">{x.n}</span>
                    <span className="bar"><i style={{
                      width: `${(x.n / (d.descartes[0]?.n || 1)) * 100}%` }} /></span>
                    <span>{x.auto ? <span className="tag">automático</span> : null}</span>
                  </div>
                ))}
              </div>
              {d.descartes[0]?.auto && (
                <p className="ld-say">
                  <b>{d.descartes[0].n} foram descartados automaticamente por prazo</b>, não por
                  desinteresse. Vale olhar: se o corretor só tocou uma vez e o sistema descartou em
                  seguida, morreu lead bom por relógio.
                </p>
              )}
            </div>
          </Sec>
        )}

        {/* redistribuir */}
        {red && (
          <>
            <div className="tm-scrim on" onClick={() => setRed(null)} />
            <div className="tm-modal on" role="dialog" aria-modal="true">
              <h3>Redistribuir {red.ids.length} lead{red.ids.length === 1 ? "" : "s"}</h3>
              <p>Eles saem de quem está hoje e entram na carteira de quem você marcar.</p>
              <div className="ld-modos">
                {([["online", "Quem está online agora", `${d.corretores.filter((c) => c.online).length} com o Comandra aberto`],
                   ["plantao", "Quem está no plantão", `${d.corretores.filter((c) => c.plantao).length} bateram ponto hoje`],
                   ["escolher", "Escolher na mão", "um ou mais corretores"]] as const).map(([k, t, s]) => (
                  <button key={k} className={`ld-modo${modo === k ? " on" : ""}`} onClick={() => setModo(k)}>
                    <b>{t}</b><span>{s}</span>
                  </button>
                ))}
              </div>
              <div className="ld-escolha">
                {d.corretores.map((c) => {
                  const dentro = modo === "escolher" ? marcados.has(c.id)
                    : modo === "online" ? c.online : c.plantao;
                  return (
                    <label key={c.id} className="ld-eb">
                      <input type="checkbox" checked={dentro} disabled={modo !== "escolher"}
                        onChange={() => setMarcados((s) => {
                          const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                      <span className="av">{ini(c.nome)}</span>
                      <span><b>{c.nome}</b><i>{c.carteira} leads na carteira</i></span>
                      <span className={c.online ? "on" : "off"} title={c.online ? "online" : "offline"} />
                    </label>
                  );
                })}
              </div>
              <div className="ld-resumo">
                {alvoRed.length
                  ? <><b>{red.ids.length} leads</b> divididos entre <b>{alvoRed.length} corretores</b> — cerca
                      de <b>{Math.ceil(red.ids.length / alvoRed.length)} para cada um</b>.</>
                  : <>Escolha pelo menos um corretor.</>}
              </div>
              <div className="tm-modala">
                <button className="mini" onClick={() => setRed(null)}>Cancelar</button>
                <button className="mini solid" disabled={salvando || !alvoRed.length}
                  onClick={confirmarRedistribuicao}>
                  {salvando ? "redistribuindo…" : "Redistribuir"}
                </button>
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div><h1>Leads</h1><p>O que chegou, com quem está, e no que deu</p></div>
          <div className="top2-r"><SeletorPeriodo /></div>
        </header>
        <section className="view ld">{corpo()}</section>
      </main>
    </div>
  );
}
