/* Tela do diretor — porte do protótipo aprovado (Desktop.dc.html), com dado real.
 * Hoje: meta em cascata, "decida hoje", pessoas, funil, cobranças.
 * Equipes / Leads / Pastas: árvore que abre superintendência → gerente → corretor.
 * Gastos: anúncio real por equipe; plano e outros gastos chegam na próxima entrega. */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useConsolidadoSuper, type LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import { useDiretorId, useDiretoria, useMetasDiretoria, donoJunix, chaveGerente,
  type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";
import PlanoEstrategico from "@/components/plano/PlanoEstrategico";
import GastosPlano from "@/components/plano/GastosPlano";
import { usePlanos, atrasada } from "@/hooks/usePlano";
import "@/styles/diretoria.css";

type Aba = "hoje" | "equipes" | "leads" | "pastas" | "plano" | "gastos";
const ABAS: [Aba, string][] = [["hoje", "Hoje"], ["equipes", "Equipes"], ["leads", "Leads e investimento"], ["pastas", "Pastas"], ["plano", "Plano estratégico"], ["gastos", "Gastos"]];
const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "7 dias"], [30, "30 dias"]];

const nf = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const curto = (n: number) => n >= 1e6 ? `R$ ${(n / 1e6).toFixed(2).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${(n / 1e3).toFixed(1).replace(".", ",")} mil` : n ? brl(n) : "—";
const Z = ({ n, fmt = nf, cls }: { n: number | null | undefined; fmt?: (n: number) => string; cls?: string }) =>
  n ? <span className={cls}>{fmt(n)}</span> : <span className="z">—</span>;
const inicioMes = (desloc = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10); };
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

function linhaVazia(id: string, nome: string): LinhaConsolidado {
  return { id, nome, plantaoDias: 0, visitas: 0, vendas: 0, vgv: 0, pastas: 0, pastasTravadas: 0, gasto: null, leadsFb: null,
    leads: { anuncio: 0, disparo: 0, pescados: 0, outros: 0 }, nuncaFalaram: 0 };
}
function somar(nome: string, ls: LinhaConsolidado[]): LinhaConsolidado {
  const t = linhaVazia("soma", nome);
  for (const l of ls) {
    t.plantaoDias += l.plantaoDias; t.visitas += l.visitas; t.vendas += l.vendas; t.vgv += l.vgv;
    t.pastas += l.pastas; t.pastasTravadas += l.pastasTravadas; t.nuncaFalaram += l.nuncaFalaram;
    if (l.gasto != null) t.gasto = (t.gasto ?? 0) + l.gasto;
    if (l.leadsFb != null) t.leadsFb = (t.leadsFb ?? 0) + l.leadsFb;
    for (const k of Object.keys(t.leads) as (keyof LinhaConsolidado["leads"])[]) t.leads[k] += l.leads[k];
  }
  return t;
}
const totLeads = (l: LinhaConsolidado) => l.leads.anuncio + l.leads.disparo + l.leads.pescados + l.leads.outros;

function Seta({ on }: { on: boolean }) { return <span className={`dir-seta${on ? " on" : ""}`} aria-hidden>▸</span>; }

