// Tela principal do corretor (06/11, protótipo https://claude.ai/artifact/DKh3nfFWhFwYPABbZ7Skxg):
// grupos pelo que o corretor precisa fazer e a fila do "Atender" (um cliente por vez, na ordem certa).
// Celular (PainelCorretor) e computador (CorretorPainel) usam as mesmas regras, para os números baterem.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import type { Task } from "@/types/task";
import { COLS, diaSP, horaSP, type LeadPC } from "./util";

export type Grupo = "resp" | "novo" | "ret" | "vis" | "pes" | "par" | "nunca";

export const GRUPOS: Record<Grupo, { rot: string; faz: string; cor: string }> = {
  resp: { rot: "Responderam", faz: "Responda agora", cor: "#0E9C85" },
  novo: { rot: "Novos", faz: "Faça o 1º contato", cor: "#E5772A" },
  ret: { rot: "Retornos de hoje", faz: "Ligue de volta", cor: "#B49A12" },
  vis: { rot: "Visitas de hoje", faz: "Confirme a visita", cor: "#2F74C9" },
  pes: { rot: "Pescados", faz: "Dê o toque do dia", cor: "#1597A8" },
  par: { rot: "Parados", faz: "Retome a conversa", cor: "#7462CF" },
  nunca: { rot: "Nunca chamados", faz: "Chame ou descarte", cor: "#D2452B" },
};
export const ORDEM: Grupo[] = ["resp", "novo", "ret", "vis", "pes", "par", "nunca"];
export const NUNCA_POR_DIA = 10;

const FECHADO = new Set(["CONCLUDED", "ABANDONED", "EXCLUDED", "LOST"]);
const CONVERSA = new Set(["IN_PROGRESS", "NEGOTIATING", "FOLLOW_UP_AUTO", "REACTIVATED"]);
const H = 3.6e6;

export const ativo = (l: LeadPC) => !FECHADO.has(l.status) && !/test lead|dummy data/i.test(l.name || "");
/** cliente mandou mensagem depois do último contato do corretor (nas últimas 72h) */
export const respondeu = (l: LeadPC) => !!l.last_lead_response_at && Date.parse(l.last_lead_response_at) > Date.now() - 72 * H
  && (!l.last_broker_whatsapp_at || l.last_lead_response_at > l.last_broker_whatsapp_at)
  && !(l.source === "cold_pool" && Math.abs(Date.parse(l.last_lead_response_at) - Date.parse(l.created_at)) < 120_000);
const semToque = (l: LeadPC) => l.status === "NEW" && !(l.contact_attempts || 0) && !l.last_broker_whatsapp_at;
/** Novo = chegou há menos de 24h e ainda não teve nenhum toque */
export const novo = (l: LeadPC) => semToque(l) && l.source !== "cold_pool" && Date.parse(l.created_at) > Date.now() - 24 * H;
/** Nunca chamado = passou de 24h sem nenhum toque */
export const nuncaChamado = (l: LeadPC) => semToque(l) && l.source !== "cold_pool" && Date.parse(l.created_at) <= Date.now() - 24 * H;
const ultimoContato = (l: LeadPC) => l.last_broker_whatsapp_at || l.primeiro_contato_em || l.last_interaction_at || l.created_at;
/** Parado = conversando e sem contato há 3 dias ou mais (sem retorno marcado para frente) */
export const parado = (l: LeadPC) => CONVERSA.has(l.status) && Date.parse(ultimoContato(l)) < Date.now() - 72 * H
  && (!l.next_action_date || Date.parse(l.next_action_date) < Date.now());

/** O grupo de um cliente (o mais urgente que se aplica) ou null quando está em dia. */
export function grupoDe(l: LeadPC, tarefas: Map<string, Task>, hoje = diaSP(Date.now())): Grupo | null {
  if (!ativo(l)) return null;
  if (respondeu(l)) return "resp";
  if (novo(l)) return "novo";
  const t = tarefas.get(l.id);
  if ((l.next_action_date && diaSP(l.next_action_date) <= hoje) || (t && diaSP(t.dueAt) <= hoje)) return "ret";
  if (l.status === "VISIT_SCHEDULED" && l.visit_scheduled_at && diaSP(l.visit_scheduled_at) === hoje) return "vis";
  if (l.source === "cold_pool" && ["NEW", "IN_PROGRESS"].includes(l.status) && diaSP(ultimoContato(l)) < hoje
      && Date.parse(l.created_at) > Date.now() - 10 * 24 * H) return "pes";
  if (parado(l)) return "par";
  if (nuncaChamado(l)) return "nunca";
  return null;
}

export type ItemFila = { l: LeadPC; g: Grupo; motivo: string };

