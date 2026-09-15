// PASTAS — o que entrou em pasta, onde está, e o que travou.
//
// A tela responde três perguntas, nesta ordem, porque é a ordem em que elas
// importam para o gerente:
//
//   1. quantas subiram?      → produção, o que a equipe fez
//   2. onde estão?           → fila, onde o dinheiro está parado
//   3. quais estão paradas?  → ação, com o telefone do cliente na mão
//
// Vem do Salesforce, então mede o que a operação fez de fato — não depende de
// ninguém registrar nada no Comandra.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { usePastas, linkWhats, type Parada } from "@/hooks/usePastas";
import { Sec, Blank, Cell, ScoreRow, Bars } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";
import "@/styles/pastas.css";

const ini = (s: string) => s.trim().slice(0, 2).toUpperCase();
const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

type Corte = 30 | 45 | 60;

export default function Pastas() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const { data, isLoading } = usePastas(userId);
  const [corte, setCorte] = useState<Corte>(45);
  const [soOrfas, setSoOrfas] = useState(false);
  loadFonts();

  const corpo = () => {
    if (isLoading) return <Blank title="Carregando as propostas…" />;
    if (!data) return null;
    if (!data.apelido) {
      return (
        <Blank title="Não encontrei você no Salesforce">
          O seu login não está ligado a um gerente da Cury, e é essa ligação que
          diz quais propostas são da sua equipe. Fale com o administrador.
        </Blank>
      );
    }

    const d = data;
    const semanas = d.porSemana.slice(-10);
    const pico = Math.max(1, ...semanas.map((s) => s.n));
    const maiorEtapa = Math.max(1, ...d.estoque.map((e) => e.n));

    const fila: Parada[] = d.paradas
      .filter((p) => p.dias >= corte)
      .filter((p) => (soOrfas ? p.orfa : true));
    const orfas = d.paradas.filter((p) => p.dias >= corte && p.orfa).length;

    // Média por dia útil da última semana cheia, para o "subiram hoje" ter
    // contra o que ser lido. Um número sozinho não diz se é bom.
    const ult = semanas.length > 1 ? semanas[semanas.length - 2].n : 0;

    return (
      <>
        <Sec title="Subiram" tag="entradas em montagem de pasta"
          sub="Quantas propostas passaram para montagem de pasta. É produção — vem do Salesforce, não de registro no Comandra.">
          <ScoreRow>
            <Cell label="hoje" value={d.subiramHoje} />
            <Cell label="esta semana" value={d.subiramSemana}
              sub={ult ? `semana passada ${ult}` : undefined}
              tone={ult && d.subiramSemana < ult / 2 ? "alert" : undefined} />
            <Cell label="este mês" value={d.subiramMes} />
            <Cell label="em 90 dias" value={d.porDia.reduce((a, x) => a + x.n, 0)} />
          </ScoreRow>

          {semanas.length ? (
            <div className="pa-serie">
              {semanas.map((s) => (
                <div className="pa-col" key={s.semana} title={`semana de ${ddmm(s.semana)}: ${s.n}`}>
                  <span className="pa-n">{s.n}</span>
                  <i style={{ height: `${Math.max(4, (s.n / pico) * 100)}%` }} />
                  <span className="pa-d">{ddmm(s.semana)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Sec>

        <Sec title="Onde estão" tag={`${d.estoque.reduce((a, e) => a + e.n, 0)} abertas`}
          sub="O estoque parado em cada etapa, agora. Fila grande pode ser muito entrando ou nada saindo — por isso ela vem depois da produção.">
          {d.estoque.length ? (
            <Bars rows={d.estoque.map((e) => ({
              label: e.etapa, pct: e.n / maiorEtapa, value: e.n,
            }))} />
          ) : <Blank title="Nenhuma proposta aberta" />}

          <ScoreRow>
            <Cell label="vendas ganhas" value={d.ganhas} tone="good" />
            <Cell label="vendas perdidas" value={d.perdidas} tone={d.perdidas ? "alert" : undefined} />
            <Cell label="distratos" value={d.distratos} tone={d.distratos ? "alert" : undefined} />
            <Cell label="sem corretor ativo" value={orfas}
              sub="o corretor saiu" tone={orfas ? "alert" : undefined} />
          </ScoreRow>
        </Sec>

        <Sec title="Paradas" tag={`${fila.length} com telefone`}
          sub="Com o contato do cliente na mão. Você decide: cobrar quem está com ela, ou passar para outro corretor.">
          <div className="pa-filtros">
            <div className="seg">
              {([30, 45, 60] as Corte[]).map((c) => (
                <button key={c} className={corte === c ? "on" : undefined}
                  onClick={() => setCorte(c)}>+{c} dias</button>
              ))}
            </div>
            <button className={`mini${soOrfas ? " key" : ""}`} onClick={() => setSoOrfas((v) => !v)}>
              {soOrfas ? "mostrando só as sem corretor" : `só as sem corretor (${orfas})`}
            </button>
          </div>

          {fila.length ? (
            <div className="pa-lista">
              {fila.slice(0, 80).map((p) => {
                const wa = linkWhats(p.telefone, p.cliente);
                return (
                  <div className={`pa-li${p.orfa ? " orfa" : ""}`} key={p.id}>
                    <span className="pa-av">{ini(p.cliente ?? "?")}</span>
                    <div className="pa-b">
                      <b>{p.cliente ?? "sem nome"}</b>
                      <span>
                        {p.status}
                        <em className="sep">·</em>
                        {p.orfa ? <em className="ruim">corretor saiu</em> : (p.corretor ?? "sem corretor")}
                        {p.semDocumento ? <><em className="sep">·</em><em className="ruim">sem documento</em></> : null}
                      </span>
                    </div>
                    <span className="pa-dias mono">{p.dias}d</span>
                    <span className="pa-tel mono">{p.telefone}</span>
                    <div className="acts">
                      {wa ? (
                        <a className="mini key" href={wa} target="_blank" rel="noreferrer">
                          Chamar no WhatsApp
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {fila.length > 80 ? (
                <p className="sec-sub" style={{ margin: "12px 0 0" }}>
                  Mostrando as 80 mais antigas de {fila.length}.
                </p>
              ) : null}
            </div>
          ) : (
            <Blank title={`Nenhuma parada há mais de ${corte} dias`}>
              {soOrfas ? "Nenhuma sem corretor ativo neste corte." : "A fila está em dia."}
            </Blank>
          )}
        </Sec>
      </>
    );
  };

  return (
    <div className="mgr10 app2 pastas">
      <RailV10 atual={"pastas" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Pastas</h1>
            <p>O que entrou em pasta, onde está, e o que travou</p>
          </div>
        </header>
        <section className="view">{corpo()}</section>
      </main>
    </div>
  );
}
