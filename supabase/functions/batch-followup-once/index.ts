import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CONCURRENCY = 8;

function buildMessage(leadName: string, status: string): string {
  const first = leadName.trim().split(' ')[0];
  if (status === 'VISIT_SCHEDULED')
    return `Olá, ${first}! Tudo bem? 😊 Passando para confirmar nossa visita ao imóvel. Está tudo certo para o dia?`;
  if (status === 'NEGOTIATING' || status === 'DOCS_REQUESTED')
    return `Olá, ${first}! Tudo bem? 😊 Queria retomar nossa conversa sobre o imóvel. Tenho novidades para te mostrar — podemos conversar?`;
  return `Olá, ${first}! Tudo bem? 😊 Passando para ver se ainda posso te ajudar com seu imóvel. Tem alguma dúvida ou gostaria de conhecer algumas opções? Fico à disposição!`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, name, phone, status, broker_id, last_broker_whatsapp_at, created_at')
    .not('broker_id', 'is', null)
    .not('phone', 'is', null)
    .not('status', 'in', '(CONCLUDED,ABANDONED,EXCLUDED,FOLLOW_UP_AUTO)')
    .lt('created_at', cutoff48h);

  if (leadsErr) return new Response(JSON.stringify({ error: leadsErr.message }), { status: 500 });

  const stale = (leads || []).filter((l: any) =>
    !l.last_broker_whatsapp_at || l.last_broker_whatsapp_at < cutoff48h
  );

  if (stale.length === 0)
    return new Response(JSON.stringify({ sent: 0, message: 'Nenhum lead elegível' }), { status: 200 });

  const brokerIds = [...new Set(stale.map((l: any) => l.broker_id))];
  const { data: profiles } = await supabase
    .from('profiles').select('id, bot_instance_id')
    .in('id', brokerIds).not('bot_instance_id', 'is', null);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.bot_instance_id]));

  const botIds = [...new Set((profiles || []).map((p: any) => p.bot_instance_id).filter(Boolean))];
  const { data: bots } = await supabase
    .from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key, status')
    .in('id', botIds).in('status', ['open', 'active']);

  const botMap = new Map((bots || []).map((b: any) => [b.id, b]));

  const results: any = { sent: 0, failed: 0, skipped: 0, errors: [], total_eligible: stale.length };
  const now = new Date().toISOString();

  async function processLead(lead: any) {
    const botInstanceId = profileMap.get(lead.broker_id);
    if (!botInstanceId) { results.skipped++; return; }
    const bot = botMap.get(botInstanceId);
    if (!bot) { results.skipped++; return; }
    const phone = (lead.phone || '').replace(/\D/g, '');
    if (phone.length < 10) { results.skipped++; return; }

    try {
      const res = await fetch(`${bot.evolution_api_url}/message/sendText/${bot.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': bot.evolution_api_key },
        body: JSON.stringify({ number: phone, text: buildMessage(lead.name, lead.status) }),
      });
      if (res.ok) {
        await Promise.all([
          supabase.from('leads').update({ last_broker_whatsapp_at: now, last_interaction_at: now }).eq('id', lead.id),
          supabase.from('lead_notes').insert({ lead_id: lead.id, content: '📲 Follow-up automático enviado pelo chip — retomada de contato após 48h sem comunicação.' }),
        ]);
        results.sent++;
      } else {
        const errText = await res.text().catch(() => 'unknown');
        results.failed++;
        results.errors.push(`${lead.name}: ${errText.substring(0, 80)}`);
      }
    } catch (e: any) {
      results.failed++;
      results.errors.push(`${lead.name}: ${e.message}`);
    }
  }

  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    await Promise.all(stale.slice(i, i + CONCURRENCY).map(processLead));
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
