// O que o cruzamento Cury × Comandra encontrou — só as frases.
//
// A versão anterior tinha um placar, uma tabela de "foram e não abriram" e, logo
// abaixo, uma frase dizendo exatamente isso. Três formas do mesmo fato. Ficou a
// frase, que é a única que diz o que fazer.
//
// O placar de presença saiu daqui: hoje-agora é a aba Ao Vivo. Esta é a leitura
// do período.

import { Sec, Panel, Blank } from "@/components/manager-v10/ui";
import { acharPadroes, type Cruzamento, type EntradaAchado, type Achado } from "@/hooks/useCruzamentoCury";

function Linha({ a }: { a: Achado }) {
  const cor = a.tom === "grave" ? "hot" : a.tom === "bom" ? "win" : "";
  return (
    <p className="move-say" style={{ padding: "6px 0" }}>
      <b className={cor}>{a.quem}</b> — {a.texto}
    </p>
  );
}

export default function AchadosCury({
  cruz, time,
}: { cruz: Cruzamento | undefined; time: EntradaAchado[] }) {
  if (!cruz) return null;

  if (!cruz.gerenteCuryId) {
    return (
      <Sec title="O que eu faria">
        <Blank title="Seu cadastro ainda não foi ligado ao da Cury">
          Sem esse vínculo não dá para cruzar quem foi ao plantão com quem
          trabalhou os leads. É um ajuste feito uma vez só.
        </Blank>
      </Sec>
    );
  }

  const achados = acharPadroes(time, cruz);
  if (achados.length === 0) return null;

  const graves = achados.filter((a) => a.tom === "grave");

  return (
    <Sec
      title="O que eu faria"
      tag={graves.length
        ? <span className="bad">{graves.length} urgente{graves.length > 1 ? "s" : ""}</span>
        : null}
      sub={cruz.medianaCheckinsPorVisita
        ? `Régua do time: uma visita a cada ${cruz.medianaCheckinsPorVisita.toFixed(0)} check-ins.`
        : undefined}
    >
      <Panel>
        <div className="move">
          {achados.map((a, i) => <Linha key={i} a={a} />)}
        </div>
      </Panel>
    </Sec>
  );
}
