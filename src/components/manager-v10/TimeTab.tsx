// ABA TIME — a estratégia da equipe.
//
// Cinco blocos, cada um uma decisão:
//   1. como está o time (concentração é fragilidade)
//   2. quanto eu vou vender (o compromisso vira a meta da semana)
//   3. quem precisa de você (o coach)
//   4. o que está errado no time inteiro (treino de escala)
//   5. minhas contratações (e o cadastro de corretor)
//
// Linguagem: cada palavra tem que ser uma palavra que o gerente fala em voz
// alta. "insumo", "rampa", "TPR" e proporção tipo 1:6,4 saíram — viraram frase.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sec, Blank } from "@/components/manager-v10/ui";
import { useTime, assumirMeta, type PessoaTime } from "@/hooks/useTime";
import Briefing from "@/components/manager-v10/Briefing";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";

const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();
const um = (n: number | null) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

export default function TimeTab({ managerId }: { managerId: string | undefined }) {
  const { data, isLoading } = useTime(managerId);
  const { session } = useAuth();
  const qc = useQueryClient();
  const [mu, setMu] = useState<"up" | "down" | null>(null);
  const [brief, setBrief] = useState<PessoaTime | null>(null);
  const [cadastrar, setCadastrar] = useState(false);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (isLoading) return <Blank title="Carregando a equipe…" />;
  if (!data) return null;

  const { gente, curva, topN, semAtendimento, subiram, cairam, achados,
          time, novatos, ultimasSemanas, metaSemana, teamId } = data;

  if (gente.length === 0) {
    return <Blank title="Nenhum corretor nesta equipe">
      Cadastre o primeiro pelo botão em Minhas contratações.
    </Blank>;
  }

  const totalAt = curva.reduce((a, n) => a + n, 0);
  const fatia = totalAt ? Math.round((curva.slice(0, topN).reduce((a, n) => a + n, 0) / totalAt) * 10) : 0;
  const max = curva[0] || 1;

  const razao = time.atendPorVenda ?? 3;
  const sugerido = Math.max(1, Math.round(
    ultimasSemanas.filter(Boolean).length
      ? ultimasSemanas.reduce((a, n) => a + n, 0) / ultimasSemanas.length
      : 3));
  const escolhido = alvo ?? metaSemana ?? sugerido;
  const precisaAt = Math.ceil(escolhido * razao);

  async function assumir() {
    if (!teamId) { toast.error("Sua equipe não está cadastrada em times."); return; }
    setSalvando(true);
    try {
      await assumirMeta(teamId, escolhido, session!.user.id);
      toast.success(`Meta da semana: ${escolhido} venda${escolhido === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["aba-time"] });
      qc.invalidateQueries({ queryKey: ["meta-semana"] });
    } catch (e: any) {
      toast.error(`Não consegui salvar: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

  const lista = mu === "up" ? subiram : mu === "down" ? cairam : [];

  return (
    <section className="view tm">
      {/* 1 ─ como está o time */}
      <Sec title="Como está o time" tag={<span className="dim">últimos {data.dias} dias</span>}>
        <div className="tm-box tm-conc">
          <div>
            <p className="tm-frase">
              <span className="n">{topN}</span> {topN === 1 ? "pessoa faz" : "pessoas fazem"} quase
              todo o atendimento.{" "}
              <span className="hot"><span className="n">{semAtendimento}</span> não atenderam ninguém.</span>
              <small>
                {topN > 0 && fatia > 0
                  ? <>{topN === 1 ? "Essa pessoa faz" : `Esses ${topN} fazem`} <b>{fatia} de cada 10 atendimentos</b> do time.
                      {topN > 1 ? <> Se dois deles faltarem na mesma semana, você perde metade da operação.</> : null}</>
                  : <>Ninguém atendeu no período. Não há o que concentrar.</>}
              </small>
            </p>
            <div className="tm-mudou">
              <button className={`tm-mu up${mu === "up" ? " on" : ""}`} aria-expanded={mu === "up"}
                onClick={() => setMu((v) => (v === "up" ? null : "up"))}>
                <b>{subiram.length}</b> venderam mais que no período anterior
              </button>
              <button className={`tm-mu down${mu === "down" ? " on" : ""}`} aria-expanded={mu === "down"}
                onClick={() => setMu((v) => (v === "down" ? null : "down"))}>
                <b>{cairam.length}</b> venderam menos
              </button>
            </div>

            {mu && (
              <div className="tm-mulista">
                <h4>{mu === "up" ? "Venderam mais" : "Venderam menos"}</h4>
                {lista.length === 0 ? <p>Ninguém nesta situação.</p> : lista.map((p) => {
                  const delta = p.vendas - p.vendasAntes;
                  const sobeRapido = mu === "up" && delta >= 2;
                  const motivo = mu === "down" && p.leadsRecebidos < p.leadsRecebidosAntes * 0.6
                    ? `recebeu ${p.leadsRecebidos} leads, o normal é ${p.leadsRecebidosAntes}` : "";
                  return (
                    <div key={p.profileId} className="tm-ml">
                      <span className="av">{ini(p.apelido ?? p.nome)}</span>
                      <span>
                        <b>{p.apelido ?? p.nome}</b>
                        {motivo ? <i> · {motivo}</i> : null}
                      </span>
                      <span className="de">{p.vendasAntes} <em>→ {p.vendas}</em> vendas</span>
                      <span>
                        {sobeRapido
                          ? <span className="tm-sniper">✦ subindo rápido</span>
                          : <button className="mini" onClick={() => setBrief(p)}>Ver o briefing</button>}
                      </span>
                    </div>
                  );
                })}
                <p>{mu === "up"
                  ? "Quem sobe rápido merece mais lead antes de o resultado aparecer — é o momento mais barato de investir em alguém."
                  : "Queda de quem já vendeu bem quase nunca é preguiça. Na maioria das vezes é lead de menos, ou algo pessoal."}</p>
              </div>
            )}
          </div>

          <div>
            <div className="tm-curva">
              {curva.map((v, i) => (
                <i key={i} className={v ? "" : "zero"}
                   style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : "4px" }}
                   title={`${v} atendimento${v === 1 ? "" : "s"}`} />
              ))}
              {topN > 0 && <span className="corte" style={{ left: `calc(${(topN / curva.length) * 100}% - 1px)` }} />}
            </div>
            <p className="tm-curva-l">
              Cada barra é um corretor, do que mais atende para o que menos atende.
              {topN > 0 ? <> <b>Até a linha vermelha estão {fatia} de cada 10 atendimentos.</b></> : null}
            </p>
          </div>
        </div>
      </Sec>

      {/* 2 ─ quanto eu vou vender */}
      <Sec title="Quanto eu vou vender esta semana" tag={<span className="dim">segunda a domingo</span>}>
        <div className="tm-box tm-comp">
          <div>
            <p className="tm-say">
              {metaSemana
                ? <>Você assumiu <b>{metaSemana} venda{metaSemana === 1 ? "" : "s"}</b> esta semana. Dá para mudar até domingo.</>
                : <>Escolha o número e assuma. Ele vira a meta da semana, e o painel passa a contar a partir dele.</>}
            </p>
            <div className="tm-conta">
              <p>Nas últimas 4 semanas seu time vendeu:</p>
              <div className="tm-sem">
                {ultimasSemanas.map((v, i) => (
                  <s key={i}>{v}<em>{i === 3 ? "semana passada" : `${4 - i} semanas atrás`}</em></s>
                ))}
              </div>
              <p>Seu time faz <b>1 venda a cada {um(razao)} atendimentos</b>. Para vender{" "}
                <b>{escolhido}</b>, precisa de <b>{precisaAt} atendimentos</b> — mais ou menos{" "}
                <b>{Math.ceil(precisaAt / 5)} por dia</b>.</p>
            </div>
          </div>
          <div className="tm-pick">
            <span className="tag">Eu vou vender</span>
            <div className="tm-pickn">
              <button onClick={() => setAlvo(Math.max(0, escolhido - 1))} aria-label="Diminuir">−</button>
              <span className="tm-pickv mono">{escolhido}</span>
              <button onClick={() => setAlvo(escolhido + 1)} aria-label="Aumentar">+</button>
            </div>
            <button className="mini solid" style={{ width: "100%" }} disabled={salvando} onClick={assumir}>
              {salvando ? "salvando…" : `Assumir ${escolhido} venda${escolhido === 1 ? "" : "s"}`}
            </button>
            <small>Vale até domingo. Seu superintendente vê o que você assumiu.</small>
          </div>
        </div>
      </Sec>

      {/* 3 ─ quem precisa de você */}
      <Sec title="Quem precisa de você"
           tag={<span className="dim">{achados.length} de {gente.length} · os mais urgentes primeiro</span>}>
        {achados.length === 0 ? (
          <Blank title="Ninguém fora do lugar no período" />
        ) : (
          <div className="tm-q">
            {achados.map((a) => {
              const p = gente.find((g) => g.profileId === a.profileId)!;
              return (
                <div key={a.chave + a.profileId} className={`tm-qi t-${a.tom}`}
                     role="button" tabIndex={0} onClick={() => setBrief(p)}
                     onKeyDown={(e) => { if (e.key === "Enter") setBrief(p); }}>
                  <span className="av">{ini(a.nome)}</span>
                  <span className="tm-qt">
                    <span className="fato">{a.nome} <span>·</span> {a.fato}</span>
                    <p>{a.leitura}</p>
                    <em>{a.faz}</em>
                  </span>
                  <span><button className="mini" onClick={(e) => { e.stopPropagation(); setBrief(p); }}>
                    Ver o briefing</button></span>
                </div>
              );
            })}
          </div>
        )}
      </Sec>

      {/* 4 ─ o time inteiro */}
      {time.checkinsPorAtend !== null && (
        <Sec title="O que está errado no time inteiro">
          <div className="tm-box">
            {time.checkinsPorAtend > 4 ? (
              <>
                <p className="tm-tt">Seu time vai ao plantão, mas <span className="hot">não puxa conversa</span>.</p>
                <p className="tm-p">
                  O pessoal bate ponto e fica no balcão sem abordar ninguém. São{" "}
                  <b>{um(time.checkinsPorAtend)} check-ins para cada 1 atendimento</b>
                  {time.checkinsPorAtendSemTopo && topN > 0
                    ? <> — e tirando {topN === 1 ? "o melhor" : `os ${topN} melhores`}, sobe para <b>{um(time.checkinsPorAtendSemTopo)}</b></>
                    : null}.
                  {time.atendPorVenda && time.atendPorVenda <= 4
                    ? <> Quando alguém consegue atender, <b>vende bem</b>: 1 venda a cada {um(time.atendPorVenda)}.</>
                    : null}
                  <br /><br />
                  Ou seja: <b>o problema não é fechar, é começar a conversa.</b>
                </p>
              </>
            ) : (
              <>
                <p className="tm-tt">Seu time atende bem, mas <span className="hot">não fecha</span>.</p>
                <p className="tm-p">
                  A abordagem no balcão está funcionando — {um(time.checkinsPorAtend)} check-ins por
                  atendimento. O problema é depois: são <b>{um(time.atendPorVenda)} atendimentos
                  para cada venda</b>.
                  <br /><br />
                  Ou seja: <b>o problema é fechar, não começar.</b>
                </p>
              </>
            )}
            <div className="tm-tres">
              <div className="tm-t3"><b>{um(time.checkinsPorAtend)} check-ins</b>
                <span>para cada 1 atendimento, no time todo</span></div>
              {time.checkinsPorAtendSemTopo && topN > 0 && (
                <div className="tm-t3 pior"><b>{um(time.checkinsPorAtendSemTopo)} check-ins</b>
                  <span>tirando {topN === 1 ? "o melhor" : `os ${topN} melhores`} — aqui está o problema</span></div>
              )}
              <div className="tm-t3"><b>{um(time.atendPorVenda)} atendimentos</b>
                <span>para cada 1 venda{time.atendPorVenda && time.atendPorVenda <= 4 ? " — isso está bom" : ""}</span></div>
            </div>
            <p className="tm-p" style={{ marginBottom: 14 }}>
              Um treino de abordagem resolve para os {gente.length} de uma vez.
              {time.leadsParados > 30
                ? <> E como o time tem <b>{time.leadsParados} clientes que responderam e ficaram sem
                    retorno</b>, um <b>corujão de oferta ativa</b> ataca o mesmo problema pelo outro lado.</>
                : null}
            </p>
            <div className="tm-acts">
              <button className="mini solid" onClick={() => toast.info("Marcar treino — em construção")}>
                Marcar treino de abordagem</button>
              <button className="mini" onClick={() => toast.info("Propor corujão — em construção")}>
                Propor corujão</button>
            </div>
          </div>
        </Sec>
      )}

      {/* 5 ─ contratações */}
      <Sec title="Minhas contratações" tag={<span className="dim">últimos 90 dias</span>}>
        <div className="tm-box">
          <div className="tm-cth">
            <span className="tm-ctn">
              {novatos.length} contratado{novatos.length === 1 ? "" : "s"}
              {novatos.length > 0 && (
                <span> · {novatos.filter((n) => n.primeiraVenda != null).length} já vende
                  {" "}· {novatos.filter((n) => n.primeiraVenda == null && n.primeiroPonto != null).length} começando
                  {" "}· {novatos.filter((n) => n.primeiroPonto == null).length} nunca apareceram</span>
              )}
            </span>
            <button className="mini solid" style={{ marginLeft: "auto" }} onClick={() => setCadastrar(true)}>
              Cadastrar corretor
            </button>
          </div>

          {novatos.length === 0 ? (
            <Blank title="Nenhuma contratação nos últimos 90 dias" />
          ) : novatos.map((n) => {
            const dias = n.criadoEm
              ? Math.round((Date.now() - new Date(n.criadoEm).getTime()) / 86_400_000) : 0;
            const estado = n.primeiraVenda != null
              ? { t: "ok", r: "já vende", txt: `Vendeu pela 1ª vez com ${n.primeiraVenda} dias de casa` }
              : n.primeiroAtend != null
              ? { t: "lento", r: "começando", txt: `Já atende${n.primeiroAtend > 20 ? ` — demorou ${n.primeiroAtend} dias` : ""}, ainda não vendeu` }
              : n.primeiroPonto != null
              ? { t: "lento", r: "começando", txt: `${dias} dias de casa e nenhum atendimento` }
              : { t: "morto", r: "parado", txt: "Nunca bateu ponto" };
            return (
              <div key={n.profileId} className="tm-ctr">
                <span className="av">{ini(n.apelido ?? n.nome)}</span>
                <span><b>{n.apelido ?? n.nome}</b><i>{dias} dias de casa</i></span>
                <span className="est">{estado.txt}</span>
                <span className={`tm-tag ${estado.t}`}>{estado.r}</span>
              </div>
            );
          })}

          <p className="tm-nota">
            Quanto tempo cada um levou para começar a vender. <b>Quem passa de 30 dias sem atender
            ninguém quase nunca engata</b> — é a hora de conversar, não depois.
          </p>
        </div>
      </Sec>

      {brief && <Briefing pessoa={brief} gente={gente} onFechar={() => setBrief(null)} />}
      {cadastrar && <CadastrarCorretor managerId={managerId!} onFechar={() => setCadastrar(false)}
        onPronto={() => { setCadastrar(false); qc.invalidateQueries({ queryKey: ["aba-time"] }); }} />}
    </section>
  );
}
