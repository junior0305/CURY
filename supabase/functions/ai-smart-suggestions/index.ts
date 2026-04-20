import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── LLM helpers ──────────────────────────────────────────────────────────────

async function callAnthropicAPI(apiKey: string, model: string, maxTokens: number, system: string, messages: {role:string;content:string}[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key': apiKey, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.content?.[0]?.text || '';
}

async function callOpenAIAPI(apiKey: string, model: string, maxTokens: number, system: string, messages: {role:string;content:string}[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{role:'system',content:system},...messages] }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

async function callGeminiAPI(apiKey: string, model: string, maxTokens: number, system: string, messages: {role:string;content:string}[]): Promise<string> {
  const fullPrompt = system + '\n\n' + messages.map(m=>`${m.role === 'user' ? 'Corretor' : 'Coach'}: ${m.content}`).join('\n');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ contents:[{parts:[{text:fullPrompt}]}], generationConfig:{maxOutputTokens:maxTokens} }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLLM(supabaseAdmin: ReturnType<typeof createClient>, system: string, messages: {role:string;content:string}[]): Promise<string> {
  const { data: configs } = await supabaseAdmin
    .from('ai_coach_llm_config')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const OPENAI_KEY    = Deno.env.get('OPENAI_API_KEY') || '';
  const GEMINI_KEY    = Deno.env.get('GEMINI_API_KEY') || '';

  const providers = configs && configs.length > 0 ? configs : [
    { provider: 'anthropic', model_name: 'claude-haiku-4-5-20251001', max_tokens: 1024 },
  ];

  for (const cfg of providers) {
    try {
      if (cfg.provider === 'anthropic' && ANTHROPIC_KEY)
        return await callAnthropicAPI(ANTHROPIC_KEY, cfg.model_name, cfg.max_tokens ?? 1024, system, messages);
      if (cfg.provider === 'openai' && OPENAI_KEY)
        return await callOpenAIAPI(OPENAI_KEY, cfg.model_name, cfg.max_tokens ?? 1024, system, messages);
      if (cfg.provider === 'gemini' && GEMINI_KEY)
        return await callGeminiAPI(GEMINI_KEY, cfg.model_name, cfg.max_tokens ?? 1024, system, messages);
    } catch (err) {
      console.error(`LLM ${cfg.provider} falhou:`, err);
    }
  }
  throw new Error('Nenhum provedor de IA disponível no momento.');
}

// ── Status labels ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string,string> = {
  NEW:'Novo (sem contato)',
  IN_PROGRESS:'Em Atendimento',
  NEGOTIATING:'Em Negociação',
  VISIT_SCHEDULED:'Visita Agendada',
  VISITA_REALIZADA:'Veio à Visita',
  DOCS_REQUESTED:'Documentação Solicitada',
  CONCLUDED:'Venda Fechada',
  FOLLOW_UP_AUTO:'Follow-up Automático (bot)',
  REACTIVATED:'Lead Reativado',
  ABANDONED:'Encerrado',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { leadId, brokerId, tactic, mode, messages: chatHistory } = body;

    // ── Buscar dados do lead ──────────────────────────────────────────────────
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads').select('*').eq('id', leadId).single();
    if (leadError) throw new Error(`Lead não encontrado: ${leadError.message}`);

    const { data: broker } = await supabaseAdmin
      .from('profiles').select('first_name,last_name').eq('id', brokerId).single();

    const name       = (lead.name || 'Cliente').split(' ')[0];
    const produto    = lead.tag || lead.campaign || 'Minha Casa Minha Vida';
    const lastInt    = new Date(lead.last_interaction_at || lead.created_at).getTime();
    const hoursStale = (Date.now() - lastInt) / 3_600_000;
    const tentativas = lead.contact_attempts || 0;
    const brokerName = broker ? `${broker.first_name || ''} ${broker.last_name || ''}`.trim() : 'Corretor';
    const statusLabel = STATUS_LABEL[lead.status] || lead.status;

    // ════════════════════════════════════════════════════════════════════════
    // MODO COACH — análise detalhada + chat com LLM real
    // ════════════════════════════════════════════════════════════════════════
    if (mode === 'coach') {
      const system = `Você é um coach especialista em vendas imobiliárias populares (Minha Casa Minha Vida).
Ajude o corretor ${brokerName} a fechar mais vendas com o lead abaixo.
Seja direto, prático e objetivo. Use linguagem simples. Responda em português brasileiro.

CONTEXTO DO LEAD:
- Nome: ${lead.name}
- Status atual: ${statusLabel}
- Tempo sem interação: ${hoursStale < 1 ? `${Math.round(hoursStale*60)} minutos` : `${hoursStale.toFixed(1)} horas`}
- Tentativas de contato: ${tentativas}
- Renda declarada: ${lead.renda_declarada ? `R$ ${lead.renda_declarada}` : 'Não informada'}
- Campanha/Produto: ${produto}
- Qualificação MCMV: ${lead.faixa_mcmv || 'Não analisada'}

Quando o corretor pedir análise geral, responda com:
1. 📊 NOTA DA ABORDAGEM (0-10) com 1 frase explicando
2. ✅ PONTOS POSITIVOS (2-3 bullets)
3. 🚀 PONTOS DE MELHORIA (2-3 bullets específicos e acionáveis)
4. 🎯 PRÓXIMO PASSO (1 ação concreta para fazer agora)

Para perguntas específicas, responda diretamente e de forma prática.`;

      const msgs: {role:string;content:string}[] = chatHistory && chatHistory.length > 0
        ? chatHistory
        : [{ role: 'user', content: 'Analise a situação deste lead e me dê um relatório completo com pontos de melhoria.' }];

      const answer = await callLLM(supabaseAdmin, system, msgs);

      return new Response(JSON.stringify({ success:true, mode:'coach', answer }), {
        headers: { ...corsHeaders, 'Content-Type':'application/json' }, status:200,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODO PADRÃO — templates por status (mensagem pronta para envio)
    // ════════════════════════════════════════════════════════════════════════
    let approach = '';
    let message  = '';
    let reason   = '';

    if (tactic) {
      switch (tactic) {
        case 'SCARCITY':
          approach = 'Gatilho de Escassez (FOMO)';
          message  = `${name}, preciso ser muito rápido com você. 🚨 Restam apenas 2 unidades nessa prumada. A tabela de preços vira em 48h. Se não reservarmos agora, o valor vai subir. Consegue falar agora?`;
          reason   = 'O medo de perder (FOMO) é o motivador mais forte para indecisos.';
          break;
        case 'LOSS_AVERSION':
          approach = 'Aversão à Perda';
          message  = `${name}, estou segurando a condição especial para você até às 18h. Se não validarmos sua proposta, infelizmente o sistema volta ao preço de mercado. Vamos formalizar para não perder isso?`;
          reason   = 'As pessoas lutam mais para não perder do que para ganhar algo novo.';
          break;
        case 'AUTHORITY':
          approach = 'Autoridade / Prova Social';
          message  = `${name}, acabei de sair de uma reunião com a diretoria. Aprovei esse fluxo para outros 2 clientes hoje. Se enviar sua ficha agora, consigo incluir no mesmo lote aprovado. Me dá um ok?`;
          reason   = 'Transferir a decisão para uma autoridade superior valida a compra.';
          break;
      }
    } else {
      switch (lead.status) {
        case 'NEW':
          if (hoursStale < 1) {
            approach = 'Impacto Imediato (Speed-to-Lead)';
            message  = `Olá ${name}! ⚡️ Acabei de receber seu interesse no ${produto}. Estou separando as plantas agora. Prefere que eu te mande o Book Completo ou um vídeo rápido do decorado?`;
            reason   = 'Nos primeiros minutos o lead está com o celular na mão. Ofereça opções A ou B para forçar micro-conversão.';
          } else {
            approach = 'Resgate de Atenção';
            message  = `Oi ${name}, tentei te ligar mais cedo sobre o ${produto}. Muita gente pensa que a entrada é alta, mas fiz uma simulação surpreendente aqui. Posso te mandar o valor da parcela?`;
            reason   = 'Se o lead esfriou, use curiosidade financeira para reativar o interesse.';
          }
          break;
        case 'REACTIVATED':
          approach = 'Reativação Quente';
          message  = `Olá ${name}! Tudo bem? Vi que você nos contactou novamente — que ótimo! Estou aqui agora para te ajudar. O que mudou desde a última vez que conversamos?`;
          reason   = 'Lead reativado está quente. Abordagem pessoal e curiosa reabre o diálogo.';
          break;
        case 'IN_PROGRESS':
          if (hoursStale > 48) {
            approach = 'Quebra de Silêncio (Ghosting)';
            message  = `${name}, sinceramente: o que te impediu de avançarmos no ${produto}?\n1) Não gostou da localização?\n2) O valor ficou acima?\n3) Ainda está pensando?\nMe responde com o número — prometo que ajuda!`;
            reason   = 'Para leads que sumiram, múltipla escolha reduz a barreira cognitiva de resposta.';
          } else {
            approach = 'Aprofundamento de Necessidade';
            message  = `${name}, pensando no que você me falou... você prioriza mais a localização ou o tamanho? Tenho uma unidade específica no ${produto} que atende exatamente um desses pontos.`;
            reason   = 'Faça perguntas consultivas para qualificar e tirar o lead do automático.';
          }
          break;
        case 'NEGOTIATING':
          approach = 'Avanço da Negociação';
          message  = `${name}, como está indo? Queria confirmar os próximos passos. O que falta para você se sentir seguro para avançar?`;
          reason   = 'Em negociação, identifique a última objeção e resolva ela diretamente.';
          break;
        case 'VISIT_SCHEDULED':
          if (hoursStale < 24) {
            approach = 'Ancoragem de Expectativa';
            message  = `Tudo confirmado, ${name}! ✅ Separei um material exclusivo para te entregar na nossa visita. Ah, consegui a chave daquela unidade com a vista livre. Você vai gostar!`;
            reason   = 'Crie um compromisso psicológico oferecendo algo que ele só ganha se aparecer.';
          } else {
            approach = 'Confirmação Simples';
            message  = `Oi ${name}, passando só para deixar meu contato fácil para nossa visita amanhã. Se precisar de localização, é só chamar. Até lá!`;
            reason   = 'Não pergunte "se" ele vai. Assuma que vai e se coloque à disposição.';
          }
          break;
        case 'VISITA_REALIZADA':
          approach = 'Fechamento Pós-Visita';
          message  = `${name}, que bom que você veio! Para darmos o próximo passo, vou te enviar a lista de documentos — é simples e te ajudo em cada etapa. Quando posso mandar?`;
          reason   = 'Pós-visita é o momento de maior calor. Solicite documentos enquanto a experiência está fresca.';
          break;
        case 'DOCS_REQUESTED':
          if (hoursStale > 24) {
            approach = 'Urgência de Escassez';
            message  = `${name}, meu gerente avisou que a tabela vai virar na segunda. 🚨 Precisamos do seu RG e Comp. de Residência ainda hoje para travar o valor. Consegue me mandar foto agora?`;
            reason   = 'Na etapa de documentos, FOMO com prazo externo acelera a entrega.';
          } else {
            approach = 'Facilitação Burocrática';
            message  = `${name}, vi que falta só o RG. Não precisa escanear — uma foto legível do celular mesmo já serve. Manda aqui que cuido do resto!`;
            reason   = 'Remova a fricção. O cliente trava por achar que precisa de algo formal.';
          }
          break;
        case 'CONCLUDED':
          approach = 'Pós-Venda e Indicação';
          message  = `Parabéns de novo pela conquista, ${name}! 🥂 Foi um prazer fazer parte disso. Você tem algum amigo ou familiar que também está buscando? Tenho uma condição especial para indicações suas.`;
          reason   = 'O melhor momento para pedir indicação é na euforia da compra.';
          break;
        default:
          approach = 'Reativação Genérica';
          message  = `Olá ${name}, faz tempo que não nos falamos sobre o ${produto}. O mercado mudou bastante. Ainda faz sentido pra você investir em imóveis agora?`;
          reason   = 'Takeaway — tirar a oferta da mesa faz o cliente responder para não perder.';
      }
    }

    return new Response(JSON.stringify({ success:true, approach, message, reason }), {
      headers: { ...corsHeaders, 'Content-Type':'application/json' }, status:200,
    });

  } catch (error: any) {
    console.error('ai-smart-suggestions error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type':'application/json' }, status:400,
    });
  }
})
