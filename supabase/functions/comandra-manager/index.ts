import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const MESES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function norm(t){ return (t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }
function digits(p){ return (p||'').replace(/\D/g,''); }
function phoneVariants(p){ const noPlus=(p||'').replace(/^\+/,''); const v=[p,noPlus,`+${noPlus}`]; const m=noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if(m){v.push(m[1],`+${m[1]}`);} else if(/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)){v.push(`55${noPlus}`,`+55${noPlus}`);} return [...new Set(v.filter(Boolean))]; }
const fn = (n) => (n||'Lead').split(' ')[0];
function brtToday(){ const b=new Date(Date.now()-3*3600*1000); return `${b.getUTCFullYear()}-${String(b.getUTCMonth()+1).padStart(2,'0')}-${String(b.getUTCDate()).padStart(2,'0')}`; }

function menuText(nome){ return [
`👋 *Oi ${nome||'gerente'}! Sou a Comandra, sua copiloto de gestao.* Me pede do seu jeito, por *texto ou audio*:`,``,
`🎯 *meta* — quanto falta pra bater o mes`,
`☀️ *raio-x* (ou *bom dia*) — o dia da equipe: meta + onde travou + por quem comecar`,
`👥 *quadrante* — quem ta bom, quem queima lead, quem e fantasma`,
`🩺 *diagnostico* — e lead, e time ou e o script?`,
`📋 *meus leads* — seus clientes (se voce tambem vende)`,
`📥 *pegar meus leads* — CSV da equipe por periodo (nome, tel, renda, trabalho, corretor, status)`,``,
`⚡ *cobra o [nome]* — eu cobro o corretor por voce`,
`🔄 *tira o [nome] da roleta* / *ativa o [nome]*`,
`↔️ *passa os leads do [nome] pro [nome]*`,``,
`E so falar. 💪`].join('\n'); }

async function sendText(url,key,instance,phone,text){ try{ const r=await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({number:phone,text})}); return r.status>=200&&r.status<300; }catch{ return false; } }
async function sendDocument(url,key,instance,phone,base64,fileName,caption){ try{ const r=await fetch(`${url}/message/sendMedia/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({number:phone,mediatype:'document',mimetype:'text/csv',fileName,media:base64,caption})}); return r.status>=200&&r.status<300; }catch{ return false; } }
function csvField(v){ const s=(v==null?'':String(v)).replace(/"/g,'""'); return `"${s}"`; }
function toB64Utf8(str){ const bytes=new TextEncoder().encode(str); let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); }
function parseDateRange(text){ const re=/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g; const ms=[...text.matchAll(re)]; if(ms.length<2) return null; const yNow=new Date().getUTCFullYear(); const mk=(m,isEnd)=>{ let y=m[3]?Number(m[3]):yNow; if(y<100)y+=2000; const mo=Number(m[2])-1, d=Number(m[1])+(isEnd?1:0); const dt=new Date(Date.UTC(y,mo,d,3,0,0)); return isNaN(dt.getTime())?null:dt; }; const a=mk(ms[0],false), b=mk(ms[1],true); if(!a||!b) return null; return { startISO:a.toISOString(), endISO:b.toISOString(), label:`${ms[0][1]}/${ms[0][2]} a ${ms[1][1]}/${ms[1][2]}` }; }
async function getAudioB64(url,key,instance,messageId,raw){ const m=raw?.message||raw?.data?.message||{}; const mime=m?.audioMessage?.mimetype||'audio/ogg'; for(const b of [{message:{key:{id:messageId}}}, (m&&Object.keys(m).length)?{message:m}:null].filter(Boolean)){ try{ const r=await fetch(`${url}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(b)}); if(!r.ok) continue; const j=await r.json().catch(()=>null); const b64=j?.base64||j?.media; if(b64&&b64.length>100) return {b64,mime:j?.mimetype||mime}; }catch{} } return null; }
async function transcribe(b64,mime,openaiKey){ try{ const clean=b64.replace(/^data:[^;]+;base64,/,''); const bin=atob(clean); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); const cm=(mime||'audio/ogg').split(';')[0].trim(); const ext=cm.includes('mp4')||cm.includes('m4a')?'m4a':cm.includes('mpeg')?'mp3':'ogg'; const form=new FormData(); form.append('file',new Blob([bytes],{type:cm}),`a.${ext}`); form.append('model','whisper-1'); form.append('language','pt'); const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`},body:form}); const j=await r.json().catch(()=>null); return (j?.text||'').trim()||null; }catch{ return null; } }
async function openaiJSON(sys,user,key,maxTokens){ try{ const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}],response_format:{type:'json_object'},max_tokens:maxTokens,temperature:0})}); const j=await r.json().catch(()=>null); const c=j?.choices?.[0]?.message?.content; return c?JSON.parse(c):null; }catch{ return null; } }

// ---- Compreensao livre: entende qualquer pergunta e responde com o snapshot (read-only) ----
async function freeAnswer(supabase, openaiKey, mgr, team, meta, question){
  if(!openaiKey) return null;
  const totalQ=team.reduce((s,b)=>s+b.quentes,0);
  const chipsOff=team.filter(b=>b.chip!=='open').map(b=>b.name);
  const topWaiting=team.filter(b=>b.quentes>0).sort((a,b)=>b.quentes-a.quentes).slice(0,10).map(b=>`${b.name}:${b.quentes}${b.chip!=='open'?'(chip off)':''}`);
  const snapshot={ equipe:mgr.first_name, corretores:team.length, clientes_esperando_total:totalQ, top_esperando:topWaiting, chips_off:chipsOff, meta: meta?{alvo:meta.meta, fechou:meta.realizado, falta:meta.gap, dias_restantes:meta.daysLeft}:null };
  const sys=`Voce e a Comandra, copiloto de um GERENTE de vendas de imoveis MCMV. Ele te perguntou/pediu algo em linguagem livre por WhatsApp. Responda em portugues do Brasil, CURTO (ate 5 linhas), direto, tom de conversa, SEM inventar dado — use SO o snapshot. Se ele pede uma ACAO que a Comandra sabe executar (cobrar corretor, tirar/ativar da roleta, passar leads de um pro outro, exportar CSV, ver meta, quadrante ou diagnostico), NAO execute: diga a frase exata pra ele disparar (ex: \`manda *cobra o Fluvy*\`). Se faltar dado no snapshot pra responder, diga o que voce consegue ver e ofereca *raio-x*, *meta*, *quadrante* ou *diagnostico*. Nada de emoji em excesso.`;
  const user=`Pergunta do gerente: "${question}"\n\nSnapshot da equipe (unica fonte de verdade):\n${JSON.stringify(snapshot)}`;
  try{ const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}],max_tokens:320,temperature:0.3})}); const j=await r.json().catch(()=>null); return (j?.choices?.[0]?.message?.content||'').trim()||null; }catch{ return null; }
}

