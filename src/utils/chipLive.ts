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
