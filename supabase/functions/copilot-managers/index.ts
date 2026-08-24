import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Você é o Copilot do Comandra, co-piloto de gestão para gerentes de equipes de corretores imobiliários (programa MCMV - Minha Casa Minha Vida).
Você escreve UMA mensagem curta de WhatsApp para o gerente, em português do Brasil, com tom de PARCEIRO e coach: direto, respeitoso, humano e motivador — nunca robótico, nunca acusatório.

Use APENAS os dados fornecidos. NUNCA invente nomes ou números.

Glossário das flags de cada corretor:
- descarte_alarme: descartou muitos leads no mês e vendeu 0 — provável critério de descarte solto. É alarme, trate como prioridade.
- queima_lead: recebeu muito lead, 0 venda e vários descartes — dinheiro pago indo embora.
- sem_primeiro_contato: tem vários leads NOVOS sem nenhum primeiro contato.
- carteira_parada: a maioria da carteira está parada há mais de 5 dias.

Estrutura da mensagem:
1) Cumprimento com o primeiro nome do gerente.
2) 2 a 4 pontos mais críticos (um por corretor), citando o número real. Use 🔴 para alarme (descarte_alarme/queima_lead) e 🟡 para atenção (sem_primeiro_contato/carteira_parada).
3) Se houver positivos, UMA linha 🟢 reconhecendo quem vendeu.
4) Feche com um chamado curto pra ele entrar no sistema HOJE e agir, e uma frase de apoio (\"conta comigo\").

Regras: máximo ~900 caracteres. SEM títulos markdown (é WhatsApp). Não liste mais de 4 corretores. Se não houver alertas nem positivos, responda exatamente: SKIP`;

async function genOpenAI(model: string, payload: string): Promise<string | null> {
  const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return null;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.6, max_tokens: 500,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: payload }] }),
  });
  if (!r.ok) { console.error('openai', r.status, await r.text()); return null; }
  const j = await r.json(); return j.choices?.[0]?.message?.content?.trim() || null;
}

async function genAnthropic(model: string, payload: string): Promise<string | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 500, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: payload }] }),
  });
  if (!r.ok) { console.error('anthropic', r.status, await r.text()); return null; }
  const j = await r.json(); return j.content?.[0]?.text?.trim() || null;
}

async function genGemini(model: string, payload: string): Promise<string | null> {
  const key = Deno.env.get('GEMINI_API_KEY'); if (!key) return null;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: payload }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, generationConfig: { temperature: 0.6, maxOutputTokens: 500 } }),
  });
  if (!r.ok) { console.error('gemini', r.status, await r.text()); return null; }
  const j = await r.json(); return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

function fallbackTemplate(sig: any): string | null {
  const al = sig.alertas || []; const pos = sig.positivos || [];
  if (!al.length && !pos.length) return null;
  const linhas: string[] = [`${sig.manager}, bom dia! Olhei sua equipe hoje:`];
  for (const a of al.slice(0,4)) {
    const sev = (a.flag === 'descarte_alarme' || a.flag === 'queima_lead') ? '🔴' : '🟡';
    if (a.flag === 'descarte_alarme') linhas.push(`${sev} ${a.corretor}: ${a.descartes_30d} descartes no mês e 0 vendas. Vale uma conversa sobre critério de descarte.`);
    else if (a.flag === 'queima_lead') linhas.push(`${sev} ${a.corretor}: recebeu ${a.recebidos_30d} leads, 0 venda e ${a.descartes_30d} descartes.`);
    else if (a.flag === 'sem_primeiro_contato') linhas.push(`${sev} ${a.corretor}: ${a.novos_sem_contato} leads novos sem primeiro contato.`);
    else linhas.push(`${sev} ${a.corretor}: ${a.parados_5d} de ${a.ativos} leads parados há +5 dias.`);
  }
  if (pos.length) linhas.push(`🟢 ${pos.map((p:any)=>`${p.corretor} (${p.vendas_30d} vendas)`).join(', ')} indo bem — reconhece com eles.`);
  linhas.push('Quando puder, entra no sistema e dá um direcionamento. Conta comigo. 💪');
  return linhas.join('\n');
}

async function generate(supabase:any, sig:any): Promise<{msg: string | null, provider: string}> {
  const { data: cfgs } = await supabase.from('ai_coach_llm_config').select('provider, model_name, priority').eq('is_active', true).order('priority');
  const payload = `Dados da equipe (JSON):\n${JSON.stringify(sig)}\n\nEscreva a mensagem de WhatsApp para o gerente ${sig.manager} seguindo as regras.`;
  for (const c of (cfgs || [])) {
    try {
      let out: string | null = null;
      if (c.provider === 'openai') out = await genOpenAI(c.model_name, payload);
      else if (c.provider === 'anthropic') out = await genAnthropic(c.model_name, payload);
      else if (c.provider === 'gemini') out = await genGemini(c.model_name, payload);
      if (out && out.trim()) {
        if (out.trim().toUpperCase() === 'SKIP') return { msg: null, provider: c.provider };
        return { msg: out.trim(), provider: c.provider };
      }
    } catch (e) { console.error('gen provider failed', c.provider, (e as any).message); }
  }
  return { msg: fallbackTemplate(sig), provider: 'template' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body = await req.json().catch(()=>({}));
    const dryRun = body?.dry_run === true;
    const onlyManager = body?.manager_id || null;

    const { data: botSetting } = await supabase.from('system_settings').select('value').eq('key','notification_bot_instance_id').maybeSingle();
    let botId = botSetting?.value; if (typeof botId === 'string') botId = botId.replace(/^\"|\"$/g,'');

    let q = supabase.from('profiles').select('id, first_name, phone').eq('role','MANAGER');
    if (onlyManager) q = q.eq('id', onlyManager);
    const { data: managers } = await q;

    const results: any[] = [];
    for (const m of (managers || [])) {
      if (!m.phone) { results.push({ manager: m.first_name, skipped: 'sem_telefone' }); continue; }
      if ((m.first_name||'').includes('[INATIVO]')) continue;
      const { data: sig } = await supabase.rpc('copilot_manager_signals', { p_manager_id: m.id });
      const hasContent = (sig?.alertas?.length || 0) > 0 || (sig?.positivos?.length || 0) > 0;
      if (!hasContent) { results.push({ manager: m.first_name, skipped: 'sem_sinais' }); continue; }

      const { msg, provider } = await generate(supabase, sig);
      if (!msg) { results.push({ manager: m.first_name, skipped: 'llm_skip' }); continue; }

      if (dryRun) { results.push({ manager: m.first_name, phone: m.phone, provider, message: msg }); continue; }

      let status = 'sent'; let err: string | null = null;
      try {
        const { error: sErr } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId, phone: m.phone, message: msg, send_source: 'broker_manual' } });
        if (sErr) { status = 'failed'; err = sErr.message; }
      } catch (e) { status = 'failed'; err = (e as any).message; }

      await supabase.from('copilot_logs').insert({ manager_id: m.id, manager_name: m.first_name, message: msg, signals: sig, provider, status, error: err });
      results.push({ manager: m.first_name, phone: m.phone, provider, status, error: err });
    }

    return new Response(JSON.stringify({ ok: true, dry_run: dryRun, count: results.length, results }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err:any) {
    console.error('[copilot-managers] error', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
