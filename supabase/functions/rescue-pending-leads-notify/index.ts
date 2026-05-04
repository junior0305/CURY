// rescue-pending-leads-notify
// Resgate único: pega leads das últimas N horas SEM contato do corretor e
// envia notificação via chip do gerente, em sequência com delay (evita flood).
// Use com cuidado — projetado pra rodar manualmente (não em cron).
//
// Body opcional: { hours: 24, dry_run: false, max: 100 }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const hours: number = Math.min(Math.max(Number(body?.hours) || 24, 1), 168);
    const max: number = Math.min(Math.max(Number(body?.max) || 100, 1), 200);
    const dryRun: boolean = body?.dry_run === true;
    const minDelayMs: number = Math.max(1500, Number(body?.delay_min_ms) || 3000);
    const maxDelayMs: number = Math.max(minDelayMs, Number(body?.delay_max_ms) || 6000);

    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // 1) Leads pendentes (sem embed pra evitar ambiguidade)
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, phone, tag, source, product, created_at, broker_id, contact_attempts, last_broker_whatsapp_at')
      .gte('created_at', cutoff)
      .not('broker_id', 'is', null)
      .is('last_broker_whatsapp_at', null)
      .order('created_at', { ascending: true })
      .limit(max);
    if (error) throw error;

    const filtered = (leads || []).filter((l: any) =>
      l.contact_attempts === null || l.contact_attempts === 0
    );

    // 2) Brokers únicos
    const brokerIds = Array.from(new Set(filtered.map((l: any) => l.broker_id))) as string[];
    const { data: brokers } = await supabase
      .from('profiles')
      .select('id, first_name, phone, lead_assignment_enabled, manager_id')
      .in('id', brokerIds);
    const brokerMap = new Map<string, any>();
    (brokers || []).forEach((b: any) => brokerMap.set(b.id, b));

    // 3) Managers únicos
    const managerIds = Array.from(new Set(
      (brokers || []).map((b: any) => b.manager_id).filter(Boolean)
    )) as string[];
    const { data: managers } = await supabase
      .from('profiles')
      .select('id, first_name, bot_instance_id')
      .in('id', managerIds);
    const managerMap = new Map<string, any>();
    (managers || []).forEach((m: any) => managerMap.set(m.id, m));

    const candidates: any[] = [];
    for (const l of filtered as any[]) {
      const broker = brokerMap.get(l.broker_id);
      const manager = broker?.manager_id ? managerMap.get(broker.manager_id) : null;

      if (!broker) continue;
      if ((broker.first_name || '').includes('[INATIVO]')) continue;
      if (!broker.lead_assignment_enabled) continue;
      if (!broker.phone) continue;
      if (!manager?.bot_instance_id) continue;

      candidates.push({
        lead_id: l.id, lead_name: l.name, lead_phone: l.phone,
        tag: l.tag, origin: l.source, product: l.product, created_at: l.created_at,
        broker_id: broker.id, broker_name: broker.first_name, broker_phone: broker.phone,
        manager_id: manager.id, manager_name: manager.first_name, manager_bot_id: manager.bot_instance_id,
      });
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, dry_run: true, found: candidates.length, sample: candidates.slice(0, 5),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';
    const results = { sent: 0, failed: 0, skipped: 0, errors: [] as any[] };

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const horasAtraso = Math.round((Date.now() - new Date(c.created_at).getTime()) / 3600000);
      const originLabel = c.origin || c.tag || 'Sem origem';

      const msg = [
        `🎯 *Lead esperando há ${horasAtraso}h — atenda agora!*`,
        ``,
        `👤 *${c.lead_name}*`,
        c.tag || originLabel ? `🏷️ ${c.tag || originLabel}` : '',
        c.product && c.product !== c.tag ? `🏠 ${c.product}` : '',
        ``,
        `📲 ${appUrl}`,
      ].filter(l => l !== '').join('\n');

      try {
        const { data: sendResult, error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: c.manager_bot_id,
            phone: c.broker_phone,
            message: msg,
            send_source: 'broker_manual',
          },
        });

        if (sendErr || !sendResult?.success) {
          results.failed++;
          results.errors.push({
            lead_id: c.lead_id, broker: c.broker_name,
            err: sendErr?.message || sendResult?.skipped || 'unknown',
            result: sendResult,
          });
        } else {
          results.sent++;
          // Marcar contato pra evitar duplicação se rodar de novo
          await supabase.from('leads').update({
            last_broker_whatsapp_at: new Date().toISOString(),
            contact_attempts: 1,
          }).eq('id', c.lead_id);

          // Log auditável
          await supabase.from('automation_logs').insert({
            entity_type: 'rescue_notify',
            entity_id: c.lead_id,
            status: 'success',
            message_sent: msg,
            recipient_phone: c.broker_phone,
          }).then(() => {}, () => {});
        }
      } catch (e: any) {
        results.failed++;
        results.errors.push({ lead_id: c.lead_id, err: e.message });
      }

      // Delay anti-flood entre envios
      if (i < candidates.length - 1) {
        await sleep(rand(minDelayMs, maxDelayMs));
      }
    }

    return new Response(JSON.stringify({
      success: true, hours, total_found: candidates.length,
      sent: results.sent, failed: results.failed, errors: results.errors.slice(0, 10),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[rescue-pending-leads-notify] erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
