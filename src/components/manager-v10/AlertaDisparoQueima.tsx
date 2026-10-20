// ALERTA DE QUEIMA DE CAIXA — Monitoramento Crítico de Leads de Disparo WhatsApp
//
// Regra de Ouro da Operação Cury:
// Disparo de WhatsApp tem custo financeiro direto de API Meta + janela de 24h.
// Se o cliente responde "Tenho interesse" e fica >30min no vácuo, a empresa está
// literalmente queimando dinheiro e esfriando o lead.
//
// Comportamento:
// - Fica 100% oculto se não houver leads de disparo pendentes.
// - Exibe alerta de alta prioridade quando há leads de disparo esperando > 30min.
// - Modal rápido com redistribuição em 1 clique para corretores ONLINE agora no Comandra.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { redistribuir, cobrarCorretor } from "@/hooks/useLeads";
import {
  Flame,
  AlertOctagon,
  Clock,
  ArrowRight,
  Users,
  Zap,
  RefreshCw,
  X,
  MessageCircle,
  ExternalLink,
} from "lucide-react";

export interface LeadQueima {
  id: string;
  name: string | null;
  phone: string | null;
  brokerId: string | null;
  brokerNome: string | null;
  source: string | null;
  campanha: string | null;
  respondidoEm: string;
  minutosEspera: number;
}

interface AlertaDisparoQueimaProps {
  managerId: string;
  quem?: string;
  compacto?: boolean;
}

export function ehLeadDisparo(l: { source?: string | null; fb_campaign?: string | null; tag?: string | null }): boolean {
  const src = (l.source || "").toLowerCase();
  const camp = (l.fb_campaign || "").toLowerCase();
  const tag = (l.tag || "").toLowerCase();
  return (
    src === "wa_oficial" ||
    src === "campaign" ||
    src.includes("disparo") ||
    src.includes("whatsapp") ||
    camp.includes("disparo") ||
    camp.includes("whatsapp") ||
    tag.includes("disparo")
  );
}

export function useLeadsQueimaDisparo(managerId: string | undefined) {
  return useQuery<LeadQueima[]>({
    queryKey: ["leads-queima-disparo", managerId],
    enabled: !!managerId,
    refetchInterval: 30_000, // Revalida a cada 30s
    queryFn: async () => {
      // 1. Busca nomes dos corretores
      const { data: brokers } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .eq("manager_id", managerId!)
        .eq("role", "BROKER");

      const brokerMap = new Map<string, string>();
      for (const b of brokers ?? []) {
        brokerMap.set(b.id, [b.first_name, b.last_name].filter(Boolean).join(" ") || "Corretor");
      }

      // 2. Busca leads ativos com resposta registrada
      // Mesma base do Hoje: lead do gerente OU de corretor da equipe (20/10 — os dois alertas mostravam números diferentes)
      const ids = (brokers ?? []).map((b: any) => b.id);
      let qLeads = supabase
        .from("leads")
        .select("id,name,phone,broker_id,source,fb_campaign,tag,last_lead_response_at,last_broker_whatsapp_at,status")
        .not("last_lead_response_at", "is", null)
        .not("status", "in", '("CONCLUDED","EXCLUDED","ABANDONED")');
      qLeads = ids.length ? qLeads.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : qLeads.eq("manager_id", managerId!);
      const { data: leads } = await qLeads;

      if (!leads) return [];

      const agora = Date.now();
      const emRisco: LeadQueima[] = [];

      for (const l of leads) {
        // todo cliente esperando (anúncio, disparo, etc.), menos pescado — a mesma regra do alerta do Hoje
        if (l.source === "cold_pool") continue;
        if (!l.last_lead_response_at) continue;

        const respTime = new Date(l.last_lead_response_at).getTime();
        const brokerTime = l.last_broker_whatsapp_at ? new Date(l.last_broker_whatsapp_at).getTime() : 0;

        // Se o corretor respondeu após o cliente, está em andamento normal
        if (brokerTime >= respTime) continue;

        const minutos = Math.round((agora - respTime) / 60_000);
        // Acima de 48h não é mais "urgência de 30 min": é lead esquecido e vai para a fila
        // "O cliente perguntou e ninguém voltou" da aba Leads. Antes o alerta mostrava 312h.
        if (minutos >= 30 && minutos <= 48 * 60) {
          emRisco.push({
            id: l.id,
            name: l.name || "Cliente sem nome",
            phone: l.phone,
            brokerId: l.broker_id,
            brokerNome: l.broker_id ? brokerMap.get(l.broker_id) || "Corretor" : "Sem Corretor (Órfão)",
            source: l.source,
            campanha: l.fb_campaign || (ehLeadDisparo(l) ? "Disparo" : "Anúncio"),
            respondidoEm: l.last_lead_response_at,
            minutosEspera: minutos,
          });
        }
      }

      // Mais demorados primeiro
      return emRisco.sort((a, b) => b.minutosEspera - a.minutosEspera);
    },
  });
}

