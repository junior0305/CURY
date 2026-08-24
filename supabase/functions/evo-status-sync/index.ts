import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// evo-status-sync: le Instance.connectionStatus dos bancos do Evolution (api db 'evolution' + evob db 'evob',
// mesmo host 38.242.159.249:5432) e espelha em bot_instances.status. Read-only no Evolution.
// open->open, connecting->connecting, close/fantasma->offline. body: { preview? }

const HOST = '38.242.159.249';
const PG = { hostname: HOST, port: 5432, user: 'postgres', password: 'Mfcd62!!Mfcd62!!', tls: { enabled: false } };
const SERVERS = [
  { db: 'evolution', match: '%api.ape77%', label: 'api' },
  { db: 'evob', match: '%evob.ape77%', label: 'evob' },
];
const norm = (s: string) => (s || '').trim().toLowerCase();

async function syncServer(sb: any, db: string, serverMatch: string, preview: boolean) {
  const evo = new Client({ ...PG, database: db });
  try {
    await evo.connect();
    const r = await evo.queryObject<{ name: string; connectionStatus: string }>('SELECT name, \"connectionStatus\" FROM \"Instance\"');
    await evo.end();
    const evoStatus = new Map<string, string>();
    for (const row of r.rows) evoStatus.set(norm(row.name), String(row.connectionStatus || 'close'));
    const { data: ours } = await sb.from('bot_instances').select('id, instance_name, status').ilike('evolution_api_url', serverMatch);
    const buckets: Record<string, string[]> = { open: [], connecting: [], offline: [] };
    let matched = 0, changed = 0;
    for (const b of (ours || [])) {
      const evs = evoStatus.get(norm(b.instance_name));
      const target = evs === undefined ? 'offline' : (evs === 'open' ? 'open' : (evs === 'connecting' ? 'connecting' : 'offline'));
      if (evs !== undefined) matched++;
      if (target !== b.status) { changed++; buckets[target].push(b.id); }
    }
    if (!preview) for (const [st, ids] of Object.entries(buckets)) if (ids.length) await sb.from('bot_instances').update({ status: st }).in('id', ids);
    const summary: Record<string, number> = {};
    for (const v of evoStatus.values()) summary[v] = (summary[v] || 0) + 1;
    return { ok: true, db, evolution_total: r.rows.length, por_status: summary, nossos_chips: (ours || []).length, casaram: matched, mudaram: changed, mudancas: { open: buckets.open.length, connecting: buckets.connecting.length, offline: buckets.offline.length } };
  } catch (e) {
    try { await evo.end(); } catch (_) {}
    return { ok: false, db, error: String(e) };
  }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const preview = body?.preview === true;
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const results = [];
  for (const s of SERVERS) results.push({ ...(await syncServer(sb, s.db, s.match, preview)), label: s.label });
  return new Response(JSON.stringify({ ok: true, preview, results }, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
