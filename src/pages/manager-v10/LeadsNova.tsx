// Leads do gerente — tela nova (10/11, Junior: "a de leads está muito confusa"). Protótipo aprovado:
// https://claude.ai/artifact/87PsvMu65KmF4XL6WtYBNq · 6 abas: Precisa de mim agora · Chegaram · Tarefas · Por campanha ·
// Anúncios · Por corretor. Um lugar só para redistribuir (Chegaram) e uma gaveta só para mexer no lead.
// A tela antiga continua em /manager/leads-antiga.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { cobrarFila } from "@/hooks/useLeads";
import { atendido, ehTeste } from "@/lib/situacaoLead";
import FilasFormulario from "@/components/leads/FilasFormulario";
import AnunciosGerente from "@/components/anuncios/AnunciosGerente";
import LeadGaveta from "@/components/leads2/LeadGaveta";
import { COLS_LEAD, CSS, VISITA, janela, precisa, quando, situacao, SIT, TAG, type Corretor, type LeadN, type Periodo } from "@/components/leads2/comum";

const sb = supabase as any;
type Aba = "agora" | "chegaram" | "tarefas" | "campanhas" | "anuncios" | "corretores";
const brl = (n: number | null | undefined) => n == null || !isFinite(n) ? "—" : `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export default function LeadsNova() {
  const { session } = useAuth();
  const eu = session?.user?.id ?? null;
  const gerente = useEffectiveManagerId() ?? eu;
  const como = gerente !== eu ? gerente : null;
  const { mode, toggle } = useTheme();
  const qc = useQueryClient();
  useEffect(loadFonts, []);

  const [aba, setAba] = useState<Aba>("agora");
  const [per, setPer] = useState<Periodo>("7d");
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const [datasOk, setDatasOk] = useState<{ de: string; ate: string } | null>(null);
  const jan = janela(per, datasOk?.de, datasOk?.ate);
  const [gaveta, setGaveta] = useState<{ id: string; trocando?: boolean } | null>(null);
  const [filtroAgora, setFiltroAgora] = useState<number>(-1);
  const [chip, setChip] = useState<string>("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dst, setDst] = useState<Set<string>>(new Set());
  const [indo, setIndo] = useState(false);
  const [tf, setTf] = useState(0); const [tk, setTk] = useState("todos");
  const [comparar, setComparar] = useState(false);
  const [filaForm, setFilaForm] = useState<string | null>(null);
  // "Precisa de mim agora": por corretor (padrão, fácil de ler) · um a um · lista com seleção
  const [modoAgora, setModoAgora] = useState<"corretor" | "um" | "lista">("corretor");
  const [umFila, setUmFila] = useState<string[]>([]);   // chaves (id|g) na ordem do um a um
  const [umIdx, setUmIdx] = useState(0);
  const [umPara, setUmPara] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ln-dados", gerente, jan.de, jan.ate], enabled: !!gerente, refetchInterval: 120_000,
    queryFn: async () => {
      const desde90 = new Date(Date.now() - 90 * 864e5).toISOString();
      const [cs, ativos, periodo, filas, forms, saude] = await Promise.all([
        sb.from("profiles").select("id,first_name,last_name,lead_assignment_enabled").eq("manager_id", gerente).eq("role", "BROKER").eq("is_active", true).order("first_name"),
        sb.from("leads").select(COLS_LEAD).eq("manager_id", gerente).not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED,LOST)").gte("created_at", desde90).limit(4000),
        sb.from("leads").select(COLS_LEAD).eq("manager_id", gerente).gte("created_at", jan.de).lt("created_at", jan.ate).order("created_at", { ascending: false }).limit(5000),
        sb.from("distribution_queues").select("match_value,broker_ids").eq("match_field", "form_id").eq("is_active", true),
        sb.from("formularios_catalogo").select("form_id,nome,owner_id,anuncio_ativo"),
        sb.from("fb_saude").select("dados").eq("dono_id", gerente),
      ]);
      const corretores: Corretor[] = ((cs.data ?? []) as any[]).map((p) => ({ id: p.id, nome: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Corretor", roleta: p.lead_assignment_enabled !== false }));
      const ids = [...corretores.map((c) => c.id), gerente];
      const tarefas = (await sb.from("tasks").select("id,title,due_at,status,user_id,lead_id").in("user_id", ids).eq("status", "OPEN")
        .lte("due_at", new Date(Date.now() + 7 * 864e5).toISOString()).order("due_at").limit(500)).data ?? [];
      return {
        corretores, ativos: ((ativos.data ?? []) as LeadN[]).filter((l) => !ehTeste(l)), periodo: ((periodo.data ?? []) as LeadN[]).filter((l) => !ehTeste(l)),
        filas: new Map(((filas.data ?? []) as any[]).map((f) => [f.match_value, f.broker_ids as string[]])),
        formNome: new Map(((forms.data ?? []) as any[]).map((f) => [f.form_id, f.nome as string])),
        // formulários das páginas do gerente (aparecem no Por campanha antes do primeiro lead)
        formsDele: ((forms.data ?? []) as any[]).filter((f) => f.owner_id === gerente) as { form_id: string; nome: string | null; anuncio_ativo: boolean | null }[],
        campanhasFb: ((saude.data ?? []) as any[]).flatMap((s) => s.dados?.campanhas ?? []), tarefas: tarefas as any[],
      };
    },
  });

  const corretores = data?.corretores ?? [];
  const nomeC = (id: string | null) => corretores.find((c) => c.id === id)?.nome.split(" ")[0] ?? (id === gerente ? "você" : id ? "outro" : "ninguém");
  const leadPorId = useMemo(() => new Map([...(data?.ativos ?? []), ...(data?.periodo ?? [])].map((l) => [l.id, l])), [data]);
  const carteira = useMemo(() => { const m = new Map<string, number>(); for (const l of data?.ativos ?? []) if (l.broker_id) m.set(l.broker_id, (m.get(l.broker_id) ?? 0) + 1); return m; }, [data]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["ln-dados"] });

  // ── Precisa de mim agora ──
  const atrasadas = useMemo(() => (data?.tarefas ?? []).filter((t) => new Date(t.due_at).getTime() < Date.now()), [data]);
  const agora = useMemo(() => {
    const itens: { id: string; g: number; tag: string; porque: string; quem: string | null; lead: LeadN | undefined; t: number }[] = [];
    for (const l of data?.ativos ?? []) { const p = precisa(l); if (p) itens.push({ id: l.id, ...p, quem: l.broker_id, lead: l, t: new Date(p.g === 0 ? l.last_lead_response_at! : l.created_at).getTime() }); }
    for (const t of atrasadas) {
      if (!t.lead_id) continue;
      const l = leadPorId.get(t.lead_id);
      itens.push({ id: t.lead_id, g: 3, tag: `Tarefa venceu ${quando(t.due_at)}`, porque: `${nomeC(t.user_id)} agendou "${t.title}" e não fez`, quem: t.user_id === gerente ? null : t.user_id, lead: l, t: new Date(t.due_at).getTime() });
    }
    // ordem: quem respondeu primeiro, depois tarefa atrasada, sem corretor e nunca abordado; dentro de cada grupo o mais recente
    const ordem: Record<number, number> = { 0: 0, 3: 1, 2: 2, 1: 3 };
    return itens.sort((a, b) => ordem[a.g] - ordem[b.g] || b.t - a.t);
  }, [data, atrasadas, leadPorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const contaG = (g: number) => agora.filter((x) => x.g === g).length;

  async function cobrar(leadIds: string[], quemNome: string) {
    if (!eu) return;
    try {
      const r = await cobrarFila(leadIds, eu, "leads_nova");
      const ok = r.corretores.filter((c) => c.avisado_no_whats).length;
      toast.success(ok ? `${quemNome} cobrado no WhatsApp.` : `${quemNome} não tem WhatsApp ligado: a cobrança ficou no app.`);
    } catch (e: any) { toast.error(e?.message ?? "Não consegui cobrar."); }
  }

  // ── Chegaram ──
  const chegaram = useMemo(() => (data?.periodo ?? []).filter((l) => {
    const s = situacao(l);
    if (chip === "sem") return s.k === "ruim" || s.k === "sem";
    if (chip === "desc") return s.k === "desc";
    if (chip.startsWith("c:")) return l.broker_id === chip.slice(2);
    return true;
  }), [data, chip]);
  const alternar = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  async function redistribuir() {
    if (!sel.size || !dst.size) return;
    setIndo(true);
    const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: [...sel], p_para: [...dst], p_como: como, p_motivo: "Redistribuído pelo gestor" });
    setIndo(false);
    if (error) { toast.error(error.details || error.message); return; }
    const pul = (r?.pulados ?? []) as { nome: string; motivo: string }[];
    toast.success(`${r?.feitos ?? 0} lead(s) redistribuídos.` + (pul.length ? ` ${pul.length} ficaram: ${pul.slice(0, 3).map((p) => `${p.nome} (${p.motivo})`).join(", ")}${pul.length > 3 ? "…" : ""}` : ""), { duration: 9000 });
    setSel(new Set()); setDst(new Set()); recarregar();
  }
  function baixarCsv() {
    const linhas = [["chegou", "nome", "telefone", "campanha", "corretor", "situação"],
      ...(data?.periodo ?? []).map((l) => [l.created_at.slice(0, 16).replace("T", " "), l.name, l.phone, l.campanha_nome ?? "", nomeC(l.broker_id), situacao(l).txt])];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + linhas.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `leads-${jan.rotulo.replace(/\W+/g, "-")}.csv`; a.click();
  }

  // ── Tarefas: tarefas + retornos combinados + visitas agendadas ──
  const agenda = useMemo(() => {
    const fim = Date.now() + 7 * 864e5;
    const itens: { quando: string; tarefa: string; leadId: string | null; cliente: string; quem: string | null }[] = [];
    for (const t of data?.tarefas ?? []) itens.push({ quando: t.due_at, tarefa: t.title, leadId: t.lead_id, cliente: leadPorId.get(t.lead_id)?.name ?? "", quem: t.user_id });
    for (const l of data?.ativos ?? []) {
      if (l.next_action_date && new Date(l.next_action_date).getTime() < fim) itens.push({ quando: l.next_action_date, tarefa: "Retorno combinado com o cliente", leadId: l.id, cliente: l.name ?? "", quem: l.broker_id });
      if (l.status === "VISIT_SCHEDULED" && l.visit_scheduled_at && new Date(l.visit_scheduled_at).getTime() < fim && new Date(l.visit_scheduled_at).getTime() > Date.now() - 864e5)
        itens.push({ quando: l.visit_scheduled_at, tarefa: "Visita agendada", leadId: l.id, cliente: l.name ?? "", quem: l.broker_id });
    }
    return itens.sort((a, b) => a.quando.localeCompare(b.quando));
  }, [data, leadPorId]);
  const grupoT = (iso: string) => { const t = new Date(iso).getTime(), fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999); return t < Date.now() ? 0 : t <= fimHoje.getTime() ? 1 : 2; };

  // ── Por campanha ──
  const campanhas = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; form: string | null; leads: LeadN[] }>();
    for (const l of data?.periodo ?? []) {
      const nome = l.campanha_nome || (l.fb_form_id && data?.formNome.get(l.fb_form_id)) || (l.source === "lista" ? "Lista de contatos" : l.source === "cold_pool" ? "Pescar" : l.source === "resgate" ? "Resgate" : "Outros");
      const chave = l.fb_form_id || `n:${norm(nome)}`;
      if (!m.has(chave)) m.set(chave, { chave, nome: nome!, form: l.fb_form_id, leads: [] });
      m.get(chave)!.leads.push(l);
    }
    for (const f of data?.formsDele ?? []) if (!m.has(f.form_id)) m.set(f.form_id, { chave: f.form_id, nome: f.nome || `Formulário ${f.form_id}`, form: f.form_id, leads: [] });
    return [...m.values()].map((c) => {
      const fila = c.form ? data?.filas.get(c.form) : undefined;
      const parados = c.leads.filter((l) => precisa(l)).length;
      return { ...c, chegaram: c.leads.length, atendidos: c.leads.filter(atendido).length,
        responderam: c.leads.filter((l) => !!l.last_lead_response_at).length,
        visitas: c.leads.filter((l) => VISITA.has(l.status ?? "") || !!l.visit_scheduled_at).length, parados,
        vai: fila?.length ? fila.map((id) => nomeC(id)).join(", ") + (fila.length > 1 ? " (rodízio)" : "") : c.form ? "Roleta do plantão da equipe" : "—",
        semFila: !!c.form && !fila?.length };
    }).sort((a, b) => b.chegaram - a.chegaram);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const comparacao = useMemo(() => {
    const fb = (data?.campanhasFb ?? []) as any[];
    const linhas = campanhas.map((c) => {
      const f = fb.find((x) => norm(x.nome) === norm(c.nome));
      const gasto = f ? Number(f.gasto ?? 0) : null;
      return { ...c, gasto, cpl: gasto != null && c.chegaram ? gasto / c.chegaram : null, cpv: gasto != null && c.visitas ? gasto / c.visitas : null };
    });
    const melhor = (k: "cpl" | "cpv") => { const v = linhas.map((l) => l[k]).filter((x): x is number => x != null); return { min: v.length > 1 ? Math.min(...v) : null, max: v.length > 1 ? Math.max(...v) : null }; };
    return { linhas, cpl: melhor("cpl"), cpv: melhor("cpv"), maxL: Math.max(1, ...linhas.map((l) => l.chegaram)) };
  }, [campanhas, data]);

  // ── Por corretor ──
  const porCorretor = useMemo(() => corretores.map((c) => {
    const rec = (data?.periodo ?? []).filter((l) => l.broker_id === c.id);
    return { ...c, recebeu: rec.length, atendeu: rec.filter(atendido).length, desc: rec.filter((l) => l.status === "ABANDONED" || l.status === "LOST").length,
      visitas: rec.filter((l) => VISITA.has(l.status ?? "")).length, parados: (data?.ativos ?? []).filter((l) => l.broker_id === c.id && precisa(l)).length };
  }).sort((a, b) => b.recebeu - a.recebeu), [corretores, data]);

  const tab = (k: Aba, nome: string, n?: number) => (
    <button key={k} type="button" role="tab" aria-selected={aba === k} className={`ln-aba${aba === k ? " on" : ""}`} onClick={() => { setAba(k); setSel(new Set()); setDst(new Set()); }}>{nome}{n != null ? <b>{n}</b> : null}</button>
  );
  const tagSt = (g: number) => ({ color: TAG[g][0], background: TAG[g][1] });
  const loteBarra = sel.size ? (
    <div className="ln-lote">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{sel.size} lead(s) marcados · redistribuir para:</b>
        <button type="button" onClick={() => { setSel(new Set()); setDst(new Set()); }} style={{ font: "inherit", background: "none", border: 0, color: "#fff", textDecoration: "underline", cursor: "pointer" }}>limpar seleção</button>
      </div>
      <div className="ln-btns">
        {corretores.map((c) => <button key={c.id} type="button" className={`ln-pill${dst.has(c.id) ? " on" : ""}`} aria-pressed={dst.has(c.id)} onClick={() => alternar(dst, setDst, c.id)}>{c.nome.split(" ")[0]}{c.roleta ? " · roleta" : ""} · {carteira.get(c.id) ?? 0}</button>)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#C9D3DF" }}>{dst.size ? `${sel.size} lead(s) em rodízio entre ${[...dst].map(nomeC).join(", ")} (cerca de ${Math.ceil(sel.size / dst.size)} para cada).` : "Escolha um ou mais corretores."}</span>
        <button type="button" className="ln-btn" disabled={indo || !dst.size} onClick={redistribuir} style={{ background: "#2BB5A0", borderColor: "#2BB5A0", color: "#0F1B2D", fontWeight: 800 }}>{indo ? "Redistribuindo…" : "Redistribuir agora"}</button>
      </div>
      <span style={{ fontSize: 12, color: "#C9D3DF" }}>Só corretores da equipe do lead. Lead de outra estrutura não passa (regra de isolamento). Descartado volta para "Novo". Cada corretor recebe o aviso no app.</span>
    </div>
  ) : null;

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <div className="ln"><style>{CSS}</style>
          <div className="ln-top">
            <div>
              <h1>Leads</h1>
              <p>{jan.rotulo} · <b>{data?.periodo.length ?? "…"} leads chegaram</b>{como ? " · vendo a equipe de outra pessoa" : ""}</p>
            </div>
            <div className="ln-acoes">
              {([["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["mes", "Mês"], ["datas", "Escolher datas"]] as [Periodo, string][]).map(([k, r]) => (
                <button key={k} type="button" className={`ln-pill${per === k ? " on" : ""}`} onClick={() => setPer(k)}>{r}</button>))}
              <button type="button" className="ln-pill brand" onClick={() => setFilaForm("*")}>Gerenciar filas</button>
              <Link className="ln-pill brand" to="/manager/anuncios">Ver anúncios</Link>
              <button type="button" className="ln-pill" onClick={baixarCsv} disabled={!data?.periodo.length}>Baixar CSV</button>
            </div>
          </div>
          {per === "datas" ? (
            <div className="ln-datas">
              <label>De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
              <label>Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
              <button type="button" className="ln-btn p" disabled={!de || !ate || de > ate} onClick={() => setDatasOk({ de, ate })}>Aplicar</button>
              <span className="ln-nota">O período vale para todas as abas (a aba "Precisa de mim agora" mostra sempre o que está pendente hoje).</span>
            </div>
          ) : null}

          <div className="ln-abas" role="tablist" aria-label="Visões">
            {tab("agora", "Precisa de mim agora", agora.length)}
            {tab("chegaram", "Chegaram", data?.periodo.length)}
            {tab("tarefas", "Tarefas", agenda.filter((x) => grupoT(x.quando) === 0).length)}
            {tab("campanhas", "Por campanha", campanhas.length)}
            {tab("anuncios", "Anúncios")}
            {tab("corretores", "Por corretor", corretores.length)}
          </div>

          {isLoading ? <p className="ln-vazio">Carregando os leads…</p> : null}

          {aba === "agora" && data ? (() => {
            const lista = agora.filter((x) => filtroAgora < 0 || x.g === filtroAgora);
            const chave = (x: { id: string; g: number }) => `${x.id}|${x.g}`;
            const grupos = new Map<string, typeof lista>();
            for (const x of lista) { const k = x.quem ?? "sem"; grupos.set(k, [...(grupos.get(k) ?? []), x]); }
            const ordemG = [...grupos.entries()].sort((a, b) => (a[0] === "sem" ? -1 : b[0] === "sem" ? 1 : b[1].length - a[1].length));
            const comecarUm = (itens: typeof lista) => { setUmFila(itens.map(chave)); setUmIdx(0); setUmPara(""); setModoAgora("um"); };
            const umItens = umFila.map((k) => agora.find((x) => chave(x) === k)).filter(Boolean) as typeof lista;
            const atual = umItens[umIdx];
            const proximo = () => { setUmPara(""); setUmIdx((n) => n + 1); };
            const passarUm = async () => {
              if (!atual || !umPara) return;
              setIndo(true);
              const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: [atual.id], p_para: [umPara], p_como: como, p_motivo: "Passado pelo gestor (um a um)" });
              setIndo(false);
              if (error) { toast.error(error.details || error.message); return; }
              if (!r?.feitos) { toast.error(r?.pulados?.[0]?.motivo ? `Não deu: ${r.pulados[0].motivo}` : "Não consegui passar."); return; }
              toast.success(`Passado para ${nomeC(umPara)}.`); proximo();
            };
            const resumo = (itens: typeof lista) => [[0, "responderam sem retorno"], [1, "nunca abordados"], [2, "sem corretor"], [3, "tarefas atrasadas"]]
              .map(([g, r]) => { const n = itens.filter((x) => x.g === g).length; return n ? `${n} ${r}` : null; }).filter(Boolean).join(" · ");
            return (<>
              <div className="ln-filtros">
                {[[0, "Responderam e ninguém voltou", "cliente falou, corretor sumiu"], [1, "Nunca abordados", "de 24h a 15 dias sem contato"], [2, "Sem corretor", "campanha sem fila ou corretor saiu"], [3, "Tarefas atrasadas", "o corretor agendou e não fez"]]
                  .map(([g, nome, sub]) => (
                    <button key={g} type="button" className="ln-filtro" onClick={() => { setFiltroAgora(filtroAgora === g ? -1 : (g as number)); setSel(new Set()); }}
                      style={{ color: TAG[g as number][0], border: filtroAgora === g ? `2px solid ${TAG[g as number][0]}` : undefined }}>
                      <b>{contaG(g as number)}</b><span>{nome}</span><small>{sub}</small></button>))}
              </div>
              <div className="ln-acoes">
                <span className="ln-nota">Ver:</span>
                {([["corretor", "Por corretor"], ["um", "Um a um"], ["lista", "Lista (para marcar vários)"]] as ["corretor" | "um" | "lista", string][]).map(([k, r]) => (
                  <button key={k} type="button" className={`ln-pill${modoAgora === k ? " on" : ""}`}
                    onClick={() => { if (k === "um") comecarUm(lista); else { setModoAgora(k); setSel(new Set()); } }}>{r}</button>))}
                <span className="ln-nota" style={{ marginLeft: "auto" }}>{lista.length} pendente(s){filtroAgora >= 0 ? " neste filtro" : ""}</span>
              </div>

              {modoAgora === "corretor" ? (
                <div className="ln-caixa">
                  {ordemG.map(([k, itens]) => (
                    <div key={k} className="ln-linha">
                      <div className="ln-corpo">
                        <b>{k === "sem" ? "Sem corretor" : nomeC(k)} · {itens.length} lead(s)</b>
                        <span>{resumo(itens)}</span>
                      </div>
                      <div className="ln-btns">
                        {k !== "sem" ? <button type="button" className="ln-btn p" onClick={() => cobrar(itens.filter((x) => x.g !== 2).map((x) => x.id), nomeC(k))}>Cobrar {nomeC(k)}</button> : null}
                        <button type="button" className="ln-btn" onClick={() => { setSel(new Set(itens.map((x) => x.id))); setModoAgora("lista"); }}>Redistribuir {itens.length > 1 ? `os ${itens.length}` : ""}</button>
                        <button type="button" className="ln-btn" onClick={() => comecarUm(itens)}>Ver um a um</button>
                      </div>
                    </div>))}
                  {!lista.length ? <p className="ln-vazio">Nada pendente agora. A equipe está em dia.</p> : null}
                </div>
              ) : null}

              {modoAgora === "um" ? (
                atual ? (
                  <div className="ln-card" style={{ maxWidth: 720, gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="ln-tag" style={tagSt(atual.g)}>{atual.tag}</span>
                      <span className="ln-nota"><b>{umIdx + 1}</b> de {umItens.length}</span>
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{atual.lead?.name || "Sem nome"}</h2>
                      <span className="ln-nota">{[atual.lead?.campanha_nome, atual.lead?.regiao_interesse, atual.lead?.renda_declarada ? `renda ${atual.lead.renda_declarada}` : null].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span style={{ fontSize: 14.5 }}>{atual.porque} · está {atual.quem ? <>com <b>{nomeC(atual.quem)}</b></> : <b>sem corretor</b>}</span>
                    {atual.quem && atual.g !== 2 ? (
                      <button type="button" className="ln-btn p" style={{ alignSelf: "flex-start" }} onClick={async () => { await cobrar([atual.id], nomeC(atual.quem)); proximo(); }}>Cobrar {nomeC(atual.quem)} e ir para o próximo</button>
                    ) : null}
                    <div className="ln-box">
                      <span className="ln-nota">Ou passe para outro corretor:</span>
                      <div className="ln-btns">
                        {corretores.filter((c) => c.id !== atual.quem).sort((a, b) => Number(b.roleta) - Number(a.roleta) || (carteira.get(a.id) ?? 0) - (carteira.get(b.id) ?? 0)).map((c) => (
                          <button key={c.id} type="button" className={`ln-pill${umPara === c.id ? " on" : ""}`} onClick={() => setUmPara(c.id)}>{c.nome.split(" ")[0]}{c.roleta ? " · roleta" : ""} · {carteira.get(c.id) ?? 0}</button>))}
                      </div>
                      <button type="button" className="ln-btn" disabled={indo || !umPara} onClick={passarUm} style={{ alignSelf: "flex-start", background: "#12233A", color: "#fff", borderColor: "#12233A" }}>{indo ? "Passando…" : umPara ? `Passar para ${nomeC(umPara)} e ir para o próximo` : "Escolha o corretor"}</button>
                    </div>
                    <div className="ln-btns">
                      <button type="button" className="ln-btn" onClick={() => setGaveta({ id: atual.id })}>Abrir o lead (tarefa, anotação, caminho)</button>
                      <button type="button" className="ln-btn" onClick={proximo}>Pular</button>
                      {umIdx > 0 ? <button type="button" className="ln-btn" onClick={() => { setUmPara(""); setUmIdx(umIdx - 1); }}>Voltar</button> : null}
                    </div>
                  </div>
                ) : (
                  <div className="ln-card" style={{ maxWidth: 720 }}>
                    <b style={{ fontSize: 16 }}>Pronto: você passou pelos {umItens.length} lead(s).</b>
                    <div className="ln-btns"><button type="button" className="ln-btn p" onClick={() => setModoAgora("corretor")}>Voltar para a lista por corretor</button></div>
                  </div>
                )
              ) : null}

              {modoAgora === "lista" ? (<>
                {loteBarra}
                <div className="ln-caixa">
                  <div className="ln-linha" style={{ background: "var(--cv-surface-subtle,#F3F6F9)" }}>
                    <label className="ln-nota" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={!!lista.length && lista.every((x) => sel.has(x.id))}
                        onChange={() => setSel(lista.every((x) => sel.has(x.id)) ? new Set() : new Set(lista.map((x) => x.id)))} /> marcar todos ({lista.length})</label>
                  </div>
                  {lista.slice(0, 300).map((x, i) => (
                    <div key={chave(x) + i} className="ln-linha">
                      <input type="checkbox" aria-label={`Marcar ${x.lead?.name ?? "lead"}`} checked={sel.has(x.id)} onChange={() => alternar(sel, setSel, x.id)} />
                      <span className="ln-tag" style={tagSt(x.g)}>{x.tag}</span>
                      <div className="ln-corpo"><b>{x.lead?.name || "Sem nome"}{x.lead?.campanha_nome ? ` · ${x.lead.campanha_nome}` : ""}</b><span>{x.porque}</span></div>
                      <span className="ln-quem">{x.quem ? `com ${nomeC(x.quem)}` : "—"}</span>
                      <div className="ln-btns">
                        {x.quem && x.g !== 2 ? <button type="button" className="ln-btn" onClick={() => cobrar([x.id], nomeC(x.quem))}>Cobrar</button> : null}
                        <button type="button" className="ln-btn" onClick={() => setGaveta({ id: x.id })}>Abrir</button>
                      </div>
                    </div>))}
                  {!lista.length ? <p className="ln-vazio">Nada pendente agora.</p> : null}
                </div>
              </>) : null}
              <span className="ln-nota">Primeiro quem respondeu, depois tarefas atrasadas, sem corretor e nunca abordados (só os últimos 15 dias; os mais velhos ficam em Chegaram) · mais recentes primeiro. "Cobrar" manda o WhatsApp para o corretor com o nome do(s) cliente(s). Lead com retorno combinado para frente não aparece aqui.</span>
            </>);
          })() : null}

          {aba === "chegaram" && data ? (<>
            <div className="ln-acoes">
              {[["todos", "Todos que chegaram"], ["sem", "Sem atendimento"], ["desc", "Descartados"]].map(([k, r]) => (
                <button key={k} type="button" className={`ln-pill${chip === k ? " on" : ""}`} onClick={() => { setChip(k); setSel(new Set()); }}>{r}</button>))}
              <select className="ln-pill" value={chip.startsWith("c:") ? chip : ""} aria-label="De um corretor" onChange={(e) => { setChip(e.target.value || "todos"); setSel(new Set()); }}>
                <option value="">De um corretor…</option>
                {corretores.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.nome}</option>)}
              </select>
              <span className="ln-nota" style={{ marginLeft: "auto" }}>{chegaram.length} de {data.periodo.length} ({jan.rotulo}) · mais recentes primeiro</span>
            </div>
            {loteBarra}
            <div className="ln-caixa ln-tab">
              <table>
                <thead><tr>
                  <th style={{ width: 36 }}><input type="checkbox" aria-label="Marcar todos" checked={!!chegaram.length && chegaram.every((l) => sel.has(l.id))}
                    onChange={() => setSel(chegaram.every((l) => sel.has(l.id)) ? new Set() : new Set(chegaram.filter((l) => !["CONCLUDED", "EXCLUDED"].includes(l.status ?? "")).map((l) => l.id)))} /></th>
                  <th>Chegou</th><th>Cliente</th><th>Campanha</th><th>Foi para</th><th>Situação</th>
                </tr></thead>
                <tbody>
                  {chegaram.slice(0, 400).map((l) => { const s = situacao(l); return (
                    <tr key={l.id}>
                      <td><input type="checkbox" aria-label={`Marcar ${l.name ?? "lead"}`} checked={sel.has(l.id)} onChange={() => alternar(sel, setSel, l.id)} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>{quando(l.created_at)}</td>
                      <td><button type="button" onClick={() => setGaveta({ id: l.id })} style={{ font: "inherit", fontWeight: 700, background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer" }}>{l.name || "Sem nome"}</button></td>
                      <td className="ln-nota">{l.campanha_nome || (l.fb_form_id && data.formNome.get(l.fb_form_id)) || (l.source === "lista" ? "Lista" : l.source === "cold_pool" ? "Pescar" : "—")}</td>
                      <td>{nomeC(l.broker_id)}</td>
                      <td><span className="ln-tag" style={{ color: SIT[s.k][0], background: SIT[s.k][1] }}>{s.txt}</span></td>
                    </tr>); })}
                  {!chegaram.length ? <tr><td colSpan={6} className="ln-vazio">Nenhum lead neste filtro.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <span className="ln-nota">Marque um ou vários (ou "marcar todos" depois de filtrar) e escolha para quem vão: o Comandra divide em rodízio entre os escolhidos. Clicar no nome abre o lead.</span>
          </>) : null}

          {aba === "tarefas" && data ? (<>
            <div className="ln-filtros">
              {[["Atrasadas", "venceram e não foram feitas", "#B4462F"], ["Para hoje", "ainda dentro do prazo", "var(--cv-text-main,#12233A)"], ["Próximos dias", "já agendadas", "#1F3A5C"]].map(([n, sub, cor], i) => (
                <button key={n} type="button" className="ln-filtro" onClick={() => setTf(i)} style={{ color: cor, border: tf === i ? `2px solid ${cor}` : undefined }}>
                  <b>{agenda.filter((x) => grupoT(x.quando) === i).length}</b><span>{n}</span><small>{sub}</small></button>))}
            </div>
            <div className="ln-acoes">
              <span className="ln-nota">Corretor:</span>
              <button type="button" className={`ln-pill${tk === "todos" ? " on" : ""}`} onClick={() => setTk("todos")}>Todos</button>
              {corretores.map((c) => <button key={c.id} type="button" className={`ln-pill${tk === c.id ? " on" : ""}`} onClick={() => setTk(c.id)}>{c.nome.split(" ")[0]}</button>)}
            </div>
            <div className="ln-caixa">
              {agenda.filter((x) => grupoT(x.quando) === tf && (tk === "todos" || x.quem === tk)).map((x, i) => (
                <div key={i} className="ln-linha">
                  <span style={{ flex: "0 0 130px", fontSize: 13, fontWeight: 800, color: tf === 0 ? "#B4462F" : undefined }}>{quando(x.quando)}</span>
                  <div className="ln-corpo"><b>{x.tarefa}</b><span>{x.cliente || "sem cliente"} · {x.quem === gerente ? "sua" : `de ${nomeC(x.quem)}`}</span></div>
                  <div className="ln-btns">
                    {tf === 0 && x.quem && x.quem !== gerente && x.leadId ? <button type="button" className="ln-btn p" onClick={() => cobrar([x.leadId!], nomeC(x.quem))}>Cobrar {nomeC(x.quem)}</button> : null}
                    {x.leadId ? <button type="button" className="ln-btn" onClick={() => setGaveta({ id: x.leadId! })}>Abrir o lead</button> : null}
                  </div>
                </div>))}
              {!agenda.filter((x) => grupoT(x.quando) === tf && (tk === "todos" || x.quem === tk)).length ? <p className="ln-vazio">Nada aqui.</p> : null}
            </div>
            <span className="ln-nota">Tarefas, retornos combinados ("Combinado retorno em…") e visitas agendadas da equipe, até 7 dias para frente.</span>
          </>) : null}

          {aba === "campanhas" && data ? (<>
            <div className="ln-acoes">
              <button type="button" className={`ln-pill${!comparar ? " on" : ""}`} onClick={() => setComparar(false)}>Cartões</button>
              <button type="button" className={`ln-pill${comparar ? " on" : ""}`} onClick={() => setComparar(true)}>Comparar campanhas</button>
              <button type="button" className="ln-btn p" onClick={() => setFilaForm("*")}>Gerenciar filas</button>
              <span className="ln-nota" style={{ marginLeft: "auto" }}>gasto do Facebook (Saúde dos anúncios); leads e visitas do Comandra, no período</span>
            </div>
            {comparar ? (
              <div className="ln-caixa ln-tab">
                <table>
                  <thead><tr><th>Campanha</th><th>Leads</th><th>Gasto</th><th>Custo por lead</th><th>Atendidos</th><th>Responderam</th><th>Visitas</th><th>Custo por visita</th></tr></thead>
                  <tbody>
                    {comparacao.linhas.map((c) => (
                      <tr key={c.chave}>
                        <td><b>{c.nome}</b></td>
                        <td><span className="ln-barra" style={{ width: Math.round(80 * c.chegaram / comparacao.maxL) }} /><b>{c.chegaram}</b></td>
                        <td>{brl(c.gasto)}</td>
                        <td className={c.cpl != null && c.cpl === comparacao.cpl.min ? "ln-bom" : c.cpl != null && c.cpl === comparacao.cpl.max ? "ln-ruim" : ""}>{brl(c.cpl)}</td>
                        <td>{pct(c.atendidos, c.chegaram)}</td>
                        <td>{pct(c.responderam, c.chegaram)}</td>
                        <td><b>{c.visitas}</b></td>
                        <td className={c.cpv != null && c.cpv === comparacao.cpv.min ? "ln-bom" : c.cpv != null && c.cpv === comparacao.cpv.max ? "ln-ruim" : ""}>{brl(c.cpv)}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ln-cards">
                {campanhas.map((c) => (
                  <div key={c.chave} className="ln-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <b style={{ fontSize: 15 }}>{c.nome}</b>
                      <span className="ln-tag" style={c.semFila ? { color: "#1F3A5C", background: "#E4ECF7" } : c.parados ? { color: "#8E2F1C", background: "#FBE3DD" } : { color: "#075C50", background: "#DDF3EE" }}>
                        {c.semFila && !c.parados ? "Sem fila" : c.parados ? `${c.parados} parados` : "Em dia"}</span>
                    </div>
                    <div className="ln-nums">
                      <div><b>{c.chegaram}</b><span>chegaram</span></div>
                      <div><b>{c.atendidos}</b><span>atendidos</span></div>
                      <div><b>{c.visitas}</b><span>viraram visita</span></div>
                    </div>
                    <div className="ln-vai">
                      <span><span className="ln-nota">Vai para: </span><b>{c.vai}</b></span>
                      {c.form ? <button type="button" className={`ln-btn${c.semFila ? " p" : ""}`} onClick={() => setFilaForm(c.form)}>{c.semFila ? "Criar fila" : "Trocar quem recebe"}</button> : null}
                    </div>
                  </div>))}
                {!campanhas.length ? <p className="ln-vazio">Nenhum lead no período. Formulário novo, ainda sem lead, aparece em "Gerenciar filas".</p> : null}
              </div>
            )}
          </>) : null}

          {aba === "anuncios" && gerente ? <AnunciosGerente embutido donoId={gerente} /> : null}

          {aba === "corretores" && data ? (<>
            <div className="ln-caixa ln-tab">
              <table>
                <thead><tr><th>Corretor</th><th>Recebeu</th><th>Atendeu</th><th>Parados agora</th><th>Descartou</th><th>Visitas</th><th></th></tr></thead>
                <tbody>
                  {porCorretor.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.nome}</b>{!r.roleta ? <span className="ln-nota"> · fora da roleta</span> : null}</td>
                      <td>{r.recebeu}</td>
                      <td>{pct(r.atendeu, r.recebeu)}</td>
                      <td className={r.parados >= 5 ? "ln-ruim" : ""}>{r.parados}</td>
                      <td className={r.recebeu && r.desc / r.recebeu >= 0.3 ? "ln-ruim" : ""}>{pct(r.desc, r.recebeu)}</td>
                      <td>{r.visitas}</td>
                      <td style={{ textAlign: "right" }}><button type="button" className="ln-btn" onClick={() => { setChip(`c:${r.id}`); setSel(new Set()); setAba("chegaram"); }}>Redistribuir</button></td>
                    </tr>))}
                  {!porCorretor.length ? <tr><td colSpan={7} className="ln-vazio">Nenhum corretor ativo na equipe.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <span className="ln-nota">No período escolhido. "Parados agora" = respondeu e ninguém voltou ou nunca abordado há 24h+. Redistribuir abre a lista "Chegaram" só com os leads desse corretor.</span>
          </>) : null}
        </div>
      </main>
      {filaForm ? <FilasFormulario como={como} abrir={filaForm} semCartao onFechar={() => { setFilaForm(null); recarregar(); }} /> : null}
      {gaveta ? <LeadGaveta leadId={gaveta.id} como={como} corretores={corretores} carteira={carteira} trocandoInicial={!!gaveta.trocando} onFechar={() => { setGaveta(null); recarregar(); }} /> : null}
    </div>
  );
}

