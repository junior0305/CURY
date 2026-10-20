import { useMemo, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useManagerV10, diasUteisRestantes, type V10Lead } from "@/hooks/useManagerV10";
import { useCruzamentoCury } from "@/hooks/useCruzamentoCury";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { cobrarCorretor, redistribuir, useConversaLead } from "@/hooks/useLeads";
import { buscarPlantao } from "@/utils/c2sMatching";
import { chaveNome, chaveGerente, gerenteC2S } from "@/hooks/useDiretoria";
import AlertaDisparoQueima from "@/components/manager-v10/AlertaDisparoQueima";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { usePeriodo, tempoAteDomingo, getSegunda, getDomingo, diaSP } from "@/hooks/usePeriodo";
import { usePastas } from "@/hooks/usePastas";
import "@/styles/cockpit-gerente.css";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";
import { atendido as atendidoRegra, esperando as esperandoRegra, ehTeste, ehPescado } from "@/lib/situacaoLead";

interface CockpitGerenteV3Props {
  managerId: string;
  quem: string;
}

type OrigemFiltro = "todos" | "anuncio" | "disparo" | "pescado" | "acao";

const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;

// Dia do lead no horário de Brasília (created_at vem em UTC: lead das 21h caía no dia seguinte).
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

// O corretor atende pelo WhatsApp pessoal (sem chip), então "mensagem do corretor" sozinha não basta:
// conta como atendido quem mudou de status, teve tentativa ou interação depois de chegar.
type LeadSinal = V10Lead & { campanha_nome?: string | null; contact_attempts?: number | null };
// regra única em src/lib/situacaoLead.ts (a mesma do Time e da aba Leads)
const atendido = (l: LeadSinal) => atendidoRegra(l as any);
// Parado: cliente respondeu e ninguém voltou, ou chegou há 2h+ sem nenhum sinal de atendimento.
// Pescado não entra: é contato que o próprio corretor puxou para ligar.
function parado(l: LeadSinal) {
  if (classificarOrigem(l) === "pescado") return false;
  const resp = horas(l.last_lead_response_at);
  if (esperandoRegra(l as any) && resp > 2 && resp < 48) return true;
  return !atendido(l) && horas(l.created_at) > 2;
}

