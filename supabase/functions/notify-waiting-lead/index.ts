import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// notify-waiting-lead — dispara, DO CHIP DO JUNIOR (notification_bot_instance_id), um cutucão
// pro corretor sobre um lead esperando. Substitui o botão 'Notificar' que abria o wa.me.
// body: { lead_id, preview? }

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function waitingLabel(fromIso: string | null): string {
  if (!fromIso) return 'um tempo';
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(fromIso)) / 60000));
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const leadId = body?.lead_id ? String(body.lead_id) : '';
    const preview = body?.preview === true;
    if (!leadId) return new Response(JSON.stringify({ success: false, error: 'lead_id obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: lead } = await supabase.from('leads')
      .select('id, name, broker_id, last_lead_response_at, last_interaction_at, created_at, broker:profiles!broker_id(first_name, phone)')
      .eq('id', leadId).maybeSingle();
    if (!lead) return new Response(JSON.stringify({ success: false, error: 'lead nao encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const broker: any = (lead as any).broker;
    if (!broker?.phone) return new Response(JSON.stringify({ success: false, error: 'corretor sem telefone cadastrado' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: cfg } = await supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    let botId = cfg?.value ? String(cfg.value).replace(/"/g, '') : '';
    if (!botId) { const { data: jb } = await supabase.from('bot_instances').select('id').eq('instance_name', 'Junior').like('evolution_api_url', '%api.ape77%').limit(1).maybeSingle(); botId = jb?.id || ''; }
    if (!botId) return new Response(JSON.stringify({ success: false, error: 'notification bot nao configurado' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const nome = (broker.first_name || 'Corretor').split(' ')[0];
    const lead1 = (lead.name || 'um lead').split(' ').slice(0, 2).join(' ');
    const esperando = waitingLabel(lead.last_lead_response_at || lead.last_interaction_at || lead.created_at);
    const message = `📲 *${nome}*, o lead *${lead1}* está te esperando há *${esperando}* e ainda sem retorno.\n\nLead parado esfria rápido — dá um alô agora! ⚡`;

    if (preview) return new Response(JSON.stringify({ success: true, preview: true, to: broker.phone, broker: nome, lead: lead1, message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: sr } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId, phone: broker.phone, message, send_source: 'broker_manual' } });
    const ok = sr?.success === true;
    return new Response(JSON.stringify({ success: ok, to: broker.phone, broker: nome, lead: lead1, detail: ok ? 'enviado' : (sr?.skipped || sr?.error || 'falhou') }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[notify-waiting-lead] fatal', err?.message);
    return new Response(JSON.stringify({ success: false, error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
