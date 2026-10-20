/* Funil completo da equipe — aba Resultado (B.I.) do gerente (20/10).
 * Mesmas contas do funil do Hoje (useDadosEquipe + situacaoLead). Aqui dá para abrir por canal
 * (anúncio, disparo, pescaria, outros) e por corretor. Nada estimado: por canal, visita só conta
 * quando o corretor marcou "Veio" (o plantão C2S não diz quem é o cliente) e pasta/venda pela
 * origem descoberta pelo nome do cliente no Junix.
 * Substitui o FunilEquipeV3 que ficava no Time (ele misturava check-in com visita, contava todas as
 * pastas sem período, chamava de "Junix" uma venda que não vinha do Junix e estimava por canal).
 */
import { useMemo, useState } from "react";
import { usePastas } from "@/hooks/usePastas";
import { usePeriodo, diaSP } from "@/hooks/usePeriodo";
import { chaveNome } from "@/hooks/useDiretoria";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { useDadosEquipe, origemDe, chaveCliente, type Origem } from "@/hooks/useDadosEquipe";
import { atendido, ehPescado } from "@/lib/situacaoLead";

type Canal = "pagos" | "anuncio" | "disparo" | "pescado" | "outro";
const CANAIS: { k: Canal; nome: string }[] = [
  { k: "pagos", nome: "Leads pagos" }, { k: "anuncio", nome: "Anúncio" }, { k: "disparo", nome: "Disparo" },
  { k: "pescado", nome: "Pescaria" }, { k: "outro", nome: "Outros" },
];
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nf = (n: number) => n.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export default function FunilCompleto({ managerId }: { managerId: string }) {
  const { periodo: per } = usePeriodo();
  const [canal, setCanal] = useState<Canal>("pagos");
  const hoje = diaSP(new Date());
  const iniMes = hoje.slice(0, 8) + "01";
  // um dia só (Hoje/Ontem) quase não tem funil: mostra o mês, igual ao Hoje
  const doMes = per.de === per.ate;
  const de = doMes ? iniMes : per.de;
  const ate = doMes ? hoje : per.ate;
  const { brokers, leads, origens, metricas, vendas } = useDadosEquipe(managerId, [de, iniMes].sort()[0]);
  const { data: pastasData } = usePastas(managerId);
  const pastas = pastasData?.minhas ?? [];
  const entre = (d: string) => d >= de && d <= ate;
  const origemCliente = (nome: string | null | undefined): Origem => origens?.porNome.get(chaveCliente(nome)) ?? "sem";
  const noCanal = (o: Origem) => (canal === "pagos" ? o !== "pescado" : o === canal);

  const calc = useMemo(() => {
    const ls = leads.filter((l) => entre(diaSP(new Date(l.created_at))) && noCanal(origemDe(l)));
    const contato = ls.filter((l) => atendido(l)).length;
    // visitas: no geral = plantão C2S (igual ao Hoje); por canal = marcadas "Veio" com a origem do lead
    const visitas = canal === "pagos"
      ? metricas.filter((m) => entre(m.data)).reduce((s, m) => s + (m.atendimentos || 0), 0)
      : (origens?.visitas ?? []).filter((v) => entre(v.dia) && v.origem === canal).length;
    const pastasP = pastas.filter((p) => p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm))));
    const nPastas = canal === "pagos" ? pastasP.length : pastasP.filter((p) => origemCliente(p.cliente) === canal).length;
    const nVendas = canal === "pagos"
      ? vendas.filter((v) => entre(v.dia)).length
      : pastas.filter((p) => p.etapaOrdem === 10 && p.etapaDesde && entre(diaSP(new Date(p.etapaDesde))) && origemCliente(p.cliente) === canal).length;
    return [
      { k: "Leads", v: ls.length }, { k: "Com contato", v: contato }, { k: "Visitas", v: visitas },
      { k: "Pastas", v: nPastas }, { k: "Vendas", v: nVendas },
    ];
  }, [leads, metricas, origens, pastas, vendas, canal, de, ate]); // eslint-disable-line
  const conv = calc.map((f, i) => (i === 0 ? null : pct(f.v, calc[i - 1].v)));
  const pior = conv.reduce<number>((m, c, i) => (c != null && (m < 0 || c < (conv[m] ?? 101)) ? i : m), -1);
  const contagem = (c: Canal) => leads.filter((l) => entre(diaSP(new Date(l.created_at))) && (c === "pagos" ? !ehPescado(l) : origemDe(l) === c)).length;

  // por corretor (leads pagos do período)
  const linhas = useMemo(() => brokers.map((b) => {
    const ls = leads.filter((l) => l.broker_id === b.id && entre(diaSP(new Date(l.created_at))) && !ehPescado(l));
    const c = ls.filter((l) => atendido(l)).length;
    const vis = (origens?.visitas ?? []).filter((v) => v.brokerId === b.id && entre(v.dia)).length;
    const pas = pastas.filter((p) => p.corretorId === b.id && p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm)))).length;
    const ven = vendas.filter((v) => (v as any).corretor === chaveNome(b.first_name) && entre(v.dia)).length;
    const etapas = [ls.length, c, vis, pas, ven];
    const nomes = ["contato", "visita", "pasta", "venda"];
    let perda = "—";
    for (let i = 1; i < etapas.length; i++) if (etapas[i - 1] > 0 && etapas[i] === 0) { perda = nomes[i - 1]; break; }
    return { id: b.id, nome: b.first_name ?? "—", leads: ls.length, contato: pct(c, ls.length), vis, pas, ven, perda };
  }).filter((x) => x.leads || x.vis || x.pas || x.ven).sort((a, b) => b.ven - a.ven || b.pas - a.pas || b.leads - a.leads), [brokers, leads, origens, pastas, vendas, de, ate]); // eslint-disable-line

  return (
    <section className="fc">
      <style>{CSS}</style>
      <div className="fc-top">
        <div>
          <h2>Funil da equipe · {doMes ? NOME_MES[Number(hoje.slice(5, 7)) - 1] : per.rotulo}</h2>
          <p>A % é sobre a etapa anterior. Mesmas contas do funil do Hoje.</p>
        </div>
        <SeletorPeriodo />
      </div>
      <div className="fc-canais" role="group" aria-label="Canal">
        {CANAIS.map((c) => (
          <button key={c.k} type="button" className={canal === c.k ? "on" : ""} aria-pressed={canal === c.k} onClick={() => setCanal(c.k)}>
            {c.nome} <b>{nf(contagem(c.k))}</b>
          </button>
        ))}
      </div>
      <div className="fc-funil">
        {calc.map((f, i) => (
          <div key={f.k} className={`fc-et${i === pior ? " pior" : ""}${i === 4 ? " fim" : ""}`}>
            <span>{i + 1} · {f.k}{i === pior ? " · maior perda" : ""}</span>
            <b>{nf(f.v)} {conv[i] != null && <i>{conv[i]}%</i>}</b>
          </div>
        ))}
      </div>
      <p className="fc-nota">
        {canal === "pagos"
          ? "Visitas = atendimentos do plantão (C2S). Pastas = cadastradas no Junix no período. Vendas = confirmadas no Junix."
          : "Por canal: visita só conta quando o corretor marcou \"Veio\" no Comandra (o plantão C2S não diz quem é o cliente); pasta e venda pela origem do cliente, descoberta pelo nome no Junix."}
      </p>

      <h3>Por corretor · leads pagos do período</h3>
      <div className="fc-tab">
        <table>
          <thead><tr><th>Corretor</th><th>Leads</th><th>Com contato</th><th>Visitas (Veio)</th><th>Pastas</th><th>Vendas</th><th>Onde trava</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td><b>{l.nome}</b></td><td className="m">{l.leads}</td>
                <td className="m" style={{ color: l.contato != null && l.contato < 50 ? "#A8322A" : undefined }}>{l.contato == null ? "—" : `${l.contato}%`}</td>
                <td className="m">{l.vis}</td><td className="m">{l.pas}</td><td className="m" style={{ color: l.ven ? "#1D6B45" : undefined, fontWeight: l.ven ? 700 : undefined }}>{l.ven}</td>
                <td>{l.perda}</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={7} style={{ color: "var(--fc-mut)" }}>Nenhum movimento no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CSS = `
.fc{--fc-bg:var(--cv-surface,#fff);--fc-line:var(--cv-border,#E1E6EE);--fc-ink:var(--cv-text,#0F1B2D);--fc-mut:var(--cv-text-muted,#3C4B5F);
  background:var(--fc-bg);border:1px solid var(--fc-line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:14px;margin-bottom:18px;color:var(--fc-ink);font-family:Archivo,system-ui,sans-serif}
.fc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.fc h2{margin:0;font-size:18px;font-weight:800}
.fc h3{margin:6px 0 0;font-size:15px;font-weight:800}
.fc-top p,.fc-nota{margin:4px 0 0;font-size:13px;color:var(--fc-mut)}
.fc-canais{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .fc-canais button{min-height:38px;padding:0 14px;border-radius:99px;border:1px solid var(--fc-line);background:var(--fc-bg);color:var(--fc-ink);font-size:13px;font-weight:600}
.mgr10 .fc-canais button.on{background:var(--fc-ink);border-color:var(--fc-ink);color:var(--fc-bg)}
.fc-canais b{font-family:"JetBrains Mono",monospace;margin-left:4px}
.fc-funil{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.fc-et{padding:12px;border-radius:10px;background:#EEF3F9;color:#0F1B2D;display:flex;flex-direction:column;gap:4px}
.fc-et span{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3C4B5F}
.fc-et b{font-family:"JetBrains Mono",monospace;font-size:26px}
.fc-et i{font-style:normal;font-size:14px;color:#5B6B80}
.fc-et.pior{background:#FBEDEC;border:1px solid #F0C4BF}
.fc-et.pior span{color:#A8322A}
.fc-et.fim{background:#E3F1EA}
.fc-tab{overflow-x:auto}
.fc-tab table{width:100%;border-collapse:collapse;font-size:13.5px}
.fc-tab th{text-align:left;font-size:12px;text-transform:uppercase;color:var(--fc-mut);padding:8px 10px;border-bottom:1px solid var(--fc-line)}
.fc-tab td{padding:9px 10px;border-bottom:1px solid var(--fc-line)}
.fc-tab td.m{font-family:"JetBrains Mono",monospace}
@media (max-width:900px){.fc-funil{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
