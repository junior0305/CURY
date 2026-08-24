import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function classifyLead(
  geminiKey: string,
  leadName: string,
  leadTag: string,
  leadSource: string,
  messages: { direction: string; message_text: string }[]
): Promise<{ intencao: string; tema: string; momento: string } | null> {
  try {
    const history = messages.length > 0
      ? messages.map(m => `[${m.direction === 'incoming' ? 'LEAD' : 'IA'}] ${m.message_text}`).join('\n')
      : '';

    const context = [
      `Lead: ${leadName}`,
      leadTag    ? `Tag: ${leadTag}`       : '',
      leadSource ? `Origem: ${leadSource}` : '',
      history    ? `\nConversa:\n${history}` : '',
    ].filter(Boolean).join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: context }] }],
          systemInstruction: { parts: [{ text:
            `Analise os dados de um lead de imóvel MCMV e classifique.\nResponda APENAS em JSON válido, sem markdown, sem explicação:\n{"intencao":"quente|morno|frio","tema":"preco|entrada|localizacao|documentacao|sem_info","momento":"explorando|comparando|decidido|sumiu"}\nSe não houver informação suficiente, use "morno", "sem_info", "explorando".`
          }] },
          generationConfig: { maxOutputTokens: 80, temperature: 0.1 },
        }),
      }
    );

    const json = await resp.json();
    const raw  = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';

  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY não configurada' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize  = Math.min(body.batch ?? 50, 100);
    const onlyStale  = body.only_stale !== false;

    const { data: leadsWithoutState } = await supabase
      .from('leads')
      .select('id, name, tag, source')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .not('broker_id', 'is', null)
      .limit(batchSize * 2);

    if (!leadsWithoutState?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_active_leads' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leadIds = leadsWithoutState.map(l => l.id);
    const { data: existingStates } = await supabase
      .from('lead_state')
      .select('lead_id, intencao')
      .in('lead_id', leadIds);

    const stateMap = new Map((existingStates || []).map(s => [s.lead_id, s.intencao]));

    const toClassify = leadsWithoutState
      .filter(l => {
        const state = stateMap.get(l.id);
        if (!state) return true;
        if (onlyStale && state === 'sem_info') return true;
        return false;
      })
      .slice(0, batchSize);

    if (!toClassify.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'all_classified' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let classified = 0, failed = 0;
    const results: any[] = [];

    for (const lead of toClassify) {
      try {
        const { data: conv } = await supabase
          .from('ia_conversations')
          .select('id')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let messages: any[] = [];
        if (conv?.id) {
          const { data: msgs } = await supabase
            .from('ia_messages')
            .select('direction, message_text')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(8);
          messages = (msgs || []).reverse();
        }

        const cls = await classifyLead(geminiKey, lead.name, lead.tag, lead.source, messages);
        if (!cls) { failed++; continue; }

        await supabase.rpc('upsert_lead_state', {
          p_lead_id:        lead.id,
          p_intencao:       cls.intencao,
          p_tema:           cls.tema,
          p_momento:        cls.momento,
          p_ultimo_evento:  'classificacao_retroativa',
          p_atualizado_por: 'agente_classificacao',
        });

        classified++;
        results.push({ lead: lead.name, ...cls });
      } catch (e: any) {
        failed++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(
      JSON.stringify({ classified, failed, total: toClassify.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
