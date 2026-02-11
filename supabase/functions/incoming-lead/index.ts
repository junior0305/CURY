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

  try {
    // CORREÇÃO: Lê o body APENAS UMA VEZ
    const payload = await req.json();
    console.log("[incoming-lead] Payload recebido:", JSON.stringify(payload));

    // Suporte para estruturas aninhadas como as do Facebook/Make (data.attributes)
    const sourceData = payload.data?.attributes || payload.attributes || payload;

    // Mapeamento flexível para aceitar nomes comuns vindos do Make/Zapier/Facebook
    const name = sourceData.name || sourceData.nome || sourceData.fullName || payload.name || 'Lead Sem Nome';
    const phone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact || payload.phone;
    const email = sourceData.email || sourceData.mail || payload.email || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem || payload.origin || 'Make/Webhook';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || payload.message || '';
    const tag = sourceData.tag || sourceData.tags || sourceData.Interesse || payload.tag || '';
    
    if (!phone) {
      console.error("[incoming-lead] Erro: Telefone não encontrado no payload.", payload);
      return new Response(JSON.stringify({ 
        error: 'Phone is required', 
        received_payload: payload,
        tip: 'Certifique-se de enviar o campo "phone" ou "telefone" no seu JSON do Make.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const nowIso = new Date().toISOString(); // Hora exata da entrada

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
    const { name: nameData, phone: phoneData, email: emailData, tag: tagData, notes, source, renda } = data;

    if (!nameData || !phoneData) {
      throw new Error("Nome e Telefone são obrigatórios.");
    }

    console.log(`[incoming-lead] Novo lead recebido: ${nameData} (${phoneData}) - Tag: ${tagData}`);

    // 2. Lógica de Distribuição (Round Robin Simples)
    let eligibleBrokers = [];
    let logStatus = 'NO_BROKER_AVAILABLE';
    let assignedBrokerName = 'Nenhum';

    try {
      const { data, error: brokerError } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, manager_id')
        .eq('role', 'BROKER')
        .eq('lead_assignment_enabled', true);
      
      if (brokerError) throw brokerError;
      eligibleBrokers = data || [];
    } catch (e) {
      console.warn("[incoming-lead] Falha ao filtrar corretores:", e.message);
    }

    let assignedBrokerId = null;
    let assignedManagerId = null;

    if (eligibleBrokers && eligibleBrokers.length > 0) {
      const randomIndex = Math.floor(Math.random() * eligibleBrokers.length);
      const broker = eligibleBrokers[randomIndex];
      assignedBrokerId = broker.id;
      assignedManagerId = broker.manager_id;
      assignedBrokerName = `${broker.first_name} ${broker.last_name}`;
      logStatus = 'SUCCESS';
      console.log(`[incoming-lead] Lead atribuído ao corretor: ${assignedBrokerName}`);
    }

    // 3. Salvar o Lead no Banco
    const { data: newLead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert({
        name: nameData || "Lead Sem Nome",
        phone: phoneData || "000000000",
        email: emailData || null,
        tag: tagData || source || 'Web',
        broker_id: assignedBrokerId,
        manager_id: assignedManagerId,
        status: 'NEW',
        last_interaction_at: new Date().toISOString(),
        notes: notes || (renda ? `Renda: ${renda}` : null)
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 4. REGISTRAR LOG DE DISTRIBUIÇÃO
    await supabaseAdmin.from('distribution_logs').insert({
      lead_name: nameData,
      lead_phone: phoneData,
      queue_name: tagData || 'Geral',
      assigned_to_name: assignedBrokerName,
      status: logStatus
    });

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