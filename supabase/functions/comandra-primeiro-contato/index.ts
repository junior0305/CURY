import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — PRIMEIRO CONTATO / SLA (Fatia 2) v5 DOUTRINA: NUNCA envia pro lead.
// So SUGERE pro corretor no self-chat (\"quer que eu mande seu welcome? responde SIM\") — leitura de estado + parceria.
// Anti-massa: CAP por rodada + ritmo (sleep). Vertical-aware. Piloto-gated. O welcome AUTOMATICO de lead
// fresco do Make (1 a 1, pelo gate) e um HOOK no incoming-lead, NAO este cron.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function digits(p) { return (p || '').replace(/\D/g, ''); }
function phoneMatch(a, b) { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n) { return (n || 'o cliente').trim().split(' ')[0] || 'o cliente'; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendSelf(url, key, instance, phone, text) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }), signal: ctrl.signal });
    clearTimeout(t); return r.status >= 200 && r.status < 300;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const body = await req.json().catch(() => ({}));
  const onlyLead = body?.lead_id ? String(body.lead_id) : '';
  const dry = body?.preview === true;

  const { data: scfg } = await sb.from('system_settings').select('key,value').in('key', ['comandra_pilot_phones', 'comandra_pc_whisper_min', 'comandra_pc_max_per_run']);
  const smap = {}; for (const r of (scfg || [])) smap[r.key] = r.value;
  const pilots = Array.isArray(smap['comandra_pilot_phones']) ? smap['comandra_pilot_phones'] : [];
  const whisperMin = Number(smap['comandra_pc_whisper_min']) || 10;
  const maxPerRun = Number(smap['comandra_pc_max_per_run']) || 3; // ANTI-MASSA: teto de sugestoes por rodada
  const now = Date.now();
  const staleCut = new Date(now - 6 * 3600000).toISOString();
  const whisperCut = new Date(now - whisperMin * 60000).toISOString();

  let cq = sb.from('leads')
    .select('id,name,phone,created_at,broker_id,tipo_bem, broker:profiles!broker_id(first_name,bot_instance_id,team_id)')
    .eq('status', 'NEW').eq('contact_attempts', 0).is('last_broker_whatsapp_at', null).is('last_lead_response_at', null)
    .eq('pause_auto_messages', false).gt('created_at', staleCut)
    .order('created_at', { ascending: false }).limit(40);
  if (onlyLead) cq = cq.eq('id', onlyLead); else cq = cq.lt('created_at', whisperCut);
  const { data: cand } = await cq;

  const results = []; let sugeridos = 0;
  for (const l of (cand || [])) {
    if (sugeridos >= maxPerRun && !dry) break; // CAP por rodada
    try {
      const broker = l.broker; if (!broker?.bot_instance_id) continue;
      const { data: chip } = await sb.from('bot_instances').select('id,instance_name,evolution_api_url,evolution_api_key,phone,status,real_state').eq('id', broker.bot_instance_id).maybeSingle();
      if (!chip?.phone || !pilots.some((pp) => phoneMatch(pp, chip.phone))) continue;
      const chipAlive = chip.real_state === 'open' || ['open', 'online'].includes(String(chip.status || '').toLowerCase());
      if (!chipAlive) { results.push({ lead: l.id, action: 'chip_offline' }); continue; }
      const { data: exist } = await sb.from('comandra_pending_action').select('id').eq('lead_id', l.id).eq('objective', 'primeiro_contato').limit(1).maybeSingle();
      if (exist) continue;

      let vertical = 'mcmv';
      if (broker.team_id) { const { data: tm } = await sb.from('teams').select('vertical').eq('id', broker.team_id).maybeSingle(); if (tm?.vertical) vertical = tm.vertical; }
      const { data: wa } = await sb.from('comandra_broker_kit').select('id').eq('broker_phone', chip.phone).eq('slot_type', 'welcome').eq('format', 'audio').eq('is_active', true).limit(1).maybeSingle();
      const welcomeWord = wa ? 'seu *audio* de boas-vindas' : 'sua mensagem de boas-vindas';
      const leadFirst = firstName(l.name);
      const msg = `🆕 *${leadFirst} entrou e ainda ta sem seu 1o contato.*\n⚡ Lead novo respondido rapido converte MUITO mais.\n\nQuer que eu mande ${welcomeWord} pra ele? Responde *SIM* que eu mando (leio a conversa antes pra nao atropelar) — ou fala com ele voce mesmo. 👊`;

      if (dry) { results.push({ lead: l.id, vertical, would_whisper: msg }); continue; }

      const url = chip.evolution_api_url || 'https://api.ape77.com.br';
      const okS = await sendSelf(url, chip.evolution_api_key || '', chip.instance_name, chip.phone, msg);
      if (okS) {
        await sb.from('comandra_pending_action').insert({ objective: 'primeiro_contato', status: 'sugerido', lead_id: l.id, lead_name: l.name, lead_phone: l.phone, broker_phone: chip.phone, profile_id: null, bot_instance_id: chip.id, instance_name: chip.instance_name }).then(() => {}, () => {});
        sugeridos++;
      }
      results.push({ lead: l.id, action: okS ? 'sugerido' : 'erro_envio', vertical });
      await sleep(1500); // RITMO anti-massa
    } catch (e) { results.push({ lead: l.id, action: 'erro', err: String(e?.message || e) }); }
  }

  return new Response(JSON.stringify({ ok: true, doutrina: 'suggestion_only', maxPerRun, sugeridos, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
