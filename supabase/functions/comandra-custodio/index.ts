import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function digits(p){ return (p||'').replace(/\D/g,''); }
function phoneVariants(p){ const noPlus=(p||'').replace(/^\+/,''); const v=[p,noPlus,`+${noPlus}`]; const m=noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if(m){v.push(m[1],`+${m[1]}`);} else if(/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)){v.push(`55${noPlus}`,`+55${noPlus}`);} return [...new Set(v.filter(Boolean))]; }
function phoneMatch(a,b){ const da=digits(a),db=digits(b); return !!da&&!!db&&(da===db||da.endsWith(db)||db.endsWith(da)); }
const fn=(n)=>(n||'Lead').split(' ')[0];
async function sendSelf(url,key,instance,phone,text){ try{ const r=await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({number:phone,text})}); return r.status>=200&&r.status<300; }catch{ return false; } }
function brtDate(off){ return new Date(Date.now()-3*3600*1000+(off||0)*86400000).toISOString().slice(0,10); }
function fmtHora(iso){ const m=/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso||''); if(!m) return ''; return `${m[3]}/${m[2]} ${m[4]}h${m[5]!=='00'?m[5]:''}`; }

async function resolveBroker(supabase, phone){
  const { data: chips } = await supabase.from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key, phone').in('phone', phoneVariants(phone));
  const chip=(chips||[]).find(c=>c.instance_name&&(c.evolution_api_url||'').startsWith('https://'))||(chips||[])[0];
  if(!chip) return null;
  const ids=(chips||[]).map(c=>c.id);
  const { data: prof } = await supabase.from('profiles').select('id, first_name').in('bot_instance_id', ids).limit(1).maybeSingle();
  if(!prof?.id) return null;
  return { phone, profileId:prof.id, firstName:prof.first_name||'corretor', instance:chip.instance_name, url:chip.evolution_api_url||'https://api.ape77.com.br', key:chip.evolution_api_key||'' };
}

async function buildCustodio(supabase, b){
  const pid=b.profileId; const now=new Date().toISOString(); const in36=new Date(Date.now()+36*3600*1000).toISOString(); const passou=new Date(Date.now()-2*3600*1000).toISOString(); const doc2d=new Date(Date.now()-2*86400000).toISOString(); const hoje=brtDate(0);
  const { data: vAmanha } = await supabase.from('leads').select('name,visit_scheduled_at').eq('broker_id',pid).eq('status','VISIT_SCHEDULED').gte('visit_scheduled_at',now).lt('visit_scheduled_at',in36).order('visit_scheduled_at',{ascending:true}).limit(4);
  const { data: vPassou } = await supabase.from('leads').select('name,visit_scheduled_at').eq('broker_id',pid).eq('status','VISIT_SCHEDULED').lt('visit_scheduled_at',passou).order('visit_scheduled_at',{ascending:false}).limit(4);
  const { data: docs } = await supabase.from('leads').select('name,last_interaction_at').eq('broker_id',pid).eq('status','DOCS_REQUESTED').lt('last_interaction_at',doc2d).order('last_interaction_at',{ascending:true}).limit(4);
  const { data: retorno } = await supabase.from('leads').select('name,next_action_date').eq('broker_id',pid).not('next_action_date','is',null).lte('next_action_date',hoje).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")').order('next_action_date',{ascending:true}).limit(4);
  const secs=[];
  if((vAmanha||[]).length){ secs.push(`📅 *Visita chegando:*\n`+vAmanha.map(l=>`• ${fn(l.name)} — ${fmtHora(l.visit_scheduled_at)}`).join('\n')+`\n_Quer que eu monte a confirmacao pra mandar?_`); }
  if((retorno||[]).length){ secs.push(`🔁 *Retorno combinado (hoje ou atrasado):*\n`+retorno.map(l=>`• ${fn(l.name)}`).join('\n')); }
  if((docs||[]).length){ secs.push(`📄 *Documentos parados (2d+):*\n`+docs.map(l=>`• ${fn(l.name)}`).join('\n')+`\n_Cutuca pra andar?_`); }
  if((vPassou||[]).length){ secs.push(`❓ *Visita ja passou e o lead segue em VISIT_SCHEDULED:*\n`+vPassou.map(l=>`• ${fn(l.name)} — ${fmtHora(l.visit_scheduled_at)}`).join('\n')+`\n_Veio? Atualiza pra eu cobrar os docs._`); }
  if(!secs.length) return null;
  return [`🗂️ *${b.firstName}, teu funil precisa de voce:*`,``,...secs,``,`💪 Me chama *\"o que faco hoje\"* que eu abro tudo.`].join('\n');
}

serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body=await req.json().catch(()=>({}));
    const preview=body?.preview===true; const onlyPhone=body?.only_phone?String(body.only_phone):'';
    const { data: pcfg } = await supabase.from('system_settings').select('value').eq('key','comandra_pilot_phones').maybeSingle();
    let pilots=Array.isArray(pcfg?.value)?pcfg.value:[];
    if(onlyPhone) pilots=pilots.filter(p=>phoneMatch(p,onlyPhone));
    else if(preview && body?.manager_phone) pilots=[String(body.manager_phone)];
    if(!pilots.length) return new Response(JSON.stringify({success:true,note:'no pilots'}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    const out=[]; let sent=0;
    for(const ph of pilots){
      const b=await resolveBroker(supabase,ph); if(!b){ out.push({phone:ph,skip:'no_broker'}); continue; }
      const txt=await buildCustodio(supabase,b);
      if(!txt){ out.push({phone:ph,broker:b.firstName,skip:'nada'}); continue; }
      if(preview){ out.push({phone:ph,broker:b.firstName,text:txt}); continue; }
      const ok=await sendSelf(b.url,b.key,b.instance,b.phone,txt); if(ok)sent++;
      out.push({phone:ph,broker:b.firstName,sent:ok});
    }
    return new Response(JSON.stringify({success:true,preview,sent,results:out},null,2),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(err){ console.error('[comandra-custodio]',err?.message); return new Response(JSON.stringify({error:err?.message}),{status:500,headers:corsHeaders}); }
});
