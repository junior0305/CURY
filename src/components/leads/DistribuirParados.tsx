// Distribuir leads parados (sem corretor) de uma página entre corretores ativos.
// Grupos inteligentes (quem loga / plantão / semana / escolher na mão), divisão
// equilibrada pela carteira ou igual, prévia da divisão e o que fazer com os próximos.
// Dado real: RPC parados_corretores; ação: RPC distribuir_parados. Reaproveita a casca .apg- do "Ativar".
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as any;
type Cor = { id: string; nome: string; equipe: string; carteira: number; loga: boolean; plantao: boolean; semana: boolean; ghost: boolean };
type Pag = { page_id: string; page_name: string; dono_email: string; represados: number };

const ini = (n: string) => (n || "?").trim().slice(0, 2).toUpperCase();

// mesma divisão gulosa da RPC, pra prévia bater com o resultado
function planejar(lista: Cor[], total: number, modo: "eq" | "ig") {
  const g = lista.map((c) => ({ ...c, rec: 0 }));
  if (!g.length) return g;
  for (let k = 0; k < total; k++) {
    let best = 0;
    for (let j = 1; j < g.length; j++) {
      const vb = modo === "ig" ? g[best].rec : g[best].carteira + g[best].rec;
      const vj = modo === "ig" ? g[j].rec : g[j].carteira + g[j].rec;
      if (vj < vb) best = j;
    }
    g[best].rec++;
  }
  return g;
}

