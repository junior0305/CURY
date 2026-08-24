import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function digits(p){ return (p||'').replace(/\D/g,''); }
const ACTIVE_NOT = '(\"ABANDONED\",\"EXCLUDED\",\"CONCLUDED\")';

// Resolve o publico do disparo -> whatsapp_campaign_targets (uma vez)
async function resolveAudience(sb, camp){
  const f = camp.audience_filter || {};
  const dias = Number(f.dias || f.days || 7);
  const cut = new Date(Date.now() - dias*86400000).toISOString();
  let rows = [];
  if (camp.audience_source === 'novos') {
    const { data } = await sb.from('leads').select('id,name,phone').gte('created_at', cut).not('status','in',ACTIVE_NOT).not('phone','is',null).limit(5000);
    rows = (data||[]).map(l=>({phone:l.phone,name:l.name,lead_id:l.id}));
  } else if (camp.audience_source === 'parados') {
    const { data } = await sb.from('leads').select('id,name,phone').lt('last_interaction_at', cut).not('status','in',ACTIVE_NOT).not('phone','is',null).limit(5000);
    rows = (data||[]).map(l=>({phone:l.phone,name:l.name,lead_id:l.id}));
  } else if (camp.audience_source === 'esfriando') {
    const { data } = await sb.from('leads').select('id,name,phone,last_lead_response_at').not('last_lead_response_at','is',null).lt('last_lead_response_at', cut).not('status','in',ACTIVE_NOT).not('phone','is',null).limit(5000);
    rows = (data||[]).map(l=>({phone:l.phone,name:l.name,lead_id:l.id}));
  } else if (camp.audience_source === 'prospeccao') {
    let q = sb.from('cold_contacts').select('id,name,phone').eq('status','available').not('phone','is',null).limit(5000);
    if (f.tag) q = q.eq('tag', f.tag);
    const { data } = await q;
    rows = (data||[]).map(c=>({phone:c.phone,name:c.name,lead_id:null}));
  } else { return 0; } // csv: alvos ja inseridos no upload
  // dedup + blocklist
  const seen = new Set(); const clean = [];
  for (const r of rows){ const d = digits(r.phone); if (!d || seen.has(d)) continue; seen.add(d); clean.push({ campaign_id: camp.id, phone: d, name: r.name||null, lead_id: r.lead_id }); }
  if (!clean.length) return 0;
  const { data: blk } = await sb.from('phone_blocklist').select('phone');
  const blocked = new Set((blk||[]).map(b=>digits(b.phone)));
  const final = clean.filter(c=>!blocked.has(c.phone));
  for (let i=0;i<final.length;i+=500){ await sb.from('whatsapp_campaign_targets').insert(final.slice(i,i+500)).then(()=>{},()=>{}); }
  return final.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body = await req.json().catch(()=>({}));

    // campanhas a processar: a passada, ou todas 'sending'
    let camps;
    if (body.campaign_id) { const { data } = await sb.from('whatsapp_campaigns').select('*').eq('id', body.campaign_id).maybeSingle(); camps = data?[data]:[]; }
    else { const { data } = await sb.from('whatsapp_campaigns').select('*').eq('status','sending').limit(5); camps = data||[]; }

    const out = [];
    for (const camp of camps) {
      if (camp.status !== 'sending') { out.push({camp:camp.id, skip:'not_sending'}); continue; }
      // resolve publico se ainda vazio (exceto csv)
      const { count: tcount } = await sb.from('whatsapp_campaign_targets').select('id',{count:'exact',head:true}).eq('campaign_id', camp.id);
      if ((tcount||0) === 0 && camp.audience_source !== 'csv') {
        const n = await resolveAudience(sb, camp);
        await sb.from('whatsapp_campaigns').update({ audience_count: n, started_at: camp.started_at || new Date().toISOString() }).eq('id', camp.id);
      }
      // template
      const { data: tpl } = await sb.from('whatsapp_templates').select('*').eq('id', camp.template_id).maybeSingle();
      if (!tpl) { out.push({camp:camp.id, err:'no_template'}); continue; }
      // batch de envio (throttle por chamada)
      const batch = Math.max(1, Math.min(Number(camp.throttle_per_min||10), 40));
      const { data: pend } = await sb.from('whatsapp_campaign_targets').select('*').eq('campaign_id', camp.id).eq('status','pending').limit(batch);
      if (!pend || !pend.length) {
        await sb.from('whatsapp_campaigns').update({ status:'done', finished_at: new Date().toISOString() }).eq('id', camp.id);
        out.push({camp:camp.id, done:true}); continue;
      }
      let sent=0, fail=0;
      for (const t of pend) {
        const firstName = (t.name||'tudo bem').split(' ')[0];
        let r=null;
        try { const inv = await sb.functions.invoke('wa-sender', { body: { to: t.phone, kind:'template', template_name: tpl.name, template_lang: tpl.language||'pt_BR', header_image_url: tpl.header_image_url||undefined, body_params: (tpl.variables&&tpl.variables.length)?[firstName]:[], campaign_id: camp.id, lead_id: t.lead_id, name: t.name, ai_autoreply: camp.ai_autoreply } }); r = inv?.data; } catch {}
        const okk = r?.ok === true;
        await sb.from('whatsapp_campaign_targets').update({ status: okk?'sent':'failed', error: okk?null:JSON.stringify(r?.error||'send_fail') }).eq('id', t.id);
        if (okk){ sent++; await sb.rpc('wa_bump',{p_campaign:camp.id,p_col:'sent_count'}).then(()=>{},()=>{}); } else fail++;
      }
      out.push({camp:camp.id, sent, fail, batch:pend.length});
    }
    return new Response(JSON.stringify({ ok:true, results: out }), { status:200, headers:{...cors,'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message }), { status:500, headers: cors });
  }
});
