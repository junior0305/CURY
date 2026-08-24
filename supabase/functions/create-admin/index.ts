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
    
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError
    
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
      if (deleteError) console.error("[create-admin] Erro ao deletar:", deleteError.message)
      await supabaseAdmin.from('profiles').delete().eq('id', existingUser.id)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const { data: newData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { first_name: 'Junior', last_name: 'Admin', role }
    })
    if (createError) throw createError

    await supabaseAdmin.from('profiles').upsert({
      id: newData.user.id, role, email,
      first_name: 'Junior', last_name: 'Admin',
      updated_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({ success: true, message: "Conta criada com sucesso!" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }
})