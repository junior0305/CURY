import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { email, password, firstName, lastName, role, managerId, teamId, userId, action } = body

    // ACTION: DELETE USER
    if (action === 'delete') {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (deleteError) throw deleteError
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: UPDATE PASSWORD
    if (action === 'update-password') {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (updateError) throw updateError
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: CREATE USER
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        first_name: firstName, 
        last_name: lastName, 
        role: role,
        team_id: (teamId === 'none' || !teamId) ? null : teamId,
        manager_id: (managerId === 'none' || !managerId) ? null : managerId
      }
    })

    if (createError) throw createError

    // Force creation of profile to ensure it doesn't fail
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userData.user.id,
        first_name: firstName,
        last_name: lastName,
        manager_id: (managerId === 'none' || !managerId) ? null : managerId,
        team_id: (teamId === 'none' || !teamId) ? null : teamId,
        role: role,
        email: email,
        updated_at: new Date().toISOString()
      })
    
    if (profileError) console.error("Profile update error:", profileError.message)

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
