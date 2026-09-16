// TEMPO REAL — o estado de hoje da equipe.
//
// Abre filtrado em quem está de plantão, porque é com essa gente que dá para
// fazer alguma coisa agora. O filtro fica visível e com um ✕: sem isso o
// gerente acha que o time inteiro tem 26 pessoas.
//
// A ordem é online primeiro, e dentro dos online por gravidade. Quem está
// crítico e offline não se perde — aparece na fila do "Precisa de você".
//
// Duas decisões que valem o comentário:
//   · a tarja de gravidade é grossa e o online é um ponto pequeno. Alguém pode
//     estar verde e crítico ao mesmo tempo, e a gravidade tem que ganhar o olho;
//   · o "?" abre DENTRO do card. Balãozinho ancorado num ícone de 16px vaza da
//     tela no celular e abre no lugar errado.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTempoReal, definirRecebimento, status,
         type Pessoa, type Nivel, type Origem } from "@/hooks/useTempoReal";
import { Sec, Panel, Blank } from "@/components/manager-v10/ui";
import MetaSemana from "@/components/manager-v10/MetaSemana";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { usePeriodo } from "@/hooks/usePeriodo";
import FunilOrigem from "@/components/manager-v10/FunilOrigem";
import PrecisaDeVoce from "@/components/manager-v10/PrecisaDeVoce";

const NIVEIS: { n: Nivel; rot: string }[] = [
  { n: "crit", rot: "Crítico" }, { n: "trav", rot: "Travado" },
  { n: "warn", rot: "Atenção" }, { n: "ok", rot: "Normal" },
];
const ORIGENS: { k: Origem; rot: string }[] = [
  { k: "anuncio", rot: "Anúncio" }, { k: "disparo", rot: "Disparo" },
  { k: "repescagem", rot: "Repescagem" }, { k: "propria", rot: "Própria" },
];
const ORDEM: Record<Nivel, number> = { crit: 0, trav: 1, warn: 2, ok: 3 };
const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();

function Carteira({ p, largo }: { p: Pessoa; largo?: boolean }) {
  const t = p.carteira || 1;
  return (
    <span className={`tr-cart${largo ? " largo" : ""}`}>
      {ORIGENS.map((o) => (
        <i key={o.k} className={`o-${o.k}`} style={{ width: `${(p.porOrigem[o.k] / t) * 100}%` }} />
      ))}
    </span>
  );
}

function Chave({ p, onToggle, ocupado }: {
  p: Pessoa; onToggle: () => void; ocupado: boolean;
}) {
  if (!p.profileId) return null;
  const on = p.recebeLead;
  return (
    <button
      type="button"
      className={`tr-sw${on ? " on" : ""}`}
      data-src={p.fonteRodizio ?? ""}
      disabled={ocupado}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={on ? "Tirar do recebimento de lead" : "Colocar no recebimento de lead"}
    >
      <span className="tr-sw-d"><i /></span>
      <span className="tr-sw-t">
        {on ? "recebe lead" : "não recebe"}
        <em>{p.fonteRodizio === "plantao" ? "pelo plantão"
           : p.fonteRodizio === "gerente" ? "por você" : "desligado"}</em>
      </span>
    </button>
  );
}

