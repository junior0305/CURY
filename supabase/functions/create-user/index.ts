import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[create-user] Missing environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
      throw new Error("Configuração do servidor incompleta.");
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await req.json();
    const { email, password, firstName, lastName, role, managerId } = body;

    console.log(`[create-user] Attempting to create user: ${email}`);

    if (!email || !password) {
      throw new Error("Email e senha são obrigatórios.");
    }

    // 1. Create the user in Auth
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        first_name: firstName || 'Novo', 
        last_name: lastName || 'Membro', 
        role: role || 'BROKER'
      }
    })

    if (createError) {
      console.error(`[create-user] Auth creation error: ${createError.message}`);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[create-user] User created in Auth: ${userData.user.id}`);

    // 2. Update the profile (trigger usually handles insertion, but we update manager_id)
    // We add a small delay to ensure trigger has finished
    await new Promise(resolve => setTimeout(resolve, 500));

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        manager_id: managerId === 'none' ? null : managerId,
        role: role
      })
      .eq('id', userData.user.id)
    
    if (profileError) {
      console.error(`[create-user] Profile update error: ${profileError.message}`);
      // We don't fail the whole request here as the user is already created
    }

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error(`[create-user] Critical error: ${error.message}`);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})