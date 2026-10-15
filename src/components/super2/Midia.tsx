// Mídia e Anúncios da Superintendência — 100% no Design System do Cockpit do Gerente
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper } from "./Periodo";
import "@/styles/cockpit-gerente.css";

const sb = supabase as any;
const brl = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
const brl2 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + n.toFixed(2).replace(".", ","));

type Conta = {
  dono: string;
  donoId: string;
  conta: string;
  gasto: number;
  saldo: string | null;
  campanhas: any[];
  fora_regiao?: number;
  sem_toque?: number;
  alertas?: any[];
};

export default function Midia({ superId }: { superId: string }) {
  const { supers } = useEscopoSuper(superId);
  const p = usePeriodoSuper("7d");
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const donos = useMemo(
    () => [...supers.map((s) => ({ id: s.id, nome: s.nome })), ...gerentes.map((g) => ({ id: g.id, nome: g.nome }))],
    [supers, gerentes]
  );
  const [aberta, setAberta] = useState<Record<string, boolean>>({});

  const { data: contas, isLoading } = useQuery({
    queryKey: ["s2-midia", superId, p.janela.de, p.janela.ate, donos.length],
    enabled: donos.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: saudeRows } = await supabase.from("fb_saude" as any).select("account_id,dados");
      const saudeMap = new Map((saudeRows ?? []).map((r: any) => [r.account_id, r.dados]));

      const r = await Promise.all(
        donos.map(async (d) => {
          const { data } = await supabase.functions.invoke("fb-conta-gerente", {
            body: { owner_id: d.id, de: p.janela.de, ate: p.janela.ate },
          });
          const x = data as any;
          if (!x || x.semConta || x.error) return null;
          const campanhas = (x.campanhas ?? [])
            .map((c: any) => ({ ...c, resultado: Number(c.leads || 0) + Number(c.conversas || 0) }))
            .filter((c: any) => Number(c.gasto) > 0 || c.ativa)
            .sort((a: any, b: any) => Number(b.gasto) - Number(a.gasto));

          const saudeDados = saudeMap.get(x.conta);
          const fora_regiao = saudeDados?.comandra?.fora_regiao ?? 0;
          const sem_toque = saudeDados?.comandra?.sem_toque ?? 0;
          const alertas = saudeDados?.alertas ?? [];

          return {
            dono: d.nome,
            donoId: d.id,
            conta: x.conta,
            gasto: Number(x.gasto || 0),
            saldo: x.saldo ?? null,
            campanhas,
            fora_regiao,
            sem_toque,
            alertas,
          } as Conta;
        })
      );
      return (r.filter(Boolean) as Conta[]).sort((a, b) => b.gasto - a.gasto);
    },
  });

  const gasto = (contas ?? []).reduce((a, c) => a + c.gasto, 0);
  const todas = (contas ?? []).flatMap((c) => c.campanhas.map((x: any) => ({ ...x, dono: c.dono })));
  const res = todas.reduce((a, c) => a + c.resultado, 0);
  const form = todas.reduce((a, c) => a + Number(c.leads || 0), 0);
  const conv = todas.reduce((a, c) => a + Number(c.conversas || 0), 0);
  const totalForaRegiao = (contas ?? []).reduce((a, c) => a + (c.fora_regiao ?? 0), 0);
  const media = res ? gasto / res : null;
  const ativas = todas.filter((c) => c.ativa).length;

  const copiarPedidoGestor = (c: Conta) => {
    const txt = `Olá! Preciso de um ajuste na conta de anúncios ${c.conta} (${c.dono}):\n${
      (c.fora_regiao ?? 0) > 0 ? `• Tivemos ${c.fora_regiao} leads com DDD fora da região. Favor revisar a segmentação geográfica e exclusões.\n` : ""
    }• Gasto no período: ${brl(c.gasto)} para ${c.campanhas.reduce((a, x) => a + x.resultado, 0)} leads. Favor analisar as campanhas com CPL elevado.`;
    navigator.clipboard?.writeText(txt).then(
      () => toast.success("Pedido técnico copiado! Envie no WhatsApp do gestor de tráfego."),
      () => toast.error("Não consegui copiar.")
    );
  };

  const cobrarGerenteMidia = async (c: Conta) => {
    const { data: pData } = await sb.from("profiles").select("phone").eq("id", c.donoId).maybeSingle();
    const fone = String(pData?.phone ?? "").replace(/\D/g, "");
    const msg = `Fala ${c.dono.split(" ")[0]}, olhando a conta de anúncios da sua equipe:\n• Gasto no período: ${brl(c.gasto)}\n• Leads que entraram: ${c.campanhas.reduce((a, x) => a + x.resultado, 0)}\n${
      (c.fora_regiao ?? 0) > 0 ? `• ${c.fora_regiao} leads vieram com DDD fora da região (desperdício de verba)\n` : ""
    }${(c.sem_toque ?? 0) > 0 ? `• ${c.sem_toque} leads estão sem primeiro contato há +24h na equipe!\n` : ""}Vamos alinhar isso hoje com a equipe e com o gestor de tráfego?`;

    if (fone) {
      window.open(`https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}?text=${encodeURIComponent(msg)}`, "_blank");
      toast.success(`Mensagem aberta para ${c.dono}!`);
    } else {
      toast.info(`${c.dono} não tem telefone cadastrado.`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── CABEÇALHO DO BLOCO DE MÍDIA ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--cv-text-main)" }}>
            Saúde dos Anúncios & Contas Meta Ads
          </h2>
          <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>
            Contas de anúncio das suas equipes sincronizadas ao vivo com o Facebook · {p.texto}
          </span>
        </div>

        <div className="periodo-bar-v3">
          {(["hoje", "7d", "30d"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`periodo-btn-v3 ${p.per === k ? "active" : ""}`}
              onClick={() => p.setPer(k)}
            >
              {k === "hoje" ? "Hoje" : k === "7d" ? "7 dias" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {/* ── PLACAR HERO DE MÍDIA ── */}
      <section className="hero-placar-v3">
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Gasto em Anúncios</span>
          <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
            {isLoading ? "…" : brl(gasto)}
          </div>
          <span className="kpi-sub-v3">
            {(contas ?? []).length} conta(s) · <b style={{ color: "var(--cv-brand)" }}>{ativas} ativas</b>
          </span>
        </div>

        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Leads do Facebook</span>
          <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
            {isLoading ? "…" : res}
          </div>
          <span className="kpi-sub-v3">
            {form} formulários · {conv} conversas no WhatsApp
          </span>
        </div>

        <div className="kpi-card-v3 destaque">
          <span className="kpi-title-v3">Custo Médio por Lead (CPL)</span>
          <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-brand)" }}>
            {isLoading ? "…" : brl2(media)}
          </div>
          <span className="kpi-sub-v3">
            média de custo por cadastro nas equipes
          </span>
        </div>

        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Leads com DDD Fora</span>
          <div
            className="kpi-val-v3 mono"
            style={{ fontSize: 26, color: totalForaRegiao > 0 ? "var(--cv-rose)" : "inherit" }}
          >
            {isLoading ? "…" : totalForaRegiao}
          </div>
          <span className="kpi-sub-v3">
            {totalForaRegiao > 0 ? `${totalForaRegiao} leads fora da praça (desperdício)` : "segmentação limpa"}
          </span>
        </div>
      </section>

      {/* ── ASSISTENTE DE IA DE MÍDIA ── */}
      <Assistente
        fatos={{
          periodo: p.texto,
          gasto_total: Math.round(gasto),
          leads_total: res,
          formularios: form,
          conversas: conv,
          custo_medio_por_lead: media ? Math.round(media * 100) / 100 : null,
          contas: (contas ?? []).map((c) => ({
            equipe: c.dono,
            conta: c.conta,
            gasto: Math.round(c.gasto),
            campanhas: c.campanhas.slice(0, 15).map((x: any) => ({
              nome: x.nome,
              ativa: !!x.ativa,
              gasto: Math.round(Number(x.gasto)),
              formularios: Number(x.leads || 0),
              conversas: Number(x.conversas || 0),
              custo_por_lead: x.resultado ? Math.round((Number(x.gasto) / x.resultado) * 100) / 100 : null,
            })),
          })),
        }}
        pronto={!isLoading && (contas ?? []).length > 0}
      />

      {/* ── TABELA DE CONTAS E CAMPANHAS ── */}
      <section className="tropa-section-v3">
        <div className="tropa-header-v3">
          <div className="tropa-title-v3">
            <h2>🏢 Contas de Anúncio e Campanhas por Equipe</h2>
            <span>Clique na conta para expandir os anúncios ativos e conferir o custo por lead</span>
          </div>
        </div>

        <div className="tropa-table-container-v3">
          <table className="tropa-table-v3">
            <thead>
              <tr>
                <th>Conta / Gerente</th>
                <th>Gasto</th>
                <th style={{ textAlign: "center" }}>Leads</th>
                <th style={{ textAlign: "center" }}>Custo/Lead</th>
                <th style={{ textAlign: "center" }}>Desperdício</th>
                <th style={{ textAlign: "right" }}>Ações Rápidas</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                    Conectando às contas do Facebook…
                  </td>
                </tr>
              ) : !(contas ?? []).length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                    Nenhuma conta de anúncios conectada para as suas equipes.
                  </td>
                </tr>
              ) : (
                (contas ?? []).map((c) => {
                  const n = c.campanhas.reduce((a: number, x: any) => a + x.resultado, 0);
                  const ab = !!aberta[c.donoId];
                  const cpl = n ? c.gasto / n : null;

                  return (
                    <>
                      <tr key={c.donoId} style={{ cursor: "pointer" }} onClick={() => setAberta((v) => ({ ...v, [c.donoId]: !v[c.donoId] }))}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>{ab ? "▼" : "▶"}</span>
                            <div>
                              <b style={{ color: "var(--cv-text-main)", fontSize: 14 }}>{c.dono}</b>
                              <span style={{ display: "block", fontSize: 11.5, color: "var(--cv-text-muted)" }}>
                                Conta: {c.conta} {c.saldo ? `· Saldo: ${c.saldo}` : ""}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <b className="mono">{brl(c.gasto)}</b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono">{n}</b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="mono"
                            style={{
                              color: media && cpl && cpl > 1.5 * media ? "var(--cv-rose)" : "inherit",
                              fontWeight: 700,
                            }}
                          >
                            {cpl ? brl2(cpl) : "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                            {(c.fora_regiao ?? 0) > 0 ? (
                              <span className="mini-badge-v3 offline" style={{ background: "var(--cv-rose-light)", color: "var(--cv-rose)", fontWeight: 700 }}>
                                {c.fora_regiao} DDD fora
                              </span>
                            ) : null}
                            {(c.sem_toque ?? 0) > 0 ? (
                              <span className="mini-badge-v3 offline" style={{ background: "var(--cv-amber-light)", color: "var(--cv-amber)", fontWeight: 700 }}>
                                {c.sem_toque} sem toque
                              </span>
                            ) : null}
                            {!(c.fora_regiao ?? 0) && !(c.sem_toque ?? 0) ? (
                              <span style={{ color: "var(--cv-text-dim)", fontSize: 12 }}>—</span>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-queima-primario"
                              style={{ padding: "4px 8px", fontSize: 11, background: "var(--cv-brand)", boxShadow: "none" }}
                              onClick={() => copiarPedidoGestor(c)}
                            >
                              Pedido Gestor
                            </button>
                            <button
                              type="button"
                              className="btn-queima-secundario"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => cobrarGerenteMidia(c)}
                            >
                              Cobrar Gerente
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Campanhas expandidas */}
                      {ab && (
                        <tr key={`${c.donoId}-exp`}>
                          <td colSpan={6} style={{ background: "var(--cv-surface-subtle)", padding: "12px 20px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>
                                Campanhas ativas de {c.dono} ({c.campanhas.length})
                              </span>
                              {c.campanhas.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--cv-text-muted)", margin: 0 }}>Nenhuma campanha ativa no período.</p>
                              ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                                  {c.campanhas.map((camp: any, idx: number) => {
                                    const cplCamp = camp.resultado ? Number(camp.gasto) / camp.resultado : null;
                                    return (
                                      <div
                                        key={idx}
                                        style={{
                                          background: "var(--cv-surface)",
                                          border: "1px solid var(--cv-border)",
                                          borderRadius: 8,
                                          padding: "10px 12px",
                                        }}
                                      >
                                        <b style={{ fontSize: 13, color: "var(--cv-text-main)", display: "block" }}>{camp.nome}</b>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                                          <span style={{ color: "var(--cv-text-muted)" }}>Gasto: <b className="mono" style={{ color: "var(--cv-text-main)" }}>{brl(camp.gasto)}</b></span>
                                          <span style={{ color: "var(--cv-text-muted)" }}>Leads: <b className="mono" style={{ color: "var(--cv-text-main)" }}>{camp.resultado}</b></span>
                                          <span style={{ color: "var(--cv-text-muted)" }}>CPL: <b className="mono" style={{ color: "var(--cv-brand)" }}>{cplCamp ? brl(cplCamp) : "—"}</b></span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Assistente({ fatos, pronto }: { fatos: any; pronto: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: lin } = useQuery({
    queryKey: ["s2-ia", id],
    enabled: !!id,
    refetchInterval: (q: any) => (q.state.data?.status === "pendente" ? 3000 : false),
    refetchIntervalInBackground: true,
    queryFn: async () => (await sb.from("estrategia_ia").select("status,modo,resposta").eq("id", id).maybeSingle()).data,
  });

  const pedir = async (modo: "midia" | "pergunta") => {
    if (modo === "pergunta" && !pergunta.trim()) {
      toast.error("Escreva a pergunta.");
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("estrategia-ia", {
      body: { modo, fatos, pergunta: modo === "pergunta" ? pergunta : undefined },
    });
    setEnviando(false);
    if (error || (data as any)?.error) {
      toast.error("A IA não respondeu: " + ((data as any)?.error || error?.message));
      return;
    }
    setId((data as any).id);
  };

  const r = lin?.resposta;

  return (
    <section
      style={{
        background: "var(--cv-surface)",
        border: "1px solid var(--cv-border)",
        borderRadius: "var(--cv-radius-md)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <b style={{ fontSize: 16, color: "var(--cv-text-main)", display: "flex", alignItems: "center", gap: 6 }}>
            Assistente de IA de Tráfego & Mídia
          </b>
          <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
            Analisa os números da tela e indica o que cortar, o que escalar e os pedidos ao gestor de tráfego.
          </span>
        </div>

        <button
          type="button"
          className="btn-queima-primario"
          style={{ background: "var(--cv-brand)", boxShadow: "none" }}
          disabled={!pronto || enviando || lin?.status === "pendente"}
          onClick={() => pedir("midia")}
        >
          {lin?.status === "pendente" ? "Analisando com IA… (aguarde)" : "Diagnosticar com IA"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{
            flex: 1,
            background: "var(--cv-surface-subtle)",
            border: "1px solid var(--cv-border)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--cv-text-main)",
            outline: "none",
          }}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Ou pergunte à IA: onde devo realocar R$ 3 mil esta semana para maximizar vendas?"
          onKeyDown={(e) => {
            if (e.key === "Enter") pedir("pergunta");
          }}
        />
        <button
          type="button"
          className="btn-queima-secundario"
          disabled={!pronto || enviando}
          onClick={() => pedir("pergunta")}
        >
          Perguntar
        </button>
      </div>

      {lin?.status === "erro" && (
        <p style={{ color: "var(--cv-rose)", fontSize: 13, margin: 0 }}>A IA falhou ao processar: {r?.erro}</p>
      )}

      {lin?.status === "pronto" && r && (
        <div style={{ background: "var(--cv-surface-subtle)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13.5, color: "var(--cv-text-main)", margin: 0, lineHeight: 1.5 }}>
            {r.leitura || r.resposta}
          </p>
          {r.pedir_ao_gestor?.length ? (
            <div>
              <b style={{ fontSize: 12.5, color: "var(--cv-brand)" }}>Mensagens para o Gestor de Tráfego:</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--cv-text-main)" }}>
                {r.pedir_ao_gestor.map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
