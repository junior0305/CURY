import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Receber o corpo de forma segura
    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("[incoming-lead] JSON Inválido recebido:", rawBody);
      throw new Error("O formato do JSON enviado pelo Make está inválido. Verifique vírgulas e aspas.");
    }

    // Extração flexível (aceita sua estrutura antiga ou a nova)
    const data = body.data?.attributes || body;
    const { name, phone, email, tag, notes, source, renda } = data;

    if (!name || !phone) {
      throw new Error("Nome e Telefone são obrigatórios.");
    }

    console.log(`[incoming-lead] Novo lead recebido: ${name} (${phone}) - Tag: ${tag}`);

    // 2. Lógica de Distribuição (Round Robin Simples)
    // Buscamos corretores que estão com a fila habilitada
    const { data: eligibleBrokers, error: brokerError } = await supabaseAdmin
      .from('profiles')
      .select('id, manager_id')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true);

    if (brokerError) throw brokerError;

    let assignedBrokerId = null;
    let assignedManagerId = null;

    if (eligibleBrokers && eligibleBrokers.length > 0) {
      // Para o MVP, pegamos um corretor aleatório ou o com menos leads hoje
      // Em uma versão avançada, usaríamos uma tabela de controle de fila
      const randomIndex = Math.floor(Math.random() * eligibleBrokers.length);
      assignedBrokerId = eligibleBrokers[randomIndex].id;
      assignedManagerId = eligibleBrokers[randomIndex].manager_id;
      console.log(`[incoming-lead] Lead atribuído ao corretor: ${assignedBrokerId}`);
    } else {
      console.log(`[incoming-lead] Nenhum corretor disponível. Lead ficará sem atribuição.`);
    }

    // 3. Salvar o Lead no Banco
    const { data: newLead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert({
        name: name || "Lead Sem Nome",
        phone: phone || "000000000",
        email: email || null,
        tag: tag || source || 'Web',
        broker_id: assignedBrokerId,
        manager_id: assignedManagerId,
        status: 'NEW',
        last_interaction_at: new Date().toISOString(),
        notes: notes || (renda ? `Renda: ${renda}` : null)
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Lead recebido e processado.", 
      leadId: newLead.id,
      assignedTo: assignedBrokerId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error("[incoming-lead] Erro:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})