// Cruzamento Cury × Comandra — 30 dias.
//
// O Comandra sabe o que o corretor DEVERIA fazer (a carteira de leads); a Cury
// sabe se ele FOI trabalhar (check-in) e se atendeu alguém. Separados, os dois
// enganam: no Comandra um corretor sumido parece igual a um corretor sem lead,
// e na Cury quem bate ponto todo dia parece produtivo mesmo sem atender.
// Juntos, aparece o caso que ninguém vê hoje — foi ao plantão e não trabalhou.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CorretorCruzado {
  profileId: string | null;
  curyId: string;
  nome: string | null;
  apelido: string | null;
  /** dias distintos com pelo menos 1 check-in */
  diasDePlantao: number;
  checkins: number;
  visitas: number;
  vendas: number;
  /** último dia em que bateu ponto */
  ultimoPlantao: string | null;
}

export interface Cruzamento {
  porCuryId: Map<string, CorretorCruzado>;
  /** indexado por profile_id, que é como o painel conhece as pessoas */
  porProfile: Map<string, CorretorCruzado>;
  /** bateram ponto e não têm cadastro no Comandra */
  semCadastro: CorretorCruzado[];
  /** mediana de check-ins por visita no time — a régua de comparação */
  medianaCheckinsPorVisita: number | null;
  dias: number;
  gerenteCuryId: string | null;
}

const diaISO = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);

export function useCruzamentoCury(managerId: string | undefined, dias = 30) {
  return useQuery<Cruzamento>({
    queryKey: ["cruzamento-cury", managerId, dias],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const vazio: Cruzamento = {
        porCuryId: new Map(), porProfile: new Map(), semCadastro: [],
        medianaCheckinsPorVisita: null, dias, gerenteCuryId: null,
      };

      const { data: eu } = await supabase
        .from("cury_pessoas").select("cury_id")
        .eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const gerenteCuryId = (eu as any)?.cury_id ?? null;
      if (!gerenteCuryId) return vazio;

      const de = new Date(Date.now() - dias * 86_400_000);
      const { data: linhas } = await supabase
        .from("cury_metricas_diarias")
        .select("cury_id,nome,apelido,checkins,atendimentos,vendas,profile_id,data")
        .eq("escopo", "corretor")
        .eq("gerente_cury_id", gerenteCuryId)
        .gte("data", diaISO(de));

      const porCuryId = new Map<string, CorretorCruzado>();
      for (const l of (linhas ?? []) as any[]) {
        const atual = porCuryId.get(l.cury_id) ?? {
          profileId: l.profile_id ?? null, curyId: l.cury_id,
          nome: l.nome, apelido: l.apelido,
          diasDePlantao: 0, checkins: 0, visitas: 0, vendas: 0, ultimoPlantao: null,
        };
        atual.checkins += l.checkins ?? 0;
        atual.visitas += l.atendimentos ?? 0;
        atual.vendas += l.vendas ?? 0;
        if ((l.checkins ?? 0) > 0) {
          atual.diasDePlantao += 1;
          if (!atual.ultimoPlantao || l.data > atual.ultimoPlantao) atual.ultimoPlantao = l.data;
        }
        if (l.profile_id) atual.profileId = l.profile_id;
        porCuryId.set(l.cury_id, atual);
      }

      const todos = [...porCuryId.values()];
      const porProfile = new Map<string, CorretorCruzado>();
      for (const c of todos) if (c.profileId) porProfile.set(c.profileId, c);

      // A régua: quantos check-ins o time gasta pra produzir uma visita. Só
      // entra quem atendeu ao menos uma vez — incluir os zeros jogaria a
      // mediana pro infinito e a comparação perderia sentido.
      const taxas = todos
        .filter((c) => c.visitas > 0 && c.checkins > 0)
        .map((c) => c.checkins / c.visitas)
        .sort((a, b) => a - b);
      const medianaCheckinsPorVisita = taxas.length
        ? taxas[Math.floor(taxas.length / 2)] : null;

      return {
        porCuryId, porProfile,
        semCadastro: todos.filter((c) => !c.profileId && c.checkins > 0),
        medianaCheckinsPorVisita, dias, gerenteCuryId,
      };
    },
  });
}

/* ------------------------------------------------------------------ achados */

