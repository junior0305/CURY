// Recrutamento para super e diretor (07/11): funil por gerente (recebeu → chamou → entrevistou → contratou) e o que
// aconteceu com os contratados (1º acesso, 1º check-in, ativos 30/60 dias, saíram = desligado ou 20 dias sem check-in).
// Embaixo, a esteira de candidatos de toda a estrutura (mesmo componente do gerente).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Candidatos from "./Candidatos";

type Painel = {
  total: { candidatos: number; chamados: number; entrevistados: number; contratados: number };
  gerentes: { gerente: string; recebeu: number; chamou: number; minutos_ate_chamar: number | null; entrevistou: number; contratou: number; sem_contato_24h: number }[];
  turnover: { contratados: number; acesso: number; checkin: number; ativos30: number; base30: number; ativos60: number; base60: number; saiu: number };
  alertas: { nome: string | null; gerente: string | null; texto: string }[];
};

const CSS = `
.rp{display:grid;gap:16px}
.rp-top{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap}
.rp-top h3{margin:0;font-size:18px;font-weight:800}
.rp-per{display:flex;gap:6px;flex-wrap:wrap}
.rp-per button{font:inherit;font-size:13px;font-weight:700;border-radius:999px;padding:7px 14px;min-height:36px;border:1px solid var(--cv-border,#C9D3DF);background:transparent;color:inherit;cursor:pointer}
.rp-per button.on{background:var(--cv-text-main,#12233A);border-color:var(--cv-text-main,#12233A);color:var(--cv-surface,#fff)}
.rp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.rp-kpi{border:1px solid var(--cv-border,#DDE3EA);background:var(--cv-surface,#fff);border-radius:12px;padding:12px 14px;display:grid;gap:2px}
.rp-kpi b{font-size:26px}.rp-kpi span{font-size:13px;color:var(--cv-text-muted,#5B6B80)}
.rp-box{border:1px solid var(--cv-border,#DDE3EA);background:var(--cv-surface,#fff);border-radius:12px;padding:14px 16px;display:grid;gap:10px}
.rp-box > b{font-size:15px}
.rp-tab{overflow-x:auto}
.rp-tab table{width:100%;min-width:720px;border-collapse:collapse;font-size:14px}
.rp-tab th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--cv-text-muted,#5B6B80);padding:8px 10px}
.rp-tab td{padding:9px 10px;border-top:1px solid var(--cv-border,#EEF1F5)}
.rp-ruim{color:#B4462F;font-weight:700}
.rp-barras{display:grid;gap:8px}
.rp-linha{display:grid;grid-template-columns:150px 1fr 64px;gap:10px;align-items:center;font-size:13.5px}
.rp-trilho{height:18px;border-radius:6px;background:rgba(127,140,160,.15);overflow:hidden}
.rp-trilho span{display:block;height:100%;border-radius:6px;background:#2F6FB8}
.rp-trilho span.saiu{background:#C2412B}
.rp-linha em{font-style:normal;font-weight:700;text-align:right}
.rp-m{font-size:13px;color:var(--cv-text-muted,#5B6B80)}
@media (max-width:560px){.rp-linha{grid-template-columns:110px 1fr 54px}}
`;
const tempo = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} dias`);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function RecrutamentoPainel({ como }: { como?: string | null }) {
  const [per, setPer] = useState<"mes" | "90">("mes");
  const de = per === "mes" ? iso(inicioMes()) : iso(new Date(Date.now() - 90 * 864e5));
  const { data, isLoading } = useQuery({
    queryKey: ["recrutamento-painel", como ?? null, de],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recrutamento_painel" as any, { p_como: como ?? null, p_de: de });
      if (error) throw error;
      return (data as unknown) as Painel;
    },
  });
  const t = data?.turnover;
  const linhas = t ? [
    { r: "Contratados", n: t.contratados, base: t.contratados },
    { r: "1º acesso", n: t.acesso, base: t.contratados },
    { r: "1º check-in", n: t.checkin, base: t.contratados },
    { r: "Ativos 30 dias", n: t.ativos30, base: t.base30 },
    { r: "Ativos 60 dias", n: t.ativos60, base: t.base60 },
  ] : [];

  return (
    <section className="rp"><style>{CSS}</style>
      <div className="rp-top">
        <h3>Recrutamento</h3>
        <div className="rp-per">
          <button type="button" className={per === "mes" ? "on" : ""} aria-pressed={per === "mes"} onClick={() => setPer("mes")}>Este mês</button>
          <button type="button" className={per === "90" ? "on" : ""} aria-pressed={per === "90"} onClick={() => setPer("90")}>Últimos 90 dias</button>
        </div>
      </div>
      {isLoading || !data ? <span className="rp-m">Carregando…</span> : (
        <>
          <div className="rp-kpis">
            <div className="rp-kpi"><b>{data.total.candidatos}</b><span>candidatos</span></div>
            <div className="rp-kpi"><b>{data.total.chamados}</b><span>chamados</span></div>
            <div className="rp-kpi"><b>{data.total.entrevistados}</b><span>entrevistados</span></div>
            <div className="rp-kpi"><b>{data.total.contratados}</b><span>contratados</span></div>
          </div>

          <div className="rp-box">
            <b>Por gerente</b>
            {data.gerentes.length === 0 ? <span className="rp-m">Nenhum candidato no período.</span> : (
              <div className="rp-tab"><table>
                <thead><tr><th>Gerente</th><th>Recebeu</th><th>Chamou</th><th>Tempo até chamar</th><th>Entrevistou</th><th>Contratou</th><th>Sem contato há +24h</th></tr></thead>
                <tbody>{data.gerentes.map((g) => (
                  <tr key={g.gerente}><td><b>{g.gerente}</b></td><td>{g.recebeu}</td><td>{g.chamou}</td><td>{tempo(g.minutos_ate_chamar)}</td><td>{g.entrevistou}</td>
                    <td><b>{g.contratou}</b></td><td className={g.sem_contato_24h ? "rp-ruim" : ""}>{g.sem_contato_24h}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>

          <div className="rp-box">
            <b>Turnover: o que aconteceu com os contratados</b>
            <span className="rp-m">Saiu = desligado ou 20 dias sem check-in. "Ativos 30/60 dias" conta só quem já tem 30/60 dias de casa.</span>
            {t && t.contratados > 0 ? (
              <div className="rp-barras">
                {linhas.map((l) => (
                  <div key={l.r} className="rp-linha">
                    <span>{l.r}</span>
                    <span className="rp-trilho"><span style={{ width: `${t.contratados ? (l.n / t.contratados) * 100 : 0}%` }} /></span>
                    <em>{l.base ? l.n : "—"}</em>
                  </div>
                ))}
                <div className="rp-linha">
                  <span>Saíram</span>
                  <span className="rp-trilho"><span className="saiu" style={{ width: `${(t.saiu / t.contratados) * 100}%` }} /></span>
                  <em className={t.saiu ? "rp-ruim" : ""}>{t.saiu}</em>
                </div>
              </div>
            ) : <span className="rp-m">Ninguém contratado no período ainda.</span>}
            {data.alertas.map((a, i) => (
              <span key={i} style={{ fontSize: 13.5 }}><b className="rp-ruim">Atenção:</b> {a.nome ?? "Sem nome"}{a.gerente ? ` (${a.gerente})` : ""} {a.texto}.</span>
            ))}
          </div>
        </>
      )}
      <Candidatos como={como} titulo="Candidatos da estrutura" />
    </section>
  );
}
