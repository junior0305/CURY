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
    
    // 1. Localizar o usuário por e-mail
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError
    
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    // 2. SE EXISTIR, DELETAR COMPLETAMENTE (Limpeza total)
    if (existingUser) {
      console.log(`[create-admin] Limpando usuário antigo: ${email}`);
      
      // Deletar do Auth (isso deve disparar o cascade no banco se as FKs estiverem corretas)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
      if (deleteError) console.error("[create-admin] Erro ao deletar do Auth:", deleteError.message)
      
      // Garantir que saiu do banco (caso o cascade falhe)
      await supabaseAdmin.from('profiles').delete().eq('id', existingUser.id)
      
      // Pequeno delay para o Supabase processar a exclusão
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. CRIAR DO ZERO (Instalação limpa)
    console.log(`[create-admin] Criando nova conta limpa: ${email}`);
    const { data: newData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, 
      password, 
      email_confirm: true, 
      user_metadata: { 
        first_name: 'Junior', 
        last_name: 'Admin', 
        role: role 
      }
    })
    
    if (createError) throw createError

    // 4. CRIAR PERFIL MANUALMENTE (Para não depender apenas do trigger)
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ 
      id: newData.user.id, 
      role: role, 
      email: email, // Se a coluna existir
      first_name: 'Junior',
      last_name: 'Admin',
      updated_at: new Date().toISOString()
    })
    
    if (profileError) {
      // Tentar sem a coluna e-mail caso ela não tenha sido criada no SQL
      await supabaseAdmin.from('profiles').upsert({ 
        id: newData.user.id, 
        role: role, 
        first_name: 'Junior',
        last_name: 'Admin'
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Sistema limpo e recriado com sucesso! Pode logar agora." 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error("[create-admin] Erro Crítico:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})