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
    
    // 1. Tentar listar usuários para encontrar pelo email
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError
    
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (existingUser) {
      console.log(`[create-admin] Resetando usuário existente: ${email}`);
      
      // Forçar atualização de senha e metadados
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { 
          password: password,
          email_confirm: true,
          user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role }
        }
      )
      if (updateError) throw updateError

      // Garantir que o perfil existe e tem o papel correto
      const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({ 
        id: existingUser.id, 
        role: role, 
        email: email,
        first_name: 'Junior',
        last_name: 'Admin'
      })
      if (upsertError) console.error("[create-admin] Erro no upsert do perfil:", upsertError.message)

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Acesso administrativo restaurado! Use a senha padrão." 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Criar novo se não existir
    const { data: newData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, 
      password, 
      email_confirm: true, 
      user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role }
    })
    
    if (createError) throw createError
    
    await supabaseAdmin.from('profiles').upsert({ 
      id: newData.user.id, 
      role: role, 
      email: email,
      first_name: 'Junior',
      last_name: 'Admin'
    })
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Admin criado com sucesso pela primeira vez!" 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error("[create-admin] Erro:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})