// ONDE ATACAR — qual projeto fecha mais fácil.
//
// Uma pergunta, uma resposta. A régua é simples e intuitiva: QUANTO A CAIXA
// COBRE DO PREÇO. Quanto mais cobre (financiamento + subsídio), menos entrada o
// cliente precisa, mais fácil fechar. Ordena do que mais cobre para o que menos
// cobre. A renda do público ajusta o cálculo (a Caixa libera conforme a renda).
// Ver memory/project_tabelao_fecha_a_conta.md.

import { useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { Sec, Tbl, Tr, Blank, Mini } from "@/components/manager-v10/ui";
import {
  useEstrategiaFecha, useUnidades, entradaUnidade,
  TETO_MCMV, type ProjetoFecha,
} from "@/hooks/useEstrategia";
import "@/styles/manager-v10.css";

const brl = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");
const brlk = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(n) / 1000) + "k";

const TETO_FAIXA: Record<string, number> = { HIS1: 275_000, HIS2: 400_000, SBPE: 750_000 };
type Seg = "mcmv" | "alto";

const OK = "var(--ok,#18A999)";
const WARN = "var(--warn,#E0A82E)";
const BAD = "var(--bad,#E4572E)";

/** Quanto a Caixa cobre do preço (0..1). É o inverso da entrada. */
function cobertura(p: ProjetoFecha) {
  if (!p.preco_medio) return 0;
  return Math.max(0, Math.min(1, 1 - p.entrada_media / p.preco_medio));
}
function statusDe(c: number) {
  if (c >= 0.9) return { cor: OK, dot: "🟢", txt: "fecha fácil" };
  if (c >= 0.75) return { cor: WARN, dot: "🟡", txt: "entrada média" };
  return { cor: BAD, dot: "🔴", txt: "entrada pesada" };
}

