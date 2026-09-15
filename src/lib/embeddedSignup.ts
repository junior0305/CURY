// Embedded Signup da Meta — o gerente conecta a própria BM sem sair do Comandra.
//
// A janela da Meta devolve as coisas por DOIS caminhos diferentes, e é preciso
// esperar os dois: o `code` vem no callback do FB.login, e o waba_id junto com
// o phone_number_id vêm por `postMessage`, num evento à parte. Quem espera só o
// callback recebe o código e não sabe qual número foi conectado.
//
// Nada de app id fixo no código: ele vem do wa-onboard, que é quem guarda os
// três valores do app da Meta.

import { supabase } from "@/integrations/supabase/client";

declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

export interface ContaConectada {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

let carregando: Promise<void> | null = null;

function carregaSdk(appId: string) {
  if (window.FB) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise<void>((ok, erro) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
      ok();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => erro(new Error("Não consegui carregar o Facebook. Alguma extensão do navegador pode estar bloqueando."));
    document.body.appendChild(s);
  });
  return carregando;
}

/** Abre a janela da Meta e resolve quando os dois caminhos chegaram. */
export async function conectarBM(): Promise<ContaConectada> {
  const { data: cfg, error } = await supabase.functions.invoke("wa-onboard", {
    body: { action: "config" },
  });
  if (error) throw error;
  if ((cfg as any)?.error) throw new Error((cfg as any).error);
  const { app_id, config_id } = cfg as any;
  if (!app_id || !config_id)
    throw new Error("O app da Meta ainda não está configurado no servidor.");

  await carregaSdk(app_id);

  return new Promise<ContaConectada>((ok, erro) => {
    let dados: { wabaId?: string; phoneNumberId?: string } = {};
    let code: string | null = null;
    const pronto = () => {
      if (code && dados.wabaId && dados.phoneNumberId) {
        window.removeEventListener("message", ouvinte);
        ok({ code, wabaId: dados.wabaId, phoneNumberId: dados.phoneNumberId });
      }
    };

    function ouvinte(ev: MessageEvent) {
      // Só a Meta fala aqui. Sem esta checagem, qualquer iframe da página
      // poderia se passar pela janela de conexão.
      if (!/^https:\/\/www\.facebook\.com$/.test(ev.origin)) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA") {
          dados = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
          pronto();
        } else if (d.event === "CANCEL") {
          window.removeEventListener("message", ouvinte);
          erro(new Error(`Você fechou a janela em "${d.data?.current_step ?? "alguma etapa"}". Nada foi conectado.`));
        } else if (d.event === "ERROR") {
          window.removeEventListener("message", ouvinte);
          erro(new Error(d.data?.error_message || "O Facebook recusou a conexão."));
        }
      } catch { /* mensagem de outro iframe, ignora */ }
    }
    window.addEventListener("message", ouvinte);

    window.FB.login((r: any) => {
      if (!r?.authResponse?.code) {
        window.removeEventListener("message", ouvinte);
        erro(new Error("A conexão foi cancelada antes de terminar."));
        return;
      }
      code = r.authResponse.code;
      pronto();
    }, {
      config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
  });
}

/** Entrega o que veio da janela para o servidor terminar o serviço. */
export async function finalizarConexao(c: ContaConectada, ownerId: string, label: string) {
  const { data, error } = await supabase.functions.invoke("wa-onboard", {
    body: {
      code: c.code, waba_id: c.wabaId, phone_number_id: c.phoneNumberId,
      owner_id: ownerId, label,
    },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) throw new Error(d.error);
  return d as { ok: boolean; pendencia: string | null; passos: Record<string, boolean> };
}
