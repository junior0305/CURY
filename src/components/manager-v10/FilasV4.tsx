// Filas & Roletas de Anúncios — dashboard no design do mockup V4 (Junior 15/11).
// Cartão por formulário: Fila Ativa (Rodízio) × Sem Fila Específica, corretores na roleta com status (Online/Plantão/N leads),
// leads 7d, e Editar/Criar fila (abre a gaveta compartilhada FilasFormulario, que já faz a edição com as RPCs/segurança).
// Dado REAL: formularios_catalogo + distribution_queues + presença dos corretores + fb_saude (nome da conta).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import FilasFormulario from "@/components/leads/FilasFormulario";

const sb = supabase as any;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const nomeDe = (p?: any) => (p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—" : "—");
const ini = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();

export default function FilasV4({ donoId, como }: { donoId: string; como?: string | null }) {
  const [edit, setEdit] = useState<string | null>(null); // "*" (nova) ou form_id

  const { data, isLoading } = useQuery({
    queryKey: ["filasv4", donoId],
    enabled: !!donoId,
    staleTime: 60_000,
    queryFn: async () => {
      const hoje = hojeSP();
      const t0 = new Date(`${hoje}T00:00:00-03:00`).toISOString();
      const [catR, filaR, brokR, saudeR, leadsHojeR] = await Promise.all([
        sb.from("formularios_catalogo").select("form_id,nome,owner_id,leads_7d,anuncio_ativo,ad_account_id"),
        sb.from("distribution_queues").select("match_value,broker_ids,criado_por").eq("match_field", "form_id").eq("is_active", true),
        sb.from("profiles").select("id,first_name,last_name,last_seen_at,lead_assignment_enabled,roleta_entrou_em").eq("manager_id", donoId).eq("role", "BROKER").eq("is_active", true),
        sb.from("fb_saude").select("account_id,dados->>conta"),
        sb.from("leads").select("broker_id").eq("manager_id", donoId).gte("created_at", t0),
      ]);
      const filaDe = new Map<string, any>(((filaR.data ?? []) as any[]).map((f) => [f.match_value, f]));
      const brokers = (brokR.data ?? []) as any[];
      const contas = new Map<string, string>();
      for (const r of (saudeR.data ?? []) as any[]) if (r.conta) contas.set(String(r.account_id), r.conta);
      const leadsHoje = new Map<string, number>();
      for (const l of (leadsHojeR.data ?? []) as any[]) if (l.broker_id) leadsHoje.set(l.broker_id, (leadsHoje.get(l.broker_id) ?? 0) + 1);
      // formulários do gerente: dono dele, ou com fila criada por ele — só os em uso (anúncio ativo ou lead 7d)
      const forms = ((catR.data ?? []) as any[])
        .filter((f) => (f.anuncio_ativo || f.leads_7d > 0) && (f.owner_id === donoId || filaDe.has(f.form_id)))
        .sort((a, b) => (filaDe.has(b.form_id) ? 1 : 0) - (filaDe.has(a.form_id) ? 1 : 0) || (b.leads_7d || 0) - (a.leads_7d || 0));
      return { forms, filaDe, brokers: new Map(brokers.map((b) => [b.id, b])), contas, leadsHoje, hoje };
    },
  });

  const statusBroker = (b: any) => {
    if (!b) return { t: "fora da equipe", c: "var(--cv-text-dim,#8A97A8)" };
    const online = b.last_seen_at && Date.now() - new Date(b.last_seen_at).getTime() < 15 * 60_000;
    const plantao = b.roleta_entrou_em && String(b.roleta_entrou_em).slice(0, 10) === data?.hoje;
    const lt = data?.leadsHoje.get(b.id) ?? 0;
    if (online) return { t: "Online", c: "#10B981" };
    if (plantao) return { t: "Plantão", c: "#38BDF8" };
    if (lt) return { t: `${lt} leads`, c: "#F59E0B" };
    return { t: "na fila", c: "var(--cv-text-dim,#8A97A8)" };
  };

  const forms = data?.forms ?? [];
  const comFila = useMemo(() => forms.filter((f) => data?.filaDe.has(f.form_id)).length, [forms, data]);

  return (
    <section className="flx">
      <style>{CSS}</style>
      <div className="flx-head">
        <div>
          <h2>🔄 Distribuição de leads por formulário Meta Ads</h2>
          <p>A fila do formulário <b>manda</b>: os corretores escolhidos recebem em rodízio exclusivo, mesmo fora do estande. Sem fila, segue a roleta do plantão.</p>
        </div>
        <button className="flx-nova" onClick={() => setEdit("*")}>+ Criar / gerenciar filas</button>
      </div>

      {isLoading ? <p className="flx-vazio">Carregando os formulários…</p> : !forms.length ? (
        <p className="flx-vazio">Nenhum formulário em uso agora. Quando um anúncio começar a rodar, ele aparece aqui.</p>
      ) : (
        <div className="flx-grid">
          {forms.map((f) => {
            const fila = data?.filaDe.get(f.form_id);
            const ids: string[] = fila?.broker_ids ?? [];
            const conta = f.ad_account_id ? (data?.contas.get(String(f.ad_account_id)) ?? `conta ${f.ad_account_id}`) : "—";
            return (
              <article key={f.form_id} className={`flx-card${fila ? "" : " sem"}`}>
                <div className="flx-card-top">
                  <b className="flx-nome">{f.nome || "Formulário"}</b>
                  {fila
                    ? <span className="flx-tag ativa">● Fila ativa (rodízio)</span>
                    : <span className="flx-tag semfila">⚠️ Sem fila específica</span>}
                </div>
                <div className="flx-meta">Formulário ID: {f.form_id} · Conta: {conta}</div>

                {fila ? (
                  <>
                    <div className="flx-roleta-lbl">👥 Corretores na roleta deste formulário ({ids.length}):</div>
                    <div className="flx-pills">
                      {ids.map((id) => { const b = data?.brokers.get(id); const s = statusBroker(b); return (
                        <span key={id} className="flx-pill"><span className="flx-av">{ini(nomeDe(b))}</span><b>{nomeDe(b).split(" ")[0]}</b> <i style={{ color: s.c }}>({s.t})</i></span>
                      ); })}
                      {!ids.length && <span className="flx-mut">Nenhum corretor na fila.</span>}
                    </div>
                    <div className="flx-foot">
                      <span>{f.leads_7d || 0} leads · 7 dias · rodízio exclusivo</span>
                      <button className="flx-b edit" onClick={() => setEdit(f.form_id)}>⚙️ Editar fila</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flx-aviso"><b>Atenção:</b> anúncio ativo e sem corretores dedicados. Os leads caem na <b>roleta ampla do plantão</b>.</div>
                    <div className="flx-foot">
                      <span>{f.leads_7d || 0} leads recebidos · roleta geral</span>
                      <button className="flx-b criar" onClick={() => setEdit(f.form_id)}>⚡ Criar fila agora</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {forms.length > 0 && <p className="flx-resumo">{comFila} de {forms.length} formulários em uso têm fila dedicada. O resto segue a roleta do plantão.</p>}

      {edit && <FilasFormulario como={como ?? null} abrir={edit} semCartao onFechar={() => setEdit(null)} />}
    </section>
  );
}

const CSS = `
.flx{display:flex;flex-direction:column;gap:16px}
.flx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;background:var(--cv-sunk,#F7FAFF);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:16px 18px}
.flx-head h2{margin:0;font-size:17px;font-weight:800}
.flx-head p{margin:5px 0 0;font-size:12.5px;line-height:1.5;color:var(--cv-text-muted,#6B7A90);max-width:70ch}
.mgr10 .flx-nova{flex:none;min-height:42px;padding:0 16px;border-radius:11px;border:1px solid rgba(14,165,233,.35);background:rgba(14,165,233,.12);color:#38BDF8;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.mgr10 .flx-nova:hover{background:#0EA5E9;color:#fff}
.flx-vazio{padding:28px 6px;font-size:14px;color:var(--cv-text-muted,#6B7A90)}
.flx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.flx-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:11px;transition:all .2s}
.flx-card:hover{transform:translateY(-2px);border-color:#38BDF8}
.flx-card.sem{border-color:rgba(245,158,11,.45)}
.flx-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.flx-nome{font-size:15.5px;font-weight:800;line-height:1.2;color:var(--cv-text-main,#1a2435)}
.flx-tag{flex:none;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;white-space:nowrap}
.flx-tag.ativa{color:#10B981;background:rgba(16,185,129,.14)}
.flx-tag.semfila{color:#E8912B;background:rgba(245,158,11,.14)}
.flx-meta{font-size:12px;color:var(--cv-text-dim,#8A97A8);font-family:"JetBrains Mono",monospace}
.flx-roleta-lbl{font-size:12.5px;font-weight:700;color:var(--cv-text-muted,#5B6B80)}
.flx-pills{display:flex;flex-wrap:wrap;gap:8px}
.flx-pill{display:inline-flex;align-items:center;gap:7px;background:var(--cv-sunk,#F3F6FB);border:1px solid var(--cv-border,#E7EDF6);border-radius:999px;padding:4px 11px 4px 4px;font-size:12.5px}
.flx-pill b{font-weight:700;color:var(--cv-text-main,#1a2435)}
.flx-pill i{font-style:normal;font-weight:700;font-size:11.5px}
.flx-av{width:24px;height:24px;border-radius:50%;background:var(--cv-sunk,#1E293B);display:grid;place-items:center;font-size:10px;font-weight:800;color:var(--cv-text-main,#1a2435);border:1px solid var(--cv-border,#E7EDF6)}
.flx-mut{font-size:12.5px;color:var(--cv-text-muted,#6B7A90)}
.flx-aviso{font-size:12.5px;line-height:1.5;color:#B4322A;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:10px 12px}
.flx-aviso b{color:#E8912B}
.flx-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:4px;border-top:1px solid var(--cv-border,#EEF2F8);font-size:12px;color:var(--cv-text-muted,#6B7A90)}
.mgr10 .flx-b{flex:none;font:inherit;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:9px;cursor:pointer;border:1px solid transparent}
.mgr10 .flx-b.edit{background:rgba(14,165,233,.12);color:#38BDF8;border-color:rgba(14,165,233,.3)}
.mgr10 .flx-b.edit:hover{background:#0EA5E9;color:#fff}
.mgr10 .flx-b.criar{background:rgba(245,158,11,.14);color:#E8912B;border-color:rgba(245,158,11,.35)}
.mgr10 .flx-b.criar:hover{background:#F59E0B;color:#fff}
.flx-resumo{font-size:12.5px;color:var(--cv-text-muted,#6B7A90)}
@media (max-width:1000px){.flx-grid{grid-template-columns:1fr}}
`;
