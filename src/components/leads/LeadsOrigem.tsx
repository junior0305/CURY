/* "De onde vieram e para onde foram" (28/10, protótipo aprovado pelo Junior: https://claude.ai/artifact/HtK67SSj8ks6YNw8bnNhfV).
 *
 * A MESMA tela para os três níveis — quem decide o que cada um vê é o servidor (RPC leads_origem):
 *   gerente = a estrutura dele · super = todos os gerentes abaixo · diretor/admin = todos.
 * Filtros (período com De/Até, equipe, campanha, tipo de origem, situação), resumo por equipe, cartão por campanha
 * que abre a gaveta lead a lead (há quanto tempo chegou, atendimento, Caminho = lead_historico) e Baixar CSV (download em csv_downloads).
 * 28/10 (Junior): Passar a qualquer momento (lead sem atendimento, RPC passar_lead) e Redistribuir descartados, um ou vários
 * (RPC redistribuir_leads) — sempre só na mesma equipe e só quando quem olha decide. Bloco "Por corretor": % descartado e tentativas.
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
  tocado: boolean; parado: boolean; tentativas: number; atribuido_em: string; sem_atendimento: boolean;
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
const MOT: Record<string, string> = {
  SEM_RETORNO: "sem retorno", NUMERO_ERRADO: "número errado", DESISTIU: "desistiu", CLIENTE_BLOQUEOU: "cliente bloqueou", JA_COMPROU: "já comprou",
  RENDA_FORA_FAIXA: "renda fora da faixa", SEM_PERFIL: "sem perfil", JA_TEM_IMOVEL: "já tem imóvel", NAO_COMPARECEU: "não compareceu",
  VOLTOU_AO_POOL_REGUA: "voltou ao Pescar",
};
const mot = (m: string | null) => (m ? MOT[m] ?? m.toLowerCase().replace(/_/g, " ") : "sem motivo");
const SENSIVEL = ["NUMERO_ERRADO", "CLIENTE_BLOQUEOU", "JA_COMPROU"];
const descartado = (l: Lead) => (l.status === "ABANDONED" || l.status === "LOST") && l.motivo_descarte !== "VOLTOU_AO_POOL_REGUA" && !!l.corretor;
const ha = (s: string | null) => {
  if (!s) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000));
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
};
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
.lo-sel{font:inherit;font-size:12.5px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--ink);max-width:150px}
.lo-ac{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.lo-tabs{display:flex;gap:6px;flex-wrap:wrap}.lo-tabs button{font:inherit;font-size:13px;font-weight:700;border-radius:99px;padding:5px 12px;border:1px solid var(--line);background:var(--card);color:var(--ink-2,#475569);cursor:pointer}
.lo-tabs button.on{background:var(--ink);border-color:var(--ink);color:var(--card)}
.lo-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--sunk);border-radius:10px;padding:10px 12px}
.lo-pick{display:flex;gap:6px;flex-wrap:wrap}.lo-pick label{display:flex;gap:4px;align-items:center;font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:4px 8px;cursor:pointer}
.lo-hist{font-size:12.5px;color:var(--ink-2,#475569);display:grid;gap:3px;border-left:2px solid var(--line);padding-left:10px}`;

export default function LeadsOrigem({ como }: { como?: string | null }) {
  const qc = useQueryClient();
  const [per, setPer] = useState<"hoje" | "7" | "30" | "datas">("7");
  const [de, setDe] = useState(iso(new Date(hojeSP().getTime() - 6 * 864e5)));
  const [ate, setAte] = useState(iso(hojeSP()));
  const [fEq, setFEq] = useState(""); const [fCamp, setFCamp] = useState(""); const [fTipo, setFTipo] = useState(""); const [fSit, setFSit] = useState("");
  // gaveta = um grupo de leads (campanha, região do Pescar…) aberto lead a lead
  const [aberta, setAberta] = useState<{ titulo: string; ids: string[] } | null>(null);
  const [eqAberta, setEqAberta] = useState<string | null>(null);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [caminho, setCaminho] = useState<Record<string, Passo[] | "carregando">>({});
  const [para, setPara] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtroG, setFiltroG] = useState<"todos" | "sem" | "desc">("todos");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [alvos, setAlvos] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<string | null>(null); // lead (ou "lote") esperando o "sim" de motivo sensível
  const [verCorretores, setVerCorretores] = useState(false);

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
    const m = new Map<string, { id: string; nome: string; ls: Lead[] }>();
    for (const l of leads) { const k = l.equipe ?? "—"; const v = m.get(k) ?? { id: k, nome: l.equipe_nome ?? "Sem equipe", ls: [] }; v.ls.push(l); m.set(k, v); }
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
      toast.success(`Lead passado para ${nome}. O corretor recebeu o aviso e o caminho do lead foi atualizado.`);
      qc.invalidateQueries({ queryKey: ["leads-origem"] });
      setCaminho((c) => { const x = { ...c }; delete x[l.id]; return x; });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui passar agora."); }
    finally { setOcupado(null); }
  };
  const redistribuir = async (ids: string[], paraIds: string[], ok: boolean) => {
    if (!ids.length) { toast.error("Marque os leads descartados."); return; }
    if (!paraIds.length) { toast.error("Escolha para quem vão os leads."); return; }
    setOcupado(ids.length === 1 ? ids[0] : "lote");
    try {
      const { data: r, error } = await sb.rpc("redistribuir_leads", { p_leads: ids, p_para: paraIds, p_como: como || null, p_confirmar: ok });
      if (error) throw error;
      const pul = (r?.pulados ?? []) as { nome: string | null; motivo: string }[];
      if (r?.feitos) toast.success(`${r.feitos} lead(s) redistribuído(s). Voltaram para "Novo" e o corretor recebeu o aviso.`);
      if (pul.length) toast.error(`${pul.length} não foram: ${[...new Set(pul.map((p) => p.motivo))].join("; ")}.`);
      setMarcados([]); setConfirmar(null);
      qc.invalidateQueries({ queryKey: ["leads-origem"] });
      setCaminho({});
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui redistribuir agora."); }
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

  const camp: [string, Lead[]] | null = aberta ? [aberta.titulo, (data.leads ?? []).filter((l) => aberta.ids.includes(l.id))] : null;

  // 28/10 (Junior): linhas em vez de cartões; Pescar, listas e disparos viram UMA linha (com as partes dentro)
  const grupoDe = (l: Lead) => l.tipo === "Pescar" ? "Pescar" : l.tipo === "Lista" ? "Listas" : l.tipo === "Disparo de WhatsApp" ? "Disparos de WhatsApp"
    : l.tipo === "Resgate" ? "Resgate" : l.campanha;
  const colunas = (ls: Lead[]) => [ls.length, conta(ls, (l) => sit(l.status)[0] === "Em atendimento"), conta(ls, (l) => sit(l.status)[0].startsWith("Visita")),
    conta(ls, (l) => sit(l.status)[0] === "Venda"), conta(ls, (l) => sit(l.status)[0] === "Descartado"), conta(ls, (l) => l.sem_atendimento)];
  const celulas = (ls: Lead[]) => colunas(ls).map((v, i) => <td key={i} className="n" style={i === 5 && v ? { color: "#b45309", fontWeight: 700 } : undefined}>{v}</td>);
  const cabecalho = (primeira: string) => <thead><tr><th>{primeira}</th>{["Leads", "Atendendo", "Visita", "Venda", "Descartado", "Sem atendimento"].map((h) => <th key={h} style={{ textAlign: "right" }}>{h}</th>)}</tr></thead>;
  const abrirGaveta = (titulo: string, ls: Lead[]) => { setAberta({ titulo, ids: ls.map((l) => l.id) }); setFiltroG("todos"); setMarcados([]); setAlvos([]); setConfirmar(null); };
  const tabelaCampanhas = (ls: Lead[], chave: string) => {
    const grupos = new Map<string, Lead[]>();
    for (const l of ls) grupos.set(grupoDe(l), [...(grupos.get(grupoDe(l)) ?? []), l]);
    const ordem = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
    return (
      <div className="lo-t"><table>{cabecalho("Campanha / origem")}<tbody>
        {ordem.map(([g, gl]) => {
          const partes = new Map<string, Lead[]>();
          for (const l of gl) partes.set(l.campanha, [...(partes.get(l.campanha) ?? []), l]);
          const temPartes = partes.size > 1 && g !== gl[0].campanha;
          const kg = chave + "|" + g, aberto = grupoAberto === kg;
          return [
            <tr key={kg} style={{ cursor: "pointer" }} onClick={() => temPartes ? setGrupoAberto(aberto ? null : kg) : abrirGaveta(g, gl)}>
              <td><b>{temPartes ? (aberto ? "▾ " : "▸ ") : ""}{g}</b>
                <div className="lo-m">{gl[0].tipo}{gl[0].tipo === "Anúncio" && gl[0].pagina_nome ? ` · ${gl[0].pagina_nome}` : ""}{temPartes ? ` · ${partes.size} ${g === "Pescar" ? "regiões" : "partes"}` : ""}</div></td>
              {celulas(gl)}
            </tr>,
            ...(temPartes && aberto ? [...partes.entries()].sort((a, b) => b[1].length - a[1].length).map(([pn, pl]) => (
              <tr key={kg + "|" + pn} style={{ cursor: "pointer", background: "var(--sunk)" }} onClick={() => abrirGaveta(pn, pl)}>
                <td style={{ paddingLeft: 28 }}>{pn.replace(/^Pescar · /, "")}</td>{celulas(pl)}</tr>
            )) : []),
          ];
        })}
      </tbody></table></div>
    );
  };

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
          <div className="lo-h"><h3>Por equipe</h3><span className="lo-m">{leads.length} leads no período · toque na equipe para ver as campanhas dela</span></div>
          <div className="lo-t"><table>{cabecalho("Equipe")}<tbody>
            {porEquipe.map((e) => [
              <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setEqAberta(eqAberta === e.id ? null : e.id)}>
                <td><b>{eqAberta === e.id ? "▾ " : "▸ "}{e.nome}</b></td>{celulas(e.ls)}</tr>,
              eqAberta === e.id ? <tr key={e.id + "-c"}><td colSpan={7} style={{ padding: "8px 8px 14px", background: "var(--sunk)" }}>{tabelaCampanhas(e.ls, e.id)}</td></tr> : null,
            ])}
          </tbody></table></div>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 8 }}>
          <div className="lo-h"><h3>Por campanha</h3><span className="lo-m">{leads.length} leads no período · toque na linha para ver lead a lead</span></div>
          {!leads.length ? <p className="lo-m">Nenhum lead com esses filtros.</p> : tabelaCampanhas(leads, "eu")}
        </section>
      )}

      {(() => {
        const m = new Map<string, { nome: string; equipe: string; ls: Lead[] }>();
        for (const l of leads) if (l.corretor && l.tipo !== "Pescar") { const v = m.get(l.corretor) ?? { nome: l.corretor_nome ?? "?", equipe: l.equipe_nome ?? "", ls: [] }; v.ls.push(l); m.set(l.corretor, v); }
        const linhas = [...m.values()].map((v) => {
          const d = v.ls.filter((l) => (l.status === "ABANDONED" || l.status === "LOST") && l.motivo_descarte !== "VOLTOU_AO_POOL_REGUA");
          return { ...v, rec: v.ls.length, desc: d.length, pct: v.ls.length ? Math.round((100 * d.length) / v.ls.length) : 0,
            tent: d.length ? d.reduce((s, l) => s + (l.tentativas || 0), 0) / d.length : null, sem: v.ls.filter((l) => l.sem_atendimento).length };
        }).sort((a, b) => b.pct - a.pct || b.desc - a.desc);
        if (!linhas.length) return null;
        const pior = linhas.find((x) => x.rec >= 5 && x.pct >= 50);
        return (
          <section style={{ display: "grid", gap: 8 }}>
            <div className="lo-h" style={{ cursor: "pointer" }} onClick={() => setVerCorretores(!verCorretores)}>
              <h3>{verCorretores ? "▾" : "▸"} Por corretor</h3>
              <span className="lo-m">{pior ? `${pior.nome} descartou ${pior.pct}% dos leads que recebeu, com ${pior.tent?.toFixed(1).replace(".", ",")} tentativas em média` : "quanto cada um recebeu, atendeu e descartou no período (sem Pescar)"}</span></div>
            {verCorretores ? <div className="lo-t"><table><thead><tr><th>Corretor</th>
              {["Recebeu", "Sem atendimento", "Descartou", "% descartado", "Tentativas antes de descartar"].map((h) => <th key={h} style={{ textAlign: "right" }}>{h}</th>)}</tr></thead>
              <tbody>{linhas.map((x) => (
                <tr key={x.nome + x.equipe}><td><b>{x.nome}</b>{!ehGerente ? <div className="lo-m">equipe {x.equipe}</div> : null}</td>
                  <td className="n">{x.rec}</td><td className="n" style={x.sem ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{x.sem}</td>
                  <td className="n">{x.desc}</td><td className="n" style={x.rec >= 5 && x.pct >= 50 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{x.pct}%</td>
                  <td className="n">{x.tent === null ? "—" : x.tent.toFixed(1).replace(".", ",")}</td></tr>))}</tbody></table></div> : null}
          </section>
        );
      })()}

      {camp ? (
        <div className="lo-side" role="dialog" aria-label={camp[0]} onClick={(e) => { if (e.target === e.currentTarget) setAberta(null); }}>
          <div className="lo-pan">
            <div className="lo-h"><div><b style={{ fontSize: 17 }}>{camp[0]}</b>
              <div className="lo-m">{camp[1][0].tipo}{camp[1][0].pagina_nome ? ` · ${camp[1][0].pagina_nome}` : ""}{camp[1][0].formulario ? ` · formulário ${camp[1][0].formulario}` : ""}</div></div>
              <span style={{ display: "flex", gap: 6 }}><button className="lo-btn" onClick={() => baixarCsv(camp[1], camp[0])}>⬇ CSV desta campanha</button>
                <button className="lo-btn gh" onClick={() => setAberta(null)}>Fechar ✕</button></span></div>
            {(() => {
              const todos = camp[1];
              const nSem = todos.filter((l) => l.sem_atendimento).length, nDesc = todos.filter(descartado).length;
              const vis = todos.filter((l) => filtroG === "sem" ? l.sem_atendimento : filtroG === "desc" ? descartado(l) : true);
              const eqsMarcadas = [...new Set(todos.filter((l) => marcados.includes(l.id)).map((l) => l.equipe))];
              const opcoesLote = data.equipes.filter((e) => eqsMarcadas.includes(e.id));
              const sensiveisMarcados = todos.filter((l) => marcados.includes(l.id) && SENSIVEL.includes(l.motivo_descarte ?? "")).length;
              return <>
                <div className="lo-tabs" role="tablist">
                  <button className={filtroG === "todos" ? "on" : ""} onClick={() => setFiltroG("todos")}>Todos ({todos.length})</button>
                  <button className={filtroG === "sem" ? "on" : ""} onClick={() => setFiltroG("sem")}>Sem atendimento ({nSem})</button>
                  <button className={filtroG === "desc" ? "on" : ""} onClick={() => setFiltroG("desc")}>Descartados ({nDesc})</button>
                </div>
                {marcados.length ? (
                  <div className="lo-bar">
                    <b>{marcados.length} descartado(s) marcado(s) → redistribuir entre:</b>
                    {opcoesLote.map((e) => (
                      <div key={e.id} className="lo-pick">{opcoesLote.length > 1 ? <span className="lo-m">{e.nome}:</span> : null}
                        {e.corretores.map((c) => <label key={c.id}><input type="checkbox" checked={alvos.includes(c.id)}
                          onChange={(ev) => setAlvos((a) => ev.target.checked ? [...a, c.id] : a.filter((x) => x !== c.id))} />{c.nome}</label>)}</div>))}
                    {confirmar === "lote" ? <>
                      <span className="lo-m">{sensiveisMarcados} com motivo "número errado", "bloqueou" ou "já comprou". Redistribuir mesmo assim?</span>
                      <button className="lo-btn pri" disabled={ocupado === "lote"} onClick={() => redistribuir(marcados, alvos, true)}>Sim, redistribuir</button>
                      <button className="lo-btn gh" onClick={() => setConfirmar(null)}>Não</button></>
                      : <button className="lo-btn pri" disabled={ocupado === "lote" || !alvos.length}
                          onClick={() => sensiveisMarcados ? setConfirmar("lote") : redistribuir(marcados, alvos, false)}>
                          Redistribuir {marcados.length}{alvos.length > 1 ? ` (divididos entre ${alvos.length})` : ""}</button>}
                    <button className="lo-btn gh" onClick={() => { setMarcados([]); setConfirmar(null); }}>Desmarcar</button>
                  </div>) : null}
                <div className="lo-t"><table><thead><tr>
                  <th style={{ width: 28 }}>{nDesc ? <input type="checkbox" aria-label="Marcar todos os descartados" checked={nDesc > 0 && todos.filter(descartado).every((l) => marcados.includes(l.id))}
                    onChange={(e) => setMarcados(e.target.checked ? vis.filter(descartado).map((l) => l.id) : [])} /> : null}</th>
                  <th>Chegou</th><th>Lead</th><th>Com quem</th><th>Atendimento</th><th>Situação</th><th></th></tr></thead>
                  <tbody>{vis.map((l) => {
                    const s = sit(l.status), outros = corretoresDa(l.equipe).filter((c) => c.id !== l.corretor), cam = caminho[l.id], desc = descartado(l);
                    const atend = !l.corretor ? <span className="lo-ch">Sem corretor</span>
                      : l.sem_atendimento ? <span className="lo-ch bad">Sem atendimento {ha(l.atribuido_em)}</span>
                      : desc ? <span className="lo-ch">{l.tentativas} tentativa{l.tentativas === 1 ? "" : "s"} antes de descartar</span>
                      : <span className="lo-ch ok">Atendido{l.ultimo_contato ? ` · último contato ${ha(l.ultimo_contato)}` : ""}</span>;
                    return [
                      <tr key={l.id}>
                        <td>{desc ? <input type="checkbox" aria-label={`Marcar ${l.nome ?? "lead"}`} checked={marcados.includes(l.id)}
                          onChange={(e) => setMarcados((m) => e.target.checked ? [...m, l.id] : m.filter((x) => x !== l.id))} /> : null}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{dh(l.entrou)}<div className="lo-m">{ha(l.entrou)}</div></td>
                        <td><b>{l.nome ?? "—"}</b><div className="lo-m" style={{ fontFamily: "JetBrains Mono, monospace" }}>{l.telefone}</div>
                          <div className="lo-m">{l.como}{l.trocas ? ` · ${l.trocas} troca(s) de corretor` : ""}</div></td>
                        <td><b>{l.corretor_nome ?? "Sem dono"}</b><div className="lo-m">{l.equipe_nome ? `equipe ${l.equipe_nome}` : ""}</div></td>
                        <td>{atend}</td>
                        <td><span className={`lo-ch ${s[1]}`}>{s[0]}</span>{desc || l.status === "ABANDONED" || l.status === "LOST" ? <div className="lo-m">{mot(l.motivo_descarte)}</div> : null}</td>
                        <td><div className="lo-ac">
                          {(l.sem_atendimento || desc) && outros.length ? <>
                            <select className="lo-sel" aria-label={desc ? "Redistribuir para" : "Passar para"} value={para[l.id] ?? ""}
                              onChange={(e) => setPara((p) => ({ ...p, [l.id]: e.target.value }))}>
                              <option value="">{desc ? "Redistribuir para…" : "Passar para…"}</option>{outros.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>
                            {confirmar === l.id ? <>
                              <span className="lo-m">Motivo: {mot(l.motivo_descarte)}. Mesmo assim?</span>
                              <button className="lo-btn pri" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={ocupado === l.id} onClick={() => redistribuir([l.id], [para[l.id]], true)}>Sim</button>
                              <button className="lo-btn gh" style={{ padding: "4px 8px", fontSize: 12.5 }} onClick={() => setConfirmar(null)}>Não</button></>
                              : <button className="lo-btn" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={ocupado === l.id || !para[l.id]}
                                  onClick={() => !desc ? passar(l) : SENSIVEL.includes(l.motivo_descarte ?? "") ? setConfirmar(l.id) : redistribuir([l.id], [para[l.id]], false)}>
                                  {desc ? "Redistribuir" : "Passar"}</button>}
                          </> : null}
                          <button className="lo-btn gh" style={{ padding: "4px 8px", fontSize: 12.5 }} onClick={() => verCaminho(l.id)}>Caminho</button>
                        </div></td>
                      </tr>,
                      cam ? <tr key={l.id + "-c"}><td colSpan={7}><div className="lo-hist">
                        <span>{dh(l.entrou)} · entrou ({l.tipo}{l.campanha ? ` · ${l.campanha}` : ""}) · {l.como}</span>
                        {cam === "carregando" ? <span>carregando…</span> : cam.length ? cam.map((p, i) => (
                          <span key={i}>{dh(p.quando)} · {p.motivo === "entrada" ? `ficou com ${p.para ?? "?"}` : `${p.de ?? "sem dono"} → ${p.para ?? "sem dono"} (${p.motivo}${p.por ? `, por ${p.por}` : ""})`}</span>
                        )) : <span>Sem trocas registradas (o caminho começou a ser gravado em 28/10).</span>}
                      </div></td></tr> : null,
                    ];
                  })}</tbody></table></div>
                {!vis.length ? <p className="lo-m">Nenhum lead nesse filtro.</p> : null}
              </>;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
