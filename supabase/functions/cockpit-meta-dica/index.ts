import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { scope = "geral", force = false } = await req.json().catch(() => ({}));
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);

    // dia atual em BRT
    const dia = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    // cache hit?
    if (!force) {
      const { data: cached } = await sb.from("cockpit_dica_cache").select("dica").eq("scope", scope).eq("dia", dia).maybeSingle();
      if (cached?.dica) return json({ dica: cached.dica, cached: true });
    }

    // contexto: cockpit do mês + metas
    const [{ data: ck }, { data: goals }] = await Promise.all([
      sb.rpc("cockpit_v2", { p_mode: "month" }),
      sb.rpc("cockpit_goals"),
    ]);
    if (!ck) return json({ error: "sem contexto" }, 500);

    let ctx: Record<string, unknown>;
    let alvo = "a operação";
    if (scope === "geral") {
      alvo = "a equipe toda";
      ctx = {
        escopo: "geral",
        meta_mes: goals?.geral?.target || null,
        vendas_realizadas: goals?.geral?.realized ?? ck.saida.vendas,
        faltam_vendas: goals?.geral?.gap ?? null,
        dias_restantes: goals?.days_left ?? null,
        leads_em_visita_agendada: ck.saida.visitas,
        leads_ignorados_responderam_sem_retorno: ck.saida.ignorados,
        leads_parados_48h: ck.saida.parados,
        leads_nunca_tocados: ck.entrada.nunca_tocados,
        corretores_sumidos_3d: ck.adocao.sumidos,
      };
    } else {
      const g = (ck.gerencias || []).find((x: any) => x.manager_id === scope);
      const gm = (goals?.teams || []).find((x: any) => x.manager_name === g?.manager_name);
      alvo = g?.manager_name ? `a equipe ${g.manager_name}` : "a equipe";
      ctx = {
        escopo: g?.manager_name || scope,
        meta_mes: gm?.target || null,
        faltam_vendas: gm?.gap ?? null,
        vendas_realizadas: g?.vendas ?? 0,
        dias_restantes: goals?.days_left ?? null,
        leads_recebidos: g?.recebidos ?? 0,
        leads_em_visita_agendada: g?.visitas ?? 0,
        leads_ignorados_responderam_sem_retorno: g?.ignorados ?? 0,
        leads_parados_48h: g?.parados ?? 0,
      };
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY ausente" }, 500);

    const prompt = `Contexto de vendas (MCMV / Minha Casa Minha Vida) de ${alvo} neste mês:\n${JSON.stringify(ctx, null, 2)}\n\nGere UMA dica de no máximo 2 frases curtas, direta e PRESCRITIVA: diga exatamente qual alavanca atacar HOJE para avançar a meta. Priorize a venda mais barata (quem já respondeu e foi ignorado > visita agendada sem comparecimento > parados). Não cumprimente, não repita os números crus, não use clichê motivacional. Português do Brasil, tom de diretor de vendas objetivo.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você é um diretor de vendas de imobiliária focado em ação. Responde em 1-2 frases, sem floreio." },
          { role: "user", content: prompt },
        ],
        max_tokens: 130,
        temperature: 0.6,
      }),
    });
    const out = await resp.json();
    const dica = out?.choices?.[0]?.message?.content?.trim();
    if (!dica) return json({ error: "sem resposta do modelo", detail: out }, 500);

    await sb.from("cockpit_dica_cache").upsert({ scope, dia, dica, context: ctx });
    return json({ dica, cached: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
