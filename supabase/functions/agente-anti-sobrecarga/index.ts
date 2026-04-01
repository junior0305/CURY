import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const now = new Date().toISOString();
  let paused = 0, restored = 0;

  try {
    // ── Configurações ──────────────────────────────────────────────────────────
    const [{ data: enabledSetting }, { data: maxSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'agente_sobrecarga_enabled').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_sobrecarga_max_leads').maybeSingle(),
    ]);

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', paused: 0, restored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const maxLeads = Math.max(5, parseInt(String(maxSetting?.value ?? '30'), 10) || 30);
    const restoreThreshold = Math.floor(maxLeads * 0.8); // auto-restaura quando cai para 80%

    console.log(`[agente-anti-sobrecarga] max=${maxLeads} restoreAt=${restoreThreshold}`);

    // ── Buscar todos os corretores ─────────────────────────────────────────────
    const { data: brokers } = await supabase
      .from('profiles')
      .select('id, first_name, lead_assignment_enabled')
      .eq('role', 'BROKER');

    if (!brokers?.length) {
      return new Response(JSON.stringify({ paused: 0, restored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Contar leads ativos por corretor de uma vez
    const { data: activeLeadRows } = await supabase
      .from('leads')
      .select('broker_id')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .not('broker_id', 'is', null);

    const loadMap: Record<string, number> = {};
    for (const l of activeLeadRows || []) {
      if (l.broker_id) loadMap[l.broker_id] = (loadMap[l.broker_id] || 0) + 1;
    }

    for (const broker of brokers) {
      const activeCount = loadMap[broker.id] || 0;

      // ── Pausar corretor sobrecarregado ────────────────────────────────────
      if (activeCount >= maxLeads && broker.lead_assignment_enabled) {
        await supabase.from('profiles')
          .update({ lead_assignment_enabled: false })
          .eq('id', broker.id);

        await supabase.from('automation_logs').insert({
          entity_type: 'sobrecarga_paused',
          entity_id: broker.id,
          status: 'success',
          message_sent: `Corretor ${broker.first_name} pausado — ${activeCount} leads ativos (limite: ${maxLeads})`,
          executed_at: now,
        });

        // Notificar o próprio corretor e admins/gerentes
        await supabase.from('internal_notifications').insert({
          to_id: broker.id,
          type: 'BROKER_OVERLOADED',
          title: '⚠️ Distribuição pausada',
          message: `Você atingiu ${activeCount} leads ativos (limite: ${maxLeads}). Novos leads serão pausados até você baixar para ${restoreThreshold}.`,
          related_lead_id: null,
        });

        paused++;
        console.log(`[agente-anti-sobrecarga] ⏸️ ${broker.first_name} pausado (${activeCount}/${maxLeads})`);
        continue;
      }

      // ── Restaurar corretor se foi pausado por este agente e carga baixou ──
      if (!broker.lead_assignment_enabled && activeCount <= restoreThreshold) {
        // Só restaura se foi o agente que pausou (verifica log recente)
        const { data: pausedLog } = await supabase
          .from('automation_logs')
          .select('id')
          .eq('entity_type', 'sobrecarga_paused')
          .eq('entity_id', broker.id)
          .order('executed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!pausedLog) continue; // foi desabilitado manualmente, não mexer

        await supabase.from('profiles')
          .update({ lead_assignment_enabled: true })
          .eq('id', broker.id);

        await supabase.from('automation_logs').insert({
          entity_type: 'sobrecarga_restored',
          entity_id: broker.id,
          status: 'success',
          message_sent: `Corretor ${broker.first_name} reativado — ${activeCount} leads ativos (limite restaurado: ${restoreThreshold})`,
          executed_at: now,
        });

        await supabase.from('internal_notifications').insert({
          to_id: broker.id,
          type: 'BROKER_RESTORED',
          title: '✅ Distribuição reativada',
          message: `Sua fila baixou para ${activeCount} leads. Você voltará a receber novos leads automaticamente.`,
          related_lead_id: null,
        });

        restored++;
        console.log(`[agente-anti-sobrecarga] ▶️ ${broker.first_name} restaurado (${activeCount}/${restoreThreshold})`);
      }
    }

    console.log(`[agente-anti-sobrecarga] done — paused=${paused} restored=${restored}`);

    return new Response(JSON.stringify({ paused, restored }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-anti-sobrecarga] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
