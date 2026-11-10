// Leads do gerente — tela nova (10/11, protótipo aprovado https://claude.ai/artifact/87PsvMu65KmF4XL6WtYBNq).
// Tipos, período e a regra de "o que precisa do gerente" usada pelas abas e pela gaveta do lead.
import { atendido, esperando, ehTeste } from "@/lib/situacaoLead";

export type LeadN = {
  id: string; name: string | null; phone: string | null; status: string | null; source: string | null;
  created_at: string; broker_id: string | null; manager_id: string | null;
  last_broker_whatsapp_at: string | null; last_lead_response_at: string | null; last_interaction_at: string | null;
  contact_attempts: number | null; campanha_nome: string | null; fb_form_id: string | null; lost_reason: string | null;
  visit_scheduled_at: string | null; next_action_date: string | null;
  regiao_interesse: string | null; renda_declarada: string | null; tipo_trabalho: string | null;
};
export const COLS_LEAD = "id,name,phone,status,source,created_at,broker_id,manager_id,last_broker_whatsapp_at,last_lead_response_at,"
  + "last_interaction_at,contact_attempts,campanha_nome,fb_form_id,lost_reason,visit_scheduled_at,next_action_date,regiao_interesse,renda_declarada,tipo_trabalho";

export type Corretor = { id: string; nome: string; roleta: boolean };

export type Periodo = "hoje" | "ontem" | "7d" | "mes" | "datas";
const diaSP = (ms: number) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
/** início e fim (exclusivo) do período, em ISO, no horário de São Paulo */
export function janela(p: Periodo, de?: string, ate?: string): { de: string; ate: string; rotulo: string } {
  const hoje = diaSP(Date.now());
  const meia = (d: string) => `${d}T00:00:00-03:00`;
  const soma = (d: string, n: number) => diaSP(new Date(meia(d)).getTime() + 3 * 3600e3 + n * 864e5);
  if (p === "hoje") return { de: meia(hoje), ate: meia(soma(hoje, 1)), rotulo: "hoje" };
  if (p === "ontem") return { de: meia(soma(hoje, -1)), ate: meia(hoje), rotulo: "ontem" };
  if (p === "mes") return { de: meia(hoje.slice(0, 8) + "01"), ate: meia(soma(hoje, 1)), rotulo: "este mês" };
  if (p === "datas" && de && ate) return { de: meia(de), ate: meia(soma(ate, 1)), rotulo: `${de.slice(8, 10)}/${de.slice(5, 7)} a ${ate.slice(8, 10)}/${ate.slice(5, 7)}` };
  return { de: meia(soma(hoje, -6)), ate: meia(soma(hoje, 1)), rotulo: "últimos 7 dias" };
}

export const ENCERRADO = new Set(["CONCLUDED", "EXCLUDED", "ABANDONED", "LOST"]);
export const ETAPA: Record<string, string> = {
  NEW: "Novo", IN_PROGRESS: "Tentando", NEGOTIATING: "Conversando", VISIT_SCHEDULED: "Visita marcada", VISITA_REALIZADA: "Veio à visita",
  DOCS_REQUESTED: "Documentos", CONCLUDED: "Venda", ABANDONED: "Descartado", LOST: "Descartado", EXCLUDED: "Excluído",
  FOLLOW_UP_AUTO: "Retorno", REACTIVATED: "Reativado",
};
export const VISITA = new Set(["VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"]);

export const horas = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : NaN);
export const ha = (iso?: string | null) => {
  const h = horas(iso);
  if (isNaN(h)) return "";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} dias`;
};
export const quando = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), hoje = diaSP(Date.now()), dia = diaSP(d.getTime());
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const ontem = diaSP(Date.now() - 864e5), amanha = diaSP(Date.now() + 864e5);
  if (dia === hoje) return `hoje ${hora}`;
  if (dia === ontem) return `ontem ${hora}`;
  if (dia === amanha) return `amanhã ${hora}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
};

