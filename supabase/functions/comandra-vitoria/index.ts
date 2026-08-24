import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — Motor de dopamina #4: VITORIA celebrada (avanco de funil em tempo real).
// Disparada por trigger pg_net (AFTER UPDATE OF leads.status) quando o lead sobe pra um marco.
// 100% template (sem LLM). So pilotos (system_settings.comandra_pilot_phones, por telefone do CHIP).
// Whisper pelo SELF-CHAT do chip do proprio corretor. So comemora AVANCO (rank novo > rank ja comemorado).
// body: { lead_id, preview?, test? }

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// escada de marcos (so >=2 vale festa; NEW/IN_PROGRESS/FOLLOW_UP_AUTO/REACTIVATED/ABANDONED/EXCLUDED = 0)
const RANK: Record<string, number> = { VISIT_SCHEDULED: 2, VISITA_REALIZADA: 3, NEGOTIATING: 4, DOCS_REQUESTED: 5, CONCLUDED: 6 };
function rankOf(status: string): number { return RANK[String(status || '').toUpperCase()] || 0; }

function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneMatch(a: string, b: string): boolean { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n: string): string { return (n || 'o lead').trim().split(' ')[0] || 'o lead'; }

async function sendSelf(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }), signal: ctrl.signal });
    clearTimeout(t);
    return r.status >= 200 && r.status < 300;
  } catch { return false; }
}

function vitoriaMsg(leadFirst: string, status: string, visitsOnRadar: number): string {
  const s = String(status || '').toUpperCase();
  const lines: string[] = [];
  if (s === 'VISIT_SCHEDULED') {
    lines.push(`🎉 *Visita marcada com ${leadFirst}!*`);
    lines.push(`\nÉ AQUI que o MCMV se vende — ao vivo você resolve renda, FGTS, unidade que cabe.`);
    if (visitsOnRadar >= 2) lines.push(`📅 *${visitsOnRadar} visitas no seu radar.* Tá voando!`);
    lines.push(`⚡ Próximo: eu confirmo na véspera pra ela não furar.`);
  } else if (s === 'VISITA_REALIZADA') {
    lines.push(`👏 *Visita feita com ${leadFirst}!*`);
    lines.push(`\nQuem pisa no plantão converte muito mais. Você fez a parte que importa.`);
    lines.push(`⚡ Próximo passo: puxar a documentação.`);
  } else if (s === 'NEGOTIATING') {
    lines.push(`🤝 *${leadFirst} entrou em negociação!*`);
    lines.push(`\nEsquentou de vez. Segura firme e não deixa esfriar.`);
  } else if (s === 'DOCS_REQUESTED') {
    lines.push(`📄 *Documentação rolando com ${leadFirst}!*`);
    lines.push(`\nReta final. Fica em cima pra não travar na papelada — é onde mais lead morre.`);
  } else if (s === 'CONCLUDED') {
    lines.push(`🏆 *VENDA FECHADA com ${leadFirst}!* 🔥`);
    lines.push(`\nÉ disso que vive o jogo. Parabéns demais — você merece.`);
  } else {
    lines.push(`✅ *${leadFirst} avançou no funil!*`);
  }
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const leadId = body?.lead_id ? String(body.lead_id) : '';
    const preview = body?.preview === true;
    const test = body?.test === true;
    if (!leadId) return new Response(JSON.stringify({ ok: false, reason: 'no lead_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: lead } = await supabase.from('leads')
      .select('id, name, status, broker_id, comandra_vitoria_rank, broker:profiles!broker_id(id, bot_instance_id)')
      .eq('id', leadId).maybeSingle();
    if (!lead || !lead.broker_id) return new Response(JSON.stringify({ ok: false, reason: 'no lead/broker' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const broker: any = (lead as any).broker;
    if (!broker?.bot_instance_id) return new Response(JSON.stringify({ ok: false, reason: 'broker sem chip' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const newRank = rankOf(lead.status);
    if (newRank < 2) return new Response(JSON.stringify({ ok: false, reason: 'nao e marco', status: lead.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const prevRank = lead.comandra_vitoria_rank ?? 0;
    if (!preview && !test && newRank <= prevRank) return new Response(JSON.stringify({ ok: false, reason: 'ja comemorado', newRank, prevRank }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: chip } = await supabase.from('bot_instances')
      .select('instance_name, evolution_api_url, evolution_api_key, phone, status')
      .eq('id', broker.bot_instance_id).maybeSingle();
    if (!chip?.instance_name || !chip?.phone) return new Response(JSON.stringify({ ok: false, reason: 'chip incompleto' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: pcfg } = await supabase.from('system_settings').select('value').eq('key', 'comandra_pilot_phones').maybeSingle();
    const pilots: string[] = Array.isArray(pcfg?.value) ? pcfg.value : [];
    if (!pilots.some((p) => phoneMatch(p, chip.phone))) return new Response(JSON.stringify({ ok: false, reason: 'nao piloto' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // momentum: visitas no radar do corretor (so relevante pra etapa de visita)
    let visitsOnRadar = 0;
    if (newRank === 2) {
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('broker_id', lead.broker_id).in('status', ['VISIT_SCHEDULED', 'VISITA_REALIZADA']);
      visitsOnRadar = count || 0;
    }

    const msg = vitoriaMsg(firstName(lead.name), lead.status, visitsOnRadar);

    if (preview) return new Response(JSON.stringify({ ok: true, preview: true, to: chip.phone, instance: chip.instance_name, chip_status: chip.status, status: lead.status, newRank, prevRank, msg }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const ok = await sendSelf(chip.evolution_api_url || 'https://api.ape77.com.br', chip.evolution_api_key || '', chip.instance_name, chip.phone, msg);
    if (!test) await supabase.from('leads').update({ comandra_vitoria_rank: newRank }).eq('id', leadId);

    return new Response(JSON.stringify({ ok, test, sent: ok ? 1 : 0, to: chip.phone, instance: chip.instance_name, chip_status: chip.status, status: lead.status, newRank, prevRank }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[comandra-vitoria] fatal', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
