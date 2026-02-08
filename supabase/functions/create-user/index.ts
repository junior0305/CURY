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

    const { email, password, firstName, lastName, role, managerId, teamId, userId, action } = await req.json()

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

    // ACTION: CREATE USER (Existing logic)
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
    const userId = userData.user.id;

    // 2. Pequeno atraso para permitir que o trigger do banco termine (evita race condition)
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Forçar a gravação dos dados corretos na tabela Profiles via UPSERT
    // Preparamos o objeto de dados sem o email primeiro, pois a coluna pode não existir
    const profilePayload: any = {
      id: userId,
      first_name: firstName,
      last_name: lastName,
      role: role,
      manager_id: (managerId === 'none' || !managerId) ? null : managerId,
      team_id: (teamId === 'none' || !teamId) ? null : teamId,
      updated_at: new Date().toISOString()
    };

    console.log(`[create-user] Aplicando upsert no perfil: ${userId}`, profilePayload);

    // Tentamos salvar. Se falhar por causa de coluna inexistente, o catch tratará.
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload);

    if (upsertError) {
      console.error("[create-user] Erro no upsert do perfil:", upsertError.message);
      throw upsertError;
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