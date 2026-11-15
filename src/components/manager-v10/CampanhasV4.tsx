// Campanhas & Mídia — design do mockup V4 (Junior 15/11): 4 cartões de decisão + tabela executiva.
// Dado REAL: fb_saude (dono_id) dá gasto/leads/CPL/status; os leads (manager_id) dão % sem toque por campanha
// (cruzado por campanha_nome). "Fadiga/frequência/CTR" e "visitas/vendas por campanha" NÃO existem na fonte hoje,
// então ficam de fora (nada estimado). Tokens cv-* → tema herdado da Central (.lx). Painel completo a 1 clique.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FilasFormulario from "@/components/leads/FilasFormulario";
import { COLS_LEAD, type LeadN } from "@/components/leads2/comum";
import { atendido, ehTeste } from "@/lib/situacaoLead";

const sb = supabase as any;
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const norm = (s: string) => (s || "").trim().toLowerCase();
const haMin = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 60) return `há ${Math.max(1, m)} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)} dias`;
};
type Camp = { nome: string; gasto: number; leads: number; status: string; cpl: number | null };

export default function CampanhasV4({ donoId, como }: { donoId: string; como?: string | null }) {
  const [verFilas, setVerFilas] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["campv4", donoId],
    enabled: !!donoId,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const desde60 = new Date(Date.now() - 60 * 864e5).toISOString();
      const [saudeR, leadsR] = await Promise.all([
        sb.from("fb_saude").select("dados,atualizado_em").eq("dono_id", donoId),
        sb.from("leads").select(COLS_LEAD).eq("manager_id", donoId)
          .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED,LOST)").gte("created_at", desde60),
      ]);
      const rows = saudeR.data ?? [];
      const camps: Camp[] = rows.flatMap((r: any) => (r.dados?.campanhas ?? [])).map((c: any) => {
        const gasto = Number(c.gasto || 0), leads = Number(c.leads || 0);
        return { nome: String(c.nome || "campanha"), gasto, leads, status: c.status, cpl: leads > 0 ? gasto / leads : null };
      });
      const atualizado = rows.map((r: any) => r.atualizado_em).filter(Boolean).sort().slice(-1)[0] ?? null;
      // % sem toque por campanha (cruza pelo nome da campanha nos leads reais)
      const leads = ((leadsR.data ?? []) as LeadN[]).filter((l) => !ehTeste(l));
      const porCamp = new Map<string, { total: number; semToque: number }>();
      for (const l of leads) {
        const nome = norm((l as any).campanha_nome || (l as any).campanha || "");
        if (!nome) continue;
        const o = porCamp.get(nome) ?? { total: 0, semToque: 0 };
        o.total++; if (!atendido(l)) o.semToque++;
        porCamp.set(nome, o);
      }
      return { camps, atualizado, porCamp };
    },
  });

  const info = useMemo(() => {
    const ativas = (data?.camps ?? []).filter((c) => c.status === "ACTIVE");
    const comGasto = ativas.filter((c) => c.gasto > 0);
    const comCpl = comGasto.filter((c) => c.cpl != null) as (Camp & { cpl: number })[];
    const gastoTot = comGasto.reduce((s, c) => s + c.gasto, 0);
    const leadsTot = comGasto.reduce((s, c) => s + c.leads, 0);
    const media = leadsTot ? gastoTot / leadsTot : null;
    const ord = [...comCpl].sort((a, b) => a.cpl - b.cpl);
    // desperdício: campanha com maior % sem toque (entre as que têm leads suficientes no CRM)
    const pc = data?.porCamp;
    let desperdicio: { nome: string; pct: number; sem: number; total: number } | null = null;
    if (pc) for (const c of comGasto) {
      const o = pc.get(norm(c.nome)); if (!o || o.total < 3) continue;
      const pct = Math.round((o.semToque / o.total) * 100);
      if (!desperdicio || pct > desperdicio.pct) desperdicio = { nome: c.nome, pct, sem: o.semToque, total: o.total };
    }
    return {
      ativas, comGasto, media, gastoTot, leadsTot,
      caro: ord.length > 1 ? ord[ord.length - 1] : null,
      melhor: ord[0] ?? null,
      volume: [...comGasto].sort((a, b) => b.leads - a.leads)[0] ?? null,
      desperdicio,
    };
  }, [data]);

  const vsMedia = (cpl: number) => (info.media ? Math.round(((cpl - info.media) / info.media) * 100) : null);
  const semToqueDe = (nome: string) => data?.porCamp?.get(norm(nome)) ?? null;

  return (
    <section className="cv4">
      <style>{CSS}</style>
      <div className="cv4-top">
        <div><h2>Campanhas &amp; mídia</h2>
          <p>Cruzamento da conta Meta com o Comandra. <span className="cv4-fresh">● robô fb_saude {haMin(data?.atualizado)}</span></p></div>
        <div className="cv4-acoes">
          <button className={`cv4-btn${verFilas ? " on" : ""}`} onClick={() => setVerFilas((v) => !v)}>🔁 Gerenciar filas de leads</button>
          <Link className="cv4-btn ghost" to="/manager/anuncios">Painel completo · alertas · pixel →</Link>
        </div>
      </div>

      {verFilas && (
        <div className="cv4-filas">
          <div className="cv4-filas-h"><b>Filas por formulário</b> — escolha quem recebe os leads de cada anúncio.
            <button className="cv4-fechar" onClick={() => setVerFilas(false)}>fechar ✕</button></div>
          <FilasFormulario como={como ?? null} abrir="*" semCartao />
        </div>
      )}

      {isLoading ? <p className="cv4-vazio">Carregando…</p> : !info.comGasto.length ? (
        <p className="cv4-vazio">Nenhuma campanha ativa com investimento nos últimos dias. Conecte ou ligue a conta de anúncio em Configurar.</p>
      ) : (
        <>
          {/* 4 cartões de decisão */}
          <div className="cv4-cards">
            <article className="cv4-card caro">
              <div className="cv4-card-tag rose">🔴 Lead caro (CPL alto)</div>
              {info.caro ? <>
                <h3>{info.caro.nome}</h3>
                <p>CPL <b>{brl(info.caro.cpl!)}</b>{vsMedia(info.caro.cpl!) != null && vsMedia(info.caro.cpl!)! > 0 && <> — <b>+{vsMedia(info.caro.cpl!)}%</b> acima da média ({brl(info.media!)})</>}. Gasto de {brl(info.caro.gasto)} gerou {info.caro.leads} leads.</p>
              </> : <h3>Nenhuma campanha fora da curva</h3>}
              <div className="cv4-card-acts"><Link className="cv4-a cob" to="/manager/anuncios">📲 Cobrar tráfego</Link><button className="cv4-a ver" onClick={() => setVerFilas(true)}>👥 Ver fila</button></div>
            </article>

            <article className="cv4-card opo">
              <div className="cv4-card-tag green">🟢 Oportunidade / escalar</div>
              {info.melhor ? <>
                <h3>{info.melhor.nome}</h3>
                <p>Campeã com CPL <b>{brl(info.melhor.cpl!)}</b>{vsMedia(info.melhor.cpl!) != null && vsMedia(info.melhor.cpl!)! < 0 && <> (<b>{vsMedia(info.melhor.cpl!)}%</b> vs média)</>}, {info.melhor.leads} leads. O estande pode absorver mais volume.</p>
              </> : <h3>—</h3>}
              <div className="cv4-card-acts"><button className="cv4-a rep" onClick={() => setVerFilas(true)}>🚀 Reforçar fila</button><Link className="cv4-a ver" to="/manager/anuncios">📊 Ver ROI</Link></div>
            </article>

            <article className="cv4-card desp">
              <div className="cv4-card-tag purple">🟣 Desperdício / queimados</div>
              {info.desperdicio ? <>
                <h3>{info.desperdicio.nome} — {info.desperdicio.pct}% sem toque</h3>
                <p>A mídia entregou, mas <b>{info.desperdicio.sem}</b> de {info.desperdicio.total} leads estão <b>sem nenhum contato</b>. Verba virando lead parado.</p>
              </> : <h3>Sem desperdício detectado</h3>}
              <div className="cv4-card-acts"><button className="cv4-a rep" onClick={() => setVerFilas(true)}>⚡ Redistribuir</button><button className="cv4-a cob">💬 Cobrar equipe</button></div>
            </article>

            <article className="cv4-card vol">
              <div className="cv4-card-tag blue">🔵 Maior volume</div>
              {info.volume ? <>
                <h3>{info.volume.nome}</h3>
                <p><b>{info.volume.leads} leads</b>{info.volume.cpl != null && <> a {brl(info.volume.cpl)} cada</>}. É a que mais abastece o funil — garanta a fila pronta.</p>
              </> : <h3>—</h3>}
              <div className="cv4-card-acts"><button className="cv4-a rep" onClick={() => setVerFilas(true)}>👥 Ver fila</button><Link className="cv4-a ver" to="/manager/anuncios">🔍 Métricas</Link></div>
            </article>
          </div>

          {/* tabela executiva */}
          <div className="cv4-tab">
            <div className="cv4-tab-h"><b>📢 Desempenho executivo por campanha Meta Ads</b><span>Sincronizado via Meta Marketing API</span></div>
            <div className="cv4-h"><span>Campanha</span><span className="r">Investido</span><span className="r">CPL médio</span><span className="r">Leads (Meta)</span><span className="r">Sem toque</span><span>Status</span></div>
            {[...info.comGasto].sort((a, b) => b.gasto - a.gasto).map((c, i) => {
              const d = c.cpl != null ? vsMedia(c.cpl) : null;
              const st = semToqueDe(c.nome);
              return (
                <div key={i} className="cv4-row">
                  <span className="cv4-nome">{c.nome}<small>Meta Ads</small></span>
                  <span className="r mono">{brl(c.gasto)}</span>
                  <span className="r mono" style={{ color: d == null ? undefined : d > 0 ? "#F43F5E" : "#10B981", fontWeight: 700 }}>{c.cpl != null ? brl(c.cpl) : "—"}{d != null && <small> {d > 0 ? "+" : ""}{d}%</small>}</span>
                  <span className="r mono">{c.leads}</span>
                  <span className="r mono" style={{ color: st && st.semToque > 0 ? "#E8912B" : "#10B981" }}>{st ? st.semToque : "—"}{st && st.total ? <small> /{st.total}</small> : null}</span>
                  <span className="cv4-st">{c.status === "ACTIVE" ? "● ativa" : c.status?.toLowerCase()}</span>
                </div>
              );
            })}
            <div className="cv4-foot">Total: {brl(info.gastoTot)} · {info.leadsTot} leads · CPL médio {info.media != null ? brl(info.media) : "—"}. "Sem toque" = leads da campanha sem primeiro contato (cruzado pelo nome).</div>
          </div>
        </>
      )}
    </section>
  );
}

