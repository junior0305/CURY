// Leads por Canal da Superintendência — 100% no Design System do Cockpit do Gerente
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper } from "./Periodo";
import "@/styles/cockpit-gerente.css";

const sb = supabase as any;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

type Canal = "anuncio" | "disparo" | "pescados" | "outros";
const CANAIS: [Canal, string, string][] = [
  ["anuncio", "Meta Ads (Facebook/Instagram)", "📢"],
  ["disparo", "Disparos WhatsApp", "💬"],
  ["pescados", "Pescados & Carteira", "🎣"],
  ["outros", "Ações / Outros", "🏃"],
];

function canalDe(l: any): Canal {
  const src = String(l.source ?? "").toLowerCase();
  if (src === "cold_pool" || l.original_broker_id) return "pescados";
  if (src.startsWith("facebook") || l.fb_page_id || l.fb_campaign_id) return "anuncio";
  if (src === "wa_oficial" || src === "campaign" || src.includes("disparo")) return "disparo";
  return "outros";
}

const atendido = (l: any) => {
  const c = new Date(l.created_at).getTime();
  return (
    !!l.last_broker_whatsapp_at ||
    l.status !== "NEW" ||
    (l.contact_attempts ?? 0) > 0 ||
    (l.last_interaction_at && new Date(l.last_interaction_at).getTime() > c + 5 * 60e3)
  );
};

const avancou = (l: any) =>
  ["VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"].includes(l.status);

