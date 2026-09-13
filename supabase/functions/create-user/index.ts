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
    const { email, password, firstName, lastName, role, managerId, teamId, userId, action, phone, leadAssignmentEnabled, botInstanceId } = body

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
        phone: phone,
        team_id: (teamId === 'none' || !teamId) ? null : teamId,
        manager_id: (managerId === 'none' || !managerId) ? null : managerId
      }
    })

    if (createError) throw createError

    // Auto-cria bot_instance para BROKER ou MANAGER se não foi passado botInstanceId
    let resolvedBotInstanceId = (botInstanceId === 'none' || !botInstanceId) ? null : botInstanceId;

    if ((role === 'BROKER' || role === 'MANAGER') && !resolvedBotInstanceId) {
      const instanceName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

      const { data: existingBot } = await supabaseAdmin
        .from('bot_instances')
        .select('id')
        .eq('instance_name', instanceName)
        .maybeSingle();

      if (existingBot?.id) {
        resolvedBotInstanceId = existingBot.id;
        console.log(`[create-user] bot_instance existente reutilizada: ${instanceName} (${existingBot.id})`);
      } else {
        // Qual servidor Evolution esta instância vai morar. Antes isto não era
        // resolvido: a instância nascia com evolution_server_id NULL, e sem
        // servidor o QR não tem onde ser gerado — o corretor ficava travado.
        // Preferência: o servidor onde já está a MAIORIA da equipe do gerente
        // (mantém o time junto e a carga previsível); se não der, o servidor de
        // qualquer instância de referência.
        let serverId: string | null = null;
        const mgrId = (managerId === 'none' || !managerId) ? null : managerId;
        if (mgrId) {
          const { data: irmaos } = await supabaseAdmin
            .from('profiles')
            .select('bot_instances!bot_instance_id(evolution_server_id)')
            .eq('manager_id', mgrId)
            .not('bot_instance_id', 'is', null);
          const contagem = new Map<string, number>();
          for (const row of (irmaos ?? [])) {
            const sid = (row as any)?.bot_instances?.evolution_server_id;
            if (sid) contagem.set(sid, (contagem.get(sid) ?? 0) + 1);
          }
          let melhor = 0;
          for (const [sid, n] of contagem) if (n > melhor) { melhor = n; serverId = sid; }
        }

        const { data: refBot } = await supabaseAdmin
          .from('bot_instances')
          .select('evolution_api_url, evolution_api_key, evolution_server_id')
          .not('evolution_api_url', 'is', null)
          .not('evolution_server_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (!serverId) serverId = refBot?.evolution_server_id ?? null;

        if (refBot?.evolution_api_url) {
          const { data: newBot } = await supabaseAdmin
            .from('bot_instances')
            .insert({
              name: instanceName,
              instance_name: instanceName,
              phone: phone || null,
              evolution_api_url: refBot.evolution_api_url,
              evolution_api_key: refBot.evolution_api_key,
              evolution_server_id: serverId,
              team_manager_id: mgrId,
              status: 'active',
              weight: 50,
              priority: 5,
              health_score: 100,
              instance_type: 'prospecting',
              persona_style: 'formal',
            })
            .select('id')
            .single();

          if (newBot?.id) {
            resolvedBotInstanceId = newBot.id;
            console.log(`[create-user] bot_instance criada: ${instanceName} (${newBot.id})`);
          }
        } else {
          console.warn(`[create-user] Nenhuma instância de referência encontrada para copiar credenciais Evolution API`);
        }
      }
    }

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
        phone: phone,
        lead_assignment_enabled: leadAssignmentEnabled || false,
        bot_instance_id: resolvedBotInstanceId,
        must_change_password: (role === 'BROKER' || role === 'MANAGER'),
        updated_at: new Date().toISOString()
      })

    // Antes isto era só um console.error e a função devolvia success:true — o
    // admin via "usuário criado" com o perfil pela metade. Se o perfil não
    // gravou, o cadastro NÃO deu certo e quem cadastrou precisa saber.
    if (profileError) {
      console.error("[create-user] falha ao gravar o perfil:", profileError.message)
      // O usuário de auth já existe neste ponto. Se ele ficasse pra trás, a
      // segunda tentativa esbarraria em "e-mail já cadastrado" e a pessoa
      // ficaria sem saída. Desfaz e deixa o cadastro repetível.
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id).catch(() => {})
      throw new Error(`Cadastro desfeito: o perfil não gravou (${profileError.message}). Tente de novo.`)
    }

    return new Response(JSON.stringify({ success: true, user: userData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    const msg: string = error?.message || String(error);
    console.error("[create-user] erro:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})