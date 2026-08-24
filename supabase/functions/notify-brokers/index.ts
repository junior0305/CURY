import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function resolveManagerBot(supabase: any, managerId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('bot_instance_id, first_name, full_name')
    .eq('id', managerId)
    .maybeSingle()

  if (profile?.bot_instance_id) return profile.bot_instance_id

  const firstName = profile?.first_name || profile?.full_name?.split(' ')[0] || ''
  if (firstName) {
    const { data: botByName } = await supabase
      .from('bot_instances')
      .select('id')
      .ilike('name', `%${firstName}%`)
      .limit(1)
      .maybeSingle()
    if (botByName?.id) return botByName.id
  }

  const { data: anyBot } = await supabase
    .from('bot_instances')
    .select('id')
    .in('status', ['connected', 'open'])
    .limit(1)
    .maybeSingle()
  return anyBot?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  )

  try {
    const { data: thresholdSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'manager_notify_stale_hours').maybeSingle()
    const staleHours: number = Number(thresholdSetting?.value) || 24
    const staleSince = new Date(Date.now() - staleHours * 3600000).toISOString()

    const { data: managers } = await supabase
      .from('profiles')
      .select('id, first_name, bot_instance_id')
      .eq('role', 'MANAGER')
      .eq('is_active', true)

    if (!managers?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_managers' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let processed = 0
    const results: any[] = []

    for (const manager of managers) {
      const botId = await resolveManagerBot(supabase, manager.id)
      if (!botId) { results.push({ manager: manager.first_name, skipped: 'no_bot_resolved' }); continue }

      const { data: brokers } = await supabase
        .from('profiles').select('id, first_name, phone')
        .eq('manager_id', manager.id).eq('role', 'BROKER')
        .not('phone', 'is', null).neq('phone', '')

      if (!brokers?.length) { results.push({ manager: manager.first_name, skipped: 'no_brokers_with_phone' }); continue }

      for (const broker of brokers) {
        const { data: staleWithInteraction } = await supabase
          .from('leads').select('id, name, last_interaction_at, created_at')
          .eq('broker_id', broker.id).in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
          .lt('last_interaction_at', staleSince).order('last_interaction_at', { ascending: true }).limit(10)

        const { data: staleWithoutInteraction } = await supabase
          .from('leads').select('id, name, last_interaction_at, created_at')
          .eq('broker_id', broker.id).in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
          .is('last_interaction_at', null).lt('created_at', staleSince).order('created_at', { ascending: true }).limit(5)

        const seenIds = new Set<string>()
        const staleLeads = [...(staleWithInteraction || []), ...(staleWithoutInteraction || [])].filter(l => {
          if (seenIds.has(l.id)) return false; seenIds.add(l.id); return true
        })

        if (!staleLeads.length) { results.push({ manager: manager.first_name, broker: broker.first_name, skipped: 'no_stale_leads' }); continue }

        const now = new Date()
        const brokerName = broker.first_name || 'Corretor'
        const leadLines = staleLeads.map(lead => {
          const lastActivity = lead.last_interaction_at || lead.created_at
          const hoursStale = Math.round((now.getTime() - new Date(lastActivity).getTime()) / 3600000)
          return `  • ${lead.name} (${hoursStale}h sem resposta)`
        })

        const message = [`⚠️ *${brokerName}, você tem leads parados!*`, ``,
          `${staleLeads.length} lead${staleLeads.length > 1 ? 's' : ''} sem contato há mais de ${staleHours}h:`,
          ``, ...leadLines, ``, `Entre em contato agora e mantenha o funil aquecido. 🔥`].join('\n')

        const { data: sendResult } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId, phone: broker.phone, message }
        })

        const success = sendResult?.success || false
        if (success) processed++
        results.push({ manager: manager.first_name, broker: brokerName, stale_leads: staleLeads.length, sent: success })
        await new Promise(r => setTimeout(r, 800))
      }
    }

    return new Response(JSON.stringify({ success: true, processed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('[notify-brokers] Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
