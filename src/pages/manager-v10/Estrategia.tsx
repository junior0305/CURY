// ONDE ATACAR — estratégia de estoque pela matemática REAL da Caixa.
//
// Pergunta única, para gerente/super/diretor: QUAL PROJETO FECHA MAIS FÁCIL
// para a renda do meu lead? A régua é a ENTRADA (o bolso do cliente):
//     entrada = preço − mín( financiamento(renda) , 0,8 × avaliação ) − subsídio
// Menor entrada = fecha mais fácil. Escolha a renda-alvo (composta, até 3
// pessoas) e tudo recalcula. Ver memory/project_tabelao_fecha_a_conta.md.

import { useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { Sec, Tbl, Tr, Cell, ScoreRow, Blank, Mini } from "@/components/manager-v10/ui";
import {
  useEstrategiaFecha, useUnidades, entradaUnidade,
  TETO_MCMV, RENDAS, type ProjetoFecha,
} from "@/hooks/useEstrategia";
import "@/styles/manager-v10.css";

const brl = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");
const brlk = (n: number | null | undefined) =>
  n == null ? "—" : (n < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(n) / 1000) + "k";

const TETO_FAIXA: Record<string, number> = { HIS1: 275_000, HIS2: 400_000, SBPE: 750_000 };

type Seg = "mcmv" | "alto";
type Ord = "entrada" | "fecha" | "volume";

/** Verde = entrada baixa (cabe no FGTS/economias). Vermelho = entrada pesada. */
function tomEntrada(e: number): "good" | "alert" | undefined {
  if (e <= 30_000) return "good";
  if (e >= 100_000) return "alert";
  return undefined;
}

export default function Estrategia() {
  const { mode, toggle } = useTheme();
  const [renda, setRenda] = useState(4000);
  const [rendaInput, setRendaInput] = useState("4000");
  const [dep, setDep] = useState(true);

  function aplicarRenda(v?: string) {
    const n = parseInt((v ?? rendaInput).replace(/\D/g, ""), 10);
    if (n && n >= 1000) { setRenda(n); setRendaInput(String(n)); setAberto(null); }
  }
  const { data, isLoading } = useEstrategiaFecha(renda, dep);
  const [seg, setSeg] = useState<Seg>("mcmv");
  const [minDisp, setMinDisp] = useState(20);
  const [ord, setOrd] = useState<Ord>("entrada");
  const [aberto, setAberto] = useState<ProjetoFecha | null>(null);

  loadFonts();

  const info = data?.[0];

  const lista = useMemo(() => {
    const base = (data ?? [])
      .filter((p) => p.disponiveis >= minDisp)
      .filter((p) => (seg === "mcmv" ? p.avaliacao_media <= TETO_MCMV : p.avaliacao_media > TETO_MCMV));
    const cmp: Record<Ord, (a: ProjetoFecha, b: ProjetoFecha) => number> = {
      entrada: (a, b) => a.entrada_media - b.entrada_media,
      fecha: (a, b) => b.pct_fecha - a.pct_fecha || a.entrada_media - b.entrada_media,
      volume: (a, b) => b.disponiveis - a.disponiveis,
    };
    return base.sort(cmp[ord]);
  }, [data, seg, minDisp, ord]);

  const resumo = useMemo(() => {
    const unid = lista.reduce((s, p) => s + p.disponiveis, 0);
    const bons = lista.filter((p) => p.entrada_media <= 30_000);
    return {
      projetos: lista.length, unid,
      bons: bons.length,
      unidBons: bons.reduce((s, p) => s + p.disponiveis, 0),
    };
  }, [lista]);

  const cols = "1.7fr .7fr .9fr .9fr 1fr .9fr .8fr";

  return (
    <div className="mgr10 app2 estrategia">
      <RailV10 atual={"estrategia" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Onde atacar</h1>
            <p>Qual projeto fecha mais fácil — pela entrada que a renda do lead deixa</p>
          </div>
        </header>
        <section className="view">
          <Sec
            title="Renda-alvo do lead"
            tag="estimativa · planilha Caixa"
            sub={
              info
                ? `Com renda ${brl(renda)}, a Caixa libera até ${brl(info.financiamento)}${info.subsidio ? ` + subsídio ${brl(info.subsidio)}` : ""} (faixa ${info.faixa}), limitado a 80% da avaliação de cada unidade — a entrada é o que faltar para o preço. Renda composta (até 3 pessoas). Valores são estimativa pela planilha; o número exato vem do Simular da Caixa (em integração).`
                : "Escolha a renda do lead para calcular a entrada em cada projeto."
            }
          >
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
                Renda R$
                <input
                  value={rendaInput}
                  onChange={(e) => setRendaInput(e.target.value)}
                  onBlur={() => aplicarRenda()}
                  onKeyDown={(e) => { if (e.key === "Enter") aplicarRenda(); }}
                  inputMode="numeric"
                  placeholder="ex: 6500"
                  style={{
                    width: 110, padding: "7px 10px", borderRadius: 8,
                    border: "1px solid var(--line,#cbd5e1)", background: "var(--panel,transparent)",
                    color: "inherit", font: "inherit", fontWeight: 700, textAlign: "right",
                  }}
                />
              </label>
              {RENDAS.map((r) => (
                <Mini key={r} variant={renda === r ? "solid" : undefined} onClick={() => aplicarRenda(String(r))}>
                  {brlk(r)}
                </Mini>
              ))}
              <span style={{ width: 16 }} />
              <Mini variant={dep ? "key" : undefined} onClick={() => setDep(true)}>Com dependente</Mini>
              <Mini variant={!dep ? "key" : undefined} onClick={() => setDep(false)}>Sem dependente</Mini>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <Mini variant={seg === "mcmv" ? "solid" : undefined} onClick={() => { setSeg("mcmv"); setAberto(null); }}>MCMV (≤ 400k)</Mini>
              <Mini variant={seg === "alto" ? "solid" : undefined} onClick={() => { setSeg("alto"); setAberto(null); }}>SFH / SBPE</Mini>
              <span style={{ width: 16 }} />
              <Mini variant={ord === "entrada" ? "key" : undefined} onClick={() => setOrd("entrada")}>Menor entrada</Mini>
              <Mini variant={ord === "fecha" ? "key" : undefined} onClick={() => setOrd("fecha")}>Zero bolso</Mini>
              <Mini variant={ord === "volume" ? "key" : undefined} onClick={() => setOrd("volume")}>Mais estoque</Mini>
              <span style={{ width: 16 }} />
              {[10, 20, 50].map((m) => (
                <Mini key={m} variant={minDisp === m ? "key" : undefined} onClick={() => setMinDisp(m)}>{m}+ disp.</Mini>
              ))}
            </div>

            {seg === "alto" ? (
              <p className="sec-sub" style={{ margin: "0 0 12px" }}>
                SFH / SBPE — imóveis acima de R$ 400 mil, com <b>juros maiores</b> e <b>fora da tabela MCMV</b> (sem subsídio). O financiamento usa a faixa SBPE da renda.
              </p>
            ) : null}

            <ScoreRow>
              <Cell label="Projetos" value={resumo.projetos} />
              <Cell label="Unidades disponíveis" value={resumo.unid.toLocaleString("pt-BR")} />
              <Cell label="Entrada leve (≤30k)" value={resumo.bons} tone="good" sub="projetos" />
              <Cell label="Unidades com entrada leve" value={resumo.unidBons.toLocaleString("pt-BR")} tone="good" />
            </ScoreRow>
          </Sec>

          <Sec title="Ranking" sub="Menor entrada primeiro. Clique num projeto para ver as unidades.">
            {isLoading ? (
              <Blank title="Calculando a entrada em cada projeto…" />
            ) : lista.length === 0 ? (
              <Blank title="Nenhum projeto neste filtro.">Afrouxe o corte de estoque ou troque o segmento.</Blank>
            ) : (
              <Tbl
                cols={cols}
                head={["Projeto", "Disp.", "Preço méd.", "Avaliação", "Entrada méd.", "Melhor unid.", "Zero bolso"]}
              >
                {lista.map((p) => {
                  const t = tomEntrada(p.entrada_media);
                  return (
                    <Tr key={p.cod_empreendimento} cols={cols} onClick={() => setAberto(p)}>
                      <span style={{ fontWeight: 600 }}>{p.empreendimento}</span>
                      <span>{p.disponiveis}</span>
                      <span>{brlk(p.preco_medio)}</span>
                      <span>{brlk(p.avaliacao_media)}</span>
                      <span style={{ color: t === "good" ? "var(--ok,#18A999)" : t === "alert" ? "var(--bad,#E4572E)" : undefined, fontWeight: 700 }}>
                        {p.entrada_media <= 0 ? "sem entrada" : brlk(p.entrada_media)}
                      </span>
                      <span>{p.entrada_min <= 0 ? "sem entrada" : brlk(p.entrada_min)}</span>
                      <span style={{ color: p.pct_fecha > 0 ? "var(--ok,#18A999)" : undefined, fontWeight: p.pct_fecha > 0 ? 700 : 400 }}>
                        {p.pct_fecha}%
                      </span>
                    </Tr>
                  );
                })}
              </Tbl>
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
  const cols = "0.8fr 1fr 0.6fr 0.7fr 0.9fr 0.9fr 1fr";
  const unidades = useMemo(
    () =>
      (data ?? [])
        .map((u) => ({ u, entrada: entradaUnidade(u, p.financiamento, p.subsidio, teto) }))
        .sort((a, b) => (a.entrada ?? 1e12) - (b.entrada ?? 1e12)),
    [data, p.financiamento, p.subsidio, teto],
  );
  return (
    <Sec
      title={p.empreendimento}
      tag={<button type="button" className="mini" onClick={onClose}>fechar ✕</button>}
      sub={`Renda ${brl(renda)} → libera ${brl(p.financiamento)}${p.subsidio ? ` + subsídio ${brl(p.subsidio)}` : ""}. ${p.disponiveis} disponíveis.`}
    >
      {isLoading ? (
        <Blank title="Carregando unidades…" />
      ) : (
        <Tbl cols={cols} head={["Unid.", "Bloco", "Dorm.", "m²", "Preço", "Avaliação", "Entrada"]}>
          {unidades.map(({ u, entrada }, i) => (
            <Tr key={i} cols={cols}>
              <span style={{ fontWeight: 600 }}>{u.numero || "—"}</span>
              <span>{u.bloco || "—"}</span>
              <span>{u.dormitorios ?? "—"}</span>
              <span>{u.metragem != null ? Number(u.metragem).toLocaleString("pt-BR") : "—"}</span>
              <span>{brl(u.valor)}</span>
              <span>{brl(u.valor_avaliacao)}</span>
              <span style={{ color: entrada != null && entrada <= 30_000 ? "var(--ok,#18A999)" : entrada != null && entrada >= 100_000 ? "var(--bad,#E4572E)" : undefined, fontWeight: 600 }}>
                {entrada == null ? "—" : entrada <= 0 ? "sem entrada" : brl(entrada)}
              </span>
            </Tr>
          ))}
        </Tbl>
      )}
    </Sec>
  );
}