const haTxt = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} dias`; };

function motivoDe(l: LeadPC, g: Grupo, tarefas: Map<string, Task>) {
  if (g === "resp") return `Respondeu há ${haTxt(l.last_lead_response_at!)} · responda agora`;
  if (g === "novo") return `Chegou há ${haTxt(l.created_at)} · faça o 1º contato`;
  if (g === "ret") { const t = tarefas.get(l.id); const quando = t?.dueAt || l.next_action_date!; const atr = Date.parse(quando) < Date.now();
    return `${t ? `Tarefa: ${t.title}` : "Retorno combinado"} ${horaSP(quando)}${atr ? " · atrasado" : ""}`; }
  if (g === "vis") return `Visita hoje às ${horaSP(l.visit_scheduled_at!)} · confirme`;
  if (g === "pes") return "Pescado · dê o toque do dia";
  if (g === "par") return `Sem contato há ${haTxt(ultimoContato(l))} · retome`;
  return `Chegou há ${haTxt(l.created_at)} e nunca foi chamado`;
}

/** A fila do dia: por grupo na ordem de urgência; nunca chamados no máximo 10 (os mais recentes primeiro). */
export function montarFila(leads: LeadPC[], tarefas: Map<string, Task>): ItemFila[] {
  const hoje = diaSP(Date.now());
  const por: Record<Grupo, LeadPC[]> = { resp: [], novo: [], ret: [], vis: [], pes: [], par: [], nunca: [] };
  for (const l of leads) { const g = grupoDe(l, tarefas, hoje); if (g) por[g].push(l); }
  por.resp.sort((a, b) => b.last_lead_response_at!.localeCompare(a.last_lead_response_at!));
  por.novo.sort((a, b) => b.created_at.localeCompare(a.created_at));
  por.ret.sort((a, b) => (tarefas.get(a.id)?.dueAt || a.next_action_date || "").localeCompare(tarefas.get(b.id)?.dueAt || b.next_action_date || ""));
  por.vis.sort((a, b) => a.visit_scheduled_at!.localeCompare(b.visit_scheduled_at!));
  por.par.sort((a, b) => ultimoContato(b).localeCompare(ultimoContato(a)));   // o mais recente ainda está "quente"
  por.nunca.sort((a, b) => b.created_at.localeCompare(a.created_at));
  por.nunca = por.nunca.slice(0, NUNCA_POR_DIA);
  return ORDEM.flatMap((g) => por[g].map((l) => ({ l, g, motivo: motivoDe(l, g, tarefas) })));
}

/** Contagem por grupo (nunca chamados sem o limite do dia). */
export function contarGrupos(leads: LeadPC[], tarefas: Map<string, Task>) {
  const hoje = diaSP(Date.now());
  const c: Record<Grupo, number> = { resp: 0, novo: 0, ret: 0, vis: 0, pes: 0, par: 0, nunca: 0 };
  for (const l of leads) { const g = grupoDe(l, tarefas, hoje); if (g) c[g]++; }
  return c;
}

/** Saúde da carteira: em dia (contato nos últimos 3 dias), precisam de você hoje, esquecidos. */
export function carteira(leads: LeadPC[], tarefas: Map<string, Task>) {
  const c = contarGrupos(leads, tarefas);
  const ativos = leads.filter(ativo).length;
  const precisam = c.resp + c.novo + c.ret + c.vis + c.pes;
  const esquecidos = c.par + c.nunca;
  return { total: ativos, precisam, esquecidos, emDia: Math.max(0, ativos - precisam - esquecidos) };
}

/** Onde estão os clientes (fase). */
export function funil(leads: LeadPC[]) {
  const mes = diaSP(Date.now()).slice(0, 7);
  const f = { sem: 0, conv: 0, vis: 0, pasta: 0, venda: 0 };
  for (const l of leads) {
    if (l.status === "CONCLUDED") { if (diaSP(l.last_interaction_at || l.created_at).slice(0, 7) === mes) f.venda++; continue; }
    if (!ativo(l)) continue;
    if (l.status === "NEW") f.sem++;
    else if (l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA") f.vis++;
    else if (l.status === "DOCS_REQUESTED") f.pasta++;
    else f.conv++;
  }
  return f;
}

// ── dados compartilhados (mesmas chaves do painel do celular: o cache é um só) ──
export function useLeadsPC(uid: string) {
  return useQuery<LeadPC[]>({
    queryKey: ["pcLeads", uid], enabled: !!uid, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select(COLS).eq("broker_id", uid).not("status", "in", '("ABANDONED","EXCLUDED")').order("created_at", { ascending: false }).limit(1500);
      if (error) throw error; return (data as any) || [];
    },
  });
}
export function useTarefasAbertas() {
  return useQuery<Task[]>({ queryKey: ["pcTarefas", "todas"], refetchInterval: 60_000, queryFn: fetchOpenTasks });
}
/** tarefa mais próxima de cada cliente (só as do corretor) */
export function tarefaPorLead(tarefas: Task[], uid: string) {
  const m = new Map<string, Task>();
  for (const t of tarefas) if (t.leadId && t.userId === uid && !m.has(t.leadId)) m.set(t.leadId, t);
  return m;
}
