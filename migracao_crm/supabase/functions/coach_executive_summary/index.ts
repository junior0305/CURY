import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {'Access-Control-Allow-Origin': '*','Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: notifBot } = await supabaseClient.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').single();
    if (!notifBot?.value) return new Response(JSON.stringify({ error: 'No bot configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const botId = notifBot.value as string;

    // Buscar superintendentes e managers
    const { data: recipients } = await supabaseClient.from('profiles').select('id, email, first_name, full_name, phone, role').eq('receives_coach_summary', true).eq('is_active', true).not('phone', 'is', null);

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const { data: analyses } = await supabaseClient.from('ai_coach_analysis').select(`*, profiles!ai_coach_analysis_broker_id_fkey(first_name, full_name, email, team_id)`).gte('created_at', twoDaysAgo.toISOString()).order('created_at', { ascending: false });

    if (!analyses || analyses.length === 0) {
      return new Response(JSON.stringify({ message: 'No analyses' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const brokerMap: Record<string, any> = {};
    analyses.forEach(a => {
      if (!brokerMap[a.broker_id]) {
        brokerMap[a.broker_id] = {
          broker_name: a.profiles?.first_name || a.profiles?.full_name || a.profiles?.email || 'Corretor',
          team_id: a.profiles?.team_id,
          scores: [],
          total_errors: 0,
          error_types: {} as Record<string, number>,
          error_descriptions: {} as Record<string, string>,
          conversations: 0,
        };
      }
      brokerMap[a.broker_id].scores.push(a.quality_score);
      brokerMap[a.broker_id].conversations++;
      if (a.errors && Array.isArray(a.errors)) {
        a.errors.forEach((error: any) => {
          const errorType = error.type || 'unknown';
          const errorDesc = error.description || '';
          if (!brokerMap[a.broker_id].error_types[errorType]) {
            brokerMap[a.broker_id].error_types[errorType] = 0;
            brokerMap[a.broker_id].error_descriptions[errorType] = errorDesc;
          }
          brokerMap[a.broker_id].error_types[errorType]++;
          brokerMap[a.broker_id].total_errors++;
        });
      }
    });

    const brokerStats = Object.entries(brokerMap).map(([id, data]) => {
      const avgScore = Math.round(data.scores.reduce((sum: number, s: number) => sum + s, 0) / data.scores.length);
      const topErrors = Object.entries(data.error_types).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 3).map(([type, count]) => ({ type, count, description: data.error_descriptions[type] || type }));
      return { broker_id: id, broker_name: data.broker_name, team_id: data.team_id, avg_score: avgScore, total_errors: data.total_errors, conversations: data.conversations, top_errors: topErrors, needs_attention: avgScore < 70 || data.total_errors > 10 };
    }).sort((a, b) => b.total_errors - a.total_errors);

    const needsAttention = brokerStats.filter(b => b.needs_attention);
    const topPerformers = brokerStats.filter(b => b.avg_score >= 85 && b.total_errors < 5).slice(0, 3);
    const criticalIssues = brokerStats.filter(b => b.avg_score < 50);

    const dateRange = `${twoDaysAgo.toLocaleDateString('pt-BR')} - ${new Date().toLocaleDateString('pt-BR')}`;

    let sent = 0;

    for (const recipient of recipients) {
      try {
        let message = '';

        // RESUMO EXECUTIVO (Superintendente)
        if (recipient.role === 'admin') {
          message = `📊 *RESUMO EXECUTIVO - COACH IA*\n${dateRange}\n\n`;

          // Indicadores gerais
          const avgTotal = Math.round(brokerStats.reduce((sum, b) => sum + b.avg_score, 0) / brokerStats.length);
          const totalConversations = brokerStats.reduce((sum, b) => sum + b.conversations, 0);
          const totalErrors = brokerStats.reduce((sum, b) => sum + b.total_errors, 0);

          message += `📈 *INDICADORES GERAIS:*\n`;
          message += `• Score médio: ${avgTotal}/100\n`;
          message += `• Conversas analisadas: ${totalConversations}\n`;
          message += `• Erros detectados: ${totalErrors}\n`;
          message += `• Corretores ativos: ${brokerStats.length}\n\n`;

          // Pontos críticos de atenção
          if (criticalIssues.length > 0) {
            message += `🔴 *ATENÇÃO CRÍTICA (Score < 50):*\n`;
            criticalIssues.slice(0, 3).forEach(b => {
              message += `\n*${b.broker_name}* - ${b.avg_score}/100\n`;
              message += `  ${b.total_errors} erros | ${b.conversations} conversas\n`;
              if (b.top_errors[0]) message += `  Principal: ${b.top_errors[0].description.substring(0, 50)}...\n`;
            });
            message += '\n';
          }

          // Comparativo de performance
          if (needsAttention.length > 0) {
            message += `⚠️ *PRECISAM TREINAMENTO (${needsAttention.length}):*\n`;
            needsAttention.slice(0, 5).forEach(b => {
              message += `• ${b.broker_name}: ${b.avg_score}/100 (${b.total_errors} erros)\n`;
            });
            message += '\n';
          }

          // Top performers
          if (topPerformers.length > 0) {
            message += `🏆 *TOP PERFORMERS:*\n`;
            topPerformers.forEach((b, i) => {
              message += `${i + 1}. ${b.broker_name} - ${b.avg_score}/100 ✨\n`;
            });
            message += '\n';
          }

          message += `💡 *AÇÕES RECOMENDADAS:*\n`;
          if (criticalIssues.length > 0) {
            message += `• Intervenção imediata: ${criticalIssues.map(b => b.broker_name).join(', ')}\n`;
          }
          if (needsAttention.length >= 3) {
            message += `• Treinamento em grupo sobre erros comuns\n`;
          }
          message += `• Reconhecer top performers em reunião\n`;

        } else {
          // RESUMO PARA MANAGERS (simplificado)
          message = `📊 *Resumo Coach IA*\n${dateRange}\n\n`;

          if (needsAttention.length > 0) {
            message += `🔴 *PRECISA INTERVENÇÃO:*\n\n`;
            needsAttention.slice(0, 3).forEach(b => {
              message += `*${b.broker_name.toUpperCase()}*\n${b.total_errors} erros em ${b.conversations} conversas\n\n`;
              if (b.top_errors.length > 0) {
                message += `TOP 3 ERROS:\n`;
                b.top_errors.forEach((e, i) => { message += `${i + 1}. ❌ ${e.description} (${e.count}x)\n`; });
                message += '\n';
              }
              const mainError = b.top_errors[0];
              if (mainError) {
                message += `💡 *AÇÃO:* `;
                if (mainError.type.includes('price') || mainError.description.toLowerCase().includes('preço')) { message += `1-1 sobre responder preços imediatamente\n`; }
                else if (mainError.type.includes('time') || mainError.description.toLowerCase().includes('demora')) { message += `Treinamento: tempo de resposta < 1h\n`; }
                else if (mainError.type.includes('visit') || mainError.description.toLowerCase().includes('visita')) { message += `Treinamento: técnica de fechamento de agenda\n`; }
                else { message += `Revisar com ${b.broker_name} este padrão de erro\n`; }
              }
              message += `\n---\n\n`;
            });
          }

          if (topPerformers.length > 0) {
            message += `✅ *DESTAQUES:*\n`;
            topPerformers.forEach(b => { message += `• *${b.broker_name}* - ${b.avg_score}/100 🏆\n`; });
            message += '\n';
          }

          const totalConversations = brokerStats.reduce((sum, b) => sum + b.conversations, 0);
          const totalErrors = brokerStats.reduce((sum, b) => sum + b.total_errors, 0);
          message += `📊 *GERAL:*\n• ${totalConversations} conversas analisadas\n• ${totalErrors} erros detectados\n• ${needsAttention.length} corretores precisam atenção\n\n`;
        }

        message += `Acesse o CRM para detalhes completos.`;

        const { error } = await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId: botId, phone: recipient.phone, message: message, conversationId: null } });

        if (!error) sent++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Erro ao enviar para ${recipient.email}:`, error.message);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, total_analyses: analyses.length, brokers_needing_attention: needsAttention.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});