// campaign-dispatcher (B-lite): paralelo, per-chip cooldown, atomic claim.
// Substitui o orchestrator serial. Roda a cada 60s via pg_cron.
//
// Lógica de cada tick:
//  1. SELECT campanhas active dentro do working_hours
//  2. Para cada campanha:
//     a. SELECT chips ready (last_send_at + min_delay < now, status open, sem pause, abaixo do cap diário)
//     b. Para CADA chip ready em paralelo:
//        - claim_campaign_lead(campaign_id) RPC  ← atomic
//        - UPDATE bot_instances.last_send_at = now ← antes do send pra evitar double-claim
//        - acha/cria ia_conversation (reusa se já existe)
//        - invoca send_whatsapp_message
//        - marca campaign_lead status='contacted' OU revert pra 'pending' se erro

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Templates: mesma lógica do orchestrator ──────────────────────────────────
async function loadTemplates(supabase: any, campaign: any) {
  let query = supabase
    .from('v_template_stats')
    .select('id, name, message, segment, sent, qualified, opted_out, score, auto_paused_at, is_draft, is_active')
    .eq('kind', 'prospecting')
    .eq('is_active', true)
    .eq('is_draft', false)
    .is('auto_paused_at', null);

  if (campaign.template_ids && Array.isArray(campaign.template_ids) && campaign.template_ids.length > 0) {
    query = query.in('id', campaign.template_ids);
  } else if (campaign.template_category) {
    query = query.eq('segment', campaign.template_category);
  }

  const { data: lib } = await query;
  if (lib && lib.length > 0) {
    return lib.map((t: any) => ({ id: t.id, text: t.message, name: t.name, sent: t.sent, score: Number(t.score) || 0 }));
  }
  // Fallback legacy
  const legacy = campaign.message_templates || [];
  return legacy.map((t: any) => ({ id: null, text: t.text || t.message || '', name: null, sent: 0, score: 0 }));
}

