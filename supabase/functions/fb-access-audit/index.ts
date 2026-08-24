import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
const G = 'https://graph.facebook.com/v21.0';

serve(async (_req) => {
  const T = Deno.env.get('FB_CAPI_TOKEN') || '';
  if (!T) return j({ error: 'FB_CAPI_TOKEN ausente' }, 500);
  const PAGE = '317806478090108'; // Clara Imoveis

  const call = async (p: string, tok: string) => {
    try { const sep = p.includes('?') ? '&' : '?'; const r = await fetch(`${G}/${p}${sep}access_token=${encodeURIComponent(tok)}`); return await r.json(); }
    catch (e) { return { _fetch_error: String(e) }; }
  };

  const out: any = {};

  // 1) Paginas que o Gilberto administra + token de pagina (NAO exponho o token)
  const me = await call(`me/accounts?fields=name,id,tasks,access_token&limit=200`, T);
  const pages = (me?.data || []);
  out.minhas_paginas = pages.map((p: any) => ({ id: p.id, name: p.name, minhas_tasks: p.tasks }));
  out.me_error = me?.error?.message || null;

  const alvo = pages.find((p: any) => p.id === PAGE) || pages.find((p: any) => (p.name || '').toLowerCase().includes('clara'));
  if (!alvo) { out.clara = 'Clara Imoveis NAO aparece nas paginas que o Gilberto administra com esse token'; return j(out); }

  const PT = alvo.access_token;
  if (!PT) { out.clara = 'Sem page access token (token sem pages_show_list completo)'; return j(out); }

  out.clara = {
    page: { id: alvo.id, name: alvo.name, minhas_tasks: alvo.tasks },
    cargos_na_pagina: await call(`${alvo.id}/roles?fields=name,tasks`, PT),          // quem tem cargo
    apps_que_puxam_dados: await call(`${alvo.id}/subscribed_apps`, PT),               // integracoes/CRM (leads)
    formularios_de_lead: await call(`${alvo.id}/leadgen_forms?fields=id,name,status,leads_count&limit=100`, PT),
  };

  return j(out);
});

function j(o: any, s = 200) { return new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } }); }
