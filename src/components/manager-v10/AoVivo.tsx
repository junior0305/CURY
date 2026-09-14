// AO VIVO — o estado de HOJE. Nada aqui é histórico; histórico é a aba Time.
//
// Uma lista só, ordenada por urgência. A versão anterior tinha quatro listas e
// a mesma pessoa aparecia em duas delas ("sem receber lead" é um subconjunto de
// "de plantão") — o gerente lia o mesmo nome duas vezes e não sabia se eram
// dois problemas ou um.
//
// A coluna que importa é "Situação": ela responde, em palavras, por que aquela
// pessoa não está recebendo lead. Três coisas precisam ser verdade — bateu
// ponto, chip vivo, gerente autorizou — e quando uma falha o lead some sem que
// ninguém saiba qual foi.
//
// O check-in vem da Cury; é a única informação do sistema que prova que a
// pessoa foi trabalhar.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sec, Panel, ScoreRow, Cell, Tbl, Tr, Mini, Blank } from "@/components/manager-v10/ui";
import { useAoVivo, definirRecebeLead, type PessoaAoVivo } from "@/hooks/useAoVivo";

type Situacao = { texto: string; tom: "grave" | "morno" | "ok"; ordem: number };

/** Uma frase por pessoa. A ordem é a urgência: quanto menor, mais em cima. */
function situacao(p: PessoaAoVivo): Situacao {
  const veio = p.checkins > 0;

  if (veio && !p.chipVivo) {
    return {
      texto: p.chipEstado === "logged_out"
        ? "veio trabalhar · chip deslogado, precisa ler o QR"
        : p.botInstanceId ? "veio trabalhar · chip fora do ar" : "veio trabalhar · sem chip",
      tom: "grave", ordem: 0,
    };
  }
  if (veio && !p.recebeLead) {
    return { texto: "veio trabalhar · fora do rodízio de leads", tom: "grave", ordem: 1 };
  }
  if (veio) {
    return { texto: "trabalhando e recebendo lead", tom: "ok", ordem: 2 };
  }
  if (p.recebeLead && !p.chipVivo) {
    return { texto: "sem ponto hoje · e o chip está parado", tom: "morno", ordem: 3 };
  }
  return { texto: "sem ponto hoje", tom: "morno", ordem: 4 };
}

const COLS = "minmax(130px,1.4fr) minmax(200px,1.8fr) 56px 56px 56px 92px";

