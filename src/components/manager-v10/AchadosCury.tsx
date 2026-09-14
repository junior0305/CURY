// Os achados do cruzamento Cury × Comandra, na aba Time.
//
// Duas coisas que só existem quando as duas fontes se encontram:
//   · quem foi ao plantão e não abriu o Comandra (presença sem trabalho);
//   · quantos dias a pessoa vai trabalhar contra o que ela produz.
//
// Frase, não número solto. Um painel que mostra "3 · 18 · 0" faz o gerente
// fechar a tela; "Bateu ponto em 8 dias e não atendeu ninguém" faz ele ligar.

import { Sec, Panel, ScoreRow, Cell, Tbl, Tr, Blank } from "@/components/manager-v10/ui";
import {
  useCruzamentoCury, acharPadroes,
  type EntradaAchado, type Achado,
} from "@/hooks/useCruzamentoCury";

function Linha({ a }: { a: Achado }) {
  const cor = a.tom === "grave" ? "hot" : a.tom === "bom" ? "win" : "";
  return (
    <div className="move" style={{ padding: "var(--s2) 0" }}>
      <p className="move-say">
        <b className={cor}>{a.quem}</b> — {a.texto}
      </p>
    </div>
  );
}

export default function AchadosCury({
  managerId, time,
}: { managerId: string | undefined; time: EntradaAchado[] }) {
  const { data: cruz, isLoading } = useCruzamentoCury(managerId);

  if (isLoading || !cruz) return null;

  if (!cruz.gerenteCuryId) {
    return (
      <Sec title="Presença x produção">
        <Blank title="Seu cadastro ainda não foi ligado ao da Cury">
          É um ajuste feito uma vez só. Sem ele não dá para cruzar quem foi ao
          plantão com quem trabalhou os leads.
        </Blank>
      </Sec>
    );
  }

  const achados = acharPadroes(time, cruz);
  const graves = achados.filter((a) => a.tom === "grave");
  const atencao = achados.filter((a) => a.tom === "atencao");
  const bons = achados.filter((a) => a.tom === "bom");

  // O comparativo que o Junior pediu: foi ao plantão, não entrou no sistema.
  const fantasmas = time
    .map((p) => ({ p, c: cruz.porProfile.get(p.profileId) }))
    .filter(({ p, c }) => (c?.diasDePlantao ?? 0) > 0 && p.horasSemEntrar > 72);

  const totalPlantao = [...cruz.porProfile.values()]
    .filter((c) => c.diasDePlantao > 0).length;
  const visitasTime = [...cruz.porProfile.values()].reduce((a, c) => a + c.visitas, 0);
  const checkinsTime = [...cruz.porProfile.values()].reduce((a, c) => a + c.checkins, 0);

  return (
    <>
      <Sec
        title="Presença x produção"
        tag={<span className="dim">últimos {cruz.dias} dias</span>}
        sub="Check-in vem da Cury, carteira e acesso vêm do Comandra. Nenhuma das duas fontes conta essa história sozinha."
      >
        <ScoreRow>
          <Cell label="Foram ao plantão" value={totalPlantao}
                sub={`${checkinsTime} check-ins no período`} />
          <Cell label="Visitas geradas" value={visitasTime}
                tone={visitasTime === 0 ? "alert" : "good"} />
          <Cell
            label="Check-ins por visita"
            value={cruz.medianaCheckinsPorVisita
              ? cruz.medianaCheckinsPorVisita.toFixed(0) : "—"}
            sub="mediana do time — a régua de comparação" />
          <Cell label="Foram e não entraram no sistema" value={fantasmas.length}
                tone={fantasmas.length > 0 ? "alert" : undefined}
                sub={fantasmas.length ? "trabalharam sem tocar na carteira" : "ninguém nessa situação"} />
        </ScoreRow>
      </Sec>

      {fantasmas.length > 0 && (
        <Sec
          title="Foram trabalhar e não abriram o Comandra"
          sub="O lead chegou, tocou o telefone de ninguém e esfriou. É a perda mais silenciosa que existe aqui."
        >
          <Panel>
            <Tbl
              cols="minmax(140px,1.6fr) 90px 80px 80px 110px"
              head={["Corretor", "Dias de plantão", "Check-ins", "Carteira", "Sem entrar há"]}
            >
              {fantasmas.map(({ p, c }) => (
                <Tr key={p.profileId} cols="minmax(140px,1.6fr) 90px 80px 80px 110px">
                  <span className="nmc"><b>{p.nome}</b></span>
                  <span className="num">{c?.diasDePlantao ?? 0}</span>
                  <span className="num">{c?.checkins ?? 0}</span>
                  <span className="num">{p.carteira}</span>
                  <span className="num hot">{Math.floor(p.horasSemEntrar / 24)} dias</span>
                </Tr>
              ))}
            </Tbl>
          </Panel>
        </Sec>
      )}

      {(graves.length > 0 || atencao.length > 0 || bons.length > 0) && (
        <Sec
          title="O que eu faria hoje"
          tag={graves.length ? <span className="bad">{graves.length} urgente{graves.length > 1 ? "s" : ""}</span> : null}
        >
          <Panel>
            {achados.length === 0 ? (
              <Blank title="Nada fora do lugar no período" />
            ) : (
              <>
                {graves.map((a, i) => <Linha key={`g${i}`} a={a} />)}
                {atencao.map((a, i) => <Linha key={`a${i}`} a={a} />)}
                {bons.map((a, i) => <Linha key={`b${i}`} a={a} />)}
              </>
            )}
          </Panel>
        </Sec>
      )}
    </>
  );
}
