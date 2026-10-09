// AnunciosGerentes — Tela 2 do B.I.: a conta de anúncio de cada gerente/super (Facebook) lado a lado,
// cruzada com o que chegou no Comandra e com as vendas do Junix.
// Contas: RPC fb_contas_gerentes (fb_bm_tokens.owner_id, sem token). Números do Facebook: edge
// fb-conta-gerente (lê a conta na fonte, com o token do servidor). Vem no tema .biv1 do BiTab.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CSS = `
.biv1 .an-wrap{max-width:1640px;margin:0 auto;padding:16px 20px 22px}
.biv1 .an-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.biv1 .an-head h2{font-size:18px;font-weight:800;text-transform:uppercase;color:#0F172A}
.biv1 .an-head p{font-size:12px;color:#334155;margin-top:2px}
.biv1 .an-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}
@media(max-width:980px){.biv1 .an-kpis{grid-template-columns:repeat(2,1fr)}}
.biv1 .an-kpi{background:var(--navy-cury);border:1px solid #1C508D;border-radius:10px;padding:10px 14px;color:#fff}
.biv1 .an-kpi small{display:block;font-size:10.5px;font-weight:700;color:#93C5FD;text-transform:uppercase}
.biv1 .an-kpi b{font-family:var(--mono);font-size:21px;font-weight:800}
.biv1 .an-tbl-wrap{background:var(--navy-cury);border:1px solid #1C508D;border-radius:10px;overflow-x:auto}
.biv1 .an-tbl{width:100%;border-collapse:collapse;font-size:12.5px;color:#fff;min-width:880px}
.biv1 .an-tbl th{background:var(--navy-cury-dark);color:#93C5FD;font-size:10.5px;font-weight:800;text-transform:uppercase;text-align:left;padding:8px 10px;white-space:nowrap}
.biv1 .an-tbl td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap}
.biv1 .an-tbl tr.dono{background:var(--navy-row-1);cursor:pointer}
.biv1 .an-tbl tr.dono:hover{background:var(--navy-hover)}
.biv1 .an-tbl tr.camp td{background:#0B2D55;color:#CBD5E1;font-size:11.5px}
.biv1 .an-tbl .r{text-align:right;font-family:var(--mono)}
.biv1 .an-tag{font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:999px;margin-left:6px}
.biv1 .an-tag.on{background:rgba(74,222,128,.15);color:var(--green-bright)}
.biv1 .an-tag.off{background:rgba(148,163,184,.18);color:#CBD5E1}
.biv1 .an-tag.err{background:rgba(248,113,113,.16);color:var(--red-bright)}
.biv1 .an-empty{padding:40px 20px;text-align:center;color:#CBD5E1}
`;

type Conta = { owner_id: string; nome: string; cargo: string; account_id: string; label: string; leads_comandra: number };
type Fb = { conta?: string; gasto?: number; leads?: number; cpl?: number | null; ativas?: number; saldo?: string | null;
  campanhas?: { id: string; nome: string; gasto: number; leads: number; cpl: number | null; ativa?: boolean }[];
  semConta?: boolean; motivo?: string; error?: string };
type Venda = { gerente?: string | null; superintendente?: string | null; vgv?: number | null; qtd?: number | null };

const brl = (n: number) => "R$ " + Math.round(n || 0).toLocaleString("pt-BR");
const brl2 = (n: number | null | undefined) => (n == null ? "—" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const chave = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const diaSP = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

// Vendas do Junix que são do dono da conta: gerente → coluna gerente; super → coluna superintendente.
function vendasDoDono(c: Conta, vendas: Venda[]) {
  const tokens = c.nome.split(/\s+/).map(chave).filter((t) => t.length >= 3);
  const doDono = vendas.filter((v) => c.cargo === "SUPERINTENDENT"
    ? tokens.some((t) => chave(v.superintendente || "").includes(t))
    : tokens.some((t) => chave(v.gerente || "") === t));
  return { qtd: doDono.reduce((a, v) => a + Number(v.qtd || 1), 0), vgv: doDono.reduce((a, v) => a + Number(v.vgv || 0), 0) };
}

export default function AnunciosGerentes({ diasInicial = 30 }: { diasInicial?: number }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [dias, setDias] = useState(diasInicial);
  const ate = diaSP(Date.now());
  const de = diaSP(Date.now() - (dias - 1) * 86400000);

  const { data, isLoading, error } = useQuery({
    queryKey: ["anunciosGerentes", de, ate],
    queryFn: async () => {
      const { data: contas, error } = await supabase.rpc("fb_contas_gerentes" as any, { p_de: de });
      if (error) throw error;
      const lista = (contas || []) as Conta[];
      const { data: vs } = await supabase.from("junix_vendas" as any).select("gerente, superintendente, vgv, qtd")
        .eq("ativo", true).gte("data_contrato", de);
      const fb = await Promise.all(lista.map(async (c) => {
        const { data: r, error: e } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: c.owner_id, de, ate } });
        return (e ? { error: e.message } : r) as Fb;
      }));
      return { contas: lista.map((c, i) => ({ c, fb: fb[i] })), vendas: (vs || []) as Venda[] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const linhas = (data?.contas || []).map(({ c, fb }) => ({ c, fb, v: vendasDoDono(c, data?.vendas || []) }))
    .sort((a, b) => Number(b.fb?.gasto || 0) - Number(a.fb?.gasto || 0));
  const tot = linhas.reduce((a, l) => ({
    gasto: a.gasto + Number(l.fb?.gasto || 0), leads: a.leads + Number(l.fb?.leads || 0),
    comandra: a.comandra + Number(l.c.leads_comandra || 0), ativas: a.ativas + Number(l.fb?.ativas || 0),
  }), { gasto: 0, leads: 0, comandra: 0, ativas: 0 });

  return (
    <div className="an-wrap">
      <style>{CSS}</style>
      <div className="an-head">
        <div>
          <h2>📣 Anúncios por gerente</h2>
          <p>Conta de anúncio de cada gerente/superintendente, lida direto no Facebook · {dias === 1 ? "hoje" : `últimos ${dias} dias`} · clique para ver as campanhas</p>
        </div>
        <div className="hc-box">
          <label>Período</label>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Hoje</option>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
      </div>

      <div className="an-kpis">
        <div className="an-kpi"><small>Gasto</small><b>{brl(tot.gasto)}</b></div>
        <div className="an-kpi"><small>Leads no Facebook</small><b>{nf(tot.leads)}</b></div>
        <div className="an-kpi"><small>Leads no Comandra</small><b>{nf(tot.comandra)}</b></div>
        <div className="an-kpi"><small>Custo por lead</small><b>{tot.leads ? brl2(tot.gasto / tot.leads) : "—"}</b></div>
        <div className="an-kpi"><small>Campanhas ativas</small><b>{nf(tot.ativas)}</b></div>
      </div>

      <div className="an-tbl-wrap">
        {isLoading ? <div className="an-empty">Lendo as contas no Facebook…</div>
          : error ? <div className="an-empty">Não consegui ler as contas agora.</div>
          : !linhas.length ? <div className="an-empty">Nenhuma conta de anúncio ligada a gerente.</div>
          : (
            <table className="an-tbl">
              <thead><tr>
                <th>Gerente / conta</th><th className="r">Gasto</th><th className="r">Leads FB</th><th className="r">Leads Comandra</th>
                <th className="r">Custo/lead</th><th className="r">Ativas</th><th className="r">Vendas (Junix)</th><th className="r">Custo/venda</th><th>Saldo</th>
              </tr></thead>
              <tbody>
                {linhas.flatMap(({ c, fb, v }) => {
                  const falha = fb?.semConta || fb?.error;
                  const linha = (
                    <tr key={c.account_id} className="dono" onClick={() => setAberto(aberto === c.account_id ? null : c.account_id)}>
                      <td>
                        <b>{c.nome}</b>{c.cargo === "SUPERINTENDENT" ? <span className="an-tag off">super</span> : null}
                        {falha ? <span className="an-tag err" title={fb?.motivo || fb?.error}>sem acesso</span> : null}
                        <div style={{ fontSize: 10.5, color: "#93C5FD" }}>{fb?.conta || c.label}</div>
                      </td>
                      <td className="r">{falha ? "—" : brl(Number(fb?.gasto || 0))}</td>
                      <td className="r">{falha ? "—" : nf(Number(fb?.leads || 0))}</td>
                      <td className="r">{nf(Number(c.leads_comandra || 0))}</td>
                      <td className="r">{falha ? "—" : brl2(fb?.cpl ?? null)}</td>
                      <td className="r">{falha ? "—" : nf(Number(fb?.ativas || 0))}</td>
                      <td className="r">{v.qtd ? `${nf(v.qtd)} · ${brl(v.vgv)}` : "—"}</td>
                      <td className="r">{v.qtd && fb?.gasto ? brl(Number(fb.gasto) / v.qtd) : "—"}</td>
                      <td style={{ fontSize: 11 }}>{fb?.saldo || "—"}</td>
                    </tr>
                  );
                  if (aberto !== c.account_id || falha) return [linha];
                  const camps = (fb?.campanhas || []).filter((x) => x.gasto > 0 || x.ativa);
                  return [linha, ...(camps.length ? camps.map((x) => (
                    <tr key={c.account_id + x.id} className="camp">
                      <td style={{ paddingLeft: 26 }}>{x.nome}<span className={`an-tag ${x.ativa ? "on" : "off"}`}>{x.ativa ? "ativa" : "pausada"}</span></td>
                      <td className="r">{brl(x.gasto)}</td><td className="r">{nf(x.leads)}</td><td className="r">—</td>
                      <td className="r">{brl2(x.cpl)}</td><td colSpan={4} />
                    </tr>
                  )) : [<tr key={c.account_id + "-vazio"} className="camp"><td colSpan={9} style={{ paddingLeft: 26 }}>Nenhuma campanha com gasto no período.</td></tr>])];
                })}
              </tbody>
            </table>
          )}
      </div>
      <p style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
        Leads FB = formulário de lead (Facebook). Leads Comandra = leads que entraram na equipe do dono no período. Vendas = Junix
        (para superintendente, soma a superintendência inteira — inclui as equipes dos gerentes que também têm conta).
      </p>
    </div>
  );
}
