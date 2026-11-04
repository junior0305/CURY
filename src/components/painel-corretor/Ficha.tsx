// Ficha do cliente no painel novo. Número escondido até o toque em WhatsApp/Ligar (o toque é a tentativa,
// com a hora). Fase, documentos, próximo passo, anotação e descarte — nada é enviado ao cliente.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadNotes, addLeadNote } from "@/integrations/supabase/atender";
import { updateLeadStatus, setLeadNegotiating, setLeadReturnDate } from "@/integrations/supabase/leads";
import { fetchLeadOpenTasks, createTask, markTaskDone } from "@/integrations/supabase/tasks";
import { LOST_REASON_LABEL } from "@/types/lead";
import type { Task, TaskType } from "@/types/task";
import type { LostReason } from "@/types/lead";
import { LeadPC, mascarar, formatarFone, linhaMeta, escudo, ultimoRegistro, horaSP, dataCurta, FASES, QUANDO, quandoISO, origem } from "./util";

const DOCS = [{ key: "rg", t: "🪪 RG / CNH" }, { key: "fgts", t: "🏦 Extrato FGTS" }, { key: "holerite", t: "📄 Holerite" }, { key: "endereco", t: "🏠 Comprovante de endereço" }];
// Tarefa livre: o corretor escolhe a ação, a data e descreve. A gestão lê no Histórico do lead (lead_linha_tempo).
const ACOES: { t: string; tipo: TaskType }[] = [
  { t: "Ligar", tipo: "CALL" }, { t: "WhatsApp", tipo: "WHATSAPP_TEXT" }, { t: "Visita", tipo: "SCHEDULE_VISIT" },
  { t: "Documentos", tipo: "DOCS_REQUEST" }, { t: "Outra", tipo: "FOLLOW_UP" },
];
const MOTIVOS: NonNullable<LostReason>[] = ["SEM_PERFIL", "NUMERO_ERRADO", "DESISTIU", "SEM_RETORNO", "CLIENTE_BLOQUEOU", "JA_COMPROU", "RENDA_FORA_FAIXA",
  "JA_TEM_IMOVEL", "JA_USOU_PROGRAMA", "RESTRICAO_CPF", "NAO_COMPARECEU", "FOI_CONCORRENTE", "LOCALIZACAO"];

