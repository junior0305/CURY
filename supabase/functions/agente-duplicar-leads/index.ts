// agente-duplicar-leads — replica leads parados >100h pra brokers no pool.
// Cron 5x/dia (09/12/15/18/21 BRT), batch 10 = 50 leads/dia SP.
//
// Regras:
// - Status elegíveis: NEW, IN_PROGRESS, REACTIVATED, FOLLOW_UP_AUTO
// - Lead parado: last_broker_whatsapp_at (ou created_at) < NOW() - 100h
// - Sem no_redistribute (respeita filas exclusivas)
// - duplication_attempt < 4 (máx 4 cópias)
// - count_sibling_dismissals < 2 (≥2 marcações de "sem interesse" → para)
// - Próxima cópia: ≥3 dias depois da última cópia desse root
// - Broker escolhido: ativo, lead_assignment_enabled=true, chip OPEN,
//   fora equipe Luciene, ainda não tentou esse phone,
//   ordenado por leads_recebidos_7d ASC, leads_recebidos_hoje ASC
// - Cópia: status='NEW', tag/source limpos do nome do manager (clean_tag_for_replica),
//   duplicated_from = root_id, duplication_attempt incrementado
// - Welcome: template não usado pra esse phone (lead_message_templates_by_phone)
// - Notifica manager do tentante via WhatsApp (formato igual incoming-lead)

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5;
const PARADO_HOURS = 100;
const MIN_HOURS_BETWEEN_DUPS = 72;          // 3 dias entre cópias
const MAX_DUPLICATIONS = 4;
const MAX_SIBLING_DISMISSALS = 2;