export default function Diretoria() {
  const { session, role } = useAuth();
  const nav = useNavigate();
  const [aba, setAba] = useState<Aba>("hoje");
  const [dias, setDias] = useState(30);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [deslocMes, setDeslocMes] = useState(0);
  const tog = (k: string) => setAberto((v) => ({ ...v, [k]: !v[k] }));
  const abrirPainel = (id: string) => nav(`/manager?manager=${id}`);

  const { data: diretorId } = useDiretorId(role, session?.user?.id);
  const { data: dir, isLoading } = useDiretoria(diretorId, dias);
  const { data: cons, isLoading: carregandoCons } = useConsolidadoSuper(diretorId ?? undefined, dias);

  // anúncio do MÊS corrente (dia 1 até hoje) para o realizado dos gastos
  const { data: consMes } = useConsolidadoSuper(aba === "gastos" ? diretorId ?? undefined : undefined, new Date().getDate());
  const porId = useMemo(() => new Map((cons?.linhas ?? []).map((l) => [l.id, l])), [cons]);
  const supers = dir?.supers ?? [];
  // linhas do consolidado de cada super: gerentes + "direto com o super" + "sem gerente no Comandra"
  const linhasDoSuper = (s: SuperDiretoria) => [
    ...s.gerentes.map((g) => porId.get(g.id) ?? linhaVazia(g.id, g.nome)),
    ...(porId.get(s.id) ? [{ ...porId.get(s.id)!, nome: `Direto com ${s.nome}` }] : []),
    ...(porId.get(`outros:${s.id}`) ? [porId.get(`outros:${s.id}`)!] : []),
  ];
  const totalEmpresa = cons ? somar("Empresa", cons.linhas) : null;

  const primeiroNome = (session?.user?.user_metadata as any)?.first_name || "Junior";
  const hojeD = new Date();
  const diasMes = new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0).getDate();

  return (
    <div className="dir">
      <header className="dir-top">
        <div className="dir-logo">C</div>
        <div className="dir-ola">
          <small>Diretoria · {nomeMes(inicioMes())} · dia {hojeD.getDate()} de {diasMes}</small>
          <b>{saudacao()}, {String(primeiroNome).split(" ")[0]}</b>
        </div>
        <nav className="dir-nav" aria-label="Seções">
          {ABAS.map(([k, t]) => <button key={k} className={aba === k ? "on" : ""} aria-current={aba === k ? "page" : undefined} onClick={() => setAba(k)}>{t}</button>)}
        </nav>
        {role === "ADMIN" ? <Link to="/admin" className="dir-ghost">Admin</Link> : null}
        <Link to="/super?aba=time" className="dir-ghost" title="Tela anterior, com cadastro e desligamento">Gestão do time</Link>
      </header>

      <main className="dir-wrap">
        {aba === "plano" || aba === "gastos" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="dir-lbl">Mês</span>
            <div className="dir-per">
              <button className={deslocMes === 0 ? "on" : ""} onClick={() => setDeslocMes(0)}>{nomeMes(inicioMes(0))}</button>
              <button className={deslocMes === 1 ? "on" : ""} onClick={() => setDeslocMes(1)}>{nomeMes(inicioMes(1))}</button>
            </div>
            <span className="dir-nota">{aba === "plano" ? "O plano da diretoria é a prioridade; cada super desdobra o dele a partir dele." : "Cada super lança os gastos dele; aqui soma tudo com os gastos da diretoria."}</span>
          </div>
        ) : aba !== "hoje" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="dir-lbl">Período</span>
            <div className="dir-per">{PERIODOS.map(([n, t]) => <button key={n} className={dias === n ? "on" : ""} onClick={() => setDias(n)}>{t}</button>)}</div>
            <span className="dir-nota">Clique na superintendência para abrir os gerentes; no gerente para abrir os corretores.</span>
          </div>
        ) : null}

        {isLoading || !dir ? <div className="dir-card dir-vazio">Juntando C2S, Junix, Facebook e Comandra…</div> : (
          <>
            {aba === "hoje" && <Hoje diretorId={diretorId!} supers={supers} total={totalEmpresa} cons={cons?.linhas ?? []}
              carregandoCons={carregandoCons} plantaoHojeTotal={dir.plantaoHojeTotal} cobrancas={dir.cobrancas} pastas={dir.pastas}
              irPara={(a, k) => { setAba(a); if (k) setAberto((v) => ({ ...v, [k]: true })); }} abrirPainel={abrirPainel} />}
            {aba === "equipes" && <Equipes supers={supers} linhasDoSuper={linhasDoSuper} aberto={aberto} tog={tog} abrirPainel={abrirPainel} carregandoCons={carregandoCons} />}
            {aba === "leads" && <Leads supers={supers} linhasDoSuper={linhasDoSuper} total={totalEmpresa} aberto={aberto} tog={tog} abrirPainel={abrirPainel} carregandoCons={carregandoCons} />}
            {aba === "pastas" && <Pastas supers={supers} pastas={dir.pastas} aberto={aberto} tog={tog} />}
            {aba === "plano" && diretorId && session?.user?.id && <PlanoEstrategico raizId={diretorId} meuId={session.user.id} mes={inicioMes(deslocMes)} />}
            {aba === "gastos" && diretorId && (<>
              <GastosPlano raizId={diretorId} mes={inicioMes(deslocMes)} podeCriarCategoria
                anuncio={deslocMes === 0 && consMes ? new Map<string, number>([
                  [diretorId, consMes.linhas.find((l) => l.id === "super")?.gasto ?? 0],
                  ...supers.map((s) => [s.id, consMes.linhas.filter((l) => l.id === s.id || l.id === `outros:${s.id}` || s.gerentes.some((g) => g.id === l.id))
                    .reduce((a, l) => a + (l.gasto ?? 0), 0)] as [string, number])]) : new Map()} />
              {deslocMes === 0 ? <Gastos supers={supers} linhasDoSuper={linhasDoSuper} total={totalEmpresa} carregandoCons={carregandoCons} /> : null}
            </>)}
          </>
        )}
        <p className="dir-nota">Fontes: Junix (venda, VGV, pastas) · C2S (plantão, visita) · Facebook (anúncio) · Comandra (leads, login).</p>
      </main>
    </div>
  );
}

