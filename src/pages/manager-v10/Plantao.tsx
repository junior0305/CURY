// PLANTÃO — check-in dos corretores (Contact2Sale).
//
// Quem bateu ponto no plantão, de qual gerente/diretor, e quantas vezes no
// período. Dado do C2S (/sales_stand/leads → c2s_checkins). Serve gerente,
// super e diretor — cada um filtra pela sua equipe pelo gerente.
// Ver memory/reference_contact2sale_api.md.

import { useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import { Sec, Tbl, Tr, Cell, ScoreRow, Blank, Mini } from "@/components/manager-v10/ui";
import { useCheckinResumo, type CheckinCorretor } from "@/hooks/useCheckin";
import "@/styles/manager-v10.css";

const fmtDt = (iso: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return "—"; }
};
const PERIODOS: { k: number; l: string }[] = [
  { k: 1, l: "Hoje" }, { k: 7, l: "7 dias" }, { k: 30, l: "30 dias" },
];

export default function Plantao() {
  const { mode, toggle } = useTheme();
  const [dias, setDias] = useState(7);
  const [ger, setGer] = useState<string | null>(null);
  const { data, isLoading } = useCheckinResumo(dias);

  loadFonts();

  const gerentes = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((c) => { if (c.gerente) m.set(c.gerente, (m.get(c.gerente) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const lista = useMemo(
    () => (data ?? []).filter((c) => ger === null || c.gerente === ger),
    [data, ger],
  );

  const resumo = useMemo(() => ({
    checkins: lista.reduce((s, c) => s + c.n_checkins, 0),
    corretores: lista.length,
  }), [lista]);

  const cols = "1.4fr 1.5fr .8fr 1fr 1.7fr";
  const nomeCurto = (g: string | null) => (g || "—").replace(/^Superintendencia\s+/i, "Sup. ").replace(/^Diretor\s+/i, "Dir. ");

  return (
    <div className="mgr10 app2 plantao">
      <RailV10 atual={"plantao" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="top2">
          <div>
            <h1>Plantão</h1>
            <p>Check-in dos corretores no plantão — quem bateu ponto e quantas vezes</p>
          </div>
        </header>
        <section className="view">
          <Sec
            title="Período"
            tag="Contact2Sale"
            sub="Check-in = atendimento registrado no plantão (recepção/visita). Filtre pela sua equipe no gerente."
          >
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {PERIODOS.map((p) => (
                <Mini key={p.k} variant={dias === p.k ? "solid" : undefined} onClick={() => setDias(p.k)}>{p.l}</Mini>
              ))}
            </div>
            {gerentes.length > 0 ? (
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                <Mini variant={ger === null ? "solid" : undefined} onClick={() => setGer(null)}>Todos os gerentes</Mini>
                {gerentes.map(([g, n]) => (
                  <Mini key={g} variant={ger === g ? "solid" : undefined} onClick={() => setGer(g)}>{nomeCurto(g)} ({n})</Mini>
                ))}
              </div>
            ) : null}
            <ScoreRow>
              <Cell label="Check-ins no período" value={resumo.checkins} tone="good" />
              <Cell label="Corretores que bateram ponto" value={resumo.corretores} />
            </ScoreRow>
          </Sec>

          <Sec title="Corretores — quem fez check-in" sub="Mais check-ins primeiro.">
            {isLoading ? (
              <Blank title="Carregando check-ins…" />
            ) : lista.length === 0 ? (
              <Blank title="Nenhum check-in no período.">Os check-ins aparecem aqui conforme os corretores batem ponto no plantão (C2S).</Blank>
            ) : (
              <Tbl cols={cols} head={["Corretor", "Gerente", "Check-ins", "Último", "Tipo de visita"]}>
                {lista.map((c: CheckinCorretor) => (
                  <Tr key={c.corretor} cols={cols}>
                    <span style={{ fontWeight: 700 }}>{c.corretor.trim()}</span>
                    <span style={{ color: "var(--ink-3)" }}>{nomeCurto(c.gerente)}</span>
                    <span style={{ fontWeight: 700 }}>{c.n_checkins}</span>
                    <span>{fmtDt(c.ultimo)}</span>
                    <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{c.tipos || "—"}</span>
                  </Tr>
                ))}
              </Tbl>
            )}
          </Sec>
        </section>
      </main>
    </div>
  );
}
