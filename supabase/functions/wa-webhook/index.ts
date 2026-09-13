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

// Escolhe o proximo corretor ELEGIVEL da fila, em rodizio real (last_assigned_index).
async function proximoDaFila(sb: any, queueId: string): Promise<string | null> {
  const { data: q } = await sb.from('distribution_queues').select('broker_ids, last_assigned_index').eq('id', queueId).maybeSingle();
  const ids = (q?.broker_ids || []);
  if (!ids.length) return null;
  const { data: elig } = await sb.from('profiles').select('id').in('id', ids).eq('role','BROKER').eq('is_active', true).neq('lead_assignment_enabled', false);
  const ok = new Set((elig||[]).map((x:any)=>x.id));
  const pool = ids.filter((id:string)=>ok.has(id));   // preserva a ordem da fila
  if (!pool.length) return null;
  const idx = Number(q?.last_assigned_index || 0);
  const escolhido = pool[idx % pool.length];
  await sb.from('distribution_queues').update({ last_assigned_index: idx + 1 }).eq('id', queueId).then(()=>{},()=>{});
  return escolhido;
}

// Rotulo curto da campanha pro corretor saber de onde veio o lead (IPIRANGA / FEIRAO).
function origemDoDisparo(campName?: string | null, tplName?: string | null): string {
  const t = (tplName || '').toLowerCase();
  const c = (campName || '').toLowerCase();
  if (t.includes('feirao') || c.includes('feirao') || c.includes('feirão')) return 'FEIRÃO';
  if (t.includes('ipiranga') || c.includes('ipiranga')) return 'IPIRANGA';
  return (campName || 'DISPARO OFICIAL').toUpperCase().slice(0, 40);
}

