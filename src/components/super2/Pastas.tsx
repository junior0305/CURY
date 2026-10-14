// Pastas do superintendente: o painel de Pastas da diretoria, só com as pastas das equipes dele
// (ligadas pelo corretor no Comandra — ver escopo.ts), filtradas pela data de cadastro no Junix no
// período do seletor único, e a lista completa com filtro por situação e por gerente.
// A cobrança vai para o gerente.
import { useMemo, useState } from "react";
import PastasPainel from "@/components/diretoria/PastasPainel";
import { lerPastas, ROTULO_ETAPA } from "@/components/diretoria/pastasAnalise";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper, SeletorPeriodoSuper } from "./Periodo";
import "@/styles/diretoria.css";

type Situacao = "todas" | "vivas" | "paradas" | "reprovadas" | "mortas";
const titulo = (t: string | null | undefined) => (t ?? "—").replace(/\s+BN\s*$/i, "").replace(/^Condom[ií]nio\s+/i, "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default function PastasDoSuper({ superId }: { superId: string }) {
  const { diretorId, supers, pastas, carregando } = useEscopoSuper(superId);
  const p = usePeriodoSuper("30d");
  const [todoPeriodo, setTodoPeriodo] = useState(false);
  const [sit, setSit] = useState<Situacao>("todas");
  const [ger, setGer] = useState("todos");

  const doPeriodo = useMemo(() => todoPeriodo ? pastas : pastas.filter((x) => {
    const d = String(x.cadastrada_em || "").slice(0, 10);
    return d && d >= p.janela.de && d <= p.janela.ate;
  }), [pastas, todoPeriodo, p.janela.de, p.janela.ate]);

  const lidas = useMemo(() => lerPastas(doPeriodo), [doPeriodo]);
  const gerentes = useMemo(() => [...new Set(lidas.map((x) => x.gerente || "—"))].sort(), [lidas]);
  const situacao = (x: any): Exclude<Situacao, "todas"> => x.reprovada ? "reprovadas" : !x.viva ? "mortas" : (x.dias ?? 0) >= 7 ? "paradas" : "vivas";
  const conta = (s: Exclude<Situacao, "todas">) => lidas.filter((x) => situacao(x) === s).length;
  const lista = lidas.filter((x) => (sit === "todas" || situacao(x) === sit) && (ger === "todos" || (x.gerente || "—") === ger))
    .sort((a, b) => (a.viva === b.viva ? (b.dias ?? 0) - (a.dias ?? 0) : a.viva ? -1 : 1));
  const ROT_SIT: Record<string, string> = { vivas: "viva", paradas: "parada 7d+", reprovadas: "reprovada", mortas: "sem chance (60d+, duplicada ou cancelada)" };

  return (
    <div className="ps2">
      <style>{CSS}</style>
      <header className="ps2-top">
        <div>
          <h1>Pastas</h1>
          <p>Pastas do Junix dos corretores das suas equipes · {todoPeriodo ? "todas, desde o início" : `cadastradas ${p.texto}`}</p>
        </div>
        <div className="ps2-per">
          {!todoPeriodo ? <SeletorPeriodoSuper p={p} /> : null}
          <label className="ps2-chk"><input type="checkbox" checked={todoPeriodo} onChange={(e) => setTodoPeriodo(e.target.checked)} /> Ver todas, sem filtro de data</label>
        </div>
      </header>

      {carregando || !diretorId ? <div className="ps2-card ps2-vazio">Lendo as pastas do Junix…</div>
        : !pastas.length ? <div className="ps2-card ps2-vazio">Nenhuma pasta no Junix é de corretor das suas equipes. Se algum corretor tem pasta e não aparece aqui, o nome dele no Junix está diferente do cadastro no Comandra.</div>
        : (
          <>
            <div className="dir ps2-dir">
              {doPeriodo.length ? <PastasPainel diretorId={diretorId} supers={supers} pastas={doPeriodo} modoSuper />
                : <div className="dir-card dir-vazio">Nenhuma pasta cadastrada {p.texto}. {pastas.length} pasta(s) das suas equipes no total: marque "Ver todas".</div>}
            </div>

            <section className="ps2-sec">
              <h2>Todas as pastas {todoPeriodo ? "" : `cadastradas ${p.texto}`} <small>{lidas.length} pasta(s)</small></h2>
              <div className="ps2-filtros">
                {(["todas", "vivas", "paradas", "reprovadas", "mortas"] as Situacao[]).map((s) => (
                  <button key={s} className={sit === s ? "on" : ""} onClick={() => setSit(s)}>
                    {s === "todas" ? "Todas" : s === "vivas" ? "Vivas" : s === "paradas" ? "Paradas 7d+" : s === "reprovadas" ? "Reprovadas" : "Sem chance"}
                    <span>{s === "todas" ? lidas.length : conta(s)}</span>
                  </button>
                ))}
                <select value={ger} onChange={(e) => setGer(e.target.value)} aria-label="Gerente">
                  <option value="todos">Todos os gerentes</option>
                  {gerentes.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="ps2-card ps2-tw">
                <table>
                  <thead><tr><th>Cliente</th><th>Empreendimento</th><th>Etapa</th><th>Corretor</th><th>Gerente</th><th>Na etapa</th><th>Cadastrada</th><th>Situação</th></tr></thead>
                  <tbody>
                    {lista.map((x) => {
                      const s = situacao(x);
                      return (
                        <tr key={x.proposta_id}>
                          <td><b>{titulo(x.cliente)}</b></td>
                          <td>{titulo(x.empreendimento)}</td>
                          <td>{(ROTULO_ETAPA as any)[x.etapa ?? ""] ?? titulo(x.etapa)}</td>
                          <td>{titulo(x.corretor)}</td>
                          <td>{x.gerente}</td>
                          <td className={(x.dias ?? 0) >= 7 ? "ps2-ruim" : ""}>{x.dias ?? "—"} dias</td>
                          <td>{x.cadastrada_em ? String(x.cadastrada_em).slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                          <td><em className={s}>{ROT_SIT[s]}</em></td>
                        </tr>
                      );
                    })}
                    {!lista.length ? <tr><td colSpan={8} className="ps2-vazio">Nenhuma pasta com esse filtro.</td></tr> : null}
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
.mgr10 .ps2{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .ps2-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .ps2-top h1{font-size:28px}
.mgr10 .ps2-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .ps2-per{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.mgr10 .ps2-chk{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-2)}
.mgr10 .ps2-dir{min-height:0;background:transparent;display:flex;flex-direction:column;gap:20px;padding:0}
.mgr10 .ps2-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;min-width:0}
.mgr10 .ps2-vazio{color:var(--ink-3);font-size:14px}
.mgr10 .ps2-sec{display:grid;gap:10px}
.mgr10 .ps2-sec h2{font-size:17px}
.mgr10 .ps2-sec h2 small{font-size:12.5px;color:var(--ink-3);font-weight:500;margin-left:8px}
.mgr10 .ps2-filtros{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mgr10 .ps2-filtros button{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink-2)}
.mgr10 .ps2-filtros button span{font-size:11.5px;background:var(--sunk);padding:0 6px;border-radius:999px}
.mgr10 .ps2-filtros button.on{border-color:var(--blue);background:var(--blue-air);color:var(--blue)}
.mgr10 .ps2-filtros select{font:inherit;font-size:13px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:6px 10px;margin-left:auto}
.mgr10 .ps2-tw{padding:0;overflow-x:auto}
.mgr10 .ps2-tw table{border-collapse:collapse;width:100%;font-size:13.5px}
.mgr10 .ps2-tw th,.mgr10 .ps2-tw td{padding:10px 12px;text-align:left;border-top:1px solid var(--hair);white-space:nowrap}
.mgr10 .ps2-tw thead th{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk);border-top:0}
.mgr10 .ps2-ruim{color:var(--red);font-weight:700}
.mgr10 .ps2 em{font-style:normal;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.mgr10 .ps2 em.vivas{color:var(--good);background:var(--good-air)} .mgr10 .ps2 em.paradas{color:var(--amber);background:var(--amber-air)}
.mgr10 .ps2 em.reprovadas{color:var(--red);background:var(--red-air)} .mgr10 .ps2 em.mortas{color:var(--ink-3);background:var(--sunk)}
`;
