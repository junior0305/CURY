import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const BULK_CAP = 15;

function norm(t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function digits(p) { return (p || '').replace(/\D/g, ''); }
function isPilot(phone, list) { const d = digits(phone); return (list || []).some((p) => { const pd = digits(p); return pd && (d === pd || d.endsWith(pd) || pd.endsWith(d)); }); }
function phoneVariants(p) { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function confirmKind(t) { const n = norm(t); if (/\b(cancela|cancelar|deixa|esquece|esquecer|negativo|nao manda|nao mandar|nao envia)\b/.test(n) || n === 'nao' || n === 'n') return 'cancel'; if (/^(manda|mandar|envia|enviar|pode|sim|ok|okay|isso|vai|bora|beleza|blz|confirmo|positivo|perfeito|otimo|certo)\b/.test(n) || n === 'ok' || n === 'manda ver') return 'confirm'; return 'other'; }
function isMenu(t) { const n = norm(t); if (n.length > 25) return false; return /\b(menu|ajuda|help|opcoes|opcao|comandos|comando|oi|ola|bom dia|boa tarde|boa noite|tudo bem|comandra|o que voce faz|o que vc faz|o que voce pode)\b/.test(n); }
function brtToday() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function fmtVisit(iso) { const m = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ''); if (!m) return 'na data combinada'; return `${m[3]}/${m[2]} as ${m[4]}h${m[5] !== '00' ? m[5] : ''}`; }

function verticalCfg(v) {
  const cons = v === 'consorcio';
  return {
    cons,
    SELLER: cons
      ? 'Voce e um consultor de consorcio experiente, escrevendo a mensagem que o CORRETOR vai mandar pro cliente. PRONTO pra colar (sem aspas, sem comentario). Curta, calorosa, brasileira. Ancore no que o lead ja disse (o bem que ele quer, o valor). Foque no objetivo. NAO fale em financiamento, juros, entrada, MCMV nem visita a imovel. Apenas a mensagem.'
      : 'Voce e o vendedor mais experiente de uma imobiliaria MCMV, escrevendo a mensagem que o CORRETOR vai mandar pro cliente. Entregue PRONTO pra colar (sem aspas, sem comentario). Curta, calorosa, brasileira. Ancore no que o lead ja disse. Foque no objetivo. Sem prometer aprovacao de banco. Apenas a mensagem.',
    VISIT: cons
      ? 'Voce e o melhor consultor de consorcio. Escreva a mensagem que o CORRETOR vai mandar pro cliente com UM objetivo: agendar uma APRESENTACAO/SIMULACAO da carta de credito. Ofereca 2 opcoes concretas de dia/horario (ligacao rapida ou online) pra facilitar o sim. Ancore no bem que o lead quer. NAO fale em financiamento/juros/MCMV/visita a imovel. Curta, calorosa, brasileira, pronta pra colar. So a mensagem, sem aspas.'
      : 'Voce e o melhor vendedor de uma imobiliaria MCMV. Escreva a mensagem que o CORRETOR vai mandar pro cliente com UM objetivo: marcar a VISITA ao decorado/apartamento. Ofereca 2 opcoes concretas de dia/horario pra facilitar o sim, reforce que ao vivo ele ve a unidade e a gente resolve tudo (renda, FGTS, condicoes), crie uma leve urgencia HONESTA sem mentir e sem prometer aprovacao de banco. Ancore no que o lead ja disse. Curta, calorosa, brasileira, pronta pra colar. So a mensagem, sem aspas.',
    PROSPECT: cons
      ? 'Voce e um consultor de consorcio fazendo o PRIMEIRO contato (frio) pelo WhatsApp. Abertura curta, calorosa, honesta e leve: se apresenta rapido, diz que trabalha com consorcio (carta de credito, sem juros) e pergunta com leveza se pode mostrar uma simulacao. NAO seja invasivo. Use o primeiro nome se houver. So a mensagem, sem aspas.'
      : 'Voce e um corretor de MCMV fazendo o PRIMEIRO contato (frio) com um possivel cliente pelo WhatsApp. Escreva uma abertura curta, calorosa, honesta e leve: se apresenta rapido, diz que trabalha com apartamentos Minha Casa Minha Vida na regiao, e pergunta com leveza se pode mandar algumas opcoes. NAO prometa aprovacao, NAO seja invasivo. Use o primeiro nome se houver. So a mensagem, sem aspas.',
    visitWord: cons ? 'apresentacao da carta' : 'visita',
    jogadaObj: cons ? 'agendar a APRESENTACAO/SIMULACAO da carta de credito (oferecer 2 opcoes de dia/horario, baixar a friccao)' : 'fechar a VISITA ao decorado (oferecer 2 opcoes de dia/horario, baixar a friccao)',
    menuVisitEx: cons ? 'como apresento a carta pro Joao' : 'como fecho a visita do Joao',
    onboard2: cons ? 'Comigo voce organiza o dia, cadastra lead, prospecta e recebe a *mensagem pronta* pra agendar a apresentacao da carta. Tudo aqui no WhatsApp.' : 'Comigo voce organiza o dia, cadastra lead, prospecta e recebe a *mensagem pronta* pra fechar a visita. Tudo aqui no WhatsApp.',
    prospectFallback: cons ? ((nm) => `Oi ${nm}! Tudo bem? Trabalho com consorcio (carta de credito) e posso te mostrar uma simulacao rapida. Posso? 😊`) : ((nm) => `Oi ${nm}! Tudo bem? Trabalho com apartamentos do Minha Casa Minha Vida aqui na regiao. Posso te mandar algumas opcoes? 😊`),
  };
}

function menuText(nome, cfg) { const n = nome || 'corretor'; return [`${n}, sou a Comandra. Fala comigo do seu jeito — por *texto ou audio*, em portugues normal. Eu entendo e executo.`, ``, `Algumas coisas que voce pode me pedir:`, `• *o que eu faco hoje* — organizo seu dia e digo por quem comecar`, `• *manda mensagem pro Joao* — eu escrevo e mando (voce confirma)`, `• *manda pros parados* — reativo varios de uma vez`, `• *quero prospectar* — te dou um lead novo`, `• *${cfg.menuVisitEx}* — te entrego a jogada pronta`, `• *cadastra Maria 11999998888* — coloco no seu funil`, `• *meus modelos* — deixamos suas mensagens na sua voz`, ``, `Nao precisa decorar nada. Me diz o que precisa, por texto ou audio. Pra ver isso de novo, digite *menu*.`].join('\n'); }
const TODAY_KW = ['o que faco hoje','o que fazer hoje','o que eu faco','meus leads','o que faco','meu dia','o que tenho'];

async function openaiJSON(system, user, key, maxTokens) { try { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0 }) }); const j = await r.json().catch(() => null); const txt = j?.choices?.[0]?.message?.content; return txt ? JSON.parse(txt) : null; } catch { return null; } }
async function openaiText(system, user, key, maxTokens) { try { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.6 }) }); const j = await r.json().catch(() => null); return (j?.choices?.[0]?.message?.content || '').trim() || null; } catch { return null; } }

