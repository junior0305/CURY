/* Sala de Guerra Estratégica: Planejamento de Campanha com os Superintendentes.
 * Recursos:
 *   - Configuração de verba total e meta de vendas;
 *   - Campanha de Incentivo Oficial com Premiações da Tropa (publicação de banners nos dashboards dos corretores, gerentes e supers);
 *   - Seletor de Equipes (Superintendências e suas tropas);
 *   - Cardápio de Ações Táticas com alocação detalhada por SUPER $\to$ GERENTE $\to$ CORRETOR;
 *   - Escolha de Produto (Estoque Junix ou digitação de lançamento não cadastrado no sistema) e Região/Praça;
 *   - Inteligência Preditiva Comandra com ROI e Engenharia Reversa ("Como chegar em XX vendas?");
 *   - Fechamento formal de acordo e envio no WhatsApp de cada Super.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SuperDiretoria } from "@/hooks/useDiretoria";
import { usePlanoAcoes, useEstoque } from "@/hooks/usePlano";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const inicioMes = (desloc = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
};
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });

export interface AcaoTat {
  key: "anuncio" | "rua" | "pap" | "oferta_ativa" | "premios";
  nome: string;
  icone: string;
  descricao: string;
  comoMede: string;
  defaultVal: number;
}

export interface RegraPremio {
  id: string;
  premio: string; // ex: "PIX de R$ 500", "iPhone 16 Pro", "Notebook Dell"
  gatilho: "venda_geral" | "produto_especifico" | "meta_equipe" | "sorteio";
  produto?: string;
  publico: "BROKER" | "MANAGER" | "TODOS";
}

export interface DetalheSuperCanal {
  valor: number;
  produto: string;
  outroProduto?: string;
  regiao: string;
  gerentes?: Record<string, number>;
}

const REGIOES_PADRAO = [
  "Todas as Regiões",
  "Zona Leste",
  "Zona Sul",
  "Zona Norte",
  "Zona Oeste",
  "Centro",
  "Grande SP / ABCD",
  "Baixada Santista",
  "Campinas / Interior",
];

const ACOES_CATALOGO: AcaoTat[] = [
  {
    key: "anuncio",
    nome: "Anúncios Digitais (Meta Ads)",
    icone: "📢",
    descricao: "Tráfego pago no Facebook e Instagram direcionado aos produtos foco.",
    comoMede: "CPL médio de ~R$ 28 · Conversão estimada de 2.2% em vendas.",
    defaultVal: 12000,
  },
  {
    key: "rua",
    nome: "Ações de Rua & Tenda / Blitz",
    icone: "🎪",
    descricao: "Tendas em pontos de fluxo, promotores, panfletagem e lanche de apoio.",
    comoMede: "Custo de ~R$ 500/dia de blitz · ~6 visitas diretas no estande por dia.",
    defaultVal: 5000,
  },
  {
    key: "pap",
    nome: "PAP & Parcerias Comerciais",
    icone: "🚪",
    descricao: "Porta a porta em empresas locais, comércios e polos de emprego da região.",
    comoMede: "Gera pastas diretas (~R$ 400 por pasta montada) · 40% de conversão.",
    defaultVal: 3000,
  },
  {
    key: "oferta_ativa",
    nome: "Oferta Ativa & Carteira Fria",
    icone: "📞",
    descricao: "Disparos WhatsApp, reativação de base antiga e roleta de clientes dormentes.",
    comoMede: "Ferramenta de disparo e chips · ~1 venda direta a cada R$ 650 investidos.",
    defaultVal: 2000,
  },
  {
    key: "premios",
    nome: "Prêmios & Incentivos da Tropa",
    icone: "🏆",
    descricao: "Premiação por pasta aprovada na Caixa e prêmio para o corretor campeão.",
    comoMede: "Aumenta a ativação da equipe em até +30%, destravando corretores ociosos.",
    defaultVal: 4000,
  },
];

export default function SalaDeGuerraCampanha({
  diretorId,
  supers,
  onSalvo,
}: {
  diretorId: string;
  supers: SuperDiretoria[];
  onSalvo?: () => void;
}) {
  const { criarPlano, criarAcao, criarGasto } = usePlanoAcoes();
  const { data: estoque = [] } = useEstoque();

  const mesAtual = inicioMes();
  const [mes, setMes] = useState(mesAtual);

  const [titulo, setTitulo] = useState(`Campanha de Incentivo · ${nomeMes(mesAtual)}`);
  const [verbaTotal, setVerbaTotal] = useState(26000);
  const [metaVendas, setMetaVendas] = useState(40);
  const [ticketMedio, setTicketMedio] = useState(250000);

  // Premiações e Sorteios da Campanha
  const [regrasPremios, setRegrasPremios] = useState<RegraPremio[]>([
    {
      id: "1",
      premio: "PIX de R$ 500 por pasta aprovada na Caixa",
      gatilho: "venda_geral",
      publico: "BROKER",
    },
    {
      id: "2",
      premio: "iPhone 16 Pro para o Corretor Campeão de Vendas",
      gatilho: "meta_equipe",
      publico: "BROKER",
    },
  ]);
  const [publicarBanner, setPublicarBanner] = useState(true);

  // Seleção de Superintendências participantes
  const [supersSelecionados, setSupersSelecionados] = useState<Set<string>>(
    () => new Set(supers.map((s) => s.id))
  );

  const toggleSuper = (id: string) => {
    setSupersSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
        else toast.info("Pelo menos uma superintendência deve estar na campanha.");
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Alocação da verba nas 5 ações
  const [alocacoes, setAlocacoes] = useState<Record<string, number>>({
    anuncio: 12000,
    rua: 5000,
    pap: 3000,
    oferta_ativa: 2000,
    premios: 4000,
  });

  const setAloc = (k: string, val: number) => {
    setAlocacoes((prev) => ({ ...prev, [k]: Math.max(0, val) }));
  };

  // Detalhamento de cada canal por Super -> Gerente
  const [detalhesPorCanal, setDetalhesPorCanal] = useState<
    Record<string, Record<string, DetalheSuperCanal>>
  >({});
  const [canalAbertoDetalhes, setCanalAbertoDetalhes] = useState<string | null>("anuncio");

  // Equipes ativas e total de corretores
  const equipesAtivas = useMemo(
    () => supers.filter((s) => supersSelecionados.has(s.id)),
    [supers, supersSelecionados]
  );

  const totalCorretoresAtivos = useMemo(
    () => equipesAtivas.reduce((acc, s) => acc + s.gerentes.flatMap((g) => g.corretores_lista).length, 0),
    [equipesAtivas]
  );

  // Atualizar detalhe de um Super em um canal
  const atualizarDetalheSuper = (
    canalKey: string,
    superId: string,
    patch: Partial<DetalheSuperCanal>
  ) => {
    setDetalhesPorCanal((prev) => {
      const canalData = prev[canalKey] || {};
      const superData = canalData[superId] || {
        valor: Math.round((alocacoes[canalKey] || 0) / Math.max(1, equipesAtivas.length)),
        produto: "",
        regiao: "Todas as Regiões",
        gerentes: {},
      };
      return {
        ...prev,
        [canalKey]: {
          ...canalData,
          [superId]: { ...superData, ...patch },
        },
      };
    });
  };

  // Distribuir proporcionalmente a verba de um canal entre os supers
  const distribuirCanalProporcional = (canalKey: string) => {
    const valCanal = alocacoes[canalKey] || 0;
    if (valCanal <= 0 || totalCorretoresAtivos <= 0) return;

    setDetalhesPorCanal((prev) => {
      const canalData = { ...(prev[canalKey] || {}) };
      for (const s of equipesAtivas) {
        const corrSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;
        const prop = corrSuper / totalCorretoresAtivos;
        const valorSuper = Math.round((valCanal * prop) / 100) * 100;
        canalData[s.id] = {
          ...(canalData[s.id] || { produto: "", regiao: "Todas as Regiões", gerentes: {} }),
          valor: valorSuper,
        };
      }
      return { ...prev, [canalKey]: canalData };
    });
    toast.success(`Verba de ${brl(valCanal)} distribuída proporcionalmente entre os ${equipesAtivas.length} Supers!`);
  };

  // Cálculos matemáticos de ROI & Projeção
  const totalAlocado = useMemo(
    () => Object.values(alocacoes).reduce((a, b) => a + b, 0),
    [alocacoes]
  );
  const saldoVerba = verbaTotal - totalAlocado;

  const projecoes = useMemo(() => {
    const aAnuncio = alocacoes.anuncio || 0;
    const aRua = alocacoes.rua || 0;
    const aPap = alocacoes.pap || 0;
    const aAtiva = alocacoes.oferta_ativa || 0;
    const aPremios = alocacoes.premios || 0;

    const leadsAnuncio = Math.round(aAnuncio / 28);
    const vendasAnuncio = Math.round(leadsAnuncio * 0.022 * 10) / 10;

    const diasRua = Math.round(aRua / 500);
    const visitasRua = diasRua * 6;
    const vendasRua = Math.round(visitasRua * 0.12 * 10) / 10;

    const pastasPap = Math.round(aPap / 400);
    const vendasPap = Math.round(pastasPap * 0.40 * 10) / 10;

    const vendasAtiva = Math.round((aAtiva / 650) * 10) / 10;

    const bonusPremios = aPremios > 0 ? Math.min(0.30, aPremios / 15000) : 0;

    const vendasBase = vendasAnuncio + vendasRua + vendasPap + vendasAtiva;
    const vendasTotais = Math.round(vendasBase * (1 + bonusPremios));
    const vgvProjetado = vendasTotais * ticketMedio;
    const custoPorVenda = vendasTotais > 0 ? Math.round(totalAlocado / vendasTotais) : 0;

    return {
      leadsAnuncio,
      vendasAnuncio,
      visitasRua,
      vendasRua,
      pastasPap,
      vendasPap,
      vendasAtiva,
      bonusPremios,
      vendasTotais,
      vgvProjetado,
      custoPorVenda,
    };
  }, [alocacoes, totalAlocado, ticketMedio]);

  // Simulador de Meta Alvo da IA ("Como chegar em XX vendas?")
  const [metaAlvoSimulacao, setMetaAlvoSimulacao] = useState(50);
  const [mostrarSimulador, setMostrarSimulador] = useState(false);

  const sugestaoIA = useMemo(() => {
    const alvo = Math.max(1, metaAlvoSimulacao);
    const custoVendaMedio = 680;
    const verbaSugeridaTotal = Math.round((alvo * custoVendaMedio) / 500) * 500;

    const sAnuncio = Math.round((verbaSugeridaTotal * 0.45) / 500) * 500;
    const sRua = Math.round((verbaSugeridaTotal * 0.20) / 500) * 500;
    const sPap = Math.round((verbaSugeridaTotal * 0.12) / 500) * 500;
    const sAtiva = Math.round((verbaSugeridaTotal * 0.08) / 500) * 500;
    const sPremios = Math.max(1000, verbaSugeridaTotal - (sAnuncio + sRua + sPap + sAtiva));

    const leadsEst = Math.round(sAnuncio / 28);
    const visitasEst = Math.round((sRua / 500) * 6);
    const pastasEst = Math.round(sPap / 400);
    const bonusTropa = Math.round(Math.min(0.30, sPremios / 15000) * 100);
    const corretoresMinimos = Math.max(12, Math.ceil(alvo / 1.4));

    return {
      alvo,
      verbaSugeridaTotal,
      alocacoes: {
        anuncio: sAnuncio,
        rua: sRua,
        pap: sPap,
        oferta_ativa: sAtiva,
        premios: sPremios,
      },
      leadsEst,
      visitasEst,
      pastasEst,
      bonusTropa,
      corretoresMinimos,
      vgvEstimado: alvo * ticketMedio,
      custoPorVenda: Math.round(verbaSugeridaTotal / alvo),
    };
  }, [metaAlvoSimulacao, ticketMedio]);

  const aplicarSugestaoIA = () => {
    setVerbaTotal(sugestaoIA.verbaSugeridaTotal);
    setMetaVendas(sugestaoIA.alvo);
    setAlocacoes(sugestaoIA.alocacoes);
    toast.success(`Mix recomendado pela IA para atingir ${sugestaoIA.alvo} vendas aplicado no orçamento!`);
  };

  // Gerenciamento de Premiações
  const adicionarPremio = () => {
    setRegrasPremios((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        premio: "Notebook Dell / Celular para a equipe destaque",
        gatilho: "meta_equipe",
        publico: "BROKER",
      },
    ]);
  };

  const atualizarPremio = (id: string, patch: Partial<RegraPremio>) => {
    setRegrasPremios((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removerPremio = (id: string) => {
    setRegrasPremios((prev) => prev.filter((r) => r.id !== id));
  };

  // Modal de WhatsApp
  const [modalWpp, setModalWpp] = useState<{
    superNome: string;
    telefone: string | null;
    mensagem: string;
  } | null>(null);

  const [salvando, setSalvando] = useState(false);

  // Salvar a campanha no sistema (nas tabelas de planos, ações, gastos e avisos)
  async function salvarCampanha() {
    if (!titulo.trim()) {
      toast.error("Informe um título para a campanha.");
      return;
    }
    setSalvando(true);
    try {
      // 1. Criar o Plano no Supabase
      const { data: planoData, error: planoErr } = await supabase
        .from("planos" as any)
        .insert({
          dono_id: diretorId,
          mes,
          titulo,
          foco: "geral",
          objetivo: `Ofensiva com ${equipesAtivas.length} superintendências. Verba total de ${brl(verbaTotal)}. Premiações cadastradas: ${regrasPremios.map((r) => r.premio).join("; ")}`,
          meta_vendas: metaVendas,
          prioridade: 1,
          status: "ativo",
        })
        .select("id")
        .single();

      if (planoErr) throw planoErr;
      const planoId = (planoData as any).id;

      // 2. Criar as ações táticas vinculadas
      for (const a of ACOES_CATALOGO) {
        const valor = alocacoes[a.key] || 0;
        if (valor > 0) {
          // Detalhes dos supers neste canal
          const detCanal = detalhesPorCanal[a.key] || {};
          const detalhesTexto = Object.entries(detCanal)
            .map(([supId, d]) => {
              const s = supers.find((x) => x.id === supId);
              const prod = d.outroProduto || d.produto || "Geral";
              return `${s?.nome?.split(" ")[0] ?? "Super"}: ${brl(d.valor)} (${prod} - ${d.regiao})`;
            })
            .join(" | ");

          await supabase.from("plano_acoes" as any).insert({
            plano_id: planoId,
            titulo: `${a.nome}: investimento de ${brl(valor)}`,
            entregavel: a.comoMede,
            custo_previsto: valor,
            status: "a_fazer",
            nota: detalhesTexto || `Equipes envolvidas: ${equipesAtivas.map((s) => s.nome).join(", ")}`,
          });

          // Registrar em gastos planejados
          await supabase.from("gastos" as any).insert({
            dono_id: diretorId,
            mes,
            descricao: `Campanha: ${titulo} · ${a.nome}`,
            planejado: valor,
            realizado: 0,
          });
        }
      }

      // 3. Publicar banner de incentivo nos dashboards de corretores, gerentes e supers
      if (publicarBanner && regrasPremios.length > 0) {
        const corpoPremio = regrasPremios
          .map(
            (r, i) =>
              `${i + 1}. 🎁 *${r.premio}*\n   • Condição: ${
                r.gatilho === "produto_especifico"
                  ? `Venda no produto ${r.produto || "foco"}`
                  : r.gatilho === "meta_equipe"
                  ? "Ao atingir a meta estipulada da equipe"
                  : r.gatilho === "sorteio"
                  ? "Sorteio entre corretores com vendas"
                  : "Por venda confirmada"
              } (${r.publico === "BROKER" ? "Exclusivo Corretores" : r.publico === "MANAGER" ? "Exclusivo Gerentes" : "Toda a Tropa"})`
          )
          .join("\n\n");

        await supabase.from("announcements").insert({
          title: `🏆 Campanha de Incentivo: ${titulo}`,
          body: `🔥 *Atenção Tropa de Vendas!* Campanha Oficial da Diretoria Comercial para ${nomeMes(mes)}!\n\n🎯 *Meta Geral:* ${metaVendas} vendas\n💰 *Investimento em Ações:* ${brl(verbaTotal)}\n\n*Regras de Premiação & Sorteios:*\n${corpoPremio}\n\nFale com seu Gerente, monte suas pastas no Junix e acelere!`,
          category: "evento",
          emoji: "🏆",
          target_role: ["BROKER", "MANAGER", "SUPERINTENDENT"],
          pinned: true,
        });
      }

      toast.success("Campanha gravada com sucesso e banner publicado nos dashboards da tropa!");
      if (onSalvo) onSalvo();
    } catch (err: any) {
      toast.error("Erro ao salvar campanha: " + err.message);
    } finally {
      setSalvando(false);
    }
  }

  function gerarMensagemSuper(s: SuperDiretoria) {
    const corretoresSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;
    const proporcao = totalCorretoresAtivos > 0 ? corretoresSuper / totalCorretoresAtivos : 1 / equipesAtivas.length;
    const metaSuper = Math.round(metaVendas * proporcao);
    const verbaSuper = Math.round(totalAlocado * proporcao);

    const linhasCanais = ACOES_CATALOGO.map((a) => {
      const det = detalhesPorCanal[a.key]?.[s.id];
      const val = det?.valor ?? Math.round((alocacoes[a.key] || 0) * proporcao);
      if (val <= 0) return null;
      let extra = "";
      const prod = det?.outroProduto || det?.produto;
      if (prod) extra += ` [Produto: ${prod}]`;
      if (det?.regiao && det.regiao !== "Todas as Regiões") extra += ` [Praça: ${det.regiao}]`;
      return `• ${a.nome}: ${brl(val)}${extra}`;
    })
      .filter(Boolean)
      .join("\n");

    const linhasPremios = regrasPremios
      .map((r) => `🎁 *${r.premio}* (${r.gatilho === "produto_especifico" ? `Produto: ${r.produto}` : r.gatilho === "meta_equipe" ? "Ao bater meta" : r.gatilho === "sorteio" ? "Sorteio geral" : "Por venda confirmada"})`)
      .join("\n");

    return `Fala ${s.nome.split(" ")[0]}, alinhamento fechado da nossa Reunião Estratégica:

🎯 *Campanha de Incentivo:* ${titulo}
📅 *Período:* ${nomeMes(mes)}
💰 *Verba Alocada para sua equipe:* ${brl(verbaSuper)}
🏁 *Sua Meta de Vendas:* ${metaSuper} unidades
👥 *Sua Tropa:* ${corretoresSuper} corretores escalados

📌 *Frentes de Ação e Verba da sua Superintendência:*
${linhasCanais || "• Alocação distribuída nas 5 frentes táticas"}

🏆 *Premiações da Tropa Cadastradas:*
${linhasPremios || "• Bônus por meta e pasta aprovada na Caixa"}

Vamos para cima! Repasse aos seus gerentes e corretores para acelerar desde hoje.`;
  }

  return (
    <div className="dir-card sdg-container">
      {/* ── CABEÇALHO DA SALA DE GUERRA ── */}
      <div className="sdg-hd">
        <div className="sdg-hd-info">
          <span className="dir-chip c-blue" style={{ marginBottom: 6 }}>
            ⚔️ Sala de Guerra & Planejamento Tático
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "2px 0 6px", color: "var(--ink)" }}>
            Montar Plano Estratégico com os Superintendentes
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: 0 }}>
            Defina o investimento, hierarquize a verba por Super e Gerente, configure a campanha de premiação da tropa e calcule o retorno esperado.
          </p>
        </div>

        <div className="sdg-hd-ctrl">
          <div className="dir-per">
            <button className={mes === mesAtual ? "on" : ""} onClick={() => setMes(mesAtual)}>
              Mês Presente ({nomeMes(mesAtual)})
            </button>
            <button className={mes === inicioMes(1) ? "on" : ""} onClick={() => setMes(inicioMes(1))}>
              Próximo Mês ({nomeMes(inicioMes(1))})
            </button>
          </div>
        </div>
      </div>

      {/* ── 1. CONFIGURAÇÃO DE INVESTIMENTO & CAMPANHA DE INCENTIVO COM PREMIAÇÃO ── */}
      <div className="sdg-grid-config">
        <div className="sdg-box" style={{ gridColumn: "span 2" }}>
          <label className="dir-lbl">Nome da Ofensiva / Campanha de Incentivo da Tropa</label>
          <input
            type="text"
            className="sdg-input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Campanha Aceleração Caixa · Lançamentos e Estoque"
          />
        </div>

        <div className="sdg-box">
          <label className="dir-lbl">Meta Geral de Vendas</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={1}
              className="sdg-input mono"
              value={metaVendas}
              onChange={(e) => setMetaVendas(Number(e.target.value))}
            />
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              VGV ~ <b>{brl(metaVendas * ticketMedio)}</b>
            </span>
          </div>
        </div>

        <div className="sdg-box" style={{ gridColumn: "span 3" }}>
          <label className="dir-lbl">Verba Total Disponível para a Operação (R$)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              type="number"
              step={1000}
              className="sdg-input mono"
              style={{ maxWidth: 200 }}
              value={verbaTotal}
              onChange={(e) => setVerbaTotal(Number(e.target.value))}
            />
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--teal)" }}>
              {brl(verbaTotal)}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Esta verba é distribuída nas 5 frentes táticas abaixo e rateada entre as Superintendências.
            </span>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO DE PREMIAÇÕES & SORTEIOS DA TROPA (BANNERS NOS DASHBOARDS) ── */}
      <div className="sdg-box" style={{ background: "#F8FAFC", border: "1.5px solid #CBD5E1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="dir-lbl" style={{ color: "#D97706" }}>Premiação da Tropa (Aparece no Dashboard dos Corretores e Gerentes)</span>
            <h4 style={{ fontSize: 15, fontWeight: 800, margin: "2px 0 0", color: "var(--ink)" }}>
              🏆 O que vai premiar ou sortear nesta campanha?
            </h4>
          </div>
          <button
            type="button"
            className="dir-btn"
            style={{ fontSize: 12, padding: "5px 10px", borderColor: "var(--teal)", color: "var(--teal)" }}
            onClick={adicionarPremio}
          >
            + Adicionar Premiação / Sorteio
          </button>
        </div>

        {/* Lista de Prêmios */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {regrasPremios.map((r, idx) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 140px auto",
                gap: 8,
                alignItems: "center",
                background: "#fff",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>🎁</span>
                <input
                  type="text"
                  className="sdg-input"
                  style={{ fontSize: 13 }}
                  value={r.premio}
                  onChange={(e) => atualizarPremio(r.id, { premio: e.target.value })}
                  placeholder="Ex: PIX de R$ 500, iPhone 16 Pro, Notebook Dell..."
                />
              </div>

              <select
                className="sdg-input"
                style={{ fontSize: 12.5 }}
                value={r.gatilho}
                onChange={(e) => atualizarPremio(r.id, { gatilho: e.target.value as any })}
              >
                <option value="venda_geral">Por cada venda confirmada</option>
                <option value="produto_especifico">Por venda em produto específico</option>
                <option value="meta_equipe">Ao bater a meta da equipe</option>
                <option value="sorteio">Sorteio da Tropa</option>
              </select>

              <select
                className="sdg-input"
                style={{ fontSize: 12.5 }}
                value={r.publico}
                onChange={(e) => atualizarPremio(r.id, { publico: e.target.value as any })}
              >
                <option value="BROKER">Só Corretores</option>
                <option value="MANAGER">Só Gerentes</option>
                <option value="TODOS">Toda a Tropa</option>
              </select>

              <button
                type="button"
                style={{ background: "none", border: 0, color: "var(--red)", cursor: "pointer", fontSize: 13 }}
                onClick={() => removerPremio(r.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: "var(--ink-2)" }}>
          <input
            type="checkbox"
            id="pubBanner"
            checked={publicarBanner}
            onChange={(e) => setPublicarBanner(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--teal)" }}
          />
          <label htmlFor="pubBanner" style={{ cursor: "pointer", fontWeight: 600 }}>
            Publicar automaticamente banner com estas premiações em destaque nos dashboards de todos os Corretores, Gerentes e Supers.
          </label>
        </div>
      </div>

      {/* ── 2. SELEÇÃO DE EQUIPES ENVOLVIDAS ── */}
      <div className="sdg-sec">
        <div className="sdg-sec-title">
          <span>2. Equipes Envolvidas na Ofensiva</span>
          <small>{equipesAtivas.length} de {supers.length} superintendências selecionadas · {totalCorretoresAtivos} corretores na escala</small>
        </div>

        <div className="sdg-supers-grid">
          {supers.map((s) => {
            const ativa = supersSelecionados.has(s.id);
            const corretoresSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;
            const proporcao = totalCorretoresAtivos > 0 && ativa ? corretoresSuper / totalCorretoresAtivos : 0;
            const metaSugerida = Math.round(metaVendas * proporcao);
            const verbaSugerida = Math.round(totalAlocado * proporcao);

            return (
              <div
                key={s.id}
                className={`sdg-super-pill${ativa ? " ativo" : ""}`}
                onClick={() => toggleSuper(s.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ fontSize: 15 }}>{s.nome}</b>
                  <span className={`dir-chip ${ativa ? "c-grn" : "c-gray"}`}>
                    {ativa ? "participa ✓" : "de fora"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  {s.gerentes.length} gerentes · {corretoresSuper} corretores
                </div>
                {ativa && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--line)", fontSize: 11.5, display: "flex", justifyContent: "space-between" }}>
                    <span>Cota Meta: <b>{metaSugerida || "—"} vendas</b></span>
                    <span>Cota Verba: <b>{brl(verbaSugerida)}</b></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. CARDÁPIO DE AÇÕES TÁTICAS (ALOCAÇÃO DETALHADA POR SUPER, GERENTE E PRODUTO) ── */}
      <div className="sdg-sec">
        <div className="sdg-sec-title">
          <span>3. Mix Tático & Alocação por Super / Gerente / Produto</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>Total Alocado: <b className="mono">{brl(totalAlocado)}</b></span>
            <span className={`dir-chip ${saldoVerba === 0 ? "c-grn" : saldoVerba > 0 ? "c-blue" : "c-red"}`}>
              {saldoVerba === 0 ? "100% alocado" : saldoVerba > 0 ? `sobra ${brl(saldoVerba)}` : `estourou ${brl(-saldoVerba)}`}
            </span>
          </div>
        </div>

        <div className="sdg-acoes-list">
          {ACOES_CATALOGO.map((a) => {
            const val = alocacoes[a.key] || 0;
            const pct = verbaTotal > 0 ? Math.round((val / verbaTotal) * 100) : 0;
            const aberto = canalAbertoDetalhes === a.key;

            return (
              <div key={a.key} className="sdg-acao-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                {/* Linha principal da ação */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div className="sdg-acao-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{a.icone}</span>
                      <b style={{ fontSize: 15, color: "var(--ink)" }}>{a.nome}</b>
                      <span className="dir-chip c-gray" style={{ fontSize: 10.5 }}>{pct}% da verba</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "4px 0 0" }}>
                      {a.descricao} <span style={{ color: "var(--teal)", fontWeight: 600 }}>({a.comoMede})</span>
                    </p>
                  </div>

                  <div className="sdg-acao-input-wrap">
                    <span className="mono" style={{ fontSize: 13, color: "var(--ink-3)" }}>R$</span>
                    <input
                      type="number"
                      step={500}
                      min={0}
                      className="sdg-input-valor mono"
                      value={val}
                      onChange={(e) => setAloc(a.key, Number(e.target.value))}
                    />
                    <div className="sdg-preset-btns">
                      {[1000, 3000, 5000, 10000].map((v) => (
                        <button key={v} type="button" onClick={() => setAloc(a.key, v)}>
                          +{v >= 1000 ? `${v / 1000}k` : v}
                        </button>
                      ))}
                      <button type="button" style={{ color: "var(--red)" }} onClick={() => setAloc(a.key, 0)}>
                        zerar
                      </button>
                    </div>

                    <button
                      type="button"
                      className="dir-btn"
                      style={{ fontSize: 12, padding: "5px 10px", borderColor: aberto ? "var(--teal)" : "#CBD5E1", background: aberto ? "#F0FDF4" : "#fff" }}
                      onClick={() => setCanalAbertoDetalhes(aberto ? null : a.key)}
                    >
                      {aberto ? "▲ Recolher Detalhe" : "▼ Detalhar por Super / Produto"}
                    </button>
                  </div>
                </div>

                {/* GAVETA DE DETALHAMENTO POR SUPER, GERENTE, PRODUTO E REGIÃO */}
                {aberto && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--line)", background: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                      <span className="dir-lbl" style={{ color: "var(--navy)" }}>
                        Distribuição de {a.nome} por Superintendência:
                      </span>
                      <button
                        type="button"
                        className="dir-btn"
                        style={{ fontSize: 11.5, padding: "4px 8px", color: "var(--teal)", borderColor: "var(--teal)" }}
                        onClick={() => distribuirCanalProporcional(a.key)}
                      >
                        ⚡ Distribuir Proporcionalmente pelo tamanho da tropa
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {equipesAtivas.map((s) => {
                        const det = detalhesPorCanal[a.key]?.[s.id] || {
                          valor: Math.round(val / Math.max(1, equipesAtivas.length)),
                          produto: "",
                          regiao: "Todas as Regiões",
                          gerentes: {},
                        };
                        const corrSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;

                        return (
                          <div
                            key={s.id}
                            style={{
                              background: "#fff",
                              border: "1px solid var(--line)",
                              borderRadius: 8,
                              padding: 10,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 130px 1.2fr 1.2fr", gap: 10, alignItems: "center" }}>
                              <div>
                                <b style={{ fontSize: 13.5 }}>{s.nome}</b>
                                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                                  {s.gerentes.length} gerentes · {corrSuper} corretores
                                </div>
                              </div>

                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Verba R$</label>
                                <input
                                  type="number"
                                  step={200}
                                  className="sdg-input mono"
                                  style={{ padding: "4px 8px", fontSize: 13 }}
                                  value={det.valor}
                                  onChange={(e) =>
                                    atualizarDetalheSuper(a.key, s.id, { valor: Number(e.target.value) })
                                  }
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Produto Alvo</label>
                                <select
                                  className="sdg-input"
                                  style={{ padding: "4px 8px", fontSize: 12 }}
                                  value={det.produto}
                                  onChange={(e) =>
                                    atualizarDetalheSuper(a.key, s.id, { produto: e.target.value })
                                  }
                                >
                                  <option value="">Geral / Toda a Carteira</option>
                                  <option value="digitar_outro">✏️ Digitar outro produto / lançamento...</option>
                                  {estoque.slice(0, 15).map((e) => (
                                    <option key={e.cod_empreendimento} value={e.empreendimento}>
                                      {e.empreendimento.replace(/^CONDOM[IÍ]NIO\s+/i, "")} ({e.disponiveis} disp.)
                                    </option>
                                  ))}
                                </select>
                                {det.produto === "digitar_outro" && (
                                  <input
                                    type="text"
                                    className="sdg-input"
                                    style={{ marginTop: 4, padding: "4px 8px", fontSize: 12 }}
                                    placeholder="Digite o nome do lançamento..."
                                    value={det.outroProduto || ""}
                                    onChange={(e) =>
                                      atualizarDetalheSuper(a.key, s.id, { outroProduto: e.target.value })
                                    }
                                  />
                                )}
                              </div>

                              <div>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Região / Praça</label>
                                <select
                                  className="sdg-input"
                                  style={{ padding: "4px 8px", fontSize: 12 }}
                                  value={det.regiao}
                                  onChange={(e) =>
                                    atualizarDetalheSuper(a.key, s.id, { regiao: e.target.value })
                                  }
                                >
                                  {REGIOES_PADRAO.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Subdivisão por gerentes daquele Super */}
                            {s.gerentes.length > 0 && (
                              <details style={{ fontSize: 12, borderTop: "1px dashed var(--line)", paddingTop: 6, marginTop: 4 }}>
                                <summary style={{ cursor: "pointer", color: "var(--teal)", fontWeight: 600 }}>
                                  ▾ Distribuir entre os {s.gerentes.length} Gerentes de {s.nome.split(" ")[0]}
                                </summary>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, marginTop: 8 }}>
                                  {s.gerentes.map((g) => (
                                    <div key={g.id} style={{ background: "var(--sunk)", padding: "6px 8px", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <span style={{ fontSize: 12 }}><b>{g.nome}</b> <small style={{ color: "var(--ink-3)" }}>({g.corretores} corr.)</small></span>
                                      <input
                                        type="number"
                                        placeholder="R$"
                                        className="sdg-input mono"
                                        style={{ width: 80, padding: "2px 6px", fontSize: 12 }}
                                        value={det.gerentes?.[g.id] ?? ""}
                                        onChange={(e) => {
                                          const novoVal = Number(e.target.value);
                                          atualizarDetalheSuper(a.key, s.id, {
                                            gerentes: { ...(det.gerentes || {}), [g.id]: novoVal },
                                          });
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. PAINEL PREDITIVO DA IA (RETORNO ESTIMADO & ROI) ── */}
      <div className="sdg-roi-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <span className="dir-lbl" style={{ color: "#9FB3CC" }}>Inteligência Preditiva Comandra</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "4px 0 0" }}>
              Projeção de Retorno do Mix Estratégico
            </h3>
          </div>
          <div className="sdg-roi-chips">
            <span className={`dir-chip ${projecoes.vendasTotais >= metaVendas ? "c-grn" : "c-org"}`}>
              {projecoes.vendasTotais >= metaVendas ? "✓ Mix Sustenta a Meta" : "⚠️ Mix Abaixo da Meta"}
            </span>
          </div>
        </div>

        <div className="sdg-roi-grid">
          <div className="sdg-roi-metric">
            <small>Vendas Projetadas</small>
            <div className="val">{projecoes.vendasTotais} <span style={{ fontSize: 14, fontWeight: 500, color: "#9FB3CC" }}>vendas</span></div>
            <div className="sub">
              {projecoes.vendasAnuncio} anúncio · {projecoes.vendasRua} rua · {projecoes.vendasPap} pap · {projecoes.vendasAtiva} ativa
            </div>
          </div>

          <div className="sdg-roi-metric">
            <small>VGV Estimado</small>
            <div className="val">{brl(projecoes.vgvProjetado)}</div>
            <div className="sub">ticket médio de {brl(ticketMedio)}</div>
          </div>

          <div className="sdg-roi-metric">
            <small>Custo por Venda</small>
            <div className="val">{projecoes.custoPorVenda ? brl(projecoes.custoPorVenda) : "—"}</div>
            <div className="sub">investimento total ÷ vendas projetadas</div>
          </div>

          <div className="sdg-roi-metric">
            <small>Gás de Premiação</small>
            <div className="val" style={{ color: "#34D399" }}>
              +{Math.round(projecoes.bonusPremios * 100)}%
            </div>
            <div className="sub">estímulo direto na ativação da tropa</div>
          </div>
        </div>

        {/* Parecer Estratégico da IA */}
        <div className="sdg-ia-box">
          <b>🧠 Veredito da IA para esta Reunião:</b>
          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "#E2E8F0" }}>
            {projecoes.vendasTotais >= metaVendas ? (
              <>
                O mix de <b>{brl(totalAlocado)}</b> está matematicamente dimensionado para atingir <b>{projecoes.vendasTotais} vendas</b> (superando a meta de {metaVendas}).
                As {equipesAtivas.length} equipes selecionadas somam {totalCorretoresAtivos} corretores, garantindo braço suficiente para atender os ~{projecoes.leadsAnuncio} leads digitais e as ~{projecoes.visitasRua} visitas presenciais.
              </>
            ) : (
              <>
                Atenção: com a configuração atual, o mix projeta <b>{projecoes.vendasTotais} vendas</b>, o que deixa um <b>déficit de {metaVendas - projecoes.vendasTotais} vendas</b> contra a meta de {metaVendas}.
                {alocacoes.premios === 0 ? " Sugestão: adicione verba de premiação para a tropa para acelerar aprovação de crédito na CEF." : " Sugestão: aumente a verba de anúncios digitais ou adicione mais equipes na escala de rua."}
              </>
            )}
          </p>
        </div>

        {/* Simulador Interativo de Meta Alvo ("Quero Chegar em XX Vendas") */}
        <div className="sdg-reversa-box">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className="dir-lbl" style={{ color: "#FBBF24" }}>Simulador de Engenharia Reversa da IA</span>
              <h4 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#fff" }}>
                🎯 E se eu quiser bater uma meta específica? O que a IA sugere?
              </h4>
            </div>
            <button
              type="button"
              className="dir-btn"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                borderColor: "rgba(255, 255, 255, 0.2)",
                fontSize: 12.5,
              }}
              onClick={() => setMostrarSimulador(!mostrarSimulador)}
            >
              {mostrarSimulador ? "Recolher Simulador ▲" : "Simular Meta Alvo (ex: 50, 60 vendas) ▼"}
            </button>
          </div>

          {mostrarSimulador && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#9FB3CC", fontWeight: 600 }}>Quero chegar em:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="sdg-input-valor mono"
                  style={{ background: "#fff", color: "var(--ink)", width: 90 }}
                  value={metaAlvoSimulacao}
                  onChange={(e) => setMetaAlvoSimulacao(Number(e.target.value))}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>vendas</span>
                <div className="sdg-preset-btns">
                  {[35, 45, 50, 60, 75, 100].map((v) => (
                    <button
                      key={v}
                      type="button"
                      style={{
                        background: metaAlvoSimulacao === v ? "var(--teal)" : "rgba(255,255,255,0.1)",
                        color: "#fff",
                        borderColor: "rgba(255,255,255,0.2)",
                      }}
                      onClick={() => setMetaAlvoSimulacao(v)}
                    >
                      {v} un
                    </button>
                  ))}
                </div>
              </div>

              {/* Resultado do Plano Sugerido pela IA */}
              <div className="sdg-reversa-grid">
                <div className="sdg-reversa-card">
                  <small>Verba Total Recomendada</small>
                  <b>{brl(sugestaoIA.verbaSugeridaTotal)}</b>
                  <span>Custo por venda ~{brl(sugestaoIA.custoPorVenda)}</span>
                </div>
                <div className="sdg-reversa-card">
                  <small>Volume Mínimo no Funil</small>
                  <b>~{sugestaoIA.leadsEst} leads · ~{sugestaoIA.visitasEst} visitas</b>
                  <span>exige ~{sugestaoIA.pastasEst} pastas montadas</span>
                </div>
                <div className="sdg-reversa-card">
                  <small>Força de Vendas Exigida</small>
                  <b>{sugestaoIA.corretoresMinimos} corretores ativos</b>
                  <span>bônus de prêmio sugerido: +{sugestaoIA.bonusTropa}%</span>
                </div>
              </div>

              {/* Tabela comparativa do mix sugerido */}
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, color: "#FBBF24", marginBottom: 6 }}>
                  Divisão Recomendada do Orçamento para {sugestaoIA.alvo} Vendas:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  <div>📢 Anúncios: <b>{brl(sugestaoIA.alocacoes.anuncio)}</b></div>
                  <div>🎪 Rua & Tenda: <b>{brl(sugestaoIA.alocacoes.rua)}</b></div>
                  <div>🚪 PAP: <b>{brl(sugestaoIA.alocacoes.pap)}</b></div>
                  <div>📞 Oferta Ativa: <b>{brl(sugestaoIA.alocacoes.oferta_ativa)}</b></div>
                  <div>🏆 Prêmios Tropa: <b>{brl(sugestaoIA.alocacoes.premios)}</b></div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#9FB3CC" }}>
                  Aplica a meta de {sugestaoIA.alvo} vendas e recalcula todo o orçamento da Sala de Guerra:
                </span>
                <button
                  type="button"
                  className="dir-btn"
                  style={{
                    background: "#F59E0B",
                    color: "#0F1B2D",
                    fontWeight: 800,
                    border: 0,
                    padding: "8px 16px",
                  }}
                  onClick={aplicarSugestaoIA}
                >
                  ✨ Aplicar Sugestão da IA no Orçamento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. BOTÕES DE FECHAMENTO & DISPARO PARA OS SUPERS ── */}
      <div className="sdg-footer">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>
            Disparar Termo de Acordo no WhatsApp:
          </span>
          {equipesAtivas.map((s) => (
            <button
              key={s.id}
              className="dir-btn"
              style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() =>
                setModalWpp({
                  superNome: s.nome,
                  telefone: s.phone ?? null,
                  mensagem: gerarMensagemSuper(s),
                })
              }
            >
              📱 Enviar para {s.nome.split(" ")[0]}
            </button>
          ))}
        </div>

        <button
          className="dir-btn solid"
          style={{ padding: "10px 20px", fontSize: 14, minHeight: 42 }}
          disabled={salvando}
          onClick={salvarCampanha}
        >
          {salvando ? "Gravando no Sistema…" : "💾 Salvar Campanha & Disparar Premiação"}
        </button>
      </div>

      {/* MODAL DE ENVIO DO ACORDO VIA WHATSAPP */}
      {modalWpp && (
        <div className="dir-modal-backdrop" onClick={() => setModalWpp(null)}>
          <div className="dir-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="dir-lbl">Termo de Acordo da Reunião</span>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0", color: "var(--ink)" }}>
                  Enviar para {modalWpp.superNome}
                </h3>
              </div>
              <button
                onClick={() => setModalWpp(null)}
                style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer", color: "var(--ink-3)" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>
                Mensagem WhatsApp (editável antes de abrir)
              </label>
              <textarea
                rows={10}
                value={modalWpp.mensagem}
                onChange={(e) => setModalWpp({ ...modalWpp, mensagem: e.target.value })}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: 1.4,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button className="dir-btn" onClick={() => setModalWpp(null)}>Cancelar</button>
              <button
                className="dir-btn-wpp"
                onClick={() => {
                  if (modalWpp.telefone) {
                    const cleanPhone = modalWpp.telefone.replace(/\D/g, "");
                    const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                    const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(modalWpp.mensagem)}`;
                    window.open(url, "_blank");
                    toast.success(`WhatsApp de ${modalWpp.superNome} aberto com o acordo!`);
                  } else {
                    navigator.clipboard.writeText(modalWpp.mensagem);
                    toast.info(`${modalWpp.superNome} não tem telefone cadastrado. Mensagem copiada para a área de transferência!`);
                  }
                  setModalWpp(null);
                }}
              >
                <span>📱 Abrir no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
