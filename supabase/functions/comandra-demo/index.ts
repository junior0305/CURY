// Movido pro frontend: /comandra-demo.html (edge do Supabase forca text/plain, nao renderiza HTML).
Deno.serve(() => new Response(JSON.stringify({ moved_to: '/comandra-demo.html' }), { headers: { 'Content-Type': 'application/json' } }));
