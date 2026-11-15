// Raio-X do corretor no visual do mockup (Tropa harmonizado): Produção do Mês,
// Assiduidade de Plantão (14 dias com horário de check-in real), Diagnóstico e Ações.
// Dado real: c2s_plantao (espelho do check-in, por profile_id) + leads do corretor (SLA) + vendas do mês.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as sb } from "@/integrations/supabase/client";
import { chaveNome } from "@/hooks/useDiretoria";

type Props = {
  brokerId: string;
  nome: string;
  stand?: string | null;
  vendas?: number;
  pastas?: number;
  visitas?: number;
  diag?: string;
  corretores?: { id: string; nome: string }[];
  como?: string | null;
  focoLeadId?: string | null;
  onRepasse?: (r: { lead: string; de: string; para: string; hora: string }) => void;
  onClose: () => void;
};

const SP = "America/Sao_Paulo";
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: SP }); // YYYY-MM-DD
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
const ini2 = (n: string) => (n || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const SIGLA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function RaioXPlantaoDrawer({ brokerId, nome, stand, vendas, pastas, visitas, diag, corretores, como, focoLeadId, onRepasse, onClose }: Props) {
  const qc = useQueryClient();
  const temProd = vendas !== undefined;
  const [aberto, setAberto] = useState(false);
  const [repassando, setRepassando] = useState<string | null>(null); // leadId em repasse
  const [alvoRep, setAlvoRep] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [movidos, setMovidos] = useState<Record<string, string>>({}); // leadId -> nome destino
  const outros = (corretores ?? []).filter((c) => c.id !== brokerId);
  const repassar = async (leadId: string, leadNome: string) => {
    if (!alvoRep) return;
    const destino = outros.find((c) => c.id === alvoRep);
    try {
      const { error } = await sb.rpc("redistribuir_lote", { p_leads: [leadId], p_para: [alvoRep], p_como: como ?? null, p_motivo: "raio-x do corretor" });
      if (error) throw error;
      setMovidos((m) => ({ ...m, [leadId]: destino?.nome?.split(" ")[0] ?? "outro" }));
      setRepassando(null); setAlvoRep(""); setConfirmar(false);
      toast.success(`Lead repassado para ${destino?.nome?.split(" ")[0] ?? "o corretor"}.`);
      onRepasse?.({ lead: leadNome || "Lead", de: nome, para: destino?.nome ?? "outro", hora: new Date().toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" }) });
      qc.invalidateQueries({ queryKey: ["tropav4"] });
    } catch (e: any) { toast.error(e?.message || "Não deu para repassar."); }
  };
  useEffect(() => { const t = setTimeout(() => setAberto(true), 10); return () => clearTimeout(t); }, []);
  const fechar = () => { setAberto(false); setTimeout(onClose, 260); };

  // Janela de 14 dias (hoje - 13 … hoje), em SP
  const dias14 = useMemo(() => {
    const out: { iso: string; sigla: string; weekend: boolean; hoje: boolean }[] = [];
    const hojeIso = diaSP(new Date());
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const iso = diaSP(d);
      const dow = new Date(iso + "T12:00:00").getDay();
      out.push({ iso, sigla: i === 0 ? "HOJE" : SIGLA[dow], weekend: dow === 0 || dow === 6, hoje: iso === hojeIso });
    }
    return out;
  }, []);
  const desde14 = dias14[0]?.iso;

  // Check-ins de plantão do corretor. c2s_plantao é casado por NOME no resto do app
  // (profile_id só existe nas linhas espelhadas de check-in); então casa por nome OU profile_id.
  const primeiro = (nome || "").trim().split(/\s+/)[0] || "";
  const { data: plantoes } = useQuery({
    queryKey: ["rxp-plantao", brokerId, nome, desde14],
    enabled: !!brokerId && !!desde14,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const q = sb.from("c2s_plantao").select("dia,check_in,estande,corretor,profile_id").gte("dia", desde14);
      const { data } = primeiro ? await q.or(`profile_id.eq.${brokerId},corretor.ilike.${primeiro}%`) : await q.eq("profile_id", brokerId);
      const alvo = chaveNome(nome);
      return ((data ?? []) as any[]).filter((r) => r.profile_id === brokerId || chaveNome(r.corretor) === alvo) as { dia: string; check_in: string | null; estande: string | null }[];
    },
  });
  // check_in pode vir "HH:MM:SS", "HH:MM" ou timestamp ISO
  const fmtCheck = (v: string | null): string => {
    if (!v) return "";
    if (/^\d{1,2}:\d{2}/.test(v)) return v.slice(0, 5);
    const d = new Date(v.includes("T") || v.includes(" ") ? v : v + "T00:00:00");
    return isNaN(d.getTime()) ? "" : horaSP(d.toISOString());
  };
  // mapa dia (YYYY-MM-DD) -> primeira hora de check-in
  const porDia = useMemo(() => {
    const m = new Map<string, string>();
    (plantoes ?? []).forEach((p) => {
      const d = (p.dia || "").slice(0, 10);
      if (!d) return;
      const h = fmtCheck(p.check_in) || "✓";
      if (!m.has(d) || (h < m.get(d)! && h !== "✓")) m.set(d, h);
    });
    return m;
  }, [plantoes]);
  const presentes = dias14.filter((d) => porDia.has(d.iso)).length;
  const pct = Math.round((presentes / 14) * 100);
  const corFreq = pct >= 70 ? "#10B981" : pct >= 40 ? "#FCD34D" : "#FDA4AF";
  const standCheck = useMemo(() => (plantoes ?? []).map((p) => p.estande).find(Boolean) || stand || null, [plantoes, stand]);

  // SLA médio do mês (atribuído -> primeiro contato) dos leads do corretor
  const { data: sla } = useQuery({
    queryKey: ["rxp-sla", brokerId],
    enabled: !!brokerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const mesIni = diaSP(new Date()).slice(0, 8) + "01";
      const { data } = await sb.from("leads").select("atribuido_em,primeiro_contato_em").eq("broker_id", brokerId).gte("atribuido_em", mesIni + "T00:00:00").not("primeiro_contato_em", "is", null).limit(1000);
      const difs = (data ?? []).map((l: any) => (new Date(l.primeiro_contato_em).getTime() - new Date(l.atribuido_em).getTime()) / 1000).filter((s) => s >= 0 && s < 86400 * 3);
      if (!difs.length) return null;
      return Math.round(difs.reduce((a, b) => a + b, 0) / difs.length);
    },
  });
  const fmtSla = (s: number | null | undefined) => s == null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

  // Leads do corretor — abrem AQUI dentro (sem sair da tela). Abre já se veio de um lead focado.
  const [verLeads, setVerLeads] = useState(!!focoLeadId);
  const { data: leadsRaw, isLoading: carregandoLeads } = useQuery({
    queryKey: ["rxp-leads", brokerId, verLeads],
    enabled: !!brokerId && verLeads,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await sb.from("leads").select("id,name,status,created_at,atribuido_em,primeiro_contato_em,last_broker_whatsapp_at,last_lead_response_at,visit_scheduled_at")
        .eq("broker_id", brokerId).order("created_at", { ascending: false }).limit(120);
      return (data ?? []) as any[];
    },
  });
  const semContato = (l: any) => !l.last_broker_whatsapp_at || (l.atribuido_em && new Date(l.last_broker_whatsapp_at) < new Date(l.atribuido_em));
  const esperaMs = (l: any) => Date.now() - new Date(l.atribuido_em || l.created_at).getTime();
  // ordena: lead focado primeiro, depois sem contato mais antigo primeiro, depois recentes
  const leadsCorr = useMemo(() => {
    const arr = [...(leadsRaw ?? [])];
    return arr.sort((a, b) => {
      if (a.id === focoLeadId) return -1; if (b.id === focoLeadId) return 1;
      const sa = semContato(a) ? 1 : 0, sb2 = semContato(b) ? 1 : 0;
      if (sa !== sb2) return sb2 - sa;
      return sa ? esperaMs(b) - esperaMs(a) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leadsRaw, focoLeadId]);
  const haQuanto = (iso?: string | null) => {
    if (!iso) return "";
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return h < 1 ? "agora" : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  };
  const situaLead = (l: any): [string, string] => {
    if (l.last_lead_response_at) return ["Respondeu", "#10B981"];
    if (l.visit_scheduled_at) return ["Visita marcada", "#38BDF8"];
    if (semContato(l)) return [`🚨 ${haQuanto(l.atribuido_em || l.created_at)} sem 1º contato`, "#FDA4AF"];
    return ["Em contato", "#FCD34D"];
  };

  const mesNome = new Date().toLocaleDateString("pt-BR", { timeZone: SP, month: "long" });
  const semanaA = dias14.slice(0, 7), semanaB = dias14.slice(7);
  const rangeLabel = (arr: typeof dias14) => `${arr[0].iso.slice(8)}/${arr[0].iso.slice(5, 7)} a ${arr[6].iso.slice(8)}/${arr[6].iso.slice(5, 7)}`;

  const Strip = ({ arr }: { arr: typeof dias14 }) => (
    <div className="rxp-strip">
      {arr.map((d) => {
        const h = porDia.get(d.iso);
        return (
          <div key={d.iso} className={`rxp-cell${d.weekend ? " wk" : ""}${d.hoje ? " hoje" : ""}`}>
            <span className="rxp-sig">{d.sigla}</span>
            <span className={`rxp-pill ${h ? "pres" : "folga"}`}>{h ? "✓" : "–"}</span>
            <span className="rxp-hora">{h && h !== "✓" ? h : "—"}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="rxp-root">
      <style>{CSS}</style>
      <div className={`rxp-back${aberto ? " on" : ""}`} onClick={fechar} />
      <aside className={`rxp-drawer${aberto ? " open" : ""}`}>
        <div className="rxp-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="rxp-av">{ini2(nome)}</div>
            <div>
              <b style={{ fontSize: 16, color: "#FFF", display: "block" }}>{nome}</b>
              <span style={{ fontSize: 12, color: "#8A94A6" }}>Corretor{standCheck ? ` · ${standCheck}` : ""}</span>
            </div>
          </div>
          <button className="rxp-x" onClick={fechar}>✕</button>
        </div>

        <div className="rxp-body">
          {temProd && (
          <div className="rxp-card">
            <div className="rxp-ct"><span>📊</span> Produção do Mês ({mesNome.charAt(0).toUpperCase() + mesNome.slice(1)})</div>
            <div className="rxp-prod">
              <div><span>Vendas</span><b style={{ color: "#10B981" }}>{vendas} un</b></div>
              <div><span>Pastas</span><b style={{ color: "#C084FC" }}>{pastas}</b></div>
              <div><span>Visitas</span><b style={{ color: "#38BDF8" }}>{visitas}</b></div>
              <div><span>SLA Médio</span><b style={{ color: "#FCD34D", fontSize: 15 }}>{fmtSla(sla)}</b></div>
            </div>
          </div>
          )}

          <div className="rxp-card">
            <div className="rxp-ct" style={{ justifyContent: "space-between" }}>
              <span><span>🏢</span> Assiduidade de Plantão (14 dias)</span>
              <span style={{ fontSize: 11.5, color: corFreq, fontWeight: 800 }}>{presentes}/14 ({pct}%)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              <div>
                <span className="rxp-wklab">Semana passada ({rangeLabel(semanaA)})</span>
                <Strip arr={semanaA} />
              </div>
              <div>
                <span className="rxp-wklab">Semana atual ({rangeLabel(semanaB)})</span>
                <Strip arr={semanaB} />
              </div>
            </div>
            <p className="rxp-nota">Horário = primeiro check-in do dia por localização. Dia sem check-in fica neutro (pode ser folga).</p>
          </div>

          {diag && (
          <div className="rxp-card">
            <div className="rxp-ct"><span>🧠</span> Diagnóstico do Copiloto</div>
            <p style={{ fontSize: 12.5, color: "#C4CCD8", lineHeight: 1.45, margin: 0 }}>{diag}</p>
          </div>
          )}

          <div className="rxp-card">
            <div className="rxp-ct" style={{ justifyContent: "space-between" }}>
              <span><span>👁️</span> Leads do corretor</span>
              {verLeads && leadsCorr && <span style={{ fontSize: 11.5, color: "#8A94A6", fontWeight: 700 }}>{leadsCorr.length}</span>}
            </div>
            {!verLeads ? (
              <button className="rxp-act ver" onClick={() => setVerLeads(true)}>👁️ Ver os leads aqui</button>
            ) : carregandoLeads ? (
              <p className="rxp-nota" style={{ margin: 0 }}>Carregando…</p>
            ) : !leadsCorr?.length ? (
              <p className="rxp-nota" style={{ margin: 0 }}>Nenhum lead com esse corretor.</p>
            ) : (
              <div className="rxp-leads">
                {leadsCorr.map((l) => { const [sit, cor] = situaLead(l); const movido = movidos[l.id]; const foco = l.id === focoLeadId; const alvoNome = outros.find((c) => c.id === alvoRep)?.nome?.split(" ")[0]; return (
                  <div className={`rxp-lead${foco ? " foco" : ""}`} key={l.id}>
                    <div className="rxp-lrow">
                      <span className="rxp-ln">{foco && "📌 "}{l.name || "Sem nome"}</span>
                      {movido ? <span className="rxp-ls" style={{ color: "#38BDF8", background: "#38BDF81E" }}>→ {movido}</span>
                        : <span className="rxp-ls" style={{ color: cor, background: cor + "1E" }}>{sit}</span>}
                      <span className="rxp-lt">{haQuanto(l.created_at)}</span>
                      {!movido && outros.length > 0 && <button className="rxp-rep" title="Repassar para outro corretor" onClick={() => { setRepassando(repassando === l.id ? null : l.id); setAlvoRep(""); setConfirmar(false); }}>⇄</button>}
                    </div>
                    {repassando === l.id && !movido && (
                      !confirmar ? (
                      <div className="rxp-repbox">
                        <select value={alvoRep} onChange={(e) => setAlvoRep(e.target.value)}>
                          <option value="">Repassar para…</option>
                          {outros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        <button className="rxp-repok" disabled={!alvoRep} onClick={() => setConfirmar(true)}>Repassar</button>
                      </div>
                      ) : (
                      <div className="rxp-confirm">
                        <span>Passar <b>{l.name || "este lead"}</b> → <b style={{ color: "#38BDF8" }}>{alvoNome}</b>?</span>
                        <div className="rxp-cbtns">
                          <button className="rxp-cok" onClick={() => repassar(l.id, l.name)}>✓ Confirmar</button>
                          <button className="rxp-cno" onClick={() => setConfirmar(false)}>Cancelar</button>
                        </div>
                      </div>
                      )
                    )}
                  </div>
                ); })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

const CSS = `
.rxp-back{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:2200;opacity:0;transition:opacity .25s}
.rxp-back.on{opacity:1}
.rxp-drawer{position:fixed;top:0;right:-540px;width:500px;max-width:94vw;height:100vh;background:#0B1322;border-left:1px solid #1E293B;box-shadow:-10px 0 40px rgba(0,0,0,.8);z-index:2300;display:flex;flex-direction:column;transition:right .3s cubic-bezier(.16,1,.3,1);font-family:'Archivo',system-ui,sans-serif}
.rxp-drawer.open{right:0}
.rxp-head{padding:18px 22px;border-bottom:1px solid #1E293B;display:flex;justify-content:space-between;align-items:center;background:#080E1C}
.rxp-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0EA5B7,#2563EB);border:1px solid rgba(255,255,255,.15)}
.rxp-x{background:none;border:none;color:#8A94A6;font-size:20px;cursor:pointer;line-height:1}
.rxp-body{padding:22px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px}
.rxp-card{background:#0F1A2E;border:1px solid #1E293B;border-radius:12px;padding:16px}
.rxp-ct{font-size:13.5px;font-weight:800;color:#FFF;display:flex;align-items:center;gap:8px;margin-bottom:10px}
.rxp-prod{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.rxp-prod>div{background:#0A1220;padding:8px;border-radius:6px;text-align:center}
.rxp-prod span{font-size:11px;color:#6B7688;display:block}
.rxp-prod b{font-size:18px;font-family:'JetBrains Mono',monospace}
.rxp-wklab{font-size:10px;color:#6B7688;text-transform:uppercase;font-weight:700;margin-bottom:4px;display:block}
.rxp-strip{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.rxp-cell{background:#0A1220;border:1px solid #1A2435;border-radius:6px;padding:6px 3px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:3px}
.rxp-cell.wk{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.05)}
.rxp-cell.hoje{border:1.5px solid #38BDF8;box-shadow:0 0 8px rgba(56,189,248,.4)}
.rxp-sig{font-size:10px;font-weight:800;color:#8A94A6;text-transform:uppercase}
.rxp-cell.wk .rxp-sig{color:#FCD34D}
.rxp-pill{width:100%;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}
.rxp-pill.pres{background:rgba(16,185,129,.22);color:#10B981;border:1px solid #10B981}
.rxp-pill.folga{background:rgba(255,255,255,.05);color:#55617A}
.rxp-hora{font-size:9.5px;color:#8A94A6;font-family:'JetBrains Mono',monospace}
.rxp-nota{font-size:10.5px;color:#55617A;margin:10px 0 0;line-height:1.4}
.rxp-act{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:8px;font-size:12.5px;font-weight:700;text-decoration:none;cursor:pointer;border:1px solid #1E293B;color:#C4CCD8;background:#0A1220}
.rxp-act.ver{width:100%}
.rxp-act.ver:hover{border-color:#38BDF8;color:#38BDF8}
.rxp-leads{display:flex;flex-direction:column;gap:5px;max-height:320px;overflow-y:auto}
.rxp-lead{padding:7px 10px;background:#0A1220;border:1px solid #1A2435;border-radius:7px}
.rxp-lrow{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center}
.rxp-rep{background:#121C30;border:1px solid #27354B;color:#8FB7FF;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;padding:0}
.rxp-rep:hover{border-color:#38BDF8;color:#38BDF8}
.rxp-repbox{display:flex;gap:6px;margin-top:7px}
.rxp-repbox select{flex:1;background:#0A1220;border:1px solid #27354B;color:#DCE3EC;border-radius:6px;padding:6px 8px;font-size:12px}
.rxp-repok{background:#2563EB;border:none;color:#fff;border-radius:6px;padding:0 12px;font-size:12px;font-weight:800;cursor:pointer}
.rxp-repok:disabled{opacity:.45;cursor:default}
.rxp-lead.foco{border-color:#F59E0B;background:rgba(245,158,11,.08)}
.rxp-confirm{margin-top:8px;padding:9px 10px;background:#0A1220;border:1px solid #F59E0B55;border-radius:7px;font-size:12px;color:#DCE3EC}
.rxp-confirm b{color:#fff}
.rxp-cbtns{display:flex;gap:6px;margin-top:8px}
.rxp-cok{flex:1;background:#10B981;border:none;color:#04121F;border-radius:6px;padding:7px;font-size:12px;font-weight:800;cursor:pointer}
.rxp-cno{background:#121C30;border:1px solid #27354B;color:#8A94A6;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}
.rxp-ln{font-size:12.5px;color:#DCE3EC;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rxp-ls{font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;white-space:nowrap}
.rxp-lt{font-size:10.5px;color:#6B7688;font-family:'JetBrains Mono',monospace;min-width:30px;text-align:right}
@media(max-width:560px){.rxp-drawer{width:100vw}}
`;
