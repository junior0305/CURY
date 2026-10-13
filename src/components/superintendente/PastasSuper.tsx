/* Aba Pastas da Tropa — Exclusiva do Superintendente.
 *
 * Filtro estrito: Mostra apenas as pastas dos gerentes e corretores ligados ao Super.
 * Destaques operacionais:
 *   1. Reta Final Caixa (pastas prestes a virar venda no mês).
 *   2. Pastas Travadas (+7 dias) com botão de cobrança direta no WhatsApp do Gerente.
 *   3. Previsão ponderada de fechamento da carteira de pastas vivas.
 *   4. Visão e ranking de pastas por Gerente da tropa.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerPastas, resumoPastas, type PastaLida } from "@/components/diretoria/pastasAnalise";
import { donoJunix, type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";

const titulo = (t: string | null | undefined) =>
  (t ?? "—")
    .replace(/\s+BN\s*$/i, "")
    .replace(/^Condom[ií]nio\s+/i, "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const cliCurto = (t: string | null | undefined) => {
  const w = titulo(t).split(" ");
  return w.length > 1 ? `${w[0]} ${w[1][0]}.` : w[0];
};

export default function PastasSuper({
  superId,
  superNome,
  supers,
}: {
  superId: string;
  superNome: string;
  supers: SuperDiretoria[];
}) {
  const [filtroGerente, setFiltroGerente] = useState<string>("todos");
  const [somenteTravadas, setSomenteTravadas] = useState(false);

  // 1. Buscar todas as pastas brutas do Junix
  const { data: pastasRaw = [], isLoading } = useQuery({
    queryKey: ["junix-pastas-raw"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows: any[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await supabase
          .from("junix_pastas" as any)
          .select("proposta_id,cliente,etapa,dias,corretor,gerente,superintendente,empreendimento,status_texto,cadastrada_em")
          .range(a, a + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return rows as PastaJunix[];
    },
  });

  // 2. Telefones dos gerentes para botão de WhatsApp
  const gerentesDestaSuper = useMemo(() => {
    const s = supers.find((x) => x.id === superId);
    return s?.gerentes ?? [];
  }, [supers, superId]);

  const { data: fonesMap } = useQuery({
    queryKey: ["fones-gerentes-super", superId],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const ids = gerentesDestaSuper.map((g) => g.id);
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase.from("profiles").select("id,phone").in("id", ids);
      return new Map(((data ?? []) as any[]).map((p) => [p.id as string, (p.phone as string | null) ?? ""]));
    },
  });

  // 3. Processar pastas e aplicar a TRAVA ESTRITA da Superintendência
  const pastasDaSuper = useMemo(() => {
    const lidas = lerPastas(pastasRaw);

    return lidas
      .map((p) => {
        const { superId: pSuperId, gerenteId: pGerenteId } = donoJunix(supers, p.superintendente, p.gerente);
        const s = supers.find((x) => x.id === pSuperId);
        const g = s?.gerentes.find((x) => x.id === pGerenteId);

        return {
          ...p,
          superId: pSuperId,
          superNome: s?.nome ?? titulo(p.superintendente),
          gerenteId: pGerenteId,
          gerenteNome: g?.nome ?? titulo(p.gerente),
        };
      })
      .filter((p) => {
        // Trava estrita: só passa se pertencer a este Super
        return (
          p.superId === superId ||
          p.superNome.toLowerCase().includes(superNome.toLowerCase()) ||
          p.superintendente.toLowerCase().includes(superNome.toLowerCase())
        );
      });
  }, [pastasRaw, supers, superId, superNome]);

  // Resumo analítico das pastas da equipe
  const resumo = useMemo(() => {
    return resumoPastas(pastasDaSuper);
  }, [pastasDaSuper]);

  // Pastas vivas filtradas
  const pastasVivas = useMemo(() => {
    return pastasDaSuper.filter((p) => p.viva);
  }, [pastasDaSuper]);

  // Pastas na Reta Final (etapas avançadas Caixa)
  const retaFinal = useMemo(() => {
    return pastasVivas.filter((p) => p.reta);
  }, [pastasVivas]);

  // Pastas paradas (+7 dias na mesma etapa)
  const travadas7d = useMemo(() => {
    return pastasVivas.filter((p) => (p.dias ?? 0) >= 7);
  }, [pastasVivas]);

  // Agrupamento por Gerente da equipe
  const porGerente = useMemo(() => {
    const map = new Map<string, { nome: string; gerenteId: string | null; vivas: number; travadas: number; reta: number; previsao: number }>();

    for (const p of pastasVivas) {
      const k = p.gerenteNome || "Sem Gerente";
      const atual = map.get(k) ?? { nome: k, gerenteId: p.gerenteId, vivas: 0, travadas: 0, reta: 0, previsao: 0 };
      atual.vivas++;
      if ((p.dias ?? 0) >= 7) atual.travadas++;
      if (p.reta) atual.reta++;
      atual.previsao += p.chance;
      map.set(k, atual);
    }

    return [...map.values()].sort((a, b) => b.vivas - a.vivas);
  }, [pastasVivas]);

  // Pastas exibidas na tabela
  const listaExibicao = useMemo(() => {
    let lista = pastasVivas;
    if (filtroGerente !== "todos") {
      lista = lista.filter((p) => p.gerenteNome === filtroGerente);
    }
    if (somenteTravadas) {
      lista = lista.filter((p) => (p.dias ?? 0) >= 7);
    }
    return lista.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
  }, [pastasVivas, filtroGerente, somenteTravadas]);

  // Cobrar Gerente no WhatsApp
  const cobrarGerenteWhatsApp = (p: typeof pastasDaSuper[0]) => {
    const fone = (p.gerenteId && fonesMap?.get(p.gerenteId)) || "";
    const texto = `🚨 *COBRANÇA DE PASTA JUNIX / CAIXA*

Fala *${p.gerenteNome}*, aqui é o Super *${superNome}*.
Vi aqui no Comandra que a pasta do cliente *${titulo(p.cliente)}* no empreendimento *${titulo(p.empreendimento)}* está parada há *${p.dias} dias* na etapa *${p.etapa}* (Corretor: ${titulo(p.corretor)}).

O que falta para destravar essa pasta na Caixa ainda hoje? Dá um toque no corretor e vamos acelerar! 🚀`;

    const foneLimpo = fone.replace(/\D/g, "");
    const url = foneLimpo
      ? `https://api.whatsapp.com/send?phone=${foneLimpo.startsWith("55") ? foneLimpo : "55" + foneLimpo}&text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    window.open(url, "_blank");
  };

  if (isLoading) {
    return (
      <div className="dir-card" style={{ padding: 30, textAlign: "center", color: "#64748B" }}>
        Lendo as pastas do Junix da sua equipe…
      </div>
    );
  }

  return (
    <div className="sdg-pastas-super" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── BANNER RESUMO EXECUTIVO DE PASTAS ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", textTransform: "uppercase" }}>
              📁 PIPELINE DE PROPOSTAS JUNIX / CAIXA
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "2px 0 0 0", color: "#0F172A" }}>
              Pastas Vivas da sua Superintendência ({superNome})
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#64748B" }}>
              Apenas propostas ativas dos seus gerentes e corretores. Duplicadas, reprovadas e canceladas foram expurgadas.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setSomenteTravadas((v) => !v)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1.5px solid",
                borderColor: somenteTravadas ? "#EF4444" : "#CBD5E1",
                background: somenteTravadas ? "#FEE2E2" : "#FFFFFF",
                color: somenteTravadas ? "#991B1B" : "#475569",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ⚠️ Ver Apenas Paradas 7d+ ({travadas7d.length})
            </button>
          </div>
        </div>

        {/* KPIs de Pastas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Pastas Vivas na Esteira</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {resumo.vivas}
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>de {resumo.total} no Junix</div>
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Reta Final (Caixa)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {retaFinal.length}
            </div>
            <div style={{ fontSize: 11, color: "#166534" }}>Emissão & Proposta</div>
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B" }}>Previsão de Vendas no Mês</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#2563EB", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              ~{Math.round(resumo.previsao)} un
            </div>
            <div style={{ fontSize: 11, color: "#1E40AF" }}>Conversão ponderada</div>
          </div>

          <div style={{ background: travadas7d.length ? "#FFF1F2" : "#F8FAFC", border: "1px solid", borderColor: travadas7d.length ? "#FECDD3" : "#E2E8F0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: travadas7d.length ? "#9F1239" : "#64748B", fontWeight: travadas7d.length ? 700 : 400 }}>
              Paradas há 7+ dias ⚠️
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: travadas7d.length ? "#E11D48" : "#0F172A", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {travadas7d.length}
            </div>
            <div style={{ fontSize: 11, color: travadas7d.length ? "#BE123C" : "#64748B" }}>Exigem cobrança</div>
          </div>
        </div>
      </section>

      {/* ── RESUMO POR GERENTE DA EQUIPE ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#0F172A" }}>
            👥 Esteira de Pastas por Equipe de Gerente
          </h3>
          <select
            value={filtroGerente}
            onChange={(e) => setFiltroGerente(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13, fontWeight: 600 }}
          >
            <option value="todos">Todos os Gerentes</option>
            {porGerente.map((g) => (
              <option key={g.nome} value={g.nome}>
                {g.nome} ({g.vivas} pastas)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {porGerente.map((g) => (
            <div
              key={g.nome}
              onClick={() => setFiltroGerente(filtroGerente === g.nome ? "todos" : g.nome)}
              style={{
                border: "1px solid",
                borderColor: filtroGerente === g.nome ? "#2563EB" : "#E2E8F0",
                background: filtroGerente === g.nome ? "#EFF6FF" : "#F8FAFC",
                borderRadius: 8,
                padding: "10px 14px",
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "#0F172A", fontSize: 14 }}>{g.nome}</b>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#2563EB", background: "#DBEAFE", padding: "2px 6px", borderRadius: 4 }}>
                  {g.vivas} vivas
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "#64748B" }}>
                <span>🎯 Reta final: <b>{g.reta}</b></span>
                <span style={{ color: g.travadas ? "#DC2626" : undefined }}>
                  ⚠️ Paradas: <b>{g.travadas}</b>
                </span>
                <span>Previsão: <b>~{Math.round(g.previsao)} un</b></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TABELA DETALHADA COM COBRANÇA WHATSAPP ── */}
      <section className="dir-card" style={{ background: "#FFFFFF", border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px 0", color: "#0F172A" }}>
          📋 Propostas Ativas ({listaExibicao.length} clientes na esteira)
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", borderBottom: "2px solid #E2E8F0", color: "#475569" }}>
                <th style={{ padding: "10px 12px" }}>Cliente</th>
                <th style={{ padding: "10px 12px" }}>Empreendimento</th>
                <th style={{ padding: "10px 12px" }}>Etapa Caixa / Junix</th>
                <th style={{ padding: "10px 12px" }}>Gerente</th>
                <th style={{ padding: "10px 12px" }}>Corretor</th>
                <th style={{ padding: "10px 12px", textAlign: "center" }}>Dias Parada</th>
                <th style={{ padding: "10px 12px", textAlign: "center" }}>Ação WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {listaExibicao.map((p) => {
                const travada = (p.dias ?? 0) >= 7;

                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #E2E8F0", background: travada ? "#FFFDFD" : undefined }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#1E293B" }}>
                      {cliCurto(p.cliente)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>
                      {titulo(p.empreendimento)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: p.reta ? "#DCFCE7" : "#F1F5F9",
                          color: p.reta ? "#166534" : "#475569",
                        }}
                      >
                        {p.etapa}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#475569" }}>
                      {p.gerenteNome}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#64748B" }}>
                      {titulo(p.corretor)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: travada ? "#DC2626" : "#64748B" }}>
                      {p.dias} dias {travada && "⚠️"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => cobrarGerenteWhatsApp(p)}
                        style={{
                          padding: "4px 8px",
                          background: travada ? "#DC2626" : "#25D366",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        📱 {travada ? "Cobrar Urgente" : "Cobrar Gerente"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!listaExibicao.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#64748B" }}>
                    Nenhuma pasta encontrada com os filtros selecionados.
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