export default function DistribuirParados({ pag, onFechar, onPronto }: { pag: Pag; onFechar: () => void; onPronto: () => void }) {
  const [cors, setCors] = useState<Cor[]>([]);
  const [preset, setPreset] = useState<"logam" | "plantao" | "semana" | "mao">("logam");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"eq" | "ig">("eq");
  const [futuro, setFuturo] = useState<"roleta" | "todos" | "nada">("roleta");
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await sb.rpc("parados_corretores", { p_page_id: pag.page_id });
      if (error) { toast.error("Não consegui ler os corretores: " + error.message); return; }
      const cs = (data ?? []) as Cor[];
      setCors(cs);
      setSel(new Set(cs.filter((c) => !c.ghost).map((c) => c.id))); // começa com todos os ativos
    })();
  }, [pag.page_id]);

  const ativos = useMemo(() => cors.filter((c) => !c.ghost), [cors]);
  const nunca = cors.filter((c) => c.ghost).length;

  const grupoN = { logam: ativos.filter((c) => c.loga).length, plantao: ativos.filter((c) => c.plantao).length, semana: ativos.filter((c) => c.semana).length };

  const alvo = useMemo(() => {
    if (preset === "logam") return ativos.filter((c) => c.loga);
    if (preset === "plantao") return ativos.filter((c) => c.plantao);
    if (preset === "semana") return ativos.filter((c) => c.semana);
    return cors.filter((c) => sel.has(c.id));
  }, [preset, ativos, cors, sel]);

  const plano = useMemo(() => planejar(alvo, pag.represados, modo), [alvo, pag.represados, modo]);
  const brokerIds = alvo.map((c) => c.id);

  // agrupa por equipe pro picker
  const equipes = useMemo(() => {
    const m = new Map<string, Cor[]>();
    cors.filter((c) => (c.nome + " " + c.equipe).toLowerCase().includes(busca.toLowerCase()))
      .forEach((c) => { if (!m.has(c.equipe)) m.set(c.equipe, []); m.get(c.equipe)!.push(c); });
    return [...m.entries()];
  }, [cors, busca]);

  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function marcarEquipe(cs: Cor[], on: boolean) { setSel((s) => { const n = new Set(s); cs.forEach((c) => { if (c.ghost) return; on ? n.add(c.id) : n.delete(c.id); }); return n; }); }
  function marcarTodos(on: boolean) { setSel(on ? new Set(ativos.map((c) => c.id)) : new Set()); }

  async function confirmar() {
    if (!brokerIds.length) { toast.error("Escolha quem recebe."); return; }
    setSalvando(true);
    const { data, error } = await sb.rpc("distribuir_parados", { p_page_id: pag.page_id, p_broker_ids: brokerIds, p_modo: modo, p_futuro: futuro });
    setSalvando(false);
    if (error) { toast.error("Não consegui distribuir: " + error.message); return; }
    const r = data ?? {};
    toast.success(`${r.distribuidos ?? pag.represados} leads distribuídos entre ${r.corretores ?? brokerIds.length} corretores.`);
    onPronto();
  }

  const somaCart = plano.reduce((s, c) => s + c.carteira, 0);

  return (
    <div className="apg-ov" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <style>{CSS}</style>
      <div className="apg-card dp">
        <div className="apg-top">
          <div><h2>Distribuir leads parados</h2><div className="pg">📄 {pag.page_name}</div></div>
          <button className="x" onClick={onFechar}>✕</button>
        </div>

        <div className="dp-body">
          {/* resumo */}
          <div className="dp-bl dp-topo">
            <div className="dp-big">{pag.represados}</div>
            <div className="dp-dsc"><b>{pag.represados} leads sem corretor</b> nesta página, parados esperando quem atenda.</div>
          </div>

          {/* passo 1 */}
          <div className="dp-bl">
            <p className="dp-passo"><i>1</i> Para quem vai?</p>
            {([["logam", "Quem entra no sistema", "logaram nos últimos 30 dias", grupoN.logam],
               ["plantao", "Quem bate plantão", "check-in nos últimos 30 dias", grupoN.plantao],
               ["semana", "Mais ativos agora", "plantão na última semana", grupoN.semana],
               ["mao", "Escolher na mão", "marcar corretor por corretor", preset === "mao" ? sel.size : "—"]] as const).map(([k, nm, de, n]) => (
              <div key={k} className={`dp-opt${preset === k ? " on" : ""}`} onClick={() => setPreset(k as any)}>
                <span className="dp-dot" /><div><div className="dp-nm">{nm}</div><div className="dp-de">{de}</div></div><span className="dp-ct">{n as any}</span>
              </div>
            ))}
            {nunca > 0 && <div className="dp-aviso">⚠️ <span><b>{nunca} nunca entraram no sistema</b> — não dá pra marcar (contas que não atendem).</span></div>}

            {preset === "mao" && (
              <div className="dp-pick">
                <div className="dp-pbar">
                  <input placeholder="Buscar corretor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  <button className="dp-lnk" onClick={() => marcarTodos(true)}>Marcar ativos</button>
                  <button className="dp-lnk" onClick={() => marcarTodos(false)}>Limpar</button>
                  <span className="dp-selc">{sel.size} marcados</span>
                </div>
                <div className="dp-pscroll">
                  {equipes.map(([eq, cs]) => {
                    const at = cs.filter((c) => !c.ghost);
                    const todosOn = at.length > 0 && at.every((c) => sel.has(c.id));
                    return (
                      <div key={eq}>
                        <div className="dp-grphd"><span>{eq} · {at.length}</span>
                          <button className="dp-lnk" onClick={() => marcarEquipe(cs, !todosOn)}>{todosOn ? "desmarcar" : "marcar equipe"}</button></div>
                        <div className="dp-cks">
                          {cs.map((c) => (
                            <label key={c.id} className={`dp-ck${sel.has(c.id) ? " on" : ""}${c.ghost ? " ghost" : ""}`}
                              onClick={(e) => { e.preventDefault(); if (!c.ghost) toggle(c.id); }}>
                              <span className="dp-box" />{c.nome} <span className="dp-cc">{c.ghost ? "nunca entrou" : c.carteira + " leads"}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* passo 2 */}
          <div className="dp-bl">
            <p className="dp-passo"><i>2</i> Como dividir?</p>
            <div className="dp-seg">
              <button className={modo === "eq" ? "on" : ""} onClick={() => setModo("eq")}>Equilibrar pela carteira</button>
              <button className={modo === "ig" ? "on" : ""} onClick={() => setModo("ig")}>Igual para todos</button>
            </div>
            <div className="dp-segd">{modo === "eq" ? <>Quem tem <b>menos lead ativo</b> recebe mais — todos ficam com carga parecida.</> : <>Cada um recebe <b>a mesma quantidade</b>, sem olhar quem já está cheio.</>}</div>
          </div>

          {/* prévia */}
          <div className="dp-bl">
            <div className="dp-pvh"><b>Prévia da divisão</b><span>{pag.represados} entre {plano.length} corretores</span></div>
            <table className="dp-tab">
              <thead><tr><th>Corretor</th><th className="n">Carteira</th><th className="n">Recebe</th><th className="n">Fica</th></tr></thead>
              <tbody>
                {plano.slice(0, 8).map((c) => (
                  <tr key={c.id}><td><span className="dp-av">{ini(c.nome)}</span>{c.nome}</td><td className="n">{c.carteira}</td><td className="n rec">+{c.rec}</td><td className="n">{c.carteira + c.rec}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className="tot"><td>{plano.length} corretores</td><td className="n">{somaCart}</td><td className="n">{pag.represados}</td><td className="n">{somaCart + pag.represados}</td></tr></tfoot>
            </table>
            {plano.length > 8 && <p className="dp-mais">… e mais {plano.length - 8} corretores.</p>}
          </div>

          {/* passo 3 */}
          <div className="dp-bl">
            <p className="dp-passo"><i>3</i> E os próximos leads?</p>
            {([["roleta", "Roleta desses corretores", "os novos entram no rodízio deles (respeita o plantão)"],
               ["todos", "Todos da equipe", "todo corretor ativo recebe em rodízio"],
               ["nada", "Deixar como está", "só distribuo os parados agora"]] as const).map(([k, nm, de]) => (
              <div key={k} className={`dp-opt${futuro === k ? " on" : ""}`} onClick={() => setFuturo(k as any)}>
                <span className="dp-dot" /><div><div className="dp-nm">{nm}</div><div className="dp-de">{de}</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="apg-foot">
          <button className="apg-act" disabled={salvando || !brokerIds.length} onClick={confirmar}>
            {salvando ? "Distribuindo…" : !brokerIds.length ? "Escolha quem recebe" : `Distribuir os ${pag.represados} entre ${brokerIds.length} corretores`}
          </button>
          <p className="dp-mut">Nada é enviado ao cliente · cada corretor é avisado · dá pra desfazer pelo histórico do lead.</p>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.apg-card.dp{width:min(560px,100%)}
.dp-body{padding:16px 20px;display:flex;flex-direction:column;gap:11px}
.dp-bl{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:13px 14px}
.dp-passo{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:0 0 9px;display:flex;align-items:center;gap:7px}
.dp-passo i{width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-style:normal;font-size:10.5px;display:inline-flex;align-items:center;justify-content:center;font-weight:800}
.dp-topo{display:flex;align-items:center;gap:13px}
.dp-big{font-size:32px;font-weight:900;line-height:1;color:var(--warn)}
.dp-dsc{font-size:13px;color:var(--ink-2)} .dp-dsc b{color:var(--ink)}
.dp-opt{display:flex;align-items:center;gap:11px;border:1.5px solid var(--line);border-radius:11px;padding:9px 12px;cursor:pointer;margin-bottom:7px;transition:.12s;background:var(--surface)}
.dp-opt:hover{border-color:var(--accent)} .dp-opt.on{border-color:var(--accent);background:var(--accent-soft)}
.dp-dot{width:17px;height:17px;border-radius:50%;border:2px solid var(--ink-3);flex:none;position:relative}
.dp-opt.on .dp-dot{border-color:var(--accent)} .dp-opt.on .dp-dot::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--accent)}
.dp-nm{font-weight:700;font-size:13.5px;color:var(--ink)} .dp-de{font-size:11.5px;color:var(--ink-2)}
.dp-ct{margin-left:auto;font-weight:800;font-size:14px;background:var(--surface-2);color:var(--ink);border-radius:8px;padding:2px 10px}
.dp-opt.on .dp-ct{background:var(--accent);color:#fff}
.dp-aviso{font-size:12px;color:var(--warn);background:var(--warn-soft);border-radius:9px;padding:7px 10px;margin-top:3px;display:flex;gap:6px;align-items:flex-start}
.dp-pick{margin-top:11px;border-top:1px solid var(--line-2);padding-top:11px}
.dp-pbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px}
.dp-pbar input{flex:1;min-width:120px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:8px 10px}
.dp-lnk{border:0;background:none;color:var(--accent);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:4px 2px}
.dp-selc{font-size:12px;font-weight:800;background:var(--accent);color:#fff;border-radius:999px;padding:3px 10px;white-space:nowrap}
.dp-pscroll{max-height:230px;overflow-y:auto}
.dp-grphd{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-3);margin:9px 2px 5px}
.dp-cks{display:flex;flex-wrap:wrap;gap:6px}
.dp-ck{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:9px;padding:6px 9px;cursor:pointer;font-size:12.5px;color:var(--ink)}
.dp-ck.on{border-color:var(--accent);background:var(--accent-soft)}
.dp-box{width:15px;height:15px;border-radius:4px;border:2px solid var(--ink-3);position:relative;flex:none}
.dp-ck.on .dp-box{border-color:var(--accent);background:var(--accent)}
.dp-ck.on .dp-box::after{content:"✓";color:#fff;font-size:10px;line-height:1;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900}
.dp-cc{color:var(--ink-2);font-size:11px;font-weight:700}
.dp-ck.ghost{opacity:.45;cursor:not-allowed;text-decoration:line-through}
.dp-seg{display:inline-flex;background:var(--surface-2);border-radius:10px;padding:3px;gap:3px;flex-wrap:wrap}
.dp-seg button{border:0;background:transparent;color:var(--ink-2);font:inherit;font-weight:700;font-size:12.5px;padding:7px 12px;border-radius:8px;cursor:pointer}
.dp-seg button.on{background:var(--surface);color:var(--ink);box-shadow:var(--sh)}
.dp-segd{font-size:12px;color:var(--ink-2);margin-top:8px}
.dp-pvh{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.dp-pvh b{font-size:13px;color:var(--ink)} .dp-pvh span{font-size:12px;color:var(--ink-2)}
.dp-tab{width:100%;border-collapse:collapse;font-size:13px}
.dp-tab th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3);font-weight:800;padding:5px 7px;border-bottom:1px solid var(--line)}
.dp-tab td{padding:7px;border-bottom:1px solid var(--line-2);color:var(--ink)}
.dp-tab td.n,.dp-tab th.n{text-align:right;font-variant-numeric:tabular-nums}
.dp-tab .rec{font-weight:800;color:var(--good)}
.dp-av{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:800;align-items:center;justify-content:center;margin-right:7px}
.dp-tab .tot td{border-top:2px solid var(--line);border-bottom:0;font-weight:800;padding-top:8px}
.dp-mais{color:var(--ink-2);font-size:12px;padding:7px 2px 0;margin:0}
.dp-mut{font-size:11.5px;color:var(--ink-3);text-align:center;margin:7px 0 0}
`;