const ROUTER_PROMPT = `Voce e o roteador de um assistente de vendas (imoveis ou consorcio) no WhatsApp. Classifique a intencao e extraia os dados. Responda APENAS JSON:\n{"intent":"cadastrar_lead"|"ver_leads"|"mandar_mensagem"|"mandar_varios"|"info_lead"|"prospectar"|"jogada_visita"|"agendar_visita"|"parar_automatico"|"voltar_automatico"|"editar_kit"|"outro","lead_name":"nome SO da pessoa, ou null","lead_phone":"so digitos, ou null","objetivo":"o foco da mensagem, senao null","filtro":"se mandar_varios: esses|todos|parados|sem_contato|novos|responderam|quentes","regiao":"se prospectar: a cidade/bairro/regiao mencionada, ou null","visit_at":"se agendar_visita: data e hora ISO 8601 com fuso -03:00 resolvida a partir de HOJE, ou null","kit_slot":"se editar_kit: welcome|followup|audio, ou null"}\nIMPORTANTE: "manda pra todos"/"manda pros parados"=mandar_varios. "manda pra eles"/"manda pra esses"=mandar_varios filtro=esses. "manda pro Joao"=mandar_mensagem. "o que faco hoje"=ver_leads. "cadastre Maria 11999"=cadastrar_lead. "qual telefone do Joao"=info_lead. "quero prospectar"/"proximo"/"mais um"=prospectar. "como agendo/marco a visita do Joao"/"como apresento a carta pro Joao"/"jogada pra fechar a visita/apresentacao do Joao"=jogada_visita. "agendei a visita/apresentacao do Joao sabado 10h"/"marquei o Joao dia 20 as 15h"=agendar_visita (extrai lead_name E visit_at ISO). "para de mandar sozinho"/"parar mensagem automatica"/"nao me manda automatico"=parar_automatico. "pode mandar sozinho"/"volta o automatico"/"pode voltar a mandar"=voltar_automatico. "quero refazer meu welcome"/"mudar minha mensagem de boas vindas"/"regravar meu audio"/"editar meu follow-up"/"meus modelos"/"minhas mensagens"=editar_kit (kit_slot: welcome se boas-vindas, followup se follow-up, audio se audio/regravar). Senao outro.`;

async function sendSelf(url, key, instance, phone, text) { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }
async function sendAudioEvo(url, key, instance, phone, b64) { try { const audio = (b64 || '').replace(/^data:[^;]+;base64,/, ''); const r = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: (phone || '').replace(/\D/g, ''), audio }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function transcribeVoice(url, key, instance, messageId, raw, openaiKey) {
  let b64 = raw?.message?.base64 || raw?.base64 || raw?.data?.base64 || '';
  if (!b64 && (messageId || raw)) {
    const tryBodies = [];
    if (messageId) tryBodies.push({ message: { key: { id: messageId } }, convertToMp4: false });
    const m = raw?.message || raw?.data?.message; if (m) tryBodies.push({ message: m, convertToMp4: false });
    for (const b of tryBodies) { try { const r = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) continue; const j = await r.json().catch(() => null); const got = j?.base64 || j?.media || j?.buffer; if (got && got.length > 100) { b64 = got; break; } } catch {} }
  }
  if (!b64 || !openaiKey) return '';
  try {
    const clean = String(b64).replace(/^data:[^,]+,/, ''); const bin = atob(clean); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const fd = new FormData(); fd.append('file', new Blob([arr], { type: 'audio/ogg' }), 'cmd.ogg'); fd.append('model', 'whisper-1'); fd.append('language', 'pt');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + openaiKey }, body: fd });
    const j = await r.json().catch(() => null); return j?.text || '';
  } catch { return ''; }
}

