// ONDE ATACAR v3 — Vitrine Tática de Estoque e Calculadora Caixa
//
// Identifica instantaneamente onde o cliente CONSEGUE comprar pela matemática
// real da Caixa Econômica Federal (financiamento aprovado + subsídio MCMV).

import { useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import {
  useEstrategiaFecha,
  useUnidades,
  entradaUnidade,
  liberadoUnidade,
  TETO_MCMV,
  type ProjetoFecha,
} from "@/hooks/useEstrategia";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Sparkles,
  DollarSign,
  TrendingUp,
  MessageCircle,
  Search,
  Filter,
  Users,
  X,
  ExternalLink,
  Copy,
} from "lucide-react";
import "@/styles/cockpit-gerente.css";
import "@/styles/estrategia-gerente.css";

const brl = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");
const brlk = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(n) / 1000) + "k";

const TETO_FAIXA: Record<string, number> = { HIS1: 275_000, HIS2: 400_000, SBPE: 750_000 };
type Seg = "mcmv" | "alto";

function statusDe(p: ProjetoFecha) {
  const e = p.entrada_min;
  if (e <= 0) return { classe: "zero", badge: "green", rotulo: "Entrada Zero (100% Caixa)", txt: "Fecha sem entrada" };
  if (e <= 30_000) return { classe: "fgts", badge: "amber", rotulo: "Entra com FGTS", txt: "Entrada até R$ 30k" };
  return { classe: "pesada", badge: "rose", rotulo: "Entrada Pesada", txt: "Entrada acima de R$ 30k" };
}

function quantasFecham(p: ProjetoFecha) {
  return Math.round((p.pct_fecha / 100) * p.disponiveis);
}

