// A CONTA DE ANÚNCIO DO GERENTE, lida no Facebook.
//
// A aba Anúncios enxergava só o lead que CHEGOU no Comandra. Quem gasta e não
// recebe via tela vazia, igual a quem não anuncia — o dinheiro saía e nada
// denunciava. Este hook lê a conta na fonte, e a diferença entre "o Facebook
// registrou" e "chegou aqui" vira o número mais importante da tela: é o único
// que aparece quando o cano entre os dois entope.
//
// O token não passa pelo navegador. Quem fala com o Facebook é a edge
// fb-conta-gerente, que resolve o dono pela fb_bm_tokens.owner_id.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampanhaFb {
  nome: string;
  gasto: number;
  leads: number;
  cpl: number | null;
}

export interface ContaFacebook {
  semConta: boolean;
  motivo?: string;
  conta?: string;
  gasto: number;
  leads: number;
  cpl: number | null;
  impressoes: number;
  ativas: number;
  campanhas: CampanhaFb[];
  /** texto pronto do Facebook: "Saldo disponível (R$2.743,23 BRL)" */
  saldo: string | null;
  prePago: boolean;
}

export function useContaFacebook(
  managerId: string | undefined,
  janela: { de: string; ate: string },
) {
  return useQuery<ContaFacebook>({
    queryKey: ["conta-fb", managerId, janela.de, janela.ate],
    enabled: !!managerId,
    staleTime: 10 * 60_000,   // o Facebook não muda de minuto em minuto
    retry: 1,
    queryFn: async () => {
      const vazio: ContaFacebook = {
        semConta: true, gasto: 0, leads: 0, cpl: null, impressoes: 0,
        ativas: 0, campanhas: [], saldo: null, prePago: false,
      };
      const { data, error } = await supabase.functions.invoke("fb-conta-gerente", {
        body: { owner_id: managerId, de: janela.de, ate: janela.ate },
      });
      if (error) return { ...vazio, motivo: error.message };
      const d = data as any;
      if (d?.error) return { ...vazio, motivo: d.error };
      if (d?.semConta) return { ...vazio, motivo: d.motivo };
      return {
        semConta: false, conta: d.conta,
        gasto: d.gasto ?? 0, leads: d.leads ?? 0, cpl: d.cpl ?? null,
        impressoes: d.impressoes ?? 0, ativas: d.ativas ?? 0,
        campanhas: d.campanhas ?? [], saldo: d.saldo ?? null,
        prePago: !!d.prePago,
      };
    },
  });
}
