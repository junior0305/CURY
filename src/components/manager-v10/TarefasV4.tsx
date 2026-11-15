// Agenda da equipe (Junior 15/11) — substitui a lista crua de "tarefas" (tabela tasks, que ficava zerada porque
// quase ninguém cadastra). Junta os COMPROMISSOS REAIS que exigem ação, numa lista priorizada e enxuta:
//   🗓️ visitas agendadas (leads.visit_scheduled_at) · ⏰ retornos marcados (tasks com data) · 💬 clientes esperando resposta.
// Enxuto de propósito: 3 números no topo, uma lista única capada (~14), atrasados/esperando primeiro. Nada inventado.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cobrarFila } from "@/hooks/useLeads";
import { esperando } from "@/lib/situacaoLead";
import LeadGaveta from "@/components/leads2/LeadGaveta";
import { CSS as LEADS_CSS, type Corretor } from "@/components/leads2/comum";

const sb = supabase as any;
const ENCERRADO = "(CONCLUDED,EXCLUDED,ABANDONED,LOST)";
const diaSP = (d: Date | number = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dm = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const ha = (ms: number) => { const h = ms / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} dias`; };

type Tipo = "visita" | "retorno" | "esperando";
type Compromisso = { key: string; tipo: Tipo; cliente: string; corretor: string; quando: Date; atraso: boolean; leadId: string | null; local?: string | null };
type Filtro = "tudo" | Tipo;

const TIPOS: Record<Tipo, { ic: string; cor: string; bg: string; lb: string }> = {
  visita: { ic: "🗓️", cor: "#0EA5E9", bg: "rgba(14,165,233,.12)", lb: "Visitas" },
  retorno: { ic: "⏰", cor: "#A855F7", bg: "rgba(168,85,247,.12)", lb: "Retornos" },
  esperando: { ic: "💬", cor: "#F43F5E", bg: "rgba(244,63,94,.12)", lb: "Esperando" },
};

export default function TarefasV4({ managerId, como }: { managerId: string; como?: string | null }) {
  const [vista, setVista] = useState<"hoje" | "corretores">("hoje");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [gaveta, setGaveta] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agenda-v4", managerId],
    enabled: !!managerId,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const cs = (await sb.from("profiles").select("id,first_name,last_name,last_seen_at").eq("manager_id", managerId).eq("role", "BROKER").eq("is_active", true)).data ?? [];
      const nome = new Map<string, string>(cs.map((p: any) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—"]));
      nome.set(managerId, "Você");
      const ids = [...cs.map((p: any) => p.id), managerId];
      const desde90 = new Date(Date.now() - 90 * 864e5).toISOString();
      const [leadsR, tarefasR] = await Promise.all([
        sb.from("leads").select("id,name,broker_id,status,source,created_at,visit_scheduled_at,visita_local,last_lead_response_at,last_broker_whatsapp_at,last_interaction_at,contact_attempts")
          .eq("manager_id", managerId).not("status", "in", ENCERRADO).gte("created_at", desde90).limit(3000),
        sb.from("tasks").select("id,user_id,lead_id,title,due_at").in("user_id", ids).eq("status", "OPEN")
          .not("due_at", "is", null).gte("due_at", new Date(Date.now() - 30 * 864e5).toISOString())
          .lte("due_at", new Date(Date.now() + 14 * 864e5).toISOString()).order("due_at").limit(500),
      ]);
      const leads = (leadsR.data ?? []) as any[];
      const nomeLead = new Map<string, string>(leads.map((l) => [l.id, l.name || "Cliente"]));
      const now = Date.now();
      const out: Compromisso[] = [];
      for (const l of leads) {
        if (l.visit_scheduled_at) {
          const d = new Date(l.visit_scheduled_at);
          if (d.getTime() > now - 2 * 3.6e6) // não mostra visita que já passou há horas
            out.push({ key: `v${l.id}`, tipo: "visita", cliente: l.name || "Cliente", corretor: nome.get(l.broker_id) ?? "sem corretor", quando: d, atraso: false, leadId: l.id, local: l.visita_local });
        }
        if (esperando(l) && l.last_lead_response_at) {
          const d = new Date(l.last_lead_response_at);
          const horas = (now - d.getTime()) / 36e5;
          if (horas >= 0.5 && horas <= 72)
            out.push({ key: `e${l.id}`, tipo: "esperando", cliente: l.name || "Cliente", corretor: nome.get(l.broker_id) ?? "sem corretor", quando: d, atraso: true, leadId: l.id });
        }
      }
      for (const t of (tarefasR.data ?? []) as any[]) {
        const d = new Date(t.due_at);
        out.push({ key: `t${t.id}`, tipo: "retorno", cliente: (t.lead_id && nomeLead.get(t.lead_id)) || t.title || "Retorno", corretor: nome.get(t.user_id) ?? "—", quando: d, atraso: d.getTime() < now, leadId: t.lead_id ?? null });
      }
      const corretores: Corretor[] = cs.map((p: any) => ({ id: p.id, nome: nome.get(p.id) ?? "—", roleta: true }));
      const carteira = new Map<string, number>();
      for (const l of leads) if (l.broker_id) carteira.set(l.broker_id, (carteira.get(l.broker_id) ?? 0) + 1);
      // análise por corretor: quem está agendando (visitas + retornos futuros) e um sinal de atividade de hoje
      const futuro = now + 14 * 864e5, hoje = diaSP();
      const tarefas = (tarefasR.data ?? []) as any[];
      const porCorretor = cs.map((p: any) => {
        const agVis = leads.filter((l) => l.broker_id === p.id && l.visit_scheduled_at && new Date(l.visit_scheduled_at).getTime() > now - 2 * 3.6e6 && new Date(l.visit_scheduled_at).getTime() <= futuro).length;
        const agRet = tarefas.filter((t) => t.user_id === p.id && new Date(t.due_at).getTime() > now).length;
        const tocou = leads.filter((l) => l.broker_id === p.id && l.last_broker_whatsapp_at && diaSP(new Date(l.last_broker_whatsapp_at)) === hoje).length;
        return { id: p.id, nome: nome.get(p.id) ?? "—", agVis, agRet, agendados: agVis + agRet, tocou, visto: p.last_seen_at as string | null };
      }).sort((a, b) => b.agendados - a.agendados || b.tocou - a.tocou || a.nome.localeCompare(b.nome));
      return { compromissos: out, corretores, carteira, porCorretor };
    },
  });

  const compromissos = data?.compromissos ?? [];
  const corretores = data?.corretores ?? [];
  const carteira = data?.carteira ?? new Map<string, number>();
  const porCorretor = data?.porCorretor ?? [];
  const semAgendar = porCorretor.filter((c) => c.agendados === 0).length;
  const vistoLabel = (iso: string | null) => {
    if (!iso) return "nunca entrou";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 15 * 60_000) return "ativo agora";
    if (diaSP(new Date(iso)) === diaSP()) return `visto há ${ha(ms)}`;
    return `sumido · há ${ha(ms)}`;
  };
  const urgente = (c: Compromisso) => c.tipo === "esperando" || (c.tipo === "retorno" && c.atraso);
  const ordenados = useMemo(() => [...compromissos].sort((a, b) => {
    const ua = urgente(a), ub = urgente(b);
    if (ua !== ub) return ua ? -1 : 1;
    return a.quando.getTime() - b.quando.getTime();
  }), [compromissos]);
  const lista = useMemo(() => ordenados.filter((c) => filtro === "tudo" || c.tipo === filtro), [ordenados, filtro]);

  const hoje = diaSP();
  const visitasHoje = compromissos.filter((c) => c.tipo === "visita" && diaSP(c.quando) === hoje).length;
  const retornosVencidos = compromissos.filter((c) => c.tipo === "retorno" && c.atraso).length;
  const esperandoN = compromissos.filter((c) => c.tipo === "esperando").length;
  const conta = (f: Filtro) => (f === "tudo" ? compromissos.length : compromissos.filter((c) => c.tipo === f).length);

  async function cobrar(leadId: string | null, cliente: string) {
    if (!leadId || cobrando) return;
    setCobrando(true);
    try { const r = await cobrarFila([leadId], managerId, "agenda_v4"); const ok = r.corretores.filter((c) => c.avisado_no_whats).length;
      toast.success(ok ? `Cobrado no WhatsApp sobre ${cliente}.` : "Cobrança registrada."); }
    catch (e: any) { toast.error(e?.message ?? "Não consegui cobrar."); } finally { setCobrando(false); }
  }

  const quandoLabel = (c: Compromisso) => {
    const now = Date.now();
    if (c.tipo === "esperando") return `respondeu há ${ha(now - c.quando.getTime())}`;
    if (c.tipo === "retorno") return c.atraso ? `vencido há ${ha(now - c.quando.getTime())}` : `${dm(c.quando)} ${hhmm(c.quando)}`;
    // visita
    const d = diaSP(c.quando);
    const quando = d === hoje ? `hoje ${hhmm(c.quando)}` : d === diaSP(Date.now() + 864e5) ? `amanhã ${hhmm(c.quando)}` : `${dm(c.quando)} ${hhmm(c.quando)}`;
    return c.local ? `${quando} · ${c.local}` : quando;
  };

  return (
    <section className="ag">
      <style>{CSS}</style><style>{LEADS_CSS}</style>

      <div className="ag-toggle">
        <button className={`ag-tg${vista === "hoje" ? " on" : ""}`} onClick={() => setVista("hoje")}>📋 Hoje · compromissos</button>
        <button className={`ag-tg${vista === "corretores" ? " on" : ""}`} onClick={() => setVista("corretores")}>👥 Por corretor · quem agenda</button>
      </div>

      {vista === "corretores" ? (
        <>
          {semAgendar > 0 && <div className="ag-alerta">⚠️ <b>{semAgendar}</b> de {porCorretor.length} corretores sem nenhum compromisso agendado para os próximos dias.</div>}
          <div className="ag-corr-tbl">
            <div className="ag-corr-h"><span>Corretor</span><span className="r">Agendados (7 dias)</span><span className="r">Tocou hoje</span><span>Atividade</span></div>
            {isLoading ? <div className="ag-vazio">Carregando…</div> : !porCorretor.length ? <div className="ag-vazio">Sem corretores na equipe.</div> : porCorretor.map((c) => {
              const ativo = c.visto && Date.now() - new Date(c.visto).getTime() < 15 * 60_000;
              return (
                <div className={`ag-corr-row${c.agendados === 0 ? " zero" : ""}`} key={c.id}>
                  <span className="ag-corr-nome">{c.nome}</span>
                  <span className="r">{c.agendados === 0
                    ? <em className="ag-tag amb">não agendou</em>
                    : <b className="ag-mono">{c.agVis}<small> vis</small> · {c.agRet}<small> ret</small></b>}</span>
                  <span className="r ag-mono">{c.tocou}</span>
                  <span><em className={`ag-tag ${ativo ? "verde" : c.visto && diaSP(new Date(c.visto)) === diaSP() ? "cinza" : "ros"}`}>{vistoLabel(c.visto)}</em></span>
                </div>
              );
            })}
            <div className="ag-vazio" style={{ textAlign: "left", padding: "12px 2px", fontSize: 12 }}>Agendados = visitas marcadas + retornos com data nos próximos 7 dias. Para a análise de produção (visitas, pastas, vendas) use a aba <b>Tropa &amp; presença</b>.</div>
          </div>
        </>
      ) : (<>
      <div className="ag-stats">
        <div className="ag-stat"><b style={{ color: "#0EA5E9" }}>{visitasHoje}</b><span>visitas hoje</span></div>
        <div className="ag-stat"><b style={{ color: retornosVencidos ? "#A855F7" : undefined }}>{retornosVencidos}</b><span>retornos vencidos</span></div>
        <div className="ag-stat"><b style={{ color: esperandoN ? "#F43F5E" : undefined }}>{esperandoN}</b><span>clientes esperando</span></div>
      </div>

      <div className="ag-pills">
        {(["tudo", "visita", "retorno", "esperando"] as Filtro[]).map((f) => (
          <button key={f} className={`ag-pill${filtro === f ? " on" : ""}`} onClick={() => setFiltro(f)}>
            {f === "tudo" ? "Tudo" : <>{TIPOS[f].ic} {TIPOS[f].lb}</>} <b>{conta(f)}</b>
          </button>
        ))}
      </div>

      <div className="ag-lista">
        {isLoading ? <div className="ag-vazio">Carregando a agenda…</div>
          : !lista.length ? <div className="ag-vazio">✓ Nada pendente para a equipe {filtro === "tudo" ? "agora" : `em ${filtro === "visita" ? "visitas" : filtro === "retorno" ? "retornos" : "espera"}`}.</div>
          : lista.slice(0, 14).map((c) => {
            const T = TIPOS[c.tipo];
            return (
              <div key={c.key} className={`ag-row${urgente(c) ? " urg" : ""}`} style={{ borderLeftColor: T.cor }}>
                <span className="ag-ic" style={{ background: T.bg }}>{T.ic}</span>
                <div className="ag-info">
                  <b>{c.cliente}</b>
                  <small>{c.corretor}</small>
                </div>
                <span className="ag-quando" style={urgente(c) ? { color: T.cor, fontWeight: 700 } : {}}>{quandoLabel(c)}</span>
                <div className="ag-aco">
                  <button className="ag-b cob" disabled={!c.leadId || cobrando} onClick={() => cobrar(c.leadId, c.cliente)}>Cobrar</button>
                  <button className="ag-b ver" disabled={!c.leadId} onClick={() => c.leadId && setGaveta(c.leadId)}>Ver</button>
                </div>
              </div>
            );
          })}
        {lista.length > 14 && <div className="ag-vazio">+{lista.length - 14} compromissos. Priorizei os mais urgentes.</div>}
      </div>
      </>)}

      {gaveta && <LeadGaveta leadId={gaveta} como={como ?? null} corretores={corretores} carteira={carteira} onFechar={() => setGaveta(null)} />}
    </section>
  );
}

const CSS = `
.ag{display:flex;flex-direction:column;gap:14px}
.ag-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.ag-stat{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:2px}
.ag-stat b{font-size:28px;font-weight:900;font-family:"JetBrains Mono",monospace;line-height:1;color:var(--cv-text-main,#1a2435)}
.ag-stat span{font-size:12px;color:var(--cv-text-muted,#6B7A90);font-weight:600}
.ag-pills{display:flex;gap:8px;flex-wrap:wrap}
.mgr10 .ag-pill{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border-radius:99px;border:1px solid var(--cv-border,#E1E6EE);background:var(--cv-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:var(--cv-text-muted,#5B6B80);cursor:pointer;transition:all .15s}
.mgr10 .ag-pill:hover{color:var(--cv-text-main,#27364B)}
.mgr10 .ag-pill.on{background:#0F1B2D;border-color:#0F1B2D;color:#fff}
.ag-pill b{font-weight:800;opacity:.8}
.ag-lista{display:flex;flex-direction:column;gap:8px}
.ag-row{display:grid;grid-template-columns:auto minmax(0,1.3fr) minmax(0,1fr) auto;gap:12px;align-items:center;background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-left:4px solid;border-radius:12px;padding:11px 14px}
.ag-row.urg{background:var(--cv-sunk,#FBFCFE)}
.ag-ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:18px;flex:none}
.ag-info{min-width:0}
.ag-info b{font-size:14px;font-weight:800;display:block;color:var(--cv-text-main,#1a2435);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-info small{font-size:12px;color:var(--cv-text-muted,#6B7A90)}
.ag-quando{font-size:13px;color:var(--cv-text-muted,#5B6B80);font-family:"JetBrains Mono",monospace}
.ag-aco{display:inline-flex;gap:6px}
.mgr10 .ag-b{min-height:34px;padding:0 13px;border-radius:9px;border:1px solid var(--cv-border,#DCE3EE);background:var(--cv-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.mgr10 .ag-b.cob{background:rgba(16,185,129,.12);color:#0D7C66;border-color:rgba(16,185,129,.3)}
.mgr10 .ag-b.cob:hover:not(:disabled){background:#10B981;color:#fff}
.mgr10 .ag-b:disabled{opacity:.45;cursor:not-allowed}
.ag-vazio{padding:26px 6px;font-size:14px;color:var(--cv-text-muted,#6B7A90);text-align:center}
.ag-toggle{display:inline-flex;gap:3px;background:var(--cv-sunk,#EEF2F8);border:1px solid var(--cv-border,#E7EDF6);border-radius:11px;padding:3px;width:fit-content}
.mgr10 .ag-tg{font:inherit;font-size:13px;font-weight:700;padding:7px 14px;border-radius:8px;border:0;background:transparent;color:var(--cv-text-muted,#5B6B80);cursor:pointer;transition:all .15s}
.mgr10 .ag-tg.on{background:var(--cv-surface,#fff);color:var(--cv-text-main,#1a2435);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.ag-alerta{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:var(--cv-text-main,#1a2435);border-radius:12px;padding:12px 15px;font-size:13.5px}
.ag-alerta b{color:#E8912B}
.ag-corr-tbl{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;overflow:hidden}
.ag-corr-h,.ag-corr-row{display:grid;grid-template-columns:minmax(0,1.5fr) 150px 100px minmax(0,1.2fr);gap:10px;align-items:center;padding:12px 16px}
.ag-corr-h{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted,#6B7A90);font-weight:800;background:var(--cv-sunk,#F7F9FC);border-bottom:1px solid var(--cv-border,#E7EDF6)}
.ag-corr-row{border-top:1px solid var(--cv-border,#EEF2F8);font-size:14px}
.ag-corr-row:first-of-type{border-top:0}
.ag-corr-row.zero{background:rgba(245,158,11,.04)}
.ag-corr-nome{font-weight:700;color:var(--cv-text-main,#1a2435)}
.ag .r{text-align:right}.ag-mono{font-family:"JetBrains Mono",monospace;font-weight:800}.ag-mono small{font-weight:500;font-size:11px;opacity:.75}
.ag-tag{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px}
.ag-tag.amb{color:#E8912B;background:rgba(245,158,11,.14)}.ag-tag.verde{color:#0D7C66;background:rgba(16,185,129,.14)}.ag-tag.cinza{color:var(--cv-text-muted,#6B7A90);background:var(--cv-sunk,#EEF2F8)}.ag-tag.ros{color:#B4322A;background:rgba(244,63,94,.12)}
@media (max-width:760px){.ag-corr-h{display:none}.ag-corr-row{grid-template-columns:1fr auto;gap:6px}}
@media (max-width:760px){.ag-stats{grid-template-columns:1fr 1fr}.ag-row{grid-template-columns:auto 1fr auto;gap:8px}.ag-quando{grid-column:2/-1;order:3}}
`;
