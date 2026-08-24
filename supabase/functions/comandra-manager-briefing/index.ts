import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function digits(p){ return (p||'').replace(/\D/g,''); }
function phoneVariants(p){ const noPlus=(p||'').replace(/^\+/,''); const v=[p,noPlus,`+${noPlus}`]; const m=noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if(m){v.push(m[1],`+${m[1]}`);} else if(/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)){v.push(`55${noPlus}`,`+55${noPlus}`);} return [...new Set(v.filter(Boolean))]; }

async function sendText(url,key,instance,phone,text){ try{ const r=await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({number:phone,text})}); return r.status>=200&&r.status<300; }catch{ return false; } }

async function resolveMgr(supabase,phone){
  const { data: chips } = await supabase.from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key, phone').in('phone',phoneVariants(phone));
  const chip=(chips||[]).find(c=>c.instance_name&&(c.evolution_api_url||'').startsWith('https://'))||(chips||[])[0];
  const ids=(chips||[]).map(c=>c.id);
  const { data: mgr } = await supabase.from('profiles').select('id, first_name, role, team_id, bot_instance_id').in('bot_instance_id', ids.length?ids:['00000000-0000-0000-0000-000000000000']).maybeSingle();
  if(!mgr) return null;
  return { ...mgr, phone, instance: chip?.instance_name, url: chip?.evolution_api_url||'https://api.ape77.com.br', key: chip?.evolution_api_key||'' };
}

