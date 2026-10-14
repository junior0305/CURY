// ABA TIME v3 — Gestão da Equipe & Coaching Tático do Gerente
//
// 1. Visão Executiva: Efetivo Ativo, Meta Cascata do Mês, Meta da Semana, Radar de Urgências.
// 2. Quatro Modos Táticos:
//    - Radar de Coaching & Urgências (quem precisa de atenção imediata)
//    - Metas do Mês & Desempenho (meta geral e de cada corretor editável inline)
//    - Gestão da Tropa & RH (roleta, reset de senha mudar@123, desligamento/transferência)
//    - Rampa de Novos (acompanhamento dos primeiros 90 dias de casa)

import { useState, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTime, assumirMeta, type PessoaTime, type Achado } from "@/hooks/useTime";
import { usePeriodo } from "@/hooks/usePeriodo";
import Briefing from "@/components/manager-v10/Briefing";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";
import VincularNomes from "@/components/manager-v10/VincularNomes";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import {
  Users,
  Target,
  Zap,
  AlertTriangle,
  UserPlus,
  Key,
  MessageCircle,
  Search,
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  UserX,
  ExternalLink,
  Flame,
  Award,
} from "lucide-react";
import "@/styles/cockpit-gerente.css";
import "@/styles/time-gerente.css";

const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();
const um = (n: number | null) => (n == null ? "—" : n.toFixed(1).replace(".", ","));
const limparTel = (t: string | null | undefined) => {
  if (!t) return "";
  const n = t.replace(/\D/g, "");
  return n.length <= 11 && !n.startsWith("55") ? `55${n}` : n;
};

const quandoAcesso = (iso: string | null) => {
  if (!iso) return "nunca entrou";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 0.25 ? "online agora" : h < 24 ? `entrou há ${Math.round(h)}h` : `entrou há ${Math.round(h / 24)}d`;
};

const inicioMes = (desloc = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
};
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });

type PessoaMeta = { id: string; nome: string; papel: string; meta: number | null; realizado: number; pode_editar: boolean };
type PainelMetas = { mes: string; dono: PessoaMeta; filhos: PessoaMeta[] };

type SubAba = "radar" | "metas" | "equipe" | "novos";

