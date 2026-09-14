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
import { Sec, Panel, ScoreRow, Cell, Blank } from "@/components/manager-v10/ui";

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
  const { data, isLoading } = useTempoReal(managerId);
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
        title="Hoje, agora"
        tag={hora ? <span className="dim">atualizado {hora}</span> : null}
        sub="Ponto, atendimento, venda e lead perdido vêm do app da Cury — é o que a operação fez, não o que foi digitado aqui."
      >
        <ScoreRow>
          <Cell label="No plantão" value={totais.plantao}
                sub={`${totais.online} com o Comandra aberto · ${gente.length} no time`} />
          <Cell label="Atendimentos" value={totais.atendimentos}
                tone={totais.atendimentos > 0 ? "good" : "alert"} sub="hoje" />
          <Cell label="Vendas" value={totais.vendas}
                tone={totais.vendas > 0 ? "good" : undefined} sub="hoje" />
          <Cell label="Leads perdidos" value={totais.perdidos}
                tone={totais.perdidos > 0 ? "alert" : undefined}
                sub="expiraram sem atendimento" />
        </ScoreRow>
      </Sec>

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
    </section>
  );
}
