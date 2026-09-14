// Tempo Real — o estado de HOJE da equipe.
//
// Cruza três fontes que, sozinhas, enganam:
//   · Cury  — bateu ponto, atendeu, vendeu, pegou e perdeu lead. Mede sem pedir
//             nada a ninguém, e por isso é a espinha da tela.
//   · leads — a carteira e de onde cada lead veio.
//   · profiles — se está com o Comandra aberto e se está recebendo lead.
//
// A regra de status tem quatro níveis, e o corte que importa é entre TRAVADO
// (o sistema impede — culpa nossa) e CRÍTICO (vem e não produz — comportamento).
// Misturar os dois faz o gerente cobrar quem está sendo prejudicado.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Nivel = "crit" | "trav" | "warn" | "ok";
export type Origem = "anuncio" | "disparo" | "repescagem" | "propria";

export interface Pessoa {
  profileId: string | null;
  curyId: string | null;
  nome: string;
  apelido: string | null;
  /** bateu ponto hoje */
  ponto: boolean;
  checkins: number;
  /** leads da Cury que ele conseguiu pegar */
  pegos: number;
  /** leads que venceram sem ele atender */
  perdidos: number;
  atendimentos: number;
  vendas: number;
  /** com o Comandra aberto nos últimos 15 min */
  online: boolean;
  ultimoAcesso: string | null;
  recebeLead: boolean;
  /** quem ligou: o plantão das 9h ou o gerente */
  fonteRodizio: "plantao" | "gerente" | null;
  carteira: number;
  porOrigem: Record<Origem, number>;
  /** na janela de 7 dias */
  diasPlantao: number;
  atendSemana: number;
  vendasSemana: number;
}

export interface Status {
  nivel: Nivel;
  rotulo: string;
  porque: string;
  regra: string[];
  acao: string;
  chave: string;
}

export interface TempoReal {
  gente: Pessoa[];
  totais: { plantao: number; online: number; atendimentos: number; perdidos: number; vendas: number };
  atualizadoEm: string | null;
  gerenteCuryId: string | null;
}

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);

const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;

/** Como o lead chegou na MÃO deste corretor — por isso repescagem ganha de anúncio. */
function origemDoLead(source: string | null, originalBroker: string | null): Origem {
  if (source === "cold_pool" || originalBroker) return "repescagem";
  if (source === "facebook_make") return "anuncio";
  if (source === "wa_oficial" || source === "campaign") return "disparo";
  return "propria";
}

export function status(p: Pessoa): Status {
  if (!p.profileId)
    return { nivel: "trav", rotulo: "Travado", porque: "Bate ponto na Cury e não tem login no Comandra.",
      regra: ["Aparece na Cury", "Sem cadastro aqui"], acao: "Criar login", chave: "semcad" };

  if (p.ponto && !p.recebeLead)
    return { nivel: "trav", rotulo: "Travado", porque: "Veio trabalhar e não está recebendo lead.",
      regra: ["Bateu ponto hoje", "Recebimento de lead desligado"], acao: "Ligar recebimento", chave: "rodizio" };

  // Sete dias corridos, não "esta semana" — senão toda segunda o time inteiro
  // aparece como crítico.
  if (p.diasPlantao >= 4 && p.atendSemana === 0 && p.vendasSemana === 0)
    return { nivel: "crit", rotulo: "Crítico", porque: "Vem ao plantão e não produz nada. Presença sem trabalho.",
      regra: [`${p.diasPlantao} dias de plantão em 7 dias`, "0 atendimentos", "0 vendas",
              `${p.carteira} leads na carteira`], acao: "Conversar hoje", chave: "parado" };

  if (p.ponto && p.perdidos > 0)
    return { nivel: "warn", rotulo: "Atenção", porque: "Estava no plantão e deixou lead expirar sem atender.",
      regra: ["Bateu ponto hoje", `${p.perdidos} lead${p.perdidos > 1 ? "s" : ""} expirou na Cury`],
      acao: "Cobrar agora", chave: "perdeu" };

  if (!p.ponto && p.carteira >= 15 && horas(p.ultimoAcesso) > 72)
    return { nivel: "warn", rotulo: "Atenção", porque: "Não veio e não abre o sistema, com carteira cheia parada.",
      regra: ["Sem ponto hoje", `Sem entrar há ${Math.floor(horas(p.ultimoAcesso) / 24)} dias`,
              `${p.carteira} leads na mão`], acao: "Redistribuir", chave: "sumido" };

  if (p.ponto)
    return { nivel: "ok", rotulo: "Normal", porque: "Dentro do esperado.",
      regra: [`${p.diasPlantao} dias de plantão`, `${p.atendSemana} atendimentos na semana`,
              `${p.vendasSemana} venda${p.vendasSemana === 1 ? "" : "s"}`], acao: "Ver leads", chave: "ok" };

  return { nivel: "ok", rotulo: "Normal", porque: "Não é dia dele de plantão.",
    regra: ["Sem ponto hoje", `Carteira de ${p.carteira} leads`], acao: "Ver leads", chave: "fora" };
}

