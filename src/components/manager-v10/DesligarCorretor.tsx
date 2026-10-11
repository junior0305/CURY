// Desligar corretor: o gerente tira da equipe quem saiu, e o Comandra separa a
// carteira em grupos com destino sugerido. O gerente confirma — nada é automático
// (redistribuição automática foi proibida em 05/2026). O usuário não é apagado:
// histórico, vendas e comissão continuam no nome dele; o login é bloqueado.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Colega = { id: string; nome: string; carteira: number; plantao_hoje: boolean; recebe: boolean };
type Previa = { corretor: string; gerente: string | null; quente: number; roleta: number; frio: number;
  vendidos: number; pastas_junix: number; colegas: Colega[] };

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
  const [quentesPara, setQuentesPara] = useState<Set<string>>(new Set());
  const [roletaPara, setRoletaPara] = useState<Set<string>>(new Set());
  const [friosPool, setFriosPool] = useState(true);
  const [indo, setIndo] = useState(false);

  // sugestão: quentes para os 2 primeiros da lista (na roleta, no plantão, carteira leve);
  // o resto para todos que estão recebendo lead
  const naRoleta = useMemo(() => (pv?.colegas ?? []).filter((c) => c.recebe), [pv]);
  useEffect(() => {
    if (!pv) return;
    setQuentesPara(new Set(naRoleta.slice(0, 2).map((c) => c.id)));
    setRoletaPara(new Set(naRoleta.map((c) => c.id)));
  }, [pv, naRoleta]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  const alterna = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  };

  async function desligar() {
    if (!pv) return;
    if (pv.quente && !quentesPara.size) { toast.error("Escolha quem recebe os leads quentes."); return; }
    setIndo(true);
    try {
      const { data: r, error } = await supabase.rpc("desligar_corretor" as any, {
        p_broker: brokerId, p_quentes_para: [...quentesPara], p_roleta_para: [...roletaPara], p_frios_pool: friosPool });
      if (error) throw error;
      // bloqueia o login (camada de auth — só a edge alcança)
      const { data: b } = await supabase.functions.invoke("create-user", { body: { action: "block", userId: brokerId } });
      const res = r as any;
      toast.success(`${pv.corretor} desligado. ${res.quentes} quentes e ${res.roleta} redistribuídos, ${res.pool} foram para o Pescar`
        + (res.ficaram ? ` · ${res.ficaram} ficaram sem destino` : "")
        + ((b as any)?.error ? " · o login não foi bloqueado, peça ao admin" : ""));
      onPronto();
    } catch (e: any) { toast.error(e?.message ?? "Não consegui desligar."); }
    finally { setIndo(false); }
  }

  const chips = (sel: Set<string>, setter: (s: Set<string>) => void, lista: Colega[]) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {lista.map((c) => (
        <button key={c.id} type="button" onClick={() => alterna(sel, setter, c.id)}
          className={`mini${sel.has(c.id) ? " solid" : " key"}`} style={{ padding: "6px 10px" }}>
          {c.nome}<span style={{ opacity: .7, fontWeight: 500 }}>{c.plantao_hoje ? " · plantão" : ""} · {c.carteira}</span>
        </button>
      ))}
      {!lista.length ? <i style={{ fontSize: 12.5, color: "var(--ink-3)" }}>ninguém da equipe está recebendo lead</i> : null}
    </div>
  );
  const bloco = (icone: string, n: number, titulo: string, sub: string, corpo: React.ReactNode) => n ? (
    <div style={{ borderTop: "1px solid var(--hair)", padding: "12px 0" }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{icone} {n} {titulo}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>
      {corpo}
    </div>
  ) : null;

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="dc-t" style={{ maxWidth: 560 }}>
        {isLoading ? <p>Separando a carteira…</p> : error || !pv ? (
          <><h3 id="dc-t">Desligar corretor</h3><p style={{ color: "var(--red)" }}>{(error as any)?.message ?? "Não consegui abrir."}</p>
            <div className="tm-modala"><button className="mini" onClick={onFechar}>Fechar</button></div></>
        ) : (
          <>
            <h3 id="dc-t">Desligar {pv.corretor} — {pv.quente + pv.roleta + pv.frio} leads na carteira</h3>
            <p>O login é bloqueado, ele sai da roleta e das filas. Vendas e histórico continuam no nome dele.</p>

            {bloco("🔥", pv.quente, "quentes", "responderam nos últimos 7 dias, negociação, visita ou documentos — passe para quem vai atender hoje",
              chips(quentesPara, setQuentesPara, pv.colegas.filter((c) => c.recebe || quentesPara.has(c.id))))}
            {bloco("🆕", pv.roleta, "para a roleta", "novos e mornos — vão em rodízio para quem está recebendo lead",
              chips(roletaPara, setRoletaPara, pv.colegas.filter((c) => c.recebe || roletaPara.has(c.id))))}
            {bloco("🧊", pv.frio, "frios", "parados há mais de 15 dias",
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, fontSize: 13.5 }}>
                <input type="checkbox" checked={friosPool} onChange={(e) => setFriosPool(e.target.checked)} />
                mandar para o Pescar (pool) {friosPool ? "" : "— desmarcado: vão para a roleta junto"}</label>)}
            {pv.vendidos ? <p style={{ fontSize: 13, margin: "10px 0 0" }}>✅ {pv.vendidos} vendido{pv.vendidos > 1 ? "s" : ""} ficam com {pv.corretor} no histórico (comissão e relatório).</p> : null}
            {pv.pastas_junix ? <p className="tm-aviso">📁 {pv.pastas_junix} pasta{pv.pastas_junix > 1 ? "s" : ""} no Junix em nome de {pv.corretor} — transfira no Junix; o Comandra não mexe lá.</p> : null}
            {!pv.quente && !pv.roleta && !pv.frio ? <p>A carteira está vazia — é só desligar.</p> : null}
            {pv.roleta && !roletaPara.size ? <p className="tm-aviso">Sem ninguém marcado para a roleta, esses {pv.roleta} leads ficam com {pv.corretor} até você redistribuir na aba Leads.</p> : null}

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
