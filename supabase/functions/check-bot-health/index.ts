import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGGED_OUT_REASONS = [401, 403];

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseInstance(it: any): { name: string | null; state: string; reason: number | null } {
  const inner = it?.instance && typeof it.instance === 'object' ? it.instance : it;
  const name = inner?.instanceName || inner?.name || it?.name || it?.instanceName || null;
  const rawState = inner?.connectionStatus || inner?.state || it?.connectionStatus || it?.state || 'unknown';
  const reasonRaw = inner?.disconnectionReasonCode ?? it?.disconnectionReasonCode ?? null;
  const reason = reasonRaw == null ? null : Number(reasonRaw);
  return { name, state: String(rawState).toLowerCase(), reason };
}

async function fetchServerInstances(base: string, apiKey: string): Promise<Map<string, { state: string; reason: number | null }> | null> {
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.warn(`[check-bot-health] fetchInstances ${base} HTTP ${res.status}`); return null; }
    const json = await res.json().catch(() => null);
    const arr = Array.isArray(json) ? json : (json?.instances || []);
    const map = new Map<string, { state: string; reason: number | null }>();
    for (const it of arr) {
      const p = parseInstance(it);
      const key = norm(p.name);
      if (key) map.set(key, { state: p.state, reason: p.reason });
    }
    return map;
  } catch (e: any) {
    console.warn(`[check-bot-health] fetchInstances erro ${base}: ${e.message}`);
    return null;
  }
}

async function tryRestart(base: string, instance: string, apiKey: string): Promise<boolean> {
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/instance/restart/${encodeURIComponent(instance)}`, {
      method: 'PUT', headers: { apikey: apiKey }, signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch (_) { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

    const { data: instances, error } = await supabase
      .from('bot_instances')
      .select('id, name, instance_name, evolution_api_url, evolution_api_key, status, real_state, disconnection_reason_code')
      .not('evolution_api_url', 'is', null)
      .not('instance_name', 'is', null);
    if (error) throw error;

    const servers = new Map<string, string>();
    for (const inst of instances || []) {
      const base = (inst.evolution_api_url || '').replace(/\/+$/, '');
      if (base && !servers.has(base)) servers.set(base, inst.evolution_api_key || '');
    }
    const serverMaps = new Map<string, Map<string, { state: string; reason: number | null }> | null>();
    for (const [base, key] of servers) serverMaps.set(base, await fetchServerInstances(base, key));

    const now = new Date().toISOString();
    let open = 0, connecting = 0, offline = 0, notFound = 0, restarted = 0, loggedOut = 0, updated = 0, unchanged = 0, serverDown = 0;

    for (const inst of instances || []) {
      const base = (inst.evolution_api_url || '').replace(/\/+$/, '');
      const name = (inst.instance_name || '').trim();
      const apiKey = inst.evolution_api_key || '';
      const map = serverMaps.get(base);
      if (map === null || map === undefined) { serverDown++; continue; }

      const found = map.get(norm(name));
      let newStatus: string, realState: string, score: number;
      let reasonCode: number | null = null;

      if (!found) {
        newStatus = 'offline'; realState = 'not_found'; score = 0; notFound++;
      } else if (found.state === 'open') {
        newStatus = 'open'; realState = 'open'; score = 100; open++;
      } else {
        reasonCode = found.reason;
        if (reasonCode != null && LOGGED_OUT_REASONS.includes(reasonCode)) {
          newStatus = found.state === 'connecting' ? 'connecting' : 'offline';
          realState = reasonCode === 403 ? 'banned' : 'logged_out';
          score = 0; loggedOut++;
        } else {
          if (inst.real_state !== 'restarting') { const ok = await tryRestart(base, name, apiKey); if (ok) restarted++; }
          newStatus = found.state === 'connecting' ? 'connecting' : 'offline';
          realState = 'restarting'; score = 30;
        }
        if (newStatus === 'connecting') connecting++; else offline++;
      }

      // SÓ grava se mudou de fato (evita 122 writes + realtime a cada 15min)
      const same = inst.status === newStatus
        && inst.real_state === realState
        && (inst.disconnection_reason_code ?? null) === (reasonCode ?? null);
      if (same) { unchanged++; continue; }

      const { error: upErr } = await supabase
        .from('bot_instances')
        .update({
          status: newStatus, real_state: realState,
          disconnection_reason_code: reasonCode, disconnection_checked_at: now,
          health_score: score, updated_at: now,
        })
        .eq('id', inst.id);
      if (!upErr) updated++;
    }

    const summary = { checked: (instances || []).length, updated, unchanged, open, connecting, offline, notFound, restarted, loggedOut, serverDown };
    console.log('[check-bot-health]', JSON.stringify(summary));
    return new Response(JSON.stringify(summary), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[check-bot-health] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
