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
import { usePeriodo } from "@/hooks/usePeriodo";
import "@/styles/cockpit-gerente.css";

interface CockpitGerenteV3Props {
  managerId: string;
  quem: string;
}

type OrigemFiltro = "todos" | "anuncio" | "disparo" | "pescado" | "acao";

const diaSP = (offsetDias = 0) => {
  const d = new Date(Date.now() - 3 * 3600e3 - offsetDias * 864e5);
  return d.toISOString().slice(0, 10);
};

const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;

// Dia do lead no horário de Brasília (created_at vem em UTC: lead das 21h caía no dia seguinte).
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

// O corretor atende pelo WhatsApp pessoal (sem chip), então "mensagem do corretor" sozinha não basta:
// conta como atendido quem mudou de status, teve tentativa ou interação depois de chegar.
type LeadSinal = V10Lead & { campanha_nome?: string | null; contact_attempts?: number | null };
function atendido(l: LeadSinal) {
  if (l.last_broker_whatsapp_at) return true;
  if (l.status && l.status !== "NEW") return true;
  if ((l.contact_attempts ?? 0) > 0) return true;
  if (l.last_interaction_at && l.created_at &&
      new Date(l.last_interaction_at).getTime() > new Date(l.created_at).getTime() + 5 * 60_000) return true;
  return false;
}
// Parado: cliente respondeu e ninguém voltou, ou chegou há 2h+ sem nenhum sinal de atendimento.
// Pescado não entra: é contato que o próprio corretor puxou para ligar.
function parado(l: LeadSinal) {
  if (classificarOrigem(l) === "pescado") return false;
  const resp = horas(l.last_lead_response_at);
  if (Number.isFinite(resp) && resp > 2 && resp < 48) {
    const depois = Math.min(horas(l.last_broker_whatsapp_at), horas(l.last_interaction_at));
    if (depois > resp) return true;
  }
  return !atendido(l) && horas(l.created_at) > 2;
}

