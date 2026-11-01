// Notificação de lead novo no celular/computador do corretor, com o Comandra fechado (Web Push, 01/11).
// O aparelho se inscreve uma vez (permissão do navegador) e fica em push_inscricoes; o trigger trg_push_lead
// chama a edge push-lead a cada lead que chega para o corretor. iPhone: só no app da tela de início (iOS 16.4+).
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC = "BF6LqmOMZuitOHHy65YWtObJ1g2z0NHQvDquS6FlwTKKNLYjnbJ9yElwd3bgH0iImm7nyiqpOPn9UquIcoXzuLE";

export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const naTelaInicio = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
export const temSuporte = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export type EstadoPush = "ativo" | "desligado" | "negado" | "instalar" | "sem_suporte";

export async function estadoPush(): Promise<EstadoPush> {
  if (ehIOS() && !naTelaInicio()) return "instalar";
  if (!temSuporte()) return "sem_suporte";
  if (Notification.permission === "denied") return "negado";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ativo" : "desligado";
}

const b64 = (s: string) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** Pede a permissão (precisa vir de um toque), inscreve o aparelho e manda uma notificação de teste. */
export async function ativarPush(userId: string): Promise<EstadoPush> {
  if (ehIOS() && !naTelaInicio()) return "instalar";
  if (!temSuporte()) return "sem_suporte";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "negado" : "desligado";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) });
  const j = sub.toJSON() as any;
  const { error } = await (supabase as any).from("push_inscricoes").upsert({
    user_id: userId, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth,
    aparelho: navigator.userAgent.slice(0, 200), falhas: 0,
  }, { onConflict: "endpoint" });
  if (error) throw error;
  await supabase.functions.invoke("push-lead", { body: { teste: true } }).catch(() => {});
  return "ativo";
}

/** Mantém o service worker registrado em quem já ativou (o navegador às vezes descarta). */
export async function manterPush() {
  try { if (temSuporte() && Notification.permission === "granted") await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch { /* */ }
}
