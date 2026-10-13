/* Aba Leads & Anúncios — Exclusiva do Superintendente.
 *
 * Visão completa do tráfego e atendimento da equipe:
 *   1. Mix de Origens de Leads (Meta Ads, Disparos, Carteira/Pescados, Construtora, Ações).
 *   2. Saúde das Contas de Anúncio da Tropa (CPL, gasto 7d, campanhas no ar vs pausadas).
 *   3. Leads Sem Toque (atendimento travado há mais de 2h).
 *   4. Comparativo de Performance Gerente a Gerente.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const nf = (n: number) => n.toLocaleString("pt-BR");

export default function LeadsAnunciosSuper({
  superId,
  superNome,
}: {
  superId: string;
  superNome: string;
}) {
  const [dias, setDias] = useState(30);

  // 1. Consolidado da equipe com as origens de leads
  const { data: consolidado, isLoading: loadingConsolidado } = useConsolidadoSuper(superId, dias);

  // 2. Saúde das Contas do Facebook da Equipe
  const { data: fbSaude = [] } = useQuery({
    queryKey: ["fb-saude-super", superId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("fb_saude" as any).select("account_id,dados,atualizado_em");
      return (data ?? []) as any[];
    },
  });

  // Filtrar contas que pertencem a este Super ou gerentes dele
  const contasEquipe = useMemo(() => {
    return fbSaude
      .map((row) => row.dados)
      .filter((c) => {
        if (!c) return false;
        return (
          c.super_id === superId ||
          c.dono_id === superId ||
          (c.super && c.super.toLowerCase().includes(superNome.toLowerCase()))
        );
      });
  }, [fbSaude, superId, superNome]);

  // Totais consolidados de mídia
  const gasto7d = useMemo(() => contasEquipe.reduce((acc, c) => acc + (c.gasto_7d || 0), 0), [contasEquipe]);
  const leadsFb7d = useMemo(() => contasEquipe.reduce((acc, c) => acc + (c.leads_fb_7d || 0), 0), [contasEquipe]);
  const cplMedio7d = leadsFb7d > 0 ? gasto7d / leadsFb7d : null;

  // Totais de origens de leads do Comandra
  const totaisOrigens = useMemo(() => {
    const linhas = consolidado?.linhas ?? [];
    return linhas.reduce(
      (acc, l) => ({
        anuncio: acc.anuncio + (l.leads?.anuncio || 0),
        disparo: acc.disparo + (l.leads?.disparo || 0),
        pescados: acc.pescados + (l.leads?.pescados || 0),
        outros: acc.outros + (l.leads?.outros || 0),
        nuncaFalaram: acc.nuncaFalaram + (l.nuncaFalaram || 0),
      }),
      { anuncio: 0, disparo: 0, pescados: 0, outros: 0, nuncaFalaram: 0 }
    );
  }, [consolidado]);

  const totalLeads = totaisOrigens.anuncio + totaisOrigens.disparo + totaisOrigens.pescados + totaisOrigens.outros;

  return (
    <div className="sdg-leads-anuncios" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── CARD 1: ORIGENS DOS LEADS & MIX DE CANAIS ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4F46E5", textTransform: "uppercase" }}>
              🎯 ENTRADA DE LEADS DA TROPA ({superNome})
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "2px 0 0 0", color: "#0F172A" }}>
              Origem dos Leads & Canais de Captação
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#64748B" }}>
              De onde vêm os clientes que estão entrando na esteira dos seus gerentes nos últimos {dias} dias.
            </p>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {[7, 15, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: dias === n ? "#4F46E5" : "#CBD5E1",
                  background: dias === n ? "#4F46E5" : "#FFFFFF",
                  color: dias === n ? "#FFFFFF" : "#475569",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {n} dias
              </button>
            ))}
          </div>
        </div>

        {/* Grade de Canais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {/* Anúncios Meta Ads */}
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>📱 Anúncios Digitais</span>
              <span style={{ fontSize: 11, color: "#15803D", fontWeight: 800 }}>
                {totalLeads ? Math.round((totaisOrigens.anuncio / totalLeads) * 100) : 0}%
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#166534", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {nf(totaisOrigens.anuncio)}
            </div>
            <div style={{ fontSize: 11, color: "#15803D" }}>Meta Ads (Facebook/Instagram)</div>
          </div>

          {/* Disparos WhatsApp */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#1E40AF", fontWeight: 700 }}>💬 Disparos WhatsApp</span>
              <span style={{ fontSize: 11, color: "#1D4ED8", fontWeight: 800 }}>
                {totalLeads ? Math.round((totaisOrigens.disparo / totalLeads) * 100) : 0}%
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#1E40AF", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {nf(totaisOrigens.disparo)}
            </div>
            <div style={{ fontSize: 11, color: "#1D4ED8" }}>Campanhas ativas & WPP Oficial</div>
          </div>

          {/* Pescados / Carteira */}
          <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#92400E", fontWeight: 700 }}>🎣 Carteira / Pescados</span>
              <span style={{ fontSize: 11, color: "#B45309", fontWeight: 800 }}>
                {totalLeads ? Math.round((totaisOrigens.pescados / totalLeads) * 100) : 0}%
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#92400E", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {nf(totaisOrigens.pescados)}
            </div>
            <div style={{ fontSize: 11, color: "#B45309" }}>Cold pool & reciclagens</div>
          </div>

          {/* Ações de Rua & Outros */}
          <div style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>🚶 Ações & Construtora</span>
              <span style={{ fontSize: 11, color: "#334155", fontWeight: 800 }}>
                {totalLeads ? Math.round((totaisOrigens.outros / totalLeads) * 100) : 0}%
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#334155", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {nf(totaisOrigens.outros)}
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>PAP, plantão e indicações</div>
          </div>
        </div>

        {/* ALERTA CRÍTICO: LEADS SEM TOQUE */}
        {totaisOrigens.nuncaFalaram > 0 && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <b style={{ color: "#991B1B", fontSize: 13 }}>⚠️ Alerta de Atendimento: {totaisOrigens.nuncaFalaram} leads na carteira sem nenhum contato!</b>
              <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>
                Clientes que caíram para os corretores da sua equipe e ainda não receberam nenhuma mensagem.
              </div>
            </div>
            <span style={{ padding: "4px 8px", background: "#EF4444", color: "#FFFFFF", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
              Cobrar Gerentes Imediatamente
            </span>
          </div>
        )}
      </section>

      {/* ── CARD 2: SAÚDE DOS ANÚNCIOS DO FACEBOOK / META ADS ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px 0", color: "#0F172A" }}>
              🩺 Saúde dos Anúncios da Superintendência (Últimos 7 dias)
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>
              Desempenho financeiro das campanhas no ar, custo por lead e pontos de atenção.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Investimento 7 Dias</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {brl(gasto7d)}
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Consumo real Meta Ads</div>
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Leads Gerados 7 Dias</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {leadsFb7d} leads
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Formulários e conversas</div>
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>CPL Médio (Custo/Lead)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cplMedio7d && cplMedio7d < 45 ? "#10B981" : "#F59E0B", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {cplMedio7d ? brl(cplMedio7d) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Meta da casa: abaixo de R$ 45</div>
          </div>
        </div>

        {/* Alertas das Contas */}
        {contasEquipe.flatMap((c) => c.alertas || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
              Alertas & Pontos de Atenção para o Gestor de Tráfego:
            </div>
            {contasEquipe.flatMap((c) => c.alertas || []).slice(0, 4).map((al, idx) => (
              <div
                key={idx}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: al.g === "red" ? "#FCA5A5" : "#FDE68A",
                  background: al.g === "red" ? "#FEF2F2" : "#FFFBEB",
                  fontSize: 12,
                  color: al.g === "red" ? "#991B1B" : "#92400E",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{al.g === "red" ? "🚨" : "⚠️"}</span>
                <div>
                  <b>{al.titulo}:</b> {al.detalhe}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CARD 3: COMPARATIVO GERENTE A GERENTE ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 12px 0", color: "#0F172A" }}>
          ⚖️ Comparativo de Performance por Equipe de Gerente
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", borderBottom: "2px solid #E2E8F0", color: "#475569" }}>
                <th style={{ padding: "10px 12px" }}>Gerente</th>
                <th style={{ padding: "10px 12px" }}>Plantões (C2S)</th>
                <th style={{ padding: "10px 12px" }}>Visitas (C2S)</th>
                <th style={{ padding: "10px 12px" }}>Total Leads</th>
                <th style={{ padding: "10px 12px" }}>Gasto Mídia</th>
                <th style={{ padding: "10px 12px" }}>Sem Toque ⚠️</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Vendas Junix</th>
              </tr>
            </thead>
            <tbody>
              {(consolidado?.linhas ?? []).map((l) => {
                const totalLeadsGer = (l.leads?.anuncio || 0) + (l.leads?.disparo || 0) + (l.leads?.pescados || 0) + (l.leads?.outros || 0);

                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td style={{ padding: "12px", fontWeight: 700, color: "#1E293B" }}>
                      {l.nome}
                    </td>
                    <td style={{ padding: "12px", color: "#334155" }}>
                      {l.plantaoDias} dias
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700, color: "#0F172A" }}>
                      {l.visitas}
                    </td>
                    <td style={{ padding: "12px", color: "#334155" }}>
                      {nf(totalLeadsGer)}
                    </td>
                    <td style={{ padding: "12px", color: "#334155", fontFamily: '"JetBrains Mono", monospace' }}>
                      {l.gasto ? brl(l.gasto) : "—"}
                    </td>
                    <td style={{ padding: "12px", color: l.nuncaFalaram > 0 ? "#DC2626" : "#16A34A", fontWeight: 700 }}>
                      {l.nuncaFalaram > 0 ? `${l.nuncaFalaram} pendentes` : "Zero ✓"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontWeight: 800, color: l.vendas > 0 ? "#10B981" : "#64748B" }}>
                      {l.vendas} vendas
                    </td>
                  </tr>
                );
              })}
              {!(consolidado?.linhas?.length) && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#64748B" }}>
                    Carregando dados das equipes...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
