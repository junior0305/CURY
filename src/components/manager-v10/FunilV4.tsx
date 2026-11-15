// Funil do mockup V4 (Junior, 14/11): 5 etapas clicáveis + a LISTA de leads da etapa + "onde os leads estão parados".
// Números: Leads/Contato/Venda pelos leads (COLS_LEAD); Visita = plantão C2S; Pasta = Junix (useDadosEquipe/usePastas).
// A lista e o painel de parados saem dos leads reais. Ações: Cobrar (chip do gerente) e Ver (gaveta).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { usePeriodo, diaSP } from "@/hooks/usePeriodo";
import { useDadosEquipe } from "@/hooks/useDadosEquipe";
import { usePastas } from "@/hooks/usePastas";
import { atendido } from "@/lib/situacaoLead";
import { cobrarFila } from "@/hooks/useLeads";
import { COLS_LEAD, VISITA, ENCERRADO, ha, situacao, SIT, CSS as LEADS_CSS, type LeadN, type Corretor } from "@/components/leads2/comum";
import LeadGaveta from "@/components/leads2/LeadGaveta";
import { origemLabel } from "@/components/leads/TodosLeadsV4";

const sb = supabase as any;
const nf = (n: number) => n.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const ETAPAS = ["Leads recebidos", "Com contato", "Visita no estande", "Pasta na Caixa", "Venda confirmada"] as const;

