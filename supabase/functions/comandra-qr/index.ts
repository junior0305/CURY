import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

// comandra-qr: reconexao de chip pelo Comandra. 1 chip por vez.
// GET ?instance=Suica            -> pagina HTML (QR + status ao vivo lido do banco do Evolution)
// GET ?instance=Suica&action=start  -> JSON { qr, code } (logout p/ limpar zumbi + connect)
// GET ?instance=Suica&action=status -> JSON { status, ownerJid } (le do banco do Evolution)

const KEY = 'ed8018a5fb0ea500bec4095593d3c080';
const PW = Deno.env.get('EVO_DB_PASSWORD') || 'Mfcd62!!Mfcd62!!';
const HOST = '38.242.159.249';
const SRV = [ { db: 'evolution', base: 'https://api.ape77.com.br', label: 'api' }, { db: 'evob', base: 'https://evob.ape77.com.br', label: 'evob' } ];

async function dbRow(db: string, instance: string): Promise<any | null> {
  const c = new Client({ hostname: HOST, port: 5432, user: 'postgres', password: PW, database: db, tls: { enabled: false } });
  try { await c.connect(); const r = await c.queryObject('SELECT name, \"connectionStatus\", \"ownerJid\" FROM \"Instance\" WHERE lower(name)=lower($1) LIMIT 1', [instance]); await c.end(); return r.rows[0] || null; } catch (_) { try { await c.end(); } catch (__) {} return null; }
}
async function findServer(instance: string) { for (const s of SRV) { const row = await dbRow(s.db, instance); if (row) return { ...s, row }; } return null; }

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }); }

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const instance = url.searchParams.get('instance') || '';
  const action = url.searchParams.get('action') || '';
  if (!instance) return new Response('faltou ?instance=NomeDoChip', { status: 400 });
  const srv = await findServer(instance);
  if (!srv) return json({ error: 'instancia nao encontrada no Evolution: ' + instance }, 404);

  if (action === 'status') {
    const row = await dbRow(srv.db, instance);
    return json({ instance, server: srv.label, status: row?.connectionStatus || 'unknown', ownerJid: row?.ownerJid || null });
  }

  if (action === 'start') {
    // limpa sessao zumbi (logout) e pede QR novo (connect)
    try { await fetch(`${srv.base}/instance/logout/${encodeURIComponent(instance)}`, { method: 'DELETE', headers: { apikey: KEY } }); } catch (_) {}
    await new Promise((r) => setTimeout(r, 1200));
    let body: any = {};
    try { const r = await fetch(`${srv.base}/instance/connect/${encodeURIComponent(instance)}`, { headers: { apikey: KEY } }); body = await r.json().catch(() => ({})); } catch (e) { return json({ error: 'connect falhou: ' + String(e) }, 500); }
    const qr = body?.base64 || body?.qrcode?.base64 || body?.qrcode || null;
    const code = body?.code || body?.qrcode?.code || body?.pairingCode || null;
    return json({ instance, server: srv.label, qr, code, raw_state: body?.instance?.state || null });
  }

  // pagina HTML
  const html = `<!doctype html><html lang=pt-br><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Reconectar ${instance}</title>
<style>body{background:#0b0f1a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:18px}.box{max-width:360px;margin:16px auto;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:20px}img{width:280px;height:280px;background:#fff;border-radius:12px}.st{font-size:15px;margin-top:14px;font-weight:700}.muted{color:#64748b;font-size:12px}.ok{color:#34d399}.warn{color:#fbbf24}.btn{margin-top:12px;background:#0066ff;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}</style></head>
<body><h1>Reconectar chip <b>${instance}</b> <span class=muted>(${srv.label})</span></h1>
<div class=box><div id=qrwrap><img id=qr alt=\"gerando QR...\"><div class=muted>Abra o WhatsApp do celular do ${instance} → Aparelhos conectados → Conectar aparelho → escaneie</div></div>
<div class=st id=st>iniciando...</div><button class=btn onclick=startQR()>Gerar novo QR</button></div>
<script>
const INST=${JSON.stringify(instance)};
async function startQR(){document.getElementById('st').textContent='gerando QR...';const r=await fetch('?instance='+encodeURIComponent(INST)+'&action=start');const d=await r.json();if(d.qr){let src=d.qr;if(!src.startsWith('data:'))src='data:image/png;base64,'+src;document.getElementById('qr').src=src;document.getElementById('st').textContent='escaneie o QR acima';}else if(d.raw_state==='open'){document.getElementById('st').innerHTML='<span class=ok>✅ ja conectado</span>';}else{document.getElementById('st').textContent='nao consegui gerar QR ('+(d.code||d.error||'?')+')';}}
async function poll(){try{const r=await fetch('?instance='+encodeURIComponent(INST)+'&action=status');const d=await r.json();if(d.status==='open'){document.getElementById('st').innerHTML='<span class=ok>✅ CONECTADO! pode fechar.</span>';document.getElementById('qrwrap').style.display='none';return;}else if(d.status==='connecting'){document.getElementById('st').innerHTML='<span class=warn>pareando... (escaneou? aguarde)</span>';}}catch(e){}setTimeout(poll,3000);}
startQR();setTimeout(poll,3000);setInterval(()=>{if(!document.getElementById('st').textContent.includes('CONECTADO'))startQR();},25000);
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