async function brokerLeads(supabase, profileId) { const { data } = await supabase.from('leads').select('id, name, phone, status, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, created_at').eq('broker_id', profileId).not('status', 'in', '(\"ABANDONED\",\"EXCLUDED\",\"CONCLUDED\")').order('last_lead_response_at', { ascending: false, nullsFirst: false }).limit(200); return data || []; }
function matchLead(leads, name) { const tn = norm(name); if (!tn) return []; const full = leads.filter((l) => { const cn = norm(l.name || ''); return cn.includes(tn) || tn.includes(cn); }); if (full.length) return full; const tw = tn.split(' '); return leads.filter((l) => norm(l.name || '').split(' ').some((w) => w.length > 2 && tw.includes(w))); }
function filterLeads(leads, filtro) { const f = norm(filtro || 'todos'); if (f.includes('parado') || f.includes('sem contato') || f.includes('novo')) return leads.filter((l) => (l.status === 'NEW' && (!l.contact_attempts || l.contact_attempts === 0)) || !l.last_broker_whatsapp_at); if (f.includes('respond') || f.includes('quente') || f.includes('esperando')) return leads.filter((l) => { const resp = l.last_lead_response_at ? new Date(l.last_lead_response_at).getTime() : 0; const bro = l.last_broker_whatsapp_at ? new Date(l.last_broker_whatsapp_at).getTime() : 0; return resp > 0 && resp > bro; }); return leads; }
function buildToday(leads, firstName, cfg) { const nome = firstName || 'corretor'; if (!leads.length) return `🎯 *Seu dia*\n\nVoce ainda nao tem leads ativos. Me manda um (nome + telefone) que eu cadastro, ou diz *\"quero prospectar\"*! 💪`; const novos = leads.filter((l) => l.status === 'NEW').length; const atend = leads.filter((l) => ['IN_PROGRESS', 'REACTIVATED', 'FOLLOW_UP_AUTO'].includes(l.status)).length; const negoc = leads.filter((l) => l.status === 'NEGOTIATING').length; const visita = leads.filter((l) => ['VISIT_SCHEDULED', 'VISITA_REALIZADA'].includes(l.status)).length; const docs = leads.filter((l) => l.status === 'DOCS_REQUESTED').length; const now = Date.now(); const dias = (l) => { const base = l.last_broker_whatsapp_at || l.created_at; return base ? Math.max(0, Math.floor((now - new Date(base).getTime()) / 86400000)) : 0; }; const sem = [...leads].filter((l) => !l.last_broker_whatsapp_at).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()); const fn = (n) => (n || 'Lead').split(' ')[0]; const lines = [`🎯 *Seu dia, ${nome}*`, `\n📊 *Seu funil:*`]; if (novos) lines.push(`• 🆕 Novos: ${novos}`); if (atend) lines.push(`• 💬 Em atendimento: ${atend}`); if (negoc) lines.push(`• 🤝 Negociando: ${negoc}`); if (visita) lines.push(`• 📅 ${cfg.cons ? 'Apresentacao' : 'Visita'}: ${visita}`); if (docs) lines.push(`• 📄 Documentos: ${docs}`); if (sem.length) { lines.push(`\n⏳ *Sem contato ha mais tempo (${sem.length}):*`); sem.slice(0, 6).forEach((l) => lines.push(`• ${fn(l.name)} — ${dias(l)}d`)); } lines.push(`\n💡 *\"manda pra eles\"* (reativa) ou *\"quero prospectar\"* (leads novos).`); return lines.join('\n'); }
async function leadHistory(supabase, leadId) { const { data: conv } = await supabase.from('ia_conversations').select('id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (!conv?.id) return '(sem conversa)'; const { data: msgs } = await supabase.from('ia_messages').select('direction, message_text').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(8); if (!msgs || !msgs.length) return '(sem mensagens)'; return [...msgs].reverse().map((m) => `[${m.direction === 'incoming' ? 'LEAD' : 'CORRETOR'}] ${m.message_text}`).join('\n'); }

async function genAndPend(supabase, openaiKey, instanceName, brokerPhone, profileId, brokerBotId, lead, objetivo, sysPrompt) {
  const hist = await leadHistory(supabase, lead.id);
  const msg = await openaiText(sysPrompt, `Cliente: ${lead.name}. Objetivo: ${objetivo}.\n\nConversa:\n${hist}\n\nEscreva a mensagem.`, openaiKey, 300);
  if (!msg) return 'Tive um problema pra gerar agora. Tenta de novo? 🙅';
  await supabase.from('comandra_pending_action').insert({ instance_name: instanceName, broker_phone: brokerPhone, profile_id: profileId, bot_instance_id: brokerBotId || null, lead_id: lead.id, lead_name: lead.name, lead_phone: lead.phone, objective: objetivo, message: msg, status: 'awaiting_confirmation' });
  return `Pro *${lead.name}*, montei isso:\n\n${msg}\n\n➡️ Mando agora? *manda* / ajuste / *cancela*.`;
}
async function doBulk(supabase, openaiKey, brokerBotId, leads, objetivo, cfg) {
  const cap = leads.slice(0, BULK_CAP); const okN = []; const failN = [];
  for (const l of cap) {
    const hist = await leadHistory(supabase, l.id);
    const msg = await openaiText(cfg.SELLER, `Cliente: ${l.name}. Objetivo: ${objetivo}.\n\nConversa:\n${hist}\n\nEscreva a mensagem.`, openaiKey, 300);
    let sent = false;
    if (msg && brokerBotId && l.phone) { try { const { error } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: brokerBotId, phone: l.phone, message: msg } }); sent = !error; } catch { sent = false; } }
    const fn = (l.name || 'Lead').split(' ')[0]; if (sent) okN.push(fn); else failN.push(fn); await sleep(1500);
  }
  let r = `✅ Enviei *personalizada* pra ${okN.length}: ${okN.join(', ')}`; if (failN.length) r += `\n⚠️ Nao consegui em: ${failN.join(', ')}`; if (leads.length > BULK_CAP) r += `\n(eram ${leads.length}, mandei os primeiros ${BULK_CAP})`; return r;
}

