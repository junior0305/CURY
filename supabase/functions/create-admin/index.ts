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
    
    // 1. Verificar se o usuário já existe
    const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError
    
    const existingUser = usersList.users.find(u => u.email === email)
    
    if (existingUser) {
      console.log(`[create-admin] Usuário ${email} já existe. Atualizando senha e metadados...`);
      
      // Atualizar senha e metadados do usuário existente
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { 
          password: password, 
          user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role } 
        }
      )
      if (updateAuthError) throw updateAuthError

      // Garantir que o perfil existe
      await supabaseAdmin.from('profiles').upsert({ 
        id: existingUser.id, 
        role: role, 
        email: email,
        first_name: 'Junior',
        last_name: 'Admin'
      })

      return new Response(JSON.stringify({ success: true, message: "Acesso administrativo restaurado com sucesso." }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 2. Criar novo usuário se não existir
    const { data: newData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, 
      password, 
      email_confirm: true, 
      user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role }
    })
    
    if (createError) throw createError
    
    // Criar perfil explicitamente
    await supabaseAdmin.from('profiles').upsert({ 
      id: newData.user.id, 
      role: role, 
      email: email,
      first_name: 'Junior',
      last_name: 'Admin'
    })
    
    return new Response(JSON.stringify({ success: true, message: "Admin criado com sucesso." }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    console.error("[create-admin] Erro crítico:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})