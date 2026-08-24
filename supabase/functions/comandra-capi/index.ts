import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const GRAPH = 'https://graph.facebook.com/v21.0';
const CRM_NAME = 'Comandra';

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function digits(p: string): string { return (p || '').replace(/\D/g, ''); }

async function postEvent(pixel: string, payload: any): Promise<{ ok: boolean; status: number; j: any }> {
  let lastErr = '';
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${GRAPH}/${pixel}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok && j?.events_received >= 1, status: r.status, j };
    } catch (e: any) { lastErr = e?.message || String(e); await new Promise((res) => setTimeout(res, 500 * (i + 1))); }
  }
  return { ok: false, status: 0, j: { error: 'fetch_failed: ' + lastErr } };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const envToken = Deno.env.get('FB_CAPI_TOKEN') || '';
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.max) || 50, 200);
    const test = body?.test === true;

    // Multi-BM: token por conta de anuncios (1 por Business Manager). Fallback = FB_CAPI_TOKEN.
    const { data: bmRows } = await supabase.from('fb_bm_tokens').select('account_id, token').eq('is_active', true);
    const tokenMap: Record<string,string> = {};
    for (const r of (bmRows || [])) tokenMap[String(r.account_id)] = r.token;
    const haveAnyToken = !!envToken || Object.keys(tokenMap).length > 0;

    const { data: queue } = await supabase.from('capi_events_log').select('id, lead_id, event_name, value, event_id').eq('status', 'queued').order('created_at', { ascending: true }).limit(limit);
    if (!queue || !queue.length) return new Response(JSON.stringify({ success: true, queued: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!haveAnyToken) return new Response(JSON.stringify({ success: true, skipped: 'no_token', queued: queue.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let sent = 0, noPixel = 0, errors = 0, viaTeam = 0, noToken = 0;
    const nowSec = Math.floor(Date.now() / 1000);

    for (const ev of queue) {
      try {
        const { data: lead } = await supabase.from('leads').select('id, phone, email, fbclid, fb_lead_id, fb_page_id, fb_campaign, broker_id, created_at').eq('id', ev.lead_id).maybeSingle();
        if (!lead) { await supabase.from('capi_events_log').update({ status: 'error', response: 'lead nao encontrado' }).eq('id', ev.id); errors++; continue; }

        let rp: any = {};
        if (!lead.fb_campaign && !lead.fb_page_id) {
          const { data: wl } = await supabase.from('webhook_logs').select('payload').eq('integration_key', 'make').ilike('response_body', '%' + lead.id + '%').order('created_at', { ascending: false }).limit(1).maybeSingle();
          rp = (wl as any)?.payload?.raw_payload || {};
        }
        let pixel: string | null = null, account: string | null = null;

        // 1) por page_id
        const pageId = lead.fb_page_id || rp.page_id || rp.pageId || rp.page || null;
        if (pageId) { const { data: m } = await supabase.from('fb_page_map').select('pixel_id, account_id').eq('page_id', String(pageId)).eq('is_active', true).maybeSingle(); if (m?.pixel_id) { pixel = m.pixel_id; account = m.account_id; } }
        // 2) por campanha
        const camp = lead.fb_campaign || rp.campanha || rp.campaign || null;
        if (!pixel && camp) { const { data: cm } = await supabase.from('fb_campaign_map').select('pixel_id, account_id').eq('campanha', String(camp)).eq('is_active', true).maybeSingle(); if (cm?.pixel_id) { pixel = cm.pixel_id; account = cm.account_id; } }
        // 3) pela EQUIPE do lead (broker -> manager -> fb_team_map)
        if (!pixel && lead.broker_id) {
          const { data: br } = await supabase.from('profiles').select('manager_id').eq('id', lead.broker_id).maybeSingle();
          if (br?.manager_id) {
            const { data: tm } = await supabase.from('fb_team_map').select('pixel_id, account_id').eq('manager_id', br.manager_id).eq('is_active', true).maybeSingle();
            if (tm?.pixel_id) { pixel = tm.pixel_id; account = tm.account_id; viaTeam++; }
          }
        }

        if (!pixel) { await supabase.from('capi_events_log').update({ status: 'no_pixel', response: 'sem page/campanha/equipe mapeada' }).eq('id', ev.id); noPixel++; continue; }

        // Token do BM dessa conta (fallback = env)
        const evToken = (account && tokenMap[String(account)]) ? tokenMap[String(account)] : envToken;
        if (!evToken) { await supabase.from('capi_events_log').update({ status: 'error', pixel_id: pixel, account_id: account, response: 'sem token pro BM dessa conta' }).eq('id', ev.id); noToken++; continue; }

        // user_data: telefone sempre; email/lead_id/fbc quando existirem (melhora EMQ e matching do Conversion Leads)
        const ud: any = { ph: [await sha256(digits(lead.phone))] };
        if (lead.email && String(lead.email).trim()) ud.em = [await sha256(String(lead.email).trim().toLowerCase())];
        if (lead.fb_lead_id && String(lead.fb_lead_id).trim()) { const lid = String(lead.fb_lead_id).trim(); ud.lead_id = /^\d+$/.test(lid) ? Number(lid) : lid; }
        if (lead.fbclid) { const ts = lead.created_at ? Math.floor(Date.parse(lead.created_at) / 1000) : nowSec; ud.fbc = `fb.1.${ts}.${lead.fbclid}`; }

        // Formato de CRM (Qualified Leads / Conversion Leads): event_source=crm + lead_event_source no custom_data
        const payload: any = { data: [{ event_name: ev.event_name, event_time: nowSec, action_source: 'system_generated', event_id: ev.event_id, user_data: ud, custom_data: { event_source: 'crm', lead_event_source: CRM_NAME, value: Number(ev.value || 0), currency: 'BRL' } }], access_token: evToken };
        if (test && body?.test_event_code) payload.test_event_code = String(body.test_event_code);

        const res = await postEvent(pixel, payload);
        await supabase.from('capi_events_log').update({ status: res.ok ? 'sent' : 'error', pixel_id: pixel, account_id: account, http_status: res.status, response: JSON.stringify(res.j).substring(0, 500), sent_at: new Date().toISOString() }).eq('id', ev.id);
        if (res.ok) { sent++; await supabase.from('leads').update({ capi_sent_at: new Date().toISOString() }).eq('id', lead.id).then(() => {}, () => {}); }
        else errors++;
      } catch (e: any) { await supabase.from('capi_events_log').update({ status: 'error', response: ('exc: ' + (e?.message || '')).substring(0, 300) }).eq('id', ev.id); errors++; }
    }
    return new Response(JSON.stringify({ success: true, processed: queue.length, sent, no_pixel: noPixel, errors, via_team: viaTeam, no_token: noToken }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) { console.error('[comandra-capi] fatal', err?.message); return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
