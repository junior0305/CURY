// Central de Leads & Performance — repaginada no design do mockup V4 (https... artifact; Junior 15/11).
// Casca no padrão do Cockpit: paleta escuro/claro do mockup (Archivo + JetBrains Mono), "Sussurro da Comandra"
// (radar do gestor) no lugar do diagnóstico de 1 linha, e abas bonitas. As 4 abas reaproveitam o que já existe
// (FunilV4 / CampanhasV4 / TodosLeadsV4 / TarefasV4). Tudo escopado em .lx; os tokens cv-* são mapeados para a
// paleta do mockup aqui, então os sub-componentes também seguem o tema. Nada estimado — radar sobre dado real.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { atendido, ehTeste } from "@/lib/situacaoLead";
import { COLS_LEAD, type LeadN } from "@/components/leads2/comum";
import FunilV4 from "@/components/manager-v10/FunilV4";
import TodosLeadsV4 from "@/components/leads/TodosLeadsV4";
import TarefasV4 from "@/components/manager-v10/TarefasV4";
import CampanhasV4 from "@/components/manager-v10/CampanhasV4";
import FilasV4 from "@/components/manager-v10/FilasV4";
import PaginasAtivar from "@/components/leads/PaginasAtivar";

const sb = supabase as any;
type Aba = "funil" | "campanhas" | "filas" | "leads" | "tarefas";
type Canal = "todos" | "urgencia" | "oportunidade" | "trafego";
const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0);
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 2 });

