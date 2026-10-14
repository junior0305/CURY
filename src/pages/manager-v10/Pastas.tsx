// PASTAS — onde estão as propostas da equipe e quais travaram no Junix / Caixa.
// Kanban de Crédito com cobrança direta no WhatsApp e visão por fases.

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { useTheme } from "@/contexts/ThemeContext";
import { usePastas, DIAS_TRAVADA, type Pasta } from "@/hooks/usePastas";
import { Blank, Tbl, Tr } from "@/components/manager-v10/ui";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { toast } from "sonner";
import "@/styles/manager-v10.css";
import "@/styles/cockpit-gerente.css";
import "@/styles/pastas-kanban.css";

const ini = (s: string) => s.trim().slice(0, 2).toUpperCase();

type ViewModo = "kanban" | "corretor";
type FiltroTipo = "todas" | "travadas" | "sem_corretor" | "outras";

interface ColunaFase {
  id: string;
  titulo: string;
  icone: string;
  etapasJunix: string[];
}

const FASES_CREDITO: ColunaFase[] = [
  {
    id: "montagem",
    titulo: "Montagem de Pasta",
    icone: "📝",
    etapasJunix: ["cadastro", "anexar documento", "selecionar unidade", "simular", "proposta"],
  },
  {
    id: "analise",
    titulo: "Em Análise Caixa",
    icone: "🏦",
    etapasJunix: ["laudo / pré-análise", "laudo", "pré-análise", "sem análise", "análise"],
  },
  {
    id: "pendencia",
    titulo: "Pendências Caixa",
    icone: "⚠️",
    etapasJunix: ["pendência", "pendencia", "exigência", "documentação pendente"],
  },
  {
    id: "aprovado",
    titulo: "Aprovado & Assinatura",
    icone: "✍️",
    etapasJunix: ["emissão", "venda confirmada", "aprovado", "conformidade"],
  },
];

function classificarFase(etapa: string): string {
  const norm = (etapa || "").toLowerCase().trim();
  for (const fase of FASES_CREDITO) {
    if (fase.etapasJunix.some((e) => norm.includes(e))) return fase.id;
  }
  return "montagem"; // fallback
}

