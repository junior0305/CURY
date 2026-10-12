/* Plano estratégico do mês — o do diretor manda; o super desdobra o dele a partir dele.
 * Cada plano tem foco (lançamento / estoque / geral), meta e ações com responsável,
 * prazo e entregável. O Jarvis só cobra ação ATRASADA (botão aqui e cobrança diária). */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePlanos, useEstrutura, useEstoque, usePlanoAcoes, atrasada, hojeSP,
  type Plano, type Acao, type Foco, type Pessoa, type StatusAcao } from "@/hooks/usePlano";

const FOCO: Record<Foco, [string, string]> = { lancamento: ["Lançamento", "c-blue"], estoque: ["Estoque", "c-org"], geral: ["Geral", "c-gray"] };
const STATUS: Record<StatusAcao, string> = { a_fazer: "A fazer", fazendo: "Fazendo", feito: "Feito", cancelada: "Cancelada" };
const PAPEL: Record<string, string> = { DIRECTOR: "diretoria", SUPERINTENDENT: "super", MANAGER: "gerente", BROKER: "corretor" };
const dm = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "sem prazo";
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const inp: React.CSSProperties = { border: "1px solid var(--line)", background: "#fff", borderRadius: 8, padding: "8px 10px", font: "500 14px Archivo, sans-serif", color: "var(--ink)", minHeight: 38, width: "100%" };