export default function LeadsCentral() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const gerente = useEffectiveManagerId() ?? session?.user?.id ?? "";
  const como = gerente !== session?.user?.id ? gerente : undefined;
  const [aba, setAba] = useState<Aba>("funil");
  const [canal, setCanal] = useState<Canal>("todos");
  loadFonts();

  const { data } = useQuery({
    queryKey: ["lc-diag", gerente],
    enabled: !!gerente,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const desde90 = new Date(Date.now() - 90 * 864e5).toISOString();
      const [ativosR, csR, saudeR, formsR] = await Promise.all([
        sb.from("leads").select(COLS_LEAD).eq("manager_id", gerente)
          .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED,LOST)").gte("created_at", desde90),
        sb.from("profiles").select("id,first_name,last_name").eq("manager_id", gerente).eq("role", "BROKER").eq("is_active", true),
        sb.from("fb_saude").select("dados").eq("dono_id", gerente),
        sb.from("formularios_catalogo").select("form_id").eq("owner_id", gerente),
      ]);
      const ativos = ((ativosR.data ?? []) as LeadN[]).filter((l) => !ehTeste(l));
      const nome = new Map(((csR.data ?? []) as any[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—"]));
      const campanhas = ((saudeR.data ?? []) as any[]).flatMap((s) => s.dados?.campanhas ?? []).filter((c: any) => c.status === "ACTIVE");
      const ids = [...((csR.data ?? []) as any[]).map((p) => p.id), gerente];
      const tarefas = (await sb.from("tasks").select("id,title,due_at,status,user_id,lead_id").in("user_id", ids)
        .eq("status", "OPEN").lte("due_at", new Date(Date.now() + 7 * 864e5).toISOString()).order("due_at").limit(300)).data ?? [];
      return { ativos, nome, campanhas, forms: (formsR.data ?? []).length, tarefas: tarefas as any[] };
    },
  });

  const diag = useMemo(() => {
    const ativos = data?.ativos ?? [];
    const total = ativos.length;
    const semToque = ativos.filter((l) => !atendido(l));
    const comContato = total - semToque.length;
    const parados30 = semToque.filter((l) => dias(l.created_at) >= 30).length;
    const pctSla = total ? Math.round((comContato / total) * 100) : 0;
    const porBroker = new Map<string, number>();
    for (const l of semToque) if (l.broker_id) porBroker.set(l.broker_id, (porBroker.get(l.broker_id) ?? 0) + 1);
    const pior = [...porBroker.entries()].sort((a, b) => b[1] - a[1])[0];
    const piorNome = pior ? (data?.nome.get(pior[0])?.split(" ")[0] ?? "um corretor") : null;
    // campanhas: menor e maior CPL (dado real do fb_saude)
    const camps = (data?.campanhas ?? []).map((c: any) => {
      const gasto = Number(c.gasto || 0), leads = Number(c.leads || 0);
      return { nome: String(c.nome || "campanha"), gasto, leads, cpl: leads > 0 ? gasto / leads : null };
    }).filter((c) => c.cpl != null && c.gasto > 0) as { nome: string; gasto: number; leads: number; cpl: number }[];
    const ord = [...camps].sort((a, b) => a.cpl - b.cpl);
    return {
      total, semToque: semToque.length, parados30, pctSla,
      piorNome, piorN: pior?.[1] ?? 0, nAtivas: (data?.campanhas ?? []).length,
      melhor: ord[0] ?? null, pior: ord.length > 1 ? ord[ord.length - 1] : null,
    };
  }, [data]);

  // quais avisos existem (só mostra o que tem dado real)
  const temU = diag.total > 0 && (diag.semToque > 0 || diag.parados30 > 0);
  const temO = !!diag.melhor;
  const temT = !!diag.pior;
  const nAvisos = [temU, temO, temT].filter(Boolean).length;
  const mostra = (c: Canal) => canal === "todos" || canal === c;

  return (
    <div className={`mgr10 app2 lx ${mode === "light" ? "lx-light" : "lx-dark"}`}>
      <style>{CSS}</style>
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <main className="shell2 lx-main">
        <header className="lx-top">
          <div>
            <h1>Central de Leads &amp; Performance</h1>
            <p>Decida primeiro, depois a lista. Números em tempo real, do Comandra e do Facebook.</p>
          </div>
          <div className="lx-top-dir"><SeletorPeriodo /></div>
        </header>

        {/* ── O SUSSURRO DA COMANDRA (radar do gestor) ── */}
        {nAvisos > 0 && (
          <section className="lx-suss">
            <div className="lx-suss-top">
              <div className="lx-suss-badge"><span className="lx-pulse" /> 🎙️ O Sussurro da Comandra · Radar do gestor</div>
              <div className="lx-suss-chan">
                {([["todos", `Todos (${nAvisos})`], ["urgencia", "🚨 Urgência"], ["oportunidade", "💰 Dinheiro na mesa"], ["trafego", "🎯 Tráfego"]] as [Canal, string][])
                  .filter(([c]) => c === "todos" || (c === "urgencia" && temU) || (c === "oportunidade" && temO) || (c === "trafego" && temT))
                  .map(([c, lb]) => (
                    <button key={c} className={`lx-chan${canal === c ? " on" : ""}`} onClick={() => setCanal(c)}>{lb}</button>
                  ))}
              </div>
            </div>
            <div className="lx-suss-grid">
              {temU && mostra("urgencia") && (
                <article className="lx-s-item urg">
                  <div className="lx-s-tag rose">🚨 Urgência &amp; leads fora do radar</div>
                  <div className="lx-s-tx">
                    {diag.piorNome && diag.piorN > 0 ? <>O corretor <b>{diag.piorNome}</b> acumula <b>{diag.piorN}</b> leads sem toque. </> : null}
                    {diag.parados30 > 0 ? <><b>{diag.parados30}</b> leads estão parados há mais de 30 dias sem nenhum registro.</> : <>Há <b>{diag.semToque}</b> leads sem primeiro contato.</>}
                  </div>
                  <div className="lx-s-impact">📉 {diag.semToque} sem toque · {diag.pctSla}% dos ativos já contatados</div>
                  <div className="lx-s-acts">
                    <button className="lx-act rep" onClick={() => { setAba("leads"); }}>⚡ Resgatar os parados</button>
                    <button className="lx-act ver" onClick={() => setAba("leads")}>📋 Ver leads</button>
                  </div>
                </article>
              )}
              {temO && mostra("oportunidade") && (
                <article className="lx-s-item opo">
                  <div className="lx-s-tag green">💰 Dinheiro na mesa</div>
                  <div className="lx-s-tx">
                    O anúncio <b>{diag.melhor!.nome}</b> teve o <b>menor custo por lead</b> da casa ({brl(diag.melhor!.cpl)}), com {diag.melhor!.leads} leads. Vale reforçar a fila e a verba.
                  </div>
                  <div className="lx-s-impact">🚀 Melhor retorno de mídia agora</div>
                  <div className="lx-s-acts">
                    <button className="lx-act rep" onClick={() => setAba("campanhas")}>👥 Ajustar fila</button>
                    <button className="lx-act ver" onClick={() => setAba("campanhas")}>📊 Ver campanha</button>
                  </div>
                </article>
              )}
              {temT && mostra("trafego") && (
                <article className="lx-s-item traf">
                  <div className="lx-s-tag amber">🎯 Alinhamento de tráfego</div>
                  <div className="lx-s-tx">
                    A campanha <b>{diag.pior!.nome}</b> está a <b>{brl(diag.pior!.cpl)} por lead</b> — o custo mais alto entre as ativas. Hora de cobrar o tráfego ou renovar o criativo.
                  </div>
                  <div className="lx-s-impact">⚠️ Custo subindo · criativo pode estar saturado</div>
                  <div className="lx-s-acts">
                    <button className="lx-act cob" onClick={() => setAba("campanhas")}>📲 Cobrar tráfego</button>
                    <button className="lx-act ver" onClick={() => setAba("campanhas")}>🔍 Ver métricas</button>
                  </div>
                </article>
              )}
            </div>
          </section>
        )}

        <PaginasAtivar como={gerente} />

        {/* ── abas ── */}
        <nav className="lx-tabs" role="tablist">
          {([
            ["funil", "📊", "Funil comercial interativo", "5 etapas", ""],
            ["campanhas", "🎯", "Campanhas & mídia", diag.nAtivas ? `${diag.nAtivas} ativas` : "mídia", "amber"],
            ["filas", "🔄", "Filas & roletas de anúncios", data?.forms ? `${data.forms} formulários` : "filas", "brand"],
            ["leads", "📋", "Todos os leads & ação em lote", diag.semToque ? `${diag.semToque} sem toque` : "a carteira", "rose"],
            ["tarefas", "🗓️", "Agenda da equipe", "compromissos", ""],
          ] as [Aba, string, string, string, string][]).map(([k, ic, lb, badge, cor]) => (
            <button key={k} role="tab" aria-selected={aba === k} className={`lx-tab${aba === k ? " on" : ""}`} onClick={() => setAba(k)}>
              <span className="lx-tab-ic">{ic}</span>
              <span className="lx-tab-lb">{lb}</span>
              <span className={`lx-badge ${cor}`}>{badge}</span>
            </button>
          ))}
        </nav>

        <section className="lx-conteudo">
          {aba === "funil" && <FunilV4 managerId={gerente} como={como ?? null} />}
          {aba === "campanhas" && <CampanhasV4 donoId={gerente} como={como ?? null} />}
          {aba === "filas" && <FilasV4 donoId={gerente} como={como ?? null} />}
          {aba === "leads" && <TodosLeadsV4 como={como ?? null} />}
          {aba === "tarefas" && <TarefasV4 managerId={gerente} como={como ?? null} />}
        </section>
      </main>
    </div>
  );
}

