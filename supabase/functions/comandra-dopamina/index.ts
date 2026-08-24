import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — Motor de dopamina (proativo). Momentos: #1 morning, #7 evening, #3 report, #5 shield.
// 100% template (sem LLM). Roda para os corretores do piloto (system_settings.comandra_pilot_phones).
// body: { moment, preview?, test?, only_phone? }
//   moment = morning | evening | report | shield
//   preview = nao envia, nao grava, retorna texto.  test = envia mas NAO grava estado.  only_phone = mira 1.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneVariants(p: string): string[] { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function phoneMatch(a: string, b: string): boolean { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n: string): string { return (n || 'Lead').split(' ')[0]; }
async function sendSelf(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }

function brtDate(offsetDays = 0): string { const d = new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400000); return d.toISOString().slice(0, 10); }
function daysBetween(a: string, b: string): number { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

async function brokerLeads(supabase: any, profileId: string) {
  const { data } = await supabase.from('leads')
    .select('id, name, phone, status, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, created_at')
    .eq('broker_id', profileId)
    .not('status', 'in', '(\"ABANDONED\",\"EXCLUDED\",\"CONCLUDED\")')
    .order('last_lead_response_at', { ascending: false, nullsFirst: false })
    .limit(300);
  return data || [];
}

function funnel(leads: any[]) {
  const novos = leads.filter((l) => l.status === 'NEW').length;
  const visita = leads.filter((l) => ['VISIT_SCHEDULED', 'VISITA_REALIZADA'].includes(l.status)).length;
  const negoc = leads.filter((l) => l.status === 'NEGOTIATING').length;
  const quentesArr = leads.filter((l) => { const resp = l.last_lead_response_at ? Date.parse(l.last_lead_response_at) : 0; const bro = l.last_broker_whatsapp_at ? Date.parse(l.last_broker_whatsapp_at) : 0; return resp > 0 && resp > bro; });
  const sem = leads.filter((l) => !l.last_broker_whatsapp_at).length;
  return { novos, visita, negoc, quentes: quentesArr.length, quentesArr, sem };
}

function touchedToday(leads: any[], today: string): number {
  return leads.filter((l) => l.last_broker_whatsapp_at && new Date(Date.parse(l.last_broker_whatsapp_at) - 3 * 3600 * 1000).toISOString().slice(0, 10) === today).length;
}

function morningMsg(nome: string, f: any, streak: number, lastActive: string | null, today: string): string {
  const lines: string[] = [`☀️ *Bom dia, ${nome}!*`];
  const cont = lastActive ? daysBetween(lastActive, today) <= 3 : false;
  if (streak >= 2 && cont) lines.push(`\n🔥 *${streak} dias seguidos no jogo.* Não quebra a sequência hoje!`);
  else if (streak === 1 && cont) lines.push(`\n✅ Você jogou ontem. Hoje a gente emenda — dia 2!`);
  else lines.push(`\n🚀 Novo dia, jogo novo. Bora marcar visita hoje.`);
  lines.push(`\n📊 *Seu jogo hoje:*`);
  if (f.quentes) lines.push(`• 🔥 Esperando você: ${f.quentes}`);
  if (f.novos) lines.push(`• 🆕 Novos: ${f.novos}`);
  if (f.visita) lines.push(`• 📅 Visitas: ${f.visita}`);
  if (f.sem) lines.push(`• ⏳ Esfriando (sem contato): ${f.sem}`);
  if (!f.quentes && !f.novos && !f.visita && !f.sem) lines.push(`• Sem lead ativo agora.`);
  let mv = '';
  if (f.quentes) { const nm = firstName(f.quentesArr[0]?.name); mv = `responder *${nm}*${f.quentes > 1 ? ` e +${f.quentes - 1}` : ''} — lead que respondeu esfria rápido.`; }
  else if (f.novos) mv = f.novos === 1 ? `abrir o lead novo — quem chega primeiro ganha a visita.` : `abrir os *${f.novos}* leads novos — quem chega primeiro ganha a visita.`;
  else if (f.sem) mv = f.sem === 1 ? `reativar o lead que sumiu.` : `reativar quem sumiu — tem *${f.sem}* parados.`;
  else mv = `pegar lead novo: me diz *\"quero prospectar\"*.`;
  lines.push(`\n🎯 *Primeiro movimento:* ${mv}`);
  lines.push(`\nMe chama *\"o que faço hoje\"* que eu abro tudo. 💪`);
  return lines.join('\n');
}

function eveningMsg(nome: string, touched: number, f: any, newStreak: number, activeToday: boolean, rankPos: number, rankTotal: number, leaderName: string, nobodyWorked: boolean): string {
  const lines: string[] = [`🌙 *Fechando o dia, ${nome}.*`];
  if (activeToday) {
    lines.push(`\nMandou bem — não deixou o dia passar em branco. 👏`);
    lines.push(`\n📊 Hoje você mexeu em *${touched}* lead${touched === 1 ? '' : 's'}.`);
    if (newStreak >= 3) lines.push(`🔥 *${newStreak} dias seguidos.* Tá pegando fogo!`);
    else if (newStreak === 2) lines.push(`🔥 *2 dias seguidos.* Amanhã fecha 3!`);
    else lines.push(`✅ Sequência iniciada — vamos emendar amanhã.`);
  } else {
    lines.push(`\nHoje passou batido — acontece. 🤝`);
    if (f.quentes || f.sem) lines.push(`Ficou ${f.quentes ? `*${f.quentes}* esperando resposta` : `*${f.sem}* esfriando`} — amanhã 9h eu te chamo e a gente vira o jogo.`);
    else lines.push(`Amanhã 9h eu te chamo com o próximo passo. A gente recomeça forte.`);
  }
  if (rankTotal > 1) {
    if (nobodyWorked) lines.push(`\n🏆 *Ranking:* ninguém pontuou hoje — amanhã quem começar primeiro abre vantagem.`);
    else if (activeToday && rankPos === 1) lines.push(`\n🏆 *Ranking de hoje:* você tá em 1º! 🥇`);
    else lines.push(`\n🏆 *Ranking de hoje:* ${rankPos}º de ${rankTotal}${leaderName ? ` — ${leaderName} tá na frente, amanhã você passa.` : '.'}`);
  }
  lines.push(`\nBom descanso. Amanhã tem mais. 😴`);
  return lines.join('\n');
}

// #3 — Comandra age sozinha e REPORTA o que fez (crédito + entrega o lead vivo).
function reportMsg(nome: string, rescued: number, respAfter: number, firstResponder: string): string {
  if (rescued <= 0) return '';
  const lines: string[] = [`☀️ *Bom dia, ${nome}!*`, `\nEnquanto você cuidava da vida, *eu trabalhei seus leads*:`];
  lines.push(`• 🤖 Cutuquei *${rescued}* lead${rescued > 1 ? 's' : ''} parado${rescued > 1 ? 's' : ''} pra você`);
  if (respAfter > 0) {
    lines.push(`• 🔥 *${respAfter}* já respondeu${respAfter > 1 ? 'ram' : ''} e tá te esperando!`);
    lines.push(`\n🎯 Começa por *${firstName(firstResponder)}* — tá quente, não deixa esfriar.`);
  } else {
    lines.push(`\nNinguém respondeu ainda, mas plantei a semente — eu sigo cutucando. 🌱`);
  }
  lines.push(`\nMe chama *\"o que faço hoje\"* que eu te mostro tudo. 💪`);
  return lines.join('\n');
}

// #5 — Escudo do gerente: Comandra do lado do corretor, avisa ANTES do gerente ver.
function shieldMsg(nome: string, devedor: number, managerName: string): string {
  if (devedor <= 0) return '';
  const lines: string[] = [`🛡️ *${nome}, papo reto.*`];
  lines.push(`\nVocê tem *${devedor}* lead${devedor > 1 ? 's' : ''} que te respondeu e ficou sem retorno.`);
  lines.push(`\nIsso vai aparecer pro *${managerName}* — e eu prefiro que você resolva ANTES dele ver. 😏`);
  lines.push(`\nResolve hoje que tá limpo. Me chama *\"o que faço hoje\"* e eu te abro a lista na hora.`);
  return lines.join('\n');
}

async function resolveBroker(supabase: any, phone: string) {
  const { data: chips } = await supabase.from('bot_instances')
    .select('id, instance_name, evolution_api_url, evolution_api_key, phone')
    .in('phone', phoneVariants(phone));
  const chip = (chips || []).find((c: any) => c.instance_name && (c.evolution_api_url || '').startsWith('https://')) || (chips || [])[0];
  if (!chip) return null;
  const chipIds = (chips || []).map((c: any) => c.id);
  const { data: prof } = await supabase.from('profiles').select('id, first_name, bot_instance_id').in('bot_instance_id', chipIds).limit(1).maybeSingle();
  if (!prof?.id) return null;
  return { phone, profileId: prof.id, firstName: prof.first_name || 'corretor', instance: chip.instance_name, url: chip.evolution_api_url || 'https://api.ape77.com.br', key: chip.evolution_api_key || '' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const MOMENTS = ['morning', 'evening', 'report', 'shield'];
    const moment = MOMENTS.includes(body?.moment) ? body.moment : 'morning';
    const dupColMap: any = { morning: 'last_morning_date', evening: 'last_evening_date', report: 'last_report_date', shield: 'last_shield_date' };
    const dupCol = dupColMap[moment];
    const preview = body?.preview === true;
    const test = body?.test === true;
    const onlyPhone = body?.only_phone ? String(body.only_phone) : '';
    const today = brtDate(0);

    const { data: pcfg } = await supabase.from('system_settings').select('value').eq('key', 'comandra_pilot_phones').maybeSingle();
    let pilots: string[] = Array.isArray(pcfg?.value) ? pcfg.value : [];
    if (onlyPhone) pilots = pilots.filter((p) => phoneMatch(p, onlyPhone));
    if (!pilots.length) return new Response(JSON.stringify({ success: true, sent: 0, note: 'no pilots' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const allPhones: string[] = Array.isArray(pcfg?.value) ? pcfg.value : [];
    const ctx: any[] = [];
    for (const ph of allPhones) {
      const b = await resolveBroker(supabase, ph);
      if (!b) continue;
      const leads = await brokerLeads(supabase, b.profileId);
      const f = funnel(leads);
      const touched = touchedToday(leads, today);
      const { data: state } = await supabase.from('comandra_broker').select('current_streak, last_active_date, last_morning_date, last_evening_date, last_report_date, last_shield_date').eq('broker_phone', b.phone).maybeSingle();
      const entry: any = { ...b, leads, f, touched, state: state || {} };
      if (moment === 'report') {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: rr } = await supabase.from('comandra_rescue').select('lead_id, sent_at').eq('broker_id', b.profileId).eq('status', 'sent').gte('sent_at', since);
        const sentMap = new Map((rr || []).map((x: any) => [x.lead_id, Date.parse(x.sent_at)]));
        entry.rescued = sentMap.size;
        const ids = [...sentMap.keys()];
        if (ids.length) {
          const { data: rl } = await supabase.from('leads').select('id, name, last_lead_response_at').in('id', ids);
          const responders = (rl || []).filter((l: any) => l.last_lead_response_at && Date.parse(l.last_lead_response_at) > (sentMap.get(l.id) || 0));
          entry.respAfter = responders.length; entry.firstResponder = responders[0]?.name || '';
        } else { entry.respAfter = 0; entry.firstResponder = ''; }
      }
      if (moment === 'shield') {
        let mgrName = 'seu gerente';
        const { data: prof } = await supabase.from('profiles').select('manager_id').eq('id', b.profileId).maybeSingle();
        if (prof?.manager_id) { const { data: m } = await supabase.from('profiles').select('first_name').eq('id', prof.manager_id).maybeSingle(); mgrName = m?.first_name || mgrName; }
        entry.managerName = mgrName; entry.devedor = f.quentes;
      }
      ctx.push(entry);
    }
    if (!ctx.length) return new Response(JSON.stringify({ success: true, sent: 0, note: 'no resolvable brokers' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const ranked = [...ctx].sort((a, b) => b.touched - a.touched);
    const rankTotal = ctx.length;
    const leader = ranked[0];
    const nobodyWorked = !leader || leader.touched === 0;

    const targets = onlyPhone ? ctx.filter((c) => phoneMatch(c.phone, onlyPhone)) : ctx;
    let sent = 0; const previews: any[] = [];
    for (const c of targets) {
      if (!preview && !test && c.state[dupCol] === today) continue;

      let msg = '';
      const upd: any = { broker_phone: c.phone };
      if (moment === 'morning') {
        msg = morningMsg(c.firstName, c.f, c.state.current_streak || 0, c.state.last_active_date || null, today);
        upd.last_morning_date = today;
      } else if (moment === 'evening') {
        const activeToday = c.touched > 0;
        const prevStreak = c.state.current_streak || 0;
        const la = c.state.last_active_date || null;
        let newStreak = prevStreak;
        if (activeToday) { if (la === today) newStreak = prevStreak; else if (la && daysBetween(la, today) <= 3) newStreak = prevStreak + 1; else newStreak = 1; upd.last_active_date = today; } else { newStreak = 0; }
        upd.current_streak = newStreak; upd.last_evening_date = today;
        const rankPos = ranked.findIndex((x) => x.phone === c.phone) + 1;
        const leaderName = (leader && leader.phone !== c.phone && leader.touched > 0) ? leader.firstName : '';
        msg = eveningMsg(c.firstName, c.touched, c.f, newStreak, activeToday, rankPos, rankTotal, leaderName, nobodyWorked);
      } else if (moment === 'report') {
        msg = reportMsg(c.firstName, c.rescued || 0, c.respAfter || 0, c.firstResponder || '');
        upd.last_report_date = today;
      } else if (moment === 'shield') {
        msg = shieldMsg(c.firstName, c.devedor || 0, c.managerName || 'seu gerente');
        upd.last_shield_date = today;
      }

      if (preview) { previews.push({ phone: c.phone, nome: c.firstName, touched: c.touched, rescued: c.rescued, respAfter: c.respAfter, devedor: c.devedor, msg: msg || '(pula — nada a dizer)' }); continue; }
      if (!msg) continue; // report/shield sem nada relevante: silêncio, sem ruído
      const ok = await sendSelf(c.url, c.key, c.instance, c.phone, msg);
      if (!test) await supabase.from('comandra_broker').upsert(upd, { onConflict: 'broker_phone' });
      if (ok) sent++;
    }

    if (preview) return new Response(JSON.stringify({ success: true, moment, preview: true, today, previews }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, moment, test, sent, targets: targets.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[comandra-dopamina] fatal', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
