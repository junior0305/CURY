/* Dados da equipe para o Hoje e o funil do Resultado (20/10) — as mesmas contas nas duas telas.
 * leads (gerente ou corretor da equipe), origem por cliente (pastas/vendas do Junix só trazem o nome),
 * visitas que o corretor marcou "Veio", plantão C2S (check-ins e visitas) e vendas confirmadas do Junix. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useManagerV10 } from "@/hooks/useManagerV10";
import { chaveNome } from "@/hooks/useDiretoria";
import { diaSP } from "@/hooks/usePeriodo";
import { ehTeste } from "@/lib/situacaoLead";

export type LeadH = {
  id: string; name: string | null; status: string | null; source: string | null; broker_id: string | null;
  created_at: string; last_broker_whatsapp_at: string | null; last_lead_response_at: string | null;
  last_interaction_at: string | null; contact_attempts: number | null;
  fb_campaign?: string | null; tag?: string | null;
};
export type Origem = "anuncio" | "disparo" | "pescado" | "outro" | "plantao" | "sem";
export const ORIGENS: { k: Origem; nome: string; cor: string }[] = [
  { k: "anuncio", nome: "Anúncio", cor: "#1F5C9E" },
  { k: "disparo", nome: "Disparo", cor: "#0E7C7B" },
  { k: "pescado", nome: "Pescaria", cor: "#B7791F" },
  { k: "outro", nome: "Outros", cor: "#7B8BA3" },
  { k: "plantao", nome: "Plantão C2S", cor: "#2A3E5C" },
  { k: "sem", nome: "Origem não identificada", cor: "#C9D2DE" },
];
/** de onde veio o lead: anúncio, disparo, pescaria ou outro (secretária, indicação, manual…) */
export function origemDe(l: { source?: string | null; fb_campaign?: string | null; tag?: string | null }): Origem {
  const src = (l.source ?? "").toLowerCase();
  const tag = (l.fb_campaign ?? l.tag ?? "").toUpperCase();
  if (src.startsWith("disparo") || src === "wa_oficial" || src === "campaign" || tag.startsWith("DISPARO") || tag === "BASE OFICIAL") return "disparo";
  if (src === "cold_pool") return "pescado";
  if (src.startsWith("facebook") || src.startsWith("fb") || src.startsWith("google") || src.startsWith("tiktok") || src === "instagram") return "anuncio";
  return "outro";
}
export const chaveCliente = (n: string | null | undefined) => (n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1).slice(0, 2).join(" ");

export function useDadosEquipe(managerId: string, desde: string) {
  const { data: v10 } = useManagerV10(managerId);
  // ── leads da equipe (manager_id ou corretor da equipe) ──
  const { data: leads = [] } = useQuery<LeadH[]>({
    queryKey: ["hoje-leads", managerId, desde],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: bs } = await supabase.from("profiles").select("id").eq("manager_id", managerId).eq("role", "BROKER");
      const ids = (bs ?? []).map((b: any) => b.id);
      const out: LeadH[] = [];
      for (let a = 0; ; a += 1000) {
        let q = supabase.from("leads")
          .select("id,name,status,source,broker_id,created_at,last_broker_whatsapp_at,last_lead_response_at,last_interaction_at,contact_attempts,fb_campaign,tag")
          .gte("created_at", `${desde}T03:00:00Z`).neq("status", "EXCLUDED");
        q = ids.length ? q.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : q.eq("manager_id", managerId);
        const { data, error } = await q.order("created_at", { ascending: false }).range(a, a + 999);
        if (error) throw error;
        out.push(...((data ?? []) as LeadH[]));
        if (!data || data.length < 1000) break;
      }
      return out.filter((l) => !ehTeste(l));
    },
  });

  // ── origem por cliente (para pastas e vendas do Junix, que só trazem o nome) e visitas marcadas "Veio" ──
  const { data: origens } = useQuery({
    queryKey: ["hoje-origens", managerId, desde],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: bs } = await supabase.from("profiles").select("id").eq("manager_id", managerId).eq("role", "BROKER");
      const ids = (bs ?? []).map((b: any) => b.id);
      const corte = new Date(Date.now() - 200 * 864e5).toISOString();
      const porNome = new Map<string, Origem>();
      const porId = new Map<string, Origem>();
      const brokerDe = new Map<string, string | null>();
      for (let a = 0; ; a += 1000) {
        let q = supabase.from("leads").select("id,name,source,fb_campaign,tag,broker_id").gte("created_at", corte);
        q = ids.length ? q.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : q.eq("manager_id", managerId);
        const { data } = await q.range(a, a + 999);
        for (const l of (data ?? []) as any[]) {
          const o = origemDe(l);
          porId.set(l.id, o);
          brokerDe.set(l.id, l.broker_id ?? null);
          const k = chaveCliente(l.name);
          if (k && !porNome.has(k)) porNome.set(k, o);
        }
        if (!data || data.length < 1000) break;
      }
      // visita registrada no Comandra: o corretor marcou a fase "Veio" no painel
      const { data: notas } = await supabase.from("lead_notes").select("lead_id,created_at").eq("content", "Fase · Veio").gte("created_at", `${desde}T03:00:00Z`).limit(2000);
      const visitas = ((notas ?? []) as any[]).filter((n) => porId.has(n.lead_id)).map((n) => ({ dia: diaSP(new Date(n.created_at)), origem: porId.get(n.lead_id) as Origem, brokerId: brokerDe.get(n.lead_id) ?? null }));
      return { porNome, visitas };
    },
  });

  // ── plantão (C2S): check-ins e visitas por dia ──
  const { data: metricas = [] } = useQuery({
    queryKey: ["hoje-metricas", managerId, desde],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: eu } = await supabase.from("cury_pessoas").select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId).maybeSingle();
      const gid = (eu as any)?.cury_id;
      if (!gid) return [] as { data: string; checkins: number; atendimentos: number }[];
      const { data } = await supabase.from("cury_metricas_diarias").select("data,checkins,atendimentos")
        .eq("escopo", "corretor").eq("gerente_cury_id", gid).gte("data", desde);
      return (data ?? []) as { data: string; checkins: number; atendimentos: number }[];
    },
  });
  // ── vendas confirmadas no Junix (corretores da equipe), desde o início da 1ª semana do mês ──
  const brokers = v10?.brokers ?? [];
  const { data: vendas = [] } = useQuery({
    queryKey: ["hoje-vendas", managerId, desde, brokers.length],
    enabled: brokers.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("junix_vendas" as any).select("corretor,data_venda,vgv,fora_do_placar").gte("data_venda", desde);
      const chaves = new Set(brokers.map((b) => chaveNome(b.first_name)));
      return ((data ?? []) as any[]).filter((v) => !v.fora_do_placar && chaves.has(chaveNome(String(v.corretor ?? "").split(" ")[0])))
        .map((v) => ({ dia: String(v.data_venda).slice(0, 10), vgv: Number(v.vgv) || 0, corretor: chaveNome(String(v.corretor ?? "").split(" ")[0]) }));
    },
  });

  return { v10, brokers, leads, origens, metricas, vendas };
}