/* ───────────────────────── HOJE ───────────────────────── */
function MetaInput({ valor, onSalvar }: { valor: number | null; onSalvar: (n: number) => void }) {
  const [txt, setTxt] = useState(valor == null ? "" : String(valor));
  const salvar = () => { const n = parseInt(txt, 10); if (!Number.isNaN(n) && n !== valor) onSalvar(n); };
  return <input className="dir-meta-in" type="number" min={0} inputMode="numeric" value={txt} placeholder="—" aria-label="meta de vendas"
    onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function Hoje({ diretorId, supers, total, cons, carregandoCons, plantaoHojeTotal, cobrancas, pastas, irPara, abrirPainel }: {
  diretorId: string; supers: SuperDiretoria[]; total: LinhaConsolidado | null; cons: LinhaConsolidado[]; carregandoCons: boolean;
  plantaoHojeTotal: number; cobrancas: import("@/hooks/useDiretoria").Cobranca[]; pastas: PastaJunix[];
  irPara: (a: Aba, k?: string) => void; abrirPainel: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [desloc, setDesloc] = useState(0);
  const mes = inicioMes(desloc);
  const { data: metas } = useMetasDiretoria(diretorId, mes);
  const { data: planosMes } = usePlanos(inicioMes());
  async function definir(id: string, n: number, nome: string) {
    const { error } = await supabase.rpc("definir_meta" as any, { p_mes: mes, p_dono: id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${nome} em ${nomeMes(mes)}: ${n} venda${n === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  }

  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const d = metas?.dono;
  const realizado = d?.realizado ?? 0;
  const projecao = desloc === 0 ? Math.round((realizado / Math.max(1, hoje.getDate())) * diasMes) : null;
  const pct = d?.meta ? Math.min(100, (realizado / d.meta) * 100) : 0;
  const ritmo = desloc === 0 ? (hoje.getDate() / diasMes) * 100 : 0;
  const somaSupers = (metas?.filhos ?? []).reduce((a, f) => a + (f.meta ?? 0), 0);

  // pessoas
  const gerentes = supers.flatMap((s) => s.gerentes.map((g) => ({ s, g })));
  const corretores = gerentes.flatMap(({ s, g }) => g.corretores_lista.map((c) => ({ s, g, c })));
  const online = corretores.filter((x) => x.c.online).length;
  const logados = corretores.filter((x) => x.s.logadosHoje[x.c.id]).length;
  const plantaoComLogin = corretores.filter((x) => x.c.plantao_hoje).length;
  const semLogin = gerentes.reduce((a, { s, g }) => a + (s.plantaoSemLogin[g.id]?.length ?? 0), 0);
  const nuncaEntraram = corretores.filter((x) => !x.c.ultimo_acesso).length;

  // decida hoje: as 3 coisas mais caras agora, do dado
  type Dec = { cls: string; tipo: string; quem: string; titulo: string; porque: string; acoes: [string, () => void][] };
  const decs: (Dec & { peso: number })[] = [];
  for (const { s, g } of gerentes) {
    const l = cons.find((x) => x.id === g.id);
    if (l && l.nuncaFalaram >= 10) decs.push({ peso: l.nuncaFalaram, cls: "c-red", tipo: "dinheiro na mesa", quem: `${s.nome} › ${g.nome}`,
      titulo: `${nf(l.nuncaFalaram)} leads na equipe do ${g.nome} sem nenhum toque`, porque: "Lead pago parado na mão do corretor — esfria em 2 dias.",
      acoes: [[`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)], ["Ver leads", () => irPara("leads", `s:${s.id}`)]] });
    const sl = s.plantaoSemLogin[g.id]?.length ?? 0;
    if (sl >= 2) decs.push({ peso: sl * 8, cls: "c-org", tipo: "equipe invisível", quem: `${s.nome} › ${g.nome}`,
      titulo: `${sl} corretores do ${g.nome} no plantão hoje sem login no Comandra`, porque: "Estão trabalhando, mas não recebem lead nem aparecem nos números.",
      acoes: [["Ver nomes", () => irPara("equipes", `s:${s.id}`)], [`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)]] });
    if (l && l.plantaoDias >= 15 && l.visitas === 0) decs.push({ peso: l.plantaoDias, cls: "c-org", tipo: "plantão sem visita", quem: `${s.nome} › ${g.nome}`,
      titulo: `${g.nome}: ${l.plantaoDias} dias de plantão e nenhuma visita registrada`, porque: "Ou a visita não está sendo lançada no C2S, ou o plantão não converte.",
      acoes: [[`Abrir painel do ${g.nome}`, () => abrirPainel(g.id)], ["Ver equipe", () => irPara("equipes", `s:${s.id}`)]] });
  }
  const travadas = pastas.filter((p) => (p.dias ?? 0) >= 7).length;
  if (travadas >= 3) decs.push({ peso: travadas * 3, cls: "c-blue", tipo: "pasta parada", quem: "empresa toda",
    titulo: `${travadas} pastas paradas há 7 dias ou mais no Junix`, porque: "Venda quase feita que pode cair — cobre o gerente de cada uma.",
    acoes: [["Ver pastas", () => irPara("pastas")]] });
  const atrasadasPlano = (planosMes ?? []).flatMap((p) => p.acoes.filter(atrasada));
  if (atrasadasPlano.length) decs.push({ peso: 1000 + atrasadasPlano.length, cls: "c-red", tipo: "plano atrasado", quem: "plano estratégico",
    titulo: `${atrasadasPlano.length} ${atrasadasPlano.length === 1 ? "ação do plano passou" : "ações do plano passaram"} do prazo`,
    porque: "O Jarvis já cobra os responsáveis às 9h — veja quem e decida se ajusta o prazo ou o responsável.",
    acoes: [["Ver plano", () => irPara("plano")]] });
  const decida = decs.sort((a, b) => b.peso - a.peso).slice(0, 3);

  const leadsTot = total ? totLeads(total) : 0;
  const funil = total ? [
    { nome: "Leads que entraram", n: leadsTot, obs: "anúncio, disparo, pescados e outros", ruim: false },
    { nome: "Sem nenhum toque do corretor", n: total.nuncaFalaram, obs: "carteira ativa que ninguém tocou — o vazamento", ruim: true },
    { nome: "Visitas (C2S)", n: total.visitas, obs: "cliente atendido no estande", ruim: false },
    { nome: "Pastas abertas (Junix)", n: total.pastas, obs: "agora", ruim: false },
    { nome: "Vendas (Junix)", n: total.vendas, obs: "no período", ruim: false },
  ] : [];
  const maxF = Math.max(1, ...funil.map((f) => f.n));

  return (
    <>
      <div className="dir-row2">
        <div>
          <div className="dir-card dir-hero">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="mono dir-hero-n">{realizado}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>vendas em {nomeMes(mes)}</span>
              <span style={{ marginLeft: "auto" }} className="dir-per">
                <button className={desloc === 0 ? "on" : ""} onClick={() => setDesloc(0)}>Este mês</button>
                <button className={desloc === 1 ? "on" : ""} onClick={() => setDesloc(1)}>Próximo</button>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap", fontSize: 14, color: "var(--ink-3)" }}>
              Meta da empresa {d?.pode_editar ? <MetaInput key={`${mes}-${d.meta}`} valor={d.meta} onSalvar={(n) => definir(d.id, n, "a empresa")} /> : <b className="mono">{d?.meta ?? "—"}</b>}
              {projecao != null && d?.meta ? <span>· no ritmo atual fecha em <b style={{ color: "var(--ink)" }}>{projecao}</b></span> : null}
              {projecao != null && d?.meta ? <span className={`dir-chip ${projecao >= d.meta ? "c-grn" : "c-red"}`}>{projecao >= d.meta ? "no ritmo" : "abaixo do ritmo"}</span> : null}
            </div>
            {d?.meta ? <div className="dir-bar" style={{ marginTop: 14 }}><i style={{ width: `${pct}%` }} />{ritmo ? <em style={{ left: `${ritmo}%` }} title="onde deveria estar hoje" /> : null}</div> : null}
            <div className="dir-list" style={{ marginTop: 14 }}>
              {(metas?.filhos ?? []).map((f) => (
                <div key={f.id}>
                  <span style={{ flex: 1 }}><b>{f.nome}</b> <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· vendeu <b className="mono" style={{ color: "var(--ink)" }}>{f.realizado}</b>{f.meta ? ` de ${f.meta}` : " · sem meta"}</span></span>
                  {f.pode_editar ? <MetaInput key={`${mes}-${f.id}-${f.meta}`} valor={f.meta} onSalvar={(n) => definir(f.id, n, f.nome)} /> : <b className="mono">{f.meta ?? "—"}</b>}
                </div>
              ))}
              {d?.meta ? <div style={{ fontSize: 13, fontWeight: 600, color: somaSupers < d.meta ? "var(--red)" : "var(--ink-3)" }}>
                {somaSupers < d.meta ? `Distribuído ${somaSupers} de ${d.meta} — faltam ${d.meta - somaSupers}` : `Distribuído ${somaSupers} de ${d.meta} ✓`} · cada super distribui para os gerentes</div> : null}
            </div>
          </div>
          <div className="dir-kpis">
            <div className="dir-card dir-kpi"><div className="dir-lbl">VGV 30d</div><span className="mono">{total ? curto(total.vgv) : "…"}</span><small>Junix</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Anúncio 30d</div><span className="mono">{total ? curto(total.gasto ?? 0) : "…"}</span>
              <small>{total?.leadsFb ? `${nf(total.leadsFb)} leads · ${brl((total.gasto ?? 0) / total.leadsFb)} cada` : carregandoCons ? "carregando…" : "—"}</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por venda</div><span className="mono">{total?.vendas ? brl((total.gasto ?? 0) / total.vendas) : "—"}</span><small>anúncio ÷ vendas</small></div>
            <div className="dir-card dir-kpi"><div className="dir-lbl">Sem nenhum toque</div><span className="mono" style={{ color: "var(--red)" }}>{total ? nf(total.nuncaFalaram) : "…"}</span><small>carteira ativa</small></div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2.2" aria-hidden><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Decida hoje</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>as {decida.length || "—"} mais caras agora — o resto pode esperar</span>
          </div>
          {carregandoCons && !decida.length ? <div className="dir-card dir-vazio">Calculando…</div> : null}
          {!carregandoCons && !decida.length ? <div className="dir-card dir-vazio">Nada urgente agora.</div> : null}
          {decida.map((x, i) => (
            <div key={i} className="dir-card dir-dec">
              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`dir-chip ${x.cls}`}>{x.tipo}</span><span style={{ fontSize: 12, color: "var(--ink-3)" }}>{x.quem}</span></div>
                <div className="dir-dec-t">{x.titulo}</div>
                <div className="dir-dec-p">{x.porque}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {x.acoes.map(([t, f], j) => <button key={t} className={`dir-btn${j === 0 ? " solid" : ""}`} onClick={f}>{t}</button>)}
              </div>
            </div>
          ))}

          <div className="dir-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Pessoas hoje</div>
            <div className="dir-list">
              {[
                [corretores.length, "var(--ink)", "corretores ativos no Comandra"],
                [plantaoHojeTotal, "var(--teal)", "no plantão hoje (check-in C2S)"],
                [logados, "var(--teal)", "entraram no Comandra hoje"],
                [online, "var(--grn)", "online agora"],
                [semLogin, semLogin ? "var(--red)" : "var(--ink-3)", "no plantão hoje sem login no Comandra"],
                [nuncaEntraram, nuncaEntraram ? "var(--org)" : "var(--ink-3)", "corretores nunca entraram"],
              ].map(([n, cor, t]) => (
                <div key={t as string}><span className="mono" style={{ fontSize: 20, fontWeight: 700, width: 52, color: cor as string }}>{n as number}</span><span style={{ flex: 1, fontSize: 13.5 }}>{t as string}</span></div>
              ))}
            </div>
            <button className="dir-btn" style={{ marginTop: 10 }} onClick={() => irPara("equipes")}>Ver por equipe</button>
          </div>
        </div>
      </div>

      <div className="dir-grid3">
        <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Funil da empresa · 30 dias</div>
          {!funil.length ? <span className="dir-nota">carregando…</span> : funil.map((f) => (
            <div key={f.nome}>
              <div style={{ display: "flex", fontSize: 13.5 }}><span style={{ fontWeight: 600 }}>{f.nome}</span><span className="mono" style={{ marginLeft: "auto", fontWeight: 700 }}>{nf(f.n)}</span></div>
              <div style={{ height: 8, background: "var(--sunk)", borderRadius: 4, marginTop: 4 }}>
                <div style={{ height: 8, borderRadius: 4, width: `${Math.max(1, (f.n / maxF) * 100)}%`, background: f.ruim ? "#C8473D" : "#2F6FB3" }} /></div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{f.obs}</div>
            </div>
          ))}
        </div>
        <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Superintendências · 30 dias</div>
          <div className="dir-list">
            {supers.map((s) => {
              const ls = cons.filter((l) => s.gerentes.some((g) => g.id === l.id) || l.id === s.id || l.id === `outros:${s.id}`);
              const t = somar(s.nome, ls);
              return (
                <div key={s.id} style={{ cursor: "pointer" }} onClick={() => irPara("equipes", `s:${s.id}`)}>
                  <span style={{ flex: 1 }}><b>{s.nome}</b><br /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{s.gerentes.length} gerentes · {s.gerentes.reduce((a, g) => a + g.corretores, 0)} corretores</span></span>
                  <span style={{ textAlign: "right", fontSize: 12.5, color: "var(--ink-3)" }}><b className="mono" style={{ fontSize: 18, color: "var(--ink)" }}>{t.vendas}</b> vendas<br />{curto(t.vgv)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="dir-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Cobranças · 7 dias</div>
          {!cobrancas.length ? <span className="dir-nota">Nenhuma cobrança enviada nos últimos 7 dias.</span> : (
            <div className="dir-list">
              {cobrancas.slice(0, 6).map((c) => (
                <div key={c.id} style={{ display: "block" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <b>{c.de} → {c.para}</b>
                    <span className={`dir-chip ${c.respondida_em ? "c-grn" : "c-gray"}`}>{c.respondida_em ? "respondeu" : "sem resposta"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>{hora(c.enviada_em)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 3 }}>{c.resposta ? `“${c.resposta.slice(0, 90)}”` : c.motivo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── EQUIPES ───────────────────────── */
type ArvoreProps = { supers: SuperDiretoria[]; linhasDoSuper: (s: SuperDiretoria) => LinhaConsolidado[]; aberto: Record<string, boolean>;
  tog: (k: string) => void; abrirPainel: (id: string) => void; carregandoCons: boolean };

function Equipes({ supers, linhasDoSuper, aberto, tog, abrirPainel, carregandoCons }: ArvoreProps) {
  const cel = (g: { corretores: number; plantaoHoje: number; semLogin: number; logados: number; online: number }, l: LinhaConsolidado | null) => (<>
    <td>{g.corretores}</td>
    <td><Z n={g.plantaoHoje} /></td>
    <td><Z n={g.semLogin} cls="r" /></td>
    <td><Z n={g.logados} /></td>
    <td><Z n={g.online} cls="g" /></td>
    <td>{l ? <Z n={l.plantaoDias} /> : "…"}</td>
    <td>{l ? <Z n={l.visitas} /> : "…"}</td>
    <td>{l ? <Z n={l.vendas} cls="g" /> : "…"}</td>
    <td>{l ? <Z n={l.vgv} fmt={curto} /> : "…"}</td>
  </>);
  const numsGer = (s: SuperDiretoria, g: SuperDiretoria["gerentes"][number]) => ({
    corretores: g.corretores, plantaoHoje: g.plantao_hoje, semLogin: s.plantaoSemLogin[g.id]?.length ?? 0,
    logados: g.corretores_lista.filter((c) => s.logadosHoje[c.id]).length, online: g.online });
  const somaN = (xs: ReturnType<typeof numsGer>[]) => xs.reduce((a, x) => ({ corretores: a.corretores + x.corretores, plantaoHoje: a.plantaoHoje + x.plantaoHoje,
    semLogin: a.semLogin + x.semLogin, logados: a.logados + x.logados, online: a.online + x.online }), { corretores: 0, plantaoHoje: 0, semLogin: 0, logados: 0, online: 0 });
  const todos = supers.flatMap((s) => s.gerentes.map((g) => numsGer(s, g)));

  return (
    <div className="dir-card" style={{ padding: "18px 0 6px" }}>
      <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Superintendências, gerentes e corretores</b>
        <span>plantão e login são de hoje · visitas, vendas e VGV no período{carregandoCons ? " (carregando…)" : ""}</span></div>
      <div className="dir-tree">
        <table>
          <thead><tr><th>Equipe</th><th>Corretores</th><th>Plantão hoje</th><th>Plantão sem login</th><th>Entraram hoje</th><th>Online agora</th><th>Dias de plantão</th><th>Visitas</th><th>Vendas</th><th>VGV</th></tr></thead>
          <tbody>
            {supers.map((s) => {
              const kS = `s:${s.id}`; const ls = linhasDoSuper(s);
              return [
                <tr key={kS} className="n0" onClick={() => tog(kS)}>
                  <td><Seta on={!!aberto[kS]} />{s.nome} <span style={{ fontWeight: 500, color: "var(--ink-3)", fontSize: 12 }}>· {s.gerentes.length} gerentes</span></td>
                  {cel(somaN(s.gerentes.map((g) => numsGer(s, g))), carregandoCons ? null : somar(s.nome, ls))}
                </tr>,
                ...(aberto[kS] ? s.gerentes.flatMap((g) => {
                  const kG = `g:${g.id}`; const sem = s.plantaoSemLogin[g.id] ?? [];
                  return [
                    <tr key={kG} className="n1" onClick={() => tog(kG)}>
                      <td><Seta on={!!aberto[kG]} />{g.nome}<button className="dir-abrir" onClick={(e) => { e.stopPropagation(); abrirPainel(g.id); }}>abrir painel ›</button></td>
                      {cel(numsGer(s, g), carregandoCons ? null : ls.find((l) => l.id === g.id) ?? linhaVazia(g.id, g.nome))}
                    </tr>,
                    ...(aberto[kG] ? [
                      ...g.corretores_lista.map((c) => (
                        <tr key={`c:${c.id}`} className="n2">
                          <td><span className={`dir-dot${c.online ? " on" : s.logadosHoje[c.id] ? " mid" : ""}`} />{c.nome}
                            <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}> · {c.online ? "online" : s.logadosHoje[c.id] ? "entrou hoje" : c.ultimo_acesso ? `último acesso ${new Date(c.ultimo_acesso).toLocaleDateString("pt-BR")}` : "nunca entrou"}</span></td>
                          <td />
                          <td>{c.plantao_hoje ? <span className="g">✓</span> : <span className="z">—</span>}</td>
                          <td />
                          <td>{s.logadosHoje[c.id] ? <span className="g">✓</span> : <span className="z">—</span>}</td>
                          <td>{c.online ? <span className="g">●</span> : <span className="z">—</span>}</td>
                          <td /><td />
                          <td><Z n={c.vendas_mes} cls="g" /></td>
                          <td />
                        </tr>
                      )),
                      ...(sem.length ? [<tr key={`sl:${g.id}`} className="n3"><td colSpan={10} style={{ textAlign: "left" }}>
                        <span className="r">No plantão hoje sem login:</span> {sem.join(" · ")}</td></tr>] : []),
                      ...(!g.corretores_lista.length && !sem.length ? [<tr key={`v:${g.id}`} className="n3"><td colSpan={10} style={{ textAlign: "left" }}>Nenhum corretor cadastrado.</td></tr>] : []),
                    ] : []),
                  ];
                }) : []),
              ];
            })}
            <tr className="tot"><td>Empresa</td>{cel(somaN(todos), carregandoCons ? null : somar("Empresa", supers.flatMap(linhasDoSuper)))}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── LEADS ───────────────────────── */
function Leads({ supers, linhasDoSuper, total, aberto, tog, abrirPainel, carregandoCons }: ArvoreProps & { total: LinhaConsolidado | null }) {
  if (carregandoCons || !total) return <div className="dir-card dir-vazio">Buscando gasto no Facebook e leads de cada equipe…</div>;
  const cplEmpresa = total.leadsFb ? (total.gasto ?? 0) / total.leadsFb : 0;
  const cel = (l: LinhaConsolidado, emConversa?: number) => {
    const cpl = l.leadsFb ? (l.gasto ?? 0) / l.leadsFb : 0;
    return (<>
      <td><Z n={l.gasto} fmt={brl} /></td>
      <td><Z n={l.leadsFb} /></td>
      <td>{cpl ? <span className={cplEmpresa && cpl > cplEmpresa * 1.3 ? "r" : ""}>{brl(cpl)}</span> : <span className="z">—</span>}</td>
      <td><Z n={l.leads.anuncio} /></td>
      <td><Z n={l.leads.disparo} /></td>
      <td><Z n={l.leads.pescados} /></td>
      <td><Z n={l.leads.outros} /></td>
      <td><b><Z n={totLeads(l)} /></b></td>
      <td><Z n={l.nuncaFalaram} cls="r" /></td>
      <td>{emConversa == null ? <span className="z">·</span> : <Z n={emConversa} cls="g" />}</td>
      <td><Z n={l.visitas} /></td>
    </>);
  };
  // ranking de investimento por gerente
  const gers = supers.flatMap((s) => linhasDoSuper(s).filter((l) => (l.gasto ?? 0) > 0).map((l) => ({ s, l })))
    .sort((a, b) => (b.l.gasto ?? 0) - (a.l.gasto ?? 0));
  const maxG = Math.max(1, ...gers.map((x) => x.l.gasto ?? 0));

  return (
    <>
      <div className="dir-grid3">
        <div className="dir-card" style={{ padding: 18 }}>
          <div className="dir-h" style={{ marginBottom: 8 }}><b>Quem mais investiu</b><span>Facebook no período · em vermelho, custo por lead 30% acima da média ({cplEmpresa ? brl(cplEmpresa) : "—"})</span></div>
          <div className="dir-barras">
            {!gers.length ? <span className="dir-nota">Nenhuma conta de anúncio com gasto no período.</span> : gers.map(({ s, l }) => {
              const cpl = l.leadsFb ? (l.gasto ?? 0) / l.leadsFb : 0;
              return (
                <div key={l.id}>
                  <span title={s.nome}><b>{l.nome}</b></span>
                  <span className="tr"><i className={cplEmpresa && cpl > cplEmpresa * 1.3 ? "ruim" : ""} style={{ width: `${((l.gasto ?? 0) / maxG) * 100}%` }} /></span>
                  <span className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>{brl(l.gasto ?? 0)}<br /><span style={{ color: "var(--ink-3)" }}>{l.leadsFb ?? 0} · {cpl ? brl(cpl) : "—"}</span></span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="dir-card" style={{ padding: 18 }}>
          <div className="dir-h" style={{ marginBottom: 8 }}><b>De onde vieram os leads</b><span>chegaram no Comandra no período</span></div>
          <div className="dir-barras">
            {([["Anúncio", total.leads.anuncio], ["Disparo", total.leads.disparo], ["Pescados", total.leads.pescados], ["Outros", total.leads.outros]] as [string, number][]).map(([t, n]) => (
              <div key={t}><span><b>{t}</b></span><span className="tr"><i style={{ width: `${(n / Math.max(1, totLeads(total))) * 100}%` }} /></span>
                <span className="mono" style={{ textAlign: "right" }}>{nf(n)}</span></div>
            ))}
          </div>
          <p className="dir-nota" style={{ marginTop: 10 }}>O Facebook conta {nf(total.leadsFb ?? 0)} leads; chegaram {nf(total.leads.anuncio)} de anúncio no Comandra. A diferença é lead que não passou pela integração.</p>
        </div>
      </div>

      <div className="dir-card" style={{ padding: "18px 0 6px" }}>
        <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Leads por equipe</b><span>abra a superintendência e o gerente · no corretor: leads recebidos e conversas</span></div>
        <div className="dir-tree">
          <table>
            <thead><tr><th>Equipe</th><th>Investimento</th><th>Leads Facebook</th><th>Custo/lead</th><th>Anúncio</th><th>Disparo</th><th>Pescados</th><th>Outros</th><th>Total</th><th>Sem toque</th><th>Em conversa 24h</th><th>Visitas</th></tr></thead>
            <tbody>
              {supers.map((s) => {
                const kS = `s:${s.id}`; const ls = linhasDoSuper(s);
                const emConvS = s.gerentes.reduce((a, g) => a + g.em_conversa, 0);
                return [
                  <tr key={kS} className="n0" onClick={() => tog(kS)}><td><Seta on={!!aberto[kS]} />{s.nome}</td>{cel(somar(s.nome, ls), emConvS)}</tr>,
                  ...(aberto[kS] ? ls.flatMap((l) => {
                    const g = s.gerentes.find((x) => x.id === l.id); const kG = `lg:${l.id}`;
                    return [
                      <tr key={kG} className={g ? "n1" : "n2"} onClick={() => g && tog(kG)}>
                        <td>{g ? <Seta on={!!aberto[kG]} /> : null}{l.nome}{g ? <button className="dir-abrir" onClick={(e) => { e.stopPropagation(); abrirPainel(g.id); }}>abrir painel ›</button> : null}</td>
                        {cel(l, g?.em_conversa)}
                      </tr>,
                      ...(g && aberto[kG] ? g.corretores_lista.map((c) => (
                        <tr key={`lc:${c.id}`} className="n2">
                          <td>{c.nome} <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>· carteira {c.carteira}</span></td>
                          <td /><td /><td /><td /><td /><td /><td />
                          <td><Z n={c.leads_periodo} /></td><td /><td><Z n={c.em_conversa} cls="g" /></td><td />
                        </tr>
                      )) : []),
                    ];
                  }) : []),
                ];
              })}
              <tr className="tot"><td>Empresa</td>{cel(total, supers.reduce((a, s) => a + s.gerentes.reduce((b, g) => b + g.em_conversa, 0), 0))}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── PASTAS ───────────────────────── */
const ETAPAS: [string, (e: string) => boolean][] = [
  ["Cadastro", (e) => /cadastro/i.test(e)],
  ["Unidade", (e) => /unidade/i.test(e)],
  ["Análise", (e) => /laudo|an[aá]lise/i.test(e)],
  ["Documentos", (e) => /documento/i.test(e)],
  ["Proposta", (e) => /proposta|simular|emiss/i.test(e)],
  ["Venda", (e) => /venda/i.test(e)],
];
const etapaDe = (e: string | null) => ETAPAS.find(([, f]) => f(e ?? ""))?.[0] ?? "Outras";

function Pastas({ supers, pastas, aberto, tog }: { supers: SuperDiretoria[]; pastas: PastaJunix[]; aberto: Record<string, boolean>; tog: (k: string) => void }) {
  // super → gerente (nome do Junix) → corretor → pastas
  const arv = new Map<string, Map<string, Map<string, PastaJunix[]>>>();
  for (const p of pastas) {
    const { superId } = donoJunix(supers, p.superintendente, p.gerente);
    const gNome = p.gerente ? (supers.flatMap((s) => s.gerentes).find((g) => chaveGerente(g.nome) === chaveGerente(p.gerente))?.nome ?? p.gerente) : "Sem gerente";
    const cNome = (p.corretor ?? "Sem corretor").replace(/\s+BN\s*$/i, "");
    if (!arv.has(superId)) arv.set(superId, new Map());
    const ms = arv.get(superId)!; if (!ms.has(gNome)) ms.set(gNome, new Map());
    const mg = ms.get(gNome)!; if (!mg.has(cNome)) mg.set(cNome, []);
    mg.get(cNome)!.push(p);
  }
  const cel = (ps: PastaJunix[]) => {
    const trav = ps.filter((p) => (p.dias ?? 0) >= 7).length;
    return (<>
      <td><b>{ps.length}</b></td>
      <td><Z n={trav} cls="r" /></td>
      {[...ETAPAS.map(([t]) => t), "Outras"].map((t) => <td key={t}><Z n={ps.filter((p) => etapaDe(p.etapa) === t).length} /></td>)}
      <td>{ps.length ? Math.round(ps.reduce((a, p) => a + (p.dias ?? 0), 0) / ps.length) + "d" : "—"}</td>
    </>);
  };
  const grupos = [...supers.map((s) => ({ id: s.id, nome: s.nome })), ...(arv.has("fora") ? [{ id: "fora", nome: "Sem superintendência no Comandra" }] : [])];
  const flat = (m?: Map<string, Map<string, PastaJunix[]>>) => [...(m?.values() ?? [])].flatMap((x) => [...x.values()].flat());

  if (!pastas.length) return <div className="dir-card dir-vazio">Nenhuma pasta no Junix agora.</div>;
  return (
    <div className="dir-card" style={{ padding: "18px 0 6px" }}>
      <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Pastas abertas no Junix</b><span>{pastas.length} pastas agora · parada = 7 dias ou mais na mesma etapa · abra até o cliente</span></div>
      <div className="dir-tree">
        <table>
          <thead><tr><th>Equipe</th><th>Pastas</th><th>Paradas 7d+</th>{[...ETAPAS.map(([t]) => t), "Outras"].map((t) => <th key={t}>{t}</th>)}<th>Média</th></tr></thead>
          <tbody>
            {grupos.map((s) => {
              const ms = arv.get(s.id); const kS = `ps:${s.id}`;
              return [
                <tr key={kS} className="n0" onClick={() => tog(kS)}><td><Seta on={!!aberto[kS]} />{s.nome}</td>{cel(flat(ms))}</tr>,
                ...(aberto[kS] && ms ? [...ms.entries()].sort((a, b) => flat(new Map([b])).length - flat(new Map([a])).length).flatMap(([gNome, mg]) => {
                  const kG = `pg:${s.id}:${gNome}`;
                  return [
                    <tr key={kG} className="n1" onClick={() => tog(kG)}><td><Seta on={!!aberto[kG]} />{gNome}</td>{cel([...mg.values()].flat())}</tr>,
                    ...(aberto[kG] ? [...mg.entries()].flatMap(([cNome, ps]) => {
                      const kC = `pc:${kG}:${cNome}`;
                      return [
                        <tr key={kC} className="n2" style={{ cursor: "pointer" }} onClick={() => tog(kC)}><td><Seta on={!!aberto[kC]} />{cNome}</td>{cel(ps)}</tr>,
                        ...(aberto[kC] ? ps.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).map((p) => (
                          <tr key={p.proposta_id} className="n3">
                            <td colSpan={2}>{p.cliente ?? "—"} · {p.empreendimento ?? "—"}</td>
                            <td colSpan={ETAPAS.length + 1} style={{ textAlign: "left" }}>{p.etapa ?? "—"}</td>
                            <td colSpan={2} className={(p.dias ?? 0) >= 7 ? "r" : ""}>{p.dias ?? 0} dias</td>
                          </tr>
                        )) : []),
                      ];
                    }) : []),
                  ];
                }) : []),
              ];
            })}
            <tr className="tot"><td>Empresa</td>{cel(pastas)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── GASTOS ───────────────────────── */
function Gastos({ supers, linhasDoSuper, total, carregandoCons }: { supers: SuperDiretoria[]; linhasDoSuper: (s: SuperDiretoria) => LinhaConsolidado[]; total: LinhaConsolidado | null; carregandoCons: boolean }) {
  if (carregandoCons || !total) return <div className="dir-card dir-vazio">Buscando o gasto de anúncio de cada equipe…</div>;
  return (
    <>
      <div className="dir-kpis">
        <div className="dir-card dir-kpi"><div className="dir-lbl">Anúncio no período</div><span className="mono">{brl(total.gasto ?? 0)}</span><small>Facebook, todas as contas</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por lead</div><span className="mono">{total.leadsFb ? brl((total.gasto ?? 0) / total.leadsFb) : "—"}</span><small>{nf(total.leadsFb ?? 0)} leads</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por visita</div><span className="mono">{total.visitas ? brl((total.gasto ?? 0) / total.visitas) : "—"}</span><small>{nf(total.visitas)} visitas (C2S)</small></div>
        <div className="dir-card dir-kpi"><div className="dir-lbl">Custo por venda</div><span className="mono">{total.vendas ? brl((total.gasto ?? 0) / total.vendas) : "—"}</span><small>{total.vendas} vendas · VGV {curto(total.vgv)}</small></div>
      </div>
      <div className="dir-card" style={{ padding: "18px 0 6px" }}>
        <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Anúncio por superintendência</b><span>o que já é automático (Facebook)</span></div>
        <div className="dir-tree">
          <table>
            <thead><tr><th>Equipe</th><th>Gasto</th><th>Leads</th><th>Custo/lead</th><th>Visitas</th><th>Custo/visita</th><th>Vendas</th><th>Custo/venda</th></tr></thead>
            <tbody>
              {supers.map((s) => { const t = somar(s.nome, linhasDoSuper(s)); const g = t.gasto ?? 0; return (
                <tr key={s.id} className="n0" style={{ cursor: "default" }}>
                  <td>{s.nome}</td><td><Z n={g} fmt={brl} /></td><td><Z n={t.leadsFb} /></td>
                  <td>{t.leadsFb ? brl(g / t.leadsFb) : <span className="z">—</span>}</td><td><Z n={t.visitas} /></td>
                  <td>{t.visitas && g ? brl(g / t.visitas) : <span className="z">—</span>}</td><td><Z n={t.vendas} /></td>
                  <td>{t.vendas && g ? brl(g / t.vendas) : <span className="z">—</span>}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