const CSS = `
/* ── paleta do mockup escopada na Central (escuro + claro) + mapeamento dos tokens cv-* ── */
.lx.lx-dark{
  --bg:#090D16;--surface:#111827;--surface-card:#151F32;--surface-subtle:#1C283F;--border:#24324D;--border-subtle:#1B263B;
  --text-main:#F8FAFC;--text-muted:#94A3B8;--text-dim:#64748B;--brand:#0EA5E9;--brand-hover:#38BDF8;
}
.lx.lx-light{
  --bg:#F1F5F9;--surface:#FFFFFF;--surface-card:#FFFFFF;--surface-subtle:#F8FAFC;--border:#CBD5E1;--border-subtle:#E2E8F0;
  --text-main:#0F172A;--text-muted:#475569;--text-dim:#94A3B8;--brand:#0284C7;--brand-hover:#0369A1;
}
.lx{--cv-surface:var(--surface-card);--cv-border:var(--border);--cv-text-main:var(--text-main);--cv-text-muted:var(--text-muted);--cv-text-dim:var(--text-dim);--cv-sunk:var(--surface-subtle)}
.lx .shell2.lx-main{background:var(--bg);color:var(--text-main);font-family:Archivo,system-ui,sans-serif;padding:0 32px 90px;zoom:1.1}
.lx .mono{font-family:"JetBrains Mono",monospace}

.lx-top{position:sticky;top:0;z-index:30;background:var(--bg);background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(14px);display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:18px 0 14px;border-bottom:1px solid var(--border);margin-bottom:22px}
.lx-top h1{margin:0;font-size:24px;font-weight:900;letter-spacing:-.02em;color:var(--text-main)}
.lx-top p{margin:3px 0 0;font-size:13px;color:var(--text-muted)}
.lx-top-dir{display:flex;gap:10px;align-items:center}

/* Sussurro */
.lx-suss{background:linear-gradient(135deg,rgba(14,165,233,.1),rgba(168,85,247,.08) 50%,rgba(16,185,129,.08));border:1px solid rgba(14,165,233,.35);border-radius:16px;padding:18px 22px;margin-bottom:22px;box-shadow:0 8px 24px rgba(14,165,233,.12)}
.lx-suss-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.lx-suss-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(14,165,233,.2);border:1px solid rgba(14,165,233,.4);padding:4px 13px;border-radius:999px;font-size:12px;font-weight:800;color:#38BDF8;text-transform:uppercase;letter-spacing:.04em}
.lx-pulse{width:8px;height:8px;border-radius:50%;background:#38BDF8;box-shadow:0 0 10px #38BDF8;animation:lxpulse 1.8s infinite}
@keyframes lxpulse{0%{transform:scale(.9);opacity:.8}50%{transform:scale(1.4);opacity:1}100%{transform:scale(.9);opacity:.8}}
.lx-suss-chan{display:flex;gap:6px;flex-wrap:wrap}
.lx .lx-chan{font:inherit;background:rgba(127,140,160,.12);border:1px solid var(--border);color:var(--text-muted);font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:999px;cursor:pointer;transition:all .15s}
.lx .lx-chan:hover{color:var(--text-main)}
.lx .lx-chan.on{background:var(--surface-card);color:var(--text-main);border-color:var(--brand)}
.lx-suss-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.lx-s-item{background:var(--surface-card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:12px;transition:all .2s}
.lx-s-item:hover{border-color:var(--brand);transform:translateY(-2px)}
.lx-s-item.urg{border-left:4px solid #F43F5E}.lx-s-item.opo{border-left:4px solid #10B981}.lx-s-item.traf{border-left:4px solid #F59E0B}
.lx-s-tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.lx-s-tag.rose{color:#F43F5E}.lx-s-tag.green{color:#10B981}.lx-s-tag.amber{color:#F59E0B}
.lx-s-tx{font-size:12.5px;line-height:1.45;color:var(--text-main)}
.lx-s-impact{font-size:11px;font-weight:800;color:var(--text-muted)}
.lx-s-acts{display:flex;gap:6px;margin-top:2px;flex-wrap:wrap}
.lx .lx-act{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:12px;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:all .15s}
.lx .lx-act.rep{background:rgba(14,165,233,.12);color:#38BDF8;border-color:rgba(14,165,233,.3)}
.lx .lx-act.rep:hover{background:#0EA5E9;color:#fff;box-shadow:0 2px 8px rgba(14,165,233,.4)}
.lx .lx-act.cob{background:rgba(16,185,129,.12);color:#10B981;border-color:rgba(16,185,129,.3)}
.lx .lx-act.cob:hover{background:#10B981;color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.4)}
.lx .lx-act.ver{background:rgba(148,163,184,.12);color:var(--text-muted);border-color:var(--border)}
.lx .lx-act.ver:hover{background:var(--surface-subtle);color:var(--text-main)}

/* abas */
.lx-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);padding-bottom:14px;margin-bottom:22px}
.lx .lx-tab{flex:1;min-width:0;display:inline-flex;align-items:center;gap:10px;font:inherit;background:var(--surface);border:1px solid var(--border);border-radius:12px;color:var(--text-muted);padding:12px 15px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;text-align:left}
.lx .lx-tab:hover{background:var(--surface-subtle);color:var(--text-main);border-color:var(--text-dim)}
.lx .lx-tab.on{background:var(--brand);color:#fff;border-color:var(--brand);box-shadow:0 4px 12px rgba(14,165,233,.35)}
.lx-tab-ic{font-size:18px;flex:none;line-height:1}
.lx-tab-lb{flex:1;min-width:0;line-height:1.2;font-weight:800;font-size:13.5px}
.lx-badge{flex:none;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--surface-subtle);color:var(--text-muted);white-space:nowrap}
.lx-tab.on .lx-badge{background:rgba(255,255,255,.22);color:#fff}
.lx-badge.amber{background:rgba(245,158,11,.18);color:#F59E0B}.lx-badge.rose{background:rgba(244,63,94,.16);color:#F43F5E}.lx-badge.brand{background:rgba(14,165,233,.16);color:#38BDF8}
.lx-tab.on .lx-badge.amber,.lx-tab.on .lx-badge.rose,.lx-tab.on .lx-badge.brand{background:rgba(255,255,255,.22);color:#fff}
@media (max-width:900px){.lx-tabs{flex-wrap:wrap}.lx .lx-tab{flex:1 1 45%}}

.lx-conteudo{min-height:320px}
@media (max-width:1000px){.lx-suss-grid{grid-template-columns:1fr}.lx-tabs{overflow-x:auto}.lx .shell2.lx-main{padding:0 16px 80px;zoom:1}}
`;
