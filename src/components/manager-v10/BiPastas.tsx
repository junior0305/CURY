/**
 * B.I. Tela 3 — Pastas & Análise Bancária (compartilhada: todo gerente/super vê a diretoria).
 * SÓ AGREGADO, sem dado sigiloso (nada de nome de cliente nem valor). Responde: quantas análises cada
 * super/gerente sobe, quantas estão em cada etapa e quantas viram venda. Fonte: junix_pastas (snapshot do pipeline).
 * O operacional detalhado (drill, cobrar, nomes) continua na aba Pastas do diretor (FechamentoAcelerador).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const pct = (n: number) => `${Math.round(n)}%`;
const titulo = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—");
// status vem com entidades HTML (&#193;=Á …) — decodifica e tira acento pra comparar
const limpa = (s: string) => (s || "").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

type Pasta = { etapa_ordem: number; etapa: string; status_texto: string; dias: number; superintendente: string | null; gerente: string | null; corretor: string | null };

// buckets do funil por etapa_ordem
const FUNIL: { k: string; rot: string; ords: number[] }[] = [
  { k: "cad", rot: "Cadastro", ords: [0, 1] },
  { k: "mont", rot: "Montagem", ords: [2, 3] },
  { k: "doc", rot: "Documentos", ords: [4] },
  { k: "ana", rot: "Análise (banco)", ords: [5, 6] },
  { k: "prop", rot: "Proposta/Emissão", ords: [7, 8, 9] },
  { k: "venda", rot: "Venda", ords: [10] },
];
const ordFunil = (o: number) => FUNIL.find((f) => f.ords.includes(o))?.k || "cad";

// classifica a análise bancária pelo status + etapa
function classifica(p: Pasta) {
  const s = limpa(p.status_texto);
  const reprovada = /REPROV/.test(s) || /NAO APROV/.test(s);
  const aprovada = !reprovada && (/APROV/.test(s) || p.etapa_ordem >= 7); // passou da análise = aprovada
  const subiu = p.etapa_ordem >= 5;                 // foi ao banco (análise em diante)
  const venda = p.etapa_ordem === 10;
  const emAnalise = subiu && !aprovada && !reprovada && !venda;
  return { reprovada, aprovada, subiu, venda, emAnalise };
}

const CSS = `
.biv1 .bq-wrap{max-width:1640px;margin:0 auto;padding:16px 20px 22px}
.biv1 .bq-hero{background:var(--bi-navy);color:#fff;padding:12px 20px 14px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-radius:12px;margin-bottom:12px}
.biv1 .bq-hero h1{font-size:17px;font-weight:800}.biv1 .bq-hero .sub{font-size:11px;color:var(--bi-onnavy);margin-top:3px}
.biv1 .bq-seg{display:inline-flex;background:var(--bi-navy2);border:1px solid var(--bi-navy3);border-radius:8px;padding:3px;gap:3px}
.biv1 .bq-seg button{border:0;background:transparent;color:var(--bi-onnavy);padding:6px 11px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:var(--sans)}
.biv1 .bq-seg button.on{background:#fff;color:var(--bi-navy);font-weight:800}
.biv1 .bq-grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:12px}
@media(max-width:1100px){.biv1 .bq-grid2{grid-template-columns:1fr}}
.biv1 .bq-funil{display:flex;gap:8px;align-items:flex-end;padding:14px 8px 6px}
.biv1 .bq-fc{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.biv1 .bq-ft{width:100%;max-width:70px;height:120px;background:var(--bi-track);border-radius:6px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;position:relative}
.biv1 .bq-ff{width:100%;border-radius:6px 6px 0 0}
.biv1 .bq-fc.gargalo .bq-ff{outline:2px solid var(--bi-red);outline-offset:-2px}
.biv1 .bq-fc b{font-family:var(--mono);font-size:14px;font-weight:800}
.biv1 .bq-fc span{font-size:10.5px;color:var(--bi-mut);font-weight:700;text-align:center}
.biv1 .bq-gtag{font-size:10px;font-weight:800;color:var(--bi-red);text-transform:uppercase}
.biv1 .bq-donut{display:flex;align-items:center;gap:16px;padding:14px}
.biv1 .bq-dc{width:110px;height:110px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.biv1 .bq-di{width:72px;height:72px;border-radius:50%;background:var(--bi-card);display:flex;flex-direction:column;align-items:center;justify-content:center}
.biv1 .bq-di b{font-family:var(--mono);font-size:19px;font-weight:800}.biv1 .bq-di small{font-size:9.5px;color:var(--bi-mut)}
.biv1 .bq-leg{font-size:12px;line-height:1.7}.biv1 .bq-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
`;

export default function BiPastas({ managerId }: { managerId?: string }) {
  const [nivel, setNivel] = useState<"super" | "gerente" | "corretor">("super");
  const [selSuper, setSelSuper] = useState("ALL");

  const { data: pastas = [], isLoading } = useQuery({
    queryKey: ["biPastas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("junix_pastas" as any)
        .select("etapa_ordem, etapa, status_texto, dias, superintendente, gerente, corretor");
      if (error) throw error;
      return (data || []) as Pasta[];
    },
  });

  // nomes "principais" (sem "/") pra desfazer a venda dividida ("THAIS/ADAJES" → ADAJES)
  const prim = useMemo(() => {
    const su = new Set<string>(), ge = new Set<string>();
    for (const p of pastas) {
      if (p.superintendente && !p.superintendente.includes("/")) su.add(p.superintendente.trim().toUpperCase());
      if (p.gerente && !p.gerente.includes("/")) ge.add(p.gerente.trim().toUpperCase());
    }
    return { su, ge };
  }, [pastas]);
  const norm = (s: string | null, set: Set<string>) => {
    const parts = (s || "").split("/").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return "—";
    return parts.find((x) => set.has(x.toUpperCase())) || parts[0];
  };
  const rows = useMemo(() => pastas.map((p) => ({ ...p, ...classifica(p), funil: ordFunil(p.etapa_ordem), superN: norm(p.superintendente, prim.su), gerN: norm(p.gerente, prim.ge) })), [pastas, prim]);
  const base = useMemo(() => rows.filter((p) => selSuper === "ALL" || p.superN === selSuper), [rows, selSuper]);

  // KPIs gerais
  const k = useMemo(() => {
    const ativas = rows.filter((p) => p.etapa_ordem >= 0 && p.etapa_ordem < 10).length;
    const subiu = rows.filter((p) => p.subiu).length;
    const aprov = rows.filter((p) => p.aprovada).length;
    const reprov = rows.filter((p) => p.reprovada).length;
    const venda = rows.filter((p) => p.venda).length;
    const emAna = rows.filter((p) => p.emAnalise).length;
    return { ativas, subiu, aprov, reprov, venda, emAna, taxaAprov: aprov + reprov ? Math.round((aprov / (aprov + reprov)) * 100) : 0, taxaVenda: subiu ? Math.round((venda / subiu) * 100) : 0 };
  }, [rows]);

  // agrega por super ou gerente
  const grupos = useMemo(() => {
    if (nivel === "corretor") return [];
    const by = (p: any) => (nivel === "super" ? p.superN : p.gerN) || "—";
    const m = new Map<string, any>();
    for (const p of base) {
      const key = by(p); let g = m.get(key);
      if (!g) { g = { nome: key, gers: new Set(), total: 0, subiu: 0, aprov: 0, reprov: 0, emAna: 0, prop: 0, venda: 0, enc30: 0 }; m.set(key, g); }
      g.total++; if (p.gerN && p.gerN !== "—") g.gers.add(p.gerN);
      if (p.subiu) g.subiu++; if (p.aprovada) g.aprov++; if (p.reprovada) g.reprov++; if (p.emAnalise) g.emAna++;
      if (p.etapa_ordem >= 7 && p.etapa_ordem < 10) g.prop++; if (p.venda) g.venda++;
      if (p.dias > 30 && p.etapa_ordem < 10) g.enc30++;
    }
    return [...m.values()].map((g) => ({ ...g, nger: g.gers.size, taxaAprov: g.aprov + g.reprov ? Math.round((g.aprov / (g.aprov + g.reprov)) * 100) : 0, taxaVenda: g.subiu ? Math.round((g.venda / g.subiu) * 100) : 0 }))
      .sort((a, b) => b.venda - a.venda || b.subiu - a.subiu);
  }, [base, nivel]);

  // funil agregado da base
  const funil = useMemo(() => FUNIL.map((f) => ({ ...f, n: base.filter((p) => p.funil === f.k).length })), [base]);
  const maxFun = Math.max(1, ...funil.map((f) => f.n));
  const gargalo = useMemo(() => { const naoTerm = funil.filter((f) => f.k !== "venda"); return naoTerm.reduce((a, b) => (b.n > a.n ? b : a), naoTerm[0]); }, [funil]);

  // ranking: quem mais vira venda × quem mais encalha (agrega por corretor da base)
  const porCor = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of base) { const key = p.corretor || "—"; let c = m.get(key); if (!c) { c = { nome: key, ger: p.gerN, total: 0, venda: 0, subiu: 0, reprov: 0, enc: 0 }; m.set(key, c); } c.total++; if (p.venda) c.venda++; if (p.subiu) c.subiu++; if (p.reprovada) c.reprov++; if (p.dias > 30 && p.etapa_ordem < 10) c.enc++; }
    return [...m.values()];
  }, [base]);
  const topVenda = useMemo(() => porCor.filter((c) => c.venda > 0).sort((a, b) => b.venda - a.venda).slice(0, 10), [porCor]);
  const topEncalha = useMemo(() => porCor.filter((c) => c.enc > 0).sort((a, b) => b.enc - a.enc).slice(0, 10), [porCor]);

  const supers = useMemo(() => [...new Set(rows.map((p) => p.superN || "—"))].sort(), [rows]);
  const maxVenda = Math.max(1, ...grupos.map((g) => g.venda));

  return (
    <div className="bq-wrap">
      <style>{CSS}</style>
      <div className="bq-hero">
        <div>
          <h1>Pastas &amp; Análise Bancária</h1>
          <div className="sub">quantas sobem · em cada etapa · quantas viram venda · diretoria (sem dado de cliente)</div>
        </div>
        <div className="bq-seg">
          {(["super", "gerente", "corretor"] as const).map((n) => <button key={n} className={nivel === n ? "on" : ""} onClick={() => setNivel(n)}>{n === "super" ? "Supers" : n === "gerente" ? "Gerentes" : "Corretores"}</button>)}
        </div>
      </div>

      {isLoading ? <div className="panel-cury" style={{ padding: 40, textAlign: "center", color: "var(--bi-mut)" }}>Somando as pastas…</div> : !rows.length ? (
        <div className="panel-cury" style={{ padding: 40, textAlign: "center", color: "var(--bi-mut)" }}>Sem pastas no Junix para este banco.</div>
      ) : (
        <>
          {/* 4 CARTÕES */}
          <div className="hero-kpi-4" style={{ marginBottom: 12 }}>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Pastas ativas</div><div className="gk-val">{nf(k.ativas)}</div><div className="gk-delta">{nf(k.subiu)} já foram ao banco</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Em análise no banco</div><div className="gk-val">{nf(k.emAna)}</div><div className="gk-delta">aguardando decisão da Caixa</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Taxa de aprovação</div><div className="gk-val">{pct(k.taxaAprov)}</div><div className="gk-delta">{nf(k.aprov)} aprovadas · {nf(k.reprov)} reprovadas</div></div></div>
            <div className="gk-card"><div className="gk-body"><div className="gk-lbl">Viraram venda</div><div className="gk-val">{nf(k.venda)}</div><div className="gk-delta">{pct(k.taxaVenda)} das que foram ao banco</div></div></div>
          </div>

          {/* TABELA POR NÍVEL */}
          <div className="panel-cury" style={{ marginBottom: 12 }}>
            <div className="p-hdr-bar">
              <span>{nivel === "super" ? "Por superintendência" : nivel === "gerente" ? "Por gerência" : "Por corretor"}</span>
              {nivel !== "super" && <select value={selSuper} onChange={(e) => setSelSuper(e.target.value)} style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--bi-line)", background: "var(--bi-card)", color: "var(--bi-ink)" }}>
                <option value="ALL">Todas as supers</option>{supers.map((s) => <option key={s} value={s}>{titulo(s)}</option>)}
              </select>}
            </div>
            <div className="tbl-scroll tall-475">
              <table className="h-tbl">
                {nivel !== "corretor" ? (
                  <>
                    <thead><tr>
                      <th>{nivel === "super" ? "Superintendência" : "Gerência"}</th>
                      {nivel === "super" && <th className="r">Gerentes</th>}
                      <th className="r">Pastas</th><th className="r">Subiu análise</th><th className="r">Aprov.</th><th className="r">Reprov.</th><th className="r">% aprov</th><th className="r">Em contrato</th><th className="r">Vendas</th><th className="r">Taxa→venda</th><th className="r">Encalhadas +30d</th>
                    </tr></thead>
                    <tbody>
                      {grupos.map((g) => (
                        <tr key={g.nome} onClick={() => { if (nivel === "super") { setSelSuper(g.nome); setNivel("gerente"); } else { setSelSuper("ALL"); setNivel("corretor"); } }}>
                          <td><b>{titulo(g.nome)}</b></td>
                          {nivel === "super" && <td className="r">{nf(g.nger)}</td>}
                          <td className="r">{nf(g.total)}</td>
                          <td className="r"><div className="cell-bar-wrap"><span>{nf(g.subiu)}</span><div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${Math.round((g.venda / maxVenda) * 100)}%` }} /></div></div></td>
                          <td className="r" style={{ color: "var(--bi-good)" }}>{nf(g.aprov)}</td>
                          <td className="r" style={{ color: "var(--bi-red)" }}>{nf(g.reprov)}</td>
                          <td className="r" style={{ fontWeight: 700, color: g.taxaAprov >= 70 ? "var(--bi-good)" : g.taxaAprov < 40 ? "var(--bi-red)" : "inherit" }}>{g.aprov + g.reprov ? pct(g.taxaAprov) : "—"}</td>
                          <td className="r">{nf(g.prop)}</td>
                          <td className="r" style={{ fontWeight: 800 }}>{nf(g.venda)}</td>
                          <td className="r">{g.subiu ? pct(g.taxaVenda) : "—"}</td>
                          <td className="r" style={{ color: g.enc30 ? "var(--bi-org)" : "inherit" }}>{nf(g.enc30)}</td>
                        </tr>
                      ))}
                      {!grupos.length && <tr><td colSpan={11} style={{ textAlign: "center", padding: 18, color: "var(--bi-mut)" }}>Sem pastas.</td></tr>}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead><tr><th>Corretor (gerência)</th><th className="r">Pastas</th><th className="r">Subiu análise</th><th className="r">Reprov.</th><th className="r">Encalhadas +30d</th><th className="r">Vendas</th></tr></thead>
                    <tbody>
                      {porCor.slice().sort((a, b) => b.venda - a.venda || b.subiu - a.subiu).map((c, i) => (
                        <tr key={c.nome + i}><td><b>{titulo(c.nome)}</b>{c.ger ? <small style={{ color: "var(--bi-mut)" }}> · {titulo(c.ger)}</small> : null}</td>
                          <td className="r">{nf(c.total)}</td><td className="r">{nf(c.subiu)}</td><td className="r" style={{ color: c.reprov ? "var(--bi-red)" : "inherit" }}>{nf(c.reprov)}</td><td className="r" style={{ color: c.enc ? "var(--bi-org)" : "inherit" }}>{nf(c.enc)}</td><td className="r" style={{ fontWeight: 800 }}>{nf(c.venda)}</td></tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          </div>

          {/* FUNIL + ANÁLISE BANCÁRIA */}
          <div className="bq-grid2" style={{ marginBottom: 12 }}>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>Funil por etapa</span><small>onde a pasta empilha (gargalo em vermelho)</small></div>
              <div className="bq-funil">
                {funil.map((f) => (
                  <div key={f.k} className={"bq-fc" + (gargalo && f.k === gargalo.k ? " gargalo" : "")}>
                    <b>{nf(f.n)}</b>
                    <div className="bq-ft"><div className="bq-ff" style={{ height: `${Math.round((f.n / maxFun) * 100)}%`, background: f.k === "venda" ? "var(--bi-good)" : "linear-gradient(180deg,var(--bi-blue),var(--bi-navy3))" }} /></div>
                    <span>{f.rot}{gargalo && f.k === gargalo.k ? <><br /><em className="bq-gtag">gargalo</em></> : null}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>Análise bancária (Caixa)</span><small>decisão do banco</small></div>
              {(() => {
                const ap = base.filter((p) => p.aprovada).length, rp = base.filter((p) => p.reprovada).length, an = base.filter((p) => p.emAnalise).length;
                const tot = Math.max(1, ap + rp + an); const apP = (ap / tot) * 100, rpP = (rp / tot) * 100;
                return (
                  <div className="bq-donut">
                    <div className="bq-dc" style={{ background: `conic-gradient(var(--bi-good) 0 ${apP}%, var(--bi-red) ${apP}% ${apP + rpP}%, var(--bi-track) ${apP + rpP}% 100%)` }}>
                      <div className="bq-di"><b style={{ color: "var(--bi-good)" }}>{ap + rp ? pct((ap / (ap + rp)) * 100) : "—"}</b><small>aprovação</small></div>
                    </div>
                    <div className="bq-leg">
                      <div><i style={{ background: "var(--bi-good)" }} /><b>{nf(ap)}</b> aprovadas</div>
                      <div><i style={{ background: "var(--bi-red)" }} /><b>{nf(rp)}</b> reprovadas</div>
                      <div><i style={{ background: "var(--bi-track)" }} /><b>{nf(an)}</b> em análise</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* RANKING: VIRA VENDA × ENCALHA */}
          <div className="bq-grid2">
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>🏆 Quem mais fecha pasta (venda)</span></div>
              <div className="tbl-scroll"><table className="h-tbl"><tbody>
                {topVenda.length ? topVenda.map((c, i) => <tr key={c.nome + i}><td><span className="mgr-badge">{i + 1}</span> <b>{titulo(c.nome)}</b><small style={{ color: "var(--bi-mut)" }}> · {titulo(c.ger || "")}</small></td><td className="r">{nf(c.venda)} venda(s) · {nf(c.subiu)} ao banco</td></tr>)
                  : <tr><td style={{ padding: 16, color: "var(--bi-mut)" }}>Nenhuma venda.</td></tr>}
              </tbody></table></div>
            </div>
            <div className="panel-cury">
              <div className="p-hdr-bar"><span>🐌 Quem mais encalha (+30d)</span></div>
              <div className="tbl-scroll"><table className="h-tbl"><tbody>
                {topEncalha.length ? topEncalha.map((c, i) => <tr key={c.nome + i}><td><b>{titulo(c.nome)}</b><small style={{ color: "var(--bi-mut)" }}> · {titulo(c.ger || "")}</small></td><td className="r" style={{ color: "var(--bi-org)" }}>{nf(c.enc)} parada(s){c.reprov ? ` · ${nf(c.reprov)} reprov.` : ""}</td></tr>)
                  : <tr><td style={{ padding: 16, color: "var(--bi-mut)" }}>Ninguém encalhado 👏</td></tr>}
              </tbody></table></div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--bi-mut)", marginTop: 10 }}>
            Fonte: Junix (pastas de toda a diretoria, só contagens — sem nome de cliente nem valor). "Subiu análise" = chegou ao banco (etapa de análise em diante). Aprovação = aprovadas ÷ (aprovadas + reprovadas). Encalhada = parada há +30 dias sem virar venda. O detalhe por pasta (com cliente) fica na aba Pastas do diretor.
          </div>
        </>
      )}
    </div>
  );
}
