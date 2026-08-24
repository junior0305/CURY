import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const ACTIVE = '("CONCLUDED","EXCLUDED","ABANDONED")';
const digits = (p) => (p||'').replace(/\D/g,'');
function phoneVariants(p){ const noPlus=(p||'').replace(/^\+/,''); const v=[p,noPlus,`+${noPlus}`]; const m=noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if(m){v.push(m[1],`+${m[1]}`);} else if(/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)){v.push(`55${noPlus}`,`+55${noPlus}`);} return [...new Set(v.filter(Boolean))]; }
function brtToday(){ const b=new Date(Date.now()-3*3600*1000); const y=b.getUTCFullYear(),m=b.getUTCMonth(),d=b.getUTCDate(); return { date:`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, startISO:new Date(Date.UTC(y,m,d,3,0,0)).toISOString() }; }

async function sendText(url,key,instance,phone,text){ try{ const r=await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({number:phone,text})}); return r.status>=200&&r.status<300; }catch{ return false; } }

// ---- Textos (voz do card) ----
const inviteText = (nome) => [
`Oi ${nome}! Aqui e a Comandra, sua copiloto de gestao.`,``,
`Queria comecar a te dar um toque rapido de manha: o que ta pegando na equipe e por quem comecar o dia, sem voce caçar no sistema. Curto, e so quando tiver algo que vale.`,``,
`Posso comecar amanha? Responde *pode* ou *agora nao*.`].join('\n');

const openerText = (nome) => [
`Bom dia, ${nome}! Ja dei uma olhada na equipe. Tem coisa boa e tem coisa esquentando.`,``,
`Quer que eu te conte o que ta rolando agora, ou prefere o status do time?`].join('\n');

function cobrancaText(nome,q,level){
  if(level>=2){ return [`${nome}, e o segundo dia que te falo dos mesmos clientes parados.`,``,`Sao ${q} pessoas que ja responderam e estao te esperando. Preciso ver isso andando hoje.`,``,`Me diz o que esta travando.`].join('\n'); }
  return `Oi ${nome}, vi que voce esta com ${q} ${q===1?'lead esperando resposta':'leads esperando resposta'}. Da uma prioridade por favor. Quero comecar a organizar as coisas aqui.`;
}

function resumoText(nome,cobrados,deadchip){
  const L=[`Oi ${nome}, nao quis te encher de manha, mas isso nao dava pra esperar:`];
  if(cobrados.length){ L.push(``,`Cutuquei ${cobrados.length} ${cobrados.length===1?'corretor':'corretores'} por voce — ${cobrados.map(c=>c.name).join(', ')} (clientes esperando resposta).`); }
  if(deadchip.length){ L.push(``,`E ${deadchip.length===1?'esta':'estao'} com o chip caido: ${deadchip.map(d=>d.name).join(', ')}. Esses sao com voce — nao consigo cobrar por eles enquanto o WhatsApp deles ta fora.`); }
  L.push(``,`Qualquer coisa me chama.`);
  return L.join('\n');
}

async function teamHot(supabase, managerId){
  const { data: team } = await supabase.from('profiles').select('id, first_name, bot_instance_id').eq('manager_id',managerId).eq('role','BROKER');
  const rows=[];
  for(const b of team||[]){
    let chipLive=false;
    if(b.bot_instance_id){ const {data:bi}=await supabase.from('bot_instances').select('real_state,status').eq('id',b.bot_instance_id).maybeSingle(); const st=bi?.real_state||bi?.status; chipLive = st==='open'; }
    const {data:ls}=await supabase.from('leads').select('last_lead_response_at,last_broker_whatsapp_at').eq('broker_id',b.id).not('status','in',ACTIVE);
    let quentes=0;
    for(const l of ls||[]){ const r=l.last_lead_response_at?Date.parse(l.last_lead_response_at):0; const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; if(r>0&&r>w)quentes++; }
    rows.push({id:b.id,name:b.first_name,chipLive,quentes});
  }
  rows.sort((a,b)=>b.quentes-a.quentes);
  return rows;
}

async function logAction(supabase, managerId, brokerId, brokerName, action, level, detail){ try{ await supabase.from('comandra_manager_action_log').insert({manager_id:managerId, broker_id:brokerId, broker_name:brokerName, action, level, detail}); }catch{} }
async function setPend(supabase, phone, ctx){ try{ await supabase.from('comandra_broker').upsert({broker_phone:phone, pending_context:ctx},{onConflict:'broker_phone'}); }catch{} }

async function loadMgr(supabase, managerId){
  const { data: mgr } = await supabase.from('profiles').select('id, first_name, team_id, phone, bot_instance_id').eq('id',managerId).maybeSingle();
  if(!mgr) return null;
  let chip=null;
  if(mgr.bot_instance_id){ const {data:bi}=await supabase.from('bot_instances').select('instance_name,evolution_api_url,evolution_api_key,real_state,status,phone').eq('id',mgr.bot_instance_id).maybeSingle(); chip=bi; }
  const state = chip?.real_state||chip?.status||null;
  return { ...mgr, inst:chip?.instance_name, url:chip?.evolution_api_url||'https://api.ape77.com.br', key:chip?.evolution_api_key||'', chipLive: state==='open', chipState: state, mgrPhone: digits(chip?.phone||mgr.phone) };
}

serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const body=await req.json().catch(()=>({}));
    const mode=body.mode||'greet';
    const onlyId=body.only_manager_id||null;
    const { date: today, startISO: todayStart } = brtToday();

    if(mode==='test'){
      const inst=body.from_instance; const to=digits(body.to_phone); const nome=body.nome||'gerente';
      const {data:bi}=await supabase.from('bot_instances').select('evolution_api_url,evolution_api_key').eq('instance_name',inst).limit(1).maybeSingle();
      const url=bi?.evolution_api_url||'https://api.ape77.com.br'; const key=bi?.evolution_api_key||'';
      const a=await sendText(url,key,inst,to,inviteText(nome));
      const b=await sendText(url,key,inst,to,openerText(nome));
      return new Response(JSON.stringify({test:true, invite:a, opener:b}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    let q=supabase.from('comandra_manager_prefs').select('*').eq('is_pilot',true);
    if(onlyId) q=q.eq('manager_id',onlyId);
    const { data: prefs } = await q;
    const results=[];

    for(const pref of prefs||[]){
      const mgr=await loadMgr(supabase, pref.manager_id);
      if(!mgr){ results.push({id:pref.manager_id, skip:'no_profile'}); continue; }
      const nome=mgr.first_name||'gerente';

      if(mode==='preview'){ results.push({mgr:nome, chip:mgr.chipState, invite:inviteText(nome), opener:openerText(nome)}); continue; }

      if(mode==='greet'){
        // 1) ainda nao perguntado -> convite (acordo). So marca 'asked' se o envio REALMENTE saiu.
        if(pref.morning_optin===null && !pref.optin_asked_at){
          if(!mgr.chipLive){ results.push({mgr:nome, skip:'chip_off_invite', chip:mgr.chipState}); continue; }
          const ok=await sendText(mgr.url,mgr.key,mgr.inst,mgr.mgrPhone,inviteText(nome));
          if(ok){
            await supabase.from('comandra_manager_prefs').update({optin_asked_at:new Date().toISOString(), updated_at:new Date().toISOString()}).eq('manager_id',mgr.id);
            await setPend(supabase, mgr.mgrPhone, {mgr:true, type:'optin'});
            await logAction(supabase, mgr.id, null, null, 'invite', 1, '');
          }
          results.push({mgr:nome, sent:'invite', ok, chip_lies: !ok}); continue;
        }
        // 2) aceitou -> bom-dia (1x/dia). So marca greeted se saiu.
        if(pref.morning_optin===true){
          if(pref.greeted_date===today){ results.push({mgr:nome, skip:'already_greeted'}); continue; }
          if(!mgr.chipLive){ results.push({mgr:nome, skip:'chip_off', chip:mgr.chipState}); continue; }
          const ok=await sendText(mgr.url,mgr.key,mgr.inst,mgr.mgrPhone,openerText(nome));
          if(ok){
            await supabase.from('comandra_manager_prefs').update({greeted_date:today, updated_at:new Date().toISOString()}).eq('manager_id',mgr.id);
            await logAction(supabase, mgr.id, null, null, 'greet', 1, '');
          }
          results.push({mgr:nome, sent:'opener', ok, chip_lies: !ok}); continue;
        }
        results.push({mgr:nome, skip: pref.morning_optin===false?'declined':'awaiting_optin'}); continue;
      }

      if(mode==='enforce'){
        if(pref.morning_optin!==true){ results.push({mgr:nome, skip:'not_optin'}); continue; }
        if(pref.enforced_date===today){ results.push({mgr:nome, skip:'already_enforced'}); continue; }
        if(!mgr.chipLive){ results.push({mgr:nome, skip:'mgr_chip_off'}); continue; }
        const { data: talked } = await supabase.from('comandra_inbox').select('id').in('broker_phone', phoneVariants(mgr.mgrPhone)).gte('created_at', todayStart).limit(1);
        if(talked && talked.length){ results.push({mgr:nome, skip:'engaged'}); continue; }
        const team=await teamHot(supabase, mgr.id);
        const critical=team.filter(b=>b.quentes>=3 && b.chipLive);
        const deadchip=team.filter(b=>b.quentes>=3 && !b.chipLive);
        if(!critical.length && !deadchip.length){ results.push({mgr:nome, skip:'nothing_dying'}); continue; }
        const cobrados=[];
        for(const b of critical){
          if(cobrados.length>=3) break;
          const { data: already } = await supabase.from('comandra_manager_action_log').select('id').eq('broker_id',b.id).eq('action','cobranca').gte('created_at', todayStart).limit(1);
          if(already && already.length) continue;
          const since2d=new Date(Date.now()-2*24*3600*1000).toISOString();
          const { data: recent } = await supabase.from('comandra_manager_action_log').select('id').eq('broker_id',b.id).eq('action','cobranca').gte('created_at', since2d).limit(1);
          const level = (recent && recent.length) ? 2 : 1;
          const { data: bp } = await supabase.from('profiles').select('phone').eq('id',b.id).maybeSingle();
          let ok=false; if(bp?.phone) ok=await sendText(mgr.url,mgr.key,mgr.inst, digits(bp.phone), cobrancaText(b.name,b.quentes,level));
          if(ok){ await logAction(supabase, mgr.id, b.id, b.name, 'cobranca', level, `${b.quentes} esperando`); cobrados.push({...b, level}); }
        }
        if(cobrados.length || deadchip.length){
          await sendText(mgr.url,mgr.key,mgr.inst,mgr.mgrPhone, resumoText(nome, cobrados, deadchip.slice(0,5)));
          await logAction(supabase, mgr.id, null, null, 'resumo', 1, `cobrados=${cobrados.length} deadchip=${deadchip.length}`);
        }
        await supabase.from('comandra_manager_prefs').update({enforced_date:today, updated_at:new Date().toISOString()}).eq('manager_id',mgr.id);
        results.push({mgr:nome, cobrados:cobrados.map(c=>`${c.name}(${c.quentes},n${c.level})`), deadchip:deadchip.map(d=>d.name)}); continue;
      }

      results.push({mgr:nome, skip:'unknown_mode'});
    }

    return new Response(JSON.stringify({mode, count:(prefs||[]).length, results}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(err){ console.error('[comandra-morning]',err?.message); return new Response(JSON.stringify({error:err?.message}),{status:500,headers:corsHeaders}); }
});
