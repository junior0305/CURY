import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, RefreshCw } from "lucide-react";

type Row = {
  produto: string; leads: number; fora_regiao: number; responderam: number;
  qualificados: number; visitas: number; vendas: number; score_medio: number;
  pct_resposta: number; pct_qualidade: number;
};

const PERIODS = [{ d: 7, l: "7 dias" }, { d: 14, l: "14 dias" }, { d: 30, l: "Mês" }];

function qColor(p: number) {
  if (p >= 15) return "text-emerald-400";
  if (p >= 5) return "text-amber-400";
  return "text-red-400";
}
function qBadge(p: number) {
  if (p >= 15) return { t: "🟢 Bom", c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (p >= 5) return { t: "🟡 Médio", c: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { t: "🔴 Lixo", c: "bg-red-500/15 text-red-400 border-red-500/30" };
}

export default function Anuncios() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (d: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("ads_quality", { p_days: d });
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(days); }, [days]);

  const tot = rows.reduce((a, r) => ({
    leads: a.leads + r.leads, qual: a.qual + r.qualificados, resp: a.resp + r.responderam,
    fora: a.fora + r.fora_regiao, vis: a.vis + r.visitas, ven: a.ven + r.vendas,
  }), { leads: 0, qual: 0, resp: 0, fora: 0, vis: 0, ven: 0 });

  return (
    <div className="p-6 text-slate-100">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Anúncios — Qualidade dos leads</h1>
            <p className="text-sm text-slate-400">Qual empreendimento traz lead que qualifica — corte o lixo sem depender do Facebook.</p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 border border-slate-700">
          {PERIODS.map((p) => (
            <button key={p.d} onClick={() => setDays(p.d)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${days === p.d ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {p.l}
            </button>
          ))}
          <button onClick={() => load(days)} title="Atualizar" className="px-3 py-2 rounded-lg text-slate-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { l: "Leads", v: tot.leads },
          { l: "Responderam", v: tot.resp },
          { l: "Qualificados", v: tot.qual, hl: true },
          { l: "Visitas", v: tot.vis },
          { l: "Fora de região", v: tot.fora },
        ].map((k) => (
          <div key={k.l} className={`rounded-xl p-4 border ${k.hl ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-800/50 border-slate-700"}`}>
            <div className="text-2xl font-black">{k.v}</div>
            <div className="text-xs text-slate-400 mt-1">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-800/70 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Empreendimento</th>
              <th className="text-right px-3 py-3">Leads</th>
              <th className="text-right px-3 py-3">Resp.</th>
              <th className="text-right px-3 py-3">Qualif.</th>
              <th className="text-right px-3 py-3">% Qualidade</th>
              <th className="text-right px-3 py-3">Score</th>
              <th className="text-right px-3 py-3">Visitas</th>
              <th className="text-center px-3 py-3">Veredito</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-10 text-slate-500">Carregando…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-slate-500">Sem dados no período.</td></tr>}
            {!loading && rows.filter((r) => r.leads >= 3).map((r) => {
              const b = qBadge(r.pct_qualidade);
              return (
                <tr key={r.produto} className="border-t border-slate-800 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-semibold">{r.produto}</td>
                  <td className="text-right px-3 py-3">{r.leads}</td>
                  <td className="text-right px-3 py-3 text-slate-400">{r.responderam}</td>
                  <td className="text-right px-3 py-3 font-bold">{r.qualificados}</td>
                  <td className={`text-right px-3 py-3 font-black ${qColor(r.pct_qualidade)}`}>{r.pct_qualidade}%</td>
                  <td className="text-right px-3 py-3">{r.score_medio}</td>
                  <td className="text-right px-3 py-3 text-slate-400">{r.visitas}</td>
                  <td className="text-center px-3 py-3"><span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${b.c}`}>{b.t}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Empreendimentos com 3+ leads. <b>Qualificado</b> = respondeu + perfil que aprova (CLT / func. público / renda informada).
        Os eventos de qualidade já vão automaticamente pro Facebook (CAPI) por campanha.
      </p>
    </div>
  );
}
