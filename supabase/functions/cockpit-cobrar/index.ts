import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// cockpit-cobrar — cobra um corretor 'devendo' (leads que responderam e ele não voltou).
// Whisper pro corretor + resumo pro gerente, DO CHIP DE NOTIFICAÇÃO (Junior).
// body: { broker_id, preview? }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const dlabel = (days: number) => days < 1 ? `${Math.max(1, Math.round(days * 24))}h` : `${Math.round(days)}d`;
const short = (s: string) => (s || 'lead').split(' ').slice(0, 2).join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const brokerId = body?.broker_id ? String(body.broker_id) : '';
    const preview = body?.preview === true;
    if (!brokerId) return json({ success: false, error: 'broker_id obrigatorio' }, 400);

    const { data: broker } = await sb.from('profiles').select('id, first_name, phone, manager_id').eq('id', brokerId).maybeSingle();
    if (!broker) return json({ success: false, error: 'corretor nao encontrado' }, 404);
    let mgr: any = null;
    if (broker.manager_id) { const { data: m } = await sb.from('profiles').select('first_name, phone').eq('id', broker.manager_id).maybeSingle(); mgr = m; }

    // estatística de 'devendo' vinda do MESMO RPC do painel (consistência)
    const { data: dv } = await sb.rpc('cockpit_devedores', { p_limit: 300 });
    const me = (dv?.brokers || []).find((x: any) => x.broker_id === brokerId);
    if (!me || !me.count) return json({ success: true, nothing: true, detail: 'sem leads devendo' });

    const n = me.count;
    const worst = dlabel(Number(me.worst_days) || 0);
    const nomes = (me.leads || []).slice(0, 3).map((l: any) => short(l.name)).join(', ') + (n > 3 ? '…' : '');
    const firstName = (broker.first_name || 'Corretor').split(' ')[0];
    const mgrName = (mgr?.first_name || 'Gerente').split(' ')[0];

    const msgBroker = `⚠️ *${firstName}*, você tem *${n} lead(s)* que te responderam e ficaram SEM retorno (o mais antigo há *${worst}*).\n\nResponde hoje: ${nomes}\n\nLead que responde e fica no vácuo esfria e vira reclamação. Dá o alô agora! ⚡`;
    const msgMgr = `📊 *${mgrName}*, cobrança do dia: seu corretor *${firstName}* está com *${n} lead(s)* que responderam e ficaram sem resposta (pior: ${worst}). Cobra ele pra não esfriar.`;

    if (preview) return json({ success: true, preview: true, broker: firstName, manager: mgrName, n, worst, msgBroker, msgMgr });

    const { data: cfg } = await sb.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    let botId = cfg?.value ? String(cfg.value).replace(/"/g, '') : '';
    if (!botId) { const { data: jb } = await sb.from('bot_instances').select('id').eq('instance_name', 'Junior').like('evolution_api_url', '%api.ape77%').limit(1).maybeSingle(); botId = jb?.id || ''; }
    if (!botId) return json({ success: false, error: 'notification bot nao configurado' });

    const out: any = { success: true, broker: firstName, n, worst, broker_sent: false, manager_sent: false };
    if (broker.phone) {
      const { data: r1 } = await sb.functions.invoke('send_whatsapp_message', { body: { botId, phone: broker.phone, message: msgBroker, send_source: 'broker_manual' } });
      out.broker_sent = r1?.success === true; if (!out.broker_sent) out.broker_detail = r1?.skipped || r1?.error || 'falhou';
    } else out.broker_detail = 'corretor sem telefone';
    if (mgr?.phone) {
      const { data: r2 } = await sb.functions.invoke('send_whatsapp_message', { body: { botId, phone: mgr.phone, message: msgMgr, send_source: 'broker_manual' } });
      out.manager_sent = r2?.success === true;
    } else out.manager_detail = 'gerente sem telefone';
    return json(out);
  } catch (err: any) {
    return json({ success: false, error: err?.message }, 500);
  }
});
