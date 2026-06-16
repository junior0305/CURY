import { supabase } from "./client";

/**
 * Soma vendas/visitas lançadas pela SECRETÁRIA (dados de PDV/plantão) para um conjunto
 * de corretores, no período [startISO, endISO).
 *
 * As vendas já vêm DEDUPLICADAS no banco (removidas as que já existem como lead CONCLUDED),
 * então o resultado pode ser somado direto à contagem de leads sem dupla contagem.
 *
 * `entry_date` é DATE — comparamos por data (YYYY-MM-DD).
 */
export async function getSecretaryCounts(
  brokerIds: string[],
  startISO: string,
  endISO: string,
): Promise<{ vendas: number; visitas: number }> {
  if (!brokerIds || brokerIds.length === 0) return { vendas: 0, visitas: 0 };
  const startDate = startISO.slice(0, 10);
  const endDate = endISO.slice(0, 10);
  const { data } = await supabase
    .from("secretary_quick_entries")
    .select("entry_type, quantity")
    .in("broker_id", brokerIds)
    .in("entry_type", ["venda", "visita"])
    .gte("entry_date", startDate)
    .lt("entry_date", endDate);
  let vendas = 0;
  let visitas = 0;
  for (const r of data || []) {
    if (r.entry_type === "venda") vendas += r.quantity || 0;
    else if (r.entry_type === "visita") visitas += r.quantity || 0;
  }
  return { vendas, visitas };
}
