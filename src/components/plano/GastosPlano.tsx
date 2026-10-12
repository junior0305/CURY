/* Gastos do mês: planejado × realizado por categoria. Cada super lança o dele; o diretor
 * vê a soma das superintendências + os gastos próprios da diretoria. Anúncio (Facebook)
 * entra sozinho como realizado; o diretor pode criar categorias novas. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCategorias, useGastos, useEstrutura, usePlanos, usePlanoAcoes, type Gasto } from "@/hooks/usePlano";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const inp: React.CSSProperties = { border: "1px solid var(--line)", background: "#fff", borderRadius: 8, padding: "8px 10px", font: "500 14px Archivo, sans-serif", color: "var(--ink)", minHeight: 38, width: "100%" };

export default function GastosPlano({ raizId, mes, anuncio, podeCriarCategoria }: {
  raizId: string; mes: string; anuncio: Map<string, number>; podeCriarCategoria: boolean;
}) {
  const { data: cats = [] } = useCategorias();
  const { data: gastos = [], isLoading } = useGastos(mes);
  const { data: pessoas = [] } = useEstrutura(raizId);
  const { data: planos = [] } = usePlanos(mes);
  const { criarGasto, alterarGasto, apagarGasto, criarCategoria } = usePlanoAcoes();
  const [novo, setNovo] = useState<Partial<Gasto> | null>(null);
  const [novaCat, setNovaCat] = useState<string | null>(null);

  const raiz = pessoas.find((p) => p.id === raizId);
  const ehTopo = raiz?.papel === "DIRECTOR";
  // donos de orçamento: a própria raiz (diretoria ou super) e, para o diretor, cada super
  const donos = pessoas.filter((p) => p.id === raizId || (ehTopo && p.papel === "SUPERINTENDENT"));
  const nomeDono = (id: string) => id === raizId ? (ehTopo ? "Diretoria (próprio)" : raiz?.nome ?? "—") : pessoas.find((p) => p.id === id)?.nome ?? "—";
  const catAuto = cats.find((c) => c.automatica);
  const acoes = useMemo(() => planos.flatMap((p) => p.acoes.map((a) => ({ ...a, plano: p.titulo, dono: p.dono_id }))), [planos]);

  // célula (dono, categoria): planejado e realizado; anúncio realizado vem do Facebook
  const cel = (dono: string | null, cat: string) => {
    const gs = gastos.filter((g) => g.categoria_id === cat && (dono == null || g.dono_id === dono));
    let realizado = gs.reduce((a, g) => a + g.realizado, 0);
    if (catAuto && cat === catAuto.id) realizado += dono == null ? [...anuncio.values()].reduce((a, n) => a + n, 0) : anuncio.get(dono) ?? 0;
    return { planejado: gs.reduce((a, g) => a + g.planejado, 0), realizado };
  };
  const totalDono = (dono: string | null) => cats.reduce((t, c) => { const x = cel(dono, c.id); return { planejado: t.planejado + x.planejado, realizado: t.realizado + x.realizado }; }, { planejado: 0, realizado: 0 });
  const tot = totalDono(null);
  const previstoAcoes = acoes.reduce((a, x) => a + Number(x.custo_previsto ?? 0), 0);

  const salvar = async () => {
    if (!novo?.categoria_id) { toast.error("Escolha a categoria"); return; }
    if (await criarGasto({ mes, dono_id: novo.dono_id ?? raizId, categoria_id: novo.categoria_id, descricao: novo.descricao || null,
      planejado: Number(novo.planejado || 0), realizado: Number(novo.realizado || 0), acao_id: novo.acao_id || null })) setNovo(null);
  };
  const Dif = ({ p, r }: { p: number; r: number }) => !p && !r ? <span className="z">—</span>
    : <span className={r > p && p > 0 ? "r" : r <= p && p > 0 ? "g" : ""}>{r > p ? "+" : r < p ? "−" : ""}{brl(Math.abs(r - p))}</span>;

  return (
    <>
      <div className="dir-kpis">
        <div className="dir-card dir-kpi"><div className="dir-lbl">Planejado</div><span className="mono">{brl(tot.planejado)}</span><small>{ehTopo ? "diretoria + superintendências" : "no mês"}</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Realizado</div><span className="mono" style={{ color: tot.planejado && tot.realizado > tot.planejado ? "var(--red)" : undefined }}>{brl(tot.realizado)}</span>
          <small>{tot.planejado ? `${Math.round((tot.realizado / tot.planejado) * 100)}% do planejado` : "inclui anúncio automático"}</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Previsto nas ações</div><span className="mono">{brl(previstoAcoes)}</span><small>custo das ações do plano</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Saldo</div><span className="mono" style={{ color: tot.planejado - tot.realizado < 0 ? "var(--red)" : "var(--grn)" }}>{brl(tot.planejado - tot.realizado)}</span><small>planejado − realizado</small></div>
      </div>

      <div className="dir-card" style={{ padding: "18px 0 6px" }}>
        <div className="dir-h" style={{ padding: "0 18px 10px", justifyContent: "space-between" }}>
          <span><b>Planejado × realizado por categoria</b> <span>vermelho = passou do planejado · anúncio realizado vem do Facebook</span></span>
          <span style={{ display: "flex", gap: 8 }}>
            {podeCriarCategoria ? <button className="dir-btn" onClick={() => setNovaCat("")}>+ Categoria</button> : null}
            <button className="dir-btn solid" onClick={() => setNovo({ dono_id: raizId })}>+ Lançar gasto</button>
          </span>
        </div>
        {novaCat != null ? (
          <div style={{ display: "flex", gap: 8, padding: "0 18px 12px", flexWrap: "wrap" }}>
            <input style={{ ...inp, maxWidth: 320 }} autoFocus value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nome da categoria (ex.: Carro de som)" />
            <button className="dir-btn solid" onClick={async () => { if (novaCat.trim() && await criarCategoria(novaCat.trim())) setNovaCat(null); }}>Criar</button>
            <button className="dir-btn" onClick={() => setNovaCat(null)}>Cancelar</button>
          </div>
        ) : null}
        {novo ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", padding: "0 18px 14px", alignItems: "end" }}>
            {donos.length > 1 ? <label><span className="dir-lbl">De quem</span>
              <select style={inp} value={novo.dono_id} onChange={(e) => setNovo({ ...novo, dono_id: e.target.value })}>
                {donos.map((d) => <option key={d.id} value={d.id}>{nomeDono(d.id)}</option>)}</select></label> : null}
            <label><span className="dir-lbl">Categoria</span>
              <select style={inp} value={novo.categoria_id ?? ""} onChange={(e) => setNovo({ ...novo, categoria_id: e.target.value })}>
                <option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <label style={{ gridColumn: "span 2" }}><span className="dir-lbl">Descrição</span>
              <input style={inp} value={novo.descricao ?? ""} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Ex.: 5 mil panfletos gráfica X" /></label>
            <label><span className="dir-lbl">Planejado (R$)</span>
              <input style={inp} type="number" min={0} value={novo.planejado ?? ""} onChange={(e) => setNovo({ ...novo, planejado: e.target.value as any })} /></label>
            <label><span className="dir-lbl">Realizado (R$)</span>
              <input style={inp} type="number" min={0} value={novo.realizado ?? ""} onChange={(e) => setNovo({ ...novo, realizado: e.target.value as any })} /></label>
            <label style={{ gridColumn: "span 2" }}><span className="dir-lbl">Ação do plano (opcional)</span>
              <select style={inp} value={novo.acao_id ?? ""} onChange={(e) => {
                const a = acoes.find((x) => x.id === e.target.value);
                setNovo({ ...novo, acao_id: e.target.value || null, ...(a && !novo.descricao ? { descricao: a.titulo } : {}), ...(a?.custo_previsto && !novo.planejado ? { planejado: a.custo_previsto as any } : {}) });
              }}>
                <option value="">—</option>{acoes.map((a) => <option key={a.id} value={a.id}>{a.titulo} · {a.plano}</option>)}</select></label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="dir-btn" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="dir-btn solid" onClick={salvar}>Salvar</button>
            </div>
          </div>
        ) : null}
        <div className="dir-tree">
          <table>
            <thead><tr><th>Categoria</th>{donos.map((d) => <th key={d.id} colSpan={2}>{nomeDono(d.id)}</th>)}{donos.length > 1 ? <th colSpan={2}>Total</th> : null}<th>Diferença</th></tr>
              <tr><th />{[...donos, ...(donos.length > 1 ? [null] : [])].map((d, i) => [<th key={`p${i}`}>plan.</th>, <th key={`r${i}`}>real.</th>])}<th /></tr></thead>
            <tbody>
              {cats.map((c) => {
                const t = cel(null, c.id);
                return (
                  <tr key={c.id}>
                    <td>{c.nome}{c.automatica ? <span className="dir-chip c-blue" style={{ marginLeft: 6 }}>auto</span> : null}</td>
                    {donos.map((d) => { const x = cel(d.id, c.id); return [<td key={`p${d.id}`}>{x.planejado ? brl(x.planejado) : <span className="z">—</span>}</td>, <td key={`r${d.id}`}>{x.realizado ? brl(x.realizado) : <span className="z">—</span>}</td>]; })}
                    {donos.length > 1 ? [<td key="tp">{t.planejado ? brl(t.planejado) : <span className="z">—</span>}</td>, <td key="tr">{t.realizado ? brl(t.realizado) : <span className="z">—</span>}</td>] : null}
                    <td><Dif p={t.planejado} r={t.realizado} /></td>
                  </tr>
                );
              })}
              <tr className="tot"><td>Total</td>
                {donos.map((d) => { const x = totalDono(d.id); return [<td key={`p${d.id}`}>{brl(x.planejado)}</td>, <td key={`r${d.id}`}>{brl(x.realizado)}</td>]; })}
                {donos.length > 1 ? [<td key="tp">{brl(tot.planejado)}</td>, <td key="tr">{brl(tot.realizado)}</td>] : null}
                <td><Dif p={tot.planejado} r={tot.realizado} /></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="dir-card" style={{ padding: 18 }}>
        <div className="dir-h" style={{ marginBottom: 6 }}><b>Lançamentos do mês</b><span>edite o realizado conforme o dinheiro sai</span></div>
        {isLoading ? <span className="dir-nota">carregando…</span> : !gastos.length ? <span className="dir-nota">Nenhum gasto lançado ainda. O anúncio do Facebook já entra sozinho.</span> : (
          <div className="dir-list">
            {gastos.map((g) => (
              <div key={g.id} style={{ flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 220px" }}><b>{g.descricao || cats.find((c) => c.id === g.categoria_id)?.nome}</b><br />
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{cats.find((c) => c.id === g.categoria_id)?.nome} · {nomeDono(g.dono_id)}
                    {g.acao_id ? ` · ação: ${acoes.find((a) => a.id === g.acao_id)?.titulo ?? "—"}` : ""}</span></span>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>plan. <b className="mono" style={{ color: "var(--ink)" }}>{brl(g.planejado)}</b></span>
                <label style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>real.
                  <input key={`${g.id}-${g.realizado}`} type="number" min={0} defaultValue={g.realizado || ""} placeholder="0" aria-label="realizado"
                    onBlur={(e) => { const n = Number(e.target.value || 0); if (n !== g.realizado) alterarGasto(g.id, { realizado: n }); }}
                    style={{ ...inp, width: 110, minHeight: 32, padding: "4px 8px", textAlign: "right", fontFamily: '"JetBrains Mono", monospace' }} /></label>
                <button className="dir-btn" style={{ minHeight: 32, padding: "4px 8px", color: "var(--ink-3)" }} aria-label="remover gasto"
                  onClick={() => { if (window.confirm("Remover este gasto?")) apagarGasto(g.id); }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