// Equipe Luciene (desativada em 2026-05-21) — IDs hardcoded por velocidade
const LUCIENE_TEAM_IDS = [
  '4fb4dec6-d254-4f3e-b4cc-422d8551fab1','20247ca6-035e-411b-a6fd-60126d367b8a',
  'ba2a4ca0-657e-4e91-bda4-e8b72608c26a','abb5a7a5-d192-419f-a890-cfa118e14f36',
  'b35224b9-cb0a-4d58-ad6c-aa7fee999404','f44a5343-5b75-4d31-8271-ea498b837551',
  '369ed79c-c60e-4fff-bc50-7c7f42da642f','2f7871d5-8233-49a4-8c80-f993f1507e1d',
  '6e936f86-63a6-4a1f-bacf-c347f1409940','cb6f4d7e-aba9-4d92-b2f7-512555f23609',
  'b7627c5b-0784-4bdb-be9c-97c5eeb7bbc0','951135bb-7103-49f7-8999-aeb0b088f3a4',
  'a79730bf-18a4-4dd9-9036-80e71664d79a','a43a4f6e-505a-4715-9189-0391b4e8058a',
  '6d661d3e-f593-490b-94e5-a9c412a2bfd1','31a57884-25a9-4d45-92a6-270918513ab9',
  'da24170a-4687-479d-a73c-8fc1e1e964e3'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  const report: any = { batch_size: BATCH_SIZE, processed: 0, created: 0, skipped: [], errors: [] };

  try {
    // 1) Buscar candidatos elegíveis (root = lead que vai ser pai da próxima cópia)
    const { data: candidates, error: candErr } = await supabase.rpc(
      'pick_leads_for_duplication',
      { p_limit: BATCH_SIZE, p_parado_hours: PARADO_HOURS,
        p_min_hours_between: MIN_HOURS_BETWEEN_DUPS,
        p_max_dups: MAX_DUPLICATIONS,
        p_max_dismissals: MAX_SIBLING_DISMISSALS,
        p_excluded_brokers: LUCIENE_TEAM_IDS }
    );
    if (candErr) throw new Error('pick_leads: ' + candErr.message);
    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ ...report, msg: 'sem candidatos' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    report.processed = candidates.length;

    for (const c of candidates) {
      try {
        // 2) Descobre managers que já tentaram esse root (não repetir equipe)
        const { data: excludedMgrs } = await supabase.rpc('get_replication_excluded_managers',
          { p_lead_id: c.id });

        // 3) Escolher broker tentante numa equipe ainda não usada (rotação Dudu/Datti/Dudalina/Liliane)
        const { data: broker } = await supabase.rpc('pick_broker_for_duplication', {
          p_phone: c.phone,
          p_excluded_brokers: LUCIENE_TEAM_IDS,
          p_excluded_managers: excludedMgrs || [],
        });
        if (!broker || broker.length === 0) {
          report.skipped.push({ lead: c.id, reason: 'sem broker disponivel em equipe nova' });
          continue;
        }
        const b = broker[0];

        // 3) Escolher template welcome não usado pra esse phone
        const { data: tpls } = await supabase.from('welcome_templates')
          .select('id, message, name').eq('is_active', true).eq('is_draft', false);
        const { data: usados } = await supabase.from('lead_message_templates_by_phone')
          .select('template_id').eq('phone', c.phone).eq('template_kind', 'welcome');
        const usadosSet = new Set((usados || []).map((u: any) => u.template_id));
        const disponiveis = (tpls || []).filter((t: any) => !usadosSet.has(t.id));
        if (disponiveis.length === 0) {
          report.skipped.push({ lead: c.id, reason: 'todos templates ja usados pra esse phone' });
          continue;
        }
        // round-robin pelo broker (cycle): use hash do broker_id pra estabilidade
        const tpl = disponiveis[Math.floor(Math.random() * disponiveis.length)];

        const cleanTag = c.tag ? await supabase.rpc('clean_tag_for_replica', { input: c.tag }).then((r: any) => r.data) : null;
        const cleanProduct = c.product ? await supabase.rpc('clean_tag_for_replica', { input: c.product }).then((r: any) => r.data) : null;

        const nowIso = new Date().toISOString();
        const rootId = c.duplicated_from || c.id;

        // 4) Criar a cópia
        const insertPayload: any = {
          name: c.name, phone: c.phone, email: c.email,
          tag: cleanTag, product: cleanProduct,
          // Manter aparência de "novo lead": source igual aos leads reais do Make
          // (duplicated_from continua marcado pra rastreio interno e painel admin)
          source: 'facebook_make',
          status: 'NEW',
          broker_id: b.broker_id,
          duplicated_from: rootId,
          duplication_attempt: (c.duplication_attempt || 0) + 1,
          last_interaction_at: nowIso, created_at: nowIso, received_at: nowIso,
          no_redistribute: false,
          renda_declarada: c.renda_declarada,
          tipo_trabalho: c.tipo_trabalho,
        };
        const { data: newLead, error: insErr } = await supabase
          .from('leads').insert(insertPayload).select().single();
        if (insErr) { report.errors.push({ lead: c.id, err: 'insert: ' + insErr.message }); continue; }

        // 5) Mensagem com placeholders interpolados
        const brokerName = `${b.first_name || ''}`.trim() || 'Corretor';
        const text = (tpl.message || '')
          .replace(/\\n/g, '\n')
          .replace(/\{nome\}/gi, c.name)
          .replace(/\{broker\}/gi, brokerName);

        // 6) Cria conversation e envia welcome
        const { data: conv } = await supabase.from('ia_conversations').insert({
          bot_instance_id: b.bot_instance_id,
          lead_id: newLead.id, lead_name: c.name, lead_phone: c.phone,
          status: 'active', sentiment: 'unknown', is_crm_lead: true,
          template_id: tpl.id, template_kind: 'welcome',
        }).select('id').single();

        const { data: sendResult } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: b.bot_instance_id, phone: c.phone, message: text,
                  conversationId: conv?.id, send_source: 'welcome' }
        });
        const welcomeOk = sendResult?.success === true;

        // 7) Marca template como usado pra esse phone (mesmo se falhou, pra não repetir tentativa)
        await supabase.from('lead_message_templates_by_phone').insert({
          phone: c.phone, template_id: tpl.id, template_kind: 'welcome',
          broker_id: b.broker_id,
        }).then(() => {}, () => {});

        // 8) Notifica corretor via WhatsApp do manager dele — formato idêntico ao incoming-lead
        // (NÃO menciona broker, "reativação" ou "cópia" — pra manager vê como lead novo entrando)
        let notified = false;
        if (b.manager_bot_id) {
          const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';
          const localTag = cleanTag || cleanProduct || 'Sem origem';
          const mcmvLine = [
            c.renda_declarada ? `💰 Renda: *${c.renda_declarada}*` : '',
            c.tipo_trabalho ? `💼 ${c.tipo_trabalho}` : '',
          ].filter(Boolean).join(' · ');
          const notifMsg = [
            `🎯 *Novo lead para você!*`, ``,
            `👤 *${c.name}*`,
            `🏷️ ${localTag}`,
            mcmvLine, ``,
            `📲 *Entre no sistema para ver o contato e enviar mensagem:*`, appUrl,
            ``,
            `⏰ Atenda rápido — leads que esperam mais de 5 min convertem muito menos.`,
          ].filter(l => l !== '').join('\n');
          const { data: notifResult } = await supabase.functions.invoke('send_whatsapp_message', {
            body: { botId: b.manager_bot_id, phone: b.broker_phone, message: notifMsg,
                    send_source: 'broker_manual' }
          });
          notified = notifResult?.success === true;
        }

        // 9) Atualiza marcadores no original (pra contar cooldown na próxima iteração)
        await supabase.from('leads').update({
          duplication_attempt: (c.duplication_attempt || 0) + 1,
        }).eq('id', c.id);

        await supabase.from('automation_logs').insert({
          entity_type: 'lead_replication', entity_id: c.id,
          status: welcomeOk ? 'success' : 'failed',
          message_sent: text, recipient_phone: c.phone,
          error_message: welcomeOk ? null : (sendResult?.skipped || sendResult?.error || 'falhou'),
        }).then(() => {}, () => {});

        report.created++;
        console.log(`[duplicar] lead ${c.id} → broker ${brokerName} (attempt ${insertPayload.duplication_attempt}) welcome=${welcomeOk} notif=${notified}`);
      } catch (e: any) {
        report.errors.push({ lead: c.id, err: e.message });
      }
    }

    return new Response(JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[duplicar-leads] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message, report }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
