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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!role) {
      return new Response(JSON.stringify({ error: "Provide role (e.g. SUPERINTENDENT)" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[set-admin-role] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let targetUserId = userId;

    if (!targetUserId && email) {
      console.log("[set-admin-role] Looking up user by email:", email);
      // listUsers may be paginated; listUsers without params returns first page — we'll fallback to profiles lookup if needed
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ per_page: 1000 });
      if (listError) {
        console.error("[set-admin-role] admin.listUsers error:", listError.message);
      }

      const found = (listData?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (found) {
        targetUserId = found.id;
        console.log("[set-admin-role] Found user in auth.users:", targetUserId);
      } else {
        // Try to find profile row by email (in case auth list didn't return or email differs)
        const { data: profileByEmail, error: profError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (profError) {
          console.error("[set-admin-role] profiles select error:", profError.message);
        }
        if (profileByEmail && profileByEmail.id) {
          targetUserId = profileByEmail.id;
          console.log("[set-admin-role] Found user via profiles.email lookup:", targetUserId);
        }
      }
    }

    if (!targetUserId) {
      console.error("[set-admin-role] Could not resolve user id for:", email || userId);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Upsert profile row to ensure role is set
    const nowIso = new Date().toISOString();
    const payload: any = {
      id: targetUserId,
      role: role,
      updated_at: nowIso
    };

    console.log("[set-admin-role] Upserting profile:", payload);

    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
      console.error("[set-admin-role] Upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[set-admin-role] Role set to ${role} for user ${targetUserId}`);

    return new Response(JSON.stringify({ success: true, userId: targetUserId, role }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("[set-admin-role] Fatal error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});