export default function TimeTab({ managerId }: { managerId: string | undefined }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { periodo } = usePeriodo();
  const { data, isLoading } = useTime(managerId, periodo.dias);

  const [subAba, setSubAba] = useState<SubAba>("radar");
  const [brief, setBrief] = useState<PessoaTime | null>(null);
  const [cadastrar, setCadastrar] = useState<string | false>(false);
  const [desligar, setDesligar] = useState<string | null>(null);
  const [ocupadoReset, setOcupadoReset] = useState<string | null>(null);

  // Filtro de Coaching
  const [filtroRadar, setFiltroRadar] = useState<"todos" | "crit" | "warn" | "good">("todos");

  // Busca e Filtros de RH
  const [buscaEquipe, setBuscaEquipe] = useState("");
  const [filtroRH, setFiltroRH] = useState<"todos" | "online" | "pausados" | "senha_provisoria">("todos");

  // Meta da Semana
  const [alvoSemana, setAlvoSemana] = useState<number | null>(null);
  const [salvandoMetaSemana, setSalvandoMetaSemana] = useState(false);

  // Meta do Mês (Cascata)
  const [deslocMes, setDeslocMes] = useState(0);
  const mesAtual = inicioMes(deslocMes);

  const { data: metasData } = useQuery({
    queryKey: ["metas-painel", mesAtual, managerId ?? "eu"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mesAtual, p_dono: managerId ?? null });
      if (error) throw error;
      return data as PainelMetas;
    },
  });

  // Lista de corretores detalhada para Gestão de RH
  const { data: equipeProfiles = [] } = useQuery({
    queryKey: ["equipe-rh-lista", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,phone,last_seen_at,lead_assignment_enabled,must_change_password")
        .eq("manager_id", managerId!)
        .eq("role", "BROKER")
        .eq("is_active", true)
        .order("first_name");
      return (data ?? []) as any[];
    },
  });

  // Salvar Meta Individual
  async function definirMetaIndividual(id: string, n: number, nome: string) {
    try {
      const { error } = await supabase.rpc("definir_meta" as any, { p_mes: mesAtual, p_dono: id, p_vendas: n });
      if (error) throw error;
      toast.success(`Meta de ${nome}: ${n} venda${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["metas-painel"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui salvar a meta.");
    }
  }

  // Assumir Meta da Semana
  const sugeridoSemana = Math.max(
    1,
    Math.round(
      data?.ultimasSemanas?.filter(Boolean)?.length
        ? data.ultimasSemanas.reduce((a, n) => a + n, 0) / data.ultimasSemanas.length
        : 3
    )
  );
  const escolhidoSemana = alvoSemana ?? data?.metaSemana ?? sugeridoSemana;
  const razaoConversao = data?.time?.atendPorVenda ?? 3;
  const precisaAtendimentos = Math.ceil(escolhidoSemana * razaoConversao);

  async function salvarMetaSemana() {
    if (!data?.teamId) {
      toast.error("Sua equipe não está cadastrada em times.");
      return;
    }
    setSalvandoMetaSemana(true);
    try {
      await assumirMeta(data.teamId, escolhidoSemana, session!.user.id);
      toast.success(`Meta assumida: ${escolhidoSemana} venda${escolhidoSemana === 1 ? "" : "s"} esta semana!`);
      qc.invalidateQueries({ queryKey: ["aba-time"] });
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSalvandoMetaSemana(false);
    }
  }

  // Reset de Senha (mudar@123)
  async function resetarSenha(p: any) {
    setOcupadoReset(p.id);
    try {
      const { data: r, error } = await supabase.functions.invoke("create-user", {
        body: { action: "reset-password", userId: p.id },
      });
      if (error || (r as any)?.error) throw new Error((r as any)?.error || error?.message);
      toast.success(`Senha de ${p.first_name} redefinida para mudar@123`);
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui resetar a senha.");
    } finally {
      setOcupadoReset(null);
    }
  }

  // Alternar Roleta do Corretor
  async function toggleRoleta(p: any, ativo: boolean) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ lead_assignment_enabled: ativo })
        .eq("id", p.id);
      if (error) throw error;
      toast.success(`${p.first_name || "Corretor"} ${ativo ? "entrou na roleta" : "pausado da roleta"}`);
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
      qc.invalidateQueries({ queryKey: ["aba-time"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao alterar roleta.");
    }
  }

  if (isLoading) {
    return (
      <div className="time-v3">
        <div style={{ padding: "40px", textAlign: "center", color: "var(--cv-text-muted)" }}>
          Carregando indicadores do time...
        </div>
      </div>
    );
  }

  if (!data || data.gente.length === 0) {
    return (
      <div className="time-v3">
        <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
          <Users size={36} style={{ color: "var(--cv-brand)", margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: "18px", fontWeight: "800", margin: "0 0 6px" }}>Nenhum corretor cadastrado nesta equipe</h2>
          <p style={{ color: "var(--cv-text-muted)", fontSize: "14px", margin: "0 0 16px" }}>
            Cadastre os corretores da sua equipe para começar a acompanhar as metas e atendimentos.
          </p>
          <button className="time-btn-primary" onClick={() => setCadastrar("")}>
            <UserPlus size={16} /> Cadastrar Primeiro Corretor
          </button>
        </div>
        {cadastrar !== false && (
          <CadastrarCorretor
            managerId={managerId!}
            nomeInicial={cadastrar}
            onFechar={() => setCadastrar(false)}
            onPronto={() => {
              setCadastrar(false);
              qc.invalidateQueries({ queryKey: ["aba-time"] });
              qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
            }}
          />
        )}
      </div>
    );
  }

  const { gente, achados, time, novatos } = data;

  // Cálculos do Header
  const onlineCount = equipeProfiles.filter((p) => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000).length;
  const roletaCount = equipeProfiles.filter((p) => p.lead_assignment_enabled !== false).length;
  const criticosCount = achados.filter((a) => a.tom === "crit").length;

  const donoMeta = metasData?.dono;
  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecaoMes = deslocMes === 0 && hoje.getDate() > 0 && donoMeta ? Math.round((donoMeta.realizado / hoje.getDate()) * diasMes) : null;
  const pctMetaMes = donoMeta?.meta ? Math.min(100, Math.round((donoMeta.realizado / donoMeta.meta) * 100)) : 0;
  const somaMetasFilhos = metasData?.filhos?.reduce((a, f) => a + (f.meta ?? 0), 0) ?? 0;

  // Filtragem de Achados do Radar
  const achadosFiltrados = achados.filter((a) => (filtroRadar === "todos" ? true : a.tom === filtroRadar));

  // Filtragem de Pessoas do RH
  const equipeFiltrada = equipeProfiles.filter((p) => {
    const nomeCompleto = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
    const email = (p.email || "").toLowerCase();
    const termo = buscaEquipe.toLowerCase().trim();
    if (termo && !nomeCompleto.includes(termo) && !email.includes(termo)) return false;

    if (filtroRH === "online") {
      return p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
    }
    if (filtroRH === "pausados") {
      return p.lead_assignment_enabled === false;
    }
    if (filtroRH === "senha_provisoria") {
      return !!p.must_change_password;
    }
    return true;
  });

  return (
    <div className="time-v3">
      {/* ── CABEÇALHO DA ABA TIME ── */}
      <div className="time-v3-header">
        <div className="time-v3-title">
          <h1>Gestão da Equipe & Coaching</h1>
          <p>
            Alocação tática, metas individuais e radar de acompanhamento dos corretores · {gente.length} corretores
          </p>
        </div>
        <div className="time-v3-actions">
          <SeletorPeriodo />
          <button className="time-btn-primary" onClick={() => setCadastrar("")}>
            <UserPlus size={16} /> Cadastrar Corretor
          </button>
        </div>
      </div>

      {/* ── ALERTA DE VÍNCULOS PENDENTES C2S / JUNIX (SE HOUVER) ── */}
      <VincularNomes managerId={managerId} />

      {/* ── SCORE ROW / KPI CARDS TÁTICOS ── */}
      <div className="time-kpis-grid">
        {/* KPI 1: Efetivo Ativo */}
        <div className="time-kpi-card" onClick={() => setSubAba("equipe")}>
          <div className="time-kpi-top">
            <span className="time-kpi-label">Efetivo da Tropa</span>
            <span className="time-kpi-badge brand">
              <Users size={12} /> {roletaCount} na roleta
            </span>
          </div>
          <div className="time-kpi-value-row">
            <span className="time-kpi-num">{gente.length}</span>
            <span className="time-kpi-sub">corretores ({onlineCount} online)</span>
          </div>
          <div className="time-kpi-progress">
            <div
              className="time-kpi-progress-bar"
              style={{
                width: `${gente.length ? (roletaCount / gente.length) * 100 : 0}%`,
                background: "var(--cv-brand)",
              }}
            />
          </div>
        </div>

        {/* KPI 2: Meta do Mês (Junix) */}
        <div className="time-kpi-card" onClick={() => setSubAba("metas")}>
          <div className="time-kpi-top">
            <span className="time-kpi-label">Meta de {nomeMes(mesAtual)}</span>
            {donoMeta?.meta ? (
              <span className={`time-kpi-badge ${pctMetaMes >= 100 ? "green" : pctMetaMes >= 60 ? "amber" : "rose"}`}>
                {pctMetaMes}%
              </span>
            ) : null}
          </div>
          <div className="time-kpi-value-row">
            <span className="time-kpi-num">{donoMeta?.realizado ?? 0}</span>
            <span className="time-kpi-sub">de {donoMeta?.meta ?? "—"} vendas (Junix)</span>
          </div>
          <div className="time-kpi-progress">
            <div
              className="time-kpi-progress-bar"
              style={{
                width: `${pctMetaMes}%`,
                background: pctMetaMes >= 100 ? "var(--cv-green)" : pctMetaMes >= 60 ? "var(--cv-amber)" : "var(--cv-rose)",
              }}
            />
          </div>
        </div>

        {/* KPI 3: Meta da Semana (Compromisso) */}
        <div className="time-kpi-card">
          <div className="time-kpi-top">
            <span className="time-kpi-label">Meta da Semana</span>
            <span className="time-kpi-badge blue">
              <Zap size={12} /> Compromisso
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div className="time-week-stepper">
              <button
                className="time-stepper-btn"
                onClick={() => setAlvoSemana(Math.max(0, escolhidoSemana - 1))}
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="time-stepper-val">{escolhidoSemana}</span>
              <button
                className="time-stepper-btn"
                onClick={() => setAlvoSemana(escolhidoSemana + 1)}
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
            <button
              className="time-btn-primary"
              style={{ padding: "6px 10px", fontSize: "12px" }}
              disabled={salvandoMetaSemana}
              onClick={salvarMetaSemana}
            >
              {salvandoMetaSemana ? "Salvando..." : "Assumir"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "var(--cv-text-muted)" }}>
            Necessita ~{precisaAtendimentos} atendimentos no ritmo atual
          </div>
        </div>

        {/* KPI 4: Radar de Urgências */}
        <div className="time-kpi-card" onClick={() => setSubAba("radar")}>
          <div className="time-kpi-top">
            <span className="time-kpi-label">Radar de Coaching</span>
            <span className={`time-kpi-badge ${criticosCount > 0 ? "rose" : "green"}`}>
              {criticosCount > 0 ? `${criticosCount} críticos` : "Em dia"}
            </span>
          </div>
          <div className="time-kpi-value-row">
            <span className="time-kpi-num">{achados.length}</span>
            <span className="time-kpi-sub">alertas de acompanhamento</span>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>
            {time.leadsParados > 0 ? (
              <span style={{ color: "var(--cv-rose)", fontWeight: 600 }}>
                ⚠️ {time.leadsParados} clientes responderam e estão sem retorno
              </span>
            ) : (
              "Sem clientes travados no momento"
            )}
          </div>
        </div>
      </div>

      {/* ── BARRA DE SUB-NAVEGAÇÃO (4 MODOS TÁTICOS) ── */}
      <div className="time-tabs-bar">
        <button
          className={`time-tab-btn ${subAba === "radar" ? "active" : ""}`}
          onClick={() => setSubAba("radar")}
        >
          <AlertTriangle size={15} />
          Radar de Coaching
          <span className={`time-tab-pill ${criticosCount > 0 ? "hot" : ""}`}>{achados.length}</span>
        </button>

        <button
          className={`time-tab-btn ${subAba === "metas" ? "active" : ""}`}
          onClick={() => setSubAba("metas")}
        >
          <Target size={15} />
          Metas & Desempenho
          <span className="time-tab-pill">{metasData?.filhos?.length ?? gente.length}</span>
        </button>

        <button
          className={`time-tab-btn ${subAba === "equipe" ? "active" : ""}`}
          onClick={() => setSubAba("equipe")}
        >
          <Users size={15} />
          Gestão da Tropa & RH
          <span className="time-tab-pill">{gente.length}</span>
        </button>

        <button
          className={`time-tab-btn ${subAba === "novos" ? "active" : ""}`}
          onClick={() => setSubAba("novos")}
        >
          <Sparkles size={15} />
          Rampa de Novos (90d)
          <span className="time-tab-pill">{novatos.length}</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODO 1: RADAR DE COACHING & URGÊNCIAS
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "radar" && (
        <div className="time-radar-section">
          {/* Filtros rápidos de severidade */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--cv-text-muted)", marginRight: "4px" }}>
              Filtrar por:
            </span>
            <button
              className={`time-btn-action ${filtroRadar === "todos" ? "active" : ""}`}
              style={filtroRadar === "todos" ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
              onClick={() => setFiltroRadar("todos")}
            >
              Todos ({achados.length})
            </button>
            <button
              className={`time-btn-action ${filtroRadar === "crit" ? "active" : ""}`}
              style={filtroRadar === "crit" ? { background: "var(--cv-rose)", color: "#fff", borderColor: "var(--cv-rose)" } : {}}
              onClick={() => setFiltroRadar("crit")}
            >
              🔴 Críticos ({achados.filter((a) => a.tom === "crit").length})
            </button>
            <button
              className={`time-btn-action ${filtroRadar === "warn" ? "active" : ""}`}
              style={filtroRadar === "warn" ? { background: "var(--cv-amber)", color: "#fff", borderColor: "var(--cv-amber)" } : {}}
              onClick={() => setFiltroRadar("warn")}
            >
              🟡 Atenção ({achados.filter((a) => a.tom === "warn").length})
            </button>
            <button
              className={`time-btn-action ${filtroRadar === "good" ? "active" : ""}`}
              style={filtroRadar === "good" ? { background: "var(--cv-green)", color: "#fff", borderColor: "var(--cv-green)" } : {}}
              onClick={() => setFiltroRadar("good")}
            >
              🟢 Destaques ({achados.filter((a) => a.tom === "good").length})
            </button>
          </div>

          {achadosFiltrados.length === 0 ? (
            <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
              <CheckCircle2 size={36} style={{ color: "var(--cv-green)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 6px" }}>Nenhum corretor fora do padrão neste filtro</h3>
              <p style={{ color: "var(--cv-text-muted)", fontSize: "13.5px", margin: 0 }}>
                A equipe está operando de acordo com as metas e sem gargalos críticos de atendimento.
              </p>
            </div>
          ) : (
            <div className="time-radar-grid">
              {achadosFiltrados.map((a) => {
                const p = gente.find((g) => g.profileId === a.profileId);
                const perfilRH = equipeProfiles.find((ep) => ep.id === a.profileId);
                const telLimpo = limparTel(perfilRH?.phone);

                const msgWa = encodeURIComponent(
                  `Olá ${a.nome}! Vi aqui no sistema: "${a.fato}". Vamos alinhar rapidinho para destravar seus atendimentos?`
                );

                return (
                  <div key={a.chave + a.profileId} className={`time-coach-card ${a.tom}`}>
                    <div className="time-coach-header">
                      <div className="time-coach-profile">
                        <div className="time-coach-avatar">{ini(a.nome)}</div>
                        <div>
                          <div className="time-coach-name">{a.nome}</div>
                          <div className="time-coach-role">
                            {p ? `${p.atendimentos} atendimentos · ${p.vendas} vendas no período` : "Corretor"}
                          </div>
                        </div>
                      </div>
                      <span className={`time-kpi-badge ${a.tom === "crit" ? "rose" : a.tom === "warn" ? "amber" : "green"}`}>
                        {a.tom === "crit" ? "Crítico" : a.tom === "warn" ? "Atenção" : "Destaque"}
                      </span>
                    </div>

                    <p className="time-coach-fact">{a.fato}</p>
                    <p className="time-coach-read">{a.leitura}</p>

                    <div className="time-coach-action-box">
                      <Zap size={14} style={{ color: "var(--cv-brand)", flexShrink: 0 }} />
                      <span>{a.faz}</span>
                    </div>

                    <div className="time-coach-footer">
                      {telLimpo ? (
                        <a
                          className="time-coach-btn-wa"
                          href={`https://wa.me/${telLimpo}?text=${msgWa}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle size={14} /> Cobrar no WhatsApp
                        </a>
                      ) : (
                        <button
                          className="time-coach-btn-wa"
                          style={{ opacity: 0.6 }}
                          onClick={() => toast.info(`Corretor ${a.nome} não possui telefone cadastrado no perfil.`)}
                        >
                          <MessageCircle size={14} /> WhatsApp (sem tel)
                        </button>
                      )}

                      {p && (
                        <button className="time-coach-btn-brief" onClick={() => setBrief(p)}>
                          📋 Abrir Briefing 1:1
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Diagnóstico Coletivo da Tropa */}
          {time.checkinsPorAtend !== null && (
            <div className="time-diagnostico-card">
              <div className="time-diag-title-row">
                <div className="time-diag-title">
                  <h3>Diagnóstico Estrutural do Time</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--cv-text-muted)" }}>
                    {time.checkinsPorAtend > 4
                      ? "O time comparece ao plantão, mas tem dificuldade na abordagem inicial."
                      : "A abordagem no balcão está funcionando bem — o foco deve ser no fechamento e documentação."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="time-btn-primary"
                    style={{ fontSize: "12.5px", padding: "6px 12px" }}
                    onClick={() => toast.info("Treino de abordagem agendado na pauta da equipe.")}
                  >
                    Marcar Treino de Abordagem
                  </button>
                </div>
              </div>

              <div className="time-diag-metrics">
                <div className="time-diag-metric-box">
                  <b>{um(time.checkinsPorAtend)} check-ins</b>
                  <span>para cada 1 atendimento na equipe</span>
                </div>

                {time.checkinsPorAtendSemTopo && (
                  <div className="time-diag-metric-box pior">
                    <b>{um(time.checkinsPorAtendSemTopo)} check-ins</b>
                    <span>excluindo os melhores da equipe (ponto de atenção)</span>
                  </div>
                )}

                <div className="time-diag-metric-box">
                  <b>{um(time.atendPorVenda)} atendimentos</b>
                  <span>para converter 1 venda confirmada</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODO 2: METAS DO MÊS & DESEMPENHO INDIVIDUAL (CASCATA)
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "metas" && (
        <div className="time-metas-section">
          {/* Card Hero da Meta do Gerente */}
          <div className="time-meta-hero">
            <div className="time-meta-hero-top">
              <div className="time-meta-hero-left">
                <span className="time-meta-big-num mono">{donoMeta?.realizado ?? 0}</span>
                <span className="time-meta-label">de</span>
                <span className="time-meta-target mono">{donoMeta?.meta ?? "—"}</span>
                <span className="time-meta-label">vendas em {nomeMes(mesAtual)}</span>

                {projecaoMes != null && donoMeta?.meta ? (
                  <span className={`time-meta-pace-badge ${projecaoMes >= donoMeta.meta ? "ok" : "behind"}`}>
                    Ritmo para {projecaoMes} vendas {projecaoMes >= donoMeta.meta ? "· bate a meta 🎯" : `· faltam ${donoMeta.meta - projecaoMes}`}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className={`time-btn-action ${deslocMes === 0 ? "active" : ""}`}
                  style={deslocMes === 0 ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                  onClick={() => setDeslocMes(0)}
                >
                  Este Mês
                </button>
                <button
                  className={`time-btn-action ${deslocMes === 1 ? "active" : ""}`}
                  style={deslocMes === 1 ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                  onClick={() => setDeslocMes(1)}
                >
                  Próximo Mês
                </button>
              </div>
            </div>

            <div className="time-meta-bar-wrap">
              <div className="time-meta-bar-fill" style={{ width: `${pctMetaMes}%` }} />
            </div>

            {donoMeta?.meta ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div className={`time-meta-distribution-pill ${somaMetasFilhos < donoMeta.meta ? "alert" : ""}`}>
                  <Target size={14} />
                  {somaMetasFilhos < donoMeta.meta
                    ? `Distribuído ${somaMetasFilhos} de ${donoMeta.meta} — faltam distribuir ${donoMeta.meta - somaMetasFilhos} vendas`
                    : somaMetasFilhos > donoMeta.meta
                    ? `Distribuído ${somaMetasFilhos} de ${donoMeta.meta} (${somaMetasFilhos - donoMeta.meta} de folga acima da meta)`
                    : `Distribuído exatamente ${somaMetasFilhos} de ${donoMeta.meta} ✓`}
                </div>
                <span style={{ fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                  Altere a meta de cada corretor na coluna "Meta" abaixo.
                </span>
              </div>
            ) : null}
          </div>

          {/* Tabela de Metas Individuais dos Corretores */}
          <div className="time-table-card">
            <div className="time-table-responsive">
              <table className="time-table">
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th style={{ textAlign: "center" }}>Realizado (Junix)</th>
                    <th style={{ textAlign: "right" }}>Meta do Mês</th>
                    <th>Atingimento</th>
                    <th style={{ textAlign: "center" }}>Tendência</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(metasData?.filhos ?? []).map((f) => {
                    const pessoaTime = gente.find((g) => g.profileId === f.id);
                    const pctFilho = f.meta ? Math.min(100, Math.round((f.realizado / f.meta) * 100)) : 0;
                    const deltaVendas = pessoaTime ? pessoaTime.vendas - pessoaTime.vendasAntes : 0;

                    return (
                      <tr key={f.id}>
                        <td>
                          <div className="time-broker-cell">
                            <div className="time-broker-avatar">{ini(f.nome)}</div>
                            <div className="time-broker-info">
                              <b>{f.nome}</b>
                              <span>{f.papel === "BROKER" ? "Corretor" : f.papel}</span>
                            </div>
                          </div>
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <span className="mono" style={{ fontSize: "16px", fontWeight: 800 }}>
                            {f.realizado}
                          </span>
                        </td>

                        <td style={{ textAlign: "right" }}>
                          {f.pode_editar ? (
                            <input
                              type="number"
                              min={0}
                              defaultValue={f.meta ?? ""}
                              className="time-input-meta"
                              placeholder="—"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val !== f.meta) {
                                  definirMetaIndividual(f.id, val, f.nome);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                            />
                          ) : (
                            <span className="mono" style={{ fontSize: "15px", fontWeight: 700 }}>
                              {f.meta ?? "—"}
                            </span>
                          )}
                        </td>

                        <td style={{ minWidth: "160px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ flex: 1, height: "6px", background: "var(--cv-surface-subtle)", borderRadius: "3px", overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${pctFilho}%`,
                                  height: "100%",
                                  background: pctFilho >= 100 ? "var(--cv-green)" : pctFilho >= 60 ? "var(--cv-brand)" : "var(--cv-rose)",
                                  borderRadius: "3px",
                                }}
                              />
                            </div>
                            <span className="mono" style={{ fontSize: "12px", fontWeight: 700, minWidth: "36px" }}>
                              {f.meta ? `${pctFilho}%` : "—"}
                            </span>
                          </div>
                        </td>

                        <td style={{ textAlign: "center" }}>
                          {deltaVendas > 0 ? (
                            <span className="time-kpi-badge green" title={`Vendeu +${deltaVendas} que no período anterior`}>
                              <TrendingUp size={12} /> +{deltaVendas}
                            </span>
                          ) : deltaVendas < 0 ? (
                            <span className="time-kpi-badge rose" title={`Vendeu ${deltaVendas} em relação ao período anterior`}>
                              <TrendingDown size={12} /> {deltaVendas}
                            </span>
                          ) : (
                            <span style={{ color: "var(--cv-text-dim)", fontSize: "13px" }}>—</span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            {pessoaTime && (
                              <button
                                className="time-btn-action"
                                title="Abrir Briefing 1:1"
                                onClick={() => setBrief(pessoaTime)}
                              >
                                📋 1:1
                              </button>
                            )}
                          </div>
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

      {/* ══════════════════════════════════════════════════════════════════════
          MODO 3: GESTÃO DA TROPA & AÇÕES DE RH
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "equipe" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Barra de Busca e Filtros de RH */}
          <div className="time-search-bar">
            <div className="time-search-input-wrap">
              <Search size={15} className="time-search-icon" />
              <input
                type="text"
                className="time-search-input"
                placeholder="Buscar corretor por nome ou e-mail..."
                value={buscaEquipe}
                onChange={(e) => setBuscaEquipe(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                className={`time-btn-action ${filtroRH === "todos" ? "active" : ""}`}
                style={filtroRH === "todos" ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                onClick={() => setFiltroRH("todos")}
              >
                Todos ({equipeProfiles.length})
              </button>
              <button
                className={`time-btn-action ${filtroRH === "online" ? "active" : ""}`}
                style={filtroRH === "online" ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                onClick={() => setFiltroRH("online")}
              >
                🟢 Online ({onlineCount})
              </button>
              <button
                className={`time-btn-action ${filtroRH === "pausados" ? "active" : ""}`}
                style={filtroRH === "pausados" ? { background: "var(--cv-amber)", color: "#fff", borderColor: "var(--cv-amber)" } : {}}
                onClick={() => setFiltroRH("pausados")}
              >
                ⏸️ Fora da Roleta ({equipeProfiles.filter((p) => p.lead_assignment_enabled === false).length})
              </button>
              <button
                className={`time-btn-action ${filtroRH === "senha_provisoria" ? "active" : ""}`}
                style={filtroRH === "senha_provisoria" ? { background: "var(--cv-rose)", color: "#fff", borderColor: "var(--cv-rose)" } : {}}
                onClick={() => setFiltroRH("senha_provisoria")}
              >
                🔑 Senha Provisória ({equipeProfiles.filter((p) => p.must_change_password).length})
              </button>
            </div>
          </div>

          {/* Tabela de Gestão de RH */}
          <div className="time-table-card">
            <div className="time-table-responsive">
              <table className="time-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Corretor</th>
                    <th>Contato</th>
                    <th style={{ textAlign: "center" }}>Roleta</th>
                    <th>Senha</th>
                    <th style={{ textAlign: "right" }}>Ações de RH</th>
                  </tr>
                </thead>
                <tbody>
                  {equipeFiltrada.map((p) => {
                    const online = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
                    const telLimpo = limparTel(p.phone);

                    return (
                      <tr key={p.id}>
                        <td style={{ width: "120px" }}>
                          <span className={`time-status-dot ${online ? "online" : ""}`} />
                          <span style={{ fontSize: "12px", color: online ? "var(--cv-green)" : "var(--cv-text-muted)", fontWeight: online ? 700 : 500 }}>
                            {quandoAcesso(p.last_seen_at)}
                          </span>
                        </td>

                        <td>
                          <div className="time-broker-cell">
                            <div className="time-broker-avatar">{ini(p.first_name || "CO")}</div>
                            <div className="time-broker-info">
                              <b>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</b>
                              <span>{p.email || "Sem e-mail"}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {telLimpo ? (
                            <a
                              href={`https://wa.me/${telLimpo}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#25D366", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}
                            >
                              <MessageCircle size={14} /> {p.phone}
                            </a>
                          ) : (
                            <span style={{ color: "var(--cv-text-dim)", fontSize: "12px" }}>Sem telefone</span>
                          )}
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <label className="time-switch" title={p.lead_assignment_enabled !== false ? "Na roleta de leads" : "Fora da roleta"}>
                            <input
                              type="checkbox"
                              checked={p.lead_assignment_enabled !== false}
                              onChange={(e) => toggleRoleta(p, e.target.checked)}
                            />
                            <span className="time-switch-slider" />
                          </label>
                        </td>

                        <td>
                          {p.must_change_password ? (
                            <span className="time-kpi-badge rose">
                              <Key size={11} /> Provisória (mudar@123)
                            </span>
                          ) : (
                            <span className="time-kpi-badge green">
                              <CheckCircle2 size={11} /> Ativa
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              className="time-btn-action"
                              disabled={ocupadoReset === p.id}
                              title="Redefinir senha para mudar@123"
                              onClick={() => resetarSenha(p)}
                            >
                              <Key size={12} /> {ocupadoReset === p.id ? "Resetando..." : "Resetar Senha"}
                            </button>

                            <button
                              className="time-btn-action danger"
                              title="Desligar corretor e transferir carteira"
                              onClick={() => setDesligar(p.id)}
                            >
                              <UserX size={12} /> Desligar
                            </button>
                          </div>
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

      {/* ══════════════════════════════════════════════════════════════════════
          MODO 4: RAMPA DE NOVOS (ÚLTIMOS 90 DIAS)
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "novos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
                Novas Contratações ({novatos.length})
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "var(--cv-text-muted)" }}>
                Corretores cadastrados nos últimos 90 dias e seus marcos de ativação na equipe
              </p>
            </div>
            <button className="time-btn-primary" onClick={() => setCadastrar("")}>
              <UserPlus size={15} /> Cadastrar Corretor
            </button>
          </div>

          {novatos.length === 0 ? (
            <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
              <Clock size={36} style={{ color: "var(--cv-text-dim)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 6px" }}>Nenhuma contratação nos últimos 90 dias</h3>
              <p style={{ color: "var(--cv-text-muted)", fontSize: "13.5px", margin: "0 0 16px" }}>
                Quando você cadastrar novos corretores, eles aparecerão aqui para acompanhamento da rampa inicial.
              </p>
            </div>
          ) : (
            <div className="time-novos-grid">
              {novatos.map((n) => {
                const diasDeCasa = n.criadoEm
                  ? Math.round((Date.now() - new Date(n.criadoEm).getTime()) / 86_400_000)
                  : 0;

                const jaVendeu = n.primeiraVenda != null;
                const jaAtendeu = n.primeiroAtend != null;
                const bateuPonto = n.primeiroPonto != null;

                const estado = jaVendeu
                  ? { badge: "green", rotulo: "Já Vende", txt: `1ª Venda com ${n.primeiraVenda} dias` }
                  : jaAtendeu
                  ? { badge: "brand", rotulo: "Atendendo", txt: `1º Atendimento em ${n.primeiroAtend} dias` }
                  : bateuPonto
                  ? { badge: "amber", rotulo: "Em Início", txt: "Já bateu ponto, sem atendimento" }
                  : { badge: "rose", rotulo: "Travado", txt: "Nunca registrou presença" };

                return (
                  <div key={n.profileId} className="time-novo-card">
                    <div className="time-novo-top">
                      <div className="time-broker-cell">
                        <div className="time-broker-avatar">{ini(n.apelido ?? n.nome)}</div>
                        <div className="time-broker-info">
                          <b>{n.apelido ?? n.nome}</b>
                          <span>{diasDeCasa} dias de casa</span>
                        </div>
                      </div>
                      <span className={`time-kpi-badge ${estado.badge}`}>
                        {estado.rotulo}
                      </span>
                    </div>

                    <div className="time-novo-milestones">
                      <div className={`time-milestone-step ${bateuPonto ? "achieved" : "pending"}`}>
                        <span>1º Ponto / Plantão:</span>
                        <b>{bateuPonto ? `com ${n.primeiroPonto}d ✓` : "Pendente"}</b>
                      </div>
                      <div className={`time-milestone-step ${jaAtendeu ? "achieved" : "pending"}`}>
                        <span>1º Atendimento:</span>
                        <b>{jaAtendeu ? `com ${n.primeiroAtend}d ✓` : "Pendente"}</b>
                      </div>
                      <div className={`time-milestone-step ${jaVendeu ? "achieved" : "pending"}`}>
                        <span>1ª Venda Confirmada:</span>
                        <b>{jaVendeu ? `com ${n.primeiraVenda}d 🏆` : "Pendente"}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                      <button className="time-coach-btn-brief" style={{ flex: 1 }} onClick={() => setBrief(n)}>
                        📋 Briefing 1:1
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ background: "var(--cv-surface-subtle)", borderRadius: "8px", padding: "12px 16px", fontSize: "13px", color: "var(--cv-text-muted)", lineHeight: 1.5 }}>
            💡 <b>Dica de Rampa:</b> Corretores que ultrapassam 30 dias de casa sem registrar atendimento dificilmente engatam sozinhos. O momento de alinhar expectativas e marcar um plantão monitorado é nas primeiras 3 semanas.
          </div>
        </div>
      )}

      {/* ── MODAIS INTEGRADOS ── */}
      {brief && <Briefing pessoa={brief} gente={gente} onFechar={() => setBrief(null)} />}

      {cadastrar !== false && (
        <CadastrarCorretor
          managerId={managerId!}
          nomeInicial={cadastrar}
          onFechar={() => setCadastrar(false)}
          onPronto={() => {
            setCadastrar(false);
            qc.invalidateQueries({ queryKey: ["aba-time"] });
            qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
          }}
        />
      )}

      {desligar && (
        <DesligarCorretor
          brokerId={desligar}
          onFechar={() => setDesligar(null)}
          onPronto={() => {
            setDesligar(null);
            qc.invalidateQueries({ queryKey: ["aba-time"] });
            qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
          }}
        />
      )}
    </div>
  );
}
