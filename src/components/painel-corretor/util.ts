// Painel novo do corretor (30/10, mockup aprovado https://claude.ai/artifact/UkxnsjMAhBVWrUuyxEG2GB).
// Regras que valem para todas as telas do painel: número escondido até o toque em WhatsApp/Ligar,
// nada é enviado ao cliente, meta do mês = 1 venda (o gerente pode sugerir outra) → 5 visitas atendidas
// e 3 pastas com documentos por venda.

export type LeadPC = {
  id: string; name: string; phone: string; status: string; source: string | null;
  created_at: string; last_interaction_at: string | null; last_lead_response_at: string | null;
  last_broker_whatsapp_at: string | null; contact_attempts: number | null; next_action_date: string | null;
  negotiating_since: string | null; visit_scheduled_at: string | null; visita_local: string | null;
  renda_declarada: string | null; tipo_trabalho: string | null; regiao_interesse: string | null;
  campanha_nome: string | null; product: string | null; primeiro_contato_em: string | null;
};
export const COLS = "id,name,phone,status,source,created_at,last_interaction_at,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,next_action_date,negotiating_since,visit_scheduled_at,visita_local,renda_declarada,tipo_trabalho,regiao_interesse,campanha_nome,product,primeiro_contato_em";

export const TZ = "America/Sao_Paulo";
export const diaSP = (d: string | number | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
export const horaSP = (d: string | number | Date) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":00", "h").replace(":", "h");
export const dataCurta = (d: string | number | Date) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
export const primeiroNome = (n?: string | null) => { const p = (n || "").trim().split(/\s+/)[0] || ""; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""; };
/** De onde veio, do jeito que o corretor entende. Lista não mostra a origem (regra de 20/10); ID cru e código de disparo viram texto. */
export const origem = (l: { source: string | null; campanha_nome: string | null; product?: string | null }) => {
  if (l.source === "lista") return "";
  if (l.source === "cold_pool") return "pescado por você";
  if (l.source === "resgate") return "resgate de pasta";
  const c = (l.campanha_nome || "").trim();
  if (/^disparo/i.test(c)) return "respondeu a um disparo";
  if (!c || /^\d{8,}$/.test(c)) return l.product || "";
  return `anúncio ${c}`;
};

/** Número escondido: (11) 9••••-4874. Só o toque em WhatsApp/Ligar mostra o número inteiro. */
export function mascarar(phone?: string | null) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 8) return "••••";
  const ddd = d.length >= 10 ? d.slice(0, 2) : "";
  return `${ddd ? `(${ddd}) ` : ""}${d.length === 11 || d.length === 9 ? "9" : ""}••••-${d.slice(-4)}`;
}
export function formatarFone(phone?: string | null) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone || "";
}

// gênero pelo primeiro nome, só para o texto ("chamar ela"/"chamar ele"); sem palpite → neutro
const F = new Set(["raquel", "isabel", "ester", "ruth", "rute", "carmen", "yasmin", "karen", "ingrid", "miriam", "mirian", "lourdes", "rachel", "ellen", "helen", "sueli", "kelly", "shirley", "beatriz", "liz", "thais", "tais", "lais", "iris", "ines", "nicole", "alice", "jennifer", "jenifer", "yara"]);
const M = new Set(["jose", "davi", "luis", "luiz", "felipe", "henrique", "andre", "alexandre", "jorge", "guilherme", "wesley", "william", "ryan", "ruan", "kaue", "rafael", "gabriel", "daniel", "miguel", "samuel", "manuel", "lucas", "luca", "joshua", "elias", "nicolas", "jonas", "isaias", "thomas", "denis", "douglas", "vinicius", "matheus", "mateus", "marcos", "carlos", "thales", "moises", "ivan", "alan", "allan", "juan", "igor", "vitor", "victor", "heitor", "artur", "arthur", "yuri", "caue", "enzo", "eduardo", "rene", "jean", "rui"]);
export function genero(nome?: string | null): "f" | "m" | "" {
  const n = primeiroNome(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!n) return "";
  if (F.has(n)) return "f";
  if (M.has(n)) return "m";
  if (/(a|ne|le|ce|ete|elly|ely)$/.test(n)) return "f";
  if (/(o|os|us|el|son|on|or|ur|er|go)$/.test(n)) return "m";
  return "";
}
/** "a Mariana" / "o Rogério" / "Alex" */
export const comArtigo = (nome?: string | null) => { const g = genero(nome); const p = primeiroNome(nome) || "cliente"; return g === "f" ? `a ${p}` : g === "m" ? `o ${p}` : p; };

