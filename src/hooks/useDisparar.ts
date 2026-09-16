// ABA DISPARAR — falar com muita gente de uma vez, pelo WhatsApp oficial.
//
// Quatro etapas: o número que envia, as mensagens aprovadas, o disparo, e as
// respostas. O que amarra tudo é a aprovação da Meta: mensagem não aprovada
// não pode ser disparada, e a categoria errada custa quatro vezes mais.
//
// ⚠️ O achado que motivou metade desta tela: 34 pessoas responderam ao disparo
// e 17 ficaram sem retorno, porque `target_queue_id` e `target_broker_id` já
// existiam na tabela de campanhas e nunca foram usados. A resposta não ia para
// lugar nenhum.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConfigWA {
  id: string;
  label: string | null;
  displayNumber: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  status: string | null;
  quality: string | null;
  tier: string | null;
  coexistence: boolean | null;
  ownerId: string | null;
  onboardedEm: string | null;
  /** número com menos de 30 dias entra em aquecimento */
  novo: boolean;
  /** teto de hoje, considerando o aquecimento */
  tetoHoje: number;
}

export interface Template {
  id: string;
  nome: string;
  categoria: string;
  idioma: string;
  corpo: string;
  rodape: string | null;
  headerTipo: string | null;
  headerImagem: string | null;
  botoes: any[] | null;
  variaveis: string[];
  status: string | null;
  metaId: string | null;
}

export interface Campanha {
  id: string;
  nome: string;
  status: string | null;
  alvos: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  respostas: number;
  falhas: number;
  custo: number | null;
  criadaEm: string | null;
}

export interface Conversa {
  id: string;
  telefone: string;
  cliente: string | null;
  corretor: string | null;
  brokerId: string | null;
  leadId: string | null;
  ultimaEntrada: string | null;
  ultimaSaida: string | null;
  /** o cliente falou por último e ninguém voltou */
  esperando: boolean;
  /** dá para escrever livremente (24h da última mensagem dele) */
  janelaAberta: boolean;
  naoLidas: number;
}

export interface Mensagem {
  id: string;
  direcao: "entrada" | "saida";
  texto: string | null;
  quando: string;
  /** quem mandou, do nosso lado — nulo quando saiu pelo robô ou pelo corretor */
  sentBy: string | null;
  ehTemplate: boolean;
}

export interface Alvo { leadId: string; nome: string | null; telefone: string }

export interface DadosDisparar {
  config: ConfigWA | null;
  /** os números da equipe, incluindo quem ainda não conectou */
  numeros: { nome: string; profileId: string; config: ConfigWA | null }[];
  templates: Template[];
  campanhas: Campanha[];
  conversas: Conversa[];
  /** cada lista já traz as pessoas, porque o disparo insere os alvos um a um */
  publicos: { chave: string; titulo: string; sub: string; n: number; gente: Alvo[] }[];
  corretores: { id: string; nome: string; online: boolean; carteira: number }[];
  precos: { marketing: number; utility: number };
}

const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;

/** Meta começa todo número novo em 250 conversas/dia. Disparar mil de uma vez
 *  não sobe de degrau — derruba a qualidade e restringe o número. */
function tetoDoDia(onboardedEm: string | null, tier: string | null) {
  const d = onboardedEm ? horas(onboardedEm) / 24 : 999;
  if (d < 1) return 50;
  if (d < 2) return 100;
  if (d < 4) return 200;
  if (d < 30) return 250;
  const porTier: Record<string, number> = {
    TIER_250: 250, TIER_1K: 1000, TIER_10K: 10000, TIER_100K: 100000,
    base: 250, "1k": 1000, "10k": 10000,
  };
  return porTier[tier ?? ""] ?? 1000;
}

function varsDoCorpo(corpo: string, declaradas: any): string[] {
  if (Array.isArray(declaradas) && declaradas.length) return declaradas.map(String);
  return [...new Set([...(corpo ?? "").matchAll(/\{\{\s*([\wÀ-ÿ]+)\s*\}\}/g)].map((m) => m[1]))];
}

