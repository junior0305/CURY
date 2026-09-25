/**
 * B.I. Diretoria — Tela 1 (Fechamento & Comparativo: Vendas × Visitas × Documentos).
 * Port da Tela 1 do mockup_bi_diretoria.html, ligado a dados reais:
 *   · Vendas/Visitas/Check-in → cury_metricas_diarias (verdade operacional da Cury)
 *   · R$ realizado → leads.sale_value (CONCLUDED, valor informado — parcial)
 *   · VGV estimado → vendas(Cury) × ticket médio (system_settings.bi_ticket_medio)
 *   · Documentos/Pastas → salesforce_propostas
 * Via RPC bi_fechamento(p_dias, p_escopo, p_manager). Telas 2/3/4 = "em breve".
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Nivel = "super" | "gerente" | "corretor";

const BI_CSS = `
.mgr10 .bi{display:flex;flex-direction:column;gap:var(--s3)}
.mgr10 .bi-screens{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .bi-screens button{font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink-3);transition:.14s}
.mgr10 .bi-screens button.on{background:var(--blue);border-color:var(--blue);color:#fff}
.mgr10 .bi-screens button:disabled{opacity:.4;cursor:not-allowed}
.mgr10 .bi-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.mgr10 .bi-seg{display:flex;gap:2px;background:var(--sunk);border-radius:9px;padding:2px}
.mgr10 .bi-seg button{font-size:12.5px;font-weight:600;padding:5px 13px;border-radius:7px;color:var(--ink-3)}
.mgr10 .bi-seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.07)}
.mgr10 .bi-cards{display:grid;gap:var(--s2);grid-template-columns:1fr}
@media(min-width:760px){.mgr10 .bi-cards{grid-template-columns:repeat(4,1fr)}}
.mgr10 .bi-card{border-radius:16px;padding:16px 18px;color:#fff;position:relative;overflow:hidden;min-height:118px;display:flex;flex-direction:column;justify-content:space-between}
.mgr10 .bi-card .k{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.9}
.mgr10 .bi-card .v{font-family:"JetBrains Mono",monospace;font-size:29px;font-weight:800;letter-spacing:-.04em;line-height:1;margin-top:8px}
.mgr10 .bi-card .v small{font-size:15px;font-weight:700;opacity:.9}
.mgr10 .bi-card .s{font-size:12px;font-weight:500;opacity:.92;margin-top:8px;line-height:1.35}
.mgr10 .bi-card .s b{font-weight:800}
.mgr10 .bi-c1{background:linear-gradient(135deg,#0d9488,#0f766e)}
.mgr10 .bi-c2{background:linear-gradient(135deg,#2563eb,#1e40af)}
.mgr10 .bi-c3{background:linear-gradient(135deg,#7c3aed,#5b21b6)}
.mgr10 .bi-c4{background:linear-gradient(135deg,#d97706,#b45309)}
.mgr10 .bi-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.mgr10 .bi-tbl th{text-align:left;font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.mgr10 .bi-tbl th.r,.mgr10 .bi-tbl td.r{text-align:right}
.mgr10 .bi-tbl td{padding:10px 12px;border-bottom:1px solid var(--hair);font-variant-numeric:tabular-nums}
.mgr10 .bi-tbl tr:last-child td{border-bottom:0}
.mgr10 .bi-tbl td.nm{font-weight:600;letter-spacing:-.01em}
.mgr10 .bi-tbl .mono{font-family:"JetBrains Mono",monospace}
.mgr10 .bi-bar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.mgr10 .bi-bar .trk{width:64px;height:6px;border-radius:99px;background:var(--sunk);overflow:hidden;flex:none}
.mgr10 .bi-bar .fil{height:100%;background:var(--blue);border-radius:99px}
.mgr10 .bi-delta{font-size:11.5px;font-weight:700;font-family:"JetBrains Mono",monospace}
.mgr10 .bi-delta.up{color:var(--good)} .mgr10 .bi-delta.dn{color:var(--red)}
.mgr10 .bi-soon{padding:48px 20px;text-align:center;color:var(--ink-3)}
.mgr10 .bi-src{font-size:11.5px;color:var(--ink-3);margin-top:2px}
`;

const money = (n: number) => {
  if (!n) return "R$ 0";
  if (n >= 1e6) return "R$ " + (n / 1e6).toFixed(2).replace(".", ",") + "M";
  if (n >= 1e3) return "R$ " + Math.round(n / 1e3) + "k";
  return "R$ " + Math.round(n).toLocaleString("pt-BR");
};
const num = (n: number) => (n ?? 0).toLocaleString("pt-BR");

export default function BiTab({ scope, managerId }: { scope: "gerente" | "super"; managerId?: string }) {
  const [dias, setDias] = useState(30);
  const [screen, setScreen] = useState(1);
  // nível do drill: super vê super/gerente/corretor; gerente vê gerente/corretor
  const [nivel, setNivel] = useState<Nivel>(scope === "super" ? "super" : "gerente");

  const { data, isLoading } = useQuery({
    queryKey: ["biFechamento", scope, managerId, dias],
    enabled: !!managerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bi_fechamento", {
        p_dias: dias, p_escopo: scope, p_manager: managerId,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const t = data?.totais;
  const ticket = Number(t?.ticket_medio || 320000);
  const vgv = (Number(t?.vendas || 0)) * ticket;

  const linhas = useMemo(() => {
    if (!data) return [];
    const arr = (nivel === "corretor" ? data.por_corretor : data.por_gerente) || [];
    return arr;
  }, [data, nivel]);
  const maxVend = Math.max(1, ...linhas.map((l: any) => Number(l.vendas || 0)));

  return (
    <div className="bi">
      <style>{BI_CSS}</style>

      {/* seletor das 4 telas */}
      <div className="bi-screens">
        <button className={screen === 1 ? "on" : ""} onClick={() => setScreen(1)}>Fechamento & Comparativo</button>
        <button disabled title="Precisa de dados de anúncios">Anúncios & Regiões</button>
        <button disabled title="Precisa de dados bancários">Bancário / BACEN</button>
        <button disabled title="Precisa de dados de RH">Turnover & RH</button>
      </div>

      {screen !== 1 ? (
        <div className="panel"><div className="bi-soon"><b>Em breve.</b><div style={{ marginTop: 6 }}>Esta tela precisa de dados de anúncios / bancário / RH que ainda não estão no sistema.</div></div></div>
      ) : isLoading || !t ? (
        <div className="panel"><div className="blank">Somando a operação…</div></div>
      ) : (
        <>
          {/* barra de nível + período */}
          <div className="bi-toolbar">
            <div className="bi-seg">
              {(scope === "super" ? (["super", "gerente", "corretor"] as Nivel[]) : (["gerente", "corretor"] as Nivel[])).map((n) => (
                <button key={n} className={nivel === n ? "on" : ""} onClick={() => setNivel(n)}>
                  {n === "super" ? "Super" : n === "gerente" ? "Gerente" : "Corretor"}
                </button>
              ))}
            </div>
            <div className="bi-seg" style={{ marginLeft: "auto" }}>
              {([[1, "Hoje"], [7, "Semana"], [30, "Mês"]] as [number, string][]).map(([n, r]) => (
                <button key={n} className={dias === n ? "on" : ""} onClick={() => setDias(n)}>{r}</button>
              ))}
            </div>
          </div>

          {/* 4 cartões */}
          <div className="bi-cards">
            <div className="bi-card bi-c1">
              <div className="k">Vendas · VGV estimado</div>
              <div>
                <div className="v">{num(t.vendas)} <small>un</small></div>
                <div className="v" style={{ fontSize: 20, marginTop: 4 }}>{money(vgv)}</div>
              </div>
              <div className="s">estimado · ticket médio R$ {Math.round(ticket / 1000)} mil<br /><b>{money(Number(t.rs))}</b> realizado · {t.rs_com_valor}/{t.vendas_leads} c/ valor</div>
            </div>
            <div className="bi-card bi-c2">
              <div className="k">Visitas</div>
              <div className="v">{num(t.visitas)}</div>
              <div className="s">atendimentos no período (Cury)</div>
            </div>
            <div className="bi-card bi-c3">
              <div className="k">Documentos</div>
              <div className="v">{num(t.docs_ok)}</div>
              <div className="s"><b>{num(t.docs)}</b> pastas · {num(t.docs_ok)} c/ docs OK (Salesforce)</div>
            </div>
            <div className="bi-card bi-c4">
              <div className="k">Plantão · Presença</div>
              <div className="v">{t.presenca_pct}%</div>
              <div className="s"><b>{num(t.presentes)}</b>/{num(t.corretores)} bateram check-in · {num(t.checkins)} check-ins</div>
            </div>
          </div>

          {/* tabela do nível */}
          <div className="panel">
            <div className="panel-h"><span className="tag">{nivel === "corretor" ? "Por corretor" : "Por gerente"}</span></div>
            <div style={{ overflowX: "auto" }}>
              <table className="bi-tbl">
                <thead>
                  <tr>
                    <th>{nivel === "corretor" ? "Corretor" : "Gerente"}</th>
                    <th className="r">Vendas</th>
                    {nivel !== "corretor" ? <th className="r">vs período ant.</th> : null}
                    <th className="r">Visitas</th>
                    <th className="r">Check-in</th>
                    <th className="r">Docs</th>
                    <th className="r">R$ realizado</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l: any) => {
                    const v = Number(l.vendas || 0);
                    const va = Number(l.vendas_ant || 0);
                    const delta = va > 0 ? Math.round(((v - va) / va) * 100) : v > 0 ? 100 : 0;
                    return (
                      <tr key={l.id || l.nome}>
                        <td className="nm">{l.nome || "—"}</td>
                        <td className="r">
                          <div className="bi-bar">
                            <span className="mono">{num(v)}</span>
                            <div className="trk"><div className="fil" style={{ width: `${Math.round((v / maxVend) * 100)}%` }} /></div>
                          </div>
                        </td>
                        {nivel !== "corretor" ? (
                          <td className="r"><span className={`bi-delta ${delta >= 0 ? "up" : "dn"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span></td>
                        ) : null}
                        <td className="r mono">{num(Number(l.visitas || 0))}</td>
                        <td className="r mono">{num(Number(l.checkins || 0))}</td>
                        <td className="r mono">{num(Number(l.docs || 0))}</td>
                        <td className="r mono">{money(Number(l.rs || 0))}</td>
                      </tr>
                    );
                  })}
                  {!linhas.length ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-3)", padding: 24 }}>Sem dados no período.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="bi-src" style={{ padding: "8px 12px 12px" }}>
              Vendas/Visitas/Check-in = operação (Cury). R$ = valor informado no Comandra (leads). VGV = estimativa (vendas × ticket médio).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
