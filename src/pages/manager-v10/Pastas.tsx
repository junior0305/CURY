// PASTAS — onde estão as propostas da equipe e quais travaram.
//
// A tela responde três perguntas, nesta ordem:
//
//   1. onde estão?        → as pastas da equipe por etapa do kanban
//   2. de quem são?       → quantas cada corretor carrega, e quantas travaram
//   3. o que ficou fora?  → pastas que não casaram com lead da equipe
//
// Vem do Junix (espelho de hora em hora), então mede o processo de crédito de
// fato — não depende de ninguém registrar nada no Comandra.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { useTheme } from "@/contexts/ThemeContext";
import { usePastas, DIAS_TRAVADA, type Pasta } from "@/hooks/usePastas";
import { Sec, Blank, Cell, ScoreRow, Bars, Tbl, Tr } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";
import "@/styles/pastas.css";

const ini = (s: string) => s.trim().slice(0, 2).toUpperCase();
const hhmm = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
}).format(new Date(iso));

/** Uma linha de pasta. Travada (DIAS_TRAVADA+) ganha a faixa âmbar. */
function Linha({ p, mostraEtapa }: { p: Pasta; mostraEtapa?: boolean }) {
  const travada = p.dias >= DIAS_TRAVADA;
  return (
    <div className={`pa-li${travada ? " vencido" : ""}`}>
      <span className="pa-av">{ini(p.cliente)}</span>
      <div className="pa-b">
        <b>{p.cliente}</b>
        <span>
          {mostraEtapa ? <>{p.etapa}<em className="sep">·</em></> : null}
          {p.daEquipe
            ? (p.corretor ?? <em className="ruim">sem corretor no Comandra</em>)
            : <em className="ruim">sem dono identificado</em>}
          {p.status ? <><em className="sep">·</em>{p.status}</> : null}
        </span>
      </div>
      <span className="pa-dias mono" title="dias nesta etapa">{p.dias}d</span>
      <span className="pa-tel">{p.fluxo ?? ""}</span>
      <span />
    </div>
  );
}

