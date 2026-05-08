import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Launch {
  id: string;
  name: string;
  description: string | null;
  hero_emoji: string | null;
  starts_at: string;
  ends_at: string;
  reward_rules: { action: "visita" | "documento" | "venda"; prize_per_unit: number; prize_pool?: number }[];
  ranking_visible: boolean;
}

export function useActiveLaunches(userId?: string | null) {
  return useQuery({
    queryKey: ["activeLaunches", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_launches_for_user", { p_user_id: userId });
      if (error) {
        console.warn("[useActiveLaunches]", error.message);
        return [] as Launch[];
      }
      return (data as any[]) as Launch[];
    },
  });
}

export interface LaunchRanking {
  action_type: "visita" | "documento" | "venda";
  broker_id: string;
  broker_name: string;
  manager_name: string | null;
  total_count: number;
  verified_count: number;
  pending_count: number;
  rejected_count: number;
  prize_estimate: number;
  prize_paid: number;
  rank_position: number;
}

export function useLaunchRankings(launchId?: string | null) {
  return useQuery({
    queryKey: ["launchRankings", launchId],
    enabled: !!launchId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_launch_rankings", { p_launch_id: launchId });
      if (error) return [] as LaunchRanking[];
      return (data as any[]) as LaunchRanking[];
    },
  });
}

export async function registerLaunchClaim(launchId: string, leadId: string, action: "visita" | "documento" | "venda") {
  return supabase.rpc("register_launch_claim", {
    p_launch_id: launchId,
    p_lead_id: leadId,
    p_action_type: action,
  });
}
