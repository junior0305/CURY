import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// announcement-reminder
//
// A cada 15min:
// - Para cada announcement com starts_at entre NOW+1h45 e NOW+2h15
//   E requires_rsvp=true E reminder_sent_at IS NULL:
//   - Lista usuários elegíveis (target_role/team) que ainda não responderam RSVP
//   - Envia WhatsApp pelo bot global de notificação (Junior)
//   - Marca reminder_sent_at = NOW pra não disparar de novo
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildReminderMessage(name: string, title: string, startsAt: string, body?: string | null) {
  const when = new Date(startsAt).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return [
    `🔔 ${name}, lembrete!`,
    ``,
    `*${title}*`,
    `📅 ${when} (em ~2h)`,
    ``,
    body ? body : '',
    ``,
    `Você ainda não confirmou se vai. Abre a Comandra e marca *Vou* ou *Não posso* 🙏`,
  ].filter(Boolean).join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    // Bot de notificação
    const { data: botSetting } = await supabase
      .from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    const notificationBotId: string | null = botSetting?.value ?? null;
    if (!notificationBotId) {
      return new Response(JSON.stringify({ skipped: 'no_notification_bot' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Avisos com evento entre +1h45 e +2h15
    const lowerBound = new Date(Date.now() + 1 * 3600000 + 45 * 60000).toISOString();
    const upperBound = new Date(Date.now() + 2 * 3600000 + 15 * 60000).toISOString();

    const { data: anns } = await supabase
      .from('announcements')
      .select('id, title, body, target_role, target_team_id, starts_at, requires_rsvp, reminder_sent_at')
      .eq('pinned', true)
      .eq('requires_rsvp', true)
      .is('reminder_sent_at', null)
      .gte('starts_at', lowerBound)
      .lte('starts_at', upperBound);

    if (!anns?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_anns_in_window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let totalSent = 0;
    const perAnn: any[] = [];

    for (const a of anns) {
      // Quem é elegível pro aviso?
      let usersQ = supabase.from('profiles')
        .select('id, first_name, phone, role, team_id')
        .not('phone', 'is', null).neq('phone', '')
        .not('first_name', 'ilike', '%[INATIVO]%');

      if (a.target_role && a.target_role.length > 0) usersQ = usersQ.in('role', a.target_role);
      if (a.target_team_id && a.target_team_id.length > 0) usersQ = usersQ.in('team_id', a.target_team_id);

      const { data: users } = await usersQ;

      // Quem JÁ respondeu RSVP (não precisa lembrar)
      const { data: reads } = await supabase
        .from('announcement_reads')
        .select('user_id')
        .eq('announcement_id', a.id)
        .not('rsvp_response', 'is', null);

      const respondedSet = new Set((reads || []).map((r: any) => r.user_id));
      const pending = (users || []).filter((u: any) => !respondedSet.has(u.id));

      let sentForThis = 0;
      for (const u of pending) {
        const msg = buildReminderMessage(u.first_name || 'Corretor', a.title, a.starts_at, a.body);
        try {
          const { data: r } = await supabase.functions.invoke('send_whatsapp_message', {
            body: { botId: notificationBotId, phone: u.phone, message: msg },
          });
          if (r?.success) sentForThis++;
        } catch (_e) { /* ignora individual */ }
      }

      // Marca como enviado
      await supabase.from('announcements').update({ reminder_sent_at: new Date().toISOString() }).eq('id', a.id);

      totalSent += sentForThis;
      perAnn.push({ id: a.id, title: a.title, eligible: users?.length ?? 0, pending: pending.length, sent: sentForThis });
      console.log(`[announcement-reminder] ${a.title}: ${sentForThis}/${pending.length} enviados`);
    }

    return new Response(JSON.stringify({ processed: anns.length, totalSent, perAnn }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[announcement-reminder] fatal:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
