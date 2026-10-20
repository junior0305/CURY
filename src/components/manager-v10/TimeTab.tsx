// ABA TIME v3 — Gestão da Equipe & Liderança da Tropa
//
// Foco 100% no Gerente de Vendas:
// 1. 🚨 Quem Cobrar Agora: Urgências imediatas (leads parados, disparos no vácuo, no-show).
// 2. 🏆 Tabela da Tropa: Gestão unificada da tropa (presença, roleta, leads, visitas, pastas, vendas, meta e desligamento).
// 3. 🌱 Rampa de Novos (90d): Acompanhamento e ações para novas contratações (cadastrar e inativar/desligar).

import { useState, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTime, type PessoaTime, type Achado } from "@/hooks/useTime";
import { usePeriodo } from "@/hooks/usePeriodo";
import { definirRecebimento } from "@/hooks/useTempoReal";
import Briefing from "@/components/manager-v10/Briefing";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";
import VincularNomes from "@/components/manager-v10/VincularNomes";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { useLeadsQueimaDisparo } from "@/components/manager-v10/AlertaDisparoQueima";
import RaioXCorretorDrawer from "@/components/manager-v10/RaioXCorretorDrawer";
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
  Eye,
  RefreshCw,
  X,
  ShieldAlert,
} from "lucide-react";
import "@/styles/cockpit-gerente.css";
import "@/styles/time-gerente.css";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";

const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();
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

type SubAba = "urgencias" | "tropa" | "novos";

