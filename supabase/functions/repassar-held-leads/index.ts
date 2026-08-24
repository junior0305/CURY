import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const digits = (p) => (p||'').replace(/\D/g,'');
const first = (n) => (n||'').split(' ')[0] || (n||'');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['NEW','IN_PROGRESS','NEGOTIATING','VISIT_SCHEDULED','VISITA_REALIZADA','DOCS_REQUESTED','REACTIVATED','FOLLOW_UP_AUTO'];

function calcFaixa(renda) {
  if (!renda) return null;
  const clean = String(renda).replace(/R\$|\s/g,'').replace(/\./g,'').replace(',','.');
  const v = parseFloat(clean);
  if (isNaN(v) || v <= 0) return null;
  if (v <= 2640) return 'Faixa 1';
  if (v <= 4400) return 'Faixa 2';
  if (v <= 8000) return 'Faixa 3';
  return null;
}

async function notifyBrokerViaManager(supabase, broker, message) {
  try {
    if (!broker?.phone) return false;
    let botId = null;
    if (broker.manager_id) { const { data:m } = await supabase.from('profiles').select('bot_instance_id').eq('id', broker.manager_id).maybeSingle(); botId = m?.bot_instance_id || null; }
    let junior = null;
    { const { data:bs } = await supabase.from('system_settings').select('value').eq('key','notification_bot_instance_id').maybeSingle(); junior = bs?.value || null; }
    let ok = false;
    if (botId) { const { data:r } = await supabase.functions.invoke('send_whatsapp_message', { body:{ botId, phone: broker.phone, message } }); ok = r?.success || false; }
    if (!ok && junior && junior !== botId) { const { data:r2 } = await supabase.functions.invoke('send_whatsapp_message', { body:{ botId: junior, phone: broker.phone, message } }); ok = r2?.success || false; }
    return ok;
  } catch { return false; }
}

function buildMsg(corretor, broker, lead) {
  const nome = lead.name || 'Lead';
  const f = first(nome);
  const leadDigits = digits(lead.phone);
  const brokerDigits = digits(broker.phone);
  const faixaLabel = calcFaixa(lead.renda_declarada);
  const rendaLine = [ lead.renda_declarada ? `💰 ${lead.renda_declarada}` : '', faixaLabel ? `(${faixaLabel})` : '' ].filter(Boolean).join(' ');
  const produto = lead.product || lead.tag || '';
  const askText = encodeURIComponent(`Comandra, me ajuda com ${f}`);
  const lines = [
    `🎯 *Chegou um lead pra você, ${corretor}!*`,
    ``,
    `👤 *${nome}*${produto ? ` · 🏷️ ${produto}` : ''}`,
    `📞 ${lead.phone}`,
    `👉 Chamar agora: https://wa.me/${leadDigits}`,
    rendaLine,
    ``,
    `Sou a Comandra e trabalho junto com você 🤝`,
    `• escrevo e envio a mensagem certa pra ${f}`,
    `• agendo a visita e te lembro na véspera e no dia`,
    `• monto a jogada pra você fechar a visita`,
    ``,
    `É só me chamar clicando abaixo 👇`,
    `👉 https://wa.me/${brokerDigits}?text=${askText}`,
  ].filter(l => l !== '');
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body = await req.json().catch(() => ({}));
    const hours = body.hours || 72;
    const limit = body.limit || 80;
    const dry = body.dry === true;
    const rrDry = {};

    const sinceIso = new Date(Date.now() - hours*3600*1000).toISOString();
    const { data: leadsRaw, error: qerr } = await supabase.from('leads')
      .select('id, name, phone, fb_campaign, product, tag, renda_declarada, tipo_trabalho, created_at')
      .eq('source','facebook_make').is('broker_id', null)
      .in('status', ACTIVE)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (qerr) return new Response(JSON.stringify({ error: 'query: '+qerr.message }), { status: 500, headers: corsHeaders });
    const leads = (leadsRaw || []).filter((l) => l.fb_campaign && String(l.fb_campaign).trim() !== '');

    const results = [];
    for (const lead of leads) {
      const { data: queues } = await supabase.from('distribution_queues').select('id, name, broker_ids, last_assigned_index')
        .eq('is_active', true).eq('match_field','campaign').ilike('match_value', lead.fb_campaign);
      const q = (queues || [])[0];
      if (!q || !(q.broker_ids?.length)) { results.push({ lead: lead.name, skip: 'sem_fila('+lead.fb_campaign+')' }); continue; }

      const { data: brokersAll } = await supabase.from('profiles').select('id, first_name, last_name, phone, manager_id, bot_instance_id, is_active, lead_assignment_enabled')
        .in('id', q.broker_ids).eq('role','BROKER');
      const ordered = (q.broker_ids||[]).map((id) => (brokersAll||[]).find((b) => b.id===id)).filter(Boolean)
        .filter((b) => b.is_active !== false && b.lead_assignment_enabled !== false);
      if (!ordered.length) { results.push({ lead: lead.name, skip: 'sem_corretor' }); continue; }

      let base;
      if (dry) { base = rrDry[q.id] || 0; rrDry[q.id] = base + 1; }
      else { base = q.last_assigned_index || 0; }
      const chosen = ordered[base % ordered.length];

      if (dry) { results.push({ lead: lead.name, fila: q.name, to: chosen.first_name }); continue; }

      await supabase.from('leads').update({ broker_id: chosen.id, status: 'IN_PROGRESS', last_interaction_at: new Date().toISOString() }).eq('id', lead.id);
      await supabase.from('distribution_queues').update({ last_assigned_index: base + 1 }).eq('id', q.id).then(()=>{},()=>{});
      const corretor = first(chosen.first_name) || 'corretor';
      const ok = await notifyBrokerViaManager(supabase, chosen, buildMsg(corretor, chosen, lead));
      await supabase.from('distribution_logs').insert({ lead_name: lead.name, lead_phone: lead.phone, assigned_to_name: `${chosen.first_name||''}`.trim(), queue_name: q.name, status: 'REPASSE_24H' }).then(()=>{},()=>{});
      results.push({ lead: lead.name, to: chosen.first_name, notified: ok });
      await sleep(1500);
    }

    return new Response(JSON.stringify({ candidatos: leads.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[repassar-held-leads]', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: corsHeaders });
  }
});