export default function Ficha({ lead, userId, revelado, onFechar, onChamar, onAgendar, onComoFoi, inline }: {
  lead: LeadPC; userId: string; revelado: boolean; onFechar: () => void; inline?: boolean;
  onChamar: (canal: "WhatsApp" | "Ligação") => void; onAgendar: () => void; onComoFoi: () => void;
}) {
  const qc = useQueryClient();
  const [nota, setNota] = useState("");
  const [descartar, setDescartar] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState(false);
  const [tAcao, setTAcao] = useState(""); const [tData, setTData] = useState(""); const [tDesc, setTDesc] = useState("");
  const [salvandoT, setSalvandoT] = useState(false);
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["pcLeads"] }); qc.invalidateQueries({ queryKey: ["pcNotas", lead.id] }); qc.invalidateQueries({ queryKey: ["pcTarefas"] }); qc.invalidateQueries({ queryKey: ["pcTrilha"] }); };

  const { data: notas = [] } = useQuery({ queryKey: ["pcNotas", lead.id], queryFn: () => fetchLeadNotes(lead.id) });
  const { data: tarefas = [] } = useQuery<Task[]>({ queryKey: ["pcTarefas", lead.id], queryFn: () => fetchLeadOpenTasks(lead.id) });
  const { data: docs = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["pcDocs", lead.id],
    queryFn: async () => {
      const { data } = await supabase.from("lead_documentos").select("documento, entregue").eq("lead_id", lead.id);
      const m: Record<string, boolean> = {}; (data || []).forEach((r: any) => { m[r.documento] = r.entregue; }); return m;
    },
  });

  const ultNota = (notas as any[])[0]?.created_at ?? (notas as any[])[0]?.createdAt ?? null;
  const esc = escudo(lead, ultimoRegistro(lead, ultNota));
  const fi = FASES.findIndex(([k]) => k === lead.status);

  const fase = async (status: string, rotulo: string) => {
    if (status === lead.status) return;
    try {
      if (status === "NEGOTIATING") await setLeadNegotiating(lead.id); else await updateLeadStatus(lead.id, status as any);
      await addLeadNote(lead.id, userId, `Fase · ${rotulo}`).catch(() => {});
      atualizar(); toast.success("Fase atualizada");
    } catch { toast.error("Não consegui mudar a fase"); }
  };
  const toggleDoc = async (key: string) => {
    try {
      await supabase.from("lead_documentos").upsert({ lead_id: lead.id, documento: key, entregue: !docs[key], broker_id: userId, updated_at: new Date().toISOString() }, { onConflict: "lead_id,documento" });
      qc.invalidateQueries({ queryKey: ["pcDocs", lead.id] });
    } catch { toast.error("Não consegui salvar o documento"); }
  };
  const proximo = async (op: string) => {
    try {
      const iso = quandoISO(op);
      await setLeadReturnDate(lead.id, iso);
      await addLeadNote(lead.id, userId, `Combinado retorno em ${dataCurta(iso)} ${horaSP(iso)}`).catch(() => {});
      atualizar(); toast.success(`Próximo passo: ${op.toLowerCase()}`);
    } catch { toast.error("Não consegui salvar o próximo passo"); }
  };
  const anotar = async () => {
    if (!nota.trim()) return;
    try {
      await addLeadNote(lead.id, userId, nota.trim());
      const agora = new Date().toISOString();
      await supabase.from("leads").update({ last_broker_whatsapp_at: agora, last_interaction_at: agora }).eq("id", lead.id);
      if (lead.status === "NEW") await updateLeadStatus(lead.id, "IN_PROGRESS").catch(() => {});
      setNota(""); atualizar(); toast.success("Anotado · 🛡️ protegido por 48h");
    } catch { toast.error("Não consegui salvar a anotação"); }
  };
  const criarTarefa = async () => {
    const acao = ACOES.find((a) => a.t === tAcao);
    const quando = tData ? new Date(tData) : null;
    if (!acao || !quando || !tDesc.trim()) { toast.error("Escolha a ação, a data e descreva a tarefa."); return; }
    if (quando.getTime() < Date.now()) { toast.error("Escolha uma data futura."); return; }
    setSalvandoT(true);
    try {
      const iso = quando.toISOString();
      await createTask({ userId, leadId: lead.id, type: acao.tipo, title: acao.t, notes: tDesc.trim(), dueAt: iso });
      await addLeadNote(lead.id, userId, `Tarefa · ${acao.t} para ${dataCurta(iso)} ${horaSP(iso)}: ${tDesc.trim()}`).catch(() => {});
      // A tarefa mais próxima é o que faz o cliente voltar para o Hoje do corretor.
      const atual = lead.next_action_date ? Date.parse(lead.next_action_date) : null;
      if (atual === null || atual < Date.now() || quando.getTime() < atual) await setLeadReturnDate(lead.id, iso).catch(() => {});
      setTAcao(""); setTData(""); setTDesc(""); setNovaTarefa(false); atualizar(); toast.success("Tarefa criada");
    } catch { toast.error("Não consegui criar a tarefa"); }
    finally { setSalvandoT(false); }
  };
  const concluirTarefa = async (t: Task) => {
    try {
      await markTaskDone(t.id);
      await addLeadNote(lead.id, userId, `Tarefa · ${t.title} concluída (era para ${dataCurta(t.dueAt)} ${horaSP(t.dueAt)})`).catch(() => {});
      // Só mexe no retorno se ele era desta tarefa; um retorno combinado à parte continua valendo.
      if (lead.next_action_date && Date.parse(lead.next_action_date) === Date.parse(t.dueAt)) {
        const prox = tarefas.find((x) => x.id !== t.id)?.dueAt ?? null;
        await supabase.from("leads").update({ next_action_date: prox }).eq("id", lead.id);
      }
      atualizar(); toast.success("Tarefa concluída");
    } catch { toast.error("Não consegui concluir a tarefa"); }
  };
  const descartarLead = async (m: NonNullable<LostReason>) => {
    try { await updateLeadStatus(lead.id, "ABANDONED", null, m); toast.success(`${lead.name} descartado · ${LOST_REASON_LABEL[m]}`); setDescartar(false); atualizar(); onFechar(); }
    catch { toast.error("Não consegui descartar"); }
  };

  const tl = [...(notas as any[])].reverse().map((n) => `${dataCurta(n.created_at ?? n.createdAt)} ${horaSP(n.created_at ?? n.createdAt)} · ${n.content}`);
  return (
    <section className={inline ? "fi-inline" : "over"} aria-label={`Ficha de ${lead.name}`}>
      <div className="over-in">
        <div className="fi-top"><button className="x" type="button" onClick={onFechar} aria-label="Voltar">←</button>
          <div><b>{lead.name}</b><small>{linhaMeta(lead) || origem(lead)}</small></div></div>
        <div className="fi-body">
          <div className="mask"><span>{revelado ? formatarFone(lead.phone) : mascarar(lead.phone)}</span><small>{revelado ? "chamado agora" : "o número aparece ao chamar"}</small></div>
          <div className="big">
            <button className="btn wa" type="button" onClick={() => onChamar("WhatsApp")}>🟢 WhatsApp</button>
            <button className="btn" type="button" onClick={() => onChamar("Ligação")}>📞 Ligar</button>
          </div>
          <div className="row"><span className={`shield ${esc.k}`}>🛡️ {esc.txt}</span><button className="btn" type="button" onClick={onComoFoi}>Registrar como foi</button></div>

          <div className="box"><span className="lbl" style={{ margin: 0 }}>Tarefas{tarefas.length ? ` · ${tarefas.length}` : ""}</span>
            {tarefas.map((t) => (
              <div key={t.id} className="row">
                <span className="meta" style={{ flex: 1 }}><b>{t.title}</b> · {dataCurta(t.dueAt)} {horaSP(t.dueAt)}{Date.parse(t.dueAt) < Date.now() ? " · atrasada" : ""}<br />{t.notes}</span>
                <button className="btn" type="button" onClick={() => concluirTarefa(t)}>Concluir</button>
              </div>
            ))}
            {!novaTarefa ? <button className="btn" type="button" onClick={() => setNovaTarefa(true)}>📌 Agendar tarefa</button> : <>
              <select className="inp" aria-label="Ação da tarefa" value={tAcao} onChange={(e) => setTAcao(e.target.value)}>
                <option value="">Qual a ação?</option>{ACOES.map((a) => <option key={a.t}>{a.t}</option>)}</select>
              <input className="inp" type="datetime-local" aria-label="Data e hora da tarefa" value={tData} onChange={(e) => setTData(e.target.value)} />
              <input className="inp" placeholder="Descreva a tarefa…" aria-label="Descrição da tarefa" value={tDesc} onChange={(e) => setTDesc(e.target.value)} />
              <div className="row">
                <button className="btn pri" type="button" disabled={salvandoT} onClick={criarTarefa}>Salvar tarefa</button>
                <button className="btn" type="button" onClick={() => setNovaTarefa(false)}>Cancelar</button>
              </div></>}
          </div>

          <div className="box"><span className="lbl" style={{ margin: 0 }}>Fase</span>
            <div className="chips">{FASES.map(([k, r, nr], i) => <button key={k} type="button" className={i === fi ? "on" : ""} onClick={() => k === "VISIT_SCHEDULED" ? onAgendar() : fase(k, nr)}>{r}</button>)}</div>
            {lead.visit_scheduled_at && <span className="meta">📅 Visita {dataCurta(lead.visit_scheduled_at)} às {horaSP(lead.visit_scheduled_at)}{lead.visita_local ? ` · ${lead.visita_local}` : ""}</span>}
            <button className="btn" type="button" onClick={onAgendar}>📅 Agendar visita</button>
          </div>

          <div className="box"><span className="lbl" style={{ margin: 0 }}>Próximo passo</span>
            <div className="chips">{QUANDO.map((q) => <button key={q} type="button" onClick={() => proximo(q)}>{q}</button>)}</div>
            {lead.next_action_date && <span className="meta">Combinado: {dataCurta(lead.next_action_date)} {horaSP(lead.next_action_date)}</span>}
          </div>

          <div className="box"><span className="lbl" style={{ margin: 0 }}>Pasta · {DOCS.filter((d) => docs[d.key]).length} de {DOCS.length}</span>
            {DOCS.map((d) => <button key={d.key} type="button" className={`chk${docs[d.key] ? " ok" : ""}`} onClick={() => toggleDoc(d.key)}><span>{d.t}</span><span>{docs[d.key] ? "✅ recebido" : "falta"}</span></button>)}
          </div>

          <div className="lbl">Linha do tempo</div>
          <div className="tl">
            <div>{dataCurta(lead.created_at)} {horaSP(lead.created_at)} · chegou{origem(lead) ? ` · ${origem(lead)}` : ""}</div>
            {tl.map((t, i) => <div key={i} className={i === tl.length - 1 ? "n" : ""}>{t}</div>)}
          </div>
          <div className="row">
            <input className="inp" placeholder="Anotar a conversa…" value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") anotar(); }} aria-label="Anotar a conversa" />
            <button className="btn pri" type="button" onClick={anotar} disabled={!nota.trim()}>Salvar</button>
          </div>

          <a className="btn" style={{ textAlign: "center", textDecoration: "none" }} href={`/painel-completo?lead=${lead.id}`}>Simulador e Fecha a Conta ↗</a>
          {!descartar ? <button className="btn" type="button" onClick={() => setDescartar(true)}>Descartar cliente</button>
            : <div className="box"><span className="lbl" style={{ margin: 0 }}>Por que descartar?</span>
              <div className="chips">{MOTIVOS.map((m) => <button key={m} type="button" onClick={() => descartarLead(m)}>{LOST_REASON_LABEL[m]}</button>)}</div>
              <button className="btn" type="button" onClick={() => setDescartar(false)}>Cancelar</button></div>}
        </div>
      </div>
    </section>
  );
}