export interface Achado {
  /** `grave` = dinheiro saindo agora; `atencao` = padrão ruim; `bom` = elogio */
  tom: "grave" | "atencao" | "bom";
  quem: string;
  profileId: string | null;
  texto: string;
}

export interface EntradaAchado {
  profileId: string;
  nome: string;
  /** leads recebidos no mês */
  recebidos: number;
  /** carteira ativa total */
  carteira: number;
  vendas: number;
  saldo: number;
  custoLead: number;
  /** horas desde o último acesso ao Comandra */
  horasSemEntrar: number;
  chip: boolean;
}

/**
 * Lê o cruzamento e devolve frases, não números soltos. A regra: cada achado
 * precisa dizer o que aconteceu E o que fazer — senão vira mais um painel que
 * o gerente olha e fecha.
 */
export function acharPadroes(
  time: EntradaAchado[],
  cruz: Cruzamento | undefined,
): Achado[] {
  if (!cruz) return [];
  const out: Achado[] = [];
  const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

  for (const p of time) {
    const c = cruz.porProfile.get(p.profileId);
    const dias = c?.diasDePlantao ?? 0;

    // 1) Foi trabalhar e não abriu o sistema. O lead chega e morre na fila.
    if (dias >= 2 && p.horasSemEntrar > 72 && p.carteira > 0) {
      out.push({
        tom: "grave", quem: p.nome, profileId: p.profileId,
        texto: `Foi ao plantão ${dias} dia${dias > 1 ? "s" : ""} nos últimos ${cruz.dias}, mas não abre o Comandra há ${Math.floor(p.horasSemEntrar / 24)} dias. Tem ${p.carteira} leads parados na mão.`,
      });
    }

    // 2) Bate ponto e não atende. Presença sem trabalho.
    if (dias >= 5 && (c?.visitas ?? 0) === 0) {
      out.push({
        tom: "grave", quem: p.nome, profileId: p.profileId,
        texto: `Bateu ponto em ${dias} dias e não atendeu ninguém. ${c?.checkins ?? 0} check-ins, zero visita.`,
      });
    }

    // 3) Custa mais do que devolve — agora com a informação de presença junto,
    //    que muda o diagnóstico: quem não aparece é um problema; quem aparece
    //    e não converte é outro.
    if (p.saldo < 0 && p.recebidos > 0) {
      const contexto = dias === 0
        ? "e não foi ao plantão nenhum dia"
        : `indo ao plantão ${dias} dia${dias > 1 ? "s" : ""}`;
      out.push({
        tom: p.saldo < -p.custoLead * 10 ? "grave" : "atencao",
        quem: p.nome, profileId: p.profileId,
        texto: `Custa mais do que devolve: ${brl(-p.saldo)} em lead pago que não virou venda, ${contexto}.`,
      });
    }

    // 4) Eficiência de plantão contra a régua do próprio time.
    if (cruz.medianaCheckinsPorVisita && c && c.visitas > 0 && c.checkins >= 8) {
      const taxa = c.checkins / c.visitas;
      if (taxa > cruz.medianaCheckinsPorVisita * 2) {
        out.push({
          tom: "atencao", quem: p.nome, profileId: p.profileId,
          texto: `Gasta ${taxa.toFixed(0)} check-ins por visita; o time faz uma a cada ${cruz.medianaCheckinsPorVisita.toFixed(0)}. Está indo ao plantão e não puxando conversa.`,
        });
      }
    }

    // 5) Quem merece ser dito em voz alta. Elogio sem número é bajulação.
    if ((c?.visitas ?? 0) >= 3 && p.saldo > 0) {
      out.push({
        tom: "bom", quem: p.nome, profileId: p.profileId,
        texto: `${c!.visitas} visitas em ${dias} dias de plantão e saldo de ${brl(p.saldo)}.`,
      });
    }

    // 6) Trabalha, mas o canal está morto. É defeito nosso, não dele.
    if (dias >= 1 && !p.chip && p.carteira > 0) {
      out.push({
        tom: "grave", quem: p.nome, profileId: p.profileId,
        texto: `Está indo ao plantão com ${p.carteira} leads na carteira e sem chip de WhatsApp. Não consegue falar com nenhum deles.`,
      });
    }
  }

  const ordem = { grave: 0, atencao: 1, bom: 2 } as const;
  return out.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}
