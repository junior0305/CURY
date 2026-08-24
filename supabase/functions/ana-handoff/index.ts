import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const J = (o:any, s=200)=> new Response(JSON.stringify(o), { status:s, headers:{...cors,'Content-Type':'application/json'} });

// Handoff da Ana (SDR MCMV, roda no SJC) -> devolve o lead qualificado pro DONO no SP.
// Roda NO projeto SP, entao usa o service role do proprio SP (sem cross-cred).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const b = await req.json().catch(()=>({}));
    const phone = String(b.phone||'').replace(/\D/g,'');
    let lead:any = null;
    if (b.lead_id) { const { data } = await sb.from('leads').select('*').eq('id', b.lead_id).maybeSingle(); lead = data; }
    if (!lead && phone) { const { data } = await sb.from('leads').select('*').in('phone',[phone,'+'+phone,'55'+phone]).limit(1).maybeSingle(); lead = data; }
    if (!lead) return J({ error:'lead_not_found', phone });

    const cold = !!b.cold; // lead FRIO: nao respondeu a IA em 24h -> vai CRU pro corretor, como se fosse novo
    const dossie = String(b.dossie || (cold ? '' : 'Lead qualificado pela Ana.'));
    const nowIso = new Date().toISOString();
    const newNotes = cold ? (lead.notes || null) : ((lead.notes ? lead.notes + '\n\n' : '') + dossie);
    // PROJETO/PRODUTO pra mostrar ao corretor (empreendimento); ignora placeholders genericos
    const _pj = String(lead.product||'').trim(); const _tg = String(lead.tag||'').trim();
    const projeto = (_pj && !['GENERICO','FACEBOOK',''].includes(_pj.toUpperCase())) ? _pj
                  : (_tg && !['FACEBOOK','2QTOS-MCMV',''].includes(_tg.toUpperCase())) ? _tg : '';
    const projLine = projeto ? `\n🏢 ${projeto}` : '';
    // SEGUE A FILA DE ORIGEM (politica Junior): casa a distribution_queue do lead (match_field/match_value, ex tag=EQ_LILIANE)
    // e faz round-robin (menor carga) DENTRO do time daquela fila. Fallback global so se nao casar nenhuma.
    let queueName:any = null;
    if (!lead.broker_id) {
      let pool:string[] = [];
      const { data: queues } = await sb.from('distribution_queues').select('name,match_field,match_value,broker_ids,is_active').eq('is_active', true).order('created_at',{ascending:true});
      let q:any = null;
      // o match_field da fila ('campaign') persiste no lead como 'fb_campaign'; mapeia os demais 1:1
      const fieldMap:any = { campaign:'fb_campaign', tag:'tag', product:'product', source:'source' };
      for (const cand of (queues||[])) {
        if (!cand.match_field || cand.match_field === '*') { if (!q) q = cand; continue; }
        const col = fieldMap[cand.match_field] || cand.match_field;
        const expected = String(cand.match_value||'').trim().toUpperCase();
        const leadVal = String((lead as any)[col] || '').trim().toUpperCase();
        if (expected && leadVal && expected === leadVal) { q = cand; break; }
      }
      queueName = q?.name || null;
      if (Array.isArray(q?.broker_ids) && q.broker_ids.length) {
        const { data: qb } = await sb.from('profiles').select('id').in('id', q.broker_ids).eq('role','BROKER').eq('is_active',true).neq('lead_assignment_enabled',false);
        pool = (qb||[]).map((x:any)=>x.id);
      }
      if (!pool.length) { // fallback global (nenhuma fila casou / time vazio)
        const { data: elig } = await sb.from('profiles').select('id').eq('role','BROKER').eq('is_active',true).neq('lead_assignment_enabled',false);
        pool = (elig||[]).map((x:any)=>x.id);
      }
      if (pool.length) {
        const loads = await Promise.all(pool.map(async (bid:string)=>{ const { count } = await sb.from('leads').select('id',{count:'exact',head:true}).eq('broker_id',bid).in('status',['NEW','IN_PROGRESS','NEGOTIATING']); return { bid, n: count||0 }; }));
        loads.sort((a:any,b:any)=>a.n-b.n); lead.broker_id = loads[0].bid;
      }
    }
    // atribui o corretor (fila) + religa agentes + marca em atendimento + anexa dossie
    await sb.from('leads').update({
      broker_id: lead.broker_id,
      // cold: FORCA NEW (corretor pega cru, como se fosse novo). quente: vira IN_PROGRESS.
      status: cold ? 'NEW' : (lead.status === 'NEW' ? 'IN_PROGRESS' : lead.status),
      notes: newNotes,
      pause_auto_messages: false,
      // cold nunca respondeu -> nao marca last_lead_response_at (senao vira "quente" falso)
      ...(cold ? {} : { last_lead_response_at: nowIso, ana_qualified_at: nowIso }),
      last_interaction_at: nowIso,
    }).eq('id', lead.id).then(()=>{},()=>{});

    // SINAL DE QUALIDADE PRO FACEBOOK (CAPI): so na qualificacao REAL da Ana (nao cold) e lead do Facebook.
    // Enfileira QualifiedLead (o cron comandra-capi drena). Dedup pelo mesmo event_id do trigger -> nunca duplica.
    // value=100 marca "qualificado por conversa/Ana" (sinal mais forte que o score). O Facebook aprende a buscar mais gente assim.
    if (!cold && lead.source === 'facebook_make') {
      const evId = `${lead.id}:QualifiedLead`;
      const { data: existe } = await sb.from('capi_events_log').select('id,status').eq('lead_id', lead.id).eq('event_name','QualifiedLead').maybeSingle();
      if (!existe) {
        await sb.from('capi_events_log').insert({ lead_id: lead.id, event_name:'QualifiedLead', value: 100, event_id: evId, status:'queued' }).then(()=>{},()=>{});
      } else if (existe.status === 'queued') {
        // trigger antigo (por score) ja enfileirou -> a Ana CONFIRMOU, reforca o valor do sinal enquanto nao foi enviado
        await sb.from('capi_events_log').update({ value: 100 }).eq('id', existe.id).then(()=>{},()=>{});
      }
    }

    let brokerName:any = null;
    if (lead.broker_id) {
      const { data: bp } = await sb.from('profiles').select('first_name, phone, manager_id').eq('id', lead.broker_id).maybeSingle();
      brokerName = bp?.first_name || null;
      await sb.from('internal_notifications').insert({
        to_id: lead.broker_id,
        type: cold ? 'WA_LEAD_NOVO' : 'WA_LEAD_QUALIFICADO',
        title: cold ? '🆕 Novo lead pra você' : '🔥 Lead qualificado pela Ana (MCMV)',
        message: cold ? `Novo lead: ${lead.name||'—'} — ${phone}${projeto?(' · '+projeto):''}` : dossie,
      }).then(()=>{},()=>{});
      // avisa o corretor por WhatsApp (chip do gerente OU bot de notificacao)
      try {
        if (bp?.phone) {
          let botId:any = null;
          // SEMPRE pelo chip do Junior (bot de notificacao) — ordem do Junior
          { const { data: ns } = await sb.from('system_settings').select('value').eq('key','notification_bot_instance_id').maybeSingle(); botId = ns?.value ? String(ns.value).replace(/"/g,'') : null; }
          if (botId) {
            const { data: bot } = await sb.from('bot_instances').select('instance_name, evolution_api_url, evolution_api_key').eq('id', botId).maybeSingle();
            if (bot?.evolution_api_url && bot?.instance_name) {
              const text = cold
                ? `🆕 *Novo lead pra você — fale AGORA!*\n\n${lead.name||'Lead'}${projLine}\n📞 ${phone}\n\nhttps://wa.me/${phone}\n\nAcabou de entrar. Chama ele antes que esfrie.`
                : `🔥 *Lead qualificado pela IA — fale AGORA!*${projLine}\n\n${dossie}\n\n📞 ${phone}\n\nhttps://wa.me/${phone}\n\nEle já está aquecido. Chama ele antes que esfrie.`;
              await fetch(`${bot.evolution_api_url}/message/sendText/${bot.instance_name}`, { method:'POST', headers:{'apikey':bot.evolution_api_key||'','Content-Type':'application/json'}, body: JSON.stringify({ number: String(bp.phone).replace(/\D/g,''), text }) });
            }
          }
        }
      } catch {}
    }
    return J({ ok:true, lead_id: lead.id, broker: lead.broker_id || null, broker_name: brokerName, orphan: !lead.broker_id });
  } catch (e) { return J({ error: (e as any)?.message }, 500); }
});
