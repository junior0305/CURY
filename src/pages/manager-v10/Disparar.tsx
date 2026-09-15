// DISPARAR — falar com muita gente de uma vez, pelo WhatsApp oficial.
//
// Quatro etapas na ordem em que a coisa acontece: o número que envia, as
// mensagens que a Meta aprovou, o disparo, e as respostas. Portada 1:1 do
// protótipo aprovado (scratchpad/disparar.html) — o CSS mora em disparar.css.
//
// Duas decisões que a tela toma por conta e que valem explicar:
//
// 1. As variáveis. A Meta aprova a mensagem UMA vez; depois o conteúdo entre
//    {{ }} muda sem nova aprovação. Por isso o criador detecta as variáveis
//    enquanto se digita e o disparo pede o valor de cada uma — é o que deixa
//    um template só servir Ipiranga, Cambuci e Mooca no mesmo dia.
//
// 2. O destino das respostas. `whatsapp_campaigns.target_queue_id` e
//    `target_broker_id` existiam e nunca eram usados: 34 pessoas responderam
//    a um disparo e 17 ficaram sem retorno. Escolher o destino aqui é
//    obrigatório, não opcional.

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import {
  useDisparar, useMensagens, ajustarImagem, cheiraOferta, checarNome,
  criarTemplate, mandarMensagem, dispararCampanha, type Template,
} from "@/hooks/useDisparar";
import { conectarBM, finalizarConexao } from "@/lib/embeddedSignup";
import { Blank } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";
import "@/styles/disparar.css";

type Etapa = "bm" | "tpl" | "disp" | "conv";
type Destino = "fila" | "escolher";

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
const ini = (s: string) => s.trim().slice(0, 2).toUpperCase();
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) => {
  const d = new Date(iso), h = new Date();
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, h)) return "hoje";
  const o = new Date(h); o.setDate(o.getDate() - 1);
  if (mesmo(d, o)) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
const achaVars = (txt: string) =>
  [...new Set([...txt.matchAll(/\{\{\s*([\wÀ-ÿ]+)\s*\}\}/g)].map((m) => m[1]))];

/* Modelos por tipo. São padrões, não LLM: a forma da mensagem de utilidade
   (retomar algo que a pessoa pediu) e a de marketing (anunciar) são estáveis —
   o que muda é o conteúdo das variáveis, e disso quem cuida é o gerente.
   Gastar token para reescrever a mesma estrutura contraria a disciplina de
   custo do projeto. Cada modelo já vem com exemplo do que entra em cada {{ }}. */
const MODELOS: Record<string, { rotulo: string; corpo: string; ex: Record<string, string> }[]> = {
  UTILITY: [
    { rotulo: "Retomada de cadastro",
      corpo: "Olá {{nome}}, você procurou a gente em {{quando}} sobre o {{empreendimento}}.\n\nSua consulta ficou sem retorno da nossa parte e continua registrada aqui.\n\n{{informacao}}\n\nSe quiser seguir, é só usar o botão abaixo.",
      ex: { quando: "março", empreendimento: "Cidade Lapa — Perdizes",
            informacao: "A condição que você consultou continua disponível." } },
    { rotulo: "Retorno de atendimento",
      corpo: "{{nome}}, aqui é da Cury. Seu atendimento sobre o {{empreendimento}} ficou em aberto com a gente.\n\n{{pendencia}}\n\nQuer que eu retome de onde parou?",
      ex: { empreendimento: "Cambuci", pendencia: "Faltou você nos enviar o comprovante de renda." } },
    { rotulo: "Confirmação de visita",
      corpo: "Olá {{nome}}, confirmando sua visita ao {{empreendimento}} em {{quando}}.\n\nEndereço: {{endereco}}\n\nSe precisar remarcar, é só responder aqui.",
      ex: { empreendimento: "Mooca", quando: "sábado, 10h", endereco: "Rua da Mooca, 1.200" } },
  ],
  MARKETING: [
    { rotulo: "Lançamento",
      corpo: "{{nome}}, acabou de sair o {{empreendimento}}, no {{bairro}}.\n\n{{condicao}}\n\nQuer que eu te mande a planta e os valores?",
      ex: { empreendimento: "Cidade Lapa", bairro: "Perdizes",
            condicao: "Entrada parcelada em até 60 meses." } },
    { rotulo: "Convite para plantão",
      corpo: "Olá {{nome}}! Neste {{quando}} temos plantão de vendas no {{empreendimento}}.\n\n{{beneficio}}\n\nPosso reservar um horário para você?",
      ex: { quando: "sábado", empreendimento: "Ipiranga",
            beneficio: "Simulação de financiamento na hora, com a Caixa no local." } },
    { rotulo: "Curta e direta",
      corpo: "{{nome}}, {{oferta}} no {{empreendimento}}. Quer os detalhes?",
      ex: { oferta: "Novas unidades liberadas", empreendimento: "Cambuci" } },
  ],
};
const TIPOS = [
  { k: "UTILITY", rotulo: "Utilidade", nota: "retoma algo que a pessoa pediu", preco: "utility" as const },
  { k: "MARKETING", rotulo: "Marketing", nota: "anuncia algo novo", preco: "marketing" as const },
];

