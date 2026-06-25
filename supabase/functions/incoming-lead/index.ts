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
    // Lê o body como texto primeiro para melhor diagnóstico de erros
    const rawBody = await req.text().catch(() => '');
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Empty request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      try {
        // Facebook/Make às vezes envia newlines literais dentro de strings JSON.
        // Sanitiza: substitui quebras de linha/tabs RAW dentro de valores de string.
        const sanitized = rawBody.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
          match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        );
        payload = JSON.parse(sanitized);
        console.warn('[incoming-lead] JSON sanitizado (newlines em strings)');
      } catch (parseErr2) {
        console.error('[incoming-lead] JSON parse error. Body preview:', rawBody.substring(0, 300));
        return new Response(JSON.stringify({ error: 'Invalid JSON', preview: rawBody.substring(0, 200) }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'Payload must be a JSON object' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sourceData = payload.data?.attributes || payload.attributes || payload;
    const name = sourceData.name || sourceData.nome || sourceData.fullName || 'Lead Sem Nome';
    const rawPhone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact;
    // Remove prefixes like "p:" sent by some integrations (e.g. Facebook via Make)
    let phone = rawPhone ? String(rawPhone).replace(/^[a-z]+:/i, '').replace(/[^0-9+]/g, '') : null;
    // Normaliza pra formato Evolution: 55 + DDD + número (ex: 5511973334121)
    // Casos: "11973334121" (10-11d sem 55) → adiciona "55"; "+5511973334121" → remove "+"
    if (phone) {
      const onlyDigits = phone.replace(/^\+/, '');
      if (/^[1-9][1-9][0-9]{8,9}$/.test(onlyDigits)) {
        // Sem código país: DDD válido (10-11 dígitos) → prefixa 55
        phone = '55' + onlyDigits;
      } else if (/^55[1-9][1-9][0-9]{8,9}$/.test(onlyDigits)) {
        phone = onlyDigits;
      }
    }
    const email = sourceData.email || sourceData.mail || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem ||
                   sourceData.campaign || sourceData.campaign_name || sourceData.ad_name ||
                   sourceData.channel || sourceData.platform || '';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || '';
    const tag = sourceData.tag || sourceData.primary_tag || (Array.isArray(sourceData.tags) ? sourceData.tags[0] : null) || sourceData.interest || sourceData.source || sourceData.origin || sourceData.origem || '';

    // Campos MCMV opcionais — vêm do formulário do Facebook quando configurados
    // Não são obrigatórios: se o formulário não perguntar, simplesmente não chegam
    const rendaDeclarada: string | null =
      sourceData.renda_declarada || sourceData.renda || sourceData.income || null;

    const rawTipoTrabalho: string | null =
      sourceData.tipo_trabalho || sourceData.tipo_emprego || sourceData.employment_type || null;

    // Normaliza tipo de trabalho para os valores aceitos pelo sistema
    let tipoTrabalho: string | null = null;
    if (rawTipoTrabalho) {
      const normalized = rawTipoTrabalho.toUpperCase().trim();
      if (normalized.includes('CLT') || normalized.includes('CARTEIRA') || normalized.includes('EMPREGADO')) {
        tipoTrabalho = 'CLT';
      } else if (normalized.includes('AUTONOMO') || normalized.includes('AUTÔNOMO') || normalized.includes('LIBERAL')) {
        tipoTrabalho = 'AUTONOMO';
      } else if (normalized.includes('PUBLICO') || normalized.includes('PÚBLICO') || normalized.includes('SERVIDOR') || normalized.includes('ESTATUTARIO')) {
        tipoTrabalho = 'FUNCIONARIO_PUBLICO';
      }
    }

    // Converte renda declarada (texto livre) em faixa MCMV para roteamento de fila
    // Limites 2024: Faixa 1 ≤ 2.640 | Faixa 2 ≤ 4.400 | Faixa 3 ≤ 8.000 | Fora acima disso
    function calcFaixaMcmv(renda: string | null): string | null {
      if (!renda) return null;
      // Remove R$, pontos de milhar, espaços; troca vírgula decimal por ponto
      const clean = renda.replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
      const valor = parseFloat(clean);
      if (isNaN(valor) || valor <= 0) return null;
      if (valor <= 2640)  return 'FAIXA_1';
      if (valor <= 4400)  return 'FAIXA_2';
      if (valor <= 8000)  return 'FAIXA_3';
      return 'FORA';
    }
    const faixaMcmv: string | null = calcFaixaMcmv(rendaDeclarada);

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Lista branca de produtos/empreendimentos/regiões conhecidas — usada como
    // fallback quando o Make não envia o campo 'produto' explicitamente
    const KNOWN_PRODUCTS = [
      'BARRA_FUNDA','BARRA FUNDA','ZONA SUL','ZONA OESTE','ZONA NORTE','ZONA LESTE',
      'JAGUARE','JAGUARÉ','CARRAO','CARRÃO','GRANJA_JULIETA','GRANJA JULIETA',
      'LAPA','BUTANTA','BUTANTÃ','BUTANTTA','LEOPOLDINA','AGUA BRANCA','ÁGUA BRANCA',
      'PERDIZES','VILA OLIMPIA','MOEMA','TATUAPE','TATUAPÉ','PINHEIROS','SANTANA',
      'IPIRANGA','MOOCA','ANALIA FRANCO','LIBERDADE','PENHA','SAUDE','VILA MARIANA',
    ];
    const tagUpper = (tag || '').toString().toUpperCase();
    const productFromMake = (sourceData.produto || sourceData.product || '').toString();
    // Fallback: se Make não enviou produto, tenta extrair da tag se for nome conhecido
    const productInferred = !productFromMake && tagUpper
      ? (KNOWN_PRODUCTS.find(p => tagUpper.includes(p)) || '')
      : productFromMake;

    const leadValues: Record<string, string> = {
      tag:           (tag || '').toString(),
      source:        (origin || '').toString(),
      product:       productInferred,
      campaign:      (sourceData.campanha || sourceData.campaign || '').toString(), // 'campanha' = alias Make
      tipo_trabalho: (tipoTrabalho || '').toString(),  // CLT | AUTONOMO | FUNCIONARIO_PUBLICO
      faixa_mcmv:    (faixaMcmv || '').toString(),     // FAIXA_1 | FAIXA_2 | FAIXA_3 | FORA
    };

    // Log debug do payload bruto recebido (apenas chaves + tipos pra diagnóstico)
    // Útil pra investigar quando Make não manda 'produto' em algum fluxo.
    console.log('[incoming-lead] Payload keys:', Object.keys(sourceData || {}).join(','));
    console.log('[incoming-lead] product=' + productFromMake + ' tag=' + tag + ' inferred=' + productInferred);

    const { data: queues } = await supabase.from('distribution_queues').select('*').eq('is_active', true).order('created_at', { ascending: true });

    let chosenBroker: any = null;
    let chosenQueue: any = null;

    console.log('[MATCHING] Lead values:', leadValues);
    console.log('[MATCHING] Verificando filas...');
    
    if (queues && queues.length > 0) {
      console.log(`[MATCHING] Total de filas: ${queues.length}`);
      
      for (const q of queues) {
        console.log(`[MATCHING] Fila: ${q.name}, match_field: ${q.match_field}, match_value: ${q.match_value}`);
        
        if (!q.match_field || q.match_field === '*') {
          if (!chosenQueue) {
            console.log(`[MATCHING] Fila ${q.name} marcada como fallback`);
            chosenQueue = q;
          }
          continue;
        }
        
        const expected = (q.match_value || '').toString().trim().toUpperCase();
        const leadVal = (leadValues[q.match_field] || '').toString().trim().toUpperCase();
        
        console.log(`[MATCHING] Comparando campo "${q.match_field}": "${leadVal}" === "${expected}"`);
        
        if (expected && leadVal && expected === leadVal) {
          console.log(`[MATCHING] ✅ MATCH! Fila escolhida: ${q.name}`);
          chosenQueue = q;
          break;
        }
      }
    }

    console.log(`[MATCHING] Fila final: ${chosenQueue?.name || 'NENHUMA'}`);

    // ── Roteamento para Agente IA ─────────────────────────────────────────────
    // Se a fila configurada tem ai_agent_broker_id, o lead vai direto para o
    // agente IA em vez de um corretor humano via round-robin.
    if (chosenQueue?.ai_agent_broker_id) {
      const { data: aiAgent } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', chosenQueue.ai_agent_broker_id)
        .maybeSingle();
      if (aiAgent) {
        chosenBroker = aiAgent;
        console.log(`[incoming-lead] 🤖 Agente IA: ${aiAgent.first_name} (fila ${chosenQueue.name})`);
      }
    }

    // Round-robin otimista — só sobre ELEGÍVEIS (filtra lead_assignment_enabled).
    // Cluster de inativos no array não privilegia mais quem vem depois.
    if (!chosenQueue?.ai_agent_broker_id && chosenQueue && chosenQueue.broker_ids?.length > 0) {
      const isExclusive = chosenQueue.lock_after_assignment === true;

      // Pega o estado atual de todos os brokers da fila uma única vez
      const { data: queueBrokersAll } = await supabase
        .from('profiles')
        .select('*')
        .in('id', chosenQueue.broker_ids)
        .eq('role', 'BROKER');

      // Mantém a ORDEM original do broker_ids (pra round-robin determinístico)
      const orderedBrokers = (chosenQueue.broker_ids || [])
        .map((id: string) => (queueBrokersAll || []).find((b: any) => b.id === id))
        .filter(Boolean);

      // Elegíveis: ativos + lead_assignment_enabled=true (sempre respeita decisão do manager).
      // Antes ignorávamos lead_assignment_enabled em fila exclusiva — isso causava
      // atribuição a brokers desligados pelo manager. Agora trigger SQL impede esse caso
      // de qualquer forma. Se queue exclusiva tem broker único OFF, lead cai no fallback
      // ou fica órfão com alerta admin.
      const eligible = orderedBrokers.filter((b: any) =>
        b.is_active !== false && b.lead_assignment_enabled !== false
      );

      if (eligible.length === 0) {
        // Fila exclusiva de DONO ÚNICO: o lead é dele mesmo "ausente" — mantém com ele (não orfana/trava)
        if (isExclusive && (chosenQueue.broker_ids?.length === 1) && orderedBrokers[0]) {
          chosenBroker = orderedBrokers[0];
          console.log(`[DISTRIBUTION] Fila exclusiva de dono único — mantém com ${chosenBroker?.first_name} mesmo ausente`);
        } else {
          console.log(`[DISTRIBUTION] Nenhum broker elegível na fila ${chosenQueue.name} — caindo no fallback`);
        }
      } else {
        // Round-robin com optimistic lock — escolhe o corretor NATURAL, respeitando
        // a equipe/investimento de quem comprou o lead. O gate de chip vem DEPOIS.
        const maxAttempts = 5;
        for (let i = 0; i < maxAttempts; i++) {
          const { data: freshQ } = await supabase.from('distribution_queues').select('*').eq('id', chosenQueue.id).maybeSingle();
          if (!freshQ) break;
          const oldIndex = freshQ.last_assigned_index || 0;
          const idx = oldIndex % eligible.length;

          const { data: updated } = await supabase.from('distribution_queues')
            .update({ last_assigned_index: oldIndex + 1 })
            .eq('id', chosenQueue.id)
            .eq('last_assigned_index', oldIndex)
            .select()
            .maybeSingle();

          if (updated) {
            chosenBroker = eligible[idx];
            console.log(`[DISTRIBUTION] Round-robin (${eligible.length} elegíveis): ${chosenBroker?.first_name} (exclusiva=${isExclusive})`);
            break;
          }
          // Optimistic lock falhou — outro lead pegou esse índice. Tenta de novo.
        }

        // ── GATE DE CHIP (TEAM-SAFE): NUNCA muda a equipe do lead ───────────────
        // O corretor natural já foi escolhido (respeita o investimento da equipe).
        // Só se o chip DELE estiver morto, realoca pra um COLEGA DA MESMA EQUIPE com
        // chip vivo. Se nenhum colega de equipe tem chip vivo, MANTÉM o natural — o
        // lead espera o chip religar. NUNCA pula pra outra equipe.
        if (chosenBroker?.bot_instance_id) {
          const { data: ownChip } = await supabase
            .from('bot_instances').select('status, real_state')
            .eq('id', chosenBroker.bot_instance_id).maybeSingle();
          const ownAlive = ownChip && (ownChip.status === 'open' || ownChip.real_state === 'open');
          if (!ownAlive) {
            const sameTeam = eligible.filter((b: any) =>
              b.id !== chosenBroker.id && b.bot_instance_id &&
              ((chosenBroker.manager_id && b.manager_id === chosenBroker.manager_id) ||
               (chosenBroker.team_id && b.team_id === chosenBroker.team_id))
            );
            if (sameTeam.length > 0) {
              const ids = sameTeam.map((b: any) => b.bot_instance_id);
              const { data: chips } = await supabase
                .from('bot_instances').select('id, status, real_state').in('id', ids);
              const alive = new Set((chips || [])
                .filter((c: any) => c.status === 'open' || c.real_state === 'open')
                .map((c: any) => c.id));
              const liveColleague = sameTeam.find((b: any) => alive.has(b.bot_instance_id));
              if (liveColleague) {
                console.log(`[DISTRIBUTION] Gate team-safe: chip de ${chosenBroker.first_name} morto → colega ${liveColleague.first_name} (MESMA equipe)`);
                chosenBroker = liveColleague;
              } else {
                console.log(`[DISTRIBUTION] Gate team-safe: chip de ${chosenBroker.first_name} morto e nenhum colega de equipe vivo — mantém (não pula equipe)`);
              }
            }
          }
        }
      }
    }

    if (!chosenBroker && !chosenQueue?.ai_agent_broker_id) {
      // Fallback RESTRITO À FILA: todos os corretores da fila estavam ausentes.
      // Nunca busca corretores de outras filas/equipes — evita atribuição cruzada.
      if (chosenQueue && chosenQueue.broker_ids?.length > 0) {
        console.log(`[DISTRIBUTION] Fallback (fila ${chosenQueue.name}): todos ausentes — atribuindo ao corretor ATIVO com menos leads na fila`);
        const today = new Date().toISOString().split('T')[0];
        const { data: queueBrokers } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, phone, team_id, bot_instance_id, manager_id, automation_settings, evolution_instance, lead_assignment_enabled, is_active')
          .in('id', chosenQueue.broker_ids)
          .eq('role', 'BROKER')
          .eq('is_active', true)
          .eq('lead_assignment_enabled', true);

        if (queueBrokers && queueBrokers.length > 0) {
          const counts = await Promise.all(queueBrokers.map(async (b: any) => {
            const { count } = await supabase
              .from('leads')
              .select('id', { count: 'exact', head: true })
              .eq('broker_id', b.id)
              .gte('created_at', today + 'T00:00:00Z');
            return { broker: b, count: count || 0 };
          }));
          counts.sort((a: any, b: any) => a.count - b.count);
          chosenBroker = counts[0].broker;
          console.log(`[DISTRIBUTION] Fallback (fila) escolheu ${chosenBroker.first_name} (${counts[0].count} leads hoje)`);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const insertPayload: any = {
      name, phone, email,
      tag: tag || message || origin,
      status: 'NEW',
      source: 'facebook_make',
      last_interaction_at: nowIso,
      created_at: nowIso,
      received_at: nowIso,
      // Travar redistribuição se: (a) fila de agente IA OU (b) fila exclusiva OU (c) payload traz exclusiva=true
      no_redistribute: chosenQueue?.ai_agent_broker_id != null || chosenQueue?.lock_after_assignment === true || sourceData.exclusiva === true,
      // Campos MCMV opcionais (só incluídos se vieram no payload)
      ...(rendaDeclarada  ? { renda_declarada:  rendaDeclarada  } : {}),
      ...(tipoTrabalho    ? { tipo_trabalho:    tipoTrabalho    } : {}),
      // Produto vem do Make/Facebook (alias 'produto' ou 'product')
      ...(leadValues.product ? { product: leadValues.product } : {}),
      // CAPI: grava campanha/page no PRÓPRIO lead (durável) — webhook_logs morre em 3d
      // e o comandra-capi precisa resolver o pixel dias depois (qualificação/visita/venda)
      ...(leadValues.campaign ? { fb_campaign: leadValues.campaign } : {}),
      ...((sourceData.page_id || sourceData.pageId || sourceData.page) ? { fb_page_id: String(sourceData.page_id || sourceData.pageId || sourceData.page) } : {}),
      // Agente IA: marca o lead para qualificação automática
      ...(chosenQueue?.ai_agent_broker_id ? { ai_qualification_queue_id: chosenQueue.id } : {}),
    };

    if (chosenBroker) insertPayload.broker_id = chosenBroker.id;

    const { data: newLead, error: insertError } = await supabase.from('leads').insert(insertPayload).select().single();
    if (insertError) throw insertError;

    // ── Cria estado inicial do lead ────────────────────────────────────────
    try {
      await supabase.rpc('upsert_lead_state', {
        p_lead_id:        newLead.id,
        p_intencao:       'sem_info',
        p_tema:           'sem_info',
        p_momento:        'explorando',
        p_ultimo_evento:  'lead_criado',
        p_modo:           'automatico',
        p_proxima_acao:   'aguardar',
        p_bloqueado:      false,
        p_atualizado_por: 'incoming_lead',
      });
    } catch {} // não bloqueia se tabela ainda não existir

    await supabase.from('distribution_logs').insert({
      lead_name: name,
      lead_phone: phone,
      assigned_to_name: chosenBroker ? `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() : null,
      queue_name: chosenQueue ? chosenQueue.name : 'FALLBACK',
      status: 'SUCCESS'
    });

    // ALERTA: lead sem corretor atribuído
    if (!chosenBroker) {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['ADMIN', 'SUPERINTENDENT']);
      if (admins?.length > 0) {
        await supabase.from('internal_notifications').insert(
          admins.map((a: any) => ({
            to_id: a.id,
            type: 'LEAD_NO_BROKER',
            title: '⚠️ Lead sem corretor atribuído',
            message: `${name} (${phone}) chegou mas não foi atribuído a nenhum corretor. Verifique as filas de distribuição.`,
            related_lead_id: newLead.id,
          }))
        );
      }
    }

    // NOTIFICAR CORRETOR via bot do manager
    // Hierarquia ESTRITA: 1) bot do gerente → 2) Junior (superintendente/backup)
    // Nunca usa bot de equipe, busca por nome, ou bot de outro corretor.
    // Agentes IA não recebem notificação — eles são acionados pelo followup_scheduler.
    let notificationSent = false;
    if (chosenBroker?.phone && !insertPayload.ai_qualification_queue_id) {
      const { data: setting } = await supabase.from('system_settings').select('value').eq('key', 'notify_brokers_enabled').maybeSingle();

      if (setting?.value === true || setting?.value === "true" || setting?.value === 1) {
        let notifBotId: string | null = null;
        let notifSource = '';

        // 1. Bot do gerente direto — ÚNICO autorizado a notificar sua equipe
        if (chosenBroker.manager_id) {
          const { data: managerProfile } = await supabase
            .from('profiles')
            .select('bot_instance_id')
            .eq('id', chosenBroker.manager_id)
            .maybeSingle();
          notifBotId = managerProfile?.bot_instance_id ?? null;
          if (notifBotId) notifSource = 'gerente';
        }

        // 2. Backup: Junior (superintendente) — só se gerente não tiver bot configurado
        if (!notifBotId) {
          const { data: backupSetting } = await supabase
            .from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
          notifBotId = backupSetting?.value ?? null;
          if (notifBotId) notifSource = 'superintendente_backup';
        }

        console.log(`[incoming-lead] Bot notif: ${notifSource || 'nenhum'} (${notifBotId || 'null'})`);

        if (notifBotId) {
          const originLabel = origin || tag || 'Sem origem';
          const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';

          // ── HANDOFF INTELIGENTE: gera briefing com IA ─────────────────
          const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
          // Linha de qualificação MCMV se disponível
          const tipoTrabalhoLabel = tipoTrabalho === 'CLT' ? 'CLT' : tipoTrabalho === 'AUTONOMO' ? 'Autônomo' : tipoTrabalho === 'FUNCIONARIO_PUBLICO' ? 'Func. Público' : null;
          const mcmvLine = [
            rendaDeclarada      ? `💰 Renda: *${rendaDeclarada}*` : '',
            tipoTrabalhoLabel   ? `💼 ${tipoTrabalhoLabel}` : '',
          ].filter(Boolean).join(' · ');

          // Mensagem base — SEM telefone (corretor deve entrar no sistema)
          let notifMsg = [
            `🎯 *Novo lead para você!*`,
            ``,
            `👤 *${name}*`,
            `🏷️ ${tag || originLabel}`,
            mcmvLine || '',
            ``,
            `📲 *Entre no sistema para ver o contato e enviar mensagem:*`,
            appUrl,
            ``,
            `⏰ Atenda rápido — leads que esperam mais de 5 min convertem muito menos.`,
          ].filter(l => l !== null && l !== undefined).join('\n');

          if (geminiKey && (message || tag || origin)) {
            try {
              const context = [
                message ? `Mensagem do lead: "${message}"` : '',
                tag     ? `Tag/interesse: ${tag}` : '',
                origin  ? `Origem: ${origin}` : '',
              ].filter(Boolean).join('\n');

              const geminiResp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: context }] }],
                    systemInstruction: { parts: [{ text:
                      `Você analisa leads de imóveis MCMV (Minha Casa Minha Vida) e gera um briefing CURTO para o corretor agir.
Responda APENAS em JSON válido, sem markdown, sem explicação:
{
  "intencao": "quente|morno|frio",
  "tema": "preco|entrada|localizacao|documentacao|sem_info",
  "momento": "explorando|comparando|decidido",
  "objecao": "texto curto da objeção provável ou null",
  "abertura": "texto da mensagem de abertura sugerida para o corretor enviar"
}`
                    }] },
                    generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
                  }),
                }
              );
              const geminiJson = await geminiResp.json();
              const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
              const briefing = JSON.parse(rawText.replace(/```json|```/g, '').trim());

              const intencaoEmoji = briefing.intencao === 'quente' ? '🔥' : briefing.intencao === 'morno' ? '🟡' : '🔵';
              const temaLabel: Record<string,string> = { preco:'Preço/Parcela', entrada:'Valor de entrada', localizacao:'Localização', documentacao:'Documentação', sem_info:'Geral' };

              notifMsg = [
                `🎯 *Novo lead — Briefing IA*`,
                ``,
                `👤 *${name}*`,
                `🏷️ ${tag || 'Sem tag'} · 📍 ${originLabel}`,
                mcmvLine || '',
                ``,
                `📊 *Análise:*`,
                `${intencaoEmoji} Intenção: *${briefing.intencao}*`,
                `💬 Tema: ${temaLabel[briefing.tema] || briefing.tema}`,
                `🧠 Momento: ${briefing.momento}`,
                briefing.objecao ? `⚠️ Objeção provável: ${briefing.objecao}` : '',
                ``,
                `💡 *Abertura sugerida:*`,
                `_"${briefing.abertura}"_`,
                ``,
                `📲 *Entre no sistema para ver o contato:*`,
                appUrl,
              ].filter(l => l !== null && l !== undefined && l !== '').join('\n');

              // Salva classificação no lead_state
              try {
                await supabase.rpc('upsert_lead_state', {
                  p_lead_id:        newLead.id,
                  p_intencao:       briefing.intencao,
                  p_tema:           briefing.tema,
                  p_momento:        briefing.momento,
                  p_ultimo_evento:  'handoff_gerado',
                  p_atualizado_por: 'handoff_ia',
                });
              } catch {}

            } catch (e: any) {
              console.warn('[incoming-lead] Handoff IA falhou, usando mensagem simples:', e.message);
            }
          }

          const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
            body: {
              botId: notifBotId,
              phone: chosenBroker.phone,
              message: notifMsg,
            }
          });

          notificationSent = result?.success || false;
          console.log(`[incoming-lead] Notificação corretor ${chosenBroker.first_name} via bot ${notifBotId}: ${notificationSent}`);

          // Se WhatsApp falhou: notificação interna no app
          if (!notificationSent) {
            const motivo = notifSource === 'gerente'
              ? 'Bot do gerente falhou. Verifique a conexão da instância.'
              : notifBotId
                ? 'Bot do superintendente (backup) também falhou.'
                : 'Corretor sem gerente configurado e sem bot backup disponível.';
            console.warn(`[incoming-lead] WhatsApp falhou para ${chosenBroker.first_name}: ${motivo}`);
            try {
              await supabase.from('internal_notifications').insert({
                to_id: chosenBroker.id,
                type: 'NEW_LEAD',
                title: '🎯 Novo Lead atribuído',
                message: `${name} (${phone}) chegou para você. ${motivo}`,
                related_lead_id: newLead.id,
              });
            } catch (_) { /* swallow — não quebra o webhook do Make */ }
          }
        }
      }
    }

    // BOAS-VINDAS PARA LEAD
    // Leads de agente IA não recebem boas-vindas aqui — o agente-qualificacao-ia
    // envia a primeira mensagem com seu próprio chip.
    let welcomeSent = false;
    if (chosenBroker?.automation_settings?.welcome_enabled && chosenBroker.bot_instance_id && !insertPayload.ai_qualification_queue_id) {
      let text = `Olá ${name}! 👋\n\nObrigado pelo interesse!`;
      let usedTemplateId: string | null = null;

      const { data: templates } = await supabase.from('welcome_templates').select('*').eq('is_active', true);
      if (templates?.length > 0) {
        const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('broker_id', chosenBroker.id);
        const idx = (count || 0) % templates.length;
        const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
        text = (templates[idx].message || '')
          .replace(/\\n/g, '\n')
          .replace(/\{nome\}/gi, name)
          .replace(/\{broker\}/gi, brokerName);
        usedTemplateId = templates[idx].id;
      }

      // Pré-cria conversa pra que send_whatsapp_message logue em ia_messages.
      // Welcome aparece no histórico do lead, A/B Lab traceia métricas dos
      // welcome_templates (sent/responded/qualified) e Coach IA avalia a abertura.
      const { data: newConv } = await supabase.from('ia_conversations').insert({
        bot_instance_id: chosenBroker.bot_instance_id,
        lead_id: newLead.id,
        lead_name: name,
        lead_phone: phone,
        status: 'active',
        sentiment: 'unknown',
        is_crm_lead: true,
        template_id: usedTemplateId,
        template_kind: usedTemplateId ? 'welcome' : null,
      }).select('id').single();

      const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
        body: {
          botId: chosenBroker.bot_instance_id,
          phone: phone,
          message: text,
          conversationId: newConv?.id,
          send_source: 'welcome',  // não conta no cap, não dispara blocklist em opt-out
        }
      });

      welcomeSent = result?.success || false;

      // Mantém entry no automation_logs pra compat com queries existentes
      // (Runbook 14 do sistema-doctor depende desse entity_type pra diagnóstico)
      await supabase.from('automation_logs').insert({
        entity_type: 'welcome', entity_id: newLead.id,
        status: welcomeSent ? 'success' : 'failed',
        message_sent: text, recipient_phone: phone,
        error_message: welcomeSent ? null : ((result as any)?.skipped || (result as any)?.error || 'falha ao enviar via send_whatsapp_message'),
      }).then(() => {}, () => {});

      // Registra qual template foi usado e atualiza stats
      if (welcomeSent && usedTemplateId) {
        await supabase
          .from('leads')
          .update({ welcome_template_id: usedTemplateId })
          .eq('id', newLead.id);
        await supabase.rpc('record_welcome_template_sent', { p_template_id: usedTemplateId });
      }

      // ── CÉREBRO: cria fila de ativação se habilitado ──────────────────────
      if (welcomeSent) {
        const { data: cerebroCfg } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'cerebro_enabled')
          .maybeSingle();

        if (cerebroCfg?.value === true || cerebroCfg?.value === 'true') {
          const t = Date.now();
          await supabase.from('lead_activation_queue').insert([
            { lead_id: newLead.id, action_type: 'toque_1',    scheduled_for: new Date(t +  3 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'toque_2',    scheduled_for: new Date(t +  5 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'sentinela',  scheduled_for: new Date(t +  8 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'last_chance', scheduled_for: new Date(t + 24 * 3600000).toISOString() },
          ]);
          console.log(`[incoming-lead] Fila Cérebro criada para lead ${newLead.id}`);
        }
      }
    }

    // Log do webhook recebido (visível em Admin/Pipeline/Logs/Webhooks)
    // Inclui payload completo do Make pra debug — útil pra ver qual fluxo manda
    // 'produto' explicitamente e qual não.
    try {
      await supabase.from('webhook_logs').insert({
        integration_key: 'make',
        payload: {
          name, phone, email, tag, origin,
          product_from_make: productFromMake,
          product_inferred: productInferred,
          raw_keys: Object.keys(sourceData || {}),
          raw_payload: sourceData,
        },
        status_code: 200,
        response_body: JSON.stringify({ lead_id: newLead.id, broker: chosenBroker?.first_name || null, queue: chosenQueue?.name || 'FALLBACK' }),
      });
    } catch (_) { /* fire-and-forget — log é best-effort */ }

    return new Response(JSON.stringify({
      success: true,
      lead: newLead,
      notification_sent: notificationSent,
      welcome_sent: welcomeSent
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[incoming-lead] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
