/* Sala de Guerra Estratégica: Planejamento de Reunião & Verba com os Superintendentes.
 *
 * Arquitetura Comercial:
 *   1. Placar de Metas da Reunião (Ritmo, Projeção, Devedores e edição inline) no topo;
 *   2. Campanha de Incentivo Oficial com Premiações da Tropa (banners nos dashboards);
 *   3. Alocação de Verba por Superintendente & Cesta de Produtos (Lançamentos Futuros e Estoques Junix);
 *   4. Inteligência Preditiva Comandra com Viabilidade da Meta Oficial ("É possível chegar nessa meta?") e Engenharia Reversa;
 *   5. Fechamento formal de acordo e envio no WhatsApp de cada Superintendente.
 *
 * Todas as metas sincronizadas com o banco de dados (metas_painel / definir_meta)
 * e refletem diretamente no dashboard dos Superintendentes para derramarem aos gerentes.
 */
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SuperDiretoria } from "@/hooks/useDiretoria";
import { usePlanoAcoes, useEstoque } from "@/hooks/usePlano";
import type { LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import PlacarMetas, { MetaPainel, Combinar } from "./PlacarMetas";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const inicioMes = (desloc = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
};
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });

export interface ItemVerbaSuper {
  id: string;
  tipo: "lancamento" | "estoque";
  produto: string; // Nome do empreendimento Junix ou digitado livremente
  canal: "anuncio" | "rua" | "pap" | "oferta_ativa" | "premios";
  gerenteId?: string; // ID do gerente ou "" (toda a equipe do super)
  valor: number;
}

export interface RegraPremio {
  id: string;
  premio: string; // ex: "PIX de R$ 500", "iPhone 16 Pro", "Notebook Dell"
  gatilho: "venda_geral" | "produto_especifico" | "meta_equipe" | "sorteio";
  produto?: string;
  publico: "BROKER" | "MANAGER" | "TODOS";
}

export interface AcaoTat {
  key: "anuncio" | "rua" | "pap" | "oferta_ativa" | "premios";
  nome: string;
  icone: string;
  descricao: string;
  comoMede: string;
}

const ACOES_CATALOGO: AcaoTat[] = [
  {
    key: "anuncio",
    nome: "Anúncios Digitais (Meta Ads)",
    icone: "📢",
    descricao: "Tráfego pago no Facebook e Instagram direcionado aos produtos foco.",
    comoMede: "CPL médio de ~R$ 28 · Conversão estimada de 2.2% em vendas.",
  },
  {
    key: "rua",
    nome: "Ações de Rua & Tenda / Blitz",
    icone: "🎪",
    descricao: "Tendas em pontos de fluxo, promotores, panfletagem e lanche de apoio.",
    comoMede: "Custo de ~R$ 500/dia de blitz · ~6 visitas diretas no estande por dia.",
  },
  {
    key: "pap",
    nome: "PAP & Parcerias Comerciais",
    icone: "🚪",
    descricao: "Porta a porta em empresas locais, comércios e polos de emprego da região.",
    comoMede: "Gera pastas diretas (~R$ 400 por pasta montada) · 40% de conversão.",
  },
  {
    key: "oferta_ativa",
    nome: "Oferta Ativa & Carteira Fria",
    icone: "📞",
    descricao: "Disparos WhatsApp, reativação de base antiga e roleta de clientes dormentes.",
    comoMede: "Ferramenta de disparo e chips · ~1 venda direta a cada R$ 650 investidos.",
  },
  {
    key: "premios",
    nome: "Prêmios & Incentivos da Tropa",
    icone: "🏆",
    descricao: "Premiação por pasta aprovada na Caixa e prêmio para o corretor campeão.",
    comoMede: "Aumenta a ativação da equipe em até +30%, destravando corretores ociosos.",
  },
];

