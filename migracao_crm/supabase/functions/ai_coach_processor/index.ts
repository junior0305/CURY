import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const corsHeaders = {'Access-Control-Allow-Origin': '*','Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: queue } = await supabaseClient.from('ai_coach_queue').select('*').eq('status', 'pending').order('priority', { ascending: false }).limit(50);

    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ message: 'No conversations', processed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let processed = 0, errors = 0;
    const byBroker = queue.reduce((acc, item) => { if (!acc[item.broker_id]) acc[item.broker_id] = []; acc[item.broker_id].push(item); return acc; }, {} as Record<string, typeof queue>);

    for (const [brokerId, items] of Object.entries(byBroker)) {
      try {
        await supabaseClient.from('ai_coach_queue').update({ status: 'processing' }).in('id', items.map(i => i.id));

        const { data: broker } = await supabaseClient.from('profiles').select('first_name, full_name, email').eq('id', brokerId).single();
        const brokerName = broker?.first_name || broker?.full_name || 'Corretor';

        const { data: failedConvs } = await supabaseClient.from('ia_conversations').select('*').in('id', items.slice(0, 5).map(i => i.conversation_id));
        const { data: messages } = await supabaseClient.from('ia_messages').select('*').in('conversation_id', (failedConvs || []).map(c => c.id)).order('created_at', { ascending: true });

        const messagesByConv = (messages || []).reduce((acc, msg) => { if (!acc[msg.conversation_id]) acc[msg.conversation_id] = []; acc[msg.conversation_id].push(msg); return acc; }, {} as Record<string, typeof messages>);

        const failedTexts = (failedConvs || []).map(conv => {
          const convMessages = messagesByConv[conv.id] || [];
          const transcript = convMessages.map(m => `${m.sender_type === 'human' ? brokerName : conv.lead_name}: ${m.message_text}`).join('\n');
          return `CONVERSA FALHOU:\nLead: ${conv.lead_name}\nOrigem: ${conv.conversation_origin || 'N/A'}\n${transcript}\n---`;
        }).join('\n\n');

        const prompt = `Coach de vendas. Analise e retorne JSON:\n\n${failedTexts}\n\n{"quality_score": 75, "severity": "medium", "errors": [{"type": "ignored_price", "description": "Não respondeu preço"}], "positives": ["Boa apresentação"], "summary": "Resumo"}`;

        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01'},
          body: JSON.stringify({model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }]}),
        });

        if (!claudeResponse.ok) throw new Error(`Claude API: ${claudeResponse.status} - ${await claudeResponse.text()}`);

        const claudeData = await claudeResponse.json();
        const responseText = claudeData.content[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');

        const analysis = JSON.parse(jsonMatch[0]);

        for (const item of items.slice(0, 5)) {
          const conv = failedConvs?.find(c => c.id === item.conversation_id);
          if (!conv) continue;

          await supabaseClient.from('ai_coach_analysis').insert({
            conversation_id: item.conversation_id,
            broker_id: brokerId,
            quality_score: analysis.quality_score,
            severity: analysis.severity || 'medium',
            errors: analysis.errors || [],
            positives: analysis.positives || [],
            summary: analysis.summary || '',
            conversation_origin: conv.conversation_origin,
          });

          await supabaseClient.from('ia_conversations').update({ coach_analyzed_at: new Date().toISOString(), coach_score: analysis.quality_score }).eq('id', item.conversation_id);
        }

        await supabaseClient.from('ai_coach_queue').update({ status: 'completed', processed_at: new Date().toISOString() }).in('id', items.map(i => i.id));
        processed += items.length;
      } catch (error: any) {
        await supabaseClient.from('ai_coach_queue').update({ status: 'failed', error_message: error.message, processed_at: new Date().toISOString() }).in('id', items.map(i => i.id));
        errors += items.length;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(JSON.stringify({ success: true, processed, errors }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});