export function useDisparar(managerId: string | undefined) {
  return useQuery<DadosDisparar>({
    queryKey: ["disparar", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      // O status do template muda NA META, não aqui. Sem puxar antes de listar,
      // o que foi aprovado continua aparecendo como "em análise" para sempre —
      // e some da lista de disparo, que só aceita aprovado.
      await supabase.functions.invoke("wa-template", {
        body: { action: "refresh", owner_id: managerId },
      }).catch(() => {});

      const [cfgRes, timeRes, tplRes, campRes, thrRes, leadsRes, precoRes] = await Promise.all([
        supabase.from("whatsapp_config").select("*"),
        supabase.from("profiles").select("id,first_name,last_name,last_seen_at")
          .eq("manager_id", managerId!).eq("role", "BROKER"),
        supabase.from("whatsapp_templates").select("*").order("created_at", { ascending: false }),
        supabase.from("whatsapp_campaigns")
          .select("id,name,status,audience_count,sent_count,delivered_count,read_count,reply_count,failed_count,cost_total,created_at")
          .order("created_at", { ascending: false }).limit(15),
        // `select("*")` de propósito: o esquema do disparador foi crescendo por
        // migração e nem todo ambiente tem as mesmas colunas — listar uma que
        // falte derruba a consulta inteira, e a tela fica vazia sem dizer por quê.
        supabase.from("whatsapp_threads").select("*")
          .order("last_inbound_at", { ascending: false, nullsFirst: false }).limit(60),
        supabase.from("leads")
          .select("id,name,phone,broker_id,status,last_interaction_at,last_broker_whatsapp_at,created_at,contact_attempts")
          .eq("manager_id", managerId!),
        supabase.from("system_settings").select("key,value")
          .in("key", ["wa_preco_marketing", "wa_preco_utility"]),
      ]);

      const time = (timeRes.data ?? []) as any[];
      const nomePor = new Map<string, string>(time.map((b: any) =>
        [b.id, [b.first_name, b.last_name].filter(Boolean).join(" ") || "—"]));

      /* ── configurações de WhatsApp ── */
      const cfgs = (cfgRes.data ?? []) as any[];
      const monta = (c: any): ConfigWA => ({
        id: c.id, label: c.label, displayNumber: c.display_number,
        wabaId: c.waba_id, phoneNumberId: c.phone_number_id,
        status: c.status, quality: c.quality, tier: c.tier,
        coexistence: c.coexistence, ownerId: c.owner_id, onboardedEm: c.onboarded_at,
        // Qualidade medida = tem historico = nao e novo, por mais recente que
        // seja a data. Chamar de "novo" um numero GREEN que trabalha ha semanas
        // faz o aviso de aquecimento perder o sentido onde ele importa.
        novo: (c.quality ?? 'UNKNOWN') === 'UNKNOWN'
          && (c.onboarded_at ? horas(c.onboarded_at) / 24 < 30 : false),
        tetoHoje: tetoDoDia(c.onboarded_at, c.tier),
      });
      // A minha: a que eu conectei E que está ativa. Sem o `is_active` a tela
      // dizia "conectado e liberado para enviar" mostrando uma configuração
      // desativada — o pior tipo de erro, o que afirma o contrário do que é.
      const ativa = (c: any) => c.is_active !== false && c.status !== 'pendente';
      const minha = cfgs.find((c) => c.owner_id === managerId && ativa(c))
        ?? cfgs.find((c) => !c.owner_id && ativa(c)) ?? null;

      const numeros = time.map((b: any) => ({
        nome: nomePor.get(b.id) ?? "—", profileId: b.id,
        config: cfgs.find((c) => c.owner_id === b.id) ? monta(cfgs.find((c) => c.owner_id === b.id)) : null,
      }));

      /* ── templates ── */
      const templates: Template[] = ((tplRes.data ?? []) as any[]).map((t) => ({
        id: t.id, nome: t.name, categoria: t.category ?? "MARKETING",
        idioma: t.language ?? "pt_BR", corpo: t.body_text ?? "",
        rodape: t.footer_text, headerTipo: t.header_type, headerImagem: t.header_image_url,
        botoes: t.buttons, variaveis: varsDoCorpo(t.body_text ?? "", t.variables),
        status: t.meta_status, metaId: t.meta_template_id,
      }));

      /* ── campanhas ── */
      const campanhas: Campanha[] = ((campRes.data ?? []) as any[]).map((c) => ({
        id: c.id, nome: c.name ?? "—", status: c.status,
        alvos: c.audience_count ?? 0, enviadas: c.sent_count ?? 0,
        entregues: c.delivered_count ?? 0, lidas: c.read_count ?? 0,
        respostas: c.reply_count ?? 0, falhas: c.failed_count ?? 0,
        custo: c.cost_total, criadaEm: c.created_at,
      }));

      /* ── conversas ── */
      const conversas: Conversa[] = ((thrRes.data ?? []) as any[])
        .filter((t) => t.last_inbound_at)
        .map((t) => ({
          id: t.id, telefone: t.phone, cliente: t.contact_name,
          corretor: t.assigned_broker_id ? (nomePor.get(t.assigned_broker_id) ?? null) : null,
          brokerId: t.assigned_broker_id ?? null, leadId: t.lead_id ?? null,
          ultimaEntrada: t.last_inbound_at, ultimaSaida: t.last_outbound_at,
          esperando: !t.last_outbound_at || t.last_outbound_at < t.last_inbound_at,
          // `window_open_until` é a conta que o wa-webhook já fez quando a
          // mensagem chegou. Recalcular aqui daria outro resultado sempre que os
          // relógios divergissem — e é essa coluna que o wa-sender consulta
          // para decidir se aceita ou recusa o envio.
          janelaAberta: t.window_open_until
            ? new Date(t.window_open_until) > new Date()
            : horas(t.last_inbound_at) < 24,
          naoLidas: t.unread ?? 0,
        }));

      /* ── públicos, iguais aos da aba Leads ── */
      const leads = (leadsRes.data ?? []) as any[];
      const ativo = (l: any) => !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
      const parado = (l: any) => l.last_interaction_at ?? l.last_broker_whatsapp_at ?? l.created_at;
      const ativos = leads.filter(ativo);
      const alvo = (l: any): Alvo => ({ leadId: l.id, nome: l.name ?? null, telefone: l.phone ?? "" });
      const comTel = (l: any) => !!l.phone;
      const publicos = [
        { chave: "sem15", titulo: "Sem movimento há mais de 15 dias",
          sub: "da carteira do seu time",
          gente: ativos.filter((l) => comTel(l) && horas(parado(l)) > 360).map(alvo) },
        { chave: "sem7", titulo: "Sem movimento há mais de 7 dias",
          sub: "esfriaram mas são recentes",
          gente: ativos.filter((l) => { const h = horas(parado(l)); return comTel(l) && h > 168 && h <= 360; }).map(alvo) },
        { chave: "nunca", titulo: "Ninguém nunca falou com eles",
          sub: "leads pagos e intocados",
          gente: ativos.filter((l) => comTel(l) && !l.last_broker_whatsapp_at && !l.contact_attempts).map(alvo) },
      ].map((p) => ({ ...p, n: p.gente.length })).filter((p) => p.n > 0);

      const carteiraPor = new Map<string, number>();
      for (const l of ativos) if (l.broker_id)
        carteiraPor.set(l.broker_id, (carteiraPor.get(l.broker_id) ?? 0) + 1);

      const precos = { marketing: 0.30, utility: 0.08 };
      for (const p of ((precoRes.data ?? []) as any[])) {
        const v = Number(String(p.value).replace(",", "."));
        if (!Number.isNaN(v)) {
          if (p.key === "wa_preco_marketing") precos.marketing = v;
          if (p.key === "wa_preco_utility") precos.utility = v;
        }
      }

      return {
        config: minha ? monta(minha) : null,
        numeros, templates, campanhas, conversas, publicos,
        corretores: time.map((b: any) => ({
          id: b.id, nome: nomePor.get(b.id) ?? "—",
          online: horas(b.last_seen_at) < 0.25,
          carteira: carteiraPor.get(b.id) ?? 0,
        })).sort((a, b) => a.nome.localeCompare(b.nome)),
        precos,
      };
    },
  });
}

