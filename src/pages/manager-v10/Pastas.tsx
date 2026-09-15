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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import {
  usePastas, linkWhats, registrarToque, TIPOS_TOQUE, type Parada,
} from "@/hooks/usePastas";
import { Sec, Blank, Cell, ScoreRow, Bars } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";
import "@/styles/pastas.css";

const ini = (s: string) => s.trim().slice(0, 2).toUpperCase();
const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emDias = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
/** "há 3 dias" — quem lê a fila quer a distância, não a data. */
const desde = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};
const ROTULO = Object.fromEntries(TIPOS_TOQUE.map((t) => [t.k, t.rotulo]));

type Corte = 30 | 45 | 60;

export default function Pastas() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const { data, isLoading } = usePastas(userId);
  const [corte, setCorte] = useState<Corte>(45);
  const [soOrfas, setSoOrfas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("ligou");
  const [nota, setNota] = useState("");
  const [voltar, setVoltar] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  loadFonts();

  function abrir(id: string) {
    setAberta((v) => (v === id ? null : id));
    setTipo("ligou"); setNota(""); setVoltar("");
  }

  async function salvar(p: Parada) {
    if (!userId) return;
    setSalvando(true);
    try {
      await registrarToque({
        propostaId: p.id, autorId: userId, tipo,
        nota, voltarEm: voltar || null,
      });
      toast.success(voltar
        ? `Registrado. Volta para o topo em ${ddmm(voltar)}.`
        : "Registrado.");
      setAberta(null);
      qc.invalidateQueries({ queryKey: ["pastas"] });
    } catch (e: any) {
      toast.error(`Não consegui registrar: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

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
          sub="Com o contato do cliente na mão. Registre o que fez — quem tem retorno marcado para hoje sobe para o topo, e quem nunca foi tocado vem antes de quem já foi.">
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
                  <div className={`pa-li${p.orfa ? " orfa" : ""}${p.vencido ? " vencido" : ""}${aberta === p.id ? " on" : ""}`} key={p.id}>
                    <span className="pa-av">{ini(p.cliente ?? "?")}</span>
                    <div className="pa-b">
                      <b>{p.cliente ?? "sem nome"}</b>
                      <span>
                        {p.status}
                        <em className="sep">·</em>
                        {p.orfa ? <em className="ruim">corretor saiu</em> : (p.corretor ?? "sem corretor")}
                        {p.semDocumento ? <><em className="sep">·</em><em className="ruim">sem documento</em></> : null}
                      </span>
                      {/* O que já foi feito. Sem esta linha a fila volta idêntica
                          amanhã e o gerente refaz o mesmo trabalho. */}
                      {p.toque ? (
                        <span className="pa-toque">
                          {p.vencido ? <em className="alvo">voltar hoje</em> : null}
                          {ROTULO[p.toque.tipo] ?? p.toque.tipo} {desde(p.toque.quando)}
                          {p.toque.autor ? ` · ${p.toque.autor}` : ""}
                          {p.toque.nota ? <em className="nota"> — {p.toque.nota}</em> : null}
                        </span>
                      ) : null}
                    </div>
                    <span className="pa-dias mono">{p.dias}d</span>
                    <span className="pa-tel mono">{p.telefone}</span>
                    <div className="acts">
                      {wa ? (
                        <a className="mini key" href={wa} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                      ) : null}
                      <button className="mini" onClick={() => abrir(p.id)}>
                        {aberta === p.id ? "fechar" : "Registrar"}
                      </button>
                    </div>

                    {aberta === p.id ? (
                      <div className="pa-form">
                        <div className="pa-tipos">
                          {TIPOS_TOQUE.map((t) => (
                            <button key={t.k} className={`pa-chip${tipo === t.k ? " on" : ""}`}
                              onClick={() => setTipo(t.k)}>{t.rotulo}</button>
                          ))}
                        </div>
                        <input className="pa-nota" value={nota} maxLength={180}
                          placeholder="o que aconteceu (opcional)"
                          onChange={(e) => setNota(e.target.value)} />
                        <div className="pa-volta">
                          <span>Voltar em</span>
                          {[
                            ["amanhã", emDias(1)],
                            ["3 dias", emDias(3)],
                            ["1 semana", emDias(7)],
                          ].map(([rot, val]) => (
                            <button key={rot} className={`pa-chip${voltar === val ? " on" : ""}`}
                              onClick={() => setVoltar(voltar === val ? "" : val)}>{rot}</button>
                          ))}
                          <input type="date" value={voltar} min={hoje()}
                            onChange={(e) => setVoltar(e.target.value)} />
                          <button className="mini solid" disabled={salvando}
                            onClick={() => salvar(p)}>
                            {salvando ? "salvando…" : "Registrar"}
                          </button>
                        </div>
                      </div>
                    ) : null}
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
