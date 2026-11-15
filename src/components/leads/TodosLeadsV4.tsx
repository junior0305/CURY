// "Todos os Leads & Ação em Lote" no visual do mockup V4 (Junior, 14/11): pílulas de visão + busca + tabela limpa
// + barra flutuante de lote. Dado e ações reaproveitam a RPC leads_origem + redistribuir_lote + cobrar (isolamento
// por equipe já garantido pelas RPCs). Nada inventado; as contagens das pílulas são regra sobre os leads reais.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { cobrarFila } from "@/hooks/useLeads";
import LeadGaveta from "@/components/leads2/LeadGaveta";
import { CSS as LEADS_CSS, type Corretor } from "@/components/leads2/comum";

const sb = supabase as any;
type Lead = {
  id: string; nome: string | null; telefone: string | null; campanha: string; source: string | null;
  corretor: string | null; corretor_nome: string | null; equipe: string | null; status: string;
  tocado: boolean; parado: boolean; sem_atendimento: boolean; ultimo_contato: string | null; atribuido_em: string;
};
type Equipe = { id: string; nome: string; corretores: { id: string; nome: string }[] };
type Painel = { eu: { id: string; role: string }; equipes: Equipe[]; leads: Lead[] };

const SIT: Record<string, [string, string, string]> = { // status -> [texto, cor, fundo]
  NEW: ["Novo", "#1F5FBF", "#E4EDFB"], IN_PROGRESS: ["Em atendimento", "#8A5300", "#FFF0D1"], CONTACTED: ["Em atendimento", "#8A5300", "#FFF0D1"],
  NEGOTIATING: ["Negociando", "#8A5300", "#FFF0D1"], DOCS_REQUESTED: ["Documentos", "#8A5300", "#FFF0D1"],
  VISIT_SCHEDULED: ["Visita marcada", "#0D7C66", "#DBF3EC"], VISITA_REALIZADA: ["Visita feita", "#0D7C66", "#DBF3EC"], CONCLUDED: ["Venda", "#0D7C66", "#DBF3EC"],
  ABANDONED: ["Descartado", "#9AA3AF", "#EEF1F5"], LOST: ["Descartado", "#9AA3AF", "#EEF1F5"],
};
const ini = (s: string | null) => (s || "?").trim().slice(0, 2).toUpperCase();
const ha = (iso?: string | null) => {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} dias`;
};

const FONTE: Record<string, string> = {
  facebook_make: "Facebook", facebook: "Facebook", fb_leadgen: "Facebook", meta: "Facebook",
  cold_pool: "Pescaria", pool: "Pescaria", pescado: "Pescaria",
  lista: "Lista", disparo: "Disparo", disparo_ana: "Disparo",
  resgate: "Resgate", recrutamento: "Recrutamento",
  manual: "Manual", broker_manual: "Manual", manual_test: "Teste", duplicated: "Duplicado",
};
// nome legível da campanha/origem: nome resolvido > nome pelo id (view/catálogo) > fonte amigável
export const origemLabel = (l: { campanha?: string | null; campanha_nome?: string | null; fb_campaign?: string | null; source?: string | null }, mapa?: Map<string, string>) => {
  const camp = (l.campanha ?? l.campanha_nome ?? l.fb_campaign ?? "").trim();
  if (/^DISPARO/i.test(camp)) return "Disparo";
  if (camp && camp !== "(sem campanha)" && !/^\d{6,}$/.test(camp)) return camp;
  const nome = camp && mapa?.get(camp);
  if (nome) return nome;
  return FONTE[(l.source || "").toLowerCase()] || l.source || "—";
};

type Pilula = "todos" | "zero" | "vacuo" | "desc";
const descartado = (l: Lead) => l.status === "ABANDONED" || l.status === "LOST";
const pertence = (l: Lead, p: Pilula) =>
  p === "todos" ? true : p === "zero" ? !l.tocado && !descartado(l) : p === "vacuo" ? l.parado && l.tocado && !descartado(l) : descartado(l);

export default function TodosLeadsV4({ como }: { como?: string | null }) {
  const { session } = useAuth();
  const eu = session?.user?.id ?? "";
  const qc = useQueryClient();
  const [pil, setPil] = useState<Pilula>("todos");
  const [busca, setBusca] = useState("");
  const [fCor, setFCor] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [gaveta, setGaveta] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [redis, setRedis] = useState(false);
  const [destino, setDestino] = useState<Set<string>>(new Set());

  // A carteira é estado atual, não período: pega o backlog inteiro (bate com o Diagnóstico), não "esta semana".
  const deCarteira = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const ateCarteira = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["tl4", como],
    refetchInterval: 120_000,
    queryFn: async () => (await sb.rpc("leads_origem", { p_como: como || null, p_de: deCarteira, p_ate: ateCarteira })).data as Painel,
  });
  const { data: nomeCamp } = useQuery({
    queryKey: ["tl4-nomes"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [c, f] = await Promise.all([
        sb.from("fb_campanhas_nome").select("id,nome").limit(8000),
        sb.from("formularios_catalogo").select("form_id,nome").limit(8000),
      ]);
      const m = new Map<string, string>();
      for (const r of (c.data ?? [])) if (r.id && r.nome) m.set(String(r.id), r.nome as string);
      for (const r of (f.data ?? [])) if (r.form_id && r.nome) m.set(String(r.form_id), r.nome as string);
      return m;
    },
  });
  const leads = data?.leads ?? [];
  const corretores: Corretor[] = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.equipes ?? []) for (const c of e.corretores) m.set(c.id, c.nome);
    for (const l of leads) if (l.corretor) m.set(l.corretor, l.corretor_nome ?? l.corretor);
    return [...m.entries()].map(([id, nome]) => ({ id, nome, roleta: true })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data, leads]);
  const carteira = useMemo(() => { const m = new Map<string, number>(); for (const l of leads) if (l.corretor && !descartado(l)) m.set(l.corretor, (m.get(l.corretor) ?? 0) + 1); return m; }, [leads]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["tl4"] });

  const conta = (p: Pilula) => leads.filter((l) => pertence(l, p)).length;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => pertence(l, pil) && (!fCor || l.corretor === fCor) &&
      (!q || (l.nome || "").toLowerCase().includes(q) || (l.telefone || "").includes(q) || (l.campanha || "").toLowerCase().includes(q)));
  }, [leads, pil, fCor, busca]);

  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const selMesma = useMemo(() => { // só dá para agir em lote se forem da mesma equipe
    const eqs = new Set([...sel].map((id) => leads.find((l) => l.id === id)?.equipe).filter(Boolean)); return eqs.size <= 1;
  }, [sel, leads]);

  async function cobrarSel() {
    if (!sel.size || indo) return; setIndo(true);
    try { const r = await cobrarFila([...sel], eu, "todos_v4"); const ok = r.corretores.filter((c) => c.avisado_no_whats).length;
      toast.success(ok ? "Cobrado no WhatsApp." : "Cobrança registrada."); setSel(new Set()); }
    catch (e: any) { toast.error(e?.message ?? "Não consegui cobrar."); } finally { setIndo(false); }
  }
  async function redistribuir() {
    if (!sel.size || !destino.size || indo) return; setIndo(true);
    try {
      const { data: r, error } = await sb.rpc("redistribuir_lote", { p_leads: [...sel], p_para: [...destino], p_como: como || null, p_motivo: "Redistribuição em lote (Central de Leads)" });
      if (error) throw error;
      const feitos = r?.feitos ?? 0, pulados = r?.pulados ?? 0;
      toast.success(`${feitos} redistribuído(s)${pulados ? ` · ${pulados} pulado(s)` : ""}.`);
      setSel(new Set()); setDestino(new Set()); setRedis(false); recarregar();
    } catch (e: any) { toast.error(e?.message ?? "Não consegui redistribuir."); } finally { setIndo(false); }
  }

  const PILS: [Pilula, string, string][] = [
    ["todos", "Todos da carteira", "#334155"], ["zero", "Fantasmas · zero toque", "#D64545"],
    ["vacuo", "Cliente no vácuo", "#C77700"], ["desc", "Descartados", "#8A94A6"],
  ];

  return (
    <section className="tl4">
      <style>{CSS}</style><style>{LEADS_CSS}</style>

      <div className="tl4-pils" role="tablist">
        {PILS.map(([k, lb, cor]) => (
          <button key={k} className={`tl4-pil${pil === k ? " on" : ""}`} onClick={() => { setPil(k); setSel(new Set()); }} role="tab" aria-selected={pil === k}>
            <span className="tl4-ball" style={{ background: cor }} />{lb} <b>{conta(k)}</b>
          </button>
        ))}
      </div>

      <div className="tl4-filtros">
        <input className="tl4-busca" placeholder="🔎  Buscar por cliente, telefone ou campanha…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="tl4-sel" value={fCor} onChange={(e) => setFCor(e.target.value)}>
          <option value="">Todos os corretores</option>
          {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="tl4-tab">
        <div className="tl4-head">
          <span className="tl4-chk"><input type="checkbox" checked={!!lista.length && lista.every((l) => sel.has(l.id))}
            onChange={(e) => setSel(e.target.checked ? new Set(lista.map((l) => l.id)) : new Set())} aria-label="Selecionar todos" /></span>
          <span>Cliente</span><span>Produto / origem</span><span>Corretor</span><span>Situação</span><span>Tempo</span><span className="tl4-r">Ações</span>
        </div>
        {isLoading ? <div className="tl4-vazio">Carregando…</div> : !lista.length ? <div className="tl4-vazio">Nenhum lead nessa visão.</div> : (
          lista.slice(0, 80).map((l) => {
            const s = SIT[l.status] ?? [l.status, "#64748B", "#EEF1F5"];
            return (
              <div key={l.id} className={`tl4-row${sel.has(l.id) ? " sel" : ""}`}>
                <span className="tl4-chk"><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Selecionar ${l.nome}`} /></span>
                <div className="tl4-cli"><b>{l.nome || "—"}</b><small>{l.telefone || ""}</small></div>
                <div className="tl4-org">{origemLabel(l, nomeCamp)}</div>
                <div className="tl4-cor"><span className="tl4-av">{ini(l.corretor_nome)}</span>{l.corretor_nome?.split(" ")[0] ?? "sem corretor"}</div>
                <div><span className="tl4-sit" style={{ color: s[1], background: s[2] }}>{s[0]}</span></div>
                <div className="tl4-tmp">{ha(l.ultimo_contato ?? l.atribuido_em)}</div>
                <div className="tl4-aco">
                  <button className="tl4-b" onClick={() => setGaveta(l.id)}>Ver</button>
                </div>
              </div>
            );
          })
        )}
        {lista.length > 80 && <div className="tl4-vazio">Mostrando 80 de {lista.length}. Use a busca ou os filtros para refinar.</div>}
      </div>

      {/* BARRA FLUTUANTE DE LOTE */}
      {sel.size > 0 && (
        <div className="tl4-bar">
          <span className="tl4-bar-n"><b>{sel.size}</b> selecionado(s)</span>
          {!selMesma && <span className="tl4-bar-av">⚠️ selecione leads da mesma equipe para agir em lote</span>}
          {redis ? (
            <>
              <select className="tl4-bar-sel" value="" onChange={(e) => e.target.value && setDestino((d) => new Set(d).add(e.target.value))}>
                <option value="">+ corretor destino…</option>
                {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {[...destino].map((id) => <span key={id} className="tl4-chip" onClick={() => setDestino((d) => { const n = new Set(d); n.delete(id); return n; })}>{corretores.find((c) => c.id === id)?.nome ?? "—"} ✕</span>)}
              <button className="tl4-bar-b azul" disabled={!destino.size || indo} onClick={redistribuir}>Confirmar</button>
              <button className="tl4-bar-b" onClick={() => { setRedis(false); setDestino(new Set()); }}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="tl4-bar-b azul" disabled={!selMesma} onClick={() => setRedis(true)}>⚡ Redistribuir</button>
              <button className="tl4-bar-b" disabled={indo} onClick={cobrarSel}>💬 Cobrar no WhatsApp</button>
              <button className="tl4-bar-x" onClick={() => setSel(new Set())} aria-label="Limpar seleção">✕</button>
            </>
          )}
        </div>
      )}

      {gaveta && <LeadGaveta leadId={gaveta} como={como ?? null} corretores={corretores} carteira={carteira} onFechar={() => setGaveta(null)} />}
    </section>
  );
}