export default function FunilV4({ managerId, como }: { managerId: string; como?: string | null }) {
  const { session } = useAuth();
  const eu = session?.user?.id ?? "";
  const { periodo: per } = usePeriodo();
  const hoje = diaSP(new Date());
  const iniMes = hoje.slice(0, 8) + "01";
  const { brokers, metricas, origens, vendas } = useDadosEquipe(managerId, [per.de, iniMes].sort()[0]);
  const { data: pastasData } = usePastas(managerId);
  const pastas = pastasData?.minhas ?? [];
  const [etapa, setEtapa] = useState(0);
  const [gaveta, setGaveta] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  // leads dos últimos 90 dias (qualquer status, para o funil e a lista); parados = ativos sem toque
  const { data: ld } = useQuery({
    queryKey: ["fv4-leads", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 864e5).toISOString();
      const ids = [...brokers.map((b) => b.id), managerId];
      let q = sb.from("leads").select(COLS_LEAD).gte("created_at", desde);
      q = ids.length > 1 ? q.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : q.eq("manager_id", managerId);
      return ((await q.order("created_at", { ascending: false }).limit(4000)).data ?? []) as LeadN[];
    },
  });
  const leads = ld ?? [];
  const { data: nomeCamp } = useQuery({
    queryKey: ["fv4-nomes"], staleTime: 10 * 60_000,
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
  const noPeriodo = (l: LeadN) => { const d = diaSP(new Date(l.created_at)); return d >= per.de && d <= per.ate; };
  const periodo = useMemo(() => leads.filter(noPeriodo), [leads, per.de, per.ate]);
  const nomeBroker = (id: string | null) => brokers.find((b) => b.id === id)?.first_name ?? (id === managerId ? "você" : "—");
  const corretores: Corretor[] = brokers.map((b) => ({ id: b.id, nome: b.first_name ?? "—", roleta: true }));
  const carteira = useMemo(() => { const m = new Map<string, number>(); for (const l of leads) if (l.broker_id && !ENCERRADO.has(l.status ?? "")) m.set(l.broker_id, (m.get(l.broker_id) ?? 0) + 1); return m; }, [leads]);

  // números do funil
  const funil = useMemo(() => {
    const lv = periodo.length;
    const contato = periodo.filter(atendido).length;
    const visitas = metricas.filter((m) => m.data >= per.de && m.data <= per.ate).reduce((s, m) => s + (m.atendimentos || 0), 0);
    const nPastas = pastas.filter((p) => { const c = p.cadastradaEm ? diaSP(new Date(p.cadastradaEm)) : null; return c && c >= per.de && c <= per.ate; }).length;
    const nVendas = vendas.filter((v) => v.dia >= per.de && v.dia <= per.ate).length;
    return [lv, contato, visitas, nPastas, nVendas];
  }, [periodo, metricas, pastas, vendas, per.de, per.ate]);
  const conv = funil.map((v, i) => (i === 0 ? null : pct(v, funil[i - 1])));

  // leads da etapa selecionada (etapas 0,1,4 têm lead; 2,3 vêm do C2S/Junix)
  const listaEtapa = useMemo(() => {
    if (etapa === 0) return periodo;
    if (etapa === 1) return periodo.filter(atendido);
    if (etapa === 4) return periodo.filter((l) => l.status === "CONCLUDED");
    if (etapa === 2) return periodo.filter((l) => VISITA.has(l.status ?? ""));
    return [] as LeadN[]; // pasta (3) não liga lead↔Junix
  }, [etapa, periodo]);

  // onde os leads estão parados: por corretor, leads ativos sem toque
  const parados = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) if (l.broker_id && !ENCERRADO.has(l.status ?? "") && !atendido(l)) m.set(l.broker_id, (m.get(l.broker_id) ?? 0) + 1);
    return [...m.entries()].map(([id, n]) => ({ id, nome: nomeBroker(id), n })).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [leads, brokers]);

  async function cobrar(leadIds: string[]) {
    if (!leadIds.length || cobrando) return;
    setCobrando(true);
    try { const r = await cobrarFila(leadIds, eu, "funil_v4"); const ok = r.corretores.filter((c) => c.avisado_no_whats).length; toast.success(ok ? "Cobrado no WhatsApp." : "Cobrança registrada (corretor sem WhatsApp ligado)."); }
    catch (e: any) { toast.error(e?.message ?? "Não consegui cobrar."); }
    finally { setCobrando(false); }
  }

  return (
    <section className="fv4">
      <style>{CSS}</style><style>{LEADS_CSS}</style>

      {/* FUNIL — 5 etapas clicáveis */}
      <div className="fv4-funil">
        {ETAPAS.map((nome, i) => (
          <button key={nome} className={`fv4-et${etapa === i ? " on" : ""}${i === 4 ? " fim" : ""}`} onClick={() => setEtapa(i)} aria-pressed={etapa === i}>
            <span className="fv4-et-h">Etapa {i + 1} {conv[i] != null && <i>{conv[i]}% conv.</i>}{i === 0 && <i>base 100%</i>}</span>
            <b className="fv4-et-n">{nome}</b>
            <span className="fv4-et-v">{nf(funil[i])}</span>
          </button>
        ))}
      </div>

      <div className="fv4-grid">
        {/* LISTA DA ETAPA */}
        <div className="fv4-lista">
          <div className="fv4-lh">
            <div><h3>Leads na etapa {etapa + 1}: {ETAPAS[etapa]} ({nf(funil[etapa])})</h3>
              <p>Clique em qualquer etapa do funil acima para inspecionar.</p></div>
          </div>
          {etapa === 2 || etapa === 3 ? (
            <div className="fv4-vazio">Esta etapa vem do {etapa === 2 ? "plantão (C2S)" : "Junix"}, que não liga a visita/pasta a um lead específico. Veja os leads nas etapas 1 e 2, e o detalhe em {etapa === 2 ? "Equipe hoje" : "Pastas"}.</div>
          ) : !listaEtapa.length ? (
            <div className="fv4-vazio">Nenhum lead nesta etapa no período.</div>
          ) : (
            <div className="fv4-rows">
              {listaEtapa.slice(0, 40).map((l) => {
                const s = situacao(l);
                return (
                  <div key={l.id} className="fv4-row">
                    <div className="fv4-cli"><b>{l.name || "—"}</b><small>{l.phone || ""}</small></div>
                    <div className="fv4-org">{origemLabel(l, nomeCamp)}</div>
                    <div className="fv4-cor">{nomeBroker(l.broker_id)}
                      <span className="fv4-sit" style={{ color: SIT[s.k]?.[0], background: SIT[s.k]?.[1] }}>{s.txt}</span></div>
                    <div className="fv4-tmp">{ha(l.last_broker_whatsapp_at ?? l.created_at)}</div>
                    <div className="fv4-aco">
                      <button className="fv4-b cobra" disabled={cobrando} onClick={() => cobrar([l.id])}>Cobrar</button>
                      <button className="fv4-b ver" onClick={() => setGaveta(l.id)}>Ver</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ONDE OS LEADS ESTÃO PARADOS */}
        <aside className="fv4-parados">
          <h3>🚩 Onde os leads estão parados</h3>
          <p>Corretores com acúmulo de clientes sem avanço.</p>
          {!parados.length ? <div className="fv4-vazio">Ninguém com acúmulo agora. ✅</div> : parados.map((b) => (
            <div key={b.id} className="fv4-par">
              <div><b>{b.nome}</b><small>{b.n} leads sem nenhum toque</small></div>
              <button className="fv4-b cobra" disabled={cobrando} onClick={() => cobrar(leads.filter((l) => l.broker_id === b.id && !ENCERRADO.has(l.status ?? "") && !atendido(l)).map((l) => l.id))}>Cobrar</button>
            </div>
          ))}
        </aside>
      </div>

      {gaveta && <LeadGaveta leadId={gaveta} como={como ?? null} corretores={corretores} carteira={carteira} onFechar={() => setGaveta(null)} />}
    </section>
  );
}

const CSS = `
.fv4{display:flex;flex-direction:column;gap:16px}
.fv4-funil{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.mgr10 .fv4-et{text-align:left;padding:13px 14px;border-radius:12px;border:1px solid var(--cv-border,#E7EDF6);background:var(--cv-surface,#fff);cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:transform .08s}
.mgr10 .fv4-et:active{transform:scale(.99)}
.mgr10 .fv4-et.on{border-color:#1f63e0;box-shadow:0 0 0 2px rgba(31,99,224,.25)}
.mgr10 .fv4-et.fim{background:#E8F4EE}
.fv4-et-h{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--cv-text-muted,#6B7A90);display:flex;justify-content:space-between;gap:6px}
.fv4-et-h i{font-style:normal;color:#A8322A}
.fv4-et.fim .fv4-et-h i{color:#1D6B45}
.fv4-et-n{font-size:13.5px;font-weight:800;line-height:1.15}
.fv4-et-v{font-family:"JetBrains Mono",monospace;font-size:26px;font-weight:700;color:#1f63e0}
.fv4-et.fim .fv4-et-v{color:#1D6B45}
.fv4-grid{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:14px}
.fv4-lista,.fv4-parados{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:16px}
.fv4-lh{margin-bottom:10px}
.fv4-lista h3,.fv4-parados h3{margin:0;font-size:15px;font-weight:800}
.fv4-lh p,.fv4-parados p{margin:3px 0 0;font-size:12.5px;color:var(--cv-text-muted,#6B7A90)}
.fv4-vazio{padding:18px 4px;font-size:13.5px;color:var(--cv-text-muted,#6B7A90)}
.fv4-rows{display:flex;flex-direction:column}
.fv4-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.1fr) auto auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--cv-border,#EEF2F8)}
.fv4-row:first-child{border-top:0}
.fv4-cli{display:flex;flex-direction:column;min-width:0}
.fv4-cli b{font-size:13.5px;font-weight:700}
.fv4-cli small,.fv4-tmp{font-size:12px;color:var(--cv-text-muted,#6B7A90);font-family:"JetBrains Mono",monospace}
.fv4-org{font-size:12.5px;color:#1f63e0;font-weight:600;min-width:0}
.fv4-cor{display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:600;min-width:0}
.fv4-sit{align-self:flex-start;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px}
.fv4-aco{display:flex;gap:6px}
.mgr10 .fv4-b{min-height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--cv-border,#DCE3EE);background:var(--cv-surface,#fff);font-size:12.5px;font-weight:700;cursor:pointer}
.mgr10 .fv4-b.cobra{color:#0f8a63;border-color:rgba(31,169,124,.4);background:rgba(31,169,124,.08)}
.mgr10 .fv4-b:disabled{opacity:.5;cursor:not-allowed}
.fv4-par{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px;border-radius:10px;background:var(--cv-sunk,#F6F8FB);margin-top:8px}
.fv4-par small{display:block;font-size:12px;color:#A8322A;font-weight:600}
@media (max-width:1000px){.fv4-grid{grid-template-columns:1fr}.fv4-funil{grid-template-columns:repeat(2,1fr)}.fv4-row{grid-template-columns:1fr 1fr;gap:6px}.fv4-org,.fv4-tmp{display:none}}
`;
