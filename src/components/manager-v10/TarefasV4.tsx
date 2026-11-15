// Tarefas agendadas da equipe (Junior, 14/11): por corretor, com quem está com tarefa, atrasadas, e se a tarefa é
// ESCRITA (tem observação) ou SÓ AGENDADA (só a ação + hora). Dado real: tabela tasks (OPEN) da árvore do gerente.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
type Tarefa = { id: string; user_id: string; lead_id: string | null; type: string | null; title: string | null; notes: string | null; due_at: string };

const ACAO: Record<string, [string, string]> = { CALL: ["📞", "Ligar"], WHATSAPP_TEXT: ["💬", "WhatsApp"], FOLLOW_UP: ["🔁", "Retornar"], VISIT: ["📍", "Visita"] };
const ini = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();
const SP = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const diaSP = (d = new Date()) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
type Filtro = "todas" | "atrasadas" | "hoje" | "semana";

export default function TarefasV4({ managerId }: { managerId: string }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const { data, isLoading } = useQuery({
    queryKey: ["tarefas-v4", managerId],
    enabled: !!managerId,
    refetchInterval: 120_000,
    queryFn: async () => {
      const cs = (await sb.from("profiles").select("id,first_name,last_name").eq("manager_id", managerId).eq("role", "BROKER").eq("is_active", true)).data ?? [];
      const nome = new Map<string, string>(cs.map((p: any) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—"]));
      nome.set(managerId, "Você");
      const ids = [...nome.keys()];
      const de = new Date(Date.now() - 30 * 864e5).toISOString();
      const ate = new Date(Date.now() + 30 * 864e5).toISOString();
      const tarefas = (await sb.from("tasks").select("id,user_id,lead_id,type,title,notes,due_at")
        .in("user_id", ids).eq("status", "OPEN").gte("due_at", de).lte("due_at", ate).order("due_at").limit(1000)).data ?? [] as Tarefa[];
      const leadIds = [...new Set((tarefas as Tarefa[]).map((t) => t.lead_id).filter(Boolean))] as string[];
      const leadNome = new Map<string, string>();
      for (let i = 0; i < leadIds.length; i += 300) {
        const lr = (await sb.from("leads").select("id,name").in("id", leadIds.slice(i, i + 300))).data ?? [];
        for (const l of lr) leadNome.set(l.id, l.name || "—");
      }
      return { tarefas: tarefas as Tarefa[], nome, leadNome };
    },
  });

  const hoje = diaSP().toISOString().slice(0, 10);
  const fimSemana = new Date(diaSP().getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const casa = (t: Tarefa, f: Filtro) => {
    const dia = new Date(t.due_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (f === "atrasadas") return new Date(t.due_at).getTime() < Date.now();
    if (f === "hoje") return dia === hoje;
    if (f === "semana") return dia >= hoje && dia <= fimSemana;
    return true;
  };
  const passa = (t: Tarefa) => casa(t, filtro);
  const conta = (f: Filtro) => (data?.tarefas ?? []).filter((t) => casa(t, f)).length;

  const porCorretor = useMemo(() => {
    const ts = (data?.tarefas ?? []).filter(passa);
    const m = new Map<string, Tarefa[]>();
    for (const t of ts) m.set(t.user_id, [...(m.get(t.user_id) ?? []), t]);
    return [...m.entries()].map(([id, tarefas]) => ({
      id, nome: data?.nome.get(id) ?? "—", tarefas,
      atrasadas: tarefas.filter((t) => new Date(t.due_at).getTime() < Date.now()).length,
    })).sort((a, b) => b.atrasadas - a.atrasadas || b.tarefas.length - a.tarefas.length);
  }, [data, filtro]);

  const total = (data?.tarefas ?? []).length;

  const PILS: [Filtro, string][] = [["todas", "Todas"], ["atrasadas", "Atrasadas"], ["hoje", "Hoje"], ["semana", "Próximos 7 dias"]];

  return (
    <section className="tv4">
      <style>{CSS}</style>
      <div className="tv4-top">
        <div><h2>Tarefas agendadas da equipe</h2>
          <p>O que cada corretor marcou para fazer — ligação ou WhatsApp, com ou sem observação.</p></div>
        <div className="tv4-pils">
          {PILS.map(([k, lb]) => (
            <button key={k} className={`tv4-pil${filtro === k ? " on" : ""}${k === "atrasadas" ? " vermelho" : ""}`} onClick={() => setFiltro(k)}>
              {lb} <b>{conta(k)}</b>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="tv4-vazio">Carregando…</p> : !porCorretor.length ? (
        <p className="tv4-vazio">{total ? "Nenhuma tarefa nesse filtro." : "Nenhuma tarefa agendada. A equipe está com a agenda limpa. ✅"}</p>
      ) : (
        <div className="tv4-grid">
          {porCorretor.map((c) => (
            <div key={c.id} className="tv4-card">
              <div className="tv4-ch">
                <span className="tv4-av">{ini(c.nome)}</span>
                <div className="tv4-cn"><b>{c.nome}</b><small>{c.tarefas.length} tarefa{c.tarefas.length > 1 ? "s" : ""}</small></div>
                {c.atrasadas > 0 && <span className="tv4-atr">{c.atrasadas} atrasada{c.atrasadas > 1 ? "s" : ""}</span>}
              </div>
              <div className="tv4-tl">
                {c.tarefas.slice(0, 8).map((t) => {
                  const [ic, lb] = ACAO[t.type ?? ""] ?? ["✅", t.type ?? "Tarefa"];
                  const atras = new Date(t.due_at).getTime() < Date.now();
                  const escrita = !!t.notes && t.notes.trim().length > 2 && t.notes.trim().toLowerCase() !== (t.title ?? "").toLowerCase();
                  return (
                    <div key={t.id} className={`tv4-t${atras ? " atr" : ""}`}>
                      <span className="tv4-ic">{ic}</span>
                      <div className="tv4-td">
                        <div className="tv4-tr1"><b>{lb}</b>{t.lead_id && <> · <span className="tv4-cli">{data?.leadNome.get(t.lead_id) ?? "cliente"}</span></>}</div>
                        {escrita ? <div className="tv4-obs">✍️ {t.notes}</div> : <div className="tv4-ag">⏰ só agendada</div>}
                      </div>
                      <div className="tv4-tq">
                        <span className={atras ? "atr" : ""}>{SP(t.due_at)}</span>
                        {t.lead_id && <Link className="tv4-ver" to={`/manager/leads-nova?lead=${t.lead_id}`}>ver</Link>}
                      </div>
                    </div>
                  );
                })}
                {c.tarefas.length > 8 && <div className="tv4-mais">+ {c.tarefas.length - 8} outras</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const CSS = `
.tv4{display:flex;flex-direction:column;gap:16px}
.tv4-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.tv4-top h2{margin:0;font-size:19px;font-weight:800}
.tv4-top p{margin:3px 0 0;font-size:13px;color:var(--cv-text-muted,#6B7A90)}
.tv4-pils{display:flex;gap:8px;flex-wrap:wrap}
.mgr10 .tv4-pil{min-height:38px;padding:0 14px;border-radius:99px;border:1px solid var(--cv-border,#E1E6EE);background:var(--cv-surface,#fff);font-size:13px;font-weight:600;color:var(--cv-text-main,#27364B);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.mgr10 .tv4-pil.on{border-color:#1f63e0;box-shadow:0 0 0 1px #1f63e0}
.mgr10 .tv4-pil.vermelho.on{border-color:#D64545;box-shadow:0 0 0 1px #D64545;color:#B4322A}
.tv4-pil b{font-family:"JetBrains Mono",monospace;background:var(--cv-sunk,#EEF2F7);border-radius:6px;padding:1px 7px;font-size:12px}
.tv4-vazio{padding:30px 6px;font-size:14px;color:var(--cv-text-muted,#6B7A90)}
.tv4-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;align-items:start}
.tv4-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:16px;overflow:hidden}
.tv4-ch{display:flex;align-items:center;gap:11px;padding:14px 16px;border-bottom:1px solid var(--cv-border,#EEF2F8)}
.tv4-av{width:38px;height:38px;border-radius:12px;background:#0F1B2D;color:#fff;font-size:13px;font-weight:700;display:grid;place-items:center;flex:none}
.tv4-cn{flex:1;min-width:0}.tv4-cn b{font-size:15px;font-weight:800}.tv4-cn small{display:block;font-size:12px;color:var(--cv-text-muted,#6B7A90)}
.tv4-atr{font-size:11.5px;font-weight:800;color:#B4322A;background:#FBE3DD;padding:4px 9px;border-radius:99px}
.tv4-tl{display:flex;flex-direction:column}
.tv4-t{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--cv-border,#F1F4F9)}
.tv4-t:first-child{border-top:0}
.tv4-t.atr{background:rgba(214,69,69,.04)}
.tv4-ic{font-size:17px;text-align:center}
.tv4-td{min-width:0}
.tv4-tr1{font-size:13.5px}.tv4-tr1 b{font-weight:700}
.tv4-cli{color:#1f63e0;font-weight:600}
.tv4-obs{font-size:12.5px;color:var(--cv-text-main,#3B4A5E);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv4-ag{font-size:12px;color:var(--cv-text-muted,#90A0B5);margin-top:2px}
.tv4-tq{text-align:right;font-size:12px;color:var(--cv-text-muted,#6B7A90);font-family:"JetBrains Mono",monospace;display:flex;flex-direction:column;gap:2px;align-items:flex-end}
.tv4-tq .atr{color:#B4322A;font-weight:700}
.tv4-ver{font-family:Archivo,sans-serif;font-size:11.5px;font-weight:700;color:#1f63e0;text-decoration:none}
.tv4-mais{padding:9px 16px;font-size:12px;color:var(--cv-text-muted,#6B7A90)}
`;
