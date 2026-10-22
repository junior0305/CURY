/* Situação do lead — UMA regra para todas as telas (19/10).
 *
 * Antes cada aba contava "sem contato" do seu jeito: Tempo real dizia 127 parados, Time 56% sem
 * contato e Leads 128 "nunca falou", na mesma equipe e na mesma hora. Toda tela que precisar saber
 * se o lead foi atendido, se o cliente está esperando ou se é teste/pescado usa estas funções.
 *
 * Os campos vêm direto da tabela leads (snake_case).
 */
export type LeadCampos = {
  name?: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
  last_broker_whatsapp_at?: string | null;
  last_lead_response_at?: string | null;
  last_interaction_at?: string | null;
  contact_attempts?: number | null;
};

const t = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);
const ENCERRADO = new Set(["CONCLUDED", "EXCLUDED", "ABANDONED"]);

/** Lead de teste do Meta ("<test lead: dummy data…>") — nunca entra em conta nenhuma. */
export const ehTeste = (l: LeadCampos) => /test lead|dummy data/i.test(l.name ?? "");

/** Pescado do pool: contato que o próprio corretor puxou. Não é lead pago. */
export const ehPescado = (l: LeadCampos) => l.source === "cold_pool";

/** Lead que caiu de uma lista da Base de contatos (gotejamento). Também não é lead pago. */
export const ehLista = (l: LeadCampos) => l.source === "lista";

/** Lead do Resgate para lançamentos (pasta antiga do Junix que voltou ao corretor). Também não é lead pago. */
export const ehResgate = (l: LeadCampos) => l.source === "resgate";

/** Lead pago = veio de mídia (anúncio/disparo/outros); pescado, lista e resgate ficam fora. */
export const ehPago = (l: LeadCampos) => !ehPescado(l) && !ehLista(l) && !ehResgate(l);

export const ativo = (l: LeadCampos) => !ENCERRADO.has(l.status ?? "");

/** Atendido = o corretor fez alguma coisa: WhatsApp, tentativa registrada, mudou a fase
 *  ou houve interação depois de o lead chegar. Pescado nasce em IN_PROGRESS sozinho, então
 *  para ele essa fase não conta como contato. */
export function atendido(l: LeadCampos): boolean {
  if (l.last_broker_whatsapp_at) return true;
  if ((l.contact_attempts ?? 0) > 0) return true;
  const st = l.status ?? "NEW";
  if (st !== "NEW" && !(ehPescado(l) && st === "IN_PROGRESS")) return true;
  const criado = t(l.created_at), inter = t(l.last_interaction_at);
  if (!isNaN(criado) && !isNaN(inter) && inter > criado + 5 * 60_000 && !ehPescado(l)) return true;
  return false;
}

/** Cliente esperando: ele mandou mensagem depois do último contato do corretor. */
export function esperando(l: LeadCampos): boolean {
  const resp = t(l.last_lead_response_at);
  if (isNaN(resp)) return false;
  const toque = t(l.last_broker_whatsapp_at);
  return isNaN(toque) || resp > toque;
}

/** Horas desde que o cliente ficou esperando (NaN se não está esperando). */
export const horasEsperando = (l: LeadCampos) => (esperando(l) ? (Date.now() - t(l.last_lead_response_at)) / 3.6e6 : NaN);
