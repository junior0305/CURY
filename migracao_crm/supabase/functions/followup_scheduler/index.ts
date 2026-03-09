import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('⏰ Follow-up Scheduler v2 (com reagendamento)');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const brazilOffset = -3 * 60;
    const localTime = new Date(now.getTime() + (brazilOffset * 60 * 1000));
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();
    const currentTimeMinutes = hour * 60 + minute;

    const startTime = 18 * 60 + 30; // 18:30 = 1110 minutos
    const endTime = 21 * 60; // 21:00 = 1260 minutos

    console.log(`⏰ Horário atual (Brasília): ${hour}:${minute.toString().padStart(2, '0')}`);
    console.log(`📊 Janela permitida: 18:30 - 21:00`);

    // Buscar cadências pendentes
    const { data: executions, error: execError } = await supabaseClient
      .from('cadence_executions')
      .select('*, cadence_templates(*), leads(*)')
      .eq('status', 'active')
      .lte('next_execution_at', now.toISOString())
      .limit(50);

    if (execError) {
      console.error('❌ Erro ao buscar execuções:', execError);
      throw execError;
    }

    if (!executions || executions.length === 0) {
      console.log('✅ Nenhum follow-up pendente');
      return new Response(
        JSON.stringify({ message: 'No pending follow-ups', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 ${executions.length} follow-ups encontrados`);

    // VERIFICAR SE ESTÁ FORA DO HORÁRIO
    if (currentTimeMinutes < startTime || currentTimeMinutes > endTime) {
      console.log('⏸️ Fora do horário permitido. Reagendando...');
      
      // REAGENDAR PARA AMANHÃ ÀS 18:30
      const tomorrow = new Date(localTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 30, 0, 0);
      
      // Converter de volta para UTC
      const tomorrowUTC = new Date(tomorrow.getTime() - (brazilOffset * 60 * 1000));

      console.log(`📅 Reagendando ${executions.length} follow-ups para ${tomorrow.toLocaleString('pt-BR')}`);

      for (const execution of executions) {
        await supabaseClient
          .from('cadence_executions')
          .update({ next_execution_at: tomorrowUTC.toISOString() })
          .eq('id', execution.id);
      }

      return new Response(
        JSON.stringify({ 
          message: 'Outside working hours - rescheduled', 
          current_time: `${hour}:${minute}`,
          allowed_window: '18:30 - 21:00',
          rescheduled: executions.length,
          next_run: tomorrow.toLocaleString('pt-BR'),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Dentro do horário permitido! Processando...');

    let processed = 0;
    let errors = 0;

    for (const execution of executions) {
      try {
        console.log(`🔄 Processando lead: ${execution.leads?.name}`);

        const { data: lead } = await supabaseClient
          .from('leads')
          .select('*, profiles!assigned_broker_id(*)')
          .eq('id', execution.lead_id)
          .single();

        if (!lead || !lead.profiles) {
          console.log('⚠️ Lead sem corretor atribuído');
          continue;
        }

        const { data: result, error: execError } = await supabaseClient.functions.invoke('cadence_executor', {
          body: {
            leadId: execution.lead_id,
            cadenceId: execution.cadence_id,
            brokerId: lead.assigned_broker_id,
          },
        });

        if (execError) {
          console.error('❌ Erro ao executar cadência:', execError);
          errors++;
        } else {
          console.log('✅ Follow-up enviado:', result);
          processed++;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error('❌ Erro no lead:', error.message);
        errors++;
      }
    }

    console.log(`🎉 Processamento concluído: ${processed} enviados, ${errors} erros`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed, 
        errors,
        time: `${hour}:${minute}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro geral:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});