function pickWeighted<T extends { sent: number; score: number }>(templates: T[]): T {
  const weighted = templates.map(t => {
    let w = 30;
    if (t.sent < 30)        w = 40;
    else if (t.score >= 50) w = 100;
    else if (t.score >= 30) w = 60;
    else if (t.score >= 15) w = 30;
    else                    w = 10;
    return { t, w };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return templates[0];
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.t;
  }
  return weighted[0].t;
}

function withinWorkingHours(wh: any): boolean {
  if (!wh?.start || !wh?.end) return true;
  const now = new Date();
  // BRT = UTC-3
  const totalMin = ((now.getUTCHours() - 3 + 24) % 24) * 60 + now.getUTCMinutes();
  const [sh, sm] = String(wh.start).split(':').map(Number);
  const [eh, em] = String(wh.end).split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return totalMin >= start && totalMin <= end;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const startedAt = Date.now();
  const log: any[] = [];

  try {
    const { data: campaigns, error: cErr } = await supabase
      .from('ia_campaigns')
      .select('*')
      .eq('status', 'active');
    if (cErr) throw cErr;

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'no_active_campaigns', elapsed_ms: Date.now() - startedAt, dispatched: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    for (const camp of campaigns) {
      if (!withinWorkingHours(camp.working_hours)) {
        log.push({ campaign: camp.name, skipped: 'outside_working_hours' });
        continue;
      }

      const chipIds: string[] = camp.prospect_instance_ids || [];
      if (chipIds.length === 0) {
        log.push({ campaign: camp.name, skipped: 'no_prospect_chips' });
        continue;
      }

      const minDelaySec = Number(camp.delay_between_messages_min) || 60;
      const cutoffIso = new Date(Date.now() - minDelaySec * 1000).toISOString();

      // Chips prontos: status open/active, sem pause, last_send_at NULL ou velho
      const { data: chips } = await supabase
        .from('bot_instances')
        .select('id, name, instance_name, status, last_send_at, paused_safety_at, daily_limit, messages_today')
        .in('id', chipIds)
        .in('status', ['open', 'active'])
        .is('paused_safety_at', null)
        .or(`last_send_at.is.null,last_send_at.lt.${cutoffIso}`);

      if (!chips || chips.length === 0) {
        log.push({ campaign: camp.name, skipped: 'no_ready_chips' });
        continue;
      }

      const templates = await loadTemplates(supabase, camp);
      if (templates.length === 0) {
        log.push({ campaign: camp.name, skipped: 'no_templates' });
        continue;
      }

      // Para cada chip pronto, em paralelo: claim 1 lead + envia
      const dispatches = chips.map(async (chip: any) => {
        try {
          if (chip.daily_limit && (chip.messages_today || 0) >= chip.daily_limit) {
            return { chip: chip.name, skipped: 'daily_cap' };
          }

          // Atomic claim
          const { data: claimed, error: claimErr } = await supabase
            .rpc('claim_campaign_lead', { p_campaign_id: camp.id });
          if (claimErr) return { chip: chip.name, error: 'claim:' + claimErr.message };
          const lead = Array.isArray(claimed) ? claimed[0] : claimed;
          if (!lead?.id) return { chip: chip.name, skipped: 'no_pending_lead' };

          // MARCA last_send_at JÁ — antes do invoke async (evita double-claim)
          const nowIso = new Date().toISOString();
          await supabase.from('bot_instances')
            .update({ last_send_at: nowIso })
            .eq('id', chip.id);

          // Pick template + render
          const tpl = pickWeighted(templates);
          if (!tpl?.text) {
            await supabase.from('campaign_leads').update({ status: 'pending' }).eq('id', lead.id);
            return { chip: chip.name, skipped: 'empty_template' };
          }
          const message = tpl.text
            .replace(/\{nome\}/gi, lead.name || 'amigo')
            .replace(/\{name\}/gi, lead.name || 'amigo');

          // Reusa ou cria conversation
          let convId: string | null = null;
          const { data: existing } = await supabase
            .from('ia_conversations')
            .select('id')
            .eq('campaign_id', camp.id)
            .eq('lead_phone', lead.phone)
            .eq('bot_instance_id', chip.id)
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            convId = existing.id;
          } else {
            const { data: created, error: convErr } = await supabase
              .from('ia_conversations')
              .insert({
                campaign_id: camp.id,
                bot_instance_id: chip.id,
                lead_phone: lead.phone,
                lead_name: lead.name,
                status: 'active',
                sentiment: 'unknown',
                template_id: tpl.id,
                template_kind: tpl.id ? 'prospecting' : null,
              })
              .select('id')
              .single();
            if (convErr || !created) {
              await supabase.from('campaign_leads').update({ status: 'pending' }).eq('id', lead.id);
              return { chip: chip.name, error: 'conv:' + (convErr?.message || 'insert_failed') };
            }
            convId = created.id;
          }

          // Send
          const { error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
            body: {
              botId: chip.id,
              phone: lead.phone,
              message,
              conversationId: convId,
              instanceName: chip.instance_name,
              send_source: 'campaign',
            },
          });

          if (sendErr) {
            await supabase.from('campaign_leads')
              .update({ status: 'pending', error_message: sendErr.message })
              .eq('id', lead.id);
            return { chip: chip.name, lead: lead.name, error: 'send:' + sendErr.message };
          }

          // Track template stats + marca lead contacted
          if (tpl.id) {
            await supabase.rpc('track_template_sent', { p_template_id: tpl.id, p_kind: 'prospecting' })
              .then(() => {}, () => {});
          }
          await supabase.from('campaign_leads')
            .update({ status: 'contacted', contacted_at: nowIso })
            .eq('id', lead.id);

          return { chip: chip.name, lead: lead.name, ok: true };
        } catch (e: any) {
          return { chip: chip.name, error: 'exc:' + (e?.message || String(e)) };
        }
      });

      const results = await Promise.allSettled(dispatches);
      const okCount = results.filter((r: any) => r.status === 'fulfilled' && r.value?.ok).length;

      results.forEach((r: any) => {
        log.push({ campaign: camp.name, ...(r.status === 'fulfilled' ? r.value : { error: String(r.reason) }) });
      });

      if (okCount > 0) {
        await supabase.from('ia_campaigns').update({
          leads_contacted: (camp.leads_contacted || 0) + okCount,
          running_started_at: camp.running_started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', camp.id);
      }
    }

    const okTotal = log.filter((l: any) => l.ok).length;
    return new Response(JSON.stringify({
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      dispatched: okTotal,
      detail: log,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e), elapsed_ms: Date.now() - startedAt }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