export default function Estrategia() {
  const { mode, toggle } = useTheme();
  const [renda, setRenda] = useState(3000);
  const [rendaInput, setRendaInput] = useState("3000");
  const [dep, setDep] = useState(true);
  const { data, isLoading } = useEstrategiaFecha(renda, dep);
  const [seg, setSeg] = useState<Seg>("mcmv");
  const [reg, setReg] = useState<string | null>(null);
  const [aberto, setAberto] = useState<ProjetoFecha | null>(null);

  loadFonts();

  function setR(v: string) {
    setRendaInput(v);
    const n = parseInt(v.replace(/\D/g, ""), 10);
    if (n && n >= 1000) { setRenda(n); setAberto(null); }
  }

  // regiões presentes no estoque (com contagem), "A classificar" para sem região
  const regioes = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((p) => {
      if (p.disponiveis < 15) return;
      const k = p.regiao || "__na__";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const lista = useMemo(() => {
    return (data ?? [])
      .filter((p) => p.disponiveis >= 15)
      .filter((p) => (seg === "mcmv" ? p.avaliacao_media <= TETO_MCMV : p.avaliacao_media > TETO_MCMV))
      .filter((p) => reg === null || (reg === "__na__" ? !p.regiao : p.regiao === reg))
      .sort((a, b) => cobertura(b) - cobertura(a));
  }, [data, seg, reg]);

  return (
    <div className="mgr10 app2 estrategia">
      <RailV10 atual={"estrategia" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Onde atacar</h1>
            <p>Os projetos que fecham mais fácil — onde a Caixa cobre mais do preço</p>
          </div>
        </header>
        <section className="view">
          <Sec
            title="Para que público"
            sub="Diga a renda típica do seu público (até 3 pessoas). A Caixa libera conforme a renda — e o que ela não cobrir vira entrada do cliente."
          >
            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                Renda do público R$
                <input
                  value={rendaInput}
                  onChange={(e) => setR(e.target.value)}
                  inputMode="numeric" placeholder="ex: 3000"
                  style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line,#cbd5e1)", background: "var(--panel,transparent)", color: "inherit", font: "inherit", fontWeight: 700, textAlign: "right" }}
                />
              </label>
              {[2000, 3000, 4000, 5000].map((r) => (
                <Mini key={r} variant={renda === r ? "solid" : undefined} onClick={() => setR(String(r))}>{brlk(r)}</Mini>
              ))}
              <span style={{ width: 12 }} />
              <Mini variant={dep ? "key" : undefined} onClick={() => setDep(true)}>Com dependente</Mini>
              <Mini variant={!dep ? "key" : undefined} onClick={() => setDep(false)}>Sem</Mini>
              <span style={{ width: 12 }} />
              <Mini variant={seg === "mcmv" ? "solid" : undefined} onClick={() => { setSeg("mcmv"); setAberto(null); }}>MCMV</Mini>
              <Mini variant={seg === "alto" ? "solid" : undefined} onClick={() => { setSeg("alto"); setAberto(null); }}>SFH / SBPE</Mini>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <Mini variant={reg === null ? "solid" : undefined} onClick={() => { setReg(null); setAberto(null); }}>Todas as regiões</Mini>
              {regioes.map(([k, n]) => (
                <Mini key={k} variant={reg === k ? "solid" : undefined} onClick={() => { setReg(k); setAberto(null); }}>
                  {(k === "__na__" ? "A classificar" : k)} ({n})
                </Mini>
              ))}
            </div>
          </Sec>

          <Sec
            title="Projetos — do que fecha mais fácil para o mais difícil"
            tag="estimativa · planilha Caixa"
          >
            {isLoading ? (
              <Blank title="Calculando…" />
            ) : lista.length === 0 ? (
              <Blank title="Nenhum projeto com estoque neste filtro." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.map((p) => {
                  const c = cobertura(p);
                  const s = statusDe(c);
                  return (
                    <button
                      key={p.cod_empreendimento}
                      onClick={() => setAberto(p)}
                      style={{
                        display: "grid", gridTemplateColumns: "26px 1fr 190px", gap: 12, alignItems: "center",
                        textAlign: "left", width: "100%", cursor: "pointer",
                        padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line,#e2e8f0)",
                        background: "var(--panel,transparent)", color: "inherit", font: "inherit",
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{s.dot}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.empreendimento}</span>
                        <span style={{ fontSize: 12, color: "var(--muted,#64748b)" }}>
                          {p.regiao ? p.regiao + " · " : ""}{p.disponiveis} disponíveis · preço ~{brlk(p.preco_medio)} · <b style={{ color: s.cor }}>{s.txt}</b>
                        </span>
                      </span>
                      <span>
                        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: "var(--muted,#64748b)" }}>Caixa cobre</span>
                          <b style={{ color: s.cor }}>{Math.round(c * 100)}%</b>
                        </span>
                        <span style={{ display: "block", height: 8, borderRadius: 6, background: "var(--line,#e2e8f0)", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${Math.round(c * 100)}%`, background: s.cor }} />
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--muted,#64748b)", marginTop: 4 }}>
                          entrada ~{p.entrada_media <= 0 ? "zero" : brlk(p.entrada_media)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Sec>

          {aberto ? <Drill p={aberto} renda={renda} onClose={() => setAberto(null)} /> : null}
        </section>
      </main>
    </div>
  );
}

function Drill({ p, renda, onClose }: { p: ProjetoFecha; renda: number; onClose: () => void }) {
  const { data, isLoading } = useUnidades(p.cod_empreendimento);
  const teto = TETO_FAIXA[p.faixa] ?? 400_000;
  const cols = "0.8fr 1fr 0.6fr 0.7fr 0.9fr 1fr";
  const unidades = useMemo(
    () => (data ?? [])
      .map((u) => ({ u, entrada: entradaUnidade(u, p.financiamento, p.subsidio, teto) }))
      .sort((a, b) => (a.entrada ?? 1e12) - (b.entrada ?? 1e12)),
    [data, p.financiamento, p.subsidio, teto],
  );
  return (
    <Sec
      title={p.empreendimento}
      tag={<button type="button" className="mini" onClick={onClose}>fechar ✕</button>}
      sub={`Renda ${brl(renda)} → a Caixa libera ${brl(p.financiamento)}${p.subsidio ? ` + subsídio ${brl(p.subsidio)}` : ""}. ${p.disponiveis} unidades disponíveis.`}
    >
      {isLoading ? (
        <Blank title="Carregando unidades…" />
      ) : (
        <Tbl cols={cols} head={["Unid.", "Bloco", "Dorm.", "m²", "Preço", "Entrada"]}>
          {unidades.map(({ u, entrada }, i) => (
            <Tr key={i} cols={cols}>
              <span style={{ fontWeight: 600 }}>{u.numero || "—"}</span>
              <span>{u.bloco || "—"}</span>
              <span>{u.dormitorios ?? "—"}</span>
              <span>{u.metragem != null ? Number(u.metragem).toLocaleString("pt-BR") : "—"}</span>
              <span>{brl(u.valor)}</span>
              <span style={{ color: entrada != null && entrada <= 20_000 ? OK : entrada != null && entrada >= 80_000 ? BAD : undefined, fontWeight: 600 }}>
                {entrada == null ? "—" : entrada <= 0 ? "zero" : brl(entrada)}
              </span>
            </Tr>
          ))}
        </Tbl>
      )}
    </Sec>
  );
}
