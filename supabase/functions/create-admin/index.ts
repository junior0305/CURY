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
    
    // 1. Buscar todos os usuários para encontrar o correto de forma segura
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError
    
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    let userId;

    if (existingUser) {
      console.log(`[create-admin] Atualizando usuário existente: ${email}`);
      userId = existingUser.id;
      
      // Resetar senha e confirmar e-mail agressivamente
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { 
          password: password,
          email_confirm: true,
          user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role }
        }
      )
      if (updateError) throw updateError
    } else {
      console.log(`[create-admin] Criando novo usuário: ${email}`);
      // Criar novo usuário já confirmado
      const { data: newData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, 
        password, 
        email_confirm: true, 
        user_metadata: { first_name: 'Junior', last_name: 'Admin', role: role }
      })
      if (createError) throw createError
      userId = newData.user.id;
    }

    // 2. Sincronização manual do Perfil (Backup do trigger)
    // Isso garante que mesmo que o trigger SQL falhe, o perfil existirá na tabela pública
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ 
      id: userId, 
      role: role, 
      email: email,
      first_name: 'Junior',
      last_name: 'Admin',
      updated_at: new Date().toISOString()
    })
    
    if (profileError) {
      console.error("[create-admin] Erro ao sincronizar perfil:", profileError.message);
      // Se der erro de 'email column not found', tentamos sem a coluna email (caso o SQL não tenha sido rodado)
      if (profileError.message.includes('column "email"')) {
        await supabaseAdmin.from('profiles').upsert({ 
          id: userId, 
          role: role, 
          first_name: 'Junior',
          last_name: 'Admin'
        })
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Sistema sincronizado! Tente o login agora." 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error("[create-admin] Erro Crítico:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})