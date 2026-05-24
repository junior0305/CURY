import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Repeat2, Users, Trophy, MessageCircle, Calendar } from "lucide-react";

interface Stats {
  totais: { total: number; hoje: number; d7: number; d30: number };
  por_tentativa: Array<{ attempt: number; qtd: number }>;
  por_manager: Array<{ manager: string; copias: number; responderam: number; vendas: number }>;
  top_brokers: Array<{ broker: string; manager: string; copias: number; responderam: number; vendas: number; taxa_resposta_pct: number }>;
  serie_diaria: Array<{ dia: string; copias: number }>;
  tempo_resposta_min_medio: number | null;
}

export default function Replicacao() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("replication_dashboard_stats").then(({ data, error }) => {
      if (error) console.error(error);
      else setStats(data as Stats);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  if (!stats) return <div className="p-8 text-slate-400">Sem dados.</div>;

  const t = stats.totais;
  const tempoMedio = stats.tempo_resposta_min_medio
    ? `${Math.round(stats.tempo_resposta_min_medio)} min`
    : "—";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Repeat2 className="w-6 h-6 text-cyan-400" />
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white">Replicação de Leads</h1>
          <p className="text-xs text-slate-500">Métricas internas do agente-duplicar-leads · não visível pra brokers/managers</p>
        </div>
      </div>

      {/* KPIs totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Hoje"        value={t.hoje} icon={Calendar} color="#00D4FF" />
        <KpiCard label="Últimos 7d"  value={t.d7}   icon={Calendar} color="#10B981" />
        <KpiCard label="Últimos 30d" value={t.d30}  icon={Calendar} color="#F59E0B" />
        <KpiCard label="All-time"    value={t.total} icon={Repeat2}  color="#7C3AED" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Por tentativa */}
        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-300">Por nº de Tentativa</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.por_tentativa.length === 0 ? <p className="text-xs text-slate-500">—</p> :
              stats.por_tentativa.map(p => (
                <div key={p.attempt} className="flex justify-between text-sm">
                  <span className="text-slate-400">{p.attempt}ª tentativa</span>
                  <span className="text-white font-bold">{p.qtd}</span>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Por manager */}
        <Card className="bg-slate-900/40 border-slate-800 md:col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Users className="w-4 h-4" /> Por Equipe (Manager)
          </CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 uppercase">
                <th className="text-left pb-2">Equipe</th>
                <th className="text-right pb-2">Cópias</th>
                <th className="text-right pb-2">Responderam</th>
                <th className="text-right pb-2">Vendas</th>
                <th className="text-right pb-2">Taxa</th>
              </tr></thead>
              <tbody>
                {stats.por_manager.map(m => {
                  const taxa = m.copias > 0 ? Math.round((m.responderam / m.copias) * 100) : 0;
                  return (
                    <tr key={m.manager} className="border-t border-slate-800">
                      <td className="py-2 text-white font-bold">{m.manager || "—"}</td>
                      <td className="text-right text-slate-300">{m.copias}</td>
                      <td className="text-right text-emerald-300">{m.responderam}</td>
                      <td className="text-right text-amber-300">{m.vendas}</td>
                      <td className="text-right text-cyan-300">{taxa}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Top brokers */}
      <Card className="bg-slate-900/40 border-slate-800">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Top 15 Brokers — quem mais respondeu cópias
        </CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase">
              <th className="text-left pb-2">Broker</th>
              <th className="text-left pb-2">Equipe</th>
              <th className="text-right pb-2">Cópias</th>
              <th className="text-right pb-2">Responderam</th>
              <th className="text-right pb-2">Vendas</th>
              <th className="text-right pb-2">Taxa resposta</th>
            </tr></thead>
            <tbody>
              {stats.top_brokers.map((b, i) => (
                <tr key={`${b.broker}-${i}`} className="border-t border-slate-800">
                  <td className="py-2 text-white font-bold">{b.broker}</td>
                  <td className="text-slate-400 text-xs">{b.manager}</td>
                  <td className="text-right text-slate-300">{b.copias}</td>
                  <td className="text-right text-emerald-300">{b.responderam}</td>
                  <td className="text-right text-amber-300">{b.vendas}</td>
                  <td className="text-right text-cyan-300">{b.taxa_resposta_pct || 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Tempo médio + série diária */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> Tempo médio até 1ª resposta
          </CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-emerald-300">{tempoMedio}</p>
            <p className="text-xs text-slate-500 mt-1">contado da criação da cópia até o cliente responder</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 md:col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-300">Cópias por dia (últimos 30d)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {stats.serie_diaria.length === 0 ? <p className="text-xs text-slate-500">Sem dados</p> :
                stats.serie_diaria.map(d => {
                  const max = Math.max(...stats.serie_diaria.map(x => x.copias));
                  const h = (d.copias / max) * 100;
                  return (
                    <div key={d.dia} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.dia}: ${d.copias}`}>
                      <div className="w-full bg-cyan-500/60 rounded-t" style={{ height: `${h}%`, minHeight: 2 }} />
                      <span className="text-[9px] text-slate-600">{d.dia.slice(8, 10)}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: `${color}0d`, borderColor: `${color}33` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider" style={{ color }}>{label}</span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value}</p>
    </div>
  );
}
