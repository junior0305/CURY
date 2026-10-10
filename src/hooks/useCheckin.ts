// Check-in de plantão dos corretores — vem do Contact2Sale (C2S), via
// /sales_stand/attendance_summaries, espelhado em public.c2s_plantao (conector /root/c2s).
// Substitui o check-in que vinha da Cury. c2s_checkins NÃO é check-in: é a visita
// (cliente atendido no estande). Ver memory/reference_contact2sale_api.md.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarPlantao, casarCheckinsComEquipe, type C2SCheckinRow } from "@/utils/c2sMatching";

export type CheckinCorretor = {
  corretor: string;
  gerente: string | null;
  diretor: string | null;
  /** dias com ponto no plantão no período */
  n_checkins: number;
  ultimo: string | null;
  /** estandes onde bateu ponto */
  tipos: string | null;
};

const desdeIso = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString();
const semGerente = (g: string | null | undefined) => (g || "").replace(/^Gerente\s+/i, "").trim() || null;

/** Agrega as linhas do plantão (corretor/estande/dia) em uma por corretor. */
function agregar(rows: C2SCheckinRow[]): CheckinCorretor[] {
  const m = new Map<string, { c: CheckinCorretor; dias: Set<string>; est: Set<string> }>();
  for (const r of rows) {
    const k = (r.corretor || "").trim().toUpperCase();
    if (!k) continue;
    const a = m.get(k) ?? { c: { corretor: r.corretor.trim(), gerente: semGerente(r.gerente), diretor: r.diretor ?? null,
      n_checkins: 0, ultimo: null, tipos: null }, dias: new Set<string>(), est: new Set<string>() };
    a.dias.add(r.created_at.slice(0, 10));
    if (r.tipos) a.est.add(r.tipos);
    if (!a.c.ultimo || r.created_at > a.c.ultimo) a.c.ultimo = r.created_at;
    m.set(k, a);
  }
  return [...m.values()].map(({ c, dias, est }) => ({ ...c, n_checkins: dias.size, tipos: [...est].join(" · ") || null }))
    .sort((a, b) => b.n_checkins - a.n_checkins || (b.ultimo || "").localeCompare(a.ultimo || ""));
}

export function useCheckinResumo(dias: number) {
  return useQuery({
    queryKey: ["c2s-checkin-resumo", dias],
    queryFn: async (): Promise<CheckinCorretor[]> => agregar(await buscarPlantao(desdeIso(dias))),
    staleTime: 5 * 60 * 1000,
  });
}

export type CheckinEquipe = {
  corretor: string;
  n_checkins: number;
  ultimo: string | null;
  tipos: string | null;
};

/** Check-in da equipe de UM gerente: ponto batido sob o nome dele no C2S ou por
 *  corretor da equipe dele no Comandra (de-para por nome, ver c2sMatching). */
export function useCheckinEquipe(managerId: string | undefined, dias: number) {
  return useQuery({
    queryKey: ["c2s-checkin-equipe", managerId, dias],
    enabled: !!managerId,
    queryFn: async (): Promise<CheckinEquipe[]> => {
      const [rows, mgrRes, timeRes] = await Promise.all([
        buscarPlantao(desdeIso(dias)),
        supabase.from("profiles").select("id,first_name,last_name").eq("id", managerId!).maybeSingle(),
        supabase.from("profiles").select("id,first_name,last_name,email").eq("manager_id", managerId!).eq("is_active", true),
      ]);
      const mgr = (mgrRes.data as any) ?? null;
      const casados = new Set(casarCheckinsComEquipe(rows, (timeRes.data ?? []) as any[], mgr).map((x) => x.checkin));
      const meuGerente = (mgr?.first_name || "").trim().toUpperCase();
      return agregar(rows.filter((r) => casados.has(r) || (meuGerente && semGerente(r.gerente)?.toUpperCase() === meuGerente)));
    },
    staleTime: 3 * 60 * 1000,
  });
}
