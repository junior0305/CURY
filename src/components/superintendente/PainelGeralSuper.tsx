// Painel geral do superintendente, no visual novo (o mesmo da Central de Leads e de Anúncios):
// período, faixa de alerta, cartões, meta em cascata, as equipes (cada gerente abre os corretores)
// e o resultado por fonte (C2S, Junix, Facebook, Comandra). Os números vêm dos mesmos hooks de antes:
// useSuperintendenteRollup e useConsolidadoSuper.

import { useState } from "react";
import { useSuperintendenteRollup, type GerenteRollup, type CorretorRollup } from "@/hooks/useSuperintendente";
import { useConsolidadoSuper, type LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import MetaCascata from "@/components/manager-v10/MetaCascata";

const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const vgvCurto = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n ? `R$ ${Math.round(n / 1e3)} mil` : "—");
const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "Semana"], [30, "Mês"]];

export default function PainelGeralSuper({ superId, ehDiretoria, dias, setDias, onAbrir }: {
  superId: string | undefined; ehDiretoria: boolean; dias: number; setDias: (n: number) => void; onAbrir: (id: string) => void;
}) {
  const { data: roll, isLoading: carregandoRoll, error } = useSuperintendenteRollup(superId, dias);
  const { data: cons, isLoading: carregandoCons } = useConsolidadoSuper(superId, dias);
  const [aba, setAba] = useState<"equipes" | "fontes">("equipes");
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const t = roll?.total;
  const f = cons?.total;
  const per = dias === 1 ? "hoje" : dias === 7 ? "últimos 7 dias" : "últimos 30 dias";

  return (
    <div className="pg">
      <style>{CSS}</style>
      <header className="pg-top">
        <div>
          <h1>{ehDiretoria ? "Painel da diretoria" : "Painel geral"}</h1>
          <p>{ehDiretoria ? "Todas as superintendências e equipes" : "Todas as suas equipes"} · {per} · C2S, Junix, Facebook e Comandra</p>
        </div>
        <div className="pg-pills">
          {PERIODOS.map(([n, r]) => <button key={n} className={dias === n ? "on" : ""} onClick={() => setDias(n)}>{r}</button>)}
        </div>
      </header>

      {error ? <div className="pg-card"><p className="pg-erro">Não consegui somar as equipes: {String((error as any)?.message ?? error)}</p></div> : null}

      {f && f.nuncaFalaram > 0 ? (
        <div className="pg-faixa red">
          <span className="pg-tag">CARTEIRA SEM TOQUE</span>
          <div><b>{nf(f.nuncaFalaram)} lead(s) da carteira nunca foram contatados</b>
            <span>Lead ativo, com corretor, e ninguém falou com ele ainda. Veja na tabela por fonte qual equipe concentra.</span></div>
          <button className="pg-btn" onClick={() => setAba("fontes")}>Ver por equipe</button>
        </div>
      ) : f && f.pastasTravadas > 0 ? (
        <div className="pg-faixa amb">
          <span className="pg-tag">PASTAS PARADAS</span>
          <div><b>{nf(f.pastasTravadas)} pasta(s) paradas há 7 dias ou mais no Junix</b>
            <span>Venda quase feita esperando alguém. A aba Pastas mostra quais.</span></div>
        </div>
      ) : null}

      <div className="pg-kpis">
        <Kpi titulo="Vendas (Junix)" valor={f ? nf(f.vendas) : "…"} sub={f ? `${vgvCurto(f.vgv)} em VGV · ${per}` : ""} tom="grn" />
        <Kpi titulo="Visitas (C2S)" valor={f ? nf(f.visitas) : "…"} sub={f ? `${nf(f.plantaoDias)} corretor-dias no plantão` : ""} />
        <Kpi titulo="Plantão hoje" valor={t ? nf(t.plantao_hoje) : "…"} sub={t ? `${nf(t.corretores)} corretores · ${nf(t.online)} online agora` : ""} />
        <Kpi titulo="Leads no período" valor={t ? nf(t.leads_periodo) : "…"} sub={t ? `carteira viva ${nf(t.carteira)} · ${nf(t.em_conversa)} em conversa` : ""} />
        <Kpi titulo="Anúncio (Facebook)" valor={f ? brl(f.gasto) : "…"} sub={f ? `${nf(f.leadsFb)} leads · ${f.leadsFb ? brl(f.gasto / f.leadsFb) : "—"} cada` : ""} />
        <Kpi titulo="Custo por venda" valor={f && f.vendas && f.gasto ? brl(f.gasto / f.vendas) : "—"} sub="gasto no Facebook ÷ vendas do Junix" />
      </div>

      <MetaCascata dono={superId} />

      <nav className="pg-abas" aria-label="Visões do painel">
        <button className={aba === "equipes" ? "on" : ""} onClick={() => setAba("equipes")}>Suas equipes<span>{roll?.gerentes.length ?? 0}</span></button>
        <button className={aba === "fontes" ? "on" : ""} onClick={() => setAba("fontes")}>Resultado por fonte</button>
      </nav>

      {aba === "equipes" ? (
        carregandoRoll || !roll ? <div className="pg-card"><p className="pg-vazio">Somando as equipes…</p></div> : (
          <div className="pg-card pg-tab">
            <div className="pg-tr pg-th"><span>Gerente</span><span>Corretores</span><span>Plantão hoje</span><span>Leads</span><span>Carteira</span><span>Em conversa</span><span>Vendas (Junix)</span><span /></div>
            {roll.gerentes.filter((g: GerenteRollup) => !/revisor/i.test(g.nome)).map((g: GerenteRollup) => {
              const exp = !!aberto[g.id];
              return (
                <div key={g.id}>
                  <div className="pg-tr pg-linha" role="button" tabIndex={0} aria-expanded={exp}
                    onClick={() => setAberto((v) => ({ ...v, [g.id]: !v[g.id] }))}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberto((v) => ({ ...v, [g.id]: !v[g.id] })); } }}>
                    <span className="pg-nome">{exp ? "▾" : "▸"} <b>{g.nome}</b></span>
                    <span className="mono">{g.corretores}{g.online ? <small className="pg-on"> · {g.online} online</small> : null}</span>
                    <span className="mono">{g.plantao_hoje}</span>
                    <span className="mono">{g.leads_periodo}</span>
                    <span className="mono">{g.carteira}</span>
                    <span className="mono">{g.em_conversa}</span>
                    {(() => { const v = cons?.linhas.find((x) => x.id === g.id)?.vendas ?? 0; return <span className={`mono ${v ? "pg-bom" : ""}`}>{v}</span>; })()}
                    <span><button className="pg-btn" onClick={(e) => { e.stopPropagation(); onAbrir(g.id); }}>Abrir painel →</button></span>
                  </div>
                  {exp ? (
                    <div className="pg-sub">
                      {g.corretores_lista.length ? g.corretores_lista.map((c: CorretorRollup) => (
                        <div key={c.id} className="pg-tr pg-cor">
                          <span className="pg-nome"><i className={c.online ? "on" : ""} />{c.nome}{c.plantao_hoje ? <em className="grn">no plantão</em> : null}</span>
                          <span /><span />
                          <span className="mono">{c.leads_periodo}</span>
                          <span className="mono">{c.carteira}</span>
                          <span className="mono">{c.em_conversa}</span>
                          <span />
                          <span />
                        </div>
                      )) : <p className="pg-vazio">Sem corretores ativos.</p>}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!roll.gerentes.length ? <p className="pg-vazio pg-pad">Nenhum gerente ligado a você ainda.</p> : null}
          </div>
        )
      ) : carregandoCons || !cons ? <div className="pg-card"><p className="pg-vazio">Juntando C2S, Junix, Facebook e Comandra…</p></div> : (
        <Fontes linhas={cons.linhas} total={cons.total} onAbrir={onAbrir} />
      )}
    </div>
  );
}

function Kpi({ titulo, valor, sub, tom }: { titulo: string; valor: string; sub: string; tom?: "grn" | "red" }) {
  return (
    <div className="pg-kpi">
      <span className="pg-kpi-t">{titulo}</span>
      <b className={tom === "grn" ? "pg-bom" : tom === "red" ? "pg-ruim" : ""}>{valor}</b>
      <small>{sub}</small>
    </div>
  );
}

function Fontes({ linhas, total, onAbrir }: { linhas: LinhaConsolidado[]; total: any; onAbrir: (id: string) => void }) {
  const totLeads = (x: LinhaConsolidado["leads"]) => x.anuncio + x.disparo + x.pescados + x.outros;
  const cpl = (g: number | null, l: number | null) => (g && l ? brl(g / l) : "—");
  const celulas = (x: any) => (
    <>
      <td className="sep">{nf(x.plantaoDias)}</td>
      <td>{nf(x.visitas)}</td>
      <td className={`sep${x.vendas ? " bom" : ""}`}>{nf(x.vendas)}</td>
      <td>{vgvCurto(x.vgv)}</td>
      <td>{nf(x.pastas)}</td>
      <td className={x.pastasTravadas ? "ruim" : "dim"}>{nf(x.pastasTravadas)}</td>
      <td className="sep">{x.gasto == null ? <span className="dim" title={x.fbErro || "sem conta de anúncio"}>—</span> : brl(x.gasto)}</td>
      <td>{x.leadsFb == null ? "—" : nf(x.leadsFb)}</td>
      <td>{cpl(x.gasto, x.leadsFb)}</td>
      <td>{x.gasto && x.vendas ? brl(x.gasto / x.vendas) : "—"}</td>
      <td className="sep">{nf(x.leads.anuncio)}</td>
      <td>{nf(x.leads.disparo)}</td>
      <td>{nf(x.leads.pescados)}</td>
      <td>{nf(totLeads(x.leads))}</td>
      <td className={x.nuncaFalaram ? "ruim" : "dim"}>{nf(x.nuncaFalaram)}</td>
    </>
  );
  return (
    <div className="pg-card pg-fontes">
      <div className="pg-fontes-w">
        <table>
          <thead>
            <tr><th /><th className="grp sep" colSpan={2}>C2S</th><th className="grp sep" colSpan={4}>Junix</th><th className="grp sep" colSpan={4}>Facebook</th><th className="grp sep" colSpan={5}>Leads no Comandra</th></tr>
            <tr>
              <th>Gerente</th>
              <th className="sep">Plantão</th><th>Visitas</th>
              <th className="sep">Vendas</th><th>VGV</th><th>Pastas</th><th>Paradas</th>
              <th className="sep">Gasto</th><th>Leads</th><th>Custo/lead</th><th>Custo/venda</th>
              <th className="sep">Anúncio</th><th>Disparo</th><th>Pescados</th><th>Total</th><th>Sem toque</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((x) => {
              const clicavel = x.id !== "super" && !x.id.startsWith("outros");
              return (
                <tr key={x.id} className={clicavel ? "gr" : ""} onClick={() => clicavel && onAbrir(x.id)}>
                  <td><b>{x.nome}</b></td>{celulas(x)}
                </tr>
              );
            })}
            <tr className="tot"><td>Total</td>{celulas(total)}</tr>
          </tbody>
        </table>
      </div>
      <small className="pg-nota">Plantão = corretor-dias com ponto no C2S. Paradas = pastas sem andamento há 7 dias ou mais. Sem toque = carteira ativa que ninguém contatou. Clique no gerente para entrar no painel dele.</small>
    </div>
  );
}

const CSS = `
.mgr10 .pg{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .pg-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .pg-top h1{font-size:28px}
.mgr10 .pg-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .pg-pills{display:flex;gap:2px;background:var(--sunk);border-radius:10px;padding:3px}
.mgr10 .pg-pills button{font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;color:var(--ink-3)}
.mgr10 .pg-pills button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.08)}
.mgr10 .pg-faixa{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 18px;border-radius:var(--r);border:1px solid}
.mgr10 .pg-faixa.red{background:var(--red-air);border-color:color-mix(in srgb,var(--red) 35%,transparent)}
.mgr10 .pg-faixa.amb{background:var(--amber-air);border-color:color-mix(in srgb,var(--amber) 35%,transparent)}
.mgr10 .pg-tag{font-family:"JetBrains Mono",monospace;font-size:10.5px;font-weight:700;letter-spacing:.1em;padding:4px 8px;border-radius:6px;color:#fff;background:var(--red)}
.mgr10 .pg-faixa.amb .pg-tag{background:var(--amber)}
.mgr10 .pg-faixa div{display:grid;min-width:0}
.mgr10 .pg-faixa div span{font-size:13px;color:var(--ink-2)}
.mgr10 .pg-btn{font-size:13px;font-weight:600;padding:7px 12px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);white-space:nowrap}
.mgr10 .pg-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.mgr10 .pg-kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px;align-content:start}
.mgr10 .pg-kpi-t{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mgr10 .pg-kpi b{font-size:30px;font-weight:800;letter-spacing:-.03em;font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums}
.mgr10 .pg-kpi small{font-size:12.5px;color:var(--ink-3)}
.mgr10 .pg-bom{color:var(--good)} .mgr10 .pg-ruim{color:var(--red)}
.mgr10 .pg-abas{display:flex;gap:4px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px}
.mgr10 .pg-abas button{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:9px;font-size:14px;font-weight:600;color:var(--ink-2)}
.mgr10 .pg-abas button span{font-size:11.5px;background:var(--sunk);padding:1px 7px;border-radius:999px}
.mgr10 .pg-abas button.on{background:var(--blue-air);color:var(--blue)}
.mgr10 .pg-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;min-width:0}
.mgr10 .pg-tab{padding:0;overflow:hidden}
.mgr10 .pg-tr{display:grid;grid-template-columns:minmax(0,2fr) repeat(6,minmax(64px,1fr)) 130px;gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--hair);font-size:13.5px}
.mgr10 .pg-th{border-top:0;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk)}
.mgr10 .pg-linha{cursor:pointer}
.mgr10 .pg-linha:hover{background:var(--sunk)}
.mgr10 .pg-nome{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere}
.mgr10 .pg-nome i{width:8px;height:8px;border-radius:50%;background:var(--ink-3);flex-shrink:0}
.mgr10 .pg-nome i.on{background:var(--good)}
.mgr10 .pg-nome em{font-style:normal;font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;color:var(--good);background:var(--good-air)}
.mgr10 .pg-on{color:var(--good);font-size:11.5px}
.mgr10 .pg-sub{background:var(--sunk)}
.mgr10 .pg-cor{border-top:1px solid var(--hair);font-size:13px;color:var(--ink-2)}
.mgr10 .pg-vazio{color:var(--ink-3);font-size:14px}
.mgr10 .pg-pad{padding:14px 16px}
.mgr10 .pg-erro{color:var(--red);font-weight:600}
.mgr10 .pg-fontes{padding:0;overflow:hidden}
.mgr10 .pg-fontes-w{overflow-x:auto}
.mgr10 .pg-fontes table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
.mgr10 .pg-fontes th,.mgr10 .pg-fontes td{padding:9px 10px;text-align:right;white-space:nowrap;border-top:1px solid var(--hair)}
.mgr10 .pg-fontes th:first-child,.mgr10 .pg-fontes td:first-child{text-align:left;position:sticky;left:0;background:var(--card)}
.mgr10 .pg-fontes thead th{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk);border-top:0}
.mgr10 .pg-fontes thead th:first-child{background:var(--sunk)}
.mgr10 .pg-fontes th.grp{text-align:center;color:var(--ink-2)}
.mgr10 .pg-fontes .sep{border-left:1px solid var(--line)}
.mgr10 .pg-fontes tr.gr{cursor:pointer}
.mgr10 .pg-fontes tr.gr:hover td{background:var(--sunk)}
.mgr10 .pg-fontes tr.tot td{font-weight:800;background:var(--sunk)}
.mgr10 .pg-fontes .bom{color:var(--good);font-weight:700}
.mgr10 .pg-fontes .ruim{color:var(--red);font-weight:700}
.mgr10 .pg-fontes .dim{color:var(--ink-3)}
.mgr10 .pg-nota{display:block;padding:10px 16px;color:var(--ink-3);font-size:12px;border-top:1px solid var(--hair)}
@media(max-width:860px){.mgr10 .pg-tr{grid-template-columns:minmax(0,1fr) auto auto auto}.mgr10 .pg-tr>span:nth-child(n+5):not(:last-child){display:none}.mgr10 .pg-tr>span:nth-child(3){display:none}.mgr10 .pg-faixa{grid-template-columns:minmax(0,1fr)}}
`;