async function runRouter(supabase, openaiKey, instanceName, brokerPhone, profileId, firstName, brokerBotId, text, cfg) {
  const r = await openaiJSON(ROUTER_PROMPT, `Hoje e ${brtToday()} (America/Sao_Paulo). Mensagem: \"${text}\"`, openaiKey, 200);
  const intent = r?.intent || 'outro';
  const leadName = r?.lead_name ? String(r.lead_name).trim() : '';
  const leadPhone = r?.lead_phone ? digits(String(r.lead_phone)) : '';
  const objetivo = r?.objetivo ? String(r.objetivo).trim() : 'continuar o atendimento';
  const visitAt = r?.visit_at ? String(r.visit_at).trim() : '';
  if (intent === 'cadastrar_lead') {
    if (!leadPhone && !leadName) return 'Me manda o *nome e o telefone*. Ex: *Amanda 11999998888* 🙂';
    if (!leadPhone) return `Qual o telefone do(a) *${leadName || 'cliente'}*? Manda: *${leadName || 'Nome'} 11999998888*`;
    if (!leadName) return 'Faltou o *nome*. Manda: *Nome 11999998888* 🙂';
    let stored = leadPhone; if (/^[1-9][1-9][0-9]{8,9}$/.test(stored)) stored = '55' + stored;
    const { data: exists } = await supabase.from('leads').select('id, name').in('phone', phoneVariants(stored)).not('status', 'in', '(\"EXCLUDED\")').limit(1).maybeSingle();
    if (exists) return `Esse numero ja esta no sistema (${exists.name}). 👍`;
    const { data: nl, error: lerr } = await supabase.from('leads').insert({ name: leadName, phone: stored, broker_id: profileId, status: 'NEW', source: 'comandra_manual' }).select('id, name').maybeSingle();
    if (lerr || !nl) return `Nao consegui cadastrar agora 🙅 (${lerr?.message?.substring(0, 50) || 'erro'}).`;
    return `✅ *${leadName}* cadastrado, ja ta no seu funil! Quer a abertura? Manda *\"abre o ${leadName.split(' ')[0]}\"*.`;
  }
  if (intent === 'ver_leads') { const ls = await brokerLeads(supabase, profileId); const sem = [...ls].filter((l) => !l.last_broker_whatsapp_at).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()); await supabase.from('comandra_broker').update({ last_list: sem.slice(0, BULK_CAP).map((l) => l.id) }).eq('broker_phone', brokerPhone); return buildToday(ls, firstName, cfg); }
  if (intent === 'info_lead') { const ls = await brokerLeads(supabase, profileId); const m = leadName ? matchLead(ls, leadName) : []; if (!m.length) return leadName ? `Nao achei *${leadName}* nos seus leads. 🤔` : 'De qual cliente?'; if (m.length > 1) return `Achei mais de um: ${m.slice(0, 5).map((l) => l.name).join(', ')}. Qual o nome completo?`; const l = m[0]; return `👤 *${l.name}*\n📞 ${l.phone}\n📍 Status: ${l.status}`; }
  if (intent === 'jogada_visita') {
    const ls = await brokerLeads(supabase, profileId); const m = leadName ? matchLead(ls, leadName) : [];
    if (!m.length) return leadName ? `Nao achei *${leadName}* nos seus leads. 🤔` : `Pra qual cliente voce quer a jogada de ${cfg.visitWord}? Me diz o nome.`;
    if (m.length === 1) return await genAndPend(supabase, openaiKey, instanceName, brokerPhone, profileId, brokerBotId, m[0], cfg.jogadaObj, cfg.VISIT);
    await supabase.from('comandra_broker').update({ pending_context: { type: 'choose_lead', objetivo: cfg.jogadaObj, use_visit: true, candidates: m.slice(0, 8).map((l) => ({ id: l.id, name: l.name, phone: l.phone })) } }).eq('broker_phone', brokerPhone);
    return `Achei mais de um: ${m.slice(0, 5).map((l) => l.name).join(', ')}.\nQual? Me manda o *nome completo*.`;
  }
  if (intent === 'agendar_visita') {
    const ls = await brokerLeads(supabase, profileId); const m = leadName ? matchLead(ls, leadName) : [];
    if (!m.length) return leadName ? `Nao achei *${leadName}* nos seus leads. 🤔` : `De qual cliente e a ${cfg.visitWord}?`;
    if (m.length > 1) return `Achei mais de um: ${m.slice(0, 5).map((l) => l.name).join(', ')}. Qual o nome completo?`;
    const l = m[0];
    if (!visitAt) return `Pra que *dia e hora* e a ${cfg.visitWord} do *${l.name}*? Ex: *\"${cfg.cons ? 'apresentacao' : 'visita'} do ${(l.name || '').split(' ')[0]} sabado 10h\"*.`;
    await supabase.from('leads').update({ status: 'VISIT_SCHEDULED', visit_scheduled_at: visitAt, visit_vespera_sent_at: null, visit_dia_sent_at: null, visit_cold_alert_at: null, last_interaction_at: new Date().toISOString() }).eq('id', l.id);
    return `✅ ${cfg.cons ? 'Apresentacao' : 'Visita'} do *${l.name}* marcada pra *${fmtVisit(visitAt)}*.\n\nRelaxa que eu te lembro na *vespera* e no *dia* com a mensagem pronta pra confirmar com ele. 💪`;
  }
  if (intent === 'mandar_varios') {
    const ls = await brokerLeads(supabase, profileId); const f = norm(r?.filtro || ''); let grupo;
    if (f.includes('esses') || f.includes('eles') || f.includes('este') || f.includes('mostrou') || f === '') { const { data: bs } = await supabase.from('comandra_broker').select('last_list').eq('broker_phone', brokerPhone).maybeSingle(); const ids = Array.isArray(bs?.last_list) ? bs.last_list : []; grupo = ids.length ? ls.filter((l) => ids.includes(l.id)) : filterLeads(ls, 'parados'); }
    else grupo = filterLeads(ls, r?.filtro || 'todos');
    if (!grupo.length) return 'Nao achei leads nesse grupo. 🤔';
    return await doBulk(supabase, openaiKey, brokerBotId, grupo, objetivo, cfg);
  }
  if (intent === 'mandar_mensagem') {
    const ls = await brokerLeads(supabase, profileId); const m = leadName ? matchLead(ls, leadName) : [];
    if (!m.length) return leadName ? `Nao achei *${leadName}* nos seus leads. 🤔` : 'Pra quem voce quer mandar? Me diz o nome.';
    if (m.length === 1) return await genAndPend(supabase, openaiKey, instanceName, brokerPhone, profileId, brokerBotId, m[0], objetivo, cfg.SELLER);
    await supabase.from('comandra_broker').update({ pending_context: { type: 'choose_lead', objetivo, candidates: m.slice(0, 8).map((l) => ({ id: l.id, name: l.name, phone: l.phone })) } }).eq('broker_phone', brokerPhone);
    return `Achei mais de um: ${m.slice(0, 5).map((l) => l.name).join(', ')}.\nQual? Me manda o *nome completo* (ex: ${m[0].name}).`;
  }
  if (intent === 'prospectar') {
    const regiao = r?.regiao ? String(r.regiao).trim() : '';
    const { data: regions } = await supabase.from('v_cold_pool_regions').select('tag, disponiveis').limit(10);
    const reg = regions || []; let tag = '';
    if (regiao) { const rn = norm(regiao); const found = reg.find((x) => norm(x.tag).includes(rn) || rn.includes(norm(x.tag))); tag = found?.tag || ''; }
    if (!tag && !regiao) { const { data: bs } = await supabase.from('comandra_broker').select('last_prospect_tag').eq('broker_phone', brokerPhone).maybeSingle(); if (bs?.last_prospect_tag) tag = bs.last_prospect_tag; }
    if (!tag) { if (!reg.length) return 'O pool de prospeccao esta vazio agora. 🤔'; const lst = reg.slice(0, 8).map((x) => `• ${x.tag} (${x.disponiveis})`).join('\n'); return `🎯 *Modo prospeccao* — de qual regiao voce quer um lead?\n${lst}\n\nDiz a regiao (ex: *\"quero prospectar em ${reg[0].tag}\"*).`; }
    const { data: cand } = await supabase.from('cold_contacts').select('id, name, phone').eq('status', 'available').eq('tag', tag).limit(1).maybeSingle();
    if (!cand) return `A regiao *${tag}* nao tem mais leads disponiveis. Escolhe outra. 🤔`;
    const { data: claimed } = await supabase.from('cold_contacts').update({ status: 'claimed', claimed_by: profileId, claimed_at: new Date().toISOString() }).eq('id', cand.id).eq('status', 'available').select('id, name, phone').maybeSingle();
    if (!claimed) return 'Alguem pegou esse na sua frente, tenta de novo. 🏃';
    let opener = '';
    const { data: _wk } = await supabase.from('comandra_broker_kit').select('body').eq('broker_phone', brokerPhone).eq('slot_type', 'welcome').eq('format', 'text').eq('is_active', true).maybeSingle();
    if (_wk?.body) opener = String(_wk.body).replace(/\{\s*nome\s*\}/gi, ((claimed.name || '').split(' ')[0]) || 'tudo bem');
    else opener = (await openaiText(cfg.PROSPECT, `Cliente: ${claimed.name || 'cliente'}. Regiao: ${tag}. Corretor: ${firstName || ''}.`, openaiKey, 200)) || cfg.prospectFallback(((claimed.name || '').split(' ')[0]) || '');
    await supabase.from('comandra_broker').update({ pending_context: { type: 'prospect_send', cold_id: claimed.id, name: claimed.name, phone: claimed.phone, tag, message: opener }, last_prospect_tag: tag }).eq('broker_phone', brokerPhone);
    return `🎯 *Prospeccao* — ${claimed.name || 'Lead'} (${tag})\n\nSugeri:\n${opener}\n\n*manda* pra enviar, me manda *outra versao*, ou *cancela*.`;
  }
  if (intent === 'parar_automatico') {
    const { data: _p } = await supabase.from('profiles').select('automation_settings').eq('id', profileId).maybeSingle();
    await supabase.from('profiles').update({ automation_settings: { ...(_p?.automation_settings || {}), follow_up_enabled: false, ask_before_send: true } }).eq('id', profileId);
    return 'Feito! 🤝 Nao mando mais nada sozinho pros seus leads. Agora eu *te pergunto antes* de cada envio. Quando quiser que eu volte ao automatico, e so dizer *"pode mandar sozinho"*.';
  }
  if (intent === 'voltar_automatico') {
    const { data: _p } = await supabase.from('profiles').select('automation_settings').eq('id', profileId).maybeSingle();
    await supabase.from('profiles').update({ automation_settings: { ...(_p?.automation_settings || {}), follow_up_enabled: true, ask_before_send: false } }).eq('id', profileId);
    return 'Voltei ao automatico! ⚡ Cuido dos follow-ups sozinho de novo. Se quiser parar, e so falar *"para de mandar sozinho"*.';
  }
  if (intent === 'editar_kit') {
    const slot = norm(r?.kit_slot || 'welcome');
    const slotType = slot.includes('follow') ? 'followup' : 'welcome';
    const wantAudio = slot.includes('audio') || slot.includes('regrav');
    await supabase.from('comandra_broker').update({ pending_context: { type: 'edit_kit', slot: slotType, want_audio: wantAudio } }).eq('broker_phone', brokerPhone);
    const label = wantAudio ? `audio de ${slotType === 'followup' ? 'follow-up' : 'boas-vindas'}` : (slotType === 'followup' ? 'mensagem de follow-up' : 'mensagem de boas-vindas');
    return `Bora ajustar sua *${label}*! ✍️ Me manda agora ${wantAudio ? 'o *audio* (na sua voz)' : 'o novo texto — ou um *audio*'}. Eu salvo no seu kit e passo a usar.`;
  }
  // intent vago → clarifica com carinho (entende mesmo quando o corretor nao sabe o que quer)
  const clar = await openaiText(`Voce e a Comandra, parceira de vendas do corretor no WhatsApp (imoveis/consorcio). O corretor mandou algo que voce nao classificou direito. Responda CURTO e caloroso, sem parecer robo: mostre que entendeu o clima e ofereca 2 ou 3 caminhos concretos do que voce pode fazer AGORA (ex: ver o dia dele, escrever a mensagem pra um lead, achar um lead novo, marcar visita, refazer as mensagens dele). Termine convidando ele a dizer qual. Sem aspas.`, `Mensagem do corretor: "${text}"`, openaiKey, 170);
  return clar || menuText(firstName, cfg);
}

