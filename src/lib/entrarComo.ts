/* "Entrar como" (28/10, pedido do Junior): o diretor/admin abre uma sessão REAL de outra pessoa para ver exatamente
 * o que ela vê (menu, telas, permissões, o que o banco libera). A sessão dele fica guardada aqui e volta com 1 clique.
 * Nessa sessão: não sai mensagem nem disparo (bloqueio aqui + sessao_como() no banco) e a pessoa não aparece online.
 * Servidor: edge entrar-como (confere permissão e estrutura, gera link mágico sem e-mail) + entrar_como_log.
 */
import { supabase } from "@/integrations/supabase/client";

const K_ORIGINAL = "cmd_sessao_original";
const K_COMO = "cmd_entrar_como";

export type EntrarComoInfo = { nome: string; role: string; por: string; log_id: number; desde: string };

const ler = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };

export function entrandoComo(): EntrarComoInfo | null { return ler<EntrarComoInfo>(K_COMO); }

export async function entrarComo(alvoId: string): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const atual = s.session;
  if (!atual) throw new Error("Faça login de novo.");
  if (entrandoComo()) throw new Error("Volte para o seu login antes de entrar como outra pessoa.");
  const { data, error } = await supabase.functions.invoke("entrar-como", { body: { alvo_id: alvoId } });
  const d = data as any;
  if (error || !d?.token_hash) throw new Error(d?.error || (error as any)?.context?.error || error?.message || "Não consegui entrar.");
  // guarda a sessão do diretor ANTES de trocar
  localStorage.setItem(K_ORIGINAL, JSON.stringify({ access_token: atual.access_token, refresh_token: atual.refresh_token }));
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: d.token_hash, type: "magiclink" });
  if (e2) { localStorage.removeItem(K_ORIGINAL); throw new Error("Não consegui abrir a sessão: " + e2.message); }
  localStorage.setItem(K_COMO, JSON.stringify({ nome: d.nome, role: d.role, por: d.por, log_id: d.log_id, desde: new Date().toISOString() }));
  await supabase.rpc("registrar_sessao_como" as any, { p_log: d.log_id });
  window.location.href = "/";
}

export async function voltarParaMeuLogin(): Promise<void> {
  const orig = ler<{ access_token: string; refresh_token: string }>(K_ORIGINAL);
  try { await supabase.rpc("encerrar_sessao_como" as any); } catch { /* segue */ }
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  localStorage.removeItem(K_COMO);
  if (orig) {
    const { error } = await supabase.auth.setSession(orig);
    localStorage.removeItem(K_ORIGINAL);
    if (error) { window.location.href = "/login"; return; }
  }
  window.location.href = "/";
}

// Enquanto estiver como outra pessoa, estas funções do servidor não rodam: mandam mensagem, cobram, disparam,
// cadastram gente ou mexem em número/chip. O resto (ver, filtrar, mexer em lead/fila) segue normal.
const BLOQUEADAS = new Set([
  "send_whatsapp_message", "send-whatsapp", "wa-sender", "wa-campaign-runner", "wa-onboard", "wa-template",
  "cobrar-corretor", "cobrar-pessoa", "cobrar-acao", "cockpit-cobrar", "regua-cobranca", "lembrar-compromissos",
  "upload_campaign_leads", "upload_campaign_leads_v2", "create-user", "orchestrator", "followup_scheduler", "comandra-processor",
]);
export const MSG_BLOQUEIO = "Você está como outra pessoa: mensagens, cobranças e disparos ficam bloqueados. Volte para o seu login para fazer isso.";

export function instalarBloqueioEntrarComo() {
  const fns: any = supabase.functions;
  if (fns.__bloqueioComo) return;
  const original = fns.invoke.bind(fns);
  fns.invoke = (nome: string, opts?: any) => {
    if (entrandoComo()) {
      const body = opts?.body || {};
      const qrPerigoso = nome === "get-whatsapp-qr" && body.method !== "check";
      if (BLOQUEADAS.has(nome) || qrPerigoso) {
        return Promise.resolve({ data: { error: MSG_BLOQUEIO }, error: { message: MSG_BLOQUEIO } });
      }
    }
    return original(nome, opts);
  };
  fns.__bloqueioComo = true;
}
