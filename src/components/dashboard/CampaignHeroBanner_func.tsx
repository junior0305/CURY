import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Timer, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CampaignHeroBanner({ leads, users }: { leads: any[]; users: any[] }) {
  const { data: campaign } = useQuery({
    queryKey: ["active-campaign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_campaigns").select("*")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const leaderboard = useMemo(() => {
    if (!campaign) return [];
    const actionMap: Record<string, string> = { VISIT: "VISIT_SCHEDULED", SALE: "CONCLUDED", DOCS: "DOCS_REQUESTED" };
    const targetStatus = actionMap[campaign.target_action];
    return users
      .filter(u => u.role === "BROKER")
      .map(broker => ({
        name: broker.name.split(" ")[0],
        count: leads.filter(l => l.brokerId === broker.id && l.status === targetStatus).length,
        progress: 0,
      }))
      .map(b => ({ ...b, progress: Math.min(Math.round((b.count / campaign.target_count) * 100), 100) }))
      .filter(b => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [campaign, leads, users]);

  if (!campaign) return null;

  const daysLeft = Math.max(0, Math.floor((new Date(campaign.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-slate-800 via-slate-800/90 to-indigo-900/30 shadow-2xl shadow-indigo-900/20">
      {/* Decoração */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-600/5 to-indigo-600/10 pointer-events-none" />
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-rose-600/5 blur-3xl rounded-full pointer-events-none animate-pulse" />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Lado esquerdo — O Desafio */}
        <div className="lg:col-span-7 p-5 sm:p-7 space-y-3">
          <div className="flex items-center gap-3">
            <Badge className="bg-rose-600/80 text-white font-black px-3 py-1 rounded-full border-none shadow-lg shadow-rose-900/40 animate-pulse">
              🔥 CAMPANHA ATIVA
            </Badge>
            <div className="flex items-center gap-1.5 text-gray-500 font-bold text-xs uppercase tracking-wider">
              <Timer className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-rose-400">{daysLeft}</span> dias restantes
            </div>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tighter leading-none italic">
              {campaign.title}
            </h2>
            <p className="text-gray-400 mt-2 font-medium text-sm">
              Meta:{" "}
              <span className="text-white font-black">
                {campaign.target_count} {campaign.target_action === "VISIT" ? "Visitas" : "Ações"}
              </span>
              {" "}={" "}
              <span className="text-emerald-400 font-black">R$ {campaign.reward_amount} no PIX 💸</span>
            </p>
          </div>

          {/* Progresso próprio — placeholder visual */}
          <div className="flex items-center gap-3 bg-slate-700/40 border border-gray-700/40 rounded-xl px-4 py-2.5 w-fit">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs font-bold text-gray-400">
              {leaderboard.length === 0 ? "Seja o primeiro a pontuar!" : `${leaderboard.length} corretor${leaderboard.length > 1 ? "es" : ""} no páreo`}
            </p>
          </div>
        </div>

        {/* Lado direito — Monitor de Elite */}
        <div className="lg:col-span-5 bg-slate-900/40 border-t lg:border-t-0 lg:border-l border-gray-700/30 p-5 sm:p-7">
          <h3 className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <TrendingUp className="h-3 w-3" /> Monitor de Elite
          </h3>

          {leaderboard.length === 0 ? (
            <p className="text-gray-700 text-xs italic">Ninguém pontuou ainda. Seja o primeiro!</p>
          ) : (
            <div className="space-y-3.5">
              {leaderboard.map((broker, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 font-bold text-xs flex items-center gap-2">
                      <span className="text-[10px] text-indigo-500 font-black">#{idx + 1}</span>
                      {broker.name}
                    </span>
                    <span className="text-indigo-400 font-black text-[10px]">
                      {broker.count}/{campaign.target_count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000 ease-out",
                        idx === 0
                          ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                          : "bg-slate-600"
                      )}
                      style={{ width: `${broker.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {leaderboard.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700/30 flex items-center gap-2">
              <Trophy className="h-3 w-3 text-amber-400 shrink-0" />
              <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                {leaderboard[0].name} está liderando!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
