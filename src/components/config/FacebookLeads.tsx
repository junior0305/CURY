/* Configurar → "Facebook e leads" (28/10, protótipo aprovado pelo Junior: https://claude.ai/artifact/1qWP1T9mz8t84NuzPyrPN5).
 *
 * Três passos: ① páginas (ligada ou não — página não ligada não recebe lead), ② para onde vai cada formulário
 * (roleta da equipe / corretores escolhidos / eu mesmo), ③ conferência Facebook × Comandra.
 * Tudo vem de UMA RPC, facebook_painel, já filtrada pela estrutura de quem olha: ninguém vê nem mexe em página
 * ou formulário de outra estrutura (caso Datti 28/10). Salvar = RPC ligar_formulario, que também aplica a trava:
 * só pessoas da estrutura do dono do formulário podem receber. Diretor/admin aponta o dono de página sem dono.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const sb = supabase as any;
type Pessoa = { id: string; nome: string; presente?: boolean };
type Equipe = { id: string; nome: string; corretores: Pessoa[] };
type Destino = { modo: "roleta" | "eu" | "escolhidos" | "pagina"; equipe?: string | null; equipe_nome?: string | null; pessoas?: Pessoa[] } | null;
type Pagina = { page_id: string; nome: string; dono: string | null; dono_nome: string | null; equipe_dono: string; ligada: boolean;
  ultimo_lead: string | null; conf: { fb: number; cm: number; faltam: number; em: string } | null;
  acesso: { status: "ok" | "bloqueado" | "erro" | null; msg: string | null; em: string | null } | null; business_id: string | null };
type Form = { form_id: string; page_id: string | null; nome: string; dono: string | null; dono_nome: string | null; ativo: boolean;
  leads_7d: number; cm_7d: number; esperando: number; destino: Destino; recrutamento: boolean };
type Painel = { eu: { id: string; role: string; nome: string }; paginas: Pagina[]; formularios: Form[]; equipes: Equipe[];
  pessoas_dono: { id: string; nome: string; role: string }[] };
type Rascunho = { modo: "roleta" | "escolhidos" | "eu"; equipe: string; pessoas: string[] };

const CSS = `.fbl{display:grid;gap:22px;color:var(--ink)}
.fbl h3{margin:0;font-size:16.5px}.fbl .sub{margin:2px 0 0;color:var(--ink-3,#64748b);font-size:13px}
.fbl-guard{display:flex;gap:10px;background:var(--sunk);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13.5px}
.fbl-step{display:grid;gap:10px}.fbl-sh{display:flex;gap:10px;align-items:center}
.fbl-n{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--card);display:grid;place-items:center;font-weight:800;font-size:13px;flex:none}
.fbl-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.fbl-pg{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:8px;align-content:start}
.fbl-pg b{font-size:14.5px}.fbl-pg i{font-style:normal;font-size:12.5px;color:var(--ink-3,#64748b)}
.fbl-chip{display:inline-flex;gap:6px;align-items:center;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:99px;width:fit-content}
.fbl-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.fbl-chip.ok{background:color-mix(in srgb,#16a34a 14%,var(--card));color:#15803d}
.fbl-chip.bad{background:color-mix(in srgb,#dc2626 12%,var(--card));color:#b91c1c}
.fbl-chip.warn{background:color-mix(in srgb,#d97706 14%,var(--card));color:#b45309}
.fbl-btn{font:inherit;font-size:13.5px;font-weight:700;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.fbl-btn.fb{background:#1877f2;border-color:#1877f2;color:#fff}.fbl-btn.pri{background:var(--blue,#0d9488);border-color:var(--blue,#0d9488);color:#fff}
.fbl-btn:disabled{opacity:.5;cursor:default}
.fbl-tabs{display:flex;gap:6px;flex-wrap:wrap}
.fbl-tab{font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink-2,#475569);cursor:pointer}
.fbl-tab.on{background:var(--ink);border-color:var(--ink);color:var(--card)}
.fbl-fm{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:grid;gap:10px}
.fbl-fm.alerta{box-shadow:inset 3px 0 0 #d97706}
.fbl-fm b{font-size:14.5px}.fbl-fm i{font-style:normal;font-size:12.5px;color:var(--ink-3,#64748b)}
.fbl-now{font-size:12.5px;background:var(--sunk);border-radius:8px;padding:6px 10px;color:var(--ink-2,#475569)}
.fbl-now.wait{background:color-mix(in srgb,#d97706 12%,var(--card));color:#b45309;font-weight:700}
.fbl-opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fbl-opt{border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;display:grid;gap:4px;align-content:start;background:var(--card);text-align:left;font:inherit;color:inherit}
.fbl-opt.on{border-color:var(--blue,#0d9488);background:color-mix(in srgb,var(--blue,#0d9488) 10%,var(--card))}
.fbl-opt .t{font-weight:700}.fbl-opt .d{font-size:12.5px;color:var(--ink-3,#64748b)}
.fbl-sel{font:inherit;font-size:13.5px;padding:7px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);width:100%}
.fbl-people{display:flex;flex-wrap:wrap;gap:6px}
.fbl-pp{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink-2,#475569);cursor:pointer}
.fbl-pp.on{background:var(--blue,#0d9488);border-color:var(--blue,#0d9488);color:#fff}
.fbl-pp.off{opacity:.55}
.fbl-foot{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px}
.fbl-tab-c{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}
.fbl table{border-collapse:collapse;width:100%;min-width:520px;font-size:13.5px}
.fbl th,.fbl td{text-align:left;padding:9px 14px;border-bottom:1px solid var(--line)}
.fbl th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3,#64748b)}
.fbl tr:last-child td{border-bottom:0}.fbl td.n{text-align:right;font-variant-numeric:tabular-nums}
.fbl details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.fbl summary{cursor:pointer;font-weight:700;color:var(--ink-2,#475569)}
@media (max-width:760px){.fbl-opts{grid-template-columns:1fr}}`;

const descreve = (d: Destino) => {
  if (!d) return null;
  if (d.modo === "roleta") return <>Vai para a <b>roleta da equipe {d.equipe_nome ?? "?"}</b>, para quem bateu ponto no plantão</>;
  if (d.modo === "pagina") return <>Vai para a <b>roleta da equipe {d.equipe_nome ?? "?"}</b> (regra da página)</>;
  if (d.modo === "eu") return <>Vai para <b>{d.pessoas?.[0]?.nome ?? "uma pessoa"}</b></>;
  return <>Vai só para <b>{(d.pessoas ?? []).map((p) => p.nome).join(", ")}</b>, mesmo fora do plantão</>;
};

export default function FacebookLeads({ como, avancado }: { como?: string | null; avancado?: React.ReactNode }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"decidir" | "todos" | "parados">("decidir");
  const [rasc, setRasc] = useState<Record<string, Rascunho>>({});
  const [todaPagina, setTodaPagina] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [donoPg, setDonoPg] = useState<Record<string, string>>({});
  const [testando, setTestando] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["facebook-painel", como ?? session?.user?.id], enabled: !!session,
    queryFn: async () => {
      const { data, error } = await sb.rpc("facebook_painel", { p_como: como || null });
      if (error) throw error;
      return data as Painel;
    },
  });

  const forms = data?.formularios ?? [];
  const semDestino = (f: Form) => !f.destino;
  const lista = useMemo(() => forms.filter((f) =>
    filtro === "decidir" ? semDestino(f) && (f.ativo || f.leads_7d > 0 || f.esperando > 0)
    : filtro === "parados" ? !f.ativo && f.leads_7d === 0 : f.ativo || f.leads_7d > 0), [forms, filtro]);
  const n = {
    decidir: forms.filter((f) => semDestino(f) && (f.ativo || f.leads_7d > 0 || f.esperando > 0)).length,
    todos: forms.filter((f) => f.ativo || f.leads_7d > 0).length,
    parados: forms.filter((f) => !f.ativo && f.leads_7d === 0).length,
  };

  if (isLoading) return <p className="cfg-dica">Carregando…</p>;
  if (error || !data) return <p className="cfg-dica">Não consegui carregar agora. Recarregue a página.</p>;

  const eu = data.eu;
  const ehDiretoria = eu.role === "ADMIN" || eu.role === "DIRECTOR";
  const pagina = (id: string | null) => data.paginas.find((p) => p.page_id === id);
  const todasPessoas = data.equipes.flatMap((e) => e.corretores.map((c) => ({ ...c, equipe: e.nome })));

  const rascunhoDe = (f: Form): Rascunho => rasc[f.form_id] ?? {
    modo: f.destino?.modo === "eu" ? "eu" : f.destino?.modo === "escolhidos" ? "escolhidos" : f.recrutamento && !f.destino ? "eu" : "roleta",
    equipe: f.destino?.equipe ?? "",
    pessoas: f.destino?.modo === "escolhidos" ? (f.destino.pessoas ?? []).map((p) => p.id) : [],
  };
  const muda = (f: Form, r: Partial<Rascunho>) => setRasc((s) => ({ ...s, [f.form_id]: { ...rascunhoDe(f), ...r } }));

  const conectar = () => {
    const uid = como || session?.user?.id || "";
    // volta para esta mesma tela depois do login do Facebook
    const aqui = window.location.pathname + window.location.search;
    window.location.href = `${window.location.origin}/supabase/functions/v1/fb-connect-callback?mode=start&state=${encodeURIComponent(uid + "|" + aqui)}`;
  };

  const salvar = async (f: Form) => {
    const r = rascunhoDe(f);
    if (r.modo === "roleta" && !r.equipe) { toast.error("Escolha a equipe da roleta."); return; }
    if (r.modo === "escolhidos" && !r.pessoas.length) { toast.error("Marque pelo menos um corretor."); return; }
    const alvos = todaPagina[f.form_id] ? forms.filter((x) => x.page_id === f.page_id && (x.ativo || x.leads_7d > 0)) : [f];
    setSalvando(f.form_id);
    let entregues = 0;
    try {
      for (const x of alvos) {
        const modo = r.modo === "roleta" ? (r.equipe === "todas" ? "todas" : "equipe") : r.modo;
        const { data: nEnt, error } = await sb.rpc("ligar_formulario", {
          p_form: x.form_id, p_modo: modo, p_destino: modo === "equipe" ? r.equipe : null, p_como: como || null,
          p_corretores: r.modo === "escolhidos" ? r.pessoas : null,
        });
        if (error) throw error;
        entregues += Number(nEnt) || 0;
      }
      toast.success(`Salvo${alvos.length > 1 ? ` em ${alvos.length} formulários` : ""}.${entregues ? ` ${entregues} lead(s) que esperavam já foram entregues.` : ""}`);
      setRasc((s) => { const c = { ...s }; alvos.forEach((x) => delete c[x.form_id]); return c; });
      qc.invalidateQueries({ queryKey: ["facebook-painel"] });
      qc.invalidateQueries({ queryKey: ["formularios-sem-dono"] });
      qc.invalidateQueries({ queryKey: ["filas-formulario"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui salvar."); }
    finally { setSalvando(null); }
  };

  const testar = async (page: string) => {
    setTestando(page);
    try {
      const r = await fetch(`${window.location.origin}/supabase/functions/v1/fb-connect-callback`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "testar", page_id: page }) }).then((x) => x.json());
      if (r?.status === "ok") toast.success("Liberado. O Comandra já consegue ler os leads desta página.");
      else if (r?.status === "bloqueado") toast.error("Ainda bloqueado. Confira se o CRM Comandra Leads foi marcado no Acesso a leads desta página.");
      else toast.error(r?.msg || "Não consegui testar agora.");
      qc.invalidateQueries({ queryKey: ["facebook-painel"] });
    } catch { toast.error("Não consegui testar agora."); }
    finally { setTestando(null); }
  };

  const definirDono = async (page: string) => {
    const dono = donoPg[page];
    if (!dono) { toast.error("Escolha o dono da página."); return; }
    const { error } = await sb.rpc("definir_dono_pagina", { p_page: page, p_dono: dono });
    if (error) { toast.error(error.details || error.message); return; }
    toast.success("Dono definido. Os leads desta página agora só podem ir para a estrutura dele.");
    qc.invalidateQueries({ queryKey: ["facebook-painel"] });
  };

  return (
    <div className="fbl"><style>{CSS}</style>
      <div className="fbl-guard" role="note"><span aria-hidden="true">🔒</span><div><b>Seus leads não saem da sua estrutura.</b> O lead de uma página só pode ir para pessoas da
        estrutura dona da página — nunca para outro gerente, nunca para outra empresa. Se alguém tentar, o Comandra segura o lead e registra.</div></div>

      {/* ① páginas */}
      <section className="fbl-step">
        <div className="fbl-sh"><span className="fbl-n">1</span><div><h3>Suas páginas</h3>
          <p className="sub">Só chega lead de página ligada. Ligar leva 1 minuto: você entra com o Facebook e marca a página.</p></div></div>
        <div className="fbl-pages">
          {data.paginas.map((p) => (
            <div className="fbl-pg" key={p.page_id}>
              <div><b>{p.nome}</b><i style={{ display: "block" }}>{p.dono_nome ? `Dono: ${p.dono_nome}` : "Sem dono definido"}</i></div>
              {p.ligada && p.acesso?.status === "bloqueado" ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <span className="fbl-chip warn">Ligada, mas o Facebook não libera os leads</span>
                  <i style={{ color: "var(--ink)" }}>Falta liberar o Comandra no <b>Acesso a leads</b> desta página:</i>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, display: "grid", gap: 2 }}>
                    <li>Abra o Acesso a leads (botão abaixo) no negócio dono desta página.</li>
                    <li>Escolha <b>{p.nome}</b> na lista de páginas.</li>
                    <li>Na aba <b>CRMs</b>, clique em <b>Atribuir CRMs</b> e marque <b>CRM Comandra Leads</b>.</li>
                    <li>Volte aqui e toque em <b>Testar de novo</b>.</li>
                  </ol>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="fbl-btn fb" style={{ textDecoration: "none" }} target="_blank" rel="noreferrer"
                      href={`https://business.facebook.com/settings/leads-accesses${p.business_id ? `?business_id=${p.business_id}` : ""}`}>Abrir Acesso a leads</a>
                    <button className="fbl-btn" disabled={testando === p.page_id} onClick={() => testar(p.page_id)}>{testando === p.page_id ? "Testando…" : "Testar de novo"}</button>
                  </div>
                </div>)
              : p.ligada ? <><span className="fbl-chip ok">Ligada: recebendo direto do Facebook</span>
                  {p.acesso?.status === "erro" ? <i>Último teste com erro: {p.acesso.msg} <button className="fbl-btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => testar(p.page_id)}>Testar de novo</button></i> : null}</>
                : <><span className="fbl-chip bad">Não ligada: os leads desta página não chegam</span>
                    <button className="fbl-btn fb" onClick={conectar}>Ligar com o Facebook</button></>}
              {p.dono ? <i>🔒 Leads só para {p.equipe_dono ? `a estrutura de ${p.dono_nome} (${p.equipe_dono})` : `a estrutura de ${p.dono_nome}`}</i>
                : ehDiretoria ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="fbl-chip warn">Sem dono: a trava não protege esta página</span>
                    <select className="fbl-sel" value={donoPg[p.page_id] ?? ""} onChange={(e) => setDonoPg((s) => ({ ...s, [p.page_id]: e.target.value }))} aria-label={`Dono de ${p.nome}`}>
                      <option value="" disabled>Quem é o dono?</option>
                      {data.pessoas_dono.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.role === "MANAGER" ? "gerente" : x.role === "SUPERINTENDENT" ? "super" : "diretor"})</option>)}
                    </select>
                    <button className="fbl-btn" onClick={() => definirDono(p.page_id)}>Definir dono</button>
                  </div>) : <i>Sem dono definido: peça ao diretor para apontar.</i>}
            </div>
          ))}
          <button className="fbl-btn" style={{ borderStyle: "dashed", minHeight: 96 }} onClick={conectar}>+ Ligar outra página</button>
        </div>
      </section>

      {/* ② formulários */}
      <section className="fbl-step">
        <div className="fbl-sh"><span className="fbl-n">2</span><div><h3>Para onde vai cada formulário</h3>
          <p className="sub">Escolha uma vez. Os próximos leads daquele formulário já caem certos.</p></div></div>
        <div className="fbl-tabs" role="tablist">
          {([["decidir", "Para decidir"], ["todos", "Todos os ativos"], ["parados", "Sem anúncio rodando"]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={filtro === k} className={`fbl-tab${filtro === k ? " on" : ""}`} onClick={() => setFiltro(k)}>{t} ({n[k]})</button>
          ))}
        </div>
        {!lista.length ? <div className="fbl-now">{filtro === "decidir" ? "Tudo decidido. Quando um formulário novo começar a receber lead sem dono, ele aparece aqui." : "Nenhum formulário aqui."}</div> : null}
        {lista.map((f) => {
          const r = rascunhoDe(f), p = pagina(f.page_id);
          return (
            <article key={f.form_id} className={`fbl-fm${!f.destino ? " alerta" : ""}`}>
              <div><b>{f.nome}</b><i style={{ display: "block" }}>{p?.nome ?? "Página ?"} · {f.leads_7d} leads em 7 dias{f.recrutamento ? " · candidatos a corretor, não são clientes" : ""}</i></div>
              <div className={`fbl-now${!f.destino ? " wait" : ""}`}>
                {f.destino ? descreve(f.destino) : f.esperando ? `Sem dono · ${f.esperando} lead(s) esperando você decidir` : "Sem dono"}
              </div>
              <div className="fbl-opts" role="radiogroup" aria-label={`Para onde vai ${f.nome}`}>
                <div className={`fbl-opt${r.modo === "roleta" ? " on" : ""}`} role="radio" aria-checked={r.modo === "roleta"} tabIndex={0}
                  onClick={() => muda(f, { modo: "roleta" })} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") muda(f, { modo: "roleta" }); }}>
                  <span className="t">🎡 Roleta da equipe</span><span className="d">Revezando entre quem bateu ponto no plantão</span>
                  {r.modo === "roleta" ? (
                    <select className="fbl-sel" value={r.equipe} onClick={(e) => e.stopPropagation()} onChange={(e) => muda(f, { equipe: e.target.value })} aria-label="Equipe">
                      <option value="" disabled>Escolha a equipe…</option>
                      {data.equipes.map((e) => <option key={e.id} value={e.id}>Equipe {e.nome} ({e.corretores.filter((c) => c.presente).length} no plantão)</option>)}
                      {eu.role !== "MANAGER" && eu.role !== "BROKER" ? <option value="todas">Todas as minhas equipes</option> : null}
                    </select>) : null}
                </div>
                <div className={`fbl-opt${r.modo === "escolhidos" ? " on" : ""}`} role="radio" aria-checked={r.modo === "escolhidos"} tabIndex={0}
                  onClick={() => muda(f, { modo: "escolhidos" })} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") muda(f, { modo: "escolhidos" }); }}>
                  <span className="t">👥 Corretores escolhidos</span><span className="d">Só quem você marcar, mesmo fora do plantão</span>
                  {r.modo === "escolhidos" ? (
                    <div className="fbl-people" onClick={(e) => e.stopPropagation()}>
                      {todasPessoas.map((c) => (
                        <button key={c.id} type="button" title={`Equipe ${c.equipe}${c.presente ? "" : " · fora do plantão"}`}
                          className={`fbl-pp${r.pessoas.includes(c.id) ? " on" : ""}${c.presente ? "" : " off"}`}
                          onClick={() => muda(f, { pessoas: r.pessoas.includes(c.id) ? r.pessoas.filter((x) => x !== c.id) : [...r.pessoas, c.id] })}>{c.nome}</button>
                      ))}
                    </div>) : null}
                </div>
                <div className={`fbl-opt${r.modo === "eu" ? " on" : ""}`} role="radio" aria-checked={r.modo === "eu"} tabIndex={0}
                  onClick={() => muda(f, { modo: "eu" })} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") muda(f, { modo: "eu" }); }}>
                  <span className="t">🙋 Eu mesmo atendo</span><span className="d">{f.recrutamento ? "Bom para recrutamento" : "Os leads ficam com você"}</span>
                </div>
              </div>
              <div className="fbl-foot">
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!todaPagina[f.form_id]} onChange={(e) => setTodaPagina((s) => ({ ...s, [f.form_id]: e.target.checked }))} />
                  Usar a mesma escolha para todos da {p?.nome ?? "página"}
                </label>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {f.esperando ? <i>Ao salvar, os {f.esperando} que estão esperando vão na hora</i> : null}
                  <button className="fbl-btn pri" disabled={salvando === f.form_id} onClick={() => salvar(f)}>{salvando === f.form_id ? "Salvando…" : "Salvar"}</button>
                </span>
              </div>
            </article>
          );
        })}
      </section>

      {/* ③ conferência */}
      <section className="fbl-step">
        <div className="fbl-sh"><span className="fbl-n">3</span><div><h3>Está chegando tudo?</h3>
          <p className="sub">O que o Facebook registrou × o que entrou no Comandra nos últimos 7 dias. O que faltar, o Comandra busca sozinho de hora em hora.</p></div></div>
        <div className="fbl-tab-c"><table>
          <thead><tr><th>Página</th><th style={{ textAlign: "right" }}>No Facebook</th><th style={{ textAlign: "right" }}>No Comandra</th><th>Situação</th></tr></thead>
          <tbody>
            {data.paginas.map((p) => (
              <tr key={p.page_id}><td>{p.nome}</td>
                <td className="n">{p.conf ? p.conf.fb : "—"}</td><td className="n">{p.conf ? p.conf.cm : "—"}</td>
                <td>{!p.ligada ? <span className="fbl-chip bad">Ligue a página para conferir</span>
                  : !p.conf ? <span className="fbl-chip warn">Conferindo…</span>
                  : p.conf.faltam > 0 ? <span className="fbl-chip warn">Faltam {p.conf.faltam}: buscando</span>
                  : <span className="fbl-chip ok">Tudo chegou</span>}</td></tr>
            ))}
          </tbody>
        </table></div>
      </section>

      {avancado ? <details><summary>Avançado</summary><div style={{ marginTop: 12, display: "grid", gap: 16 }}>{avancado}</div></details> : null}
    </div>
  );
}