/* ── a conta de WhatsApp da casa ──────────────────────────────────────────
   Uma conta só, com um número por gerente. O caminho de uma conta por gerente
   exigia CNPJ, domínio e verificação de negócio de cada um, e travou dias nisso.
   Na conta da casa, que já é verificada:
     · o limite de envio é POR NÚMERO (250 cada) e não se divide;
     · banimento por comportamento atinge o número, não a conta;
     · a forma de pagamento pode ser por número.                              */

export interface NumeroCasa {
  phone_number_id: string;
  numero: string;
  nome: string | null;
  qualidade: string | null;
  status: string | null;
  teto: string | null;
  verificado: boolean;
  donoId: string | null;
  donoLabel: string | null;
  /** o número da empresa, que atende quem ainda não tem o próprio */
  compartilhado: boolean;
}

export function useNumerosCasa(habilitado: boolean) {
  return useQuery<NumeroCasa[]>({
    queryKey: ["numeros-casa"],
    enabled: habilitado,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("wa-onboard", {
        body: { action: "listar_casa" },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      return (d?.numeros ?? []).map((n: any) => ({
        phone_number_id: n.phone_number_id, numero: n.numero, nome: n.nome,
        qualidade: n.qualidade, status: n.status, teto: n.teto,
        verificado: n.verificado, donoId: n.dono_id, donoLabel: n.dono_label,
        compartilhado: !!n.compartilhado,
      }));
    },
  });
}

/** Lê um CSV de nome e telefone. Aceita vírgula ou ponto e vírgula, com ou sem
 *  cabeçalho — o gerente exporta de onde conseguir e não deve ter que arrumar. */
export function lerCsv(texto: string): { leadId: string; nome: string | null; telefone: string }[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = /nome|name|telefone|phone|celular/i.test(linhas[0]);
  const fora: { leadId: string; nome: string | null; telefone: string }[] = [];
  const vistos = new Set<string>();
  for (const l of linhas.slice(cab ? 1 : 0)) {
    const p = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    // A coluna do telefone é a que tem dígitos suficientes — não a segunda,
    // porque metade dos arquivos vem com as colunas trocadas.
    const tel = p.map((x) => x.replace(/\D/g, "")).find((d) => d.length >= 10);
    if (!tel || vistos.has(tel)) continue;
    vistos.add(tel);
    const nome = p.find((x) => /[a-zA-ZÀ-ÿ]{2,}/.test(x) && x.replace(/\D/g, "").length < 6) ?? null;
    fora.push({ leadId: "", nome, telefone: tel });
  }
  return fora;
}

/* ── cadastrar o próprio número, sem sair do Comandra ─────────────────────
   Três passos, e o gerente não abre o painel da Meta em nenhum deles. O token
   de sistema da empresa tem permissão para adicionar número — foi testado, e a
   recusa que aparecia era "número em uso", não falta de permissão.          */

export async function adicionarNumero(numero: string, nomeExibicao: string) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "adicionar", numero, nome_exibicao: nomeExibicao },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) { const e = new Error(d.error); (e as any).emUso = !!d.em_uso; throw e; }
  return d as { phone_number_id: string; numero: string };
}