async function routeIntent(text,openaiKey){
  const sys=`Voce roteia comandos de um GERENTE de vendas (que tambem vende) falando com a assistente por texto/voz. Responda APENAS JSON:\n{\"intent\":\"raio_x\"|\"meta\"|\"quadrante\"|\"diagnostico\"|\"menu\"|\"meus_leads\"|\"exportar_leads\"|\"cobrar\"|\"tirar_roleta\"|\"ativar\"|\"distribuir\"|\"confirmar\"|\"cancelar\"|\"outro\",\"alvo\":\"primeiro nome do corretor citado ou null\",\"destino\":\"se distribuir: nome do corretor que vai RECEBER, senao null\"}\nExemplos: \"como ta minha equipe\"/\"raio x\"/\"bom dia\"/\"quem ta parado\"/\"o que ta rolando\"=raio_x. \"como ta a meta\"/\"quanto falta\"/\"quantas vendas\"/\"status do time\"=meta. \"quem ta bom\"/\"quem ta ruim\"/\"quadrante\"/\"quem queima lead\"/\"quem e diamante\"/\"quem sao os fantasmas\"=quadrante. \"diagnostico\"/\"por que a meta ta fraca\"/\"por que to vendendo pouco\"/\"e falta de lead ou o time\"/\"e o time ou o script\"/\"onde ta o gargalo da equipe\"=diagnostico. \"menu\"/\"ajuda\"/\"opcoes\"/\"comandos\"/\"o que voce faz\"/\"o que voce pode fazer\"=menu. \"meus leads\"/\"meu funil\"=meus_leads. \"pegar meus leads\"/\"exportar leads\"/\"csv de leads\"/\"lista de leads\"/\"planilha de leads\"/\"baixar leads\"/\"quero pegar meus leads\"=exportar_leads. \"cobra o joao\"=cobrar (alvo=joao). \"tira o joao da roleta\"=tirar_roleta. \"ativa o joao\"=ativar. \"passa os leads do joao pro pedro\"=distribuir. \"sim\"/\"pode\"/\"manda\"/\"1\"=confirmar. \"nao\"/\"deixa\"/\"cancela\"=cancelar. Perguntas fora disso (ex: \"qual corretor perdeu mais lead\", \"me da um plano pro fulano\", \"quantos leads sem atender essa semana\")=outro. Senao outro.`;
  try{ const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:text}],response_format:{type:'json_object'},max_tokens:120,temperature:0})}); const j=await r.json().catch(()=>null); const c=j?.choices?.[0]?.message?.content; return c?JSON.parse(c):{intent:'outro'}; }catch{ return {intent:'outro'}; }
}

