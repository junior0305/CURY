// RAIO-X DO CORRETOR — Gaveta Lateral de Diagnóstico 1:1 e Alocação
//
// Permite ao gerente inspecionar um corretor específico em profundidade sem
// poluir a tela principal com tabelas gigantes.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { cobrarCorretor, redistribuir, useConversaLead, type MsgConversa } from "@/hooks/useLeads";
import {
  X,
  Phone,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Zap,
  RefreshCw,
  ExternalLink,
  Flame,
  Award,
  Eye,
} from "lucide-react";

interface RaioXCorretorDrawerProps {
  brokerId: string | null;
  managerId: string;
  onClose: () => void;
}

export default function RaioXCorretorDrawer({ brokerId, managerId, onClose }: RaioXCorretorDrawerProps) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [leadEspiando, setLeadEspiando] = useState<string | null>(null);

  // 1. Dados do Corretor
  const { data: corretor } = useQuery({
    queryKey: ["raiox-corretor-perfil", brokerId],
    enabled: !!brokerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,phone,last_seen_at,lead_assignment_enabled")
        .eq("id", brokerId!)
        .maybeSingle();

      return data;
    },
  });

  // 2. Leads do Corretor
  const { data: leadsCorretor = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ["raiox-corretor-leads", brokerId],
    enabled: !!brokerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select(
          "id,name,phone,source,fb_campaign,status,created_at,last_lead_response_at,last_broker_whatsapp_at,contact_attempts"
        )
        .eq("broker_id", brokerId!)
        .not("status", "in", '("CONCLUDED","EXCLUDED","ABANDONED")')
        .order("created_at", { ascending: false });

      return (data ?? []) as any[];
    },
  });

  // 3. Pastas do Corretor no Junix
  const { data: pastas = [] } = useQuery({
    queryKey: ["raiox-corretor-pastas", corretor?.first_name],
    enabled: !!corretor?.first_name,
    queryFn: async () => {
      const { data } = await supabase
        .from("junix_pastas" as any)
        .select("proposta_id,cliente,etapa,dias,status_texto,empreendimento")
        .ilike("corretor", `%${corretor!.first_name}%`);

      return (data ?? []) as any[];
    },
  });

  // Conversa espiada
  const { data: msgsEspiar = [] } = useConversaLead(leadEspiando);

  if (!brokerId) return null;

  const nomeCompleto = corretor ? [corretor.first_name, corretor.last_name].filter(Boolean).join(" ") : "Corretor";
  const online = corretor?.last_seen_at
    ? Date.now() - new Date(corretor.last_seen_at).getTime() < 15 * 60_000
    : false;

  const telLimpo = corretor?.phone ? corretor.phone.replace(/\D/g, "") : "";

  // Métricas do Corretor
  const semContato = leadsCorretor.filter(
    (l) => !l.last_broker_whatsapp_at && (l.contact_attempts ?? 0) === 0
  );
  const clienteEsperando = leadsCorretor.filter(
    (l) =>
      l.last_lead_response_at &&
      (!l.last_broker_whatsapp_at || l.last_broker_whatsapp_at < l.last_lead_response_at)
  );
  const emConversa = leadsCorretor.filter(
    (l) => l.last_broker_whatsapp_at && !l.status?.includes("SCHEDULED")
  );
  const agendados = leadsCorretor.filter((l) => l.status === "VISIT_SCHEDULED");

  // Alternar Roleta
  const handleAlternarRoleta = async () => {
    if (!corretor) return;
    setSalvando(true);
    const novoStatus = !(corretor.lead_assignment_enabled !== false);
    try {
      await definirRecebimento(corretor.id, novoStatus);
      toast.success(novoStatus ? "Corretor ativado na roleta de novos leads!" : "Corretor pausado da roleta.");
      qc.invalidateQueries({ queryKey: ["raiox-corretor-perfil", brokerId] });
      qc.invalidateQueries({ queryKey: ["equipe-rh-lista", managerId] });
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao atualizar roleta: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  };

  // Redistribuir lead individual
  const handlePuxarLead = async (leadId: string, leadNome: string) => {
    setSalvando(true);
    try {
      await redistribuir([leadId], [], managerId);
      toast.success(`Lead ${leadNome} devolvido para a roleta!`);
      qc.invalidateQueries({ queryKey: ["raiox-corretor-leads", brokerId] });
      qc.invalidateQueries({ queryKey: ["leads-queima-disparo", managerId] });
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="drawer-raio-x-backdrop" onClick={onClose}>
      <aside className="drawer-raio-x-conteudo" onClick={(e) => e.stopPropagation()}>
        {/* ── TOPO DO DRAWER ── */}
        <div className="drawer-raio-x-header">
          <div className="drawer-perfil-info">
            <div className="drawer-avatar">{nomeCompleto.slice(0, 2).toUpperCase()}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 className="drawer-nome">{nomeCompleto}</h3>
                <span className={`status-presenca-pill ${online ? "online" : "offline"}`}>
                  {online ? "🟢 Online agora" : "⚪ Offline"}
                </span>
              </div>
              <p className="drawer-sub">
                {corretor?.email || "Sem e-mail"} · {corretor?.phone || "Sem telefone"}
              </p>
            </div>
          </div>

          <button type="button" className="modal-close-btn-v3" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* ── BOTÕES DE COMANDO RÁPIDO ── */}
        <div className="drawer-acoes-rapidas">
          {telLimpo && (
            <a
              href={`https://wa.me/55${telLimpo}?text=${encodeURIComponent(
                `Fala ${corretor?.first_name}! Vamos fazer um alinhamento rápido sobre seus atendimentos de hoje?`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="drawer-btn-wa"
            >
              <MessageCircle size={15} />
              Conversar no WhatsApp
            </a>
          )}

          <button
            type="button"
            className={`drawer-btn-roleta ${corretor?.lead_assignment_enabled !== false ? "ativo" : "pausado"}`}
            disabled={salvando}
            onClick={handleAlternarRoleta}
          >
            <RefreshCw size={14} />
            {corretor?.lead_assignment_enabled !== false ? "Roleta Ativa (Recebendo)" : "Roleta Pausada"}
          </button>
        </div>

        {/* ── MINI-FUNIL DO CORRETOR ── */}
        <div className="drawer-funil-box">
          <h4 className="drawer-secao-titulo">Funil Pessoal do Corretor</h4>
          <div className="drawer-funil-grid">
            <div className="drawer-funil-stat">
              <span className="drawer-stat-num mono">{leadsCorretor.length}</span>
              <span className="drawer-stat-label">Leads em Mãos</span>
            </div>
            <div className={`drawer-funil-stat ${semContato.length > 0 ? "warn" : ""}`}>
              <span className="drawer-stat-num mono" style={{ color: semContato.length > 0 ? "var(--cv-rose)" : "inherit" }}>
                {semContato.length}
              </span>
              <span className="drawer-stat-label">Sem Contato</span>
            </div>
            <div className="drawer-funil-stat">
              <span className="drawer-stat-num mono" style={{ color: "var(--cv-blue)" }}>
                {emConversa.length}
              </span>
              <span className="drawer-stat-label">Em Conversa</span>
            </div>
            <div className="drawer-funil-stat">
              <span className="drawer-stat-num mono" style={{ color: "var(--cv-purple)" }}>
                {agendados.length}
              </span>
              <span className="drawer-stat-label">Agendamentos</span>
            </div>
            <div className="drawer-funil-stat">
              <span className="drawer-stat-num mono" style={{ color: "var(--cv-brand)" }}>
                {pastas.length}
              </span>
              <span className="drawer-stat-label">Pastas Caixa</span>
            </div>
          </div>
        </div>

        {/* ── LISTA DE LEADS CRÍTICOS / PENDENTES DELE ── */}
        <div className="drawer-secao-leads">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 className="drawer-secao-titulo" style={{ margin: 0 }}>
              Leads que Exigem Atenção ({clienteEsperando.length + semContato.length})
            </h4>
          </div>

          {isLoadingLeads ? (
            <p style={{ fontSize: "13px", color: "var(--cv-text-muted)" }}>Carregando leads...</p>
          ) : clienteEsperando.length === 0 && semContato.length === 0 ? (
            <div className="drawer-vazio-box">
              <CheckCircle2 size={24} style={{ color: "var(--cv-green)", margin: "0 auto 6px" }} />
              <p style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>Nenhum lead travado no momento!</p>
              <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                Este corretor está com os atendimentos e respostas em dia.
              </span>
            </div>
          ) : (
            <div className="drawer-lista-items">
              {/* Prioridade 1: Clientes esperando resposta */}
              {clienteEsperando.map((l) => (
                <div key={l.id} className="drawer-lead-card quente">
                  <div className="drawer-lead-dados">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="badge-espera-quente">Cliente Esperando</span>
                      <strong style={{ fontSize: "13px" }}>{l.name || "Cliente"}</strong>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                      {l.phone || "Sem telefone"} · {l.source || "Origem não informada"}
                    </span>
                  </div>

                  <div className="drawer-lead-botoes">
                    <button
                      type="button"
                      className="btn-acao-micro"
                      onClick={() => setLeadEspiando(l.id)}
                      title="Espiar conversa"
                    >
                      <Eye size={13} /> Espiar
                    </button>
                    <button
                      type="button"
                      className="btn-acao-micro destaque"
                      onClick={() => handlePuxarLead(l.id, l.name || "Cliente")}
                      title="Devolver para a roleta"
                    >
                      <RefreshCw size={12} /> Puxar
                    </button>
                  </div>
                </div>
              ))}

              {/* Prioridade 2: Leads sem primeiro contato */}
              {semContato.map((l) => (
                <div key={l.id} className="drawer-lead-card">
                  <div className="drawer-lead-dados">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="badge-sem-contato">Sem Contato</span>
                      <strong style={{ fontSize: "13px" }}>{l.name || "Cliente"}</strong>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                      Recebido em {new Date(l.created_at).toLocaleDateString("pt-BR")} · {l.source || "Tráfego"}
                    </span>
                  </div>

                  <div className="drawer-lead-botoes">
                    <button
                      type="button"
                      className="btn-acao-micro destaque"
                      onClick={() => handlePuxarLead(l.id, l.name || "Cliente")}
                      title="Devolver para a roleta"
                    >
                      <RefreshCw size={12} /> Puxar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MODAL OU VISUALIZADOR DE MENSAGENS ESPIADAS ── */}
        {leadEspiando && (
          <div className="espiar-inline-box">
            <div className="espiar-inline-header">
              <span style={{ fontSize: "12.5px", fontWeight: 700 }}>👁️ Espiando Conversa (Somente Leitura)</span>
              <button type="button" className="espiar-fechar-btn" onClick={() => setLeadEspiando(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="espiar-chat-scroll">
              {msgsEspiar.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--cv-text-muted)", margin: "10px 0", textAlign: "center" }}>
                  Nenhuma mensagem registrada no WhatsApp deste lead.
                </p>
              ) : (
                msgsEspiar.map((m) => (
                  <div key={m.id} className={`chat-balao ${m.de}`}>
                    <div className="chat-balao-autor">{m.de === "cliente" ? "Cliente" : m.de === "ia" ? "Robô" : "Corretor"}</div>
                    <div className="chat-balao-texto">{m.texto}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
