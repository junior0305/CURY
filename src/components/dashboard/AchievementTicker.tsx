import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Target, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AchievementTicker() {
  const { data: achievements = [] } = useQuery({
    queryKey: ["public-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select(`
          id,
          reward_label,
          action_type,
          created_at,
          status,
          profiles (first_name, last_name)
        `)
        .eq('status', 'APPROVED')
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  return (
    <div className="relative overflow-hidden bg-[#0F172A] h-12 flex items-center border-b border-indigo-500/30 shadow-[0_4px_20px_rgba(79,70,229,0.4)] z-50">
      <div className="absolute left-0 top-0 bottom-0 px-3 sm:px-6 bg-indigo-600 text-white flex items-center gap-2 z-20 font-black text-[10px] sm:text-xs tracking-tighter uppercase italic skew-x-[-12deg] -ml-2">
        <div className="skew-x-[12deg] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300 animate-pulse" />
          <span className="hidden sm:inline">Wall of Fame</span>
          <span className="sm:hidden">LÍDERES</span>
        </div>
      </div>
      
      <div className="flex w-full overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap gap-8 sm:gap-16 items-center pl-32">
          {achievements.length === 0 ? (
            <span className="text-indigo-300/50 font-bold text-[10px] sm:text-xs uppercase tracking-widest animate-pulse">
              Aguardando o próximo fechamento de elite...
            </span>
          ) : (
            // Duplicate the list to ensure a smooth continuous loop
            [...achievements, ...achievements].map((ach: any, idx) => (
              <div key={`${ach.id}-${idx}`} className="flex items-center gap-3 py-1 px-3 bg-white/5 rounded-full border border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-white font-black text-xs sm:text-sm uppercase tracking-tighter">
                    {ach.profiles?.first_name || "Corretor"}
                  </span>
                  <span className="text-indigo-400 font-black text-[10px] sm:text-xs tracking-widest uppercase">
                    GANHOU:
                  </span>
                  <span className="bg-indigo-500 text-white px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-black shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                    {ach.reward_label}
                  </span>
                </div>
                <div className="h-1 w-1 rounded-full bg-indigo-500/50" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}