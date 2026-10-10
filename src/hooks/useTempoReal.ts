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
import { casarCheckinsComEquipe, buscarPlantao } from "@/utils/c2sMatching";

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
  /** o que falta acertar no cadastro para esta pessoa contar de verdade */
  cadastro: "ok" | "sem_cadastro" | "outra_equipe" | "desativado";
  /** de quem ela é no Comandra hoje, quando não é deste gerente */
  gerenteAtual: string | null;
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

export interface PeriodoFiltro {
  de?: string;
  ate?: string;
  preset?: string;
  rotulo?: string;
}

export interface TempoReal {
  gente: Pessoa[];
  totais: { plantao: number; online: number; atendimentos: number; perdidos: number; vendas: number };
  atualizadoEm: string | null;
  gerenteCuryId: string | null;
  periodo: {
    de: string;
    ate: string;
    rotulo: string;
    isSingleDay: boolean;
  };
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
  // Cadastro em desacordo vem antes de tudo: enquanto não se acerta, nenhum
  // outro número dessa pessoa é confiável — ela não recebe lead pelo rodízio,
  // não tem carteira aqui e o gerente não consegue cobrar nada dela.
  if (p.cadastro === "sem_cadastro")
    return { nivel: "trav", rotulo: "Travado", porque: "Trabalha na sua equipe no C2S e não tem login no Comandra.",
      regra: ["Bateu ponto hoje", "Sem cadastro aqui"], acao: "Criar login", chave: "semcad" };

  if (p.cadastro === "outra_equipe")
    return { nivel: "trav", rotulo: "Travado",
      porque: `Já é da sua equipe no C2S, mas aqui ainda consta ${p.gerenteAtual ? "com " + p.gerenteAtual : "com outro gerente"}.`,
      regra: ["Bateu ponto hoje na sua equipe", "Cadastro em outra equipe aqui",
              "Não entra no seu rodízio"], acao: "Trazer para a equipe", chave: "outraeq" };

  if (p.cadastro === "desativado")
    return { nivel: "trav", rotulo: "Travado", porque: "Voltou a bater ponto no C2S e o cadastro aqui está desativado.",
      regra: ["Bateu ponto hoje", "Cadastro desativado aqui", "Não recebe lead"],
      acao: "Reativar cadastro", chave: "desativado" };

