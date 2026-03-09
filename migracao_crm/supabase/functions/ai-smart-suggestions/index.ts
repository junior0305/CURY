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

    const { leadId, context } = await req.json();

    if (!leadId) {
      return new Response(
        JSON.stringify({ error: 'leadId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get lead data
    const { data: lead } = await supabaseClient
      .from('leads')
      .select('*, lead_notes(*)')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate suggestions based on lead data
    const suggestions = [];

    // Status-based suggestions
    if (lead.status === 'NEW') {
      suggestions.push({
        type: 'action',
        priority: 'high',
        message: 'Faça o primeiro contato em até 5 minutos para maximizar conversão',
        action: 'call',
      });
    }

    if (lead.status === 'CONTACTED' && !lead.next_action_date) {
      suggestions.push({
        type: 'reminder',
        priority: 'medium',
        message: 'Agende um follow-up para manter o lead engajado',
        action: 'schedule',
      });
    }

    // Time-based suggestions
    const daysSinceLastContact = lead.last_interaction_at 
      ? Math.floor((Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    if (daysSinceLastContact && daysSinceLastContact > 7) {
      suggestions.push({
        type: 'alert',
        priority: 'high',
        message: `Lead sem contato há ${daysSinceLastContact} dias. Retome o relacionamento!`,
        action: 'contact',
      });
    }

    // Notes-based suggestions
    if (lead.lead_notes && lead.lead_notes.length > 0) {
      const recentNote = lead.lead_notes[0];
      if (recentNote.note.toLowerCase().includes('orçamento')) {
        suggestions.push({
          type: 'tip',
          priority: 'medium',
          message: 'Envie uma proposta detalhada via WhatsApp para aumentar as chances de conversão',
          action: 'send_proposal',
        });
      }
    }

    // Default suggestion if no specific ones
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'tip',
        priority: 'low',
        message: 'Mantenha contato regular para construir relacionamento com o lead',
        action: 'engage',
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        suggestions,
        lead_status: lead.status,
        context: context || 'general'
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