export default function PlanoEstrategico({ raizId, meuId, mes }: { raizId: string; meuId: string; mes: string }) {
  const { data: planos = [], isLoading } = usePlanos(mes);
  const { data: pessoas = [] } = useEstrutura(raizId);
  const { data: estoque = [] } = useEstoque();
  const [novo, setNovo] = useState<Partial<Plano> | null>(null);
  const nome = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  const raiz = nome.get(raizId);
  const ehTopo = raiz?.papel === "DIRECTOR";
  // os planos "de cima": do diretor (ou, para o super, os do chefe dele) — prioridade
  const doTopo = ehTopo ? [] : planos.filter((p) => p.dono_id === raiz?.chefe);
  const meus = planos.filter((p) => p.dono_id === raizId);
  const filhosDe = (id: string) => planos.filter((p) => p.pai_id === id);
  const soltos = planos.filter((p) => p.dono_id !== raizId && !doTopo.includes(p) && (!p.pai_id || !planos.some((x) => x.id === p.pai_id)));

  const todasAcoes = planos.flatMap((p) => p.acoes);
  const atrasadas = todasAcoes.filter(atrasada).length;
  const feitas = todasAcoes.filter((a) => a.status === "feito").length;

  return (
    <>
      <div className="dir-kpis">
        <div className="dir-card dir-kpi"><div className="dir-lbl">Planos ativos</div><span className="mono">{planos.filter((p) => p.status === "ativo").length}</span><small>no mês</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Ações</div><span className="mono">{feitas} de {todasAcoes.length}</span><small>feitas</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Atrasadas</div><span className="mono" style={{ color: atrasadas ? "var(--red)" : undefined }}>{atrasadas}</span><small>o Jarvis cobra só estas</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Custo previsto</div><span className="mono">{brl(todasAcoes.reduce((a, x) => a + Number(x.custo_previsto ?? 0), 0))}</span><small>soma das ações</small></div>
      </div>

      <div className="dir-row2">
        <div>
          <div className="dir-h" style={{ justifyContent: "space-between" }}>
            <b>{ehTopo ? "Plano da diretoria" : `Plano de ${raiz?.nome ?? ""}`}</b>
            <button className="dir-btn solid" onClick={() => setNovo({ mes, dono_id: raizId, foco: "geral", prioridade: 2 })}>+ Novo plano</button>
          </div>
          {!ehTopo && doTopo.length ? (
            <div className="dir-card" style={{ padding: 14, background: "#F7F9FB" }}>
              <div className="dir-lbl" style={{ marginBottom: 6 }}>Prioridade da diretoria — desdobre a partir daqui</div>
              {doTopo.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", flexWrap: "wrap" }}>
                  <span className={`dir-chip ${FOCO[p.foco][1]}`}>{FOCO[p.foco][0]}</span><b style={{ flex: 1 }}>{p.titulo}</b>
                  {!filhosDe(p.id).some((f) => f.dono_id === raizId)
                    ? <button className="dir-btn" onClick={() => setNovo({ mes, dono_id: raizId, pai_id: p.id, foco: p.foco, empreendimento: p.empreendimento, prioridade: p.prioridade, titulo: p.titulo })}>Desdobrar</button>
                    : <span className="dir-chip c-grn">desdobrado</span>}
                </div>
              ))}
            </div>
          ) : null}
          {novo ? <FormPlano inicial={novo} pessoas={pessoas} raizId={raizId} ehTopo={ehTopo} planosTopo={ehTopo ? meus : doTopo} estoque={estoque} onFechar={() => setNovo(null)} /> : null}
          {isLoading ? <div className="dir-card dir-vazio">Carregando planos…</div> : null}
          {!isLoading && !meus.length && !novo ? (
            <div className="dir-card dir-vazio">
              Nenhum plano em {new Date(mes + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" })}.<br />
              Comece pelo estoque ao lado ou crie um plano para um lançamento.
            </div>
          ) : null}
          {meus.map((p) => (
            <CartaoPlano key={p.id} plano={p} nome={nome} pessoas={pessoas} meuId={meuId}
              filhos={filhosDe(p.id)} />
          ))}
          {soltos.length ? (<>
            <div className="dir-h" style={{ marginTop: 6 }}><b>Planos das superintendências</b><span>sem ligação com um plano da diretoria</span></div>
            {soltos.map((p) => <CartaoPlano key={p.id} plano={p} nome={nome} pessoas={pessoas} meuId={meuId} filhos={[]} />)}
          </>) : null}
        </div>

        <div>
          <div className="dir-card" style={{ padding: 18 }}>
            <div className="dir-h" style={{ marginBottom: 8 }}><b>Estoque para atacar</b><span>Junix · unidades disponíveis agora</span></div>
            <div className="dir-barras">
              {estoque.slice(0, 12).map((e) => {
                const temPlano = planos.some((p) => p.empreendimento === e.empreendimento);
                return (
                  <div key={e.cod_empreendimento} style={{ gridTemplateColumns: "1fr 70px 96px" }}>
                    <span style={{ fontSize: 12.5 }}><b>{e.empreendimento.replace(/^CONDOM[IÍ]NIO\s+/i, "")}</b><br />
                      <span style={{ color: "var(--ink-3)" }}>{e.vendidas} vendidas · {e.em_andamento} em andamento</span></span>
                    <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{e.disponiveis}</span>
                    {temPlano ? <span className="dir-chip c-grn" style={{ justifySelf: "end" }}>tem plano</span>
                      : <button className="dir-btn" style={{ minHeight: 32, padding: "4px 8px", fontSize: 12 }}
                          onClick={() => setNovo({ mes, dono_id: raizId, foco: "estoque", empreendimento: e.empreendimento, prioridade: 2, titulo: `Girar estoque — ${e.empreendimento.replace(/^CONDOM[IÍ]NIO\s+/i, "")}` })}>Criar plano</button>}
                  </div>
                );
              })}
            </div>
            <p className="dir-nota" style={{ marginTop: 8 }}>{estoque.reduce((a, e) => a + e.disponiveis, 0).toLocaleString("pt-BR")} unidades disponíveis em {estoque.length} empreendimentos.</p>
          </div>
          <AcoesAtrasadas planos={planos} nome={nome} />
        </div>
      </div>
    </>
  );
}