export default function Leads({ superId }: { superId: string }) {
  const { supers } = useEscopoSuper(superId);
  const p = usePeriodoSuper("7d");
  const janela = p.janela, iniUTC = p.iniUTC, fimUTC = p.fimUTC;

  const gerentes = useMemo(
    () => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)),
    [supers]
  );

  const brokerGer = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gerentes) for (const c of g.corretores_lista ?? []) m.set(c.id, g.id);
    return m;
  }, [gerentes]);

  // Busca leads do período das equipes
  const { data: leads, isLoading } = useQuery({
    queryKey: ["s2-leads", superId, janela.de, janela.ate, brokerGer.size],
    enabled: brokerGer.size > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const ids = [...brokerGer.keys()];
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        for (let pg = 0; ; pg += 1000) {
          const { data, error } = await sb
            .from("leads")
            .select(
              "id,broker_id,source,fb_page_id,fb_campaign_id,original_broker_id,status,contact_attempts,last_broker_whatsapp_at,last_interaction_at,last_lead_response_at,created_at"
            )
            .in("broker_id", ids.slice(i, i + 150))
            .gte("created_at", iniUTC)
            .lt("created_at", fimUTC)
            .range(pg, pg + 999);
          if (error) throw error;
          out.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
      }
      return out;
    },
  });

  // Consolidação por equipe e canal
  const tabela = useMemo(() => {
    type C = { n: number; atend: number; resp: number; avanc: number };
    const vazio = (): C => ({ n: 0, atend: 0, resp: 0, avanc: 0 });
    const porGer = new Map<string, Record<Canal, C>>();
    const tot: Record<Canal, C> = { anuncio: vazio(), disparo: vazio(), pescados: vazio(), outros: vazio() };

    for (const l of leads ?? []) {
      const g = brokerGer.get(l.broker_id);
      if (!g) continue;
      const k = canalDe(l);
      const row = porGer.get(g) ?? { anuncio: vazio(), disparo: vazio(), pescados: vazio(), outros: vazio() };
      for (const c of [row[k], tot[k]]) {
        c.n++;
        if (atendido(l)) c.atend++;
        if (l.last_lead_response_at) c.resp++;
        if (avancou(l)) c.avanc++;
      }
      porGer.set(g, row);
    }
    return { porGer, tot };
  }, [leads, brokerGer]);

  // Alertas inteligentes de atenção
  const melhorias = useMemo(() => {
    const out: { tipo: string; titulo: string; desc: string; quem: string }[] = [];
    for (const g of gerentes) {
      const row = tabela.porGer.get(g.id);
      if (!row) continue;
      const n = CANAIS.reduce((a, [k]) => a + row[k].n, 0);
      const semToque = n - CANAIS.reduce((a, [k]) => a + row[k].atend, 0);
      if (n >= 5 && semToque / n >= 0.3) {
        out.push({
          tipo: "LEADS SEM CONTATO",
          quem: g.nome,
          titulo: `${g.nome}: ${semToque} de ${n} leads novos sem toque`,
          desc: "Lead pago esfriando na roleta. Alinhe com o gerente para cobrar primeiro contato imediato.",
        });
      }
      const a = row.anuncio, dsp = row.disparo;
      if (a.n >= 5 && dsp.n >= 5 && pct(dsp.atend, dsp.n) + 20 < pct(a.atend, a.n)) {
        out.push({
          tipo: "DISPARO ESFRIANDO",
          quem: g.nome,
          titulo: `${g.nome}: respostas de disparo têm menos atendimento que anúncio`,
          desc: `Apenas ${pct(dsp.atend, dsp.n)}% dos leads de disparo foram chamados contra ${pct(a.atend, a.n)}% de anúncio.`,
        });
      }
    }
    return out;
  }, [gerentes, tabela]);

  const totN = CANAIS.reduce((a, [k]) => a + tabela.tot[k].n, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── CABEÇALHO DO BLOCO DE LEADS ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--cv-text-main)" }}>
            📊 Esteira de Captação & Canais de Entrada
          </h2>
          <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>
            Volume de leads recebidos, velocidade de primeiro contato e avanço para visita · {p.texto}
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

      {/* ── ALERTAS DE ATENDIMENTO ── */}
      {melhorias.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {melhorias.map((m, idx) => (
            <div key={idx} className="alerta-queima-caixa">
              <div className="alerta-queima-conteudo">
                <div className="alerta-queima-icone">
                  <span style={{ fontSize: 18 }}>🔥</span>
                </div>
                <div className="alerta-queima-texto">
                  <div className="alerta-queima-titulo">
                    <span className="badge-risco-financeiro">{m.tipo}</span>
                    <b>{m.titulo}</b>
                  </div>
                  <p className="alerta-queima-sub">{m.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PLACAR HERO DOS CANAIS ── */}
      <section className="hero-placar-v3">
        {CANAIS.map(([k, rot, icone]) => {
          const c = tabela.tot[k];
          return (
            <div key={k} className="kpi-card-v3">
              <span className="kpi-title-v3">
                {icone} {rot.split(" ")[0]}
              </span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
                {nf(c.n)}
              </div>
              <span className="kpi-sub-v3">
                <b className="mono" style={{ color: "var(--cv-brand)" }}>{pct(c.n, totN)}%</b> do tráfego ·{" "}
                <b className="mono" style={{ color: pct(c.atend, c.n) < 60 ? "var(--cv-rose)" : "var(--cv-green)" }}>
                  {pct(c.atend, c.n)}%
                </b>{" "}
                atendidos
              </span>
            </div>
          );
        })}
      </section>

      {/* ── TABELA COMPARATIVA EQUIPE × CANAL ── */}
      <section className="tropa-section-v3">
        <div className="tropa-header-v3">
          <div className="tropa-title-v3">
            <h2>🏢 Desempenho por Equipe e Canal</h2>
            <span>Volume de leads por fonte, taxa de atendimento e avanço para visitas</span>
          </div>
        </div>

        <div className="tropa-table-container-v3">
          <table className="tropa-table-v3">
            <thead>
              <tr>
                <th>Equipe</th>
                {CANAIS.map(([k, r, icone]) => (
                  <th key={k} style={{ textAlign: "center" }}>
                    {icone} {r.split(" ")[0]}
                  </th>
                ))}
                <th style={{ textAlign: "center" }}>Total Leads</th>
                <th style={{ textAlign: "center" }}>Sem Toque</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                    Somando leads das equipes…
                  </td>
                </tr>
              ) : (
                gerentes.map((g) => {
                  const row = tabela.porGer.get(g.id);
                  const n = row ? CANAIS.reduce((a, [k]) => a + row[k].n, 0) : 0;
                  const at = row ? CANAIS.reduce((a, [k]) => a + row[k].atend, 0) : 0;
                  const semToque = n - at;

                  return (
                    <tr key={g.id}>
                      <td>
                        <b style={{ color: "var(--cv-text-main)" }}>{g.nome}</b>
                      </td>
                      {CANAIS.map(([k]) => {
                        const c = row?.[k];
                        if (!c?.n) {
                          return (
                            <td key={k} style={{ textAlign: "center", color: "var(--cv-text-dim)" }}>
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={k} style={{ textAlign: "center" }}>
                            <b className="mono">{c.n}</b>
                            <span style={{ display: "block", fontSize: 11, color: "var(--cv-text-muted)" }}>
                              {pct(c.atend, c.n)}% at · {pct(c.avanc, c.n)}% vis
                            </span>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "center" }}>
                        <b className="mono" style={{ fontSize: 14 }}>{n}</b>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <b
                          className="mono"
                          style={{
                            color: semToque > 5 ? "var(--cv-rose)" : "inherit",
                            fontSize: 14,
                          }}
                        >
                          {semToque}
                        </b>
                      </td>
                    </tr>
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
