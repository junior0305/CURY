import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Servidor api.ape77.com.br pode levar ~30s. Timeout generoso.
const EVO_TIMEOUT = 35000;

// Mesma lista da setup-evolution-webhooks. Se divergir, o chip conecta e o
// sistema fica surdo pra ele.
const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
];

async function evoConnect(base: string, instance: string, apiKey: string, phone?: string | null): Promise<any | null> {
  try {
    const qs = phone ? `?number=${encodeURIComponent(phone)}` : '';
    const r = await fetch(`${base}/instance/connect/${instance}${qs}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(EVO_TIMEOUT),
    });
    if (!r.ok) { console.warn(`[qr] connect ${r.status}`); return null; }
    return await r.json().catch(() => null);
  } catch (e: any) {
    console.warn(`[qr] connect erro: ${e.message}`);
    return null;
  }
}

async function evoRestart(base: string, instance: string, apiKey: string) {
  try {
    await fetch(`${base}/instance/restart/${instance}`, { method: 'PUT', headers: { apikey: apiKey }, signal: AbortSignal.timeout(10000) });
    await new Promise(r => setTimeout(r, 3000));
  } catch (_) { /* noop */ }
}

async function evoLogout(base: string, instance: string, apiKey: string) {
  try {
    await fetch(`${base}/instance/logout/${instance}`, { method: 'DELETE', headers: { apikey: apiKey }, signal: AbortSignal.timeout(10000) });
    await new Promise(r => setTimeout(r, 1500));
  } catch (_) { /* noop */ }
}

// Aponta a instância pro webhook_receiver. Tem que acontecer na CRIAÇÃO: chip
// que conecta sem webhook recebe mensagem e o sistema não fica sabendo —
// é o ponto 3 do checklist de troca de chip, e o mais fácil de esquecer.
async function evoSetWebhook(base: string, instance: string, apiKey: string, webhookUrl: string) {
  try {
    const r = await fetch(`${base}/webhook/set/${instance}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, url: webhookUrl, webhook_by_events: false, events: WEBHOOK_EVENTS }),
      signal: AbortSignal.timeout(12000),
    });
    console.log(`[qr] webhook/set ${instance}: ${r.status}`);
    return r.ok;
  } catch (e: any) {
    console.warn(`[qr] webhook/set erro: ${e.message}`);
    return false;
  }
}

// Cria a instância no servidor Evolution.
// Isto NÃO existia em lugar nenhum do sistema: o create-user criava a linha em
// bot_instances e mais nada, então pra todo corretor novo a instância existia no
// banco e não no servidor. O connect batia 404, as tentativas de restart/logout
// batiam 404 também, e a função terminava em "não consegui gerar o QR" — que era
// verdade, mas escondia a causa. 67 instâncias estavam nesse estado.
async function evoCreate(base: string, instanceRaw: string, apiKey: string, phone: string | null): Promise<any | null> {
  try {
    const r = await fetch(`${base}/instance/create`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceName: instanceRaw,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        ...(phone ? { number: phone } : {}),
      }),
      signal: AbortSignal.timeout(EVO_TIMEOUT),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      // 403/409 = já existe. Não é erro: segue pro connect normal.
      console.warn(`[qr] create ${r.status}: ${JSON.stringify(body)?.substring(0, 200)}`);
      return r.status === 403 || r.status === 409 ? {} : null;
    }
    console.log(`[qr] instância criada no servidor: ${instanceRaw}`);
    return body;
  } catch (e: any) {
    console.warn(`[qr] create erro: ${e.message}`);
    return null;
  }
}

