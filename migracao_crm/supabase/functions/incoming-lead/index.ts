import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const { name, phone, email, source, campaign_id } = payload;

    if (!name || !phone) {
      return new Response(
        JSON.stringify({ error: 'name and phone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get available brokers for distribution
    const { data: brokers } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true)
      .order('id');

    if (!brokers || brokers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No brokers available for assignment' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simple round-robin: get broker with least leads
    const { data: leadCounts } = await supabaseClient
      .from('leads')
      .select('broker_id')
      .in('broker_id', brokers.map(b => b.id));

    const counts = {};
    brokers.forEach(b => counts[b.id] = 0);
    leadCounts?.forEach(l => counts[l.broker_id]++);

    const selectedBroker = brokers.reduce((min, broker) => 
      counts[broker.id] < counts[min.id] ? broker : min
    );

    // Create lead
    const { data: lead, error: leadError } = await supabaseClient
      .from('leads')
      .insert({
        name,
        phone,
        email,
        source: source || 'webhook',
        campaign_id,
        broker_id: selectedBroker.id,
        status: 'NEW',
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (leadError) {
      console.error('Lead creation error:', leadError);
      return new Response(
        JSON.stringify({ error: leadError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log distribution
    await supabaseClient
      .from('distribution_logs')
      .insert({
        lead_id: lead.id,
        broker_id: selectedBroker.id,
        distribution_method: 'round_robin',
        distributed_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        lead,
        assigned_to: selectedBroker.id,
        message: 'Lead received and distributed'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});