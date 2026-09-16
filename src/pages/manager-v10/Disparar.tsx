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
  useDisparar, useMensagens, ajustarImagem, acharCheiroOferta, checarNome,
  useTemplatesDaCasa, copiarTemplate, type TemplateCasa,
  criarTemplate, mandarMensagem, dispararCampanha,
  cancelarAgendamento, subirImagem, ajustarFoto,
  type Template,
  useNumerosCasa, usePainelDisparo, useMeusNumeros, useContasWA, reivindicarConta, assumirNumero, adicionarNumero, pedirCodigo, confirmarCodigo,
  lerCsv, salvarPerfilNumero, soltarNumero, removerNumero, usePerfilNumero,
} from "@/hooks/useDisparar";
import { conectarBM, finalizarConexao } from "@/lib/embeddedSignup";
import { Blank } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";
import "@/styles/disparar.css";

type Etapa = "bm" | "tpl" | "disp" | "conv";
type Destino = "fila" | "escolher";

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
/** Fracao em cima do degrau anterior. Zero em cima de zero e "—", nao 0%:
 *  0% diz que ninguem leu, "—" diz que nao houve o que ler. */
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "—");
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
  const [emAnalise, setEmAnalise] = useState<string | null>(null);
  // Quando preenchido, o formulário está editando esta mensagem, não criando outra.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── etapa 3 · disparo ── */
  const [pubs, setPubs] = useState<Set<string>>(new Set());
  const [tplSel, setTplSel] = useState<string>("");
  // Começa VAZIO. Antes vinha com exemplos meus ("Cidade Lapa — Perdizes",
  // "março") e a prévia do celular exibia isso como se fosse escolha do
  // gerente — que é o jeito mais silencioso de mandar a coisa errada para o
  // cliente. Variável só tem conteúdo depois que alguém escreve.
  const [valores, setValores] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<Destino>("fila");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  /* ── etapa 4 · respostas ── */
  const [thread, setThread] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const { data: msgs } = useMensagens(thread);

  const vars = useMemo(() => achaVars(tCorpo), [tCorpo]);
  // As palavras exatas, não só "parece marketing": o aviso que não diz o que
  // corrigir vira um aviso que o gerente aprende a ignorar.
  const cheiros = useMemo(
    () => (tTipo === "UTILITY" ? acharCheiroOferta(tCorpo) : []),
    [tTipo, tCorpo],
  );
  const alerta = cheiros.length > 0;
  const nomeCheck = nomeExib.trim() ? checarNome(nomeExib) : null;

  const tplAtivo: Template | null =
    data?.templates.find((t) => t.id === tplSel) ??
    data?.templates.find((t) => t.status === "APPROVED" || t.status === "approved") ?? null;

  const preco = (cat: string) =>
    (cat === "UTILITY" ? data?.precos.utility : data?.precos.marketing) ?? 0.3;

  // Lista própria do gerente, de fora do Comandra. Fica aqui em cima de
  // propósito: o cálculo de alvos logo abaixo depende dela, e declarar depois
  // derrubava a tela inteira com "Cannot access before initialization".
  /* ── quando soltar ──────────────────────────────────────────────────
     A Meta nao proibe mandar as 22h; quem proibe e o destinatario, que
     denuncia — e denuncia derruba o numero. Por isso o corte das 19:30 e
     duro, e existe tambem no motor: esta tela pode estar fechada quando o
     cron continuar uma lista grande.                                      */
  // `dia` e `hora` NAO servem como nome aqui: ja existem como funcoes de
  // formatacao no modulo, e um estado com o mesmo nome as apaga dentro do
  // componente. A aba Respostas chamava `dia(...)` e recebia uma string —
  // "rt is not a function", tela branca, sem pista nenhuma na interface.
  // Com vários números, qual deles envia. Vazio = o padrão.
  const [numEnvio, setNumEnvio] = useState<string>("");

  // Dia, semana e mês no mesmo botão: o gerente compara o disparo de ontem
  // com o ritmo do mês, e é a comparação que diz se melhorou.
  const [periodo, setPeriodo] = useState(7);

  const [qwModo, setQwModo] = useState<"agora" | "depois">("agora");
  const [qwDia, setQwDia] = useState(() => new Date().toISOString().slice(0, 10));
  const [qwHora, setQwHora] = useState("09:00");

  const [csv, setCsv] = useState<{ leadId: string; nome: string | null; telefone: string }[]>([]);
  const [csvNome, setCsvNome] = useState("");
  // Imagem DESTE disparo. Fica aqui e não no template porque a Meta trata o
  // topo como variável: o template declara que tem imagem, a foto muda a cada
  // envio. E porque voltar duas telas para trocar a foto é trabalho à toa.
  const [imgDisparo, setImgDisparo] = useState<string | null>(null);

  async function pegarImagemDisparo(f: File | undefined) {
    if (!f) return;
    try {
      const r = await ajustarImagem(f);
      setImgDisparo(r.dataUrl);
      toast.success(r.mudou
        ? `Ajustada para 1125 × 590 — a sua tinha ${r.orig.w} × ${r.orig.h}.`
        : "Imagem no formato certo.");
    } catch (e: any) { toast.error(e?.message ?? "Não consegui ler a imagem."); }
  }

  const alvos = useMemo(() => {
    if (!data) return 0;
    return data.publicos.filter((p) => pubs.has(p.chave)).reduce((s, p) => s + p.n, 0) + csv.length;
  }, [data, pubs, csv]);

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

  function carregar(t: Template) {
    setTNome(t.nome); setTTipo(t.categoria); setTCorpo(t.corpo);
    setTRod(t.rodape ?? "");
    const bs = (t.botoes ?? []).map((b: any) => b?.text ?? "");
    setB1(bs[0] ?? ""); setB2(bs[1] ?? "");
    setImg(t.headerImagem ?? null);
    setEmAnalise(null);
    document.querySelector(".novo-t")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function mandarPraMeta() {
    if (!tNome.trim() || !tCorpo.trim()) { toast.error("Falta o nome ou o texto."); return; }
    setEnviando(true);
    try {
      // A imagem sai do navegador antes de qualquer coisa: a Meta precisa
      // baixá-la para aprovar, e o arquivo do computador não existe para ela.
      let imagem = img;
      if (img && img.startsWith("data:")) {
        toast.info("Guardando a imagem…");
        imagem = await subirImagem(img);
        setImg(imagem);
      }
      const nomeLimpo = tNome.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
      const r = await criarTemplate({
        name: nomeLimpo,
        body_text: tCorpo, category: tTipo, language: "pt_BR",
        header_type: imagem ? "IMAGE" : "NONE", header_image_url: imagem,
        footer_text: tRod || null,
        buttons: [b1, b2].filter(Boolean).map((t) => ({ type: "QUICK_REPLY", text: t })),
        variables: vars, owner_id: userId, meta_template_id: editandoId,
        // A Meta exige um exemplo por variável nomeada. Uso o que o gerente já
        // preencheu na prévia — é o valor real, melhor que "exemplo".
        exemplos: Object.fromEntries(vars.map((v) => [v, valores[v] || (v === "nome" ? "Maria" : "exemplo")])),
      });
      setEmAnalise(nomeLimpo);
      // A imagem pode falhar sozinha sem derrubar o template. Quando falha, o
      // gerente PRECISA saber — senão manda achando que vai com foto.
      if ((r as any)?.aviso) toast.warning((r as any).aviso, { duration: 12000 });
      toast.success(editandoId
        ? "Editada e mandada para análise. Ela sai da lista de disparo até a Meta aprovar de novo."
        : "Mandada para a Meta. O resultado aparece na lista acima.",
        { duration: editandoId ? 10000 : 5000 });
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) {
      toast.error(`A Meta não aceitou: ${e?.message ?? e}`);
    } finally { setEnviando(false); }
  }

  const [disparando, setDisparando] = useState(false);
  async function pegarCsv(f: File | undefined) {
    if (!f) return;
    try {
      const linhas = lerCsv(await f.text());
      if (!linhas.length) {
        toast.error("Não achei telefone nesse arquivo. Precisa de uma coluna com o número.");
        return;
      }
      setCsv(linhas); setCsvNome(f.name);
      toast.success(`${linhas.length} pessoas lidas de ${f.name}.`);
    } catch (e: any) { toast.error(`Não consegui ler: ${e?.message ?? e}`); }
  }
  const [conectando, setConectando] = useState(false);
  const { data: numerosCasa, isLoading: carregandoCasa } = useNumerosCasa(!data?.config);
  const { data: painel, isLoading: carregandoPainel } = usePainelDisparo(userId, periodo);
  const { data: usoNumeros } = useMeusNumeros(userId, periodo);
  const { data: contasWA } = useContasWA(etapa === "bm");
  const { data: tplCasa } = useTemplatesDaCasa(30, etapa === "tpl");
  const [copiando, setCopiando] = useState<string | null>(null);

  async function copiar(t: TemplateCasa) {
    if (!userId) return;
    setCopiando(t.id);
    try {
      await copiarTemplate(t, userId);
      toast.success(
        `Mensagem copiada para a sua conta e enviada para aprovação da Meta. ` +
        `Costuma sair rápido porque o texto já foi aprovado antes.`,
        { duration: 9000 },
      );
      qc.invalidateQueries({ queryKey: ["disparar"] });
      qc.invalidateQueries({ queryKey: ["templates-casa"] });
    } catch (e: any) {
      toast.error(`Não consegui copiar: ${e?.message ?? e}`, { duration: 9000 });
    } finally { setCopiando(null); }
  }

  const [wabaDigitado, setWabaDigitado] = useState("");
  const [trocarConta, setTrocarConta] = useState(false);
  const [pegandoConta, setPegandoConta] = useState(false);

  const minhaConta = useMemo(
    () => (contasWA ?? []).find((c) => c.dono_id === userId) ?? null,
    [contasWA, userId],
  );
  // Livre = do portfólio, sem dono e não é a da empresa. A da empresa nunca
  // entra: ela atende quem não tem a própria e não pode ter dono.
  const livres = useMemo(
    () => (contasWA ?? []).filter((c) => !c.dono_id && !c.da_casa),
    [contasWA],
  );

  async function pegarConta(id: string) {
    if (!userId) return;
    setPegandoConta(true);
    try {
      const r = await reivindicarConta(id, userId);
      toast.success(`Conta ${r.nome} é sua. Os próximos números entram nela.`);
      setWabaDigitado(""); setTrocarConta(false);
      qc.invalidateQueries({ queryKey: ["contas-wa"] });
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) {
      toast.error(e?.message ?? String(e), { duration: 9000 });
    } finally { setPegandoConta(false); }
  }


  // Cadastro do próprio número, em três passos, sem sair daqui.
  const [novoTel, setNovoTel] = useState("");
  const [pid, setPid] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [passo, setPasso] = useState<"numero" | "codigo">("numero");

  // Foto e recado do número — o que o cliente vê ao abrir a conversa.
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [sobre, setSobre] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const { data: perfilAtual } = usePerfilNumero(
    data?.config?.ownerId === userId ? data?.config?.phoneNumberId : null, userId);

  async function pegarFoto(f: File | undefined) {
    if (!f) return;
    try {
      // Quadrada e 640×640: a Meta recusa abaixo de 192×192 dizendo só
      // "resolução baixa", e quase toda foto de celular é retangular.
      setFotoPerfil(await ajustarFoto(f));
    } catch (e: any) { toast.error(e?.message ?? "Não consegui ler a imagem."); }
  }

  const [confirmaSoltar, setConfirmaSoltar] = useState(false);

  async function soltar(apagar: boolean) {
    const cfg = data?.config;
    if (!cfg?.phoneNumberId || !userId) return;
    setSalvandoPerfil(true);
    try {
      if (apagar) await removerNumero(cfg.phoneNumberId, userId);
      else await soltarNumero(cfg.phoneNumberId, userId);
      toast.success(apagar
        ? "Número apagado da conta da empresa."
        : "Número solto. Ele continua na conta da empresa, sem dono.");
      setConfirmaSoltar(false);
      qc.invalidateQueries({ queryKey: ["disparar"] });
      qc.invalidateQueries({ queryKey: ["numeros-casa"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui.");
    } finally { setSalvandoPerfil(false); }
  }

  async function salvarPerfil() {
    const cfg = data?.config;
    if (!cfg || !userId) return;
    setSalvandoPerfil(true);
    try {
      let url: string | null = null;
      if (fotoPerfil?.startsWith("data:")) {
        toast.info("Guardando a foto…");
        url = await subirImagem(fotoPerfil);
      }
      await salvarPerfilNumero(cfg.phoneNumberId!, {
        foto_url: url, sobre: sobre.trim() || undefined, owner_id: userId,
      });
      toast.success("Perfil atualizado. Quem abrir a conversa já vê assim.");
      setFotoPerfil(null);
      qc.invalidateQueries({ queryKey: ["perfil-numero"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui salvar.");
    } finally { setSalvandoPerfil(false); }
  }

  async function criarNumero() {
    if (!nomeExib.trim()) { toast.error("Escreva o nome que o cliente vai ver."); return; }
    setConectando(true);
    try {
      const r = await adicionarNumero(novoTel, nomeExib.trim());
      setPid(r.phone_number_id);
      await pedirCodigo(r.phone_number_id, "SMS");
      setPasso("codigo");
      toast.success(`Código enviado por SMS para ${r.numero}.`);
    } catch (e: any) {
      toast.error(e?.emUso
        ? "Esse número já está em uso no WhatsApp. Apague a conta dele no celular (ou desconecte da conta antiga) e tente de novo em três minutos."
        : (e?.message ?? "Não consegui."), { duration: 12000 });
    } finally { setConectando(false); }
  }

  async function reenviar(metodo: "SMS" | "VOICE") {
    if (!pid) return;
    try {
      await pedirCodigo(pid, metodo);
      toast.success(metodo === "VOICE" ? "A Meta vai ligar no número." : "Novo código enviado.");
    } catch (e: any) { toast.error(e?.message ?? "Não consegui."); }
  }

  async function confirmar() {
    if (!pid || !userId) return;
    setConectando(true);
    try {
      const r = await confirmarCodigo(pid, codigo, userId, nomeExib.trim());
      if (r.ok) toast.success("Número confirmado. Já pode disparar por ele.");
      else toast.warning(r.pendencia ?? "Confirmado, mas ficou pendência.", { duration: 12000 });
      setPasso("numero"); setPid(null); setCodigo(""); setNovoTel("");
      qc.invalidateQueries({ queryKey: ["disparar"] });
      qc.invalidateQueries({ queryKey: ["numeros-casa"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Código não confere.");
    } finally { setConectando(false); }
  }

  async function assumir(pid: string, numero: string) {
    if (!userId) return;
    setConectando(true);
    try {
      const r = await assumirNumero(pid, userId, nomeExib.trim() || numero);
      if (r.ok) toast.success("Número é seu. Já pode disparar por ele.");
      else toast.warning(r.pendencia ?? "Vinculado, mas ficou pendência.", { duration: 12000 });
      qc.invalidateQueries({ queryKey: ["disparar"] });
      qc.invalidateQueries({ queryKey: ["numeros-casa"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui.");
    } finally { setConectando(false); }
  }

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


  /* ── a janela ─────────────────────────────────────────────────────────
     08:00 as 19:30, horario de Sao Paulo. Escrito aqui E no runner de
     proposito: aqui para o gerente ver antes de clicar, la para valer
     mesmo com esta tela fechada.                                          */
  // O número que vai enviar de fato: o escolhido, senão o padrão. Tudo na tela
  // de disparo lê daqui — teto, custo e o aviso de conta da empresa — para não
  // acontecer de a tela mostrar um número e a mensagem sair por outro.
  const cfgEnvio = useMemo(
    () => (data?.meusNumeros ?? []).find((n) => n.id === numEnvio) ?? data?.config ?? null,
    [numEnvio, data?.meusNumeros, data?.config],
  );

  const ABRE = "08:00", FECHA = "19:30";
  const marcado = useMemo(() => {
    if (qwModo !== "depois") return null;
    const t = new Date(`${qwDia}T${qwHora}:00`);
    return isNaN(t.getTime()) ? null : t;
  }, [qwModo, qwDia, qwHora]);

  const problemaDaHora = useMemo(() => {
    if (qwModo !== "depois") return null;
    if (!marcado) return "Escolha o dia e a hora.";
    const [hf, mf] = FECHA.split(":").map(Number);
    const [ha] = ABRE.split(":").map(Number);
    const h = marcado.getHours(), m = marcado.getMinutes();
    if (h < ha) return `Cedo demais. O disparo comeca as ${ABRE}.`;
    if (h > hf || (h === hf && m > mf)) return `Tarde demais. O ultimo horario e ${FECHA}.`;
    if (marcado.getTime() < Date.now() + 60_000) return "Esse horario ja passou.";
    return null;
  }, [qwModo, marcado]);

  const agendados = useMemo(
    () => (data?.campanhas ?? []).filter((c) => c.status === "scheduled" && c.marcadaPara)
      .sort((a, b) => (a.marcadaPara! < b.marcadaPara! ? -1 : 1)),
    [data?.campanhas],
  );

  async function desmarcar(id: string) {
    try {
      await cancelarAgendamento(id);
      toast.success("Disparo desmarcado.");
      qc.invalidateQueries({ queryKey: ["disparar"] });
    } catch (e: any) { toast.error(`Nao consegui desmarcar: ${e?.message ?? e}`); }
  }

  async function dispararAgora() {
    if (!data || !userId || !tplAtivo) return;
    const gente = [...data.publicos.filter((p) => pubs.has(p.chave)).flatMap((p) => p.gente), ...csv];
    // Uma pessoa pode estar em duas listas; a Meta cobra as duas mensagens.
    const unicos = [...new Map(gente.map((a) => [a.telefone.replace(/\D/g, ""), a])).values()];
    const teto = data.config?.tetoHoje ?? unicos.length;
    const vai = unicos.slice(0, teto);
    const brokers = destino === "escolher" ? [...marcados] : data.corretores.map((c) => c.id);
    if (!brokers.length) { toast.error("Escolha pelo menos um corretor para atender."); return; }

    // Variável em branco não é detalhe: a Meta recusa o envio inteiro, um por
    // um, e o erro só aparece depois — com a campanha já criada e o gerente
    // achando que disparou.
    const vazias = (tplAtivo.variaveis ?? [])
      .filter((v) => v !== "nome" && !String(valores[v] ?? "").trim());
    if (vazias.length) {
      toast.error(`Preencha ${vazias.map((v) => `{{${v}}}`).join(" e ")} antes de disparar — a Meta recusa variável em branco.`,
        { duration: 9000 });
      return;
    }

    if (problemaDaHora) { toast.error(problemaDaHora); return; }

    setDisparando(true);
    try {
      // A imagem precisa de endereço público: a Meta busca o arquivo a cada
      // envio, e o que está no navegador não existe para ela. Vale numa
      // variável local — o estado do React não muda na mesma linha, e usá-lo
      // aqui mandaria a imagem antiga.
      let urlImagem = imgDisparo;
      if (urlImagem?.startsWith("data:")) {
        toast.info("Guardando a imagem…");
        urlImagem = await subirImagem(urlImagem);
        setImgDisparo(urlImagem);
      }
      await dispararCampanha({
        managerId: userId, templateId: tplAtivo.id,
        nome: `${tplAtivo.nome} · ${new Date().toLocaleDateString("pt-BR")}`,
        alvos: vai, vars: valores, brokerIds: brokers,
        configId: cfgEnvio?.id ?? data.config?.id ?? null,
        imagem: urlImagem,
        quando: marcado ? marcado.toISOString() : null,
      });
      toast.success(marcado
        ? `Marcado para ${marcado.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${vai.length} pessoas. Da para desmarcar ate la.`
        : `Disparo criado para ${vai.length} pessoas. O primeiro lote ja saiu.`);
      setPubs(new Set()); setImgDisparo(null);
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
  // A prévia recebe O QUE mostrar. Antes lia sempre o rascunho da criação, e
  // na etapa de disparo exibia um texto que não era o da mensagem escolhida —
  // o gerente conferia uma coisa e mandava outra.
  const Fone = ({ nome, texto, rodape, botoes, imagem }: {
    nome: string; texto?: string; rodape?: string | null;
    botoes?: string[]; imagem?: string | null;
  }) => {
    const txt = texto ?? tCorpo;
    const rod = rodape !== undefined ? rodape : tRod;
    const bts = botoes ?? [b1, b2];
    const foto = imagem !== undefined ? imagem : img;
    const corpo = txt.replace(/\{\{\s*([\wÀ-ÿ]+)\s*\}\}/g, (_, v) =>
      // `nome` vem do arquivo; o resto mostra o próprio nome entre colchetes
      // enquanto estiver vazio, para ficar claro que ali falta conteúdo.
      v === "nome" ? nome : (valores[v]?.trim() || `[${v}]`));
    return (
      <div className="fone">
        <div className="fone-top">
          <div className="fone-av">{ini(data?.config?.label ?? "Cury")}</div>
          <div><b>{data?.config?.label ?? "Cury Vendas"}</b><span>conta comercial</span></div>
        </div>
        <div className="fone-corpo">
          <div className="bolha">
            {foto ? <img src={foto} alt="" /> : <div className="semimg">sem imagem</div>}
            <p>{corpo}</p>
            {rod ? <span className="rod">{rod}</span> : null}
            <span className="hora">14:32</span>
          </div>
          <div className="bolha-bt">
            {bts.filter(Boolean).map((b) => <div className="bt" key={b}>{b}</div>)}
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
              {/* ── esquerda: o que se configura ── */}
              <div>
                {cfg ? (
                  <>
                    <div className="bm-h">
                      <div className="bm-ic"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg></div>
                      <div>
                        <b>Conectado e liberado para enviar</b>
                        <span>{cfg.displayNumber ?? "—"} · verificado pela Meta</span>
                      </div>
                    </div>

                    {/* Foto e recado: o que o cliente vê ao abrir a conversa.
                        Só aparece para quem é dono do número — no compartilhado
                        da empresa, um gerente mudaria a cara de todos. */}
                    {cfg.ownerId === userId ? (
                      <div className="pv-perfil">
                        <div className="vars-l">A cara do seu número</div>
                        <div className="pf-linha">
                          <label className="pf-foto">
                            {fotoPerfil ? <img src={fotoPerfil} alt="" />
                              : perfilAtual?.foto ? <img src={perfilAtual.foto} alt="" />
                              : <span>escolher<br />foto</span>}
                            <input type="file" accept="image/*" hidden
                              onChange={(e) => pegarFoto(e.target.files?.[0])} />
                          </label>
                          <div className="f" style={{ flex: 1, marginBottom: 0 }}>
                            <label htmlFor="sobre">Recado do perfil</label>
                            <input id="sobre" maxLength={139}
                              value={sobre || perfilAtual?.sobre || ""}
                              placeholder="Cury — imóveis Minha Casa Minha Vida"
                              onChange={(e) => setSobre(e.target.value)} />
                            <small>Aparece embaixo do nome quando o cliente abre a conversa.</small>
                          </div>
                        </div>
                        <button className="btn solid" style={{ marginTop: 12 }}
                          disabled={salvandoPerfil || (!fotoPerfil && !sobre.trim())}
                          onClick={salvarPerfil}>
                          {salvandoPerfil ? "Salvando…" : "Salvar foto e recado"}
                        </button>
                        <p className="vars-n" style={{ marginTop: 10 }}>
                          O <b>nome</b> não muda por aqui: trocar nome passa por análise
                          da Meta e leva alguns dias. Hoje ele é o que foi aprovado
                          quando o número entrou.
                        </p>
                      </div>
                    ) : (
                      <p className="vars-n">
                        Este número é <b>da empresa</b> e atende quem ainda não tem o
                        próprio. Foto, recado e nome valem para todo mundo que usa ele —
                        por isso não se muda por aqui. Cadastre o seu abaixo para ter
                        cara e limite próprios.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="bm-h">
                    <div className="bm-ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                      <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
                    <div>
                      <b>Nenhum número conectado ainda</b>
                      <span>sem isso não dá para disparar — escolha ou cadastre abaixo</span>
                    </div>
                  </div>
                )}

                {/* Todos os números dele, não só o padrão. Com WABA própria por
                    gerente e vários telefones dentro, saber "quantos ativos" e
                    "quanto cada um já mandou" é a pergunta do dia — e o teto e a
                    qualidade são de cada número, nunca da soma. */}
                {(usoNumeros?.length ?? 0) > 1 ? (
                  <div className="meus">
                    <div className="vars-l">
                      Seus números — {usoNumeros!.length} ativos
                    </div>
                    {usoNumeros!.map((n) => (
                      <div className="mn" key={n.config_id}>
                        <span>
                          <b className="mono">{n.numero}</b>
                          <i>{n.nome ?? "sem nome"}
                            {n.waba ? ` · conta ${String(n.waba).slice(-6)}` : ""}</i>
                        </span>
                        <span className={`qual q-${(n.qualidade ?? "").toLowerCase()}`}>
                          {(n.qualidade ?? "—").toLowerCase()}
                        </span>
                        <span className="mn-u">
                          <b>{n.hoje}</b> hoje
                          <i>{n.enviadas} no período{n.falhas ? ` · ${n.falhas} recusadas` : ""}</i>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* A conta de WhatsApp do gerente. É ela que carrega o cartão:
                    número cadastrado daqui para frente nasce dentro dela, e é
                    por isso que a cobrança cai no cartão certo. */}
                <details className="dobra" open={!minhaConta}>
                  <summary>
                    {minhaConta
                      ? `Sua conta de WhatsApp — ${minhaConta.nome ?? minhaConta.waba_id}`
                      : "Sua conta de WhatsApp — ainda não definida"}
                  </summary>

                  {minhaConta ? (
                    <>
                      <p className="vars-n">
                        Seus números novos entram em <b>{minhaConta.nome}</b>
                        {" "}(<span className="mono">{minhaConta.waba_id}</span>), e a
                        cobrança vai para o cartão cadastrado nela. Ninguém mais
                        enxerga os números dessa conta.
                      </p>
                      <button className="btn sm" style={{ marginTop: 10 }}
                        onClick={() => setTrocarConta((v) => !v)}>
                        {trocarConta ? "Deixar como está" : "Usar outra conta"}
                      </button>
                    </>
                  ) : (
                    <p className="vars-n">
                      Enquanto você não tiver a sua, seus disparos saem pelo
                      número da empresa — <b>no cartão da empresa</b>. Cole
                      abaixo o ID da conta que foi criada para você.
                    </p>
                  )}

                  {!minhaConta || trocarConta ? (
                    <>
                      {livres.length ? (
                        <div className="bm-lista" style={{ marginTop: 12 }}>
                          {livres.map((c) => (
                            <div className="bml" key={c.waba_id}>
                              <span className="av">{ini(c.nome ?? "?")}</span>
                              <span>
                                <b>{c.nome ?? "sem nome"}</b>
                                <i className="mono">{c.waba_id}</i>
                              </span>
                              <span />
                              <span>
                                <button className="btn sm" disabled={pegandoConta}
                                  onClick={() => pegarConta(c.waba_id)}>
                                  É a minha
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="f" style={{ marginTop: 14, marginBottom: 0 }}>
                        <label htmlFor="waba-id">Ou cole o ID da conta</label>
                        <input id="waba-id" inputMode="numeric" value={wabaDigitado}
                          placeholder="2052396692348923" disabled={pegandoConta}
                          onChange={(e) => setWabaDigitado(e.target.value)} />
                        <small>
                          O ID aparece no Business Manager, em Configurações do
                          Negócio › Contas do WhatsApp, embaixo do nome da conta.
                        </small>
                      </div>
                      <button className="btn solid" style={{ marginTop: 10 }}
                        disabled={pegandoConta || !wabaDigitado.trim()}
                        onClick={() => pegarConta(wabaDigitado)}>
                        {pegandoConta ? "Conferindo…" : "É a minha conta"}
                      </button>
                    </>
                  ) : null}
                </details>

                {/* Escolher um número que já existe. Fica aberto para quem ainda
                    não tem o seu, e fechado para quem já resolveu isso — é uma
                    decisão que se toma uma vez. */}
                <details className="dobra" open={!cfg}>
                  <summary>{cfg ? "Ver os números da conta" : "Escolher o meu número"}</summary>
                  {carregandoCasa ? (
                    <p className="vars-n">Consultando os números da empresa…</p>
                  ) : !numerosCasa?.length ? (
                    <p className="vars-n">Nenhum número disponível ainda. Peça ao
                      administrador para adicionar o seu na conta de WhatsApp da empresa.</p>
                  ) : (
                    <>
                      {/* Faltava a frase mais importante da tela: TODOS estes
                          numeros sao da conta da empresa. Sem ela, "compartilhado"
                          e "de outra pessoa" pareciam contas diferentes, e nao da
                          para saber qual numero dispara por onde. */}
                      <p className="vars-n">
                        Todos estes números são da <b>conta de WhatsApp da empresa</b>
                        {cfg?.wabaId ? <> (<span className="mono">{cfg.wabaId}</span>)</> : null}.
                        Ninguém aqui usa conta própria — cada um dispara pelo seu
                        número, com o próprio limite e a própria cobrança.
                      </p>
                      <div className="bm-lista">
                        {numerosCasa.map((n) => {
                          const livre = !n.donoId && !n.compartilhado;
                          const meu = n.donoId === userId;
                          return (
                            <div className={`bml${meu ? " meu" : ""}`} key={n.phone_number_id}>
                              <span className="av">{ini(n.nome ?? "?")}</span>
                              <span>
                                <b>{n.numero}</b>
                                <i>{meu ? "este é o seu"
                                   : n.compartilhado ? "da empresa — atende quem não tem o próprio"
                                   : n.donoId ? `de ${n.donoLabel ?? "outra pessoa"}`
                                   : n.nome ?? "livre"}</i>
                              </span>
                              <span className="qual">{(n.qualidade ?? "—").toLowerCase()}</span>
                              <span>
                                {livre ? (
                                  <button className="btn sm" disabled={conectando}
                                    onClick={() => assumir(n.phone_number_id, n.numero)}>
                                    É o meu
                                  </button>
                                ) : (
                                  <span className="mk-tag">
                                    {meu ? "em uso por você"
                                      : n.compartilhado ? "compartilhado" : "de outra pessoa"}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </details>

                {/* Cadastro do próprio número, aqui dentro. O gerente não abre o
                    painel da Meta em nenhum passo: o token da empresa tem permissão
                    para adicionar número e a empresa já é verificada, então não há
                    CNPJ nem documento no caminho. É um caminho de uma vez na vida —
                    aberto quando falta número, fechado depois. */}
                <details className="dobra" open={!cfg || passo === "codigo"}>
                  <summary>Cadastrar um número novo</summary>

                  {passo === "numero" ? (
                    <>
                      {/* O campo do nome sumiu junto com o botão antigo do Facebook e
                          o cadastro ficou impossível: o botão exigia um nome que não
                          tinha onde digitar. */}
                      <div className="f" style={{ marginBottom: 10 }}>
                        <label htmlFor="disp-nome">Nome que o cliente vai ver</label>
                        <input id="disp-nome" autoComplete="off" value={nomeExib}
                          disabled={conectando} placeholder="Cury — Dudu"
                          onChange={(e) => setNomeExib(e.target.value)} />
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
                        ) : <small>É o nome que aparece na conversa do cliente. A Meta
                          exige que tenha relação com o negócio.</small>}
                      </div>

                      <div className="f" style={{ marginBottom: 10 }}>
                        <label htmlFor="novo-tel">Seu número, com DDD</label>
                        <input id="novo-tel" inputMode="numeric" placeholder="11 96809-4368"
                          value={novoTel} disabled={conectando}
                          onChange={(e) => setNovoTel(e.target.value)} />
                      </div>
                      <button className="btn solid" style={{ width: "100%" }}
                        disabled={conectando || !novoTel.trim() || !nomeExib.trim()}
                        onClick={criarNumero}>
                        {conectando ? "Cadastrando…" : "Receber código por SMS"}
                      </button>
                      <p className="vars-n" style={{ marginTop: 10 }}>
                        O número não pode estar em uso no WhatsApp comum. Se estiver,
                        apague a conta dele no celular antes — em Ajustes, Conta,
                        Apagar minha conta.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="f" style={{ marginBottom: 10 }}>
                        <label htmlFor="cod">Código que chegou por SMS</label>
                        <input id="cod" inputMode="numeric" maxLength={8} placeholder="000000"
                          value={codigo} disabled={conectando}
                          onChange={(e) => setCodigo(e.target.value)} />
                      </div>
                      <button className="btn solid" style={{ width: "100%" }}
                        disabled={conectando || codigo.trim().length < 4} onClick={confirmar}>
                        {conectando ? "Confirmando…" : "Confirmar e ativar"}
                      </button>
                      <div style={{ display: "flex", gap: 9, marginTop: 10, flexWrap: "wrap" }}>
                        <button className="btn sm" onClick={() => reenviar("SMS")}>Reenviar SMS</button>
                        {/* Fixo não recebe SMS — foi o que travou o primeiro número. */}
                        <button className="btn sm" onClick={() => reenviar("VOICE")}>Receber por ligação</button>
                        <button className="btn sm" onClick={() => { setPasso("numero"); setPid(null); }}>
                          Trocar o número
                        </button>
                      </div>
                    </>
                  )}
                </details>

                {/* Sair do número mora sozinho, no fim e fechado: estava lado a
                    lado com "Salvar foto e recado", e apagar da conta na Meta não
                    tem volta. Peso de risco igual para ações de risco oposto é
                    como se aperta o botão errado. */}
                {cfg && cfg.ownerId === userId ? (
                  <details className="dobra perigo">
                    <summary>Encerrar este número</summary>
                    <p className="vars-n">
                      <b>Soltar</b> devolve o número para a empresa e você pode reassumir
                      depois. <b>Apagar</b> tira da conta na Meta: recolocar é cadastro
                      novo, com SMS de novo, e a reputação do número recomeça do zero.
                    </p>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button className="btn sm" disabled={salvandoPerfil}
                        onClick={() => soltar(false)}>
                        Soltar — fica na empresa, sem dono
                      </button>
                      <button className="btn sm" disabled={salvandoPerfil}
                        style={{ borderColor: "var(--crit)", color: "var(--crit)" }}
                        onClick={() => soltar(true)}>
                        Apagar da conta — sem volta
                      </button>
                    </div>
                  </details>
                ) : null}
              </div>

              {/* ── direita: o que decide, e o que o cliente vê ── */}
              <div className="lado">
                {cfg ? (
                  <>
                    <div className="teto">
                      <span>Pode enviar hoje</span>
                      <b>{cfg.tetoHoje.toLocaleString("pt-BR")}</b>
                      <i>conversas · sobe sozinho conforme as pessoas respondem bem</i>
                    </div>

                    {/* O cartão do WhatsApp: é exatamente o que o cliente vê antes
                        de decidir se responde. Foto e recado sao editados a duas
                        colunas daqui e nao tinham nenhuma previa. */}
                    <div className="cartao">
                      <div className="ct-cap" />
                      <div className="ct-foto">
                        {fotoPerfil ? <img src={fotoPerfil} alt="" />
                          : perfilAtual?.foto ? <img src={perfilAtual.foto} alt="" />
                          : <span>{ini(cfg.label ?? "CV")}</span>}
                      </div>
                      <b>{cfg.label ?? "—"}</b>
                      <i>{sobre || perfilAtual?.sobre || "sem recado ainda"}</i>
                      <span className="ct-num">{cfg.displayNumber ?? "—"}</span>
                      <span className="ct-sel">conta comercial</span>
                    </div>
                    <p className="fone-leg">É assim que o cliente te vê.</p>

                    <div className="bm-l">
                      <div>Qualidade <b><span className="qual">{(cfg.quality ?? "—").toLowerCase()}</span></b></div>
                      <div>Conectado em <b>{cfg.onboardedEm
                        ? new Date(cfg.onboardedEm).toLocaleDateString("pt-BR") : "—"}</b></div>
                      <div>Conta de negócios <b>{cfg.wabaId ?? "—"}</b></div>
                    </div>

                    {cfg.novo ? (
                      <div className="aviso">
                        <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                        <div>Número novo. Disparar mil de uma vez não acelera nada —
                          derruba a qualidade e o número é restringido.</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="cartao vazio">
                    <div className="ct-foto"><span>?</span></div>
                    <b>Sem número</b>
                    <i>escolha ou cadastre ao lado para ver como o cliente te vê</i>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── o painel ─────────────────────────────────────────────────
              Era uma lista de números, um por corretor. Com 40 corretores é
              rolagem, e rolagem não responde pergunta nenhuma. Aqui estão as
              perguntas: saiu quanto, chegou, foi lido, quem respondeu, qual
              campanha e qual texto funcionaram, e quem da equipe usa isto. */}
          <div className="sec">
            <div className="sec-h">
              <h2>Como está indo</h2>
              <div className="per">
                {([[1, "Hoje"], [7, "Semana"], [30, "Mês"]] as [number, string][]).map(([n, r]) => (
                  <button key={n} className={periodo === n ? "on" : ""}
                    onClick={() => setPeriodo(n)}>{r}</button>
                ))}
              </div>
            </div>

            {!painel ? (
              <div className="box"><p className="vars-n" style={{ margin: 0 }}>
                {carregandoPainel ? "Somando…" : "Sem dado neste período."}</p></div>
            ) : (
              <>
                {/* O funil de um disparo: saiu → chegou → foi lido → respondeu.
                    Cada degrau só faz sentido ao lado do anterior, por isso
                    ficam juntos e cada um mostra a fração do que veio antes. */}
                <div className="kpis">
                  <div className="kpi">
                    <span>Enviadas</span>
                    <b>{painel.envio.enviadas.toLocaleString("pt-BR")}</b>
                    <i>mensagens que saíram</i>
                  </div>
                  <div className="kpi">
                    <span>Entregues</span>
                    <b>{painel.envio.entregues.toLocaleString("pt-BR")}</b>
                    <i>{pct(painel.envio.entregues, painel.envio.enviadas)} do que saiu</i>
                  </div>
                  <div className="kpi">
                    <span>Lidas</span>
                    <b>{painel.envio.lidas.toLocaleString("pt-BR")}</b>
                    <i>{pct(painel.envio.lidas, painel.envio.entregues)} de quem recebeu</i>
                  </div>
                  <div className="kpi bom">
                    <span>Responderam</span>
                    <b>{painel.envio.responderam.toLocaleString("pt-BR")}</b>
                    <i>{pct(painel.envio.responderam, painel.envio.enviadas)} — é o que vira lead</i>
                  </div>
                  <div className={`kpi${painel.envio.falhas ? " ruim" : ""}`}>
                    <span>Recusadas</span>
                    <b>{painel.envio.falhas.toLocaleString("pt-BR")}</b>
                    <i>{painel.envio.falhas ? "número errado ou fora do WhatsApp" : "nenhuma"}</i>
                  </div>
                  <div className="kpi">
                    <span>Em conversa agora</span>
                    <b>{painel.envio.em_conversa.toLocaleString("pt-BR")}</b>
                    <i>falaram nas últimas 24h</i>
                  </div>
                  {/* Custo do que a Meta COBROU, não do que estimamos. Ela manda
                      a categoria e se foi cobrável; o valor vem da tarifa. */}
                  <div className="kpi">
                    <span>Gasto</span>
                    <b>{brl(painel.custo?.gasto ?? 0)}</b>
                    <i>{painel.custo?.cobradas ?? 0} cobradas
                      {painel.custo?.sem_retorno
                        ? ` · ${painel.custo.sem_retorno} sem retorno da Meta ainda` : ""}</i>
                  </div>
                  {painel.custo?.gratuitas ? (
                    <div className="kpi bom">
                      <span>Saiu de graça</span>
                      <b>{painel.custo.gratuitas.toLocaleString("pt-BR")}</b>
                      <i>economizou {brl(painel.custo.economia)} — janela de 24h aberta</i>
                    </div>
                  ) : null}
                </div>

                {painel.envio.sem_corretor > 0 ? (
                  <div className="alerta" style={{ marginTop: 12 }}>
                    <b>{painel.envio.sem_corretor}</b>&nbsp;pessoas responderam e estão
                    sem corretor. Responderam e ninguém falou com elas.
                  </div>
                ) : null}

                <div className="duo">
                  {/* Campanha responde "qual disparo valeu". O público muda a
                      cada uma, então a taxa é do disparo inteiro — não do texto. */}
                  <details className="dobra" open>
                    <summary>Campanhas — da que mais fez responder</summary>
                    {!painel.campanhas.length ? (
                      <p className="vars-n">Nenhuma campanha com envio neste período.</p>
                    ) : (
                      <div className="rank">
                        {painel.campanhas.slice(0, 8).map((c) => (
                          <div className="rk" key={c.id}>
                            <span className="rk-n">
                              <b>{c.nome}</b>
                              <i>{c.enviadas} enviadas · {c.lidas} lidas
                                {c.falhas ? ` · ${c.falhas} recusadas` : ""}</i>
                            </span>
                            <span className="rk-b">
                              <s style={{ width: `${Math.min(100, c.taxa * 4)}%` }} />
                            </span>
                            <span className="rk-v">{c.taxa}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>

                  {/* Mensagem responde "qual texto funciona". Agrupa o mesmo
                      template usado em campanhas diferentes — o público muda,
                      o texto não, e é só assim que dá para comparar. */}
                  <details className="dobra" open>
                    <summary>Mensagens — qual texto é mais respondido</summary>
                    {!painel.mensagens.length ? (
                      <p className="vars-n">Ainda não há texto com envio suficiente
                        para comparar (a partir de 5 envios).</p>
                    ) : (
                      <div className="rank">
                        {painel.mensagens.slice(0, 8).map((m) => (
                          <div className="rk" key={m.template}>
                            <span className="rk-n">
                              <b className="mono">{m.template}</b>
                              <i>{m.enviadas} enviadas · {m.respostas} responderam</i>
                            </span>
                            <span className="rk-b">
                              <s style={{ width: `${Math.min(100, m.taxa * 4)}%` }} />
                            </span>
                            <span className="rk-v">{m.taxa}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </div>

                {/* Adoção. Ferramenta que ninguém abre não existe — e este é o
                    número que o gerente precisa ver antes de cobrar resultado. */}
                <details className="dobra">
                  <summary>
                    Equipe — {painel.equipe.usam} de {painel.equipe.total} dispararam
                    {painel.equipe.online ? ` · ${painel.equipe.online} online agora` : ""}
                  </summary>
                  <div className="eq">
                    {painel.equipe.lista.map((b) => (
                      <div className={`eqr${b.campanhas ? " usa" : ""}`} key={b.id}>
                        <span className="av">{ini(b.nome)}</span>
                        <span>
                          <b>{b.nome}</b>
                          <i>{b.numero ?? "sem número próprio"}</i>
                        </span>
                        <span className="eq-u">
                          {b.campanhas
                            ? `${b.campanhas} ${b.campanhas === 1 ? "disparo" : "disparos"} · ${b.enviadas} mensagens`
                            : "não disparou"}
                        </span>
                        {b.online ? <span className="on" title="online agora" />
                          : <span className="eq-v">{b.visto ? dia(b.visto) : "nunca entrou"}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
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
                      {/* A categoria que vale é a que a META aprovou, e ela
                          reclassifica pelo conteúdo. Mostrar o preço junto é o
                          que impede o gerente achar que paga R$0,035 quando
                          paga R$0,32 — nove vezes mais. */}
                      <span className={`cat-b ${(t.categoria ?? "").toLowerCase()}`}
                        title={t.categoria === "UTILITY"
                          ? "Aprovada pela Meta como Utilidade"
                          : "Aprovada pela Meta como Marketing"}>
                        {t.categoria === "UTILITY" ? "Utilidade" : "Marketing"}
                        {" · "}{brl(preco(t.categoria))}
                      </span>
                      <span className="prev">{t.corpo.slice(0, 90)}</span>
                      <span>
                        <span style={{ display: "flex", gap: 6 }}>
                          <button className="btn sm" onClick={() => {
                            carregar(t); setEditandoId(null); setTNome(t.nome + "_v2");
                          }}>Copiar</button>
                          {t.metaId ? (
                            <button className="btn sm" onClick={() => {
                              carregar(t); setEditandoId(t.metaId!);
                            }}>Editar</button>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  );
                }) : <p className="vars-n" style={{ margin: 0 }}>Nenhuma mensagem ainda. Crie a primeira abaixo.</p>}
              </div>
            </div>
          </div>

            {/* ── mensagens da equipe ──────────────────────────────────────
            Texto campeão de um gerente serve para todos — e é o resultado
            que faz querer copiar, não a lista. Copiar, e não compartilhar:
            template vive DENTRO de uma conta, e o aprovado na conta do Dudu
            não existe na da Liliane; a Meta recusa o envio. */}
          <div className="sec">
            <div className="sec-h">
            <h2>Mensagens da equipe</h2>
            <span>o que está funcionando com os outros gerentes</span>
            </div>
            <div className="box">
            {!tplCasa?.length ? (
              <p className="vars-n" style={{ margin: 0 }}>
                Nenhuma mensagem aprovada na casa ainda.</p>
            ) : (
              <div className="cat">
                {tplCasa.filter((t) => t.dono_id !== userId).slice(0, 12).map((t) => {
                  const cheiro = t.categoria === "UTILITY" ? acharCheiroOferta(t.corpo) : [];
                  const trocada = t.categoria_pedida
                    && t.categoria_pedida.toUpperCase() !== (t.categoria ?? "").toUpperCase();
                  return (
                    <div className="ct-i" key={t.id}>
                      <div className="ct-h">
                        <b className="mono">{t.nome}</b>
                        <span className={`cat-b ${(t.categoria ?? "").toLowerCase()}`}>
                          {t.categoria === "UTILITY" ? "Utilidade" : "Marketing"}
                          {" · "}{brl(preco(t.categoria))}
                        </span>
                      </div>
                      <p className="ct-c">{t.corpo}</p>
                      <div className="ct-f">
                        <span>de <b>{t.dono}</b></span>
                        {t.enviadas ? (
                          <span className="ct-r">
                            <b>{t.taxa}%</b> responderam
                            <i>{t.enviadas} enviadas</i>
                          </span>
                        ) : <span className="ct-r"><i>ainda sem envio</i></span>}
                        <button className="btn sm" disabled={copiando === t.id}
                          onClick={() => copiar(t)}>
                          {copiando === t.id ? "Copiando…" : "Usar esta"}
                        </button>
                      </div>

                      {/* A Meta RECLASSIFICA pelo conteúdo. Quem pediu
                          utilidade e recebeu marketing paga nove vezes mais
                          sem saber — este é o aviso que evita isso. */}
                      {trocada ? (
                        <div className="ct-av">
                          Você pediu <b>{t.categoria_pedida === "UTILITY" ? "Utilidade" : "Marketing"}</b> e
                          a Meta aprovou como <b>{t.categoria === "UTILITY" ? "Utilidade" : "Marketing"}</b>.
                          O preço que vale é o da aprovação: <b>{brl(preco(t.categoria))}</b> por mensagem.
                        </div>
                      ) : null}
                      {cheiro.length ? (
                        <div className="ct-av">
                          Aprovada como Utilidade, mas o texto tem{" "}
                          <b>{cheiro.join(", ")}</b>. Se você ajustar e reenviar,
                          a Meta pode reclassificar como Marketing — de {brl(d.precos.utility)}
                          {" "}para {brl(d.precos.marketing)} por mensagem.
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          <div className="sec">
            <div className="sec-h">
              <h2>{editandoId ? "Editando uma mensagem aprovada" : "Criar uma mensagem nova"}</h2>
              {editandoId ? (
                <button className="btn sm" onClick={() => {
                  setEditandoId(null); setTNome("nova_mensagem"); setTCorpo("");
                  setB1(""); setB2(""); setImg(null);
                }}>Cancelar edição</button>
              ) : null}
            </div>
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
                      <div>
                        <b>Isto tira a mensagem de Utilidade: {cheiros.join(", ")}.</b>{" "}
                        A Meta reclassifica pelo conteúdo e cobra como Marketing —
                        {" "}{brl(d.precos.marketing)} em vez de {brl(d.precos.utility)} por
                        mensagem, mais de nove vezes. Utilidade é retomar o que a
                        pessoa já pediu, sem anunciar nada novo.
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Os botões estavam soltos no fim do formulário, com nome
                    técnico e sem dizer o que fazem — o gerente acabava escrevendo
                    "responda SIM" no texto, que é pior: obriga a pessoa a digitar
                    e erra na acentuação. */}
                <div className="vars">
                  <div className="vars-l">Como a pessoa responde</div>
                  <p className="vars-n" style={{ marginTop: 0 }}>
                    Botão é melhor do que pedir para digitar: a pessoa <b>toca</b> e
                    pronto. E o toque conta como resposta — abre a conversa por 24
                    horas e o lead cai na mão do corretor. Se deixar em branco, ela
                    vai ter que escrever, e quem escreve "sim" com acento ou "quero"
                    não é reconhecido.
                  </p>

                  <div className="pa-tipos" style={{ marginTop: 12 }}>
                    {[
                      ["SIM", "NÃO"],
                      ["Quero continuar", "Não tenho interesse"],
                      ["Tenho interesse", "Agora não"],
                    ].map(([a, bb]) => (
                      <button key={a} type="button"
                        className={`pa-chip${b1 === a && b2 === bb ? " on" : ""}`}
                        onClick={() => { setB1(a); setB2(bb); }}>
                        {a} · {bb}
                      </button>
                    ))}
                    <button type="button" className={`pa-chip${!b1 && !b2 ? " on" : ""}`}
                      onClick={() => { setB1(""); setB2(""); }}>
                      sem botão
                    </button>
                  </div>

                  <div className="f2" style={{ marginTop: 12 }}>
                    <div className="f"><label htmlFor="b1">Botão que aceita</label>
                      <input id="b1" maxLength={25} placeholder="deixe vazio para não ter"
                        value={b1} onChange={(e) => setB1(e.target.value)} /></div>
                    <div className="f"><label htmlFor="b2">Botão que recusa</label>
                      <input id="b2" maxLength={25} placeholder="opcional"
                        value={b2} onChange={(e) => setB2(e.target.value)} /></div>
                  </div>
                  <p className="vars-n" style={{ marginTop: 6 }}>
                    Até 25 caracteres cada. Quem tocar no <b>segundo</b> entra na lista
                    de quem não quer receber — é o que protege o seu número.
                  </p>
                </div>

                <div className="f"><label htmlFor="t-rod">Rodapé</label>
                  <input id="t-rod" value={tRod} onChange={(e) => setTRod(e.target.value)} />
                  <small>Aparece em cinza embaixo da mensagem. Serve para o aviso de
                    como sair da lista.</small></div>

                {editandoId ? (
                  <div className="alerta" style={{ marginBottom: 12 }}>
                    <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                    <div><b>Editar não é de graça.</b> Ao salvar, esta mensagem volta
                      para análise e <b>não pode ser disparada</b> até a Meta aprovar
                      de novo — o que leva de minutos a horas. A Meta também limita a
                      dez edições por mês. Se você tem disparo marcado, é mais seguro
                      copiar e criar uma nova.</div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button className="btn solid" disabled={enviando} onClick={mandarPraMeta}>
                    {enviando ? "Mandando…"
                      : editandoId ? "Salvar e mandar para análise"
                      : "Mandar para aprovação da Meta"}
                  </button>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: "12.5px", color: "var(--ink-3)", lineHeight: 1.55, maxWidth: "58ch" }}>
                  A Meta costuma responder entre alguns minutos e algumas horas. Enquanto não
                  aprovar, a mensagem não pode ser disparada — e você é avisado aqui quando o
                  resultado chegar.
                </p>
                {/* O estado vem da LISTA, que consulta a Meta a cada dois
                    minutos. Antes era um enfeite: girava para sempre, tivesse a
                    Meta respondido ou não. */}
                {emAnalise ? (() => {
                  const t = d.templates.find((x) => x.nome === emAnalise);
                  const st = (t?.status ?? "PENDING").toUpperCase();
                  if (st === "APPROVED") {
                    return (
                      <div className="enviado" style={{ background: "var(--good-soft)" }}>
                        <svg viewBox="0 0 24 24" style={{ width: 19, height: 19, flex: "none",
                          stroke: "var(--good)", fill: "none", strokeWidth: 2.4, marginTop: 1 }}>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <div>
                          <b style={{ color: "var(--good)" }}>Aprovada pela Meta</b>
                          <p>Já pode disparar com ela. Se a categoria mudou, o preço na
                            etapa de disparo mostra o que vale agora.</p>
                        </div>
                      </div>
                    );
                  }
                  if (st === "REJECTED") {
                    return (
                      <div className="enviado" style={{ background: "var(--crit-soft)" }}>
                        <svg viewBox="0 0 24 24" style={{ width: 19, height: 19, flex: "none",
                          stroke: "var(--crit)", fill: "none", strokeWidth: 2.2, marginTop: 1 }}>
                          <circle cx="12" cy="12" r="9" /><path d="M12 8.5v5M12 17h.01" />
                        </svg>
                        <div>
                          <b style={{ color: "var(--crit)" }}>Recusada</b>
                          <p>O motivo mais comum é texto de oferta em mensagem de
                            utilidade. Ajuste e mande de novo — ou copie e crie outra.</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="enviado">
                      <span className="sp" />
                      <div>
                        <b>Em análise na Meta</b>
                        <p>Esta tela confere sozinha a cada dois minutos e avisa aqui
                          quando houver resposta. Pode sair da aba — a análise corre
                          igual, e o resultado fica na lista acima.</p>
                      </div>
                    </div>
                  );
                })() : null}
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

                <div className="f" style={{ marginTop: 18 }}>
                  <label>Ou suba uma lista sua</label>
                  <label className={`up${csv.length ? " tem" : ""}`} style={{ display: "block" }}>
                    {csv.length ? (
                      <div style={{ padding: "10px 4px" }}>
                        <b>{csv.length} pessoas</b>
                        <span>{csvNome} — clique para trocar</span>
                      </div>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                        <b>Escolher um arquivo CSV</b>
                        <span>uma coluna com o nome e outra com o telefone</span>
                      </>
                    )}
                    <input type="file" accept=".csv,text/csv,text/plain" hidden
                      onChange={(e) => pegarCsv(e.target.files?.[0])} />
                  </label>
                  {csv.length ? (
                    <button className="btn sm" style={{ marginTop: 8, alignSelf: "flex-start" }}
                      onClick={() => { setCsv([]); setCsvNome(""); }}>
                      Tirar a lista
                    </button>
                  ) : (
                    <small>Aceita vírgula ou ponto e vírgula, com ou sem cabeçalho.
                      Repetidos são descartados.</small>
                  )}
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
                  {!d.templates.some((t) => (t.status ?? "").toUpperCase() === "APPROVED") ? (
                    <small>
                      {d.templates.length
                        ? "Nenhuma das suas mensagens foi aprovada ainda. O status vem da Meta e atualiza sozinho — se você acabou de aprovar, recarregue em um minuto."
                        : "Você ainda não criou nenhuma mensagem. Crie na etapa Mensagens."}
                    </small>
                  ) : null}
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
                          <input value={valores[v] ?? ""}
                            placeholder={`o que entra no lugar de {{${v}}}`}
                            style={!String(valores[v] ?? "").trim()
                              ? { borderColor: "var(--warn)" } : undefined}
                            onChange={(e) => setValores((s) => ({ ...s, [v]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* A imagem fica AQUI, não na criação: a Meta trata o topo como
                    variável, e voltar duas telas para trocar a foto do disparo é
                    trabalho à toa. Só aparece se a mensagem escolhida tiver
                    imagem declarada. */}
                {tplAtivo && (tplAtivo.headerTipo === "IMAGE" || tplAtivo.headerImagem) ? (
                  <div className="f" style={{ marginTop: 18 }}>
                    <label>Imagem deste disparo</label>
                    <label className={`up${imgDisparo || tplAtivo.headerImagem ? " tem" : ""}`}
                      style={{ display: "block" }}>
                      {imgDisparo ? <img src={imgDisparo} alt="" />
                        : tplAtivo.headerImagem ? <img src={tplAtivo.headerImagem} alt="" />
                        : (<>
                            <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                            <b>Escolher a foto</b>
                            <span>do seu computador</span>
                          </>)}
                      <input type="file" accept="image/*" hidden
                        onChange={(e) => pegarImagemDisparo(e.target.files?.[0])} />
                    </label>
                    <small>
                      {imgDisparo ? "Clique para trocar. Vai ajustada para 1125 × 590."
                        : "Clique para trocar a foto só neste disparo — a mensagem continua a mesma e não volta para aprovação."}
                    </small>
                  </div>
                ) : tplAtivo ? (
                  // Silencio aqui fazia o gerente esperar uma foto que nao
                  // podia existir: a Meta congela o cabecalho na aprovacao.
                  <p className="sec-sub" style={{ marginTop: 16 }}>
                    Esta mensagem não tem imagem. O cabeçalho é definido na
                    aprovação e não dá para acrescentar depois — para mandar com
                    foto, crie uma mensagem nova escolhendo imagem no topo.
                  </p>
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
              </div>

              {/* A decisão mora toda aqui e acompanha a rolagem: prévia, conta
                  e botão. Antes a conta fechava a coluna da esquerda — o número
                  que decide se vale disparar só aparecia depois de rolar tudo, e
                  a prévia saía da tela justo enquanto se preenchia a variável
                  que ela mostra. */}
              <div className="lado">
                <Fone nome="Maria"
                  texto={tplAtivo?.corpo}
                  rodape={tplAtivo?.rodape}
                  botoes={(tplAtivo?.botoes ?? []).map((b: any) => b?.text ?? "")}
                  imagem={imgDisparo ?? tplAtivo?.headerImagem ?? null} />
                <p className="fone-leg">
                  {tplAtivo ? "É assim que vai chegar." : "Escolha a mensagem para ver a prévia."}
                </p>

                {/* De qual numero sai, e de quem e a conta. Faltava por completo:
                    dava para disparar mil mensagens sem saber que estavam saindo
                    pelo numero compartilhado — ou seja, no cartao da empresa. */}
                <div className={`sai${cfgEnvio && cfgEnvio.ownerId !== userId ? " casa" : ""}`}>
                  <span>Sai pelo número</span>
                  {d.meusNumeros.length > 1 ? (
                    <select className="sai-sel" value={cfgEnvio?.id ?? ""}
                      onChange={(e) => setNumEnvio(e.target.value)}>
                      {d.meusNumeros.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.displayNumber} — {n.label ?? "sem nome"}
                          {n.quality ? ` · ${n.quality.toLowerCase()}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <b>{cfgEnvio?.displayNumber ?? "nenhum"}</b>
                  )}
                  <i>{!cfgEnvio ? "conecte um número antes de disparar"
                     : cfgEnvio.ownerId === userId
                       ? "é o seu número — a conta é sua"
                       : "número compartilhado da empresa — quem paga é a empresa"}</i>
                </div>

                <div className="conta">
                  <div className="conta-l"><span>Pessoas selecionadas</span><b>{alvos}</b></div>
                  <div className="conta-l"><span>Preço por mensagem</span>
                    <b>{brl(preco(tplAtivo?.categoria ?? "MARKETING"))}</b></div>
                  {cfgEnvio && alvos > cfgEnvio.tetoHoje ? (
                    <div className="conta-l"><span>Teto de hoje neste número</span><b>{cfgEnvio.tetoHoje}</b></div>
                  ) : null}
                  <div className="conta-l conta-t"><span>Vai custar</span>
                    <b>{brl(Math.min(alvos, cfgEnvio?.tetoHoje ?? alvos) * preco(tplAtivo?.categoria ?? "MARKETING"))}</b></div>
                </div>

                <div className="quando">
                  <div className="qw-tabs">
                    <button className={qwModo === "agora" ? "on" : ""}
                      onClick={() => setQwModo("agora")}>Agora</button>
                    <button className={qwModo === "depois" ? "on" : ""}
                      onClick={() => setQwModo("depois")}>Marcar dia e hora</button>
                  </div>
                  {qwModo === "depois" ? (
                    <>
                      <div className="qw-campos">
                        <input type="date" value={qwDia} min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setQwDia(e.target.value)} />
                        <input type="time" value={qwHora} min={ABRE} max={FECHA} step={300}
                          onChange={(e) => setQwHora(e.target.value)} />
                      </div>
                      {problemaDaHora
                        ? <p className="qw-erro">{problemaDaHora}</p>
                        : <p className="qw-ok">
                            Sai {marcado?.toLocaleString("pt-BR", {
                              weekday: "short", day: "2-digit", month: "2-digit",
                              hour: "2-digit", minute: "2-digit" })}. Dá para desmarcar até lá.
                          </p>}
                    </>
                  ) : (
                    <p className="qw-nota">
                      Disparo só sai entre <b>{ABRE}</b> e <b>{FECHA}</b>. Fora
                      disso o sistema segura e retoma na manhã seguinte — mensagem
                      à noite vira denúncia, e denúncia derruba o número.
                    </p>
                  )}
                </div>

                <button className="btn wa go"
                  disabled={disparando || !alvos || !tplSel || !!problemaDaHora
                    || (destino === "escolher" && !marcados.size)}
                  onClick={dispararAgora}>
                  {disparando ? "Disparando…"
                    : qwModo === "depois"
                      ? `Marcar para ${Math.min(alvos, cfgEnvio?.tetoHoje ?? alvos)} pessoas`
                      : `Disparar para ${Math.min(alvos, cfgEnvio?.tetoHoje ?? alvos)} pessoas`}
                </button>

                {/* O aviso de preço só quando ele muda alguma coisa: repetido em
                    mensagem que já é Utilidade, vira ruído e para de ser lido. */}
                {tplAtivo?.categoria === "MARKETING" ? (
                  <div className="aviso">
                    <svg viewBox="0 0 24 24"><path d="M12 8.5v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
                    <div>Esta é <b>Marketing</b>, {brl(d.precos.marketing)} por mensagem.
                      Se for aviso de verdade — e não oferta — refazer como Utilidade
                      custa {brl(d.precos.utility)} e economiza{" "}
                      <b>{brl((d.precos.marketing - d.precos.utility) * Math.min(alvos, cfg?.tetoHoje ?? alvos))}</b> neste disparo.</div>
                  </div>
                ) : null}

                {agendados.length ? (
                  <div className="marcados">
                    <b>Já marcados</b>
                    {agendados.map((c) => (
                      <div className="mk" key={c.id}>
                        <span>
                          <i>{new Date(c.marcadaPara!).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</i>
                          {c.nome} · {c.alvos} pessoas
                        </span>
                        <button onClick={() => desmarcar(c.id)}>desmarcar</button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <details className="fluxo-d">
                  <summary>O que acontece quando a pessoa responder</summary>
                <div className="fluxo">
                  <div className="fluxo-p"><i>1</i><div>A pessoa responde a mensagem.</div></div>
                  <div className="fluxo-p"><i>2</i><div>O sistema <b>cria o lead</b> com a etiqueta
                    <b> levantou a mão no disparo</b> e entrega para quem você escolheu acima.</div></div>
                  <div className="fluxo-p"><i>3</i><div>O corretor <b>recebe no WhatsApp</b> o aviso
                    com nome, telefone e o link da conversa — igual ao aviso de lead de anúncio.</div></div>
                  <div className="fluxo-p"><i>4</i><div>O lead aparece no painel dele como qualquer
                    outro, e a conversa fica aqui em <b>Respostas</b>, onde você pode entrar.</div></div>
                </div>
                </details>
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
    <div className="mgr10 app2 disparar">
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