export default function AlertaDisparoQueima({ managerId, quem = "Gerente", compacto = false }: AlertaDisparoQueimaProps) {
  const qc = useQueryClient();
  const { data: leadsQueima = [], isLoading } = useLeadsQueimaDisparo(managerId);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [corretorSelecionado, setCorretorSelecionado] = useState<string>("auto");

  // Busca corretores online agora com roleta ativada
  const { data: corretoresOnline = [] } = useQuery({
    queryKey: ["corretores-online-roleta", managerId],
    enabled: !!managerId && modalAberto,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,last_seen_at,lead_assignment_enabled")
        .eq("manager_id", managerId)
        .eq("role", "BROKER")
        .eq("is_active", true)
        .order("first_name");

      if (!data) return [];
      const agora = Date.now();
      return data.map((b) => ({
        id: b.id,
        nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "Corretor",
        online: b.last_seen_at ? agora - new Date(b.last_seen_at).getTime() < 15 * 60_000 : false,
        roleta: b.lead_assignment_enabled !== false,
      }));
    },
  });

  const onlineAptos = corretoresOnline.filter((c) => c.online && c.roleta);

  // Redistribuição em 1 clique
  const handleRedistribuirTodos = async () => {
    if (!leadsQueima.length) return;
    setSalvando(true);

    try {
      let destinatarios: string[] = [];

      if (corretorSelecionado === "auto") {
        if (!onlineAptos.length) {
          // Se ninguém online, pega os corretores ativos na roleta geral
          const ativosRoleta = corretoresOnline.filter((c) => c.roleta);
          if (!ativosRoleta.length) {
            toast.error("Nenhum corretor ativo na roleta para receber.");
            return;
          }
          destinatarios = ativosRoleta.map((c) => c.id);
        } else {
          destinatarios = onlineAptos.map((c) => c.id);
        }
      } else {
        destinatarios = [corretorSelecionado];
      }

      const leadIds = leadsQueima.map((l) => l.id);
      await redistribuir(leadIds, destinatarios, managerId);

      toast.success(
        `${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} de disparo redistribuído${leadIds.length === 1 ? "" : "s"} com sucesso!`
      );
      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ["leads-queima-disparo", managerId] });
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
      qc.invalidateQueries({ queryKey: ["aba-time", managerId] });
      qc.invalidateQueries({ queryKey: ["cockpit-leads-v3", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao redistribuir: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleRedistribuirIndividual = async (leadId: string, leadNome: string) => {
    setSalvando(true);
    try {
      const destinatarios = onlineAptos.length ? onlineAptos.map((c) => c.id) : corretoresOnline.filter((c) => c.roleta).map((c) => c.id);
      if (!destinatarios.length) {
        toast.error("Nenhum corretor disponível na roleta.");
        return;
      }
      await redistribuir([leadId], destinatarios, managerId);
      toast.success(`Lead ${leadNome} redistribuído com sucesso!`);
      qc.invalidateQueries({ queryKey: ["leads-queima-disparo", managerId] });
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  };

  // Se não há nenhum lead em queima de caixa, o componente é 100% invisível
  if (isLoading || leadsQueima.length === 0) {
    return null;
  }

  const tempoFormatado = (minutos: number) => {
    if (minutos < 60) return `${minutos}min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  return (
    <>
      <div className={`alerta-queima-caixa ${compacto ? "compacto" : ""}`}>
        <div className="alerta-queima-conteudo">
          <div className="alerta-queima-icone">
            <Flame size={20} className="flame-pulse" />
          </div>

          <div className="alerta-queima-texto">
            <div className="alerta-queima-titulo">
              <span className="badge-risco-financeiro">CLIENTE ESPERANDO</span>
              <strong>
                {leadsQueima.length} cliente{leadsQueima.length === 1 ? " respondeu e está" : "s responderam e estão"} sem resposta há +30min
              </strong>
            </div>
            <p className="alerta-queima-sub">
              O maior atraso atual é de{" "}
              <span className="mono highlight">{tempoFormatado(leadsQueima[0].minutosEspera)}</span> com{" "}
              <b style={{ color: "var(--cv-text-main)" }}>{leadsQueima[0].brokerNome}</b>.
            </p>
          </div>
        </div>

        <div className="alerta-queima-acoes">
          <button
            type="button"
            className="btn-queima-secundario"
            onClick={() => setModalAberto(true)}
          >
            Ver {leadsQueima.length} Lead{leadsQueima.length === 1 ? "" : "s"}
          </button>

          <button
            type="button"
            className="btn-queima-primario"
            disabled={salvando}
            onClick={() => setModalAberto(true)}
          >
            <Zap size={15} />
            <span>Redistribuir Imediato</span>
          </button>
        </div>
      </div>

      {/* ── MODAL DE REDISTRIBUIÇÃO DE DISPAROS ── */}
      {modalAberto && (
        <div className="modal-backdrop-v3" onClick={() => setModalAberto(false)}>
          <div className="modal-content-v3 queima-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v3">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="alerta-queima-icone small">
                  <Flame size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--cv-text-main)" }}>
                    Salvar Respostas de Disparos de WhatsApp
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--cv-text-muted)" }}>
                    {leadsQueima.length} cliente{leadsQueima.length === 1 ? "" : "s"} demonstraram interesse e aguardam retorno
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close-btn-v3" onClick={() => setModalAberto(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-v3">
              {/* Box de Instrução Executiva */}
              <div className="queima-aviso-box">
                <div style={{ display: "flex", gap: "10px" }}>
                  <AlertOctagon size={18} style={{ color: "var(--cv-rose)", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ fontSize: "13px", lineHeight: "1.45" }}>
                    <b>Regra de proteção do investimento:</b> A Meta cobra por cada conversa iniciada. Se o corretor não responder em até 30 minutos, o cliente esfria e perde-se o valor investido.
                  </div>
                </div>
              </div>

              {/* Seletor de Destino */}
              <div className="queima-destino-row">
                <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--cv-text-main)" }}>
                  Destino da Redistribuição:
                </label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
                  <button
                    type="button"
                    className={`btn-opcao-roleta ${corretorSelecionado === "auto" ? "active" : ""}`}
                    onClick={() => setCorretorSelecionado("auto")}
                  >
                    <Zap size={14} />
                    Roleta Inteligente ({onlineAptos.length} online agora)
                  </button>

                  <select
                    className="select-corretor-custom"
                    value={corretorSelecionado !== "auto" ? corretorSelecionado : ""}
                    onChange={(e) => setCorretorSelecionado(e.target.value || "auto")}
                  >
                    <option value="">Ou escolher um corretor específico...</option>
                    {corretoresOnline.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.online ? "Online" : "⚪ Offline"} {!c.roleta ? "(Pausado)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lista dos Leads em Espera */}
              <div className="queima-lista-leads">
                <div className="queima-lista-header">
                  <span>Cliente</span>
                  <span>Corretor Atual</span>
                  <span>Tempo de Vácuo</span>
                  <span style={{ textAlign: "right" }}>Ação</span>
                </div>

                {leadsQueima.map((l) => {
                  const msgCobrarCorretor = encodeURIComponent(
                    `Olá! O cliente ${l.name} (${l.phone || ""}) respondeu ao disparo oficial há mais de ${tempoFormatado(l.minutosEspera)} e ainda está sem retorno. Consegue atender agora ou posso redistribuir?`
                  );

                  return (
                    <div key={l.id} className="queima-lead-item">
                      <div className="queima-lead-cliente">
                        <strong style={{ fontSize: "13.5px", color: "var(--cv-text-main)" }}>{l.name}</strong>
                        <span style={{ fontSize: "12px", color: "var(--cv-text-muted)" }}>
                          {l.phone || "Sem telefone"} · {l.campanha}
                        </span>
                      </div>

                      <div className="queima-lead-corretor">
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>{l.brokerNome}</span>
                      </div>

                      <div className="queima-lead-tempo">
                        <span className="badge-tempo-vacuo">
                          <Clock size={12} /> {tempoFormatado(l.minutosEspera)}
                        </span>
                      </div>

                      <div className="queima-lead-acoes">
                        <button
                          type="button"
                          className="btn-acao-micro"
                          title="Cobrar corretor responsável no WhatsApp"
                          onClick={async () => {
                            // cobra pelo chip do gerente (cobrar-corretor), sem abrir o WhatsApp ao lado
                            try {
                              const r = await cobrarCorretor(l.id, quem);
                              r.avisado_no_whats ? toast.success(`${r.corretor} foi cobrado no WhatsApp.`)
                                : toast.info(`Cobrança registrada; o WhatsApp de ${r.corretor} não recebeu (sem chip conectado).`);
                            } catch (e: any) { toast.error(e?.message || "Não consegui cobrar."); }
                          }}
                        >
                          <MessageCircle size={14} /> Cobrar
                        </button>

                        <button
                          type="button"
                          className="btn-acao-micro destaque"
                          disabled={salvando}
                          title="Passar este cliente para outro corretor da roleta"
                          onClick={() => handleRedistribuirIndividual(l.id, l.name || "Cliente")}
                        >
                          <RefreshCw size={13} /> Puxar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer-v3">
              <button type="button" className="time-btn-action" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>

              <button
                type="button"
                className="time-btn-primary"
                style={{ background: "var(--cv-rose)", borderColor: "var(--cv-rose)" }}
                disabled={salvando}
                onClick={handleRedistribuirTodos}
              >
                <Zap size={15} />
                {salvando
                  ? "Redistribuindo..."
                  : `Redistribuir Todos os ${leadsQueima.length} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