async function notificarPeloGerente(sb: any, broker: any, message: string): Promise<boolean> {
  // Mesma regra do incoming-lead: NUNCA usa o chip do corretor.
  // Manda pelo chip do GERENTE dele; se falhar, cai no chip de notificacao (Junior).
  try {
    let botId: string | null = null;
    if (broker.manager_id) {
      const { data: m } = await sb.from('profiles').select('bot_instance_id').eq('id', broker.manager_id).maybeSingle();
      botId = m?.bot_instance_id || null;
    }
    let junior: string | null = null;
    const { data: bs } = await sb.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    junior = (bs?.value as any) || null;
    let ok = false;
    if (botId) { const { data: r } = await sb.functions.invoke('send_whatsapp_message', { body: { botId, phone: broker.phone, message } }); ok = (r as any)?.success || false; }
    if (!ok && junior && junior !== botId) { const { data: r2 } = await sb.functions.invoke('send_whatsapp_message', { body: { botId: junior, phone: broker.phone, message } }); ok = (r2 as any)?.success || false; }
    return ok;
  } catch (e) { console.error('[wa-webhook] notificarPeloGerente:', (e as any)?.message || e); return false; }
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

          // === MENU 1/2 do disparo ===
          // Sem isto, QUALQUER resposta virava "lead interessado" — inclusive "2 - nao
          // tenho interesse", que ia parar na mao de um corretor. Alem de queimar o
          // corretor, e o caminho mais rapido pra derrubar a qualidade do numero:
          // quem pediu pra parar e recebe ligacao denuncia. So existe UM numero oficial.
          const escolha = (text || '').trim().replace(/^[^\d]*(\d)[^\d]*$/, '$1');
          const querInfo = escolha === '1';
          // O template promete "RETIRE MEU NUMERO DOS CONTATOS" na opcao 2. Muita gente
          // escreve isso por extenso em vez de digitar 2 — se so o digito valesse, a
          // pessoa pediria pra sair e receberia ligacao de corretor. Frases inteiras,
          // nao palavras soltas: "sair" sozinho pegaria "quero sair pra ver o apto".
          const norm = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
          const FRASES_SAIDA = [
            'retire meu numero', 'retirar meu numero', 'remova meu numero', 'remover meu numero',
            'nao tenho interesse', 'sem interesse', 'nao quero receber', 'nao quero mais receber',
            'nao me mande', 'nao manda mais', 'pare de mandar', 'para de mandar', 'parem de mandar',
            'me tira da lista', 'tirar da lista', 'sair da lista', 'descadastr', 'cancelar inscricao',
          ];
          const querSair = escolha === '2' || FRASES_SAIDA.some((f) => norm.includes(f));

          if (querSair) {
            await sb.from('phone_blocklist').upsert(
              { phone: from, reason: 'opt_out', source: 'auto', notes: `opt-out (${escolha === '2' ? 'digitou 2' : 'texto livre'}) no disparo${th?.campaign_id ? ' ' + th.campaign_id : ''}` },
              { onConflict: 'phone' }
            ).then(()=>{},()=>{});
            await sb.from('whatsapp_threads').update({ status: 'opted_out', unread: 0, updated_at: now.toISOString() }).eq('id', th.id).then(()=>{},()=>{});
            // opt-outs se contam por whatsapp_threads.status='opted_out' + campaign_id;
            // nao existe coluna opted_out_count em whatsapp_campaigns (nao inventar bump que falha calado).
            continue; // nao roteia, nao notifica corretor, nao aciona IA
          }

          // === "1" VIRA LEAD DE VERDADE, avisado pelo CHIP DO GERENTE ===
          // Reaproveita o incoming-lead: ele cria o lead, roda o rodizio com checagem de
          // chip vivo e chama notifyBrokerViaManager (chip do gerente, fallback Junior).
          // Nao reimplementa nada disso aqui.
          if (querInfo && th?.campaign_id) {
            const { data: campL } = await sb.from('whatsapp_campaigns').select('name, target_queue_id, template_id').eq('id', th.campaign_id).maybeSingle();
            let tplNome = '';
            if (campL?.template_id) {
              const { data: tp } = await sb.from('whatsapp_templates').select('name').eq('id', campL.template_id).maybeSingle();
              tplNome = tp?.name || '';
            }
            const origem = origemDoDisparo(campL?.name, tplNome);
            let campanha = '';
            if (campL?.target_queue_id) {
              const { data: qm } = await sb.from('distribution_queues').select('match_value').eq('id', campL.target_queue_id).maybeSingle();
              campanha = qm?.match_value || '';
            }
            if (!th.lead_id) {
              // contato frio: ainda nao existe lead no CRM -> cria
              try {
                const { data: il } = await sb.functions.invoke('incoming-lead', { body: {
                  name: contactName || from,
                  phone: from,
                  campanha,
                  source: `Disparo ${origem}`,
                  tag: campanha || 'DISPARO_OFICIAL',
                  message: `Respondeu 1 no disparo ${origem} (WhatsApp oficial)`,
                }});
                const novoLead = (il as any)?.lead;
                if (novoLead?.id) {
                  await sb.from('whatsapp_threads').update({ lead_id: novoLead.id, assigned_broker_id: novoLead.broker_id || null }).eq('id', th.id);
                  th.lead_id = novoLead.id;
                  if (novoLead.broker_id) th.assigned_broker_id = novoLead.broker_id;
                }
              } catch (e) { console.error('[wa-webhook] incoming-lead falhou:', (e as any)?.message || e); }
            } else {
              // lead JA existe (base propria): nao duplica — reativa e avisa o dono pelo chip do gerente
              const { data: ld } = await sb.from('leads').select('id, broker_id, name, status').eq('id', th.lead_id).maybeSingle();
              if (ld?.id) {
                // REGRA DE NEGOCIO (Junior, 25/08): lead que ressuscita por disparo NAO volta
                // pro dono antigo — ele perdeu por nao ter dado atencao. Vai pro proximo da
                // fila da campanha, como lead novo.
                let novoDono: string | null = null;
                if (campL?.target_queue_id) novoDono = await proximoDaFila(sb, campL.target_queue_id);
                if (!novoDono) novoDono = ld.broker_id || null;   // fila vazia: nao deixa lead orfao
                const upd: Record<string, unknown> = { status: 'REACTIVATED', last_lead_response_at: now.toISOString(), last_interaction_at: now.toISOString() };
                if (novoDono && novoDono !== ld.broker_id) {
                  upd.broker_id = novoDono;
                  const { data: nb } = await sb.from('profiles').select('manager_id').eq('id', novoDono).maybeSingle();
                  if (nb?.manager_id) upd.manager_id = nb.manager_id;
                }
                await sb.from('leads').update(upd).eq('id', ld.id).then(()=>{},()=>{});
                if (novoDono) {
                  await sb.from('whatsapp_threads').update({ assigned_broker_id: novoDono }).eq('id', th.id).then(()=>{},()=>{});
                  th.assigned_broker_id = novoDono;
                  const { data: br } = await sb.from('profiles').select('id, first_name, phone, manager_id').eq('id', novoDono).maybeSingle();
                  if (br?.phone) await notificarPeloGerente(sb, br, `🔥 *LEAD do disparo ${origem}*\n\n👤 ${ld.name || from}\n📱 ${from}\n👉 Falar agora: https://wa.me/${from}\n\nEle respondeu 1 e quer atendimento.`);
                }
              }
            }
          }

          // ROTEAR: lead mostrou interesse -> corretor da campanha (fila/especifico) se ainda nao tem dono
          // Em campanha com menu, so o "1" (ou texto livre) roteia; "2" ja saiu acima.
          if (th && !th.assigned_broker_id && th.campaign_id) {
            const { data: camp } = await sb.from('whatsapp_campaigns').select('target_broker_id, target_queue_id').eq('id', th.campaign_id).maybeSingle();
            let broker = camp?.target_broker_id || null;
            if (!broker && camp?.target_queue_id) {
              broker = await proximoDaFila(sb, camp.target_queue_id);
            }
            if (broker) {
              await sb.from('whatsapp_threads').update({ assigned_broker_id: broker }).eq('id', th.id);
              th.assigned_broker_id = broker;
              // internal_notifications NAO tem coluna 'title' (so to_id/type/message/from_id/is_read).
              // Com title o insert falhava calado (.then vazio) e o corretor nunca era avisado.
              await sb.from('internal_notifications').insert({ to_id: broker, type:'WA_LEAD_INTERESSADO', message: `🔥 Lead interessado (disparo oficial) — ${contactName||from} ${querInfo ? 'respondeu 1 e quer informacoes' : 'respondeu o disparo'}.` }).then(()=>{},(e)=>{ console.error('[wa-webhook] notif falhou:', e?.message||e); });
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
