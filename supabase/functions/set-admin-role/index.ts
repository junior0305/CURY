import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { email, userId, role } = body;

    if (!email && !userId) {
      return new Response(JSON.stringify({ error: "Provide email or userId" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!role) {
      return new Response(JSON.stringify({ error: "Provide role" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let targetUserId = userId;

    if (!targetUserId && email) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ per_page: 1000 });
      const found = (listData?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (found) {
        targetUserId = found.id;
      } else {
        const { data: profileByEmail } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
        if (profileByEmail?.id) targetUserId = profileByEmail.id;
      }
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: upsertError } = await supabaseAdmin.from('profiles').upsert(
      { id: targetUserId, role, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );

    if (upsertError) throw upsertError;

    console.log(`[set-admin-role] Role set to ${role} for user ${targetUserId}`);

    return new Response(JSON.stringify({ success: true, userId: targetUserId, role }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[set-admin-role] Error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});