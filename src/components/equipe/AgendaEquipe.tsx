/* Agenda da equipe (29/10, mockup aprovado pelo Junior: https://claude.ai/artifact/BEbxPA8Vq3qa4xwp8G95NY, aba "Equipe hoje").
 * Visitas marcadas pelos corretores (leads.visit_scheduled_at, gravado pelo "Agendar visita" do painel do corretor) da estrutura
 * de quem olha (RPC agenda_equipe: gerente = equipe dele, super = as dela, diretor = todas). "Veio" = check-in do C2S do mesmo
 * telefone no dia, ou a etapa do lead já passou da visita. Ao lado: o que a tela que usa o componente mandar (ex.: Quem cobrar agora),
 * o resumo da semana e as pastas por etapa (usePastas).
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePastas } from "@/hooks/usePastas";

const sb = supabase as any;
type Visita = { lead_id: string; cliente: string | null; telefone: string | null; quando: string; local: string | null; corretor: string | null;
  corretor_id: string; equipe_id: string | null; equipe: string | null; status: string; confirmada: boolean; veio_em: string | null; depois: boolean };
type Agenda = { equipes: { id: string; nome: string }[]; sem_data: number; visitas: Visita[] };

const TZ = "America/Sao_Paulo";
const SEM = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const spDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: TZ }));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaSP = (iso: string) => ymd(spDate(new Date(iso)));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const falta = (iso: string) => {
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (m < 60) return `em ${Math.max(m, 0)} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return h < 24 ? `em ${h}h${r ? String(r).padStart(2, "0") : ""}` : "amanhã";
};
const situacao = (v: Visita): ["ok" | "no" | "n" | "c", string] => {
  if (v.veio_em) return ["ok", `Veio · check-in ${hhmm(v.veio_em)}`];
  if (v.depois) return ["ok", "Veio"];
  if (new Date(v.quando).getTime() < Date.now() - 2 * 3600e3) return ["no", "Não veio · remarcar"];
  return v.confirmada ? ["c", "Confirmada"] : ["n", "Marcada"];
};

const CSS = `.ae{display:grid;gap:14px;color:var(--cv-text-main,#0f1b2d)}
.ae .ae-al{background:color-mix(in srgb,#0e7c7b 10%,var(--cv-surface,#fff));border:1px solid color-mix(in srgb,#0e7c7b 35%,transparent);border-radius:16px;padding:14px 16px;display:grid;gap:8px}
.ae .ae-al h3{margin:0;font-size:16px;color:#0e7c7b}
.ae .ae-ai{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px}
.ae .ae-ai .t{background:#0e7c7b;color:#fff;border-radius:99px;padding:2px 10px;font-weight:800;font-size:12.5px;white-space:nowrap}
.ae .ae-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:14px;align-items:start}
@media (max-width:960px){.ae .ae-grid{grid-template-columns:1fr}}
.ae .ae-p{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#e2e8f0);border-radius:16px;display:grid;gap:12px;padding:14px 0 0;min-width:0}
.ae .ae-pad{padding:0 16px}
.ae .ae-wk{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ae .ae-wk h3{margin:0;font-size:19px;text-transform:capitalize}
.ae .ae-nav{display:flex;gap:6px}
.ae .ae-nav button{border:1px solid var(--cv-border,#e2e8f0);background:var(--cv-surface,#fff);color:inherit;border-radius:10px;padding:6px 12px;font-weight:700;cursor:pointer}
.ae .ae-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.ae .ae-day{border:1px solid var(--cv-border,#e2e8f0);background:var(--cv-surface,#fff);color:inherit;border-radius:14px;padding:8px 2px;text-align:center;cursor:pointer;display:grid;gap:1px}
.ae .ae-day .d{font-size:11px;font-weight:700;color:var(--cv-text-muted,#64748b)}
.ae .ae-day .n{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums}
.ae .ae-day .c{font-size:11px;color:var(--cv-text-muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ae .ae-day.hj{border-color:#0e7c7b}
.ae .ae-day.on{background:#0e7c7b;border-color:#0e7c7b;color:#fff}.ae .ae-day.on .d,.ae .ae-day.on .c{color:#e6fffd}
.ae .ae-fil{display:flex;gap:8px;flex-wrap:wrap}
.ae .ae-seg{display:flex;flex-wrap:wrap;background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#e2e8f0);border-radius:99px;padding:3px}
.ae .ae-seg button{border:0;background:none;color:var(--cv-text-muted,#64748b);padding:5px 11px;border-radius:99px;font-weight:600;font-size:13px;cursor:pointer}
.ae .ae-seg button.on{background:var(--cv-text-main,#0f1b2d);color:var(--cv-surface,#fff)}
.ae .ae-slot{display:grid;grid-template-columns:52px 1fr;gap:10px;padding:10px 16px;border-top:1px solid var(--cv-border,#e2e8f0);align-items:start}
.ae .ae-slot .h{font-weight:800;color:var(--cv-text-muted,#64748b);padding-top:6px;font-variant-numeric:tabular-nums}
.ae .ae-ev{border-left:3px solid #1d4ed8;background:color-mix(in srgb,var(--cv-text-main,#0f1b2d) 4%,var(--cv-surface,#fff));border-radius:10px;padding:8px 12px;display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;align-items:center}
.ae .ae-ev+.ae-ev{margin-top:6px}
.ae .ae-ev b{display:block}.ae .ae-ev small{color:var(--cv-text-muted,#64748b)}
.ae .ae-ev.ok{border-color:#15803d}.ae .ae-ev.no{border-color:#dc2626}.ae .ae-ev.c{border-color:#0e7c7b}
.ae .ae-ch{display:inline-flex;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap;background:color-mix(in srgb,#1d4ed8 12%,var(--cv-surface,#fff));color:#1d4ed8}
.ae .ae-ch.ok{background:color-mix(in srgb,#16a34a 14%,var(--cv-surface,#fff));color:#15803d}
.ae .ae-ch.no{background:color-mix(in srgb,#dc2626 12%,var(--cv-surface,#fff));color:#b91c1c}
.ae .ae-ch.c{background:color-mix(in srgb,#0e7c7b 14%,var(--cv-surface,#fff));color:#0e7c7b}
.ae .ae-vz{color:var(--cv-text-muted,#64748b);font-size:13px;padding:4px 16px 16px}
.ae .ae-side{display:grid;gap:14px;min-width:0}
.ae .ae-box{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#e2e8f0);border-radius:16px;padding:14px 16px;display:grid;gap:10px}
.ae .ae-box h3{margin:0;font-size:15px}
.ae .ae-pr{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;font-size:13.5px}
.ae .ae-pr .bar{grid-column:1 / -1;height:8px;border-radius:99px;background:color-mix(in srgb,var(--cv-text-main,#0f1b2d) 7%,var(--cv-surface,#fff));overflow:hidden}
.ae .ae-pr .bar i{display:block;height:100%;border-radius:99px;background:#1d4ed8}
.ae .ae-pr b{font-variant-numeric:tabular-nums}
.ae .ae-m{color:var(--cv-text-muted,#64748b);font-size:12.5px}`;

export default function AgendaEquipe({ donoId, lateral }: { donoId?: string | null; lateral?: ReactNode }) {
  const [semana, setSemana] = useState(0);
  const hoje = ymd(spDate(new Date()));
  const seg = useMemo(() => {
    const h = spDate(new Date()); const dow = (h.getDay() + 6) % 7;
    return new Date(h.getFullYear(), h.getMonth(), h.getDate() - dow + semana * 7);
  }, [semana]);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + i)), [seg]);
  const [sel, setSel] = useState(hoje);
  const [fEq, setFEq] = useState("");
  const [fSit, setFSit] = useState<"" | "no" | "vai">("");

  const { data, isLoading } = useQuery({
    queryKey: ["agenda-equipe", donoId ?? "", ymd(dias[0])],
    queryFn: async () => {
      const { data, error } = await sb.rpc("agenda_equipe", { p_dono: donoId || null, p_de: ymd(new Date(dias[0].getTime() - 864e5)), p_ate: ymd(new Date(dias[6].getTime() + 2 * 864e5)) });
      if (error) throw error;
      return data as Agenda;
    },
    refetchInterval: 5 * 60_000,
  });
  const { data: pastas } = usePastas(donoId ?? undefined);

  const todas = (data?.visitas ?? []).filter((v) => !fEq || v.equipe_id === fEq);
  const doDia = (d: string) => todas.filter((v) => diaSP(v.quando) === d);
  const lista = doDia(sel).filter((v) => !fSit || (fSit === "no" ? situacao(v)[0] === "no" : new Date(v.quando).getTime() >= Date.now()));
  const proximas = todas.filter((v) => { const t = new Date(v.quando).getTime(); return t >= Date.now() - 15 * 60e3 && t <= Date.now() + 24 * 3600e3 && situacao(v)[0] !== "ok"; });
  const daSemana = todas.filter((v) => { const d = diaSP(v.quando); return d >= ymd(dias[0]) && d <= ymd(dias[6]); });
  const sw = { m: daSemana.length, ok: daSemana.filter((v) => situacao(v)[0] === "ok").length, no: daSemana.filter((v) => situacao(v)[0] === "no").length };
  const vai = sw.m - sw.ok - sw.no;
  const porHora = new Map<string, Visita[]>();
  for (const v of lista) { const h = hhmm(v.quando).slice(0, 2) + "h"; porHora.set(h, [...(porHora.get(h) ?? []), v]); }
  const selD = new Date(`${sel}T12:00:00-03:00`);
  const rotSel = selD.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const mesTitulo = MES[dias[0].getMonth()] === MES[dias[6].getMonth()] ? `${MES[dias[0].getMonth()]} ${dias[0].getFullYear()}` : `${MES[dias[0].getMonth()]} – ${MES[dias[6].getMonth()]} ${dias[6].getFullYear()}`;
  const etapas = (pastas?.etapas ?? []).filter((e) => e.n > 0 && !/venda/i.test(e.etapa));
  const maxE = Math.max(1, ...etapas.map((e) => e.n));
  const travadas = etapas.reduce((a, e) => a + e.travadas, 0);
  const barra = (n: number, t: number, cor?: string) => <div className="bar"><i style={{ width: `${t ? (100 * n) / t : 0}%`, background: cor }} /></div>;

  return (
    <div className="ae"><style>{CSS}</style>
      {proximas.length ? (
        <section className="ae-al" aria-label="Visitas nas próximas 24 horas">
          <h3>{proximas.length} visita{proximas.length > 1 ? "s" : ""} nas próximas 24h</h3>
          {proximas.slice(0, 6).map((v) => (
            <div key={v.lead_id} className="ae-ai"><span className="t">{falta(v.quando)}</span>
              <span><b>{hhmm(v.quando)}</b> {v.cliente ?? "Cliente"} · com {v.corretor}{v.local ? ` · ${v.local}` : ""}</span></div>))}
        </section>) : null}

      <div className="ae-grid">
        <section className="ae-p" aria-label="Agenda da semana">
          <div className="ae-wk ae-pad"><h3>{mesTitulo}</h3>
            <div className="ae-nav"><button type="button" aria-label="Semana anterior" onClick={() => setSemana(semana - 1)}>‹</button>
              <button type="button" onClick={() => { setSemana(0); setSel(hoje); }}>Hoje</button>
              <button type="button" aria-label="Próxima semana" onClick={() => setSemana(semana + 1)}>›</button></div></div>
          <div className="ae-days ae-pad">
            {dias.map((d) => { const k = ymd(d), n = doDia(k).length;
              return <button key={k} type="button" className={`ae-day${k === sel ? " on" : ""}${k === hoje ? " hj" : ""}`} onClick={() => setSel(k)} aria-pressed={k === sel}>
                <span className="d">{SEM[d.getDay()]}</span><span className="n">{d.getDate()}</span><span className="c">{n ? `${n} visita${n > 1 ? "s" : ""}` : "—"}</span></button>; })}
          </div>
          <div className="ae-fil ae-pad">
            {(data?.equipes?.length ?? 0) > 1 ? <div className="ae-seg"><button type="button" className={!fEq ? "on" : ""} onClick={() => setFEq("")}>Equipe toda</button>
              {data!.equipes.map((e) => <button key={e.id} type="button" className={fEq === e.id ? "on" : ""} onClick={() => setFEq(e.id)}>{e.nome}</button>)}</div> : null}
            <div className="ae-seg"><button type="button" className={!fSit ? "on" : ""} onClick={() => setFSit("")}>Todas</button>
              <button type="button" className={fSit === "vai" ? "on" : ""} onClick={() => setFSit("vai")}>Ainda vão acontecer</button>
              <button type="button" className={fSit === "no" ? "on" : ""} onClick={() => setFSit("no")}>Não veio</button></div>
          </div>
          <div className="ae-pad" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ textTransform: "capitalize" }}>{rotSel}</b>
            <span className="ae-m">{lista.length ? `${lista.length} visita${lista.length > 1 ? "s" : ""}` : ""}</span></div>
          <div>
            {isLoading ? <p className="ae-vz">Carregando a agenda…</p>
              : !lista.length ? <p className="ae-vz">Nenhuma visita marcada neste dia{fSit || fEq ? " com esse filtro" : ""}.</p>
              : [...porHora.entries()].map(([h, vs]) => (
                <div key={h} className="ae-slot"><span className="h">{h}</span><div>
                  {vs.map((v) => { const [c, t] = situacao(v);
                    return <div key={v.lead_id} className={`ae-ev ${c}`}><div><b>{hhmm(v.quando)} · {v.cliente ?? "Cliente"}</b>
                      <small>com {v.corretor}{v.equipe && !fEq && (data?.equipes?.length ?? 0) > 1 ? ` (equipe ${v.equipe})` : ""}{v.local ? ` · ${v.local}` : ""}</small></div>
                      <span className={`ae-ch ${c}`}>{t}</span></div>; })}
                </div></div>))}
          </div>
        </section>

        <aside className="ae-side">
          {lateral}
          <section className="ae-box" aria-label="Visitas da semana">
            <h3>Visitas da semana</h3>
            <div className="ae-pr"><span>Marcadas</span><b>{sw.m}</b>{barra(sw.m, sw.m)}</div>
            <div className="ae-pr"><span>Vieram</span><b>{sw.ok}</b>{barra(sw.ok, sw.m, "#15803d")}</div>
            <div className="ae-pr"><span>Não vieram</span><b>{sw.no}</b>{barra(sw.no, sw.m, "#dc2626")}</div>
            <div className="ae-pr"><span>Ainda vão acontecer</span><b>{vai}</b>{barra(vai, sw.m, "var(--cv-text-muted,#64748b)")}</div>
            {data?.sem_data ? <span className="ae-m">{data.sem_data} lead{data.sem_data > 1 ? "s" : ""} em "Visita" sem dia e hora (marcados antes de 29/10).</span> : null}
          </section>
          {etapas.length ? (
            <section className="ae-box" aria-label="Pastas da equipe">
              <h3>Pastas da equipe</h3>
              <span className="ae-m" style={{ marginTop: -6 }}>No Junix · em que etapa está cada pasta</span>
              {etapas.map((e) => <div key={e.etapa} className="ae-pr"><span>{e.etapa}</span><b>{e.n}</b>{barra(e.n, maxE)}</div>)}
              {travadas ? <div className="ae-pr"><span style={{ color: "#b91c1c" }}>Paradas há mais de 7 dias</span><b style={{ color: "#b91c1c" }}>{travadas}</b>{barra(travadas, maxE, "#dc2626")}</div> : null}
            </section>) : null}
        </aside>
      </div>
    </div>
  );
}
