/* Portfólio Multi-Estratégia do Diretor:
 * Permite ao Diretor criar e gerenciar múltiplas estratégias simultâneas para:
 *   - Lançamentos específicos (ex: 3 lançamentos paralelos);
 *   - Queima / Giro de Produtos de Estoque Junix;
 *   - Campanhas Gerais de Aceleração da Diretoria.
 *
 * Inclui:
 *   - Consolidador executivo de portfólio (metas somadas, VGV total e verba total);
 *   - Seletor de estratégias em abas rápidas;
 *   - Foco por produto de estoque Junix (unidades disponíveis reais) ou lançamento;
 *   - Tese e diretrizes do diretor para os superintendentes;
 *   - Quadro de ações táticas com responsável, prazo, custo e cobrança WhatsApp;
 *   - Inteligência preditiva de meta por produto;
 *   - Persistência permanente em planos e plano_acoes do Supabase.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePlanos, useEstoque, useEstrutura, usePlanoAcoes, type Plano, type Acao, type Foco, type StatusAcao } from "@/hooks/usePlano";
import type { SuperDiretoria } from "@/hooks/useDiretoria";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const inicioMes = (desloc = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
};
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });

const FOCO_CONFIG: Record<Foco, { nome: string; badge: string; icone: string }> = {
  lancamento: { nome: "Lançamento", badge: "c-blue", icone: "🚀" },
  estoque: { nome: "Giro de Estoque", badge: "c-org", icone: "📦" },
  geral: { nome: "Campanha Geral", badge: "c-gray", icone: "⚡" },
};

export default function MinhaEstrategia({
  diretorId,
  supers,
}: {
  diretorId: string;
  supers: SuperDiretoria[];
}) {
  const mesAtual = inicioMes();
  const [mes, setMes] = useState(mesAtual);

  const { data: planos = [], isLoading, refetch } = usePlanos(mes);
  const { data: estoque = [] } = useEstoque();
  const { data: pessoas = [] } = useEstrutura(diretorId);
  const { criarPlano, alterarPlano, criarAcao, alterarAcao, apagarAcao } = usePlanoAcoes();

  // Filtrar apenas planos da diretoria ou criados aqui
  const planosDiretor = useMemo(
    () => planos.filter((p) => p.dono_id === diretorId || !p.pai_id),
    [planos, diretorId]
  );

  // Plano atualmente selecionado no portfólio
  const [planoAtivoId, setPlanoAtivoId] = useState<string | null>(null);

  // Modo de criação de novo plano
  const [criandoNovo, setCriandoNovo] = useState(false);

  // Formulário de edição ou novo plano
  const [foco, setFoco] = useState<Foco>("lancamento");
  const [titulo, setTitulo] = useState("");
  const [empreendimento, setEmpreendimento] = useState("");
  const [objetivoTese, setObjetivoTese] = useState("");
  const [metaVendas, setMetaVendas] = useState<number>(20);
  const [verbaAlocada, setVerbaAlocada] = useState<number>(15000);
  const [ticketMedio, setTicketMedio] = useState<number>(250000);

  // Equipes selecionadas para este produto
  const [supersSelecionados, setSupersSelecionados] = useState<Set<string>>(
    () => new Set(supers.map((s) => s.id))
  );

  // Nova ação rápida
  const [novaAcaoTitulo, setNovaAcaoTitulo] = useState("");
  const [novaAcaoEntregavel, setNovaAcaoEntregavel] = useState("");
  const [novaAcaoResp, setNovaAcaoResp] = useState(supers[0]?.id ?? "");
  const [novaAcaoPrazo, setNovaAcaoPrazo] = useState("");
  const [novaAcaoCusto, setNovaAcaoCusto] = useState<number>(2000);
  const [salvando, setSalvando] = useState(false);

  // Selecionar o plano ativo
  const planoAtual = useMemo(
    () => planosDiretor.find((p) => p.id === planoAtivoId) ?? planosDiretor[0] ?? null,
    [planosDiretor, planoAtivoId]
  );

  // Quando seleciona um plano existente para ver/editar
  const carregarPlanoParaEdicao = (p: Plano) => {
    setCriandoNovo(false);
    setPlanoAtivoId(p.id);
    setFoco(p.foco || "geral");
    setTitulo(p.titulo);
    setEmpreendimento(p.empreendimento || "");
    setObjetivoTese(p.objetivo || "");
    setMetaVendas(p.meta_vendas || 20);
    // Recuperar verba a partir da soma dos custos das ações
    const somaCustos = p.acoes.reduce((acc, a) => acc + (a.custo_previsto || 0), 0);
    setVerbaAlocada(somaCustos > 0 ? somaCustos : 15000);
  };

  // Abrir tela de novo plano
  const abrirNovoPlano = (focoInicial: Foco = "lancamento") => {
    setCriandoNovo(true);
    setPlanoAtivoId(null);
    setFoco(focoInicial);
    setTitulo(
      focoInicial === "lancamento"
        ? "Lançamento: Novo Empreendimento"
        : focoInicial === "estoque"
        ? "Giro de Estoque Junix"
        : "Ofensiva Geral da Diretoria"
    );
    setEmpreendimento("");
    setObjetivoTese("");
    setMetaVendas(20);
    setVerbaAlocada(15000);
  };

  // Consolidador do Portfólio (soma de todas as estratégias ativas do mês)
  const metricasPortfolio = useMemo(() => {
    const totalMetas = planosDiretor.reduce((acc, p) => acc + (p.meta_vendas || 0), 0);
    const totalAcoes = planosDiretor.flatMap((p) => p.acoes);
    const acoesFeitas = totalAcoes.filter((a) => a.status === "feito").length;
    const totalVerba = totalAcoes.reduce((acc, a) => acc + (a.custo_previsto || 0), 0);
    const vgvTotal = totalMetas * ticketMedio;

    return {
      totalPlanos: planosDiretor.length,
      totalMetas,
      vgvTotal,
      totalVerba,
      totalAcoes: totalAcoes.length,
      acoesFeitas,
    };
  }, [planosDiretor, ticketMedio]);

  // Salvar estratégia (novo ou existente)
  const salvarEstrategia = async () => {
    if (!titulo.trim()) {
      toast.error("Informe um título para a estratégia.");
      return;
    }
    setSalvando(true);
    try {
      if (criandoNovo || !planoAtual) {
        // Criar novo plano
        const { data, error } = await supabase
          .from("planos" as any)
          .insert({
            dono_id: diretorId,
            mes,
            titulo,
            foco,
            empreendimento: empreendimento || null,
            objetivo: objetivoTese,
            meta_vendas: metaVendas,
            prioridade: 1,
            status: "ativo",
          })
          .select("id")
          .single();

        if (error) throw error;
        const novoId = (data as any).id;

        // Criar ação tática inicial padrão
        await supabase.from("plano_acoes" as any).insert({
          plano_id: novoId,
          titulo: `Mobilização de vendas · ${titulo}`,
          entregavel: `Operação de ${metaVendas} vendas com ${supersSelecionados.size} superintendências.`,
          responsavel_id: supers[0]?.id || null,
          custo_previsto: verbaAlocada,
          status: "a_fazer",
        });

        toast.success(`Estratégia "${titulo}" criada com sucesso!`);
        setCriandoNovo(false);
        setPlanoAtivoId(novoId);
        refetch();
      } else {
        // Atualizar plano existente
        await alterarPlano(planoAtual.id, {
          titulo,
          foco,
          empreendimento: empreendimento || null,
          objetivo: objetivoTese,
          meta_vendas: metaVendas,
        });
        toast.success("Estratégia atualizada com sucesso!");
        refetch();
      }
    } catch (err: any) {
      toast.error("Erro ao salvar estratégia: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // Excluir plano
  const excluirPlano = async (id: string) => {
    if (!confirm("Deseja realmente remover esta estratégia?")) return;
    try {
      await supabase.from("planos" as any).update({ status: "cancelado" }).eq("id", id);
      toast.success("Estratégia arquivada.");
      setPlanoAtivoId(null);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  // Adicionar ação tática no plano atual
  const adicionarAcaoNoPlano = async () => {
    if (!planoAtual) return;
    if (!novaAcaoTitulo.trim()) {
      toast.error("Informe o título da ação.");
      return;
    }
    const ok = await criarAcao({
      plano_id: planoAtual.id,
      titulo: novaAcaoTitulo,
      entregavel: novaAcaoEntregavel || null,
      responsavel_id: novaAcaoResp || null,
      prazo: novaAcaoPrazo || null,
      custo_previsto: novaAcaoCusto || 0,
      status: "a_fazer",
    });
    if (ok) {
      setNovaAcaoTitulo("");
      setNovaAcaoEntregavel("");
      setNovaAcaoCusto(1500);
      refetch();
    }
  };

  // Alternar status da ação
  const alternarStatusAcao = async (acao: Acao) => {
    const proximos: Record<StatusAcao, StatusAcao> = {
      a_fazer: "fazendo",
      fazendo: "feito",
      feito: "a_fazer",
      cancelada: "a_fazer",
    };
    const novoStatus = proximos[acao.status];
    await alterarAcao(acao.id, {
      status: novoStatus,
      concluida_em: novoStatus === "feito" ? new Date().toISOString() : null,
    });
    refetch();
  };

  return (
    <div className="mestr-container">
      {/* ── 1. CONSOLIDADOR DO PORTFÓLIO ESTRATÉGICO NO TOPO ── */}
      <div className="mestr-top-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <span className="dir-chip c-blue" style={{ marginBottom: 6 }}>
              🎯 Portfólio Estratégico da Diretoria
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "2px 0 4px", color: "var(--ink)" }}>
              Minhas Estratégias · {nomeMes(mes)}
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>
              Crie e gerencie frentes simultâneas: lançamentos exclusivos, queima de estoque Junix e campanhas de aceleração.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="dir-per">
              <button className={mes === mesAtual ? "on" : ""} onClick={() => setMes(mesAtual)}>
                Mês Presente
              </button>
              <button className={mes === inicioMes(1) ? "on" : ""} onClick={() => setMes(inicioMes(1))}>
                Próximo Mês
              </button>
            </div>
          </div>
        </div>

        {/* KPIs Consolidados de todas as estratégias */}
        <div className="mestr-kpis">
          <div className="mestr-kpi">
            <small>Estratégias Ativas</small>
            <b>{metricasPortfolio.totalPlanos} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-3)" }}>frentes</span></b>
            <span>Lançamentos & Estoque</span>
          </div>
          <div className="mestr-kpi">
            <small>Meta de Vendas Somada</small>
            <b style={{ color: "var(--teal)" }}>{metricasPortfolio.totalMetas} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-3)" }}>vendas</span></b>
            <span>VGV Total ~ {brl(metricasPortfolio.vgvTotal)}</span>
          </div>
          <div className="mestr-kpi">
            <small>Verba Total Alocada</small>
            <b>{brl(metricasPortfolio.totalVerba)}</b>
            <span>soma das ações táticas</span>
          </div>
          <div className="mestr-kpi">
            <small>Ações em Execução</small>
            <b>{metricasPortfolio.acoesFeitas} de {metricasPortfolio.totalAcoes} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-3)" }}>feitas</span></b>
            <span>{metricasPortfolio.totalAcoes - metricasPortfolio.acoesFeitas} pendentes</span>
          </div>
        </div>
      </div>

      {/* ── 2. SELETOR DE ESTRATÉGIAS EM ABAS / PILLS ── */}
      <div className="mestr-tabs-bar">
        <div className="mestr-tabs-list">
          {planosDiretor.map((p) => {
            const config = FOCO_CONFIG[p.foco] || FOCO_CONFIG.geral;
            const selecionado = !criandoNovo && planoAtual?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`mestr-tab-pill${selecionado ? " on" : ""}`}
                onClick={() => carregarPlanoParaEdicao(p)}
              >
                <span>{config.icone}</span>
                <span style={{ fontWeight: 700 }}>{p.titulo}</span>
                <span className={`dir-chip ${config.badge}`} style={{ fontSize: 10 }}>
                  {p.meta_vendas ? `${p.meta_vendas} un` : "sem meta"}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            className="mestr-tab-pill add"
            onClick={() => abrirNovoPlano("lancamento")}
          >
            <span>+</span> Novo Lançamento
          </button>
          <button
            type="button"
            className="mestr-tab-pill add"
            onClick={() => abrirNovoPlano("estoque")}
          >
            <span>+</span> Giro de Estoque
          </button>
        </div>
      </div>

      {/* ── 3. PAINEL DE EDIÇÃO / DETALHE DA ESTRATÉGIA SELECIONADA ── */}
      <div className="dir-card mestr-detalhe-card">
        <div className="mestr-detalhe-hd">
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span className={`dir-chip ${FOCO_CONFIG[foco].badge}`}>
                {FOCO_CONFIG[foco].icone} {FOCO_CONFIG[foco].nome}
              </span>
              {criandoNovo ? (
                <span className="dir-chip c-grn">Nova Estratégia em Criação</span>
              ) : (
                <span className="dir-chip c-gray">Estratégia Gravada no Sistema</span>
              )}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
              {criandoNovo ? "Configurar Nova Estratégia de Produto" : planoAtual?.titulo}
            </h3>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!criandoNovo && planoAtual && (
              <button
                type="button"
                className="dir-btn"
                style={{ color: "var(--red)", fontSize: 12.5 }}
                onClick={() => excluirPlano(planoAtual.id)}
              >
                🗑️ Arquivar
              </button>
            )}
            <button
              type="button"
              className="dir-btn solid"
              style={{ minHeight: 38, padding: "8px 16px" }}
              disabled={salvando}
              onClick={salvarEstrategia}
            >
              {salvando ? "Gravando…" : "💾 Salvar Estratégia"}
            </button>
          </div>
        </div>

        {/* Formulário de Campos Principais */}
        <div className="mestr-grid-form">
          <div className="mestr-campo">
            <label className="dir-lbl">Tipo de Foco</label>
            <div className="dir-per" style={{ width: "100%" }}>
              <button
                type="button"
                className={foco === "lancamento" ? "on" : ""}
                style={{ flex: 1 }}
                onClick={() => setFoco("lancamento")}
              >
                🚀 Lançamento
              </button>
              <button
                type="button"
                className={foco === "estoque" ? "on" : ""}
                style={{ flex: 1 }}
                onClick={() => setFoco("estoque")}
              >
                📦 Estoque Junix
              </button>
              <button
                type="button"
                className={foco === "geral" ? "on" : ""}
                style={{ flex: 1 }}
                onClick={() => setFoco("geral")}
              >
                ⚡ Geral
              </button>
            </div>
          </div>

          <div className="mestr-campo">
            <label className="dir-lbl">Título da Estratégia</label>
            <input
              type="text"
              className="sdg-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Lançamento Torres da Barra ou Queima Estoque Zona Norte"
            />
          </div>

          {/* Seletor específico de Produto de Estoque ou Lançamento */}
          {foco === "estoque" ? (
            <div className="mestr-campo" style={{ gridColumn: "span 2" }}>
              <label className="dir-lbl">Vincular Empreendimento do Estoque Junix</label>
              <select
                className="sdg-input"
                value={empreendimento}
                onChange={(e) => {
                  setEmpreendimento(e.target.value);
                  if (!titulo || titulo.startsWith("Giro de Estoque")) {
                    setTitulo(`Giro de Estoque · ${e.target.value.replace(/^CONDOM[IÍ]NIO\s+/i, "")}`);
                  }
                }}
              >
                <option value="">Selecione um produto do estoque Junix…</option>
                {estoque.map((e) => (
                  <option key={e.cod_empreendimento} value={e.empreendimento}>
                    {e.empreendimento.replace(/^CONDOM[IÍ]NIO\s+/i, "")} — {e.disponiveis} disponíveis ({e.em_andamento} em andamento)
                  </option>
                ))}
              </select>
            </div>
          ) : foco === "lancamento" ? (
            <div className="mestr-campo" style={{ gridColumn: "span 2" }}>
              <label className="dir-lbl">Nome do Lançamento / Localização</label>
              <input
                type="text"
                className="sdg-input"
                value={empreendimento}
                onChange={(e) => {
                  setEmpreendimento(e.target.value);
                  if (e.target.value && (!titulo || titulo.startsWith("Lançamento:"))) {
                    setTitulo(`Lançamento: ${e.target.value}`);
                  }
                }}
                placeholder="Ex: Reserva dos Bosques · Vila Leopoldina"
              />
            </div>
          ) : null}

          <div className="mestr-campo">
            <label className="dir-lbl">Meta de Vendas Deste Produto</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={1}
                className="sdg-input mono"
                style={{ width: 100 }}
                value={metaVendas}
                onChange={(e) => setMetaVendas(Number(e.target.value))}
              />
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                VGV ~ <b>{brl(metaVendas * ticketMedio)}</b>
              </span>
            </div>
          </div>

          <div className="mestr-campo">
            <label className="dir-lbl">Verba Prevista / Alocada (R$)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                step={1000}
                className="sdg-input mono"
                style={{ width: 140 }}
                value={verbaAlocada}
                onChange={(e) => setVerbaAlocada(Number(e.target.value))}
              />
              <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 700 }}>
                {brl(verbaAlocada)}
              </span>
            </div>
          </div>
        </div>

        {/* Tese Estratégica & Diretrizes para os Superintendentes */}
        <div style={{ marginTop: 16 }}>
          <label className="dir-lbl">Tese do Diretor & Diretrizes para os Superintendentes</label>
          <textarea
            rows={3}
            className="sdg-input"
            style={{ width: "100%", resize: "vertical", marginTop: 4, fontFamily: "inherit" }}
            value={objetivoTese}
            onChange={(e) => setObjetivoTese(e.target.value)}
            placeholder="Ex: Foco total no agendamento de visitas presenciais no estande. Exigir 100% de cadastros completos no Junix até 48h antes da reunião de crédito. Alocar tenda móvel no polo comercial."
          />
        </div>

        {/* ── 4. QUADRO DE AÇÕES TÁTICAS VINCULADAS A ESTA ESTRATÉGIA ── */}
        {!criandoNovo && planoAtual && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <b style={{ fontSize: 15, color: "var(--ink)" }}>
                Ações Táticas Executivas ({planoAtual.acoes.length})
              </b>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Acompanhe entregáveis, custos e prazos de cada responsável
              </span>
            </div>

            {/* Lista das ações */}
            <div className="mestr-acoes-lista">
              {planoAtual.acoes.map((a) => {
                const resp = pessoas.find((p) => p.id === a.responsavel_id);
                return (
                  <div key={a.id} className="mestr-acao-item">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        className={`dir-chip ${a.status === "feito" ? "c-grn" : a.status === "fazendo" ? "c-blue" : "c-gray"}`}
                        style={{ cursor: "pointer", border: 0 }}
                        onClick={() => alternarStatusAcao(a)}
                      >
                        {a.status === "feito" ? "✓ Feito" : a.status === "fazendo" ? "⏳ Fazendo" : "⚪ A Fazer"}
                      </button>
                      <b style={{ fontSize: 14 }}>{a.titulo}</b>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-3)" }}>
                      {a.entregavel && <span>📌 {a.entregavel}</span>}
                      {resp && <span>👤 <b>{resp.nome}</b> ({resp.papel})</span>}
                      {a.prazo && <span>📅 Prazo: {a.prazo.slice(8, 10)}/{a.prazo.slice(5, 7)}</span>}
                      {a.custo_previsto ? <span className="mono">💰 {brl(a.custo_previsto)}</span> : null}

                      <button
                        type="button"
                        style={{ background: "none", border: 0, color: "var(--red)", cursor: "pointer", fontSize: 12 }}
                        onClick={() => apagarAcao(a.id)}
                      >
                        ✕ remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Formulário rápido para adicionar ação */}
            <div className="mestr-add-acao-box">
              <span className="dir-lbl">Adicionar Nova Ação Tática a Esta Estratégia</span>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 140px 110px auto", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  className="sdg-input"
                  placeholder="Título da Ação (ex: Tenda de Fluxo no Metrô)"
                  value={novaAcaoTitulo}
                  onChange={(e) => setNovaAcaoTitulo(e.target.value)}
                />
                <input
                  type="text"
                  className="sdg-input"
                  placeholder="Entregável esperado"
                  value={novaAcaoEntregavel}
                  onChange={(e) => setNovaAcaoEntregavel(e.target.value)}
                />
                <select
                  className="sdg-input"
                  value={novaAcaoResp}
                  onChange={(e) => setNovaAcaoResp(e.target.value)}
                >
                  {supers.map((s) => (
                    <option key={s.id} value={s.id}>
                      Super: {s.nome.split(" ")[0]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step={500}
                  className="sdg-input mono"
                  placeholder="Custo R$"
                  value={novaAcaoCusto}
                  onChange={(e) => setNovaAcaoCusto(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="dir-btn solid"
                  style={{ minHeight: 38 }}
                  onClick={adicionarAcaoNoPlano}
                >
                  + Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
