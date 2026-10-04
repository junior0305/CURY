import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

/* O gerente que o painel deve mostrar. Normalmente é o próprio usuário logado.
 * Mas superintendente e admin podem abrir o painel de um gerente específico
 * pela URL (?manager=<id>) — é o que faz o drill-down do painel do super
 * reusar 100% do painel do gerente, sem duplicar tela. */
export function useEffectiveManagerId(): string | undefined {
  const { session, role } = useAuth();
  const [params] = useSearchParams();
  const override = params.get("manager");
  if ((role === "SUPERINTENDENT" || role === "ADMIN" || role === "DIRECTOR") && override) return override;
  return session?.user?.id ?? undefined;
}

export interface CorretorRollup {
  id: string; nome: string; online: boolean | null; ultimo_acesso: string | null;
  carteira: number; em_conversa: number; leads_periodo: number; vendas_mes: number;
  plantao_hoje?: boolean;
}
export interface GerenteRollup {
  id: string; nome: string; corretores: number; online: number;
  plantao_hoje: number; plantao_semana: number;
  leads_periodo: number; carteira: number; em_conversa: number; vendas_mes: number;
  corretores_lista: CorretorRollup[];
}
export interface SuperRollup {
  dias: number;
  gerentes: GerenteRollup[];
  total: {
    gerentes: number; corretores: number; online: number;
    plantao_hoje: number; plantao_semana: number;
    leads_periodo: number; carteira: number; em_conversa: number; vendas_mes: number;
  };
}

export interface CampanhaNaoLead {
  id: string; nome: string; responderam: number; falaram: number;
  pessoas: { phone: string; nome: string; gerente: string; falou: boolean; quando: string | null }[];
}
/* Campanhas NÃO-lead do super (ex.: contratação): quem respondeu, gerente
 * responsável e se o gerente já falou (cruzando com o chip Evolution dele). */
export function useCampanhasNaoLead(superId: string | undefined) {
  return useQuery<CampanhaNaoLead[]>({
    queryKey: ["super-nao-lead", superId],
    enabled: !!superId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("super_campanhas_nao_lead", { p_super: superId });
      if (error) throw error;
      return ((data as any)?.campanhas ?? []) as CampanhaNaoLead[];
    },
  });
}

/* A visão agregada do superintendente: um rollup de cada gerente abaixo dele.
 * Baseado em leads + profiles — dado que sobrevive a sair da Cury. */
export function useSuperintendenteRollup(superId: string | undefined, dias: number) {
  return useQuery<SuperRollup>({
    queryKey: ["super-rollup", superId, dias],
    enabled: !!superId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superintendente_rollup", {
        p_super: superId, p_dias: dias,
      });
      if (error) throw error;
      return data as SuperRollup;
    },
  });
}