export const rendaCurta = (r?: string | null) => {
  if (!r) return "";
  const t = String(r).replace(/_/g, " ").replace(/r\$/gi, "R$").replace(/,00/g, "").replace(/\s+/g, " ").trim();
  return /^\d/.test(t) ? `R$ ${t}` : t;
};
const TRAB: Record<string, string> = { CLT: "CLT", AUTONOMO: "Autônomo", FUNCIONARIO_PUBLICO: "Func. público" };
export const linhaMeta = (l: LeadPC) => [l.regiao_interesse, rendaCurta(l.renda_declarada) ? `renda ${rendaCurta(l.renda_declarada)}` : "", l.tipo_trabalho ? TRAB[l.tipo_trabalho] : ""].filter(Boolean).join(" · ");

/** O cliente mandou mensagem depois do último contato do corretor (mesma regra do situacaoLead). */
export const esperando = (l: LeadPC) => !!l.last_lead_response_at && (!l.last_broker_whatsapp_at || l.last_lead_response_at > l.last_broker_whatsapp_at)
  && !(l.source === "cold_pool" && Math.abs(Date.parse(l.last_lead_response_at) - Date.parse(l.created_at)) < 120_000);

/** Último registro do corretor (WhatsApp, tentativa ou anotação). */
export const ultimoRegistro = (l: LeadPC, notaMaisRecente?: string | null) =>
  [l.last_broker_whatsapp_at, notaMaisRecente, l.primeiro_contato_em].filter(Boolean).sort().slice(-1)[0] || null;

/** Escudo: cada registro deixa o lead "em dia" por 48h. É só um sinal no painel; nada é bloqueado. */
export function escudo(l: LeadPC, ultimo: string | null): { k: "ok" | "no" | ""; txt: string } {
  if (!ultimo) return l.status === "NEW" ? { k: "", txt: "protegido assim que você chamar" } : { k: "no", txt: "sem registro ainda" };
  const h = (Date.now() - Date.parse(ultimo)) / 3.6e6;
  if (h < 48) return { k: "ok", txt: `protegido · ${Math.max(1, Math.round(48 - h))}h` };
  const d = Math.floor(h / 24);
  return { k: "no", txt: `sem registro há ${d} dia${d > 1 ? "s" : ""}` };
}

/** Dias úteis (seg–sex) do mês de `ref`: total e quantos faltam contando hoje. */
export function diasUteis(ref = new Date()) {
  const hoje = diaSP(ref);
  const [y, m] = hoje.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let total = 0, restam = 0, passados = 0;
  for (let d = 1; d <= fim; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const wd = dt.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    total++;
    const iso = dt.toISOString().slice(0, 10);
    if (iso >= hoje) restam++; else passados++;
  }
  return { total, restam: Math.max(1, restam), hojeN: passados + 1 };
}

export const MES = (ref = new Date()) => new Date(ref).toLocaleDateString("pt-BR", { month: "long", timeZone: TZ });

/** "Hoje 18h", "Amanhã 10h", "Em 2 dias", "Sexta" → ISO (horário de SP). */
export function quandoISO(op: string): string {
  const hoje = diaSP(Date.now());
  const base = (dias: number, hora: number) => {
    const d = new Date(Date.parse(hoje + "T12:00:00Z") + dias * 864e5).toISOString().slice(0, 10);
    return new Date(`${d}T${String(hora).padStart(2, "0")}:00:00-03:00`).toISOString();
  };
  if (op === "Hoje 18h") return base(0, 18);
  if (op === "Amanhã 10h") return base(1, 10);
  if (op === "Em 2 dias") return base(2, 10);
  if (op === "Sexta") { const wd = new Date(hoje + "T12:00:00Z").getUTCDay(); return base(((5 - wd + 7) % 7) || 7, 10); }
  return base(1, 10);
}
export const QUANDO = ["Hoje 18h", "Amanhã 10h", "Em 2 dias", "Sexta"];

export const FASES: [string, string, string][] = [
  // status, rótulo na tela, rótulo da nota (igual ao painel antigo; a conta do mês lê "Fase · Veio"/"Fase · Docs")
  ["NEW", "Novo", "Novo"], ["IN_PROGRESS", "Atendendo", "Atend."], ["NEGOTIATING", "Conversando", "Negoc."],
  ["VISIT_SCHEDULED", "Visita", "Visita"], ["VISITA_REALIZADA", "Veio", "Veio"], ["DOCS_REQUESTED", "Documentos", "Docs"], ["CONCLUDED", "Venda", "Venda"],
];
