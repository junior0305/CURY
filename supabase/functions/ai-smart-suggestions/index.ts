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

    const { leadId, brokerId, tactic } = await req.json();

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

    // 3. AI Magic (Refined for Contextual Pipeline Stages)
    // Lógica contextual baseada no Status e no Tempo Parado (Stale Time)
    
    let approach = "";
    let message = "";
    let reason = "";

    const name = lead.name.split(' ')[0];
    const tag = lead.tag || 'este imóvel'; // Fallback para tag vazia
    
    // Cálculo simples de tempo parado (diferença entre agora e última interação)
    const lastInteraction = new Date(lead.last_interaction_at || lead.created_at).getTime();
    const now = new Date().getTime();
    const hoursStale = (now - lastInteraction) / (1000 * 60 * 60);

    // SE TIVER UMA TÁTICA FORÇADA (Botões de Viés Cognitivo)
    if (tactic) {
      switch (tactic) {
        case 'SCARCITY':
          approach = "Gatilho de Escassez (FOMO)";
          message = `${name}, preciso ser muito rápido com você. 🚨 Restam apenas 2 unidades nessa prumada que você gostou. A tabela de preços vira em 48h. Se não reservarmos agora, o valor vai subir. Consegue falar agora?`;
          reason = "O medo de perder (FOMO) é o motivador mais forte para indecisos. Usamos tempo e quantidade limitados.";
          break;
        case 'LOSS_AVERSION':
          approach = "Aversão à Perda";
          message = `${name}, estou segurando a condição de pré-lançamento para você até às 18h. Se não validarmos sua proposta, infelizmente o sistema volta para o preço de mercado e você perde a valorização automática de entrada. Vamos formalizar para não perder isso?`;
          reason = "As pessoas lutam mais para não perder o que já 'têm' do que para ganhar algo novo. Mostre que a condição já é dele, mas está escapando.";
          break;
        case 'AUTHORITY':
          approach = "Autoridade / Prova Social";
          message = `${name}, acabei de sair de uma reunião com a diretoria. Aprovei esse fluxo de pagamento para outros 2 clientes hoje. Se enviarmos sua ficha agora, consigo incluir no mesmo lote aprovado pela gerência. Me dá um ok?`;
          reason = "Transferir a responsabilidade para uma autoridade superior (diretoria) e mostrar que outros estão comprando valida a decisão.";
          break;
      }
    } else {
      // ESTRATÉGIAS PADRÃO POR STATUS (Se nenhuma tática for selecionada)
      switch (lead.status) {
        case 'NEW':
          if (hoursStale < 1) {
            approach = "Impacto Imediato (Speed-to-Lead)";
            message = `Olá ${name}! ⚡️ Acabei de receber seu interesse no ${tag}. ` +
                      `Estou na frente do computador agora separando as plantas. ` +
                      `Prefere que eu te mande o Book Completo ou um vídeo rápido do decorado?`;
            reason = "Nos primeiros minutos, o lead está com o celular na mão. Ofereça opções binárias (A ou B) para forçar uma micro-conversão.";
          } else {
            approach = "Resgate de Atenção";
            message = `Oi ${name}, tentei te ligar mais cedo sobre o ${tag}. ` +
                      `Muitas pessoas perdem essa oportunidade por acharem que a entrada é alta. ` +
                      `Fiz uma simulação surpreendente aqui. Posso te mandar o valor da parcela?`;
            reason = "Se o lead esfriou, use a curiosidade financeira para reativar o interesse racional.";
          }
          break;

        case 'IN_PROGRESS': // Em Atendimento
          if (hoursStale > 48) {
            approach = "Quebra de Silêncio (Ghosting)";
            message = `${name}, sinceramente: o que te impediu de avançarmos no ${tag}? ` +
                      `1) Não gostou da localização? ` +
                      `2) O valor ficou acima? ` +
                      `3) Ainda está pensando? ` +
                      `Me responde com o número, prometo que ajuda a gente a não perder tempo!`;
            reason = "Para leads que sumiram, a técnica de 'última tentativa' com múltipla escolha reduz a barreira cognitiva de resposta.";
          } else {
            approach = "Aprofundamento de Necessidade";
            message = `${name}, pensando no que você me falou... ` +
                      `Você prioriza mais a localização ou o tamanho da varanda? ` +
                      `Tenho uma unidade específica no ${tag} que atende exatamente um desses pontos.`;
            reason = "Em atendimento ativo, faça perguntas consultivas para qualificar o lead e tirá-lo do automático.";
          }
          break;

        case 'VISIT_SCHEDULED':
          if (hoursStale < 24) {
            approach = "Ancoragem de Expectativa";
            message = `Tudo confirmado, ${name}! ✅ ` +
                      `Separei um material exclusivo para te entregar na nossa visita. ` +
                      `Ah, e consegui a chave daquela unidade com a vista livre. Você vai gostar!`;
            reason = "Crie um 'compromisso psicológico' oferecendo algo que ele só ganha se aparecer (o material ou a vista exclusiva).";
          } else {
            approach = "Confirmação Simples";
            message = `Oi ${name}, passando só para deixar meu contato fácil para nossa visita amanhã. ` +
                      `Se precisar de localização ou referência, é só chamar aqui. Até lá!`;
            reason = "Não pergunte 'se' ele vai. Assuma que ele vai e apenas se coloque à disposição. Isso reduz cancelamentos.";
          }
          break;

        case 'DOCS_REQUESTED':
          if (hoursStale > 24) {
            approach = "Urgência de Escassez";
            message = `${name}, meu gerente acabou de me avisar que a tabela vai virar na segunda-feira. 🚨 ` +
                      `Precisamos do seu RG e Comp. de Residência ainda hoje para travar o valor antigo. ` +
                      `Consegue me mandar foto agora?`;
            reason = "Na etapa de documentos, o medo da perda (FOMO) é o gatilho mais forte. Use prazos externos (tabela, unidade reservada) para acelerar.";
          } else {
            approach = "Facilitação Burocrática";
            message = `${name}, vi que falta só o RG. ` +
                      `Não precisa escanear não, tá? Uma foto legível do celular mesmo já serve. ` +
                      `Manda aqui que eu cuido do resto da burocracia pra você.`;
            reason = "Remova a fricção. O cliente muitas vezes trava por achar que precisa de algo formal. Simplifique.";
          }
          break;
        
        case 'CONCLUDED':
          approach = "Pós-Venda e Indicação (Referral)";
          message = `Parabéns de novo pela conquista, ${name}! 🥂 ` +
                    `Foi um prazer fazer parte disso. ` +
                    `Você tem algum amigo ou familiar que também está buscando? ` +
                    `Tenho uma condição especial para indicações suas.`;
          reason = "O melhor momento para pedir indicação é na euforia da compra. Transforme clientes em promotores.";
          break;

        default:
          approach = "Reativação Genérica";
          message = `Olá ${name}, faz tempo que não nos falamos sobre o ${tag}. ` +
                    `O mercado mudou bastante nas últimas semanas. ` +
                    `Ainda faz sentido pra você investir em imóveis ou posso encerrar seu atendimento por enquanto?`;
          reason = "A técnica do 'Takeaway' (tirar a oferta da mesa) muitas vezes faz o cliente responder para não perder a oportunidade.";
      }
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