export default function Pastas() {
  const { session } = useAuth();
  const userId = useEffectiveManagerId() ?? session?.user?.id;
  const { mode, toggle } = useTheme();
  const { data, isLoading, error } = usePastas(userId);

  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroTipo>("todas");
  const [viewModo, setViewModo] = useState<ViewModo>("kanban");

  loadFonts();

  const cobrancasWhatsApp = (p: Pasta) => {
    const corretorNome = p.corretor || "Corretor";
    const msg = `Fala ${corretorNome}, a pasta do cliente ${p.cliente} (Proposta #${p.id}) está na etapa "${p.etapa}" há ${p.dias} dias no Junix. Você consegue verificar o destravamento hoje para não perdermos o prazo da Caixa?`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    toast.success(`Cobrança aberta no WhatsApp para ${corretorNome}!`);
  };

  const listaFiltrada = useMemo(() => {
    if (!data) return [];
    let base = filtroAtivo === "outras" ? data.semDono : data.minhas;

    if (filtroAtivo === "travadas") {
      base = base.filter((p) => p.dias >= DIAS_TRAVADA);
    } else if (filtroAtivo === "sem_corretor") {
      base = base.filter((p) => !p.corretorId);
    }

    if (busca.trim()) {
      const q = busca.toLowerCase();
      base = base.filter(
        (p) =>
          p.cliente.toLowerCase().includes(q) ||
          (p.corretor || "").toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.etapa.toLowerCase().includes(q)
      );
    }

    return base;
  }, [data, filtroAtivo, busca]);

  const pastasPorFase = useMemo(() => {
    const mapa: Record<string, Pasta[]> = {
      montagem: [],
      analise: [],
      pendencia: [],
      aprovado: [],
    };

    listaFiltrada.forEach((p) => {
      const fase = classificarFase(p.etapa);
      if (mapa[fase]) mapa[fase].push(p);
      else mapa.montagem.push(p);
    });

    // Ordenar: mais dias travadas primeiro dentro de cada fase
    Object.keys(mapa).forEach((k) => {
      mapa[k].sort((a, b) => b.dias - a.dias);
    });

    return mapa;
  }, [listaFiltrada]);

  if (isLoading) {
    return (
      <div className="mgr10 app2 pastas">
        <RailV10 atual={"pastas" as any} mode={mode} toggle={toggle} />
        <main className="shell2">
          <div className="blank">Carregando as pastas do Junix...</div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mgr10 app2 pastas">
        <RailV10 atual={"pastas" as any} mode={mode} toggle={toggle} />
        <main className="shell2">
          <Blank title="Não consegui ler as pastas do Junix">
            {String((error as any)?.message ?? "Verifique sua conexão ou tente recarregar a página.")}
          </Blank>
        </main>
      </div>
    );
  }

  const d = data;
  const totalMinhas = d.minhas.length;
  const totalTravadas = d.minhas.filter((p) => p.dias >= DIAS_TRAVADA).length;
  const totalSemCorretor = d.minhas.filter((p) => !p.corretorId).length;
  const totalOutras = d.semDono.length;

  const colsTabela = "minmax(0,1.2fr) 90px 90px minmax(0,2fr) 130px";

  return (
    <div className="mgr10 app2 pastas">
      <RailV10 atual={"pastas" as any} mode={mode} toggle={toggle} />

      <main className="shell2 pastas-v3">
        {/* ── CABEÇALHO ── */}
        <header className="pastas-v3-header">
          <div className="pastas-v3-title">
            <h1>Controle de Pastas & Crédito Caixa</h1>
            <p>
              Fluxo em tempo real do Junix · Propostas da equipe, etapas de aprovação e destravamentos
              {d.atualizadoEm ? (
                <> · Atualizado às {new Date(d.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>
              ) : null}
            </p>
          </div>

          <div className="pastas-view-toggle">
            <button
              type="button"
              className={`pastas-view-btn ${viewModo === "kanban" ? "active" : ""}`}
              onClick={() => setViewModo("kanban")}
            >
              📋 Kanban das 4 Fases
            </button>
            <button
              type="button"
              className={`pastas-view-btn ${viewModo === "corretor" ? "active" : ""}`}
              onClick={() => setViewModo("corretor")}
            >
              📊 Resumo por Corretor
            </button>
          </div>
        </header>

        {/* ── SCORE ROW / KPIS RÁPIDOS (CLICÁVEIS) ── */}
        <section className="pastas-kpis-grid">
          {/* Todas as Pastas da Equipe */}
          <div
            className={`pasta-kpi-card ${filtroAtivo === "todas" ? "active" : ""}`}
            onClick={() => setFiltroAtivo("todas")}
          >
            <span className="pasta-kpi-label">📁 Pastas da Equipe</span>
            <div className="pasta-kpi-val mono">
              <span style={{ color: "var(--cv-brand)" }}>{totalMinhas}</span>
              <span style={{ fontSize: 13, color: "var(--cv-text-muted)", fontWeight: 500 }}>no Junix</span>
            </div>
            <span className="pasta-kpi-sub">Total de propostas ativas</span>
          </div>

          {/* Pastas Travadas */}
          <div
            className={`pasta-kpi-card alert ${filtroAtivo === "travadas" ? "active" : ""}`}
            onClick={() => setFiltroAtivo((v) => (v === "travadas" ? "todas" : "travadas"))}
          >
            <span className="pasta-kpi-label">🔥 Travadas (+{DIAS_TRAVADA} dias)</span>
            <div className="pasta-kpi-val mono" style={{ color: "var(--cv-rose)" }}>
              {totalTravadas}
            </div>
            <span className="pasta-kpi-sub">Paradas na mesma etapa</span>
          </div>

          {/* Sem Corretor no Comandra */}
          <div
            className={`pasta-kpi-card ${filtroAtivo === "sem_corretor" ? "active" : ""}`}
            onClick={() => setFiltroAtivo((v) => (v === "sem_corretor" ? "todas" : "sem_corretor"))}
          >
            <span className="pasta-kpi-label">⚠️ Sem Corretor</span>
            <div className="pasta-kpi-val mono" style={{ color: totalSemCorretor > 0 ? "var(--cv-amber)" : "inherit" }}>
              {totalSemCorretor}
            </div>
            <span className="pasta-kpi-sub">Corretor sem login Comandra</span>
          </div>

          {/* Outras Equipes (Diretoria) */}
          <div
            className={`pasta-kpi-card ${filtroAtivo === "outras" ? "active" : ""}`}
            onClick={() => setFiltroAtivo((v) => (v === "outras" ? "todas" : "outras"))}
          >
            <span className="pasta-kpi-label">🏢 Outras Equipes</span>
            <div className="pasta-kpi-val mono">
              {totalOutras}
            </div>
            <span className="pasta-kpi-sub">Propostas da diretoria</span>
          </div>
        </section>

        {/* ── BARRA DE BUSCA E CONTROLE ── */}
        <section className="pastas-toolbar">
          <div className="pastas-search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Buscar por cliente, corretor, proposta # ou etapa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
              Exibindo <b>{listaFiltrada.length} pastas</b> {filtroAtivo !== "todas" ? "(filtradas)" : ""}
            </span>
            {filtroAtivo !== "todas" && (
              <button
                type="button"
                className="btn-action-v3"
                style={{ background: "var(--cv-surface-subtle)", padding: "4px 8px" }}
                onClick={() => setFiltroAtivo("todas")}
              >
                Limpar filtro ✕
              </button>
            )}
          </div>
        </section>

        {/* ── CONTEÚDO PRINCIPAL: KANBAN OU RESUMO POR CORRETOR ── */}
        {viewModo === "kanban" ? (
          <div className="kanban-board">
            {FASES_CREDITO.map((fase) => {
              const pastasDaFase = pastasPorFase[fase.id] || [];
              const travadasFase = pastasDaFase.filter((p) => p.dias >= DIAS_TRAVADA).length;

              return (
                <div key={fase.id} className="kanban-col">
                  {/* Cabeçalho da Coluna */}
                  <div className="kanban-col-hd">
                    <div className="kanban-col-title">
                      <span>{fase.icone}</span>
                      <span>{fase.titulo}</span>
                    </div>
                    <span className={`kanban-col-count ${travadasFase > 0 ? "has-alert" : ""}`}>
                      {pastasDaFase.length}
                      {travadasFase > 0 ? ` (${travadasFase} trav.)` : ""}
                    </span>
                  </div>

                  {/* Lista de Cards da Fase */}
                  <div className="kanban-col-body">
                    {pastasDaFase.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 24, color: "var(--cv-text-muted)", fontSize: 12.5 }}>
                        Nenhuma pasta nesta etapa.
                      </div>
                    ) : (
                      pastasDaFase.map((p) => {
                        const isTravada = p.dias >= DIAS_TRAVADA;
                        const corretorNome = p.corretor || (p.daEquipe ? "Sem corretor" : "Outra equipe");

                        return (
                          <div key={p.id} className={`pasta-card ${isTravada ? "vencido" : ""}`}>
                            <div className="pasta-card-top">
                              <span className="pasta-cliente-nome">{p.cliente}</span>
                              <span className="pasta-id-tag mono">#{p.id}</span>
                            </div>

                            <div className="pasta-sub-info">
                              <div className="pasta-corretor-box">
                                <div className="pasta-corretor-avatar">
                                  {ini(corretorNome)}
                                </div>
                                <span>{corretorNome}</span>
                              </div>

                              <span className={`dias-badge mono ${p.dias >= DIAS_TRAVADA ? "crit" : p.dias >= 3 ? "warn" : "ok"}`}>
                                {p.dias === 0 ? "Hoje" : `${p.dias}d parado`}
                              </span>
                            </div>

                            {p.fluxo && (
                              <div style={{ fontSize: 11, color: "var(--cv-text-dim)" }}>
                                Etapa Junix: <b>{p.etapa}</b> · Fluxo: {p.fluxo}
                              </div>
                            )}

                            <div className="pasta-card-actions">
                              <button
                                type="button"
                                className="btn-cobrar-whats"
                                onClick={() => cobrancasWhatsApp(p)}
                              >
                                💬 Cobrar Corretor no WhatsApp
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Visão em Tabela Resumo por Corretor */
          <div style={{ background: "var(--cv-surface)", borderRadius: "var(--cv-radius-md)", border: "1px solid var(--cv-border)", overflow: "hidden", padding: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
              Carga de Pastas por Corretor
            </h3>
            {d.porCorretor.length === 0 ? (
              <Blank title="Nenhum corretor com pasta ativa" />
            ) : (
              <Tbl cols={colsTabela} head={["Corretor", "Total de Pastas", "Travadas (+7d)", "Fases no Junix", "Ação"]}>
                {d.porCorretor.map((c) => (
                  <Tr key={c.id ?? c.nome} cols={colsTabela}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="pasta-corretor-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                        {ini(c.nome)}
                      </div>
                      <b>{c.nome}</b>
                    </div>
                    <span className="mono" style={{ fontWeight: 700 }}>{c.total}</span>
                    <span className="mono" style={{ fontWeight: 800, color: c.travadas > 0 ? "var(--cv-rose)" : "inherit" }}>
                      {c.travadas || "0"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--cv-text-muted)" }}>
                      {c.porEtapa.map((e) => `${e.n} ${e.etapa}`).join(" · ")}
                    </span>
                    <button
                      type="button"
                      className="btn-action-v3 whatsapp"
                      style={{ padding: "4px 8px", fontSize: 11 }}
                      onClick={() => {
                        const msg = `Fala ${c.nome.split(" ")[0]}, você está com ${c.total} pastas ativas no Junix (${c.travadas} paradas há mais de 7 dias). Vamos alinhar as pendências com a Caixa hoje?`;
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
                      }}
                    >
                      💬 Cobrar Geral
                    </button>
                  </Tr>
                ))}
              </Tbl>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
