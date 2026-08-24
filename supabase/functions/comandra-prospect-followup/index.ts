import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — CADÊNCIA DE PROSPECÇÃO. 2º e 3º toque automaticos nos cold_contacts
// que receberam a abertura e NAO responderam. AGORA usa o KIT do corretor (anamnese):
// follow-ups na VOZ dele (texto OU audio gravado). Fallback = template generico (sem regressao).
// Vai pelo chip do PROPRIO corretor. Pacing + cap por corretor. 100% template / zero LLM.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const PER_BROKER_CAP = 5;
const RUN_CAP = 25;
const SEND_GAP_MS = 4000;
const ONLINE = ['open', 'active', 'online', 'connected'];

function firstName(n: string): string { return (n || '').trim().split(' ')[0] || ''; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneVariants(p: string): string[] { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function renderTpl(body: string, name: string): string { return (body || '').replace(/\{\s*nome\s*\}/gi, firstName(name) || 'tudo bem').trim(); }

function genericMsg(touch: number, name: string, tag: string): string {
  const nome = firstName(name); const oi = nome ? `Oi ${nome}` : 'Oi';
  const reg = tag ? ` na região de ${tag}` : ''; const reg2 = tag ? ` em ${tag}` : '';
  if (touch === 2) return `${oi}! 😊 Passei aqui de novo — separei algumas opções de apartamento do *Minha Casa Minha Vida*${reg} que encaixam bem. Quer que eu te mande? Sem compromisso.`;
  return `${nome || 'Ei'}, prometo que é a última 🙏 Se fizer sentido conhecer um apê do MCMV${reg2}, me chama que eu te mostro tudo — tem opção com entrada facilitada. Fico à disposição!`;
}

async function isBlocked(supabase: any, phone: string): Promise<boolean> { try { const { data } = await supabase.from('phone_blocklist').select('phone').in('phone', phoneVariants(phone)).limit(1).maybeSingle(); return !!data; } catch { return false; } }
async function sendAudioEvo(url: string, key: string, instance: string, phone: string, b64: string, _mime: string): Promise<boolean> { try { const audio = (b64 || '').replace(/^data:[^;]+;base64,/, ''); const r = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: digits(phone), audio }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const preview = body?.preview === true;
    const test = body?.test === true;
    const onlyId = body?.only_contact_id ? String(body.only_contact_id) : '';
    const runCap = Math.min(Number(body?.max) || RUN_CAP, 100);

    const brtHour = (new Date(Date.now() - 3 * 3600 * 1000)).getUTCHours();
    if (!preview && !test && (brtHour < 9 || brtHour >= 20)) {
      return new Response(JSON.stringify({ success: true, skipped: 'fora_horario', brtHour }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let qy = supabase.from('cold_contacts')
      .select('id, name, phone, tag, claimed_by, first_msg_sent_at, last_followup_at, prospect_touches')
      .eq('status', 'claimed').is('promoted_to_lead_id', null).not('first_msg_sent_at', 'is', null)
      .gte('first_msg_sent_at', new Date(Date.now() - 10 * 86400000).toISOString())
      .order('first_msg_sent_at', { ascending: true }).limit(runCap * 6);
    if (onlyId) qy = supabase.from('cold_contacts').select('id, name, phone, tag, claimed_by, first_msg_sent_at, last_followup_at, prospect_touches').eq('id', onlyId);
    const { data: cands } = await qy;
    if (!cands || !cands.length) return new Response(JSON.stringify({ success: true, eligible: 0, sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const now = Date.now();
    const due: any[] = [];
    for (const c of cands) {
      const eff = (c.prospect_touches && c.prospect_touches > 0) ? c.prospect_touches : 1;
      if (eff >= 3) continue;
      const firstMs = c.first_msg_sent_at ? Date.parse(c.first_msg_sent_at) : 0;
      const lastFu = c.last_followup_at ? Date.parse(c.last_followup_at) : 0;
      let nextTouch = 0;
      if (eff === 1 && firstMs && (now - firstMs) >= 24 * 3600000) nextTouch = 2;
      else if (eff === 2 && lastFu && (now - lastFu) >= 48 * 3600000) nextTouch = 3;
      else if (onlyId) nextTouch = eff + 1;
      if (nextTouch) due.push({ ...c, eff, nextTouch });
    }
    if (!due.length) return new Response(JSON.stringify({ success: true, eligible: cands.length, due: 0, sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const brokerIds = [...new Set(due.map((d) => d.claimed_by).filter(Boolean))];
    const { data: profs } = await supabase.from('profiles').select('id, first_name, phone, bot_instance_id').in('id', brokerIds);
    const profById: Record<string, any> = {}; (profs || []).forEach((p: any) => profById[p.id] = p);
    const botIds = [...new Set((profs || []).map((p: any) => p.bot_instance_id).filter(Boolean))];
    const { data: chips } = await supabase.from('bot_instances').select('id, status, evolution_api_url, evolution_api_key, instance_name').in('id', botIds);
    const chipById: Record<string, any> = {}; (chips || []).forEach((c: any) => chipById[c.id] = c);

    // KIT de follow-ups por corretor (por profile_id OU broker_phone)
    const brokerPhones = (profs || []).map((p: any) => p.phone).filter(Boolean);
    const { data: kitRows } = await supabase.from('comandra_broker_kit')
      .select('id, broker_phone, profile_id, slot_index, format, body, audio_base64, audio_mime')
      .eq('slot_type', 'followup').eq('is_active', true)
      .or(`profile_id.in.(${brokerIds.join(',')}),broker_phone.in.(${brokerPhones.map((p: string) => `"${p}"`).join(',') || '""'})`);
    const kitByBroker: Record<string, any[]> = {};
    (kitRows || []).forEach((k: any) => {
      const prof = (profs || []).find((p: any) => p.id === k.profile_id || p.phone === k.broker_phone);
      const bid = prof?.id || k.profile_id; if (!bid) return;
      (kitByBroker[bid] = kitByBroker[bid] || []).push(k);
    });
    Object.values(kitByBroker).forEach((arr: any) => arr.sort((a: any, b: any) => a.slot_index - b.slot_index));

    const perBroker: Record<string, number> = {};
    let sent = 0; const previews: any[] = []; const skips: Record<string, number> = {};
    const bump = (k: string) => { skips[k] = (skips[k] || 0) + 1; };

    for (const d of due) {
      if (sent >= runCap) break;
      const prof = profById[d.claimed_by];
      if (!prof?.bot_instance_id) { bump('sem_bot'); continue; }
      const chip = chipById[prof.bot_instance_id];
      if (!chip || !ONLINE.includes(String(chip.status))) { bump('chip_offline'); continue; }
      if ((perBroker[d.claimed_by] || 0) >= PER_BROKER_CAP) { bump('cap_corretor'); continue; }

      // escolhe slot do KIT (toque2->#0, toque3->#1, cicla); senao generico
      const kit = kitByBroker[d.claimed_by] || [];
      let useVoice = false, slot: any = null, msg = '';
      if (kit.length) { slot = kit[(d.nextTouch - 2 + kit.length) % kit.length]; useVoice = true; }
      if (slot && slot.format === 'text') msg = renderTpl(slot.body, d.name);
      else if (!slot) msg = genericMsg(d.nextTouch, d.name, d.tag);
      const isAudio = !!(slot && slot.format === 'audio' && slot.audio_base64);

      if (preview) { previews.push({ id: d.id, name: d.name, broker: prof.first_name, toque: d.nextTouch, voz: useVoice, formato: isAudio ? 'audio' : 'texto', msg: isAudio ? `(audio ${Math.round((slot.audio_base64.length) / 1024)}KB)` : msg }); perBroker[d.claimed_by] = (perBroker[d.claimed_by] || 0) + 1; sent++; continue; }

      let ok = false;
      if (isAudio) {
        if (await isBlocked(supabase, d.phone)) { bump('blocklist'); continue; }
        ok = await sendAudioEvo(chip.evolution_api_url, chip.evolution_api_key, chip.instance_name, d.phone, slot.audio_base64, slot.audio_mime);
      } else {
        try { const { error } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: prof.bot_instance_id, phone: d.phone, message: msg, send_source: 'prospect_followup' } }); ok = !error; } catch { ok = false; }
      }
      if (ok && !test) {
        await supabase.from('cold_contacts').update({ prospect_touches: d.nextTouch, last_followup_at: new Date().toISOString(), last_msg_sent_at: new Date().toISOString() }).eq('id', d.id);
        if (slot?.id) await supabase.from('comandra_broker_kit').update({ use_count: (slot.use_count || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', slot.id).then(() => {}, () => {});
      }
      if (ok) { sent++; perBroker[d.claimed_by] = (perBroker[d.claimed_by] || 0) + 1; }
      await sleep(SEND_GAP_MS);
    }

    if (preview) return new Response(JSON.stringify({ success: true, preview: true, eligible: cands.length, due: due.length, would_send: sent, previews }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, eligible: cands.length, due: due.length, sent, test, skips }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[comandra-prospect-followup] fatal', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
