
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lead } from "@/types/lead";

// Função utilitária para checar e conceder recompensas
export async function checkAndAwardAchievements(lead: Lead, actionType: 'SALE' | 'VISIT' | 'DOCS', brokerId: string) {
  try {
    // 1. Buscar regras ATIVAS para esse tipo de ação
    const { data: rules } = await supabase
      .from('reward_configs')
      .select('*')
      .eq('is_active', true)
      .eq('action_type', actionType);

    if (!rules || rules.length === 0) return;

    // 2. Para cada regra, verificar se o corretor atingiu a meta
    for (const rule of rules) {
      // Se a meta for 1, o prêmio é instantâneo (comportamento padrão)
      if (rule.target_count <= 1) {
        await awardAchievement(rule, brokerId);
      } else {
        // Se a meta for > 1 (ex: A cada 3 vendas), precisamos contar o histórico
        // Contamos quantos leads desse corretor atingiram esse status
        const statusMap: Record<string, string> = { 'SALE': 'CONCLUDED', 'VISIT': 'VISIT_SCHEDULED', 'DOCS': 'DOCS_REQUESTED' };
        const targetStatus = statusMap[actionType];

        // Usar a tabela de histórico de funil para contagem precisa
        const { count } = await supabase
          .from('funnel_history')
          .select('*', { count: 'exact', head: true })
          .eq('broker_id', brokerId)
          .eq('stage', targetStatus);
        
        // Se o total for múltiplo da meta (ex: 3, 6, 9...), concede o prêmio
        // Nota: Isso assume que a função é chamada logo APÓS o novo evento ser registrado
        if (count && count > 0 && count % rule.target_count === 0) {
          await awardAchievement(rule, brokerId);
        }
      }
    }
  } catch (error) {
    console.error("[Gamification] Erro ao processar recompensas:", error);
  }
}

async function awardAchievement(rule: any, brokerId: string) {
  // Evitar duplicidade de inserção rápida
  const { error } = await supabase.from('achievements').insert({
    profile_id: brokerId,
    rule_id: rule.id,
    reward_label: rule.label,
    reward_value: rule.amount_value,
    action_type: rule.action_type, // Corrigido nome da coluna
    status: 'PENDING' // Sempre requer aprovação do admin
  });

  if (!error) {
    toast.success(`Parabéns! Meta batida: ${rule.label}`);
  }
}
