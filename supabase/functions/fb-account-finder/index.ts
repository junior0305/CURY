import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// neutralizada 2026-06-28
serve(() => new Response(JSON.stringify({ gone: true }), { status: 410 }))
