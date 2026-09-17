// ABA LEADS — o que chegou, com quem está, e no que deu.
//
// O gerente de 40 pessoas não trabalha lead a lead: ele redistribui, cobra e
// descarta. Por isso a tela é organizada por FILA DE PROBLEMA, com ação em
// lote, e a lista individual mora dentro de cada fila.
//
// Três honestidades que a tela carrega:
//   · negociação e documentos dependem do corretor mexer no status → vêm por
//     baixo do que aconteceu de verdade;
//   · visita e venda vêm da Cury com o nome do CORRETOR, não do cliente — dá
//     para dizer quantas o time fez, não qual lead virou qual visita;
//   · lead bloqueado por DDD perde o gerente (o trigger zera broker_id), então
//     a dona dele é a campanha.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadLinha {
  id: string;
  nome: string | null;
  telefone: string | null;
  corretor: string | null;
  brokerId: string | null;
  /** dias no estado que colocou ele nesta fila */
  dias: number;
  campanha: string | null;
}

export interface Fila {
  chave: string;
  tom: "crit" | "warn" | "info";
  titulo: string;
  porque: string;
  total: number;
  leads: LeadLinha[];
  acoes: string[];
  /** quando vale sugerir disparo em massa pela API oficial */
  disparo?: { qtd: number; custo: number };
}

export type Situacao = "conversando" | "esperando" | "primeiro_toque" | "boas_vindas" | "parado";

export interface LeadDetalhe {
  id: string;
  nome: string | null;
  telefone: string | null;
  corretor: string | null;
  brokerId: string | null;
  situacao: Situacao;
  dias: number;
}

export interface DadosLeads {
  chegaram: number;
  encaminhados: number;
  perdidos: number;
  chegaramHoje: number;
  /** de onde vieram os que chegaram no período — o card do topo */
  origem: { anuncio: number; app: number; disparo: number; proprio: number;
            redes: { facebook: number; google: number; tiktok: number };
            hoje: { anuncio: number; app: number; disparo: number; proprio: number };
            /** os leads de cada origem, para abrir o card e ver um por um */
            leads: { anuncio: LeadDetalhe[]; app: LeadDetalhe[];
                     disparo: LeadDetalhe[]; proprio: LeadDetalhe[] } };
  /** o gerente pode espiar a conversa corretor↔cliente? (system_settings) */
  verConversa: boolean;
  conversa: { perguntouSemResposta: number; nuncaFalaram: number;
              falouSemResposta: number; emAndamento: number };
  filas: Fila[];
  resultado: { negociacao: number; documentos: number; visitas: number; vendas: number };
  porCorretorVisita: { nome: string; n: number }[];
  porCorretorVenda: { nome: string; n: number }[];
  negociando: LeadLinha[];
  documentos: LeadLinha[];
  descartes: { motivo: string; n: number; auto: boolean }[];
  disparo: { enviadas: number; alvos: number; pendentes: number; responderam: number;
             semRetorno: number; campanhas: { nome: string; status: string; env: number; resp: number }[] };
  pool: { nome: string; fila: number; contatou: number; trouxe: number }[];
  corretores: { id: string; nome: string; online: boolean; plantao: boolean; carteira: number }[];
  periodo: { de: string; ate: string; rotulo: string };
}

/* ── de onde veio o lead ───────────────────────────────────────────────
   Quatro origens que o gerente reconhece: anúncio, app da Cury, disparo e
   próprio. Dentro de anúncio, a rede — hoje só Facebook chega pelo Make, mas
   a estrutura já separa Google e TikTok para quando entrarem, em vez de somar
   tudo em "anúncio" e ter que refazer depois.

   O sinal é o `source` gravado na entrada. `fb_campaign`/tag ajudam a apartar
   disparo de anúncio, que hoje compartilham o mesmo source `facebook_make`. */
export type OrigemLead = "anuncio" | "app" | "disparo" | "proprio";
export type Rede = "facebook" | "google" | "tiktok" | null;

