// Gaveta do lead (Leads nova, 10/11): o mesmo lugar para trocar de corretor, criar/concluir tarefa, anotar e ver o caminho.
// Abre de qualquer aba (Precisa de mim, Chegaram, Tarefas, Por campanha, Por corretor).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { COLS_LEAD, ETAPA, quando, situacao, SIT, type Corretor, type LeadN } from "./comum";

const sb = supabase as any;
const PRAZOS: [string, () => string][] = [
  ["Hoje 18h", () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d.toISOString(); }],
  ["Amanhã 10h", () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return d.toISOString(); }],
  ["Em 2 dias", () => { const d = new Date(Date.now() + 2 * 864e5); d.setHours(10, 0, 0, 0); return d.toISOString(); }],
];

export default function LeadGaveta({ leadId, como, corretores, carteira, trocandoInicial = false, onFechar }: {
  leadId: string; como: string | null; corretores: Corretor[]; carteira: Map<string, number>;
  trocandoInicial?: boolean; onFechar: () => void;
}) {
  const { session } = useAuth();
  const eu = session?.user?.id ?? null;
  const qc = useQueryClient();
  const [trocando, setTrocando] = useState(trocandoInicial);
  const [para, setPara] = useState<string>("");
  const [tarefa, setTarefa] = useState("");
  const [prazo, setPrazo] = useState(0);
  const [praMim, setPraMim] = useState(false);
  const [nota, setNota] = useState("");
  const [indo, setIndo] = useState(false);

  const { data } = useQuery({
    queryKey: ["ln-lead", leadId],
    queryFn: async () => {
      const [l, cam, notas, tarefas] = await Promise.all([
        sb.from("leads").select(COLS_LEAD).eq("id", leadId).maybeSingle(),
        sb.rpc("lead_caminho", { p_lead: leadId, p_como: como }),
        sb.from("lead_notes").select("id,content,created_at,broker_id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(30),
        sb.from("tasks").select("id,title,due_at,status,user_id").eq("lead_id", leadId).order("due_at", { ascending: true }),
      ]);
      return { lead: l.data as LeadN | null, caminho: (cam.data ?? []) as any[], notas: (notas.data ?? []) as any[], tarefas: (tarefas.data ?? []) as any[] };
    },
  });
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["ln-lead", leadId] }); qc.invalidateQueries({ queryKey: ["ln-dados"] }); };
  const nome = (id: string | null) => corretores.find((c) => c.id === id)?.nome ?? (id ? "outro corretor" : "ninguém");

  const l = data?.lead;
  if (!data) return <Fundo onFechar={onFechar}><p className="ln-vazio">Abrindo o lead…</p></Fundo>;
  if (!l) return <Fundo onFechar={onFechar}><p className="ln-vazio">Não encontrei esse lead (ou ele não é da sua estrutura).</p></Fundo>;
  const sit = situacao(l);
  // destinos: corretores da equipe na roleta primeiro, carteira mais leve primeiro
  const destinos = corretores.filter((c) => c.id !== l.broker_id)
    .sort((a, b) => Number(b.roleta) - Number(a.roleta) || (carteira.get(a.id) ?? 0) - (carteira.get(b.id) ?? 0));

  async function passar() {
    if (!para) { toast.error("Escolha o corretor."); return; }
    setIndo(true);
    const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: [leadId], p_para: [para], p_como: como, p_motivo: "Trocado pelo gestor" });
    setIndo(false);
    if (error) { toast.error(error.details || error.message); return; }
    if (!r?.feitos) { toast.error(r?.pulados?.[0]?.motivo ? `Não deu: ${r.pulados[0].motivo}` : "Não consegui passar."); return; }
    toast.success(`Passado para ${nome(para)}. Ele recebe o aviso no app.`);
    setTrocando(false); setPara(""); recarregar();
  }
  async function criarTarefa() {
    if (!tarefa.trim()) { toast.error("Escreva a tarefa."); return; }
    const dono = praMim || !l!.broker_id ? eu : l!.broker_id;
    setIndo(true);
    const { error } = await sb.from("tasks").insert({ user_id: dono, lead_id: leadId, type: "FOLLOW_UP", title: tarefa.trim(), due_at: PRAZOS[prazo][1](), status: "OPEN" });
    setIndo(false);
    if (error) { toast.error("Não consegui criar: " + error.message); return; }
    toast.success(dono === eu ? "Tarefa criada para você." : `Tarefa criada para ${nome(dono)}.`);
    setTarefa(""); recarregar();
  }
  async function concluir(id: string) {
    const { error } = await sb.from("tasks").update({ status: "DONE", concluida_em: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    recarregar();
  }
  async function anotar() {
    if (!nota.trim()) return;
    setIndo(true);
    const { error } = await sb.from("lead_notes").insert({ lead_id: leadId, broker_id: eu, content: nota.trim() });
    setIndo(false);
    if (error) { toast.error("Não consegui anotar: " + error.message); return; }
    setNota(""); recarregar();
  }

  // caminho: chegada + trocas de corretor + o que foi anotado + última mensagem do cliente
  const linhas: { t: string; txt: string; ruim?: boolean }[] = [
    { t: l.created_at, txt: `Chegou${l.campanha_nome ? ` de "${l.campanha_nome}"` : ""}${l.source === "cold_pool" ? " (Pescar)" : l.source === "lista" ? " (lista)" : ""}` },
    ...data.caminho.map((c: any) => ({ t: c.quando, txt: c.para ? `${c.de ? `De ${c.de} para ${c.para}` : `Foi para ${c.para}`}${c.por ? ` · por ${c.por}` : ""}${c.motivo ? ` · ${c.motivo}` : ""}` : `Ficou sem corretor${c.motivo ? ` · ${c.motivo}` : ""}` })),
    ...data.notas.map((n: any) => ({ t: n.created_at, txt: n.content })),
    ...(l.last_lead_response_at ? [{ t: l.last_lead_response_at, txt: "Cliente mandou mensagem", ruim: sit.k === "ruim" }] : []),
  ].sort((a, b) => b.t.localeCompare(a.t));
  const abertas = data.tarefas.filter((t: any) => t.status !== "DONE");

  return (
    <Fundo onFechar={onFechar}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="ln-tag" style={{ alignSelf: "flex-start", color: SIT[sit.k][0], background: SIT[sit.k][1] }}>{sit.txt}</span>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>{l.name || "Sem nome"}</h2>
          <span className="ln-nota">{[l.regiao_interesse, l.renda_declarada ? `renda ${l.renda_declarada}` : null, l.tipo_trabalho, l.campanha_nome].filter(Boolean).join(" · ") || "sem dados do formulário"}</span>
        </div>
        <button type="button" className="ln-x" aria-label="Fechar" onClick={onFechar}>×</button>
      </div>

      <section className="ln-sec">
        <h3>Corretor</h3>
        <div className="ln-box">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5 }}>Está com <b>{nome(l.broker_id)}</b> · etapa <b>{ETAPA[l.status ?? "NEW"] ?? l.status}</b></span>
            <button type="button" className="ln-btn p" onClick={() => setTrocando(!trocando)}>{l.broker_id ? "Trocar de corretor" : "Passar para alguém"}</button>
          </div>
          {trocando ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--cv-border,#DDE3EA)", paddingTop: 10 }}>
              <span className="ln-nota">Corretores da equipe · quem está na roleta e com menos leads primeiro:</span>
              <div className="ln-btns">
                {destinos.map((c) => (
                  <button key={c.id} type="button" className={`ln-pill${para === c.id ? " on" : ""}`} aria-pressed={para === c.id} onClick={() => setPara(c.id)}>
                    {c.nome}{c.roleta ? " · roleta" : ""} · {carteira.get(c.id) ?? 0} leads</button>
                ))}
                {!destinos.length ? <span className="ln-nota">Ninguém mais na equipe.</span> : null}
              </div>
              <button type="button" className="ln-btn" disabled={indo || !para} onClick={passar} style={{ alignSelf: "flex-start", background: "#12233A", color: "#fff", borderColor: "#12233A" }}>
                {indo ? "Passando…" : para ? `Passar para ${nome(para)}` : "Escolha o corretor"}</button>
              <span className="ln-nota">Descartado volta para "Novo". O corretor que recebe é avisado no app; fica registrado quem passou.</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="ln-sec">
        <h3>Tarefas</h3>
        {abertas.map((t: any) => {
          const atrasada = new Date(t.due_at).getTime() < Date.now();
          return (
            <label key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--cv-border,#DDE3EA)", borderRadius: 10 }}>
              <input type="checkbox" onChange={() => concluir(t.id)} aria-label={`Concluir ${t.title}`} />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <b style={{ fontSize: 13.5 }}>{t.title}</b>
                <span style={{ fontSize: 12.5, color: atrasada ? "#B4462F" : "var(--cv-text-muted,#55657A)", fontWeight: atrasada ? 700 : 400 }}>
                  para {t.user_id === eu ? "você" : nome(t.user_id)} · {atrasada ? "venceu" : "vence"} {quando(t.due_at)}</span>
              </span>
            </label>
          );
        })}
        {l.next_action_date ? <span className="ln-nota">Retorno combinado pelo corretor: {quando(l.next_action_date)}</span> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px dashed var(--cv-border,#C9D3DF)", borderRadius: 10, padding: 12 }}>
          <label className="ln-nota" style={{ display: "flex", flexDirection: "column", gap: 4, fontWeight: 700 }}>Nova tarefa
            <input className="ln-inp" value={tarefa} onChange={(e) => setTarefa(e.target.value)} placeholder="Ex.: mandar simulação da Caixa" /></label>
          <div className="ln-btns" style={{ alignItems: "center" }}>
            {PRAZOS.map(([r], i) => <button key={r} type="button" className={`ln-pill${prazo === i ? " on" : ""}`} onClick={() => setPrazo(i)}>{r}</button>)}
            <label className="ln-nota" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={praMim || !l.broker_id} disabled={!l.broker_id} onChange={(e) => setPraMim(e.target.checked)} /> para mim (não para o corretor)</label>
          </div>
          <button type="button" className="ln-btn p" disabled={indo} onClick={criarTarefa} style={{ alignSelf: "flex-start" }}>Criar tarefa</button>
        </div>
      </section>

      <section className="ln-sec">
        <h3>Anotar</h3>
        <textarea className="ln-inp" aria-label="Anotação" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: cliente prefere contato depois das 18h" />
        <button type="button" className="ln-btn" disabled={indo || !nota.trim()} onClick={anotar} style={{ alignSelf: "flex-start" }}>Salvar anotação</button>
      </section>

      <section className="ln-sec">
        <h3>Caminho do lead</h3>
        {linhas.slice(0, 25).map((x, i) => (
          <span key={i} style={{ fontSize: 13, color: x.ruim ? "#B4462F" : undefined, fontWeight: x.ruim ? 700 : 400 }}><b>{quando(x.t)}</b> · {x.txt}</span>
        ))}
      </section>
    </Fundo>
  );
}

function Fundo({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="ln-fundo" onClick={onFechar}>
      <aside className="ln-gaveta" aria-label="Lead aberto" onClick={(e) => e.stopPropagation()}>{children}</aside>
    </div>
  );
}
