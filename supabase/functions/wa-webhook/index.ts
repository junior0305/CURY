import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function aiReply(history, openaiKey){
  try {
    const sys = 'Voce e um assistente de uma imobiliaria MCMV respondendo um lead no WhatsApp oficial da empresa. Responda curto, caloroso, brasileiro. Objetivo: qualificar (o que procura, regiao, renda aprox) e empurrar pra uma visita. NAO invente valores, NAO prometa aprovacao de banco. So a mensagem, sem aspas.';
    const r = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+openaiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:history}],max_tokens:200,temperature:0.6})});
    const j = await r.json().catch(()=>null); return (j?.choices?.[0]?.message?.content||'').trim()||null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');

  // -- verificacao (GET) --
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const mode = u.searchParams.get('hub.mode');
    const token = u.searchParams.get('hub.verify_token');
    const challenge = u.searchParams.get('hub.challenge');
    const { data: cfg } = await sb.from('whatsapp_config').select('verify_token').eq('is_active',true).limit(1).maybeSingle();
    if (mode === 'subscribe' && token && token === cfg?.verify_token) return new Response(challenge||'', { status: 200 });
    return new Response('forbidden', { status: 403 });
  }

  try {
    const payload = await req.json().catch(()=>null);
    const now = new Date();
    for (const entry of (payload?.entry||[])) {
      for (const ch of (entry?.changes||[])) {
        const v = ch?.value || {};

        // === STATUS (sent/delivered/read/failed + pricing) ===
        for (const st of (v.statuses||[])) {
          const upd = { status: st.status };
          if (st.pricing?.category) upd.pricing_category = st.pricing.category;
          if (st.errors?.length) upd.error = st.errors[0];
          const { data: m } = await sb.from('whatsapp_messages').update(upd).eq('wamid', st.id).select('campaign_id').maybeSingle();
          if (m?.campaign_id) {
            const col = st.status==='delivered'?'delivered_count':st.status==='read'?'read_count':st.status==='failed'?'failed_count':null;
            if (col) await sb.rpc('wa_bump', { p_campaign: m.campaign_id, p_col: col }).then(()=>{},()=>{});
          }
        }

        // === MENSAGENS DE ENTRADA (lead respondeu) ===
        for (const msg of (v.messages||[])) {
          const from = (msg.from||'').replace(/\D/g,'');
          if (!from) continue;
          const contactName = v.contacts?.[0]?.profile?.name || null;
          const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || (msg.type && msg.type!=='text' ? `[${msg.type}]` : '');
          const winUntil = new Date(now.getTime() + 24*3600*1000).toISOString();

          let { data: th } = await sb.from('whatsapp_threads').select('*').eq('phone', from).maybeSingle();
          if (!th) {
            const { data: nt } = await sb.from('whatsapp_threads').insert({ phone: from, contact_name: contactName, last_inbound_at: now.toISOString(), window_open_until: winUntil, unread: 1, status:'open' }).select('*').maybeSingle();
            th = nt;
          } else {
            await sb.from('whatsapp_threads').update({ last_inbound_at: now.toISOString(), window_open_until: winUntil, unread: (th.unread||0)+1, contact_name: th.contact_name||contactName, status: th.status==='opted_out'?th.status:'open', updated_at: now.toISOString() }).eq('id', th.id);
          }

          await sb.from('whatsapp_messages').insert({ wamid: msg.id, thread_id: th?.id||null, campaign_id: th?.campaign_id||null, phone: from, direction:'inbound', msg_type: msg.type||'text', body: text }).then(()=>{},()=>{});
          if (th?.campaign_id) await sb.rpc('wa_bump', { p_campaign: th.campaign_id, p_col: 'reply_count' }).then(()=>{},()=>{});

          // ROTEAR: lead mostrou interesse -> corretor da campanha (fila/especifico) se ainda nao tem dono
          if (th && !th.assigned_broker_id && th.campaign_id) {
            const { data: camp } = await sb.from('whatsapp_campaigns').select('target_broker_id, target_queue_id').eq('id', th.campaign_id).maybeSingle();
            let broker = camp?.target_broker_id || null;
            if (!broker && camp?.target_queue_id) {
              const { data: q } = await sb.from('distribution_queues').select('broker_ids').eq('id', camp.target_queue_id).maybeSingle();
              const ids = (q?.broker_ids||[]);
              if (ids.length) {
                const { data: elig } = await sb.from('profiles').select('id').in('id', ids).eq('role','BROKER').eq('is_active', true).neq('lead_assignment_enabled', false);
                const pool = (elig||[]).map(x=>x.id);
                if (pool.length) broker = pool[(th.unread||1) % pool.length];
              }
            }
            if (broker) {
              await sb.from('whatsapp_threads').update({ assigned_broker_id: broker }).eq('id', th.id);
              th.assigned_broker_id = broker;
              await sb.from('internal_notifications').insert({ to_id: broker, type:'WA_LEAD_INTERESSADO', title:'🔥 Lead interessado (disparo oficial)', message: `${contactName||from} respondeu o disparo e quer atendimento.` }).then(()=>{},()=>{});
            }
          }

          // IA autoreply (se ligado no thread/campanha) e dentro da janela
          if (th?.ai_autoreply) {
            const openaiKey = Deno.env.get('OPENAI_API_KEY')||'';
            if (openaiKey && text) {
              const { data: hist } = await sb.from('whatsapp_messages').select('direction,body').eq('thread_id', th.id).order('created_at',{ascending:false}).limit(8);
              const h = (hist||[]).reverse().map(m=>`[${m.direction==='inbound'?'LEAD':'EMPRESA'}] ${m.body}`).join('\n');
              const reply = await aiReply(h, openaiKey);
              if (reply) await sb.functions.invoke('wa-sender', { body: { to: from, kind:'text', text: reply, ai_autoreply:true } }).then(()=>{},()=>{});
            }
          }
        }
      }
    }
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers: { ...cors, 'Content-Type':'application/json' } });
  } catch (e) {
    console.error('[wa-webhook]', e?.message);
    return new Response(JSON.stringify({ ok:true }), { status: 200, headers: { ...cors, 'Content-Type':'application/json' } }); // 200 sempre p/ Meta nao re-tentar em loop
  }
});
