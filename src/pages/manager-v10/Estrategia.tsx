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
  useEstrategiaFecha, useUnidades, entradaUnidade, liberadoUnidade,
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

/** "Pode ou não": olha a MELHOR unidade do projeto (entrada mínima), não a média.
 *  É o piso de entrada — a partir de quanto dá pra entrar no projeto. */
function statusDe(p: ProjetoFecha) {
  const e = p.entrada_min;
  if (e <= 0) return { cor: OK, dot: "🟢", txt: "fecha sem entrada" };
  if (e <= 30_000) return { cor: WARN, dot: "🟡", txt: "entra com FGTS" };
  return { cor: BAD, dot: "🔴", txt: "entrada pesada" };
}
/** Quantas unidades fecham sem entrada (financia 100%) para a renda. */
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
      // "pode ou não": ordena pela MELHOR unidade (menor entrada), não pela média
      .sort((a, b) => a.entrada_min - b.entrada_min || quantasFecham(b) - quantasFecham(a));
  }, [data, seg, reg]);

  return (
    <div className="mgr10 app2 estrategia">
      <RailV10 atual={"estrategia" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Onde atacar</h1>
            <p>Onde o cliente CONSEGUE entrar — pela unidade mais acessível, não pela média</p>
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
            title="Projetos — a partir de quanto dá pra entrar"
            sub="Olhamos a MELHOR unidade de cada projeto (menor entrada), não a média — é o que diz se o cliente pode ou não. 🟢 tem unidade que financia 100% · 🟡 entra com FGTS · 🔴 nem a melhor fecha."
            tag="estimativa · planilha Caixa"
          >
            {isLoading ? (
              <Blank title="Calculando…" />
            ) : lista.length === 0 ? (
              <Blank title="Nenhum projeto com estoque neste filtro." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.map((p) => {
                  const s = statusDe(p);
                  const fecham = quantasFecham(p);
                  return (
                    <button
                      key={p.cod_empreendimento}
                      onClick={() => setAberto(p)}
                      style={{
                        display: "grid", gridTemplateColumns: "26px 1fr 150px", gap: 12, alignItems: "center",
                        textAlign: "left", width: "100%", cursor: "pointer",
                        padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line,#e2e8f0)",
                        background: "var(--panel,transparent)", color: "inherit", font: "inherit",
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{s.dot}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.empreendimento}</span>
                        <span style={{ fontSize: 12, color: "var(--muted,#64748b)" }}>
                          {p.regiao ? p.regiao + " · " : ""}{p.disponiveis} disp.
                          {fecham > 0 ? <b style={{ color: OK }}> · {fecham} fecham sem entrada</b> : ""}
                          {` · preço ~${brlk(p.preco_medio)} · aval. ~${brlk(p.avaliacao_media)}`}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span style={{ display: "block", fontSize: 11, color: "var(--muted,#64748b)" }}>entra a partir de</span>
                        <b style={{ display: "block", fontSize: 16, color: s.cor }}>{p.entrada_min <= 0 ? "R$ 0" : brlk(p.entrada_min)}</b>
                        <span style={{ display: "block", fontSize: 11, color: s.cor, fontWeight: 600 }}>{s.txt}</span>
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
  const cols = "0.7fr 0.5fr 0.55fr 0.9fr 0.9fr 0.95fr 0.9fr";
  const unidades = useMemo(
    () => (data ?? [])
      .map((u) => ({
        u,
        aprovado: liberadoUnidade(u, p.financiamento),
        entrada: entradaUnidade(u, p.financiamento, p.subsidio, teto),
      }))
      .sort((a, b) => (a.entrada ?? 1e12) - (b.entrada ?? 1e12)),
    [data, p.financiamento, p.subsidio, teto],
  );
  return (
    <Sec
      title={p.empreendimento}
      tag={<button type="button" className="mini" onClick={onClose}>fechar ✕</button>}
      sub={`Renda ${brl(renda)} → a Caixa aprova até ${brl(p.financiamento)}${p.subsidio ? ` + subsídio ${brl(p.subsidio)}` : ""}, limitado a 80% da avaliação de cada unidade. Preço = o que a construtora cobre; Avaliação = o que a Caixa avalia. Entrada = preço − aprovado − subsídio.`}
    >
      {isLoading ? (
        <Blank title="Carregando unidades…" />
      ) : (
        <Tbl cols={cols} head={["Unid.", "Dorm.", "m²", "Preço", "Avaliação", "Caixa aprova", "Entrada"]}>
          {unidades.map(({ u, aprovado, entrada }, i) => (
            <Tr key={i} cols={cols}>
              <span style={{ fontWeight: 600 }}>{u.numero || "—"}</span>
              <span>{u.dormitorios ?? "—"}</span>
              <span>{u.metragem != null ? Number(u.metragem).toLocaleString("pt-BR") : "—"}</span>
              <span>{brl(u.valor)}</span>
              <span>{brl(u.valor_avaliacao)}</span>
              <span style={{ color: OK, fontWeight: 600 }}>{brl(aprovado)}</span>
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