export default function Estrategia() {
  const { mode, toggle } = useTheme();
  const [renda, setRenda] = useState(3000);
  const [rendaInput, setRendaInput] = useState("3000");
  const [dep, setDep] = useState(true);
  const { data, isLoading } = useEstrategiaFecha(renda, dep);
  const [seg, setSeg] = useState<Seg>("mcmv");
  const [reg, setReg] = useState<string | null>(null);
  const [buscaNome, setBuscaNome] = useState("");
  const [aberto, setAberto] = useState<ProjetoFecha | null>(null);

  loadFonts();

  function mudarRenda(v: string) {
    setRendaInput(v);
    const n = parseInt(v.replace(/\D/g, ""), 10);
    if (n && n >= 1000) {
      setRenda(n);
      setAberto(null);
    }
  }

  // Regiões no segmento atual com contagem
  const regioes = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((p) => {
      if (p.disponiveis < 5) return;
      if (seg === "mcmv" ? p.avaliacao_media > TETO_MCMV : p.avaliacao_media <= TETO_MCMV) return;
      const k = p.regiao || "__na__";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, seg]);

  // Lista de projetos ordenada pela MENOR entrada possível
  const lista = useMemo(() => {
    return (data ?? [])
      .filter((p) => p.disponiveis >= 5)
      .filter((p) => (seg === "mcmv" ? p.avaliacao_media <= TETO_MCMV : p.avaliacao_media > TETO_MCMV))
      .filter((p) => reg === null || (reg === "__na__" ? !p.regiao : p.regiao === reg))
      .filter((p) => !buscaNome.trim() || p.empreendimento.toLowerCase().includes(buscaNome.toLowerCase().trim()))
      .sort((a, b) => a.entrada_min - b.entrada_min || quantasFecham(b) - quantasFecham(a));
  }, [data, seg, reg, buscaNome]);

  // KPIs de topo
  const zeroEntradaCount = lista.filter((p) => p.entrada_min <= 0).length;
  const fgtsCount = lista.filter((p) => p.entrada_min > 0 && p.entrada_min <= 30_000).length;
  const totalUnidadesDisponiveis = lista.reduce((acc, p) => acc + p.disponiveis, 0);
  const capacidadeCaixa = lista[0] ? lista[0].financiamento + (lista[0].subsidio ?? 0) : 0;

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"estrategia" as any} mode={mode} toggle={toggle} />

      <main className="shell2">
        <div className="estrategia-v3">
          {/* ── CABEÇALHO ── */}
          <div className="estrategia-v3-header">
            <div className="estrategia-v3-title">
              <h1>Onde Atacar — Vitrine de Estoque & Caixa</h1>
              <p>
                Calculadora tática de viabilidade: onde o cliente consegue comprar com menor desembolso
              </p>
            </div>
          </div>

          {/* ── SCORE ROW / KPI CARDS ── */}
          <div className="estrategia-kpis-grid">
            <div className="estrategia-kpi-card">
              <div className="estrategia-kpi-top">
                <span className="estrategia-kpi-label">Projetos no Radar</span>
                <span className="estrategia-kpi-badge brand">
                  <Building2 size={12} /> {seg === "mcmv" ? "MCMV" : "SBPE"}
                </span>
              </div>
              <div className="estrategia-kpi-num">{lista.length}</div>
              <div className="estrategia-kpi-sub">{totalUnidadesDisponiveis} unidades disponíveis no estoque</div>
            </div>

            <div className="estrategia-kpi-card">
              <div className="estrategia-kpi-top">
                <span className="estrategia-kpi-label">Entrada Zero</span>
                <span className="estrategia-kpi-badge green">
                  <CheckCircle2 size={12} /> 100% Caixa
                </span>
              </div>
              <div className="estrategia-kpi-num" style={{ color: "var(--cv-green)" }}>
                {zeroEntradaCount}
              </div>
              <div className="estrategia-kpi-sub">projetos com unidades sem entrada</div>
            </div>

            <div className="estrategia-kpi-card">
              <div className="estrategia-kpi-top">
                <span className="estrategia-kpi-label">Entra com FGTS</span>
                <span className="estrategia-kpi-badge amber">
                  <Sparkles size={12} /> até R$ 30k
                </span>
              </div>
              <div className="estrategia-kpi-num" style={{ color: "var(--cv-amber)" }}>
                {fgtsCount}
              </div>
              <div className="estrategia-kpi-sub">fecham com pequeno saldo de FGTS</div>
            </div>

            <div className="estrategia-kpi-card">
              <div className="estrategia-kpi-top">
                <span className="estrategia-kpi-label">Capacidade Caixa</span>
                <span className="estrategia-kpi-badge blue">
                  <DollarSign size={12} /> Renda {brlk(renda)}
                </span>
              </div>
              <div className="estrategia-kpi-num mono">{brlk(capacidadeCaixa)}</div>
              <div className="estrategia-kpi-sub">
                Financ. {brlk(lista[0]?.financiamento ?? 0)}
                {lista[0]?.subsidio ? ` + Subsídio ${brlk(lista[0].subsidio)}` : ""}
              </div>
            </div>
          </div>

          {/* ── SIMULADOR TÁTICO DE RENDA & FILTROS ── */}
          <div className="estrategia-simulador-card">
            <div className="estrategia-sim-row">
              <div className="estrategia-input-renda-wrap">
                <span>Renda Bruta Familiar R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="estrategia-input-renda"
                  value={rendaInput}
                  onChange={(e) => mudarRenda(e.target.value)}
                />
              </div>

              {[2000, 3000, 4000, 5000, 6000, 8000].map((r) => (
                <button
                  key={r}
                  className={`estrategia-chip-btn ${renda === r ? "active" : ""}`}
                  onClick={() => mudarRenda(String(r))}
                >
                  {brlk(r)}
                </button>
              ))}

              <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                <button
                  className={`estrategia-chip-btn ${dep ? "active" : ""}`}
                  onClick={() => setDep(true)}
                  title="Com dependente (aumenta subsídio e capacidade Caixa)"
                >
                  <Users size={13} /> Com Dependente
                </button>
                <button
                  className={`estrategia-chip-btn ${!dep ? "active" : ""}`}
                  onClick={() => setDep(false)}
                >
                  Sem Dependente
                </button>
              </div>
            </div>

            <div className="estrategia-sim-row" style={{ paddingTop: "10px", borderTop: "1px solid var(--cv-border-subtle)" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className={`estrategia-chip-btn ${seg === "mcmv" ? "active" : ""}`}
                  onClick={() => {
                    setSeg("mcmv");
                    setReg(null);
                    setAberto(null);
                  }}
                >
                  Minha Casa Minha Vida (até R$ 400k)
                </button>
                <button
                  className={`estrategia-chip-btn ${seg === "alto" ? "active" : ""}`}
                  onClick={() => {
                    setSeg("alto");
                    setReg(null);
                    setAberto(null);
                  }}
                >
                  SFH / SBPE (Médio/Alto Padrão)
                </button>
              </div>

              <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
                <input
                  type="text"
                  placeholder="Buscar empreendimento por nome..."
                  className="time-search-input"
                  style={{ width: "100%", padding: "7px 12px 7px 32px" }}
                  value={buscaNome}
                  onChange={(e) => setBuscaNome(e.target.value)}
                />
                <Search size={14} className="time-search-icon" style={{ left: "10px" }} />
              </div>
            </div>

            {/* Chips de Regiões */}
            <div className="estrategia-sim-row" style={{ gap: "6px" }}>
              <button
                className={`estrategia-chip-btn ${reg === null ? "active" : ""}`}
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={() => {
                  setReg(null);
                  setAberto(null);
                }}
              >
                Todas as Regiões
              </button>
              {regioes.map(([k, n]) => (
                <button
                  key={k}
                  className={`estrategia-chip-btn ${reg === k ? "active" : ""}`}
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                  onClick={() => {
                    setReg(k);
                    setAberto(null);
                  }}
                >
                  {k === "__na__" ? "Outros" : k} ({n})
                </button>
              ))}
            </div>
          </div>

          {/* ── GRID DE EMPREENDIMENTOS ── */}
          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--cv-text-muted)" }}>
              Calculando capacidade de crédito e entradas dos projetos...
            </div>
          ) : lista.length === 0 ? (
            <div style={{ background: "var(--cv-surface)", border: "1px solid var(--cv-border)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
              <Building2 size={36} style={{ color: "var(--cv-text-dim)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 6px" }}>Nenhum projeto encontrado para estes filtros</h3>
              <p style={{ color: "var(--cv-text-muted)", fontSize: "13.5px", margin: 0 }}>
                Tente ajustar a renda simulada ou selecionar outra região.
              </p>
            </div>
          ) : (
            <div className="estrategia-projetos-grid">
              {lista.map((p) => {
                const s = statusDe(p);
                const fecham = quantasFecham(p);

                // Mensagem pronta para compartilhar simulação
                const textoSimulacao = encodeURIComponent(
                  `*Simulação Caixa — ${p.empreendimento}*\n\n` +
                  `👤 Renda simulada: ${brl(renda)}\n` +
                  `Financiamento Caixa aprovado: ${brl(p.financiamento)}\n` +
                  (p.subsidio ? `🎁 Subsídio do Governo: ${brl(p.subsidio)}\n` : "") +
                  `Unidades a partir de: Entrada ${p.entrada_min <= 0 ? "R$ 0 (Zero)" : brl(p.entrada_min)}\n\n` +
                  `Temos ${p.disponiveis} unidades disponíveis no estoque! Quer agendar uma visita?`
                );

                return (
                  <div key={p.cod_empreendimento} className={`estrategia-projeto-card ${s.classe}`}>
                    <div className="estrategia-card-top">
                      <div className="estrategia-card-title">
                        <h3>{p.empreendimento}</h3>
                        <span>
                          {p.regiao ? `${p.regiao} · ` : ""}
                          {p.disponiveis} unidades em estoque
                        </span>
                      </div>
                      <span className={`estrategia-kpi-badge ${s.badge}`}>
                        {s.rotulo}
                      </span>
                    </div>

                    <div className="estrategia-card-metrics">
                      <div className={`estrategia-metric-item destaque ${s.classe}`}>
                        <span>Entrada Mínima:</span>
                        <b>{p.entrada_min <= 0 ? "R$ 0 (Zero)" : brlk(p.entrada_min)}</b>
                      </div>
                      <div className="estrategia-metric-item">
                        <span>Preço Médio:</span>
                        <b>{brlk(p.preco_medio)}</b>
                      </div>
                      <div className="estrategia-metric-item">
                        <span>Avaliação Caixa:</span>
                        <b>{brlk(p.avaliacao_media)}</b>
                      </div>
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--cv-text-muted)", lineHeight: 1.4 }}>
                      {fecham > 0 ? (
                        <b style={{ color: "var(--cv-green)" }}>
                          ✓ {fecham} de {p.disponiveis} unidades financiam 100% sem entrada
                        </b>
                      ) : (
                        `Entrada média das unidades: ~${brlk(p.entrada_media)}`
                      )}
                    </div>

                    <div className="estrategia-card-footer">
                      <button className="estrategia-btn-drill" onClick={() => setAberto(p)}>
                        Ver {p.disponiveis} Unidades
                      </button>
                      <a
                        className="estrategia-btn-share-wa"
                        href={`https://wa.me/?text=${textoSimulacao}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Compartilhar resumo da simulação pelo WhatsApp"
                      >
                        <MessageCircle size={15} /> WhatsApp
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── MODAL / GAVETA DE UNIDADES REAIS DO ESTOQUE ── */}
        {aberto && (
          <ModalUnidades
            p={aberto}
            renda={renda}
            onClose={() => setAberto(null)}
          />
        )}
      </main>
    </div>
  );
}

// ── COMPONENTE MODAL DE UNIDADES ──
function ModalUnidades({
  p,
  renda,
  onClose,
}: {
  p: ProjetoFecha;
  renda: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useUnidades(p.cod_empreendimento);
  const teto = TETO_FAIXA[p.faixa] ?? 400_000;
  const [filtroDorms, setFiltroDorms] = useState<number | null>(null);

  const unidades = useMemo(
    () =>
      (data ?? [])
        .map((u) => ({
          u,
          aprovado: liberadoUnidade(u, p.financiamento),
          entrada: entradaUnidade(u, p.financiamento, p.subsidio, teto),
        }))
        .filter(({ u }) => filtroDorms === null || u.dormitorios === filtroDorms)
        .sort((a, b) => (a.entrada ?? 1e12) - (b.entrada ?? 1e12)),
    [data, p.financiamento, p.subsidio, teto, filtroDorms]
  );

  function copiarUnidade(u: any, aprovado: number | null, entrada: number | null) {
    const texto =
      `*${p.empreendimento} — Unidade ${u.numero || "—"}*\n` +
      `Bloco: ${u.bloco || "—"} | Dormitórios: ${u.dormitorios ?? "—"} | Metragem: ${u.metragem ?? "—"} m²\n` +
      `Preço: ${brl(u.valor)} | Avaliação Caixa: ${brl(u.valor_avaliacao)}\n` +
      `Financiamento Caixa Aprovado: ${brl(aprovado)}\n` +
      `Entrada Necessária: ${entrada == null ? "—" : entrada <= 0 ? "R$ 0 (Zero)" : brl(entrada)}`;

    navigator.clipboard.writeText(texto);
    toast.success(`Resumo da Unidade ${u.numero} copiado para a área de transferência!`);
  }

  return (
    <div className="estrategia-modal-backdrop" onClick={onClose}>
      <div className="estrategia-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="estrategia-modal-header">
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
              {p.empreendimento} — Unidades Disponíveis
            </h3>
            <span style={{ fontSize: "13px", color: "var(--cv-text-muted)", marginTop: "2px", display: "block" }}>
              Simulação Caixa para renda de {brl(renda)}: Aprovado até {brl(p.financiamento)}
              {p.subsidio ? ` + Subsídio ${brl(p.subsidio)}` : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--cv-text-muted)" }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="estrategia-modal-body">
          {/* Filtros de dormitório */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--cv-text-muted)" }}>
              Dormitórios:
            </span>
            <button
              className={`estrategia-chip-btn ${filtroDorms === null ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={() => setFiltroDorms(null)}
            >
              Todos
            </button>
            <button
              className={`estrategia-chip-btn ${filtroDorms === 1 ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={() => setFiltroDorms(1)}
            >
              1 Dorm
            </button>
            <button
              className={`estrategia-chip-btn ${filtroDorms === 2 ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={() => setFiltroDorms(2)}
            >
              2 Dorms
            </button>
          </div>

          {isLoading ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--cv-text-muted)" }}>
              Carregando unidades do estoque...
            </div>
          ) : (
            <div className="time-table-card">
              <div className="time-table-responsive">
                <table className="time-table">
                  <thead>
                    <tr>
                      <th>Unidade</th>
                      <th style={{ textAlign: "center" }}>Bloco</th>
                      <th style={{ textAlign: "center" }}>Dorm.</th>
                      <th style={{ textAlign: "center" }}>m²</th>
                      <th style={{ textAlign: "right" }}>Preço Cury</th>
                      <th style={{ textAlign: "right" }}>Avaliação Caixa</th>
                      <th style={{ textAlign: "right" }}>Caixa Aprova</th>
                      <th style={{ textAlign: "right" }}>Entrada</th>
                      <th style={{ textAlign: "center" }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidades.map(({ u, aprovado, entrada }, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 800 }}>{u.numero || "—"}</td>
                        <td style={{ textAlign: "center" }}>{u.bloco || "—"}</td>
                        <td style={{ textAlign: "center" }}>{u.dormitorios ?? "—"}</td>
                        <td style={{ textAlign: "center" }}>{u.metragem != null ? Number(u.metragem).toLocaleString("pt-BR") : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "JetBrains Mono", fontWeight: 600 }}>{brl(u.valor)}</td>
                        <td style={{ textAlign: "right", fontFamily: "JetBrains Mono", color: "var(--cv-text-muted)" }}>{brl(u.valor_avaliacao)}</td>
                        <td style={{ textAlign: "right", fontFamily: "JetBrains Mono", color: "var(--cv-green)", fontWeight: 700 }}>{brl(aprovado)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontFamily: "JetBrains Mono",
                              fontWeight: 800,
                              color: entrada != null && entrada <= 0 ? "var(--cv-green)" : entrada != null && entrada <= 30_000 ? "var(--cv-amber)" : "var(--cv-rose)",
                            }}
                          >
                            {entrada == null ? "—" : entrada <= 0 ? "R$ 0 (Zero)" : brl(entrada)}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            className="time-btn-action"
                            title="Copiar dados desta unidade"
                            onClick={() => copiarUnidade(u, aprovado, entrada)}
                          >
                            <Copy size={13} /> Copiar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
