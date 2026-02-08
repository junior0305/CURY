import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!);

    const { leadId, brokerId, previousNotes } = await req.json();

    // 1. Get Lead Details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;

    // 2. Get Broker Details (to know their style or team)
    const { data: broker } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', brokerId)
      .single();

    // 3. AI Magic (Simulated logic based on real-world real estate conversion patterns)
    // In a production environment, you would call OpenAI/Anthropic here.
    
    let approach = "";
    let message = "";
    let reason = "";

    const name = lead.name.split(' ')[0];
    const tag = lead.tag || 'imóvel';

    if (lead.status === 'NEW') {
      approach = "Abordagem de Quebra de Padrão";
      message = `Oi ${name}! Notei que você buscou informações sobre ${tag}. ` +
                `Em vez de te mandar um PDF gigante, eu gravei um vídeo de 15 segundos ` +
                `mostrando o detalhe que ninguém vê nesse projeto. Posso te mandar?`;
      reason = "Leads novos respondem 4x mais a perguntas fechadas que oferecem exclusividade imediata.";
    } else if (lead.status === 'IN_PROGRESS') {
      approach = "Follow-up de Micro-Compromisso";
      message = `${name}, ainda estou com aquela unidade separada pra você. ` +
                `Consegue ouvir um áudio de 20 segundos onde te explico por que essa é a ` +
                `melhor condição de fluxo de pagamento do mês?`;
      reason = "Mudar o canal para áudio humaniza o atendimento e aumenta a percepção de valor.";
    } else if (lead.status === 'VISIT_SCHEDULED') {
      approach = "Garantia de Comparecimento";
      message = `${name}, tudo pronto para nossa visita! ` +
                `Dica de quem conhece a região: o sol da tarde bate direto na varanda desse apto. ` +
                `Te espero às 17h para você ver isso ao vivo. Alguma dúvida no caminho?`;
      reason = "Dar uma 'dica de insider' reforça sua autoridade e gera desejo pela experiência da visita.";
    } else {
      approach = "Retomada de Valor";
      message = `${name}, acabei de ver uma atualização na documentação deste projeto que muda tudo para quem quer investir. ` +
                `Podemos falar 2 minutos sobre como isso acelera sua aprovação?`;
      reason = "Leads parados precisam de um fato novo ou urgência real para reativar.";
    }

    return new Response(JSON.stringify({ 
      success: true, 
      approach,
      message,
      reason
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
