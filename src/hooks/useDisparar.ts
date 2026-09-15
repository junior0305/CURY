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
  /** quem mandou, do nosso lado */
  autor: string | null;
  ehTemplate: boolean;
}

export interface DadosDisparar {
  config: ConfigWA | null;
  /** os números da equipe, incluindo quem ainda não conectou */
  numeros: { nome: string; profileId: string; config: ConfigWA | null }[];
  templates: Template[];
  campanhas: Campanha[];
  conversas: Conversa[];
  publicos: { chave: string; titulo: string; sub: string; n: number }[];
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
          .select("broker_id,status,last_interaction_at,last_broker_whatsapp_at,created_at,contact_attempts")
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
        novo: c.onboarded_at ? horas(c.onboarded_at) / 24 < 30 : false,
        tetoHoje: tetoDoDia(c.onboarded_at, c.tier),
      });
      // a minha: a que eu conectei, senão a da casa (sem dono)
      const minha = cfgs.find((c) => c.owner_id === managerId)
        ?? cfgs.find((c) => !c.owner_id && c.is_active !== false) ?? null;

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
          janelaAberta: horas(t.last_inbound_at) < 24,
          naoLidas: t.unread ?? 0,
        }));

      /* ── públicos, iguais aos da aba Leads ── */
      const leads = (leadsRes.data ?? []) as any[];
      const ativo = (l: any) => !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
      const parado = (l: any) => l.last_interaction_at ?? l.last_broker_whatsapp_at ?? l.created_at;
      const ativos = leads.filter(ativo);
      const publicos = [
        { chave: "sem15", titulo: "Sem movimento há mais de 15 dias",
          sub: "da carteira do seu time",
          n: ativos.filter((l) => horas(parado(l)) > 360).length },
        { chave: "sem7", titulo: "Sem movimento há mais de 7 dias",
          sub: "esfriaram mas são recentes",
          n: ativos.filter((l) => { const h = horas(parado(l)); return h > 168 && h <= 360; }).length },
        { chave: "nunca", titulo: "Ninguém nunca falou com eles",
          sub: "leads pagos e intocados",
          n: ativos.filter((l) => !l.last_broker_whatsapp_at && !l.contact_attempts).length },
      ].filter((p) => p.n > 0);

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
        texto: m.body ?? m.text ?? m.content ?? null,
        quando: m.created_at,
        autor: m.sent_by_name ?? m.author ?? null,
        ehTemplate: !!m.template_id || m.type === "template",
      }));
    },
  });
}

/* ────────────────────────────────────────────────────────────── ações */

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
}) {
  const { data, error } = await supabase.functions.invoke("wa-template", { body: t });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function mandarMensagem(threadId: string, telefone: string, texto: string) {
  const { data, error } = await supabase.functions.invoke("wa-sender", {
    body: { to: telefone, text: texto, thread_id: threadId, sent_by: "gerente" },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}
