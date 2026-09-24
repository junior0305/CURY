/**
 * CorretorPainel — port fiel do mockup mockup_corretor_v2.html, ligado aos dados reais.
 * Rota de preview: /painel (não substitui /dashboard).
 * Contexto: o corretor NÃO usa mais Evolution. Sem espelho de conversa: o centro é a
 * FICHA + o REGISTRO manual do atendimento (reaproveita lead_notes). Contato com o
 * cliente pelo WhatsApp pessoal (waLink). Disparar é gated pelo admin; Pescar é shell.
 *
 * CSS: portado do mockup e ESCOPADO sob .cpv2 para não vazar no CSS global do app.
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MessageCircle, Send, Fish, Moon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsForDashboard, updateLeadStatus, setLeadNegotiating } from "@/integrations/supabase/leads";
import { fetchLeadNotes, addLeadNote, waLink } from "@/integrations/supabase/atender";
import type { Lead, LeadStatus } from "@/types/lead";
import { TIPO_TRABALHO_LABEL } from "@/types/lead";

// ── stages do funil (iguais ao Atender atual) ───────────────────────────────
const STAGES: [LeadStatus, string][] = [
  ["NEW", "Novo"], ["IN_PROGRESS", "Atend."], ["NEGOTIATING", "Negoc."],
  ["VISIT_SCHEDULED", "Visita"], ["VISITA_REALIZADA", "Veio"], ["DOCS_REQUESTED", "Docs"], ["CONCLUDED", "Venda"],
];

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const firstName = (name: string) => (name || "").trim().split(/\s+/)[0] || "cliente";
// Renda vem crua do formulário do Facebook (ex.: "r$_1.621,00_a_r$_4.700,00").
// Limpa underscores e normaliza "r$" → "R$" para exibição.
const fmtRenda = (v?: string | null) => {
  if (!v) return "—";
  return String(v).replace(/_/g, " ").replace(/r\$/gi, "R$").replace(/\s+/g, " ").trim();
};
const rendaNum = (l?: Lead | null) => {
  if (!l?.rendaDeclarada) return 0;
  const digits = String(l.rendaDeclarada).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

// ── simulador MCMV (ESTIMATIVA client-side; não é cálculo oficial da Caixa) ──
function simular(renda: number, fgts: number) {
  const faixa = renda <= 2640 ? 1 : renda <= 4400 ? 2 : 3;
  // subsídio estimado: decresce conforme a renda sobe (teto ~55k faixa 1)
  const subsidioBase = faixa === 1 ? 55000 : faixa === 2 ? 34000 : 12000;
  const subsidio = Math.max(0, Math.round((subsidioBase * (1 - Math.min(1, (renda - 1800) / 6200))) / 100) * 100);
  // parcela: comprometimento ~27% da renda, teto plausível
  const parcela = Math.max(300, Math.round((renda * 0.27) / 10) * 10);
  return { faixa, subsidio, parcela };
}

const CorretorPainel = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<"atender" | "disparar" | "pescar">("atender");
  const [filter, setFilter] = useState<"prio" | "visita" | "todos">("prio");
  const [selId, setSelId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false); // celular: lista vs ficha
  const [tool, setTool] = useState<"sim" | "doc" | "msg">("sim");
  const [noteDraft, setNoteDraft] = useState("");
  const [caixaOpen, setCaixaOpen] = useState(false);

  // ── LEADS REAIS ───────────────────────────────────────────────────────────
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["painelLeads"], queryFn: fetchLeadsForDashboard, refetchInterval: 30000, enabled: !!user,
  });

  const counts = useMemo(() => ({
    prio: leads.filter((l) => l.leadTemperature === "quente" || l.status === "NEW" || l.status === "IN_PROGRESS").length,
    visita: leads.filter((l) => l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA").length,
    todos: leads.length,
  }), [leads]);

  const rows = useMemo(() => {
    let r = leads;
    if (filter === "prio") r = leads.filter((l) => l.leadTemperature === "quente" || l.status === "NEW" || l.status === "IN_PROGRESS" || l.status === "NEGOTIATING");
    else if (filter === "visita") r = leads.filter((l) => l.status === "VISIT_SCHEDULED" || l.status === "VISITA_REALIZADA");
    return r;
  }, [leads, filter]);

  const sel = useMemo(() => leads.find((l) => l.id === selId) || rows[0] || null, [leads, rows, selId]);
  const ci = sel ? STAGES.findIndex(([k]) => k === sel.status) : -1;

  // ── REGISTRO (lead_notes reais) ─────────────────────────────────────────────
  const { data: notes = [] } = useQuery({
    queryKey: ["painelNotes", sel?.id], queryFn: () => fetchLeadNotes(sel!.id), enabled: !!sel?.id,
  });

  const saveNote = async () => {
    if (!sel || !user || !noteDraft.trim()) return;
    try {
      await addLeadNote(sel.id, user.id, noteDraft.trim());
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["painelNotes", sel.id] });
      toast.success("Registro salvo");
    } catch { toast.error("Não consegui salvar o registro"); }
  };

  const advance = async (status: LeadStatus) => {
    if (!sel) return;
    try {
      if (status === "NEGOTIATING") await setLeadNegotiating(sel.id);
      else await updateLeadStatus(sel.id, status);
      qc.invalidateQueries({ queryKey: ["painelLeads"] });
      toast.success("Status atualizado");
    } catch { toast.error("Não consegui atualizar o status"); }
  };

  // ── SIMULADOR (sliders) ─────────────────────────────────────────────────────
  const [rRenda, setRRenda] = useState(3600);
  const [rFgts, setRFgts] = useState(14000);
  useEffect(() => { if (sel) { setRRenda(rendaNum(sel) || 3600); } }, [sel?.id]); // eslint-disable-line
  const sim = simular(rRenda, rFgts);

  // ── DISPARAR: gate real (system_settings.corretor_disparo_enabled) ──────────
  const { data: dispEnabled = false } = useQuery({
    queryKey: ["corretorDisparoEnabled"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("value").eq("key", "corretor_disparo_enabled").maybeSingle();
      const v = (data as any)?.value;
      return v === true || v === "true";
    },
  });

  // ── REGIÃO: mapa campanha → região das filas (distribution_queues.match_value → region) ──
  const { data: regionByCampaign = {} } = useQuery<Record<string, string>>({
    queryKey: ["queueRegions"],
    queryFn: async () => {
      const { data } = await supabase.from("distribution_queues").select("match_value, region").not("region", "is", null);
      const m: Record<string, string> = {};
      (data || []).forEach((q: any) => { if (q.match_value && q.region) m[q.match_value] = q.region; });
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const regiaoDe = (l?: Lead | null) => (l?.fbCampaign ? regionByCampaign[l.fbCampaign] : "") || "";

  // ── ETIQUETAS (persistidas em lead_etiquetas) ───────────────────────────────
  const { data: etiquetasDB = [] } = useQuery<string[]>({
    queryKey: ["etiquetas", sel?.id],
    enabled: !!sel?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lead_etiquetas").select("etiqueta").eq("lead_id", sel!.id);
      return (data || []).map((r: any) => r.etiqueta);
    },
  });
  const hasTag = (k: string) => etiquetasDB.includes(k);
  const toggleTag = async (k: string) => {
    if (!sel) return;
    try {
      if (etiquetasDB.includes(k)) await supabase.from("lead_etiquetas").delete().eq("lead_id", sel.id).eq("etiqueta", k);
      else await supabase.from("lead_etiquetas").insert({ lead_id: sel.id, etiqueta: k, broker_id: user?.id });
      qc.invalidateQueries({ queryKey: ["etiquetas", sel.id] });
    } catch { toast.error("Não consegui salvar a etiqueta"); }
  };

  // ── DOCUMENTOS (Pasta, persistidos em lead_documentos) ──────────────────────
  const DOCS = [
    { key: "rg",       icon: "🪪", title: "RG / CNH" },
    { key: "fgts",     icon: "🏦", title: "Extrato FGTS" },
    { key: "holerite", icon: "📄", title: "Holerite" },
    { key: "endereco", icon: "🏠", title: "Comprovante de endereço" },
  ];
  const { data: docsDB = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["documentos", sel?.id],
    enabled: !!sel?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lead_documentos").select("documento, entregue").eq("lead_id", sel!.id);
      const m: Record<string, boolean> = {};
      (data || []).forEach((r: any) => { m[r.documento] = r.entregue; });
      return m;
    },
  });
  const toggleDoc = async (key: string) => {
    if (!sel) return;
    try {
      await supabase.from("lead_documentos").upsert(
        { lead_id: sel.id, documento: key, entregue: !docsDB[key], broker_id: user?.id, updated_at: new Date().toISOString() },
        { onConflict: "lead_id,documento" },
      );
      qc.invalidateQueries({ queryKey: ["documentos", sel.id] });
    } catch { toast.error("Não consegui salvar o documento"); }
  };
  const docsCount = DOCS.filter((d) => docsDB[d.key]).length;

  const facts = sel ? [
    ["Renda Informada", fmtRenda(sel.rendaDeclarada)],
    ["Tipo de Trabalho", sel.tipoTrabalho ? TIPO_TRABALHO_LABEL[sel.tipoTrabalho] : "—"],
    ["Região de Interesse", regiaoDe(sel) || "—"],
    ["Campanha / Origem", sel.fbCampaign || sel.product || sel.source || "—"],
  ] : [];

  const badgeFor = (l: Lead) => {
    if (l.status === "VISIT_SCHEDULED") return { cls: "l-badge", txt: "Visita marcada" };
    if (l.leadTemperature === "quente") return { cls: "l-badge urgent", txt: "Quente" };
    if (l.lastLeadResponseAt) return { cls: "l-badge ready", txt: "Respondeu" };
    return { cls: "l-badge urgent", txt: "Falta retorno" };
  };

  return (
    <div className="cpv2">
      <style>{CSS}</style>
      <div className="app-frame">
        {/* RAIL / BOTTOM BAR */}
        <nav className="icon-rail" aria-label="Menu principal">
          <div className="rail-logo" title="Comandra">C</div>
          <div className="rail-nav">
            <button className={`rail-item${mode === "atender" ? " active" : ""}`} onClick={() => setMode("atender")} title="Atendimento">
              {counts.prio > 0 && <span className="rail-pip">{counts.prio}</span>}
              <MessageCircle size={22} /><span>Atender</span>
            </button>
            <button className={`rail-item${mode === "disparar" ? " active" : ""}`} onClick={() => setMode("disparar")} title="Disparador oficial">
              <Send size={22} /><span>Disparar</span>
            </button>
            <button className={`rail-item${mode === "pescar" ? " active" : ""}`} onClick={() => setMode("pescar")} title="Pescar leads">
              <Fish size={22} /><span>Pescar</span>
            </button>
          </div>
          <div className="rail-footer">
            <div className="ficha-pill"><span>Fichas</span><b>{counts.todos}</b></div>
            <button className="rail-btn" onClick={() => document.documentElement.classList.toggle("dark")} title="Tema"><Moon size={19} /></button>
            <div className="rail-avatar">{initials((user as any)?.user_metadata?.name || (user as any)?.email || "Eu")}</div>
          </div>
        </nav>

        {/* ── MODO ATENDER ── */}
        {mode === "atender" && (
          <div className={`shell${mobileDetail ? " mobile-show-detail" : ""}`}>
            {/* Lista */}
            <aside className="sidebar">
              <div className="sidebar-head">
                <div className="sidebar-title-row">
                  <span className="sidebar-title">Atendimento</span>
                  <span className="roleta-tag">{counts.todos} fichas</span>
                </div>
                <div className="filter-bar">
                  <button className={`f-pill${filter === "prio" ? " on" : ""}`} onClick={() => setFilter("prio")}>Prioridade ({counts.prio})</button>
                  <button className={`f-pill${filter === "visita" ? " on" : ""}`} onClick={() => setFilter("visita")}>Visitas ({counts.visita})</button>
                  <button className={`f-pill${filter === "todos" ? " on" : ""}`} onClick={() => setFilter("todos")}>Todos ({counts.todos})</button>
                </div>
              </div>
              <div className="lead-list">
                {rows.map((l) => {
                  const b = badgeFor(l);
                  return (
                    <div key={l.id} className={`lead-row${sel?.id === l.id ? " selected" : ""}`} onClick={() => { setSelId(l.id); setMobileDetail(true); }}>
                      <div>
                        <div className="l-name">{l.name}</div>
                        <div className="l-meta">{[l.tipoTrabalho && TIPO_TRABALHO_LABEL[l.tipoTrabalho], fmtRenda(l.rendaDeclarada) !== "—" ? fmtRenda(l.rendaDeclarada) : null, regiaoDe(l) || null].filter(Boolean).join(" · ") || l.phone}</div>
                      </div>
                      <span className={b.cls}>{b.txt}</span>
                    </div>
                  );
                })}
                {!rows.length && <div style={{ padding: 40, textAlign: "center", color: "var(--faint)" }}>Nenhuma ficha aqui.</div>}
              </div>
            </aside>

            {/* Palco */}
            <main className="stage">
              <div className="stage-inner">
                {sel ? (
                  <>
                    <div className="mobile-back-bar">
                      <button className="btn-back-list" onClick={() => setMobileDetail(false)}><ArrowLeft size={15} /> Voltar para a fila</button>
                      <span className="roleta-tag">{ci >= 0 ? STAGES[ci][1] : sel.status}</span>
                    </div>

                    {/* 1. Ficha */}
                    <div className="card">
                      <div className="lead-header">
                        <div>
                          <h1 className="lead-title">{sel.name}</h1>
                          <div className="lead-sub">{sel.phone}{sel.product ? <> • <span style={{ color: "var(--accent)", fontWeight: 600 }}>{sel.product}</span></> : null}</div>
                        </div>
                        <a className="btn-primary" href={waLink(sel.phone)} target="_blank" rel="noreferrer">🟢 Chamar no WhatsApp ↗</a>
                      </div>
                      <div className="lead-facts-grid">
                        {facts.map(([k, v]) => (
                          <div className="fact-cell" key={k}><span className="fact-lbl">{k}</span><span className="fact-val">{v}</span></div>
                        ))}
                      </div>
                      <div className="pipeline">
                        {STAGES.map(([k, lbl], i) => (
                          <div key={k} className={`pipe-step${i === ci ? " current" : i < ci ? " done" : ""}`} onClick={() => advance(k)}>{lbl}</div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Registro do atendimento (substitui o espelho de conversa) */}
                    <div className="card">
                      <div className="action-prompt">
                        <span className="prompt-label">Registro do atendimento</span>
                        <span className="prompt-hint">O que você conversou com o cliente</span>
                      </div>
                      <div className="action-row">
                        <button className="act-btn" onClick={() => advance("NEGOTIATING")}><span className="act-title">🔥 Respondeu</span><span className="act-sub">Negociando</span></button>
                        <button className="act-btn" onClick={() => advance("IN_PROGRESS")}><span className="act-title">📨 Já chamei</span><span className="act-sub">Esperando ler</span></button>
                        <button className="act-btn" onClick={() => advance("VISIT_SCHEDULED")}><span className="act-title">📅 Visita</span><span className="act-sub">Agendada</span></button>
                        <button className="act-btn" onClick={() => advance("VISITA_REALIZADA")}><span className="act-title">✅ Compareceu</span><span className="act-sub">Veio à visita</span></button>
                      </div>
                      <div className="convo-log-area">
                        <div className="quick-tags">
                          <span className={`q-tag${hasTag("2dorms") ? " on" : ""}`} onClick={() => toggleTag("2dorms")}>{hasTag("2dorms") ? "✓" : "+"} Quer 2 dorms</span>
                          <span className={`q-tag${hasTag("fgts") ? " on" : ""}`} onClick={() => toggleTag("fgts")}>{hasTag("fgts") ? "✓" : "+"} Usa FGTS</span>
                          <span className={`q-tag${hasTag("renda") ? " on" : ""}`} onClick={() => toggleTag("renda")}>{hasTag("renda") ? "✓" : "+"} Compõe renda</span>
                          <span className={`q-tag${hasTag("spc") ? " on" : ""}`} onClick={() => toggleTag("spc")}>{hasTag("spc") ? "✓" : "+"} Restrição SPC</span>
                        </div>
                        <div className="note-input-row">
                          <input className="note-input" placeholder="Resumo do que conversaram…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNote()} />
                          <button className="btn-save-note" onClick={saveNote}>Salvar</button>
                        </div>
                        <div className="notes-history">
                          {notes.length ? notes.map((n) => (
                            <div className="note-line" key={n.id}>
                              <span className="note-time">{new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                              <span><b>Você:</b> {n.content}</span>
                            </div>
                          )) : <div className="note-line"><span style={{ color: "var(--faint)" }}>Nenhum registro ainda. Anote o que aconteceu para liberar o próximo lead.</span></div>}
                        </div>
                      </div>
                    </div>

                    {/* 3. Ferramentas */}
                    <div className="card">
                      <div className="tool-tabs">
                        <button className={`tool-tab${tool === "sim" ? " active" : ""}`} onClick={() => setTool("sim")}>🧮 Simulador + Projetos</button>
                        <button className={`tool-tab${tool === "doc" ? " active" : ""}`} onClick={() => setTool("doc")}>📁 Pasta ({docsCount}/{DOCS.length})</button>
                        <button className={`tool-tab${tool === "msg" ? " active" : ""}`} onClick={() => setTool("msg")}>💬 Mensagens</button>
                      </div>

                      {tool === "sim" && (
                        <div>
                          <div className="sim-grid">
                            <div className="field-box">
                              <div className="field-top"><span>Renda familiar</span><span className="field-val">{brl(rRenda)}</span></div>
                              <input type="range" min={1800} max={8000} step={100} value={rRenda} onChange={(e) => setRRenda(+e.target.value)} />
                            </div>
                            <div className="field-box">
                              <div className="field-top"><span>Saldo FGTS</span><span className="field-val">{brl(rFgts)}</span></div>
                              <input type="range" min={0} max={40000} step={1000} value={rFgts} onChange={(e) => setRFgts(+e.target.value)} />
                            </div>
                          </div>
                          <div className="kpi-strip">
                            <div><div className="kpi-label">Faixa</div><div className="kpi-num">Faixa {sim.faixa}</div></div>
                            <div><div className="kpi-label">Subsídio (est.)</div><div className="kpi-num" style={{ color: "var(--accent)" }}>{brl(sim.subsidio)}</div></div>
                            <div><div className="kpi-label">Parcela (est.)</div><div className="kpi-num">{brl(sim.parcela)}/mês</div></div>
                          </div>
                          <div className="match-title"><span>🏢 Estimativa MCMV</span><span style={{ color: "var(--faint)", fontWeight: 600 }}>não é cálculo oficial</span></div>
                          <div className="sim-actions">
                            <button className="btn-caixa" onClick={() => setCaixaOpen(true)}>📄 Ver espelho (estimativa)</button>
                            <a className="btn-primary" style={{ justifyContent: "center" }} href={sel ? waLink(sel.phone, `Simulação: renda ${brl(rRenda)}, FGTS ${brl(rFgts)} → parcela ~${brl(sim.parcela)}/mês (Faixa ${sim.faixa}).`) : "#"} target="_blank" rel="noreferrer">📲 Mandar no meu Whats</a>
                          </div>
                        </div>
                      )}

                      {tool === "doc" && (
                        <div className="docs-list">
                          {DOCS.map((d) => {
                            const ok = !!docsDB[d.key];
                            return (
                              <div className="doc-item" key={d.key} onClick={() => toggleDoc(d.key)} style={{ cursor: "pointer" }}>
                                <div className="doc-left"><span>{d.icon}</span><div><div className="doc-title">{d.title}</div><div className="doc-desc">{ok ? "Recebido ✓" : "Marcar quando receber"}</div></div></div>
                                <span className="doc-tag" style={ok ? { color: "var(--accent)", borderColor: "var(--accent)", fontWeight: 700 } : undefined}>{ok ? "✓ recebido" : "+ marcar"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {tool === "msg" && (
                        <div className="script-item">
                          <div className="script-text">"Oi {firstName(sel.name)}! Fiz sua simulação: com FGTS + subsídio de ~{brl(sim.subsidio)}, a parcela fica ~{brl(sim.parcela)}/mês. Quer que eu te mande o resumo?"</div>
                          <a className="btn-ghost" href={waLink(sel.phone, `Oi ${firstName(sel.name)}! Sua simulação: parcela ~${brl(sim.parcela)}/mês. Quer o resumo?`)} target="_blank" rel="noreferrer">Usar no Whats ↗</a>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>Selecione uma ficha na lista.</div>
                )}
              </div>
            </main>
          </div>
        )}

        {/* ── MODO DISPARAR ── */}
        {mode === "disparar" && (
          <div className="stage">
            <div className="disp-wrap">
              <div className="disp-top">
                <div>
                  <h1 className="lead-title">Disparar (API oficial Meta)</h1>
                  <p className="lead-sub">Reative leads da sua carteira pelo WhatsApp oficial com modelos Utility (R$ 0,035)</p>
                </div>
                <div className="disp-perm-bar">
                  <span className={`l-badge ${dispEnabled ? "ready" : "urgent"}`}>{dispEnabled ? "✓ Liberado pelo admin" : "🔒 Sem permissão do admin"}</span>
                </div>
              </div>

              {!dispEnabled ? (
                <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
                  <h2 className="lead-title">Disparador oficial desabilitado para seu perfil</h2>
                  <p className="lead-sub" style={{ maxWidth: 480, margin: "8px auto 18px" }}>O administrador ou seu gerente ainda não habilitou a cota de disparos via API oficial (Meta Cloud API) para a sua conta.</p>
                  <button className="btn-primary" onClick={() => toast.success("Pedido de liberação enviado ao gerente")}>🙋 Pedir liberação de cota</button>
                </div>
              ) : (
                <DisparoUnlocked />
              )}
            </div>
          </div>
        )}

        {/* ── MODO PESCAR (shell fiel; ligação real pendente) ── */}
        {mode === "pescar" && (
          <div className="stage">
            <div className="stage-inner">
              <div className="card">
                <div className="lead-header">
                  <div>
                    <span className="l-badge urgent">🎣 Bolsa de oportunidades</span>
                    <h2 className="lead-title" style={{ marginTop: 6 }}>Pescar leads frios</h2>
                    <p className="lead-sub">Leads sem atendimento recente que voltaram ao bolsão da equipe. A ligação com o pool ainda será conectada.</p>
                  </div>
                </div>
                <div className="script-list" style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
                  Em breve: escolher e puxar leads do pool para sua fila.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL "espelho" (estimativa) */}
      <AnimatePresence>
        {caixaOpen && sel && (
          <motion.div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCaixaOpen(false); }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>
            <motion.div className="caixa-sheet" initial={{ scale: reduce ? 1 : 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: reduce ? 1 : 0.96, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
              <div className="caixa-head"><div className="caixa-logo">🧮 SIMULAÇÃO (ESTIMATIVA)</div><span style={{ cursor: "pointer", fontWeight: 900 }} onClick={() => setCaixaOpen(false)}>✕</span></div>
              <div className="caixa-subbar">Pré-enquadramento MCMV — valores estimados</div>
              <div className="caixa-body">
                <div className="caixa-row"><span>Proponente:</span><b>{sel.name}</b></div>
                <div className="caixa-row"><span>Renda bruta:</span><b>{brl(rRenda)}</b></div>
                <div className="caixa-row"><span>Faixa:</span><b>Faixa {sim.faixa}</b></div>
                <div className="caixa-row"><span>Subsídio (est.):</span><b style={{ color: "#059669" }}>- {brl(sim.subsidio)}</b></div>
                <div className="caixa-row"><span>Saldo FGTS:</span><b style={{ color: "#059669" }}>- {brl(rFgts)}</b></div>
                <div className="caixa-highlight">
                  <div><div style={{ fontSize: 11, color: "#0369a1", fontWeight: 700 }}>PARCELA ESTIMADA</div><div style={{ fontSize: 19, fontWeight: 900, color: "#005ca9" }}>{brl(sim.parcela)} / mês</div></div>
                </div>
              </div>
              <div className="caixa-foot"><button className="btn-ghost" onClick={() => setCaixaOpen(false)}>Fechar</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-aba "Disparar agora" — shell fiel; o disparo real via useDisparar entra num próximo passo.
function DisparoUnlocked() {
  const [subtab, setSubtab] = useState<"go" | "conv" | "tpl">("go");
  return (
    <div>
      <div className="disp-subtabs">
        <button className={`disp-subtab${subtab === "go" ? " on" : ""}`} onClick={() => setSubtab("go")}>🚀 1 · Disparar agora</button>
        <button className={`disp-subtab${subtab === "conv" ? " on" : ""}`} onClick={() => setSubtab("conv")}>💬 2 · Quem respondeu</button>
        <button className={`disp-subtab${subtab === "tpl" ? " on" : ""}`} onClick={() => setSubtab("tpl")}>📋 3 · Modelos Utility</button>
      </div>
      {subtab === "go" && (
        <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>
          Disparo do corretor liberado. A seleção de público e o envio pela conta oficial serão conectados aqui (mesmos hooks do painel do gerente) no próximo passo.
        </div>
      )}
      {subtab === "conv" && <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>Quem respondeu ao seu disparo aparecerá aqui (janela de 24h).</div>}
      {subtab === "tpl" && <div className="card" style={{ color: "var(--muted)", fontSize: 13.5 }}>Catálogo de modelos Utility aprovados pela Meta.</div>}
    </div>
  );
}

// ── CSS portado do mockup, escopado sob .cpv2 ───────────────────────────────
const CSS = `
.cpv2{--bg:#f4f7fc;--surface:#fff;--subtle:#edf2fa;--rail-bg:#0f172a;--rail-icon:#94a3b8;--rail-active:#fff;--rail-pill:rgba(20,184,166,.22);--border:#e2e8f0;--text:#0b1b36;--text-2:#556585;--text-3:#8796b0;--muted:#556585;--faint:#8796b0;--accent:#0d9488;--accent-hover:#0f766e;--accent-soft:#f0fdfa;--accent-border:#99f6e4;--caixa-blue:#005ca9;--warn:#d97706;--warn-soft:#fffbeb;--shadow:0 1px 3px rgba(11,27,54,.04),0 8px 24px rgba(11,27,54,.05);
  position:fixed;inset:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;}
html.dark .cpv2{--bg:#080e1c;--surface:#111927;--subtle:#18212f;--rail-bg:#060a14;--border:#1e293b;--text:#e9effa;--text-2:#9fb0cc;--text-3:#6c7d9c;--muted:#9fb0cc;--faint:#6c7d9c;--accent:#14b8a6;--accent-hover:#0d9488;--accent-soft:rgba(20,184,166,.12);--accent-border:rgba(20,184,166,.3);--warn:#f59e0b;--warn-soft:rgba(245,158,11,.12);--shadow:0 4px 24px rgba(0,0,0,.35);}
.cpv2 *{box-sizing:border-box;margin:0;padding:0;}
.cpv2 button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;transition:all .15s ease;}
.cpv2 input,.cpv2 textarea{font-family:inherit;color:inherit;}
.cpv2 input[type="range"]{width:100%;accent-color:var(--accent);cursor:pointer;}
.cpv2 a{text-decoration:none;color:inherit;}
.cpv2 .app-frame{display:flex;width:100%;height:100%;overflow:hidden;}
.cpv2 .icon-rail{width:72px;background:var(--rail-bg);border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;align-items:center;padding:16px 0;flex-shrink:0;z-index:40;}
.cpv2 .rail-logo{width:40px;height:40px;border-radius:12px;background:var(--accent);color:#fff;font-weight:900;font-size:17px;display:grid;place-items:center;margin-bottom:22px;box-shadow:0 4px 14px rgba(13,148,136,.4);}
.cpv2 .rail-nav{display:flex;flex-direction:column;gap:10px;width:100%;align-items:center;}
.cpv2 .rail-item{position:relative;width:56px;padding:9px 0 7px;border-radius:12px;color:var(--rail-icon);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:600;}
.cpv2 .rail-item:hover{color:#fff;background:rgba(255,255,255,.06);}
.cpv2 .rail-item.active{color:var(--rail-active);background:var(--rail-pill);}
.cpv2 .rail-item.active::before{content:"";position:absolute;left:-8px;top:12px;bottom:12px;width:4px;border-radius:0 4px 4px 0;background:var(--accent);}
.cpv2 .rail-pip{position:absolute;top:4px;right:8px;background:var(--accent);color:#fff;font-size:10px;font-weight:800;min-width:17px;height:17px;padding:0 4px;border-radius:99px;display:grid;place-items:center;border:2px solid var(--rail-bg);}
.cpv2 .rail-footer{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:12px;}
.cpv2 .ficha-pill{display:flex;flex-direction:column;align-items:center;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.06);color:#cbd5e1;font-size:9.5px;font-weight:700;text-align:center;line-height:1.2;}
.cpv2 .ficha-pill b{color:#34d399;font-size:11px;}
.cpv2 .rail-btn{width:38px;height:38px;border-radius:10px;color:var(--rail-icon);display:grid;place-items:center;}
.cpv2 .rail-avatar{width:34px;height:34px;border-radius:50%;background:#0f766e;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;}
.cpv2 .shell{flex:1;display:grid;grid-template-columns:320px 1fr;min-width:0;height:100%;position:relative;}
.cpv2 .sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100%;min-height:0;}
.cpv2 .sidebar-head{padding:18px 18px 12px;border-bottom:1px solid var(--border);}
.cpv2 .sidebar-title-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.cpv2 .sidebar-title{font-size:17px;font-weight:800;letter-spacing:-.02em;}
.cpv2 .roleta-tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--accent-soft);color:var(--accent);}
.cpv2 .filter-bar{display:flex;gap:6px;flex-wrap:wrap;}
.cpv2 .f-pill{padding:5px 11px;border-radius:99px;font-size:12px;font-weight:600;color:var(--muted);}
.cpv2 .f-pill.on{background:var(--text);color:var(--surface);}
.cpv2 .lead-list{flex:1;overflow-y:auto;min-height:0;}
.cpv2 .lead-row{padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;}
.cpv2 .lead-row:hover{background:var(--subtle);}
.cpv2 .lead-row.selected{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent);}
.cpv2 .l-name{font-weight:600;font-size:14px;}
.cpv2 .l-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.cpv2 .l-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;background:var(--subtle);color:var(--muted);white-space:nowrap;}
.cpv2 .l-badge.urgent{background:var(--warn-soft);color:var(--warn);}
.cpv2 .l-badge.ready{background:var(--accent-soft);color:var(--accent);}
.cpv2 .stage{overflow-y:auto;padding:28px 38px;display:flex;justify-content:center;height:100%;flex:1;min-width:0;}
.cpv2 .stage-inner{width:100%;max-width:760px;display:flex;flex-direction:column;gap:18px;padding-bottom:40px;}
.cpv2 .mobile-back-bar{display:none;align-items:center;justify-content:space-between;margin-bottom:4px;}
.cpv2 .btn-back-list{font-size:13.5px;font-weight:700;color:var(--accent);display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:var(--accent-soft);}
.cpv2 .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 26px;box-shadow:var(--shadow);}
.cpv2 .lead-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
.cpv2 .lead-title{font-size:21px;font-weight:700;letter-spacing:-.02em;}
.cpv2 .lead-sub{font-size:13px;color:var(--muted);margin-top:2px;}
.cpv2 .btn-primary{padding:10px 18px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}
.cpv2 .btn-primary:hover{background:var(--accent-hover);}
.cpv2 .lead-facts-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;padding:12px 14px;background:var(--subtle);border-radius:12px;}
.cpv2 .fact-cell{display:flex;flex-direction:column;}
.cpv2 .fact-lbl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.cpv2 .fact-val{font-size:13px;font-weight:700;color:var(--text);margin-top:2px;}
.cpv2 .pipeline{display:flex;align-items:center;gap:4px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);overflow-x:auto;}
.cpv2 .pipe-step{flex:1;text-align:center;padding:6px 4px;font-size:12px;font-weight:600;color:var(--muted);border-radius:7px;cursor:pointer;white-space:nowrap;}
.cpv2 .pipe-step.done{color:var(--accent);}
.cpv2 .pipe-step.current{background:var(--accent-soft);color:var(--accent);font-weight:700;}
.cpv2 .action-prompt{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:4px;}
.cpv2 .prompt-label{font-size:13.5px;font-weight:700;}
.cpv2 .prompt-hint{font-size:12px;color:var(--muted);}
.cpv2 .action-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.cpv2 .act-btn{padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);text-align:left;}
.cpv2 .act-btn:hover,.cpv2 .act-btn.chosen{border-color:var(--accent);background:var(--accent-soft);}
.cpv2 .act-title{font-size:13px;font-weight:600;display:block;}
.cpv2 .act-sub{font-size:11px;color:var(--muted);margin-top:1px;display:block;}
.cpv2 .convo-log-area{margin-top:14px;padding-top:14px;border-top:1px solid var(--border);}
.cpv2 .quick-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.cpv2 .q-tag{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:99px;border:1px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;}
.cpv2 .q-tag.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);}
.cpv2 .note-input-row{display:flex;gap:8px;}
.cpv2 .note-input{flex:1;height:38px;padding:0 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg);font-size:13px;outline:none;}
.cpv2 .btn-save-note{padding:0 16px;border-radius:9px;background:var(--text);color:var(--surface);font-size:12.5px;font-weight:600;}
.cpv2 .notes-history{margin-top:10px;display:flex;flex-direction:column;gap:6px;}
.cpv2 .note-line{font-size:12.5px;color:var(--muted);display:flex;gap:8px;align-items:baseline;}
.cpv2 .note-time{font-size:11px;font-weight:600;color:var(--faint);min-width:88px;font-variant-numeric:tabular-nums;}
.cpv2 .tool-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);padding-bottom:14px;margin-bottom:18px;overflow-x:auto;}
.cpv2 .tool-tab{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;}
.cpv2 .tool-tab.active{background:var(--text);color:var(--surface);}
.cpv2 .sim-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.cpv2 .field-box{display:flex;flex-direction:column;gap:6px;}
.cpv2 .field-top{display:flex;justify-content:space-between;font-size:13px;}
.cpv2 .field-val{font-weight:700;color:var(--accent);}
.cpv2 .kpi-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;padding:14px;border-radius:12px;background:var(--subtle);text-align:center;}
.cpv2 .kpi-label{font-size:10.5px;color:var(--muted);text-transform:uppercase;}
.cpv2 .kpi-num{font-size:16px;font-weight:700;margin-top:2px;}
.cpv2 .match-title{font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--muted);margin:16px 0 10px;display:flex;justify-content:space-between;}
.cpv2 .sim-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.cpv2 .btn-caixa{padding:11px 14px;border-radius:10px;background:var(--caixa-blue);color:#fff;font-weight:600;font-size:12.5px;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;}
.cpv2 .docs-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.cpv2 .doc-item{padding:14px 16px;border-radius:11px;border:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:space-between;cursor:pointer;}
.cpv2 .doc-item.done{background:var(--accent-soft);border-color:var(--accent-border);}
.cpv2 .doc-left{display:flex;align-items:center;gap:12px;}
.cpv2 .doc-title{font-weight:600;font-size:13.5px;}
.cpv2 .doc-desc{font-size:12px;color:var(--muted);}
.cpv2 .doc-tag{font-size:11.5px;font-weight:600;color:var(--accent);}
.cpv2 .script-item{padding:16px;border-radius:12px;border:1px solid var(--border);background:var(--bg);display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px;}
.cpv2 .script-text{font-size:13px;color:var(--muted);}
.cpv2 .btn-ghost{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-weight:600;font-size:12.5px;white-space:nowrap;}
.cpv2 .disp-wrap{max-width:1040px;margin:0 auto;width:100%;}
.cpv2 .disp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
.cpv2 .disp-perm-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);padding:8px 14px;border-radius:12px;font-size:12px;}
.cpv2 .disp-subtabs{display:inline-flex;gap:6px;padding:5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:18px;flex-wrap:wrap;}
.cpv2 .disp-subtab{padding:8px 14px;border-radius:8px;background:transparent;font-size:12.5px;font-weight:700;color:var(--text-2);display:flex;align-items:center;gap:6px;}
.cpv2 .disp-subtab.on{background:var(--text);color:var(--surface);}
.cpv2 .modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;z-index:600;padding:20px;}
.cpv2 .caixa-sheet{width:100%;max-width:540px;background:#fff;color:#0f172a;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);}
.cpv2 .caixa-head{background:linear-gradient(90deg,#005ca9,#0073d1);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;}
.cpv2 .caixa-logo{font-weight:900;font-size:15px;}
.cpv2 .caixa-subbar{background:#f39200;color:#fff;font-size:11px;font-weight:700;padding:5px 22px;text-transform:uppercase;}
.cpv2 .caixa-body{padding:20px 22px;font-size:13px;}
.cpv2 .caixa-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;}
.cpv2 .caixa-highlight{margin-top:14px;padding:14px;border-radius:10px;background:#f0f9ff;border:1px solid #bae6fd;display:flex;justify-content:space-between;align-items:center;}
.cpv2 .caixa-foot{padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;}
@media (max-width:820px){
  .cpv2 .app-frame{flex-direction:column-reverse;}
  .cpv2 .icon-rail{width:100%;height:64px;flex-direction:row;justify-content:space-around;padding:0 10px;border-right:none;border-top:1px solid rgba(255,255,255,.1);}
  .cpv2 .rail-logo,.cpv2 .ficha-pill,.cpv2 .rail-avatar{display:none;}
  .cpv2 .rail-nav{flex-direction:row;justify-content:space-around;width:auto;flex:1;}
  .cpv2 .rail-footer{margin-top:0;flex-direction:row;}
  .cpv2 .rail-item.active::before{display:none;}
  .cpv2 .shell{grid-template-columns:1fr;height:100%;}
  .cpv2 .stage{padding:16px 14px;}
  .cpv2 .card{padding:16px;}
  .cpv2 .lead-header{flex-direction:column;align-items:stretch;gap:12px;}
  .cpv2 .btn-primary{justify-content:center;width:100%;}
  .cpv2 .lead-facts-grid{grid-template-columns:1fr 1fr;}
  .cpv2 .action-row{grid-template-columns:1fr 1fr;}
  .cpv2 .sim-grid,.cpv2 .docs-list,.cpv2 .sim-actions{grid-template-columns:1fr;}
  .cpv2 .script-item{flex-direction:column;align-items:stretch;}
  .cpv2 .mobile-back-bar{display:flex;}
  .cpv2 .shell.mobile-show-detail .sidebar{display:none;}
  .cpv2 .shell:not(.mobile-show-detail) .stage{display:none;}
}
`;

export default CorretorPainel;