export function origemLead(l: { source?: string | null; fb_campaign?: string | null;
                                tag?: string | null; original_broker_id?: string | null }):
                                { origem: OrigemLead; rede: Rede } {
  const src = (l.source ?? "").toLowerCase();
  const tag = (l.fb_campaign ?? l.tag ?? "").toUpperCase();

  // disparo primeiro: hoje ele chega com source facebook_make e só a tag
  // DISPARO_ o distingue do anúncio de verdade.
  if (src === "wa_oficial" || src === "campaign" || tag.startsWith("DISPARO")) {
    return { origem: "disparo", rede: null };
  }
  // app da Cury: lead que a Cury distribui no plantão (ainda a ligar na entrada)
  if (src === "app_cury" || src === "cury" || src === "cury_app") {
    return { origem: "app", rede: null };
  }
  // anúncio pago, com a rede quando dá para saber
  if (src.startsWith("facebook") || src.startsWith("fb") || src === "instagram" || src === "ig") {
    return { origem: "anuncio", rede: "facebook" };
  }
  if (src.startsWith("google") || src === "gads" || src === "adwords") {
    return { origem: "anuncio", rede: "google" };
  }
  if (src.startsWith("tiktok") || src === "tt") {
    return { origem: "anuncio", rede: "tiktok" };
  }
  // repescagem, secretária, corretor, manual, cold_pool → trabalho próprio
  return { origem: "proprio", rede: null };
}

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;
const dias = (iso: string | null | undefined) => Math.floor(horas(iso) / 24);

/** Preço da mensagem de reativação na API oficial (utility). Fica em
 *  system_settings como wa_preco_utility; este é o default. */
const PRECO_MSG = 0.08;

