import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const cutoff = new Date(Date.now() - 2 * 24 * 3600000).toISOString();
  const BATCH = 300;
  let totalDeleted = 0;
  let rounds = 0;
  const maxRounds = 200; // safety cap

  while (rounds < maxRounds) {
    // Pega IDs do próximo batch
    const { data: ids, error: selErr } = await supabase
      .from('webhook_logs')
      .select('id')
      .lt('created_at', cutoff)
      .limit(BATCH);

    if (selErr) return new Response(JSON.stringify({ error: selErr.message, totalDeleted }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    if (!ids || ids.length === 0) break;

    const idsToDelete = ids.map((r: any) => r.id);
    const { error: delErr } = await supabase
      .from('webhook_logs')
      .delete()
      .in('id', idsToDelete);

    if (delErr) return new Response(JSON.stringify({ error: delErr.message, totalDeleted }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    totalDeleted += idsToDelete.length;
    rounds++;
    console.log(`[cleanup] round ${rounds} — deleted ${totalDeleted} so far`);

    // Pequena pausa para não sobrecarregar
    await new Promise(r => setTimeout(r, 100));
  }

  const { count: remaining } = await supabase
    .from('webhook_logs')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', cutoff);

  return new Response(JSON.stringify({
    success: true,
    totalDeleted,
    rounds,
    remaining_old: remaining ?? 0,
    cutoff,
    message: remaining && remaining > 0 ? 'Chame novamente para continuar' : 'Limpeza completa!',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
