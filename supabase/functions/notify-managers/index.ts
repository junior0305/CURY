import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  )

  try {
    // 1. Verificar se notificações de managers estão ativas
    const { data: enabledSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'notify_managers_enabled').maybeSingle()

    if (enabledSetting?.value !== true) {
      console.log('[notify-managers] Notificações desativadas, pulando.')
      return new Response(JSON.stringify({ skipped: 'notify_managers_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Obter instância do Superintendente (Junior)
    const { data: botSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'superintendent_bot_instance_id').maybeSingle()

    const supBotId = botSetting?.value
    if (!supBotId) {
      console.error('[notify-managers] superintendent_bot_instance_id não configurado')
      return new Response(JSON.stringify({ error: 'superintendent_bot_instance_id não configurado. Configure em Tropas → Configurações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Threshold de inatividade (padrão 24h)
    const { data: thresholdSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'manager_notify_stale_hours').maybeSingle()
    const staleHours: number = Number(thresholdSetting?.value) || 24
    const staleSince = new Date(Date.now() - staleHours * 3600000).toISOString()

    // 4. Buscar todos os managers ativos com telefone
    const { data: managers } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone')
      .eq('role', 'MANAGER')
      .eq('is_active', true)
      .not('phone', 'is', null)
      .neq('phone', '')

    if (!managers?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_managers_with_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let processed = 0
    const results: any[] = []

    for (const manager of managers) {
      // 5. Corretores desta equipe
      const { data: brokers } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('manager_id', manager.id)
        .eq('role', 'BROKER')

      if (!brokers?.length) {
        results.push({ manager: manager.first_name, skipped: 'no_brokers' })
        continue
      }

      const brokerIds = brokers.map(b => b.id)

      // 6. Leads parados dos corretores desta equipe (com ou sem last_interaction_at)
      const { data: staleWithInteraction } = await supabase
        .from('leads')
        .select('id, name, status, last_interaction_at, created_at, broker_id')
        .in('broker_id', brokerIds)
        .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
        .lt('last_interaction_at', staleSince)
        .order('last_interaction_at', { ascending: true })
        .limit(15)

      const { data: staleWithoutInteraction } = await supabase
        .from('leads')
        .select('id, name, status, last_interaction_at, created_at, broker_id')
        .in('broker_id', brokerIds)
        .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
        .is('last_interaction_at', null)
        .lt('created_at', staleSince)
        .order('created_at', { ascending: true })
        .limit(10)

      const seenIds = new Set<string>()
      const staleLeads = [
        ...(staleWithInteraction || []),
        ...(staleWithoutInteraction || []),
      ].filter(l => {
        if (seenIds.has(l.id)) return false
        seenIds.add(l.id)
        return true
      })

      if (!staleLeads.length) {
        results.push({ manager: manager.first_name, skipped: 'no_stale_leads' })
        continue
      }

      // 7. Montar mensagem executiva: só corretor + contagem + tempo máximo parado
      const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b.first_name || 'Corretor']))
      const now = new Date()

      // Agrupa leads por broker para contar e achar tempo máximo
      const summaryByBroker: Record<string, { count: number; maxHours: number }> = {}
      for (const lead of staleLeads) {
        const brokerName = brokerMap[lead.broker_id] || 'Corretor'
        const lastActivity = lead.last_interaction_at || lead.created_at
        const hoursStale = Math.round((now.getTime() - new Date(lastActivity).getTime()) / 3600000)
        if (!summaryByBroker[brokerName]) summaryByBroker[brokerName] = { count: 0, maxHours: 0 }
        summaryByBroker[brokerName].count++
        if (hoursStale > summaryByBroker[brokerName].maxHours) summaryByBroker[brokerName].maxHours = hoursStale
      }

      const brokerLines = Object.entries(summaryByBroker).map(([brokerName, { count, maxHours }]) =>
        `• *${brokerName}* — ${count} lead${count > 1 ? 's' : ''} (até ${maxHours}h parado)`
      )

      const managerName = manager.first_name || 'Gerente'
      const timeNow = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

      const message = [
        `📊 *Resumo da equipe — ${timeNow}*`,
        ``,
        `Olá ${managerName}! Sua equipe tem leads parados há +${staleHours}h:`,
        ``,
        ...brokerLines,
        ``,
        `Acesse o painel para redistribuir ou acionar sua equipe. 🎯`,
      ].join('\n')

      // 8. Enviar via bot do Superintendente
      const { data: sendResult } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: supBotId, phone: manager.phone, message }
      })

      const success = sendResult?.success || false
      console.log(`[notify-managers] ${managerName} (${manager.phone}): ${success ? '✅' : '❌'} — ${staleLeads.length} leads`)

      processed++
      results.push({
        manager: managerName,
        phone: manager.phone,
        stale_leads: staleLeads.length,
        sent: success,
      })

      // Pausa entre envios
      await new Promise(r => setTimeout(r, 1200))
    }

    return new Response(JSON.stringify({ success: true, processed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('[notify-managers] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
