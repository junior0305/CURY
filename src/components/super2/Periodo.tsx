// Seletor de período único das telas do superintendente: Hoje · Ontem · 7 dias · 30 dias · Escolher datas.
// Fica na URL (?per=7d, ou ?per=datas&de=AAAA-MM-DD&ate=AAAA-MM-DD), então trocar de aba mantém o período.
import { useSearchParams } from "react-router-dom";

export type ChavePeriodo = "hoje" | "ontem" | "7d" | "30d" | "datas";
export const diaSP = (desloc = 0) => new Date(Date.now() - 3 * 3600e3 - desloc * 86400e3).toISOString().slice(0, 10);
const ROTULO: [ChavePeriodo, string][] = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["datas", "Escolher datas"]];

export function usePeriodoSuper(padrao: ChavePeriodo = "7d") {
  const [params, setParams] = useSearchParams();
  const per = (params.get("per") as ChavePeriodo) || padrao;
  const deP = params.get("de") || diaSP(6), ateP = params.get("ate") || diaSP(0);
  const janela = per === "hoje" ? { de: diaSP(0), ate: diaSP(0) } : per === "ontem" ? { de: diaSP(1), ate: diaSP(1) }
    : per === "7d" ? { de: diaSP(6), ate: diaSP(0) } : per === "30d" ? { de: diaSP(29), ate: diaSP(0) } : { de: deP, ate: ateP };
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };
  // para os números que só sabem contar "os últimos N dias" (rollup, consolidado)
  const dias = Math.max(1, Math.round((new Date(diaSP(0)).getTime() - new Date(janela.de).getTime()) / 86400e3) + 1);
  const texto = per === "hoje" ? "hoje" : per === "ontem" ? "ontem" : per === "7d" ? "últimos 7 dias" : per === "30d" ? "últimos 30 dias"
    : `${janela.de.split("-").reverse().join("/")} a ${janela.ate.split("-").reverse().join("/")}`;
  return {
    per, janela, dias, texto,
    setPer: (k: ChavePeriodo) => set("per", k),
    setDe: (v: string) => set("de", v), setAte: (v: string) => set("ate", v),
    iniUTC: `${janela.de}T03:00:00Z`,
    fimUTC: new Date(new Date(`${janela.ate}T03:00:00Z`).getTime() + 86400e3).toISOString(),
  };
}

export function SeletorPeriodoSuper({ p, opcoes }: { p: ReturnType<typeof usePeriodoSuper>; opcoes?: ChavePeriodo[] }) {
  const lista = ROTULO.filter(([k]) => !opcoes || opcoes.includes(k));
  return (
    <div className="sps">
      <style>{`
.mgr10 .sps{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.mgr10 .sps-pills{display:flex;gap:2px;background:var(--sunk);border-radius:10px;padding:3px;flex-wrap:wrap}
.mgr10 .sps-pills button{font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;color:var(--ink-3)}
.mgr10 .sps-pills button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.08)}
.mgr10 .sps-datas{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-2)}
.mgr10 .sps-datas input{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
`}</style>
      <div className="sps-pills">{lista.map(([k, r]) => <button key={k} className={p.per === k ? "on" : ""} onClick={() => p.setPer(k)}>{r}</button>)}</div>
      {p.per === "datas" ? (
        <span className="sps-datas">
          <input type="date" value={p.janela.de} max={p.janela.ate} onChange={(e) => p.setDe(e.target.value)} aria-label="De" />
          até
          <input type="date" value={p.janela.ate} min={p.janela.de} max={diaSP(0)} onChange={(e) => p.setAte(e.target.value)} aria-label="Até" />
        </span>
      ) : null}
    </div>
  );
}
