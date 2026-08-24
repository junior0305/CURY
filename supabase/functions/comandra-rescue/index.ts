import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — RESGATE por POOL. v8 (18/06): DISPARO PARALELO, 1 lead/chip/rodada, TODOS os chips conectados
// MENOS Junior (numero+nome) e Comandra (canal). RESPEITA OPT-OUT/BLOCKLIST. Teto 15 frio/chip/dia.
// Guardas: status+pause+cooldown + blocklist (opt-out) + teto frio/chip + 5 variantes. Sem trava de dono.
// body: { mode?, preview?, test?, max?, chip_cap? }

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const PER_RUN_CAP = 60;
const DEFAULT_CHIP_CAP = 15;
const SEND_CHUNK = 12;
const ONLINE = ['open', 'active', 'online', 'connected'];
const JUNIOR_SUFFIXES = ['899628222', '988628222']; // numeros do Junior, fora do pool

const VARIANTS = [
  { label: 'limpa_contatos', text: 'Oi {nome}, tudo bem? Olha, estou fazendo uma limpa aqui nos meus contatos da semana passada e vi que a gente acabou não se falando mais sobre o imóvel. Só para eu não ficar te incomodando: você ainda está interessado em um apartamento dentro do minha casa minha vida?' },
  { label: 'sumiu_zero_entrada', text: '{nome}, tudo bem? Você sumiu... Deu certo aquilo que você estava vendo de comprar o imóvel ou deu alguma travada? Ainda estou com aquela oportunidade de financiamento 100%, ou seja dependendo do perfil isso significa ZERO de entrada' },
  { label: 'desculpa_correria', text: '{nome}, peço desculpas pela correria dos últimos tempos, acabei não conseguindo te dar o retorno que você merecia aquela vez. Como estão os planos do imóvel? Conseguiu avançar ou quer que eu te atualize das novidades?' },
  { label: 'binaria_aluguel', text: 'Oi {nome}, tudo certo? Só uma dúvida rápida para eu atualizar seu histórico aqui: você ainda tem interesse em sair do aluguel / comprar o seu imóvel este ano? ( ) Sim ( ) Não' },
  { label: 'novidade_simular', text: '{nome}, passando para te dar um toque rápido. Teve uma mudança bem positiva recentemente dentro do minha casa minha vida. O Governo aumentou a ajuda e a aprovação do crédito ficou mais fácil. Pensei em você. Quer que eu simule para ver como ficaria o seu caso hoje?' },
];