export function useLeads(managerId: string | undefined,
                         janela: { de: string; ate: string; rotulo: string }) {
  const { de, ate, rotulo } = janela;
  return useQuery<DadosLeads>({
    queryKey: ["aba-leads", managerId, de, ate],
    enabled: !!managerId,
    staleTime: 3 * 60_000,
    queryFn: async () => {
      const fim = ate + "T23:59:59";
      const hoje = diaSP();

      const { data: cfgVer } = await supabase.from("system_settings")
        .select("value").eq("key", "manager_ver_conversa").maybeSingle();
      const verConversa = String((cfgVer as any)?.value ?? "true").replace(/"/g, "") === "true";

      const { data: perfil } = await supabase.from("profiles")
        .select("first_name").eq("id", managerId!).maybeSingle();
      const meuNome = (perfil as any)?.first_name ?? "";

      const { data: euCury } = await supabase.from("cury_pessoas")
        .select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const gerenteCuryId = (euCury as any)?.cury_id ?? null;

      const [timeRes, leadsRes, todosRes, curyRes, campRes, thrRes, poolRes, welcRes] = await Promise.all([
        supabase.from("profiles")
          .select("id,first_name,last_name,last_seen_at").eq("manager_id", managerId!).eq("role", "BROKER"),
        supabase.from("leads")
          .select("id,name,phone,status,broker_id,created_at,last_lead_response_at,last_broker_whatsapp_at,last_interaction_at,contact_attempts,lost_reason,fb_campaign,tag,source,original_broker_id,negotiating_since")
          .eq("manager_id", managerId!),
        // os bloqueados perdem o gerente — a dona é a campanha
        supabase.from("leads").select("geo_status,fb_campaign,created_at")
          .eq("geo_status", "fora_regiao").gte("created_at", de),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias")
              .select("apelido,profile_id,atendimentos,vendas,checkins,data")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", de).lte("data", ate)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("whatsapp_campaigns")
          .select("id,name,status,sent_count,reply_count,audience_count,owner_id")
          .order("created_at", { ascending: false }).limit(20),
        supabase.from("whatsapp_threads")
          .select("id,phone,contact_name,lead_id,last_inbound_at,last_outbound_at,assigned_broker_id")
          .not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }).limit(300),
        supabase.rpc("get_pool_stats"),
        // boas-vindas que o sistema mandou sozinho — para saber, por lead, se
        // o primeiro contato foi automático ou se ninguém falou ainda.
        supabase.from("automation_logs")
          .select("entity_id").eq("entity_type", "welcome").eq("status", "success")
          .gte("executed_at", de),
      ]);

      const time = (timeRes.data ?? []) as any[];
      const meus = (leadsRes.data ?? []) as any[];
      const nomePor = new Map<string, string>(
        time.map((b: any) => [b.id, [b.first_name, b.last_name].filter(Boolean).join(" ") || "—"]));

      const linha = (l: any, quando: string | null | undefined): LeadLinha => ({
        id: l.id, nome: l.name, telefone: l.phone,
        corretor: l.broker_id ? (nomePor.get(l.broker_id) ?? "—") : null,
        brokerId: l.broker_id ?? null, dias: dias(quando), campanha: l.fb_campaign ?? null,
      });

      const ativo = (l: any) => !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
      const ativos = meus.filter(ativo);
      const doPeriodo = meus.filter((l) => (l.created_at ?? "") >= de && (l.created_at ?? "") <= fim);

      /* ── o caminho: chegou → foi para alguém → se perdeu ── */
      const bloq = ((todosRes as any).data ?? []).filter((l: any) =>
        (l.fb_campaign ?? "").toUpperCase().includes(meuNome.toUpperCase()));
      const chegaram = doPeriodo.length + bloq.length;

      // Boas-vindas que o sistema mandou sozinho, por lead. É o que separa
      // "ninguém falou" de "o robô falou mas o corretor não".
      const teveWelcome = new Set<string>(
        ((welcRes as any).data ?? []).map((w: any) => w.entity_id).filter(Boolean));

      // A situação de um lead: dos dois lados conversando até parado no escuro.
      // Sai só do que o lead já carrega — nada de mais uma volta ao banco.
      const situacaoDe = (l: any): Situacao => {
        const toque = l.last_broker_whatsapp_at;
        const resp = l.last_lead_response_at;
        if (resp && toque) {
          // se a última foi do cliente, ele está esperando; senão, andando
          return resp > toque ? "esperando" : "conversando";
        }
        if (resp && !toque) return "esperando";      // respondeu o disparo/robô, corretor mudo
        if (toque) return "primeiro_toque";          // corretor falou, cliente ainda não
        if (teveWelcome.has(l.id)) return "boas_vindas";  // só o robô falou
        return "parado";                             // ninguém falou
      };

      // De onde vieram — o card do topo. Conta o período e, à parte, os de hoje.
      const origem = { anuncio: 0, app: 0, disparo: 0, proprio: 0,
        redes: { facebook: 0, google: 0, tiktok: 0 },
        hoje: { anuncio: 0, app: 0, disparo: 0, proprio: 0 },
        leads: { anuncio: [] as LeadDetalhe[], app: [] as LeadDetalhe[],
                 disparo: [] as LeadDetalhe[], proprio: [] as LeadDetalhe[] } };
      for (const l of doPeriodo) {
        const { origem: o, rede } = origemLead(l);
        origem[o] += 1;
        if (rede) origem.redes[rede] += 1;
        if ((l.created_at ?? "").slice(0, 10) === hoje) origem.hoje[o] += 1;
        origem.leads[o].push({
          id: l.id, nome: l.name, telefone: l.phone,
          corretor: l.broker_id ? (nomePor.get(l.broker_id) ?? "—") : null,
          brokerId: l.broker_id ?? null, situacao: situacaoDe(l), dias: dias(l.created_at),
        });
      }
      // ordena cada lista pelo que precisa de ação primeiro
      const ordem: Record<Situacao, number> = {
        esperando: 0, parado: 1, boas_vindas: 2, primeiro_toque: 3, conversando: 4 };
      for (const k of ["anuncio", "app", "disparo", "proprio"] as const)
        origem.leads[k].sort((a, b) => ordem[a.situacao] - ordem[b.situacao]);
      // Lead barrado pelo geo é anúncio que a Cury não deixou entrar.
      origem.anuncio += bloq.length;
      origem.redes.facebook += bloq.length;
      const encaminhados = doPeriodo.filter((l) => l.broker_id).length;

      /* ── onde a conversa está ── */
      const respSemVolta = ativos.filter((l) => l.last_lead_response_at &&
        (!l.last_broker_whatsapp_at || l.last_broker_whatsapp_at < l.last_lead_response_at));
      const nuncaFalaram = ativos.filter((l) => !l.last_broker_whatsapp_at && !l.contact_attempts);
      const falouSemResp = ativos.filter((l) => l.last_broker_whatsapp_at && !l.last_lead_response_at);
      const emAndamento = ativos.filter((l) => l.last_lead_response_at && l.last_broker_whatsapp_at &&
        l.last_broker_whatsapp_at >= l.last_lead_response_at);

      /* ── as filas ── */
      const parado = (l: any) => l.last_interaction_at ?? l.last_broker_whatsapp_at ?? l.created_at;
      const sem7 = ativos.filter((l) => { const h = horas(parado(l)); return h > 168 && h <= 360; });
      const sem15 = ativos.filter((l) => horas(parado(l)) > 360);
      const semCorretor = ativos.filter((l) => !l.broker_id);

      const ord = (a: LeadLinha, b: LeadLinha) => b.dias - a.dias;
      const filas: Fila[] = [
        { chave: "respondeu", tom: "crit",
          titulo: "O cliente perguntou e ninguém voltou",
          porque: "Levantaram a mão e estão esperando. O convencimento já foi feito.",
          total: respSemVolta.length,
          leads: respSemVolta.map((l) => linha(l, l.last_lead_response_at)).sort(ord).slice(0, 8),
          acoes: ["Cobrar os corretores", "Redistribuir", "Descartar"] },
        { chave: "nunca", tom: "warn",
          titulo: "Ninguém nunca falou com esse cliente",
          porque: "Chegaram, foram para um corretor e nenhuma mensagem foi enviada. São leads pagos parados na mão.",
          total: nuncaFalaram.length,
          leads: nuncaFalaram.map((l) => linha(l, l.created_at)).sort(ord).slice(0, 8),
          acoes: ["Cobrar os corretores", "Redistribuir", "Descartar"] },
        { chave: "sem7", tom: "warn",
          titulo: "Sem movimento há mais de 7 dias",
          porque: "Esfriaram mas ainda são recentes. Um disparo pela API oficial reaquece a lista inteira.",
          total: sem7.length,
          leads: sem7.map((l) => linha(l, parado(l))).sort(ord).slice(0, 8),
          acoes: ["Disparar reativação", "Cobrar os corretores", "Redistribuir"],
          disparo: sem7.length ? { qtd: sem7.length, custo: sem7.length * PRECO_MSG } : undefined },
        { chave: "sem15", tom: "warn",
          titulo: "Sem movimento há mais de 15 dias",
          porque: "Não é fila para resolver hoje. O disparo em massa é o único jeito de falar com todos.",
          total: sem15.length,
          leads: sem15.map((l) => linha(l, parado(l))).sort(ord).slice(0, 8),
          acoes: ["Disparar reativação", "Redistribuir", "Descartar"],
          disparo: sem15.length ? { qtd: sem15.length, custo: sem15.length * PRECO_MSG } : undefined },
        { chave: "orfao", tom: "info",
          titulo: "Sem corretor",
          porque: semCorretor.length
            ? "Chegaram e não foram para ninguém. Cada hora aqui é lead esfriando."
            : "Nenhum lead da sua equipe está órfão agora. Quando aparecer um aqui, ele volta para o rodízio com um clique.",
          total: semCorretor.length,
          leads: semCorretor.map((l) => linha(l, l.created_at)).sort(ord).slice(0, 8),
          acoes: ["Distribuir"] },
      ].filter((f) => f.total > 0 || f.chave === "orfao");

      /* ── no que deu ── */
      const cury = ((curyRes as any).data ?? []) as any[];
      const agr = new Map<string, { at: number; vd: number }>();
      for (const c of cury) {
        const k = c.apelido ?? "—";
        const a = agr.get(k) ?? { at: 0, vd: 0 };
        a.at += c.atendimentos ?? 0; a.vd += c.vendas ?? 0;
        agr.set(k, a);
      }
      const negociando = meus.filter((l) => l.status === "NEGOTIATING");
      const documentos = meus.filter((l) => l.status === "DOCS_REQUESTED");

      /* ── descartes ── */
      const desc = meus.filter((l) => ["EXCLUDED", "ABANDONED"].includes(l.status ?? ""));
      const motivos = new Map<string, number>();
      for (const l of desc) motivos.set(l.lost_reason || "sem motivo",
        (motivos.get(l.lost_reason || "sem motivo") ?? 0) + 1);
      const ROTULO: Record<string, string> = {
        SEM_RETORNO_LONGO: "Sem retorno por muito tempo", SEM_RETORNO: "Sem retorno",
        DESISTIU: "Desistiu", NUMERO_ERRADO: "Número errado",
        FOI_CONCORRENTE: "Foi para o concorrente", JA_COMPROU: "Já comprou",
        JA_USOU_PROGRAMA: "Já usou o programa",
      };
      const descartes = [...motivos.entries()]
        .map(([k, n]) => ({ motivo: ROTULO[k] ?? k, n, auto: k === "SEM_RETORNO_LONGO" }))
        .sort((a, b) => b.n - a.n);

      /* ── disparador oficial ── */
      const camps = ((campRes as any).data ?? []) as any[];
      const minhas = camps.filter((c) => !c.owner_id || c.owner_id === managerId);
      const thr = ((thrRes as any).data ?? []) as any[];
      const semRetorno = thr.filter((t) =>
        !t.last_outbound_at || t.last_outbound_at < t.last_inbound_at);
      const disparo = {
        enviadas: minhas.reduce((a, c) => a + (c.sent_count ?? 0), 0),
        alvos: minhas.reduce((a, c) => a + (c.audience_count ?? 0), 0),
        pendentes: minhas.reduce((a, c) =>
          a + Math.max(0, (c.audience_count ?? 0) - (c.sent_count ?? 0)), 0),
        responderam: thr.length,
        semRetorno: semRetorno.length,
        campanhas: minhas.slice(0, 6).map((c) => ({
          nome: c.name ?? "—", status: c.status ?? "—",
          env: c.sent_count ?? 0, resp: c.reply_count ?? 0 })),
      };

      /* ── repescagem ── */
      const pool = (((poolRes as any).data ?? []) as any[])
        .filter((p) => (p.manager_name ?? "").toLowerCase() === meuNome.toLowerCase())
        .map((p) => ({ nome: p.broker_name ?? "—", fila: p.in_fila ?? 0,
                       contatou: p.contactados ?? 0, trouxe: p.promovidos_total ?? 0 }));

      /* ── corretores, para a redistribuição ── */
      const noPlantao = new Set(cury.filter((c) => (c.checkins ?? 0) > 0 && c.data === hoje)
        .map((c) => c.profile_id));
      const carteiraPor = new Map<string, number>();
      for (const l of ativos) if (l.broker_id)
        carteiraPor.set(l.broker_id, (carteiraPor.get(l.broker_id) ?? 0) + 1);
      const corretores = time.map((b: any) => ({
        id: b.id, nome: nomePor.get(b.id) ?? "—",
        online: horas(b.last_seen_at) < 0.25,
        plantao: noPlantao.has(b.id),
        carteira: carteiraPor.get(b.id) ?? 0,
      })).sort((a, b) => a.nome.localeCompare(b.nome));

      return {
        chegaram, encaminhados, perdidos: bloq.length, origem, verConversa,
        chegaramHoje: meus.filter((l) => (l.created_at ?? "").slice(0, 10) === hoje).length,
        conversa: {
          perguntouSemResposta: respSemVolta.length, nuncaFalaram: nuncaFalaram.length,
          falouSemResposta: falouSemResp.length, emAndamento: emAndamento.length,
        },
        filas,
        resultado: {
          negociacao: negociando.length, documentos: documentos.length,
          visitas: cury.reduce((a, c) => a + (c.atendimentos ?? 0), 0),
          vendas: cury.reduce((a, c) => a + (c.vendas ?? 0), 0),
        },
        porCorretorVisita: [...agr.entries()].filter(([, v]) => v.at > 0)
          .map(([nome, v]) => ({ nome, n: v.at })).sort((a, b) => b.n - a.n),
        porCorretorVenda: [...agr.entries()].filter(([, v]) => v.vd > 0)
          .map(([nome, v]) => ({ nome, n: v.vd })).sort((a, b) => b.n - a.n),
        negociando: negociando.map((l) => linha(l, l.negotiating_since ?? l.last_interaction_at)).sort(ord),
        documentos: documentos.map((l) => linha(l, l.last_interaction_at)).sort(ord),
        descartes, disparo, pool, corretores,
        periodo: { de, ate, rotulo },
      };
    },
  });
}