async function computeEstado(supabase, mgr){
  const teamId=mgr.team_id, managerId=mgr.id;
  const { data: brs } = await supabase.from('profiles').select('id').eq('manager_id',managerId).eq('role','BROKER');
  const bids=(brs||[]).map(b=>b.id);
  const now=new Date(); const brt=new Date(now.getTime()-3*3600*1000);
  const y=brt.getUTCFullYear(), mo=brt.getUTCMonth(), dom=brt.getUTCDate();
  const monthDate=`${y}-${String(mo+1).padStart(2,'0')}-01`;
  const monthStartISO=new Date(Date.UTC(y,mo,1,3,0,0)).toISOString();
  const monthEndISO=new Date(Date.UTC(y,mo+1,1,3,0,0)).toISOString();
  const daysIn=new Date(Date.UTC(y,mo+1,0)).getUTCDate(); const daysLeft=Math.max(0,daysIn-dom);
  let meta=null; const { data: goals } = await supabase.from('team_goals').select('sales_target,month').eq('team_id',teamId).eq('goal_type','monthly').order('month',{ascending:false}).limit(8);
  const cur=(goals||[]).find(g=>String(g.month).slice(0,10)===monthDate); meta = cur?cur.sales_target:((goals||[])[0]?.sales_target ?? null);
  let realizado=0; try{ const {data}=await supabase.rpc('goals_team_sales_count',{p_start:monthStartISO,p_end:monthEndISO}); const rm=(data||[]).find(r=>r.team_id===teamId); if(rm)realizado=Number(rm.count)||0; }catch{}
  let gap=null, metaRisco=false, batida=false;
  if(meta!=null){ gap=Math.max(0,meta-realizado); const esperado=meta*(dom/daysIn); metaRisco = gap>0 && realizado < esperado*0.8; batida = gap<=0; }
  let quentes=0;
  if(bids.length){ const {data:ls}=await supabase.from('leads').select('last_lead_response_at,last_broker_whatsapp_at').in('broker_id',bids).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")').not('last_lead_response_at','is',null).limit(3000); for(const l of ls||[]){ const r=Date.parse(l.last_lead_response_at); const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; if(r>w)quentes++; } }
  let diagVerdict=null; try{ const {data:d}=await supabase.rpc('manager_diagnostico',{p_manager_id:managerId,p_days:30}); if(d) diagVerdict=d.verdict; }catch{}
  let fant=0, queima=0; try{ const {data:q}=await supabase.rpc('manager_quadrante',{p_manager_id:managerId,p_days:14}); for(const r of q||[]){ if(r.quadrante==='fantasma')fant++; else if(r.quadrante==='queima_lead')queima++; } }catch{}
  let estado='calmo';
  if(metaRisco) estado='meta_risco';
  else if(quentes>=3) estado='dinheiro';
  else if(diagVerdict==='sistema'||diagVerdict==='pessoa') estado='gargalo';
  else if(fant>=1||queima>=1) estado='quadrante';
  else if(batida || meta!=null) estado='boa';
  return { estado, gap, daysLeft, quentes, diagVerdict, fant, queima, meta, realizado, dayN: dom };
}

const HOOKS = {
  meta_risco: { normal:(n)=>[`${n}, preciso te mostrar uma coisa sobre a meta. Ta apertado — tem 5 min?`,`${n}, olhei a meta agora cedo e a gente precisa de um plano hoje. Posso te mostrar?`], escalado:(n)=>[`${n}, serio, precisamos conversar sobre a meta. Nao da pra deixar mais um dia passar.`] },
  dinheiro: { normal:(n)=>[`${n}, tem dinheiro parado na sua equipe agora. Te mostro?`,`${n}, achei uns clientes quentes esfriando no seu time. Quer ver quem?`], escalado:(n)=>[`${n}, de novo: tem venda saindo pela porta na sua equipe. Bora resolver hoje?`] },
  gargalo: { normal:(n)=>[`${n}, descobri por que sua meta ta travando. 👀`,`${n}, achei o furo da sua equipe. Quer que eu te mostre?`], escalado:(n)=>[`${n}, aquele furo que te falei continua aberto. Ataca comigo hoje?`] },
  quadrante: { normal:(n)=>[`${n}, tem gente na sua equipe queimando lead. Quer saber quem?`,`${n}, olhei quem ta produzindo e quem sumiu no seu time. Te passo?`], escalado:(n)=>[`${n}, os fantasmas do seu time continuam parados. Bora decidir?`] },
  boa: { normal:(n)=>[`${n}, tenho uma boa pra te dar hoje. 🏆`,`${n}, seu time fez uma coisa legal. Quer ver?`], escalado:(n)=>[`${n}, bom dia! Passa aqui rapidinho que tenho novidade boa.`] }
};
function pickHook(estado, nome, escalate, dayN){ const set=HOOKS[estado]; if(!set) return null; const arr=(escalate?set.escalado:set.normal)(nome); return arr[dayN % arr.length]; }

serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body=await req.json().catch(()=>({}));
    const preview = body?.preview===true;
    const todayStr = new Date(Date.now()-3*3600*1000).toISOString().slice(0,10);

    let phones=[];
    if(preview && body?.manager_phone){ phones=[String(body.manager_phone)]; }
    else { const { data: cfg } = await supabase.from('system_settings').select('value').eq('key','comandra_manager_briefing_phones').maybeSingle(); phones = Array.isArray(cfg?.value)?cfg.value:[]; }
    if(!phones.length) return new Response(JSON.stringify({success:true, note:'no pilots'}),{headers:{...corsHeaders,'Content-Type':'application/json'}});

    const out=[];
    for(const ph of phones){
      const mgr=await resolveMgr(supabase,ph);
      if(!mgr||!['MANAGER','SUPERINTENDENT'].includes(mgr.role)){ out.push({phone:ph, skip:'not_manager'}); continue; }
      const est=await computeEstado(supabase,mgr);
      if(est.estado==='calmo'){ out.push({phone:ph, manager:mgr.first_name, estado:'calmo', skip:'dia_calmo'}); continue; }
      // dedup + escalada via pending
      const { data: bstate } = await supabase.from('comandra_broker').select('pending_context').eq('broker_phone',mgr.phone).maybeSingle();
      const pend=bstate?.pending_context;
      let escalate=false;
      if(pend?.type==='briefing'){ if(pend.date===todayStr && !preview){ out.push({phone:ph, manager:mgr.first_name, estado:est.estado, skip:'ja_enviado_hoje'}); continue; } if(pend.date && pend.date<todayStr) escalate=true; }
      const nome=mgr.first_name||'gerente';
      const hook=pickHook(est.estado,nome,escalate,est.dayN);
      if(!hook){ out.push({phone:ph, manager:nome, estado:est.estado, skip:'sem_hook'}); continue; }
      if(preview){ out.push({phone:ph, manager:nome, estado:est.estado, escalate, hook, dados:{gap:est.gap, quentes:est.quentes, fant:est.fant, queima:est.queima, verdict:est.diagVerdict}}); continue; }
      const ok=await sendText(mgr.url,mgr.key,mgr.instance,mgr.phone,hook);
      if(ok){ await supabase.from('comandra_broker').upsert({broker_phone:mgr.phone, pending_context:{mgr:true, type:'briefing', estado:est.estado, date:todayStr}},{onConflict:'broker_phone'}); }
      out.push({phone:ph, manager:nome, estado:est.estado, escalate, sent:ok});
    }
    return new Response(JSON.stringify({success:true, preview, today:todayStr, results:out}, null, 2),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(err){ console.error('[comandra-manager-briefing]',err?.message); return new Response(JSON.stringify({error:err?.message}),{status:500,headers:corsHeaders}); }
});