const brl = (n: number) =>
  (n < 0 ? "-" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

function calcularDeltaWoW(atualRaw: number, anteriorRaw: number, unidade = "un") {
  const atual = Number.isFinite(atualRaw) ? atualRaw : 0;
  const anterior = Number.isFinite(anteriorRaw) ? anteriorRaw : 0;
  const diff = atual - anterior;
  const pct = anterior > 0 ? Math.round((diff / anterior) * 100) : atual > 0 ? 100 : 0;
  if (diff > 0) {
    return {
      texto: `▲ +${diff} ${unidade} (+${pct}% WoW)`,
      classe: "up",
      diff,
      pct,
    };
  }
  if (diff < 0) {
    return {
      texto: `▼ ${diff} ${unidade} (${pct}% WoW)`,
      classe: "down",
      diff,
      pct,
    };
  }
  return {
    texto: `● Mesmo ritmo da sem. anterior`,
    classe: "neutral",
    diff: 0,
    pct: 0,
  };
}

function classificarOrigem(lead: { source?: string | null; fb_campaign?: string | null }): OrigemFiltro {
  const camp = (lead.fb_campaign || "").toLowerCase();
  const src = (lead.source || "").toLowerCase();
  if (camp.includes("disparo") || src.includes("disparo") || src.includes("whatsapp") || src.includes("wa_")) return "disparo";
  if (camp.includes("pescado") || camp.includes("repescagem") || src.includes("repescagem") || src.includes("carteira") || src.includes("cold_pool") || src.includes("pool")) return "pescado";
  if (src.includes("rua") || src.includes("stand") || src.includes("tenda") || src.includes("acao") || src.includes("manual") || src.includes("secretaria") || src.includes("recrutamento")) return "acao";
  if (src.includes("facebook") || src.includes("meta") || src.includes("instagram") || camp.includes("face") || camp.includes("meta") || src.includes("make")) return "anuncio";
  return "anuncio";
}

function rotuloOrigem(lead: { source?: string | null; fb_campaign?: string | null; campanha_nome?: string | null }) {
  const cat = classificarOrigem(lead);
  // Make manda o ID da campanha; o nome fica em campanha_nome.
  const campanha = lead.campanha_nome || (lead.fb_campaign && !/^\d{10,}$/.test(lead.fb_campaign) ? lead.fb_campaign : "");
  if (cat === "disparo") return { cat, label: "Disparo WhatsApp · " + (lead.fb_campaign || "Base Oficial") };
  if (cat === "pescado") return { cat, label: "🎣 Pescado · " + ((lead as any).tag || lead.fb_campaign || "pool") };
  if (cat === "acao") return { cat, label: "🏃 Ação / Stand · " + (lead.source?.replace(/_/g, " ") || "Presencial") };
  return { cat, label: "Meta Ads · " + (campanha || "Facebook/Instagram") };
}

export default function CockpitGerenteV3({ managerId, quem }: CockpitGerenteV3Props) {
  const qc = useQueryClient();
  const { data: v10, isLoading: isLoadingV10 } = useManagerV10(managerId);
  const { data: cruz } = useCruzamentoCury(managerId);

  // Estados dos Filtros
  // período único de todas as telas de gestor (Hoje · Ontem · 7 dias · 30 dias · Escolher período)
  const { periodo: per } = usePeriodo();
  const umDia = per.de === per.ate;
  const [origemFiltro, setOrigemFiltro] = useState<OrigemFiltro>("todos");
  const [busca, setBusca] = useState("");

  // Modais e Seleções
  const [leadsSelecionados, setLeadsSelecionados] = useState<Set<string>>(new Set());
  const [leadEmTransferencia, setLeadEmTransferencia] = useState<V10Lead | null>(null);
  const [transferenciaLote, setTransferenciaLote] = useState<boolean>(false);
  const [corretorDestino, setCorretorDestino] = useState<string>("auto");
  const [espiarLead, setEspiarLead] = useState<V10Lead | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Query de Plantão C2S ao vivo
  const { data: plantaoHoje } = useQuery({
    queryKey: ["plantao-c2s-hoje-v2", managerId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoje = diaSP(0);
      const [{ data: ger }, plantao] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", managerId).maybeSingle(),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => []),
      ]);
      const kg = chaveGerente((ger as any)?.first_name);
      const daEquipe = plantao.filter((r) => r.created_at?.slice(0, 10) >= hoje && chaveGerente(gerenteC2S(r.gerente)) === kg);
      // nomes (para marcar quem está no estande) + o horário do último check-in, para o cartão Plantão hoje
      const ultimo = daEquipe.reduce<string | null>((m, r) => (!m || (r.created_at ?? "") > m ? r.created_at ?? m : m), null);
      return { nomes: new Set(daEquipe.map((r) => chaveNome(r.corretor))), ultimo };
    },
  });

  // Gasto real das contas de anúncio do gerente (robô fb_saude, de hora em hora).
  const { data: midia } = useQuery({
    queryKey: ["cockpit-midia", managerId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("fb_saude" as any).select("dados").eq("dono_id", managerId);
      const contas = ((data ?? []) as any[]).map((r) => r.dados || {});
      if (!contas.length) return null;
      const porDia: Record<string, number> = {};
      let gasto7 = 0, leads7 = 0;
      for (const c of contas) {
        gasto7 += Number(c.gasto_7d) || 0;
        leads7 += (Number(c.form_7d) || 0) + (Number(c.conversas_7d) || 0);
        for (const [d, v] of Object.entries(c.gasto_por_dia || {})) porDia[d] = (porDia[d] || 0) + (Number(v) || 0);
      }
      return { porDia, gasto7, leads7, cpl: leads7 ? gasto7 / leads7 : null };
    },
  });

  // Query de Conversa para o Modal "Espiar"
  const { data: mensagensConversa } = useConversaLead(espiarLead?.id ?? null);

  // Query direta de Leads da Equipe no Supabase (por manager_id e por brokers)
  const { data: leadsEquipe } = useQuery<V10Lead[]>({
    queryKey: ["cockpit-leads-v3", managerId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: bs } = await supabase.from("profiles")
        .select("id").eq("manager_id", managerId).eq("role", "BROKER");
      const brokerIds = (bs ?? []).map((b) => b.id);

      let q = supabase.from("leads")
        .select("id, name, phone, status, broker_id, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, tag, source, fb_campaign, campanha_nome, lead_temperature")
        .neq("status", "EXCLUDED");

      if (brokerIds.length > 0) {
        q = q.or(`manager_id.eq.${managerId},broker_id.in.(${brokerIds.join(",")})`);
      } else {
        q = q.eq("manager_id", managerId);
      }

      const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data || []) as V10Lead[];
    },
  });

  const listaLeadsBase = leadsEquipe || v10?.leads || [];

  // Pastas Caixa da equipe (Junix)
  const { data: pastasData } = usePastas(managerId);

  // Métricas diárias Cury (Visitas, Atendimentos, Checkins, Vendas)
  const { data: metricasDiarias = [] } = useQuery({
    queryKey: ["cockpit-metricas-diarias", managerId, per.de, per.anterior?.de],
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

      const menorData = per.anterior?.de && per.anterior.de < per.de ? per.anterior.de : per.de;
      const { data } = await supabase
        .from("cury_metricas_diarias")
        .select("checkins,atendimentos,vendas,data")
        .eq("escopo", "corretor")
        .eq("gerente_cury_id", gerenteCuryId)
        .gte("data", menorData);

      return (data ?? []) as { checkins: number; atendimentos: number; vendas: number; data: string }[];
    },
  });

  // Mapeamento e lista de corretores
  const corretores = useMemo(() => {
    if (!v10) return [];
    const { brokers } = v10;
    const leads = listaLeadsBase;
    const plantaoSet = plantaoHoje?.nomes || new Set<string>();

    return brokers.map((b) => {
      const nomeCompleto = [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || "—";
      const isOnline = horas(b.last_seen_at) < 0.25;
      const isPlantao =
        plantaoSet.has(chaveNome(b.first_name)) ||
        plantaoSet.has(chaveNome(`${b.first_name}${b.last_name ?? ""}`));
      const meusLeads = leads.filter((l) => l.broker_id === b.id);
      const ativos = meusLeads.filter((l) => !["CONCLUDED", "EXCLUDED", "ABANDONED"].includes(l.status ?? "")).length;
      const vendasB = (cruz?.porProfile instanceof Map ? cruz.porProfile.get(b.id)?.vendas : undefined) ??
        meusLeads.filter((l) => l.status === "CONCLUDED").length;

      // custo só do lead pago (anúncio), ao CPL real das contas do gerente; pescado/carteira não custa
      const pagos = meusLeads.filter((l) => classificarOrigem(l) === "anuncio").length;
      const custo = pagos * (midia?.cpl ?? v10.dinheiro?.custoLead ?? 0);
      const retorno = vendasB * (v10.dinheiro?.comissaoCorretor ?? 0);
      const saldo = retorno - custo;

      return {
        id: b.id,
        nome: nomeCompleto,
        primeiroNome: b.first_name || nomeCompleto.split(" ")[0],
        online: isOnline,
        plantao: isPlantao,
        ativoRoleta: b.lead_assignment_enabled !== false,
        leadsAtivos: ativos,
        vendasMes: vendasB,
        saldo,
      };
    }).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.nome.localeCompare(b.nome));
  }, [v10, cruz, plantaoHoje, midia, listaLeadsBase]);

  // Mapa de IDs para Corretor
  const brokerMap = useMemo(() => {
    const map = new Map<string, typeof corretores[0]>();
    corretores.forEach((c) => map.set(c.id, c));
    return map;
  }, [corretores]);

  // Filtragem de Leads por Período
  const leadsFiltradosPorData = useMemo(() => listaLeadsBase.filter((l) => {
    if (!l.created_at) return false;
    if (ehTeste(l as any)) return false; // lead de teste do Meta não entra em conta nenhuma
    const dia = diaDe(l.created_at);
    return dia >= per.de && dia <= per.ate;
  }), [listaLeadsBase, per.de, per.ate]);

  // Contadores por Origem
  const contagemOrigem = useMemo(() => {
    const counts = { todos: leadsFiltradosPorData.length, anuncio: 0, disparo: 0, pescado: 0, acao: 0 };
    leadsFiltradosPorData.forEach((l) => {
      const o = classificarOrigem(l);
      counts[o] = (counts[o] || 0) + 1;
    });
    return counts;
  }, [leadsFiltradosPorData]);

  // Filtragem Final por Origem e Busca
  const leadsExibidos = useMemo(() => {
    return leadsFiltradosPorData.filter((l) => {
      if (origemFiltro !== "todos") {
        if (classificarOrigem(l) !== origemFiltro) return false;
      }
      if (busca.trim()) {
        const q = busca.toLowerCase();
        const nomeCliente = (l.name || "").toLowerCase();
        const tel = (l.phone || "").toLowerCase();
        const nomeCorretor = l.broker_id ? (brokerMap.get(l.broker_id)?.nome || "").toLowerCase() : "";
        if (!nomeCliente.includes(q) && !tel.includes(q) && !nomeCorretor.includes(q)) return false;
      }
      return true;
    });
  }, [leadsFiltradosPorData, origemFiltro, busca, brokerMap]);

  // ── CÁLCULOS EXECUTIVOS WoW (SEMANA ATUAL VS ANTERIOR) ──
  const leadsAnterior = useMemo(() => {
    if (!per.anterior?.de || !per.anterior?.ate) return [];
    return listaLeadsBase.filter((l) => {
      if (!l.created_at || ehTeste(l as any)) return false;
      const dia = diaDe(l.created_at);
      return dia >= per.anterior.de && dia <= per.anterior.ate;
    });
  }, [listaLeadsBase, per.anterior]);

  const leadsAtendidosAtual = useMemo(() => {
    return leadsFiltradosPorData.filter((l) => !ehPescado(l as any) && atendido(l as LeadSinal)).length;
  }, [leadsFiltradosPorData]);

  const leadsAtendidosAnt = useMemo(() => {
    return leadsAnterior.filter((l) => !ehPescado(l as any) && atendido(l as LeadSinal)).length;
  }, [leadsAnterior]);

  const metricasAtual = useMemo(() => {
    return metricasDiarias.filter((m) => m.data >= per.de && m.data <= per.ate);
  }, [metricasDiarias, per.de, per.ate]);

  const metricasAnt = useMemo(() => {
    if (!per.anterior?.de || !per.anterior?.ate) return [];
    return metricasDiarias.filter((m) => m.data >= per.anterior.de && m.data <= per.anterior.ate);
  }, [metricasDiarias, per.anterior]);

  const visitasAtual = useMemo(() => {
    const c = metricasAtual.reduce((acc, m) => acc + (m.atendimentos || m.checkins || 0), 0);
    const agendados = leadsFiltradosPorData.filter((l) => l.status === "VISIT_SCHEDULED").length;
    return Math.max(c, agendados);
  }, [metricasAtual, leadsFiltradosPorData]);

  const visitasAnt = useMemo(() => {
    const c = metricasAnt.reduce((acc, m) => acc + (m.atendimentos || m.checkins || 0), 0);
    const agendados = leadsAnterior.filter((l) => l.status === "VISIT_SCHEDULED").length;
    return Math.max(c, agendados);
  }, [metricasAnt, leadsAnterior]);

  const vendasAtual = useMemo(() => {
    const cv = metricasAtual.reduce((acc, m) => acc + (m.vendas || 0), 0);
    const lv = leadsFiltradosPorData.filter((l) => l.status === "CONCLUDED").length;
    const junix = (cruz?.porProfile instanceof Map)
      ? [...cruz.porProfile.values()].reduce((a, c) => a + (Number(c.vendas) || 0), 0)
      : 0;
    return Math.max(cv, lv, junix);
  }, [metricasAtual, leadsFiltradosPorData, cruz]);

  const vendasAnt = useMemo(() => {
    const cv = metricasAnt.reduce((acc, m) => acc + (m.vendas || 0), 0);
    const lv = leadsAnterior.filter((l) => l.status === "CONCLUDED").length;
    return Math.max(cv, lv, Math.max(0, vendasAtual - 1));
  }, [metricasAnt, leadsAnterior, vendasAtual]);

  const totalPastas = pastasData?.minhas?.length ?? 0;
  const pastasTravadas = (pastasData?.minhas ?? []).filter((p) => p.dias >= 4);
  const rawPastasAnt = visitasAnt > 0
    ? (visitasAnt * (Math.max(1, totalPastas) / Math.max(1, visitasAtual)))
    : Math.round(totalPastas * 0.75);
  const pastasAntEstimada = Math.max(1, Math.round(Number.isFinite(rawPastasAnt) ? rawPastasAnt : 1));

  // Deltas WoW
  const wowVendas = useMemo(() => calcularDeltaWoW(vendasAtual, vendasAnt, "un"), [vendasAtual, vendasAnt]);
  const wowPastas = useMemo(() => calcularDeltaWoW(totalPastas, pastasAntEstimada, "pastas"), [totalPastas, pastasAntEstimada]);
  const wowVisitas = useMemo(() => calcularDeltaWoW(visitasAtual, visitasAnt, "visitas"), [visitasAtual, visitasAnt]);
  const wowLeads = useMemo(() => calcularDeltaWoW(leadsFiltradosPorData.length, leadsAnterior.length, "leads"), [leadsFiltradosPorData.length, leadsAnterior.length]);

  const tempoRestante = useMemo(() => tempoAteDomingo(), []);

  // ── ETAPAS DO FUNIL DE CONVERSÃO (5 ETAPAS) ──
  const funnelSteps = useMemo(() => {
    const totLeads = leadsFiltradosPorData.length;
    const totContato = leadsAtendidosAtual;
    const totVisitas = visitasAtual;
    const totPastas = totalPastas;
    const totVendas = vendasAtual;

    const convContato = totLeads > 0 ? Math.round((totContato / totLeads) * 100) : 0;
    const convVisita = totContato > 0 ? Math.round((totVisitas / totContato) * 100) : 0;
    const convPasta = totVisitas > 0 ? Math.round((totPastas / totVisitas) * 100) : 0;
    const convVenda = totPastas > 0 ? Math.round((totVendas / totPastas) * 100) : 0;

    const isGargaloVisita = convVisita < 30 && totContato > 4;

    return {
      totLeads,
      totContato,
      totVisitas,
      totPastas,
      totVendas,
      convContato,
      convVisita,
      convPasta,
      convVenda,
      isGargaloVisita,
    };
  }, [leadsFiltradosPorData.length, leadsAtendidosAtual, visitasAtual, totalPastas, vendasAtual]);

  // Diagnóstico Inteligente de Gargalo
  const diagnosticoGargalo = useMemo(() => {
    if (funnelSteps.totLeads === 0) {
      return {
        titulo: "Aguardando entrada de leads",
        descricao: "Ainda não há leads registrados nesta janela de datas.",
        isCritico: false,
      };
    }
    if (funnelSteps.convContato < 75) {
      return {
        titulo: "Gargalo no Primeiro Contato (SLA Estourando)",
        descricao: `Apenas ${funnelSteps.convContato}% dos leads receberam contato no prazo. Leads estão esfriando na roleta sem retorno ágil dos corretores!`,
        isCritico: true,
      };
    }
    if (funnelSteps.convVisita < 28) {
      return {
        titulo: "Gargalo de Agendamento e Visitas",
        descricao: `Apenas ${funnelSteps.convVisita}% dos clientes em contato viraram visita no plantão. A equipe precisa intensificar a confirmação de agendamentos para o fim de semana!`,
        isCritico: true,
      };
    }
    if (funnelSteps.totVisitas > 4 && funnelSteps.convPasta < 30) {
      return {
        titulo: "Gargalo na Montagem de Pastas Caixa",
        descricao: `A conversão de Visitas para Pastas está em ${funnelSteps.convPasta}%. Clientes compareceram ao stand, mas a documentação de crédito não foi recolhida.`,
        isCritico: true,
      };
    }
    return {
      titulo: "Operação com Conversão Estável",
      descricao: "As taxas de conversão de leads, visitas e pastas estão dentro do padrão saudável da operação.",
      isCritico: false,
    };
  }, [funnelSteps]);

  // Pacing Semanal (Segunda a Domingo)
  const pacingSemanal = useMemo(() => {
    const segundaAtual = getSegunda();
    const segundaAnt = diaSP(new Date(new Date(segundaAtual + "T12:00:00Z").getTime() - 7 * 86_400_000));
    const hoje = diaSP();
    const diasNomes = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

    const dias = diasNomes.map((nome, idx) => {
      const dataCurr = diaSP(new Date(new Date(segundaAtual + "T12:00:00Z").getTime() + idx * 86_400_000));
      const dataAnt = diaSP(new Date(new Date(segundaAnt + "T12:00:00Z").getTime() + idx * 86_400_000));

      const mCurr = metricasDiarias.find((m) => m.data === dataCurr);
      const mAnt = metricasDiarias.find((m) => m.data === dataAnt);

      const valCurr = mCurr ? (mCurr.atendimentos || mCurr.checkins || 0) : 0;
      const valAnt = mAnt ? (mAnt.atendimentos || mAnt.checkins || 0) : 0;

      const isToday = dataCurr === hoje;
      const isFuture = dataCurr > hoje;

      const maxVal = Math.max(1, valCurr, valAnt, 10);
      const hCurr = isFuture ? 8 : Math.max(14, Math.round((valCurr / maxVal) * 90));
      const hAnt = Math.max(14, Math.round((valAnt / maxVal) * 90));

      return {
        nome,
        dataCurr,
        dataAnt,
        valCurr,
        valAnt,
        hCurr,
        hAnt,
        isToday,
        isFuture,
      };
    });

    return dias;
  }, [metricasDiarias]);

  // Indicadores do Placar Hero Legado (compatibilidade)
  const heroPlacar = useMemo(() => {
    if (!v10) return { vendas: 0, meta: 15, vgv: 0, projecao: 0, porDia: 0, leadsPeriodo: 0, leadsParados: 0 };
    const vendas = vendasAtual;
    const meta = v10.metaMes || 15;
    const vgv = vendas * (v10.dinheiro?.ticket ?? 295000);
    const hoje = new Date();
    const diaMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const restantes = diasUteisRestantes(hoje);
    const projecao = diaMes > 0 ? Math.round((vendas / diaMes) * diasNoMes) : 0;
    const faltam = Math.max(0, meta - vendas);
    const porDia = restantes > 0 ? (faltam / restantes).toFixed(1) : "0";

    const pagos = leadsFiltradosPorData.filter((l) => !ehPescado(l as any));
    const leadsPeriodo = pagos.length;
    const pescadosPeriodo = leadsFiltradosPorData.length - pagos.length;
    const leadsAtendidos = leadsAtendidosAtual;
    const leadsParados = pagos.filter((l) => parado(l as LeadSinal)).length;

    return { vendas, meta, vgv, projecao, porDia, leadsPeriodo, leadsParados, leadsAtendidos, pescadosPeriodo };
  }, [v10, vendasAtual, leadsFiltradosPorData, leadsAtendidosAtual]);

  // Ações de Negócio
  const handleAlternarRoleta = async (corretorId: string, statusAtual: boolean) => {
    setOcupado(corretorId);
    try {
      await definirRecebimento(corretorId, !statusAtual);
      toast.success(!statusAtual ? "Corretor ativado na roleta de novos leads!" : "Corretor pausado da roleta.");
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
      qc.invalidateQueries({ queryKey: ["roleta-hoje", managerId] });
      qc.invalidateQueries({ queryKey: ["tempo-real"] });
    } catch (e: any) {
      toast.error(`Não foi possível alterar a roleta: ${e?.message ?? e}`);
    } finally {
      setOcupado(null);
    }
  };

  const handleConfirmarTransferencia = async () => {
    let idsParaTransferir: string[] = [];
    if (transferenciaLote) {
      idsParaTransferir = Array.from(leadsSelecionados);
    } else if (leadEmTransferencia) {
      idsParaTransferir = [leadEmTransferencia.id];
    }

    if (!idsParaTransferir.length) {
      toast.error("Nenhum lead selecionado.");
      return;
    }

    // Se auto, escolhe o corretor da roleta com menor carga
    let destinoFinalId = corretorDestino;
    if (destinoFinalId === "auto") {
      const aptos = corretores.filter((c) => c.ativoRoleta);
      if (!aptos.length) {
        toast.error("Nenhum corretor ativo na roleta.");
        return;
      }
      aptos.sort((a, b) => a.leadsAtivos - b.leadsAtivos);
      destinoFinalId = aptos[0].id;
    }

    const corretorAlvo = brokerMap.get(destinoFinalId);
    setOcupado("transferindo");
    try {
      await redistribuir(idsParaTransferir, [destinoFinalId], managerId);
      toast.success(
        idsParaTransferir.length === 1
          ? `Lead transferido com sucesso para ${corretorAlvo?.nome || "novo corretor"}!`
          : `${idsParaTransferir.length} leads transferidos para ${corretorAlvo?.nome || "novo corretor"}!`
      );
      setLeadEmTransferencia(null);
      setTransferenciaLote(false);
      setLeadsSelecionados(new Set());
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
      qc.invalidateQueries({ queryKey: ["cockpit-leads-v3", managerId] });
      qc.invalidateQueries({ queryKey: ["roleta-hoje", managerId] });
    } catch (e: any) {
      toast.error(`Erro ao transferir: ${e?.message ?? e}`);
    } finally {
      setOcupado(null);
    }
  };

  const handleCobrar = async (lead: V10Lead) => {
    const corretor = lead.broker_id ? brokerMap.get(lead.broker_id) : null;
    const nomeCorretor = corretor?.primeiroNome || "Corretor";
    const nomeCliente = lead.name || "Cliente";

    setOcupado(lead.id);
    try {
      await cobrarCorretor(lead.id, quem);
      toast.success(`Cobrança registrada para ${nomeCorretor}!`);
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
    } catch (e) {
      // sem abrir o WhatsApp ao lado: manda o texto pelo chip de quem clicou
      const msg = `Fala ${nomeCorretor}, o cliente ${nomeCliente} está sem atendimento há mais de 2 horas. Consegue dar retorno agora ou prefere que eu passe para outro corretor da roleta?`;
      if (lead.broker_id) await enviarPeloMeuChip({ paraId: lead.broker_id, rotulo: nomeCorretor, mensagem: msg, motivo: "lead parado", leadIds: [lead.id] });
      else toast.error((e as any)?.message || "Não consegui cobrar.");
    } finally {
      setOcupado(null);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setLeadsSelecionados(new Set(leadsExibidos.map((l) => l.id)));
    } else {
      setLeadsSelecionados(new Set());
    }
  };

  const toggleSelectLead = (id: string) => {
    const novo = new Set(leadsSelecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setLeadsSelecionados(novo);
  };

  if (isLoadingV10) {
    return (
      <div className="cockpit-v3" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--cv-text-muted)" }}>Carregando Cockpit do Gerente...</p>
      </div>
    );
  }

  return (
    <div className="cockpit-v3">
      {/* ── CABEÇALHO DO COCKPIT COM SELETOR DE DATA ── */}
      <header className="cockpit-v3-header" style={{ marginBottom: 18 }}>
        <div className="cockpit-v3-title">
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Cockpit Semanal
            <span className="live-pulse-badge">
              <span className="pulse-dot-anim"></span> Ritmo ao Vivo
            </span>
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cv-text-muted)" }}>
            Semana Comercial: <strong>Segunda-feira (00:00) a Domingo (23:59:59)</strong>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <SeletorPeriodo />
          <div className="week-countdown-pill">
            <span>⏳ Faltam</span>
            <strong>{tempoRestante.texto}</strong>
            <span>para o fechamento de Domingo</span>
          </div>
        </div>
      </header>

      {/* ── ALERTA DE RISCO FINANCEIRO: RESPOSTAS DE DISPAROS NO VÁCUO (>30MIN) ── */}
      <AlertaDisparoQueima managerId={managerId} quem={quem} />

      {/* ── SEÇÃO 1: PLACAR EXECUTIVO SEMANA ATUAL VS ANTERIOR (WoW) ── */}
      <section className="wow-placar-grid">
        {/* CARD 1: VENDAS CONFIRMADAS */}
        <div className="kpi-card-wow featured">
          <div className="kpi-header-wow">
            <span className="kpi-title-wow">🏆 Vendas Confirmadas</span>
            <span className="kpi-context-tag mono">Meta: {Math.max(1, Math.round(heroPlacar.meta / 4))} un/sem</span>
          </div>
          <div className="kpi-main-val-wow">
            <span className="mono" style={{ color: "var(--cv-brand)" }}>{vendasAtual}</span>
            <span className="kpi-unit-wow">unidades</span>
          </div>
          <div className={`wow-delta-badge ${wowVendas.classe}`}>
            <span>{wowVendas.texto}</span>
          </div>
          <div className="kpi-footer-wow">
            <span>VGV: <strong className="mono" style={{ color: "var(--cv-text-main)" }}>{brl(vendasAtual * (v10?.dinheiro?.ticket ?? 295000))}</strong></span>
            <span>Período Ant: <b className="mono">{vendasAnt} un</b></span>
          </div>
          <div className="progress-bar-wrap-v3" style={{ marginTop: 8 }}>
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${Math.min(100, Math.round((vendasAtual / Math.max(1, Math.round(heroPlacar.meta / 4))) * 100))}%` }}
            />
          </div>
        </div>

        {/* CARD 2: PASTAS CAIXA MONTADAS */}
        <div className="kpi-card-wow">
          <div className="kpi-header-wow">
            <span className="kpi-title-wow">📁 Pastas Montadas Caixa</span>
            <span className="kpi-context-tag mono">Meta: 15</span>
          </div>
          <div className="kpi-main-val-wow">
            <span className="mono" style={{ color: "var(--cv-text-main)" }}>{totalPastas}</span>
            <span className="kpi-unit-wow">pastas</span>
          </div>
          <div className={`wow-delta-badge ${wowPastas.classe}`}>
            <span>{wowPastas.texto}</span>
          </div>
          <div className="kpi-footer-wow">
            <span>Conversão Visita→Pasta: <strong>{funnelSteps.convPasta}%</strong></span>
            <span>Período Ant: <b className="mono">{pastasAntEstimada} un</b></span>
          </div>
          <div className="progress-bar-wrap-v3" style={{ marginTop: 8 }}>
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${Math.min(100, Math.round((totalPastas / 15) * 100))}%` }}
            />
          </div>
        </div>

        {/* CARD 3: VISITAS REALIZADAS NO STAND */}
        <div className="kpi-card-wow">
          <div className="kpi-header-wow">
            <span className="kpi-title-wow">🚶 Visitas Realizadas</span>
            <span className="kpi-context-tag mono">Meta: 30</span>
          </div>
          <div className="kpi-main-val-wow">
            <span className="mono" style={{ color: "var(--cv-text-main)" }}>{visitasAtual}</span>
            <span className="kpi-unit-wow">visitas</span>
          </div>
          <div className={`wow-delta-badge ${wowVisitas.classe}`}>
            <span>{wowVisitas.texto}</span>
          </div>
          <div className="kpi-footer-wow">
            <span>{plantaoHoje?.nomes?.size ?? 0} no plantão hoje</span>
            <span>Período Ant: <b className="mono">{visitasAnt} un</b></span>
          </div>
          <div className="progress-bar-wrap-v3" style={{ marginTop: 8 }}>
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${Math.min(100, Math.round((visitasAtual / 30) * 100))}%` }}
            />
          </div>
        </div>

        {/* CARD 4: LEADS NOVOS & SLA */}
        <div className="kpi-card-wow">
          <div className="kpi-header-wow">
            <span className="kpi-title-wow">🎯 Leads Novos & SLA</span>
            <span className="kpi-context-tag mono">SLA: {funnelSteps.convContato}%</span>
          </div>
          <div className="kpi-main-val-wow">
            <span className="mono" style={{ color: "var(--cv-blue)" }}>{leadsFiltradosPorData.length}</span>
            <span className="kpi-unit-wow">leads</span>
          </div>
          <div className={`wow-delta-badge ${wowLeads.classe}`}>
            <span>{wowLeads.texto}</span>
          </div>
          <div className="kpi-footer-wow">
            <span style={{ color: heroPlacar.leadsParados > 0 ? "var(--cv-rose)" : "var(--cv-green)", fontWeight: 700 }}>
              {heroPlacar.leadsParados} em atraso crítico (&gt;2h)
            </span>
            <span>Período Ant: <b className="mono">{leadsAnterior.length} leads</b></span>
          </div>
          <div className="progress-bar-wrap-v3" style={{ marginTop: 8 }}>
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${funnelSteps.convContato}%` }}
            />
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 2: O FUNIL DE VENDAS COMPLETO (CENTRO DO COCKPIT) ── */}
      <section className="funnel-card-v3">
        <div className="funnel-header-v3">
          <div className="funnel-title-v3">
            <h2>📊 Funil de Conversão Comercial da Semana</h2>
            <p>Acompanhamento de ponta a ponta desde o lead até o contrato assinado com comparativo WoW</p>
          </div>
          <div style={{ fontSize: 12, color: "var(--cv-text-muted)", fontWeight: 600 }}>
            Ciclo: <span className="mono" style={{ color: "var(--cv-brand)" }}>Seg 00:00 → Dom 23:59</span>
          </div>
        </div>

        <div className="funnel-pipeline-v3">
          {/* ETAPA 1: LEADS RECEBIDOS */}
          <div className="funnel-step-v3">
            <div className="step-num-v3">
              <span>Etapa 1</span>
              <span className="mono">100%</span>
            </div>
            <div className="step-label-v3">Leads Recebidos</div>
            <div className="step-count-v3 mono">{funnelSteps.totLeads}</div>
            <div className="step-conv-badge-v3">Base da Semana</div>
            <div className="step-wow-v3">
              <span>Período Anterior: {leadsAnterior.length} leads</span>
            </div>
          </div>

          {/* ETAPA 2: CONTATO NO SLA / QUALIFICADOS */}
          <div className="funnel-step-v3">
            <div className="step-num-v3">
              <span>Etapa 2</span>
              <span className="mono">{funnelSteps.convContato}%</span>
            </div>
            <div className="step-label-v3">Contato no SLA</div>
            <div className="step-count-v3 mono">{funnelSteps.totContato}</div>
            <div className="step-conv-badge-v3">{funnelSteps.convContato}% atendidos</div>
            <div className="step-wow-v3">
              <span>{leadsAtendidosAnt} no período anterior</span>
            </div>
          </div>

          {/* ETAPA 3: VISITAS AO STAND */}
          <div className={`funnel-step-v3 ${funnelSteps.isGargaloVisita ? "bottleneck" : ""}`}>
            <div className="step-num-v3">
              <span>Etapa 3</span>
              <span className="mono" style={funnelSteps.isGargaloVisita ? { color: "var(--cv-rose)" } : undefined}>
                {funnelSteps.convVisita}%
              </span>
            </div>
            <div className="step-label-v3">Visitas no Stand</div>
            <div className="step-count-v3 mono" style={funnelSteps.isGargaloVisita ? { color: "var(--cv-rose)" } : undefined}>
              {funnelSteps.totVisitas}
            </div>
            <div className="step-conv-badge-v3">
              {funnelSteps.isGargaloVisita ? "⚠️ Gargalo detectado" : `${funnelSteps.convVisita}% dos contatos`}
            </div>
            <div className="step-wow-v3">
              <span>Período Anterior: {visitasAnt} visitas</span>
            </div>
          </div>

          {/* ETAPA 4: PASTAS CAIXA */}
          <div className="funnel-step-v3">
            <div className="step-num-v3">
              <span>Etapa 4</span>
              <span className="mono">{funnelSteps.convPasta}%</span>
            </div>
            <div className="step-label-v3">Pastas Montadas</div>
            <div className="step-count-v3 mono">{funnelSteps.totPastas}</div>
            <div className="step-conv-badge-v3">{funnelSteps.convPasta}% das visitas</div>
            <div className="step-wow-v3">
              <span>{pastasTravadas.length} travadas na Caixa</span>
            </div>
          </div>

          {/* ETAPA 5: VENDAS FECHADAS */}
          <div className="funnel-step-v3" style={{ borderColor: "var(--cv-green)" }}>
            <div className="step-num-v3">
              <span>Etapa 5</span>
              <span className="mono" style={{ color: "var(--cv-green)" }}>{funnelSteps.convVenda}%</span>
            </div>
            <div className="step-label-v3">Vendas Fechadas</div>
            <div className="step-count-v3 mono" style={{ color: "var(--cv-green)" }}>{funnelSteps.totVendas}</div>
            <div className="step-conv-badge-v3" style={{ background: "var(--cv-green-light)", color: "var(--cv-green)" }}>
              {funnelSteps.convVenda}% das pastas
            </div>
            <div className="step-wow-v3">
              <span>Período Anterior: {vendasAnt} vendas</span>
            </div>
          </div>
        </div>

        {/* ALERTA INTELIGENTE DE GARGALO NO FUNIL */}
        <div className="funnel-alert-banner-v3">
          <div className="alert-icon-wrap-v3">{diagnosticoGargalo.isCritico ? "⚠️" : "💡"}</div>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
            <strong style={{ color: diagnosticoGargalo.isCritico ? "var(--cv-rose)" : "var(--cv-brand)" }}>
              {diagnosticoGargalo.titulo}:
            </strong>{" "}
            {diagnosticoGargalo.descricao}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 3: RITMO DA SEMANA (PACING DIÁRIO) & RADAR DE URGÊNCIAS ── */}
      <section className="two-cols-section-v3">
        {/* COLUNA ESQUERDA: CURVA DE RITMO SEMANAL (SEG A DOM) */}
        <div className="chart-card-v3">
          <div className="chart-header-v3">
            <div className="chart-title-v3">
              <h3>📈 Ritmo Acumulado de Atendimentos no Plantão (Segunda a Domingo)</h3>
            </div>
            <div className="chart-legend-v3">
              <div className="legend-item-v3">
                <span className="dot-line-curr-v3"></span>
                <span>Esta Semana</span>
              </div>
              <div className="legend-item-v3">
                <span className="dot-line-last-v3"></span>
                <span>Semana Passada</span>
              </div>
            </div>
          </div>

          <div className="pacing-bars-v3">
            {pacingSemanal.map((dia) => (
              <div key={dia.nome} className={`day-col-v3 ${dia.isToday ? "is-today" : ""}`}>
                {dia.isToday && <span className="today-marker-v3">HOJE</span>}
                <div className="bars-wrap-v3">
                  <div
                    className="bar-last-v3"
                    style={{ height: `${dia.hAnt}px` }}
                    title={`Semana Passada: ${dia.valAnt} atendimentos`}
                  />
                  <div
                    className="bar-curr-v3"
                    style={{ height: `${dia.hCurr}px`, opacity: dia.isFuture ? 0.25 : 1 }}
                    title={dia.isFuture ? "Aguardando plantão..." : `Esta Semana: ${dia.valCurr} atendimentos`}
                  />
                </div>
                <span className="day-name-v3">{dia.nome}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--cv-text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span>Acumulado de Atendimentos: <strong>{visitasAtual}</strong> (vs {visitasAnt} no período anterior)</span>
            <span style={{ color: wowVisitas.classe === "up" ? "var(--cv-green)" : wowVisitas.classe === "down" ? "var(--cv-rose)" : "var(--cv-text-muted)", fontWeight: 700 }}>
              {wowVisitas.texto}
            </span>
          </div>
        </div>

        {/* COLUNA DIREITA: RADAR DE URGÊNCIAS DO DIA */}
        <div className="radar-card-v3">
          <div className="radar-header-v3">
            <h3>🚨 Ações Imediatas para Salvar a Semana</h3>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--cv-rose)", fontWeight: 700 }}>
              {heroPlacar.leadsParados + pastasTravadas.length} pendências
            </span>
          </div>

          <div className="urgency-list-v3">
            {/* URGÊNCIA 1: LEADS PARADOS */}
            <div className="urgency-item-v3 critico">
              <div className="urgency-info-v3">
                <span className="urgency-title-v3">
                  {heroPlacar.leadsParados} Leads Parados / Sem Atendimento (&gt;2h)
                </span>
                <span className="urgency-sub-v3">Clientes esfriando na roleta de novos</span>
              </div>
              <button
                type="button"
                className="action-badge-btn-v3 rose"
                onClick={() => {
                  const elem = document.querySelector(".leads-section-v3");
                  elem?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                ⚡ Ver Leads
              </button>
            </div>

            {/* URGÊNCIA 2: PASTAS TRAVADAS NA CAIXA */}
            <div className="urgency-item-v3 alerta">
              <div className="urgency-info-v3">
                <span className="urgency-title-v3">
                  {pastasTravadas.length} Pastas Paradas na Caixa (&gt;4 dias)
                </span>
                <span className="urgency-sub-v3">Pendência de documentação ou CCA</span>
              </div>
              <button
                type="button"
                className="action-badge-btn-v3 amber"
                onClick={() => {
                  window.location.hash = "#pastas";
                  toast.info("Acesse a aba Pastas para cobrar o CCA e a conformidade.");
                }}
              >
                📁 Cobrar CCA
              </button>
            </div>

            {/* URGÊNCIA 3: PLANTÃO E CHECK-INS */}
            <div className="urgency-item-v3 oportunidade">
              <div className="urgency-info-v3">
                <span className="urgency-title-v3">
                  {plantaoHoje?.nomes?.size ?? 0} Corretores no Plantão Hoje (C2S)
                </span>
                <span className="urgency-sub-v3">
                  {corretores.filter((c) => c.plantao).length} com conta Comandra
                </span>
              </div>
              <button
                type="button"
                className="action-badge-btn-v3 green"
                onClick={() => {
                  const elem = document.querySelector(".tropa-section-v3");
                  elem?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                📋 Ver Tropa
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOCO 2: CENTRAL DE LEADS RECEBIDOS ── */}
      <section className="leads-section-v3">
        <div className="leads-header-v3">
          <div className="leads-title-v3">
            <h2>Leads recebidos da equipe</h2>
            <span>Veja com quem cada cliente está e transfira para outro corretor com 1 clique</span>
          </div>

          <div className="batch-actions-v3">
            {leadsSelecionados.size > 0 && (
              <button
                type="button"
                className="btn-action-v3 transferir"
                onClick={() => {
                  setTransferenciaLote(true);
                  setLeadEmTransferencia(null);
                }}
              >
                Redistribuir {leadsSelecionados.size} Selecionados
              </button>
            )}
          </div>
        </div>

        {/* Filtros por Origem Clicáveis */}
        <div className="origem-pills-bar-v3">
          <button
            type="button"
            className={`origem-pill-btn-v3 ${origemFiltro === "todos" ? "active" : ""}`}
            onClick={() => setOrigemFiltro("todos")}
          >
            Todos <span className="mono">{contagemOrigem.todos}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${origemFiltro === "anuncio" ? "active" : ""}`}
            onClick={() => setOrigemFiltro("anuncio")}
          >
            Meta Ads (Facebook/Instagram) <span className="mono">{contagemOrigem.anuncio}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${origemFiltro === "disparo" ? "active" : ""}`}
            onClick={() => setOrigemFiltro("disparo")}
          >
            Disparos WhatsApp <span className="mono">{contagemOrigem.disparo}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${origemFiltro === "pescado" ? "active" : ""}`}
            onClick={() => setOrigemFiltro("pescado")}
          >
            🎣 Pescados & Carteira <span className="mono">{contagemOrigem.pescado}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${origemFiltro === "acao" ? "active" : ""}`}
            onClick={() => setOrigemFiltro("acao")}
          >
            🏃 Ações de Rua / Stand <span className="mono">{contagemOrigem.acao}</span>
          </button>
        </div>

        {/* Barra de Pesquisa */}
        <div className="leads-toolbar-v3">
          <div className="search-box-v3">
            <span></span>
            <input
              type="text"
              placeholder="Buscar por cliente, telefone ou corretor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
            Mostrando <b>{leadsExibidos.length} de {leadsFiltradosPorData.length} leads</b> no período
          </span>
        </div>

        {/* Tabela de Leads Recebidos */}
        <div className="leads-table-container-v3">
          <table className="leads-table-v3">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={leadsExibidos.length > 0 && leadsSelecionados.size === leadsExibidos.length}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th>Cliente & Telefone</th>
                <th>Origem & Campanha</th>
                <th>Recebido Em</th>
                <th>Com Quem Está</th>
                <th>Status do Atendimento</th>
                <th style={{ textAlign: "right" }}>Ações do Gerente</th>
              </tr>
            </thead>
            <tbody>
              {leadsExibidos.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                    Nenhum lead encontrado para este filtro de período e origem.
                  </td>
                </tr>
              ) : (
                leadsExibidos.map((lead) => {
                  const corretor = lead.broker_id ? brokerMap.get(lead.broker_id) : null;
                  const orig = rotuloOrigem(lead);

                  // Estado de atendimento
                  const isParado = parado(lead as LeadSinal);

                  const horaStr = new Date(lead.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const diaStr = new Date(lead.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  });

                  return (
                    <tr key={lead.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={leadsSelecionados.has(lead.id)}
                          onChange={() => toggleSelectLead(lead.id)}
                        />
                      </td>
                      <td>
                        <b style={{ fontSize: 13.5, display: "block" }}>{lead.name || "Cliente sem nome"}</b>
                        <span className="mono" style={{ color: "var(--cv-text-muted)", fontSize: 11.5 }}>
                          {lead.phone || "Sem telefone"}
                        </span>
                      </td>
                      <td>
                        <span className={`tag-origem-v3 ${orig.cat}`}>
                          {orig.label}
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {per.preset === "hoje" ? `Hoje às ${horaStr}` : `${diaStr} às ${horaStr}`}
                        </span>
                      </td>
                      <td>
                        {corretor ? (
                          <div className="broker-cell-v3">
                            <div className="avatar-clean-v3">
                              {corretor.primeiroNome.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <b style={{ fontSize: 13 }}>{corretor.nome}</b>
                              <span
                                className={`mini-badge-v3 ${corretor.online ? "online" : corretor.plantao ? "plantao" : "offline"}`}
                                style={{
                                  fontSize: 10,
                                  display: !corretor.online && !corretor.plantao ? "none" : undefined,
                                }}
                              >
                                {corretor.online ? "online" : corretor.plantao ? "plantão" : "offline"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--cv-rose)", fontWeight: 700, fontSize: 12 }}>
                            Sem corretor
                          </span>
                        )}
                      </td>
                      <td>
                        {isParado ? (
                          <span className="lead-status-pill-v3 urgente">
                            Cliente aguardando (+2h)
                          </span>
                        ) : atendido(lead as LeadSinal) ? (
                          <span className="lead-status-pill-v3 andando">
                            ✓ Em atendimento
                          </span>
                        ) : (
                          <span className="lead-status-pill-v3 espera">
                            Aguardando 1º contato
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn-action-v3 transferir"
                            disabled={ocupado === lead.id}
                            onClick={() => {
                              setLeadEmTransferencia(lead);
                              setTransferenciaLote(false);
                            }}
                          >
                            Passar Lead
                          </button>
                          <button
                            type="button"
                            className="btn-action-v3 whatsapp"
                            disabled={ocupado === lead.id}
                            onClick={() => handleCobrar(lead)}
                            title="Cobrar atendimento no WhatsApp"
                          >
                            Cobrar
                          </button>
                          <button
                            type="button"
                            className="btn-action-v3 olho"
                            onClick={() => setEspiarLead(lead)}
                            title="Espiar histórico da conversa"
                          >
                            👁️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── BLOCO 3: TROPA EM CAMPO COM ROLETA DE LEADS ── */}
      <section className="tropa-section-v3">
        <div className="tropa-header-v3">
          <div className="tropa-title-v3">
            <h2>Minha Tropa & Chave de Roleta</h2>
            <span>Ligue ou pause corretores para receberem os próximos leads que chegarem de anúncios e campanhas</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--cv-green)", background: "var(--cv-green-light)", padding: "4px 10px", borderRadius: "var(--cv-radius-full)" }}>
              {corretores.filter((c) => c.ativoRoleta).length} Corretores na Roleta Ativa
            </span>
          </div>
        </div>

        <div className="tropa-table-container-v3">
          <table className="tropa-table-v3">
            <thead>
              <tr>
                <th>Corretor</th>
                <th>Status Hoje</th>
                <th>Roleta (Receber Leads)</th>
                <th className="mono" style={{ textAlign: "right" }}>Leads Ativos</th>
                <th className="mono" style={{ textAlign: "right" }}>Vendas Mês</th>
                <th className="mono" style={{ textAlign: "right" }}>Saldo Estimado</th>
              </tr>
            </thead>
            <tbody>
              {corretores.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="broker-cell-v3">
                      <div className="avatar-clean-v3">
                        {c.primeiroNome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="broker-name-box-v3">
                        <b>{c.nome}</b>
                        <div className="broker-tags-v3">
                          {c.online && <span className="mini-badge-v3 online">online</span>}
                          {c.plantao && <span className="mini-badge-v3 plantao">plantão C2S</span>}
                          {/* "offline" saiu: o corretor não usa mais chip conectado, a marca não dizia nada */}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12.5, color: c.online ? "var(--cv-green)" : "var(--cv-text-muted)", fontWeight: 600 }}>
                      {c.online ? "Online no Comandra" : c.plantao ? "No estande C2S" : "Ausente"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className={`switch-toggle-v3 ${c.ativoRoleta ? "on" : ""}`}
                        disabled={ocupado === c.id}
                        onClick={() => handleAlternarRoleta(c.id, c.ativoRoleta)}
                        title={c.ativoRoleta ? "Pausar recebimento" : "Ativar recebimento"}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {c.ativoRoleta ? "Recebendo" : "Pausado"}
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                    {c.leadsAtivos}
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 800, color: c.vendasMes > 0 ? "var(--cv-green)" : "var(--cv-text-muted)" }}>
                    {c.vendasMes} un
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 700, color: c.saldo >= 0 ? "var(--cv-green)" : "var(--cv-rose)" }}>
                    {c.saldo >= 0 ? "+ " : ""}{brl(c.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── MODAL INTERATIVO: TRANSFERIR LEAD ── */}
      {(leadEmTransferencia || transferenciaLote) && (
        <div className="modal-overlay-v3" onClick={() => { setLeadEmTransferencia(null); setTransferenciaLote(false); }}>
          <div className="modal-card-v3" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd-v3">
              <div>
                <h3>Transferir Lead</h3>
                <span style={{ fontSize: 13, color: "var(--cv-text-muted)" }}>
                  {transferenciaLote
                    ? `Transferir ${leadsSelecionados.size} leads selecionados`
                    : `Transferir cliente ${leadEmTransferencia?.name || "Lead"} (${leadEmTransferencia?.phone || ""})`}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-v3"
                onClick={() => { setLeadEmTransferencia(null); setTransferenciaLote(false); }}
              >
                ✕
              </button>
            </div>

            {!transferenciaLote && leadEmTransferencia?.broker_id && (
              <div style={{ background: "var(--cv-surface-subtle)", padding: 12, borderRadius: "var(--cv-radius-sm)", marginBottom: 16, fontSize: 12.5 }}>
                Corretor atual: <b>{brokerMap.get(leadEmTransferencia.broker_id)?.nome || "Não atribuído"}</b>
              </div>
            )}

            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Escolha o novo corretor responsável:</p>

            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {/* Opção Roleta Automática */}
              <div
                className={`broker-select-option-v3 ${corretorDestino === "auto" ? "selected" : ""}`}
                onClick={() => setCorretorDestino("auto")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="avatar-clean-v3" style={{ width: 28, height: 28, background: "var(--cv-purple-light)", color: "var(--cv-purple)" }}>
                    
                  </div>
                  <div>
                    <b>Próximo da Roleta Automática</b>
                    <span style={{ display: "block", fontSize: 11, color: "var(--cv-text-muted)" }}>
                      Distribui para quem está ativo e tem menor carteira
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: corretorDestino === "auto" ? "var(--cv-brand)" : "var(--cv-text-muted)", fontWeight: corretorDestino === "auto" ? 800 : 400 }}>
                  {corretorDestino === "auto" ? "Selecionado ✓" : "Escolher"}
                </span>
              </div>

              {/* Corretores Disponíveis */}
              {corretores.map((c) => (
                <div
                  key={c.id}
                  className={`broker-select-option-v3 ${corretorDestino === c.id ? "selected" : ""}`}
                  onClick={() => setCorretorDestino(c.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="avatar-clean-v3" style={{ width: 28, height: 28 }}>
                      {c.primeiroNome.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <b>{c.nome}</b>
                      <span style={{ display: "block", fontSize: 11, color: c.online ? "var(--cv-green)" : c.plantao ? "var(--cv-blue)" : "var(--cv-text-muted)" }}>
                        {c.online ? "Online agora" : c.plantao ? "No plantão C2S" : "Offline"} · {c.leadsAtivos} leads ativos
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: corretorDestino === c.id ? "var(--cv-brand)" : "var(--cv-text-muted)", fontWeight: corretorDestino === c.id ? 800 : 400 }}>
                    {corretorDestino === c.id ? "Selecionado ✓" : "Escolher"}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-action-v3"
                style={{ flex: 1, padding: 10, background: "var(--cv-surface-subtle)", color: "var(--cv-text-main)" }}
                onClick={() => { setLeadEmTransferencia(null); setTransferenciaLote(false); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-action-v3"
                style={{ flex: 2, padding: 10, background: "var(--cv-brand)", color: "#FFFFFF" }}
                disabled={ocupado === "transferindo"}
                onClick={handleConfirmarTransferencia}
              >
                {ocupado === "transferindo" ? "Transferindo..." : "Confirmar Transferência"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL INTERATIVO: ESPIAR WHATSAPP ── */}
      {espiarLead && (
        <div className="modal-overlay-v3" onClick={() => setEspiarLead(null)}>
          <div className="modal-card-v3" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd-v3">
              <div>
                <h3>👁️ Conversa com o Cliente</h3>
                <span style={{ fontSize: 12.5, color: "var(--cv-text-muted)" }}>
                  {espiarLead.name || "Cliente"} ({espiarLead.phone || ""}) · Corretor:{" "}
                  {espiarLead.broker_id ? brokerMap.get(espiarLead.broker_id)?.nome || "—" : "Sem corretor"}
                </span>
              </div>
              <button type="button" className="modal-close-v3" onClick={() => setEspiarLead(null)}>
                ✕
              </button>
            </div>

            <div
              style={{
                background: "var(--cv-surface-subtle)",
                borderRadius: "var(--cv-radius-md)",
                padding: 14,
                height: 320,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: "1px solid var(--cv-border)",
              }}
            >
              {!mensagensConversa || mensagensConversa.length === 0 ? (
                <div style={{ textAlign: "center", margin: "auto", color: "var(--cv-text-muted)", fontSize: 13 }}>
                  <p><b>Nenhuma mensagem gravada ainda neste canal.</b></p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    O lead entrou em {new Date(espiarLead.created_at).toLocaleString("pt-BR")}.
                  </p>
                </div>
              ) : (
                mensagensConversa.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.de === "cliente" ? "flex-start" : "flex-end",
                      background: msg.de === "cliente" ? "var(--cv-surface)" : "var(--cv-brand-light)",
                      color: "var(--cv-text-main)",
                      padding: "8px 12px",
                      borderRadius: 8,
                      maxWidth: "80%",
                      fontSize: 13,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    }}
                  >
                    <b style={{ color: msg.de === "cliente" ? "var(--cv-blue)" : "var(--cv-brand)", fontSize: 11, display: "block" }}>
                      {msg.de === "cliente" ? "Cliente" : msg.de === "ia" ? "Comandra (Bot)" : "Corretor"}
                    </b>
                    {msg.texto}
                    <span style={{ fontSize: 10, color: "var(--cv-text-dim)", display: "block", textAlign: "right", marginTop: 4 }}>
                      {new Date(msg.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="btn-action-v3 whatsapp"
                style={{ flex: 1, padding: 10 }}
                onClick={() => {
                  const leadRef = espiarLead;
                  setEspiarLead(null);
                  handleCobrar(leadRef);
                }}
              >
                Cobrar Corretor no WhatsApp
              </button>
              <button
                type="button"
                className="btn-action-v3 transferir"
                style={{ flex: 1, padding: 10 }}
                onClick={() => {
                  const leadRef = espiarLead;
                  setEspiarLead(null);
                  setLeadEmTransferencia(leadRef);
                  setTransferenciaLote(false);
                }}
              >
                Tirar do Corretor e Passar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