export default function Pastas() {
  const { session } = useAuth();
  // super/admin abrem as pastas de um gerente via ?manager=<id>, como no resto do painel
  const userId = useEffectiveManagerId() ?? session?.user?.id;
  const { mode, toggle } = useTheme();
  const { data, isLoading, error } = usePastas(userId);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [soTravadas, setSoTravadas] = useState(false);
  const [verSemDono, setVerSemDono] = useState(false);
  loadFonts();

  const corpo = () => {
    if (isLoading) return <Blank title="Carregando as pastas…" />;
    if (error) {
      return <Blank title="Não consegui ler as pastas">{String((error as any)?.message ?? error)}</Blank>;
    }
    if (!data) return null;

    const d = data;
    const travadas = d.minhas.filter((p) => p.dias >= DIAS_TRAVADA).length;
    const semCorretor = d.minhas.filter((p) => !p.corretorId).length;
    const maiorEtapa = Math.max(1, ...d.etapas.map((e) => e.n));

    // Filtro por etapa (clique na barra/célula) e por travadas.
    const lista = d.minhas
      .filter((p) => (etapa ? p.etapa === etapa : true))
      .filter((p) => (soTravadas ? p.dias >= DIAS_TRAVADA : true));
    // Agrupada na ordem do kanban; dentro do grupo, a mais parada primeiro.
    const grupos = d.etapas
      .map((e) => ({ ...e, pastas: lista.filter((p) => p.etapa === e.etapa) }))
      .filter((g) => g.pastas.length);

    const cols = "minmax(0,1.1fr) 64px 84px minmax(0,2.4fr)";

    return (
      <>
        <Sec title="Onde estão" tag={`${d.minhas.length} da equipe`}
          sub="As pastas da sua equipe em cada etapa do kanban, agora. O dono sai do nome do cliente casado com os leads da equipe.">
          <ScoreRow>
            <Cell label="pastas da equipe" value={d.minhas.length} />
            <Cell label={`travadas (${DIAS_TRAVADA}+ dias)`} value={travadas}
              tone={travadas ? "alert" : undefined}
              onClick={() => setSoTravadas((v) => !v)} active={soTravadas} />
            <Cell label="sem corretor" value={semCorretor}
              sub="lead sem corretor no Comandra" tone={semCorretor ? "alert" : undefined} />
            <Cell label="sem dono identificado" value={d.semDono.length}
              sub="da diretoria inteira"
              onClick={() => setVerSemDono((v) => !v)} active={verSemDono} />
          </ScoreRow>

          {d.etapas.length ? (
            <Bars rows={d.etapas.map((e) => ({
              label: e.etapa, pct: e.n / maiorEtapa,
              value: e.travadas ? `${e.n} · ${e.travadas} travadas` : e.n,
              tone: etapa && etapa !== e.etapa ? "weak" : undefined,
            }))} />
          ) : <Blank title="Nenhuma pasta da equipe no Junix" />}
        </Sec>

        <Sec title="Pastas" tag={`${lista.length}${etapa || soTravadas ? " no filtro" : ""}`}
          sub={`Agrupadas por etapa. Faixa âmbar = ${DIAS_TRAVADA} dias ou mais na mesma etapa — é por ela que a conversa com o corretor começa.`}>
          <div className="pa-filtros">
            <div className="seg">
              <button className={!etapa ? "on" : undefined} onClick={() => setEtapa(null)}>todas</button>
              {d.etapas.map((e) => (
                <button key={e.etapa} className={etapa === e.etapa ? "on" : undefined}
                  onClick={() => setEtapa(etapa === e.etapa ? null : e.etapa)}>
                  {e.etapa} ({e.n})
                </button>
              ))}
            </div>
            <button className={`mini${soTravadas ? " key" : ""}`} onClick={() => setSoTravadas((v) => !v)}>
              {soTravadas ? "mostrando só as travadas" : `só as travadas (${travadas})`}
            </button>
          </div>

          {grupos.length ? grupos.map((g) => (
            <div key={g.etapa} style={{ marginBottom: 18 }}>
              <p className="sec-sub" style={{ margin: "0 0 8px" }}>
                <b>{g.etapa}</b> · {g.pastas.length}
                {g.travadas ? ` · ${g.travadas} travadas` : ""}
              </p>
              <div className="pa-lista">
                {g.pastas.map((p) => <Linha key={p.id} p={p} />)}
              </div>
            </div>
          )) : (
            <Blank title="Nenhuma pasta neste filtro">
              {soTravadas ? `Nada parado há ${DIAS_TRAVADA} dias ou mais.` : "Sem pastas da equipe no momento."}
            </Blank>
          )}
        </Sec>

        <Sec title="Por corretor" tag={`${d.porCorretor.filter((c) => c.id).length} com pasta`}
          sub="Quantas pastas cada corretor carrega e em que etapa. Travadas é quem pede cobrança hoje.">
          {d.porCorretor.length ? (
            <Tbl cols={cols} head={["Corretor", "Pastas", "Travadas", "Por etapa"]}>
              {d.porCorretor.map((c) => (
                <Tr key={c.id ?? "sem"} cols={cols}>
                  <span>{c.id ? c.nome : <span style={{ color: "var(--red)", fontWeight: 600 }}>{c.nome}</span>}</span>
                  <span className="mono">{c.total}</span>
                  <span className="mono">{c.travadas || "—"}</span>
                  <span>{c.porEtapa.map((e) => `${e.n} ${e.etapa}`).join(" · ")}</span>
                </Tr>
              ))}
            </Tbl>
          ) : <Blank title="Nenhum corretor com pasta" />}
        </Sec>

        <Sec title="Pastas da diretoria sem dono identificado" tag={`${d.semDono.length}`}
          sub="O nome do cliente não casou com nenhum lead da sua equipe. Podem ser de outra equipe ou ter o nome escrito diferente — ficam aqui para nada sumir.">
          <div className="pa-filtros">
            <button className={`mini${verSemDono ? " key" : ""}`} onClick={() => setVerSemDono((v) => !v)}>
              {verSemDono ? "esconder" : `mostrar as ${d.semDono.length}`}
            </button>
          </div>
          {verSemDono ? (
            d.semDono.length ? (
              <div className="pa-lista">
                {d.semDono.map((p) => <Linha key={p.id} p={p} mostraEtapa />)}
              </div>
            ) : <Blank title="Todas as pastas têm dono" />
          ) : null}
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
            <p>
              Onde estão as propostas da equipe, e quais travaram
              {data?.atualizadoEm ? <> · Fonte: Junix · atualizado {hhmm(data.atualizadoEm)}</> : null}
            </p>
          </div>
        </header>
        <section className="view">{corpo()}</section>
      </main>
    </div>
  );
}
