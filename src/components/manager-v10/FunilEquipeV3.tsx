// FUNIL DA EQUIPE v3 — Visão Tática de Conversão por Canal
//
// 1. Visão Executiva: 7 Etapas do Funil (Leads ➔ Sem Contato ➔ Em Conversa ➔ Agendados ➔ Comparecidos ➔ Pastas ➔ Vendas)
// 2. Filtro de Canais em Chips: [Todos] [💬 Disparos WhatsApp] [📢 Meta Ads] [🔍 Google] [🏠 Portais] [📍 C2S Plantão]
// 3. Diagnóstico de Gargalo Cirúrgico: Calcula onde o time mais perde clientes e sugere a ação imediata.

import { atendido as atendidoRegra, ehTeste, ehPescado } from "@/lib/situacaoLead";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePeriodo } from "@/hooks/usePeriodo";
import { usePastas } from "@/hooks/usePastas";
import {
  Filter,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  Calendar,
  MapPin,
  FileText,
  Award,
  Users,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";

export type CanalFiltro = "todos" | "disparo" | "meta" | "google" | "portais" | "c2s" | "propria";

interface FunilEquipeV3Props {
  managerId: string;
  onSelecionarCorretor?: (brokerId: string) => void;
}

export function classificarCanalLead(l: {
  source?: string | null;
  fb_campaign?: string | null;
  tag?: string | null;
  original_broker_id?: string | null;
}): CanalFiltro {
  const src = (l.source || "").toLowerCase();
  const camp = (l.fb_campaign || "").toLowerCase();
  const tag = (l.tag || "").toLowerCase();

  if (
    src === "wa_oficial" ||
    src === "campaign" ||
    src.includes("disparo") ||
    src.includes("whatsapp") ||
    camp.includes("disparo") ||
    camp.includes("whatsapp") ||
    tag.includes("disparo")
  ) {
    return "disparo";
  }

  if (src.includes("google") || camp.includes("google") || tag.includes("google")) {
    return "google";
  }

  if (
    src.includes("zap") ||
    src.includes("vivareal") ||
    src.includes("imovelweb") ||
    src.includes("olx") ||
    src.includes("portal")
  ) {
    return "portais";
  }

  if (src.includes("c2s") || src.includes("stand") || src.includes("plantao") || src.includes("visita")) {
    return "c2s";
  }

  if (
    src === "cold_pool" ||
    src.includes("repescagem") ||
    src.includes("carteira") ||
    src.includes("indicacao") ||
    l.original_broker_id
  ) {
    return "propria";
  }

  if (
    src.includes("facebook") ||
    src.includes("meta") ||
    src.includes("make") ||
    src.includes("instagram") ||
    camp.includes("face") ||
    camp.includes("meta")
  ) {
    return "meta";
  }

  return "meta";
}

export default function FunilEquipeV3({ managerId }: FunilEquipeV3Props) {
  const { periodo } = usePeriodo();
  const [canalAtivo, setCanalAtivo] = useState<CanalFiltro>("todos");

  // Período em dias
  const dias = periodo?.dias || 30;
  const dataLimite = useMemo(() => {
    const d = new Date(Date.now() - dias * 86_400_000);
    return d.toISOString();
  }, [dias]);

  // 1. Busca leads do período com status e sinais de atendimento
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ["funil-leads-equipe", managerId, dias],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select(
          "id,source,fb_campaign,tag,status,broker_id,original_broker_id,created_at,last_lead_response_at,last_broker_whatsapp_at,contact_attempts"
        )
        .eq("manager_id", managerId)
        .gte("created_at", dataLimite);

      return (data ?? []) as any[];
    },
  });

  // 2. Busca pastas do Junix
  const { data: pastasData } = usePastas(managerId);

  // 3. Busca métricas diárias Cury para Visitas e Vendas
  const { data: metricasCury = [] } = useQuery({
    queryKey: ["funil-cury-metricas", managerId, dias],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: eu } = await supabase
        .from("cury_pessoas")
        .select("cury_id")
        .eq("escopo", "gerente")
        .eq("profile_id", managerId)
        .maybeSingle();

      const gerenteCuryId = (eu as any)?.cury_id;
      if (!gerenteCuryId) return [];

      const deStr = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("cury_metricas_diarias")
        .select("checkins,atendimentos,vendas,data")
        .eq("escopo", "corretor")
        .eq("gerente_cury_id", gerenteCuryId)
        .gte("data", deStr);

      return (data ?? []) as any[];
    },
  });

  // Cálculos do Funil
  const funil = useMemo(() => {
    // Filtra leads pelo canal selecionado
    const leadsFiltrados = leads.filter((l) => {
      if (ehTeste(l as any)) return false;
      if (canalAtivo === "todos") return true;
      return classificarCanalLead(l) === canalAtivo;
    });

    const totalLeads = leadsFiltrados.length;

    // 1. Sem Contato: Não houve mensagem do corretor nem tentativas, ou status ainda é NEW sem toque
    const semContato = leadsFiltrados.filter((l) => {
      const ativo = !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
      if (!ativo) return false;
      // regra única (src/lib/situacaoLead.ts): a mesma do Tempo real e da aba Leads.
      // "Sem contato" é só lead pago: pescado sem toque é cuidado pela régua do Pescar.
      return !ehPescado(l as any) && !atendidoRegra(l as any);
    }).length;

    // 2. Em Conversa: Houve contato e não está agendado nem concluído
    const emConversa = leadsFiltrados.filter((l) => {
      const ativo = !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "");
      if (!ativo) return false;
      const temToque = atendidoRegra(l as any);
      const jaAgendou = l.status === "VISIT_SCHEDULED" || l.status === "NEGOTIATING" || l.status === "DOCS_REQUESTED";
      return temToque && !jaAgendou;
    }).length;

    // 3. Agendados: Status de visita agendada
    const agendados = leadsFiltrados.filter((l) => l.status === "VISIT_SCHEDULED").length;

    // 4. Comparecidos (C2S / Plantão)
    // Se o filtro for canal específico de tráfego, calcula proporção estimada; se for todos ou c2s, pega real
    const totalVisitasCury = metricasCury.reduce((a, m) => a + (m.atendimentos || m.checkins || 0), 0);
    const comparecidos =
      canalAtivo === "todos"
        ? Math.max(agendados, totalVisitasCury)
        : Math.round(agendados * 0.7); // Estimativa de comparecimento por canal

    // 5. Pastas Caixa (Propostas em Análise)
    const totalPastas = pastasData?.minhas?.length ?? 0;
    const pastas =
      canalAtivo === "todos"
        ? totalPastas
        : Math.round(totalPastas * (totalLeads > 0 && leads.length > 0 ? totalLeads / leads.length : 0.2));

    // 6. Vendas Confirmadas
    const totalVendasCury = metricasCury.reduce((a, m) => a + (m.vendas || 0), 0);
    const vendasConcluidasLeads = leadsFiltrados.filter((l) => l.status === "CONCLUDED").length;
    const vendas =
      canalAtivo === "todos"
        ? Math.max(totalVendasCury, vendasConcluidasLeads)
        : vendasConcluidasLeads;

    // Excluídos / Descartados
    const descartados = leadsFiltrados.filter((l) => ["EXCLUDED", "ABANDONED"].includes(l.status ?? "")).length;

    // Taxas de Conversão entre degraus
    const txContato = totalLeads > 0 ? Math.round(((totalLeads - semContato) / totalLeads) * 100) : 0;
    const txAgendamento = totalLeads > 0 ? Math.round((agendados / Math.max(1, totalLeads - semContato)) * 100) : 0;
    const txComparecimento = agendados > 0 ? Math.round((comparecidos / agendados) * 100) : comparecidos > 0 ? 100 : 0;
    const txPasta = comparecidos > 0 ? Math.round((pastas / comparecidos) * 100) : 0;
    const txVenda = pastas > 0 ? Math.round((vendas / pastas) * 100) : 0;

    // Diagnóstico do Maior Gargalo
    let diagnostico = {
      titulo: "Equipe em Ritmo Estável",
      descricao: "A conversão entre as etapas está dentro das médias da operação.",
      tipo: "normal" as "crit" | "warn" | "good" | "normal",
      acao: "Mantenha a roleta rodando e cobre o comparecimento das visitas agendadas.",
    };

    const totalPagos = leadsFiltrados.filter((l) => !ehPescado(l as any) && !["EXCLUDED", "ABANDONED"].includes(l.status ?? "")).length;
    if (totalPagos > 5 && semContato / totalPagos >= 0.25) {
      const pct = Math.round((semContato / totalPagos) * 100);
      diagnostico = {
        titulo: `${pct}% dos leads pagos estão sem contato (${semContato} de ${totalPagos})`,
        descricao: "Leads pagos estão esfriando na mão dos corretores sem mensagem inicial.",
        tipo: "crit",
        acao: "Puxe os leads parados há mais de 2 horas e devolva para quem está online no Comandra agora.",
      };
    } else if (comparecidos >= 3 && pastas / comparecidos < 0.35) {
      const perda = 100 - Math.round((pastas / comparecidos) * 100);
      diagnostico = {
        titulo: `Vazamento de Conversão: ${perda}% das Visitas não viram Pastas`,
        descricao: "O cliente vai até o estande, toma café, mas o corretor não colhe a documentação Caixa.",
        tipo: "warn",
        acao: "Dispare o Checklist Caixa (RG, Holerite, FGTS) no WhatsApp do cliente logo após a visita.",
      };
    } else if (agendados >= 5 && comparecidos / agendados < 0.5) {
      const noShow = 100 - Math.round((comparecidos / agendados) * 100);
      diagnostico = {
        titulo: `Taxa de No-Show Alta: ${noShow}% das Visitas Agendadas não Compareceram`,
        descricao: "Falta confirmação no dia anterior e envio de localização 2h antes da visita.",
        tipo: "warn",
        acao: "Oriente o time a mandar o endereço no Google Maps e um vídeo rápido da fachada do estande.",
      };
    } else if (pastas >= 3 && vendas === 0) {
      diagnostico = {
        titulo: "🏦 Gargalo no Correspondente Caixa",
        descricao: "A equipe colheu as pastas, mas os processos estão travados na esteira de aprovação de crédito.",
        tipo: "warn",
        acao: "Abra a aba Pastas e cobre o correspondente Caixa com a lista de pendências daquelas pastas.",
      };
    } else if (vendas >= 3) {
      diagnostico = {
        titulo: "Excelente Eficiência de Vendas",
        descricao: `A equipe já converteu ${vendas} vendas com ${pastas} pastas em análise neste período.`,
        tipo: "good",
        acao: "Injete mais leads do canal com maior retorno para acelerar o fechamento de metas.",
      };
    }

    return {
      totalLeads,
      semContato,
      emConversa,
      agendados,
      comparecidos,
      pastas,
      vendas,
      descartados,
      txContato,
      txAgendamento,
      txComparecimento,
      txPasta,
      txVenda,
      diagnostico,
    };
  }, [leads, metricasCury, pastasData, canalAtivo]);

  // Contagem por canais para badges
  const contagemCanais = useMemo(() => {
    const mapa: Record<CanalFiltro, number> = {
      todos: leads.length,
      disparo: 0,
      meta: 0,
      google: 0,
      portais: 0,
      c2s: 0,
      propria: 0,
    };
    for (const l of leads) {
      const c = classificarCanalLead(l);
      mapa[c] = (mapa[c] || 0) + 1;
    }
    return mapa;
  }, [leads]);

  return (
    <div className="funil-equipe-v3">
      {/* ── BARRA DE CHIPS DE CANAIS ── */}
      <div className="funil-canais-bar">
        <div className="funil-canais-label">
          <Filter size={14} />
          <span>Origem:</span>
        </div>

        <div className="funil-canais-chips">
          <button
            type="button"
            className={`funil-chip ${canalAtivo === "todos" ? "active" : ""}`}
            onClick={() => setCanalAtivo("todos")}
          >
            Todos os Canais
            <span className="funil-chip-count">{contagemCanais.todos}</span>
          </button>

          <button
            type="button"
            className={`funil-chip disparo ${canalAtivo === "disparo" ? "active" : ""}`}
            onClick={() => setCanalAtivo("disparo")}
          >
            Disparos WhatsApp
            <span className="funil-chip-count">{contagemCanais.disparo}</span>
          </button>

          <button
            type="button"
            className={`funil-chip meta ${canalAtivo === "meta" ? "active" : ""}`}
            onClick={() => setCanalAtivo("meta")}
          >
            Meta Ads
            <span className="funil-chip-count">{contagemCanais.meta}</span>
          </button>

          <button
            type="button"
            className={`funil-chip google ${canalAtivo === "google" ? "active" : ""}`}
            onClick={() => setCanalAtivo("google")}
          >
            Google Ads
            <span className="funil-chip-count">{contagemCanais.google}</span>
          </button>

          <button
            type="button"
            className={`funil-chip portais ${canalAtivo === "portais" ? "active" : ""}`}
            onClick={() => setCanalAtivo("portais")}
          >
            Portais
            <span className="funil-chip-count">{contagemCanais.portais}</span>
          </button>

          <button
            type="button"
            className={`funil-chip c2s ${canalAtivo === "c2s" ? "active" : ""}`}
            onClick={() => setCanalAtivo("c2s")}
          >
            C2S Plantão
            <span className="funil-chip-count">{contagemCanais.c2s}</span>
          </button>

          <button
            type="button"
            className={`funil-chip propria ${canalAtivo === "propria" ? "active" : ""}`}
            onClick={() => setCanalAtivo("propria")}
          >
            Própria / Indicação
            <span className="funil-chip-count">{contagemCanais.propria}</span>
          </button>
        </div>
      </div>

      {/* ── RÉGUA HORIZONTAL DO FUNIL DE VENDAS ── */}
      <div className="funil-regua-grid">
        {/* Etapa 1: Leads Recebidos */}
        <div className="funil-degrau-card">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">1</span>
            <span className="funil-degrau-nome">Leads Recebidos</span>
          </div>
          <div className="funil-degrau-val mono">{funil.totalLeads}</div>
          <div className="funil-degrau-sub">
            {funil.descartados > 0 ? (
              <span style={{ color: "var(--cv-text-dim)" }}>{funil.descartados} descartes</span>
            ) : (
              "no período"
            )}
          </div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 2: Sem Contato (Alerta) */}
        <div className={`funil-degrau-card ${funil.semContato > 0 ? "warn" : ""}`}>
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">2</span>
            <span className="funil-degrau-nome">Sem Contato</span>
          </div>
          <div
            className="funil-degrau-val mono"
            style={{ color: funil.semContato > 0 ? "var(--cv-rose)" : "inherit" }}
          >
            {funil.semContato}
          </div>
          <div className="funil-degrau-sub">
            {funil.semContato > 0 ? (
              <span style={{ color: "var(--cv-rose)", fontWeight: 700 }}>Parados sem falar</span>
            ) : (
              "Todos contatados"
            )}
          </div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 3: Em Conversa */}
        <div className="funil-degrau-card">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">3</span>
            <span className="funil-degrau-nome">Em Conversa</span>
          </div>
          <div className="funil-degrau-val mono" style={{ color: "var(--cv-blue)" }}>
            {funil.emConversa}
          </div>
          <div className="funil-degrau-sub">Atendimento ativo</div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 4: Visitas Agendadas */}
        <div className="funil-degrau-card">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">4</span>
            <span className="funil-degrau-nome">Agendamentos</span>
          </div>
          <div className="funil-degrau-val mono" style={{ color: "var(--cv-purple)" }}>
            {funil.agendados}
          </div>
          <div className="funil-degrau-sub">No estande Cury</div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 5: Visitas Comparecidas */}
        <div className="funil-degrau-card">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">5</span>
            <span className="funil-degrau-nome">Compareceu</span>
          </div>
          <div className="funil-degrau-val mono" style={{ color: "var(--cv-amber)" }}>
            {funil.comparecidos}
          </div>
          <div className="funil-degrau-sub">
            {funil.agendados > 0 ? (
              <span>{Math.min(100, Math.round((funil.comparecidos / funil.agendados) * 100))}% presença</span>
            ) : (
              "Check-in presencial"
            )}
          </div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 6: Pastas Caixa */}
        <div className="funil-degrau-card">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">6</span>
            <span className="funil-degrau-nome">Pastas Caixa</span>
          </div>
          <div className="funil-degrau-val mono" style={{ color: "var(--cv-brand)" }}>
            {funil.pastas}
          </div>
          <div className="funil-degrau-sub">
            {funil.comparecidos > 0 ? (
              <span>{Math.min(100, Math.round((funil.pastas / funil.comparecidos) * 100))}% viraram pasta</span>
            ) : (
              "Propostas montadas"
            )}
          </div>
        </div>

        <div className="funil-passagem-arrow">➔</div>

        {/* Etapa 7: Vendas Confirmadas */}
        <div className="funil-degrau-card destaque">
          <div className="funil-degrau-top">
            <span className="funil-degrau-idx">7</span>
            <span className="funil-degrau-nome">Vendas Junix</span>
          </div>
          <div className="funil-degrau-val mono" style={{ color: "var(--cv-green)" }}>
            {funil.vendas}
          </div>
          <div className="funil-degrau-sub" style={{ color: "var(--cv-green)", fontWeight: 700 }}>
            Contratos fechados
          </div>
        </div>
      </div>

      {/* ── BOX DE DIAGNÓSTICO E GARGALO CIRÚRGICO ── */}
      <div className={`funil-diagnostico-box ${funil.diagnostico.tipo}`}>
        <div className="funil-diagnostico-header">
          <div className="funil-diagnostico-icone">
            {funil.diagnostico.tipo === "crit" ? (
              <AlertTriangle size={18} style={{ color: "var(--cv-rose)" }} />
            ) : funil.diagnostico.tipo === "good" ? (
              <Sparkles size={18} style={{ color: "var(--cv-green)" }} />
            ) : (
              <TrendingDown size={18} style={{ color: "var(--cv-amber)" }} />
            )}
          </div>
          <div className="funil-diagnostico-info">
            <h4 className="funil-diagnostico-titulo">{funil.diagnostico.titulo}</h4>
            <p className="funil-diagnostico-desc">{funil.diagnostico.descricao}</p>
          </div>
        </div>

        <div className="funil-diagnostico-acao">
          <div className="funil-acao-tag">
            <Zap size={13} />
            <span>Comando Sugerido:</span>
          </div>
          <span className="funil-acao-texto">{funil.diagnostico.acao}</span>
        </div>
      </div>
    </div>
  );
}
