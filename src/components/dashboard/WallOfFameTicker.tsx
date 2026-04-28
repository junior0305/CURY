import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Award } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Item = {
  id: string;
  type: "SALE" | "VISIT" | "DOCS" | "PRIZE";
  name: string;
  brokerId: string | null;
  date: string;
  value?: number;
};

const ICON: Record<Item["type"], string> = {
  SALE: "🏆", VISIT: "📅", DOCS: "📄", PRIZE: "🎁",
};
const VERB: Record<Item["type"], string> = {
  SALE: "fechou venda", VISIT: "marcou visita", DOCS: "conseguiu docs", PRIZE: "ganhou",
};

/**
 * Wall of Fame — ticker contínuo com vendas/visitas/docs/prêmios em tempo quase real.
 * Visual amber, pausa em hover, destaque cyan quando aparece o próprio corretor.
 */
export function WallOfFameTicker() {
  const { user } = useAuth();
  const [paused, setPaused] = useState(false);

  const startOfMonth = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString();
  }, []);
  const since48h = useMemo(() => new Date(Date.now() - 48*3600000).toISOString(), []);

  const { data: sales = [] } = useQuery({
    queryKey: ["wof-sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, broker_id, last_interaction_at, profiles:broker_id(first_name)")
        .eq("status", "CONCLUDED")
        .gte("last_interaction_at", startOfMonth)
        .order("last_interaction_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["wof-visits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, broker_id, last_interaction_at, profiles:broker_id(first_name)")
        .eq("status", "VISIT_SCHEDULED")
        .gte("last_interaction_at", since48h)
        .order("last_interaction_at", { ascending: false })
        .limit(6);
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["wof-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, broker_id, last_interaction_at, profiles:broker_id(first_name)")
        .eq("status", "DOCS_REQUESTED")
        .gte("last_interaction_at", since48h)
        .order("last_interaction_at", { ascending: false })
        .limit(6);
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["wof-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("id, reward_label, reward_value, action_type, created_at, profiles:user_id(first_name)")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const items = useMemo<Item[]>(() => {
    const a: Item[] = sales.map((s: any) => ({
      id: `s-${s.id}`, type: "SALE",
      name: (s.profiles as any)?.first_name || "Corretor",
      brokerId: s.broker_id, date: s.last_interaction_at,
    }));
    const b: Item[] = visits.map((v: any) => ({
      id: `v-${v.id}`, type: "VISIT",
      name: (v.profiles as any)?.first_name || "Corretor",
      brokerId: v.broker_id, date: v.last_interaction_at,
    }));
    const c: Item[] = docs.map((d: any) => ({
      id: `d-${d.id}`, type: "DOCS",
      name: (d.profiles as any)?.first_name || "Corretor",
      brokerId: d.broker_id, date: d.last_interaction_at,
    }));
    const e: Item[] = achievements.map((p: any) => ({
      id: p.id, type: "PRIZE",
      name: (p.profiles as any)?.first_name || "Corretor",
      brokerId: null, date: p.created_at, value: p.reward_value,
    }));
    return [...a, ...b, ...c, ...e]
      .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
      .slice(0, 14);
  }, [sales, visits, docs, achievements]);

  if (!items.length) return null;

  // Duplica para loop contínuo
  const looped = [...items, ...items];

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1 mx-3 my-1.5 rounded-lg overflow-hidden"
      style={{background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.18)"}}>
      <Award className="w-3.5 h-3.5 shrink-0 text-amber-400"/>
      <span className="foco-disp text-[9px] font-black uppercase tracking-wider text-amber-400 shrink-0 hidden md:block">
        WALL OF FAME
      </span>
      <div
        className="relative flex-1 overflow-hidden min-w-0 h-5"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex items-center gap-6 whitespace-nowrap absolute inset-y-0"
          style={{
            animation: paused ? "none" : "wofTicker 60s linear infinite",
            willChange: "transform",
          }}
        >
          {looped.map((it, i) => {
            const isMe = it.brokerId && it.brokerId === user?.id;
            return (
              <div key={`${it.id}-${i}`} className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs leading-none">{ICON[it.type]}</span>
                <span
                  className="text-[11px] font-black leading-none"
                  style={{ color: isMe ? "#00D4FF" : "#FCD34D" }}
                >
                  {it.name}
                </span>
                <span className="text-[11px] text-slate-400 leading-none">{VERB[it.type]}</span>
                {it.type === "PRIZE" && it.value ? (
                  <span className="text-[11px] font-bold text-amber-300 leading-none">
                    R$ {Number(it.value).toLocaleString("pt-BR")}
                  </span>
                ) : null}
                <span className="text-[10px] text-slate-600 leading-none">
                  · {formatDistanceToNow(new Date(it.date), { addSuffix: false, locale: ptBR })}
                </span>
              </div>
            );
          })}
        </div>
        <style>{`
          @keyframes wofTicker {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    </div>
  );
}
