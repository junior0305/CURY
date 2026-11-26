// Desligar corretor: o gerente tira da equipe quem saiu e escolhe UM destino pra toda a carteira.
// Destinos: Roleta · Corretores específicos · Pescaria · Ligação (discador) · Disparo (WhatsApp).
// Ligação e Disparo só habilitam se a função estiver configurada (tem_ligacao / tem_disparo).
// Nada é automático; o login é bloqueado mas histórico/vendas/comissão continuam no nome dele.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Colega = { id: string; nome: string; carteira: number; plantao_hoje: boolean; recebe: boolean };
type Previa = { corretor: string; gerente: string | null; quente: number; roleta: number; frio: number;
  vendidos: number; pastas_junix: number; tem_ligacao: boolean; tem_disparo: boolean; colegas: Colega[] };

type Destino = "roleta" | "especificos" | "pescaria" | "ligacao" | "disparo";

export default function DesligarCorretor({ brokerId, onFechar, onPronto }: {
  brokerId: string; onFechar: () => void; onPronto: () => void;
}) {
  const { data: pv, error, isLoading } = useQuery({
    queryKey: ["preview-desligar", brokerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_desligar" as any, { p_broker: brokerId });
      if (error) throw error;
      return data as Previa;
    },
  });
  const [destino, setDestino] = useState<Destino>("roleta");
  const [corretores, setCorretores] = useState<Set<string>>(new Set());
  const [indo, setIndo] = useState(false);

  const total = (pv?.quente ?? 0) + (pv?.roleta ?? 0) + (pv?.frio ?? 0);
  const naRoleta = useMemo(() => (pv?.colegas ?? []).filter((c) => c.recebe), [pv]);

  useEffect(() => { // sugere o time que está recebendo quando escolhe específicos/ligação
    if ((destino === "especificos" || destino === "ligacao") && !corretores.size)
      setCorretores(new Set(naRoleta.map((c) => c.id)));
  }, [destino, naRoleta]); // eslint-disable-line

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  const alterna = (id: string) => { const n = new Set(corretores); n.has(id) ? n.delete(id) : n.add(id); setCorretores(n); };
  const precisaCorretor = destino === "especificos" || destino === "ligacao";

  async function desligar() {
    if (!pv) return;
    if (total > 0 && precisaCorretor && !corretores.size) { toast.error("Escolha pelo menos um corretor."); return; }
    setIndo(true);
    try {
      const { data: r, error } = await supabase.rpc("desligar_corretor" as any, {
        p_broker: brokerId, p_destino: destino, p_corretores: precisaCorretor ? [...corretores] : null });
      if (error) throw error;
      const { data: b } = await supabase.functions.invoke("create-user", { body: { action: "block", userId: brokerId } });
      const res = r as any;
      const rot: Record<string, string> = { roleta: "foram para a roleta", especificos: "foram para os corretores escolhidos", ligacao: "foram para o discador dos escolhidos", pescaria: "voltaram para o Pescar (pool)", disparo: "entraram num disparo (rascunho)" };
      toast.success(`${pv.corretor} desligado. ${res.leads} lead(s) ${rot[destino]}`
        + (res.ficaram ? ` · ${res.ficaram} ficaram sem destino` : "")
        + (destino === "disparo" ? " — finalize em Disparar." : "")
        + ((b as any)?.error ? " · login não bloqueado, peça ao admin" : ""));
      onPronto();
    } catch (e: any) { toast.error(e?.message ?? "Não consegui desligar."); }
    finally { setIndo(false); }
  }

  const OPCOES: { k: Destino; ic: string; t: string; sub: string; off?: boolean; offMsg?: string }[] = [
    { k: "roleta", ic: "🔄", t: "Roleta da equipe", sub: "divide entre todos que estão recebendo lead (plantão)" },
    { k: "especificos", ic: "👤", t: "Corretores específicos", sub: "você escolhe quem recebe" },
    { k: "pescaria", ic: "🎣", t: "Pescaria (pool)", sub: "voltam pro pool pra quem pescar" },
    { k: "ligacao", ic: "📞", t: "Ligação (discador)", sub: "os escolhidos ligam pelo discador", off: !pv?.tem_ligacao, offMsg: "configure o discador primeiro" },
    { k: "disparo", ic: "📢", t: "Disparo (WhatsApp)", sub: "cria um disparo com esses leads", off: !pv?.tem_disparo, offMsg: "configure um número de WhatsApp primeiro" },
  ];

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="dc-t" style={{ maxWidth: 560 }}>
        {isLoading ? <p>Separando a carteira…</p> : error || !pv ? (
          <><h3 id="dc-t">Desligar corretor</h3><p style={{ color: "var(--red)" }}>{(error as any)?.message ?? "Não consegui abrir."}</p>
            <div className="tm-modala"><button className="mini" onClick={onFechar}>Fechar</button></div></>
        ) : (
          <>
            <h3 id="dc-t">Desligar {pv.corretor} — {total} lead{total !== 1 ? "s" : ""} na carteira</h3>
            <p>O login é bloqueado, ele sai da roleta e das filas. Vendas e histórico continuam no nome dele.</p>

            {total > 0 ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, margin: "10px 0 6px" }}>Para onde vão os {total} leads?</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {OPCOES.map((o) => (
                    <button key={o.k} type="button" disabled={o.off} onClick={() => !o.off && setDestino(o.k)}
                      className={`dc-opt${destino === o.k ? " on" : ""}`}
                      style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                        border: `1px solid ${destino === o.k && !o.off ? "var(--brand,#2563EB)" : "var(--hair,#e2e8f0)"}`,
                        background: destino === o.k && !o.off ? "var(--brand-soft,#eff4ff)" : "var(--card,#fff)",
                        opacity: o.off ? .5 : 1, cursor: o.off ? "not-allowed" : "pointer" }}>
                      <span style={{ fontSize: 18 }}>{o.ic}</span>
                      <span style={{ flex: 1 }}>
                        <b style={{ fontSize: 13.5 }}>{o.t}</b>
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-3,#64748b)" }}>{o.off ? `🔒 ${o.offMsg}` : o.sub}</span>
                      </span>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${destino === o.k && !o.off ? "var(--brand,#2563EB)" : "var(--hair,#cbd5e1)"}`, background: destino === o.k && !o.off ? "var(--brand,#2563EB)" : "transparent" }} />
                    </button>
                  ))}
                </div>

                {precisaCorretor && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 4 }}>Quem recebe:</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(pv.colegas.filter((c) => c.recebe || corretores.has(c.id))).map((c) => (
                        <button key={c.id} type="button" onClick={() => alterna(c.id)}
                          className={`mini${corretores.has(c.id) ? " solid" : " key"}`} style={{ padding: "6px 10px" }}>
                          {c.nome}<span style={{ opacity: .7, fontWeight: 500 }}>{c.plantao_hoje ? " · plantão" : ""} · {c.carteira}</span>
                        </button>
                      ))}
                      {!pv.colegas.filter((c) => c.recebe || corretores.has(c.id)).length ? <i style={{ fontSize: 12.5, color: "var(--ink-3)" }}>ninguém da equipe está recebendo lead</i> : null}
                    </div>
                  </div>
                )}

                {pv.quente > 0 && (destino === "pescaria" || destino === "disparo") ? (
                  <p className="tm-aviso" style={{ marginTop: 10 }}>⚠️ {pv.quente} lead{pv.quente > 1 ? "s" : ""} quente{pv.quente > 1 ? "s" : ""} (negociação/visita/respondeu) também {destino === "pescaria" ? "vão pro pool" : "entram no disparo"} — tem certeza? Normalmente esses vão pra um corretor.</p>
                ) : null}
              </>
            ) : <p>A carteira está vazia — é só desligar.</p>}

            {pv.vendidos ? <p style={{ fontSize: 13, margin: "10px 0 0" }}>{pv.vendidos} vendido{pv.vendidos > 1 ? "s" : ""} ficam com {pv.corretor} no histórico (comissão e relatório).</p> : null}
            {pv.pastas_junix ? <p className="tm-aviso">{pv.pastas_junix} pasta{pv.pastas_junix > 1 ? "s" : ""} no Junix em nome de {pv.corretor} — transfira no Junix; o Comandra não mexe lá.</p> : null}

            <div className="tm-modala">
              <button className="mini" onClick={onFechar}>Cancelar</button>
              <button className="mini solid" disabled={indo} onClick={desligar}
                style={{ background: "var(--red)", borderColor: "var(--red)" }}>
                {indo ? "desligando…" : `Desligar ${pv.corretor}`}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
