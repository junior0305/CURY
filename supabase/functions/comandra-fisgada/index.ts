import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — Motor #2: FISGADA do lead quente + cria HANDOFF pendente (Fatia 1 Jarvis).
// Trigger pg_net (AFTER UPDATE OF leads.last_lead_response_at). So pilotos. Whisper no self-chat.
// Alem do sussurro, abre comandra_pending_action(objective=handoff) = o RELOGIO pro comandra-handoff assumir.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const COOLDOWN_MS = 2 * 3600 * 1000;

function digits(p) { return (p || '').replace(/\D/g, ''); }
function phoneMatch(a, b) { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n) { return (n || 'o lead').trim().split(' ')[0] || 'o lead'; }
function brtDate() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }

async function sendSelf(url, key, instance, phone, text) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }), signal: ctrl.signal });
    clearTimeout(t);
    return r.status >= 200 && r.status < 300;
  } catch { return false; }
}

function fisgadaMsg(leadFirst, snippet, intent, catchesToday, timeoutMin) {
  const lines = [`🎣 *Fisgou! ${leadFirst} respondeu agora.*`];
  const snip = (snippet || '').replace(/^🎤\s*/, '').trim();
  if (snip) lines.push(`\n💬 \"${snip.length > 140 ? snip.slice(0, 140) + '…' : snip}\"`);
  else lines.push(`\n💬 (mandou um áudio/mídia — abre pra ver)`);
  if (intent === 'quente') lines.push(`\n🔥 Tá QUENTE — esse quer andar. Vai pra cima.`);
  else lines.push(`\n🌡️ Bateu o sino — puxa pra visita antes de esfriar.`);
  lines.push(`⚡ Lead com o celular na mão fecha visita. *Responde nos próximos minutos.*`);
  lines.push(`\n⏱️ Se você não responder ${leadFirst} em ${timeoutMin} min, eu assumo por você.`);
  if (catchesToday >= 2) lines.push(`\n🏆 ${catchesToday}ª resposta que você puxa hoje. Tá voando!`);
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const leadId = body?.lead_id ? String(body.lead_id) : '';
    let snippet = body?.snippet ? String(body.snippet) : null;
    const preview = body?.preview === true;
    const test = body?.test === true;
    if (!leadId) return new Response(JSON.stringify({ ok: false, reason: 'no lead_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: lead } = await supabase.from('leads')
      .select('id, name, phone, status, broker_id, comandra_fisgada_at, broker:profiles!broker_id(id, first_name, bot_instance_id)')
      .eq('id', leadId).maybeSingle();
    if (!lead || !lead.broker_id) return new Response(JSON.stringify({ ok: false, reason: 'no lead/broker' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const broker = lead.broker;
    if (!broker?.bot_instance_id) return new Response(JSON.stringify({ ok: false, reason: 'broker sem chip' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: chip } = await supabase.from('bot_instances')
      .select('instance_name, evolution_api_url, evolution_api_key, phone, status')
      .eq('id', broker.bot_instance_id).maybeSingle();
    if (!chip?.instance_name || !chip?.phone) return new Response(JSON.stringify({ ok: false, reason: 'chip incompleto' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: scfg } = await supabase.from('system_settings').select('key,value').in('key', ['comandra_pilot_phones', 'comandra_handoff_timeout_min']);
    const smap = {}; for (const r of (scfg || [])) smap[r.key] = r.value;
    const pilots = Array.isArray(smap['comandra_pilot_phones']) ? smap['comandra_pilot_phones'] : [];
    const timeoutMin = Number(smap['comandra_handoff_timeout_min']) || 15;
    if (!pilots.some((p) => phoneMatch(p, chip.phone))) return new Response(JSON.stringify({ ok: false, reason: 'nao piloto' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!preview && !test && lead.comandra_fisgada_at && (Date.now() - Date.parse(lead.comandra_fisgada_at) < COOLDOWN_MS)) {
      return new Response(JSON.stringify({ ok: false, reason: 'cooldown' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!snippet) {
      const { data: conv } = await supabase.from('ia_conversations').select('id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (conv?.id) {
        const { data: m } = await supabase.from('ia_messages').select('message_text').eq('conversation_id', conv.id).eq('direction', 'incoming').order('created_at', { ascending: false }).limit(1).maybeSingle();
        snippet = m?.message_text || null;
      }
    }

    const { data: ls } = await supabase.from('lead_state').select('intencao').eq('lead_id', leadId).maybeSingle();
    const intent = ls?.intencao || null;

    const today = brtDate();
    const { data: catches } = await supabase.from('leads').select('last_lead_response_at').eq('broker_id', lead.broker_id).gte('last_lead_response_at', today + 'T03:00:00Z');
    const catchesToday = (catches || []).length;

    const msg = fisgadaMsg(firstName(lead.name), snippet, intent, catchesToday, timeoutMin);

    if (preview) return new Response(JSON.stringify({ ok: true, preview: true, to: chip.phone, instance: chip.instance_name, intent, catchesToday, msg }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const ok = await sendSelf(chip.evolution_api_url || 'https://api.ape77.com.br', chip.evolution_api_key || '', chip.instance_name, chip.phone, msg);
    if (!test) await supabase.from('leads').update({ comandra_fisgada_at: new Date().toISOString() }).eq('id', leadId);

    // NOVO: abre handoff pendente (o relogio). Dedup: so 1 handoff aberto por lead.
    if (ok && !preview && !test) {
      const { data: exist } = await supabase.from('comandra_pending_action').select('id').eq('lead_id', leadId).eq('objective', 'handoff').eq('status', 'aguardando').limit(1).maybeSingle();
      if (!exist) {
        await supabase.from('comandra_pending_action').insert({
          objective: 'handoff', status: 'aguardando', lead_id: leadId, lead_name: lead.name, lead_phone: lead.phone,
          broker_phone: chip.phone, profile_id: broker.id, bot_instance_id: broker.bot_instance_id, instance_name: chip.instance_name,
          message: (snippet || '').slice(0, 300)
        }).then(() => {}, () => {});
      }
    }

    return new Response(JSON.stringify({ ok, test, sent: ok ? 1 : 0, to: chip.phone, instance: chip.instance_name, intent, catchesToday }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[comandra-fisgada] fatal', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
