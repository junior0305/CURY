import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const GRAPH = 'https://graph.facebook.com/v20.0';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const b = await req.json().catch(()=>({}));
    const action = b.action || 'create';
    const { data: cfg } = await sb.from('whatsapp_config').select('*').eq('is_active',true).limit(1).maybeSingle();
    if (!cfg) return new Response(JSON.stringify({error:'no config'}),{status:500,headers:cors});
    const { data: tk } = await sb.from('fb_bm_tokens').select('token').eq('business_id',cfg.business_id).eq('is_active',true).limit(1).maybeSingle();
    const token = tk?.token; if (!token) return new Response(JSON.stringify({error:'no token'}),{status:500,headers:cors});

    // action=refresh: puxa status atualizado dos templates da Meta -> banco
    if (action === 'refresh') {
      const r = await fetch(`${GRAPH}/${cfg.waba_id}/message_templates?fields=name,status,category,id,language&limit=100&access_token=${token}`);
      const j = await r.json().catch(()=>null);
      for (const t of (j?.data||[])) {
        await sb.from('whatsapp_templates').update({ meta_status: t.status, category: t.category, meta_template_id: t.id, updated_at: new Date().toISOString() }).eq('name', t.name).eq('language', t.language||'pt_BR').then(()=>{},()=>{});
      }
      return new Response(JSON.stringify({ ok:true, count:(j?.data||[]).length }),{status:200,headers:{...cors,'Content-Type':'application/json'}});
    }

    // action=create: cria template (texto) na Meta + grava
    const name = String(b.name||'').toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,60);
    const body_text = String(b.body_text||'').trim();
    if (!name || !body_text) return new Response(JSON.stringify({error:'name e body_text obrigatorios'}),{status:400,headers:cors});
    const lang = b.language || 'pt_BR';
    const category = (b.category||'UTILITY').toUpperCase();
    const varCount = (body_text.match(/\{\{\d+\}\}/g)||[]).length;
    const components = [];
    if (b.header_text) components.push({ type:'HEADER', format:'TEXT', text:String(b.header_text).slice(0,60) });
    const bodyComp = { type:'BODY', text: body_text };
    if (varCount>0) { const ex = []; for (let i=0;i<varCount;i++) ex.push(b.example?.[i]||'exemplo'); bodyComp.example = { body_text:[ex] }; }
    components.push(bodyComp);
    if (b.footer_text) components.push({ type:'FOOTER', text:String(b.footer_text).slice(0,60) });

    const r = await fetch(`${GRAPH}/${cfg.waba_id}/message_templates`, { method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}, body: JSON.stringify({ name, language:lang, category, components }) });
    const j = await r.json().catch(()=>null);
    if (!r.ok || j?.error) return new Response(JSON.stringify({ ok:false, error: j?.error||'create_fail' }),{status:200,headers:{...cors,'Content-Type':'application/json'}});

    const vars = []; for (let i=0;i<varCount;i++) vars.push('var'+(i+1));
    await sb.from('whatsapp_templates').insert({ name, language:lang, category, header_type: b.header_text?'TEXT':'NONE', body_text, footer_text: b.footer_text||null, variables: vars, meta_status: j?.status||'PENDING', meta_template_id: j?.id||null, created_by: b.user_id||null });
    return new Response(JSON.stringify({ ok:true, id: j?.id, status: j?.status||'PENDING', category: j?.category||category }),{status:200,headers:{...cors,'Content-Type':'application/json'}});
  } catch (e) { return new Response(JSON.stringify({error:e?.message}),{status:500,headers:cors}); }
});
