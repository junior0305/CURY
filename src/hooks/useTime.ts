// Aba TIME — a estratégia da equipe no período.
//
// Regra que separa das outras: **Tempo Real julga o hoje, Time julga o período.**
// Aqui nada é "agora": é o que o time fez, quem mudou, e o que fazer com isso.
//
// As quatro alavancas de um gerente de 40 pessoas: onde põe os leads, com quem
// gasta o tempo dele, o que treina no time inteiro, e quanto assume entregar.
// Tudo que não serve uma dessas quatro é informação, não estratégia.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Origem = "anuncio" | "disparo" | "repescagem" | "propria";

export interface PessoaTime {
  profileId: string;
  nome: string;
  apelido: string | null;
  criadoEm: string | null;
  /** no período */
  dias: number;
  checkins: number;
  atendimentos: number;
  vendas: number;
  pegos: number;
  perdidos: number;
  /** no período ANTERIOR de mesmo tamanho */
  vendasAntes: number;
  atendAntes: number;
  /** leads que chegaram na mão dele no período */
  leadsRecebidos: number;
  leadsRecebidosAntes: number;
  /** carteira ativa agora */
  carteira: number;
  porOrigem: Record<Origem, number>;
  /** leads que responderam e ele não voltou */
  travados: number;
  ultimoAcesso: string | null;
  /** marcos da rampa, em dias desde o cadastro */
  primeiroPonto: number | null;
  primeiroAtend: number | null;
  primeiraVenda: number | null;
}

export interface Achado {
  chave: string;
  tom: "crit" | "warn" | "good";
  nome: string;
  profileId: string;
  /** o fato, curto */
  fato: string;
  /** a leitura, uma linha */
  leitura: string;
  /** o que fazer */
  faz: string;
}

export interface DadosTime {
  gente: PessoaTime[];
  /** atendimentos ordenados, para a curva */
  curva: number[];
  /** quantos fazem 70% dos atendimentos */
  topN: number;
  semAtendimento: number;
  subiram: PessoaTime[];
  cairam: PessoaTime[];
  achados: Achado[];
  /** onde o TIME perde */
  time: {
    checkinsPorAtend: number | null;
    checkinsPorAtendSemTopo: number | null;
    atendPorVenda: number | null;
    leadsParados: number;
  };
  novatos: PessoaTime[];
  /** últimas 4 semanas de venda, da mais antiga para a mais nova */
  ultimasSemanas: number[];
  metaSemana: number | null;
  teamId: string | null;
  gerenteCuryId: string | null;
  dias: number;
}

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const menos = (n: number) => diaSP(new Date(Date.now() - n * 86_400_000));
const horas = (iso: string | null) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;
function segunda() {
  const d = (new Date().getDay() + 6) % 7;
  return menos(d);
}
function origemDoLead(source: string | null, orig: string | null): Origem {
  if (source === "cold_pool" || orig) return "repescagem";
  if (source === "facebook_make") return "anuncio";
  if (source === "wa_oficial" || source === "campaign") return "disparo";
  return "propria";
}

