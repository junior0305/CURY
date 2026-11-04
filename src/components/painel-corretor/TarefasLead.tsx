// Tarefa livre do corretor: ação, data e descrição. A mesma peça serve o painel do celular (PainelCorretor)
// e o do computador (CorretorPainel), cada um com as próprias classes. A gestão lê no Histórico do lead (lead_linha_tempo).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addLeadNote } from "@/integrations/supabase/atender";
import { setLeadReturnDate } from "@/integrations/supabase/leads";
import { fetchLeadOpenTasks, fetchOpenTasks, createTask, markTaskDone } from "@/integrations/supabase/tasks";
import type { Task, TaskType } from "@/types/task";
import { dataCurta, horaSP } from "./util";

const ACOES: { t: string; tipo: TaskType }[] = [
  { t: "Ligar", tipo: "CALL" }, { t: "WhatsApp", tipo: "WHATSAPP_TEXT" }, { t: "Visita", tipo: "SCHEDULE_VISIT" },
  { t: "Documentos", tipo: "DOCS_REQUEST" }, { t: "Outra", tipo: "FOLLOW_UP" },
];

export type ClassesTarefa = { titulo: string; meta: string; btn: string; pri: string; inp: string };

const fila = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const;

export function TarefasLead({ leadId, nextAction, userId, onMudou, c }: {
  leadId: string; nextAction: string | null | undefined; userId: string; onMudou: () => void; c: ClassesTarefa;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState(""); const [data, setData] = useState(""); const [desc, setDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { data: tarefas = [] } = useQuery<Task[]>({ queryKey: ["pcTarefas", leadId], queryFn: () => fetchLeadOpenTasks(leadId) });
  const mudou = () => { qc.invalidateQueries({ queryKey: ["pcTarefas"] }); onMudou(); };

  const criar = async () => {
    const a = ACOES.find((x) => x.t === acao);
    const quando = data ? new Date(data) : null;
    if (!a || !quando || !desc.trim()) { toast.error("Escolha a ação, a data e escreva o que ficou de fazer."); return; }
    if (quando.getTime() < Date.now()) { toast.error("Escolha uma data futura."); return; }
    setSalvando(true);
    try {
      const iso = quando.toISOString();
      await createTask({ userId, leadId, type: a.tipo, title: a.t, notes: desc.trim(), dueAt: iso });
      await addLeadNote(leadId, userId, `Tarefa · ${a.t} para ${dataCurta(iso)} ${horaSP(iso)}: ${desc.trim()}`).catch(() => {});
      // A tarefa mais próxima é o que faz o cliente voltar para a fila do corretor.
      const atual = nextAction ? Date.parse(nextAction) : null;
      if (atual === null || atual < Date.now() || quando.getTime() < atual) await setLeadReturnDate(leadId, iso).catch(() => {});
      setAcao(""); setData(""); setDesc(""); setAberto(false); mudou(); toast.success("Tarefa agendada");
    } catch { toast.error("Não consegui agendar a tarefa"); }
    finally { setSalvando(false); }
  };
  const concluir = async (t: Task) => {
    try {
      await markTaskDone(t.id);
      await addLeadNote(leadId, userId, `Tarefa · ${t.title} concluída (era para ${dataCurta(t.dueAt)} ${horaSP(t.dueAt)})`).catch(() => {});
      // Só mexe no retorno se ele era desta tarefa; um retorno combinado à parte continua valendo.
      if (nextAction && Date.parse(nextAction) === Date.parse(t.dueAt)) {
        const prox = tarefas.find((x) => x.id !== t.id)?.dueAt ?? null;
        await supabase.from("leads").update({ next_action_date: prox }).eq("id", leadId);
      }
      mudou(); toast.success("Tarefa concluída");
    } catch { toast.error("Não consegui concluir a tarefa"); }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className={c.titulo}>Tarefas{tarefas.length ? ` · ${tarefas.length}` : ""}</span>
      {tarefas.map((t) => (
        <div key={t.id} style={{ ...fila, justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span className={c.meta} style={{ flex: 1 }}><b>{t.title}</b> · {dataCurta(t.dueAt)} {horaSP(t.dueAt)}{Date.parse(t.dueAt) < Date.now() ? " · atrasada" : ""}<br />{t.notes}</span>
          <button className={c.btn} type="button" onClick={() => concluir(t)}>Concluir</button>
        </div>
      ))}
      {!aberto ? <div><button className={c.btn} type="button" onClick={() => setAberto(true)}>📌 Agendar tarefa</button></div> : <>
        <div style={fila}>
          <select className={c.inp} style={{ flex: "1 1 150px" }} aria-label="Ação da tarefa" value={acao} onChange={(e) => setAcao(e.target.value)}>
            <option value="">Qual a ação?</option>{ACOES.map((a) => <option key={a.t}>{a.t}</option>)}</select>
          <input className={c.inp} style={{ flex: "1 1 190px" }} type="datetime-local" aria-label="Data e hora da tarefa" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <input className={c.inp} placeholder="O que você ficou de fazer?" aria-label="O que ficou de fazer" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div style={fila}>
          <button className={c.pri} type="button" disabled={salvando} onClick={criar}>Salvar tarefa</button>
          <button className={c.btn} type="button" onClick={() => setAberto(false)}>Cancelar</button>
        </div></>}
    </div>
  );
}

// Tarefas abertas de todos os clientes, na tela principal: a mais atrasada primeiro.
export function TarefasLista({ userId, nomes, onAbrir, c }: {
  userId: string; nomes: Map<string, string | null>; onAbrir: (leadId: string) => void; c: ClassesTarefa;
}) {
  const [tudo, setTudo] = useState(false);
  const { data = [] } = useQuery<Task[]>({ queryKey: ["pcTarefas", "todas"], refetchInterval: 60_000, queryFn: fetchOpenTasks });
  const minhas = data.filter((t) => t.userId === userId && t.leadId && nomes.has(t.leadId));
  const atrasadas = minhas.filter((t) => Date.parse(t.dueAt) < Date.now()).length;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className={c.titulo}>📌 Minhas tarefas{minhas.length ? ` · ${minhas.length}` : ""}{atrasadas ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}</span>
      {!minhas.length ? <span className={c.meta}>Nenhuma tarefa agendada. Abra um cliente e toque em 📌 Agendar tarefa.</span> : null}
      {(tudo ? minhas : minhas.slice(0, 5)).map((t) => (
        <button key={t.id} type="button" className={c.meta} style={{ textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => onAbrir(t.leadId!)}>
          <b>{t.title} · {nomes.get(t.leadId!) ?? "Cliente"}</b> · {dataCurta(t.dueAt)} {horaSP(t.dueAt)}{Date.parse(t.dueAt) < Date.now() ? " · atrasada" : ""}<br />{t.notes}
        </button>
      ))}
      {minhas.length > 5 ? <div><button className={c.btn} type="button" onClick={() => setTudo(!tudo)}>{tudo ? "Ver menos" : `Ver todas (${minhas.length})`}</button></div> : null}
    </div>
  );
}