const CSS = `
.tl4{display:flex;flex-direction:column;gap:14px;padding-bottom:70px}
.tl4-pils{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.mgr10 .tl4-pil{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;min-height:40px;padding:0 15px;border-radius:99px;border:1px solid var(--cv-border,#E1E6EE);background:var(--cv-surface,#fff);font-size:13.5px;font-weight:600;color:var(--cv-text-main,#27364B);cursor:pointer}
.mgr10 .tl4-pil.on{border-color:#1f63e0;box-shadow:0 0 0 1px #1f63e0}
.tl4-ball{width:9px;height:9px;border-radius:50%;flex:none}
.tl4-pil b{font-family:"JetBrains Mono",monospace;background:var(--cv-sunk,#EEF2F7);border-radius:7px;padding:1px 7px;font-size:12.5px}
.tl4-filtros{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px}
.tl4-busca,.tl4-sel{min-height:46px;border-radius:12px;border:1px solid var(--cv-border,#DCE3EE);background:var(--cv-surface,#fff);padding:0 14px;font:inherit;font-size:14px;color:inherit}
.tl4-tab{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;overflow:hidden}
.tl4-head,.tl4-row{display:grid;grid-template-columns:40px minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,1fr) 130px 86px 70px;gap:10px;align-items:center;padding:12px 14px}
.tl4-head{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--cv-text-muted,#6B7A90);font-weight:700;background:var(--cv-sunk,#F7F9FC);border-bottom:1px solid var(--cv-border,#E7EDF6)}
.tl4-row{border-top:1px solid var(--cv-border,#EEF2F8);font-size:13.5px}
.tl4-row.sel{background:rgba(31,99,224,.05)}
.tl4-r{text-align:right}
.tl4-cli{display:flex;flex-direction:column;min-width:0}.tl4-cli b{font-weight:700}.tl4-cli small,.tl4-tmp{font-size:12px;color:var(--cv-text-muted,#6B7A90);font-family:"JetBrains Mono",monospace}
.tl4-org{font-size:12.5px;color:#1f63e0;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis}
.tl4-cor{display:flex;align-items:center;gap:7px;font-weight:600;min-width:0}
.tl4-av{width:26px;height:26px;border-radius:50%;background:#0F1B2D;color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;flex:none}
.tl4-sit{font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:99px;white-space:nowrap}
.tl4-aco{text-align:right}
.mgr10 .tl4-b{min-height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--cv-border,#DCE3EE);background:var(--cv-surface,#fff);font-size:12.5px;font-weight:700;cursor:pointer}
.tl4-vazio{padding:20px 16px;font-size:13.5px;color:var(--cv-text-muted,#6B7A90)}
.tl4-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:94vw;
  background:#0F1B2D;color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 16px 40px rgba(9,12,18,.35)}
.tl4-bar-n{font-size:13.5px}.tl4-bar-n b{font-family:"JetBrains Mono",monospace}
.tl4-bar-av{font-size:12.5px;color:#FFD38A}
.mgr10 .tl4-bar-b{min-height:40px;padding:0 16px;border-radius:10px;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer}
.mgr10 .tl4-bar-b.azul{background:#2a6df0}
.mgr10 .tl4-bar-b:disabled{opacity:.45;cursor:not-allowed}
.tl4-bar-x{background:transparent;border:0;color:#fff;font-size:16px;cursor:pointer;padding:0 6px}
.tl4-bar-sel{min-height:40px;border-radius:10px;border:0;padding:0 10px;font:inherit;font-size:13px}
.tl4-chip{background:rgba(255,255,255,.16);border-radius:99px;padding:5px 10px;font-size:12.5px;cursor:pointer}
@media (max-width:1000px){.tl4-filtros{grid-template-columns:1fr}.tl4-head{display:none}
  .tl4-row{grid-template-columns:30px 1fr auto;gap:8px}.tl4-org,.tl4-tmp,.tl4-cor{display:none}}
`;
