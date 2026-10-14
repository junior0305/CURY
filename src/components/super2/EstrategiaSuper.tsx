// Estratégia do super: a mesma tela do diretor (Sala de Guerra, Conselho & 5 perguntas, Minhas estratégias),
// um nível abaixo — cada gerente dele ocupa o lugar que uma superintendência ocupa na tela do diretor
// (meta, verba, pastas, time e compromissos por gerente). No topo, a meta herdada da diretoria + a Superação.
// "Plano, verba e gastos" continua como aba própria (verba da diretoria e recursos próprios das equipes).
import { useMemo, useState } from "react";
import Estrategia from "@/components/estrategia/Estrategia";
import { useAuth } from "@/components/AuthProvider";
import type { SuperDiretoria } from "@/hooks/useDiretoria";
import { useEscopoSuper } from "./escopo";
import SalaDeGuerra from "./SalaDeGuerra";
import MetaSuperacao from "./MetaSuperacao";
import Vocabulario from "./Vocabulario";
import "@/styles/diretoria.css";

type Visao = "estrategia" | "plano";

export default function EstrategiaSuper({ superId, superNome, abaInicial }: { superId: string; superNome: string; abaInicial?: "plano" | "verba" | "gastos" }) {
  const { role } = useAuth();
  const [visao, setVisao] = useState<Visao>(abaInicial ? "plano" : "estrategia");
  const { diretorId, supers, pastas } = useEscopoSuper(superId);
  // admin/diretor abrindo o /super enxerga a diretoria inteira: aí é a tela do diretor como ela é
  const comoDiretor = (role === "ADMIN" || role === "DIRECTOR") && superId === diretorId;

  // cada gerente vira uma "superintendência" de uma equipe só
  const gerentesComoSupers: SuperDiretoria[] = useMemo(() => {
    const meu = supers.find((s) => s.id === superId) ?? (supers.length === 1 ? supers[0] : undefined);
    if (!meu) return [];
    return meu.gerentes.filter((g) => !/revisor/i.test(g.nome)).map((g) => ({
      id: g.id, nome: g.nome, tokens: [g.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "")],
      gerentes: [g], logadosHoje: meu.logadosHoje,
      plantaoSemLogin: meu.plantaoSemLogin[g.id] ? { [g.id]: meu.plantaoSemLogin[g.id] } : {},
    }));
  }, [supers, superId]);

  return (
    <div className="dir s2-est" style={{ minHeight: 0, background: "transparent" }}>
      <style>{CSS}</style>
      <div className="s2-est-top">
        <div className="dir-per" style={{ background: "#E2E8F0", padding: 4 }}>
          <button className={visao === "estrategia" ? "on" : ""} onClick={() => setVisao("estrategia")}>🎯 Estratégia</button>
          <button className={visao === "plano" ? "on" : ""} onClick={() => setVisao("plano")}>💰 Plano, verba e gastos</button>
        </div>
        <span>{comoDiretor ? "Visão da diretoria inteira" : `Superintendência · ${superNome}`}</span>
      </div>

      {visao === "plano" ? (
        <SalaDeGuerra superId={superId} superNome={superNome} abaInicial={abaInicial} />
      ) : comoDiretor ? (
        diretorId ? <Estrategia diretorId={diretorId} supers={supers} pastas={pastas} /> : <div className="dir-vazio">Carregando…</div>
      ) : (
        <>
          <MetaSuperacao superId={superId} />
          {gerentesComoSupers.length ? (
            <Vocabulario>
              <Estrategia diretorId={superId} supers={gerentesComoSupers} pastas={pastas} />
            </Vocabulario>
          ) : <div className="dir-card dir-vazio" style={{ padding: 24 }}>Carregando as equipes da superintendência…</div>}
        </>
      )}
    </div>
  );
}

const CSS = `
.dir.s2-est{font-family:Archivo,system-ui,sans-serif}
.dir .s2-est-top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.dir .s2-est-top>span{font-size:12.5px;color:var(--ink-3);font-weight:500}
.dir .s2-est-top .dir-per button{font-weight:700}
`;