function onboardBubbles(firstName, cfg) {
  const nome = firstName || 'corretor';
  return [ `Oi ${nome}! 👋 Sou a *Comandra*. Agora sou sua *parceira de vendas*, nao um sistema de preencher.`, cfg.onboard2, `É so me chamar — por *texto ou audio*:\n• *\"o que faco hoje\"* → te organizo\n• *nome + telefone* → cadastro seu lead\n• *\"quero prospectar\"* → te dou lead novo`, `Bora testar? Me manda *um lead* (nome e telefone) ou diz *\"quero prospectar\"*. 😉` ];
}

// Miolo do cerebro — usado pelo canal WhatsApp (comandra_inbox) e pelo canal dashboard (mode:'chat').
// `raw`/`messageId` so existem no WhatsApp; no dashboard vem vazio e o caminho de audio nao e alcancado.
async function computeReply(ctx) {
  const { supabase, openaiKey, url, key, instanceName, brokerPhone, profileId, firstName, brokerBotId, cfg, text, isText, pilot, bstate, raw, messageId } = ctx;
  if (!isText) return 'Nao consegui ouvir esse audio 🙅 — tenta de novo ou me escreve.';
  if (!profileId) return 'Oi! Ainda nao consegui te identificar pelo seu numero. 😕 Avisa o suporte.';

  const { data: pending } = await supabase.from('comandra_pending_action').select('*').eq('broker_phone', brokerPhone).in('status', ['awaiting_confirmation', 'sugerido']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const pctx = bstate?.pending_context;
  if (pending) {
    let pLeadPhone = pending.lead_phone; let pLeadName = pending.lead_name;
    if ((!pLeadPhone || !pLeadName) && pending.lead_id) { const { data: pl } = await supabase.from('leads').select('name,phone').eq('id', pending.lead_id).maybeSingle(); if (pl) { pLeadPhone = pLeadPhone || pl.phone; pLeadName = pLeadName || pl.name; } }
    const ck = confirmKind(text);
    if (ck === 'confirm') { let sent = false; if (brokerBotId && pLeadPhone) { try { const { error } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: brokerBotId, phone: pLeadPhone, message: pending.message } }); sent = !error; } catch { sent = false; } } await supabase.from('comandra_pending_action').update({ status: sent ? 'sent' : 'error', resolved_at: new Date().toISOString() }).eq('id', pending.id); return sent ? `✅ Enviado pro *${pLeadName}*! Te aviso se ele responder.` : `⚠️ Nao consegui enviar agora. Tenta de novo daqui a pouco.`; }
    if (ck === 'cancel') { await supabase.from('comandra_pending_action').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', pending.id); return `Ok, cancelei a mensagem pro *${pLeadName}*. 👍`; }
    return `⏳ Antes — voce tem uma mensagem pro *${pLeadName}* esperando confirmacao:\n\n${pending.message}\n\nResponde *manda* ou *cancela*.`;
  }
  if (pctx && pctx.type === 'edit_kit') {
    const slot = pctx.slot === 'followup' ? 'followup' : 'welcome';
    if (!isText || pctx.want_audio) {
      let b64 = raw?.message?.base64 || raw?.base64 || raw?.data?.base64 || '';
      if (!b64 && messageId) { try { const rr = await fetch(`${url}/chat/getBase64FromMediaMessage/${instanceName}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }) }); const jj = await rr.json().catch(() => null); b64 = jj?.base64 || jj?.media || ''; } catch {} }
      if (b64 && b64.length > 100) {
        await supabase.from('comandra_broker_kit').update({ is_active: false }).eq('broker_phone', brokerPhone).eq('slot_type', slot).eq('format', 'audio');
        await supabase.from('comandra_broker_kit').insert({ broker_phone: brokerPhone, slot_type: slot, format: 'audio', audio_base64: b64, is_active: true });
        await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone);
        return `Audio salvo na sua voz! ✅ Vou usar no seu ${slot === 'followup' ? 'follow-up' : 'welcome'}.`;
      }
      return 'Nao consegui pegar o audio 🙅 — manda de novo, ou me escreve o texto.';
    }
    await supabase.from('comandra_broker_kit').update({ is_active: false }).eq('broker_phone', brokerPhone).eq('slot_type', slot).eq('format', 'text');
    await supabase.from('comandra_broker_kit').insert({ broker_phone: brokerPhone, slot_type: slot, format: 'text', body: text, is_active: true });
    await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone);
    return `Salvei sua ${slot === 'followup' ? 'mensagem de follow-up' : 'mensagem de boas-vindas'}! ✅ Vou usar ela na sua voz. Quer regravar o *audio* tambem? Diz *"regravar audio"*.`;
  }
  if (pctx && pctx.type === 'prospect_send') {
    const ck = confirmKind(text);
    if (ck === 'confirm') { let sent = false; if (brokerBotId && pctx.phone) { try { const { error } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: brokerBotId, phone: pctx.phone, message: pctx.message } }); sent = !error; } catch { sent = false; } } if (sent) { const { data: _wa } = await supabase.from('comandra_broker_kit').select('audio_base64').eq('broker_phone', brokerPhone).eq('slot_type', 'welcome').eq('format', 'audio').eq('is_active', true).maybeSingle(); if (_wa?.audio_base64) { await sendAudioEvo(url, key, instanceName, pctx.phone, _wa.audio_base64); } await supabase.from('cold_contacts').update({ first_msg_sent_at: new Date().toISOString(), last_msg_sent_at: new Date().toISOString() }).eq('id', pctx.cold_id); } await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone); return sent ? `✅ Enviado pro *${pctx.name || 'lead'}*! Quando responder, vira seu lead. Quer o proximo? Diz *\"proximo\"*.` : `⚠️ Nao consegui enviar agora. Tenta de novo.`; }
    if (ck === 'cancel') { await supabase.from('cold_contacts').update({ status: 'available', claimed_by: null, claimed_at: null }).eq('id', pctx.cold_id); await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone); return 'Ok, devolvi pro pool. 👍'; }
    await supabase.from('comandra_broker').update({ pending_context: { ...pctx, message: text } }).eq('broker_phone', brokerPhone); return `Atualizei pra:\n\n${text}\n\n*manda* pra enviar ou *cancela*.`;
  }
  if (pctx && pctx.type === 'choose_lead' && Array.isArray(pctx.candidates)) {
    const chosen = matchLead(pctx.candidates, text);
    if (chosen.length === 1) { const rep = await genAndPend(supabase, openaiKey, instanceName, brokerPhone, profileId, brokerBotId, chosen[0], pctx.objetivo || 'continuar o atendimento', pctx.use_visit ? cfg.VISIT : cfg.SELLER); await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone); return rep; }
    if (chosen.length > 1) return `Ainda tem mais de um: ${chosen.slice(0, 5).map((c) => c.name).join(', ')}. Me manda o nome *mais completo*.`;
    await supabase.from('comandra_broker').update({ pending_context: null }).eq('broker_phone', brokerPhone);
    return (pilot && openaiKey) ? await runRouter(supabase, openaiKey, instanceName, brokerPhone, profileId, firstName, brokerBotId, text, cfg) : (isMenu(text) ? menuText(firstName, cfg) : 'Por enquanto eu entendo *\"o que faco hoje\"*.');
  }
  if (isText && isMenu(text)) return menuText(firstName, cfg);
  if (pilot && openaiKey) return await runRouter(supabase, openaiKey, instanceName, brokerPhone, profileId, firstName, brokerBotId, text, cfg);
  const n = norm(text);
  return TODAY_KW.some((k) => n.includes(k)) ? buildToday(await brokerLeads(supabase, profileId), firstName, cfg) : menuText(firstName, cfg);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    const { data: pcfg } = await supabase.from('system_settings').select('value').eq('key', 'comandra_pilot_phones').maybeSingle();
    const pilotList = Array.isArray(pcfg?.value) ? pcfg.value : [];
    const body = await req.json().catch(() => ({}));

    // ── CANAL DASHBOARD ──────────────────────────────────────────────────────
    // Mesmo cerebro do WhatsApp, mas responde por HTTP em vez de sendSelf.
    // Identidade vem do JWT do proprio corretor (a plataforma ja validou o token).
    if (body?.mode === 'chat') {
      const question = String(body?.question || '').trim();
      if (!question) return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      let uid = '';
      try { const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''); uid = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch {}
      if (!uid) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: prof } = await supabase.from('profiles').select('id, first_name, bot_instance_id, team_id, phone').eq('id', uid).maybeSingle();
      if (!prof?.id) return new Response(JSON.stringify({ error: 'profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let chip = null;
      if (prof.bot_instance_id) { const { data: c } = await supabase.from('bot_instances').select('phone, instance_name, evolution_api_url, evolution_api_key').eq('id', prof.bot_instance_id).maybeSingle(); chip = c || null; }
      const brokerPhone = chip?.phone || prof.phone || '';
      if (!brokerPhone) return new Response(JSON.stringify({ answer: 'Ainda nao consegui te identificar — seu numero nao esta cadastrado. Avisa o suporte. 😕' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let vertical = 'mcmv';
      if (prof.team_id) { const { data: tm } = await supabase.from('teams').select('vertical').eq('id', prof.team_id).maybeSingle(); if (tm?.vertical) vertical = tm.vertical; }
      const cfg = verticalCfg(vertical);
      const pilot = isPilot(brokerPhone, pilotList);
      const { data: bstate } = await supabase.from('comandra_broker').select('onboarded_at, pending_context').eq('broker_phone', brokerPhone).maybeSingle();

      if (pilot && !bstate?.onboarded_at) {
        await supabase.from('comandra_broker').upsert({ broker_phone: brokerPhone, onboarded_at: new Date().toISOString() }, { onConflict: 'broker_phone' });
        return new Response(JSON.stringify({ answer: onboardBubbles(prof.first_name, cfg).join('\n\n') }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const answer = await computeReply({
        supabase, openaiKey,
        url: chip?.evolution_api_url || 'https://api.ape77.com.br', key: chip?.evolution_api_key || '',
        instanceName: chip?.instance_name || '', brokerPhone,
        profileId: prof.id, firstName: prof.first_name || '', brokerBotId: prof.bot_instance_id || '',
        cfg, text: question, isText: true, pilot, bstate, raw: null, messageId: null,
      });
      return new Response(JSON.stringify({ answer }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const inboxId = body?.inbox_id || null;
    let q = supabase.from('comandra_inbox').update({ status: 'processing' }).eq('status', 'pending');
    if (inboxId) q = q.eq('id', inboxId);
    const { data: claimed } = await q.select('*').limit(10);
    if (!claimed || claimed.length === 0) return new Response(JSON.stringify({ success: true, processed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let processed = 0;
    for (const row of claimed) {
      try {
        const { data: replyChips } = await supabase.from('bot_instances').select('evolution_api_url, evolution_api_key').eq('instance_name', row.instance_name).like('evolution_api_url', 'https://%').limit(1);
        const replyChip = replyChips?.[0]; const url = replyChip?.evolution_api_url || 'https://api.ape77.com.br'; const key = replyChip?.evolution_api_key || '';
        let profileId = '', firstName = '', brokerBotId = '', teamId = null;
        const { data: brokerChips } = await supabase.from('bot_instances').select('id').in('phone', phoneVariants(row.broker_phone));
        const brokerChipIds = (brokerChips || []).map((c) => c.id);
        if (brokerChipIds.length) { const { data: prof } = await supabase.from('profiles').select('id, first_name, bot_instance_id, team_id').in('bot_instance_id', brokerChipIds).limit(1).maybeSingle(); profileId = prof?.id || ''; firstName = prof?.first_name || ''; brokerBotId = prof?.bot_instance_id || ''; teamId = prof?.team_id || null; }
        let vertical = 'mcmv';
        if (teamId) { const { data: tm } = await supabase.from('teams').select('vertical').eq('id', teamId).maybeSingle(); if (tm?.vertical) vertical = tm.vertical; }
        const cfg = verticalCfg(vertical);

        let text = row.message_text || '';
        let isText = !row.message_type || row.message_type === 'text' || row.message_type === 'conversation' || row.message_type === 'extendedTextMessage';
        if (!isText) { const tr = await transcribeVoice(url, key, row.instance_name, row.message_id, row.raw, openaiKey); if (tr && tr.trim()) { text = tr.trim(); isText = true; } }

        const pilot = isPilot(row.broker_phone, pilotList);
        let reply = ''; let handled = false;
        const { data: bstate } = await supabase.from('comandra_broker').select('onboarded_at, pending_context').eq('broker_phone', row.broker_phone).maybeSingle();

        if (isText && pilot && profileId && !bstate?.onboarded_at) {
          const bubbles = onboardBubbles(firstName, cfg);
          for (const b of bubbles) { await sendSelf(url, key, row.instance_name, row.broker_phone, b); await sleep(700); }
          await supabase.from('comandra_broker').upsert({ broker_phone: row.broker_phone, onboarded_at: new Date().toISOString() }, { onConflict: 'broker_phone' });
          await supabase.from('comandra_inbox').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', row.id);
          processed++; handled = true;
        }
        if (handled) continue;

        reply = await computeReply({ supabase, openaiKey, url, key, instanceName: row.instance_name,
          brokerPhone: row.broker_phone, profileId, firstName, brokerBotId, cfg,
          text, isText, pilot, bstate, raw: row.raw, messageId: row.message_id });

        const ok = await sendSelf(url, key, row.instance_name, row.broker_phone, reply);
        await supabase.from('comandra_inbox').update({ status: ok ? 'done' : 'error', processed_at: new Date().toISOString() }).eq('id', row.id);
        if (ok) processed++;
      } catch (e) { await supabase.from('comandra_inbox').update({ status: 'error', processed_at: new Date().toISOString() }).eq('id', row.id); console.error('[comandra-processor] erro', row.id, e?.message); }
    }
    return new Response(JSON.stringify({ success: true, processed }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) { console.error('[comandra-processor] fatal', err?.message); return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