/** Situação curta de um lead para listas (aba Chegaram) */
export function situacao(l: LeadN): { txt: string; k: "ok" | "ruim" | "sem" | "desc" } {
  const st = l.status ?? "NEW";
  if (!l.broker_id && !ENCERRADO.has(st)) return { txt: "Sem corretor", k: "sem" };
  if (st === "ABANDONED" || st === "LOST") return { txt: `Descartado${(l.contact_attempts ?? 0) === 0 ? " · sem tentativa" : ""}`, k: "desc" };
  if (ENCERRADO.has(st)) return { txt: ETAPA[st] ?? st, k: "ok" };
  if (esperando(l)) return { txt: `Respondeu há ${ha(l.last_lead_response_at)}`, k: "ruim" };
  if (!atendido(l)) return { txt: `Sem atendimento · ${ha(l.created_at)}`, k: "ruim" };
  if (st === "VISIT_SCHEDULED" && l.visit_scheduled_at) return { txt: `Visita ${quando(l.visit_scheduled_at)}`, k: "ok" };
  const tent = l.contact_attempts ?? 0;
  return { txt: `${ETAPA[st] ?? st}${st === "IN_PROGRESS" && tent ? ` · ${tent} tentativa${tent > 1 ? "s" : ""}` : ""}`, k: "ok" };
}

/** O que precisa do gerente: g0 respondeu e ninguém voltou · g1 nunca abordado há 24h+ · g2 sem corretor */
export function precisa(l: LeadN): null | { g: 0 | 1 | 2; tag: string; porque: string } {
  if (ehTeste(l) || ENCERRADO.has(l.status ?? "")) return null;
  if (!l.broker_id) return { g: 2, tag: "Sem corretor", porque: l.campanha_nome ? `Chegou de "${l.campanha_nome}" e não foi para ninguém` : "Chegou e não foi para ninguém" };
  if (l.next_action_date && new Date(l.next_action_date).getTime() > Date.now()) return null;   // retorno combinado para frente
  if (esperando(l) && horas(l.last_lead_response_at) >= 1)
    return { g: 0, tag: `Respondeu há ${ha(l.last_lead_response_at)}`, porque: "O cliente mandou mensagem e o corretor ainda não voltou" };
  // 10/11: só os últimos 15 dias (os mais velhos ficam na aba Chegaram para redistribuir; aqui afogavam a lista)
  if (!atendido(l) && horas(l.created_at) >= 24 && horas(l.created_at) <= 15 * 24)
    return { g: 1, tag: `Chegou há ${ha(l.created_at)}`, porque: (l.contact_attempts ?? 0) === 0 ? "Nenhuma tentativa de contato desde que chegou" : "Sem contato real desde que chegou" };
  return null;
}

export const TAG: Record<number, [string, string]> = { 0: ["#B4462F", "#FBE3DD"], 1: ["#8A5300", "#FFF0D1"], 2: ["#1F3A5C", "#E4ECF7"], 3: ["#7A1F5C", "#F6E1EE"] };
export const SIT: Record<string, [string, string]> = { ok: ["#075C50", "#DDF3EE"], ruim: ["#B4462F", "#FBE3DD"], sem: ["#1F3A5C", "#E4ECF7"], desc: ["#8A5300", "#FFF0D1"] };

