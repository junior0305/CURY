// Central de Leads & Performance (mockup V4 do Junior, 14/11). Casca de 3 áreas + Diagnóstico da semana no topo.
// Reaproveita o que já existe: Funil = FunilCompleto, Campanhas & Mídia = AnunciosGerente, Todos os Leads = LeadsOrigem.
// O Diagnóstico é uma FRASE montada por regra sobre dado real (template, nada estimado, nada de IA).
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


const sb = supabase as any;
type Aba = "funil" | "campanhas" | "leads" | "tarefas";
const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0);

export default function LeadsCentral() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const gerente = useEffectiveManagerId() ?? session?.user?.id ?? "";
  const como = gerente !== session?.user?.id ? gerente : undefined;
  const [aba, setAba] = useState<Aba>("funil");
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
    // corretor que mais acumula leads sem toque
    const porBroker = new Map<string, number>();
    for (const l of semToque) if (l.broker_id) porBroker.set(l.broker_id, (porBroker.get(l.broker_id) ?? 0) + 1);
    const pior = [...porBroker.entries()].sort((a, b) => b[1] - a[1])[0];
    const piorNome = pior ? (data?.nome.get(pior[0])?.split(" ")[0] ?? "um corretor") : null;
    return { total, semToque: semToque.length, parados30, pctSla, piorNome, piorN: pior?.[1] ?? 0, nAtivas: (data?.campanhas ?? []).length };
  }, [data]);

  return (
    <div className="mgr10 app2">
      <style>{CSS}</style>
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="lc-top">
          <div>
            <h1>Central de Leads &amp; Performance</h1>
            <p>Decida primeiro, depois a lista. Números em tempo real, do Comandra e do Facebook.</p>
          </div>
          <div className="lc-top-dir"><SeletorPeriodo /></div>
        </header>

        {/* ABAS (3) */}
        <nav className="lc-abas" role="tablist">
          {([
            ["funil", "📊", "Funil comercial", "5 etapas"],
            ["campanhas", "🎯", "Campanhas & mídia", diag.nAtivas ? `${diag.nAtivas} ativas` : "mídia"],
            ["leads", "📋", "Todos os leads & ação", diag.semToque ? `${diag.semToque} sem toque` : "a carteira"],
            ["tarefas", "✅", "Tarefas da equipe", data?.tarefas?.length ? `${data.tarefas.length} abertas` : "em dia"],
          ] as [Aba, string, string, string][]).map(([k, ic, lb, sub]) => (
            <button key={k} role="tab" aria-selected={aba === k} className={`lc-aba${aba === k ? " on" : ""}`} onClick={() => setAba(k)}>
              <span className="lc-aba-ic">{ic}</span>
              <span className="lc-aba-tx"><b>{lb}</b><small>{sub}</small></span>
            </button>
          ))}
        </nav>

        {/* DIAGNÓSTICO DA SEMANA — frase por regra, número real */}
        <section className="lc-diag" aria-label="Diagnóstico operacional">
          <span className="lc-diag-ic">💡</span>
          <div className="lc-diag-tx">
            <h3>Diagnóstico operacional</h3>
            {diag.total > 0 ? (
              <p>
                <b>{diag.pctSla}%</b> dos leads ativos já tiveram primeiro contato.
                {diag.piorNome && diag.piorN > 0 && <> O corretor <b>{diag.piorNome}</b> acumula <b>{diag.piorN}</b> leads sem toque.</>}
                {diag.parados30 > 0 && <> <b>{diag.parados30}</b> estão parados há mais de 30 dias.</>}
              </p>
            ) : <p>Nenhum lead ativo no momento.</p>}
          </div>
          {diag.semToque > 0 && (
            <button className="lc-diag-b" onClick={() => setAba("leads")}>⚡ Resgatar {diag.semToque} leads parados</button>
          )}
        </section>

        <section className="lc-conteudo">
          {aba === "funil" && <FunilV4 managerId={gerente} como={como ?? null} />}
          {aba === "campanhas" && <CampanhasV4 donoId={gerente} />}
          {aba === "leads" && <TodosLeadsV4 como={como ?? null} />}
          {aba === "tarefas" && <TarefasV4 managerId={gerente} />}
        </section>
      </main>
    </div>
  );
}

const CSS = `
.lc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.lc-top h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em}
.lc-top p{margin:4px 0 0;font-size:13.5px;color:var(--cv-text-muted,#5B6B80)}
.lc-top-dir{display:flex;gap:10px;align-items:center}
.lc-abas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.lc-tarefas{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-radius:14px;padding:16px}
.lc-tarefas h3{margin:0 0 10px;font-size:15px;font-weight:800}
.lc-t-vazio{font-size:13.5px;color:var(--cv-text-muted,#6B7A90)}
.lc-t-rows{display:flex;flex-direction:column}
.lc-t-row{display:grid;grid-template-columns:150px minmax(0,1fr) 110px 80px;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--cv-border,#EEF2F8);font-size:13.5px}
.lc-t-row:first-child{border-top:0}
.lc-t-quando{font-size:12px;color:var(--cv-text-muted,#6B7A90);font-family:"JetBrains Mono",monospace}
.lc-t-row.atr .lc-t-quando{color:#A8322A;font-weight:700}
.lc-t-tit{font-weight:600;min-width:0}
.lc-t-quem{font-size:12.5px;color:var(--cv-text-muted,#6B7A90)}
.lc-t-ver{font-size:12.5px;font-weight:700;color:#1f63e0;text-decoration:none}
@media (max-width:700px){.lc-t-row{grid-template-columns:1fr auto;gap:4px}.lc-t-quem{display:none}}
.lc-aba{display:flex;align-items:center;gap:10px;text-align:left;padding:13px 16px;border-radius:12px;border:1px solid var(--cv-border,#E7EDF6);background:var(--cv-surface,#fff);cursor:pointer;transition:transform .08s ease}
.lc-aba:active{transform:scale(.99)}
.lc-aba.on{background:#1f63e0;border-color:#1f63e0}
.lc-aba.on *{color:#fff !important}
.lc-aba-ic{font-size:19px;line-height:1}
.lc-aba-tx{display:flex;flex-direction:column;min-width:0}
.lc-aba-tx b{font-size:14.5px;font-weight:800;line-height:1.2}
.lc-aba-tx small{font-size:11.5px;color:var(--cv-text-muted,#6B7A90)}
.lc-diag{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid var(--cv-border,#DCE6F5);border-radius:14px;padding:14px 18px;margin-bottom:18px;background:linear-gradient(180deg,rgba(66,133,244,.08),rgba(66,133,244,.02))}
.lc-diag-ic{font-size:26px;line-height:1;background:rgba(66,133,244,.14);width:46px;height:46px;border-radius:12px;display:grid;place-items:center;flex:none}
.lc-diag-tx{flex:1;min-width:220px}
.lc-diag-tx h3{margin:0 0 3px;font-size:14px;font-weight:800}
.lc-diag-tx p{margin:0;font-size:14px;line-height:1.5;color:var(--cv-text-main,#27364B)}
.lc-diag-b{flex:none;min-height:44px;padding:0 18px;border-radius:10px;border:0;background:#1f63e0;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.lc-diag-b:active{transform:scale(.99)}
.lc-conteudo{min-height:300px}
@media (max-width:900px){.lc-abas{grid-template-columns:1fr 1fr}.lc-diag{flex-direction:column;align-items:flex-start}.lc-diag-b{width:100%}}
`;
