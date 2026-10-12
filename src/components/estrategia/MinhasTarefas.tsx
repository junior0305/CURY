// "Minhas tarefas": os compromissos combinados na Estratégia que estão com o dono do painel.
// "Fiz" pergunta o resultado; "Preciso de mais prazo" muda a data e reinicia os lembretes.
import { useState } from "react";
import { useMinhasTarefas, useCompromissoAcoes, vencido, type Compromisso } from "@/hooks/useCompromissos";
import { hojeSP } from "@/hooks/usePlano";
import "@/styles/tarefas.css";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const quando = (prazo: string) => {
  const hoje = hojeSP();
  const amanha = new Date(Date.now() - 3 * 3600e3 + 864e5).toISOString().slice(0, 10);
  return prazo < hoje ? `venceu ${dm(prazo)}` : prazo === hoje ? "vence hoje" : prazo === amanha ? "vence amanhã" : `vence ${dm(prazo)}`;
};

function Tarefa({ c }: { c: Compromisso }) {
  const ac = useCompromissoAcoes();
  const [modo, setModo] = useState<"" | "fiz" | "prazo">("");
  const [resultado, setResultado] = useState("");
  const [prazo, setPrazo] = useState(c.prazo < hojeSP() ? hojeSP() : c.prazo);
  return (
    <div className={`tar-i${vencido(c) ? " late" : ""}`}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="tar-t">{c.titulo}</div>
        <div className="tar-m">de {c.criador} · {quando(c.prazo)}{c.pediu_prazo_em ? " · prazo já adiado" : ""}</div>
      </div>
      {modo === "fiz" ? (
        <div className="tar-b">
          <input aria-label="O que resultou" placeholder="O que resultou? Ex.: 3 entraram" value={resultado} onChange={(e) => setResultado(e.target.value)} />
          <button className="solid" onClick={() => ac.alterar(c.id, { status: "feito", resultado: resultado.trim() || null }, "Feito. Quem combinou com você vai ver.")}>Confirmar</button>
          <button onClick={() => setModo("")}>Voltar</button>
        </div>
      ) : modo === "prazo" ? (
        <div className="tar-b">
          <input type="date" aria-label="Nova data" min={hojeSP()} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          <button className="solid" onClick={() => ac.alterar(c.id, { prazo, pediu_prazo_em: new Date().toISOString(), avisos: [] }, `Novo prazo: ${dm(prazo)}. ${c.criador} vai ver.`)}>Salvar</button>
          <button onClick={() => setModo("")}>Voltar</button>
        </div>
      ) : (
        <div className="tar-b">
          <button className="solid" onClick={() => setModo("fiz")}>Fiz</button>
          <button onClick={() => setModo("prazo")}>Preciso de mais prazo</button>
        </div>
      )}
    </div>
  );
}

export default function MinhasTarefas({ donoId, nome }: { donoId: string | undefined; nome?: string }) {
  const { data } = useMinhasTarefas(donoId);
  if (!data?.length) return null;
  const atrasadas = data.filter(vencido).length;
  return (
    <section className="tar" aria-label="Minhas tarefas">
      <div className="tar-h"><b>{nome ? `Tarefas de ${nome}` : "Minhas tarefas"} ({data.length})</b>
        <span>{atrasadas ? `${atrasadas} atrasada${atrasadas > 1 ? "s" : ""} · ` : ""}combinadas na reunião; o Comandra lembra no WhatsApp</span></div>
      {data.map((c) => <Tarefa key={c.id} c={c} />)}
    </section>
  );
}
