// 29/10: uma pessoa pode ter mais de uma conta de anúncio (Alisson: "Corretora Versiani" e "Super Alisson").
// A edge fb-conta-gerente lê uma por vez (sem account_id = a primeira) e devolve em `contas` a lista de todas;
// aqui lemos a primeira e depois cada uma das outras, em paralelo. `limiteMs` corta a conta que não responde.
import { supabase } from "@/integrations/supabase/client";

const comLimite = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function lerContasDoDono(dono: string, de: string, ate: string, limiteMs = 25_000): Promise<any[]> {
  const chama = (account_id?: string) =>
    comLimite(supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: dono, de, ate, ...(account_id ? { account_id } : {}) } }), limiteMs)
      .then((r: any) => r?.data ?? null, () => null);
  const primeira = await chama();
  if (!primeira) return [];
  const outras = ((primeira.contas ?? []) as { account_id: string }[]).map((c) => String(c.account_id)).filter((id) => id !== String(primeira.accountId));
  const resto = await Promise.all(outras.map((id) => chama(id)));
  return [primeira, ...resto].filter((x) => x && !x.semConta && !x.error);
}