export default function TimeTab({ managerId }: { managerId: string | undefined }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { periodo } = usePeriodo();
  const { data, isLoading } = useTime(managerId, periodo.dias);

  const [subAba, setSubAba] = useState<SubAba>("urgencias");
  const [brief, setBrief] = useState<PessoaTime | null>(null);
  const [cadastrar, setCadastrar] = useState<string | false>(false);
  const [desligar, setDesligar] = useState<string | null>(null);
  const [seletorDesligarAberto, setSeletorDesligarAberto] = useState(false);
  const [buscaDesligar, setBuscaDesligar] = useState("");
  const [modalRoletaAberto, setModalRoletaAberto] = useState(false);
  const [buscaModalRoleta, setBuscaModalRoleta] = useState("");
  const [modalOnlineAberto, setModalOnlineAberto] = useState(false);
  const [filtroModalOnline, setFiltroModalOnline] = useState<"todos" | "online" | "offline">("todos");
  const [ocupadoReset, setOcupadoReset] = useState<string | null>(null);
  const [ocupadoRoleta, setOcupadoRoleta] = useState<string | null>(null);
  const [corretorRaioX, setCorretorRaioX] = useState<string | null>(null);

  // Monitoramento de Disparos no Vácuo (>30min)
  const { data: leadsQueima = [] } = useLeadsQueimaDisparo(managerId);
  const queimaPorCorretor = useMemo(() => {
    const map = new Map<string, typeof leadsQueima>();
    for (const l of leadsQueima) {
      if (l.brokerId) {
        const arr = map.get(l.brokerId) || [];
        arr.push(l);
        map.set(l.brokerId, arr);
      }
    }
    return map;
  }, [leadsQueima]);

  // Filtro de Urgências
  const [filtroRadar, setFiltroRadar] = useState<"todos" | "crit" | "warn" | "good">("todos");

  // Busca e Filtros da Tabela da Tropa
  const [buscaTropa, setBuscaTropa] = useState("");
  const [filtroTropa, setFiltroTropa] = useState<"todos" | "online" | "pausados" | "senha_provisoria">("todos");

  // Meta do Mês (Cascata)
  const mesAtual = inicioMes(0);

  const { data: metasData } = useQuery({
    queryKey: ["metas-painel", mesAtual, managerId ?? "eu"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mesAtual, p_dono: managerId ?? null });
      if (error) throw error;
      return data as PainelMetas;
    },
  });

  // Lista de corretores detalhada para Gestão da Tropa
  const { data: equipeProfiles = [] } = useQuery({
    queryKey: ["equipe-rh-lista", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,phone,last_seen_at,lead_assignment_enabled,must_change_password,created_at")
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

  // Alternar Roleta de um corretor
  async function alternarRoleta(id: string, ativoAtual: boolean, nome: string) {
    setOcupadoRoleta(id);
    try {
      await definirRecebimento(id, !ativoAtual);
      toast.success(!ativoAtual ? `${nome} ativado na roleta de novos leads!` : `${nome} pausado da roleta.`);
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
      qc.invalidateQueries({ queryKey: ["aba-time", managerId] });
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao alterar roleta: ${e?.message ?? e}`);
    } finally {
      setOcupadoRoleta(null);
    }
  }

  // Alternar todos na roleta
  async function alternarTodosRoleta(ativar: boolean) {
    if (!confirm(ativar ? "Deseja ativar TODOS os corretores na roleta de novos leads?" : "Deseja pausar TODOS os corretores da roleta?")) return;
    try {
      await Promise.all(equipeProfiles.map((p) => definirRecebimento(p.id, ativar)));
      toast.success(ativar ? "Todos os corretores ativados na roleta!" : "Todos os corretores pausados da roleta.");
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
      qc.invalidateQueries({ queryKey: ["aba-time", managerId] });
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao alterar roleta: ${e?.message ?? e}`);
    }
  }

  // Resetar Senha para mudar@123
  async function resetarSenha(corretor: any) {
    const nome = [corretor.first_name, corretor.last_name].filter(Boolean).join(" ");
    if (!confirm(`Tem certeza que deseja redefinir a senha de ${nome} para mudar@123?`)) return;

    setOcupadoReset(corretor.id);
    try {
      const { error } = await supabase.functions.invoke("create-user", {
        body: { action: "reset-password", userId: corretor.id },
      });
      if (error) throw error;

      await supabase
        .from("profiles")
        .update({ must_change_password: true } as any)
        .eq("id", corretor.id);

      toast.success(`Senha de ${nome} redefinida para mudar@123 com sucesso!`);
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao resetar senha: ${e?.message ?? e}`);
    } finally {
      setOcupadoReset(null);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="time-v3" style={{ padding: "60px 20px", textAlign: "center" }}>
        <RefreshCw size={28} className="flame-pulse" style={{ color: "var(--cv-brand)", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--cv-text-muted)" }}>Carregando dados da tropa...</p>
      </div>
    );
  }

  const { gente, achados, novatos } = data;

  // Contadores
  const onlineCount = equipeProfiles.filter((p) => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000).length;
  const roletaCount = equipeProfiles.filter((p) => p.lead_assignment_enabled !== false).length;
  const criticosCount = achados.filter((a) => a.tom === "crit").length;

  // Filtragem de Urgências do Radar
  const achadosFiltrados = achados.filter((a) => (filtroRadar === "todos" ? true : a.tom === filtroRadar));

  // Filtragem da Tropa
  const tropaFiltrada = equipeProfiles.filter((p) => {
    const nomeCompleto = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
    const email = (p.email || "").toLowerCase();
    const tel = (p.phone || "").toLowerCase();
    const termo = buscaTropa.toLowerCase().trim();
    if (termo && !nomeCompleto.includes(termo) && !email.includes(termo) && !tel.includes(termo)) return false;

    if (filtroTropa === "online") {
      return p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
    }
    if (filtroTropa === "pausados") {
      return p.lead_assignment_enabled === false;
    }
    if (filtroTropa === "senha_provisoria") {
      return !!p.must_change_password;
    }
    return true;
  });

  return (
    <div className="time-v3">
      {/* ── CABEÇALHO LIMPO E DIRETO ── */}
      <div className="time-v3-header">
        <div className="time-v3-title">
          <h1>Gestão da Equipe & Tropa</h1>
          <p>
            Controle de produção, alocação de leads e acompanhamento de metas · {gente.length} corretores cadastrados
          </p>
        </div>

        <div className="time-v3-actions">
          <SeletorPeriodo />

          <button className="time-btn-primary" onClick={() => setCadastrar("")} title="Cadastrar novo corretor na equipe">
            <UserPlus size={16} /> Cadastrar Corretor
          </button>

          <button
            className="time-btn-action danger"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            onClick={() => setSeletorDesligarAberto(true)}
            title="Inativar ou desligar corretor da equipe e redistribuir leads"
          >
            <UserX size={15} /> Inativar Corretor
          </button>
        </div>
      </div>

      {/* ── ALERTA DE VÍNCULOS PENDENTES C2S / JUNIX (SE HOUVER) ── */}
      <VincularNomes managerId={managerId} />

      {/* ── FUNIL DA EQUIPE (CONVERSÃO POR CANAL & GARGALO) ── */}
      {/* funil da equipe saiu daqui (20/10): resumo no Hoje, completo no Resultado (FunilCompleto) */}

      {/* ── BARRA RESUMO COMPACTA (ZERO POLUIÇÃO VISUAL & 100% INTERATIVA) ── */}
      <div className="time-resumo-compacto-bar">
        <div
          className="time-resumo-item clickable"
          onClick={() => {
            setSubAba("tropa");
            setFiltroTropa("todos");
            document.getElementById("secao-conteudo-time")?.scrollIntoView({ behavior: "smooth" });
          }}
          title="Ver todos os corretores na tropa"
        >
          <Users size={16} style={{ color: "var(--cv-brand)" }} />
          <span><b>{gente.length}</b> corretores na tropa</span>
        </div>

        <div className="time-resumo-divider" />

        <div
          className="time-resumo-item clickable"
          onClick={() => setModalOnlineAberto(true)}
          title="Ver quem está online agora e histórico de acessos"
        >
          <span className="dot-online" />
          <span><b>{onlineCount}</b> online agora</span>
        </div>

        <div className="time-resumo-divider" />

        <div
          className="time-resumo-item clickable"
          onClick={() => setModalRoletaAberto(true)}
          title="Gerenciar roleta de novos leads (ativar e desativar corretores)"
        >
          <RefreshCw size={14} style={{ color: "var(--cv-blue)" }} />
          <span><b>{roletaCount}</b> na roleta de novos leads</span>
        </div>

        <div className="time-resumo-divider" />

        <div
          className="time-resumo-item clickable"
          onClick={() => {
            setSubAba("novos");
            document.getElementById("secao-conteudo-time")?.scrollIntoView({ behavior: "smooth" });
          }}
          title="Ver contratações recentes e rampa de aceleração de 90 dias"
        >
          <Sparkles size={15} style={{ color: "var(--cv-purple)" }} />
          <span><b>{novatos.length}</b> contratações recentes (&lt;90d)</span>
        </div>

        {criticosCount > 0 && (
          <>
            <div className="time-resumo-divider" />
            <div
              className="time-resumo-item clickable"
              style={{ color: "var(--cv-rose)", fontWeight: 700 }}
              onClick={() => {
                setSubAba("urgencias");
                setFiltroRadar("crit");
                document.getElementById("secao-conteudo-time")?.scrollIntoView({ behavior: "smooth" });
              }}
              title="Ver pendências críticas que exigem cobrança imediata"
            >
              <AlertTriangle size={15} />
              <span><b>{criticosCount}</b> pendências urgentes</span>
            </div>
          </>
        )}
      </div>

      {/* ── BARRA DE NAVEGAÇÃO: 3 VISÕES CLARAS ── */}
      <div id="secao-conteudo-time" className="time-tabs-bar">
        <button
          className={`time-tab-btn ${subAba === "urgencias" ? "active" : ""}`}
          onClick={() => setSubAba("urgencias")}
        >
          <AlertTriangle size={15} />
          Quem Cobrar Agora
          <span className={`time-tab-pill ${criticosCount > 0 ? "hot" : ""}`}>{achados.length}</span>
        </button>

        <button
          className={`time-tab-btn ${subAba === "tropa" ? "active" : ""}`}
          onClick={() => setSubAba("tropa")}
        >
          <Users size={15} />
          Tabela da Tropa (Produção)
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
          VISÃO 1: QUEM COBRAR AGORA (FOCO & URGÊNCIAS)
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "urgencias" && (
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
              Críticos ({achados.filter((a) => a.tom === "crit").length})
            </button>
            <button
              className={`time-btn-action ${filtroRadar === "warn" ? "active" : ""}`}
              style={filtroRadar === "warn" ? { background: "var(--cv-amber)", color: "#fff", borderColor: "var(--cv-amber)" } : {}}
              onClick={() => setFiltroRadar("warn")}
            >
              Atenção ({achados.filter((a) => a.tom === "warn").length})
            </button>
            <button
              className={`time-btn-action ${filtroRadar === "good" ? "active" : ""}`}
              style={filtroRadar === "good" ? { background: "var(--cv-green)", color: "#fff", borderColor: "var(--cv-green)" } : {}}
              onClick={() => setFiltroRadar("good")}
            >
              Destaques ({achados.filter((a) => a.tom === "good").length})
            </button>
          </div>

          {achadosFiltrados.length === 0 ? (
            <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
              <CheckCircle2 size={36} style={{ color: "var(--cv-green)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 6px" }}>Tropa 100% em dia!</h3>
              <p style={{ color: "var(--cv-text-muted)", fontSize: "13.5px", margin: 0 }}>
                Nenhum corretor com clientes travados ou pendências fora do padrão neste filtro.
              </p>
            </div>
          ) : (
            <div className="time-radar-grid">
              {achadosFiltrados.map((a) => {
                const p = gente.find((g) => g.profileId === a.profileId);
                const perfilRH = equipeProfiles.find((ep) => ep.id === a.profileId);
                const telLimpo = limparTel(perfilRH?.phone);
                const leadsEmQueima = queimaPorCorretor.get(a.profileId) || [];

                const msgWa = encodeURIComponent(
                  `Olá ${a.nome}! Vi aqui no Comandra: "${a.fato}". Vamos alinhar rapidinho para destravar seus atendimentos?`
                );

                return (
                  <div key={a.chave + a.profileId} className={`time-coach-card ${a.tom}`}>
                    <div className="time-coach-header">
                      <div className="time-coach-profile" style={{ cursor: "pointer" }} onClick={() => setCorretorRaioX(a.profileId)}>
                        <div className="time-coach-avatar">{ini(a.nome)}</div>
                        <div>
                          <div className="time-coach-name" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {a.nome}
                            <Eye size={12} style={{ color: "var(--cv-brand)", opacity: 0.7 }} />
                          </div>
                          <div className="time-coach-role">
                            {p ? `${p.atendimentos} atendimentos · ${p.vendas} vendas no período` : "Corretor"}
                          </div>
                        </div>
                      </div>
                      <span className={`time-kpi-badge ${a.tom === "crit" ? "rose" : a.tom === "warn" ? "amber" : "green"}`}>
                        {a.tom === "crit" ? "Crítico" : a.tom === "warn" ? "Atenção" : "Destaque"}
                      </span>
                    </div>

                    {/* Alerta de Resposta de Disparo Sem Retorno */}
                    {leadsEmQueima.length > 0 && (
                      <div
                        style={{
                          background: "var(--cv-rose-light, #FFE4E6)",
                          border: "1px solid var(--cv-rose-border, #FECDD3)",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--cv-rose, #E11D48)",
                          margin: "8px 0 10px",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Flame size={14} className="flame-pulse" />
                          {leadsEmQueima.length} resposta{leadsEmQueima.length === 1 ? "" : "s"} de disparo no vácuo!
                        </span>
                        <button
                          type="button"
                          className="btn-acao-micro destaque"
                          onClick={() => setCorretorRaioX(a.profileId)}
                        >
                          Puxar Lead
                        </button>
                      </div>
                    )}

                    <p className="time-coach-fact">{a.fato}</p>
                    <p className="time-coach-read">{a.leitura}</p>

                    <div className="time-coach-action-box">
                      <Zap size={14} style={{ color: "var(--cv-brand)", flexShrink: 0 }} />
                      <span>{a.faz}</span>
                    </div>

                    <div className="time-coach-footer">
                      {telLimpo ? (
                        <button
                          type="button"
                          className="time-coach-btn-wa"
                          title="Envia pelo seu WhatsApp (chip), sem abrir o WhatsApp ao lado"
                          onClick={() => enviarPeloMeuChip({ paraId: a.profileId, mensagem: decodeURIComponent(msgWa), motivo: "coach do time" })}
                        >
                          <MessageCircle size={14} /> Cobrar no WhatsApp
                        </button>
                      ) : (
                        <button
                          className="time-coach-btn-wa"
                          style={{ opacity: 0.6 }}
                          onClick={() => toast.info(`Corretor ${a.nome} não possui telefone cadastrado.`)}
                        >
                          <MessageCircle size={14} /> WhatsApp (sem tel)
                        </button>
                      )}

                      <button
                        type="button"
                        className="time-coach-btn-brief"
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                        onClick={() => setCorretorRaioX(a.profileId)}
                      >
                        <Eye size={13} /> Raio-X
                      </button>

                      {p && (
                        <button className="time-coach-btn-brief" onClick={() => setBrief(p)}>
                          📋 1:1
                        </button>
                      )}

                      <button
                        type="button"
                        className="time-btn-action danger"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        title="Desligar corretor"
                        onClick={() => setDesligar(a.profileId)}
                      >
                        <UserX size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VISÃO 2: TABELA UNIFICADA DA TROPA (PRODUÇÃO & GESTÃO)
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "tropa" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Barra de Busca e Filtros Rápidos */}
          <div className="time-search-bar">
            <div className="time-search-input-wrap">
              <Search size={15} className="time-search-icon" />
              <input
                type="text"
                className="time-search-input"
                placeholder="Buscar corretor por nome, telefone ou e-mail..."
                value={buscaTropa}
                onChange={(e) => setBuscaTropa(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                className={`time-btn-action ${filtroTropa === "todos" ? "active" : ""}`}
                style={filtroTropa === "todos" ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                onClick={() => setFiltroTropa("todos")}
              >
                Todos ({equipeProfiles.length})
              </button>
              <button
                className={`time-btn-action ${filtroTropa === "online" ? "active" : ""}`}
                style={filtroTropa === "online" ? { background: "var(--cv-brand)", color: "#fff", borderColor: "var(--cv-brand)" } : {}}
                onClick={() => setFiltroTropa("online")}
              >
                Online ({onlineCount})
              </button>
              <button
                className={`time-btn-action ${filtroTropa === "pausados" ? "active" : ""}`}
                style={filtroTropa === "pausados" ? { background: "var(--cv-amber)", color: "#fff", borderColor: "var(--cv-amber)" } : {}}
                onClick={() => setFiltroTropa("pausados")}
              >
                ⏸️ Fora da Roleta ({equipeProfiles.filter((p) => p.lead_assignment_enabled === false).length})
              </button>
              <button
                className={`time-btn-action ${filtroTropa === "senha_provisoria" ? "active" : ""}`}
                style={filtroTropa === "senha_provisoria" ? { background: "var(--cv-rose)", color: "#fff", borderColor: "var(--cv-rose)" } : {}}
                onClick={() => setFiltroTropa("senha_provisoria")}
              >
                🔑 Senha Provisória ({equipeProfiles.filter((p) => p.must_change_password).length})
              </button>
            </div>
          </div>

          {/* Tabela Consolidada de Produção */}
          <div className="time-table-card">
            <div className="time-table-responsive">
              <table className="time-table">
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th>Presença</th>
                    <th style={{ textAlign: "center" }}>Roleta</th>
                    <th style={{ textAlign: "right" }}>Leads</th>
                    <th style={{ textAlign: "right" }}>Visitas</th>
                    <th style={{ textAlign: "right" }}>Vendas (Junix)</th>
                    <th style={{ textAlign: "center" }}>Meta do Mês</th>
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tropaFiltrada.map((p) => {
                    const pessoaTime = gente.find((g) => g.profileId === p.id);
                    const metaFilho = metasData?.filhos?.find((f) => f.id === p.id);
                    const nomeCompleto = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
                    const telLimpo = limparTel(p.phone);
                    const online = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
                    const ativoRoleta = p.lead_assignment_enabled !== false;
                    const diasDeCasa = p.created_at ? Math.round((Date.now() - new Date(p.created_at).getTime()) / 86_400_000) : 999;
                    const ehNovato = diasDeCasa <= 90;

                    const realizado = metaFilho?.realizado ?? pessoaTime?.vendas ?? 0;
                    const metaAlvo = metaFilho?.meta ?? null;
                    const pctMeta = metaAlvo ? Math.min(100, Math.round((realizado / metaAlvo) * 100)) : 0;

                    return (
                      <tr key={p.id}>
                        {/* Corretor */}
                        <td>
                          <div className="time-broker-cell" style={{ cursor: "pointer" }} onClick={() => setCorretorRaioX(p.id)}>
                            <div className="time-broker-avatar">{ini(nomeCompleto)}</div>
                            <div className="time-broker-info">
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <b>{nomeCompleto}</b>
                                {ehNovato && <span className="time-kpi-badge purple" style={{ fontSize: "10px", padding: "1px 5px" }}>Novo</span>}
                              </div>
                              <span>{p.phone || p.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Presença */}
                        <td>
                          <span className={`time-kpi-badge ${online ? "green" : "subtle"}`}>
                            {online ? "Online" : quandoAcesso(p.last_seen_at)}
                          </span>
                        </td>

                        {/* Roleta Switch */}
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className={`time-roleta-toggle ${ativoRoleta ? "ativo" : "inativo"}`}
                            disabled={ocupadoRoleta === p.id}
                            title={ativoRoleta ? "Recebendo leads da roleta. Clique para pausar." : "Pausado da roleta. Clique para ativar."}
                            onClick={() => alternarRoleta(p.id, ativoRoleta, nomeCompleto)}
                            aria-pressed={ativoRoleta}
                            aria-label={ativoRoleta ? `Tirar ${nomeCompleto} da roleta` : `Colocar ${nomeCompleto} na roleta`}
                          >
                            <span className="time-roleta-knob" />
                          </button>
                          <span className="time-roleta-rot">{ativoRoleta ? "recebe" : "fora"}</span>
                        </td>

                        {/* Leads na Mão */}
                        <td style={{ textAlign: "right" }} className="mono">
                          <span style={{ fontWeight: 700, color: (pessoaTime?.carteira ?? 0) > 30 ? "var(--cv-amber)" : "inherit" }}>
                            {pessoaTime?.carteira ?? "—"}
                          </span>
                        </td>

                        {/* Visitas no Período */}
                        <td style={{ textAlign: "right" }} className="mono">
                          <span style={{ fontWeight: 600, color: "var(--cv-purple)" }}>
                            {pessoaTime?.checkins || pessoaTime?.atendimentos || 0}
                          </span>
                        </td>

                        {/* Vendas */}
                        <td style={{ textAlign: "right" }} className="mono">
                          <b style={{ color: realizado > 0 ? "var(--cv-green)" : "var(--cv-text-dim)" }}>
                            {realizado} un
                          </b>
                        </td>

                        {/* Meta Individual */}
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="number"
                              min={0}
                              max={30}
                              className="time-meta-inline-input mono"
                              defaultValue={metaAlvo ?? ""}
                              placeholder="0"
                              title="Meta mensal de vendas"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 0 && val !== metaAlvo) {
                                  definirMetaIndividual(p.id, val, nomeCompleto);
                                }
                              }}
                            />
                            <span className="mono" style={{ fontSize: "11.5px", color: "var(--cv-text-muted)", minWidth: "32px" }}>
                              {metaAlvo ? `${pctMeta}%` : "—"}
                            </span>
                          </div>
                        </td>

                        {/* Ações */}
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "5px" }}>
                            {telLimpo && (
                              <a
                                href={`https://wa.me/${telLimpo}`}
                                target="_blank"
                                rel="noreferrer"
                                className="time-btn-action"
                                title="Abrir conversa no WhatsApp"
                              >
                                <MessageCircle size={13} />
                              </a>
                            )}

                            <button
                              type="button"
                              className="time-btn-action"
                              title="Raio-X de clientes e atendimentos"
                              onClick={() => setCorretorRaioX(p.id)}
                            >
                              <Eye size={13} />
                            </button>

                            <button
                              type="button"
                              className="time-btn-action"
                              disabled={ocupadoReset === p.id}
                              title="Redefinir senha para mudar@123"
                              onClick={() => resetarSenha(p)}
                            >
                              <Key size={13} />
                            </button>

                            <button
                              type="button"
                              className="time-btn-action danger"
                              title="Desligar/Inativar corretor da equipe"
                              onClick={() => setDesligar(p.id)}
                            >
                              <UserX size={13} />
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
          VISÃO 3: 🌱 RAMPA DE NOVOS (ÚLTIMOS 90 DIAS)
          ══════════════════════════════════════════════════════════════════════ */}
      {subAba === "novos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
                Novas Contratações ({novatos.length})
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "13px", color: "var(--cv-text-muted)" }}>
                Acompanhamento da rampa dos primeiros 90 dias e ativação de vendas
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button className="time-btn-primary" onClick={() => setCadastrar("")}>
                <UserPlus size={15} /> Cadastrar Corretor
              </button>

              <button
                className="time-btn-action danger"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={() => setSeletorDesligarAberto(true)}
              >
                <UserX size={15} /> Inativar Corretor
              </button>
            </div>
          </div>

          {novatos.length === 0 ? (
            <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
              <Clock size={36} style={{ color: "var(--cv-text-dim)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 6px" }}>Nenhuma contratação nos últimos 90 dias</h3>
              <p style={{ color: "var(--cv-text-muted)", fontSize: "13.5px", margin: "0 0 16px" }}>
                Quando você cadastrar novos corretores, eles aparecerão aqui para acompanhamento dos marcos de rampa.
              </p>
              <button className="time-btn-primary" style={{ margin: "0 auto" }} onClick={() => setCadastrar("")}>
                <UserPlus size={15} /> Cadastrar Novo Corretor
              </button>
            </div>
          ) : (
            <div className="time-novos-grid">
              {novatos.map((n) => {
                const diasDeCasa = n.criadoEm ? Math.round((Date.now() - new Date(n.criadoEm).getTime()) / 86_400_000) : 0;
                const bateuPonto = n.primeiroPonto !== null;
                const jaAtendeu = n.primeiroAtend !== null;
                const jaVendeu = n.primeiraVenda !== null;
                const perfilRH = equipeProfiles.find((ep) => ep.id === n.profileId);
                const telLimpo = limparTel(perfilRH?.phone);

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
                      <div className="time-broker-cell" style={{ cursor: "pointer" }} onClick={() => setCorretorRaioX(n.profileId)}>
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
                        <b>{jaVendeu ? `com ${n.primeiraVenda}d` : "Pendente"}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", marginTop: "auto", flexWrap: "wrap" }}>
                      {telLimpo && (
                        <a
                          href={`https://wa.me/${telLimpo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="time-coach-btn-wa"
                          style={{ flex: 1, padding: "6px 10px" }}
                        >
                          <MessageCircle size={13} /> Zap
                        </a>
                      )}

                      <button
                        type="button"
                        className="time-coach-btn-brief"
                        style={{ padding: "6px 10px" }}
                        onClick={() => setBrief(n)}
                        title="Briefing 1:1"
                      >
                        📋 1:1
                      </button>

                      <button
                        type="button"
                        className="time-coach-btn-brief"
                        style={{ padding: "6px 10px" }}
                        onClick={() => setCorretorRaioX(n.profileId)}
                        title="Raio-X do corretor"
                      >
                        <Eye size={13} />
                      </button>

                      <button
                        type="button"
                        className="time-btn-action danger"
                        style={{ padding: "6px 10px" }}
                        title="Inativar ou desligar corretor da equipe"
                        onClick={() => setDesligar(n.profileId)}
                      >
                        <UserX size={13} /> Inativar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL SELETOR DE DESLIGAR / INATIVAR CORRETOR (ACIONADO PELO CABEÇALHO OU RAMPA) ── */}
      {seletorDesligarAberto && (
        <div className="modal-backdrop-v3" onClick={() => setSeletorDesligarAberto(false)}>
          <div className="modal-content-v3" style={{ maxWidth: "540px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v3">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="alerta-queima-icone small" style={{ background: "var(--cv-rose-light)", color: "var(--cv-rose)" }}>
                  <UserX size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--cv-text-main)" }}>
                    Inativar / Desligar Corretor
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                    Selecione o corretor que saiu para bloquear acesso e redistribuir sua carteira
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn-v3" onClick={() => setSeletorDesligarAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-v3">
              <div style={{ marginBottom: "12px", position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--cv-text-muted)" }} />
                <input
                  type="text"
                  placeholder="Buscar corretor por nome, email ou telefone..."
                  value={buscaDesligar}
                  onChange={(e) => setBuscaDesligar(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 32px",
                    borderRadius: "8px",
                    border: "1px solid var(--cv-border)",
                    fontSize: "13px",
                    background: "var(--cv-surface-subtle)",
                    color: "var(--cv-text-main)",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              <div style={{ maxHeight: "350px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {equipeProfiles
                  .filter((p) => {
                    const termo = buscaDesligar.toLowerCase().trim();
                    if (!termo) return true;
                    const n = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
                    return n.includes(termo) || (p.email || "").toLowerCase().includes(termo) || (p.phone || "").includes(termo);
                  })
                  .map((p) => {
                    const nome = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Corretor";
                    const dadosPessoa = gente.find((g) => g.profileId === p.id);
                    const totalLeads = dadosPessoa?.carteira ?? dadosPessoa?.leads ?? 0;

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          border: "1px solid var(--cv-border)",
                          borderRadius: "8px",
                          background: "var(--cv-surface)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="time-broker-avatar">{ini(nome)}</div>
                          <div>
                            <b style={{ fontSize: "13.5px", color: "var(--cv-text-main)" }}>{nome}</b>
                            <div style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                              {p.phone || p.email} · {totalLeads} lead{totalLeads === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="time-btn-action danger"
                          style={{ padding: "6px 12px", fontSize: "12px", fontWeight: 700 }}
                          onClick={() => {
                            setSeletorDesligarAberto(false);
                            setDesligar(p.id);
                          }}
                        >
                          <UserX size={13} /> Inativar
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-footer-v3">
              <button type="button" className="time-btn-action" onClick={() => setSeletorDesligarAberto(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE GESTÃO DA ROLETA DE NOVOS LEADS ── */}
      {modalRoletaAberto && (
        <div className="modal-backdrop-v3" onClick={() => setModalRoletaAberto(false)}>
          <div className="modal-content-v3" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v3">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="alerta-queima-icone small" style={{ background: "var(--cv-blue-light, #EFF6FF)", color: "var(--cv-blue, #2563EB)" }}>
                  <RefreshCw size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--cv-text-main)" }}>
                    Roleta de Novos Leads
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                    Ative ou pause corretores para receberem os novos leads que chegam
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn-v3" onClick={() => setModalRoletaAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-v3">
              {/* Resumo e Ações Rápidas */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--cv-text-muted)" }}>
                  <b style={{ color: "var(--cv-green)" }}>{roletaCount}</b> recebendo leads · <b style={{ color: "var(--cv-text-main)" }}>{equipeProfiles.length - roletaCount}</b> pausados
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="time-btn-action"
                    style={{ fontSize: "11.5px", padding: "4px 8px" }}
                    onClick={() => alternarTodosRoleta(true)}
                  >
                    Ativar Todos
                  </button>
                  <button
                    type="button"
                    className="time-btn-action"
                    style={{ fontSize: "11.5px", padding: "4px 8px" }}
                    onClick={() => alternarTodosRoleta(false)}
                  >
                    Pausar Todos
                  </button>
                </div>
              </div>

              {/* Busca */}
              <div style={{ marginBottom: "12px", position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--cv-text-muted)" }} />
                <input
                  type="text"
                  placeholder="Buscar corretor por nome, email ou telefone..."
                  value={buscaModalRoleta}
                  onChange={(e) => setBuscaModalRoleta(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 32px",
                    borderRadius: "8px",
                    border: "1px solid var(--cv-border)",
                    fontSize: "13px",
                    background: "var(--cv-surface-subtle)",
                    color: "var(--cv-text-main)",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              {/* Lista de Corretores */}
              <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {equipeProfiles
                  .filter((p) => {
                    const termo = buscaModalRoleta.toLowerCase().trim();
                    if (!termo) return true;
                    const n = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
                    return n.includes(termo) || (p.email || "").toLowerCase().includes(termo) || (p.phone || "").includes(termo);
                  })
                  .map((p) => {
                    const nome = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Corretor";
                    const ativo = p.lead_assignment_enabled !== false;
                    const estaOcupado = ocupadoRoleta === p.id;

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: `1px solid ${ativo ? "var(--cv-green-border, #A7F3D0)" : "var(--cv-border)"}`,
                          background: ativo ? "var(--cv-green-light, #F0FDF4)" : "var(--cv-surface)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="time-broker-avatar">{ini(nome)}</div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <b style={{ fontSize: "13.5px", color: "var(--cv-text-main)" }}>{nome}</b>
                              {ativo ? (
                                <span className="roleta-status-badge ativa">
                                  <CheckCircle2 size={11} /> Recebendo
                                </span>
                              ) : (
                                <span className="roleta-status-badge pausada">
                                  <Clock size={11} /> Pausado
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                              {p.phone || p.email}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={ativo ? "time-btn-action" : "time-btn-primary"}
                          style={{
                            padding: "6px 14px",
                            fontSize: "12px",
                            fontWeight: 700,
                            background: ativo ? "var(--cv-surface)" : "var(--cv-green, #10B981)",
                            borderColor: ativo ? "var(--cv-border)" : "transparent",
                            color: ativo ? "var(--cv-text-main)" : "#FFFFFF",
                          }}
                          disabled={estaOcupado}
                          onClick={() => alternarRoleta(p.id, ativo, nome)}
                        >
                          {estaOcupado ? "..." : ativo ? "Pausar" : "Ativar na Roleta"}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-footer-v3">
              <button type="button" className="time-btn-primary" onClick={() => setModalRoletaAberto(false)}>
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE QUEM ESTÁ ONLINE AGORA (PRESENÇA DA TROPA) ── */}
      {modalOnlineAberto && (
        <div className="modal-backdrop-v3" onClick={() => setModalOnlineAberto(false)}>
          <div className="modal-content-v3" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v3">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="alerta-queima-icone small" style={{ background: "var(--cv-green-light, #ECFDF5)", color: "var(--cv-green, #10B981)" }}>
                  <Users size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--cv-text-main)" }}>
                    Presença da Tropa
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                    Acompanhe quem está conectado no Comandra e o último acesso de cada corretor
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn-v3" onClick={() => setModalOnlineAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-v3">
              {/* Filtros em chips */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <button
                  type="button"
                  className={`funil-canal-chip ${filtroModalOnline === "todos" ? "active" : ""}`}
                  onClick={() => setFiltroModalOnline("todos")}
                >
                  Todos ({equipeProfiles.length})
                </button>
                <button
                  type="button"
                  className={`funil-canal-chip ${filtroModalOnline === "online" ? "active" : ""}`}
                  onClick={() => setFiltroModalOnline("online")}
                >
                  Online Agora ({onlineCount})
                </button>
                <button
                  type="button"
                  className={`funil-canal-chip ${filtroModalOnline === "offline" ? "active" : ""}`}
                  onClick={() => setFiltroModalOnline("offline")}
                >
                  ⚪ Offline ({equipeProfiles.length - onlineCount})
                </button>
              </div>

              {/* Lista de Corretores */}
              <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {equipeProfiles
                  .filter((p) => {
                    const isOnline = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
                    if (filtroModalOnline === "online") return isOnline;
                    if (filtroModalOnline === "offline") return !isOnline;
                    return true;
                  })
                  .map((p) => {
                    const nome = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Corretor";
                    const isOnline = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 15 * 60_000;
                    const tel = limparTel(p.phone);

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid var(--cv-border)",
                          background: isOnline ? "var(--cv-green-light, #F0FDF4)" : "var(--cv-surface)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="time-broker-avatar">
                            {ini(nome)}
                            {isOnline && <span className="time-broker-online-badge" />}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <b style={{ fontSize: "13.5px", color: "var(--cv-text-main)" }}>{nome}</b>
                              {isOnline ? (
                                <span className="roleta-status-badge ativa">Online agora</span>
                              ) : (
                                <span style={{ fontSize: "11.5px", color: "var(--cv-text-muted)" }}>
                                  {quandoAcesso(p.last_seen_at)}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                              {p.phone || p.email}
                            </div>
                          </div>
                        </div>

                        {tel && (
                          <a
                            href={`https://wa.me/${tel}?text=${encodeURIComponent(`Olá ${p.first_name || nome}! Tudo bem?`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="time-btn-action"
                            style={{ textDecoration: "none", fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <MessageCircle size={13} style={{ color: "var(--cv-green)" }} /> WhatsApp
                          </a>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-footer-v3">
              <button type="button" className="time-btn-action" onClick={() => setModalOnlineAberto(false)}>
                Fechar
              </button>
            </div>
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

      {/* ── GAVETA LATERAL RAIO-X DO CORRETOR ── */}
      <RaioXCorretorDrawer
        brokerId={corretorRaioX}
        managerId={managerId!}
        onClose={() => setCorretorRaioX(null)}
      />
    </div>
  );
}
