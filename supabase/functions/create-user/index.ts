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

    // 1. Criar o usuário no Auth
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role, team_id: teamId }
    })

    if (createError) throw createError

    // 2. Usar UPSERT em vez de UPDATE para garantir que a linha exista com os dados corretos
    // Isso evita o problema de "não salvou" caso o trigger demore ou falhe
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
    
    if (profileError) {
      console.error("[create-user] Erro ao gravar perfil:", profileError.message);
      // Tentativa de fallback sem a coluna email se ela não existir no esquema
      if (profileError.message.includes('column "email"')) {
        await supabaseAdmin.from('profiles').upsert({
          id: userData.user.id,
          first_name: firstName,
          last_name: lastName,
          manager_id: (managerId === 'none' || !managerId) ? null : managerId,
          team_id: (teamId === 'none' || !teamId) ? null : teamId,
          role: role
        })
      }
    }

    return new Response(JSON.stringify({ success: true, user: userData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error("[create-user] Erro Crítico:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})