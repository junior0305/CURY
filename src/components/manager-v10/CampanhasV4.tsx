// Campanhas & Mídia no visual V4 (Junior, 14/11): "robô atualizado há X" + 3 cartões de decisão + tabela executiva.
// Dado real = fb_saude (dono_id do gerente). CPL = gasto/leads. Painel completo (alertas, comparar, pixel) fica a 1 clique.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const haMin = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 60) return `há ${Math.max(1, m)} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  return `há ${Math.round(m / 1440)} dias`;
};
type Camp = { nome: string; gasto: number; leads: number; status: string; cpl: number | null };

export default function CampanhasV4({ donoId }: { donoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campv4", donoId],
    enabled: !!donoId,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const rows = (await sb.from("fb_saude").select("dados,atualizado_em").eq("dono_id", donoId)).data ?? [];
      const camps: Camp[] = rows.flatMap((r: any) => (r.dados?.campanhas ?? [])).map((c: any) => {
        const gasto = Number(c.gasto || 0), leads = Number(c.leads || 0);
        return { nome: String(c.nome || "campanha"), gasto, leads, status: c.status, cpl: leads > 0 ? gasto / leads : null };
      });
      const atualizado = rows.map((r: any) => r.atualizado_em).filter(Boolean).sort().slice(-1)[0] ?? null;
      return { camps, atualizado };
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
    return {
      ativas, comGasto, media, gastoTot, leadsTot,
      melhor: ord[0] ?? null, pior: ord.length > 1 ? ord[ord.length - 1] : null,
      volume: [...comGasto].sort((a, b) => b.leads - a.leads)[0] ?? null,
    };
  }, [data]);

  const vsMedia = (cpl: number) => (info.media ? Math.round(((cpl - info.media) / info.media) * 100) : null);

  return (
    <section className="cv4">
      <style>{CSS}</style>
      <div className="cv4-top">
        <div><h2>Campanhas &amp; mídia</h2>
          <p>Cruzamento da conta Meta com o Comandra. <span className="cv4-fresh">● robô fb_saude {haMin(data?.atualizado)}</span></p></div>
        <Link className="cv4-link" to="/manager/anuncios">Painel completo (alertas · comparar · pixel) →</Link>
      </div>

      {isLoading ? <p className="cv4-vazio">Carregando…</p> : !info.comGasto.length ? (
        <p className="cv4-vazio">Nenhuma campanha ativa com investimento nos últimos dias. Conecte ou ligue a conta de anúncio em Configurar.</p>
      ) : (
        <>
          <div className="cv4-cards">
            <article className="cv4-card bom">
              <h3>🏆 Melhor retorno</h3>
              {info.melhor ? <p><b>{info.melhor.nome}</b> — CPL <b>{brl(info.melhor.cpl)}</b>{vsMedia(info.melhor.cpl) != null && vsMedia(info.melhor.cpl)! < 0 && <> ({vsMedia(info.melhor.cpl)}% vs média)</>}, {info.melhor.leads} leads. Vale reforçar fila e verba.</p> : <p>—</p>}
            </article>
            <article className="cv4-card alto">
              <h3>⚠️ Custo subindo</h3>
              {info.pior ? <p><b>{info.pior.nome}</b> — CPL <b>{brl(info.pior.cpl)}</b>{vsMedia(info.pior.cpl) != null && vsMedia(info.pior.cpl)! > 0 && <> (+{vsMedia(info.pior.cpl)}% vs média)</>}. Hora de cobrar o tráfego ou renovar o criativo.</p> : <p>Nenhuma campanha fora da curva.</p>}
            </article>
            <article className="cv4-card vol">
              <h3>📈 Mais volume</h3>
              {info.volume ? <p><b>{info.volume.nome}</b> — {info.volume.leads} leads{info.volume.cpl != null && <> a {brl(info.volume.cpl)}</>}. O estande precisa dar conta.</p> : <p>—</p>}
            </article>
          </div>

          <div className="cv4-tab">
            <div className="cv4-h"><span>Campanha</span><span className="r">Investido</span><span className="r">CPL</span><span className="r">Leads</span><span>Status</span></div>
            {[...info.comGasto].sort((a, b) => b.gasto - a.gasto).map((c, i) => {
              const d = c.cpl != null ? vsMedia(c.cpl) : null;
              return (
                <div key={i} className="cv4-row">
                  <span className="cv4-nome">{c.nome}</span>
                  <span className="r mono">{brl(c.gasto)}</span>
                  <span className="r mono" style={{ color: d == null ? undefined : d > 0 ? "#B4322A" : "#0D7C66", fontWeight: 700 }}>{c.cpl != null ? brl(c.cpl) : "—"}{d != null && <small> {d > 0 ? "+" : ""}{d}%</small>}</span>
                  <span className="r mono">{c.leads}</span>
                  <span className="cv4-st">{c.status === "ACTIVE" ? "ativa" : c.status?.toLowerCase()}</span>
                </div>
              );
            })}
            <div className="cv4-foot">Total: {brl(info.gastoTot)} · {info.leadsTot} leads · CPL médio {info.media != null ? brl(info.media) : "—"}</div>
          </div>
        </>
      )}
    </section>
  );
}

const CSS = `
.cv4{display:flex;flex-direction:column;gap:16px}
.cv4-top{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.cv4-top h2{margin:0;font-size:19px;font-weight:800}
.cv4-top p{margin:3px 0 0;font-size:13px;color:var(--cv-text-muted,#6B7A90)}
.cv4-fresh{color:#0D7C66;font-weight:600;font-family:"JetBrains Mono",monospace;font-size:12px;margin-left:6px}
.cv4-link{font-size:13px;font-weight:700;color:#1f63e0;text-decoration:none}
.cv4-vazio{padding:28px 6px;font-size:14px;color:var(--cv-text-muted,#6B7A90)}
.cv4-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cv4-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-top-width:3px;border-radius:14px;padding:15px 16px}
.cv4-card.bom{border-top-color:#1FA97C}.cv4-card.alto{border-top-color:#E8912B}.cv4-card.vol{border-top-color:#1f63e0}
.cv4-card h3{margin:0 0 6px;font-size:14px;font-weight:800}
.cv4-card p{margin:0;font-size:13.5px;line-height:1.5;color:var(--cv-text-main,#27364B)}
.cv4-tab{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;overflow:hidden}
.cv4-h,.cv4-row{display:grid;grid-template-columns:minmax(0,2fr) 120px 130px 80px 90px;gap:10px;align-items:center;padding:12px 16px}
.cv4-h{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted,#6B7A90);font-weight:700;background:var(--cv-sunk,#F7F9FC);border-bottom:1px solid var(--cv-border,#E7EDF6)}
.cv4-row{border-top:1px solid var(--cv-border,#EEF2F8);font-size:13.5px}
.cv4-row:first-of-type{border-top:0}
.cv4 .r{text-align:right}.cv4 .mono{font-family:"JetBrains Mono",monospace}.cv4 .mono small{font-size:11px;opacity:.8}
.cv4-nome{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cv4-st{font-size:12px;color:#0D7C66;font-weight:600}
.cv4-foot{padding:12px 16px;border-top:1px solid var(--cv-border,#E7EDF6);font-size:12.5px;color:var(--cv-text-muted,#6B7A90);font-family:"JetBrains Mono",monospace;background:var(--cv-sunk,#FAFBFD)}
@media (max-width:1000px){.cv4-cards{grid-template-columns:1fr}.cv4-h{display:none}.cv4-row{grid-template-columns:1fr auto auto;gap:6px}.cv4-nome{grid-column:1/-1}}
`;