function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function last9(p: string): string { const d = digits(p); return d.slice(-9); }
function firstName(n: string): string { return (n || '').trim().split(' ')[0] || ''; }
function interp(t: string, nome: string): string { return t.replace(/\[nome\]|\{nome\}/gi, firstName(nome) || 'tudo bem'); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'dormant' ? 'dormant' : 'ignored';
    const preview = body?.preview === true;
    const test = body?.test === true;
    const runCap = Math.min(Number(body?.max) || PER_RUN_CAP, 100);
    const CHIP_CAP = Math.max(1, Number(body?.chip_cap) || DEFAULT_CHIP_CAP);

    const nowB = new Date(Date.now() - 3 * 3600 * 1000);
    const brtHour = nowB.getUTCHours();
    if (!preview && !test && (brtHour < 9 || brtHour >= 20)) return json({ success: true, skipped: 'fora_horario', brtHour });
    const todayStartIso = new Date(Date.UTC(nowB.getUTCFullYear(), nowB.getUTCMonth(), nowB.getUTCDate()) + 3 * 3600 * 1000).toISOString();

    const cols = 'id, name, phone, status, broker_id, last_lead_response_at, broker:profiles!broker_id(first_name, bot_instance_id)';
    let qy: any = supabase.from('leads').select(cols).eq('pause_auto_messages', false).is('comandra_rescue_at', null);
    if (mode === 'dormant') qy = qy.in('status', ['NEW', 'IN_PROGRESS', 'FOLLOW_UP_AUTO', 'REACTIVATED']).lt('last_interaction_at', new Date(Date.now() - 3 * 86400000).toISOString()).order('last_interaction_at', { ascending: true });
    else qy = qy.not('last_lead_response_at', 'is', null).in('status', ['NEW', 'IN_PROGRESS', 'FOLLOW_UP_AUTO']).lt('last_lead_response_at', new Date(Date.now() - 2 * 3600000).toISOString()).gt('last_lead_response_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('last_lead_response_at', { ascending: true });
    const { data: cands } = await qy.limit(800);
    if (!cands || !cands.length) return json({ success: true, mode, due: 0, sent: 0 });

    // OPT-OUT: ninguem da blocklist recebe
    const { data: blk } = await supabase.from('phone_blocklist').select('phone');
    const blockedSet = new Set((blk || []).map((b: any) => last9(b.phone)));

    const botIds = [...new Set(cands.map((d: any) => d.broker?.bot_instance_id).filter(Boolean))];
    const { data: ownerChips } = await supabase.from('bot_instances').select('id, instance_name, status, phone').in('id', botIds.length ? botIds : ['00000000-0000-0000-0000-000000000000']);
    const chipById: Record<string, any> = {}; (ownerChips || []).forEach((c: any) => chipById[c.id] = c);

    // POOL = todos conectados, MENOS Junior (numero+nome) e Comandra (canal)
    const { data: poolRaw } = await supabase.from('bot_instances').select('id, instance_name, status, phone').in('status', ONLINE).like('evolution_api_url', 'https://%');
    const pool = (poolRaw || []).filter((c: any) => c.instance_name && !/junior|comandra/i.test(c.instance_name) && !JUNIOR_SUFFIXES.some((j) => digits(c.phone).endsWith(j)));

    const { data: todayRows } = await supabase.from('comandra_rescue').select('sent_via_instance').eq('status', 'sent').gte('sent_at', todayStartIso);
    const todayByChip: Record<string, number> = {};
    (todayRows || []).forEach((r: any) => { if (r.sent_via_instance) todayByChip[r.sent_via_instance] = (todayByChip[r.sent_via_instance] || 0) + 1; });

    const { count: prevCount } = await supabase.from('comandra_rescue').select('id', { count: 'exact', head: true }).eq('status', 'sent');
    let rr = prevCount || 0;

    const usedChip = new Set<string>();
    const assigns: any[] = [];
    let pulouBloqueado = 0;
    for (const l of cands) {
      if (assigns.length >= runCap) break;
      if (blockedSet.has(last9(l.phone))) { pulouBloqueado++; continue; } // opt-out: nao manda
      const owner = chipById[l.broker?.bot_instance_id];
      const ownerOnline = owner && owner.instance_name && ONLINE.includes(String(owner.status)) && !/junior|comandra/i.test(owner.instance_name) && !JUNIOR_SUFFIXES.some((j) => digits(owner.phone).endsWith(j));
      let chosen: any = null; let viaPool = false; let botId: any = null;
      if (ownerOnline && !usedChip.has(owner.instance_name) && (todayByChip[owner.instance_name] || 0) < CHIP_CAP) { chosen = owner; botId = l.broker?.bot_instance_id; }
      else { let best: any = null, bestT = CHIP_CAP; for (const c of pool) { if (usedChip.has(c.instance_name)) continue; const t = todayByChip[c.instance_name] || 0; if (t < bestT) { bestT = t; best = c; } } if (best) { chosen = best; viaPool = true; botId = best.id; } }
      if (!chosen) continue;
      usedChip.add(chosen.instance_name);
      const vIdx = rr % VARIANTS.length; rr++;
      assigns.push({ lead: l, chipName: chosen.instance_name, viaPool, botId, vIdx });
    }

    if (preview) return json({ success: true, mode, preview: true, chip_cap: CHIP_CAP, pool_online: pool.length, candidatos: cands.length, pulou_bloqueado: pulouBloqueado, would_send: assigns.length, chips_que_disparam: usedChip.size, amostra: assigns.slice(0, 50).map((a) => ({ lead: a.lead.name, via: (a.viaPool ? 'POOL:' : 'dono:') + a.chipName, msg: VARIANTS[a.vIdx].label })) });

    let sent = 0, viaPoolN = 0;
    for (let i = 0; i < assigns.length; i += SEND_CHUNK) {
      const slice = assigns.slice(i, i + SEND_CHUNK);
      const res = await Promise.allSettled(slice.map(async (a) => {
        const v = VARIANTS[a.vIdx]; const msg = interp(v.text, a.lead.name);
        const { data: sr } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: a.botId, phone: a.lead.phone, message: msg, send_source: 'rescue' } });
        const ok = sr?.success === true;
        if (ok && !test) {
          await supabase.from('leads').update({ comandra_rescue_at: new Date().toISOString() }).eq('id', a.lead.id);
          await supabase.from('comandra_rescue').insert({ lead_id: a.lead.id, broker_id: a.lead.broker_id, variant: a.vIdx + 1, variant_label: v.label, status: 'sent', sent_via_instance: a.chipName, via_pool: a.viaPool });
        }
        return ok;
      }));
      res.forEach((r, idx) => { if (r.status === 'fulfilled' && r.value) { sent++; if (slice[idx].viaPool) viaPoolN++; } });
    }
    return json({ success: true, mode, chip_cap: CHIP_CAP, pool_online: pool.length, candidatos: cands.length, pulou_bloqueado: pulouBloqueado, chips_que_dispararam: usedChip.size, sent, via_pool: viaPoolN, test });
  } catch (err: any) {
    console.error('[comandra-rescue] fatal', err?.message);
    return json({ error: err?.message }, 500);
  }
});
