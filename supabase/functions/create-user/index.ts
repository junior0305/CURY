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
    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { email, password, firstName, lastName, role, managerId } = await req.json()

    console.log(`[create-user] Creating user: ${email} with role ${role}`)

    // 1. Create the user in Auth
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        first_name: firstName, 
        last_name: lastName, 
        role 
      }
    })

    if (createError) throw createError

    // 2. Update the profile (the trigger handles creation, but we might need to update manager_id)
    if (managerId) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ manager_id: managerId })
        .eq('id', userData.user.id)
      
      if (profileError) throw profileError
    }

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error(`[create-user] Error: ${error.message}`)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})