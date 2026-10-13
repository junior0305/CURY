/* Sala de Guerra da Superintendência: Planejamento Tático com os Gerentes.
 *
 * Funcionalidades:
 *   1. Poder de Fogo Total: Verba Concedida da Diretoria (ex: R$ 20k) + Aporte dos Gerentes (ex: R$ 15k) + Cotas de Corretores (ex: R$ 10k) = R$ 45k.
 *   2. Dupla Meta: Meta Oficial com o Diretor (ex: 20 vendas) vs Meta Ousada da Tropa (soma dos gerentes, ex: 26 vendas).
 *   3. Placar de Metas por Gerente (edição inline chamando RPC definir_meta).
 *   4. Alocação em Lançamentos e Estoques Junix.
 *   5. Inteligência Preditiva da Superintendência (projeção com R$ 45k e visitas no C2S).
 *   6. Disparo de Termo de Compromisso no WhatsApp do Gerente.
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";
import { useEstoque } from "@/hooks/usePlano";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });
const inicioMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export interface GerenteItem {
  id: string;
  nome: string;
  meta: number | null;
  realizado: number;
  phone?: string | null;
}

export default function SalaDeGuerraSuper({
  superId,
  superNome,
}: {
  superId: string;
  superNome: string;
}) {
  const qc = useQueryClient();
  const mes = inicioMes();
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();

  // 1. Buscar Metas no Supabase (metas_painel)
  const { data: metasData, isLoading: loadingMetas } = useQuery({
    queryKey: ["metas-painel", mes, superId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, {
        p_mes: mes,
        p_dono: superId,
      });
      if (error) throw error;
      return data as any;
    },
  });

  // Meta Oficial acordada com a Diretoria
  const metaOficialDiretoria = metasData?.dono?.meta ?? 20;
  const realizadoSuper = metasData?.dono?.realizado ?? 0;

  // Gerentes da Superintendência
  const gerentes: GerenteItem[] = useMemo(() => {
    return (metasData?.filhos ?? []).filter((f: any) => f.papel === "MANAGER").map((f: any) => ({
      id: f.id,
      nome: f.nome,
      meta: f.meta,
      realizado: f.realizado ?? 0,
      phone: f.phone ?? null,
    }));
  }, [metasData]);

  // Meta Ousada da Tropa (Soma das metas distribuídas aos gerentes)
  const somaMetasGerentes = useMemo(() => {
    return gerentes.reduce((acc, g) => acc + (g.meta ?? 0), 0);
  }, [gerentes]);

  // Folga / Superação planejada
  const superacao = somaMetasGerentes - metaOficialDiretoria;

  // 2. Composição da Verba de Guerra (Poder de Fogo)
  const [verbaDiretoria, setVerbaDiretoria] = useState(20000);
  const [aporteGerentes, setAporteGerentes] = useState(15000);
  const [cotasCorretores, setCotasCorretores] = useState(10000);
  const [salvandoAporte, setSalvandoAporte] = useState(false);

  // Poder de Fogo Total
  const poderDeFogoTotal = verbaDiretoria + aporteGerentes + cotasCorretores;

  // Carregar aporte já salvo no Supabase se houver
  useEffect(() => {
    supabase
      .from("gastos" as any)
      .select("planejado, nota")
      .eq("dono_id", superId)
      .eq("mes", mes)
      .like("descricao", "%Aporte Tropa%")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.planejado) {
          try {
            const parsed = JSON.parse(data.nota || "{}");
            if (parsed.verbaDiretoria) setVerbaDiretoria(parsed.verbaDiretoria);
            if (parsed.aporteGerentes) setAporteGerentes(parsed.aporteGerentes);
            if (parsed.cotasCorretores) setCotasCorretores(parsed.cotasCorretores);
          } catch {
            setAporteGerentes(Number(data.planejado) || 15000);
          }
        }
      });
  }, [superId, mes]);

  // Salvar Aporte da Tropa
  const salvarAporteTropa = async () => {
    setSalvandoAporte(true);
    try {
      const aporteTotalTropa = aporteGerentes + cotasCorretores;
      const notaJson = JSON.stringify({
        verbaDiretoria,
        aporteGerentes,
        cotasCorretores,
        poderDeFogoTotal,
        metaOusada: somaMetasGerentes,
        superNome,
      });

      // Upsert na tabela gastos para alimentar tanto o Super quanto o Diretor
      const { error } = await supabase.from("gastos" as any).upsert(
        {
          dono_id: superId,
          mes,
          descricao: `Aporte Tropa & Verba de Guerra · ${superNome}`,
          planejado: aporteTotalTropa,
          realizado: 0,
          nota: notaJson,
        },
        { onConflict: "dono_id,mes,descricao" }
      );

      if (error) throw error;
      toast.success("💥 Poder de Fogo de R$ " + poderDeFogoTotal.toLocaleString("pt-BR") + " salvo com sucesso! Já reflete na tela do Diretor.");
      qc.invalidateQueries({ queryKey: ["gastos"] });
      qc.invalidateQueries({ queryKey: ["fb-saude"] });
    } catch (e: any) {
      toast.error("Erro ao salvar aporte da tropa: " + e.message);
    } finally {
      setSalvandoAporte(false);
    }
  };

  // Salvar Meta Inline do Gerente
  const salvarMetaGerente = async (gerenteId: string, gerenteNome: string, valor: number) => {
    if (Number.isNaN(valor) || valor < 0) return;
    const { error } = await supabase.rpc("definir_meta" as any, {
      p_mes: mes,
      p_dono: gerenteId,
      p_vendas: valor,
    });
    if (error) {
      toast.error(`Erro ao salvar meta de ${gerenteNome}: ${error.message}`);
      return;
    }
    toast.success(`Meta de ${gerenteNome} definida em ${valor} vendas!`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  };

  // 3. Estoque Junix & Consolidado da equipe
  const { data: estoque = [] } = useEstoque();
  const { data: consolidado } = useConsolidadoSuper(superId, 30);

  // 4. Inteligência Preditiva da Superintendência
  const projecaoPreditiva = useMemo(() => {
    const ticketMedio = 250000;
    const cplEstimado = 42; // Custo médio por lead
    const taxaLeadVisita = 0.08; // 8% dos leads viram visita
    const taxaVisitaVenda = 0.12; // 12% das visitas viram venda

    const leadsGerados = Math.round(poderDeFogoTotal / cplEstimado);
    const visitasGeradas = Math.round(leadsGerados * taxaLeadVisita);
    const vendasProjetadasMidia = Math.round(visitasGeradas * taxaVisitaVenda);
    const vendasTotais = realizadoSuper + vendasProjetadasMidia;
    const vgvTotal = vendasTotais * ticketMedio;
    const bateOficial = vendasTotais >= metaOficialDiretoria;
    const bateOusada = vendasTotais >= (somaMetasGerentes || metaOficialDiretoria);

    return {
      leadsGerados,
      visitasGeradas,
      vendasProjetadasMidia,
      vendasTotais,
      vgvTotal,
      bateOficial,
      bateOusada,
      gapOficial: Math.max(0, metaOficialDiretoria - vendasTotais),
      gapOusada: Math.max(0, somaMetasGerentes - vendasTotais),
    };
  }, [poderDeFogoTotal, realizadoSuper, metaOficialDiretoria, somaMetasGerentes]);

  // 5. Termo de Acordo WhatsApp
  const [modalGerente, setModalGerente] = useState<GerenteItem | null>(null);

  const enviarWhatsAppGerente = (g: GerenteItem) => {
    const metaG = g.meta ?? 0;
    const texto = `🔥 *ALINHAMENTO DE GUERRA COMANDRA · ${nomeMes(mes).toUpperCase()}*

Fala *${g.nome}*, aqui é o Superintendente *${superNome}*.
Fechamos nosso plano de metas e investimentos para este mês:

🎯 *Sua Meta de Vendas:* ${metaG} unidades
💰 *Poder de Fogo da Superintendência:* ${brl(poderDeFogoTotal)} em mídia e ações de campo
🏢 *Foco Operacional:* Lançamentos prioritários e estoques Junix
📋 *Compromisso da Semana:* Acelerar visitas no C2S e esteira de crédito na Caixa!

Conto com a sua equipe na linha de frente. Vamos pra cima! 🚀`;

    const phone = g.phone ? g.phone.replace(/\D/g, "") : "";
    const url = phone
      ? `https://api.whatsapp.com/send?phone=${phone.startsWith("55") ? phone : "55" + phone}&text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    window.open(url, "_blank");
  };

  return (
    <div className="sdg-super-container" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── CARD PRINCIPAL: DUPLA META & PODER DE FOGO TOTAL ── */}
      <section className="dir-card" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)", color: "#F8FAFC", padding: 22, borderRadius: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(96, 165, 250, 0.4)", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, color: "#93C5FD", marginBottom: 8 }}>
              ⚔️ SALA DE GUERRA DA SUPERINTENDÊNCIA · {nomeMes(mes).toUpperCase()}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px 0", color: "#FFFFFF" }}>
              Poder de Fogo & Gestão Tática dos Gerentes
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: "#94A3B8" }}>
              Alinhe as metas individuais de cada equipe, combine aportes próprios e calcule a viabilidade com a IA.
            </p>
          </div>

          {/* Comparativo Dupla Meta */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", fontWeight: 700 }}>Meta Diretoria</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#60A5FA", fontFamily: '"JetBrains Mono", monospace' }}>
                {realizadoSuper} <span style={{ fontSize: 14, color: "#94A3B8" }}>/ {metaOficialDiretoria}</span>
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Contratada com Diretor</div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", minWidth: 150 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", fontWeight: 700 }}>Meta Ousada Tropa</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#34D399", fontFamily: '"JetBrains Mono", monospace' }}>
                {somaMetasGerentes} <span style={{ fontSize: 13, color: "#A7F3D0" }}>vendas</span>
              </div>
              <div style={{ fontSize: 11, color: superacao >= 0 ? "#34D399" : "#F87171", fontWeight: 600, marginTop: 2 }}>
                {superacao > 0 ? `+${superacao} de superação 🚀` : superacao === 0 ? "Alinhada com Diretoria" : `Faltam ${Math.abs(superacao)} un`}
              </div>
            </div>
          </div>
        </div>

        {/* ── COMPOSIÇÃO DA VERBA (PODER DE FOGO) ── */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#CBD5E1", marginBottom: 12 }}>
            💰 Composição da Verba de Mídia & Campo
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {/* 1. Verba Diretoria */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>🏢 Concedida pela Diretoria</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#93C5FD", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
                {brl(verbaDiretoria)}
              </div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Verba oficial da empresa</div>
            </div>

            {/* 2. Aporte dos Gerentes */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12 }}>
              <label style={{ fontSize: 12, color: "#94A3B8", display: "block" }}>👥 Aporte dos Gerentes</label>
              <input
                type="number"
                min={0}
                step={500}
                value={aporteGerentes}
                onChange={(e) => setAporteGerentes(Number(e.target.value) || 0)}
                style={{ width: "100%", marginTop: 4, padding: "4px 8px", background: "rgba(0,0,0,0.3)", border: "1px solid #475569", borderRadius: 6, color: "#34D399", fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', fontSize: 16 }}
              />
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Recurso próprio dos gerentes</div>
            </div>

            {/* 3. Cotas dos Corretores */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12 }}>
              <label style={{ fontSize: 12, color: "#94A3B8", display: "block" }}>🎯 Cotas de Corretores / Vaquinha</label>
              <input
                type="number"
                min={0}
                step={500}
                value={cotasCorretores}
                onChange={(e) => setCotasCorretores(Number(e.target.value) || 0)}
                style={{ width: "100%", marginTop: 4, padding: "4px 8px", background: "rgba(0,0,0,0.3)", border: "1px solid #475569", borderRadius: 6, color: "#FBBF24", fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', fontSize: 16 }}
              />
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Leads cooperados da equipe</div>
            </div>

            {/* 4. Poder de Fogo Consolidado */}
            <div style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.25) 100%)", border: "1.5px solid #10B981", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: "#A7F3D0", fontWeight: 700 }}>💥 PODER DE FOGO TOTAL</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#34D399", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
                {brl(poderDeFogoTotal)}
              </div>
              <button
                type="button"
                onClick={salvarAporteTropa}
                disabled={salvandoAporte}
                style={{ marginTop: 6, width: "100%", padding: "5px 8px", background: "#10B981", border: "none", borderRadius: 6, color: "#FFFFFF", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                {salvandoAporte ? "Gravando..." : "Salvar & Enviar ao Diretor ✓"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLACAR DE METAS DOS GERENTES ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px 0", color: "#0F172A" }}>
              🏁 Placar de Metas dos Gerentes ({gerentes.length} equipes)
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>
              Ajuste as metas de cada gerente diretamente na tabela. Elas aparecem na hora no painel deles.
            </p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: somaMetasGerentes >= metaOficialDiretoria ? "#10B981" : "#F59E0B" }}>
            Total Distribuído: <b>{somaMetasGerentes} de {metaOficialDiretoria} vendas</b>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", borderBottom: "2px solid #E2E8F0", color: "#475569" }}>
                <th style={{ padding: "10px 12px" }}>Gerente</th>
                <th style={{ padding: "10px 12px", width: 110 }}>Meta (un)</th>
                <th style={{ padding: "10px 12px" }}>Vendeu</th>
                <th style={{ padding: "10px 12px" }}>Ritmo</th>
                <th style={{ padding: "10px 12px" }}>Projeção</th>
                <th style={{ padding: "10px 12px" }}>Devendo</th>
                <th style={{ padding: "10px 12px", textAlign: "center" }}>Ação WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {gerentes.map((g) => {
                const metaG = g.meta ?? 0;
                const projG = Math.round((g.realizado / Math.max(1, diaHoje)) * diasMes);
                const devendo = Math.max(0, metaG - g.realizado);
                const noRitmo = projG >= metaG && metaG > 0;

                return (
                  <tr key={g.id} style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td style={{ padding: "12px", fontWeight: 700, color: "#1E293B" }}>
                      {g.nome}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        type="number"
                        min={0}
                        defaultValue={g.meta ?? ""}
                        placeholder="—"
                        onBlur={(e) => salvarMetaGerente(g.id, g.nome, Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        style={{
                          width: 65,
                          padding: "4px 8px",
                          textAlign: "center",
                          border: "1.5px solid #CBD5E1",
                          borderRadius: 6,
                          fontWeight: 700,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700, color: "#0F172A" }}>
                      {g.realizado}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ display: "inline-block", width: 80, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden", verticalAlign: "middle", marginRight: 6 }}>
                        <span style={{ display: "block", height: "100%", width: `${metaG ? Math.min(100, (g.realizado / metaG) * 100) : 0}%`, background: noRitmo ? "#10B981" : "#F59E0B" }} />
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700, color: noRitmo ? "#10B981" : "#EF4444" }}>
                      {projG} un
                    </td>
                    <td style={{ padding: "12px", color: devendo > 0 ? "#EF4444" : "#10B981", fontWeight: 700 }}>
                      {devendo > 0 ? `${devendo} un` : "Meta batida ✓"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => enviarWhatsAppGerente(g)}
                        style={{
                          padding: "5px 10px",
                          background: "#25D366",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 6,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        📱 Enviar Acordo
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!gerentes.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#64748B" }}>
                    Nenhum gerente vinculado a você encontrado no sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── INTELIGÊNCIA PREDITIVA DA SUPERINTENDÊNCIA ── */}
      <section className="dir-card" style={{ background: "#F8FAFC", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", textTransform: "uppercase" }}>
              🧠 INTELIGÊNCIA PREDITIVA COMANDRA
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "2px 0 0 0", color: "#0F172A" }}>
              Avaliação de Viabilidade com o Poder de Fogo Total ({brl(poderDeFogoTotal)})
            </h3>
          </div>
          <span style={{ padding: "4px 10px", borderRadius: 8, fontWeight: 800, fontSize: 13, background: projecaoPreditiva.bateOficial ? "#DCFCE7" : "#FEE2E2", color: projecaoPreditiva.bateOficial ? "#166534" : "#991B1B" }}>
            {projecaoPreditiva.bateOficial ? "✓ META DA DIRETORIA VIÁVEL" : "⚠️ ATENÇÃO: DÉFICIT DE VERBA"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Leads Estimados em Campo</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              ~{projecaoPreditiva.leadsGerados.toLocaleString("pt-BR")} leads
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>CPL médio de R$ 42</div>
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Visitas no C2S Projetadas</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              ~{projecaoPreditiva.visitasGeradas} visitas
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
              ~{Math.ceil(projecaoPreditiva.visitasGeradas / Math.max(1, gerentes.length))} visitas por gerente
            </div>
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Vendas Finais Estimadas</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: projecaoPreditiva.bateOficial ? "#10B981" : "#F59E0B", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {projecaoPreditiva.vendasTotais} vendas
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
              VGV ~ {brl(projecaoPreditiva.vgvTotal)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 13, color: "#1E40AF" }}>
          <b>Diagnóstico Tático da IA:</b> Com o aporte próprio de <b>{brl(aporteGerentes + cotasCorretores)}</b> somado aos <b>{brl(verbaDiretoria)}</b> da Diretoria, sua equipe atinge capacidade para entregar <b>{projecaoPreditiva.vendasTotais} vendas</b>. Para garantir o fechamento, cobre de cada gerente uma média de <b>{Math.ceil(projecaoPreditiva.visitasGeradas / (Math.max(1, gerentes.length) * 3))} visitas semanais</b> registradas no C2S.
        </div>
      </section>
    </div>
  );
}