function extractQR(j: any): string | null { return j?.base64 || j?.qrcode?.base64 || null; }
function extractPairing(j: any): string | null {
  const c = j?.pairingCode || j?.pairing_code || null;
  return c ? String(c) : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );
    const webhookUrl = `${supabaseUrl}/functions/v1/webhook_receiver`;

    const { botInstanceId, forceQR, method } = await req.json();
    if (!botInstanceId) return json({ error: 'botInstanceId required' }, 400);
    const wantPairing = method === 'pairing';

    const { data: bot, error: botErr } = await supabase
      .from('bot_instances')
      .select('evolution_api_url, evolution_api_key, instance_name, name, status, real_state, phone, last_qr_base64, last_qr_at')
      .eq('id', botInstanceId)
      .maybeSingle();
    if (botErr || !bot) return json({ error: 'Bot instance not found' }, 404);

    const base = (bot.evolution_api_url || '').replace(/\/+$/, '');
    const instanceRaw = (bot.instance_name || bot.name || '').trim();
    const instance = encodeURIComponent(instanceRaw);
    const apiKey = bot.evolution_api_key || '';
    const phone = (bot.phone || '').replace(/[^0-9]/g, '') || null;
    const deadSession = ['logged_out', 'banned'].includes(bot.real_state || '');

    if (!base || !instanceRaw) {
      return json({ connected: false, error: 'not_configured', error_detail: 'Instância sem URL/nome da Evolution.' });
    }

    if (!wantPairing && !forceQR && bot.last_qr_base64 && bot.last_qr_at) {
      if (Date.now() - new Date(bot.last_qr_at).getTime() < 25000) {
        return json({ connected: false, base64: bot.last_qr_base64, method: 'qr', fromCache: true });
      }
    }
    // `status` mente: check-bot-health e outros caminhos deixam status='open' em chip
    // com sessao morta (401). Quem manda aqui e o real_state — senao o atalho responde
    // "ja conectado" e o corretor nunca ve o QR. Caso Flavia/equipe Dudalina 25/08.
    if (bot.status === 'open' && bot.real_state === 'open') return json({ connected: true, fromCache: true });

    let state = 'unknown';
    let stateHttp = 0;
    try {
      const sr = await fetch(`${base}/instance/connectionState/${instance}`, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(EVO_TIMEOUT) });
      stateHttp = sr.status;
      if (sr.ok) { const j = await sr.json().catch(() => ({})); state = String(j?.instance?.state || j?.state || 'unknown').toLowerCase(); }
    } catch (e: any) {
      return json({ connected: false, error: 'evolution_unreachable', error_detail: 'Não consegui falar com o servidor do WhatsApp. Tente de novo em alguns segundos.' });
    }
    if (state === 'open') {
      await supabase.from('bot_instances').update({ status: 'open', real_state: 'open' }).eq('id', botInstanceId);
      return json({ connected: true, state });
    }

    // A instância não existe NO SERVIDOR (corretor recém-cadastrado). Cria agora,
    // já com o webhook, e aproveita o QR que o próprio create devolve.
    if (stateHttp === 404) {
      const created = await evoCreate(base, instanceRaw, apiKey, phone);
      if (created === null) {
        return json({ connected: false, error: 'not_created', error_detail: 'Não consegui criar a instância no servidor do WhatsApp. Avise o suporte.' });
      }
      await evoSetWebhook(base, instance, apiKey, webhookUrl);
      let qrNew = extractQR(created);
      if (!qrNew) { const jc = await evoConnect(base, instance, apiKey); qrNew = extractQR(jc); }
      if (qrNew) {
        await supabase.from('bot_instances')
          .update({ last_qr_base64: qrNew, last_qr_at: new Date().toISOString(), status: 'connecting', real_state: 'connecting' })
          .eq('id', botInstanceId);
        return json({ connected: false, method: 'qr', base64: qrNew, created: true });
      }
      return json({ connected: false, error: 'unavailable', error_detail: 'Instância criada, mas o QR não veio. Tente de novo em alguns segundos.' });
    }

    // FIX conecta-e-cai: instância em 'connecting' = QR aguardando scan OU handshake pos-scan.
    // Pega o QR atual via connect (nao destrutivo), mas NUNCA reinicia/desloga aqui —
    // restart/logout num handshake em andamento matam a sessao e causam o loop "conecta e pede QR de novo".
    if (state === 'connecting') {
      const jc = await evoConnect(base, instance, apiKey);
      const qrc = extractQR(jc);
      if (qrc) {
        await supabase.from('bot_instances').update({ last_qr_base64: qrc, last_qr_at: new Date().toISOString(), status: 'connecting' }).eq('id', botInstanceId);
        return json({ connected: false, method: 'qr', base64: qrc, connecting: true });
      }
      // connect nao trouxe QR (provavel handshake pos-scan) -> devolve o QR em cache, sem destruir a sessao.
      return json({ connected: false, method: 'qr', base64: bot.last_qr_base64 || null, connecting: true });
    }

    // Sessão morta (401/403): logout ANTES de gerar QR garante QR limpo e pareável.
    if (deadSession) { await evoLogout(base, instance, apiKey); }

    // Código de pareamento (se a infra suportar; cai pro QR se vier null)
    if (wantPairing && phone) {
      let j = await evoConnect(base, instance, apiKey, phone);
      let code = extractPairing(j);
      if (!code) { await evoRestart(base, instance, apiKey); j = await evoConnect(base, instance, apiKey, phone); code = extractPairing(j); }
      if (code) {
        await supabase.from('bot_instances').update({ status: 'connecting' }).eq('id', botInstanceId);
        return json({ connected: false, method: 'pairing', pairingCode: code, phone });
      }
      const qrFallback = extractQR(j);
      if (qrFallback) {
        await supabase.from('bot_instances').update({ last_qr_base64: qrFallback, last_qr_at: new Date().toISOString(), status: 'connecting' }).eq('id', botInstanceId);
        return json({ connected: false, method: 'qr', base64: qrFallback, pairingUnavailable: true });
      }
    }

    // QR (método padrão nesta infra)
    let j = await evoConnect(base, instance, apiKey);
    let qr = extractQR(j);
    if (!qr) { await evoRestart(base, instance, apiKey); j = await evoConnect(base, instance, apiKey); qr = extractQR(j); }
    if (!qr) { await evoLogout(base, instance, apiKey); j = await evoConnect(base, instance, apiKey); qr = extractQR(j); }
    if (qr) {
      await supabase.from('bot_instances').update({ last_qr_base64: qr, last_qr_at: new Date().toISOString(), status: 'connecting' }).eq('id', botInstanceId);
      return json({ connected: false, method: 'qr', base64: qr });
    }

    return json({ connected: false, error: 'unavailable', error_detail: 'Não consegui gerar o QR após várias tentativas. O servidor do WhatsApp pode estar lento — tente de novo em 1 min.' });
  } catch (err: any) {
    console.error('[qr] error:', err.message);
    return json({ connected: false, error: err.message, error_detail: 'Erro interno.' }, 500);
  }
});
