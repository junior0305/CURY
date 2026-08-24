import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: notifBot } = await supabaseClient.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').single();
    if (!notifBot?.value) return new Response(JSON.stringify({ error: 'No notification bot configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const botId = notifBot.value as string;
    const { data: managers } = await supabaseClient.from('profiles').select('id, email, first_name, phone').eq('role', 'MANAGER').not('phone', 'is', null);
    if (!managers || managers.length === 0) return new Response(JSON.stringify({ message: 'No managers found' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const { data: analyses } = await supabaseClient.from('ai_coach_analysis').select('*, profiles!ai_coach_analysis_broker_id_fkey(first_name, email)').gte('created_at', twoDaysAgo.toISOString()).order('created_at', { ascending: false });
    if (!analyses || analyses.length === 0) return new Response(JSON.stringify({ message: 'No analyses in last 2 days' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const brokerMap: Record<string, any> = {};
    analyses.forEach((a: any) => {
      if (!brokerMap[a.broker_id]) brokerMap[a.broker_id] = { broker_name: a.profiles?.first_name || a.profiles?.email || 'Corretor', scores: [], total_errors: 0, error_types: {}, error_descriptions: {}, conversations: 0 };
      brokerMap[a.broker_id].scores.push(a.quality_score);
      brokerMap[a.broker_id].conversations++;
      if (a.errors && Array.isArray(a.errors)) a.errors.forEach((e: any) => { const t = e.type || 'unknown'; if (!brokerMap[a.broker_id].error_types[t]) { brokerMap[a.broker_id].error_types[t] = 0; brokerMap[a.broker_id].error_descriptions[t] = e.description || ''; } brokerMap[a.broker_id].error_types[t]++; brokerMap[a.broker_id].total_errors++; });
    });
    const brokerStats = Object.entries(brokerMap).map(([id, data]: [string, any]) => { const avgScore = Math.round(data.scores.reduce((s: number, n: number) => s + n, 0) / data.scores.length); const topErrors = Object.entries(data.error_types).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 3).map(([type, count]) => ({ type, count, description: data.error_descriptions[type] || type })); return { broker_id: id, broker_name: data.broker_name, avg_score: avgScore, total_errors: data.total_errors, conversations: data.conversations, top_errors: topErrors, needs_attention: avgScore < 70 || data.total_errors > 10 }; }).sort((a, b) => b.total_errors - a.total_errors);
    const needsAttention = brokerStats.filter(b => b.needs_attention);
    const topPerformers = brokerStats.filter(b => b.avg_score >= 85 && b.total_errors < 5).slice(0, 3);
    const dateRange = `${twoDaysAgo.toLocaleDateString('pt-BR')} - ${new Date().toLocaleDateString('pt-BR')}`;
    let message = `📊 *Resumo Coach IA*\n${dateRange}\n\n`;
    if (needsAttention.length > 0) { message += `🔴 *PRECISA INTERVENÇÃO:*\n\n`; needsAttention.slice(0, 3).forEach(b => { message += `*${b.broker_name.toUpperCase()}*\n${b.total_errors} erros em ${b.conversations} conversas\n\n`; if (b.top_errors.length > 0) { message += `TOP 3 ERROS:\n`; b.top_errors.forEach((e: any, i: number) => { message += `${i + 1}. ❌ ${e.description} (${e.count}x)\n`; }); message += '\n'; } message += `\n---\n\n`; }); }
    if (topPerformers.length > 0) { message += `✅ *DESTAQUES:*\n`; topPerformers.forEach(b => { message += `• *${b.broker_name}* - ${b.avg_score}/100 🏆\n`; }); message += '\n'; }
    const totalConversations = brokerStats.reduce((s, b) => s + b.conversations, 0);
    const totalErrors = brokerStats.reduce((s, b) => s + b.total_errors, 0);
    message += `📊 *GERAL:*\n• ${totalConversations} conversas analisadas\n• ${totalErrors} erros detectados\n• ${needsAttention.length} corretores precisam atenção\n\nAcesse o CRM para detalhes.`;
    let sent = 0;
    for (const manager of managers) { try { const { error } = await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId, phone: manager.phone, message, conversationId: null } }); if (!error) sent++; await new Promise(r => setTimeout(r, 2000)); } catch (e: any) { console.error(e.message); } }
    return new Response(JSON.stringify({ success: true, sent, total_analyses: analyses.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});