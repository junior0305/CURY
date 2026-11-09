// Fonte da verdade da conexão do chip do corretor.
//
// `bot_instances.status` é escrito por vários processos (crons, sync, webhook) e
// erra nos dois sentidos — medido em 11/08/2026: de 131 chips, 18 diziam "open"
// estando mortos e 11 diziam "offline" estando vivos.
//
// `real_state` é escrito pelo `check-bot-health` a partir do fetchInstances da
// Evolution e distingue open / logged_out / banned. É o campo que o próprio
// backend já usa como autoridade (`get-whatsapp-qr`, linha 74: deadSession).
//
// Reconexão NÃO espera o cron: o `get-whatsapp-qr` grava `status` E `real_state`
// como 'open' assim que detecta a sessão ativa, e o realtime leva isso pra tela.

export type ChipStateRow = { status?: string | null; real_state?: string | null } | null | undefined;

export function isChipLive(bot: ChipStateRow): boolean {
  if (!bot) return false;
  // real_state manda quando existe; status é fallback pra chip nunca checado.
  if (bot.real_state) return bot.real_state === "open";
  return bot.status === "open";
}

// Colunas mínimas a selecionar de bot_instances pra decidir conexão.
export const CHIP_STATE_COLUMNS = "status, real_state";
/** Colunas do chip que o site pode ler (08/11): a chave da API e o QR ficam só no servidor. */
export const CHIP_COLUNAS = "id,name,phone,evolution_api_url,instance_name,instance_type,is_prospecting,status,health_score,persona_name,persona_style,daily_limit,messages_today,last_message_at,last_health_check,weight,priority,total_messages_sent,total_conversations,conversion_rate,ai_profile_id,created_at,updated_at,notification_only,last_qr_at,team_manager_id,warmup_until,paused_safety_at,paused_safety_reason,evolution_server_id,last_send_at,disconnection_reason_code,disconnection_checked_at,real_state";
