import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_LEADS_PER_UPLOAD = 500;

// ─── Phone normalization (mesma lógica do incoming-lead A9) ──────────────────
function normalizePhone(raw: string): { phone: string|null; reason?: string } {
  if (!raw) return { phone: null, reason: 'vazio' };
  const cleaned = String(raw).replace(/^[a-z]+:/i, '').replace(/[^0-9+]/g, '');
  const digits = cleaned.replace(/^\+/, '');
  if (!digits) return { phone: null, reason: 'sem dígitos' };
  // 10-11 dígitos com DDD válido → prefixa 55
  if (/^[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: '55' + digits };
  // 12-13 dígitos começando com 55 → ok
  if (/^55[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: digits };
  // outros números válidos (internacionais por ex.) — aceita se 10-15 dígitos
  if (/^[0-9]{10,15}$/.test(digits)) return { phone: digits };
  return { phone: null, reason: `formato inválido (${digits.length}d)` };
}

// ─── CSV parser simples ──────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (s: string) => {
    const out: string[] = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' && s[i+1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQuote = !inQuote; continue; }
      if ((c === ',' || c === ';' || c === '\t') && !inQuote) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

interface RawLead { name: string; phone: string; }

function extractFromHeaders(headers: string[], rows: string[][]): RawLead[] {
  // Aceita variações de header
  const nameKeys  = ['nome','name','cliente','contact_name','full_name','primeiro_nome'];
  const phoneKeys = ['telefone','phone','whatsapp','celular','contact_phone','cellphone','tel','numero','número'];
  const findIdx = (keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex(h => h === k);
      if (i >= 0) return i;
    }
    // contém parcial
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const nIdx = findIdx(nameKeys);
  const pIdx = findIdx(phoneKeys);
  const out: RawLead[] = [];
  for (const r of rows) {
    const name  = nIdx >= 0 ? (r[nIdx] || '').trim() : '';
    const phone = pIdx >= 0 ? (r[pIdx] || '').trim() : '';
    if (name || phone) out.push({ name, phone });
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const body = await req.json();
    const { campaignId, source, csvText, inlineLeads } = body as {
      campaignId: string;
      source: 'csv' | 'inline';
      csvText?: string;
      inlineLeads?: RawLead[];
    };

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'campaignId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1) Extrair raw leads
    let raw: RawLead[] = [];
    if (source === 'csv' && csvText) {
      const { headers, rows } = parseCSV(csvText);
      raw = extractFromHeaders(headers, rows);
    } else if (source === 'inline' && Array.isArray(inlineLeads)) {
      raw = inlineLeads.filter((l: any) => l && (l.name || l.phone));
    } else {
      return new Response(JSON.stringify({ error: 'source inválido (use csv ou inline)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (raw.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhum lead encontrado no upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2) Normalize + validate + dedupe interno
    const seen = new Set<string>();
    const valid: { name: string; phone: string }[] = [];
    const invalid: { row: number; name: string; phone: string; reason: string }[] = [];
    let duplicatesInternal = 0;

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const { phone, reason } = normalizePhone(r.phone);
      if (!phone) {
        invalid.push({ row: i + 1, name: r.name, phone: r.phone, reason: reason || 'phone inválido' });
        continue;
      }
      if (!r.name?.trim()) {
        invalid.push({ row: i + 1, name: r.name, phone: r.phone, reason: 'nome ausente' });
        continue;
      }
      if (seen.has(phone)) { duplicatesInternal++; continue; }
      seen.add(phone);
      valid.push({ name: r.name.trim(), phone });
    }

    // 3) Cap 500
    let capped = false;
    if (valid.length > MAX_LEADS_PER_UPLOAD) {
      capped = true;
      valid.length = MAX_LEADS_PER_UPLOAD;
    }

    // 4) Dedupe contra leads existentes da mesma campanha
    let duplicatesExisting = 0;
    if (valid.length > 0) {
      const phones = valid.map(v => v.phone);
      const { data: existing } = await supabase
        .from('campaign_leads')
        .select('phone')
        .eq('campaign_id', campaignId)
        .in('phone', phones);
      const existingSet = new Set((existing || []).map((e: any) => e.phone));
      const before = valid.length;
      const filtered = valid.filter(v => !existingSet.has(v.phone));
      duplicatesExisting = before - filtered.length;
      valid.length = 0;
      valid.push(...filtered);
    }

    // 5) Inserir
    let inserted = 0;
    if (valid.length > 0) {
      const rows = valid.map(v => ({
        campaign_id: campaignId,
        name: v.name,
        phone: v.phone,
        status: 'pending',
      }));
      const { data: ins, error: insErr } = await supabase
        .from('campaign_leads')
        .insert(rows)
        .select('id');
      if (insErr) {
        return new Response(JSON.stringify({ error: 'Falha ao inserir: ' + insErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      inserted = ins?.length || 0;
    }

    return new Response(JSON.stringify({
      success: true,
      inserted,
      duplicates_internal: duplicatesInternal,
      duplicates_existing: duplicatesExisting,
      invalid,
      capped,
      cap_limit: MAX_LEADS_PER_UPLOAD,
      raw_count: raw.length,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[upload_campaign_leads_v2] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
