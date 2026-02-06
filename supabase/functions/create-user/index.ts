import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { email, password, firstName, lastName, role, managerId, teamId } = await req.json()

    // 1. Create the user in Auth
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role, team_id: teamId }
    })

    if (createError) throw createError

    // 2. Update the profile (manager_id, team_id and email explicitly)
    // Small delay for trigger
    await new Promise(resolve => setTimeout(resolve, 800));

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        manager_id: managerId === 'none' ? null : managerId,
        team_id: teamId === 'none' ? null : teamId,
        role: role,
        email: email // Ensure email is saved in the column
      })
      .eq('id', userData.user.id)
    
    if (profileError) console.error("Profile update error:", profileError.message);

    return new Response(JSON.stringify({ success: true, user: userData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})