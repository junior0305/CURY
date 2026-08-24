import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — Momento #6: PEDE DESCULPA. Gatilho: lead deu opt-out (entrou no phone_blocklist).
// Avisa o corretor (self-chat) que tirou o lead dos automáticos. Template/zero-token. Pilot-gated + chip online.
// body: { phone, preview? }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneVariants(p: string): string[] { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function phoneMatch(a: string, b: string): boolean { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n: string): string { return (n || '').split(' ')[0]; }
async function sendSelf(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const phone = body?.phone ? String(body.phone) : '';
    const preview = body?.preview === true;
    if (!phone) return json({ skipped: 'sem phone' });

    const { data: leads } = await sb.from('leads')
      .select('id, name, broker_id, last_interaction_at')
      .in('phone', phoneVariants(phone))
      .not('broker_id', 'is', null)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(1);
    const lead = (leads || [])[0];
    if (!lead) return json({ skipped: 'sem lead com corretor pra esse telefone' });

    const { data: broker } = await sb.from('profiles').select('id, first_name, phone, bot_instance_id').eq('id', lead.broker_id).maybeSingle();
    if (!broker?.phone) return json({ skipped: 'corretor sem telefone' });

    const { data: pcfg } = await sb.from('system_settings').select('value').eq('key', 'comandra_pilot_phones').maybeSingle();
    const pilots: string[] = Array.isArray(pcfg?.value) ? pcfg.value : [];
    if (!pilots.some((p) => phoneMatch(p, broker.phone))) return json({ skipped: 'corretor fora do piloto' });

    let chip: any = null;
    if (broker.bot_instance_id) { const { data: c } = await sb.from('bot_instances').select('instance_name, evolution_api_url, evolution_api_key, status').eq('id', broker.bot_instance_id).maybeSingle(); chip = c; }
    if (!chip) { const { data: cs } = await sb.from('bot_instances').select('instance_name, evolution_api_url, evolution_api_key, status').in('phone', phoneVariants(broker.phone)).limit(1); chip = (cs || [])[0]; }
    if (!chip || !['online', 'open'].includes((chip.status || '').toLowerCase())) return json({ skipped: 'chip do corretor offline' });

    const bnome = firstName(broker.first_name) || 'corretor';
    const lnome = firstName(lead.name) || 'esse lead';
    const msg = `🙏 Ó *${bnome}*, o lead *${lnome}* pediu pra parar de receber mensagem, então tirei ele(a) dos automáticos pra não queimar.\n\nSe quiser, fala com ele(a) no peito — às vezes no 1:1 vira. 🤝`;

    if (preview) return json({ preview: true, broker: bnome, lead: lnome, chip: chip.instance_name, msg });
    const ok = await sendSelf(chip.evolution_api_url || 'https://api.ape77.com.br', chip.evolution_api_key || '', chip.instance_name, broker.phone, msg);
    return json({ success: ok, broker: bnome, lead: lnome });
  } catch (err: any) {
    return json({ error: err?.message }, 500);
  }
});
