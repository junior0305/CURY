import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    
    const { email, password, role } = await req.json()
    
    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    const user = existingUser.users.find(u => u.email === email)
    
    if (user) {
      // If user exists, just ensure profile is correct
      await supabaseAdmin.from('profiles').update({ role }).eq('id', user.id)
      return new Response(JSON.stringify({ success: true, message: "Admin já existe e foi atualizado." }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, 
      password, 
      email_confirm: true, 
      user_metadata: { first_name: 'Junior', last_name: 'Admin', role }
    })
    
    if (error) throw error
    
    // Explicit update just in case trigger is slow
    await supabaseAdmin.from('profiles').update({ role, email }).eq('id', data.user.id)
    
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    console.error("[create-admin] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})