// Check-in de plantão (06/11): leitura da localização do aparelho e textos comuns ao corretor e ao gerente.
// A localização só é pedida quando a pessoa toca no botão (check-in, conferência, "Estou aqui agora").

export type Local = { lat: number; lng: number; prec: number };

export function pegarLocal(): Promise<Local> {
  return new Promise((ok, falha) => {
    if (!("geolocation" in navigator)) { falha(new Error("Este aparelho não informa a localização.")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, prec: Math.round(p.coords.accuracy) }),
      (e) => falha(new Error(e.code === e.PERMISSION_DENIED
        ? "A localização está bloqueada para o Comandra. Libere em Ajustes do navegador › Localização e tente de novo."
        : e.code === e.TIMEOUT ? "A localização demorou demais. Chegue perto de uma janela e tente de novo."
        : "Não consegui pegar a localização. Tente de novo.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export const distTxt = (m?: number | null) => m == null ? "" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;

export const horaTxt = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(":", "h") : "";

/** Resposta das RPCs de plantão em uma frase para a pessoa. */
export function motivoTxt(r: { motivo?: string; dist_m?: number; plantao?: string; precisao_m?: number }) {
  if (r.motivo === "precisao") return `A localização veio imprecisa (±${r.precisao_m ?? "?"} m). Chegue perto de uma janela ou saia do elevador e tente de novo.`;
  if (r.motivo === "longe") return `Você está a ${distTxt(r.dist_m)} do ${r.plantao || "plantão"}. O check-in vale a até 200 m.`;
  if (r.motivo === "ja_existe") return `Já existe o ${r.plantao} aqui perto. Escolha ele na lista.`;
  return "Não deu certo. Tente de novo.";
}

/** Erro do banco (raise exception … using detail) em português. */
export function erroTxt(e: any) {
  return e?.details || e?.message || "Não deu certo. Tente de novo.";
}

export type ConfDia = { ok?: boolean; em?: string; dist_m?: number; pedido?: string; sem_resposta?: boolean } | null;
export const confTxt = (c: ConfDia) => !c ? "—" : c.sem_resposta ? "não respondeu" : c.ok === true ? `ok ${horaTxt(c.em)}` : c.ok === false ? `longe · ${distTxt(c.dist_m)}` : c.pedido ? "aguardando" : "—";
