import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useMetasDiretoria } from "@/hooks/useDiretoria";
import { useEscopoSuper } from "./escopo";
import { useNumerosSuper, type LinhaSuper } from "./numeros";
import { usePeriodoSuper, SeletorPeriodoSuper, diaSP } from "./Periodo";
import CadastrarGerente from "@/components/superintendente/CadastrarGerente";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import "@/styles/cockpit-gerente.css";
import { enviarPeloMeuChip } from "@/hooks/useCobrarPessoa";

const sb = supabase as any;
const nf = (n: number) => (n ?? 0).toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const curto = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${Math.round(n / 1e3)} mil` : brl(n));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const inicioMes = (d = 0) => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth() + d, 1).toISOString().slice(0, 10); };
const nomeMes = (m: string) => new Date(m + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

export default function PainelGeral({ superId, superNome, onAbrir, irPara }: {
  superId: string; superNome: string; onAbrir: (id: string) => void; irPara: (aba: string) => void;
}) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const p = usePeriodoSuper("7d");
  const { supers, pastas, carregando } = useEscopoSuper(superId, p.dias);
  const { data: num, isFetching } = useNumerosSuper(supers, pastas, p.janela.de, p.janela.ate);
  const [desloc, setDesloc] = useState(0);
  const [modalGerenteAberto, setModalGerenteAberto] = useState(false);
  const [modalCorretorAberto, setModalCorretorAberto] = useState(false);
  const [canalFunil, setCanalFunil] = useState<"todos" | "anuncio" | "disparo" | "pescados">("todos");
  const [modoTabelaEquipes, setModoTabelaEquipes] = useState<"tabela" | "cards">("tabela");
  const mes = inicioMes(desloc);
  const { data: metas } = useMetasDiretoria(superId, mes);
  const gerentes = useMemo(() => supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome)), [supers]);

  const s0 = useMemo(() => ({
    plantaoSemLogin: Object.assign({}, ...supers.map((s) => s.plantaoSemLogin ?? {})) as Record<string, string[]>,
    logadosHoje: Object.assign({}, ...supers.map((s) => s.logadosHoje ?? {})) as Record<string, boolean>,
  }), [supers]);

  const { data: extra } = useQuery({
    queryKey: ["s2-painel-extra", gerentes.map((g) => g.id).join(",")], enabled: gerentes.length > 0, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: ps } = await sb.from("profiles").select("id,phone,bot_instance_id").in("id", gerentes.map((g) => g.id));
      const bots = (ps ?? []).map((x: any) => x.bot_instance_id).filter(Boolean);
      const { data: bi } = bots.length ? await sb.from("bot_instances").select("id,real_state").in("id", bots) : { data: [] };
      const estado = new Map((bi ?? []).map((b: any) => [b.id, b.real_state]));
      const { data: comp } = await sb.rpc("anuncios_comparativo");
      return {
        fone: new Map((ps ?? []).map((x: any) => [x.id, x.phone as string | null])),
        chip: new Map((ps ?? []).map((x: any) => [x.id, x.bot_instance_id ? estado.get(x.bot_instance_id) === "open" : false])),
        alertas: new Map(((comp ?? []) as any[]).map((r) => [r.dono_id, r.alertas as number])),
      };
    },
  });

  const { data: fbSaude } = useQuery({
    queryKey: ["s2-fb-saude"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("fb_saude" as any).select("account_id,dono_id,dados,atualizado_em");
      return (data ?? []) as any[];
    },
  });

  async function definir(id: string, n: number, nome: string) {
    const { error } = await sb.rpc("definir_meta", { p_mes: mes, p_dono: id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${nome} em ${nomeMes(mes)}: ${n} venda${n === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  }

  async function cobrar(gerenteId: string, gerenteNome: string, motivo: string, texto: string) {
    await enviarPeloMeuChip({ paraId: gerenteId, rotulo: gerenteNome, mensagem: texto, motivo });
  }

  // Meta do mês da Superintendência
  const d = metas?.dono;
  const realizado = d?.realizado ?? 0;
  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = desloc === 0 ? Math.round((realizado / Math.max(1, hoje.getDate())) * diasMes) : null;
  const pctMeta = d?.meta ? Math.min(100, Math.round((realizado / d.meta) * 100)) : 0;
  const diasUteisRestantes = Math.max(1, Math.round((diasMes - hoje.getDate()) * (5 / 7)));
  const porDia = d?.meta ? Math.max(0, (d.meta - realizado) / diasUteisRestantes).toFixed(1) : "—";
  const filhos = (metas?.filhos ?? []).filter((f: any) => !/revisor/i.test(f.nome));
  const somaFilhos = filhos.reduce((a: number, f: any) => a + (f.meta ?? 0), 0);

  // Alertas Táticos "Decida Hoje"
  const linhaDe = (id: string) => num?.linhas.find((l) => l.id === id);
  type Dec = { id: string; peso: number; tipo: string; quem: string; titulo: string; porque: string; acoes: [string, () => void][] };
  const decs: Dec[] = [];

  for (const g of gerentes) {
    const l = linhaDe(g.id);
    if (l && l.carteiraSemToque >= 10) {
      decs.push({
        id: `toque:${g.id}`,
        peso: l.carteiraSemToque,
        tipo: "LEADS SEM TOQUE",
        quem: g.nome,
        titulo: `${nf(l.carteiraSemToque)} leads na equipe do ${g.nome} sem nenhum contato`,
        porque: "Leads pagos esfriam em até 48h sem atendimento pelo corretor.",
        acoes: [
          [`Cobrar ${g.nome}`, () => cobrar(g.id, g.nome, "leads sem toque", `${g.nome}, a sua equipe tem ${nf(l.carteiraSemToque)} leads novos sem nenhum contato no Comandra. Consegue fazer a equipe chamar todos hoje até as 14h?`)],
          [`Abrir painel do ${g.nome}`, () => onAbrir(g.id)],
        ],
      });
    }

    // Detector de Corretor Fominha (Roleta Desbalanceada)
    for (const c of g.corretores_lista ?? []) {
      const taxaConversa = c.leads_periodo > 0 ? (c.em_conversa / c.leads_periodo) : 1;
      if (c.leads_periodo >= 6 && (taxaConversa <= 0.4 || c.em_conversa === 0)) {
        const semAtendimento = c.leads_periodo - c.em_conversa;
        decs.push({
          id: `fominha:${c.id}`,
          peso: c.leads_periodo * 10,
          tipo: "ROLETA DESBALANCEADA",
          quem: `${c.nome} (Eq. ${g.nome})`,
          titulo: `${c.nome} pegou ${c.leads_periodo} leads, mas ${semAtendimento} estão no vácuo`,
          porque: "O corretor está acumulando leads novos da roleta e não está dando vazão, prejudicando o restante da equipe.",
          acoes: [
            [`Cobrar ${g.nome}`, () => cobrar(
              g.id,
              g.nome,
              "roleta desbalanceada",
              `${g.nome}, o corretor ${c.nome} da sua equipe puxou ${c.leads_periodo} leads ${p.texto} e ${semAtendimento} continuam sem conversa. Ele está travando a roleta da equipe. Consegue redistribuir a carteira dele ou pausar ele na roleta hoje?`
            )],
            [`Abrir equipe ${g.nome}`, () => onAbrir(g.id)],
          ],
        });
      }
    }
  }

  // Desperdício de DDD Errado / Fora da Região (fb_saude)
  // só as contas da própria árvore (o super, os gerentes dele e os corretores deles): um super não vê a conta do outro (21/10)
  const daArvore = new Set<string>([superId, ...supers.map((s: any) => s.id), ...gerentes.map((g) => g.id),
    ...gerentes.flatMap((g: any) => (Array.isArray(g.corretores) ? g.corretores : []).map((c: any) => c?.id).filter(Boolean))]);
  for (const row of fbSaude ?? []) {
    const dadosRow = row.dados;
    const donoRow = row.dono_id ?? dadosRow?.dono_id;
    if (!donoRow || !daArvore.has(donoRow)) continue;
    const fora = dadosRow?.comandra?.fora_regiao ?? 0;
    if (fora >= 4) {
      decs.push({
        id: `ddd:${dadosRow.dono_id || row.account_id}`,
        peso: fora * 12,
        tipo: "DESPERDÍCIO DE MÍDIA",
        quem: dadosRow.dono || "Gestor de Tráfego",
        titulo: `${fora} leads com DDD fora da região na conta de anúncios`,
        porque: "Verba gasta com cliques e leads de outros estados que não compram nessa praça. Necessário rever a segmentação geográfica.",
        acoes: [
          ["Copiar para Gestor", () => {
            const txt = `Fala gestor! Identificamos ${fora} leads com DDD fora da nossa região de atendimento na campanha. Favor ajustar a exclusão de localização geográfica para evitar desperdício de verba.`;
            navigator.clipboard.writeText(txt);
            toast.success("Mensagem técnica copiada para enviar ao gestor!");
          }],
          ["Ver Mídia", () => irPara("midia")],
        ],
      });
    }
  }

  const decida = decs.sort((a, b) => b.peso - a.peso).slice(0, 3);
  const t = num?.total;

  const leadsFunil = canalFunil === "todos"
    ? (t?.leadsTot ?? 0)
    : canalFunil === "anuncio"
    ? (t?.leads.anuncio ?? 0)
    : canalFunil === "disparo"
    ? (t?.leads.disparo ?? 0)
    : (t?.leads.pescados ?? 0);

  const funil = t ? [
    {
      nome: canalFunil === "todos" ? "Leads que entraram" : `Leads (${canalFunil})`,
      n: leadsFunil,
      obs: canalFunil === "todos"
        ? `${nf(t.leads.anuncio)} anúncio · ${nf(t.leads.disparo)} disparo · ${nf(t.leads.pescados)} pescados`
        : `${pct(leadsFunil, t.leadsTot)}% do tráfego total`,
    },
    { nome: "Atendidos pelo corretor", n: t.atendidos, obs: `${pct(t.atendidos, Math.max(1, leadsFunil))}% dos leads` },
    { nome: "Visitas comparecidas (C2S)", n: t.visitas, obs: `${nf(t.plantaoDias)} corretor-dias no plantão` },
    { nome: "Pastas novas (Junix)", n: t.pastasNovas, obs: "cadastradas no período" },
    { nome: "Vendas confirmadas (Junix)", n: t.vendas, obs: t.vgv ? `${curto(t.vgv)} em VGV` : "no período" },
  ] : [];
  const maxF = Math.max(1, ...funil.map((f) => f.n));

  const funilGargalo = useMemo(() => {
    if (!t || t.leadsTot < 5) return null;
    if (t.atendidos / Math.max(1, t.leadsTot) < 0.6) {
      return "Gargalo no 1º Contato: Mais de 40% dos leads estão esperando o corretor chamar.";
    }
    if (t.atendidos >= 8 && (t.visitas / Math.max(1, t.atendidos)) < 0.08) {
      return "Gargalo no Agendamento: Baixa conversão de conversa em visita presencial no C2S.";
    }
    if (t.visitas >= 5 && (t.pastasNovas / Math.max(1, t.visitas)) < 0.25) {
      return "Gargalo no Crédito: Visitas comparecidas não estão avançando para montagem de pasta na Caixa.";
    }
    return null;
  }, [t]);

  const gargalo = (l?: LinhaSuper) => {
    if (!l) return null;
    if (l.leadsTot >= 5 && l.atendidos / l.leadsTot < 0.5) return ["ATENDIMENTO", "Metade dos leads nem foi chamada."];
    if (l.plantaoDias >= 10 && !l.visitas) return ["VISITA", "Tem plantão, mas não vira visita registrada."];
    if (l.visitas >= 3 && !l.vendas) return ["FECHAMENTO", "Tem visita, mas não vira pasta nem venda."];
    return null;
  };

  return (
    <div className="cockpit-v3">
      {/* ── CABEÇALHO DO COCKPIT NO PADRÃO DO GERENTE ── */}
      <header className="cockpit-v3-header">
        <div className="cockpit-v3-title">
          <h1>Cockpit de Gestão da Superintendência</h1>
          <p>Superintendência · {superNome} · Gestão consolidada de equipes, canais de leads e esteira de fechamento</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-queima-primario"
            style={{ background: "var(--cv-brand)", color: "#fff", boxShadow: "none" }}
            onClick={() => setModalGerenteAberto(true)}
          >
            <span>👔</span> + Cadastrar Gerente
          </button>
          <button
            type="button"
            className="btn-queima-secundario"
            onClick={() => setModalCorretorAberto(true)}
          >
            <span>👤</span> + Cadastrar Corretor
          </button>

          <div className="periodo-bar-v3">
            {(["hoje", "ontem", "7d", "30d", "datas"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`periodo-btn-v3 ${p.per === k ? "active" : ""}`}
                onClick={() => p.setPer(k)}
              >
                {k === "hoje" ? "Hoje" : k === "ontem" ? "Ontem" : k === "7d" ? "7 dias" : k === "30d" ? "Mês" : "Datas"}
              </button>
            ))}
            {p.per === "datas" && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 6px" }}>
                <input
                  type="date"
                  className="date-custom-input-v3"
                  value={p.janela.de}
                  max={p.janela.ate}
                  onChange={(e) => p.setDe(e.target.value)}
                  aria-label="De"
                />
                <span style={{ fontSize: 11, color: "var(--cv-text-muted)" }}>até</span>
                <input
                  type="date"
                  className="date-custom-input-v3"
                  value={p.janela.ate}
                  min={p.janela.de}
                  max={diaSP(0)}
                  onChange={(e) => p.setAte(e.target.value)}
                  aria-label="Até"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── ALERTA DE DECIDA HOJE (ROLETA, DDD OU ATENDIMENTO) ── */}
      {decida.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {decida.map((dItem) => (
            <div key={dItem.id} className="alerta-queima-caixa">
              <div className="alerta-queima-conteudo">
                <div className="alerta-queima-icone">
                  
                </div>
                <div className="alerta-queima-texto">
                  <div className="alerta-queima-titulo">
                    <span className="badge-risco-financeiro">{dItem.tipo}</span>
                    <b>{dItem.titulo}</b>
                    <span style={{ fontSize: 12, color: "var(--cv-text-muted)" }}>({dItem.quem})</span>
                  </div>
                  <p className="alerta-queima-sub">{dItem.porque}</p>
                </div>
              </div>
              <div className="alerta-queima-acoes">
                {dItem.acoes.map(([label, action], idx) => (
                  <button
                    key={label}
                    type="button"
                    className={idx === 0 ? "btn-queima-primario" : "btn-queima-secundario"}
                    onClick={action}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BLOCO 1: PLACAR HERO DO MÊS (JUNIX) ── */}
      <section className="hero-placar-v3">
        {/* Vendas do Mês da Superintendência */}
        <div className="kpi-card-v3 destaque">
          <span className="kpi-title-v3">Vendas Confirmadas (Junix)</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: "var(--cv-brand)" }}>{realizado}</span>
            <span style={{ fontSize: 18, color: "var(--cv-text-muted)", fontWeight: 500 }}>
              / {d?.meta ?? "—"} un
            </span>
          </div>
          <div className="progress-bar-wrap-v3">
            <div
              className="progress-bar-fill-v3"
              style={{ width: `${pctMeta}%` }}
            />
          </div>
          <span className="kpi-sub-v3">
            VGV Total: <b className="mono" style={{ color: "var(--cv-text-main)" }}>{curto(t?.vgv ?? 0)}</b>
          </span>
        </div>

        {/* Ritmo e Projeção */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Projeção de Fechamento</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: projecao && d?.meta && projecao >= d.meta ? "var(--cv-green)" : "var(--cv-amber)" }}>
              {projecao ?? "—"}
            </span>
            <span style={{ fontSize: 15, color: "var(--cv-text-muted)", fontWeight: 500 }}>vendas</span>
          </div>
          <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
            Ritmo: <b className="mono">{porDia} un/dia útil</b> · {projecao && d?.meta && projecao >= d.meta ? "No ritmo" : "Abaixo do ritmo"}
          </span>
        </div>

        {/* Leads Recebidos no Período Selecionado */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Leads no Período Selecionado</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: "var(--cv-blue)" }}>{t?.leadsTot ?? 0}</span>
            <span style={{ fontSize: 14, color: "var(--cv-text-muted)", fontWeight: 500 }}>
              {p.texto}
            </span>
          </div>
          <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
            <b>{t?.atendidos ?? 0} atendidos</b> ·{" "}
            <span style={{ color: (t?.carteiraSemToque ?? 0) > 0 ? "var(--cv-rose)" : "var(--cv-green)", fontWeight: 700 }}>
              {t?.carteiraSemToque ?? 0} sem toque
            </span>
          </span>
        </div>

        {/* Poder de Fogo (Mídia & Anúncios) */}
        <div className="kpi-card-v3">
          <span className="kpi-title-v3">Poder de Fogo (Mídia Meta)</span>
          <div className="kpi-val-v3 mono">
            <span style={{ color: "var(--cv-brand)" }}>{t ? curto(t.gasto) : "—"}</span>
          </div>
          <span className="kpi-sub-v3" style={{ marginTop: 6 }}>
            <b>{t?.leadsFb ?? 0} leads de anúncio</b> · <span className="mono">{t?.leadsFb && t?.gasto ? brl(t.gasto / t.leadsFb) : "—"}/lead</span>
          </span>
        </div>
      </section>

      {/* ── BLOCO 2: FUNIL MACRO DA SUPERINTENDÊNCIA ── */}
      <section className="leads-section-v3">
        <div className="leads-header-v3">
          <div className="leads-title-v3">
            <h2>Esteira de Fechamento da Superintendência</h2>
            <span>Acompanhamento da conversão de ponta a ponta: do clique no anúncio até a pasta e venda</span>
          </div>
          {funilGargalo && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--cv-rose)", background: "var(--cv-rose-light)", padding: "5px 12px", borderRadius: "var(--cv-radius-full)" }}>
              {funilGargalo}
            </span>
          )}
        </div>

        {/* Filtros por Origem do Lead */}
        <div className="origem-pills-bar-v3">
          <button
            type="button"
            className={`origem-pill-btn-v3 ${canalFunil === "todos" ? "active" : ""}`}
            onClick={() => setCanalFunil("todos")}
          >
            Todos os Canais <span className="mono">{t?.leadsTot ?? 0}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${canalFunil === "anuncio" ? "active" : ""}`}
            onClick={() => setCanalFunil("anuncio")}
          >
            Anúncios Meta Ads <span className="mono">{t?.leads.anuncio ?? 0}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${canalFunil === "disparo" ? "active" : ""}`}
            onClick={() => setCanalFunil("disparo")}
          >
            Disparos Ativos <span className="mono">{t?.leads.disparo ?? 0}</span>
          </button>
          <button
            type="button"
            className={`origem-pill-btn-v3 ${canalFunil === "pescados" ? "active" : ""}`}
            onClick={() => setCanalFunil("pescados")}
          >
            🎣 Pescados / Carteira <span className="mono">{t?.leads.pescados ?? 0}</span>
          </button>
        </div>

        {/* Grade de Etapas do Funil */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 14 }}>
          {funil.map((etapa, idx) => {
            const pctBarra = maxF > 0 ? Math.round((etapa.n / maxF) * 100) : 0;
            return (
              <div
                key={etapa.nome}
                style={{
                  background: "var(--cv-surface-subtle)",
                  border: "1px solid var(--cv-border)",
                  borderRadius: "var(--cv-radius-md)",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--cv-text-muted)" }}>
                    Etapa {idx + 1}
                  </span>
                  <b style={{ display: "block", fontSize: 14, color: "var(--cv-text-main)", marginTop: 2 }}>
                    {etapa.nome}
                  </b>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 4px", color: idx === funil.length - 1 ? "var(--cv-brand)" : "var(--cv-text-main)" }}>
                    {nf(etapa.n)}
                  </div>
                  <div className="progress-bar-wrap-v3" style={{ height: 5, margin: "6px 0" }}>
                    <div
                      className="progress-bar-fill-v3"
                      style={{
                        width: `${pctBarra}%`,
                        background: idx === funil.length - 1 ? "var(--cv-brand)" : "var(--cv-blue)",
                      }}
                    />
                  </div>
                </div>
                <small style={{ fontSize: 11.5, color: "var(--cv-text-muted)", marginTop: 4 }}>
                  {etapa.obs}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── BLOCO 3: RAIO-X COMPARATIVO DE EQUIPES ── */}
      <section className="tropa-section-v3">
        <div className="tropa-header-v3">
          <div className="tropa-title-v3">
            <h2>Raio-X Comparativo de Equipes</h2>
            <span>Desempenho por gerente, canais de leads, eficiência de atendimento e fechamento de vendas</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`origem-pill-btn-v3 ${modoTabelaEquipes === "tabela" ? "active" : ""}`}
              onClick={() => setModoTabelaEquipes("tabela")}
            >
              Tabela Comparativa
            </button>
            <button
              type="button"
              className={`origem-pill-btn-v3 ${modoTabelaEquipes === "cards" ? "active" : ""}`}
              onClick={() => setModoTabelaEquipes("cards")}
            >
              🗂️ Visão em Cartões
            </button>
          </div>
        </div>

        {modoTabelaEquipes === "tabela" ? (
          <div className="tropa-table-container-v3" style={{ overflowX: "auto" }}>
            <table className="tropa-table-v3" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Gerente</th>
                  <th style={{ textAlign: "center" }}>Corretores</th>
                  <th className="mono" style={{ textAlign: "right" }} title="Leads de formulários Meta Ads">Anúncio</th>
                  <th className="mono" style={{ textAlign: "right" }} title="Disparos ativos de WhatsApp">Disparo</th>
                  <th className="mono" style={{ textAlign: "right" }} title="Presença no plantão C2S">🏢 Plantão</th>
                  <th className="mono" style={{ textAlign: "right" }} title="Pescados e outras fontes">🌐 Outros</th>
                  <th className="mono" style={{ textAlign: "right", fontWeight: 700 }}>Total Leads</th>
                  <th style={{ textAlign: "center" }}>% Atendidos</th>
                  <th style={{ textAlign: "center" }}>Sem Toque</th>
                  <th className="mono" style={{ textAlign: "right" }}>Visitas</th>
                  <th className="mono" style={{ textAlign: "right" }}>Pastas</th>
                  <th className="mono" style={{ textAlign: "right" }}>Vendas (VGV)</th>
                  <th style={{ textAlign: "center" }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {gerentes.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: "center", padding: 30, color: "var(--cv-text-muted)" }}>
                      Nenhuma equipe subordinada encontrada nesta superintendência.
                    </td>
                  </tr>
                ) : (
                  gerentes.map((g) => {
                    const l = linhaDe(g.id);
                    const gg = gargalo(l);
                    const atendPct = l ? pct(l.atendidos, l.leadsTot) : 0;
                    return (
                      <tr key={g.id}>
                        <td>
                          <div className="broker-cell-v3">
                            <div className="avatar-clean-v3">
                              {g.nome.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="broker-name-box-v3">
                              <b>{g.nome}</b>
                              {gg && (
                                <span className="mini-badge-v3 offline" style={{ background: "var(--cv-rose-light)", color: "var(--cv-rose)", fontWeight: 700 }}>
                                  {gg[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.corretores}</span>
                          <span style={{ fontSize: 11, color: "var(--cv-text-muted)", display: "block" }}>
                            ({g.online} online)
                          </span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{l?.leads.anuncio ?? "—"}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{l?.leads.disparo ?? "—"}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{l?.plantaoDias ? `${l.plantaoDias}d` : "—"}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{(l?.leads.pescados ?? 0) + (l?.leads.outros ?? 0)}</td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{l?.leadsTot ?? "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: atendPct < 60 ? "var(--cv-rose)" : "var(--cv-green)",
                            }}
                          >
                            {l ? `${atendPct}%` : "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 12.5,
                              fontWeight: (l?.carteiraSemToque ?? 0) > 0 ? 800 : 500,
                              color: (l?.carteiraSemToque ?? 0) > 0 ? "var(--cv-rose)" : "var(--cv-text-muted)",
                            }}
                          >
                            {l?.carteiraSemToque ?? "0"}
                          </span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{l?.visitas ?? "0"}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{l?.pastasNovas ?? "0"}</td>
                        <td style={{ textAlign: "right" }}>
                          <b className="mono" style={{ color: l?.vendas ? "var(--cv-green)" : "inherit" }}>
                            {l?.vendas ?? "0"}
                          </b>
                          {l?.vgv ? (
                            <small style={{ display: "block", fontSize: 11, color: "var(--cv-text-muted)" }}>
                              {curto(l.vgv)}
                            </small>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                            <button
                              type="button"
                              className="btn-queima-primario"
                              style={{ padding: "4px 8px", fontSize: 11, background: "var(--cv-brand)", boxShadow: "none" }}
                              onClick={() => onAbrir(g.id)}
                              title="Entrar no painel desta equipe"
                            >
                              Abrir
                            </button>
                            {gg && (
                              <button
                                type="button"
                                className="btn-queima-secundario"
                                style={{ padding: "4px 8px", fontSize: 11, color: "var(--cv-green)" }}
                                onClick={() => cobrar(g.id, g.nome, gg[0], `${g.nome}, no Raio-X da superintendência identificamos um gargalo em ${gg[0]}: ${gg[1]} Como podemos resolver isso hoje com os corretores?`)}
                                title="Cobrar gerente no WhatsApp"
                              >
                                Cobrar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {gerentes.map((g) => {
              const l = linhaDe(g.id);
              const gg = gargalo(l);
              const atendPct = l ? pct(l.atendidos, l.leadsTot) : 0;
              return (
                <div
                  key={g.id}
                  style={{
                    background: "var(--cv-surface)",
                    border: "1px solid var(--cv-border)",
                    borderRadius: "var(--cv-radius-md)",
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <b style={{ fontSize: 16, color: "var(--cv-text-main)" }}>{g.nome}</b>
                      <span style={{ display: "block", fontSize: 12, color: "var(--cv-text-muted)" }}>
                        {g.corretores} corretores · {g.online} online agora
                      </span>
                    </div>
                    {gg && (
                      <span className="mini-badge-v3 offline" style={{ background: "var(--cv-rose-light)", color: "var(--cv-rose)", fontWeight: 700 }}>
                        {gg[0]}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, background: "var(--cv-surface-subtle)", padding: "10px 12px", borderRadius: 8 }}>
                    <div>
                      <small style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Leads</small>
                      <b className="mono" style={{ display: "block", fontSize: 16 }}>{l?.leadsTot ?? 0}</b>
                    </div>
                    <div>
                      <small style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Atendidos</small>
                      <b className="mono" style={{ display: "block", fontSize: 16, color: atendPct < 60 ? "var(--cv-rose)" : "var(--cv-green)" }}>
                        {atendPct}%
                      </b>
                    </div>
                    <div>
                      <small style={{ fontSize: 11, color: "var(--cv-text-muted)", textTransform: "uppercase" }}>Sem Toque</small>
                      <b className="mono" style={{ display: "block", fontSize: 16, color: (l?.carteiraSemToque ?? 0) > 0 ? "var(--cv-rose)" : "inherit" }}>
                        {l?.carteiraSemToque ?? 0}
                      </b>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 12, color: "var(--cv-text-muted)" }}>Vendas: </span>
                      <b className="mono" style={{ fontSize: 14, color: "var(--cv-green)" }}>{l?.vendas ?? 0} un</b>
                      {l?.vgv ? <span style={{ fontSize: 11, color: "var(--cv-text-muted)" }}> ({curto(l.vgv)})</span> : null}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn-queima-primario"
                        style={{ padding: "5px 10px", fontSize: 12, background: "var(--cv-brand)", boxShadow: "none" }}
                        onClick={() => onAbrir(g.id)}
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        className="btn-queima-secundario"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={() => cobrar(g.id, g.nome, "alinhamento", `${g.nome}, como está o andamento da equipe hoje? Vi os números da sua esteira aqui no painel da superintendência.`)}
                      >
                        Cobrar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modais de Cadastro de Gerente e Corretor */}
      {modalGerenteAberto && (
        <CadastrarGerente
          superId={superId}
          superNome={superNome}
          onFechar={() => setModalGerenteAberto(false)}
          onPronto={() => {
            setModalGerenteAberto(false);
            qc.invalidateQueries({ queryKey: ["diretoria"] });
          }}
        />
      )}
      {modalCorretorAberto && (
        <CadastrarCorretor
          managerId={gerentes[0]?.id || superId}
          gerentes={gerentes.map((g) => ({ id: g.id, nome: g.nome }))}
          onFechar={() => setModalCorretorAberto(false)}
          onPronto={() => {
            setModalCorretorAberto(false);
            qc.invalidateQueries({ queryKey: ["diretoria"] });
          }}
        />
      )}
    </div>
  );
}
