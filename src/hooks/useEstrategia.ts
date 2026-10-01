// Dados da tela "Onde atacar" — estratégia de estoque pela matemática REAL da Caixa.
//
// A régua certa (validada com o Junior): o crédito é o MENOR entre o que a RENDA
// aguenta e 80% da AVALIAÇÃO. A entrada é o que sobra do preço:
//     entrada = preço − mín( financiamento(renda) , 0,8 × avaliação ) − subsídio
// Quem fecha fácil é quem tem a MENOR entrada — não "avaliação perto do preço".
// Ver memory/project_tabelao_fecha_a_conta.md (regra da Caixa).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Teto de avaliação do MCMV (HIS2). Acima = alto padrão (SBPE). */
export const TETO_MCMV = 400_000;

/** Rendas-alvo comuns (renda composta, até 3 pessoas). */
export const RENDAS = [2000, 3000, 4000, 5000, 6000, 8000];

export type ProjetoFecha = {
  cod_empreendimento: number;
  empreendimento: string;
  regiao: string | null;
  disponiveis: number;
  preco_medio: number;
  avaliacao_media: number;
  entrada_media: number;   // bolso médio do cliente p/ a renda escolhida
  entrada_min: number;     // melhor unidade do projeto
  pct_fecha: number;       // % de unidades com entrada <= 0 (zero bolso)
  financiamento: number;   // o que a renda libera (teto da capacidade)
  subsidio: number | null; // subsídio da faixa (0 fora do MCMV)
  faixa: string;           // HIS1 / HIS2 / SBPE da renda
};

/** Ranking por renda-alvo. A renda e o dependente recalculam tudo no servidor. */
export function useEstrategiaFecha(renda: number, dependente: boolean) {
  return useQuery({
    queryKey: ["estrategia-fecha", renda, dependente],
    queryFn: async (): Promise<ProjetoFecha[]> => {
      const { data, error } = await supabase.rpc("estrategia_fecha", {
        p_renda: renda,
        p_dependente: dependente,
      });
      if (error) throw error;
      return (data ?? []) as ProjetoFecha[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Uma unidade disponível com a entrada já calculada para uma renda. */
export type UnidadeFecha = {
  cod_unidade: number;
  cod_empreendimento: number;
  empreendimento: string;
  numero: string | null;
  bloco: string | null;
  dormitorios: number | null;
  metragem: number | null;
  valor: number;
  valor_avaliacao: number;
  entrada: number;
  financiamento: number;
  subsidio: number | null;
  faixa: string;
};

/** As unidades que mais fecham a conta (menor entrada) para uma renda. Usado no
 *  painel do corretor, por lead. */
export function useUnidadesFecha(renda: number, dependente: boolean, enabled = true) {
  return useQuery({
    queryKey: ["unidades-fecha", renda, dependente],
    enabled,
    queryFn: async (): Promise<UnidadeFecha[]> => {
      const { data, error } = await supabase.rpc("unidades_fecha", {
        p_renda: renda, p_dependente: dependente, p_limit: 40,
      });
      if (error) throw error;
      return (data ?? []) as UnidadeFecha[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type Unidade = {
  numero: string | null;
  bloco: string | null;
  dormitorios: number | null;
  metragem: number | null;
  valor: number | null;
  valor_avaliacao: number | null;
};

export function useUnidades(cod: number | null) {
  return useQuery({
    queryKey: ["junix-unidades", cod],
    enabled: cod != null,
    queryFn: async (): Promise<Unidade[]> => {
      const { data, error } = await supabase
        .from("junix_unidades")
        .select("numero,bloco,dormitorios,metragem,valor,valor_avaliacao")
        .eq("cod_empreendimento", cod as number)
        .not("valor", "is", null)
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Unidade[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Entrada de uma unidade, para a renda escolhida (mesma conta do servidor). */
export function entradaUnidade(
  u: Unidade,
  financiamento: number,
  subsidio: number | null,
  teto: number,
  ltv = 0.8,
): number | null {
  if (u.valor == null || u.valor_avaliacao == null) return null;
  const liberado = Math.min(financiamento, ltv * u.valor_avaliacao);
  const sub = u.valor_avaliacao <= teto ? (subsidio ?? 0) : 0;
  return u.valor - liberado - sub;
}
