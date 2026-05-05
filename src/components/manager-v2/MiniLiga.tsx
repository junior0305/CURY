// MiniLiga — top 3 da liga + minha posição. Click leva pra /manager/liga.
// Por enquanto usa dados sintéticos baseados em manager+vendas semana.
// Na Fase 3 conectamos com get_teams_competition_dashboard().

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";

interface Row {
  manager_id: string;
  first_name: string;
  vendas_semana: number;
  is_me: boolean;
}

interface Props {
  managerId: string;
}

export default function MiniLiga({ managerId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Pega todos os managers + vendas da semana via leads CONCLUDED
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const { data: managers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("role", "MANAGER")
        .limit(50);

      if (!managers || managers.length === 0) { setLoading(false); return; }

      // Pra cada manager, conta vendas da semana de seus brokers
      const results: Row[] = await Promise.all(
        managers.map(async (m: any) => {
          const { data: brokers } = await supabase
            .from("profiles").select("id").eq("manager_id", m.id).eq("role", "BROKER");
          const ids = (brokers || []).map((b: any) => b.id);
          let vendas = 0;
          if (ids.length > 0) {
            const { count } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .in("broker_id", ids)
              .eq("status", "CONCLUDED")
              .gte("last_interaction_at", weekAgo);
            vendas = count || 0;
          }
          return {
            manager_id: m.id,
            first_name: m.first_name || "—",
            vendas_semana: vendas,
            is_me: m.id === managerId,
          };
        })
      );

      results.sort((a, b) => b.vendas_semana - a.vendas_semana);
      setRows(results);
      setLoading(false);
    })();
  }, [managerId]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 px-4 py-3 flex items-center gap-2 text-slate-500 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" /> calculando liga…
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  const top3 = rows.slice(0, 3);
  const myPos = rows.findIndex((r) => r.is_me) + 1;
  const me = rows.find((r) => r.is_me);

  return (
    <Link to="/manager/liga" className="block">
      <motion.div
        whileHover={{ y: -2 }}
        className="rounded-2xl bg-slate-900/60 border border-slate-800/80 px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-amber-500/40 transition-colors"
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 hidden sm:inline">
            Liga
          </span>
        </div>

        <div className="flex-1 flex items-center gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {top3.map((r, i) => {
            const medal = ["🥇", "🥈", "🥉"][i];
            return (
              <div
                key={r.manager_id}
                className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg ${
                  r.is_me
                    ? "bg-amber-500/15 border border-amber-500/50"
                    : "bg-slate-800/40"
                }`}
              >
                <span>{medal}</span>
                <span
                  className={`text-xs font-bold ${
                    r.is_me ? "text-amber-300" : "text-slate-300"
                  }`}
                >
                  {r.first_name}
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${
                    r.is_me ? "text-amber-200" : "text-slate-200"
                  }`}
                >
                  {r.vendas_semana}
                </span>
              </div>
            );
          })}

          {/* Sua posição se não estiver no top 3 */}
          {me && myPos > 3 && (
            <>
              <span className="text-slate-600">…</span>
              <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/50">
                <span className="text-[11px] font-black text-amber-400">#{myPos}</span>
                <span className="text-xs font-bold text-amber-300">{me.first_name}</span>
                <span className="text-sm font-black tabular-nums text-amber-200">
                  {me.vendas_semana}
                </span>
              </div>
            </>
          )}
        </div>

        <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
      </motion.div>
    </Link>
  );
}
