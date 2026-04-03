import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── CSV parser simples (suporta vírgula e ponto-e-vírgula) ─────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detectar separador
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v.trim()));
}

// ── Normalizar telefone para dígitos apenas ────────────────────────────────────
function cleanPhone(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

// ── Procurar chave em múltiplos aliases ────────────────────────────────────────
const PHONE_KEYS  = ['telefone','phone','celular','whatsapp','fone','tel','mobile','numero','número'];
const NAME_KEYS   = ['nome','name','cliente','lead','contato','contact'];
const EMAIL_KEYS  = ['email','e-mail','mail','e_mail'];

function findVal(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k].trim()) return row[k].trim();
  }
  // Tentar busca parcial
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.includes(k));
    if (found && row[found].trim()) return row[found].trim();
  }
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const formData = await req.formData();
    const file       = formData.get('file') as File | null;
    const campaignId = formData.get('campaignId') as string | null;

    if (!file || !campaignId) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios: file e campaignId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const fileName = file.name.toLowerCase();
    const buffer   = await file.arrayBuffer();
    let rows: Record<string, string>[] = [];

    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      // ── CSV / TXT ──────────────────────────────────────────────────────────
      const text = new TextDecoder('utf-8').decode(buffer);
      rows = parseCsv(text);

    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // ── Excel ─────────────────────────────────────────────────────────────
      // Importar xlsx dinamicamente
      const { read, utils } = await import('https://esm.sh/xlsx@0.18.5');
      const wb = read(new Uint8Array(buffer), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = utils.sheet_to_json(ws, { defval: '' });
      rows = raw.map(r =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [String(k).toLowerCase().trim(), String(v)])
        )
      );
    } else {
      return new Response(JSON.stringify({ error: 'Formato não suportado. Use CSV ou XLSX.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Arquivo vazio ou sem dados válidos.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Mapear colunas para leads ──────────────────────────────────────────
    const leads = rows
      .map(row => {
        const phone = cleanPhone(findVal(row, PHONE_KEYS));
        const name  = findVal(row, NAME_KEYS) || 'Lead';
        const email = findVal(row, EMAIL_KEYS) || null;
        return { phone, name, email };
      })
      .filter(l => l.phone.length >= 10 && l.phone.length <= 15);

    if (leads.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Nenhum telefone válido encontrado. Verifique se a coluna "Telefone" ou "Phone" existe no arquivo.',
          sample_keys: rows.length > 0 ? Object.keys(rows[0]) : []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Inserir em lotes de 200 ────────────────────────────────────────────
    const records = leads.map(l => ({
      campaign_id:  campaignId,
      phone:        l.phone,
      name:         l.name,
      email:        l.email,
      status:       'pending',
      created_at:   new Date().toISOString(),
    }));

    let imported = 0;
    const BATCH  = 200;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase.from('campaign_leads').insert(batch);
      if (error) {
        console.error('[upload_campaign_leads] batch error:', error.message);
      } else {
        imported += batch.length;
      }
    }

    console.log(`[upload_campaign_leads] campanha ${campaignId}: ${imported}/${leads.length} leads importados`);

    return new Response(
      JSON.stringify({ success: true, imported, total: leads.length, skipped: leads.length - imported }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[upload_campaign_leads] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