/** Redistribui em rodízio entre os corretores escolhidos. */
export async function redistribuir(leadIds: string[], brokerIds: string[], managerId: string) {
  if (!leadIds.length || !brokerIds.length) throw new Error("Escolha os leads e ao menos um corretor.");
  // Um update por corretor, com a fatia dele — evita uma chamada por lead.
  const fatias = new Map<string, string[]>();
  leadIds.forEach((id, i) => {
    const b = brokerIds[i % brokerIds.length];
    fatias.set(b, [...(fatias.get(b) ?? []), id]);
  });
  for (const [broker, ids] of fatias) {
    const { error } = await supabase.from("leads")
      .update({ broker_id: broker, manager_id: managerId, redistributed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
  }
}

/** Descarta em lote, com motivo. */
export async function descartar(leadIds: string[], motivo = "DESCARTE_GERENTE") {
  const { error } = await supabase.from("leads")
    .update({ status: "EXCLUDED", lost_reason: motivo }).in("id", leadIds);
  if (error) throw error;
}

/* ── espiar a conversa corretor↔cliente ───────────────────────────────────
   O ícone de olho no lead. A conversa do corretor vive no WhatsApp dele
   (Evolution → ia_messages), amarrada ao lead por ia_conversations.lead_id.
   Leitura, nunca envio: o gerente confere, não fala pelo chip do corretor.  */
export interface MsgConversa {
  id: string; de: "cliente" | "corretor" | "ia"; texto: string; quando: string;
}

export function useConversaLead(leadId: string | null) {
  return useQuery<MsgConversa[]>({
    queryKey: ["conversa-lead", leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: convs } = await supabase.from("ia_conversations")
        .select("id").eq("lead_id", leadId!);
      const ids = (convs ?? []).map((c: any) => c.id);
      if (!ids.length) return [];
      const { data: msgs } = await supabase.from("ia_messages")
        .select("id,message_text,direction,sender_type,created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: true }).limit(200);
      return (msgs ?? []).map((m: any) => ({
        id: m.id,
        de: m.direction === "incoming" ? "cliente"
          : m.sender_type === "ia" ? "ia" : "corretor",
        texto: m.message_text ?? "",
        quando: m.created_at,
      })) as MsgConversa[];
    },
  });
}

/** Cobra o corretor — empurrão pelo WhatsApp (chip do gerente, fallback Junior)
 *  mais o aviso no painel dele. `quem` é o dono do painel/logado. */
export async function cobrarCorretor(leadId: string, quem: string) {
  const { data, error } = await supabase.functions.invoke("cobrar-corretor", {
    body: { lead_id: leadId, quem },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { avisado_no_whats: boolean; corretor: string };
}
