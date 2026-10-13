/* Sala de Guerra Estratégica: Planejamento de Campanha com os Superintendentes.
 * Permite ao Diretor e Supers definirem em reunião:
 *   - Verba total de investimento e meta de vendas esperada;
 *   - Equipes envolvidas (Superintendências e seus corretores);
 *   - Cardápio de Ações Táticas: Anúncio, Ações de Rua, PAP, Oferta Ativa e Prêmios da Tropa;
 *   - Projeção de ROI da IA (Leads, Visitas, Vendas, Custo por Venda e VGV);
 *   - Fechamento de acordo e envio formal via WhatsApp para cada Super.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SuperDiretoria } from "@/hooks/useDiretoria";
import { usePlanoAcoes } from "@/hooks/usePlano";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const v1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");
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
  const mesAtual = inicioMes();
  const [mes, setMes] = useState(mesAtual);

  const [titulo, setTitulo] = useState(`Campanha de Aceleração · ${nomeMes(mesAtual)}`);
  const [verbaTotal, setVerbaTotal] = useState(26000);
  const [metaVendas, setMetaVendas] = useState(40);
  const [ticketMedio, setTicketMedio] = useState(250000);

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

  // Alocação da verba nas ações
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

    // Estimativas de produção
    const leadsAnuncio = Math.round(aAnuncio / 28);
    const vendasAnuncio = Math.round(leadsAnuncio * 0.022 * 10) / 10;

    const diasRua = Math.round(aRua / 500);
    const visitasRua = diasRua * 6;
    const vendasRua = Math.round(visitasRua * 0.12 * 10) / 10;

    const pastasPap = Math.round(aPap / 400);
    const vendasPap = Math.round(pastasPap * 0.40 * 10) / 10;

    const vendasAtiva = Math.round((aAtiva / 650) * 10) / 10;

    // Fator multiplicador de premiação da equipe (+0% a +30%)
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

  // Equipes ativas e cotas proporcionais
  const equipesAtivas = useMemo(
    () => supers.filter((s) => supersSelecionados.has(s.id)),
    [supers, supersSelecionados]
  );

  const totalCorretoresAtivos = useMemo(
    () => equipesAtivas.reduce((acc, s) => acc + s.gerentes.flatMap((g) => g.corretores_lista).length, 0),
    [equipesAtivas]
  );

  // Modal de visualização dos acordos do WhatsApp
  const [modalWpp, setModalWpp] = useState<{
    superNome: string;
    telefone: string | null;
    mensagem: string;
  } | null>(null);

  const [salvando, setSalvando] = useState(false);

  // Salvar a campanha no sistema (nas tabelas de planos, ações e gastos)
  async function salvarCampanha() {
    if (!titulo.trim()) {
      toast.error("Informe um nome para a campanha.");
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
          objetivo: `Ofensiva com ${equipesAtivas.length} superintendências. Verba total de ${brl(verbaTotal)}.`,
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
          await supabase.from("plano_acoes" as any).insert({
            plano_id: planoId,
            titulo: `${a.nome}: investimento de ${brl(valor)}`,
            entregavel: a.comoMede,
            custo_previsto: valor,
            status: "a_fazer",
            nota: `Equipes envolvidas: ${equipesAtivas.map((s) => s.nome).join(", ")}`,
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

      toast.success("Campanha e ações estratégicas gravadas com sucesso no sistema!");
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

    return `Fala ${s.nome.split(" ")[0]}, alinhamento fechado da nossa Reunião Estratégica:

🎯 *Campanha:* ${titulo}
📅 *Período:* ${nomeMes(mes)}
💰 *Verba Alocada para sua equipe:* ${brl(verbaSuper)}
🏁 *Sua Meta de Vendas:* ${metaSuper} unidades
👥 *Sua Tropa:* ${corretoresSuper} corretores escalados

📌 *Frentes de Ação Aprovadas:*
${alocacoes.anuncio > 0 ? `• Anúncios Digitais: foco em geração de leads\n` : ""}${alocacoes.rua > 0 ? `• Ações de Rua & Tenda: plantão ativo em campo\n` : ""}${alocacoes.pap > 0 ? `• PAP & Parcerias: captação ativa de propostas\n` : ""}${alocacoes.oferta_ativa > 0 ? `• Oferta Ativa: reativação da carteira fria\n` : ""}${alocacoes.premios > 0 ? `• Prêmios da Tropa: incentivo direto para quem aprovar pasta\n` : ""}
Vamos para cima! O que você precisa de mim para rodar essa máquina a partir de amanhã?`;
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
            Defina o investimento, selecione as equipes, distribua o cardápio de ações táticas e calcule o retorno esperado em vendas.
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

      {/* ── CONFIGURAÇÃO DE INVESTIMENTO & META ── */}
      <div className="sdg-grid-config">
        <div className="sdg-box">
          <label className="dir-lbl">Nome da Ofensiva / Campanha</label>
          <input
            type="text"
            className="sdg-input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Ofensiva Orla & Fechamento"
          />
        </div>

        <div className="sdg-box">
          <label className="dir-lbl">Verba Total Disponível (R$)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              step={1000}
              className="sdg-input mono"
              value={verbaTotal}
              onChange={(e) => setVerbaTotal(Number(e.target.value))}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--teal)" }}>
              {brl(verbaTotal)}
            </span>
          </div>
        </div>

        <div className="sdg-box">
          <label className="dir-lbl">Meta de Vendas Alvo</label>
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
      </div>

      {/* ── 1. SELEÇÃO DE EQUIPES ENVOLVIDAS ── */}
      <div className="sdg-sec">
        <div className="sdg-sec-title">
          <span>1. Equipes Envolvidas na Ofensiva</span>
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

      {/* ── 2. CARDÁPIO DE AÇÕES TÁTICAS (ALOCAÇÃO DA VERBA) ── */}
      <div className="sdg-sec">
        <div className="sdg-sec-title">
          <span>2. Mix de Ações Táticas (Distribuição da Verba)</span>
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

            return (
              <div key={a.key} className="sdg-acao-row">
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. PAINEL PREDITIVO DA IA (RETORNO ESTIMADO & ROI) ── */}
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
      </div>

      {/* ── 4. BOTÕES DE FECHAMENTO & DISPARO PARA OS SUPERS ── */}
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
              onClick={() => setModalWpp({
                superNome: s.nome,
                telefone: s.phone ?? null,
                mensagem: gerarMensagemSuper(s),
              })}
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
          {salvando ? "Gravando no Sistema…" : "💾 Salvar Campanha no Sistema"}
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
                rows={9}
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
