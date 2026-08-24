// DESATIVADO 2026-06-18 (limpeza de seguranca). Era um probe de manutencao com credencial.
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
