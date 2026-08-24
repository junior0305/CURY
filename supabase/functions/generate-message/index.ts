import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function getKnowledge(agentId: string): Promise<string> {
  if (!agentId) return '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base?agent_id=eq.${agentId}&select=title,content,category&order=category`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const items = await res.json();
  if (!items?.length) return '';
  return items.map((i: any) => `## ${i.title}\n${i.content}`).join('\n\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });

  try {
    const body = await req.json();
    const { agent_id, system_prompt, user_message, history_text, max_tokens = 300, classification = false } = body;

    if (classification) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 80, system: system_prompt, messages: [{ role: 'user', content: user_message }] })
      });
      const data = await resp.json();
      return new Response(JSON.stringify({ text: data.content?.[0]?.text || '' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const knowledge = await getKnowledge(agent_id);
    const fullSystem = knowledge ? `${system_prompt}\n\n---\nBASE DE CONHECIMENTO:\n${knowledge}` : system_prompt;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens,
        system: [{ type: 'text', text: fullSystem, cache_control: { type: 'ephemeral' } }],
        messages: [
          ...(history_text ? [{ role: 'user', content: `Histórico:\n${history_text}` }, { role: 'assistant', content: 'Entendido, continuarei a conversa.' }] : []),
          { role: 'user', content: user_message }
        ]
      })
    });

    const data = await resp.json();
    return new Response(JSON.stringify({ text: data.content?.[0]?.text || '', usage: data.usage || {} }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});