  if (!p.profileId)
    return { nivel: "trav", rotulo: "Travado", porque: "Bate ponto no C2S e não tem login no Comandra.",
      regra: ["Aparece no C2S", "Sem cadastro aqui"], acao: "Criar login", chave: "semcad" };

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
      regra: ["Bateu ponto hoje", `${p.perdidos} lead${p.perdidos > 1 ? "s" : ""} expirou no C2S`],
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

export function useTempoReal(
  managerId: string | undefined,
  filtro?: PeriodoFiltro | string
) {
  const de = typeof filtro === "object" ? filtro.de || diaSP() : (filtro ?? diaSP());
  const ate = typeof filtro === "object" ? filtro.ate || diaSP() : (filtro ?? diaSP());
  const rotulo = typeof filtro === "object" ? (filtro.rotulo ?? (de === ate ? "hoje" : `${de} a ${ate}`)) : (de === diaSP() ? "hoje" : de);
  const isSingleDay = de === ate;

  return useQuery<TempoReal>({
    queryKey: ["tempo-real", managerId, de, ate],
    enabled: !!managerId,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    queryFn: async () => {
      const deIso = new Date(de + "T00:00:00").toISOString();
      const de7iso = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const minIso = deIso < de7iso ? deIso : de7iso;

      const [mgrRes, timeRes, leadsRes, ckRes, vendasRes] = await Promise.all([
        supabase.from("profiles")
          .select("id,first_name,last_name")
          .eq("id", managerId!).maybeSingle(),
        supabase.from("profiles")
          .select("id,first_name,last_name,email,last_seen_at,lead_assignment_enabled,lead_assignment_source")
          .eq("manager_id", managerId!).eq("role", "BROKER"),
        supabase.from("leads")
          .select("broker_id,source,original_broker_id,status")
          .eq("manager_id", managerId!)
          .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)"),
        // Ponto no plantão vem do C2S (c2s_plantao), com corretor e gerente para matching seguro.
        buscarPlantao(minIso).then((data) => ({ data })),
        // Vendas concluídas (nativas do Comandra)
        supabase.from("leads")
          .select("broker_id,updated_at,last_interaction_at,created_at")
          .eq("manager_id", managerId!)
          .eq("status", "CONCLUDED")
          .gte("updated_at", minIso),
      ]);

      const mgr = (mgrRes.data as any) ?? null;
      const time = (timeRes.data ?? []) as any[];
      const leads = (leadsRes.data ?? []) as any[];
      const checks = (ckRes.data ?? []) as any[];
      const vendas = (vendasRes.data ?? []) as any[];

      // carteira por origem
      const cart = new Map<string, Record<Origem, number>>();
      for (const l of leads) {
        if (!l.broker_id) continue;
        const c = cart.get(l.broker_id) ?? { anuncio: 0, disparo: 0, repescagem: 0, propria: 0 };
        c[origemDoLead(l.source, l.original_broker_id)] += 1;
        cart.set(l.broker_id, c);
      }

      // Vendas da semana por corretor
      const vendasSemanaPorBroker = new Map<string, number>();
      for (const v of vendas) {
        if (!v.broker_id) continue;
        vendasSemanaPorBroker.set(v.broker_id, (vendasSemanaPorBroker.get(v.broker_id) ?? 0) + 1);
      }

      // Check-in do C2S por corretor com matching seguro (sem colisão de homônimos de outras equipes)
      const matched = casarCheckinsComEquipe(checks, time, mgr);
      const ckPeriodo = new Map<string, number>();
      const ckSem = new Map<string, { atend: number; dias: Set<string> }>();
      let ultimo: string | null = null;

      for (const { checkin: ck, brokerId: pid } of matched) {
        const diaCk = diaSP(new Date(ck.created_at));
        // Janela de 7 dias para avaliação de rotina e presença
        const sm = ckSem.get(pid) ?? { atend: 0, dias: new Set<string>() };
        sm.atend += 1; sm.dias.add(diaCk); ckSem.set(pid, sm);

        // Período selecionado (ex: últimos 7 dias, hoje, etc.)
        if (diaCk >= de && diaCk <= ate) {
          ckPeriodo.set(pid, (ckPeriodo.get(pid) ?? 0) + 1);
        }
        if (!ultimo || ck.created_at > ultimo) ultimo = ck.created_at;
      }

      const zero = { anuncio: 0, disparo: 0, repescagem: 0, propria: 0 } as Record<Origem, number>;

      const gente: Pessoa[] = time.map((b: any) => {
        const o = cart.get(b.id) ?? zero;
        const nPeriodo = ckPeriodo.get(b.id) ?? 0;
        const sm = ckSem.get(b.id);
        const vSem = vendasSemanaPorBroker.get(b.id) ?? 0;
        return {
          profileId: b.id, curyId: null,
          nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "—",
          apelido: b.first_name,
          ponto: nPeriodo > 0,
          checkins: nPeriodo,
          pegos: 0,
          perdidos: 0,
          atendimentos: nPeriodo,
          vendas: vSem,
          online: horas(b.last_seen_at) < 0.25,
          ultimoAcesso: b.last_seen_at ?? null,
          recebeLead: b.lead_assignment_enabled !== false,
          fonteRodizio: b.lead_assignment_source ?? null,
          carteira: Object.values(o).reduce((a, n) => a + n, 0),
          porOrigem: o,
          cadastro: "ok" as const, gerenteAtual: null,
          diasPlantao: sm?.dias.size ?? 0,
          atendSemana: sm?.atend ?? 0,
          vendasSemana: vSem,
        };
      });

      const soma = (fn: (p: Pessoa) => number) => gente.reduce((a, p) => a + fn(p), 0);
      return {
        gente,
        totais: {
          plantao: gente.filter((p) => p.ponto).length,
          online: gente.filter((p) => p.online).length,
          atendimentos: soma((p) => p.atendimentos),
          perdidos: 0,
          vendas: soma((p) => p.vendasSemana),
        },
        atualizadoEm: ultimo,
        gerenteCuryId: null,
        periodo: {
          de,
          ate,
          rotulo,
          isSingleDay,
        },
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

/** Traz para a equipe deste gerente quem a Cury já diz que é dele.
 *
 *  Um gesto só, porque meia-correção aqui é pior que nenhuma: reativar o perfil
 *  sem tirar o banimento faz a pessoa voltar a contar nos números e a receber
 *  lead, e continuar sem conseguir entrar. O banimento vive no GoTrue e
 *  sobrevive à reativação — por isso o trabalho é do banco, não daqui.        */
export async function trazerParaEquipe(profileId: string, managerId?: string) {
  // O destino é o DONO DO PAINEL, não quem clicou: o superintendente abre o
  // painel dos outros, e sem isto o corretor iria para a equipe dele.
  const { data, error } = await supabase.rpc("trazer_para_equipe", {
    p_profile: profileId, p_gerente: managerId ?? null,
  });
  if (error) throw error;
  return data as { leads: number; desbanido: boolean };
}
