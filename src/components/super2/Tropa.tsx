// Gestão de Equipes da Superintendência — 100% no Design System do Cockpit do Gerente
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import TimeTab from "@/components/manager-v10/TimeTab";
import CadastrarGerente from "@/components/superintendente/CadastrarGerente";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";
import { useEscopoSuper } from "./escopo";
import { usePeriodoSuper } from "./Periodo";
import "@/styles/cockpit-gerente.css";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";

const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function Tropa({ superId }: { superId: string }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const p = usePeriodoSuper("7d");
  const { supers, carregando } = useEscopoSuper(superId, p.dias);
  const { data: cons } = useConsolidadoSuper(superId, p.dias);

  const gerentes = useMemo(
    () => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)),
    [supers]
  );

  const [ger, setGer] = useState<string>("geral");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"leads" | "carteira" | "conversa" | "plantao">("leads");
  const [modalGerenteAberto, setModalGerenteAberto] = useState(false);
  const [modalCorretorAberto, setModalCorretorAberto] = useState(false);

  useEffect(() => {
    if (ger !== "geral" && !gerentes.some((g) => g.id === ger)) setGer("geral");
  }, [gerentes, ger]);

  const vendasDe = (id: string) => cons?.linhas.find((l) => l.id === id)?.vendas ?? 0;
  const visitasDe = (id: string) => cons?.linhas.find((l) => l.id === id)?.visitas ?? 0;

  const corretores = useMemo(
    () =>
      gerentes
        .flatMap((g) => (g.corretores_lista ?? []).map((c) => ({ ...c, gerente: g.nome, gerenteId: g.id })))
        .sort((a, b) =>
          ordem === "leads"
            ? b.leads_periodo - a.leads_periodo
            : ordem === "carteira"
            ? b.carteira - a.carteira
            : ordem === "conversa"
            ? b.em_conversa - a.em_conversa
            : Number(!!b.plantao_hoje) - Number(!!a.plantao_hoje)
        ),
    [gerentes, ordem]
  );

  const corretoresFiltrados = useMemo(() => {
    if (!busca.trim()) return corretores;
    const b = busca.toLowerCase();
    return corretores.filter(
      (c) => c.nome.toLowerCase().includes(b) || c.gerente.toLowerCase().includes(b)
    );
  }, [corretores, busca]);

  const tot = gerentes.reduce(
    (a, g) => ({
      cor: a.cor + g.corretores,
      on: a.on + g.online,
      pl: a.pl + g.plantao_hoje,
      plS: a.plS + g.plantao_semana,
      leads: a.leads + g.leads_periodo,
      cart: a.cart + g.carteira,
      conv: a.conv + g.em_conversa,
      vendas: a.vendas + vendasDe(g.id),
      visitas: a.visitas + visitasDe(g.id),
    }),
    { cor: 0, on: 0, pl: 0, plS: 0, leads: 0, cart: 0, conv: 0, vendas: 0, visitas: 0 }
  );

  async function cobrarGerente(gerenteId: string, gerenteNome: string) {
    const texto = `${gerenteNome}, como está o alinhamento com a equipe hoje? Vi a posição de plantão e esteira aqui no painel da superintendência.`;
    await enviarPeloMeuChip({ paraId: gerenteId, rotulo: gerenteNome, mensagem: texto, motivo: "alinhamento_equipe" });
  }

  return (
    <div className="cockpit-v3">
      {/* ── CABEÇALHO DO COCKPIT NO PADRÃO EXECUTIVO ── */}
      <header className="cockpit-v3-header">
        <div className="cockpit-v3-title">
          <h1>Gestão de Equipes & Tropa</h1>
          <p>
            {ger === "geral"
              ? `Superintendência · Visão consolidada de todas as equipes · ${p.texto}`
              : `Superintendência · Visualizando equipe de ${gerentes.find((g) => g.id === ger)?.nome ?? "Gerente"}`}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-queima-primario"
            style={{ background: "var(--cv-brand)", boxShadow: "none" }}
            onClick={() => setModalGerenteAberto(true)}
          >
            <span>👔</span> + Cadastrar Gerente
          </button>
          <button
            type="button"
            className="btn-queima-secundario"
            onClick={() => setModalCorretorAberto(true)}
          >
            <span>👤</span> + Cadastrar Corretor
          </button>

          {ger === "geral" && (
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
          )}
        </div>
      </header>

      {/* ── SELETOR DE EQUIPE EM PÍLULAS ── */}
      <div className="origem-pills-bar-v3">
        <button
          type="button"
          className={`origem-pill-btn-v3 ${ger === "geral" ? "active" : ""}`}
          onClick={() => setGer("geral")}
        >
          🌐 Todas as Equipes <span className="mono">{tot.cor} corretores</span>
        </button>
        {gerentes.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`origem-pill-btn-v3 ${ger === g.id ? "active" : ""}`}
            onClick={() => setGer(g.id)}
          >
            👔 {g.nome} <span className="mono">{g.corretores} corr · {g.online} on</span>
          </button>
        ))}
      </div>

      {ger !== "geral" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn-queima-secundario"
              onClick={() => setGer("geral")}
            >
              ← Voltar para Todas as Equipes
            </button>
            <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>
              Gerente: <b>{gerentes.find((g) => g.id === ger)?.nome}</b>
            </span>
          </div>
          <TimeTab key={ger} managerId={ger} />
        </div>
      ) : carregando ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--cv-text-muted)" }}>
          Somando as equipes da superintendência…
        </div>
      ) : (
        <>
          {/* ── PLACAR HERO CONSOLIDADO DA TROPA ── */}
          <section className="hero-placar-v3">
            <div className="kpi-card-v3">
              <span className="kpi-title-v3">Corretores na Tropa</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
                {tot.cor}
              </div>
              <span className="kpi-sub-v3">
                <b style={{ color: "var(--cv-green)" }}>{tot.on} online agora</b> · {gerentes.length} equipes
              </span>
            </div>

            <div className="kpi-card-v3">
              <span className="kpi-title-v3">Plantão Presencial (C2S)</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
                {tot.pl}
              </div>
              <span className="kpi-sub-v3">
                corretores em plantão hoje · <b className="mono">{tot.plS}</b> na semana
              </span>
            </div>

            <div className="kpi-card-v3">
              <span className="kpi-title-v3">Leads Recebidos</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-text-main)" }}>
                {tot.leads}
              </div>
              <span className="kpi-sub-v3">
                {tot.cart} em carteira · <b style={{ color: "var(--cv-brand)" }}>{pct(tot.conv, tot.cart)}%</b> em conversa
              </span>
            </div>

            <div className="kpi-card-v3 destaque">
              <span className="kpi-title-v3">Vendas Confirmadas (Junix)</span>
              <div className="kpi-val-v3 mono" style={{ fontSize: 26, color: "var(--cv-brand)" }}>
                {tot.vendas} un
              </div>
              <span className="kpi-sub-v3">
                <b className="mono" style={{ color: "var(--cv-text-main)" }}>{tot.visitas}</b> visitas comparecidas C2S
              </span>
            </div>
          </section>

          {/* ── TABELA 1: RAIO-X COMPARATIVO DE EQUIPES ── */}
          <section className="tropa-section-v3">
            <div className="tropa-header-v3">
              <div className="tropa-title-v3">
                <h2>🏢 Raio-X Comparativo de Equipes</h2>
                <span>Produtividade, presença e conversão de cada equipe da sua superintendência</span>
              </div>
            </div>

            <div className="tropa-table-container-v3">
              <table className="tropa-table-v3">
                <thead>
                  <tr>
                    <th>Equipe (Gerente)</th>
                    <th style={{ textAlign: "center" }}>Corretores</th>
                    <th style={{ textAlign: "center" }}>Online</th>
                    <th style={{ textAlign: "center" }}>Plantão Hoje</th>
                    <th style={{ textAlign: "center" }}>Plantão Sem.</th>
                    <th style={{ textAlign: "center" }}>Leads</th>
                    <th style={{ textAlign: "center" }}>Carteira</th>
                    <th style={{ textAlign: "center" }}>Em Conversa</th>
                    <th style={{ textAlign: "center" }}>Visitas</th>
                    <th style={{ textAlign: "center" }}>Vendas</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {gerentes.map((g) => {
                    const vd = vendasDe(g.id);
                    const vs = visitasDe(g.id);
                    return (
                      <tr key={g.id}>
                        <td>
                          <b style={{ color: "var(--cv-text-main)", fontSize: 14 }}>{g.nome}</b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono">{g.corretores}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mini-badge-v3 online" style={{ padding: "2px 8px" }}>
                            {g.online} on
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono" style={{ color: g.plantao_hoje ? "var(--cv-green)" : "inherit" }}>
                            {g.plantao_hoje}
                          </b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono" style={{ color: "var(--cv-text-muted)" }}>
                            {g.plantao_semana}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono">{g.leads_periodo}</b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono">{g.carteira}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono" style={{ color: "var(--cv-brand)", fontWeight: 700 }}>
                            {g.em_conversa} ({pct(g.em_conversa, g.carteira)}%)
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono">{vs}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono" style={{ color: vd > 0 ? "var(--cv-green)" : "inherit", fontSize: 14 }}>
                            {vd} un
                          </b>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              type="button"
                              className="btn-queima-primario"
                              style={{ padding: "4px 8px", fontSize: 11.5, background: "var(--cv-brand)", boxShadow: "none" }}
                              onClick={() => setGer(g.id)}
                            >
                              Abrir Equipe
                            </button>
                            <button
                              type="button"
                              className="btn-queima-secundario"
                              style={{ padding: "4px 8px", fontSize: 11.5 }}
                              onClick={() => cobrarGerente(g.id, g.nome)}
                            >
                              Cobrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── TABELA 2: RANKING GERAL DE CORRETORES ── */}
          <section className="tropa-section-v3">
            <div className="tropa-header-v3">
              <div className="tropa-title-v3">
                <h2>Todos os Corretores da Tropa</h2>
                <span>{corretores.length} corretores · Compare o ritmo e engajamento da equipe inteira</span>
              </div>

              {/* Barra de Busca de Corretor */}
              <div className="search-box-v3" style={{ width: 300 }}>
                <span></span>
                <input
                  type="text"
                  placeholder="Buscar por corretor ou gerente..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <div className="tropa-table-container-v3">
              <table className="tropa-table-v3">
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th>Equipe</th>
                    <th style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setOrdem("plantao")}>
                      Plantão Hoje {ordem === "plantao" ? "▾" : ""}
                    </th>
                    <th style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setOrdem("leads")}>
                      Leads {ordem === "leads" ? "▾" : ""}
                    </th>
                    <th style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setOrdem("carteira")}>
                      Carteira {ordem === "carteira" ? "▾" : ""}
                    </th>
                    <th style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setOrdem("conversa")}>
                      Em Conversa {ordem === "conversa" ? "▾" : ""}
                    </th>
                    <th style={{ textAlign: "right" }}>Último Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {corretoresFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                        Nenhum corretor encontrado com o filtro aplicado.
                      </td>
                    </tr>
                  ) : (
                    corretoresFiltrados.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: c.online ? "var(--cv-green)" : "var(--cv-border)",
                              }}
                            />
                            <b style={{ color: "var(--cv-text-main)" }}>{c.nome}</b>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>{c.gerente}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {c.plantao_hoje ? (
                            <span className="mini-badge-v3 online" style={{ padding: "2px 8px" }}>
                              No Plantão
                            </span>
                          ) : (
                            <span style={{ color: "var(--cv-text-dim)" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono">{c.leads_periodo}</b>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="mono">{c.carteira}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <b className="mono" style={{ color: c.em_conversa > 0 ? "var(--cv-brand)" : "inherit" }}>
                            {c.em_conversa}
                          </b>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 12, color: "var(--cv-text-muted)" }}>
                            {c.ultimo_acesso
                              ? new Date(c.ultimo_acesso).toLocaleDateString("pt-BR")
                              : "nunca entrou"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Modais de Cadastro de Gerente e Corretor */}
      {modalGerenteAberto && (
        <CadastrarGerente
          superId={superId}
          superNome={supers.find((s) => s.id === superId)?.nome ?? "Superintendente"}
          onFechar={() => setModalGerenteAberto(false)}
          onPronto={() => {
            setModalGerenteAberto(false);
            qc.invalidateQueries({ queryKey: ["diretoria"] });
          }}
        />
      )}
      {modalCorretorAberto && (
        <CadastrarCorretor
          managerId={gerentes[0]?.id || superId}
          gerentes={gerentes.map((g) => ({ id: g.id, nome: g.nome }))}
          onFechar={() => setModalCorretorAberto(false)}
          onPronto={() => {
            setModalCorretorAberto(false);
            qc.invalidateQueries({ queryKey: ["diretoria"] });
          }}
        />
      )}
    </div>
  );
}
