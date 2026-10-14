// Minha Tropa do superintendente: o mesmo Time do painel do gerente (TimeTab), escolhendo a equipe no alto.
// Assim o super vê exatamente o que o gerente vê, sem uma tela com outro jeito.
import { useEffect, useMemo, useState } from "react";
import TimeTab from "@/components/manager-v10/TimeTab";
import { useEscopoSuper } from "./escopo";

export default function Tropa({ superId }: { superId: string }) {
  const { supers, carregando } = useEscopoSuper(superId);
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const [ger, setGer] = useState<string>("");
  useEffect(() => { if (!ger && gerentes.length) setGer(gerentes[0].id); }, [gerentes, ger]);
  return (
    <div className="tr2">
      <style>{`
.mgr10 .tr2{display:grid;gap:var(--s2);padding-top:var(--s3);min-width:0}
.mgr10 .tr2-time{min-width:0;overflow-x:auto}
.mgr10 .tr2-top h1{font-size:28px}
.mgr10 .tr2-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .tr2-chips{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .tr2-chips button{display:grid;text-align:left;gap:1px;padding:9px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:14px;font-weight:600}
.mgr10 .tr2-chips button small{font-size:12px;color:var(--ink-3);font-weight:500}
.mgr10 .tr2-chips button.on{border-color:var(--blue);background:var(--blue-air);color:var(--blue)}
`}</style>
      <header className="tr2-top">
        <h1>Minha Tropa</h1>
        <p>Escolha a equipe: a tela é a mesma que o gerente usa no Time dele.</p>
      </header>
      {carregando ? <p style={{ color: "var(--ink-3)" }}>Carregando as equipes…</p> : (
        <nav className="tr2-chips" aria-label="Equipes">
          {gerentes.map((g) => (
            <button key={g.id} className={ger === g.id ? "on" : ""} onClick={() => setGer(g.id)}>
              {g.nome}<small>{g.corretores} corretores · {g.plantao_hoje} no plantão</small>
            </button>
          ))}
        </nav>
      )}
      {ger ? <div className="tr2-time"><TimeTab key={ger} managerId={ger} /></div> : null}
    </div>
  );
}
