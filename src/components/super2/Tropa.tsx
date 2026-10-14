// Minha Tropa do superintendente: começa no GERAL (todas as equipes lado a lado e o ranking de todos os
// corretores) e, escolhendo um gerente, mostra o mesmo Time que o gerente usa (TimeTab).
import { useEffect, useMemo, useState } from "react";
import TimeTab from "@/components/manager-v10/TimeTab";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper, SeletorPeriodoSuper } from "./Periodo";

export default function Tropa({ superId }: { superId: string }) {
  const p = usePeriodoSuper("7d");
  const { supers, carregando } = useEscopoSuper(superId, p.dias);
  const { data: cons } = useConsolidadoSuper(superId, p.dias);
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const [ger, setGer] = useState<string>("geral");
  const [ordem, setOrdem] = useState<"leads" | "carteira" | "conversa" | "plantao">("leads");
  useEffect(() => { if (ger !== "geral" && !gerentes.some((g) => g.id === ger)) setGer("geral"); }, [gerentes, ger]);
  const vendasDe = (id: string) => cons?.linhas.find((l) => l.id === id)?.vendas ?? 0;
  const visitasDe = (id: string) => cons?.linhas.find((l) => l.id === id)?.visitas ?? 0;
  const corretores = useMemo(() => gerentes.flatMap((g) => (g.corretores_lista ?? []).map((c) => ({ ...c, gerente: g.nome })))
    .sort((a, b) => ordem === "leads" ? b.leads_periodo - a.leads_periodo : ordem === "carteira" ? b.carteira - a.carteira
      : ordem === "conversa" ? b.em_conversa - a.em_conversa : Number(!!b.plantao_hoje) - Number(!!a.plantao_hoje)), [gerentes, ordem]);
  const tot = gerentes.reduce((a, g) => ({ cor: a.cor + g.corretores, on: a.on + g.online, pl: a.pl + g.plantao_hoje, plS: a.plS + g.plantao_semana, leads: a.leads + g.leads_periodo, cart: a.cart + g.carteira, conv: a.conv + g.em_conversa }),
    { cor: 0, on: 0, pl: 0, plS: 0, leads: 0, cart: 0, conv: 0 });
  const th = (k: typeof ordem, r: string) => <button className={ordem === k ? "on" : ""} onClick={() => setOrdem(k)}>{r}{ordem === k ? " ▾" : ""}</button>;

  return (
    <div className="tr2">
      <style>{CSS}</style>
      <header className="tr2-top">
        <div><h1>Minha Tropa</h1><p>{ger === "geral" ? `Todas as equipes · ${p.texto}` : "A mesma tela que o gerente usa no Time dele"}</p></div>
        {ger === "geral" ? <SeletorPeriodoSuper p={p} opcoes={["hoje", "7d", "30d"]} /> : null}
      </header>
      <nav className="tr2-chips" aria-label="Equipes">
        <button className={ger === "geral" ? "on" : ""} onClick={() => setGer("geral")}>Geral<small>{tot.cor} corretores · {gerentes.length} equipes</small></button>
        {gerentes.map((g) => (
          <button key={g.id} className={ger === g.id ? "on" : ""} onClick={() => setGer(g.id)}>
            {g.nome}<small>{g.corretores} corretores · {g.plantao_hoje} no plantão</small>
          </button>
        ))}
      </nav>

      {ger !== "geral" ? <div className="tr2-time"><TimeTab key={ger} managerId={ger} /></div>
        : carregando ? <p className="tr2-vazio">Somando as equipes…</p> : (
          <>
            <div className="tr2-kpis">
              <div className="tr2-kpi"><span>Corretores</span><b>{tot.cor}</b><small>{tot.on} online agora</small></div>
              <div className="tr2-kpi"><span>Plantão hoje</span><b>{tot.pl}</b><small>{tot.plS} corretor-dias na semana (C2S)</small></div>
              <div className="tr2-kpi"><span>Leads no período</span><b>{tot.leads}</b><small>{tot.cart} na carteira viva</small></div>
              <div className="tr2-kpi"><span>Em conversa</span><b>{tot.conv}</b><small>{tot.cart ? Math.round((tot.conv / tot.cart) * 100) : 0}% da carteira</small></div>
              <div className="tr2-kpi"><span>Vendas (Junix)</span><b className="tr2-bom">{gerentes.reduce((a, g) => a + vendasDe(g.id), 0)}</b><small>{gerentes.reduce((a, g) => a + visitasDe(g.id), 0)} visitas no C2S</small></div>
            </div>

            <section className="tr2-sec">
              <h2>Equipes lado a lado</h2>
              <div className="tr2-card tr2-tw">
                <table>
                  <thead><tr><th>Equipe</th><th>Corretores</th><th>Online</th><th>Plantão hoje</th><th>Plantão semana</th><th>Leads</th><th>Carteira</th><th>Em conversa</th><th>Visitas</th><th>Vendas</th><th /></tr></thead>
                  <tbody>
                    {gerentes.map((g) => (
                      <tr key={g.id}>
                        <td><b>{g.nome}</b></td><td>{g.corretores}</td><td>{g.online}</td><td>{g.plantao_hoje}</td><td>{g.plantao_semana}</td>
                        <td>{g.leads_periodo}</td><td>{g.carteira}</td><td>{g.em_conversa}</td><td>{visitasDe(g.id)}</td>
                        <td className={vendasDe(g.id) ? "tr2-bom" : ""}>{vendasDe(g.id)}</td>
                        <td><button className="tr2-btn" onClick={() => setGer(g.id)}>Abrir equipe →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="tr2-sec">
              <h2>Todos os corretores <small>{corretores.length} · clique no título para ordenar</small></h2>
              <div className="tr2-card tr2-tw">
                <table>
                  <thead><tr><th>Corretor</th><th>Equipe</th><th className="tr2-ord">{th("plantao", "Plantão hoje")}</th><th className="tr2-ord">{th("leads", "Leads")}</th><th className="tr2-ord">{th("carteira", "Carteira")}</th><th className="tr2-ord">{th("conversa", "Em conversa")}</th><th>Último acesso</th></tr></thead>
                  <tbody>
                    {corretores.map((c) => (
                      <tr key={c.id}>
                        <td><span className="tr2-nome"><i className={c.online ? "on" : ""} />{c.nome}</span></td>
                        <td>{c.gerente}</td>
                        <td>{c.plantao_hoje ? <em className="grn">no plantão</em> : <span className="tr2-dim">—</span>}</td>
                        <td>{c.leads_periodo}</td><td>{c.carteira}</td><td>{c.em_conversa}</td>
                        <td className="tr2-dim">{c.ultimo_acesso ? new Date(c.ultimo_acesso).toLocaleDateString("pt-BR") : "nunca entrou"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
    </div>
  );
}

const CSS = `
.mgr10 .tr2{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5);min-width:0}
.mgr10 .tr2-time{min-width:0;overflow-x:auto}
.mgr10 .tr2-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .tr2-top h1{font-size:28px}
.mgr10 .tr2-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .tr2-chips{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .tr2-chips button{display:grid;text-align:left;gap:1px;padding:9px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:14px;font-weight:600}
.mgr10 .tr2-chips button small{font-size:12px;color:var(--ink-3);font-weight:500}
.mgr10 .tr2-chips button.on{border-color:var(--blue);background:var(--blue-air);color:var(--blue)}
.mgr10 .tr2-vazio{color:var(--ink-3)}
.mgr10 .tr2-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.mgr10 .tr2-kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px}
.mgr10 .tr2-kpi span{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mgr10 .tr2-kpi b{font-size:30px;font-weight:800;font-family:"JetBrains Mono",monospace}
.mgr10 .tr2-kpi small{font-size:12.5px;color:var(--ink-3)}
.mgr10 .tr2-bom{color:var(--good);font-weight:700}
.mgr10 .tr2-sec{display:grid;gap:10px}
.mgr10 .tr2-sec h2{font-size:17px}
.mgr10 .tr2-sec h2 small{font-size:12.5px;color:var(--ink-3);font-weight:500;margin-left:8px}
.mgr10 .tr2-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);min-width:0}
.mgr10 .tr2-tw{overflow-x:auto}
.mgr10 .tr2-tw table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
.mgr10 .tr2-tw th,.mgr10 .tr2-tw td{padding:10px 12px;text-align:left;border-top:1px solid var(--hair);white-space:nowrap}
.mgr10 .tr2-tw thead th{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk);border-top:0}
.mgr10 .tr2-ord button{font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit}
.mgr10 .tr2-ord button.on{color:var(--blue)}
.mgr10 .tr2-btn{font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card)}
.mgr10 .tr2-nome{display:flex;align-items:center;gap:8px}
.mgr10 .tr2-nome i{width:8px;height:8px;border-radius:50%;background:var(--ink-3)}
.mgr10 .tr2-nome i.on{background:var(--good)}
.mgr10 .tr2-dim{color:var(--ink-3)}
.mgr10 .tr2 em{font-style:normal;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px}
.mgr10 .tr2 em.grn{color:var(--good);background:var(--good-air)}
`;
