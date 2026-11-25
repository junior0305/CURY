/**
 * B.I. Tela 4 — Pessoas, Contratação & Retenção (confronto de dados, por super→gerente→corretor).
 * Filtro por DATA (De/Até): atividade (plantão/visita/pasta), entradas e produção são janeladas pelo período.
 * Fonte: RPC bi_pessoas(p_de,p_ate) (profiles + c2s_plantao + c2s_checkins + junix_pastas) + junix_vendas (produção por nome).
 * Vive dentro do .biv1 do BiTab. Tudo real; vale nos 2 bancos.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const nf1 = (n: number) => (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n)}%`;
const moneyM = (n: number) => "R$ " + (n / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "M";
const chaveNome = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+BN$/, "").replace(/[^A-Z0-9]/g, "");
const titulo = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—");
const isoHoje = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - 3 * 36e5 - d * 864e5).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

type Cor = {
  id: string; nome: string; ativo: boolean; criado_em: string; entrou: boolean;
  gerente_id: string | null; gerente: string | null; super_id: string | null; super: string | null;
  dias_casa: number; plantao: number; visitas: number; pastas: number; ult_ativ: string;
};
type Venda = { corretor: string | null; qtd: number | null; vgv: number | null; data_venda: string | null };

const SUMIU = 20, CHURN_D = 60;

const CSS = `
.biv1 .bp-wrap{max-width:1640px;margin:0 auto;padding:16px 20px 22px}
.biv1 .bp-hero{background:var(--bi-navy);color:#fff;padding:12px 20px 14px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-radius:12px;margin-bottom:12px}
.biv1 .bp-hero h1{font-size:17px;font-weight:800}.biv1 .bp-hero .sub{font-size:11px;color:var(--bi-onnavy);margin-top:3px}
.biv1 .bp-ctrls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.biv1 .bp-seg{display:inline-flex;background:var(--bi-navy2);border:1px solid var(--bi-navy3);border-radius:8px;padding:3px;gap:3px}
.biv1 .bp-seg button{border:0;background:transparent;color:var(--bi-onnavy);padding:6px 11px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:var(--sans)}
.biv1 .bp-seg button.on{background:#fff;color:var(--bi-navy);font-weight:800}
.biv1 .bp-dt{display:flex;gap:4px;align-items:center;background:var(--bi-navy2);border:1px solid var(--bi-navy3);border-radius:8px;padding:4px 8px}
.biv1 .bp-dt input{background:var(--bi-navy);color:#fff;border:1px solid var(--bi-navy3);border-radius:5px;padding:3px 5px;font-size:11px;font-family:var(--sans);color-scheme:dark}
.biv1 .bp-dt span{font-size:10px;color:var(--bi-onnavy);font-weight:700}
.biv1 .bp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:1100px){.biv1 .bp-grid2{grid-template-columns:1fr}}
.biv1 .bp-chip{display:inline-block;font-size:10px;font-weight:800;padding:1px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.biv1 .bp-atu{background:var(--bi-good-bg);color:var(--bi-good)}.biv1 .bp-par{background:var(--bi-org-bg);color:var(--bi-org)}
.biv1 .bp-fan{background:var(--bi-red-bg);color:var(--bi-red)}.biv1 .bp-nov{background:var(--bi-blue-bg);color:var(--bi-blue)}.biv1 .bp-fora{background:var(--bi-sunk);color:var(--bi-mut)}
.biv1 .bp-safra{display:flex;gap:10px;align-items:flex-end;padding:8px 4px}
.biv1 .bp-sf{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.biv1 .bp-sf-track{width:100%;max-width:60px;height:96px;background:var(--bi-track);border-radius:6px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
.biv1 .bp-sf-fill{background:linear-gradient(180deg,var(--bi-good),var(--bi-blue));border-radius:6px 6px 0 0;width:100%}
.biv1 .bp-sf-lbl{font-size:10.5px;color:var(--bi-mut);font-weight:700;text-align:center}
.biv1 .bp-sf-pct{font-family:var(--mono);font-size:12px;font-weight:800}
.biv1 .bp-note{font-size:11px;color:var(--bi-mut);padding:8px 2px 0}
.biv1 .bp-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}
.biv1 .bp-two .u{font-family:var(--mono);font-size:26px;font-weight:800}.biv1 .bp-two .l{font-size:11.5px;color:var(--bi-mut)}
`;

export default function BiPessoas({ managerId }: { managerId?: string }) {
  const [nivel, setNivel] = useState<"super" | "gerente" | "corretor">("super");
  const [selSuper, setSelSuper] = useState("ALL");
  const [selGer, setSelGer] = useState("ALL");
  const [de, setDe] = useState(isoAgo(29));
  const [ate, setAte] = useState(isoHoje());
  const preset = (d: number) => { setDe(isoAgo(d - 1)); setAte(isoHoje()); };
  const dias = Math.max(1, diasEntre(de, ate) + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["biPessoas", de, ate, managerId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bi_pessoas" as any, { p_de: de, p_ate: ate, p_como: managerId ?? null });
      if (error) throw error;
      return data as { corretores: Cor[]; safras: { mes: string; entraram: number; ativos_hoje: number }[]; saidas_periodo: number };
    },
  });
  // Vendas até 120 dias (produção do período + 1ª venda), casadas por nome
  const { data: vendas = [] } = useQuery({
    queryKey: ["biPessoasVendas"],
    queryFn: async () => {
      const desde = isoAgo(120);
      const { data, error } = await supabase.from("junix_vendas" as any).select("corretor, qtd, vgv, data_venda").eq("ativo", true).gte("data_venda", desde);
      if (error) throw error;
      return (data || []) as Venda[];
    },
  });

  const vendaDe = useMemo(() => {
    const m = new Map<string, { qtd: number; vgv: number; primeira: string | null; tem: boolean }>();
    for (const v of vendas) {
      const kk = chaveNome(v.corretor || ""); if (!kk) continue;
      let x = m.get(kk); if (!x) { x = { qtd: 0, vgv: 0, primeira: null, tem: true }; m.set(kk, x); }
      if (v.data_venda && (!x.primeira || v.data_venda < x.primeira)) x.primeira = v.data_venda;
      if (v.data_venda && v.data_venda >= de && v.data_venda <= ate) { x.qtd += Number(v.qtd || 1); x.vgv += Number(v.vgv || 0); }
    }
    return m;
  }, [vendas, de, ate]);

  const cors = useMemo(() => (data?.corretores || []).map((c) => {
    const vd = vendaDe.get(chaveNome(c.nome || "")) || { qtd: 0, vgv: 0, primeira: null, tem: false };
    const atividade = (c.plantao || 0) + (c.visitas || 0) + (c.pastas || 0) + vd.qtd;
    const diasSemAtiv = c.ult_ativ && c.ult_ativ > "2000-01-01" ? diasEntre(c.ult_ativ, isoHoje()) : 9999;
    const novo = c.ativo && c.entrou;
    const atuante = c.ativo && atividade > 0;
    const fantasma = c.ativo && c.dias_casa > 30 && diasSemAtiv > 365 && !vd.tem;
    const sumido = c.ativo && !atuante && diasSemAtiv >= SUMIU && !fantasma;
    const fora = !c.ativo;
    const diasAte1a = vd.tem && vd.primeira ? Math.max(0, diasEntre(c.criado_em, vd.primeira)) : null;
    const sit = fora ? "fora" : fantasma ? "fantasma" : sumido ? "parado" : novo ? "novo" : atuante ? "atuante" : "parado";
    return { ...c, vqtd: vd.qtd, vvgv: vd.vgv, temVenda: vd.tem, atividade, novo, atuante, fantasma, sumido, fora, diasAte1a, sit };
  }), [data, vendaDe]);

  const baseCor = useMemo(() => cors.filter((c) => (selSuper === "ALL" || (c.super || "—") === selSuper) && (selGer === "ALL" || (c.gerente || "—") === selGer)), [cors, selSuper, selGer]);

  const grupos = useMemo(() => {
    if (nivel === "corretor") return [];
    const by = nivel === "super" ? (c: any) => c.super || "—" : (c: any) => c.gerente || "—";
    const m = new Map<string, any>();
    for (const c of baseCor) {
      const key = by(c); let g = m.get(key);
      if (!g) { g = { nome: key, gers: new Set(), cor: 0, ativos: 0, atuantes: 0, novos: 0, fora: 0, plantao: 0, vqtd: 0, vvgv: 0 }; m.set(key, g); }
      g.cor++; if (c.ativo) g.ativos++; if (c.atuante) g.atuantes++; if (c.novo) g.novos++;
      if (c.fora || c.sumido) g.fora++; if (c.gerente_id) g.gers.add(c.gerente_id);
      g.plantao += c.plantao || 0; g.vqtd += c.vqtd; g.vvgv += c.vvgv;
    }
    return [...m.values()].map((g) => ({ ...g, nger: g.gers.size, atu: g.ativos ? Math.round((g.atuantes / g.ativos) * 100) : 0, saldo: g.novos - g.fora }))
      .sort((a, b) => b.vvgv - a.vvgv || b.ativos - a.ativos);
  }, [baseCor, nivel]);

  const k = useMemo(() => {
    const ativos = cors.filter((c) => c.ativo).length;
    const atuantes = cors.filter((c) => c.atuante).length;
    const novos = cors.filter((c) => c.novo).length;
    const fora = cors.filter((c) => c.fora || c.sumido).length;
    const churn = cors.filter((c) => (c.fora || c.sumido) && c.dias_casa <= CHURN_D).length;
    return { ativos, atuantes, novos, fora, churn, atu: ativos ? Math.round((atuantes / ativos) * 100) : 0 };
  }, [cors]);

  const topProd = useMemo(() => baseCor.filter((c) => c.vqtd > 0).sort((a, b) => b.vvgv - a.vvgv).slice(0, 10), [baseCor]);
  const menosAtu = useMemo(() => baseCor.filter((c) => c.ativo && (c.fantasma || c.sumido)).sort((a, b) => diasEntre(a.ult_ativ || "2000-01-01", isoHoje()) - diasEntre(b.ult_ativ || "2000-01-01", isoHoje())).reverse().slice(0, 10), [baseCor]);
  const fantasmas = useMemo(() => baseCor.filter((c) => c.fantasma).sort((a, b) => b.dias_casa - a.dias_casa), [baseCor]);

  const forma = useMemo(() => {
    const novosRec = cors.filter((c) => c.ativo && c.dias_casa <= 90);
    const venderam = novosRec.filter((c) => c.diasAte1a != null);
    const media = venderam.length ? Math.round(venderam.reduce((a, c) => a + (c.diasAte1a || 0), 0) / venderam.length) : null;
    return { total: novosRec.length, venderam: venderam.length, media };
  }, [cors]);

  const pareto = useMemo(() => {
    const comVenda = baseCor.filter((c) => c.vqtd > 0).sort((a, b) => b.vvgv - a.vvgv);
    const totalVgv = comVenda.reduce((a, c) => a + c.vvgv, 0);
    const n20 = Math.max(1, Math.round(baseCor.filter((c) => c.ativo).length * 0.2));
    const top20 = comVenda.slice(0, n20).reduce((a, c) => a + c.vvgv, 0);
    const atuantes = baseCor.filter((c) => c.atuante).length;
    const totalQtd = baseCor.reduce((a, c) => a + c.vqtd, 0);
    return { topShare: totalVgv ? Math.round((top20 / totalVgv) * 100) : 0, n20, prod: atuantes ? totalQtd / atuantes : 0, atuantes };
  }, [baseCor]);

  const supers = useMemo(() => [...new Set(cors.map((c) => c.super || "—"))].sort(), [cors]);
  const gerentes = useMemo(() => [...new Set(cors.filter((c) => selSuper === "ALL" || (c.super || "—") === selSuper).map((c) => c.gerente || "—"))].sort(), [cors, selSuper]);
  const maxGrupoAtu = Math.max(1, ...grupos.map((g) => g.ativos));
  const sitChip = (s: string) => s === "atuante" ? "bp-atu" : s === "parado" ? "bp-par" : s === "fantasma" ? "bp-fan" : s === "novo" ? "bp-nov" : "bp-fora";
  const sitTxt = (s: string) => s === "atuante" ? "Atuante" : s === "parado" ? "Parado" : s === "fantasma" ? "Fantasma" : s === "novo" ? "Novo" : "Fora";

  return (
    <div className="bp-wrap">
      <style>{CSS}</style>
      <div className="bp-hero">
        <div>
          <h1>Pessoas, Contratação &amp; Retenção</h1>
          <div className="sub">{nf(k.ativos)} ativos · período {de.split("-").reverse().slice(0, 2).join("/")}–{ate.split("-").reverse().slice(0, 2).join("/")} ({dias}d) · diretoria</div>
        </div>
        <div className="bp-ctrls">
          <div className="bp-seg">
            {[[1, "Hoje"], [7, "7d"], [30, "30d"], [90, "90d"]].map(([v, t]) => <button key={v} className={dias === v ? "on" : ""} onClick={() => preset(v as number)}>{t}</button>)}
          </div>
          <div className="bp-dt"><span>De</span><input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} /><span>Até</span><input type="date" value={ate} min={de} max={isoHoje()} onChange={(e) => e.target.value && setAte(e.target.value)} /></div>
          <div className="bp-seg">
            {(["super", "gerente", "corretor"] as const).map((n) => <button key={n} className={nivel === n ? "on" : ""} onClick={() => setNivel(n)}>{n === "super" ? "Supers" : n === "gerente" ? "Gerentes" : "Corretores"}</button>)}
          </div>
        </div>
      </div>

      {isLoading || !data ? <div className="panel-cury" style={{ padding: 40, textAlign: "center", color: "var(--bi-mut)" }}>Somando a tropa…</div> : (
        <>
          <div className="hero-kpi-4" style={{ marginBottom: 12 }}>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Corretores ativos</div><div className="gk-val">{nf(k.ativos)}</div><div className="gk-delta">{nf(cors.length)} no cadastro · {nf(cors.length - k.ativos)} desligados</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Atuação no período</div><div className="gk-val">{pct(k.atu)}</div><div className="gk-delta">{nf(k.atuantes)} atuaram · {nf(k.ativos - k.atuantes)} não (plantão/visita/pasta/venda)</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Entradas no período</div><div className="gk-val">{nf(k.novos)}</div><div className="gk-delta">contratações no intervalo escolhido</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Fora / perdas</div><div className="gk-val">{nf(k.fora)}</div><div className="gk-delta">{nf(data.saidas_periodo)} desligados no período · <b style={{ color: "var(--bi-red)" }}>{nf(k.churn)}</b> churn precoce (≤{CHURN_D}d de casa)</div></div></div>
          </div>

          <div className="panel-cury" style={{ marginBottom: 12 }}>
            <div className="p-hdr-bar">
              <span>{nivel === "super" ? "Por superintendência" : nivel === "gerente" ? "Por gerência" : "Corretor a corretor"}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {nivel !== "super" && <select value={selSuper} onChange={(e) => { setSelSuper(e.target.value); setSelGer("ALL"); }} style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--bi-line)", background: "var(--bi-card)", color: "var(--bi-ink)" }}><option value="ALL">Todas as supers</option>{supers.map((s) => <option key={s} value={s}>{titulo(s)}</option>)}</select>}
                {nivel === "corretor" && <select value={selGer} onChange={(e) => setSelGer(e.target.value)} style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--bi-line)", background: "var(--bi-card)", color: "var(--bi-ink)" }}><option value="ALL">Todos os gerentes</option>{gerentes.map((g) => <option key={g} value={g}>{titulo(g)}</option>)}</select>}
              </div>
            </div>
            <div className="tbl-scroll tall-475">
              <table className="h-tbl">
                {nivel !== "corretor" ? (
                  <>
                    <thead><tr>
                      <th>{nivel === "super" ? "Superintendência" : "Gerência"}</th>{nivel === "super" && <th className="r">Gerentes</th>}
                      <th className="r">Corretores</th><th className="r">Ativos</th><th className="r">Atuantes</th><th className="r">% atuação</th><th className="r">Novos</th><th className="r">Fora</th><th className="r">Saldo</th><th className="r">Plantão/cor</th><th className="r">Vendas</th>
                    </tr></thead>
                    <tbody>
                      {grupos.map((g) => (
                        <tr key={g.nome} onClick={() => { if (nivel === "super") { setSelSuper(g.nome); setNivel("gerente"); } else { setSelGer(g.nome); setNivel("corretor"); } }}>
                          <td><b>{titulo(g.nome)}</b></td>{nivel === "super" && <td className="r">{nf(g.nger)}</td>}
                          <td className="r">{nf(g.cor)}</td><td className="r">{nf(g.ativos)}</td>
                          <td className="r"><div className="cell-bar-wrap"><span>{nf(g.atuantes)}</span><div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${Math.round((g.atuantes / maxGrupoAtu) * 100)}%` }} /></div></div></td>
                          <td className="r" style={{ color: g.atu < 50 ? "var(--bi-red)" : g.atu >= 70 ? "var(--bi-good)" : "inherit", fontWeight: 700 }}>{pct(g.atu)}</td>
                          <td className="r" style={{ color: "var(--bi-good)" }}>+{nf(g.novos)}</td>
                          <td className="r" style={{ color: "var(--bi-red)" }}>−{nf(g.fora)}</td>
                          <td className="r" style={{ fontWeight: 800, color: g.saldo > 0 ? "var(--bi-good)" : g.saldo < 0 ? "var(--bi-red)" : "inherit" }}>{g.saldo > 0 ? "+" : ""}{nf(g.saldo)}</td>
                          <td className="r">{nf1(g.ativos ? g.plantao / g.ativos : 0)}</td>
                          <td className="r">{g.vqtd ? `${nf(g.vqtd)} · ${moneyM(g.vvgv)}` : "—"}</td>
                        </tr>
                      ))}
                      {!grupos.length && <tr><td colSpan={11} style={{ textAlign: "center", padding: 18, color: "var(--bi-mut)" }}>Sem dados.</td></tr>}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead><tr><th>Corretor (gerência)</th><th>Situação</th><th className="r">Dias de casa</th><th className="r">Plantão</th><th className="r">Visitas</th><th className="r">Pastas</th><th className="r">Vendas</th></tr></thead>
                    <tbody>
                      {baseCor.slice().sort((a, b) => b.vvgv - a.vvgv || b.atividade - a.atividade).map((c) => (
                        <tr key={c.id}>
                          <td><b>{titulo(c.nome)}</b>{c.gerente ? <small style={{ color: "var(--bi-mut)" }}> · {titulo(c.gerente)}</small> : null}</td>
                          <td><span className={`bp-chip ${sitChip(c.sit)}`}>{sitTxt(c.sit)}</span></td>
                          <td className="r">{nf(c.dias_casa)}</td><td className="r">{nf(c.plantao)}</td><td className="r">{nf(c.visitas)}</td><td className="r">{nf(c.pastas)}</td>
                          <td className="r">{c.vqtd ? `${nf(c.vqtd)} · ${moneyM(c.vvgv)}` : "—"}</td>
                        </tr>
                      ))}
                      {!baseCor.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 18, color: "var(--bi-mut)" }}>Sem corretores no filtro.</td></tr>}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          </div>

          <div className="bp-grid2" style={{ marginBottom: 12 }}>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>🏆 Quem mais produz</span><small>vendas no período</small></div>
              <div className="tbl-scroll"><table className="h-tbl"><tbody>{topProd.length ? topProd.map((c, i) => (
                <tr key={c.id}><td><span className="mgr-badge">{i + 1}</span> <b>{titulo(c.nome)}</b><small style={{ color: "var(--bi-mut)" }}> · {titulo(c.gerente || "")}</small></td><td className="r">{nf(c.vqtd)} un · {moneyM(c.vvgv)}</td></tr>
              )) : <tr><td style={{ padding: 16, color: "var(--bi-mut)" }}>Nenhuma venda no período.</td></tr>}</tbody></table></div>
            </div>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>🥶 Menos atuantes</span><small>parados / fantasmas, maior tempo sem atividade</small></div>
              <div className="tbl-scroll"><table className="h-tbl"><tbody>{menosAtu.length ? menosAtu.map((c) => (
                <tr key={c.id}><td><b>{titulo(c.nome)}</b><small style={{ color: "var(--bi-mut)" }}> · {titulo(c.gerente || "")}</small></td><td className="r"><span className={`bp-chip ${sitChip(c.sit)}`}>{sitTxt(c.sit)}</span></td></tr>
              )) : <tr><td style={{ padding: 16, color: "var(--bi-mut)" }}>Ninguém parado 👏</td></tr>}</tbody></table></div>
            </div>
          </div>

          <div className="panel-cury" style={{ marginBottom: 12 }}>
            <div className="p-hdr-bar"><span>📈 Sobrevivência por safra de entrada</span><small>% dos que entraram no mês e seguem ativos hoje</small></div>
            <div className="bp-safra">
              {(data.safras || []).map((s) => { const sob = s.entraram ? Math.round((s.ativos_hoje / s.entraram) * 100) : 0; return (
                <div key={s.mes} className="bp-sf">
                  <span className="bp-sf-pct" style={{ color: sob >= 60 ? "var(--bi-good)" : sob >= 35 ? "var(--bi-org)" : "var(--bi-red)" }}>{pct(sob)}</span>
                  <div className="bp-sf-track"><div className="bp-sf-fill" style={{ height: `${sob}%` }} /></div>
                  <span className="bp-sf-lbl">{s.mes}<br />{nf(s.ativos_hoje)}/{nf(s.entraram)}</span>
                </div>
              ); })}
              {!(data.safras || []).length && <div style={{ padding: 16, color: "var(--bi-mut)" }}>Sem histórico de entrada.</div>}
            </div>
            <div className="bp-note">Cada barra = uma turma de contratação. Barra baixa = a leva entrou e evaporou (independe do filtro de data: é retenção acumulada).</div>
          </div>

          <div className="bp-grid2">
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>⏱️ Formação do novo</span><small>de casa ≤ 90 dias</small></div>
              <div className="bp-two">
                <div><div className="u">{forma.media != null ? `${nf(forma.media)}d` : "—"}</div><div className="l">tempo médio até a 1ª venda</div></div>
                <div><div className="u">{nf(forma.venderam)}/{nf(forma.total)}</div><div className="l">novos que já venderam</div></div>
              </div>
              <div className="bp-note" style={{ padding: "0 12px 12px" }}>Churn precoce: <b style={{ color: "var(--bi-red)" }}>{nf(k.churn)}</b> entraram há ≤{CHURN_D}d e já estão fora.</div>
            </div>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>⚖️ Produtividade & dependência</span><small>no período · base filtrada</small></div>
              <div className="bp-two">
                <div><div className="u">{nf1(pareto.prod)}</div><div className="l">vendas por corretor atuante ({nf(pareto.atuantes)} atuantes)</div></div>
                <div><div className="u">{pct(pareto.topShare)}</div><div className="l">da produção vem dos top {nf(pareto.n20)} (20%)</div></div>
              </div>
              <div className="bp-note" style={{ padding: "0 12px 12px" }}>Perto de 100% no 2º número = equipe depende de poucos (risco se um sair).</div>
            </div>
          </div>

          {fantasmas.length > 0 && (
            <div className="panel-cury" style={{ marginTop: 12 }}>
              <div className="p-hdr-bar"><span>👻 Corretores fantasma</span><small>ativos, nunca registraram plantão/pasta/venda (custo sem retorno)</small></div>
              <div className="tbl-scroll"><table className="h-tbl">
                <thead><tr><th>Corretor</th><th>Gerência</th><th>Super</th><th className="r">Dias de casa</th></tr></thead>
                <tbody>{fantasmas.map((c) => <tr key={c.id}><td><b>{titulo(c.nome)}</b></td><td>{titulo(c.gerente || "—")}</td><td>{titulo(c.super || "—")}</td><td className="r">{nf(c.dias_casa)}</td></tr>)}</tbody>
              </table></div>
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--bi-mut)", marginTop: 10 }}>
            Período aplicado a: atuação (plantão/visita/pasta), entradas e produção. Fonte: Comandra (cadastro, hierarquia) · c2s_plantao/c2s_checkins (plantão/visita) · junix_pastas (pastas) · Junix (vendas, por nome). Atuante = tocou em algo no período. Sumido = {SUMIU}d sem nenhuma atividade. Safra = retenção acumulada (não depende do filtro).
          </div>
        </>
      )}
    </div>
  );
}
