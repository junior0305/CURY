import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, ChevronLeft, ChevronRight, Users, CalendarCheck, UserCheck, Trophy, Ghost, Zap, TrendingUp, ChevronDown } from "lucide-react";

type Mgr = {
  gerente: string; equipe: number; logaram_semana: number; online_agora: number;
  leads_chegaram: number; nunca_atendidos: number; sla_mediana_min: number | null;
  check_ins: number; agendou: number; compareceu: number; vendeu: number;
};
type AdocaoGrp = { corretores: number; vendas: number; visitas: number; checkins: number; pct_atendidos: number };
type Gerentes = { period_start: string; gerentes: Mgr[]; adocao: Record<string, AdocaoGrp>; evolucao: { week_start: string; grupo: string; pct_atendidos: number; vendas: number }[] };

const slaLabel = (min: number | null) => {
  if (min == null) return "—";
  if (min < 60) return `${min}min`;
  return `${(min / 60).toFixed(1)}h`;
};

type Broker = {
  broker_id: string; broker_name: string; manager_name: string | null;
  plantoes: number; visitas: number; visitas_compareceram: number;
  visitas_agendadas: number; vendas: number;
};
type Summary = {
  period_start: string; period_end: string;
  totals: Record<string, number>;
  per_broker: Broker[];
};

const fmtRange = (s?: string, e?: string) => {
  if (!s) return "";
  const d = (x: string) => { const [y, m, day] = x.slice(0, 10).split("-"); return `${day}/${m}`; };
  return `${d(s)} – ${d(e || s)}`;
};