/** A Meta manda o código. Voz serve para fixo, que não recebe SMS. */
export async function pedirCodigo(phoneNumberId: string, metodo: "SMS" | "VOICE" = "SMS") {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "codigo", phone_number_id: phoneNumberId, metodo },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function confirmarCodigo(
  phoneNumberId: string, codigo: string, ownerId: string, label: string,
) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "confirmar", phone_number_id: phoneNumberId, codigo,
            owner_id: ownerId, label },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  return d as { ok: boolean; pendencia: string | null };
}

/** O gerente fica com um número da conta da casa. Registra e vincula ao login. */
export async function assumirNumero(phoneNumberId: string, ownerId: string, label: string) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "assumir", phone_number_id: phoneNumberId, owner_id: ownerId, label },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  return d as { ok: boolean; pendencia: string | null };
}

/** Solta o número: ele fica na conta da empresa e deixa de ser seu.
 *  Reversível — é o caso de quem trocou de número ou saiu. */
export async function soltarNumero(phoneNumberId: string, ownerId: string) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "soltar", phone_number_id: phoneNumberId, owner_id: ownerId },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

/** Apaga o número da conta na Meta. NÃO tem volta: recolocar é cadastro novo,
 *  com SMS de novo, e a reputação do número recomeça do zero. */
export async function removerNumero(phoneNumberId: string, ownerId: string) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "remover", phone_number_id: phoneNumberId, owner_id: ownerId },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

/** O que o cliente vê ao abrir a conversa: foto, recado e descrição.
 *  O NOME de exibição não está aqui de propósito — trocar nome passa por
 *  análise da Meta, e juntar as duas coisas num botão só faria parecer que o
 *  nome mudou na hora. */
export async function salvarPerfilNumero(phoneNumberId: string, p: {
  sobre?: string; descricao?: string; site?: string;
  foto_url?: string | null; owner_id?: string;
}) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "perfil", phone_number_id: phoneNumberId, ...p },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

