// Visitas que compareceram (fonte C2S, espelho local c2s_checkins) da diretoria.
// "Compareceu" = apareceu no estande (não é agendamento). RPC visitas_diretoria.
// Lê só o banco, não bate na API do C2S. Some quando não há dado (ex.: planoego).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const hoje = () => new Date().toISOString().slice(0, 10);
const antes = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const limpaSuper = (s: string) => (s || "").replace(/^Superintend[eê]ncia?\s*|^Superintendente\s*/i, "").trim() || s;

export default function VisitasDiretoria() {
  const [dias, setDias] = useState(30);
  const { data } = useQuery({
    queryKey: ["visitas-dir", dias],
    staleTime: 120_000,
    queryFn: async () => (await sb.rpc("visitas_diretoria", { p_de: antes(dias), p_ate: hoje() })).data as any,
  });
  if (!data || !data.total) return null;
  const sup: any[] = data.por_super ?? [];
  const cor: any[] = (data.por_corretor ?? []).slice(0, 10);
  const sem: any[] = data.por_semana ?? [];
  const maxS = Math.max(1, ...sup.map((x) => x.n));
  const maxW = Math.max(1, ...sem.map((x) => x.n));

  return (
    <div className="vis">
      <style>{`
        .vis{background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);border-radius:16px;padding:16px 18px;margin-bottom:16px;color:var(--ink,#0f1b2d)}
        .vis-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
        .vis-hd h3{font:800 16px Archivo,system-ui,sans-serif;margin:0}
        .vis-hd small{color:var(--ink3,#8793a6);font-size:12px}
        .vis-seg{margin-left:auto;display:flex;gap:4px;background:var(--sunk,#f1f5f9);border:1px solid var(--line,#e2e8f0);border-radius:9px;padding:3px}
        .vis-seg button{border:0;background:none;color:var(--ink2,#475268);font:600 12.5px system-ui;padding:5px 11px;border-radius:7px;cursor:pointer}
        .vis-seg button.on{background:#0f766e;color:#fff}
        .vis-top{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;margin-bottom:14px}
        .vis-hero{background:linear-gradient(135deg,#0f766e,#2563c9);color:#fff;border-radius:13px;padding:14px 18px;display:flex;flex-direction:column;justify-content:center;min-width:150px}
        .vis-hero b{font:800 34px Archivo,system-ui;line-height:1}
        .vis-hero span{font-size:12.5px;opacity:.92;margin-top:4px}
        .vis-week{flex:1;display:flex;gap:8px;align-items:flex-end;min-width:200px;padding:4px 0}
        .vis-wk{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
        .vis-wk{height:84px;justify-content:flex-end}
        .vis-wk i{display:block;width:70%;max-width:26px;background:linear-gradient(180deg,#2563c9,#0f766e);border-radius:5px 5px 0 0;min-height:3px}
        .vis-wk em{font-style:normal;font-size:10.5px;color:var(--ink3,#8793a6)}
        .vis-wk b{font:700 12px Archivo;color:var(--ink,#0f1b2d)}
        .vis-cols{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}
        .vis-col h4{font:700 12px system-ui;text-transform:uppercase;letter-spacing:.4px;color:var(--ink3,#8793a6);margin:0 0 8px}
        .vis-row{display:grid;grid-template-columns:1fr 2fr auto;gap:8px;align-items:center;padding:4px 0;font-size:13px}
        .vis-row.sm{grid-template-columns:1fr auto}
        .vis-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vis-bar{height:8px;border-radius:5px;background:var(--sunk,#eef2f7);overflow:hidden}
        .vis-bar i{display:block;height:100%;background:linear-gradient(90deg,#0f766e,#2563c9);border-radius:5px}
        .vis-row b{font:700 13px Archivo;font-variant-numeric:tabular-nums;text-align:right}
        @media (max-width:640px){.vis-cols{grid-template-columns:1fr}}
      `}</style>
      <header className="vis-hd">
        <div><h3>Visitas que compareceram</h3><small>no estande · fonte C2S · sua diretoria</small></div>
        <div className="vis-seg">
          {[7, 30].map((d) => <button key={d} className={dias === d ? "on" : ""} onClick={() => setDias(d)}>{d} dias</button>)}
        </div>
      </header>

      <div className="vis-top">
        <div className="vis-hero"><b>{data.total}</b><span>visitas · {data.corretores} corretores</span></div>
        <div className="vis-week">
          {sem.map((w, i) => (
            <div key={i} className="vis-wk" title={`${w.semana}: ${w.n}`}>
              <b>{w.n}</b><i style={{ height: `${Math.round((w.n / maxW) * 100)}%` }} /><em>{w.semana}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="vis-cols">
        <div className="vis-col">
          <h4>Por superintendência</h4>
          {sup.map((s, i) => (
            <div key={i} className="vis-row">
              <span className="vis-nm">{limpaSuper(s.super)}</span>
              <div className="vis-bar"><i style={{ width: `${Math.round((s.n / maxS) * 100)}%` }} /></div>
              <b>{s.n}</b>
            </div>
          ))}
        </div>
        <div className="vis-col">
          <h4>Top corretores</h4>
          {cor.map((c, i) => (
            <div key={i} className="vis-row sm"><span className="vis-nm">{c.corretor}</span><b>{c.n}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}
