/**
 * /admin/ouro-ana — Log dos leads entregues pela Ana (SDR).
 * Mostra POR QUE cada lead caiu pro corretor:
 *   🥇 Ouro  = a Ana QUALIFICOU (ana_qualified_at preenchido) — tratar como prioridade
 *   ⏱️ Frio  = estourou 24h sem qualificar (só ana_contacted_at)
 * Filtra por ana_contacted_at (existe em SP e SJC); ana_qualified_at só existe em SP,
 * no SJC vem null → tudo "frio" lá (a Ana qualifica em SP).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  id: string;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  ana_contacted_at: string | null;
  ana_qualified_at: string | null;
  broker: { email: string | null } | null;
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function fetchHandoffs(days: number): Promise<Row[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, status, created_at, ana_contacted_at, ana_qualified_at, broker:profiles!broker_id(email)")
    .not("ana_contacted_at", "is", null)
    .not("broker_id", "is", null)
    .gte("created_at", since)
    .order("ana_contacted_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as unknown as Row[];
}

export default function OuroAna() {
  const [days, setDays] = useState(14);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["ouroAna", days], queryFn: () => fetchHandoffs(days) });

  const gold = useMemo(() => rows.filter((r) => r.ana_qualified_at), [rows]);
  const cold = useMemo(() => rows.filter((r) => !r.ana_qualified_at), [rows]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">🥇 Ouro da Ana</h1>
            <p className="text-zinc-400 text-sm">Leads entregues pela Ana — quem ela <b>qualificou</b> é ouro puro.</p>
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm">
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </header>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="text-3xl font-bold text-amber-300">{gold.length}</div>
            <div className="text-amber-200/80 text-sm">🥇 Qualificados pela Ana</div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="text-3xl font-bold text-zinc-300">{cold.length}</div>
            <div className="text-zinc-400 text-sm">⏱️ Entregues após 24h (frio)</div>
          </div>
        </div>

        {isLoading && <p className="text-zinc-500">Carregando…</p>}

        {gold.length > 0 && (
          <section className="mb-8">
            <h2 className="text-amber-300 font-semibold mb-2">🥇 Ouro — priorizar</h2>
            <div className="rounded-xl border border-amber-500/30 overflow-hidden">
              {gold.map((r) => (
                <a key={r.id} href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10 last:border-0">
                  <span className="text-lg">🥇</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-zinc-400">{r.phone} · {r.broker?.email || "sem corretor"}</div>
                  </div>
                  <div className="text-xs text-amber-200/70 text-right shrink-0">
                    <div>qualificada</div><div>{fmt(r.ana_qualified_at)}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-zinc-400 font-semibold mb-2">⏱️ Frio (24h)</h2>
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            {cold.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/60 last:border-0">
                <span className="text-zinc-600">⏱️</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-zinc-500">{r.phone} · {r.broker?.email || "sem corretor"}</div>
                </div>
                <div className="text-xs text-zinc-600 text-right shrink-0">{fmt(r.ana_contacted_at)}</div>
              </div>
            ))}
            {!isLoading && cold.length === 0 && <div className="px-4 py-3 text-zinc-600 text-sm">Nenhum.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