async function teamRaioX(supabase,managerId){
  const { data: team } = await supabase.from('profiles').select('id, first_name, bot_instance_id').eq('manager_id',managerId).eq('role','BROKER');
  const rows=[];
  for(const b of team||[]){ let chip=null,quentes=0; if(b.bot_instance_id){ const {data:bi}=await supabase.from('bot_instances').select('real_state,status').eq('id',b.bot_instance_id).maybeSingle(); chip=bi?.real_state||bi?.status||null; } const {data:ls}=await supabase.from('leads').select('last_lead_response_at,last_broker_whatsapp_at,status').eq('broker_id',b.id).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")'); for(const l of ls||[]){ const r=l.last_lead_response_at?Date.parse(l.last_lead_response_at):0; const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; if(r>0&&r>w)quentes++; } rows.push({id:b.id,name:b.first_name,chip,quentes}); }
  rows.sort((a,b)=>b.quentes-a.quentes);
  return rows;
}
function matchBroker(team,nome){ const tn=norm(nome); if(!tn) return []; return team.filter((b)=>{ const cn=norm(b.name); return cn===tn||cn.includes(tn)||tn.includes(cn); }); }
const COBRANCA=(nome,q)=>[`${nome}, preciso que voce preste atencao nesta mensagem.`,``,`Voce tem ${q} clientes que ja responderam e estao esperando retorno seu. Isso e venda saindo pela porta.`,``,`Ate as 18h de hoje eu preciso ver esses contatos andando.`,``,`Se algo esta te travando, me fala agora.`].join('\n');

async function metaMotor(supabase,teamId,managerId){
  const now=new Date(); const brt=new Date(now.getTime()-3*3600*1000);
  const y=brt.getUTCFullYear(), mo=brt.getUTCMonth(), dom=brt.getUTCDate();
  const monthDate=`${y}-${String(mo+1).padStart(2,'0')}-01`;
  const monthStartISO=new Date(Date.UTC(y,mo,1,3,0,0)).toISOString();
  const monthEndISO=new Date(Date.UTC(y,mo+1,1,3,0,0)).toISOString();
  const daysIn=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
  const daysLeft=Math.max(0,daysIn-dom);
  let meta=null, fallback=false;
  const { data: goals } = await supabase.from('team_goals').select('sales_target, month').eq('team_id',teamId).eq('goal_type','monthly').order('month',{ascending:false}).limit(8);
  const cur=(goals||[]).find(g=>String(g.month).slice(0,10)===monthDate);
  if(cur){ meta=cur.sales_target; } else if((goals||[]).length){ meta=goals[0].sales_target; fallback=true; }
  let realizado=0;
  try{ const {data}=await supabase.rpc('goals_team_sales_count',{p_start:monthStartISO,p_end:monthEndISO}); const rowm=(data||[]).find(r=>r.team_id===teamId); if(rowm) realizado=Number(rowm.count)||0; }catch{}
  const gap=meta!=null?Math.max(0,meta-realizado):null;
  let visitas=0, agendadas=0, pastas=0, temSecretaria=false;
  const { data: brs } = await supabase.from('profiles').select('id').eq('manager_id',managerId).eq('role','BROKER');
  const bids=(brs||[]).map(b=>b.id);
  if(bids.length){ try{ const {data:sqe,error}=await supabase.from('secretary_quick_entries').select('entry_type,quantity').in('broker_id',bids).gte('entry_date',monthDate); if(!error&&sqe){ temSecretaria=true; for(const e of sqe){ const q=Number(e.quantity)||0; if(e.entry_type==='visita')visitas+=q; else if(e.entry_type==='visita_agendada')agendadas+=q; else if(e.entry_type==='pasta')pastas+=q; } } }catch{} }
  let negoc=0, docs=0;
  if(bids.length){ const {data:pl}=await supabase.from('leads').select('status').in('broker_id',bids).in('status',['NEGOTIATING','DOCS_REQUESTED']); for(const l of pl||[]){ if(l.status==='NEGOTIATING')negoc++; else if(l.status==='DOCS_REQUESTED')docs++; } }
  const mesNome=MESES[mo];
  const lines=[];
  if(meta==null){ lines.push(`🎯 *Meta de ${mesNome} ainda nao foi definida.* Define a meta da equipe pra eu te guiar pelo numero.`); }
  else{
    lines.push(`🎯 *Meta ${mesNome}: ${meta} venda${meta===1?'':'s'}*${fallback?` _(mes atual sem meta setada — usei a ultima)_`:''}`);
    lines.push(`✅ Fechou: *${realizado}*  ·  🎯 Falta: *${gap}*  ·  ⏳ *${daysLeft}* dia${daysLeft===1?'':'s'}`);
    if(gap<=0){ lines.push(`🏆 *Meta batida!* Agora e ampliar.`); }
    else{ const semanas=Math.max(1,Math.ceil(daysLeft/7)); const porSemana=Math.ceil(gap/semanas); const esperado=meta*(dom/daysIn); const atras=realizado < esperado*0.8; lines.push(`📈 Ritmo: precisa de ~*${porSemana}* venda${porSemana===1?'':'s'}/semana pra fechar.${atras?` 🔴 *Voce esta ATRAS do ritmo.*`:``}`); }
  }
  const drv=[]; if(temSecretaria){ drv.push(`${visitas} visita${visitas===1?'':'s'}`); drv.push(`${agendadas} agendada${agendadas===1?'':'s'}`); drv.push(`${pastas} pasta${pastas===1?'':'s'}`); }
  drv.push(`${negoc} negociando`); drv.push(`${docs} em doc`);
  lines.push(`🔑 O que alimenta a venda (mes): ${drv.join(' · ')}.`);
  if(temSecretaria && visitas===0 && agendadas===0){ lines.push(`⚠️ *Zero visita lancada este mes* — e da visita que nasce a venda.`); }
  return { text: lines.join('\n'), meta, realizado, gap, daysLeft };
}

async function causaParados(supabase,openaiKey,team,topN){
  if(!openaiKey) return null;
  const bids=team.map(b=>b.id); if(!bids.length) return null;
  const N=topN||5;
  const { data: leads } = await supabase.from('leads').select('id,name,broker_id,last_lead_response_at,last_broker_whatsapp_at,status').in('broker_id',bids).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")').not('last_lead_response_at','is',null).order('last_lead_response_at',{ascending:false}).limit(120);
  const waiting=(leads||[]).filter(l=>{ const r=l.last_lead_response_at?Date.parse(l.last_lead_response_at):0; const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; return r>0&&r>w; });
  if(!waiting.length) return null;
  const nameOf=(id)=>{ const b=team.find(x=>x.id===id); return b?b.name:''; };
  const withConv=[], noConv=[];
  for(const l of waiting.slice(0,16)){
    const horas=Math.floor((Date.now()-Date.parse(l.last_lead_response_at))/3600000);
    const base={ lead:fn(l.name), corretor:nameOf(l.broker_id), horas };
    let hist=null;
    const {data:conv}=await supabase.from('ia_conversations').select('id').eq('lead_id',l.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(conv?.id){ const {data:msgs}=await supabase.from('ia_messages').select('direction,message_text').eq('conversation_id',conv.id).order('created_at',{ascending:false}).limit(6); if(msgs&&msgs.length) hist=[...msgs].reverse().map(m=>`[${m.direction==='incoming'?'CLIENTE':'CORRETOR'}] ${(m.message_text||'').slice(0,180)}`).join('\n'); }
    if(hist){ withConv.push({...base,hist}); if(withConv.length>=N) break; }
    else if(noConv.length<3){ noConv.push(base); }
  }
  const lines=[`🔎 *Onde esta travado (li as conversas):*`];
  if(withConv.length){
    const sys=`Voce e o copiloto de um GERENTE de vendas de imoveis. Para cada LEAD PARADO (o cliente respondeu e o corretor ainda nao voltou), leia a conversa e diga DE QUEM E A BOLA. Responda APENAS JSON {\"itens\":[{\"n\":1,\"bola\":\"corretor\"|\"cliente\"|\"esfriando\",\"resumo\":\"1 linha do que esta acontecendo NA CONVERSA\",\"perfil\":\"aberto\"|\"fechado\"|\"indefinido\",\"jogada\":\"acao curta pro gerente\"}]}. Retorne UM item para CADA lead. Baseie o resumo NO CONTEUDO da conversa, nao so no tempo.\nbola=corretor: o corretor vacilou/sumiu/demorou e o cliente quer resposta => COBRAR.\nbola=cliente: o cliente pediu tempo, vai viajar, vai pensar, esperar conjuge/folga => AGUARDAR, nao cobrar.\nbola=esfriando: cliente respondeu vago/desconversando => reativar ou decidir.\nperfil aberto=engajado; fechado=resistente. Curto e direto.`;
    const user=withConv.map((it,i)=>`#${i+1} Lead ${it.lead} (corretor ${it.corretor}, esperando ${it.horas}h):\n${it.hist}`).join('\n\n---\n\n');
    const out=await openaiJSON(sys,user,openaiKey,900);
    const arr=Array.isArray(out?.itens)?out.itens:[];
    const emoji={corretor:'🔴',cliente:'🟢',esfriando:'🟡'};
    withConv.forEach((it,i)=>{ const j=arr.find(a=>a.n===i+1)||arr[i]||{}; const e=emoji[j.bola]||'⚪'; const perfil=j.perfil&&j.perfil!=='indefinido'?` _(perfil ${j.perfil})_`:''; lines.push(`${e} *${it.lead}* (${it.corretor}) — ${(j.resumo||'sem leitura').replace(/[.\s]+$/,'')}${perfil} 👉 ${j.jogada||''}`); });
  }
  if(withConv.length<N && noConv.length){ for(const it of noConv.slice(0,N-withConv.length)){ lines.push(`⚪ *${it.lead}* (${it.corretor}) — parado ha ${it.horas}h, *sem conversa registrada* 👉 confirma com o corretor o que rolou.`); } }
  if(lines.length===1) return null;
  return lines.join('\n');
}

async function quadranteText(supabase,managerId,nome){
  const { data: rows } = await supabase.rpc('manager_quadrante',{p_manager_id:managerId,p_days:14});
  if(!rows||!rows.length) return `Nao achei corretores ativos na sua equipe, ${nome}.`;
  const g={diamante:[],trabalhando:[],queima_lead:[],devagar:[],fantasma:[]};
  for(const r of rows){ (g[r.quadrante]||g.devagar).push(r); }
  const L=[`👥 *Sua equipe (14 dias) — esforco x resultado:*`];
  if(g.diamante.length){ L.push(``,`💎 *Diamante* (faz muito com pouco — da mais lead):`); g.diamante.forEach(r=>L.push(`• *${r.name}* — ${r.visitas} visita${r.visitas===1?'':'s'}, ${r.vendas} venda${r.vendas===1?'':'s'}${r.leads_tocados===0?' _(0 atividade no sistema 👀)_':` (so tocou ${r.leads_tocados})`}`)); }
  if(g.trabalhando.length){ L.push(``,`🐎 *Batalhador* (entrega no suor):`); g.trabalhando.forEach(r=>L.push(`• *${r.name}* — tocou ${r.leads_tocados}, ${r.visitas} visita${r.visitas===1?'':'s'} + ${r.vendas} venda${r.vendas===1?'':'s'}`)); }
  if(g.queima_lead.length){ L.push(``,`🔥 *Queima-lead* (muito toque, zero resultado → treinar):`); g.queima_lead.forEach(r=>L.push(`• *${r.name}* — tocou ${r.leads_tocados}, ${r.sem_resposta} nao responderam, 0 visita`)); }
  if(g.devagar.length){ L.push(``,`😴 *Devagar* (pouco no jogo): ${g.devagar.map(r=>r.name).join(', ')}`); }
  if(g.fantasma.length){ L.push(``,`🪫 *Fantasma* (0 atividade → cobrar/decidir): ${g.fantasma.map(r=>r.name).join(', ')}`); }
  L.push(``,`💡 Quer que eu cobre um fantasma ou monte um plano pro queima-lead? Me diz o nome.`);
  return L.join('\n');
}

async function diagnosticoText(supabase,managerId,nome){
  const { data: d } = await supabase.rpc('manager_diagnostico',{p_manager_id:managerId,p_days:30});
  if(!d) return `Nao consegui montar o diagnostico agora, ${nome}.`;
  const L=[`🩺 *Diagnostico da equipe (${d.dias||30} dias):*`,``];
  const delta=d.delta_pct;
  if(delta==null) L.push(`1️⃣ *E lead?* Recebeu *${d.recebidos}* leads no periodo.`);
  else if(delta<=-20) L.push(`1️⃣ *E lead?* Recebeu *${d.recebidos}* (vs ${d.recebidos_ant} antes → *${delta}%*). 🔴 Caiu — parte do problema e *FALTA DE LEAD*, cobra midia.`);
  else L.push(`1️⃣ *E lead?* Recebeu *${d.recebidos}* (vs ${d.recebidos_ant} → ${delta>0?'+':''}${delta}%). ✅ Input ok, nao e falta de lead.`);
  L.push(``,`2️⃣ *E execucao?* Funil por lead:`,`• 1º contato: *${d.toc_pct}%*${d.sem_1contato>0?` (${d.sem_1contato} nunca atendidos)`:''}`,`• Responderam ao 1º contato: *${d.resp_pct}%*`);
  const leakNome = d.leak==='1contato' ? '1º contato (lead que ninguem atende)' : 'o welcome (poucos respondem ao 1º contato)';
  L.push(``,`🩸 *Maior vazamento:* ${leakNome}.`,``,`3️⃣ *E script ou pessoa?*`);
  if(d.verdict==='sistema'){ L.push(d.leak==='welcome' ? `→ 🔧 *E o SCRIPT.* ${d.bad} de ${d.elig} corretores abaixo do esperado — nao e gente, e o *roteiro de abertura*. Troca o welcome, nao treina ${d.elig} pessoas.` : `→ 🔧 *E PROCESSO.* ${d.bad} de ${d.elig} deixam lead sem atender — e distribuicao/capacidade. Redistribui ou tira quem ta afogado.`); }
  else if(d.verdict==='pessoa'){ L.push(`→ 👤 *Sao PESSOAS:* ${d.outliers} estao furando aqui. Treino cirurgico so neles.`); }
  else { L.push(`→ ✅ Sem gargalo gritante nesse estagio.`); }
  L.push(``,`📌 Visita/venda nao entram nessa conta (moram na secretaria) — ve no *meta* e *quadrante*.`);
  return L.join('\n');
}

async function buildRaioX(supabase,openaiKey,mgr,team){
  const nome=mgr.first_name||'gerente';
  const meta=await metaMotor(supabase,mgr.team_id,mgr.id);
  const causa=await causaParados(supabase,openaiKey,team,5);
  const totalQ=team.reduce((s,b)=>s+b.quentes,0);
  const lines=[`☀️ *Bom dia, ${nome}. Raio-x da equipe.*`,``,meta.text,``];
  if(causa){ lines.push(causa,``); }
  lines.push(`🔥 *${totalQ} cliente${totalQ===1?'':'s'} esperando* no time.`);
  const top=team.filter(b=>b.quentes>0).slice(0,5);
  if(top.length){ top.forEach(b=>lines.push(`• *${b.name}* — ${b.quentes} esperando${b.chip!=='open'?' (chip OFF)':''}`)); }
  const alvo=team.find(b=>b.quentes>=3&&b.chip==='open');
  let suggest=null;
  if(alvo){ lines.push(``,`💡 Sugiro cobrar o *${alvo.name}* (${alvo.quentes} esperando, chip ok). Quer que eu cobre agora? Responde *sim*.`); suggest={mgr:true,action:'cobrar',target_id:alvo.id,q:alvo.quentes}; }
  else{ lines.push(``,`Comandos: *meta* · *quadrante* · *diagnostico* · *menu*`); }
  return { text: lines.join('\n'), suggest };
}

async function resolveMgr(supabase,phone){ const {data:brokerChips}=await supabase.from('bot_instances').select('id').in('phone',phoneVariants(phone)); const ids=(brokerChips||[]).map(c=>c.id); const {data:mgr}=await supabase.from('profiles').select('id, first_name, role, team_id').in('bot_instance_id', ids.length?ids:['00000000-0000-0000-0000-000000000000']).maybeSingle(); return mgr; }

serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const supabase=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const openaiKey=Deno.env.get('OPENAI_API_KEY')||'';
    const body=await req.json().catch(()=>({}));

    if(body?.preview===true && body?.manager_phone){
      const mgr=await resolveMgr(supabase,String(body.manager_phone));
      if(!mgr||!['MANAGER','SUPERINTENDENT'].includes(mgr.role)) return new Response(JSON.stringify({error:'not_manager'}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
      const team=await teamRaioX(supabase,mgr.id);
      const t=norm(body.text||'raio-x');
      let reply;
      if(/^(menu|ajuda|oi|ola|opcoes|comandos|o que voce faz)$/.test(t)){ reply=menuText(mgr.first_name); }
      else if(/diagnostico|por que.*(meta|vend|pouco)|falta de lead|time ou.*script|script ou|onde.*(gargalo|problema)|e lead ou/.test(t)){ reply=await diagnosticoText(supabase,mgr.id,mgr.first_name||'gerente'); }
      else if(/quadrante|quem ta bom|quem ta ruim|quem queima|diamante|batalhador|fantasma|quem trabalha|meu time|como tao/.test(t)){ reply=await quadranteText(supabase,mgr.id,mgr.first_name||'gerente'); }
      else if(/meta|quanto falta|vendas/.test(t)){ const m=await metaMotor(supabase,mgr.team_id,mgr.id); reply=`${m.text}`; }
      else { const rx=await buildRaioX(supabase,openaiKey,mgr,team); reply=rx.text; }
      return new Response(JSON.stringify({preview:true, manager:mgr.first_name, reply}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    const inboxId=body?.inbox_id;
    if(!inboxId) return new Response(JSON.stringify({error:'inbox_id required'}),{status:400,headers:corsHeaders});
    const { data: row } = await supabase.from('comandra_inbox').select('*').eq('id',inboxId).maybeSingle();
    if(!row) return new Response(JSON.stringify({error:'row not found'}),{status:404,headers:corsHeaders});
    const { data: chips } = await supabase.from('bot_instances').select('id, evolution_api_url, evolution_api_key, instance_name').eq('instance_name',row.instance_name).like('evolution_api_url','https://%').limit(1);
    const chip=chips?.[0]; const url=chip?.evolution_api_url||'https://api.ape77.com.br'; const key=chip?.evolution_api_key||'';
    const mgr=await resolveMgr(supabase,row.broker_phone);
    const reply=async(t)=>{ const ok=await sendText(url,key,row.instance_name,row.broker_phone,t); await supabase.from('comandra_inbox').update({status:ok?'done':'error',processed_at:new Date().toISOString()}).eq('id',inboxId); return ok; };
    if(!mgr||!['MANAGER','SUPERINTENDENT'].includes(mgr.role)){ await reply('Esse canal e pro gerente. Falha ao te identificar.'); return new Response(JSON.stringify({skipped:'not_manager'}),{headers:corsHeaders}); }

    let text=row.message_text||''; const isText=!row.message_type||row.message_type==='text';
    if(!isText&&openaiKey){ const a=await getAudioB64(url,key,row.instance_name,row.message_id,row.raw); if(a){ const tr=await transcribe(a.b64,a.mime,openaiKey); if(tr)text=tr; } }
    if(!text){ await reply('Nao consegui entender o audio. Manda de novo ou escreve.'); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }

    const team=await teamRaioX(supabase,mgr.id); const nome=mgr.first_name||'gerente';
    const { data: bstate } = await supabase.from('comandra_broker').select('pending_context').eq('broker_phone',row.broker_phone).maybeSingle();
    const pend=bstate?.pending_context;
    const clearPend=()=>supabase.from('comandra_broker').upsert({broker_phone:row.broker_phone,pending_context:null},{onConflict:'broker_phone'});
    const setPend=(ctx)=>supabase.from('comandra_broker').upsert({broker_phone:row.broker_phone,pending_context:ctx},{onConflict:'broker_phone'});

    // Opt-in do card da manha (o gerente respondeu ao convite)
    if(pend?.mgr && pend?.type==='optin'){
      const n2=norm(text);
      const yes=/(^|\s)(pode|sim|claro|manda|bora|vamos|quero|aceito|ok|beleza|isso|comeca|comecar|topo|pode sim|pode comecar)(\s|$)/.test(n2) || /^1$/.test(n2);
      const no=/(^|\s)(nao|agora nao|depois|mais tarde|deixa|nao quero|nao precisa)(\s|$)/.test(n2) || /^2$/.test(n2);
      if(no && !yes){ await clearPend(); await supabase.from('comandra_manager_prefs').upsert({manager_id:mgr.id, morning_optin:false, updated_at:new Date().toISOString()},{onConflict:'manager_id'}); await reply(`Tranquilo, ${nome}. Quando quiser eu comeco — e so me mandar *bom dia*. 👊`); return new Response(JSON.stringify({ok:true,intent:'optin_declined'}),{headers:corsHeaders}); }
      if(yes){ await clearPend(); await supabase.from('comandra_manager_prefs').upsert({manager_id:mgr.id, morning_optin:true, greeted_date:brtToday(), updated_at:new Date().toISOString()},{onConflict:'manager_id'}); await reply(`Fechado, ${nome}! Comeco amanha de manha. 💪 Se quiser um gostinho agora, manda *raio-x*.`); return new Response(JSON.stringify({ok:true,intent:'optin_accepted'}),{headers:corsHeaders}); }
      await reply(`So me confirma: quer que eu te de o toque de manha? Responde *pode* ou *agora nao*.`); return new Response(JSON.stringify({ok:true,intent:'optin_reask'}),{headers:corsHeaders});
    }

    if(pend?.mgr && pend?.type==='briefing'){
      const est=pend.estado; await clearPend();
      const n2=norm(text);
      if(/^(nao|deixa|agora nao|depois|mais tarde)$/.test(n2)){ await reply(`Tranquilo, ${nome}. Quando quiser eu te mostro — e so mandar *menu*. 👊`); return new Response(JSON.stringify({ok:true,intent:'briefing_declined'}),{headers:corsHeaders}); }
      let payoff, suggest=null;
      if(est==='gargalo'){ payoff=await diagnosticoText(supabase,mgr.id,nome); }
      else if(est==='quadrante'){ payoff=await quadranteText(supabase,mgr.id,nome); }
      else { const rx=await buildRaioX(supabase,openaiKey,mgr,team); payoff=rx.text; suggest=rx.suggest; }
      if(suggest) await setPend(suggest);
      await reply(payoff);
      return new Response(JSON.stringify({ok:true,intent:'briefing_payoff',estado:est}),{headers:corsHeaders});
    }

    // Recebendo a DATA pra exportar o CSV
    if(pend?.mgr && pend?.type==='export_dates'){
      const n2=norm(text);
      if(/^(nao|deixa|cancela|cancelar|para|parar)$/.test(n2)){ await clearPend(); await reply('Ok, cancelei o CSV.'); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }
      const dr=parseDateRange(text);
      if(!dr){ await reply(`Nao entendi a data 🤔. Me manda assim: *01/06/2026 a 30/06/2026* (ou 01/06 a 30/06).`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }
      await clearPend();
      const { data: brs } = await supabase.from('profiles').select('id, first_name').eq('manager_id',mgr.id).eq('role','BROKER');
      const nameById={}; (brs||[]).forEach(b=>{ nameById[b.id]=b.first_name; }); const bids=(brs||[]).map(b=>b.id);
      if(!bids.length){ await reply('Nao achei corretores na sua equipe.'); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }
      const { data: ls } = await supabase.from('leads').select('name,phone,renda_declarada,tipo_trabalho,broker_id,status,created_at').in('broker_id',bids).gte('created_at',dr.startISO).lt('created_at',dr.endISO).order('created_at',{ascending:true}).limit(5000);
      const rows=ls||[];
      if(!rows.length){ await reply(`Nao achei leads da sua equipe entre *${dr.label}*.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }
      const header=['Nome','Telefone','Renda','Tipo de trabalho','Corretor','Status'].map(csvField).join(',');
      const body2=rows.map(l=>[l.name,l.phone,l.renda_declarada,l.tipo_trabalho,nameById[l.broker_id]||'(sem corretor)',l.status].map(csvField).join(',')).join('\n');
      const csv='﻿'+header+'\n'+body2;
      const b64=toB64Utf8(csv);
      const fileName=`leads_${(nome||'equipe').toLowerCase()}_${dr.label.replace(/[^0-9]/g,'')}.csv`;
      const okDoc=await sendDocument(url,key,row.instance_name,row.broker_phone,b64,fileName,`📥 ${rows.length} leads de *${dr.label}* — equipe ${nome}.`);
      if(!okDoc) await sendText(url,key,row.instance_name,row.broker_phone,'Gerei o CSV mas nao consegui enviar o arquivo agora. Tenta de novo?');
      await supabase.from('comandra_inbox').update({status:'done',processed_at:new Date().toISOString()}).eq('id',inboxId);
      return new Response(JSON.stringify({ok:true,exported:rows.length}),{headers:corsHeaders});
    }

    const r=await routeIntent(text,openaiKey); const intent=r?.intent||'outro';

    if(pend?.mgr&&(intent==='confirmar'||/^[123]$/.test(norm(text)))){
      await clearPend();
      if(pend.action==='cobrar'){ const b=team.find(x=>x.id===pend.target_id); const {data:bp}=await supabase.from('profiles').select('phone').eq('id',pend.target_id).maybeSingle(); let ok=false; if(bp?.phone) ok=await sendText(url,key,row.instance_name,digits(bp.phone),COBRANCA(b?.name||'Corretor',pend.q||0)); await reply(ok?`✅ Cobrei o ${b?.name} agora pelo seu WhatsApp. Te aviso se ele reagir.`:`⚠️ Nao consegui falar com o ${b?.name} (sem telefone/numero off).`); }
      else if(pend.action==='tirar_roleta'){ await supabase.from('profiles').update({lead_assignment_enabled:false,updated_at:new Date().toISOString()}).eq('id',pend.target_id).eq('manager_id',mgr.id); await reply(`✅ Tirei o ${pend.target_name} da roleta.`); }
      else { await reply('Ok!'); }
      return new Response(JSON.stringify({ok:true,executed:pend.action}),{headers:corsHeaders});
    }
    if(pend?.mgr&&intent==='cancelar'){ await clearPend(); await reply('Ok, deixei como estava.'); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }

    if(intent==='menu'){ await reply(menuText(nome)); return new Response(JSON.stringify({ok:true,intent:'menu'}),{headers:corsHeaders}); }

    if(intent==='meta'){ const m=await metaMotor(supabase,mgr.team_id,mgr.id); await reply(m.text+`\n\nPra o diagnostico da equipe, manda *diagnostico*. Pra quem ta produzindo, *quadrante*. Menu completo: *menu*.`); return new Response(JSON.stringify({ok:true,intent:'meta'}),{headers:corsHeaders}); }

    if(intent==='quadrante'){ await reply(await quadranteText(supabase,mgr.id,nome)); return new Response(JSON.stringify({ok:true,intent:'quadrante'}),{headers:corsHeaders}); }

    if(intent==='diagnostico'){ await reply(await diagnosticoText(supabase,mgr.id,nome)); return new Response(JSON.stringify({ok:true,intent:'diagnostico'}),{headers:corsHeaders}); }

    if(intent==='exportar_leads'){
      await setPend({mgr:true,type:'export_dates'});
      await reply(`Beleza, ${nome}! De qual periodo voce quer os leads da equipe?\n\nMe manda a data assim: *01/06/2026 a 30/06/2026* (ou 01/06 a 30/06).`);
      return new Response(JSON.stringify({ok:true,intent:'exportar_leads'}),{headers:corsHeaders});
    }

    if(intent==='meus_leads'){
      const { data: ls } = await supabase.from('leads').select('name,status,last_lead_response_at,last_broker_whatsapp_at').eq('broker_id',mgr.id).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")');
      const arr=ls||[]; const novos=arr.filter(l=>!l.last_broker_whatsapp_at); const quentes=arr.filter(l=>{ const rr=l.last_lead_response_at?Date.parse(l.last_lead_response_at):0; const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; return rr>0&&rr>w; }); const andamento=arr.length-novos.length;
      const lines=[`📋 *Seus leads, ${nome}*`,``,`🆕 Novos (voce ainda nao falou): *${novos.length}*`,`🔥 Responderam e te esperando: *${quentes.length}*`,`💬 Em andamento: *${andamento}*`,`📌 Total ativo: *${arr.length}*`];
      if(quentes.length) lines.push(``,`Quentes pra retornar: ${quentes.slice(0,8).map(l=>fn(l.name)).join(', ')}`);
      lines.push(``,`Pra ver a equipe, manda *raio-x*.`); await reply(lines.join('\n')); return new Response(JSON.stringify({ok:true,intent:'meus_leads'}),{headers:corsHeaders});
    }

    if(intent==='raio_x'){ const rx=await buildRaioX(supabase,openaiKey,mgr,team); if(rx.suggest) await setPend(rx.suggest); await reply(rx.text); return new Response(JSON.stringify({ok:true,intent:'raio_x'}),{headers:corsHeaders}); }

    if(intent==='cobrar'){ const m=matchBroker(team,r.alvo||''); if(!m.length){ await reply(`Nao achei *${r.alvo||'?'}* na sua equipe.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); } if(m.length>1){ await reply(`Achei mais de um: ${m.map(x=>x.name).join(', ')}. Qual o nome completo?`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); } const b=m[0]; const {data:bp}=await supabase.from('profiles').select('phone').eq('id',b.id).maybeSingle(); let ok=false; if(bp?.phone) ok=await sendText(url,key,row.instance_name,digits(bp.phone),COBRANCA(b.name,b.quentes)); await reply(ok?`✅ Cobrei o *${b.name}* (${b.quentes} esperando) pelo seu WhatsApp.`:`⚠️ Nao consegui falar com o ${b.name}.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }

    if(intent==='tirar_roleta'||intent==='ativar'){ const m=matchBroker(team,r.alvo||''); if(m.length!==1){ await reply(m.length?`Qual deles? ${m.map(x=>x.name).join(', ')}`:`Nao achei *${r.alvo||'?'}* na sua equipe.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); } const enable=intent==='ativar'; await supabase.from('profiles').update({lead_assignment_enabled:enable,updated_at:new Date().toISOString()}).eq('id',m[0].id).eq('manager_id',mgr.id); await reply(enable?`✅ Ativei o *${m[0].name}* — volta a receber lead.`:`✅ Tirei o *${m[0].name}* da roleta.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); }

    if(intent==='distribuir'){ const a=matchBroker(team,r.alvo||''); const dest=matchBroker(team,r.destino||''); if(a.length!==1||dest.length!==1){ await reply(`Me diz claro: *passa os leads do [nome] pro [nome]*.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); } const {data:ls}=await supabase.from('leads').select('id,last_lead_response_at,last_broker_whatsapp_at').eq('broker_id',a[0].id).not('status','in','(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")'); const moveIds=(ls||[]).filter(l=>{ const rr=l.last_lead_response_at?Date.parse(l.last_lead_response_at):0; const w=l.last_broker_whatsapp_at?Date.parse(l.last_broker_whatsapp_at):0; return rr>0&&rr>w; }).map(l=>l.id); if(!moveIds.length){ await reply(`O ${a[0].name} nao tem cliente quente esperando pra passar.`); return new Response(JSON.stringify({ok:true}),{headers:corsHeaders}); } await supabase.from('leads').update({broker_id:dest[0].id,status:'IN_PROGRESS'}).in('id',moveIds); await reply(`✅ Passei *${moveIds.length}* clientes quentes do ${a[0].name} pro *${dest[0].name}*.`); return new Response(JSON.stringify({ok:true,moved:moveIds.length}),{headers:corsHeaders}); }

    // Fora do catalogo: entende e RESPONDE em linguagem livre (read-only). Acoes ficam nos comandos acima.
    const metaSnap=await metaMotor(supabase,mgr.team_id,mgr.id).catch(()=>null);
    const fa=await freeAnswer(supabase, openaiKey, mgr, team, metaSnap, text);
    await reply(fa || menuText(nome));
    return new Response(JSON.stringify({ok:true,intent:fa?'free_answer':'menu_fallback'}),{headers:corsHeaders});
  }catch(err){ console.error('[comandra-manager]',err?.message); return new Response(JSON.stringify({error:err?.message}),{status:500,headers:corsHeaders}); }
});
