// Check-in de plantão dos corretores — vem do Contact2Sale (C2S), via
// /sales_stand/leads, espelhado em public.c2s_checkins (conector /root/c2s).
// Substitui o check-in que vinha da Cury. Ver memory/reference_contact2sale_api.md.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CheckinCorretor = {
  corretor: string;
  gerente: string | null;
  diretor: string | null;
  n_checkins: number;
  ultimo: string | null;
  tipos: string | null;
};

export function useCheckinResumo(dias: number) {
  return useQuery({
    queryKey: ["c2s-checkin-resumo", dias],
    queryFn: async (): Promise<CheckinCorretor[]> => {
      const { data, error } = await supabase.rpc("c2s_checkin_resumo", { p_dias: dias });
      if (error) throw error;
      return (data ?? []) as CheckinCorretor[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type CheckinEquipe = {
  corretor: string;
  n_checkins: number;
  ultimo: string | null;
  tipos: string | null;
};

/** Check-in da equipe de UM gerente (de-para seller C2S → profile por 1º nome). */
export function useCheckinEquipe(managerId: string | undefined, dias: number) {
  return useQuery({
    queryKey: ["c2s-checkin-equipe", managerId, dias],
    enabled: !!managerId,
    queryFn: async (): Promise<CheckinEquipe[]> => {
      const { data, error } = await supabase.rpc("c2s_checkin_equipe", {
        p_manager_id: managerId, p_dias: dias,
      });
      if (error) throw error;
      return (data ?? []) as CheckinEquipe[];
    },
    staleTime: 3 * 60 * 1000,
  });
}