/** As mensagens de uma conversa. Só busca quando a conversa está aberta. */
export function useMensagens(threadId: string | null) {
  return useQuery<Mensagem[]>({
    queryKey: ["wa-msgs", threadId],
    enabled: !!threadId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_messages")
        .select("*").eq("thread_id", threadId!).order("created_at", { ascending: true }).limit(200);
      return ((data ?? []) as any[]).map((m) => ({
        id: m.id,
        direcao: m.direction === "inbound" ? "entrada" : "saida",
        texto: m.body ?? null,
        quando: m.created_at,
        sentBy: m.sent_by ?? null,
        ehTemplate: m.msg_type === "template" || !!m.template_name,
      }));
    },
  });
}

/* ────────────────────────────────────────────────────────────── ações */

/** Foto de perfil: quadrada e grande. A Meta recusa abaixo de 192×192 com
 *  "resolução baixa", e a maioria das fotos que alguém tem à mão no celular
 *  é retangular — cortar pelo centro é o que ela espera. */
export function ajustarFoto(file: File): Promise<string> {
  const L = 640;
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = L; cv.height = L;
      const ctx = cv.getContext("2d");
      if (!ctx) { erro(new Error("navegador não deixou ajustar a imagem")); return; }
      const e = Math.max(L / img.width, L / img.height);
      const w = img.width * e, h = img.height * e;
      ctx.drawImage(img, (L - w) / 2, (L - h) / 2, w, h);
      ok(cv.toDataURL("image/jpeg", 0.92));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => erro(new Error("não consegui ler essa imagem"));
    img.src = URL.createObjectURL(file);
  });
}

/** Corta pelo centro no formato que o WhatsApp mostra (≈1,91:1), sem deformar.
 *  Ninguém vai abrir editor de imagem para disparar. */
export function ajustarImagem(file: File): Promise<{ dataUrl: string; orig: { w: number; h: number }; mudou: boolean }> {
  const W = 1125, H = 590;
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) { erro(new Error("navegador não deixou ajustar a imagem")); return; }
      const e = Math.max(W / img.width, H / img.height);
      const w = img.width * e, h = img.height * e;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      ok({ dataUrl: cv.toDataURL("image/jpeg", 0.9),
           orig: { w: img.width, h: img.height },
           mudou: Math.abs(img.width / img.height - W / H) > 0.08 });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => erro(new Error("não consegui ler essa imagem"));
    img.src = URL.createObjectURL(file);
  });
}

/** A imagem precisa de um endereço público antes de ir para a Meta: ela baixa
 *  o arquivo para aprovar o template, e depois busca de novo a cada disparo.
 *  Arquivo do computador não serve — some no instante em que a aba fecha. */
export async function subirImagem(dataUrl: string): Promise<string> {
  const bin = await (await fetch(dataUrl)).blob();
  const nome = `template/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("wa-media")
    .upload(nome, bin, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Não consegui guardar a imagem: ${error.message}`);
  const { data } = supabase.storage.from("wa-media").getPublicUrl(nome);
  if (!data?.publicUrl) throw new Error("A imagem subiu mas não consegui o endereço dela.");
  return data.publicUrl;
}

/** Palavras que fazem o classificador da Meta ler como oferta. Avisar antes é
 *  melhor que descobrir na reclassificação, quando já se pagou marketing. */
const CHEIRO_OFERTA = [
  /\bdesconto\b/i, /\bpromo/i, /\boferta\b/i, /\bimperd/i, /\baproveite\b/i,
  /\bR\$\s?\d/, /\d+\s?%/, /\búltim[ao]s?\s+(dias|vagas|unidades)/i,
  /\bcorra\b/i, /\bgr[áa]tis\b/i, /\bfeir[ãa]o\b/i, /\bcondi[çc][ãa]o especial\b/i,
];
export function cheiraOferta(texto: string) {
  return CHEIRO_OFERTA.some((r) => r.test(texto));
}

/** A Meta recusa nome de exibição que não tenha relação com o negócio. */
export function checarNome(nome: string, marca = "Cury") {
  const v = nome.trim();
  if (!v) return { ok: false, sugestao: null as string | null, texto: "" };
  if (v.toLowerCase().includes(marca.toLowerCase()))
    return { ok: true, sugestao: null, texto: `Deve passar — carrega a marca ${marca}.` };
  return { ok: false, sugestao: `${v.replace(/\s+/g, "-")}-${marca}`,
    texto: `"${v}" provavelmente é recusado. A Meta exige que o nome tenha relação com o negócio.` };
}

