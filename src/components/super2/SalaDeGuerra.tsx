// Sala de Guerra do Superintendente — 100% no Design System do Cockpit do Gerente
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import PlanoEstrategico from "@/components/plano/PlanoEstrategico";
import GastosPlano from "@/components/plano/GastosPlano";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";
import { useEscopoSuper } from "./escopo";
import "@/styles/cockpit-gerente.css";

const sb = supabase as any;
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
type Aba = "plano" | "verba" | "gastos";

export default function SalaDeGuerra({
  superId,
  superNome,
  abaInicial,
}: {
  superId: string;
  superNome: string;
  abaInicial?: Aba;
}) {
  const { session } = useAuth();
  const [aba, setAba] = useState<Aba>(abaInicial ?? "plano");
  const [desloc, setDesloc] = useState(0);
  const d = new Date();
  const mes = new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
  const nomeMes = (n: number) =>
    new Date(d.getFullYear(), d.getMonth() + n, 1).toLocaleDateString("pt-BR", { month: "long" });

  const { data: consMes } = useConsolidadoSuper(aba === "gastos" && desloc === 0 ? superId : undefined, d.getDate());
  const anuncio = new Map<string, number>(
    consMes ? [[superId, consMes.linhas.reduce((a, l) => a + (l.gasto ?? 0), 0)]] : []
  );

  return (
    <div className="cockpit-v3">
      {/* ── CABEÇALHO DO COCKPIT NO PADRÃO EXECUTIVO ── */}
      <header className="cockpit-v3-header">
        <div className="cockpit-v3-title">
          <h1>🗺️ Estratégia & Sala de Guerra</h1>
          <p>
            Superintendência · Plano estratégico de vendas, aporte de verba e gestão de custos · {superNome}
          </p>
        </div>

        <div className="periodo-bar-v3">
          <button
            type="button"
            className={`periodo-btn-v3 ${desloc === 0 ? "active" : ""}`}
            onClick={() => setDesloc(0)}
          >
            {nomeMes(0)}
          </button>
          <button
            type="button"
            className={`periodo-btn-v3 ${desloc === 1 ? "active" : ""}`}
            onClick={() => setDesloc(1)}
          >
            {nomeMes(1)}
          </button>
        </div>
      </header>

      {/* ── ABAS DE NAVEGAÇÃO INTERNA ── */}
      <div className="origem-pills-bar-v3">
        <button
          type="button"
          className={`origem-pill-btn-v3 ${aba === "plano" ? "active" : ""}`}
          onClick={() => setAba("plano")}
        >
          🎯 Plano Estratégico
        </button>
        <button
          type="button"
          className={`origem-pill-btn-v3 ${aba === "verba" ? "active" : ""}`}
          onClick={() => setAba("verba")}
        >
          💰 Aporte de Verba
        </button>
        <button
          type="button"
          className={`origem-pill-btn-v3 ${aba === "gastos" ? "active" : ""}`}
          onClick={() => setAba("gastos")}
        >
          📉 Gestão de Gastos
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        {aba === "plano" && session?.user?.id ? (
          <PlanoEstrategico raizId={superId} meuId={session.user.id} mes={mes} />
        ) : aba === "verba" ? (
          <Verba superId={superId} superNome={superNome} mes={mes} />
        ) : (
          <GastosPlano raizId={superId} mes={mes} anuncio={anuncio} podeCriarCategoria={false} />
        )}
      </div>
    </div>
  );
}

