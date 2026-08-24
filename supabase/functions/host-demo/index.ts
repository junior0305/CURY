// DESATIVADO (Supabase Storage tambem forca text/plain; demo vive no frontend). Token removido.
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