export async function criarTemplate(t: {
  name: string; body_text: string; category: string; language?: string;
  header_type?: string; header_image_url?: string | null;
  footer_text?: string | null; buttons?: any[]; variables?: string[];
  /** um exemplo por variável nomeada — a Meta RECUSA sem isso, e não diz qual faltou */
  exemplos?: Record<string, string>;
  /** quando preenchido, EDITA essa mensagem em vez de criar outra */
  meta_template_id?: string | null;
  /** de quem é o número — sem isto o template nasce na conta da casa e o
   *  disparo pelo número do gerente falha por template inexistente */
  owner_id?: string;
}) {
  const { data, error } = await supabase.functions.invoke("wa-template", { body: t });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function mandarMensagem(
  threadId: string, telefone: string, texto: string, sentBy: string,
) {
  const { data, error } = await supabase.functions.invoke("wa-sender", {
    body: { to: telefone, text: texto, thread_id: threadId, sent_by: sentBy,
            owner_id: sentBy },
  });
  if (error) throw error;
  // O wa-sender devolve 200 com `error` no corpo quando recusa (janela fechada,
  // opt-out): sem olhar o corpo, a tela diria "enviada" e nada teria saído.
  const d = data as any;
  if (d?.error) throw new Error(
    d.error === "window_closed"
      ? "Passou de 24h desde a última mensagem dele. Só template agora."
      : String(d.error));
  if (d?.skipped === "opt_out") throw new Error("Essa pessoa pediu para não receber mais.");
  return data;
}

/* ── o disparo ────────────────────────────────────────────────────────────
   Uma fila por gerente, reaproveitada a cada disparo. É ela que o wa-webhook
   consulta quando alguém responde: sem fila, a resposta não vira lead de
   ninguém — que é como 44 pessoas responderam e nenhuma foi atendida.        */
async function filaDoGerente(managerId: string, brokerIds: string[]) {
  const nome = `DISPARO_${managerId.slice(0, 8).toUpperCase()}`;
  const { data: existe } = await supabase.from("distribution_queues")
    .select("id").eq("name", nome).maybeSingle();
  if (existe) {
    await supabase.from("distribution_queues")
      .update({ broker_ids: brokerIds, is_active: true }).eq("id", existe.id);
    return existe.id as string;
  }
  const { data, error } = await supabase.from("distribution_queues").insert({
    name: nome, match_field: "campanha", match_value: nome,
    broker_ids: brokerIds, is_active: true, last_assigned_index: 0,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function dispararCampanha(opts: {
  managerId: string;
  nome: string;
  templateId: string;
  alvos: { leadId: string; nome: string | null; telefone: string }[];
  /** valor de cada variável do template; `nome` fica de fora, vem do alvo */
  vars: Record<string, string>;
  brokerIds: string[];
  configId: string | null;
}) {
  if (!opts.alvos.length) throw new Error("Nenhuma pessoa na seleção.");
  const queueId = await filaDoGerente(opts.managerId, opts.brokerIds);

  // Nasce em `draft`: o cron só pega quem está em `sending`, e ninguém deve
  // começar a disparar com a lista de alvos pela metade.
  const { data: camp, error } = await supabase.from("whatsapp_campaigns").insert({
    name: opts.nome, template_id: opts.templateId,
    audience_source: "csv",            // alvos vão inseridos, não resolvidos
    audience_count: opts.alvos.length,
    target_queue_id: queueId, vars: opts.vars,
    wa_config_id: opts.configId, owner_id: opts.managerId, created_by: opts.managerId,
    status: "draft", throttle_per_min: 10,
  }).select("id").single();
  if (error) throw error;

  const linhas = opts.alvos.map((a) => ({
    campaign_id: camp.id, phone: a.telefone.replace(/\D/g, ""),
    name: a.nome, lead_id: a.leadId || null, status: "pending",
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error: e2 } = await supabase.from("whatsapp_campaign_targets").insert(linhas.slice(i, i + 500));
    if (e2) throw e2;
  }

  await supabase.from("whatsapp_campaigns")
    .update({ status: "sending", approved_by: opts.managerId, approved_at: new Date().toISOString() })
    .eq("id", camp.id);

  // Empurra o primeiro lote agora; o cron `wa-campaign-runner-tick` (a cada 2
  // minutos) continua de onde este parar.
  await supabase.functions.invoke("wa-campaign-runner", { body: { campaign_id: camp.id } });
  return camp.id as string;
}