export default function TempoReal({ managerId }: { managerId: string | undefined }) {
  const { periodo } = usePeriodo();
  // Tempo real mostra UM dia — quando o período é um intervalo, o dia é o fim dele.
  const { data, isLoading } = useTempoReal(managerId, periodo.ate);
  const qc = useQueryClient();
  const [soPlantao, setSoPlantao] = useState(true);
  const [filtro, setFiltro] = useState<Nivel | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (isLoading) return <Blank title="Carregando o plantão de hoje…" />;

  if (!data?.gerenteCuryId) {
    return (
      <Blank title="Seu cadastro ainda não foi ligado ao da Cury">
        Sem esse vínculo eu não sei qual equipe mostrar. É um ajuste feito uma
        vez só — peça para o administrador.
      </Blank>
    );
  }

  async function alternar(p: Pessoa) {
    if (!p.profileId) return;
    const novo = !p.recebeLead;
    setOcupado(p.profileId);
    try {
      await definirRecebimento(p.profileId, novo);
      toast.success(novo ? `${p.apelido ?? p.nome} passou a receber lead`
                         : `${p.apelido ?? p.nome} parou de receber lead`);
      qc.invalidateQueries({ queryKey: ["tempo-real"] });
    } catch (e: any) {
      toast.error(`Não consegui alterar: ${e?.message ?? e}`);
    } finally { setOcupado(null); }
  }

  const { gente, totais, atualizadoEm } = data;
  const contagem = gente.reduce<Record<string, number>>((a, p) => {
    const n = status(p).nivel; a[n] = (a[n] ?? 0) + 1; return a;
  }, {});

  const lista = gente
    .map((p) => ({ p, st: status(p) }))
    .filter(({ p, st }) => (!soPlantao || p.ponto) && (!filtro || st.nivel === filtro))
    .sort((a, b) =>
      (b.p.online ? 1 : 0) - (a.p.online ? 1 : 0)
      || ORDEM[a.st.nivel] - ORDEM[b.st.nivel]
      || b.p.atendimentos - a.p.atendimentos
      || (a.p.apelido ?? "").localeCompare(b.p.apelido ?? ""));

  const hora = atualizadoEm
    ? new Date(atualizadoEm).toLocaleTimeString("pt-BR",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;

  return (
    <section className="view tr">
      <Sec
        title={periodo.preset === "hoje" || periodo.ate === new Date().toISOString().slice(0, 10)
          ? "Hoje, agora" : `O dia ${periodo.ate.split("-").reverse().slice(0, 2).join("/")}`}
        tag={<span className="dim">{hora ? `atualizado ${hora}` : ""}</span>}
        sub="Ponto, atendimento, venda e lead perdido vêm do app da Cury — é o que a operação fez, não o que foi digitado aqui."
      >
        {/* A meta é um card na MESMA fileira dos números, não um bloco acima:
            ela é a pergunta e eles são o estado — lado a lado a leitura é uma só. */}
        <div className="tr-pulso">
          <MetaSemana managerId={managerId} gerenteCuryId={data.gerenteCuryId} />
          <div className="tr-kpi">
            <span className="tag">No plantão</span>
            <b>{totais.plantao}</b>
            <i><em className="win">{totais.online}</em> online agora · {gente.length} no time</i>
          </div>
          <div className="tr-kpi">
            <span className="tag">Atendimentos</span>
            <b className={totais.atendimentos > 0 ? "win" : ""}>{totais.atendimentos}</b>
            <i>hoje</i>
          </div>
          <div className="tr-kpi">
            <span className="tag">Leads perdidos</span>
            <b className={totais.perdidos > 0 ? "hot" : ""}>{totais.perdidos}</b>
            <i>expiraram sem atendimento</i>
          </div>
        </div>
      </Sec>

      <FunilOrigem managerId={managerId} gerenteCuryId={data.gerenteCuryId} />

      <Sec title="Os corretores" tag={<span className="dim">
        {lista.length} {soPlantao ? "no plantão" : "no time"} · {totais.online} online
      </span>}>
        <div className="tr-filtros">
          <button type="button"
            className={`tr-fl work${soPlantao ? " on" : ""}`}
            aria-pressed={soPlantao}
            onClick={() => setSoPlantao((v) => !v)}>
            Trabalhando hoje <b>{totais.plantao}</b>{soPlantao ? <span className="x">✕</span> : null}
          </button>
          <span className="tr-fsep" />
          {NIVEIS.map((n) => (
            <button key={n.n} type="button"
              className={`tr-fl n-${n.n}${filtro === n.n ? " on" : ""}`}
              aria-pressed={filtro === n.n}
              onClick={() => setFiltro((v) => (v === n.n ? null : n.n))}>
              <s /> {n.rot} <b>{contagem[n.n] ?? 0}</b>
            </button>
          ))}
        </div>

        <Panel>
          {lista.length === 0 ? (
            <Blank title={soPlantao ? "Ninguém bateu ponto ainda hoje" : "Nenhum corretor nesta equipe"}>
              {soPlantao ? "O plantão é sincronizado a cada 30 minutos no horário comercial." : null}
            </Blank>
          ) : lista.map(({ p, st }) => {
            const id = p.profileId ?? p.curyId!;
            return (
              <div key={id} className={`tr-item n-${st.nivel}${aberto === id ? " pq" : ""}`}>
                <div className="tr-row" role="button" tabIndex={0}
                  onClick={() => setAberto((v) => (v === id ? null : id))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); setAberto((v) => (v === id ? null : id)); } }}>
                  <span className="tr-av">{ini(p.apelido ?? p.nome)}</span>

                  <span className="tr-nm">
                    <b>{p.apelido ?? p.nome}</b>
                    {p.profileId ? (
                      <span className="tr-cw">
                        <Carteira p={p} />
                        <span>{p.carteira} leads</span>
                      </span>
                    ) : <span className="tr-cw"><span>sem cadastro no Comandra</span></span>}
                  </span>

                  <span className={`tr-trab${p.ponto ? "" : " faltou"}`}>
                    <b>{p.ponto ? "Trabalhando" : "Faltou"}</b>
                    <s className={p.online ? "on" : "off"}><em />{p.online ? "online" : "offline"}</s>
                  </span>

                  <Chave p={p} onToggle={() => alternar(p)} ocupado={ocupado === p.profileId} />

                  <span className="tr-badge">
                    {st.rotulo}
                    <i aria-hidden="true">?</i>
                  </span>

                  <span className="tr-mini">
                    <span className={p.pegos ? "" : "z"}><b>{p.pegos}</b><i>pegos</i></span>
                    <span className={p.atendimentos ? "" : "z"}><b>{p.atendimentos}</b><i>atend</i></span>
                    <span className={p.perdidos ? "h" : "z"}><b>{p.perdidos}</b><i>perd</i></span>
                  </span>

                  <span className="tr-acao">
                    <button type="button" className={`mini${st.nivel === "crit" || st.nivel === "trav" ? " solid" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toast.info(`${st.acao} — em construção`); }}>
                      {st.acao}
                    </button>
                  </span>
                </div>

                <div className="tr-pq"><div className="tr-pq-in">
                  <div className="tr-pq-c">
                    <h4>Por que {st.rotulo.toLowerCase()}</h4>
                    <p>{st.porque}</p>
                    <ul>{st.regra.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    {p.profileId && p.carteira > 0 ? (
                      <div className="tr-orig">
                        <Carteira p={p} largo />
                        <div className="tr-orig-l">
                          {ORIGENS.filter((o) => p.porOrigem[o.k] > 0).map((o) => (
                            <span key={o.k}><s className={`o-${o.k}`} />{o.rot} <b>{p.porOrigem[o.k]}</b></span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div></div>
              </div>
            );
          })}
        </Panel>
      </Sec>

      <PrecisaDeVoce gente={gente} managerId={managerId} />
    </section>
  );
}
