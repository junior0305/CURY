import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — Anti-no-show (Fase 2). Sussurra no chip do corretor o script de confirmação da visita:
//  phase=vespera → visita AMANHÃ ; phase=dia → visita HOJE ; + alerta de visita que passou e ficou parada.
// 100% template. Pilot-gated + chip online. body: { phase, preview?, test?, only_phone? }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneVariants(p: string): string[] { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function phoneMatch(a: string, b: string): boolean { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n: string): string { return (n || 'o cliente').split(' ')[0]; }
function hhmm(iso: string): string { const m = /T(\d{2}):(\d{2})/.exec(iso || ''); if (!m) return 'no horario combinado'; return `${m[1]}h${m[2] !== '00' ? m[2] : ''}`; }
function ddmm(iso: string): string { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}` : ''; }
async function sendSelf(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }

async function resolveBroker(sb: any, phone: string) {
  const { data: chips } = await sb.from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key, phone, status').in('phone', phoneVariants(phone));
  const chip = (chips || []).find((c: any) => c.instance_name && (c.evolution_api_url || '').startsWith('https://')) || (chips || [])[0];
  if (!chip) return null;
  const online = ['online', 'open'].includes((chip.status || '').toLowerCase());
  const chipIds = (chips || []).map((c: any) => c.id);
  const { data: prof } = await sb.from('profiles').select('id, first_name').in('bot_instance_id', chipIds).limit(1).maybeSingle();
  if (!prof?.id) return null;
  return { phone, profileId: prof.id, firstName: prof.first_name || 'corretor', instance: chip.instance_name, url: chip.evolution_api_url || 'https://api.ape77.com.br', key: chip.evolution_api_key || '', online };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const phase = body?.phase === 'dia' ? 'dia' : 'vespera';
    const preview = body?.preview === true; const test = body?.test === true;
    const onlyPhone = body?.only_phone ? String(body.only_phone) : '';

    const nowBrt = new Date(Date.now() - 3 * 3600 * 1000);
    const todayStart = Date.UTC(nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate()) + 3 * 3600 * 1000;
    const tomorrowStart = todayStart + 86400000; const dayAfter = tomorrowStart + 86400000;

    const { data: pcfg } = await sb.from('system_settings').select('value').eq('key', 'comandra_pilot_phones').maybeSingle();
    let pilots: string[] = Array.isArray(pcfg?.value) ? pcfg.value : [];
    if (onlyPhone) pilots = pilots.filter((p) => phoneMatch(p, onlyPhone));
    if (!pilots.length) return json({ success: true, sent: 0, note: 'no pilots' });

    let sent = 0; const previews: any[] = [];
    for (const ph of pilots) {
      const b = await resolveBroker(sb, ph);
      if (!b) continue;
      if (!preview && !b.online) continue; // chip offline: nao da pra sussurrar
      const { data: leads } = await sb.from('leads').select('id, name, visit_scheduled_at, visit_vespera_sent_at, visit_dia_sent_at, visit_cold_alert_at').eq('broker_id', b.profileId).eq('status', 'VISIT_SCHEDULED').not('visit_scheduled_at', 'is', null);
      for (const l of (leads || [])) {
        const t = Date.parse(l.visit_scheduled_at); if (isNaN(t)) continue;
        let msg = ''; const upd: any = {};
        if (phase === 'vespera' && t >= tomorrowStart && t < dayAfter && !l.visit_vespera_sent_at) {
          msg = `📅 *${b.firstName}*, amanhã (${ddmm(l.visit_scheduled_at)}, ${hhmm(l.visit_scheduled_at)}) tem a visita do *${l.name}*!\n\nConfirma com ele HOJE pra não furar — manda algo tipo:\n_“Oi ${firstName(l.name)}, passando pra confirmar nossa visita amanhã às ${hhmm(l.visit_scheduled_at)}. Tá tudo certo? Te mando como chegar 👍”_`;
          upd.visit_vespera_sent_at = new Date().toISOString();
        } else if (phase === 'dia' && t >= todayStart && t < tomorrowStart && !l.visit_dia_sent_at) {
          msg = `🔔 *${b.firstName}*, HOJE às ${hhmm(l.visit_scheduled_at)} é a visita do *${l.name}*!\n\nDá um bom-dia confirmando:\n_“Bom dia ${firstName(l.name)}! Tudo pronto pra nossa visita hoje às ${hhmm(l.visit_scheduled_at)}? Te espero, vai valer muito a pena! 🏠”_`;
          upd.visit_dia_sent_at = new Date().toISOString();
        } else if (phase === 'dia' && t < (Date.now() - 12 * 3600 * 1000) && !l.visit_cold_alert_at) {
          msg = `⚠️ *${b.firstName}*, a visita do *${l.name}* era ${ddmm(l.visit_scheduled_at)} (${hhmm(l.visit_scheduled_at)}) e tá parada aqui.\n\nRolou? Se *compareceu*, me fala que eu avanço pra documentos. Se *furou*, bora remarcar agora antes de esfriar.`;
          upd.visit_cold_alert_at = new Date().toISOString();
        }
        if (!msg) continue;
        if (preview) { previews.push({ broker: b.firstName, lead: l.name, msg }); continue; }
        const ok = await sendSelf(b.url, b.key, b.instance, b.phone, msg);
        if (ok && !test) await sb.from('leads').update(upd).eq('id', l.id);
        if (ok) sent++;
      }
    }
    if (preview) return json({ success: true, phase, preview: true, previews });
    return json({ success: true, phase, test, sent });
  } catch (err: any) { return json({ error: err?.message }, 500); }
});
