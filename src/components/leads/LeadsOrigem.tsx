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
  dest: string | null; dest_ok: boolean | null; dest_motivo: string | null;
};
type Equipe = { id: string; nome: string; corretores: { id: string; nome: string }[] };
type Dest = { tipo: "fila" | "roleta" | "pagina" | "plantao"; fila_id?: string; form_id?: string | null; roleta_de?: string | null;
  corretores?: { id: string; nome: string }[]; fora_plantao?: boolean; sugestao?: { form_id: string; nome: string; quem: string | null } | null };
type Painel = { eu: { id: string; role: string }; equipes: Equipe[]; leads: Lead[]; destinos?: Record<string, Dest> };
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
.lo-seg{display:flex;background:var(--card);border:1px solid var(--line);border-radius:99px;padding:3px}
.lo-seg button{font:inherit;font-size:13px;font-weight:600;border:0;background:none;color:var(--ink-2,#475569);padding:5px 12px;border-radius:99px;cursor:pointer}
.lo-seg button.on{background:var(--ink);color:var(--card)}
.lo-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.lo-kp{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:2px;text-align:left;font:inherit;color:inherit;cursor:pointer}
.lo-kp:hover{border-color:var(--blue,#0d9488)}.lo-kp.on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.lo-kp .k{font-size:12px;font-weight:600;color:var(--ink-3,#64748b)}.lo-kp .v{font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.lo-kp .h{font-size:12.5px;color:var(--ink-2,#475569)}.lo-kp.al .v{color:#dc2626}.lo-kp.wa .v{color:#b45309}
.lo-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ink-3,#64748b)}.lo-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.lo-sb{display:flex;height:10px;border-radius:99px;overflow:hidden;background:var(--sunk);min-width:150px}.lo-sb span{display:block;height:100%}
.lo-sbx{display:grid;gap:4px}.lo-sbx small{font-size:11.5px;color:var(--ink-3,#64748b);white-space:nowrap}
.lo td.sem{color:#dc2626;font-weight:800}
.lo-av{display:flex;align-items:center}.lo-av b{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:10.5px;font-weight:800;color:#fff;border:2px solid var(--card);margin-left:-6px}
.lo-av b:first-child{margin-left:0}.lo-av em{font-style:normal;font-size:12px;color:var(--ink-3,#64748b);margin-left:6px;white-space:nowrap}
.lo-dest{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.lo-box{border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:5px;min-width:0}
.lo-box .k{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3,#64748b)}
.lo-names{display:flex;flex-wrap:wrap;gap:5px}.lo-names span{font-size:12.5px;background:var(--sunk);border:1px solid var(--line);border-radius:99px;padding:2px 8px}
.lo-why{font-size:12.5px;color:#b45309;background:color-mix(in srgb,#d97706 12%,var(--card));border-radius:8px;padding:5px 9px;margin-top:5px}
.lo tbody tr.clk{cursor:pointer}.lo tbody tr.clk:hover td{background:color-mix(in srgb,var(--blue,#0d9488) 6%,var(--card))}
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
  const [soAtencao, setSoAtencao] = useState(false);

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
  const mandarFila = async (l: Lead) => {
    const p = para[l.id];
    if (!p) { toast.error("Escolha um corretor da fila."); return; }
    setOcupado(l.id);
    try {
      const { data: nome, error } = await sb.rpc("mandar_para_fila", { p_lead: l.id, p_para: p, p_como: como || null });
      if (error) throw error;
      toast.success(`Lead mandado para ${nome}, da fila do formulário.`);
      qc.invalidateQueries({ queryKey: ["leads-origem"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui mandar agora."); }
    finally { setOcupado(null); }
  };
  const copiarFila = async (form: string, origem: string, nome: string) => {
    setOcupado("fila");
    try {
      const { data: n, error } = await sb.rpc("copiar_fila_formulario", { p_form: form, p_origem: origem, p_como: como || null });
      if (error) throw error;
      toast.success(`Pronto: este formulário agora vai para os mesmos corretores de "${nome}".${n ? ` ${n} lead(s) parado(s) foram entregues.` : ""}`);
      qc.invalidateQueries({ queryKey: ["leads-origem"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui ligar agora."); }
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
  // 29/10 (Junior, mockup https://claude.ai/artifact/SFq3T3NS5nQ2ATjJXWNj4X): barra de situação, "Vai para" e "Foi certo?"
  const grupoDe = (l: Lead) => l.tipo === "Pescar" ? "Pescar" : l.tipo === "Lista" ? "Listas" : l.tipo === "Disparo de WhatsApp" ? "Disparos de WhatsApp"
    : l.tipo === "Resgate" ? "Resgate" : l.campanha;
  const destinos = data.destinos ?? {};
  const destDe = (ls: Lead[]) => {
    const n = new Map<string, number>();
    for (const l of ls) if (l.dest) n.set(l.dest, (n.get(l.dest) ?? 0) + 1);
    const k = [...n.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    return k ? { chave: k, d: destinos[k] } : null;
  };
  const conferir = (ls: Lead[]) => {
    const vistos = ls.filter((l) => l.dest_ok !== null);
    const fora = vistos.filter((l) => l.dest_ok === false).length;
    const semFila = destDe(ls)?.d?.tipo === "plantao";
    return { vistos: vistos.length, fora, semFila, atencao: semFila || fora > 0 };
  };
  const situacao = (ls: Lead[]) => {
    const sv = conta(ls, (l) => { const t = sit(l.status)[0]; return t.startsWith("Visita") || t === "Venda"; });
    const sem = conta(ls, (l) => l.sem_atendimento);
    const at = conta(ls, (l) => sit(l.status)[1] === "i" && !l.sem_atendimento);
    const de = conta(ls, (l) => sit(l.status)[0] === "Descartado");
    return { sv, at, de, sem };
  };
  const barra = (ls: Lead[]) => {
    const x = situacao(ls), t = ls.length || 1;
    const seg: [number, string, string][] = [[x.sv, "#1d4ed8", "visita/venda"], [x.at, "#60a5fa", "atendendo"],
      [x.de, "color-mix(in srgb,var(--ink) 22%,var(--card))", "descartado"], [x.sem, "#dc2626", "sem atendimento"]];
    return <div className="lo-sbx"><div className="lo-sb" role="img" aria-label={seg.map((g) => `${g[2]} ${g[0]}`).join(", ")}>
      {seg.map((g, i) => g[0] ? <span key={i} style={{ width: `${(100 * g[0]) / t}%`, background: g[1] }} /> : null)}</div>
      <small>{Math.round((100 * (x.sv + x.at)) / t)}% atendidos · {x.de} descartado{x.de === 1 ? "" : "s"}</small></div>;
  };
  const CORES = ["#1d4ed8", "#0e7c7b", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#4f46e5", "#a16207", "#be185d", "#15803d"];
  const corDe = (n: string) => CORES[[...n].reduce((a2, c) => a2 + c.charCodeAt(0), 0) % CORES.length];
  const vaiPara = (ls: Lead[]) => {
    const t = ls[0]?.tipo;
    if (t === "Pescar") return <span className="lo-m">quem pescou</span>;
    if (t !== "Anúncio") return <span className="lo-m">—</span>;
    const dd = destDe(ls)?.d;
    if (!dd) return <span className="lo-m">não dá para conferir</span>;
    if (dd.tipo === "plantao") return <span style={{ color: "#b45309", fontWeight: 700 }}>Plantão da equipe</span>;
    if (dd.tipo === "roleta") return <span>Plantão de {dd.roleta_de}</span>;
    const cs = dd.corretores ?? [];
    return <div className="lo-av" title={cs.map((c) => c.nome).join(", ")}>
      {cs.slice(0, 4).map((c) => <b key={c.id} style={{ background: corDe(c.nome) }}>{c.nome.slice(0, 2).toUpperCase()}</b>)}
      <em>{cs.length > 4 ? `+${cs.length - 4} · ` : ""}{cs.length} corretor{cs.length === 1 ? "" : "es"}{dd.tipo === "pagina" ? " (página)" : ""}</em></div>;
  };
  const foiCerto = (ls: Lead[]) => {
    if (ls[0]?.tipo !== "Anúncio") return <span className="lo-ch">—</span>;
    const c = conferir(ls);
    if (c.semFila) return <span className="lo-ch w">⚠ sem corretores escolhidos</span>;
    if (c.fora) return <span className="lo-ch w">⚠ {c.fora} {c.fora === 1 ? "foi" : "foram"} para outra pessoa</span>;
    if (c.vistos) return <span className="lo-ch ok">✓ {c.vistos} de {c.vistos}</span>;
    return <span className="lo-ch">—</span>;
  };
  const gruposDe = (ls: Lead[]) => {
    const grupos = new Map<string, Lead[]>();
    for (const l of ls) grupos.set(grupoDe(l), [...(grupos.get(grupoDe(l)) ?? []), l]);
    return [...grupos.entries()].sort((x, y) => y[1].length - x[1].length);
  };
  const precisaAtencao = (ls: Lead[]) => ls.some((l) => l.sem_atendimento) || gruposDe(ls).some(([, gl]) => gl[0].tipo === "Anúncio" && conferir(gl).atencao);
  const celulas = (ls: Lead[], vai: JSX.Element, certo: JSX.Element) => <>
    <td className="n">{ls.length}</td><td>{barra(ls)}</td><td className={`n${situacao(ls).sem ? " sem" : ""}`}>{situacao(ls).sem || ""}</td><td>{vai}</td><td>{certo}</td></>;
  const cabecalho = (primeira: string) => <thead><tr><th>{primeira}</th><th style={{ textAlign: "right" }}>Leads</th><th>Situação</th>
    <th style={{ textAlign: "right" }}>Sem atend.</th><th>Vai para</th><th>Foi certo?</th></tr></thead>;
  const abrirGaveta = (titulo: string, ls: Lead[]) => { setAberta({ titulo, ids: ls.map((l) => l.id) }); setFiltroG("todos"); setMarcados([]); setAlvos([]); setConfirmar(null); };
  const linhasCampanhas = (ls: Lead[], chave: string, recuo: boolean) => gruposDe(ls)
    .filter(([, gl]) => !soAtencao || gl.some((l) => l.sem_atendimento) || (gl[0].tipo === "Anúncio" && conferir(gl).atencao))
    .flatMap(([g, gl]) => {
      const partes = new Map<string, Lead[]>();
      for (const l of gl) partes.set(l.campanha, [...(partes.get(l.campanha) ?? []), l]);
      const temPartes = partes.size > 1 && g !== gl[0].campanha;
      const kg = chave + "|" + g, aberto = grupoAberto === kg;
      const pad = recuo ? 34 : 12;
      return [
        <tr key={kg} className="clk" style={recuo ? { background: "var(--sunk)" } : undefined} tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLElement).click(); }}
          onClick={() => temPartes ? setGrupoAberto(aberto ? null : kg) : abrirGaveta(g, gl)}>
          <td style={{ paddingLeft: pad }}><b>{temPartes ? (aberto ? "▾ " : "▸ ") : ""}{g}</b>
            <div className="lo-m">{gl[0].tipo}{gl[0].tipo === "Anúncio" && gl[0].pagina_nome ? ` · ${gl[0].pagina_nome}` : ""}{temPartes ? ` · ${partes.size} ${g === "Pescar" ? "regiões" : "partes"}` : ""}</div></td>
          {celulas(gl, vaiPara(gl), foiCerto(gl))}
        </tr>,
        ...(temPartes && aberto ? [...partes.entries()].sort((x, y) => y[1].length - x[1].length).map(([pn, pl]) => (
          <tr key={kg + "|" + pn} className="clk" style={{ background: "var(--sunk)" }} onClick={() => abrirGaveta(pn, pl)}>
            <td style={{ paddingLeft: pad + 18 }}>{pn.replace(/^Pescar · /, "")}</td>{celulas(pl, vaiPara(pl), foiCerto(pl))}</tr>
        )) : []),
      ];
    });
  const leg = <div className="lo-leg"><span><i style={{ background: "#1d4ed8" }} />Visita/venda</span><span><i style={{ background: "#60a5fa" }} />Atendendo</span>
    <span><i style={{ background: "color-mix(in srgb,var(--ink) 22%,var(--card))" }} />Descartado</span><span><i style={{ background: "#dc2626" }} />Sem atendimento</span></div>;

  // resumo do alto
  const sTot = situacao(leads);
  const anuncios = gruposDe(leads.filter((l) => l.tipo === "Anúncio"));
  const paraConferir = anuncios.filter(([, gl]) => conferir(gl).atencao);
  const nSemFila = paraConferir.filter(([, gl]) => conferir(gl).semFila).length;
  const porTipo = (t: string) => conta(leads, (l) => l.tipo === t);
  const eqVisiveis = porEquipe.filter((e) => !soAtencao || precisaAtencao(e.ls));

  return (
    <div className="lo"><style>{CSS}</style>
      <div className="lo-f" role="search">
        <div className="lo-seg" role="tablist" aria-label="Período">
          {([["hoje", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["datas", "Datas"]] as const).map(([k, t]) =>
            <button key={k} type="button" className={per === k ? "on" : ""} onClick={() => setPer(k)}>{t}</button>)}
        </div>
        {per === "datas" ? <><label>De<input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até<input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label></> : null}
        {!ehGerente ? <label>Equipe<select value={fEq} onChange={(e) => setFEq(e.target.value)}><option value="">Todas</option>
          {data.equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label> : null}
        <label>Campanha<select value={fCamp} onChange={(e) => setFCamp(e.target.value)} style={{ maxWidth: 220 }}><option value="">Todas</option>
          {campsTodas.map((c) => <option key={c} value={c}>{c.slice(0, 60)}</option>)}</select></label>
        <label>Origem<select value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Todas</option>
          {tiposPresentes.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Situação<select value={fSit} onChange={(e) => setFSit(e.target.value)}><option value="">Todas</option>
          {["Novo", "Em atendimento", "Visita marcada", "Visita feita", "Venda", "Descartado"].map((s2) => <option key={s2}>{s2}</option>)}</select></label>
        <label>Mostrar<select value={soAtencao ? "a" : ""} onChange={(e) => setSoAtencao(e.target.value === "a")}><option value="">Tudo</option><option value="a">Só o que precisa de atenção</option></select></label>
        <span style={{ flex: 1 }} />
        <button className="lo-btn pri" onClick={() => baixarCsv(leads, "")}>⬇ CSV ({leads.length})</button>
      </div>
      {(data.leads ?? []).length >= 5000 ? <p className="lo-m">Mostrando os 5.000 mais recentes do período. Para ver todos, diminua o período.</p> : null}

      <div className="lo-k">
        <button type="button" className={`lo-kp${!fTipo && !soAtencao ? " on" : ""}`} onClick={() => { setFTipo(""); setSoAtencao(false); }}>
          <span className="k">Leads no período</span><span className="v">{leads.length}</span>
          <span className="h">{[["Anúncio", "anúncio"], ["Pescar", "Pescar"]].map(([t, r]) => `${r} ${porTipo(t)}`).join(" · ")}{leads.length - porTipo("Anúncio") - porTipo("Pescar") ? ` · outros ${leads.length - porTipo("Anúncio") - porTipo("Pescar")}` : ""}</span></button>
        <div className="lo-kp" style={{ cursor: "default" }}><span className="k">Atendidos</span><span className="v">{sTot.at + sTot.sv}</span>
          <span className="h">{leads.length ? Math.round((100 * (sTot.at + sTot.sv)) / leads.length) : 0}% · visita/venda {sTot.sv}</span></div>
        <button type="button" className={`lo-kp al${soAtencao ? " on" : ""}`} onClick={() => setSoAtencao(true)}>
          <span className="k">Sem atendimento agora</span><span className="v">{sTot.sem}</span><span className="h">toque para ver e passar</span></button>
        <button type="button" className="lo-kp wa" onClick={() => { setFTipo("Anúncio"); setSoAtencao(true); }}>
          <span className="k">Formulários para conferir</span><span className="v">{paraConferir.length}</span>
          <span className="h">{paraConferir.length ? `${nSemFila ? `${nSemFila} sem corretores` : ""}${nSemFila && paraConferir.length - nSemFila ? " · " : ""}${paraConferir.length - nSemFila ? `${paraConferir.length - nSemFila} com lead fora da fila` : ""}` : "todos foram para quem devia"}</span></button>
      </div>

      {!ehGerente ? (
        <section style={{ display: "grid", gap: 8 }}>
          <div className="lo-h"><h3>Por equipe</h3>{leg}</div>
          <div className="lo-t"><table>{cabecalho("Equipe / campanha")}<tbody>
            {eqVisiveis.map((e) => {
              const gs = gruposDe(e.ls), conf = gs.filter(([, gl]) => gl[0].tipo === "Anúncio" && conferir(gl).atencao).length;
              const ab = eqAberta === e.id || (soAtencao && eqVisiveis.length <= 3);
              return [
                <tr key={e.id} className="clk" tabIndex={0} aria-expanded={ab} onKeyDown={(ev) => { if (ev.key === "Enter") setEqAberta(eqAberta === e.id ? null : e.id); }}
                  onClick={() => setEqAberta(eqAberta === e.id ? null : e.id)}>
                  <td><b>{ab ? "▾ " : "▸ "}{e.nome}</b></td>
                  {celulas(e.ls, <span className="lo-m">{gs.length} origem{gs.length === 1 ? "" : "s"}</span>,
                    conf ? <span className="lo-ch w">⚠ {conf} para conferir</span> : gs.some(([, gl]) => gl[0].tipo === "Anúncio") ? <span className="lo-ch ok">✓ tudo certo</span> : <span className="lo-ch">—</span>)}
                </tr>,
                ...(ab ? linhasCampanhas(e.ls, e.id, true) : []),
              ];
            })}
          </tbody></table></div>
          {!eqVisiveis.length ? <p className="lo-m">{soAtencao ? "Nada precisando de atenção com esses filtros." : "Nenhum lead com esses filtros."}</p> : null}
        </section>
      ) : (
        <section style={{ display: "grid", gap: 8 }}>
          <div className="lo-h"><h3>Por campanha</h3>{leg}</div>
          {!leads.length ? <p className="lo-m">Nenhum lead com esses filtros.</p>
            : <div className="lo-t"><table>{cabecalho("Campanha / origem")}<tbody>{linhasCampanhas(leads, "eu", false)}</tbody></table></div>}
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
            {camp[1][0]?.tipo === "Anúncio" ? (() => {
              const dd = destDe(camp[1]), c = conferir(camp[1]);
              const form = camp[1].find((l) => l.form_id)?.form_id ?? null;
              const sug = dd?.d?.sugestao;
              return <div className="lo-dest">
                <div className="lo-box"><span className="k">Vai para</span>
                  {!dd?.d ? <span className="lo-m">Não dá para conferir: estes leads chegaram sem o formulário registrado.</span>
                    : dd.d.tipo === "plantao" ? <>
                      <b style={{ color: "#b45309" }}>Plantão da equipe</b>
                      <span className="lo-m">Este formulário não tem corretores escolhidos.</span>
                      {sug && form ? <div><button className="lo-btn pri" disabled={ocupado === "fila"} onClick={() => copiarFila(form, sug.form_id, sug.nome)}>
                        Usar os mesmos de "{sug.nome.slice(0, 40)}"</button><div className="lo-m" style={{ marginTop: 4 }}>{sug.quem}</div></div>
                        : <span className="lo-m">Escolha em Configurar → Facebook e leads.</span>}</>
                    : dd.d.tipo === "roleta" ? <><b>Plantão de {dd.d.roleta_de}</b><span className="lo-m">quem estiver na roleta na hora</span></>
                    : <><div className="lo-names">{(dd.d.corretores ?? []).map((x) => <span key={x.id}>{x.nome}</span>)}</div>
                      <span className="lo-m">{dd.d.tipo === "pagina" ? "Fila da página · " : ""}{dd.d.fora_plantao ? "recebem mesmo fora do plantão" : "só quem está de plantão"}</span></>}
                </div>
                <div className="lo-box"><span className="k">Foi certo?</span>{foiCerto(camp[1])}
                  <span className="lo-m">{c.semFila ? "Os leads foram para o plantão da equipe." : c.fora ? "Veja os leads marcados abaixo." : c.vistos ? "Todos os leads foram para essas pessoas." : ""}</span></div>
              </div>;
            })() : null}
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
                        <td>{atend}{l.dest_ok === false && l.dest_motivo ? <div className="lo-why">⚠ {l.dest_motivo}</div> : null}</td>
                        <td><span className={`lo-ch ${s[1]}`}>{s[0]}</span>{desc || l.status === "ABANDONED" || l.status === "LOST" ? <div className="lo-m">{mot(l.motivo_descarte)}</div> : null}</td>
                        <td><div className="lo-ac">
                          {(() => {
                            const dd = l.dest ? destinos[l.dest] : null;
                            const daFila = (dd?.corretores ?? []).filter((x) => x.id !== l.corretor);
                            if (!(l.dest_ok === false && l.sem_atendimento && dd && dd.tipo !== "plantao" && daFila.length)) return null;
                            return <>
                              <select className="lo-sel" aria-label="Mandar para a fila" value={para[l.id] ?? ""} onChange={(e) => setPara((p) => ({ ...p, [l.id]: e.target.value }))}>
                                <option value="">Mandar para a fila…</option>{daFila.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>
                              <button className="lo-btn pri" style={{ padding: "4px 10px", fontSize: 12.5 }} disabled={ocupado === l.id || !para[l.id]} onClick={() => mandarFila(l)}>Mandar</button></>;
                          })()}
                          {(l.sem_atendimento || desc) && outros.length && !(l.dest_ok === false && l.sem_atendimento && l.dest && destinos[l.dest]?.tipo !== "plantao") ? <>
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