export function useTime(managerId: string | undefined, dias = 30) {
  return useQuery<DadosTime>({
    queryKey: ["aba-time", managerId, dias],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const de = menos(dias), deAntes = menos(dias * 2), hoje = diaSP();

      const { data: eu } = await supabase.from("cury_pessoas")
        .select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const gerenteCuryId = (eu as any)?.cury_id ?? null;

      const { data: perfilGer } = await supabase.from("profiles")
        .select("team_id").eq("id", managerId!).maybeSingle();
      const teamId = (perfilGer as any)?.team_id ?? null;

      const [timeRes, curyRes, leadsRes, metaRes] = await Promise.all([
        supabase.from("profiles")
          .select("id,first_name,last_name,created_at,last_seen_at")
          .eq("manager_id", managerId!).eq("role", "BROKER"),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias")
              .select("profile_id,apelido,data,checkins,atendimentos,vendas,ativados,expirados")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", menos(120))
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("leads")
          .select("broker_id,source,original_broker_id,status,created_at,last_lead_response_at,last_broker_whatsapp_at")
          .eq("manager_id", managerId!),
        teamId
          ? supabase.from("team_goals").select("sales_target,goal_type,week_start")
              .eq("team_id", teamId).eq("goal_type", "weekly").eq("week_start", segunda())
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const time = (timeRes.data ?? []) as any[];
      const cury = ((curyRes as any).data ?? []) as any[];
      const leads = (leadsRes.data ?? []) as any[];

      /* ── carteira e leads recebidos, por corretor ── */
      const zero = () => ({ anuncio: 0, disparo: 0, repescagem: 0, propria: 0 }) as Record<Origem, number>;
      const cart = new Map<string, Record<Origem, number>>();
      const receb = new Map<string, number>(), recebAntes = new Map<string, number>();
      const travados = new Map<string, number>();
      let leadsParados = 0;

      for (const l of leads) {
        if (!l.broker_id) continue;
        const ativo = !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
        if (ativo) {
          const c = cart.get(l.broker_id) ?? zero();
          c[origemDoLead(l.source, l.original_broker_id)] += 1;
          cart.set(l.broker_id, c);
          // parado = respondeu e o corretor não voltou
          const resp = l.last_lead_response_at, ult = l.last_broker_whatsapp_at;
          if (resp && (!ult || ult < resp) && horas(resp) > 24) {
            travados.set(l.broker_id, (travados.get(l.broker_id) ?? 0) + 1);
            leadsParados += 1;
          }
        }
        const d = (l.created_at ?? "").slice(0, 10);
        if (d >= de) receb.set(l.broker_id, (receb.get(l.broker_id) ?? 0) + 1);
        else if (d >= deAntes) recebAntes.set(l.broker_id, (recebAntes.get(l.broker_id) ?? 0) + 1);
      }

      /* ── acumulados da Cury ── */
      type Ac = { dias: number; ck: number; at: number; vd: number; pg: number; pd: number };
      const novo = (): Ac => ({ dias: 0, ck: 0, at: 0, vd: 0, pg: 0, pd: 0 });
      const per = new Map<string, Ac>(), antes = new Map<string, Ac>();
      const apelidos = new Map<string, string>();
      const marcos = new Map<string, { ponto?: string; atend?: string; venda?: string }>();
      const porSemana = new Map<string, number>();

      for (const r of cury) {
        if (!r.profile_id) continue;
        if (r.apelido) apelidos.set(r.profile_id, r.apelido);
        const alvo = r.data >= de ? per : (r.data >= deAntes ? antes : null);
        if (alvo) {
          const a = alvo.get(r.profile_id) ?? novo();
          if ((r.checkins ?? 0) > 0) a.dias += 1;
          a.ck += r.checkins ?? 0; a.at += r.atendimentos ?? 0; a.vd += r.vendas ?? 0;
          a.pg += r.ativados ?? 0; a.pd += r.expirados ?? 0;
          alvo.set(r.profile_id, a);
        }
        const m = marcos.get(r.profile_id) ?? {};
        if ((r.checkins ?? 0) > 0 && (!m.ponto || r.data < m.ponto)) m.ponto = r.data;
        if ((r.atendimentos ?? 0) > 0 && (!m.atend || r.data < m.atend)) m.atend = r.data;
        if ((r.vendas ?? 0) > 0 && (!m.venda || r.data < m.venda)) m.venda = r.data;
        marcos.set(r.profile_id, m);
        // vendas por semana, para as 4 caixinhas do compromisso
        if (r.vendas) {
          const dt = new Date(r.data + "T12:00:00Z");
          const seg = new Date(dt.getTime() - (((dt.getUTCDay() + 6) % 7) * 86_400_000));
          const k = seg.toISOString().slice(0, 10);
          porSemana.set(k, (porSemana.get(k) ?? 0) + r.vendas);
        }
      }

      const diasDesde = (a: string | null | undefined, b: string | null) =>
        a && b ? Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000) : null;

      const gente: PessoaTime[] = time.map((b: any) => {
        const p = per.get(b.id) ?? novo(), q = antes.get(b.id) ?? novo();
        const m = marcos.get(b.id) ?? {};
        const nasc = (b.created_at ?? "").slice(0, 10) || null;
        return {
          profileId: b.id,
          nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "—",
          apelido: apelidos.get(b.id) ?? b.first_name,
          criadoEm: nasc,
          dias: p.dias, checkins: p.ck, atendimentos: p.at, vendas: p.vd,
          pegos: p.pg, perdidos: p.pd,
          vendasAntes: q.vd, atendAntes: q.at,
          leadsRecebidos: receb.get(b.id) ?? 0,
          leadsRecebidosAntes: recebAntes.get(b.id) ?? 0,
          carteira: Object.values(cart.get(b.id) ?? zero()).reduce((a, n) => a + n, 0),
          porOrigem: cart.get(b.id) ?? zero(),
          travados: travados.get(b.id) ?? 0,
          ultimoAcesso: b.last_seen_at ?? null,
          primeiroPonto: diasDesde(m.ponto, nasc),
          primeiroAtend: diasDesde(m.atend, nasc),
          primeiraVenda: diasDesde(m.venda, nasc),
        };
      });

      /* ── concentração: quantos fazem 70% dos atendimentos ── */
      const curva = gente.map((p) => p.atendimentos).sort((a, b) => b - a);
      const total = curva.reduce((a, n) => a + n, 0);
      let acc = 0, topN = 0;
      for (const v of curva) { acc += v; topN += 1; if (total && acc / total >= 0.7) break; }
      if (!total) topN = 0;

      /* ── onde o TIME perde ── */
      const topo = new Set(
        [...gente].sort((a, b) => b.atendimentos - a.atendimentos).slice(0, topN).map((p) => p.profileId));
      const somaCk = gente.reduce((a, p) => a + p.checkins, 0);
      const somaAt = gente.reduce((a, p) => a + p.atendimentos, 0);
      const somaVd = gente.reduce((a, p) => a + p.vendas, 0);
      const resto = gente.filter((p) => !topo.has(p.profileId));
      const ckResto = resto.reduce((a, p) => a + p.checkins, 0);
      const atResto = resto.reduce((a, p) => a + p.atendimentos, 0);

      /* ── as últimas 4 semanas ── */
      const ultimasSemanas: number[] = [];
      for (let i = 4; i >= 1; i--) {
        const k = menos(((new Date().getDay() + 6) % 7) + i * 7);
        ultimasSemanas.push(porSemana.get(k) ?? 0);
      }

      return {
        gente, curva, topN,
        semAtendimento: gente.filter((p) => p.atendimentos === 0).length,
        subiram: gente.filter((p) => p.vendas > p.vendasAntes)
          .sort((a, b) => (b.vendas - b.vendasAntes) - (a.vendas - a.vendasAntes)),
        cairam: gente.filter((p) => p.vendas < p.vendasAntes)
          .sort((a, b) => (a.vendas - a.vendasAntes) - (b.vendas - b.vendasAntes)),
        achados: acharAchados(gente),
        time: {
          checkinsPorAtend: somaAt ? somaCk / somaAt : null,
          checkinsPorAtendSemTopo: atResto ? ckResto / atResto : null,
          atendPorVenda: somaVd ? somaAt / somaVd : null,
          leadsParados,
        },
        novatos: gente
          .filter((p) => p.criadoEm && p.criadoEm >= menos(90))
          .sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? "")),
        ultimasSemanas,
        metaSemana: ((metaRes as any).data ?? [])[0]?.sales_target ?? null,
        teamId, gerenteCuryId, dias,
      };
    },
  });
}