function selo(b: Broker) {
  if ((b.plantoes ?? 0) === 0) return { t: "Fantasma", c: "bg-red-500/15 text-red-400 border-red-500/30", icon: "🔴" };
  if ((b.vendas ?? 0) === 0 && (b.visitas_compareceram ?? 0) === 0 && (b.visitas ?? 0) === 0)
    return { t: "Presente s/ resultado", c: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: "🟡" };
  return { t: "Trabalhando", c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: "🟢" };
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (d === 0) return <span className="text-slate-500 text-xs">→ 0</span>;
  const up = d > 0;
  return <span className={`text-xs font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>{up ? "▲" : "▼"} {Math.abs(d)}</span>;
}

export default function CockpitReuniao() {
  const [offset, setOffset] = useState(-1); // -1 = semana passada (reunião de 2ª revê a semana anterior)
  const [cur, setCur] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [mgr, setMgr] = useState<Gerentes | null>(null);
  const [openMgr, setOpenMgr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const base = new Date();
    const anchor = new Date(base.getTime() + offset * 7 * 86400000).toISOString().slice(0, 10);
    const anchorPrev = new Date(base.getTime() + (offset - 1) * 7 * 86400000).toISOString().slice(0, 10);
    const [a, b, g] = await Promise.all([
      supabase.rpc("get_secretary_summary", { p_period_type: "week", p_anchor_date: anchor }),
      supabase.rpc("get_secretary_summary", { p_period_type: "week", p_anchor_date: anchorPrev }),
      supabase.rpc("reuniao_gerentes", { p_anchor_date: anchor }),
    ]);
    if (!a.error) setCur(a.data as Summary);
    if (!b.error) setPrev(b.data as Summary);
    if (!g.error) setMgr(g.data as Gerentes);
    setLoading(false);
  }, [offset]);
  useEffect(() => { load(); }, [load]);

  const t = cur?.totals || {};
  const tp = prev?.totals || {};
  const brokers = [...(cur?.per_broker || [])].sort((a, b) => (b.plantoes ?? 0) - (a.plantoes ?? 0) || (b.vendas ?? 0) - (a.vendas ?? 0));
  const fantasmas = brokers.filter(b => (b.plantoes ?? 0) === 0).length;

  // rollup por PDV/gerente
  const teams: Record<string, { ci: number; ag: number; comp: number; ven: number }> = {};
  brokers.forEach(b => {
    const k = b.manager_name || "(sem PDV)";
    teams[k] = teams[k] || { ci: 0, ag: 0, comp: 0, ven: 0 };
    teams[k].ci += b.plantoes ?? 0; teams[k].ag += b.visitas_agendadas ?? 0;
    teams[k].comp += b.visitas_compareceram ?? 0; teams[k].ven += b.vendas ?? 0;
  });
  const teamRows = Object.entries(teams).sort((a, b) => b[1].ci - a[1].ci);

  // destaque: maior evolução de check-in vs semana anterior
  const prevById: Record<string, Broker> = {};
  (prev?.per_broker || []).forEach(b => { prevById[b.broker_id] = b; });
  let topEvo: { name: string; d: number } | null = null;
  brokers.forEach(b => {
    const d = (b.plantoes ?? 0) - (prevById[b.broker_id]?.plantoes ?? 0);
    if (d > 0 && (!topEvo || d > topEvo.d)) topEvo = { name: b.broker_name, d };
  });

  const KPIS = [
    { l: "Check-ins", k: "plantoes", icon: CalendarCheck },
    { l: "Visitas agendadas", k: "visitas_agendadas", icon: CalendarCheck },
    { l: "Compareceram", k: "visitas_compareceram", icon: UserCheck },
    { l: "Vendas", k: "vendas", icon: Trophy },
  ];

  return (
    <div className="text-slate-100 space-y-6">
      {/* navegador de semana */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(o => o - 1)} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700 hover:text-cyan-300"><ChevronLeft className="w-4 h-4" /></button>
          <div className="text-center min-w-[150px]">
            <div className="text-sm font-black">{fmtRange(cur?.period_start, cur?.period_end)}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">{offset === 0 ? "semana atual" : offset === -1 ? "semana passada" : `${Math.abs(offset)} semanas atrás`}</div>
          </div>
          <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0} className="p-2 rounded-lg bg-slate-800/60 border border-slate-700 hover:text-cyan-300 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/25">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* placares */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIS.map(k => (
          <div key={k.k} className="rounded-xl p-4 bg-slate-800/50 border border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-black">{t[k.k] ?? 0}</span>
              <Delta now={t[k.k] ?? 0} prev={tp[k.k] ?? 0} />
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1"><k.icon className="w-3 h-3" />{k.l}</div>
          </div>
        ))}
      </div>

      {/* faixa accountability */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
          <Ghost className="w-4 h-4 text-red-400" />
          <span className="text-sm"><b className="text-red-400">{fantasmas}</b> fantasmas <span className="text-slate-500">(0 check-in)</span></span>
        </div>
        {topEvo && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <Trophy className="w-4 h-4 text-cyan-300" />
            <span className="text-sm">⭐ Maior evolução: <b className="text-cyan-300">{(topEvo as { name: string }).name}</b> <span className="text-slate-500">+{(topEvo as { d: number }).d} check-ins</span></span>
          </div>
        )}
      </div>

      {/* ADOÇÃO: usa × não usa (a prova) */}
      {mgr?.adocao?.USA && mgr?.adocao?.NAO_USA && (
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-300" /> Quem usa o sistema × quem não usa</h3>
        <div className="grid grid-cols-2 gap-3">
          {([["USA", "🟢 Usa o sistema", "border-emerald-500/40 bg-emerald-500/10"], ["NAO_USA", "🔴 Não usa", "border-red-500/40 bg-red-500/10"]] as const).map(([k, lbl, cls]) => {
            const g = mgr.adocao[k];
            return (
              <div key={k} className={`rounded-xl p-4 border ${cls}`}>
                <div className="text-sm font-bold mb-2">{lbl} <span className="text-slate-500 font-normal">({g.corretores})</span></div>
                <div className="text-3xl font-black">{g.pct_atendidos}%</div>
                <div className="text-xs text-slate-400 mb-2">dos leads atendidos</div>
                <div className="text-xs text-slate-300">📅 {g.checkins} check-ins/corretor · 🏆 {g.vendas} vendas</div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-2">A prova: quem usa atende <b className="text-emerald-400">{mgr.adocao.USA.pct_atendidos}%</b> dos leads; quem não usa, <b className="text-red-400">{mgr.adocao.NAO_USA.pct_atendidos}%</b>. Lead não atendido = dinheiro na mesa.</p>
      </div>
      )}

      {/* EVOLUÇÃO ao longo das semanas */}
      {mgr?.evolucao && mgr.evolucao.length > 0 && (
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Evolução — % atendidos por semana</h3>
        <div className="rounded-xl border border-slate-700 overflow-x-auto p-3">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs uppercase"><tr><th className="text-left px-2 py-1">Semana</th><th className="text-right px-2 py-1 text-emerald-400">Usa</th><th className="text-right px-2 py-1 text-red-400">Não usa</th><th className="text-right px-2 py-1">Gap</th></tr></thead>
            <tbody>
              {Object.values(mgr.evolucao.reduce((acc: Record<string, { wk: string; usa?: number; nao?: number }>, e) => {
                acc[e.week_start] = acc[e.week_start] || { wk: e.week_start };
                if (e.grupo === "USA") acc[e.week_start].usa = e.pct_atendidos; else acc[e.week_start].nao = e.pct_atendidos;
                return acc;
              }, {})).sort((a, b) => a.wk.localeCompare(b.wk)).map(row => (
                <tr key={row.wk} className="border-t border-slate-800">
                  <td className="px-2 py-1.5">{row.wk.slice(8, 10)}/{row.wk.slice(5, 7)}</td>
                  <td className="text-right px-2 py-1.5 font-bold text-emerald-400">{row.usa ?? "—"}%</td>
                  <td className="text-right px-2 py-1.5 font-bold text-red-400">{row.nao ?? "—"}%</td>
                  <td className="text-right px-2 py-1.5 text-cyan-300 font-black">{row.usa != null && row.nao != null ? `+${Math.round(row.usa - row.nao)}pp` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ABERTURA POR GERENTE (sanfona) */}
      {mgr?.gerentes && mgr.gerentes.length > 0 && (
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4" /> Abertura por gerente / PDV</h3>
        <div className="space-y-2">
          {mgr.gerentes.map(m => {
            const open = openMgr === m.gerente;
            const semDono = m.gerente === "(sem PDV)";
            return (
              <div key={m.gerente} className="rounded-xl border border-slate-700 overflow-hidden">
                <button onClick={() => setOpenMgr(open ? null : m.gerente)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800">
                  <span className="font-bold flex items-center gap-2"><ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />{m.gerente}</span>
                  <span className="flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-slate-400">👥 {m.logaram_semana}/{m.equipe} logaram</span>
                    <span className="text-slate-400">📥 {m.leads_chegaram} leads</span>
                    <span className={m.nunca_atendidos > 0 ? "text-red-400" : "text-slate-400"}>🚫 {m.nunca_atendidos} s/ atender</span>
                    <span className="text-slate-400">⏱ {slaLabel(m.sla_mediana_min)}</span>
                    <span className="text-emerald-400 font-bold">🏆 {m.vendeu}</span>
                  </span>
                </button>
                {open && (
                  <div className="px-4 py-3 grid grid-cols-3 md:grid-cols-6 gap-2 text-center bg-slate-900/40">
                    {[["Equipe", m.equipe], ["Logaram", m.logaram_semana], ["Leads", m.leads_chegaram], ["Check-ins", m.check_ins], ["Agendou", m.agendou], ["Compareceu", m.compareceu]].map(([l, v]) => (
                      <div key={l as string}><div className="text-lg font-black">{v as number}</div><div className="text-[10px] text-slate-500 uppercase">{l as string}</div></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ranking corretores */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> Ranking — esforço → resultado</h3>
        <div className="rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-800/70 text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Corretor</th><th className="text-left px-3 py-3">PDV</th>
                <th className="text-right px-3 py-3">Check-ins</th><th className="text-right px-3 py-3">Agendou</th>
                <th className="text-right px-3 py-3">Compareceu</th><th className="text-right px-3 py-3">Vendeu</th>
                <th className="text-center px-3 py-3">Selo</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-10 text-slate-500">Carregando…</td></tr>}
              {!loading && brokers.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-500">Sem atividade nessa semana.</td></tr>}
              {!loading && brokers.map(b => {
                const s = selo(b);
                return (
                  <tr key={b.broker_id} className="border-t border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-semibold">{b.broker_name}</td>
                    <td className="px-3 py-2.5 text-slate-400">{b.manager_name || "—"}</td>
                    <td className="text-right px-3 py-2.5 font-black">{b.plantoes ?? 0}</td>
                    <td className="text-right px-3 py-2.5 text-slate-300">{b.visitas_agendadas ?? 0}</td>
                    <td className="text-right px-3 py-2.5 text-slate-300">{b.visitas_compareceram ?? 0}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-emerald-400">{b.vendas ?? 0}</td>
                    <td className="text-center px-3 py-2.5"><span className={`text-[11px] px-2 py-1 rounded-full border whitespace-nowrap ${s.c}`}>{s.icon} {s.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* rollup por PDV */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4" /> Por PDV / Equipe</h3>
        <div className="rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-slate-800/70 text-slate-400 text-xs uppercase">
              <tr><th className="text-left px-4 py-3">PDV</th><th className="text-right px-3 py-3">Check-ins</th><th className="text-right px-3 py-3">Agendou</th><th className="text-right px-3 py-3">Compareceu</th><th className="text-right px-3 py-3">Vendeu</th></tr>
            </thead>
            <tbody>
              {teamRows.map(([name, v]) => (
                <tr key={name} className="border-t border-slate-800 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 font-semibold">{name}</td>
                  <td className="text-right px-3 py-2.5 font-black">{v.ci}</td>
                  <td className="text-right px-3 py-2.5 text-slate-300">{v.ag}</td>
                  <td className="text-right px-3 py-2.5 text-slate-300">{v.comp}</td>
                  <td className="text-right px-3 py-2.5 font-bold text-emerald-400">{v.ven}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Eixo de cobrança = <b className="text-slate-300">check-ins</b> (presença no plantão). Conversão é o 2º olhar. ⚠️ Taxa de no-show (agendou→compareceu) ainda não é confiável — agendadas e comparecimentos vêm de fontes diferentes esta semana.
      </p>
    </div>
  );
}
