import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const GRAPH = 'https://graph.facebook.com/v20.0';
function digits(p){ return (p||'').replace(/\D/g,''); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const b = await req.json().catch(()=>({}));
    const to = digits(b.to);
    if (!to) return new Response(JSON.stringify({error:'to required'}),{status:400,headers:cors});
    const kind = b.kind || (b.template_name ? 'template' : 'text');

    // config + token
    const { data: cfg } = await sb.from('whatsapp_config').select('*').eq('is_active',true).limit(1).maybeSingle();
    if (!cfg) return new Response(JSON.stringify({error:'no whatsapp_config'}),{status:500,headers:cors});
    const { data: tk } = await sb.from('fb_bm_tokens').select('token').eq('business_id',cfg.business_id).eq('is_active',true).limit(1).maybeSingle();
    const token = tk?.token;
    if (!token) return new Response(JSON.stringify({error:'no token for business'}),{status:500,headers:cors});

    // opt-out
    const { data: blocked } = await sb.from('phone_blocklist').select('phone').in('phone',[to,'+'+to]).limit(1).maybeSingle();
    if (blocked) return new Response(JSON.stringify({skipped:'opt_out'}),{status:200,headers:cors});

    // thread
    let { data: thread } = await sb.from('whatsapp_threads').select('*').eq('phone',to).maybeSingle();
    if (kind === 'text') {
      const open = thread?.window_open_until && new Date(thread.window_open_until) > new Date();
      if (!open) return new Response(JSON.stringify({error:'window_closed', hint:'fora das 24h — use template'}),{status:200,headers:cors});
    }

    // monta payload
    let payload;
    if (kind === 'template') {
      const comps = [];
      if (b.header_image_url) comps.push({ type:'header', parameters:[{ type:'image', image:{ link: b.header_image_url } }] });
      const params = Array.isArray(b.body_params) ? b.body_params : [];
      if (params.length) comps.push({ type:'body', parameters: params.map((p)=>({ type:'text', text:String(p) })) });
      payload = { messaging_product:'whatsapp', to, type:'template', template:{ name: b.template_name, language:{ code: b.template_lang || 'pt_BR' }, ...(comps.length?{components:comps}:{}) } };
    } else {
      payload = { messaging_product:'whatsapp', to, type:'text', text:{ body: String(b.text||''), preview_url: false } };
    }

    const r = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, { method:'POST', headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(()=>null);
    const wamid = j?.messages?.[0]?.id || null;
    const ok = r.ok && !!wamid;

    // garante thread
    if (!thread) {
      const { data: nt } = await sb.from('whatsapp_threads').insert({ phone: to, contact_name: b.name||null, lead_id: b.lead_id||null, campaign_id: b.campaign_id||null, ai_autoreply: b.ai_autoreply||false, last_outbound_at: new Date().toISOString() }).select('*').maybeSingle();
      thread = nt;
    } else {
      await sb.from('whatsapp_threads').update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', thread.id);
    }

    await sb.from('whatsapp_messages').insert({ wamid, thread_id: thread?.id||null, campaign_id: b.campaign_id||null, phone: to, direction:'outbound', msg_type: kind, body: kind==='text'? String(b.text||'') : (b.template_name||null), media_url: b.header_image_url||null, template_name: kind==='template'? b.template_name : null, status: ok?'sent':'failed', error: ok? null : (j?.error||{ raw:'send_failed' }) });

    return new Response(JSON.stringify({ ok, wamid, error: ok? null : (j?.error||null) }), { status: 200, headers: { ...cors, 'Content-Type':'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message }), { status: 500, headers: cors });
  }
});
