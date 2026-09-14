// AO VIVO — quem está de plantão hoje e o que já produziu.
//
// O dado vem da Cury (check-in, atendimento, venda), sincronizado pelo job do
// VPS. É a única fonte que PROVA que a pessoa foi trabalhar: tudo o mais no
// Comandra depende de alguém marcar alguma coisa, e ninguém marca.
//
// A tela SUGERE e o gerente decide (decisão do Junior, 14/09). Ligar o rodízio
// sozinho distribuiria lead pra quem ele não conferiu.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sec, Panel, ScoreRow, Cell, Tbl, Tr, Mini, Blank } from "@/components/manager-v10/ui";
import { useAoVivo, definirRecebeLead, type PessoaAoVivo } from "@/hooks/useAoVivo";

/** Por que essa pessoa não está recebendo lead? A resposta em uma frase. */
function porQueTravado(p: PessoaAoVivo): string | null {
  if (!p.profileId) return "sem cadastro no Comandra";
  if (!p.chipVivo) {
    return p.chipEstado === "logged_out"
      ? "chip deslogado — precisa ler o QR"
      : p.botInstanceId ? "chip fora do ar" : "sem chip";
  }
  if (!p.recebeLead) return null;   // só desligado; não é defeito
  return null;
}

function Pessoa({
  p, onAlternar, ocupado,
}: { p: PessoaAoVivo; onAlternar: (p: PessoaAoVivo) => void; ocupado: boolean }) {
  const trava = porQueTravado(p);
  const nome = p.apelido || p.nome || "—";

  return (
    <Tr cols="1.4fr .8fr .8fr .6fr .6fr 1fr">
      <span>
        <b>{nome}</b>
        {p.nome && p.apelido && p.nome !== p.apelido
          ? <i className="dim"> · {p.nome}</i> : null}
      </span>

      <span className={p.checkins > 0 ? "good" : "dim"}>
        {p.checkins > 0 ? `${p.checkins} check-in${p.checkins > 1 ? "s" : ""}` : "sem ponto"}
      </span>

      <span className={p.chipVivo ? "good" : "bad"}>
        {p.chipVivo ? "chip ok" : (trava ?? "chip parado")}
      </span>

      <span className={p.visitas > 0 ? "good" : "dim"}>{p.visitas}</span>
      <span className={p.vendas > 0 ? "good" : "dim"}>{p.vendas}</span>

      <span>
        {p.profileId ? (
          <Mini
            variant={p.recebeLead ? undefined : "solid"}
            disabled={ocupado}
            onClick={() => onAlternar(p)}
            title={p.recebeLead
              ? "Tirar do rodízio de leads"
              : "Colocar no rodízio de leads"}
          >
            {p.recebeLead ? "recebe lead" : "ligar"}
          </Mini>
        ) : null}
      </span>
    </Tr>
  );
}

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
      const nome = p.apelido || p.nome;
      toast.success(novo
        ? `${nome} entrou no rodízio de leads`
        : `${nome} saiu do rodízio`);
      qc.invalidateQueries({ queryKey: ["ao-vivo"] });
    } catch (e: any) {
      toast.error(`Não consegui alterar: ${e?.message ?? e}`);
    } finally {
      setOcupado(null);
    }
  }

  if (isLoading) {
    return <Blank title="Carregando o plantão de hoje…" />;
  }

  if (!data?.gerenteCuryId) {
    return (
      <Blank title="Seu cadastro ainda não foi ligado ao da Cury">
        Sem esse vínculo eu não sei qual equipe mostrar aqui. É um ajuste de
        cadastro, feito uma vez só — peça para o administrador ligar seu perfil.
      </Blank>
    );
  }

  const { emPlantao, semCadastro, ausentes, totais, atualizadoEm } = data;
  const semLead = emPlantao.filter((p) => !p.recebeLead || !p.chipVivo);

  const hora = atualizadoEm
    ? new Date(atualizadoEm).toLocaleTimeString("pt-BR",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;

  return (
    <section className="view">
      <Sec
        title="Ao vivo"
        tag={hora ? <span className="dim">atualizado {hora}</span> : null}
        sub="Check-in, visita e venda vêm do app da Cury. É o que a operação fez hoje, não o que foi digitado aqui."
      >
        <ScoreRow>
          <Cell label="De plantão" value={emPlantao.length}
                sub={`${totais.checkins} check-in${totais.checkins === 1 ? "" : "s"}`} />
          <Cell label="Visitas hoje" value={totais.visitas}
                tone={totais.visitas === 0 ? "alert" : "good"} />
          <Cell label="Vendas hoje" value={totais.vendas}
                tone={totais.vendas > 0 ? "good" : undefined} />
          <Cell label="Trabalhando sem receber lead" value={semLead.length}
                tone={semLead.length > 0 ? "alert" : undefined}
                sub={semLead.length ? "bateram ponto e estão fora do rodízio" : "ninguém parado"} />
        </ScoreRow>
      </Sec>

      {/* O grupo que justifica a tela: gente que foi trabalhar e não recebe lead. */}
      {semLead.length > 0 && (
        <Sec
          title="Foram trabalhar e não estão recebendo lead"
          sub="Cada um destes é capacidade parada agora."
        >
          <Panel>
            <Tbl
              cols="1.4fr .8fr .8fr .6fr .6fr 1fr"
              head={["Corretor", "Ponto", "Chip", "Vis.", "Vend.", ""]}
            >
              {semLead.map((p) => (
                <Pessoa key={p.curyId || p.profileId!} p={p}
                        onAlternar={alternar} ocupado={ocupado === p.profileId} />
              ))}
            </Tbl>
          </Panel>
        </Sec>
      )}

      <Sec title="De plantão hoje" tag={<span className="dim">{emPlantao.length}</span>}>
        <Panel>
          {emPlantao.length === 0 ? (
            <Blank title="Ninguém bateu ponto ainda hoje">
              O check-in é sincronizado a cada 30 minutos no horário comercial.
            </Blank>
          ) : (
            <Tbl
              cols="1.4fr .8fr .8fr .6fr .6fr 1fr"
              head={["Corretor", "Ponto", "Chip", "Vis.", "Vend.", ""]}
            >
              {emPlantao.map((p) => (
                <Pessoa key={p.curyId} p={p}
                        onAlternar={alternar} ocupado={ocupado === p.profileId} />
              ))}
            </Tbl>
          )}
        </Panel>
      </Sec>

      {/* Bateu ponto na Cury e não existe aqui — o gerente cria o login. */}
      {semCadastro.length > 0 && (
        <Sec
          title="Trabalhando sem cadastro no Comandra"
          tag={<span className="bad">{semCadastro.length}</span>}
          sub="Estão batendo ponto na Cury mas não têm login aqui, então não recebem lead nem aparecem na cobrança individual."
        >
          <Panel>
            <Tbl cols="1.4fr 1.6fr .6fr .6fr 1fr"
                 head={["Nome na Cury", "Nome completo", "Vis.", "Vend.", ""]}>
              {semCadastro.map((p) => (
                <Tr key={p.curyId} cols="1.4fr 1.6fr .6fr .6fr 1fr">
                  <span><b>{p.apelido || "—"}</b></span>
                  <span className="dim">{p.nome || "—"}</span>
                  <span>{p.visitas}</span>
                  <span>{p.vendas}</span>
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

      {ausentes.length > 0 && (
        <Sec title="Sem ponto hoje" tag={<span className="dim">{ausentes.length}</span>}>
          <Panel>
            <Tbl
              cols="1.4fr .8fr .8fr .6fr .6fr 1fr"
              head={["Corretor", "Ponto", "Chip", "Vis.", "Vend.", ""]}
            >
              {ausentes.map((p) => (
                <Pessoa key={p.profileId!} p={p}
                        onAlternar={alternar} ocupado={ocupado === p.profileId} />
              ))}
            </Tbl>
          </Panel>
        </Sec>
      )}
    </section>
  );
}
