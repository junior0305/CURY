import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // DEBUG: Mostrar primeiros caracteres da chave
    console.log('[DEBUG] API Key status:', ANTHROPIC_API_KEY ? `LOADED (starts: ${ANTHROPIC_API_KEY.substring(0, 10)}...)` : 'EMPTY - NOT LOADED!');
    
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: queue } = await supabaseClient
      .from('ai_coach_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .limit(50);

    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ message: 'No conversations', processed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let processed = 0;
    let errors = 0;

    const byBroker: Record<string, any[]> = {};
    for (const item of queue) {
      if (!byBroker[item.broker_id]) byBroker[item.broker_id] = [];
      byBroker[item.broker_id].push(item);
    }

    for (const [brokerId, items] of Object.entries(byBroker)) {
      try {
        const sampleItems = items.slice(0, 3);
        await supabaseClient.from('ai_coach_queue').update({ status: 'processing' }).in('id', sampleItems.map(i => i.id));

        const { data: broker } = await supabaseClient.from('profiles').select('first_name, full_name, email').eq('id', brokerId).single();
        const brokerName = broker?.first_name || broker?.full_name || 'Corretor';

        const convIds = sampleItems.map(i => i.conversation_id);
        const { data: convs } = await supabaseClient.from('ia_conversations').select('*').in('id', convIds);
        const { data: messages } = await supabaseClient.from('ia_messages').select('*').in('conversation_id', convIds).order('created_at', { ascending: true });

        const messagesByConv: Record<string, any[]> = {};
        (messages || []).forEach(m => {
          if (!messagesByConv[m.conversation_id]) messagesByConv[m.conversation_id] = [];
          messagesByConv[m.conversation_id].push(m);
        });

        const brokerTypes = ['human', 'broker', 'agent'];
        const validConvs: any[] = [];
        for (const conv of (convs || [])) {
          const convMessagesAll = messagesByConv[conv.id] || [];
          const leadCount = convMessagesAll.filter(m => (m.sender_type || '').toLowerCase() === 'lead').length;
          const brokerCount = convMessagesAll.filter(m => brokerTypes.includes(((m.sender_type||'').toLowerCase()))).length;

          if (leadCount === 0) {
            await supabaseClient.from('ai_coach_queue').update({ status: 'skipped', processed_at: new Date().toISOString(), error_message: 'No lead messages' }).eq('conversation_id', conv.id).eq('broker_id', brokerId);
            continue;
          }

          if (brokerCount > leadCount * 3) {
            await supabaseClient.from('ai_coach_queue').update({ status: 'skipped', processed_at: new Date().toISOString(), error_message: 'Likely private conversation (broker-dominant)' }).eq('conversation_id', conv.id).eq('broker_id', brokerId);
            continue;
          }

          validConvs.push(conv);
        }

        if (validConvs.length === 0) continue;

        const failedTexts = validConvs.map(conv => {
          const convMessages = messagesByConv[conv.id] || [];
          const filtered = convMessages.filter(m => {
            const t = (m.sender_type || '').toLowerCase();
            return t === 'lead' || t === 'ia' || t === 'human' || t === 'broker' || t === 'agent';
          });
          const transcript = filtered.map(m => `${(m.sender_type || '').toLowerCase() === 'lead' ? conv.lead_name : brokerName}: ${m.message_text}`).join('\n');
          return `CONVERSA:\nLead: ${conv.lead_name}\nOrigem: ${conv.conversation_origin || 'N/A'}\n${transcript}\n---`;
        }).join('\n\n');

        const prompt = `Você é um coach de vendas. Leia as conversas abaixo e retorne um JSON com: quality_score (0-100), severity (low|medium|high), errors (array de {type, description}), positives (array), summary (string).\n\n${failedTexts}\n\nRetorne apenas o JSON.`;

        console.log('[DEBUG] Calling Claude API...');
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
        });

        console.log('[DEBUG] Claude API response status:', claudeRes.status);

        if (!claudeRes.ok) {
          const text = await claudeRes.text().catch(() => '');
          console.log('[DEBUG] Claude API error response:', text);
          throw new Error(`Claude API error: ${claudeRes.status} ${text}`);
        }

        const claudeJson = await claudeRes.json();
        const responseText = claudeJson.content?.[0]?.text || claudeJson.message || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Claude response');
        const analysis = JSON.parse(jsonMatch[0]);

        for (const item of sampleItems) {
          const conv = (convs || []).find((c: any) => c.id === item.conversation_id);
          if (!conv) {
            await supabaseClient.from('ai_coach_queue').update({ status: 'failed', error_message: 'Conversation not found', processed_at: new Date().toISOString() }).eq('id', item.id);
            errors++;
            continue;
          }

          if (!validConvs.find(vc => vc.id === conv.id)) continue;

          await supabaseClient.from('ai_coach_analysis').insert({
            conversation_id: item.conversation_id,
            broker_id: brokerId,
            quality_score: analysis.quality_score || null,
            severity: analysis.severity || null,
            errors: analysis.errors || [],
            positives: analysis.positives || [],
            summary: analysis.summary || '',
            conversation_origin: conv?.conversation_origin || null,
          });

          await supabaseClient.from('ia_conversations').update({ coach_analyzed_at: new Date().toISOString(), coach_score: analysis.quality_score || null }).eq('id', item.conversation_id);
          await supabaseClient.from('ai_coach_queue').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', item.id);
          processed++;
        }
      } catch (error: any) {
        console.error('[ai_coach_processor] error for broker', brokerId, error.message);
        await supabaseClient.from('ai_coach_queue').update({ status: 'failed', error_message: error.message, processed_at: new Date().toISOString() }).in('id', items.map(i => i.id));
        errors += items.length;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(JSON.stringify({ success: true, processed, errors }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[ai_coach_processor] fatal', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