function FormPlano({ inicial, pessoas, raizId, ehTopo, planosTopo, estoque, onFechar }: {
  inicial: Partial<Plano>; pessoas: Pessoa[]; raizId: string; ehTopo: boolean; planosTopo: Plano[];
  estoque: { empreendimento: string; disponiveis: number }[]; onFechar: () => void;
}) {
  const { criarPlano } = usePlanoAcoes();
  const [v, setV] = useState<Partial<Plano>>(inicial);
  const set = (k: keyof Plano, x: any) => setV((o) => ({ ...o, [k]: x }));
  const donos = pessoas.filter((p) => p.id === raizId || (ehTopo && p.papel === "SUPERINTENDENT"));
  const salvar = async () => {
    if (!v.titulo?.trim()) { toast.error("Dê um título ao plano"); return; }
    if (await criarPlano({ ...v, titulo: v.titulo.trim() })) onFechar();
  };
  return (
    <div className="dir-card" style={{ padding: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", borderColor: "var(--teal)" }}>
      <label style={{ gridColumn: "1 / -1" }}><span className="dir-lbl">Título</span>
        <input style={inp} value={v.titulo ?? ""} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Lançamento Flow Limão — 20 vendas" autoFocus /></label>
      <label><span className="dir-lbl">Foco</span>
        <select style={inp} value={v.foco} onChange={(e) => set("foco", e.target.value)}>
          <option value="lancamento">Lançamento</option><option value="estoque">Estoque</option><option value="geral">Geral</option></select></label>
      <label><span className="dir-lbl">Empreendimento</span>
        <input style={inp} list="plano-emps" value={v.empreendimento ?? ""} onChange={(e) => set("empreendimento", e.target.value || null)} placeholder="opcional" />
        <datalist id="plano-emps">{estoque.map((e) => <option key={e.empreendimento} value={e.empreendimento}>{e.disponiveis} disponíveis</option>)}</datalist></label>
      <label><span className="dir-lbl">Meta de vendas</span>
        <input style={inp} type="number" min={0} value={v.meta_vendas ?? ""} onChange={(e) => set("meta_vendas", e.target.value === "" ? null : Number(e.target.value))} /></label>
      <label><span className="dir-lbl">Prioridade</span>
        <select style={inp} value={v.prioridade} onChange={(e) => set("prioridade", Number(e.target.value))}>
          <option value={1}>Alta</option><option value={2}>Média</option><option value={3}>Baixa</option></select></label>
      {ehTopo ? (
        <label><span className="dir-lbl">De quem é o plano</span>
          <select style={inp} value={v.dono_id} onChange={(e) => set("dono_id", e.target.value)}>
            {donos.map((p) => <option key={p.id} value={p.id}>{p.id === raizId ? "Diretoria" : `${p.nome} (super)`}</option>)}</select></label>
      ) : null}
      {(v.dono_id !== raizId || !ehTopo) && planosTopo.length ? (
        <label><span className="dir-lbl">Desdobra o plano</span>
          <select style={inp} value={v.pai_id ?? ""} onChange={(e) => set("pai_id", e.target.value || null)}>
            <option value="">— nenhum —</option>{planosTopo.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}</select></label>
      ) : null}
      <label style={{ gridColumn: "1 / -1" }}><span className="dir-lbl">Objetivo / estratégia</span>
        <textarea style={{ ...inp, minHeight: 70 }} value={v.objetivo ?? ""} onChange={(e) => set("objetivo", e.target.value || null)}
          placeholder="O que queremos, como vamos atacar e por quê" /></label>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="dir-btn" onClick={onFechar}>Cancelar</button>
        <button className="dir-btn solid" onClick={salvar}>Criar plano</button>
      </div>
    </div>
  );
}

function CartaoPlano({ plano: p, nome, pessoas, meuId, filhos }: {
  plano: Plano; nome: Map<string, Pessoa>; pessoas: Pessoa[]; meuId: string; filhos: Plano[];
}) {
  const { alterarPlano, criarAcao } = usePlanoAcoes();
  const [nova, setNova] = useState(false);
  const [a, setA] = useState<Partial<Acao>>({});
  const feitas = p.acoes.filter((x) => x.status === "feito").length;
  const atr = p.acoes.filter(atrasada).length;
  const resp = pessoas.filter((x) => x.papel !== "DIRECTOR");
  const salvarAcao = async () => {
    if (!a.titulo?.trim()) { toast.error("Descreva a ação"); return; }
    if (await criarAcao({ ...a, titulo: a.titulo.trim(), plano_id: p.id })) { setA({}); setNova(false); }
  };
  const dono = nome.get(p.dono_id);
  return (
    <div className="dir-card" style={{ padding: 16, opacity: p.status === "concluido" ? 0.7 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`dir-chip ${FOCO[p.foco][1]}`}>{FOCO[p.foco][0]}</span>
        {p.prioridade === 1 ? <span className="dir-chip c-red">prioridade alta</span> : null}
        {dono && dono.papel !== "DIRECTOR" ? <span className="dir-chip c-gray">{dono.nome}</span> : null}
        {p.empreendimento ? <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{p.empreendimento}</span> : null}
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-3)" }}>
          {feitas} de {p.acoes.length} feitas{atr ? <b style={{ color: "var(--red)" }}> · {atr} atrasada{atr > 1 ? "s" : ""}</b> : null}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{p.titulo}{p.meta_vendas ? <span className="mono" style={{ fontSize: 14, color: "var(--teal)", marginLeft: 8 }}>meta {p.meta_vendas} vendas</span> : null}</div>
      {p.objetivo ? <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 4, whiteSpace: "pre-wrap" }}>{p.objetivo}</div> : null}
      {p.acoes.length ? <div className="dir-bar" style={{ marginTop: 10, height: 6 }}><i style={{ width: `${(feitas / p.acoes.length) * 100}%` }} /></div> : null}

      <div style={{ marginTop: 10 }}>
        {p.acoes.map((x) => <LinhaAcao key={x.id} acao={x} nome={nome} resp={resp} meuId={meuId} />)}
      </div>

      {nova ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1.2fr 1fr 1fr", marginTop: 10, alignItems: "end" }} className="plano-form-acao">
          <label><span className="dir-lbl">Ação</span><input style={inp} autoFocus value={a.titulo ?? ""} onChange={(e) => setA({ ...a, titulo: e.target.value })} placeholder="Ex.: Panfletagem no metrô Tatuapé" /></label>
          <label><span className="dir-lbl">Responsável</span>
            <select style={inp} value={a.responsavel_id ?? ""} onChange={(e) => setA({ ...a, responsavel_id: e.target.value || null })}>
              <option value="">—</option>
              {(["SUPERINTENDENT", "MANAGER", "BROKER"] as const).map((r) => (
                <optgroup key={r} label={r === "SUPERINTENDENT" ? "Superintendentes" : r === "MANAGER" ? "Gerentes" : "Corretores"}>
                  {resp.filter((x) => x.papel === r).map((x) => <option key={x.id} value={x.id}>{x.nome}{r !== "SUPERINTENDENT" && x.chefe && nome.get(x.chefe) ? ` · ${nome.get(x.chefe)!.nome}` : ""}</option>)}
                </optgroup>))}
            </select></label>
          <label><span className="dir-lbl">Prazo</span><input style={inp} type="date" min={hojeSP()} value={a.prazo ?? ""} onChange={(e) => setA({ ...a, prazo: e.target.value || null })} /></label>
          <label><span className="dir-lbl">Custo previsto</span><input style={inp} type="number" min={0} value={a.custo_previsto ?? ""} onChange={(e) => setA({ ...a, custo_previsto: e.target.value === "" ? null : Number(e.target.value) })} placeholder="R$" /></label>
          <label style={{ gridColumn: "1 / -1" }}><span className="dir-lbl">Entregável (como saber que foi feito)</span>
            <input style={inp} value={a.entregavel ?? ""} onChange={(e) => setA({ ...a, entregavel: e.target.value || null })} placeholder="Ex.: 3 mil panfletos + 40 leads cadastrados" /></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="dir-btn" onClick={() => { setNova(false); setA({}); }}>Cancelar</button>
            <button className="dir-btn solid" onClick={salvarAcao}>Adicionar ação</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button className="dir-btn" onClick={() => setNova(true)}>+ Ação</button>
          {p.status === "ativo"
            ? <button className="dir-btn" onClick={() => alterarPlano(p.id, { status: "concluido" })}>Concluir plano</button>
            : <button className="dir-btn" onClick={() => alterarPlano(p.id, { status: "ativo" })}>Reabrir</button>}
          <button className="dir-btn" style={{ color: "var(--red)" }} onClick={() => alterarPlano(p.id, { status: "cancelado" })}>Cancelar plano</button>
        </div>
      )}

      {filhos.length ? (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
          <div className="dir-lbl" style={{ marginBottom: 4 }}>Desdobramentos das superintendências</div>
          {filhos.map((f) => <CartaoPlano key={f.id} plano={f} nome={nome} pessoas={pessoas} meuId={meuId} filhos={[]} />)}
        </div>
      ) : null}
    </div>
  );
}

