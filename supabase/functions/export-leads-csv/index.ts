import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
    const u = new URL(req.url);
    const token = u.searchParams.get('token') || '';
    const { data: tk } = await sb.from('system_settings').select('value').eq('key','export_leads_token').maybeSingle();
    const expected = String(tk?.value ?? '').replace(/^"|"$/g,'');
    if (!token || token !== expected) return new Response('forbidden — token invalido', { status: 403, headers: cors });

    const regiao = u.searchParams.get('regiao');
    const campanha = u.searchParams.get('campanha');
    const status = u.searchParams.get('status');

    // modo lista: ?list=regioes ou ?list=campanhas
    const list = u.searchParams.get('list');
    if (list === 'regioes' || list === 'campanhas') {
      const { data: facets } = await sb.rpc('export_leads_facets', { p_tipo: list });
      return new Response(String(facets||''), { status: 200, headers: { ...cors, 'Content-Type':'text/plain; charset=utf-8' } });
    }

    const { data, error } = await sb.rpc('export_leads_csv', { p_regiao: regiao, p_campanha: campanha, p_status: status });
    if (error) return new Response('erro: '+error.message, { status: 500, headers: cors });

    const csv = '﻿' + (data || 'nome,telefone');
    const tag = (regiao || campanha || 'todos').replace(/[^a-z0-9]/gi,'_');
    return new Response(csv, { status: 200, headers: { ...cors, 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads_sp_${tag}.csv"` } });
  } catch (e) {
    return new Response('erro: '+(e?.message||''), { status: 500, headers: cors });
  }
});
