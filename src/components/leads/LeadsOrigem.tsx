/* "De onde vieram e para onde foram" (28/10, protótipo aprovado pelo Junior: https://claude.ai/artifact/HtK67SSj8ks6YNw8bnNhfV).
 *
 * A MESMA tela para os três níveis — quem decide o que cada um vê é o servidor (RPC leads_origem):
 *   gerente = a estrutura dele · super = todos os gerentes abaixo · diretor/admin = todos.
 * Filtros (período com De/Até, equipe, campanha, tipo de origem, situação), resumo por equipe, cartão por campanha
 * que abre a gaveta lead a lead (foi para quem, como chegou, Caminho = lead_historico, Passar para… só lead parado e
 * só na mesma equipe = RPC passar_lead) e Baixar CSV (com o filtro da tela; download registrado em csv_downloads).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
type Lead = {
  id: string; entrou: string; nome: string | null; telefone: string | null; email: string | null; regiao: string | null; renda: string | null;
  status: string; motivo_descarte: string | null; source: string | null; pagina: string | null; pagina_nome: string | null; campanha: string;
  formulario: string | null; form_id: string | null; anuncio: string | null; corretor: string | null; corretor_nome: string | null;
  equipe: string | null; equipe_nome: string | null; tipo: string; como: string; trocas: number; ultimo_contato: string | null;
  tocado: boolean; parado: boolean;
};
type Equipe = { id: string; nome: string; corretores: { id: string; nome: string }[] };
type Painel = { eu: { id: string; role: string }; equipes: Equipe[]; leads: Lead[] };
type Passo = { quando: string; de: string | null; para: string | null; por: string | null; motivo: string };

const SIT: Record<string, [string, string]> = {
  NEW: ["Novo", "n"], IN_PROGRESS: ["Em atendimento", "i"], CONTACTED: ["Em atendimento", "i"], NEGOTIATING: ["Em atendimento", "i"],
  REACTIVATED: ["Em atendimento", "i"], FOLLOW_UP_AUTO: ["Em atendimento", "i"], DOCS_REQUESTED: ["Em atendimento", "i"],
  VISIT_SCHEDULED: ["Visita marcada", "ok"], VISITA_REALIZADA: ["Visita feita", "ok"], CONCLUDED: ["Venda", "ok"],
  ABANDONED: ["Descartado", "bad"], LOST: ["Descartado", "bad"],
};
const sit = (s: string) => SIT[s] ?? [s, "n"];
const hojeSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dh = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const CSS = `.lo{display:grid;gap:16px;color:var(--ink)}
.lo-f{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.lo-f label{display:grid;gap:3px;font-size:11.5px;font-weight:700;color:var(--ink-3,#64748b);text-transform:uppercase;letter-spacing:.05em}
.lo-f select,.lo-f input{font:inherit;font-size:13px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-transform:none;letter-spacing:0;font-weight:500}
.lo-btn{font:inherit;font-weight:700;font-size:13.5px;border-radius:9px;padding:8px 14px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.lo-btn.pri{background:var(--blue,#0d9488);border-color:var(--blue,#0d9488);color:#fff}.lo-btn.gh{background:none;border-color:transparent;color:var(--ink-2,#475569)}
.lo-btn:disabled{opacity:.5;cursor:default}
.lo-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.lo-h h3{margin:0;font-size:16px}
.lo-m{color:var(--ink-3,#64748b);font-size:13px}
.lo-t{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}
.lo table{border-collapse:collapse;width:100%;min-width:640px;font-size:13.5px}
.lo th,.lo td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.lo th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3,#64748b)}
.lo td.n{text-align:right;font-variant-numeric:tabular-nums}.lo tr:last-child td{border-bottom:0}
.lo-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.lo-c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:6px;cursor:pointer;text-align:left;font:inherit;color:inherit}
.lo-c:hover{border-color:var(--blue,#0d9488)}.lo-c i{font-style:normal;font-size:12px;color:var(--ink-3,#64748b)}
.lo-c .big{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.lo-fu{display:flex;gap:4px;flex-wrap:wrap;font-size:12px}.lo-fu span{background:var(--sunk);border-radius:6px;padding:2px 6px}
.lo-ch{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;white-space:nowrap;background:var(--sunk);color:var(--ink-2,#475569)}
.lo-ch.ok{background:color-mix(in srgb,#16a34a 14%,var(--card));color:#15803d}.lo-ch.bad{background:color-mix(in srgb,#dc2626 12%,var(--card));color:#b91c1c}
.lo-ch.i{background:color-mix(in srgb,#2563eb 12%,var(--card));color:#1d4ed8}.lo-ch.w{background:color-mix(in srgb,#d97706 14%,var(--card));color:#b45309}
.lo-side{position:fixed;inset:0;background:rgba(15,27,45,.45);z-index:60;display:flex;justify-content:flex-end}
.lo-pan{width:min(860px,100%);height:100%;overflow:auto;background:var(--card);color:var(--ink);padding:20px;display:grid;gap:12px;align-content:start}
.lo-hist{font-size:12.5px;color:var(--ink-2,#475569);display:grid;gap:3px;border-left:2px solid var(--line);padding-left:10px}`;

export default function LeadsOrigem({ como }: { como?: string | null }) {
  const qc = useQueryClient();
  const [per, setPer] = useState<"hoje" | "7" | "30" | "datas">("7");
  const [de, setDe] = useState(iso(new Date(hojeSP().getTime() - 6 * 864e5)));
  const [ate, setAte] = useState(iso(hojeSP()));
  const [fEq, setFEq] = useState(""); const [fCamp, setFCamp] = useState(""); const [fTipo, setFTipo] = useState(""); const [fSit, setFSit] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [caminho, setCaminho] = useState<Record<string, Passo[] | "carregando">>({});
  const [para, setPara] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const janela = useMemo(() => {
    const h = hojeSP();
    if (per === "hoje") return { de: iso(h), ate: iso(h) };
    if (per === "30") return { de: iso(new Date(h.getTime() - 29 * 864e5)), ate: iso(h) };
    if (per === "datas") return { de, ate };
    return { de: iso(new Date(h.getTime() - 6 * 864e5)), ate: iso(h) };
  }, [per, de, ate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leads-origem", como ?? "", janela.de, janela.ate],
    queryFn: async () => {
      const { data, error } = await sb.rpc("leads_origem", { p_como: como || null, p_de: janela.de, p_ate: janela.ate });
      if (error) throw error;
      return data as Painel;
    },
  });

  const leads = useMemo(() => (data?.leads ?? []).filter((l) =>
    (!fEq || l.equipe === fEq) && (!fCamp || l.campanha === fCamp) && (!fTipo || l.tipo === fTipo) && (!fSit || sit(l.status)[0] === fSit)), [data, fEq, fCamp, fTipo, fSit]);
  const campanhas = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) m.set(l.campanha, [...(m.get(l.campanha) ?? []), l]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [leads]);
  const porEquipe = useMemo(() => {
    const m = new Map<string, { nome: string; ls: Lead[] }>();
    for (const l of leads) { const k = l.equipe ?? "—"; const v = m.get(k) ?? { nome: l.equipe_nome ?? "Sem equipe", ls: [] }; v.ls.push(l); m.set(k, v); }
    return [...m.values()].sort((a, b) => b.ls.length - a.ls.length);
  }, [leads]);

  if (isLoading) return <p className="lo-m">Carregando os leads…</p>;
  if (error || !data) return <p className="lo-m">Não consegui carregar agora. Recarregue a página.</p>;

  const eu = data.eu;
  const ehGerente = eu.role === "MANAGER";
  const conta = (ls: Lead[], f: (l: Lead) => boolean) => ls.filter(f).length;
  const corretoresDa = (eq: string | null) => data.equipes.find((e) => e.id === eq)?.corretores ?? [];
  const tiposPresentes = [...new Set((data.leads ?? []).map((l) => l.tipo))];
  const campsTodas = [...new Set((data.leads ?? []).map((l) => l.campanha))].sort();

  const verCaminho = async (id: string) => {
    if (caminho[id] && caminho[id] !== "carregando") { setCaminho((c) => { const x = { ...c }; delete x[id]; return x; }); return; }
    setCaminho((c) => ({ ...c, [id]: "carregando" }));
    const { data: d } = await sb.rpc("lead_caminho", { p_lead: id, p_como: como || null });
    setCaminho((c) => ({ ...c, [id]: (d ?? []) as Passo[] }));
  };
  const passar = async (l: Lead) => {
    const p = para[l.id];
    if (!p) { toast.error("Escolha para qual corretor da equipe."); return; }
    setOcupado(l.id);
    try {
      const { data: nome, error } = await sb.rpc("passar_lead", { p_lead: l.id, p_para: p, p_como: como || null });
      if (error) throw error;
      toast.success(`Lead passado para ${nome}. Ele recebeu o aviso e o caminho do lead foi atualizado.`);
      qc.invalidateQueries({ queryKey: ["leads-origem"] });
      setCaminho((c) => { const x = { ...c }; delete x[l.id]; return x; });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui passar agora."); }
    finally { setOcupado(null); }
  };
  const baixarCsv = async (ls: Lead[], rotulo: string) => {
    if (!ls.length) { toast.error("Nada para baixar com esses filtros."); return; }
    const cab = ["data de entrada", "nome", "telefone", "email", "região", "renda", "tipo de origem", "página", "campanha", "formulário", "anúncio",
      "corretor", "equipe", "como chegou", "situação", "motivo de descarte", "último contato"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const linhas = ls.map((l) => [dh(l.entrou), l.nome, l.telefone, l.email, l.regiao, l.renda, l.tipo, l.pagina_nome ?? l.pagina, l.campanha, l.formulario,
      l.anuncio, l.corretor_nome, l.equipe_nome, l.como, sit(l.status)[0], l.motivo_descarte, dh(l.ultimo_contato)].map(esc).join(";"));
    const csv = "﻿" + [cab.join(";"), ...linhas].join("\n");
    await sb.rpc("registrar_csv", { p_filtros: { de: janela.de, ate: janela.ate, equipe: fEq || null, campanha: fCamp || rotulo || null, tipo: fTipo || null, situacao: fSit || null }, p_quantos: ls.length });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `leads_${janela.de}_a_${janela.ate}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`${ls.length} leads baixados. O download ficou registrado.`);
  };

  const camp = aberta ? campanhas.find(([n]) => n === aberta) : null;

  return (
    <div className="lo"><style>{CSS}</style>
      <div className="lo-f" role="search">
        <label>Período (entrada)
          <select value={per} onChange={(e) => setPer(e.target.value as any)}>
            <option value="7">Últimos 7 dias</option><option value="hoje">Hoje</option><option value="30">Últimos 30 dias</option><option value="datas">Escolher datas…</option>
          </select></label>
        {per === "datas" ? <><label>De<input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até<input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label></> : null}
        {!ehGerente ? <label>Equipe<select value={fEq} onChange={(e) => setFEq(e.target.value)}><option value="">Todas</option>
          {data.equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label> : null}
        <label>Campanha<select value={fCamp} onChange={(e) => setFCamp(e.target.value)} style={{ maxWidth: 260 }}><option value="">Todas</option>
          {campsTodas.map((c) => <option key={c} value={c}>{c.slice(0, 60)}</option>)}</select></label>
        <label>Tipo de origem<select value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Todas</option>
          {tiposPresentes.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Situação<select value={fSit} onChange={(e) => setFSit(e.target.value)}><option value="">Todas</option>
          {["Novo", "Em atendimento", "Visita marcada", "Visita feita", "Venda", "Descartado"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <span style={{ flex: 1 }} />
        <button className="lo-btn pri" onClick={() => baixarCsv(leads, "")}>⬇ Baixar CSV ({leads.length})</button>
      </div>
      {(data.leads ?? []).length >= 5000 ? <p className="lo-m">Mostrando os 5.000 mais recentes do período. Para ver todos, diminua o período.</p> : null}

      {!ehGerente ? (
        <section style={{ display: "grid", gap: 8 }}>
          <div className="lo-h"><h3>Por equipe</h3><span className="lo-m">{leads.length} leads no período</span></div>
          <div className="lo-t"><table><thead><tr><th>Equipe</th><th style={{ textAlign: "right" }}>Leads</th><th style={{ textAlign: "right" }}>Em atendimento</th>
            <th style={{ textAlign: "right" }}>Visita</th><th style={{ textAlign: "right" }}>Venda</th><th style={{ textAlign: "right" }}>Descartados</th><th style={{ textAlign: "right" }}>Parados</th></tr></thead>
            <tbody>{porEquipe.map((e) => <tr key={e.nome}><td><b>{e.nome}</b></td><td className="n">{e.ls.length}</td>
              <td className="n">{conta(e.ls, (l) => sit(l.status)[0] === "Em atendimento")}</td><td className="n">{conta(e.ls, (l) => sit(l.status)[0].startsWith("Visita"))}</td>
              <td className="n">{conta(e.ls, (l) => sit(l.status)[0] === "Venda")}</td><td className="n">{conta(e.ls, (l) => sit(l.status)[0] === "Descartado")}</td>
              <td className="n">{conta(e.ls, (l) => l.parado)}</td></tr>)}</tbody></table></div>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 8 }}>
        <div className="lo-h"><h3>Por campanha</h3><span className="lo-m">toque no cartão para ver lead a lead</span></div>
        {!campanhas.length ? <p className="lo-m">Nenhum lead com esses filtros.</p> : null}
        <div className="lo-g">
          {campanhas.map(([nome, ls]) => {
            const eqs = [...new Set(ls.map((l) => l.equipe_nome ?? "sem equipe"))].map((e) => `${e} ${ls.filter((l) => (l.equipe_nome ?? "sem equipe") === e).length}`).join(" · ");
            return (
              <button key={nome} className="lo-c" onClick={() => setAberta(nome)}>
                <i>{ls[0].tipo}{ls[0].pagina_nome ? ` · ${ls[0].pagina_nome}` : ""}</i>
                <b style={{ fontSize: 14 }}>{nome}</b>
                <span className="big">{ls.length}</span>
                <i>foram para: {eqs}</i>
                <span className="lo-fu"><span>{conta(ls, (l) => sit(l.status)[0] === "Em atendimento")} atendendo</span>
                  <span>{conta(ls, (l) => sit(l.status)[0].startsWith("Visita"))} visita</span><span>{conta(ls, (l) => sit(l.status)[0] === "Venda")} venda</span>
                  <span>{conta(ls, (l) => sit(l.status)[0] === "Descartado")} descartado</span>{conta(ls, (l) => l.parado) ? <span style={{ color: "#b45309" }}>{conta(ls, (l) => l.parado)} parado</span> : null}</span>
              </button>
            );
          })}
        </div>
      </section>

      {camp ? (
        <div className="lo-side" role="dialog" aria-label={camp[0]} onClick={(e) => { if (e.target === e.currentTarget) setAberta(null); }}>
          <div className="lo-pan">
            <div className="lo-h"><div><b style={{ fontSize: 17 }}>{camp[0]}</b>
              <div className="lo-m">{camp[1][0].tipo}{camp[1][0].pagina_nome ? ` · ${camp[1][0].pagina_nome}` : ""}{camp[1][0].formulario ? ` · formulário ${camp[1][0].formulario}` : ""}</div></div>
              <span style={{ display: "flex", gap: 6 }}><button className="lo-btn" onClick={() => baixarCsv(camp[1], camp[0])}>⬇ CSV desta campanha</button>
                <button className="lo-btn gh" onClick={() => setAberta(null)}>Fechar ✕</button></span></div>
            <div className="lo-t"><table><thead><tr><th>Entrou</th><th>Lead</th><th>Foi para</th><th>Como chegou</th><th>Situação</th><th></th></tr></thead>
              <tbody>{camp[1].map((l) => {
                const s = sit(l.status), outros = corretoresDa(l.equipe).filter((c) => c.id !== l.corretor), cam = caminho[l.id];
                return [
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dh(l.entrou)}</td>
                    <td><b>{l.nome ?? "—"}</b><div className="lo-m" style={{ fontFamily: "JetBrains Mono, monospace" }}>{l.telefone}</div></td>
                    <td><b>{l.corretor_nome ?? "Sem dono"}</b><div className="lo-m">{l.equipe_nome ? `equipe ${l.equipe_nome}` : ""}</div></td>
                    <td>{l.como}{l.trocas ? <div className="lo-m">{l.trocas} troca(s) de corretor</div> : null}{l.parado ? <div><span className="lo-ch w">parado</span></div> : null}</td>
                    <td><span className={`lo-ch ${s[1]}`}>{s[0]}</span>
                      {l.parado && outros.length ? (
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <select aria-label="Passar para" value={para[l.id] ?? ""} onChange={(e) => setPara((p) => ({ ...p, [l.id]: e.target.value }))}
                            style={{ font: "inherit", fontSize: 12.5, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)" }}>
                            <option value="">Passar para…</option>{outros.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>
                          <button className="lo-btn" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={ocupado === l.id} onClick={() => passar(l)}>Passar</button>
                        </div>) : null}</td>
                    <td><button className="lo-btn gh" onClick={() => verCaminho(l.id)}>Caminho</button></td>
                  </tr>,
                  cam ? <tr key={l.id + "-c"}><td colSpan={6}><div className="lo-hist">
                    <span>{dh(l.entrou)} · entrou ({l.tipo}{l.campanha ? ` · ${l.campanha}` : ""}) · {l.como}</span>
                    {cam === "carregando" ? <span>carregando…</span> : cam.length ? cam.map((p, i) => (
                      <span key={i}>{dh(p.quando)} · {p.motivo === "entrada" ? `ficou com ${p.para ?? "?"}` : `${p.de ?? "sem dono"} → ${p.para ?? "sem dono"} (${p.motivo}${p.por ? `, por ${p.por}` : ""})`}</span>
                    )) : <span>Sem trocas registradas (o caminho começou a ser gravado em 28/10).</span>}
                  </div></td></tr> : null,
                ];
              })}</tbody></table></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