const brl = (n: number) =>
  (n < 0 ? "-" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

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
  if (cat === "pescado") return { cat, label: "🎣 Pescado · " + (lead.source === "cold_pool" ? "Cold Pool Cury" : lead.fb_campaign || "Carteira Cury") };
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
      const vendasB = cruz?.porProfile.get(b.id)?.vendas ??
        meusLeads.filter((l) => l.status === "CONCLUDED").length;

      // custo só do lead pago (anúncio), ao CPL real das contas do gerente; pescado/carteira não custa
      const pagos = meusLeads.filter((l) => classificarOrigem(l) === "anuncio").length;
      const custo = pagos * (midia?.cpl ?? v10.dinheiro.custoLead);
      const retorno = vendasB * v10.dinheiro.comissaoCorretor;
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

  // Indicadores do Placar Hero
  const heroPlacar = useMemo(() => {
    if (!v10) return { vendas: 0, meta: 15, vgv: 0, projecao: 0, porDia: 0, leadsPeriodo: 0, leadsParados: 0 };
    const vendas = (cruz?.porProfile.values() ? [...cruz.porProfile.values()].reduce((a, c) => a + c.vendas, 0) : null) ??
      (v10.vendasMes + v10.vendasSecretaria);
    const meta = v10.metaMes || 15;
    const vgv = vendas * v10.dinheiro.ticket;
    const hoje = new Date();
    const diaMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const restantes = diasUteisRestantes(hoje);
    const projecao = diaMes > 0 ? Math.round((vendas / diaMes) * diasNoMes) : 0;
    const faltam = Math.max(0, meta - vendas);
    const porDia = restantes > 0 ? (faltam / restantes).toFixed(1) : "0";

    const leadsPeriodo = leadsFiltradosPorData.length;
    const leadsParados = leadsFiltradosPorData.filter((l) => parado(l as LeadSinal)).length;

    return { vendas, meta, vgv, projecao, porDia, leadsPeriodo, leadsParados };
  }, [v10, cruz, leadsFiltradosPorData]);

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
      // Fallback para abrir WhatsApp direto
      const msg = `Fala ${nomeCorretor}, o cliente ${nomeCliente} está sem atendimento há mais de 2 horas. Consegue dar retorno agora ou prefere que eu passe para outro corretor da roleta?`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
      toast.info(`Link de cobrança aberto via WhatsApp para ${nomeCorretor}.`);
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
      <header className="cockpit-v3-header">
        <div className="cockpit-v3-title">
          <h1>Cockpit de Vendas da Equipe</h1>
          <p>Visão tática em tempo real · Metas, leads recebidos e controle da tropa</p>
        </div>

        <SeletorPeriodo />
      </header>

      {/* ── ALERTA DE RISCO FINANCEIRO: RESPOSTAS DE DISPAROS NO VÁCUO (>30MIN) ── */}
      <AlertaDisparoQueima managerId={managerId} quem={quem} />

      {/* ── BLOCO 1: PLACAR HERO DO MÊS (JUNIX) ── */}
      <section className="hero-placar-v3">
        {/* Vendas do Mês */}
        <div className="kpi-card-v3 destaque">
          <span className="kpi-title-v3">Vendas Confirmadas (Junix)</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: "var(--cv-brand)" }}>{heroPlacar.vendas}</span>
            <span style={{ fontSize: 18, color: "var(--cv-text-muted)", fontWeight: 500 }}>
              / {heroPlacar.meta} un
            </span>
          </div>
          <div className="progress-bar-wrap-v3">
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${Math.min(100, Math.round((heroPlacar.vendas / (heroPlacar.meta || 1)) * 100))}%` }}
            />
          </div>
          <span className="kpi-sub-v3">
            VGV Total: <b className="mono" style={{ color: "var(--cv-text-main)" }}>{brl(heroPlacar.vgv)}</b>
          </span>
        </div>

        {/* Plantão de hoje (C2S): quantos bateram ponto, quantos têm conta no Comandra.
            É sempre do dia, não segue o período escolhido: é o controle de quem está no estande agora. */}
        {(() => {
          const noPlantao = plantaoHoje?.nomes.size ?? 0;
          const comConta = corretores.filter((c) => c.plantao).length;
          const semConta = Math.max(0, noPlantao - comConta);
          const ult = plantaoHoje?.ultimo ? new Date(plantaoHoje.ultimo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
          return (
            <div className="kpi-card-v3">
              <span className="kpi-title-v3">Plantão hoje (C2S)</span>
              <div className="kpi-val-v3 mono">
                <span style={{ color: "var(--cv-text-main)" }}>{noPlantao}</span>
                <span style={{ fontSize: 14, color: "var(--cv-text-muted)", fontWeight: 500 }}>
                  {noPlantao === 1 ? "check-in" : "check-ins"} · {corretores.length} no time
                </span>
              </div>
              <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
                <b>{comConta} com conta no Comandra</b>
                {semConta ? <> · <span style={{ color: "var(--cv-amber)", fontWeight: 700 }}>{semConta} sem conta</span></> : null}
                {ult ? <> · último às {ult}</> : noPlantao === 0 ? <> · ninguém bateu ponto ainda</> : null}
              </span>
            </div>
          );
        })()}

        {/* Ritmo e Projeção */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Projeção de Fechamento</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: heroPlacar.projecao >= heroPlacar.meta ? "var(--cv-green)" : "var(--cv-amber)" }}>
              {heroPlacar.projecao}
            </span>
            <span style={{ fontSize: 15, color: "var(--cv-text-muted)", fontWeight: 500 }}>vendas</span>
          </div>
          <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
            Ritmo: <b className="mono">{heroPlacar.porDia} un/dia útil</b>
          </span>
        </div>

        {/* Leads Recebidos no Período Selecionado */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Leads no Período Selecionado</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: "var(--cv-blue)" }}>{heroPlacar.leadsPeriodo}</span>
            <span style={{ fontSize: 14, color: "var(--cv-text-muted)", fontWeight: 500 }}>
              {per.preset === "hoje" || per.preset === "ontem" ? per.rotulo : "no período"}
            </span>
          </div>
          <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
            <b>{heroPlacar.leadsPeriodo - heroPlacar.leadsParados} atendidos</b> ·{" "}
            <span style={{ color: heroPlacar.leadsParados > 0 ? "var(--cv-rose)" : "var(--cv-green)", fontWeight: 700 }}>
              {heroPlacar.leadsParados} parados (+2h)
            </span>
          </span>
        </div>

        {/* Poder de Fogo da Equipe */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Poder de Fogo (Mídia)</span>
          {midia ? (() => {
            // dia a dia só existe para os últimos dias; semana e mês usam os 7 dias do robô
            const doDia = umDia ? midia.porDia[per.de] : undefined;
            const porDiaOk = umDia;
            const valor = porDiaOk ? doDia : midia.gasto7;
            return <>
              <div className="kpi-val-v3 mono" style={{ fontSize: 24, color: "var(--cv-text-main)" }}>
                {valor != null ? brl(valor) : "—"}
              </div>
              <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
                {porDiaOk ? (valor != null ? "gasto real no dia" : "sem gasto registrado nesse dia") : "gasto real nos últimos 7 dias"}
                {midia.cpl ? <> · CPL 7 dias: <b className="mono">{brl(midia.cpl)}</b></> : null}
              </span>
            </>;
          })() : <>
            <div className="kpi-val-v3 mono" style={{ fontSize: 24, color: "var(--cv-text-main)" }}>
              {brl(heroPlacar.leadsPeriodo * (v10?.dinheiro?.custoLead ?? 25))}
            </div>
            <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
              sem conta de anúncio ligada · estimado a R$ {Math.round(v10?.dinheiro?.custoLead ?? 25)}/lead
            </span>
          </>}
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
                                style={{ fontSize: 10 }}
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
                          {!c.online && !c.plantao && <span className="mini-badge-v3 offline">offline</span>}
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
