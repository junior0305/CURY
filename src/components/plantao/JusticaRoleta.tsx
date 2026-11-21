/**
 * JusticaRoleta — "A distribuição está justa?" na tela de Leads do gestor.
 * Por corretor presente: recebeu hoje × respondeu de verdade (falou no WhatsApp) × situação
 * (afogado / sendo pulado / equilibrado) pela média. "Puxar parados" redistribui os leads
 * sem 1º toque entre os presentes (redistribuir_lote). Dado 100% real, sem RPC nova.
 * Ver [[project_represa_noturna]].
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

type Row = { id: string; nome: string | null; recebeu: number; respondeu: number; parados: string[]; sit: "afogado" | "pulado" | "ok" };

export default function JusticaRoleta({ managerId, como }: { managerId: string; como?: string | null }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["justica-roleta", managerId],
    enabled: !!managerId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ rows: Row[]; media: number }> => {
      const { data: bs } = await sb.from("profiles")
        .select("id,first_name,last_seen_at,lead_assignment_enabled,roleta_entrou_em")
        .eq("manager_id", managerId).eq("role", "BROKER").eq("is_active", true);
      const brokers = (bs ?? []) as any[];
      const ids = brokers.map((b) => b.id);
      if (!ids.length) return { rows: [], media: 0 };

      const nb = new Date(Date.now() - 3 * 3600 * 1000);
      const startBR = new Date(Date.UTC(nb.getUTCFullYear(), nb.getUTCMonth(), nb.getUTCDate(), 3, 0, 0)).toISOString();
      const online = Date.now() - 15 * 60_000;

      const { data: ls } = await sb.from("leads")
        .select("id,broker_id,last_broker_whatsapp_at")
        .in("broker_id", ids).gte("created_at", startBR)
        .not("status", "in", "(EXCLUDED,ABANDONED)");
      const leads = (ls ?? []) as any[];

      const presente = (b: any) => leads.some((l) => l.broker_id === b.id)
        || (b.lead_assignment_enabled !== false && !!b.last_seen_at && new Date(b.last_seen_at).getTime() > online);

      const base = brokers.filter(presente).map((b) => {
        const mine = leads.filter((l) => l.broker_id === b.id);
        const respondeu = mine.filter((l) => !!l.last_broker_whatsapp_at).length;
        const parados = mine.filter((l) => !l.last_broker_whatsapp_at).map((l) => l.id);
        return { id: b.id, nome: b.first_name as string | null, recebeu: mine.length, respondeu, parados };
      });
      const media = base.length ? base.reduce((s, x) => s + x.recebeu, 0) / base.length : 0;
      const rows: Row[] = base.map((x) => {
        let sit: Row["sit"] = "ok";
        if (x.recebeu >= media + 4 && x.recebeu > 0 && x.respondeu < x.recebeu * 0.5) sit = "afogado";
        else if (media >= 4 && x.recebeu <= Math.max(1, Math.floor(media - 4))) sit = "pulado";
        return { ...x, sit };
      }).sort((a, b) => (b.sit === "afogado" ? 1 : 0) - (a.sit === "afogado" ? 1 : 0) || b.recebeu - a.recebeu);
      return { rows, media: Math.round(media) };
    },
  });

  const rows = data?.rows ?? [];
  const media = data?.media ?? 0;

  async function puxar(fromId: string, leadIds: string[]) {
    const destino = rows.filter((r) => r.id !== fromId).map((r) => r.id);
    if (!leadIds.length || !destino.length) { toast.info("Sem outro corretor presente pra receber."); return; }
    try {
      const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: leadIds, p_para: destino, p_como: como || null, p_motivo: "Puxar parados — Justiça da roleta" });
      if (error) throw error;
      toast.success(`${(r as any)?.feitos ?? leadIds.length} parado(s) redistribuído(s) entre os presentes.`);
      qc.invalidateQueries({ queryKey: ["justica-roleta", managerId] });
    } catch (e: any) { toast.error(e?.message ?? "Não consegui redistribuir."); }
  }

  if (!managerId) return null;

  return (
    <section className="jr">
      <style>{CSS}</style>
      <div className="jr-h">
        <h2>⚖️ A distribuição está justa?</h2>
        <span>média <b>{media}</b>/corretor presente · "respondeu de verdade" = falou no WhatsApp</span>
      </div>
      {rows.length === 0 ? (
        <p className="jr-empty">Ninguém recebeu lead ainda hoje — sem distribuição pra avaliar.</p>
      ) : (
        <>
          <div className="jr-row jr-head"><span>Corretor</span><span>Recebeu</span><span>Respondeu</span><span>Situação</span><span></span></div>
          {rows.map((r) => (
            <div key={r.id} className={`jr-row${r.sit === "afogado" ? " afog" : r.sit === "pulado" ? " pul" : ""}`}>
              <span className="jr-nm">{r.nome || "corretor"}</span>
              <span className="jr-mono">{r.recebeu}</span>
              <span className={`jr-mono ${r.recebeu > 0 && r.respondeu < r.recebeu * 0.5 ? "jr-vm" : "jr-vd"}`}>● {r.respondeu}</span>
              <span className={`jr-sit ${r.sit}`}>{r.sit === "afogado" ? "afogado" : r.sit === "pulado" ? "sendo pulado" : "equilibrado"}</span>
              <span>{r.parados.length > 0 && <button className="jr-btn" onClick={() => puxar(r.id, r.parados)}>Puxar {r.parados.length} parado{r.parados.length > 1 ? "s" : ""}</button>}</span>
            </div>
          ))}
          <div className="jr-foot">"Recebeu" = leads de hoje na mão dele. "Respondeu de verdade" = quantos ele já falou no WhatsApp (sinal real). <b>Puxar parados</b> tira os sem 1º toque e redistribui entre os presentes.</div>
        </>
      )}
    </section>
  );
}

const CSS = `
  .jr{margin:0 0 16px;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;font-family:inherit}
  .jr-h{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line)}
  .jr-h h2{font-size:16px;font-weight:800;margin:0;color:var(--ink)}
  .jr-h span{font-size:12px;color:var(--ink-3)}
  .jr-empty{padding:18px;color:var(--ink-3);font-size:13px}
  .jr-row{display:grid;grid-template-columns:1.4fr .7fr 1fr 1.1fr auto;gap:10px;align-items:center;padding:11px 18px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink)}
  .jr-head{color:var(--ink-3);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-top:0}
  .jr-row.afog{background:color-mix(in srgb,var(--red) 10%,transparent)}
  .jr-row.pul{background:color-mix(in srgb,var(--amber) 10%,transparent)}
  .jr-nm{font-weight:700;color:var(--ink)}
  .jr-mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
  .jr-vm{color:var(--red)} .jr-vd{color:var(--good)}
  .jr-sit{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;justify-self:start}
  .jr-sit.afogado{background:color-mix(in srgb,var(--red) 16%,transparent);color:var(--red)}
  .jr-sit.pulado{background:color-mix(in srgb,var(--amber) 16%,transparent);color:var(--amber)}
  .jr-sit.ok{background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}
  .jr-btn{background:none;border:1px solid var(--line);border-radius:8px;padding:5px 11px;color:var(--blue);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
  .jr-btn:hover{border-color:var(--blue)}
  .jr-foot{padding:10px 18px 14px;font-size:11.5px;color:var(--ink-3);line-height:1.5}
  @media(max-width:640px){.jr-row{grid-template-columns:1fr auto;gap:6px}.jr-head{display:none}}
`;