/* ────────────────────────────────────────────────────────── os achados
   Primeiro o fato, curto. Depois a leitura, uma linha. Depois o que fazer.
   E a régua compara cada um com o PRÓPRIO histórico — existem corretores de
   plantão e corretores de carteira, e uma régua só reprova o segundo tipo
   injustamente (caso Holmes/Fartote, 15/09). */
function acharAchados(gente: PessoaTime[]): Achado[] {
  const out: Achado[] = [];
  const comVenda = gente.filter((p) => p.vendas + p.vendasAntes > 0);
  const mediaAtend = gente.length
    ? gente.reduce((a, p) => a + p.atendimentos, 0) / gente.length : 0;

  for (const p of gente) {
    const nome = p.apelido ?? p.nome;

    // veio muito e não atendeu ninguém
    if (p.dias >= 8 && p.atendimentos === 0 && p.carteira > 0) {
      out.push({ chave: "veio-nao-atendeu", tom: "crit", nome, profileId: p.profileId,
        fato: `Veio ${p.dias} dias e não atendeu ninguém`,
        leitura: `Tem ${p.carteira} leads na mão. Não é falta de lead.`,
        faz: "Chame para conversar esta semana" });
      continue;
    }

    // os leads respondem e nada acontece — fato, não acusação
    if (p.travados >= 6 && p.atendimentos === 0) {
      out.push({ chave: "responde-sem-resultado", tom: "crit", nome, profileId: p.profileId,
        fato: `${p.travados} clientes responderam e pararam. Nenhum virou atendimento`,
        leitura: "Ele está conversando com os clientes. Só não aparece resultado aqui.",
        faz: "Leia as conversas dele antes de falar" });
      continue;
    }

    // caiu o lead, não o corretor — o gerente é quem resolve
    if (p.leadsRecebidosAntes >= 10 && p.leadsRecebidos < p.leadsRecebidosAntes * 0.5 && p.vendasAntes > 0) {
      out.push({ chave: "sem-lead", tom: "warn", nome, profileId: p.profileId,
        fato: `Recebeu ${p.leadsRecebidos} leads. O normal dele é ${p.leadsRecebidosAntes}`,
        leitura: "Vende bem, mas com essa quantidade não vai conseguir.",
        faz: "Você é quem resolve este: mande mais lead" });
      continue;
    }

    // saiu do próprio padrão — vale para quem nunca foi de plantão
    if (p.vendasAntes >= 2 && p.vendas === 0) {
      const dePlantao = p.dias >= 5;
      out.push({ chave: "parou-de-vender", tom: "warn", nome, profileId: p.profileId,
        fato: `Não vendeu no período, e antes vendia ${p.vendasAntes}`,
        leitura: dePlantao
          ? "Continua vindo ao plantão, mas parou de fechar."
          : "Ele nunca foi muito de plantão, sempre trabalhou a carteira dele — e dava resultado. Mudou alguma coisa.",
        faz: dePlantao ? "Olhe as conversas dele" : "Ligue para ele, não é falta de plantão" });
      continue;
    }

    // merece mais lead: converte acima do time e tem espaço na mão
    if (p.vendas >= 2 && p.atendimentos > mediaAtend && p.carteira < 25) {
      out.push({ chave: "merece-mais", tom: "good", nome, profileId: p.profileId,
        fato: `${p.atendimentos} atendimentos e ${p.vendas} vendas no período`,
        leitura: `Só tem ${p.carteira} leads na mão. Tem espaço para mais.`,
        faz: "Mande mais lead antes que ele peça" });
    }
  }

  const ordem = { crit: 0, warn: 1, good: 2 } as const;
  return out.sort((a, b) => ordem[a.tom] - ordem[b.tom]).slice(0, 8);
}

/** O compromisso da semana vira a meta. Sem isso, não há meta nenhuma
 *  cadastrada — a última do banco é de julho e todas são mensais. */
export async function assumirMeta(teamId: string, vendas: number, managerId: string) {
  const seg = segunda();
  const { error } = await supabase.from("team_goals").upsert({
    team_id: teamId, goal_type: "weekly", week_start: seg,
    month: seg.slice(0, 8) + "01", sales_target: vendas, set_by: managerId,
  }, { onConflict: "team_id,goal_type,week_start" });
  if (error) throw error;
}