export default function Disparar() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const qc = useQueryClient();
  const { data, isLoading } = useDisparar(userId);

  const [etapa, setEtapa] = useState<Etapa>("bm");
  loadFonts();

  /* ── etapa 1 ── */
  const [nomeExib, setNomeExib] = useState("");

  /* ── etapa 2 · criador ── */
  const [tNome, setTNome] = useState("retomada_cadastro");
  const [tTipo, setTTipo] = useState("UTILITY");
  const [tCorpo, setTCorpo] = useState(MODELOS.UTILITY[0].corpo);
  const [tRod, setTRod] = useState("Cury Vendas · responda SAIR para não receber mais");
  const [b1, setB1] = useState("Quero continuar");
  const [b2, setB2] = useState("Não tenho mais interesse");
  const [img, setImg] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState<string | null>(null);
  const [sugTipo, setSugTipo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [emAnalise, setEmAnalise] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── etapa 3 · disparo ── */
  const [pubs, setPubs] = useState<Set<string>>(new Set());
  const [tplSel, setTplSel] = useState<string>("");
  const [valores, setValores] = useState<Record<string, string>>({
    quando: "março", empreendimento: "Cidade Lapa — Perdizes",
    informacao: "A condição que você consultou continua disponível.",
  });
  const [destino, setDestino] = useState<Destino>("fila");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  /* ── etapa 4 · respostas ── */
  const [thread, setThread] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const { data: msgs } = useMensagens(thread);

  const vars = useMemo(() => achaVars(tCorpo), [tCorpo]);
  const alerta = tTipo === "UTILITY" && cheiraOferta(tCorpo);
  const nomeCheck = nomeExib.trim() ? checarNome(nomeExib) : null;

  const tplAtivo: Template | null =
    data?.templates.find((t) => t.id === tplSel) ??
    data?.templates.find((t) => t.status === "APPROVED" || t.status === "approved") ?? null;

  const preco = (cat: string) =>
    (cat === "UTILITY" ? data?.precos.utility : data?.precos.marketing) ?? 0.3;

  const alvos = useMemo(() => {
    if (!data) return 0;
    return data.publicos.filter((p) => pubs.has(p.chave)).reduce((s, p) => s + p.n, 0);
  }, [data, pubs]);

  async function pegarImagem(f: File | undefined) {
    if (!f) return;
    try {
      const r = await ajustarImagem(f);
      setImg(r.dataUrl);
      setImgInfo(r.mudou
        ? `A imagem foi ajustada sozinha para 1125 × 590, que é o formato que o WhatsApp mostra. A sua original tinha ${r.orig.w} × ${r.orig.h} — ficaria cortada nas laterais.`
        : `Imagem no formato certo (1125 × 590). Nada foi cortado.`);
    } catch (e: any) { toast.error(e?.message ?? "Não consegui ler essa imagem."); }
  }

  async function mandarPraMeta() {
    if (!tNome.trim() || !tCorpo.trim()) { toast.error("Falta o nome ou o texto."); return; }
    setEnviando(true);
    try {
      await criarTemplate({
        name: tNome.trim().toLowerCase().replace(/[^\w]+/g, "_"),
        body_text: tCorpo, category: tTipo, language: "pt_BR",
        header_type: img ? "IMAGE" : "NONE", header_image_url: img,
        footer_text: tRod || null,
        buttons: [b1, b2].filter(Boolean).map((t) => ({ type: "QUICK_REPLY", text: t })),
        variables: vars,
      });
      setEmAnalise(true);
      toast.success("Mandada para a Meta. O resultado aparece na lista acima.");
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) {
      toast.error(`A Meta não aceitou: ${e?.message ?? e}`);
    } finally { setEnviando(false); }
  }

  const [disparando, setDisparando] = useState(false);
  const [conectando, setConectando] = useState(false);

  async function conectar() {
    if (!userId) return;
    if (nomeCheck && !nomeCheck.ok) {
      toast.error("Ajuste o nome de exibição antes — a Meta vai recusar esse.");
      return;
    }
    setConectando(true);
    try {
      const conta = await conectarBM();
      const r = await finalizarConexao(conta, userId, nomeExib.trim());
      if (r.ok) toast.success("Número conectado e liberado para enviar.");
      // Conectar pela metade é pior do que não conectar: o gerente acha que
      // está no ar e o disparo falha depois. O que faltou vai na tela.
      else toast.warning(r.pendencia ?? "Conectou, mas ficou pendência.", { duration: 12000 });
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui conectar.");
    } finally { setConectando(false); }
  }


  async function dispararAgora() {
    if (!data || !userId || !tplAtivo) return;
    const gente = data.publicos.filter((p) => pubs.has(p.chave)).flatMap((p) => p.gente);
    // Uma pessoa pode estar em duas listas; a Meta cobra as duas mensagens.
    const unicos = [...new Map(gente.map((a) => [a.telefone.replace(/\D/g, ""), a])).values()];
    const teto = data.config?.tetoHoje ?? unicos.length;
    const vai = unicos.slice(0, teto);
    const brokers = destino === "escolher" ? [...marcados] : data.corretores.map((c) => c.id);
    if (!brokers.length) { toast.error("Escolha pelo menos um corretor para atender."); return; }

    setDisparando(true);
    try {
      await dispararCampanha({
        managerId: userId, templateId: tplAtivo.id,
        nome: `${tplAtivo.nome} · ${new Date().toLocaleDateString("pt-BR")}`,
        alvos: vai, vars: valores, brokerIds: brokers,
        configId: data.config?.id ?? null,
      });
      toast.success(`Disparo criado para ${vai.length} pessoas. O primeiro lote já saiu.`);
      setPubs(new Set());
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) {
      toast.error(`Não consegui disparar: ${e?.message ?? e}`);
    } finally { setDisparando(false); }
  }

  async function enviarNaConversa() {
    const c = data?.conversas.find((x) => x.id === thread);
    if (!c || !rascunho.trim()) return;
    try {
      await mandarMensagem(c.id, c.telefone, rascunho.trim(), userId!);
      setRascunho("");
      toast.success("Enviada. O corretor vê a mensagem marcada como sua.");
      qc.invalidateQueries({ queryKey: ["wa-msgs", c.id] });
    } catch (e: any) { toast.error(`Não consegui enviar: ${e?.message ?? e}`); }
  }

  /* ── o celular ── */
  const Fone = ({ nome }: { nome: string }) => {
    const corpo = tCorpo.replace(/\{\{\s*([\wÀ-ÿ]+)\s*\}\}/g, (_, v) =>
      v === "nome" ? nome : (valores[v] || `[${v}]`));
    return (
      <div className="fone">
        <div className="fone-top">
          <div className="fone-av">{ini(data?.config?.label ?? "Cury")}</div>
          <div><b>{data?.config?.label ?? "Cury Vendas"}</b><span>conta comercial</span></div>
        </div>
        <div className="fone-corpo">
          <div className="bolha">
            {img ? <img src={img} alt="" /> : <div className="semimg">sem imagem</div>}
            <p>{corpo}</p>
            {tRod ? <span className="rod">{tRod}</span> : null}
            <span className="hora">14:32</span>
          </div>
          <div className="bolha-bt">
            {[b1, b2].filter(Boolean).map((b) => <div className="bt" key={b}>{b}</div>)}
          </div>
        </div>
      </div>
    );
  };

  const corpo = () => {
    if (isLoading) return <Blank title="Carregando o disparador…" />;
    if (!data) return null;
    const d = data;
    const cfg = d.config;

    return (
      <>
        <div className="etapas" role="tablist">
          {([
            ["bm", "Seu número", !!cfg],
            ["tpl", "Mensagens", d.templates.some((t) => t.status === "APPROVED")],
            ["disp", "Disparar", false],
            ["conv", "Respostas", false],
          ] as [Etapa, string, boolean][]).map(([k, rot, feito], i) => (
            <button key={k} role="tab" aria-selected={etapa === k}
              className={`et${etapa === k ? " on" : ""}${feito ? " feito" : ""}`}
              onClick={() => setEtapa(k)}>
              <i>{feito ? "✓" : i + 1}</i>{rot}
            </button>
          ))}
        </div>

        {/* ══ 1 · o número ══ */}
        <div className={`pane${etapa === "bm" ? " on" : ""}`}>
          <div className="sec">
            <div className="sec-h"><h2>O número que envia</h2></div>
            <div className="box bm">
              <div>
                {cfg ? (
                  <>
                    <div className="bm-h">
                      <div className="bm-ic"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg></div>
                      <div>
                        <b>Conectado e liberado para enviar</b>
                        <span>{cfg.label ?? "—"} · verificado pela Meta</span>
                      </div>
                    </div>
                    <div className="bm-l">
                      <div>Número <b>{cfg.displayNumber ?? "—"}</b></div>
                      <div>Conta de negócios <b>{cfg.wabaId ?? "—"}</b></div>
                      <div>Qualidade do número <b><span className="qual">{(cfg.quality ?? "—").toLowerCase()}</span></b></div>
                      <div>Pode enviar por dia <b>{cfg.tetoHoje.toLocaleString("pt-BR")} conversas</b></div>
                      <div>Conectado em <b>{cfg.onboardedEm ? new Date(cfg.onboardedEm).toLocaleDateString("pt-BR") : "—"}</b></div>
                    </div>
                    {cfg.novo ? (
                      <div className="aviso">
                        <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                        <div>Número novo. A Meta libera <b>{cfg.tetoHoje}</b> conversas por dia e
                          sobe o limite sozinha conforme as pessoas respondem bem. Disparar mil de
                          uma vez não acelera nada — derruba a qualidade e o número é restringido.</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="bm-h">
                    <div className="bm-ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                      <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
                    <div>
                      <b>Nenhum número conectado ainda</b>
                      <span>sem isso não dá para disparar — conecte ao lado</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bm-nova">
                <b>Conectar o seu próprio número</b>
                <p>Use a conta da sua equipe e o seu WhatsApp, com o seu dinheiro. Você continua
                  atendendo no mesmo número.</p>
                <div className="f" style={{ marginBottom: 10, textAlign: "left" }}>
                  <label htmlFor="disp-nome">Nome que o cliente vai ver</label>
                  <input id="disp-nome" autoComplete="off" value={nomeExib}
                    onChange={(e) => setNomeExib(e.target.value)} placeholder="Cavalcante" />
                  {nomeCheck ? (
                    <div className={`nome-v ${nomeCheck.ok ? "ok" : "ruim"}`}>
                      <svg viewBox="0 0 24 24">
                        {nomeCheck.ok ? <path d="M20 6L9 17l-5-5" />
                          : <><circle cx="12" cy="12" r="9" /><path d="M12 8.5v5M12 17h.01" /></>}
                      </svg>
                      <div>
                        {nomeCheck.texto}
                        {nomeCheck.sugestao ? (
                          <button className="sug" onClick={() => setNomeExib(nomeCheck.sugestao!)}>
                            {nomeCheck.sugestao}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button className="btn solid" style={{ width: "100%" }}
                  disabled={conectando || !nomeExib.trim()} onClick={conectar}>
                  {conectando ? "Conectando…" : "Conectar com o Facebook"}
                </button>
              </div>
            </div>
          </div>

          <div className="sec">
            <div className="sec-h"><h2>Números da sua equipe</h2><span>cada um dispara pelo seu</span></div>
            <div className="box">
              <div className="bm-lista">
                {cfg ? (
                  <div className="bml">
                    <span className="av">{ini(cfg.label ?? "CV")}</span>
                    <span><b>{cfg.label ?? "—"}</b><i>{cfg.displayNumber ?? "—"}</i></span>
                    <span className="qual">{(cfg.quality ?? "—").toLowerCase()}</span>
                    <span />
                  </div>
                ) : null}
                {d.numeros.map((n) => (
                  <div className="bml" key={n.profileId}>
                    <span className="av">{ini(n.nome)}</span>
                    <span><b>{n.nome}</b><i>{n.config?.displayNumber ?? "ainda não conectou"}</i></span>
                    {n.config
                      ? <span className="qual">{(n.config.quality ?? "—").toLowerCase()}</span>
                      : <span style={{ fontSize: "12.5px", color: "var(--ink-3)" }}>sem número</span>}
                    <span />
                  </div>
                ))}
                {!d.numeros.length && !cfg ? (
                  <p className="vars-n" style={{ margin: 0 }}>Nenhum número na equipe ainda.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* ══ 2 · mensagens ══ */}
        <div className={`pane${etapa === "tpl" ? " on" : ""}`}>
          <div className="sec">
            <div className="sec-h"><h2>Mensagens aprovadas</h2>
              <span>a Meta precisa aprovar antes de você poder disparar</span></div>
            <div className="box">
              <div className="tpl">
                {d.templates.length ? d.templates.map((t) => {
                  const st = (t.status ?? "").toUpperCase();
                  const cls = st === "APPROVED" ? "" : st === "REJECTED" ? " rej"
                    : st === "PENDING" ? " pend" : " rasc";
                  const rot = st === "APPROVED" ? "aprovada" : st === "REJECTED" ? "recusada"
                    : st === "PENDING" ? "em análise" : "rascunho";
                  return (
                    <div className="tplr" key={t.id}>
                      <b>{t.nome}</b>
                      <span className={`st${cls}`}>{rot}</span>
                      <span className="cat">{t.categoria === "UTILITY" ? "Utilidade" : "Marketing"}</span>
                      <span className="prev">{t.corpo.slice(0, 90)}</span>
                      <span>
                        <button className="btn sm" onClick={() => {
                          setTNome(t.nome); setTTipo(t.categoria); setTCorpo(t.corpo);
                          setTRod(t.rodape ?? "");
                          const bs = (t.botoes ?? []).map((b: any) => b?.text ?? "");
                          setB1(bs[0] ?? ""); setB2(bs[1] ?? "");
                          setImg(t.headerImagem ?? null);
                        }}>Usar como base</button>
                      </span>
                    </div>
                  );
                }) : <p className="vars-n" style={{ margin: 0 }}>Nenhuma mensagem ainda. Crie a primeira abaixo.</p>}
              </div>
            </div>
          </div>

          <div className="sec">
            <div className="sec-h"><h2>Criar uma mensagem nova</h2></div>
            <div className="box novo-t">
              <div>
                <div className="ia">
                  <b>Não sabe o que escrever?</b>
                  <p>Escolha o tipo de mensagem e veja três modelos já com variáveis —
                    e com exemplo do que entra em cada uma.</p>
                  <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
                    {TIPOS.map((t) => (
                      <button key={t.k} className={`btn${sugTipo === t.k ? " solid" : ""}`}
                        onClick={() => setSugTipo(sugTipo === t.k ? null : t.k)}>
                        {t.rotulo} · {brl(preco(t.k))}
                      </button>
                    ))}
                  </div>
                  {sugTipo ? (
                    <>
                      <div className="ia-l">
                        {MODELOS[sugTipo].map((m) => (
                          <button key={m.rotulo} className="ia-o" onClick={() => {
                            setTTipo(sugTipo); setTCorpo(m.corpo);
                            setValores((v) => ({ ...v, ...m.ex }));
                            toast.success("Modelo aplicado. Ajuste o texto como quiser.");
                          }}>
                            <b>{m.rotulo}</b>
                            {m.corpo.split("\n")[0]}
                            <span style={{ display: "block", marginTop: 7, fontSize: "12px", color: "var(--ink-3)" }}>
                              {Object.entries(m.ex).map(([k, v]) => `{{${k}}} → ${v}`).join(" · ")}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="custo">
                        {sugTipo === "UTILITY"
                          ? "Utilidade só vale para quem realmente pediu contato. Para quem nunca falou com você, o tipo certo é marketing."
                          : "Marketing custa quase quatro vezes mais, mas pode anunciar o que quiser."}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="f2">
                  <div className="f"><label htmlFor="t-nome">Nome da mensagem</label>
                    <input id="t-nome" value={tNome} onChange={(e) => setTNome(e.target.value)} /></div>
                  <div className="f"><label htmlFor="t-tipo">Tipo</label>
                    <select id="t-tipo" value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
                      {TIPOS.map((t) => (
                        <option key={t.k} value={t.k}>
                          {t.rotulo} — {t.nota} ({brl(preco(t.k))})
                        </option>
                      ))}
                    </select></div>
                </div>

                <div className="f">
                  <label>Imagem do topo</label>
                  <label className={`up${img ? " tem" : ""}`}>
                    {img ? <img src={img} alt="" /> : (
                      <>
                        <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                        <b>Escolher uma imagem</b>
                        <span>do seu computador — nada de link</span>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" hidden
                      onChange={(e) => pegarImagem(e.target.files?.[0])} />
                  </label>
                  <small>Clique para trocar.</small>
                  {imgInfo ? (
                    <div className="img-info ajust">
                      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                      <span>{imgInfo}</span>
                    </div>
                  ) : null}
                </div>

                <div className="f">
                  <label htmlFor="t-corpo">O texto</label>
                  <textarea id="t-corpo" value={tCorpo} onChange={(e) => setTCorpo(e.target.value)} />
                  <small>Escreva <b>{"{{ }}"}</b> onde o conteúdo muda a cada disparo. Cada uma
                    aparece abaixo para você dar nome.</small>
                </div>

                <div className="vars">
                  <div className="vars-l">As variáveis desta mensagem</div>
                  {vars.length ? vars.map((v, i) => (
                    <div className="vr" key={v}>
                      <span className="num">{i + 1}</span>
                      <input value={v} readOnly />
                      <span className="fixo">
                        {v === "nome"
                          ? <><s /> vem do arquivo, junto com o telefone</>
                          : "você preenche na hora do disparo"}
                      </span>
                    </div>
                  )) : (
                    <p className="vars-n" style={{ margin: 0 }}>
                      Nenhuma ainda. Escreva <b>{"{{algumacoisa}}"}</b> no texto.
                    </p>
                  )}
                  <p className="vars-n">
                    A Meta aprova a mensagem <b>uma vez</b>. Depois disso você troca o conteúdo das
                    variáveis quantas vezes quiser, sem passar por aprovação de novo — é o que deixa
                    você disparar no mesmo dia em que decide.
                  </p>
                  {alerta ? (
                    <div className="alerta">
                      <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                      <div><b>Esse texto tem cara de oferta.</b> A Meta reclassifica sozinha e cobra
                        como marketing do mesmo jeito — você fica com o risco e sem a economia.
                        Utilidade é retomar o que a pessoa pediu, sem anunciar nada novo.</div>
                    </div>
                  ) : null}
                </div>

                <div className="f"><label htmlFor="t-rod">Rodapé</label>
                  <input id="t-rod" value={tRod} onChange={(e) => setTRod(e.target.value)} /></div>

                <div className="f2">
                  <div className="f"><label htmlFor="b1">Botão 1</label>
                    <input id="b1" value={b1} onChange={(e) => setB1(e.target.value)} /></div>
                  <div className="f"><label htmlFor="b2">Botão 2</label>
                    <input id="b2" value={b2} onChange={(e) => setB2(e.target.value)} /></div>
                </div>

                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button className="btn solid" disabled={enviando} onClick={mandarPraMeta}>
                    {enviando ? "Mandando…" : "Mandar para aprovação da Meta"}
                  </button>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: "12.5px", color: "var(--ink-3)", lineHeight: 1.55, maxWidth: "58ch" }}>
                  A Meta costuma responder entre alguns minutos e algumas horas. Enquanto não
                  aprovar, a mensagem não pode ser disparada — e você é avisado aqui quando o
                  resultado chegar.
                </p>
                {emAnalise ? (
                  <div className="enviado">
                    <span className="sp" />
                    <div>
                      <b>Mandada para a Meta</b>
                      <p>Ela está em análise. Assim que houver resposta, ela aparece na lista acima —
                        e se for recusada, o motivo vem junto com o que precisa mudar.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <Fone nome="Maria" />
                <p className="fone-leg">É assim que vai chegar no celular da pessoa.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ══ 3 · disparar ══ */}
        <div className={`pane${etapa === "disp" ? " on" : ""}`}>
          <div className="sec">
            <div className="sec-h"><h2>Para quem</h2><span>escolha uma ou mais listas</span></div>
            <div className="box disp">
              <div>
                <div className="pub">
                  {d.publicos.length ? d.publicos.map((p) => (
                    <button key={p.chave} className={`pb${pubs.has(p.chave) ? " on" : ""}`}
                      onClick={() => setPubs((s) => {
                        const n = new Set(s); n.has(p.chave) ? n.delete(p.chave) : n.add(p.chave); return n;
                      })}>
                      <input type="checkbox" readOnly checked={pubs.has(p.chave)} />
                      <span><b>{p.titulo}</b><span>{p.sub}</span></span>
                      <span className="q">{p.n}</span>
                    </button>
                  )) : <p className="vars-n" style={{ margin: 0 }}>Nenhuma lista com gente parada agora.</p>}
                </div>

                <div className="f">
                  <label htmlFor="d-tpl">Qual mensagem</label>
                  <select id="d-tpl" value={tplSel} onChange={(e) => setTplSel(e.target.value)}>
                    <option value="">— escolha —</option>
                    {d.templates.filter((t) => (t.status ?? "").toUpperCase() === "APPROVED").map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} — {t.categoria === "UTILITY" ? "Utilidade" : "Marketing"} · {brl(preco(t.categoria))}
                      </option>
                    ))}
                  </select>
                </div>

                {tplAtivo?.variaveis.length ? (
                  <div className="preench">
                    <div className="preench-l">Preencha as variáveis desta mensagem</div>
                    {tplAtivo.variaveis.map((v) => (
                      <div className="pv" key={v}>
                        <label>{v}</label>
                        {v === "nome" ? (
                          <span className="trava">
                            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                            vem do arquivo — coluna <b className="mono">nome</b>
                          </span>
                        ) : (
                          <input value={valores[v] ?? ""} placeholder="o que entra aqui"
                            onChange={(e) => setValores((s) => ({ ...s, [v]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="f" style={{ marginTop: 18 }}>
                  <label>Quem atende quem responder</label>
                  <div className="dest">
                    <button className={`dst${destino === "fila" ? " on" : ""}`} onClick={() => setDestino("fila")}>
                      <input type="radio" readOnly checked={destino === "fila"} />
                      <span><b>Fila da equipe, na ordem (rodízio)</b>
                        <span>quem estiver na vez recebe, igual a lead de anúncio</span></span>
                    </button>
                    <button className={`dst${destino === "escolher" ? " on" : ""}`} onClick={() => setDestino("escolher")}>
                      <input type="radio" readOnly checked={destino === "escolher"} />
                      <span><b>Corretores que eu escolher</b>
                        <span>divide só entre os marcados abaixo</span></span>
                    </button>
                  </div>
                  {destino === "escolher" ? (
                    <div className="dest-cor">
                      {d.corretores.map((c) => (
                        <label className="dc" key={c.id}>
                          <input type="checkbox" checked={marcados.has(c.id)}
                            onChange={() => setMarcados((s) => {
                              const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n;
                            })} />
                          <span className="av">{ini(c.nome)}</span>
                          <span><b>{c.nome}</b><i>{c.carteira} na carteira</i></span>
                          {c.online ? <span className="on" title="online agora" /> : <span />}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="fluxo">
                  <div className="fluxo-p"><i>1</i><div>A pessoa responde a mensagem.</div></div>
                  <div className="fluxo-p"><i>2</i><div>O sistema <b>cria o lead</b> com a etiqueta
                    <b> levantou a mão no disparo</b> e entrega para quem você escolheu acima.</div></div>
                  <div className="fluxo-p"><i>3</i><div>O corretor <b>recebe no WhatsApp</b> o aviso
                    com nome, telefone e o link da conversa — igual ao aviso de lead de anúncio.</div></div>
                  <div className="fluxo-p"><i>4</i><div>O lead aparece no painel dele como qualquer
                    outro, e a conversa fica aqui em <b>Respostas</b>, onde você pode entrar.</div></div>
                </div>

                <div className="conta">
                  <div className="conta-l"><span>Pessoas selecionadas</span><b>{alvos}</b></div>
                  <div className="conta-l"><span>Preço por mensagem</span>
                    <b>{brl(preco(tplAtivo?.categoria ?? "MARKETING"))}</b></div>
                  {cfg && alvos > cfg.tetoHoje ? (
                    <div className="conta-l"><span>Teto de hoje neste número</span><b>{cfg.tetoHoje}</b></div>
                  ) : null}
                  <div className="conta-l conta-t"><span>Vai custar</span>
                    <b>{brl(Math.min(alvos, cfg?.tetoHoje ?? alvos) * preco(tplAtivo?.categoria ?? "MARKETING"))}</b></div>
                </div>

                <div className="aviso">
                  <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                  <div>Marketing custa <b>{brl(d.precos.marketing)}</b> e Utilidade <b>{brl(d.precos.utility)}</b>.
                    Se a mensagem for um aviso de verdade — e não oferta — vale refazer como
                    Utilidade e economizar quase quatro vezes.</div>
                </div>

                <div style={{ display: "flex", gap: 9, marginTop: 16, flexWrap: "wrap" }}>
                  <button className="btn wa" style={{ fontWeight: 700 }}
                    disabled={disparando || !alvos || !tplSel || (destino === "escolher" && !marcados.size)}
                    onClick={dispararAgora}>
                    {disparando ? "Disparando…"
                      : `Disparar para ${Math.min(alvos, cfg?.tetoHoje ?? alvos)} pessoas`}
                  </button>
                </div>
              </div>

              <div>
                <Fone nome="Maria" />
                <p className="fone-leg">Prévia com o nome de uma pessoa de verdade da lista.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ══ 4 · respostas ══ */}
        <div className={`pane${etapa === "conv" ? " on" : ""}`}>
          <div className="sec">
            <div className="sec-h"><h2>Quem respondeu</h2>
              <span>{d.conversas.length} pessoas · {d.conversas.filter((c) => c.esperando).length} ainda sem retorno do corretor</span></div>
            {d.conversas.length ? (
              <div className="chat">
                <div className="chat-l">
                  {d.conversas.map((c) => (
                    <div key={c.id} className={`th${thread === c.id ? " on" : ""}${c.esperando ? " nova" : ""}`}
                      role="button" onClick={() => setThread(c.id)}>
                      <span className="av">{ini(c.cliente ?? c.telefone.slice(-2))}</span>
                      <div>
                        <div className="th-n"><b>{c.cliente ?? c.telefone}</b>
                          <span>{c.ultimaEntrada ? dia(c.ultimaEntrada) : ""}</span></div>
                        <div className="th-m">{c.telefone}</div>
                        <div className="th-c">
                          {c.esperando ? <s /> : null}
                          {c.corretor ? `com ${c.corretor}` : "sem corretor"}
                        </div>
                      </div>
                      {c.esperando ? <span className="pip2" /> : null}
                    </div>
                  ))}
                </div>
                <div className="chat-r">
                  {(() => {
                    const c = d.conversas.find((x) => x.id === thread);
                    if (!c) return (
                      <div style={{ margin: "auto", padding: 30, textAlign: "center", color: "var(--ink-3)", fontSize: 13.5 }}>
                        Escolha uma conversa à esquerda.
                      </div>
                    );
                    return (
                      <>
                        <div className="ch-top">
                          <span className="av">{ini(c.cliente ?? c.telefone.slice(-2))}</span>
                          <div><b>{c.cliente ?? c.telefone}</b>
                            <span>{c.telefone} · {c.corretor ? `atendido por ${c.corretor}` : "sem corretor"}</span></div>
                        </div>
                        <div className="ch-msgs">
                          {(msgs ?? []).map((m, i, arr) => (
                            <>
                              {i === 0 || dia(arr[i - 1].quando) !== dia(m.quando)
                                ? <div className="dia" key={`d${m.id}`}>{dia(m.quando)}</div> : null}
                              <div key={m.id}
                                className={`msg ${m.direcao === "entrada" ? "ent" : m.sentBy === userId ? "ger" : "sai"}${m.ehTemplate ? " tpl" : ""}`}>
                                {m.sentBy === userId
                                  ? <span className="marca">você, como gerente</span> : null}
                                {m.texto}
                                <span className="hora">{hhmm(m.quando)}</span>
                              </div>
                            </>
                          ))}
                          {!msgs?.length ? (
                            <div className="dia">sem mensagens guardadas nesta conversa</div>
                          ) : null}
                        </div>
                        <div className="ch-esc">
                          <div className={`ch-jan${c.janelaAberta ? "" : " fechada"}`}>
                            {c.janelaAberta ? (
                              <><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                                Dá para escrever livremente — o cliente respondeu há menos de 24 horas.</>
                            ) : (
                              <><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8.5v5M12 17h.01" /></svg>
                                Passou de 24 horas desde a última mensagem dele. Só dá para mandar uma mensagem aprovada.</>
                            )}
                          </div>
                          <div className="ch-in">
                            <textarea value={rascunho} disabled={!c.janelaAberta}
                              onChange={(e) => setRascunho(e.target.value)}
                              placeholder={c.janelaAberta
                                ? `Escreva para ${(c.cliente ?? "").split(" ")[0] || "o cliente"}…`
                                : "Escolha uma mensagem aprovada"} />
                            <button className={`btn${c.janelaAberta ? " wa" : ""}`} style={{ fontWeight: 700 }}
                              disabled={!c.janelaAberta || !rascunho.trim()} onClick={enviarNaConversa}>
                              Enviar
                            </button>
                          </div>
                          <p className="ch-av">
                            Sai pelo número da empresa, e {c.corretor ? `o ${c.corretor}` : "o corretor"} vê
                            a mensagem na conversa dele <b>marcada como sua</b> — para ele não responder
                            por cima nem se perder.
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="box"><p className="vars-n" style={{ margin: 0 }}>
                Ninguém respondeu a um disparo ainda.
              </p></div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="mgr10 app2">
      <RailV10 atual="disparar" sub={data ? `${data.corretores.length} corretores` : undefined}
        mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Disparar</h1>
            <p>Falar com muita gente de uma vez, pelo WhatsApp oficial</p>
          </div>
        </header>
        {corpo()}
      </main>
    </div>
  );
}
