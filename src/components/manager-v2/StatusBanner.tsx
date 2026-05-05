// StatusBanner — mensagem curta de status do manager + link pra Liga.
// Sem tabela visível — só motivação ou alerta calmo.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ArrowRight } from "lucide-react";

interface Props {
  managerId: string;
  managerName: string;
}

export default function StatusBanner({ managerId, managerName }: Props) {
  const [pos, setPos] = useState<{ rank: number; total: number; vendas: number; topName?: string; gap?: number } | null>(null);

  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: managers } = await supabase
        .from("profiles").select("id, first_name").eq("role", "MANAGER");
      if (!managers) return;

      const rows = await Promise.all(
        managers.map(async (m: any) => {
          const { data: brokers } = await supabase
            .from("profiles").select("id").eq("manager_id", m.id).eq("role", "BROKER");
          const ids = (brokers || []).map((b: any) => b.id);
          if (ids.length === 0) return { id: m.id, name: m.first_name, vendas: 0 };
          const { count } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .in("broker_id", ids)
            .eq("status", "CONCLUDED")
            .gte("last_interaction_at", weekAgo);
          return { id: m.id, name: m.first_name || "—", vendas: count || 0 };
        })
      );
      rows.sort((a, b) => b.vendas - a.vendas);
      const myIndex = rows.findIndex((r) => r.id === managerId);
      const me = rows[myIndex];
      const top = rows[0];
      if (me && top) {
        setPos({
          rank: myIndex + 1,
          total: rows.length,
          vendas: me.vendas,
          topName: top.id !== me.id ? top.name : undefined,
          gap: top.id !== me.id ? top.vendas - me.vendas : undefined,
        });
      }
    })();
  }, [managerId]);

  if (!pos) return null;

  // Tom da mensagem
  let tone: "hot" | "warm" | "cool" = "cool";
  let message = "";
  let color = "#06B6D4";
  let emoji = "💪";

  if (pos.rank === 1) {
    tone = "hot";
    color = "#10B981";
    emoji = "🥇";
    message = `${managerName}, você é o líder desta semana com ${pos.vendas} vendas. Continue acelerando.`;
  } else if (pos.rank <= 3) {
    tone = "warm";
    color = "#F59E0B";
    emoji = pos.rank === 2 ? "🥈" : "🥉";
    message = pos.gap === 1
      ? `${managerName}, você está em #${pos.rank}. Falta ${pos.gap} venda pra alcançar ${pos.topName}.`
      : `${managerName}, você está em #${pos.rank}. ${pos.gap} vendas pra empatar com ${pos.topName}.`;
  } else {
    tone = "cool";
    color = "#EF4444";
    emoji = "🎯";
    message = `${managerName}, você está em #${pos.rank} de ${pos.total}. ${pos.gap} vendas pra alcançar ${pos.topName}. Hora de virar o jogo.`;
  }

  return (
    <Link to="/manager/liga" className="block">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ x: 2 }}
        className="rounded-xl px-4 py-2.5 flex items-center gap-3 border transition group"
        style={{
          background: `linear-gradient(90deg, ${color}10, transparent)`,
          borderColor: `${color}30`,
        }}
      >
        <span className="text-lg shrink-0">{emoji}</span>
        <p className="flex-1 text-sm text-slate-200 leading-snug">{message}</p>
        <span className="flex items-center gap-1 text-[11px] uppercase tracking-widest font-bold opacity-60 group-hover:opacity-100 transition" style={{ color }}>
          Liga <ArrowRight className="w-3 h-3" />
        </span>
      </motion.div>
    </Link>
  );
}
