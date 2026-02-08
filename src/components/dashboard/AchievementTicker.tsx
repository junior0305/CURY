import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Rocket, Trophy, Target, ArrowRight } from "lucide-react";
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
          profiles (first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  if (achievements.length === 0) return null;

  return (
    <div className="relative overflow-hidden bg-slate-900 h-10 flex items-center border-y border-slate-800 shadow-2xl">
      <div className="absolute left-0 top-0 bottom-0 px-4 bg-indigo-600 text-white flex items-center gap-2 z-10 font-black text-[10px] tracking-widest uppercase italic">
        <Rocket className="h-3.5 w-3.5 animate-bounce" />
        Wall of Fame
      </div>
      
      <div className="flex animate-marquee whitespace-nowrap gap-12 items-center pl-[140px]">
        {achievements.map((ach: any) => (
          <div key={ach.id} className="flex items-center gap-3 group cursor-default">
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-xs uppercase tracking-tighter">
                {ach.profiles?.first_name || "Corretor"}
              </span>
              <span className="text-slate-400 font-medium text-[11px]">acaba de ganhar</span>
              <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30 text-[11px] font-bold">
                {ach.reward_label}
              </span>
            </div>
            <div className="h-1 w-1 rounded-full bg-slate-700" />
          </div>
        ))}
        {/* Duplicate for seamless loop if needed, but for now simple list */}
      </div>
    </div>
  );
}
