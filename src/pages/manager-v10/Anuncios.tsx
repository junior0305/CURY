// ANÚNCIOS — de onde vem o lead e quanto custa.
//
// O gerente não mexe em campanha: tudo aqui termina em cobrar quem cuida do
// tráfego, mudar onde ele põe a equipe, ou nada. Por isso não tem CTR, CPM,
// frequência nem criativo — ele não tem acesso ao Meta.
//
// O número principal mente se não separar o bloqueado: "chegaram 66" parece
// bom até você ver que 12 tinham DDD de fora e foram barrados — e já foram
// pagos.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useAnuncios, salvarGestor } from "@/hooks/useAnuncios";
import { useContaFacebook } from "@/hooks/useContaFacebook";
import { Sec, Blank } from "@/components/manager-v10/ui";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { usePeriodo } from "@/hooks/usePeriodo";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

export default function Anuncios() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const qc = useQueryClient();
  const { periodo } = usePeriodo();
  const { data, isLoading } = useAnuncios(userId, periodo);
  const { data: fb } = useContaFacebook(userId, periodo);
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");

  loadFonts();

  const corpo = () => {
    if (isLoading) return <Blank title="Carregando os anúncios…" />;
    if (!data) return null;

    const { chegaram, usaveis, bloqueados, responderam, perdidoBloqueio, porDia,
            custo, meuCpl, mediaOutros, campanhas, produtos, capi,
            visitasReais, vendasReais, avisos, gestor } = data;

    const maxDia = Math.max(1, ...porDia.map((d) => d.n));
    const maxCusto = Math.max(1, ...custo.map((c) => c.cpl));
    const quantasVezes = meuCpl && mediaOutros ? (meuCpl / mediaOutros) : null;

    async function guardar() {
      if (!nome.trim() || !tel.trim()) { toast.error("Preencha nome e telefone."); return; }
      try {
        await salvarGestor(userId!, nome.trim(), tel.trim());
        toast.success("Contato salvo.");
        setEditando(false);
        qc.invalidateQueries({ queryKey: ["anuncios"] });
      } catch (e: any) { toast.error(`Não consegui salvar: ${e?.message ?? e}`); }
    }

    // A conta que a tela existia para não mostrar: o Facebook cobrou por N e
    // chegaram M. Sem isto, gastar e não receber é indistinguível de não
    // anunciar — as duas coisas aparecem como tela vazia.
    const sumiram = fb && !fb.semConta ? Math.max(0, fb.leads - chegaram) : 0;
    const perdido = fb?.cpl ? sumiram * fb.cpl : 0;

    return (
      <>
        {/* 0 · a conta no Facebook, lida na fonte */}
        <Sec title="Sua conta no Facebook"
          tag={<span className="dim">{fb?.conta ?? periodo.rotulo}</span>}
          sub="Lido direto na sua conta de anúncio, não no que chegou aqui. É o único jeito de ver dinheiro saindo sem lead entrando.">
          {!fb ? (
            <Blank title="Consultando o Facebook…" />
          ) : fb.semConta ? (
            <Blank title="Não consegui ler a sua conta de anúncio">
              {fb.motivo ?? "Nenhuma conta ligada a este login."}
            </Blank>
          ) : (
            <>
              <div className="score-row">
                <div className="cell">
                  <span className="tag">gastou</span>
                  <b>{brl(fb.gasto)}</b>
                  <i>{fb.ativas} campanha{fb.ativas === 1 ? "" : "s"} ativa{fb.ativas === 1 ? "" : "s"}</i>
                </div>
                <div className="cell">
                  <span className="tag">leads no Facebook</span>
                  <b>{fb.leads}</b>
                  <i>{fb.cpl ? `${brl(fb.cpl)} cada` : "—"}</i>
                </div>
                <div className="cell">
                  <span className="tag">chegaram aqui</span>
                  <b>{chegaram}</b>
                  <i>{fb.leads ? `${Math.round((chegaram / fb.leads) * 100)}% do que foi pago` : "—"}</i>
                </div>
                <div className={`cell${sumiram ? " alert" : ""}`}>
                  <span className="tag">não chegaram</span>
                  <b>{sumiram}</b>
                  <i>{perdido ? `cerca de ${brl(perdido)}` : "nenhum perdido"}</i>
                </div>
              </div>

              {sumiram > 0 ? (
                <div className="an-aviso crit" style={{ marginTop: 16 }}>
                  <div>
                    <b>O Facebook cobrou por {fb.leads} e chegaram {chegaram}.</b>
                    {" "}Os outros {sumiram} foram pagos e não caíram na mão de nenhum
                    corretor — cerca de {brl(perdido)}. Isso é falha de integração entre
                    o formulário e o Comandra, não qualidade de lead: eles nem chegaram
                    a ser recusados.
                  </div>
                </div>
              ) : null}

              {fb.saldo ? (
                <p className="sec-sub" style={{ marginTop: 14 }}>
                  {fb.saldo}{fb.prePago
                    ? " — é saldo pré-pago de anúncio, e ele não paga disparo de WhatsApp."
                    : "."}
                </p>
              ) : null}

              {fb.campanhas.length ? (
                <div className="an-campfb">
                  <div className="an-cfb cab">
                    <b>campanha</b><span>gasto</span><span>Facebook</span>
                    <span>chegaram</span><span>por lead</span>
                  </div>
                  {/* As ativas primeiro: é sobre elas que se decide hoje. */}
                  {[...fb.campanhas].sort((a, b) =>
                    (b.ativa ? 1 : 0) - (a.ativa ? 1 : 0) || b.leads - a.leads
                  ).slice(0, 12).map((c) => (
                    <div className="an-cfb" key={c.id ?? c.nome}>
                      <b>{c.ativa ? <i className="pip-on" title="campanha ativa" /> : null}{c.nome}</b>
                      <span className="mono">{brl(c.gasto)}</span>
                      <span className="mono">{c.leads} no Face</span>
                      {/* A conferência campanha a campanha: cobrado × chegado. */}
                      <span className={`mono${c.leads > c.chegaram ? " ruim" : ""}`}>
                        {c.chegaram} aqui
                      </span>
                      <span className="mono">{c.cpl ? brl(c.cpl) : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Sec>

        {/* 1 · quantos chegaram — e quantos você pode usar */}
        <Sec title="Quantos leads chegaram" tag={<span className="dim">{periodo.rotulo}</span>}>
          <div className="an-box an-ent">
            <div>
              <div className="an-n"><b className="mono">{chegaram}</b>
                <span>leads chegaram {periodo.rotulo}</span></div>
              <div className="an-corta">
                <span className="an-ct ok"><b>{usaveis}</b>você pode usar</span>
                {bloqueados > 0 && (
                  <span className="an-ct bad"><b>{bloqueados}</b>bloqueados: telefone de outro estado</span>
                )}
                <span className="an-ct"><b>{responderam}</b>responderam</span>
              </div>
              {bloqueados > 0 && (
                <p className="an-say">
                  Os {bloqueados} bloqueados têm DDD de fora de São Paulo. O sistema barra sozinho,
                  mas <b>o anúncio já foi pago</b>
                  {perdidoBloqueio ? <> — são <b>{brl(perdidoBloqueio)}</b> que não viraram nada</> : null}.
                </p>
              )}
            </div>
            <div>
              <div className="an-linha">
                {porDia.map((d) => (
                  <i key={d.dia} className={d.n ? "" : "zero"}
                     style={{ height: d.n ? `${Math.max(4, (d.n / maxDia) * 100)}%` : "3px" }}
                     title={`${d.dia}: ${d.n} lead${d.n === 1 ? "" : "s"}`} />
                ))}
              </div>
              <div className="an-linha-l"><span>{periodo.de.split("-").reverse().slice(0,2).join("/")}</span><span>{periodo.ate.split("-").reverse().slice(0,2).join("/")}</span></div>
            </div>
          </div>
        </Sec>

        {/* 2 · quanto você paga */}
        {custo.length > 1 && (
          <Sec title="Quanto você paga por lead" tag={<span className="dim">comparado com as outras equipes</span>}>
            <div className="an-box">
              <div className="an-cst">
                {custo.map((c) => (
                  <div key={c.equipe} className={`an-cr${c.eu ? " eu" : ""}`}>
                    <span>{c.equipe}{c.eu ? " (você)" : ""}</span>
                    <span className="bar"><i style={{ width: `${(c.cpl / maxCusto) * 100}%` }} /></span>
                    <span className="v">{brl(c.cpl)}</span>
                  </div>
                ))}
              </div>
              {quantasVezes && quantasVezes > 1.3 && (
                <p className="an-say">
                  Você paga <b>{quantasVezes.toFixed(1).replace(".", ",")} vezes mais</b> que a média
                  das outras equipes pelo mesmo tipo de lead. Isso não se resolve aqui dentro — mas
                  com esse número o gestor de tráfego consegue agir.
                </p>
              )}
            </div>
          </Sec>
        )}

        {/* 3 · qual campanha traz lead que responde */}
        {campanhas.length > 0 && (
          <Sec title="Qual campanha traz lead que responde"
               tag={<span className="dim">responder é o único sinal limpo de qualidade</span>}>
            <div className="an-box">
              <div className="an-cp">
                {campanhas.map((c) => (
                  <div key={c.nome} className={`an-cpr ${c.resp >= 70 ? "alta" : c.resp < 35 ? "baixa" : ""}`}>
                    <b>{c.nome}</b>
                    <span className="q">{c.leads} leads</span>
                    <span className="bar"><i style={{ width: `${c.resp}%` }} /></span>
                    <span className="pc">{c.resp}%</span>
                  </div>
                ))}
              </div>
              <p className="an-say">
                A régua aqui é só a resposta. "Qualificados" e "renda preenchida" medem o
                <b> formulário</b>, não o lead — foi por aí que o time já concluiu que uma região
                era ruim quando ela respondia igual às outras.
              </p>
            </div>
          </Sec>
        )}

        {/* 4 · de onde vem */}
        {produtos.length > 0 && (
          <Sec title="De onde vem o lead" tag={<span className="dim">por empreendimento</span>}>
            <div className="an-box">
              <div className="an-emp">
                {produtos.map((p) => (
                  <div key={p.nome} className="an-er">
                    <b>{p.nome}</b>
                    <span className="n mono">{p.leads} leads</span>
                    <span className="bar">
                      <i style={{ width: `${(p.leads / (produtos[0]?.leads || 1)) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="an-say">
                Lead que chega de um lugar onde ninguém está de plantão se perde por falta de
                gente, não por falta de qualidade. <b>Esse é o único desta tela que você resolve sozinho.</b>
              </p>
            </div>
          </Sec>
        )}

        {/* 5 · o que o sistema faz pelo anúncio */}
        <Sec title="O que o sistema faz pelo seu anúncio">
          <div className="an-box an-capi">
            <div>
              <p className="an-p">
                O Comandra avisa o Facebook toda vez que um cliente seu <b>responde</b>,{" "}
                <b>visita</b> ou <b>compra</b>. É assim que o Facebook aprende a procurar gente
                parecida com quem compra de você, em vez de gente que só preenche formulário.
                {capi.ultimo && (
                  <><br /><br />Está funcionando — o último aviso saiu{" "}
                    <b>{new Date(capi.ultimo).toLocaleString("pt-BR",
                      { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</b>.</>
                )}
              </p>
            </div>
            <div className="an-capin">
              <div className="an-cn"><b className="mono">{capi.enviados}</b>
                <span>clientes seus já foram avisados ao Facebook</span></div>
              <div className={`an-cn${visitasReais > capi.visitas * 2 ? " falta" : ""}`}>
                <b className="mono">{capi.visitas}</b>
                <span>visitas avisadas{visitasReais > capi.visitas * 2
                  ? ` — mas foram ${visitasReais} de verdade` : ""}</span></div>
              <div className={`an-cn${vendasReais > capi.compras * 2 ? " falta" : ""}`}>
                <b className="mono">{capi.compras}</b>
                <span>compras avisadas{vendasReais > capi.compras * 2
                  ? ` — mas foram ${vendasReais} vendas de verdade` : ""}</span></div>
            </div>
          </div>
        </Sec>

        {/* 6 · avisos prontos */}
        <Sec title="O que avisar para o gestor de tráfego"
             tag={avisos.length ? <span className="dim">{avisos.length} coisa{avisos.length > 1 ? "s" : ""}</span> : null}>
          {avisos.length === 0 ? (
            <Blank title="Nada para avisar agora">
              Entrada, custo e qualidade dentro do esperado.
            </Blank>
          ) : (
            <div className="an-av">
              {avisos.map((a) => (
                <div key={a.chave} className={`an-avi t-${a.tom}`}>
                  <div className="an-avr">
                    <span className="an-avt">
                      <b>{a.titulo}</b>
                      <p>{a.corpo}</p>
                      <span className="hip">{a.hipotese}</span>
                    </span>
                    <span>
                      <button className="mini solid" onClick={() => {
                        setAberto(aberto === a.chave ? null : a.chave);
                        setTexto(a.mensagem);
                      }}>
                        {gestor ? `Avisar o ${gestor.nome.split(" ")[0]}` : "Avisar"}
                      </button>
                    </span>
                  </div>
                  {aberto === a.chave && (
                    <div className="an-msg">
                      <div className="an-msgl">A mensagem já vai escrita — ajuste se quiser</div>
                      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
                      <div className="an-msga">
                        <button className="mini solid" onClick={() => {
                          if (!gestor) { toast.error("Cadastre o contato do gestor de tráfego abaixo."); return; }
                          const n = gestor.telefone.replace(/\D/g, "");
                          window.open(`https://wa.me/${n.startsWith("55") ? n : "55" + n}?text=${encodeURIComponent(texto)}`, "_blank");
                        }}>Mandar pelo meu WhatsApp</button>
                        <button className="mini" onClick={() => setAberto(null)}>Cancelar</button>
                        <small>sai do seu número, não do sistema</small>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Sec>

        {/* 7 · o contato */}
        <Sec title="Quem cuida do seu tráfego">
          <div className="an-box">
            {gestor && !editando ? (
              <div className="an-gt">
                <div className="av">{gestor.nome.slice(0, 2).toUpperCase()}</div>
                <div><b>{gestor.nome}</b>
                  <span>{gestor.telefone} · as mensagens saem do seu WhatsApp</span></div>
                <button className="mini" style={{ marginLeft: "auto" }}
                  onClick={() => { setNome(gestor.nome); setTel(gestor.telefone); setEditando(true); }}>
                  Trocar</button>
              </div>
            ) : (
              <div className="an-gtv">
                <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                <input placeholder="11 97777-1234" value={tel} onChange={(e) => setTel(e.target.value)} />
                <button className="mini solid" onClick={guardar}>Salvar</button>
                {gestor && <button className="mini" onClick={() => setEditando(false)}>Cancelar</button>}
              </div>
            )}
          </div>
        </Sec>
      </>
    );
  };

  return (
    <div className="mgr10 app2">
      <RailV10 atual="anuncios" mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Anúncios</h1>
            <p>De onde vem o seu lead e quanto ele custa</p>
          </div>
          <div className="top2-r"><SeletorPeriodo /></div>
        </header>
        <section className="view an">{corpo()}</section>
      </main>
    </div>
  );
}
