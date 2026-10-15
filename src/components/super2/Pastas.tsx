// Pastas do Superintendente — 100% no Design System do Cockpit do Gerente
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import PastasPainel from "@/components/diretoria/PastasPainel";
import { lerPastas, ROTULO_ETAPA } from "@/components/diretoria/pastasAnalise";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper } from "./Periodo";
import "@/styles/cockpit-gerente.css";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";

type Situacao = "todas" | "vivas" | "paradas" | "reprovadas" | "mortas";

const titulo = (t: string | null | undefined) =>
  (t ?? "—")
    .replace(/\s+BN\s*$/i, "")
    .replace(/^Condom[ií]nio\s+/i, "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default function PastasDoSuper({ superId }: { superId: string }) {
  const { session } = useAuth();
  const { diretorId, supers, pastas, carregando } = useEscopoSuper(superId);
  const p = usePeriodoSuper("30d");
  const [todoPeriodo, setTodoPeriodo] = useState(true);
  const [sit, setSit] = useState<Situacao>("todas");
  const [ger, setGer] = useState("todos");
  const [supFiltro, setSupFiltro] = useState("todas");

  const doPeriodo = useMemo(() => {
    if (todoPeriodo) return pastas;
    return pastas.filter((x) => {
      const d = String(x.cadastrada_em || "").slice(0, 10);
      return d && d >= p.janela.de && d <= p.janela.ate;
    });
  }, [pastas, todoPeriodo, p.janela.de, p.janela.ate]);

  const lidas = useMemo(() => lerPastas(doPeriodo), [doPeriodo]);
  const supersUnicos = useMemo(() => [...new Set(lidas.map((x) => x.superintendente || "—"))].filter((s) => s !== "—").sort(), [lidas]);
  const gerentes = useMemo(() => [...new Set(lidas.map((x) => x.gerente || "—"))].sort(), [lidas]);

  const situacao = (x: any): Exclude<Situacao, "todas"> =>
    x.reprovada ? "reprovadas" : !x.viva ? "mortas" : (x.dias ?? 0) >= 7 ? "paradas" : "vivas";

  const conta = (s: Exclude<Situacao, "todas">) => lidas.filter((x) => situacao(x) === s).length;

  const lista = lidas
    .filter((x) =>
      (sit === "todas" || situacao(x) === sit) &&
      (ger === "todos" || (x.gerente || "—") === ger) &&
      (supFiltro === "todas" || (x.superintendente || "—") === supFiltro)
    )
    .sort((a, b) => (a.viva === b.viva ? (b.dias ?? 0) - (a.dias ?? 0) : a.viva ? -1 : 1));

  const paradasCriticas = useMemo(() => lidas.filter((x) => situacao(x) === "paradas"), [lidas]);

  async function cobrarGerente(gerenteNome: string, clienteNome: string, dias: number, etapa: string) {
    const texto = `${gerenteNome}, a pasta do cliente ${titulo(clienteNome)} está travada há ${dias} dias na etapa de ${etapa}. Consegue priorizar o desatravamento hoje junto ao correspondente Caixa?`;
    // sai pelo WhatsApp de quem clica (chip), sem abrir o WhatsApp ao lado; registra em cobrancas
    await enviarPeloMeuChip({ paraNome: gerenteNome, mensagem: texto, motivo: "pasta_travada" });
  }

  return (
    <div className="cockpit-v3">
      {/* ── CABEÇALHO DO COCKPIT NO PADRÃO EXECUTIVO ── */}
      <header className="cockpit-v3-header">
        <div className="cockpit-v3-title">
          <h1>Pastas & Aprovação de Crédito (Junix)</h1>
          <p>
            Superintendência · Pastas dos corretores das suas equipes ·{" "}
            {todoPeriodo ? "Esteira contínua (todas as pastas em andamento)" : `Cadastradas ${p.texto}`}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--cv-text-muted)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={!todoPeriodo}
              onChange={(e) => setTodoPeriodo(!e.target.checked)}
            />
            Filtrar por data de cadastro
          </label>

          {!todoPeriodo && (
            <div className="periodo-bar-v3">
              {(["hoje", "7d", "30d"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`periodo-btn-v3 ${p.per === k ? "active" : ""}`}
                  onClick={() => p.setPer(k)}
                >
                  {k === "hoje" ? "Hoje" : k === "7d" ? "7 dias" : "30 dias"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {carregando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--cv-text-muted)" }}>
          Lendo as pastas do Junix das suas equipes…
        </div>
      ) : !pastas.length ? (
        <div className="alerta-queima-caixa">
          <div className="alerta-queima-conteudo">
            <span style={{ fontSize: 20 }}>ℹ️</span>
            <div className="alerta-queima-texto">
              <b>Nenhuma pasta vinculada a corretores das suas equipes</b>
              <p className="alerta-queima-sub">
                Se algum corretor possui pasta ativa no Junix e não aparece aqui, confira se o nome dele no Junix está exatamente igual ao cadastro do Comandra.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── PLACAR HERO DE PASTAS ── */}
          <section className="hero-placar-v3">
            <div
              className={`kpi-card-v3 destaque ${sit === "vivas" ? "active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSit(sit === "vivas" ? "todas" : "vivas")}
              title="Clique para filtrar apenas pastas vivas"
            >
              <span className="kpi-title-v3">Pastas Vivas no Funil</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-brand)" }}>
                {conta("vivas")} un
              </div>
              <span className="kpi-sub-v3">
                em análise ou montagem de crédito na Caixa
              </span>
            </div>

            <div
              className={`kpi-card-v3 ${sit === "paradas" ? "active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSit(sit === "paradas" ? "todas" : "paradas")}
              title="Clique para filtrar apenas pastas paradas há 7d+"
            >
              <span className="kpi-title-v3">Paradas há 7d+ (Gargalo)</span>
              <div
                className="kpi-val-v3 mono"
                style={{ fontSize: 26, color: conta("paradas") > 0 ? "var(--cv-rose)" : "inherit" }}
              >
                {conta("paradas")} un
              </div>
              <span className="kpi-sub-v3">
                risco de perda do cliente por demora na esteira
              </span>
            </div>

            <div
              className={`kpi-card-v3 ${sit === "reprovadas" ? "active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSit(sit === "reprovadas" ? "todas" : "reprovadas")}
              title="Clique para filtrar apenas reprovadas"
            >
              <span className="kpi-title-v3">Reprovadas Caixa</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-rose)" }}>
                {conta("reprovadas")} un
              </div>
              <span className="kpi-sub-v3">
                condicionadas ou recusadas no período
              </span>
            </div>

            <div
              className={`kpi-card-v3 ${sit === "todas" ? "active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSit("todas")}
              title="Clique para ver todas as pastas"
            >
              <span className="kpi-title-v3">Total de Pastas Cadastradas</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
                {lidas.length} un
              </div>
              <span className="kpi-sub-v3">
                {todoPeriodo ? "esteira completa" : `cadastradas ${p.texto}`}
              </span>
            </div>
          </section>

          {/* ── ALERTA DE GARGALO DE CRÉDITO ── */}
          {paradasCriticas.length > 0 && (
            <div className="alerta-queima-caixa">
              <div className="alerta-queima-conteudo">
                <div className="alerta-queima-icone">
                  
                </div>
                <div className="alerta-queima-texto">
                  <div className="alerta-queima-titulo">
                    <span className="badge-risco-financeiro">GARGALO DE CRÉDITO</span>
                    <b>{paradasCriticas.length} pastas travadas há 7+ dias na esteira Caixa</b>
                  </div>
                  <p className="alerta-queima-sub">
                    Pastas que passam de 7 dias sem evolução costumam esfriar ou cair por validade documental. Acione os gerentes responsáveis para destravamento.
                  </p>
                </div>
              </div>
              <div className="alerta-queima-acoes">
                <button
                  type="button"
                  className="btn-queima-primario"
                  onClick={() => setSit("paradas")}
                >
                  Filtrar as {paradasCriticas.length} Paradas
                </button>
              </div>
            </div>
          )}

          {/* ── PAINEL DE PIPELINE E RESUMO DE DIRETORIA ── */}
          <div style={{ background: "var(--cv-surface)", borderRadius: "var(--cv-radius-md)", border: "1px solid var(--cv-border)", padding: "16px 20px" }}>
            <PastasPainel diretorId={diretorId} supers={supers} pastas={doPeriodo} modoSuper />
          </div>

          {/* ── LISTAGEM COMPLETA DAS PASTAS ── */}
          <section className="tropa-section-v3">
            <div className="tropa-header-v3">
              <div className="tropa-title-v3">
                <h2>Lista Detalhada de Pastas</h2>
                <span>Acompanhe o andamento de cada proposta e cobre o gerente com 1 clique</span>
              </div>
            </div>

            {/* Pílulas de Filtro de Situação */}
            <div className="origem-pills-bar-v3" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["todas", "vivas", "paradas", "reprovadas", "mortas"] as Situacao[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`origem-pill-btn-v3 ${sit === s ? "active" : ""}`}
                    onClick={() => setSit(s)}
                  >
                    {s === "todas"
                      ? "Todas"
                      : s === "vivas"
                      ? "Vivas"
                      : s === "paradas"
                      ? "Paradas 7d+"
                      : s === "reprovadas"
                      ? "Reprovadas"
                      : "Sem chance"}{" "}
                    <span className="mono">{s === "todas" ? lidas.length : conta(s)}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {supersUnicos.length > 1 && (
                  <select
                    value={supFiltro}
                    onChange={(e) => setSupFiltro(e.target.value)}
                    style={{
                      background: "var(--cv-surface)",
                      border: "1px solid var(--cv-border)",
                      borderRadius: "var(--cv-radius-sm)",
                      padding: "6px 12px",
                      fontSize: 13,
                      color: "var(--cv-text-main)",
                      outline: "none",
                    }}
                  >
                    <option value="todas">Todas as superintendências</option>
                    {supersUnicos.map((s) => (
                      <option key={s} value={s}>
                        Super: {s}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={ger}
                  onChange={(e) => setGer(e.target.value)}
                  style={{
                    background: "var(--cv-surface)",
                    border: "1px solid var(--cv-border)",
                    borderRadius: "var(--cv-radius-sm)",
                    padding: "6px 12px",
                    fontSize: 13,
                    color: "var(--cv-text-main)",
                    outline: "none",
                  }}
                >
                  <option value="todos">Todos os gerentes</option>
                  {gerentes.map((g) => (
                    <option key={g} value={g}>
                      Gerente: {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tropa-table-container-v3">
              <table className="tropa-table-v3">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Empreendimento</th>
                    <th>Etapa Caixa</th>
                    <th>Corretor</th>
                    <th>Gerente</th>
                    <th style={{ textAlign: "center" }}>Na Etapa</th>
                    <th>Cadastrada</th>
                    <th>Situação</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                        Nenhuma pasta encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    lista.map((x) => {
                      const s = situacao(x);
                      const etapaNome = (ROTULO_ETAPA as any)[x.etapa ?? ""] ?? titulo(x.etapa);
                      const travada = (x.dias ?? 0) >= 7;

                      return (
                        <tr key={x.proposta_id}>
                          <td>
                            <b style={{ color: "var(--cv-text-main)" }}>{titulo(x.cliente)}</b>
                          </td>
                          <td>
                            <span style={{ fontSize: 13 }}>{titulo(x.empreendimento)}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>{etapaNome}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13 }}>{titulo(x.corretor)}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{x.gerente}</span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span
                              className="mono"
                              style={{
                                color: travada ? "var(--cv-rose)" : "inherit",
                                fontWeight: travada ? 800 : 500,
                              }}
                            >
                              {x.dias ?? "—"} dias
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
                              {x.cadastrada_em
                                ? String(x.cadastrada_em).slice(0, 10).split("-").reverse().join("/")
                                : "—"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`mini-badge-v3 ${s === "vivas" ? "online" : "offline"}`}
                              style={{
                                background:
                                  s === "vivas"
                                    ? "var(--cv-green-light)"
                                    : s === "paradas"
                                    ? "var(--cv-amber-light)"
                                    : "var(--cv-rose-light)",
                                color:
                                  s === "vivas"
                                    ? "var(--cv-green)"
                                    : s === "paradas"
                                    ? "var(--cv-amber)"
                                    : "var(--cv-rose)",
                                fontWeight: 700,
                              }}
                            >
                              {s === "vivas"
                                ? "Viva"
                                : s === "paradas"
                                ? "Parada 7d+"
                                : s === "reprovadas"
                                ? "Reprovada"
                                : "Cancelada"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn-queima-secundario"
                              style={{ padding: "4px 8px", fontSize: 11.5 }}
                              onClick={() => cobrarGerente(x.gerente, x.cliente, x.dias ?? 0, etapaNome)}
                            >
                              Cobrar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