export default function SalaDeGuerraCampanha({
  diretorId,
  supers,
  metaDir,
  metaSuper,
  linha,
  c30,
  diaHoje = new Date().getDate(),
  diasMes = 30,
  abrir,
  onSalvo,
}: {
  diretorId: string;
  supers: SuperDiretoria[];
  metaDir?: MetaPainel;
  metaSuper?: Map<string, MetaPainel | undefined>;
  linha?: Map<string, LinhaConsolidado>;
  c30?: LinhaConsolidado[] | null;
  diaHoje?: number;
  diasMes?: number;
  abrir?: (c: Combinar) => void;
  onSalvo?: () => void;
}) {
  const qc = useQueryClient();
  const { data: estoque = [] } = useEstoque();

  const mesAtual = inicioMes();
  const [mes, setMes] = useState(mesAtual);

  const [titulo, setTitulo] = useState(`Campanha de Incentivo · ${nomeMes(mesAtual)}`);
  const [ticketMedio, setTicketMedio] = useState(250000);

  // Soma das metas oficiais dos Superintendentes no banco de dados (tabela metas_painel)
  const somaMetasSupers = useMemo(() => {
    return supers.reduce((acc, s) => {
      const m = metaSuper?.get(s.id)?.dono.meta;
      return acc + (m ?? 0);
    }, 0);
  }, [supers, metaSuper]);

  // Meta Oficial da Diretoria (Meta Principal do Sistema: Soma das metas de todos os Supers)
  const metaOficialDiretoria = useMemo(() => {
    return somaMetasSupers > 0 ? somaMetasSupers : (metaDir?.dono.meta || 65);
  }, [somaMetasSupers, metaDir]);

  const [metaVendasManual, setMetaVendasManual] = useState<number | null>(null);
  const metaVendas = metaVendasManual ?? metaOficialDiretoria;

  // Sincroniza automaticamente a meta oficial da diretoria com a soma dos Supers no Supabase
  useEffect(() => {
    if (somaMetasSupers > 0 && diretorId && metaDir?.dono.meta !== somaMetasSupers) {
      supabase.rpc("definir_meta" as any, {
        p_mes: mes,
        p_dono: diretorId,
        p_vendas: somaMetasSupers,
      }).then(({ error }) => {
        if (!error) {
          qc.invalidateQueries({ queryKey: ["metas-painel"] });
        }
      });
    }
  }, [somaMetasSupers, diretorId, metaDir?.dono.meta, mes, qc]);

  // Atualizar Meta Oficial de um Superintendente no Supabase (já reflete no dashboard dele para derramar)
  const salvarMetaSuper = async (superId: string, superNome: string, valor: number) => {
    if (Number.isNaN(valor) || valor < 0) return;
    const { error } = await supabase.rpc("definir_meta" as any, {
      p_mes: mes,
      p_dono: superId,
      p_vendas: valor,
    });
    if (error) {
      toast.error(`Erro ao salvar meta de ${superNome}: ${error.message}`);
      return;
    }
    toast.success(`Meta de ${superNome} definida em ${valor} vendas! Ela já aparece no dashboard do Superintendente para derramar aos gerentes.`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  };

  // Salvar Meta Oficial da Diretoria no Supabase
  const salvarMetaOficialDiretoria = async (valor: number) => {
    if (Number.isNaN(valor) || valor < 0) return;
    const { error } = await supabase.rpc("definir_meta" as any, {
      p_mes: mes,
      p_dono: diretorId,
      p_vendas: valor,
    });
    if (error) {
      toast.error(`Erro ao salvar meta da diretoria: ${error.message}`);
      return;
    }
    toast.success(`Meta oficial da diretoria atualizada para ${valor} vendas no placar!`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  };

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

  // Estado de controle das abas/seções minimizadas (todas iniciam minimizadas como solicitado)
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({
    metas: false,
    campanha: false,
    alocacao: false,
    preditivo: false,
    fechamento: false,
  });

  const toggleSecao = (k: string) => {
    setSecoesAbertas((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const expandirTodas = () => {
    setSecoesAbertas({
      metas: true,
      campanha: true,
      alocacao: true,
      preditivo: true,
      fechamento: true,
    });
  };

  const recolherTodas = () => {
    setSecoesAbertas({
      metas: false,
      campanha: false,
      alocacao: false,
      preditivo: false,
      fechamento: false,
    });
  };

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

  const equipesAtivas = useMemo(
    () => supers.filter((s) => supersSelecionados.has(s.id)),
    [supers, supersSelecionados]
  );

  const totalCorretoresAtivos = useMemo(
    () => equipesAtivas.reduce((acc, s) => acc + s.gerentes.flatMap((g) => g.corretores_lista).length, 0),
    [equipesAtivas]
  );

  // Produtos ordenados por estoque disponível
  const estoqueOrdenado = useMemo(() => {
    return [...estoque].sort((a, b) => b.disponiveis - a.disponiveis);
  }, [estoque]);

  // Aportes Próprios da Tropa de cada Super (Recursos Próprios dos Gerentes/Corretores)
  const { data: aportesTropa = [] } = useQuery({
    queryKey: ["aportes-tropa-supers", mes],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("gastos" as any)
        .select("dono_id, planejado, nota")
        .eq("mes", mes)
        .like("descricao", "%Aporte Tropa%");
      return (data ?? []) as any[];
    },
  });

  const aporteMap = useMemo(() => {
    const map = new Map<string, { aporteTotal: number; poderDeFogo: number; metaOusada?: number }>();
    for (const r of aportesTropa) {
      try {
        const parsed = JSON.parse(r.nota || "{}");
        map.set(r.dono_id, {
          aporteTotal: Number(r.planejado) || 0,
          poderDeFogo: parsed.poderDeFogoTotal || Number(r.planejado) || 0,
          metaOusada: parsed.metaOusada,
        });
      } catch {
        map.set(r.dono_id, {
          aporteTotal: Number(r.planejado) || 0,
          poderDeFogo: Number(r.planejado) || 0,
        });
      }
    }
    return map;
  }, [aportesTropa]);

  // Cesta de Produtos & Verbas por Superintendente
  const [itensPorSuper, setItensPorSuper] = useState<Record<string, ItemVerbaSuper[]>>(() => {
    const inicial: Record<string, ItemVerbaSuper[]> = {};

    supers.forEach((s) => {
      const nomeLower = s.nome.toLowerCase();
      if (nomeLower.includes("adajes")) {
        inicial[s.id] = [
          { id: "ad_l1", tipo: "lancamento", produto: "Residencial Mooca (Novo Lançamento)", canal: "anuncio", valor: 5000 },
          { id: "ad_l2", tipo: "lancamento", produto: "Torres Cury Tatuapé (Lançamento Futuro)", canal: "anuncio", valor: 5000 },
          { id: "ad_e1", tipo: "estoque", produto: "Cury Bela Vista", canal: "rua", valor: 2000 },
          { id: "ad_e2", tipo: "estoque", produto: "Mérito Mooca", canal: "pap", valor: 2000 },
          { id: "ad_e3", tipo: "estoque", produto: "Único Santana", canal: "oferta_ativa", valor: 2000 },
          { id: "ad_e4", tipo: "estoque", produto: "Cury Ipiranga", canal: "anuncio", valor: 2000 },
          { id: "ad_e5", tipo: "estoque", produto: "Parque da Mooca", canal: "rua", valor: 2000 },
        ];
      } else if (nomeLower.includes("felipe") || nomeLower.includes("metlicz")) {
        inicial[s.id] = [
          { id: "fe_l1", tipo: "lancamento", produto: "Cury Cidade Tiradentes (Lançamento)", canal: "anuncio", valor: 7000 },
          { id: "fe_e1", tipo: "estoque", produto: "Dez Guaianases", canal: "rua", valor: 3000 },
          { id: "fe_e2", tipo: "estoque", produto: "Mérito Itaquera", canal: "pap", valor: 2000 },
        ];
      } else if (nomeLower.includes("liliane")) {
        inicial[s.id] = [
          { id: "li_l1", tipo: "lancamento", produto: "Torres da Lapa (Lançamento)", canal: "anuncio", valor: 5000 },
          { id: "li_e1", tipo: "estoque", produto: "Cury Barra Funda", canal: "oferta_ativa", valor: 2500 },
        ];
      } else {
        inicial[s.id] = [
          { id: `${s.id}_l1`, tipo: "lancamento", produto: "Lançamento Foco Região Sul", canal: "anuncio", valor: 5000 },
          { id: `${s.id}_e1`, tipo: "estoque", produto: "Estoque Principal da Região", canal: "rua", valor: 2000 },
        ];
      }
    });

    return inicial;
  });

  // Funções de manipulação da cesta de cada Super
  const adicionarLancamento = (superId: string) => {
    const novoItem: ItemVerbaSuper = {
      id: String(Date.now()),
      tipo: "lancamento",
      produto: "",
      canal: "anuncio",
      gerenteId: "",
      valor: 5000,
    };
    setItensPorSuper((prev) => ({
      ...prev,
      [superId]: [...(prev[superId] || []), novoItem],
    }));
    toast.success("Novo Lançamento Futuro adicionado!");
  };

  const adicionarEstoque = (superId: string) => {
    const topProd = estoqueOrdenado[0]?.empreendimento || "Cury Bela Vista";
    const novoItem: ItemVerbaSuper = {
      id: String(Date.now()),
      tipo: "estoque",
      produto: topProd,
      canal: "rua",
      gerenteId: "",
      valor: 2000,
    };
    setItensPorSuper((prev) => ({
      ...prev,
      [superId]: [...(prev[superId] || []), novoItem],
    }));
    toast.success("Novo Produto de Estoque adicionado!");
  };

  const dividirEm5Estoques = (superId: string, valorUnitario = 2000) => {
    const topEstoques = estoqueOrdenado.slice(0, 5);
    const canais: Array<"rua" | "pap" | "oferta_ativa" | "anuncio"> = [
      "rua",
      "pap",
      "oferta_ativa",
      "anuncio",
      "rua",
    ];

    const lista = (
      topEstoques.length > 0
        ? topEstoques
        : [
            { empreendimento: "Cury Bela Vista", disponiveis: 23 },
            { empreendimento: "Mérito Mooca", disponiveis: 14 },
            { empreendimento: "Único Santana", disponiveis: 9 },
            { empreendimento: "Cury Ipiranga", disponiveis: 18 },
            { empreendimento: "Parque da Mooca", disponiveis: 12 },
          ]
    ).map((e: any, idx) => ({
      id: `${Date.now()}_${idx}`,
      tipo: "estoque" as const,
      produto: e.empreendimento,
      canal: canais[idx % canais.length],
      gerenteId: "",
      valor: valorUnitario,
    }));

    setItensPorSuper((prev) => ({
      ...prev,
      [superId]: [...(prev[superId] || []), ...lista],
    }));

    toast.success(`⚡ 5 produtos de estoque (${brl(valorUnitario)} cada) adicionados na cesta do Super!`);
  };

  const atualizarItem = (superId: string, itemId: string, patch: Partial<ItemVerbaSuper>) => {
    setItensPorSuper((prev) => ({
      ...prev,
      [superId]: (prev[superId] || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }));
  };

  const removerItem = (superId: string, itemId: string) => {
    setItensPorSuper((prev) => ({
      ...prev,
      [superId]: (prev[superId] || []).filter((it) => it.id !== itemId),
    }));
  };

  // Subtotais por Super
  const subtotaisPorSuper = useMemo(() => {
    const map: Record<
      string,
      {
        total: number;
        lancamentos: number;
        nLancamentos: number;
        estoques: number;
        nEstoques: number;
      }
    > = {};

    for (const s of supers) {
      const itens = itensPorSuper[s.id] || [];
      let total = 0;
      let lancamentos = 0;
      let nLancamentos = 0;
      let estoques = 0;
      let nEstoques = 0;

      for (const it of itens) {
        const v = it.valor || 0;
        total += v;
        if (it.tipo === "lancamento") {
          lancamentos += v;
          nLancamentos++;
        } else {
          estoques += v;
          nEstoques++;
        }
      }

      map[s.id] = { total, lancamentos, nLancamentos, estoques, nEstoques };
    }

    return map;
  }, [supers, itensPorSuper]);

  // Contagem geral de lançamentos e estoques
  const { totalItensLancamento, totalItensEstoque } = useMemo(() => {
    let lanc = 0;
    let est = 0;
    for (const s of equipesAtivas) {
      for (const it of itensPorSuper[s.id] || []) {
        if (it.tipo === "lancamento") lanc++;
        else est++;
      }
    }
    return { totalItensLancamento: lanc, totalItensEstoque: est };
  }, [equipesAtivas, itensPorSuper]);

  // Alocação consolidada nas 5 frentes táticas a partir de todos os itens de todos os supers ativos
  const alocacoes = useMemo(() => {
    const canais: Record<string, number> = {
      anuncio: 0,
      rua: 0,
      pap: 0,
      oferta_ativa: 0,
      premios: 0,
    };

    for (const s of equipesAtivas) {
      const itens = itensPorSuper[s.id] || [];
      for (const it of itens) {
        if (canais[it.canal] !== undefined) {
          canais[it.canal] += it.valor || 0;
        }
      }
    }

    return canais;
  }, [equipesAtivas, itensPorSuper]);

  const totalAlocado = useMemo(() => {
    return Object.values(alocacoes).reduce((a, b) => a + b, 0);
  }, [alocacoes]);

  // Verba total configurada
  const [verbaTotal, setVerbaTotal] = useState(totalAlocado || 48000);

  const ajustarVerbaParaAlocado = () => {
    setVerbaTotal(totalAlocado);
    toast.success(`Verba global ajustada para ${brl(totalAlocado)}.`);
  };

  // Cálculos matemáticos de ROI & Projeção da Inteligência Preditiva Comandra
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
    const vendasGeradasPorAcoes = Math.round(vendasBase * (1 + bonusPremios));

    // Vendas já confirmadas no Junix neste mês pela diretoria
    const vendidoDiretoria = metaDir?.dono.realizado ?? supers.reduce((acc, s) => acc + (metaSuper?.get(s.id)?.dono.realizado ?? 0), 0);
    const faltamParaMeta = Math.max(0, metaVendas - vendidoDiretoria);

    // Projeção total: vendas já realizadas + vendas geradas pelas ações planejadas
    const vendasTotais = Math.round(vendidoDiretoria + vendasGeradasPorAcoes);
    const vgvProjetado = vendasTotais * ticketMedio;
    const custoPorVenda = vendasGeradasPorAcoes > 0 ? Math.round(totalAlocado / vendasGeradasPorAcoes) : 0;

    const possivelBater = vendasTotais >= metaVendas;
    const gapVendas = metaVendas - vendasTotais;
    const probabilidadeSucesso = metaVendas > 0 ? Math.min(100, Math.round((vendasTotais / metaVendas) * 100)) : 100;

    return {
      leadsAnuncio,
      vendasAnuncio,
      visitasRua,
      vendasRua,
      pastasPap,
      vendasPap,
      vendasAtiva,
      bonusPremios,
      vendidoDiretoria,
      faltamParaMeta,
      vendasGeradasPorAcoes,
      vendasTotais,
      vgvProjetado,
      custoPorVenda,
      possivelBater,
      gapVendas,
      probabilidadeSucesso,
    };
  }, [alocacoes, totalAlocado, ticketMedio, metaDir, metaSuper, supers, metaVendas]);

  // Análise de viabilidade da meta oficial SUPER A SUPER
  const analisePorSuper = useMemo(() => {
    return equipesAtivas.map((s) => {
      const metaPessoa = metaSuper?.get(s.id)?.dono.meta ?? 0;
      const vendidoPessoa = metaSuper?.get(s.id)?.dono.realizado ?? 0;
      const faltamPessoa = Math.max(0, metaPessoa - vendidoPessoa);
      const itens = itensPorSuper[s.id] || [];

      let vAnuncio = 0, vRua = 0, vPap = 0, vAtiva = 0, vPremios = 0;
      for (const it of itens) {
        if (it.canal === "anuncio") vAnuncio += it.valor || 0;
        else if (it.canal === "rua") vRua += it.valor || 0;
        else if (it.canal === "pap") vPap += it.valor || 0;
        else if (it.canal === "oferta_ativa") vAtiva += it.valor || 0;
        else if (it.canal === "premios") vPremios += it.valor || 0;
      }

      const bonusP = vPremios > 0 ? Math.min(0.30, vPremios / 10000) : 0;
      const vBase =
        (vAnuncio / 28) * 0.022 +
        (vRua / 500) * 6 * 0.12 +
        (vPap / 400) * 0.40 +
        vAtiva / 650;
      const vendasVerba = Math.round(vBase * (1 + bonusP));

      const vendasProjetadasSuper = vendidoPessoa + vendasVerba;
      const atingimento = metaPessoa > 0 ? Math.round((vendasProjetadasSuper / metaPessoa) * 100) : 100;
      const viabilidade = metaPessoa === 0 ? "sem_meta" : vendasProjetadasSuper >= metaPessoa ? "viavel" : "risco";

      let recomendacao = "";
      if (viabilidade === "viavel") {
        recomendacao = `Mix equilibrado: projeta ${vendasProjetadasSuper} vendas contra a meta oficial de ${metaPessoa} un (sustenta a cota).`;
      } else if (viabilidade === "risco") {
        const deficit = metaPessoa - vendasProjetadasSuper;
        const verbaExtra = Math.round((deficit * 650) / 500) * 500;
        recomendacao = `Déficit de ${deficit} un contra a meta de ${metaPessoa}. Sugestão: reforçar verba em ~${brl(verbaExtra)} (Meta Ads/Rua) ou destravar pastas paradas.`;
      } else {
        recomendacao = "Defina a meta oficial do superintendente para ativar o diagnóstico.";
      }

      return {
        superId: s.id,
        nome: s.nome,
        meta: metaPessoa,
        vendido: vendidoPessoa,
        faltam: faltamPessoa,
        verbaAlocada: itens.reduce((a, b) => a + (b.valor || 0), 0),
        vendasVerba,
        vendasProjetadas: vendasProjetadasSuper,
        atingimento,
        viabilidade,
        recomendacao,
      };
    });
  }, [equipesAtivas, metaSuper, itensPorSuper]);

  // Simulador de Meta Alvo da IA ("Como chegar em XX vendas?")
  const [metaAlvoSimulacao, setMetaAlvoSimulacao] = useState(metaVendas || 65);
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
    setMetaVendasManual(sugestaoIA.alvo);
    toast.success(`Meta de ${sugestaoIA.alvo} vendas e verba sugerida de ${brl(sugestaoIA.verbaSugeridaTotal)} aplicadas!`);
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
    setRegrasPremios((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
          objetivo: `Ofensiva com ${equipesAtivas.length} superintendências. Verba total alocada de ${brl(totalAlocado)}. Premiações cadastradas: ${regrasPremios.map((r) => r.premio).join("; ")}`,
          meta_vendas: metaVendas,
          prioridade: 1,
          status: "ativo",
        })
        .select("id")
        .single();

      if (planoErr) throw planoErr;
      const planoId = (planoData as any).id;

      // 2. Criar as ações táticas vinculadas para cada canal
      for (const a of ACOES_CATALOGO) {
        const valorCanal = alocacoes[a.key] || 0;
        if (valorCanal > 0) {
          const itensCanal = equipesAtivas.flatMap((s) =>
            (itensPorSuper[s.id] || [])
              .filter((it) => it.canal === a.key)
              .map((it) => `${s.nome.split(" ")[0]}: ${it.tipo === "lancamento" ? "🚀" : "🏢"} ${it.produto || "Geral"} (${brl(it.valor)})`)
          );

          await supabase.from("plano_acoes" as any).insert({
            plano_id: planoId,
            titulo: `${a.nome}: investimento de ${brl(valorCanal)}`,
            entregavel: a.comoMede,
            custo_previsto: valorCanal,
            status: "a_fazer",
            nota: itensCanal.join(" | ") || `Equipes envolvidas: ${equipesAtivas.map((s) => s.nome).join(", ")}`,
          });

          await supabase.from("gastos" as any).insert({
            dono_id: diretorId,
            mes,
            descricao: `Campanha: ${titulo} · ${a.nome}`,
            planejado: valorCanal,
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
          body: `🔥 *Atenção Tropa de Vendas!* Campanha Oficial da Diretoria Comercial para ${nomeMes(mes)}!\n\n🎯 *Meta Geral:* ${metaVendas} vendas\n💰 *Investimento em Ações:* ${brl(totalAlocado)}\n\n*Regras de Premiação & Sorteios:*\n${corpoPremio}\n\nFale com seu Gerente, monte suas pastas no Junix e acelere!`,
          category: "evento",
          emoji: "🏆",
          target_role: ["BROKER", "MANAGER", "SUPERINTENDENT"],
          pinned: true,
        });
      }

      toast.success("Campanha gravada com sucesso e premiações publicadas!");
      if (onSalvo) onSalvo();
    } catch (err: any) {
      toast.error("Erro ao salvar campanha: " + err.message);
    } finally {
      setSalvando(false);
    }
  }

  function gerarMensagemSuper(s: SuperDiretoria) {
    const sub = subtotaisPorSuper[s.id] || { total: 0, lancamentos: 0, estoques: 0 };
    const itens = itensPorSuper[s.id] || [];
    const metaPessoa = metaSuper?.get(s.id)?.dono.meta ?? Math.round(metaVendas / Math.max(1, equipesAtivas.length));
    const corretoresSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;

    const itensLancamento = itens.filter((it) => it.tipo === "lancamento");
    const itensEstoque = itens.filter((it) => it.tipo === "estoque");

    const canalNome = (k: string) => ACOES_CATALOGO.find((a) => a.key === k)?.nome ?? k;

    const linhasLanc =
      itensLancamento.length > 0
        ? itensLancamento
            .map((it) => `• 🚀 ${it.produto || "Lançamento Novo"}: ${brl(it.valor)} (${canalNome(it.canal)})`)
            .join("\n")
        : "• Nenhum lançamento alocado";

    const linhasEstoque =
      itensEstoque.length > 0
        ? itensEstoque
            .map((it) => `• 🏢 ${it.produto || "Estoque Junix"}: ${brl(it.valor)} (${canalNome(it.canal)})`)
            .join("\n")
        : "• Nenhum estoque alocado";

    const linhasPremios = regrasPremios
      .map(
        (r) =>
          `🎁 *${r.premio}* (${
            r.gatilho === "produto_especifico"
              ? `Produto: ${r.produto}`
              : r.gatilho === "meta_equipe"
              ? "Ao bater meta"
              : r.gatilho === "sorteio"
              ? "Sorteio geral"
              : "Por venda confirmada"
          })`
      )
      .join("\n");

    const infoAporte = aporteMap.get(s.id);
    const linhaAporte =
      infoAporte && infoAporte.aporteTotal > 0
        ? `\n🛡️ *Aporte da sua Tropa:* +${brl(infoAporte.aporteTotal)} (Recursos Gerentes/Corretores)\n💥 *Poder de Fogo Total em Campo:* ${brl(sub.total + infoAporte.aporteTotal)}${
            infoAporte.metaOusada ? `\n🔥 *Sua Meta Ousada com a Tropa:* ${infoAporte.metaOusada} un` : ""
          }`
        : "";

    return `Fala ${s.nome.split(" ")[0]}, alinhamento fechado da nossa Reunião Estratégica:

🎯 *Campanha de Incentivo:* ${titulo}
📅 *Período:* ${nomeMes(mes)}
💰 *Verba Total Alocada para sua equipe:* ${brl(sub.total)}${linhaAporte}
🏁 *Sua Meta de Vendas Oficial:* ${metaPessoa} unidades (já definida no seu dashboard)
👥 *Sua Tropa:* ${corretoresSuper} corretores escalados

🚀 *Lançamentos Futuros (${brl(sub.lancamentos)}):*
${linhasLanc}

🏢 *Produtos de Estoque Junix (${brl(sub.estoques)}):*
${linhasEstoque}

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
            ⚔️ Sala de Guerra Comercial & Verba
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "2px 0 6px", color: "var(--ink)" }}>
            Reunião Estratégica de Metas & Alocação de Verba
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: 0 }}>
            Tudo nasce da meta. Acompanhe o placar da diretoria, distribua o orçamento por Superintendência em Lançamentos Futuros e Estoques Junix, configure premiações e calcule o retorno esperado.
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

      {/* ── BARRA DE CONTROLE MODULAR DAS ABAS (ACCORDION) ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          padding: "10px 14px",
          background: "#F1F5F9",
          borderRadius: 10,
          border: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 600 }}>
            📁 <b>Painel Modular:</b> Cada etapa está minimizada para leitura executiva.
          </span>
          <span className="dir-chip c-blue" style={{ fontWeight: 700 }}>
            🎯 Meta Oficial do Sistema: {metaVendas} vendas
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="dir-btn"
            style={{ fontSize: 12, padding: "5px 12px", background: "#fff", borderColor: "#CBD5E1", fontWeight: 700 }}
            onClick={expandirTodas}
          >
            ▼ Expandir Todas as Abas
          </button>
          <button
            type="button"
            className="dir-btn"
            style={{ fontSize: 12, padding: "5px 12px", background: "#fff", borderColor: "#CBD5E1", fontWeight: 700 }}
            onClick={recolherTodas}
          >
            ▲ Minimizar Todas
          </button>
        </div>
      </div>

      {/* ── 1. PLACAR DE METAS DA REUNIÃO (ETAPA 1: ONDE TUDO NASCE) ── */}
      {metaDir && metaSuper && linha && (
        <div className={`sdg-accordion-card${secoesAbertas.metas ? " ativo" : ""}`}>
          <div
            className={`sdg-accordion-hd${secoesAbertas.metas ? " aberto" : ""}`}
            onClick={() => toggleSecao("metas")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18 }}>🏁</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                1. Placar de Metas da Reunião (Ritmo, Projeção & Devedores)
              </h3>
              <span className={`dir-chip ${metaDir.dono.realizado >= metaVendas ? "c-grn" : "c-blue"}`}>
                Vendido {metaDir.dono.realizado} de {metaVendas} ({metaVendas ? Math.round((metaDir.dono.realizado / metaVendas) * 100) : 0}%)
              </span>
              <span className="dir-chip c-gray" style={{ fontSize: 11 }}>
                Faltam {Math.max(0, metaVendas - metaDir.dono.realizado)} vendas em {diasMes - diaHoje} dias
              </span>
              <span className="dir-chip c-org" style={{ fontSize: 11 }}>
                Supers somam: {somaMetasSupers} vendas
              </span>
            </div>

            <button
              type="button"
              className="dir-btn"
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderColor: secoesAbertas.metas ? "var(--teal)" : "#CBD5E1",
                background: "#fff",
                fontWeight: 700,
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleSecao("metas");
              }}
            >
              {secoesAbertas.metas ? "▲ Minimizar Aba" : "▼ Expandir Aba"}
            </button>
          </div>

          {secoesAbertas.metas && (
            <div className="sdg-accordion-body">
              <PlacarMetas
                metaDir={metaDir}
                supers={supers}
                metaSuper={metaSuper}
                linha={linha}
                c30={c30 ?? null}
                diaHoje={diaHoje}
                diasMes={diasMes}
                mes={mes}
                abrir={abrir}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 2. CONFIGURAÇÃO DE INVESTIMENTO & CAMPANHA DE INCENTIVO COM PREMIAÇÃO ── */}
      <div className={`sdg-accordion-card${secoesAbertas.campanha ? " ativo" : ""}`}>
        <div
          className={`sdg-accordion-hd${secoesAbertas.campanha ? " aberto" : ""}`}
          onClick={() => toggleSecao("campanha")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>🏆</span>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
              2. Campanha de Incentivo Oficial & Premiação da Tropa
            </h3>
            <span className="dir-chip c-blue">
              🎯 Meta Principal: {metaVendas} vendas
            </span>
            <span className="dir-chip c-grn">
              💰 Verba: {brl(verbaTotal)}
            </span>
            <span className="dir-chip c-org">
              🎁 {regrasPremios.length} premiações ativas
            </span>
            {publicarBanner && (
              <span className="dir-chip c-gray" style={{ fontSize: 11 }}>
                Banner oficial ativo
              </span>
            )}
          </div>

          <button
            type="button"
            className="dir-btn"
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderColor: secoesAbertas.campanha ? "var(--teal)" : "#CBD5E1",
              background: "#fff",
              fontWeight: 700,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSecao("campanha");
            }}
          >
            {secoesAbertas.campanha ? "▲ Minimizar Aba" : "▼ Expandir Aba"}
          </button>
        </div>

        {secoesAbertas.campanha && (
          <div className="sdg-accordion-body">
            <div className="sdg-sec-title">
              <span>Configuração da Campanha & Banners de Destaque</span>
              <small>Dispara nos dashboards de corretores, gerentes e supers</small>
            </div>

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label className="dir-lbl">Meta Geral de Vendas</label>
                  {metaVendasManual !== null && (
                    <button
                      type="button"
                      style={{ fontSize: 11, background: "none", border: 0, color: "var(--teal)", cursor: "pointer", fontWeight: 700 }}
                      onClick={() => setMetaVendasManual(null)}
                      title="Voltar para a meta oficial do placar"
                    >
                      ↩ Reverter p/ Oficial ({metaOficialDiretoria})
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    className="sdg-input mono"
                    value={metaVendas}
                    onChange={(e) => setMetaVendasManual(Number(e.target.value))}
                  />
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    VGV ~ <b>{brl(metaVendas * ticketMedio)}</b>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    Meta Oficial do Placar: <b>{metaOficialDiretoria} vendas</b> ({somaMetasSupers} somadas dos Supers)
                  </span>
                  {metaVendas !== metaOficialDiretoria && (
                    <button
                      type="button"
                      className="dir-btn"
                      style={{ fontSize: 10.5, padding: "2px 6px", color: "var(--teal)", borderColor: "var(--teal)" }}
                      onClick={() => salvarMetaOficialDiretoria(metaVendas)}
                    >
                      💾 Gravar Oficial
                    </button>
                  )}
                </div>
              </div>

              <div className="sdg-box" style={{ gridColumn: "span 3" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <label className="dir-lbl">Verba Total Disponível para a Operação</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                      Soma Alocada nos Supers: <b className="mono" style={{ color: "var(--teal)" }}>{brl(totalAlocado)}</b>
                    </span>
                    {totalAlocado !== verbaTotal && (
                      <button
                        type="button"
                        className="dir-btn"
                        style={{ fontSize: 11, padding: "3px 8px", color: "var(--teal)", borderColor: "var(--teal)" }}
                        onClick={ajustarVerbaParaAlocado}
                      >
                        ⚡ Igualar Verba ao Total Alocado
                      </button>
                    )}
                  </div>
                </div>

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
                  <span className={`dir-chip ${verbaTotal === totalAlocado ? "c-grn" : verbaTotal > totalAlocado ? "c-blue" : "c-red"}`}>
                    {verbaTotal === totalAlocado
                      ? "100% distribuído nos Supers ✓"
                      : verbaTotal > totalAlocado
                      ? `Sobra ${brl(verbaTotal - totalAlocado)} para distribuir`
                      : `Orçamento estourado em ${brl(totalAlocado - verbaTotal)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Premiações e Sorteios */}
            <div className="sdg-box" style={{ background: "#F8FAFC", border: "1.5px solid #CBD5E1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className="dir-lbl" style={{ color: "#D97706" }}>Premiação da Tropa (Banner Oficial no Dashboard)</span>
                  <h4 style={{ fontSize: 15, fontWeight: 800, margin: "2px 0 0", color: "var(--ink)" }}>
                    🏆 O que a Diretoria vai premiar ou sortear nesta campanha?
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

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {regrasPremios.map((r) => (
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
                      title="Remover premiação"
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
          </div>
        )}
      </div>

      {/* ── 3. ALOCAÇÃO DE VERBA POR SUPERINTENDENTE & CESTA DE PRODUTOS ── */}
      <div className={`sdg-accordion-card${secoesAbertas.alocacao ? " ativo" : ""}`}>
        <div
          className={`sdg-accordion-hd${secoesAbertas.alocacao ? " aberto" : ""}`}
          onClick={() => toggleSecao("alocacao")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>🏢</span>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
              3. Alocação de Verba por Superintendente & Cesta de Produtos
            </h3>
            <span className="dir-chip c-blue">
              👥 {equipesAtivas.length} Supers ativos
            </span>
            <span className="dir-chip c-grn">
              💰 {brl(totalAlocado)} alocados
            </span>
            <span className="sdg-tipo-pill lancamento">
              🚀 {totalItensLancamento} lançamentos
            </span>
            <span className="sdg-tipo-pill estoque">
              🏢 {totalItensEstoque} estoques
            </span>
          </div>

          <button
            type="button"
            className="dir-btn"
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderColor: secoesAbertas.alocacao ? "var(--teal)" : "#CBD5E1",
              background: "#fff",
              fontWeight: 700,
            }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSecao("alocacao");
            }}
          >
            {secoesAbertas.alocacao ? "▲ Minimizar Aba" : "▼ Expandir Aba"}
          </button>
        </div>

        {secoesAbertas.alocacao && (
          <div className="sdg-accordion-body">
            <div className="sdg-sec-title">
              <span>Cesta de Produtos por Equipe</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span>Total Alocado: <b className="mono" style={{ color: "var(--teal)" }}>{brl(totalAlocado)}</b></span>
                <span className="dir-chip c-blue">{equipesAtivas.length} Supers na Campanha</span>
              </div>
            </div>

            {/* Seletor rápido de quem participa */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)" }}>Supers Participantes:</span>
              {supers.map((s) => {
                const ativa = supersSelecionados.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`dir-chip ${ativa ? "c-grn" : "c-gray"}`}
                    style={{ cursor: "pointer", fontSize: 12, padding: "5px 10px", border: ativa ? "1.5px solid var(--teal)" : "1px solid var(--line)" }}
                    onClick={() => toggleSuper(s.id)}
                  >
                    {s.nome} {ativa ? "✓" : "+ incluir"}
                  </button>
                );
              })}
            </div>

            {/* CARDS INDIVIDUAIS DE CADA SUPERINTENDENTE COM SUA CESTA DE PRODUTOS */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {equipesAtivas.map((s) => {
                const sub = subtotaisPorSuper[s.id] || { total: 0, lancamentos: 0, nLancamentos: 0, estoques: 0, nEstoques: 0 };
                const itens = itensPorSuper[s.id] || [];
                const metaSuperPessoa = metaSuper?.get(s.id)?.dono.meta;
                const corrSuper = s.gerentes.flatMap((g) => g.corretores_lista).length;
                const infoAporte = aporteMap.get(s.id);

                return (
                  <div key={s.id} className="sdg-super-card">
                    {/* Cabeçalho do Super */}
                    <div className="sdg-super-card-hd">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 18 }}>👤</span>
                          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                            {s.nome}
                          </h3>

                          {/* META OFICIAL DO SUPERINTENDENTE (APARECE NO DASHBOARD DELE) */}
                          <div className="sdg-meta-inline-box" title="Esta meta aparece diretamente no dashboard do Superintendente para ele derramar aos gerentes">
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--teal)" }}>🎯 Meta Oficial:</span>
                            <input
                              type="number"
                              min={0}
                              className="sdg-input mono"
                              style={{ width: 55, padding: "2px 4px", fontSize: 13, fontWeight: 800, textAlign: "center", background: "#fff", borderColor: "var(--teal)" }}
                              defaultValue={metaSuperPessoa ?? ""}
                              placeholder="—"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!Number.isNaN(val) && val !== metaSuperPessoa) {
                                  salvarMetaSuper(s.id, s.nome, val);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                            />
                            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>un</span>
                          </div>

                          {/* Se a tropa estipulou uma meta ousada maior */}
                          {infoAporte?.metaOusada && infoAporte.metaOusada > (metaSuperPessoa || 0) && (
                            <span
                              className="dir-chip c-blu"
                              style={{ fontSize: 11, background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE", fontWeight: 700 }}
                              title={`O Superintendente e sua equipe estipularam uma meta ousada de ${infoAporte.metaOusada} un (+${infoAporte.metaOusada - (metaSuperPessoa || 0)} acima da oficial)`}
                            >
                              🔥 Meta da Tropa: {infoAporte.metaOusada} un (+{infoAporte.metaOusada - (metaSuperPessoa || 0)})
                            </span>
                          )}

                          <span className="dir-chip c-gray" style={{ fontSize: 11 }}>
                            {s.gerentes.length} gerentes · {corrSuper} corretores
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                          Altere a meta acima para salvar direto no dashboard do Super. Distribua a verba entre Lançamentos Futuros e Estoque:
                        </div>
                      </div>

                      {/* Subtotais e Botões de Ação do Super */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div className="sdg-super-card-subtotais">
                          <span className="sdg-tipo-pill lancamento">
                            🚀 Lançamentos: {brl(sub.lancamentos)} ({sub.nLancamentos})
                          </span>
                          <span className="sdg-tipo-pill estoque">
                            🏢 Estoque: {brl(sub.estoques)} ({sub.nEstoques})
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-2)", marginLeft: 4 }}>
                            Verba Diretor: {brl(sub.total)}
                          </span>

                          {infoAporte && infoAporte.aporteTotal > 0 && (
                            <>
                              <span
                                className="sdg-tipo-pill"
                                style={{ background: "#ECFDF5", color: "#047857", borderColor: "#A7F3D0", fontWeight: 700 }}
                                title="Recursos próprios aportados pelos gerentes e corretores da equipe"
                              >
                                🛡️ Aporte Tropa: +{brl(infoAporte.aporteTotal)}
                              </span>
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: "#047857",
                                  marginLeft: 4,
                                  background: "#D1FAE5",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  border: "1px solid #A7F3D0",
                                }}
                                title="Poder de Fogo Total em campo (Verba Diretoria + Aportes dos Gerentes/Corretores)"
                              >
                                💥 Poder de Fogo: {brl(sub.total + infoAporte.aporteTotal)}
                              </span>
                            </>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="dir-btn"
                            style={{ fontSize: 11.5, padding: "5px 8px", borderColor: "#A855F7", color: "#7E22CE", background: "#FAF5FF" }}
                            onClick={() => adicionarLancamento(s.id)}
                          >
                            + Lançamento Futuro
                          </button>
                          <button
                            type="button"
                            className="dir-btn"
                            style={{ fontSize: 11.5, padding: "5px 8px", borderColor: "#0284C7", color: "#0369A1", background: "#F0F9FF" }}
                            onClick={() => adicionarEstoque(s.id)}
                          >
                            + Produto de Estoque
                          </button>
                          <button
                            type="button"
                            className="dir-btn"
                            style={{ fontSize: 11.5, padding: "5px 8px", borderColor: "var(--teal)", color: "var(--teal)" }}
                            onClick={() => dividirEm5Estoques(s.id, 2000)}
                            title="Adiciona 5 produtos do Junix com R$ 2.000 cada automaticamente"
                          >
                            ⚡ 5 Estoques Rápidos (R$ 2k cada)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Tabela da Cesta de Projetos do Super */}
                    {itens.length === 0 ? (
                      <div style={{ padding: 16, textAlign: "center", background: "#F8FAFC", borderRadius: 8, color: "var(--ink-3)", fontSize: 13 }}>
                        Nenhum produto alocado para {s.nome.split(" ")[0]} ainda. Clique nos botões acima para adicionar Lançamentos ou Estoques!
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Cabeçalho da tabela */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "130px 1.5fr 1.3fr 1fr 140px 32px",
                            gap: 8,
                            padding: "0 10px",
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "var(--ink-3)",
                            textTransform: "uppercase",
                          }}
                        >
                          <span>Tipo</span>
                          <span>Produto / Lançamento</span>
                          <span>Frente / Canal Tático</span>
                          <span>Gerência Responsável</span>
                          <span>Verba (R$)</span>
                          <span />
                        </div>

                        {/* Linhas da cesta */}
                        {itens.map((it) => (
                          <div key={it.id} className="sdg-cesta-row">
                            {/* 1. Tipo de Produto */}
                            <div>
                              <select
                                className="sdg-input"
                                style={{
                                  fontSize: 11.5,
                                  padding: "4px 6px",
                                  fontWeight: 700,
                                  borderColor: it.tipo === "lancamento" ? "#D8B4FE" : "#BAE6FD",
                                  background: it.tipo === "lancamento" ? "#FAF5FF" : "#F0F9FF",
                                  color: it.tipo === "lancamento" ? "#7E22CE" : "#0369A1",
                                }}
                                value={it.tipo}
                                onChange={(e) => atualizarItem(s.id, it.id, { tipo: e.target.value as any })}
                              >
                                <option value="lancamento">🚀 Lançamento</option>
                                <option value="estoque">🏢 Estoque</option>
                              </select>
                            </div>

                            {/* 2. Nome do Produto (Select se estoque, Input se lançamento) */}
                            <div>
                              {it.tipo === "lancamento" ? (
                                <input
                                  type="text"
                                  className="sdg-input"
                                  style={{ fontSize: 12.5, padding: "5px 8px" }}
                                  placeholder="Digite o nome do lançamento futuro (ex: Cury Mooca...)"
                                  value={it.produto}
                                  onChange={(e) => atualizarItem(s.id, it.id, { produto: e.target.value })}
                                />
                              ) : (
                                <select
                                  className="sdg-input"
                                  style={{ fontSize: 12.5, padding: "5px 8px" }}
                                  value={it.produto}
                                  onChange={(e) => atualizarItem(s.id, it.id, { produto: e.target.value })}
                                >
                                  <option value="">Selecione o produto de estoque...</option>
                                  {estoqueOrdenado.map((e) => (
                                    <option key={e.cod_empreendimento} value={e.empreendimento}>
                                      {e.empreendimento.replace(/^CONDOM[IÍ]NIO\s+/i, "")} ({e.disponiveis} disp.)
                                    </option>
                                  ))}
                                  <option value="Outro Estoque">✏️ Outro Estoque (digitar)</option>
                                </select>
                              )}
                            </div>

                            {/* 3. Canal / Frente Tática */}
                            <div>
                              <select
                                className="sdg-input"
                                style={{ fontSize: 12, padding: "5px 8px" }}
                                value={it.canal}
                                onChange={(e) => atualizarItem(s.id, it.id, { canal: e.target.value as any })}
                              >
                                {ACOES_CATALOGO.map((a) => (
                                  <option key={a.key} value={a.key}>
                                    {a.icone} {a.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 4. Gerente Responsável */}
                            <div>
                              <select
                                className="sdg-input"
                                style={{ fontSize: 11.5, padding: "5px 8px" }}
                                value={it.gerenteId || ""}
                                onChange={(e) => atualizarItem(s.id, it.id, { gerenteId: e.target.value })}
                              >
                                <option value="">Toda a Superintendência</option>
                                {s.gerentes.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    Gerência {g.nome} ({g.corretores} corr.)
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 5. Valor R$ */}
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>R$</span>
                              <input
                                type="number"
                                step={500}
                                min={0}
                                className="sdg-input mono"
                                style={{ padding: "4px 8px", fontSize: 13, fontWeight: 700 }}
                                value={it.valor}
                                onChange={(e) => atualizarItem(s.id, it.id, { valor: Number(e.target.value) })}
                              />
                            </div>

                            {/* 6. Ação Remover */}
                            <button
                              type="button"
                              style={{
                                background: "none",
                                border: 0,
                                color: "var(--red)",
                                cursor: "pointer",
                                fontSize: 14,
                                textAlign: "center",
                              }}
                              onClick={() => removerItem(s.id, it.id)}
                              title="Remover produto da verba"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Resumo Consolidado dos Canais */}
            <div style={{ background: "var(--sunk)", borderRadius: 12, padding: 14, border: "1px solid var(--line)", marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                📊 Consolidação do Orçamento por Frente Tática (Soma de todos os produtos alocados):
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {ACOES_CATALOGO.map((a) => {
                  const v = alocacoes[a.key] || 0;
                  const pct = totalAlocado > 0 ? Math.round((v / totalAlocado) * 100) : 0;
                  return (
                    <div key={a.key} style={{ background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{a.icone} {a.nome.split(" ")[0]}</span>
                    <span className="dir-chip c-gray" style={{ fontSize: 10 }}>{pct}%</span>
                  </div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>
                    {brl(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}
  </div>

  {/* ── 4. PAINEL PREDITIVO DA IA (ACOMPANHAMENTO DA META PRINCIPAL & VIABILIDADE) ── */}
  <div className={`sdg-accordion-card${secoesAbertas.preditivo ? " ativo" : ""}`}>
    <div
      className={`sdg-accordion-hd${secoesAbertas.preditivo ? " aberto" : ""}`}
      onClick={() => toggleSecao("preditivo")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          4. Inteligência Preditiva Comandra & Viabilidade da Meta Oficial
        </h3>
        <span className={`dir-chip ${projecoes.possivelBater ? "c-grn" : "c-org"}`} style={{ fontWeight: 800 }}>
          {projecoes.possivelBater ? "✓ Meta Viável" : "⚠️ Risco de Déficit"}
        </span>
        <span className="dir-chip c-blue">
          🎯 Meta Oficial: {metaVendas} vendas
        </span>
        <span className="dir-chip c-grn">
          🔮 Projeção Total: {projecoes.vendasTotais} vendas
        </span>
        <span className="dir-chip c-gray" style={{ fontSize: 11 }}>
          {projecoes.probabilidadeSucesso}% da meta garantida
        </span>
      </div>

      <button
        type="button"
        className="dir-btn"
        style={{
          fontSize: 12,
          padding: "4px 10px",
          borderColor: secoesAbertas.preditivo ? "var(--teal)" : "#CBD5E1",
          background: "#fff",
          fontWeight: 700,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleSecao("preditivo");
        }}
      >
        {secoesAbertas.preditivo ? "▲ Minimizar Aba" : "▼ Expandir Aba"}
      </button>
    </div>

    {secoesAbertas.preditivo && (
      <div className="sdg-accordion-body" style={{ background: "#0F1B2D", borderRadius: 12, padding: 18, margin: 10 }}>
        {/* Cabeçalho de Viabilidade da Meta Oficial */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <span className="dir-lbl" style={{ color: "#9FB3CC" }}>Inteligência Preditiva Comandra</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "4px 0 0" }}>
              Avaliação de Viabilidade da Meta Oficial ({metaVendas} Vendas)
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#9FB3CC" }}>
              Avaliando se a verba e os produtos alocados sustentam a entrega das metas oficiais de Adajes, Felipe, Liliane e Silva.
            </p>
          </div>
          <div className="sdg-roi-chips">
            <span className={`dir-chip ${projecoes.possivelBater ? "c-grn" : "c-org"}`} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 800 }}>
              {projecoes.possivelBater
                ? `✓ É POSSÍVEL BATER A META! (${projecoes.vendasTotais} de ${metaVendas})`
                : `⚠️ RISCO: Déficit de ${projecoes.gapVendas} vendas contra a meta de ${metaVendas}`}
            </span>
          </div>
        </div>

        {/* 4 Métricas Principais da Inteligência Preditiva */}
        <div className="sdg-roi-grid" style={{ marginTop: 14 }}>
          <div className="sdg-roi-metric">
            <small>Meta Oficial do Sistema</small>
            <div className="val" style={{ color: "#38BDF8" }}>
              {metaVendas} <span style={{ fontSize: 14, fontWeight: 500, color: "#9FB3CC" }}>vendas</span>
            </div>
            <div className="sub">
              {projecoes.vendidoDiretoria} vendidas no Junix · faltam {projecoes.faltamParaMeta}
            </div>
          </div>

          <div className="sdg-roi-metric">
            <small>Vendas Projetadas (Total)</small>
            <div className="val" style={{ color: projecoes.possivelBater ? "#34D399" : "#FBBF24" }}>
              {projecoes.vendasTotais} <span style={{ fontSize: 14, fontWeight: 500, color: "#9FB3CC" }}>unidades</span>
            </div>
            <div className="sub">
              {projecoes.vendidoDiretoria} base + {projecoes.vendasGeradasPorAcoes} geradas pelas ações
            </div>
          </div>

          <div className="sdg-roi-metric">
            <small>VGV Oficial Estimado</small>
            <div className="val">{brl(metaVendas * ticketMedio)}</div>
            <div className="sub">ticket médio de {brl(ticketMedio)}</div>
          </div>

          <div className="sdg-roi-metric">
            <small>Sustentação da Meta</small>
            <div className="val" style={{ color: projecoes.possivelBater ? "#34D399" : "#F87171" }}>
              {projecoes.probabilidadeSucesso}%
            </div>
            <div className="sub">
              {projecoes.possivelBater ? "plano com folga" : "exige reforço tático"}
            </div>
          </div>
        </div>

        {/* DIAGNÓSTICO SUPER A SUPER: QUEM BATE E QUEM ESTÁ EM RISCO */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>👥 Diagnóstico Preditivo por Superintendente (Metas Oficiais):</span>
            <small style={{ color: "#9FB3CC", fontWeight: 400 }}>Metas gravadas em metas_painel no banco</small>
          </div>

          <div className="sdg-viabilidade-grid">
            {analisePorSuper.map((a) => (
              <div key={a.superId} className={`sdg-viabilidade-card ${a.viabilidade}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ fontSize: 14.5, color: "#fff" }}>{a.nome}</b>
                  <span className={`dir-chip ${a.viabilidade === "viavel" ? "c-grn" : a.viabilidade === "risco" ? "c-org" : "c-gray"}`}>
                    {a.viabilidade === "viavel" ? "Bate a Meta ✓" : a.viabilidade === "risco" ? "Em Risco ⚠️" : "Sem Meta"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#E2E8F0", marginTop: 4 }}>
                  <span>Meta Oficial: <b>{a.meta || "—"} un</b></span>
                  <span>Vendeu Junix: <b>{a.vendido} un</b></span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#E2E8F0" }}>
                  <span>Verba Alocada: <b>{brl(a.verbaAlocada)}</b></span>
                  <span>Projeção Final: <b style={{ color: a.viabilidade === "viavel" ? "#34D399" : "#FBBF24" }}>{a.vendasProjetadas} un</b></span>
                </div>

                <div style={{ fontSize: 11.5, color: "#9FB3CC", marginTop: 4, lineHeight: 1.35, borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 6 }}>
                  {a.recomendacao}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parecer Estratégico da IA */}
        <div className="sdg-ia-box" style={{ marginTop: 14 }}>
          <b>🧠 Veredito da Inteligência Preditiva Comandra:</b>
          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "#E2E8F0" }}>
            {projecoes.possivelBater ? (
              <>
                <b>✓ Sim, é possível atingir a Meta Oficial de {metaVendas} vendas!</b> O investimento total de <b>{brl(totalAlocado)}</b> distribuído nos Lançamentos e Estoques dos Superintendentes somado ao realizado de {projecoes.vendidoDiretoria} vendas fecha o mês em <b>{projecoes.vendasTotais} vendas</b> ({projecoes.probabilidadeSucesso}% da meta).
                As equipes ativas somam {totalCorretoresAtivos} corretores na escala, garantindo capacidade operacional para absorver os ~{projecoes.leadsAnuncio} leads e ~{projecoes.visitasRua} visitas presenciais geradas.
              </>
            ) : (
              <>
                <b>⚠️ Alerta: o mix atual projeta {projecoes.vendasTotais} vendas, restando um déficit de {projecoes.gapVendas} vendas para a Meta Oficial de {metaVendas}.</b>
                Para garantir a entrega da meta, recomenda-se reforçar a verba nas equipes que estão com maior gap ou usar o simulador de engenharia reversa abaixo para dimensionar o aporte ideal.
              </>
            )}
          </p>
        </div>

        {/* Simulador Interativo de Meta Alvo ("Quero Chegar em XX Vendas") */}
        <div className="sdg-reversa-box" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className="dir-lbl" style={{ color: "#FBBF24" }}>Simulador de Engenharia Reversa da IA</span>
              <h4 style={{ fontSize: 16, fontWeight: 800, margin: "2px 0 0", color: "#fff" }}>
                🎯 O que é necessário para bater qualquer meta específica?
              </h4>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="dir-btn"
                style={{
                  background: "#F59E0B",
                  color: "#0F1B2D",
                  fontWeight: 800,
                  border: 0,
                  fontSize: 12,
                }}
                onClick={() => {
                  setMetaAlvoSimulacao(metaVendas);
                  setMostrarSimulador(true);
                }}
              >
                🎯 Simular Meta Oficial ({metaVendas} un)
              </button>
              <button
                type="button"
                className="dir-btn"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "#fff",
                  borderColor: "rgba(255, 255, 255, 0.2)",
                  fontSize: 12,
                }}
                onClick={() => setMostrarSimulador(!mostrarSimulador)}
              >
                {mostrarSimulador ? "Recolher Simulador ▲" : "Outros Cenários ▼"}
              </button>
            </div>
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
                  {[metaVendas, 50, 65, 75, 100].map((v) => (
                    <button
                      key={v}
                      type="button"
                      style={{
                        background: metaAlvoSimulacao === v ? "var(--teal)" : "rgba(255,255,255,0.1)",
                        color: "#fff",
                        borderColor: "rgba(255,255,255,0.2)",
                        fontWeight: metaAlvoSimulacao === v ? 800 : 500,
                      }}
                      onClick={() => setMetaAlvoSimulacao(v)}
                    >
                      {v === metaVendas ? `Meta (${v})` : `${v} un`}
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
                  Aplica a meta de {sugestaoIA.alvo} vendas e a verba recomendada no orçamento:
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
    )}
  </div>

  {/* ── 5. BOTÕES DE FECHAMENTO & DISPARO PARA OS SUPERS ── */}
  <div className={`sdg-accordion-card${secoesAbertas.fechamento ? " ativo" : ""}`}>
    <div
      className={`sdg-accordion-hd${secoesAbertas.fechamento ? " aberto" : ""}`}
      onClick={() => toggleSecao("fechamento")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>📱</span>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          5. Fechamento Formal & Termo WhatsApp de cada Super
        </h3>
        <span className="dir-chip c-blue">
          {equipesAtivas.length} termos prontos para WhatsApp
        </span>
      </div>

      <button
        type="button"
        className="dir-btn"
        style={{
          fontSize: 12,
          padding: "4px 10px",
          borderColor: secoesAbertas.fechamento ? "var(--teal)" : "#CBD5E1",
          background: "#fff",
          fontWeight: 700,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleSecao("fechamento");
        }}
      >
        {secoesAbertas.fechamento ? "▲ Minimizar Aba" : "▼ Expandir Aba"}
      </button>
    </div>

    {secoesAbertas.fechamento && (
      <div className="sdg-accordion-body">
        <div className="sdg-footer" style={{ borderTop: 0, padding: 0, marginTop: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>
              Disparar Acordo Completo no WhatsApp:
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
            {salvando ? "Gravando no Sistema…" : "💾 Salvar Campanha & Publicar Premiação na Tropa"}
          </button>
        </div>
      </div>
    )}
  </div>

  {/* MODAL DE ENVIO DO ACORDO VIA WHATSAPP */}
  {modalWpp && (
    <div className="dir-modal-backdrop" onClick={() => setModalWpp(null)}>
      <div className="dir-modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="dir-lbl">Termo de Acordo da Reunião Estratégica</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0", color: "var(--ink)" }}>
              Enviar Acordo para {modalWpp.superNome}
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
            Mensagem WhatsApp (editável antes do envio)
          </label>
          <textarea
            rows={12}
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
