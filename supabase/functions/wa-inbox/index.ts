import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const J = (o:any, s=200)=> new Response(JSON.stringify(o), { status:s, headers:{...cors,'Content-Type':'application/json'} });

// Proxy do inbox do disparador (tudo vive no SJC). Valida o usuario logado (SP OU SJC) e le com service role.
// Assim a tela WPP Oficial funciona em qualquer empresa, sem abrir o RLS pra anon.
const AUTHS = [
  ['https://vaghxnypfphhxiobnhpk.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2h4bnlwZnBoaHhpb2JuaHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjY3MzUsImV4cCI6MjA4ODYwMjczNX0.eYpXthPp2QBg140SeoF5saARdEtAfW_c1-5S2PBlRwo'],
  ['https://dcimeuefnhaiemrfiklj.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaW1ldWVmbmhhaWVtcmZpa2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzgyNzIsImV4cCI6MjA4Njk1NDI3Mn0.Y0DOXDbrPVzVw41f9oONjsz8ggwDYi3wZ71iPR0GCqs'],
];
async function validUser(token:string){
  if (!token || token.length < 20) return false;
  for (const [url,key] of AUTHS){
    try { const r = await fetch(`${url}/auth/v1/user`, { headers: { 'Authorization':'Bearer '+token, 'apikey':key } }); if (r.ok) return true; } catch {}
  }
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json().catch(()=>({}));
    if (!(await validUser(String(b.user_token||'')))) return J({ error:'unauthorized' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')||'', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');

    if (b.action === 'threads') {
      const { data } = await sb.from('whatsapp_threads').select('*').order('last_inbound_at',{ascending:false,nullsFirst:false}).limit(200);
      return J({ threads: data||[] });
    }
    if (b.action === 'messages') {
      const { data } = await sb.from('whatsapp_messages').select('*').eq('thread_id', b.thread_id).order('created_at',{ascending:true}).limit(300);
      return J({ messages: data||[] });
    }
    if (b.action === 'read') {
      await sb.from('whatsapp_threads').update({ unread: 0 }).eq('id', b.thread_id);
      return J({ ok:true });
    }
    if (b.action === 'send') {
      const { data } = await sb.functions.invoke('wa-sender', { body: { to: b.to, kind:'text', text: b.text } });
      return J({ result: data });
    }
    return J({ error:'unknown_action' }, 400);
  } catch (e) { return J({ error: (e as any)?.message }, 500); }
});