function LinhaAcao({ acao: x, nome, resp, meuId }: { acao: Acao; nome: Map<string, Pessoa>; resp: Pessoa[]; meuId: string }) {
  const { alterarAcao, apagarAcao, cobrar } = usePlanoAcoes();
  const atr = atrasada(x);
  const r = x.responsavel_id ? nome.get(x.responsavel_id) : null;
  const fazCobrar = async (forcar = false) => {
    const res = await cobrar(x.id, forcar);
    if (!res) return;
    if (res.ja_cobrados.length) {
      const j = res.ja_cobrados[0];
      if (window.confirm(`${j.responsavel} já foi cobrado às ${new Date(j.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${j.respondeu ? " e respondeu" : " e ainda não respondeu"}. Cobrar de novo?`)) fazCobrar(true);
      return;
    }
    const c = res.cobrados[0];
    toast[c?.avisado_no_whats ? "success" : "warning"](c?.avisado_no_whats ? `${c.responsavel} cobrado no WhatsApp` : `Não consegui mandar no WhatsApp de ${c?.responsavel ?? "—"} — ficou registrado no painel`);
  };
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line-2)", flexWrap: "wrap" }}>
      <input type="checkbox" aria-label="feito" checked={x.status === "feito"} style={{ width: 18, height: 18, accentColor: "#0E7C7B" }}
        onChange={(e) => alterarAcao(x.id, { status: e.target.checked ? "feito" : "a_fazer" })} />
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontWeight: 600, textDecoration: x.status === "feito" ? "line-through" : undefined }}>{x.titulo}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          {r ? <b style={{ color: "var(--ink-2)" }}>{r.nome}</b> : "sem responsável"}{r ? ` (${PAPEL[r.papel] ?? ""})` : ""}
          {" · "}<span style={{ color: atr ? "var(--red)" : undefined, fontWeight: atr ? 700 : 400 }}>{dm(x.prazo)}{atr ? " · atrasada" : ""}</span>
          {x.custo_previsto ? ` · ${brl(Number(x.custo_previsto))}` : ""}
          {x.entregavel ? ` · entrega: ${x.entregavel}` : ""}
        </div>
      </div>
      <select value={x.status} onChange={(e) => alterarAcao(x.id, { status: e.target.value as StatusAcao })}
        style={{ ...inp, width: "auto", minHeight: 32, padding: "4px 8px", fontSize: 13 }} aria-label="andamento">
        {Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      <select value={x.responsavel_id ?? ""} onChange={(e) => alterarAcao(x.id, { responsavel_id: e.target.value || null })}
        style={{ ...inp, width: "auto", minHeight: 32, padding: "4px 8px", fontSize: 13, maxWidth: 150 }} aria-label="responsável">
        <option value="">— responsável —</option>{resp.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      {atr && x.responsavel_id && x.responsavel_id !== meuId ? <button className="dir-btn solid" style={{ minHeight: 32, padding: "4px 10px" }} onClick={() => fazCobrar()}>Cobrar</button> : null}
      <button className="dir-btn" style={{ minHeight: 32, padding: "4px 8px", color: "var(--ink-3)" }} aria-label="remover ação" title="Remover ação"
        onClick={() => { if (window.confirm(`Remover a ação "${x.titulo}"?`)) apagarAcao(x.id); }}>✕</button>
    </div>
  );
}

function AcoesAtrasadas({ planos, nome }: { planos: Plano[]; nome: Map<string, Pessoa> }) {
  const lista = planos.flatMap((p) => p.acoes.filter(atrasada).map((a) => ({ a, p })));
  const porResp = new Map<string, number>();
  for (const { a } of lista) porResp.set(a.responsavel_id ?? "—", (porResp.get(a.responsavel_id ?? "—") ?? 0) + 1);
  return (
    <div className="dir-card" style={{ padding: 18 }}>
      <div className="dir-h" style={{ marginBottom: 6 }}><b>Atrasadas por responsável</b><span>o Jarvis cobra todo dia às 9h, uma vez</span></div>
      {!lista.length ? <span className="dir-nota">Nenhuma ação atrasada.</span> : (
        <div className="dir-list">
          {[...porResp.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
            <div key={id}><span className="mono" style={{ fontSize: 18, fontWeight: 700, width: 36, color: "var(--red)" }}>{n}</span>
              <span style={{ flex: 1 }}>{nome.get(id)?.nome ?? "sem responsável"}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