const CSS = `
.cv4{display:flex;flex-direction:column;gap:16px}
.cv4-top{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.cv4-top h2{margin:0;font-size:20px;font-weight:800}
.cv4-top p{margin:3px 0 0;font-size:13px;color:var(--cv-text-muted,#6B7A90)}
.cv4-fresh{color:#10B981;font-weight:600;font-family:"JetBrains Mono",monospace;font-size:12px;margin-left:6px}
.cv4-acoes{display:flex;gap:10px;flex-wrap:wrap}
.mgr10 .cv4-btn{display:inline-flex;align-items:center;min-height:42px;padding:0 16px;border-radius:11px;border:0;background:#0EA5E9;color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-decoration:none}
.mgr10 .cv4-btn.on{background:#0F1B2D}
.mgr10 .cv4-btn.ghost{background:var(--cv-surface,#fff);color:#0EA5E9;border:1px solid var(--cv-border,#CFE0F7)}
.cv4-filas{border:1px solid var(--cv-border,#DCE6F5);border-radius:14px;padding:14px 16px;background:var(--cv-sunk,#F7FAFF)}
.cv4-filas-h{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:10px;flex-wrap:wrap}
.cv4-filas-h b{font-weight:800}
.cv4-fechar{margin-left:auto;background:none;border:0;color:var(--cv-text-muted,#6B7A90);font:inherit;font-size:13px;cursor:pointer}
.cv4-vazio{padding:28px 6px;font-size:14px;color:var(--cv-text-muted,#6B7A90)}

.cv4-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv4-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:15px 16px;display:flex;flex-direction:column;gap:9px;transition:all .2s}
.cv4-card:hover{transform:translateY(-2px)}
.cv4-card.caro{border-left:4px solid #F43F5E}.cv4-card.caro:hover{border-color:#F43F5E}
.cv4-card.opo{border-left:4px solid #10B981}.cv4-card.opo:hover{border-color:#10B981}
.cv4-card.desp{border-left:4px solid #A855F7}.cv4-card.desp:hover{border-color:#A855F7}
.cv4-card.vol{border-left:4px solid #3B82F6}.cv4-card.vol:hover{border-color:#3B82F6}
.cv4-card-tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.cv4-card-tag.rose{color:#F43F5E}.cv4-card-tag.green{color:#10B981}.cv4-card-tag.purple{color:#A855F7}.cv4-card-tag.blue{color:#3B82F6}
.cv4-card h3{margin:0;font-size:14.5px;font-weight:800;line-height:1.25;color:var(--cv-text-main,#1a2435)}
.cv4-card p{margin:0;font-size:12.5px;line-height:1.5;color:var(--cv-text-muted,#5B6B80);flex:1}
.cv4-card-acts{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .cv4-a{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:12px;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;text-decoration:none}
.mgr10 .cv4-a.cob{background:rgba(16,185,129,.12);color:#10B981;border-color:rgba(16,185,129,.3)}
.mgr10 .cv4-a.cob:hover{background:#10B981;color:#fff}
.mgr10 .cv4-a.rep{background:rgba(14,165,233,.12);color:#38BDF8;border-color:rgba(14,165,233,.3)}
.mgr10 .cv4-a.rep:hover{background:#0EA5E9;color:#fff}
.mgr10 .cv4-a.ver{background:rgba(148,163,184,.12);color:var(--cv-text-muted,#5B6B80);border-color:var(--cv-border,#E7EDF6)}
.mgr10 .cv4-a.ver:hover{background:var(--cv-sunk,#EEF2F8);color:var(--cv-text-main,#1a2435)}

.cv4-tab{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;overflow:hidden}
.cv4-tab-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--cv-border,#E7EDF6)}
.cv4-tab-h b{font-size:15px;font-weight:800}.cv4-tab-h span{font-size:11.5px;color:var(--cv-text-dim,#8A97A8)}
.cv4-h,.cv4-row{display:grid;grid-template-columns:minmax(0,2fr) 110px 130px 100px 110px 90px;gap:10px;align-items:center;padding:12px 16px}
.cv4-h{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted,#6B7A90);font-weight:800;background:var(--cv-sunk,#F7F9FC);border-bottom:1px solid var(--cv-border,#E7EDF6)}
.cv4-row{border-top:1px solid var(--cv-border,#EEF2F8);font-size:13.5px}
.cv4-row:first-of-type{border-top:0}
.cv4 .r{text-align:right}.cv4 .mono{font-family:"JetBrains Mono",monospace}.cv4 .mono small{font-size:11px;opacity:.8}
.cv4-nome{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;flex-direction:column}
.cv4-nome small{font-weight:500;font-size:11px;color:var(--cv-text-dim,#8A97A8)}
.cv4-st{font-size:12px;color:#10B981;font-weight:700}
.cv4-foot{padding:12px 16px;border-top:1px solid var(--cv-border,#E7EDF6);font-size:12px;color:var(--cv-text-muted,#6B7A90);background:var(--cv-sunk,#FAFBFD)}
@media (max-width:1100px){.cv4-cards{grid-template-columns:1fr 1fr}}
@media (max-width:1000px){.cv4-h{display:none}.cv4-row{grid-template-columns:1fr auto auto;gap:6px}.cv4-nome{grid-column:1/-1}}
`;