function Verba({ superId, superNome, mes }: { superId: string; superNome: string; mes: string }) {
  const qc = useQueryClient();
  const { supers } = useEscopoSuper(superId);
  const { data: cons } = useConsolidadoSuper(superId, 30);
  const gerentes = useMemo(
    () =>
      (supers.length === 1 ? supers[0].gerentes : supers.flatMap((s) => s.gerentes)).filter(
        (g) => !/revisor/i.test(g.nome)
      ),
    [supers]
  );
  const [verbaDiretoria, setVerbaDiretoria] = useState(0);
  const [aportes, setAportes] = useState<Record<string, number>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("gastos")
        .select("valor,detalhes")
        .eq("dono_id", superId)
        .eq("mes", mes)
        .eq("categoria", `Aporte Tropa & Verba de Guerra · ${superNome}`)
        .maybeSingle();
      if (!data) return;
      const d = (data.detalhes || {}) as any;
      setVerbaDiretoria(Number(d.verba_diretoria) || 0);
      const ap = (d.aportes || {}) as Record<string, number>;
      setAportes(ap);
      setMarcados(Object.fromEntries(Object.keys(ap).map((k) => [k, true])));
    })();
  }, [superId, superNome, mes]);

  const totalAportes = Object.entries(aportes).reduce(
    (a, [id, v]) => a + (marcados[id] ? Number(v) || 0 : 0),
    0
  );
  const total = (Number(verbaDiretoria) || 0) + totalAportes;

  const gasto30 = (cons?.linhas ?? []).reduce((a, l) => a + (l.gasto ?? 0), 0);
  const vendas30 = (cons?.linhas ?? []).reduce((a, l) => a + (l.vendas ?? 0), 0);
  const leads30 = (cons?.linhas ?? []).reduce((a, l) => a + l.leads.anuncio, 0);
  const custoLead = leads30 && gasto30 ? gasto30 / leads30 : null;
  const custoVenda = vendas30 && gasto30 ? gasto30 / vendas30 : null;

  async function salvar() {
    setSalvando(true);
    const aportesFiltrados = Object.fromEntries(
      Object.entries(aportes).filter(([id]) => marcados[id])
    );
    const { error } = await sb.from("gastos").upsert(
      {
        dono_id: superId,
        mes,
        categoria: `Aporte Tropa & Verba de Guerra · ${superNome}`,
        valor: total,
        detalhes: {
          verba_diretoria: verbaDiretoria,
          aportes: aportesFiltrados,
          total_aportes: totalAportes,
        },
      },
      { onConflict: "dono_id,mes,categoria" }
    );
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verba e aportes salvos!");
    qc.invalidateQueries({ queryKey: ["gastos-plano"] });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
      {/* ── CARD 1: DEFINIÇÃO DE VERBA ── */}
      <section
        style={{
          background: "var(--cv-surface)",
          border: "1px solid var(--cv-border)",
          borderRadius: "var(--cv-radius-md)",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <b style={{ fontSize: 16, color: "var(--cv-text-main)", display: "block" }}>
            💰 Verba de Mídia da Superintendência
          </b>
          <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
            Verba da diretoria e aportes por equipe para anúncios no mês
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--cv-border)" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--cv-text-main)" }}>
            Liberado pela diretoria
          </span>
          <input
            type="number"
            min={0}
            step={500}
            value={verbaDiretoria || ""}
            placeholder="0"
            style={{
              width: 140,
              padding: "6px 12px",
              textAlign: "right",
              border: "1px solid var(--cv-border)",
              borderRadius: 8,
              background: "var(--cv-surface-subtle)",
              color: "var(--cv-text-main)",
              fontFamily: "var(--cv-font-mono, monospace)",
              fontSize: 14,
            }}
            onChange={(e) => setVerbaDiretoria(Number(e.target.value) || 0)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ fontSize: 13, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>
            Aportes das Equipes
          </b>
          {gerentes.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderTop: "1px solid var(--cv-border-subtle)",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!marcados[g.id]}
                  onChange={(e) => setMarcados((m) => ({ ...m, [g.id]: e.target.checked }))}
                />
                <span style={{ color: "var(--cv-text-main)", fontWeight: 500 }}>{g.nome}</span>
              </label>

              <input
                type="number"
                min={0}
                step={100}
                disabled={!marcados[g.id]}
                value={aportes[g.id] || ""}
                placeholder="0"
                style={{
                  width: 130,
                  padding: "5px 10px",
                  textAlign: "right",
                  border: "1px solid var(--cv-border)",
                  borderRadius: 8,
                  background: marcados[g.id] ? "var(--cv-surface-subtle)" : "transparent",
                  color: "var(--cv-text-main)",
                  opacity: marcados[g.id] ? 1 : 0.4,
                  fontFamily: "var(--cv-font-mono, monospace)",
                  fontSize: 13,
                }}
                onChange={(e) => setAportes((a) => ({ ...a, [g.id]: Number(e.target.value) || 0 }))}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "14px 0 0",
            borderTop: "2px solid var(--cv-border)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--cv-text-main)" }}>
            Total de Verba no Mês
          </span>
          <b className="mono" style={{ fontSize: 24, color: "var(--cv-brand)" }}>
            {brl(total)}
          </b>
        </div>

        <button
          type="button"
          className="btn-queima-primario"
          style={{ background: "var(--cv-brand)", marginTop: 6 }}
          onClick={salvar}
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "💾 Salvar Verba & Aportes"}
        </button>
      </section>

      {/* ── CARD 2: PROJEÇÃO DE COMPRA DA VERBA ── */}
      <section
        style={{
          background: "var(--cv-surface)",
          border: "1px solid var(--cv-border)",
          borderRadius: "var(--cv-radius-md)",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <b style={{ fontSize: 16, color: "var(--cv-text-main)", display: "block" }}>
            🎯 Poder de Compra da Verba
          </b>
          <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
            Calculado pelo custo real de conversão das suas equipes nos últimos 30 dias
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "var(--cv-surface-subtle)", padding: 12, borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Gasto no Meta Ads</span>
            <b className="mono" style={{ display: "block", fontSize: 18, marginTop: 4 }}>{brl(gasto30)}</b>
          </div>
          <div style={{ background: "var(--cv-surface-subtle)", padding: 12, borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Vendas no Junix</span>
            <b className="mono" style={{ display: "block", fontSize: 18, marginTop: 4, color: "var(--cv-green)" }}>{vendas30} un</b>
          </div>
          <div style={{ background: "var(--cv-surface-subtle)", padding: 12, borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Custo por Lead (CPL)</span>
            <b className="mono" style={{ display: "block", fontSize: 18, marginTop: 4 }}>{custoLead ? brl(custoLead) : "—"}</b>
          </div>
          <div style={{ background: "var(--cv-surface-subtle)", padding: 12, borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Custo por Venda</span>
            <b className="mono" style={{ display: "block", fontSize: 18, marginTop: 4, color: "var(--cv-brand)" }}>{custoVenda ? brl(custoVenda) : "—"}</b>
          </div>
        </div>

        {total > 0 && custoVenda ? (
          <div
            style={{
              background: "var(--cv-surface-subtle)",
              border: "1px solid var(--cv-brand)",
              borderRadius: 8,
              padding: 14,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--cv-text-main)",
            }}
          >
            Com <b>{brl(total)}</b> e o custo por venda atual de <b>{brl(custoVenda)}</b>, a verba compra cerca de{" "}
            <b style={{ color: "var(--cv-brand)", fontSize: 15 }}>{Math.floor(total / custoVenda)} venda(s)</b> e{" "}
            <b>{custoLead ? Math.floor(total / custoLead) : "—"} leads</b>.
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--cv-text-muted)" }}>
              Para aumentar o volume de vendas sem elevar a verba, o segredo é acelerar o primeiro contato para baixar o custo por venda.
            </p>
          </div>
        ) : total > 0 && custoLead ? (
          <div style={{ background: "var(--cv-surface-subtle)", borderRadius: 8, padding: 14, fontSize: 13.5 }}>
            Com <b>{brl(total)}</b> é possível comprar cerca de <b>{Math.floor(total / custoLead)} leads</b>.
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>
            Preencha a verba liberada ou aportes para visualizar a projeção de fechamentos.
          </p>
        )}
      </section>
    </div>
  );
}
