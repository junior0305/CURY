// CENTRAL DE LEADS v3 — Gestão de Esteira, Filas de Problema e Redistribuição
//
// O gerente atua por FILAS DE PROBLEMA com ação em lote:
// Redistribuição instantânea, cobrança em massa no WhatsApp e higienização de base.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import {
  useLeads,
  redistribuir,
  descartar,
  cobrarFila,
  useCobrancasHoje,
  type LeadLinha,
  type JaCobrado,
  type Cobranca,
} from "@/hooks/useLeads";
import OrigemDrawer from "@/components/manager-v10/OrigemDrawer";
import AlertaDisparoQueima from "@/components/manager-v10/AlertaDisparoQueima";
import { usePeriodo } from "@/hooks/usePeriodo";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { Link, useNavigate } from "react-router-dom";
import {
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Send,
  MessageCircle,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Megaphone,
  Building,
  Target,
  BarChart3,
  History,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import "@/styles/cockpit-gerente.css";
import "@/styles/leads-gerente.css";

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");
const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

type ModoRedistribuicao = "online" | "plantao" | "escolher";
type SubAbaLeads = "filas" | "origens" | "funil" | "historico";

export default function Leads() {
  const { session } = useAuth();
  const userId = useEffectiveManagerId() ?? session?.user?.id;
  const { mode, toggle } = useTheme();
  const { periodo } = usePeriodo();
  const qc = useQueryClient();
  const { data, isLoading } = useLeads(userId, periodo);
  const navigate = useNavigate();

  const [subAba, setSubAba] = useState<SubAbaLeads>("filas");
  const [cobrando, setCobrando] = useState<string | null>(null);
  const { data: cobrancas = [] } = useCobrancasHoje();
  const [jaCobrou, setJaCobrou] = useState<{ chave: string; ids: string[]; ja: JaCobrado[] } | null>(null);

  // Filas abertas e seleções em lote
  const [abertas, setAbertas] = useState<Set<string>>(new Set(["respondeu", "nunca"]));
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [red, setRed] = useState<{ ids: string[] } | null>(null);
  const [modo, setModo] = useState<ModoRedistribuicao>("online");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [origAberta, setOrigAberta] = useState<null | "anuncio" | "app" | "disparo" | "proprio">(null);

  loadFonts();

  // Cobrança no WhatsApp para os corretores da fila
  async function cobrar(chave: string, ids: string[], forcar = false) {
    if (!ids.length || !session?.user?.id) return;
    setCobrando(chave);
    try {
      const r = await cobrarFila(ids, session.user.id, chave, forcar);
      const ok = r.corretores.filter((c) => c.avisado_no_whats);
      const falhou = r.corretores.filter((c) => !c.avisado_no_whats);
      if (r.corretores.length) {
        toast.success(
          `${ok.length} corretor${ok.length === 1 ? "" : "es"} cobrado${ok.length === 1 ? "" : "s"} no WhatsApp` +
            (falhou.length ? ` · sem WhatsApp: ${falhou.map((c) => c.corretor).join(", ")}` : "")
        );
      }
      if (r.ja_cobrados?.length) setJaCobrou({ chave, ids, ja: r.ja_cobrados });
      qc.invalidateQueries({ queryKey: ["cobrancas-hoje"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui disparar a cobrança.");
    } finally {
      setCobrando(null);
    }
  }

  const ultimaCobranca = (brokerId: string | null, motivo: string): Cobranca | undefined =>
    brokerId ? cobrancas.find((c) => c.para_id === brokerId && c.motivo === motivo) : undefined;

  const toggleFila = (chave: string) => {
    setAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  const marcarLead = (fila: string, id: string) => {
    setSel((s) => {
      const atual = new Set(s[fila] ?? []);
      if (atual.has(id)) atual.delete(id);
      else atual.add(id);
      return { ...s, [fila]: atual };
    });
  };

  async function confirmarRedistribuicao() {
    if (!red || !data) return;
    const alvo =
      modo === "online"
        ? data.corretores.filter((c) => c.online).map((c) => c.id)
        : modo === "plantao"
        ? data.corretores.filter((c) => c.plantao).map((c) => c.id)
        : [...marcados];

    if (!alvo.length) {
      toast.error("Escolha pelo menos um corretor de destino.");
      return;
    }
    setSalvando(true);
    try {
      await redistribuir(red.ids, alvo, userId!);
      toast.success(`${red.ids.length} leads redistribuídos entre ${alvo.length} corretores com sucesso!`);
      setRed(null);
      setSel({});
      qc.invalidateQueries({ queryKey: ["aba-leads"] });
    } catch (e: any) {
      toast.error(`Erro ao redistribuir: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  }

  async function descartarLote(fila: string) {
    const ids = [...(sel[fila] ?? [])];
    if (!ids.length) {
      toast.error("Selecione os leads que deseja descartar.");
      return;
    }
    try {
      await descartar(ids);
      toast.success(`${ids.length} leads descartados.`);
      setSel((s) => ({ ...s, [fila]: new Set() }));
      qc.invalidateQueries({ queryKey: ["aba-leads"] });
    } catch (e: any) {
      toast.error(`Erro ao descartar: ${e?.message ?? e}`);
    }
  }

  if (isLoading) {
    return (
      <div className="mgr10 app2">
        <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
        <main className="shell2">
          <div style={{ padding: "40px", textAlign: "center", color: "var(--cv-text-muted)" }}>
            Carregando a central de leads...
          </div>
        </main>
      </div>
    );
  }

  if (!data) return null;
  const d = data;

  const alvoRed =
    modo === "online"
      ? d.corretores.filter((c) => c.online)
      : modo === "plantao"
      ? d.corretores.filter((c) => c.plantao)
      : d.corretores.filter((c) => marcados.has(c.id));

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />

      <main className="shell2">
        <div className="leads-v3">
          {/* ── CABEÇALHO ── */}
          <div className="leads-v3-header">
            <div className="leads-v3-title">
              <h1>Central de Leads & Carteira</h1>
              <p>
                Gestão de esteira, filas de atendimento, redistribuição e higienização de base · {d.chegaram} no período
              </p>
            </div>
            <div className="leads-v3-actions">
              <SeletorPeriodo />
              <Link
                to="/manager/anuncios"
                className="time-btn-action"
                style={{ textDecoration: "none", fontWeight: 700 }}
              >
                <Megaphone size={14} /> Ver Anúncios
              </Link>
            </div>
          </div>

          {/* ── ALERTA DE RISCO FINANCEIRO: DISPAROS DE WHATSAPP NO VÁCUO (>30MIN) ── */}
          {userId && <AlertaDisparoQueima managerId={userId} quem="Gerente" />}

          {/* ── SCORE ROW / KPI CARDS ── */}
          <div className="leads-kpis-grid">
            {/* KPI 1: Chegaram no Período */}
            <div className="leads-kpi-card" onClick={() => setSubAba("origens")}>
              <div className="leads-kpi-top">
                <span className="leads-kpi-label">Leads Recebidos</span>
                <span className="leads-kpi-badge brand">
                  <Inbox size={12} /> {periodo.rotulo}
                </span>
              </div>
              <div className="leads-kpi-num">{d.chegaram}</div>
              <div className="leads-kpi-sub">
                {d.chegaramHoje > 0 ? (
                  <b style={{ color: "var(--cv-brand)" }}>+{d.chegaramHoje} chegaram hoje</b>
                ) : (
                  "Nenhum novo lead hoje"
                )}
              </div>
            </div>

            {/* KPI 2: Clientes sem Retorno (Quentes Parados) */}
            <div className="leads-kpi-card" onClick={() => setSubAba("filas")}>
              <div className="leads-kpi-top">
                <span className="leads-kpi-label">Esperando Resposta</span>
                <span className={`leads-kpi-badge ${d.conversa.perguntouSemResposta > 0 ? "rose" : "green"}`}>
                  <AlertTriangle size={12} /> {d.conversa.perguntouSemResposta > 0 ? "Urgente" : "Em dia"}
                </span>
              </div>
              <div className="leads-kpi-num" style={{ color: d.conversa.perguntouSemResposta > 0 ? "var(--cv-rose)" : "inherit" }}>
                {d.conversa.perguntouSemResposta}
              </div>
              <div className="leads-kpi-sub">responderam e o corretor não voltou</div>
            </div>

            {/* KPI 3: Nunca Abordados */}
            <div className="leads-kpi-card" onClick={() => setSubAba("filas")}>
              <div className="leads-kpi-top">
                <span className="leads-kpi-label">Nunca Abordados</span>
                <span className={`leads-kpi-badge ${d.conversa.nuncaFalaram > 0 ? "amber" : "green"}`}>
                  <Clock size={12} /> Sem contato
                </span>
              </div>
              <div className="leads-kpi-num" style={{ color: d.conversa.nuncaFalaram > 0 ? "var(--cv-amber)" : "inherit" }}>
                {d.conversa.nuncaFalaram}
              </div>
              <div className="leads-kpi-sub">distribuídos e ninguém falou ainda</div>
            </div>

            {/* KPI 4: Em Andamento / Negociação */}
            <div className="leads-kpi-card" onClick={() => setSubAba("funil")}>
              <div className="leads-kpi-top">
                <span className="leads-kpi-label">Em Conversa Ativa</span>
                <span className="leads-kpi-badge green">
                  <CheckCircle2 size={12} /> Conversando
                </span>
              </div>
              <div className="leads-kpi-num" style={{ color: "var(--cv-green)" }}>
                {d.conversa.emAndamento}
              </div>
              <div className="leads-kpi-sub">{d.resultado.negociacao} em negociação formal</div>
            </div>
          </div>

          {/* ── BARRA DE SUB-NAVEGAÇÃO ── */}
          <div className="leads-tabs-bar">
            <button
              className={`leads-tab-btn ${subAba === "filas" ? "active" : ""}`}
              onClick={() => setSubAba("filas")}
            >
              <AlertTriangle size={15} />
              Filas de Ação Imediata
              <span className={`leads-tab-pill ${d.conversa.perguntouSemResposta > 0 ? "hot" : ""}`}>
                {d.filas.reduce((a, f) => a + f.total, 0)}
              </span>
            </button>

            <button
              className={`leads-tab-btn ${subAba === "origens" ? "active" : ""}`}
              onClick={() => setSubAba("origens")}
            >
              <Inbox size={15} />
              Origens & Canais
              <span className="leads-tab-pill">{d.chegaram}</span>
            </button>

            <button
              className={`leads-tab-btn ${subAba === "funil" ? "active" : ""}`}
              onClick={() => setSubAba("funil")}
            >
              <BarChart3 size={15} />
              Esteira & Resultados
            </button>

            <button
              className={`leads-tab-btn ${subAba === "historico" ? "active" : ""}`}
              onClick={() => setSubAba("historico")}
            >
              <History size={15} />
              Cobranças & Repescagem
              {cobrancas.length > 0 && <span className="leads-tab-pill">{cobrancas.length}</span>}
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 1: FILAS DE AÇÃO IMEDIATA (PROBLEMAS)
              ══════════════════════════════════════════════════════════════════════ */}
          {subAba === "filas" && (
            <div className="leads-filas-list">
              {d.filas.map((f) => {
                const aberta = abertas.has(f.chave);
                const marcadosFila = sel[f.chave] ?? new Set<string>();

                return (
                  <div key={f.chave} className={`leads-fila-card ${f.tom}`}>
                    <div className="leads-fila-header" onClick={() => toggleFila(f.chave)}>
                      <div className="leads-fila-left">
                        <div className="leads-fila-badge-count">{f.total}</div>
                        <div className="leads-fila-title">
                          <b>
                            {f.total} {f.titulo}
                          </b>
                          <p>{f.porque}</p>
                        </div>
                      </div>

                      <div className="leads-fila-actions" onClick={(e) => e.stopPropagation()}>
                        {f.total > 0 && f.acoes[0] && (
                          <button
                            className="time-btn-primary"
                            style={{ fontSize: "12.5px", padding: "6px 12px" }}
                            disabled={cobrando === f.chave}
                            onClick={() => {
                              if (f.acoes[0].startsWith("Redistribuir") || f.acoes[0] === "Distribuir") {
                                setRed({ ids: f.ids });
                              } else if (f.acoes[0] === "Cobrar os corretores") {
                                cobrar(f.chave, f.ids);
                              } else if (f.acoes[0] === "Disparar reativação") {
                                navigate(`/manager/whatsapp?publico=${f.chave}`);
                              }
                            }}
                          >
                            {cobrando === f.chave ? "Cobrando..." : f.acoes[0]}
                          </button>
                        )}

                        <button
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--cv-text-muted)" }}
                          onClick={() => toggleFila(f.chave)}
                        >
                          {aberta ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </div>
                    </div>

                    {aberta && (
                      <div className="leads-fila-body">
                        {f.leads.length === 0 ? (
                          <div style={{ padding: "16px", textAlign: "center", color: "var(--cv-text-muted)", fontSize: "13px" }}>
                            Nenhum lead nesta fila no momento.
                          </div>
                        ) : (
                          <>
                            {/* Barra de ação em lote */}
                            <div className="leads-lote-bar">
                              <div className="leads-lote-left">
                                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={marcadosFila.size === f.leads.length && f.leads.length > 0}
                                    onChange={(e) =>
                                      setSel((s) => ({
                                        ...s,
                                        [f.chave]: e.target.checked ? new Set(f.leads.map((l) => l.id)) : new Set(),
                                      }))
                                    }
                                  />
                                  Selecionar todos da amostra
                                </label>
                                <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                                  ({marcadosFila.size} de {f.leads.length} selecionados)
                                </span>
                              </div>

                              <div className="leads-lote-buttons">
                                <button
                                  className="time-btn-action"
                                  disabled={!marcadosFila.size}
                                  onClick={() => setRed({ ids: [...marcadosFila] })}
                                >
                                  <RefreshCw size={13} /> Redistribuir ({marcadosFila.size})
                                </button>
                                <button
                                  className="time-btn-action"
                                  disabled={!marcadosFila.size}
                                  onClick={() => cobrar(f.chave, [...marcadosFila])}
                                >
                                  <MessageCircle size={13} /> Cobrar Corretores
                                </button>
                                <button
                                  className="time-btn-action danger"
                                  disabled={!marcadosFila.size}
                                  onClick={() => descartarLote(f.chave)}
                                >
                                  <Trash2 size={13} /> Descartar
                                </button>
                              </div>
                            </div>

                            {/* Tabela dos Leads */}
                            <div className="time-table-card">
                              <div className="time-table-responsive">
                                <table className="time-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: "40px" }}></th>
                                      <th>Cliente</th>
                                      <th>Telefone</th>
                                      <th>Corretor Atual</th>
                                      <th style={{ textAlign: "center" }}>Tempo Parado</th>
                                      <th style={{ textAlign: "right" }}>Ação</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.leads.map((l) => {
                                      const cobr = ultimaCobranca(l.brokerId, f.chave);

                                      return (
                                        <tr key={l.id}>
                                          <td>
                                            <input
                                              type="checkbox"
                                              checked={marcadosFila.has(l.id)}
                                              onChange={() => marcarLead(f.chave, l.id)}
                                            />
                                          </td>
                                          <td>
                                            <b>{l.nome || "Cliente sem nome"}</b>
                                            {l.campanha && (
                                              <span style={{ display: "block", fontSize: "11px", color: "var(--cv-text-muted)" }}>
                                                {l.campanha}
                                              </span>
                                            )}
                                          </td>
                                          <td className="mono">{l.telefone || "—"}</td>
                                          <td>
                                            <span>{l.corretor ? `com ${l.corretor}` : "sem corretor"}</span>
                                            {cobr && (
                                              <span
                                                style={{
                                                  display: "block",
                                                  fontSize: "11px",
                                                  fontWeight: 600,
                                                  color: cobr.respondida_em ? "var(--cv-green)" : "var(--cv-amber)",
                                                }}
                                              >
                                                {cobr.respondida_em
                                                  ? `✓ Corretor respondeu às ${hhmm(cobr.respondida_em)}`
                                                  : `Cobrado às ${hhmm(cobr.enviada_em)}`}
                                              </span>
                                            )}
                                          </td>
                                          <td style={{ textAlign: "center" }}>
                                            <span
                                              className={`time-kpi-badge ${l.dias > 15 ? "rose" : l.dias > 5 ? "amber" : "brand"}`}
                                            >
                                              {l.dias} dias
                                            </span>
                                          </td>
                                          <td style={{ textAlign: "right" }}>
                                            <button
                                              className="time-btn-action"
                                              onClick={() => setRed({ ids: [l.id] })}
                                            >
                                              <RefreshCw size={12} /> Mudar Corretor
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            {f.total > f.leads.length && (
                              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--cv-text-muted)", textAlign: "center" }}>
                                Mostrando {f.leads.length} de {f.total} leads da fila (os mais antigos primeiro).
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 2: ORIGENS & CANAIS (DE ONDE VIERAM)
              ══════════════════════════════════════════════════════════════════════ */}
          {subAba === "origens" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="leads-origens-grid">
                {/* Origem: Anúncio */}
                <div
                  className="leads-origem-card"
                  onClick={() => d.origem.anuncio > 0 && setOrigAberta("anuncio")}
                >
                  <div className="leads-origem-card-top">
                    <span className="leads-origem-title">Anúncios Pagos</span>
                    <span className="leads-kpi-badge brand">Meta / Google</span>
                  </div>
                  <div className="leads-origem-num">{d.origem.anuncio}</div>
                  <div className="leads-origem-desc">leads gerados pelas campanhas de mídia</div>
                  <div className="leads-origem-footer">
                    <span>{d.origem.hoje.anuncio > 0 ? `+${d.origem.hoje.anuncio} hoje` : "0 hoje"}</span>
                    <span style={{ color: "var(--cv-brand)", fontWeight: 700 }}>Ver lista →</span>
                  </div>
                </div>

                {/* Origem: Plantão C2S */}
                <div className="leads-origem-card" onClick={() => d.origem.app > 0 && setOrigAberta("app")}>
                  <div className="leads-origem-card-top">
                    <span className="leads-origem-title">Plantão C2S</span>
                    <span className="leads-kpi-badge blue">Estande Cury</span>
                  </div>
                  <div className="leads-origem-num">{d.origem.app}</div>
                  <div className="leads-origem-desc">atendidos presencialmente no estande</div>
                  <div className="leads-origem-footer">
                    <span>{d.origem.hoje.app > 0 ? `+${d.origem.hoje.app} hoje` : "0 hoje"}</span>
                    <span style={{ color: "var(--cv-blue)", fontWeight: 700 }}>Ver lista →</span>
                  </div>
                </div>

                {/* Origem: Disparos */}
                <div
                  className="leads-origem-card"
                  onClick={() => d.origem.disparo > 0 && setOrigAberta("disparo")}
                >
                  <div className="leads-origem-card-top">
                    <span className="leads-origem-title">Disparos WhatsApp</span>
                    <span className="leads-kpi-badge green">API Oficial</span>
                  </div>
                  <div className="leads-origem-num">{d.origem.disparo}</div>
                  <div className="leads-origem-desc">responderam aos envios em massa</div>
                  <div className="leads-origem-footer">
                    <span>{d.origem.hoje.disparo > 0 ? `+${d.origem.hoje.disparo} hoje` : "0 hoje"}</span>
                    <span style={{ color: "var(--cv-green)", fontWeight: 700 }}>Ver lista →</span>
                  </div>
                </div>

                {/* Origem: Próprios / Repescagem */}
                <div
                  className="leads-origem-card"
                  onClick={() => d.origem.proprio > 0 && setOrigAberta("proprio")}
                >
                  <div className="leads-origem-card-top">
                    <span className="leads-origem-title">Próprios & Repescagem</span>
                    <span className="leads-kpi-badge amber">Carteira</span>
                  </div>
                  <div className="leads-origem-num">{d.origem.proprio}</div>
                  <div className="leads-origem-desc">cadastros manuais e pesca do pool</div>
                  <div className="leads-origem-footer">
                    <span>{d.origem.hoje.proprio > 0 ? `+${d.origem.hoje.proprio} hoje` : "0 hoje"}</span>
                    <span style={{ color: "var(--cv-amber)", fontWeight: 700 }}>Ver lista →</span>
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "18px 20px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 8px" }}>
                  💡 Como funciona a triagem de entrada
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--cv-text-muted)", lineHeight: 1.5 }}>
                  Todos os leads que entram no Comandra são validados por DDD e número real antes de entrar no rodízio de distribuição da equipe. Clientes com DDD de fora do estado são filtrados para evitar desperdício de tempo da tropa.
                </p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 3: ESTEIRA & RESULTADOS (NO QUE DEU)
              ══════════════════════════════════════════════════════════════════════ */}
          {subAba === "funil" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Caminho do Lead */}
              <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 14px" }}>
                  O Caminho do Lead no Período
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "14px", borderRadius: "10px" }}>
                    <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>Chegaram ao Sistema</span>
                    <b className="mono" style={{ display: "block", fontSize: "24px", fontWeight: 900, marginTop: "4px" }}>
                      {d.chegaram}
                    </b>
                  </div>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "14px", borderRadius: "10px" }}>
                    <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>Encaminhados para a Roleta</span>
                    <b className="mono" style={{ display: "block", fontSize: "24px", fontWeight: 900, color: "var(--cv-green)", marginTop: "4px" }}>
                      {d.encaminhados}
                    </b>
                  </div>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "14px", borderRadius: "10px" }}>
                    <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>Barrados na Triagem (DDD)</span>
                    <b className="mono" style={{ display: "block", fontSize: "24px", fontWeight: 900, color: d.perdidos > 0 ? "var(--cv-rose)" : "inherit", marginTop: "4px" }}>
                      {d.perdidos}
                    </b>
                  </div>
                </div>
              </div>

              {/* Conversões Oficiais (C2S e Junix) */}
              <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 14px" }}>
                  Resultados Oficiais do Período
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "12px 14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>Em Negociação</span>
                    <b className="mono" style={{ display: "block", fontSize: "20px", fontWeight: 800, marginTop: "2px" }}>
                      {d.resultado.negociacao}
                    </b>
                  </div>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "12px 14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>Documentação / Pastas</span>
                    <b className="mono" style={{ display: "block", fontSize: "20px", fontWeight: 800, marginTop: "2px" }}>
                      {d.resultado.documentos}
                    </b>
                  </div>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "12px 14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>Visitas Registradas (C2S)</span>
                    <b className="mono" style={{ display: "block", fontSize: "20px", fontWeight: 800, color: "var(--cv-blue)", marginTop: "2px" }}>
                      {d.resultado.visitas}
                    </b>
                  </div>
                  <div style={{ background: "var(--cv-surface-subtle)", padding: "12px 14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>Vendas Confirmadas (Junix)</span>
                    <b className="mono" style={{ display: "block", fontSize: "20px", fontWeight: 800, color: "var(--cv-green)", marginTop: "2px" }}>
                      {d.resultado.vendas}
                    </b>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 4: COBRANÇAS & REPESCAGEM
              ══════════════════════════════════════════════════════════════════════ */}
          {subAba === "historico" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Cobranças do Dia */}
              <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 14px" }}>
                  Cobranças Realizadas Hoje ({cobrancas.length})
                </h3>
                {cobrancas.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--cv-text-muted)", fontSize: "13.5px" }}>
                    Nenhuma cobrança disparada hoje. Use o botão "Cobrar Corretores" nas filas de problemas para cobrar via WhatsApp.
                  </div>
                ) : (
                  <div className="time-table-card">
                    <div className="time-table-responsive">
                      <table className="time-table">
                        <thead>
                          <tr>
                            <th>Corretor</th>
                            <th>Motivo</th>
                            <th>Canal & Horário</th>
                            <th style={{ textAlign: "right" }}>Resposta do Corretor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cobrancas.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <b>{c.para_nome}</b>
                              </td>
                              <td>
                                <span className="time-kpi-badge brand">
                                  {c.motivo === "respondeu"
                                    ? "Cliente esperando resposta"
                                    : c.motivo === "nunca"
                                    ? "Nunca abordou o lead"
                                    : c.motivo}
                                </span>
                              </td>
                              <td style={{ fontSize: "12.5px" }}>
                                WhatsApp às {hhmm(c.enviada_em)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {c.respondida_em ? (
                                  <span style={{ color: "var(--cv-green)", fontWeight: 700, fontSize: "12.5px" }}>
                                    ✓ Respondeu às {hhmm(c.respondida_em)}
                                    {c.resposta ? `: "${c.resposta.slice(0, 30)}..."` : ""}
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--cv-amber)", fontSize: "12.5px" }}>
                                    Aguardando retorno
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Pool de Repescagem */}
              {d.pool.length > 0 && (
                <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "20px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 14px" }}>
                    Desempenho no Pool de Repescagem
                  </h3>
                  <div className="time-table-card">
                    <div className="time-table-responsive">
                      <table className="time-table">
                        <thead>
                          <tr>
                            <th>Corretor</th>
                            <th style={{ textAlign: "center" }}>Pegou da Fila</th>
                            <th style={{ textAlign: "center" }}>Contatou</th>
                            <th style={{ textAlign: "right" }}>Trouxe de Volta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.pool.map((p) => {
                            const pct = p.fila ? Math.round((p.trouxe / p.fila) * 100) : 0;
                            return (
                              <tr key={p.nome}>
                                <td>
                                  <b>{p.nome}</b>
                                </td>
                                <td style={{ textAlign: "center" }} className="mono">
                                  {p.fila}
                                </td>
                                <td style={{ textAlign: "center" }} className="mono">
                                  {p.contatou}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span className={`time-kpi-badge ${pct >= 15 ? "green" : "brand"}`}>
                                    {p.trouxe} recuperados ({pct}%)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── MODAL DE REDISTRIBUIÇÃO ── */}
        {red && (
          <div className="leads-modal-backdrop" onClick={() => setRed(null)}>
            <div className="leads-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="leads-modal-header">
                <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0 }}>
                  Redistribuir {red.ids.length} Lead{red.ids.length === 1 ? "" : "s"}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--cv-text-muted)" }}>
                  Os leads sairão do corretor atual e serão atribuídos aos selecionados abaixo.
                </p>
              </div>

              <div className="leads-modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  <button
                    className={`estrategia-chip-btn ${modo === "online" ? "active" : ""}`}
                    onClick={() => setModo("online")}
                  >
                    🟢 Online Agora ({d.corretores.filter((c) => c.online).length})
                  </button>
                  <button
                    className={`estrategia-chip-btn ${modo === "plantao" ? "active" : ""}`}
                    onClick={() => setModo("plantao")}
                  >
                    📍 No Plantão ({d.corretores.filter((c) => c.plantao).length})
                  </button>
                  <button
                    className={`estrategia-chip-btn ${modo === "escolher" ? "active" : ""}`}
                    onClick={() => setModo("escolher")}
                  >
                    ✍️ Escolher na Mão
                  </button>
                </div>

                <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {d.corretores.map((c) => {
                    const dentro =
                      modo === "escolher"
                        ? marcados.has(c.id)
                        : modo === "online"
                        ? c.online
                        : c.plantao;

                    return (
                      <label
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: dentro ? "var(--cv-brand-light)" : "var(--cv-surface-subtle)",
                          border: `1px solid ${dentro ? "var(--cv-brand)" : "transparent"}`,
                          cursor: modo === "escolher" ? "pointer" : "default",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={dentro}
                          disabled={modo !== "escolher"}
                          onChange={() =>
                            setMarcados((s) => {
                              const n = new Set(s);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                        />
                        <div className="time-broker-avatar">{ini(c.nome)}</div>
                        <div style={{ flex: 1 }}>
                          <b style={{ fontSize: "13.5px", display: "block" }}>{c.nome}</b>
                          <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>
                            {c.carteira} leads na carteira
                          </span>
                        </div>
                        <span
                          className={`time-status-dot ${c.online ? "online" : ""}`}
                          title={c.online ? "Online agora" : "Offline"}
                        />
                      </label>
                    );
                  })}
                </div>

                <div style={{ background: "var(--cv-surface-subtle)", padding: "12px", borderRadius: "8px", fontSize: "13px" }}>
                  {alvoRed.length ? (
                    <span>
                      <b>{red.ids.length} leads</b> divididos entre <b>{alvoRed.length} corretores</b> (~
                      <b>{Math.ceil(red.ids.length / alvoRed.length)} por corretor</b>).
                    </span>
                  ) : (
                    <span style={{ color: "var(--cv-rose)", fontWeight: 600 }}>
                      Escolha pelo menos um corretor para receber os leads.
                    </span>
                  )}
                </div>
              </div>

              <div className="leads-modal-footer">
                <button className="time-btn-action" onClick={() => setRed(null)}>
                  Cancelar
                </button>
                <button
                  className="time-btn-primary"
                  disabled={salvando || !alvoRed.length}
                  onClick={confirmarRedistribuicao}
                >
                  {salvando ? "Redistribuindo..." : "Confirmar Redistribuição"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL JÁ COBROU HOJE ── */}
        {jaCobrou && (
          <div className="leads-modal-backdrop" onClick={() => setJaCobrou(null)}>
            <div className="leads-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="leads-modal-header">
                <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0 }}>
                  Cobrança Recente Detectada
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--cv-text-muted)" }}>
                  Você já cobrou este mesmo assunto nas últimas 12 horas para:
                </p>
              </div>

              <div className="leads-modal-body">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {jaCobrou.ja.map((j, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--cv-surface-subtle)",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                    >
                      <b>{j.corretor}</b>
                      <span style={{ color: "var(--cv-text-muted)" }}>às {hhmm(j.quando)}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: j.respondeu ? "var(--cv-green)" : "var(--cv-amber)",
                        }}
                      >
                        {j.respondeu ? "✓ Respondeu" : "Sem resposta"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="leads-modal-footer">
                <button className="time-btn-action" onClick={() => setJaCobrou(null)}>
                  Cancelar
                </button>
                <button
                  className="time-btn-primary"
                  onClick={() => {
                    const j = jaCobrou;
                    setJaCobrou(null);
                    cobrar(j.chave, j.ids, true);
                  }}
                >
                  Cobrar Novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── GAVETA LATERAL DE ORIGEM ── */}
        {origAberta && userId ? (
          <OrigemDrawer
            titulo={
              {
                anuncio: "Leads de Anúncio Pago",
                app: "Atendidos no Plantão (C2S)",
                disparo: "Leads de Disparos WhatsApp",
                proprio: "Leads Próprios e Repescagem",
              }[origAberta]
            }
            leads={d.origem.leads[origAberta]}
            verConversa={d.verConversa}
            quem={userId}
            corretores={d.corretores.map((c) => ({ id: c.id, nome: c.nome, online: c.online }))}
            onFechar={() => setOrigAberta(null)}
          />
        ) : null}
      </main>
    </div>
  );
}