export function useTempoReal(managerId: string | undefined, dia?: string) {
  const data = dia ?? diaSP();

  return useQuery<TempoReal>({
    queryKey: ["tempo-real", managerId, data],
    enabled: !!managerId,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    queryFn: async () => {
      const vazio: TempoReal = {
        gente: [], totais: { plantao: 0, online: 0, atendimentos: 0, perdidos: 0, vendas: 0 },
        atualizadoEm: null, gerenteCuryId: null,
      };

      const { data: eu } = await supabase.from("cury_pessoas")
        .select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const gerenteCuryId = (eu as any)?.cury_id ?? null;

      const de7 = diaSP(new Date(Date.now() - 7 * 86_400_000));

      const [timeRes, hojeRes, semanaRes, leadsRes] = await Promise.all([
        supabase.from("profiles")
          .select("id,first_name,last_name,last_seen_at,lead_assignment_enabled,lead_assignment_source")
          .eq("manager_id", managerId!).eq("role", "BROKER"),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias")
              .select("cury_id,nome,apelido,profile_id,checkins,atendimentos,vendas,ativados,expirados,atualizado_em")
              .eq("data", data).eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
          : Promise.resolve({ data: [] as any[] }),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias")
              .select("profile_id,data,checkins,atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId).gte("data", de7)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("leads")
          .select("broker_id,source,original_broker_id,status")
          .eq("manager_id", managerId!)
          .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)"),
      ]);

      const time = (timeRes.data ?? []) as any[];
      const hoje = ((hojeRes as any).data ?? []) as any[];
      const semana = ((semanaRes as any).data ?? []) as any[];
      const leads = (leadsRes.data ?? []) as any[];

      // carteira por origem
      const cart = new Map<string, Record<Origem, number>>();
      for (const l of leads) {
        if (!l.broker_id) continue;
        const c = cart.get(l.broker_id) ??
          { anuncio: 0, disparo: 0, repescagem: 0, propria: 0 };
        c[origemDoLead(l.source, l.original_broker_id)] += 1;
        cart.set(l.broker_id, c);
      }

      // acumulado de 7 dias
      const sem = new Map<string, { dias: number; atend: number; vendas: number }>();
      for (const r of semana) {
        if (!r.profile_id) continue;
        const s = sem.get(r.profile_id) ?? { dias: 0, atend: 0, vendas: 0 };
        if ((r.checkins ?? 0) > 0) s.dias += 1;
        s.atend += r.atendimentos ?? 0;
        s.vendas += r.vendas ?? 0;
        sem.set(r.profile_id, s);
      }

      const hojePorPerfil = new Map<string, any>();
      const semCadastro: any[] = [];
      for (const h of hoje) {
        if (h.profile_id) hojePorPerfil.set(h.profile_id, h);
        else if ((h.checkins ?? 0) > 0) semCadastro.push(h);
      }

      const zero = { anuncio: 0, disparo: 0, repescagem: 0, propria: 0 } as Record<Origem, number>;

      const gente: Pessoa[] = time.map((b: any) => {
        const h = hojePorPerfil.get(b.id);
        const s = sem.get(b.id) ?? { dias: 0, atend: 0, vendas: 0 };
        const o = cart.get(b.id) ?? zero;
        return {
          profileId: b.id, curyId: h?.cury_id ?? null,
          nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "—",
          apelido: h?.apelido ?? b.first_name,
          ponto: (h?.checkins ?? 0) > 0,
          checkins: h?.checkins ?? 0,
          pegos: h?.ativados ?? 0,
          perdidos: h?.expirados ?? 0,
          atendimentos: h?.atendimentos ?? 0,
          vendas: h?.vendas ?? 0,
          online: horas(b.last_seen_at) < 0.25,
          ultimoAcesso: b.last_seen_at ?? null,
          recebeLead: b.lead_assignment_enabled !== false,
          fonteRodizio: b.lead_assignment_source ?? null,
          carteira: Object.values(o).reduce((a, n) => a + n, 0),
          porOrigem: o,
          diasPlantao: s.dias, atendSemana: s.atend, vendasSemana: s.vendas,
        };
      });

      // quem bate ponto na Cury e não existe aqui — o gerente cria o login
      for (const h of semCadastro) {
        gente.push({
          profileId: null, curyId: h.cury_id, nome: h.nome ?? "—", apelido: h.apelido,
          ponto: true, checkins: h.checkins ?? 0, pegos: h.ativados ?? 0,
          perdidos: h.expirados ?? 0, atendimentos: h.atendimentos ?? 0, vendas: h.vendas ?? 0,
          online: false, ultimoAcesso: null, recebeLead: false, fonteRodizio: null,
          carteira: 0, porOrigem: { ...zero }, diasPlantao: 0, atendSemana: 0, vendasSemana: 0,
        });
      }

      const soma = (f: (p: Pessoa) => number) => gente.reduce((a, p) => a + f(p), 0);
      return {
        gente,
        totais: {
          plantao: gente.filter((p) => p.ponto).length,
          online: gente.filter((p) => p.online).length,
          atendimentos: soma((p) => p.atendimentos),
          perdidos: soma((p) => p.perdidos),
          vendas: soma((p) => p.vendas),
        },
        atualizadoEm: hoje.reduce<string | null>(
          (m, h: any) => (!m || h.atualizado_em > m ? h.atualizado_em : m), null),
        gerenteCuryId,
      };
    },
  });
}

/** Liga/desliga o recebimento. Marca como decisão do gerente — o reset da
 *  madrugada apaga, e no dia seguinte quem manda é o plantão. */
export async function definirRecebimento(profileId: string, receber: boolean) {
  const { error } = await supabase.from("profiles").update({
    lead_assignment_enabled: receber,
    lead_assignment_source: receber ? "gerente" : null,
    lead_assignment_date: receber ? diaSP() : null,
  }).eq("id", profileId);
  if (error) throw error;
}
