import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: notifBot } = await supabaseClient.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').single();
    if (!notifBot?.value) return new Response(JSON.stringify({ error: 'No bot configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const botId = notifBot.value as string;
    const { data: recipients } = await supabaseClient.from('profiles').select('id, email, first_name, phone, role').eq('receives_coach_summary', true).not('phone', 'is', null);
    if (!recipients || recipients.length === 0) return new Response(JSON.stringify({ message: 'No recipients' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const { data: analyses } = await supabaseClient.from('ai_coach_analysis').select('*, profiles!ai_coach_analysis_broker_id_fkey(first_name, email, team_id)').gte('created_at', twoDaysAgo.toISOString()).order('created_at', { ascending: false });
    if (!analyses || analyses.length === 0) return new Response(JSON.stringify({ message: 'No analyses' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const brokerMap: Record<string, any> = {};
    analyses.forEach((a: any) => {
      if (!brokerMap[a.broker_id]) brokerMap[a.broker_id] = { broker_name: a.profiles?.first_name || a.profiles?.email || 'Corretor', scores: [], total_errors: 0, error_types: {}, error_descriptions: {}, conversations: 0 };
      brokerMap[a.broker_id].scores.push(a.quality_score); brokerMap[a.broker_id].conversations++;
      if (a.errors && Array.isArray(a.errors)) a.errors.forEach((e: any) => { const t = e.type || 'unknown'; if (!brokerMap[a.broker_id].error_types[t]) { brokerMap[a.broker_id].error_types[t] = 0; brokerMap[a.broker_id].error_descriptions[t] = e.description || ''; } brokerMap[a.broker_id].error_types[t]++; brokerMap[a.broker_id].total_errors++; });
    });
    const brokerStats = Object.entries(brokerMap).map(([id, data]: [string, any]) => { const avgScore = Math.round(data.scores.reduce((s: number, n: number) => s + n, 0) / data.scores.length); const topErrors = Object.entries(data.error_types).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 3).map(([type, count]) => ({ type, count, description: data.error_descriptions[type] || type })); return { broker_id: id, broker_name: data.broker_name, avg_score: avgScore, total_errors: data.total_errors, conversations: data.conversations, top_errors: topErrors, needs_attention: avgScore < 70 || data.total_errors > 10 }; }).sort((a, b) => b.total_errors - a.total_errors);
    const needsAttention = brokerStats.filter(b => b.needs_attention);
    const topPerformers = brokerStats.filter(b => b.avg_score >= 85 && b.total_errors < 5).slice(0, 3);
    const criticalIssues = brokerStats.filter(b => b.avg_score < 50);
    const dateRange = `${twoDaysAgo.toLocaleDateString('pt-BR')} - ${new Date().toLocaleDateString('pt-BR')}`;
    let sent = 0;
    for (const recipient of recipients) {
      try {
        const avgTotal = Math.round(brokerStats.reduce((s, b) => s + b.avg_score, 0) / brokerStats.length);
        const totalConversations = brokerStats.reduce((s, b) => s + b.conversations, 0);
        const totalErrors = brokerStats.reduce((s, b) => s + b.total_errors, 0);
        let message = `📊 *RESUMO EXECUTIVO - COACH IA*\n${dateRange}\n\n`;
        message += `📈 *INDICADORES GERAIS:*\n• Score médio: ${avgTotal}/100\n• Conversas: ${totalConversations}\n• Erros: ${totalErrors}\n• Corretores: ${brokerStats.length}\n\n`;
        if (criticalIssues.length > 0) { message += `🔴 *ATENÇÃO CRÍTICA:*\n`; criticalIssues.slice(0, 3).forEach(b => { message += `\n*${b.broker_name}* - ${b.avg_score}/100\n  ${b.total_errors} erros | ${b.conversations} conversas\n`; }); message += '\n'; }
        if (needsAttention.length > 0) { message += `⚠️ *PRECISAM TREINAMENTO (${needsAttention.length}):*\n`; needsAttention.slice(0, 5).forEach(b => { message += `• ${b.broker_name}: ${b.avg_score}/100 (${b.total_errors} erros)\n`; }); message += '\n'; }
        if (topPerformers.length > 0) { message += `🏆 *TOP PERFORMERS:*\n`; topPerformers.forEach((b, i) => { message += `${i + 1}. ${b.broker_name} - ${b.avg_score}/100 ✨\n`; }); message += '\n'; }
        message += `Acesse o CRM para detalhes completos.`;
        const { error } = await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId, phone: recipient.phone, message, conversationId: null } });
        if (!error) sent++;
        await new Promise(r => setTimeout(r, 2000));
      } catch (e: any) { console.error(e.message); }
    }
    return new Response(JSON.stringify({ success: true, sent }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});