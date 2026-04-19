import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Target, TrendingUp, Trophy } from "lucide-react";

/**
 * MetaStrip — barra de meta do mês em fechamentos reais.
 * Mostra: fechamentos / meta · posição no ranking · leads em docs enviados
 */
export function MetaStrip() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data } = useQuery({
    queryKey: ["meta-strip", userId],
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startIso = startOfMonth.toISOString();

      // Fechamentos do corretor no mês
      const { count: fechamentos } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("broker_id", userId!)
        .eq("status", "CONCLUDED")
        .gte("last_interaction_at", startIso);

      // Leads em DOCS_REQUESTED (a um passo do fechamento)
      const { count: emDocs } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("broker_id", userId!)
        .eq("status", "DOCS_REQUESTED");

      // Meta mensal do corretor (perfil)
      const { data: profile } = await supabase
        .from("profiles")
        .select("monthly_goal")
        .eq("id", userId!)
        .single();

      const meta = (profile as any)?.monthly_goal ?? 5;

      // Ranking do mês — fechamentos de todos os corretores
      const { data: ranking } = await supabase
        .from("leads")
        .select("broker_id")
        .eq("status", "CONCLUDED")
        .gte("last_interaction_at", startIso);

      const countByBroker: Record<string, number> = {};
      (ranking || []).forEach((r: any) => {
        if (r.broker_id) countByBroker[r.broker_id] = (countByBroker[r.broker_id] || 0) + 1;
      });

      const sorted = Object.entries(countByBroker).sort((a, b) => b[1] - a[1]);
      const myPos = sorted.findIndex(([id]) => id === userId);
      const posicao = myPos === -1 ? sorted.length + 1 : myPos + 1;
      const totalBrokers = Math.max(sorted.length, 1);

      // Líder do mês
      const leaderId = sorted[0]?.[0];
      const liderCount = sorted[0]?.[1] ?? 0;
      let liderNome = "";
      if (leaderId && leaderId !== userId && liderCount > 0) {
        const { data: lider } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", leaderId)
          .single();
        liderNome = (lider as any)?.first_name ?? "";
      }

      return {
        fechamentos: fechamentos ?? 0,
        meta,
        emDocs: emDocs ?? 0,
        posicao,
        totalBrokers,
        liderNome,
        liderCount,
      };
    },
  });

  if (!data) return null;

  const { fechamentos, meta, emDocs, posicao, totalBrokers, liderNome, liderCount } = data;
  const pct = Math.min(100, Math.round((fechamentos / meta) * 100));
  const faltam = Math.max(0, meta - fechamentos);

  return (
    <div className="bg-[#0d1117] border-b border-white/5 px-4 py-3 space-y-2">
      {/* Linha 1: meta + posição */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider shrink-0">Meta</span>
          <span className="text-xs font-black text-white tabular-nums">{fechamentos}/{meta}</span>
          {faltam > 0 ? (
            <span className="text-[10px] text-gray-600 truncate">
              · {faltam} venda{faltam > 1 ? "s" : ""} para bater
            </span>
          ) : (
            <span className="text-[10px] text-emerald-400 font-black">· META BATIDA 🎉</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Trophy className="w-3 h-3 text-amber-400" />
          <span className="text-xs font-black text-white tabular-nums">{posicao}º</span>
          <span className="text-[10px] text-gray-600">de {totalBrokers}</span>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct >= 100
              ? "linear-gradient(90deg, #10b981, #34d399)"
              : pct >= 60
              ? "linear-gradient(90deg, #6366f1, #818cf8)"
              : "linear-gradient(90deg, #f59e0b, #fbbf24)",
          }}
        />
      </div>

      {/* Linha 2: docs + líder */}
      <div className="flex items-center justify-between gap-3 text-[10px]">
        {emDocs > 0 ? (
          <div className="flex items-center gap-1 text-sky-400">
            <TrendingUp className="w-3 h-3" />
            <span className="font-black">{emDocs} lead{emDocs > 1 ? "s" : ""} em Docs</span>
            <span className="text-gray-600">— feche agora e bata a meta</span>
          </div>
        ) : (
          <span className="text-gray-700">Nenhum lead em docs enviados</span>
        )}

        {liderNome && liderCount > fechamentos && (
          <span className="text-gray-600 truncate">
            Líder: <span className="text-white font-black">{liderNome}</span> ({liderCount}v)
          </span>
        )}
      </div>
    </div>
  );
}