export default function AoVivo({ managerId }: { managerId: string | undefined }) {
  const { data, isLoading } = useAoVivo(managerId);
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function alternar(p: PessoaAoVivo) {
    if (!p.profileId) return;
    const novo = !p.recebeLead;
    setOcupado(p.profileId);
    try {
      await definirRecebeLead(p.profileId, novo);
      toast.success(novo
        ? `${p.apelido || p.nome} entrou no rodízio de leads`
        : `${p.apelido || p.nome} saiu do rodízio`);
      qc.invalidateQueries({ queryKey: ["ao-vivo"] });
    } catch (e: any) {
      toast.error(`Não consegui alterar: ${e?.message ?? e}`);
    } finally {
      setOcupado(null);
    }
  }

  if (isLoading) return <Blank title="Carregando o plantão de hoje…" />;

  if (!data?.gerenteCuryId) {
    return (
      <Blank title="Seu cadastro ainda não foi ligado ao da Cury">
        Sem esse vínculo eu não sei qual equipe mostrar. É um ajuste feito
        uma vez só — peça para o administrador.
      </Blank>
    );
  }

  const { emPlantao, semCadastro, ausentes, totais, atualizadoEm } = data;

  // Uma lista só. Quem veio e está travado em cima; quem não veio, embaixo.
  const todos = [...emPlantao, ...ausentes]
    .map((p) => ({ p, s: situacao(p) }))
    .sort((a, b) => a.s.ordem - b.s.ordem
      || b.p.visitas - a.p.visitas
      || (a.p.apelido || "").localeCompare(b.p.apelido || ""));

  const travados = todos.filter((x) => x.s.tom === "grave").length;

  const hora = atualizadoEm
    ? new Date(atualizadoEm).toLocaleTimeString("pt-BR",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;

  return (
    <section className="view">
      <Sec
        title="Hoje, agora"
        tag={hora ? <span className="dim">atualizado {hora}</span> : null}
        sub="Check-in, visita e venda vêm do app da Cury — é o que a operação fez, não o que foi digitado aqui."
      >
        <ScoreRow>
          <Cell label="Vieram trabalhar" value={emPlantao.length}
                sub={`de ${emPlantao.length + ausentes.length} no time`} />
          <Cell label="Travados" value={travados}
                tone={travados > 0 ? "alert" : "good"}
                sub={travados ? "vieram e não recebem lead" : "ninguém parado"} />
          <Cell label="Visitas" value={totais.visitas}
                tone={totais.visitas === 0 ? "alert" : "good"} />
          <Cell label="Vendas" value={totais.vendas}
                tone={totais.vendas > 0 ? "good" : undefined} />
        </ScoreRow>
      </Sec>

      <Sec
        title="O time hoje"
        sub={travados > 0
          ? "Quem veio trabalhar e está travado aparece primeiro — cada um é capacidade parada agora."
          : undefined}
      >
        <Panel>
          {todos.length === 0 ? (
            <Blank title="Nenhum corretor nesta equipe" />
          ) : (
            <Tbl cols={COLS} head={["Corretor", "Situação", "Ponto", "Vis.", "Vend.", ""]}>
              {todos.map(({ p, s }) => (
                <Tr key={p.profileId || p.curyId} cols={COLS}>
                  <span className="nmc">
                    <span className={`dot ${s.tom === "ok" ? "on" : "off"}`} />
                    <b>{p.apelido || p.nome}</b>
                  </span>
                  <span className={s.tom === "grave" ? "hot" : s.tom === "ok" ? "win" : "dim"}>
                    {s.texto}
                  </span>
                  <span className="num">{p.checkins || "—"}</span>
                  <span className="num">{p.visitas || "—"}</span>
                  <span className="num">{p.vendas || "—"}</span>
                  <span>
                    {p.profileId ? (
                      <Mini
                        variant={p.recebeLead ? undefined : "solid"}
                        disabled={ocupado === p.profileId}
                        onClick={() => alternar(p)}
                        title={p.recebeLead ? "Tirar do rodízio" : "Colocar no rodízio"}
                      >
                        {p.recebeLead ? "no rodízio" : "ligar"}
                      </Mini>
                    ) : null}
                  </span>
                </Tr>
              ))}
            </Tbl>
          )}
        </Panel>
      </Sec>

      {/* Forma diferente das outras linhas: aqui não há o que ligar, há o que
          cadastrar. Por isso continua separado. */}
      {semCadastro.length > 0 && (
        <Sec
          title="Trabalhando sem cadastro no Comandra"
          tag={<span className="bad">{semCadastro.length}</span>}
          sub="Batem ponto na Cury e não têm login aqui — não recebem lead nem entram na cobrança individual."
        >
          <Panel>
            <Tbl cols="minmax(130px,1.4fr) minmax(200px,1.8fr) 56px 56px 92px"
                 head={["Na Cury", "Nome completo", "Vis.", "Vend.", ""]}>
              {semCadastro.map((p) => (
                <Tr key={p.curyId} cols="minmax(130px,1.4fr) minmax(200px,1.8fr) 56px 56px 92px">
                  <span className="nmc"><b>{p.apelido || "—"}</b></span>
                  <span className="dim">{p.nome || "—"}</span>
                  <span className="num">{p.visitas || "—"}</span>
                  <span className="num">{p.vendas || "—"}</span>
                  <span>
                    <Mini variant="solid"
                          onClick={() => toast.info("Cadastro pela tela chega no próximo passo.")}>
                      criar login
                    </Mini>
                  </span>
                </Tr>
              ))}
            </Tbl>
          </Panel>
        </Sec>
      )}
    </section>
  );
}