export const CSS = `
.ln{display:flex;flex-direction:column;gap:16px;color:var(--cv-text-main,#12233A)}
.ln-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.ln-top h1{margin:0;font-size:24px;font-weight:800}
.ln-top p{margin:4px 0 0;font-size:14px;color:var(--cv-text-muted,#55657A)}
.ln-acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ln-pill{font:inherit;border:1px solid var(--cv-border,#C9D3DF);background:var(--cv-surface,#fff);color:inherit;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;min-height:36px;text-decoration:none;display:inline-flex;align-items:center}
.ln-pill.on{background:var(--cv-text-main,#12233A);border-color:var(--cv-text-main,#12233A);color:var(--cv-surface,#fff)}
.ln-pill.brand{border-color:var(--cv-brand,#0B7A6A);color:var(--cv-brand,#0B7A6A)}
.ln-datas{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#DDE3EA);border-radius:12px;padding:12px 14px}
.ln-datas label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:700;color:var(--cv-text-muted,#55657A)}
.ln-datas input{font:inherit;font-size:14px;min-height:38px;border:1px solid var(--cv-border,#C9D3DF);border-radius:8px;padding:0 8px;background:transparent;color:inherit}
.ln-abas{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--cv-border,#DDE3EA);padding-bottom:10px}
.ln-aba{font:inherit;cursor:pointer;padding:10px 16px;border-radius:10px;font-size:14.5px;font-weight:700;border:1px solid var(--cv-border,#DDE3EA);background:var(--cv-surface,#fff);color:var(--cv-text-main,#3C4B5F)}
.ln-aba.on{background:var(--cv-text-main,#12233A);color:var(--cv-surface,#fff);border-color:var(--cv-text-main,#12233A)}
.ln-aba b{margin-left:8px}
.ln-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.ln-filtro{font:inherit;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:2px;background:var(--cv-surface,#fff);border-radius:14px;padding:14px 16px;border:1px solid var(--cv-border,#DDE3EA)}
.ln-filtro b{font-size:26px}.ln-filtro span{font-size:13px}.ln-filtro small{font-size:12px;color:var(--cv-text-muted,#55657A)}
.ln-caixa{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#DDE3EA);border-radius:14px;overflow:hidden}
.ln-linha{display:flex;align-items:center;gap:14px;padding:12px 16px;border-top:1px solid var(--cv-border-subtle,#EEF1F5);flex-wrap:wrap}
.ln-linha:first-child{border-top:0}
.ln-tag{flex:0 0 auto;font-size:12px;font-weight:800;border-radius:999px;padding:4px 10px}
.ln-corpo{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:2px}
.ln-corpo b{font-size:14.5px}.ln-corpo span{font-size:13px;color:var(--cv-text-muted,#55657A)}
.ln-quem{font-size:13px;color:var(--cv-text-muted,#55657A);min-width:110px}
.ln-btns{display:flex;gap:6px;flex-wrap:wrap}
.ln-btn{font:inherit;cursor:pointer;border:1px solid var(--cv-border,#C9D3DF);background:var(--cv-surface,#fff);color:inherit;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;min-height:36px}
.ln-btn.p{background:var(--cv-brand,#0B7A6A);border-color:var(--cv-brand,#0B7A6A);color:#fff}
.ln-btn:disabled{opacity:.55;cursor:default}
.ln-nota{font-size:12.5px;color:var(--cv-text-muted,#55657A)}
.ln-vazio{padding:18px;font-size:14px;color:var(--cv-text-muted,#55657A)}
.ln-tab{overflow-x:auto}
.ln-tab table{width:100%;min-width:780px;border-collapse:collapse;font-size:14px}
.ln-tab th{text-align:left;color:var(--cv-text-muted,#55657A);font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding:10px 14px}
.ln-tab td{padding:10px 14px;border-top:1px solid var(--cv-border-subtle,#EEF1F5)}
.ln-ruim{color:#B4462F;font-weight:800}.ln-bom{color:#0B7A6A;font-weight:800}
.ln-lote{background:#12233A;color:#fff;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.ln-lote .ln-pill{background:transparent;color:#fff;border-color:#55657A}
.ln-lote .ln-pill.on{background:#2BB5A0;border-color:#2BB5A0;color:#0F1B2D}
.ln-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.ln-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#DDE3EA);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
.ln-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ln-nums div{display:flex;flex-direction:column}.ln-nums b{font-size:22px}.ln-nums span{font-size:12px;color:var(--cv-text-muted,#55657A)}
.ln-vai{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--cv-surface-subtle,#F3F6F9);border-radius:10px;padding:10px 12px;flex-wrap:wrap;font-size:13px}
.ln-barra{display:inline-block;height:10px;border-radius:4px;background:#2F6FB8;vertical-align:middle;margin-right:8px}
.ln-fundo{position:fixed;inset:0;background:rgba(15,27,45,.35);z-index:60;display:flex;justify-content:flex-end}
.ln-gaveta{width:min(540px,100%);height:100%;overflow-y:auto;box-sizing:border-box;background:var(--cv-surface,#fff);color:var(--cv-text-main,#12233A);padding:22px;display:flex;flex-direction:column;gap:16px;box-shadow:-8px 0 30px rgba(0,0,0,.18)}
.ln-sec{display:flex;flex-direction:column;gap:8px}
.ln-sec>h3{margin:0;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--cv-text-muted,#55657A)}
.ln-box{background:var(--cv-surface-subtle,#F3F6F9);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.ln-inp{font:inherit;font-size:14px;min-height:40px;border:1px solid var(--cv-border,#C9D3DF);border-radius:8px;padding:0 10px;background:transparent;color:inherit}
textarea.ln-inp{min-height:64px;padding:8px 10px;resize:vertical}
.ln-x{font:inherit;cursor:pointer;width:40px;height:40px;border-radius:10px;border:1px solid var(--cv-border,#DDE3EA);background:transparent;color:inherit;font-size:18px}
@media (max-width:640px){.ln-nums{grid-template-columns:repeat(3,minmax(0,1fr))}.ln-aba{padding:8px 12px;font-size:13.5px}}
`;
