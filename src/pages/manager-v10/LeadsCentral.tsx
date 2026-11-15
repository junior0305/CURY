// Central de Leads & Performance (mockup V5 do Junior, 14/11). Casca de 4 áreas + Radar do Gestor no topo.
// Reaproveita o que já existe: Funil = FunilCompleto, Campanhas = AnunciosGerente, Filas = FilasFormulario,
// Todos os Leads = LeadsOrigem. O Radar é 100% por regra sobre dado real (nada estimado, nada de IA).
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
import FunilCompleto from "@/components/manager-v10/FunilCompleto";
import AnunciosGerente from "@/components/anuncios/AnunciosGerente";
import FilasFormulario from "@/components/leads/FilasFormulario";
import LeadsOrigem from "@/components/leads/LeadsOrigem";

const sb = supabase as any;
type Aba = "funil" | "campanhas" | "filas" | "leads";
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0);

export default function LeadsCentral() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const gerente = useEffectiveManagerId() ?? session?.user?.id ?? "";
  const como = gerente !== session?.user?.id ? gerente : undefined;
  const [aba, setAba] = useState<Aba>("funil");
  loadFonts();

  const { data } = useQuery({
    queryKey: ["lc-radar", gerente],
    enabled: !!gerente,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const desde90 = new Date(Date.now() - 90 * 864e5).toISOString();
      const [ativosR, saudeR, formsR] = await Promise.all([
        sb.from("leads").select(COLS_LEAD).eq("manager_id", gerente)
          .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED,LOST)").gte("created_at", desde90),
        sb.from("fb_saude").select("dados").eq("dono_id", gerente),
        sb.from("formularios_catalogo").select("form_id").eq("owner_id", gerente),
      ]);
      const ativos = ((ativosR.data ?? []) as LeadN[]).filter((l) => !ehTeste(l));
      const campanhas = ((saudeR.data ?? []) as any[]).flatMap((s) => s.dados?.campanhas ?? [])
        .filter((c: any) => c.status === "ACTIVE");
      return { ativos, campanhas, forms: (formsR.data ?? []).length };
    },
  });

  const radar = useMemo(() => {
    const ativos = data?.ativos ?? [];
    const semToque = ativos.filter((l) => !atendido(l));
    const parados30 = semToque.filter((l) => dias(l.created_at) >= 30);
    const comCpl = (data?.campanhas ?? [])
      .map((c: any) => ({ nome: String(c.nome || "campanha"), gasto: Number(c.gasto || 0), leads: Number(c.leads || 0), cpl: Number(c.leads) > 0 ? Number(c.gasto) / Number(c.leads) : null }))
      .filter((c: any) => c.cpl != null && c.gasto > 0) as { nome: string; gasto: number; leads: number; cpl: number }[];
    const ordenado = [...comCpl].sort((a, b) => a.cpl - b.cpl);
    return {
      semToque: semToque.length,
      parados30: parados30.length,
      melhor: ordenado[0] ?? null,          // menor CPL = dinheiro na mesa
      pior: ordenado[ordenado.length - 1] ?? null,  // maior CPL = alerta de tráfego
      nAtivas: (data?.campanhas ?? []).length,
    };
  }, [data]);

  const irCampanhas = () => setAba("campanhas");

  return (
    <div className="mgr10">
      <style>{CSS}</style>
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <main className="shell2">
        <header className="lc-top">
          <div>
            <h1>Central de Leads &amp; Performance</h1>
            <p>Decida primeiro, depois a lista. Números em tempo real, do Comandra e do Facebook.</p>
          </div>
          <div className="lc-top-dir">
            <SeletorPeriodo />
            <button className="lc-tema" onClick={toggle} aria-label="Alternar tema">{mode === "dark" ? "☀️" : "🌙"}</button>
          </div>
        </header>

        {/* RADAR DO GESTOR */}
        <section className="lc-radar" aria-label="Radar do gestor">
          <div className="lc-radar-h"><span className="lc-dot" /> Radar do gestor · tempo real</div>
          <div className="lc-radar-cards">
            <article className="lc-card urg">
              <h3>🚩 Urgência · leads esquecidos</h3>
              {radar.semToque > 0 ? (
                <p><b>{radar.semToque}</b> leads sem nenhum toque{radar.parados30 > 0 && <> · <b>{radar.parados30}</b> parados há mais de 30 dias</>}. Dinheiro de mídia parado na gaveta.</p>
              ) : <p>Ninguém sem toque agora. A equipe está em dia com os leads. ✅</p>}
              <div className="lc-acoes">
                <button className="lc-b azul" onClick={() => setAba("leads")} disabled={!radar.semToque}>Ver quem está parado</button>
              </div>
            </article>

            <article className="lc-card din">
              <h3>💰 Dinheiro na mesa</h3>
              {radar.melhor ? (
                <p>A campanha <b>{radar.melhor.nome}</b> traz o lead mais barato da casa (<b>{brl(radar.melhor.cpl)}</b>/lead, {radar.melhor.leads} leads em 7 dias). Vale reforçar a fila e a verba.</p>
              ) : <p>Sem campanha com leads suficientes para comparar ainda.</p>}
              <div className="lc-acoes">
                <button className="lc-b verde" onClick={irCampanhas} disabled={!radar.melhor}>Ver campanha</button>
              </div>
            </article>

            <article className="lc-card traf">
              <h3>🎯 Alerta de tráfego</h3>
              {radar.pior && radar.pior !== radar.melhor ? (
                <p>A campanha <b>{radar.pior.nome}</b> está com o lead mais caro (<b>{brl(radar.pior.cpl)}</b>/lead). Hora de cobrar o tráfego ou pausar.</p>
              ) : <p>Nenhuma campanha com custo fora da curva no momento.</p>}
              <div className="lc-acoes">
                <button className="lc-b laranja" onClick={irCampanhas} disabled={!radar.pior || radar.pior === radar.melhor}>Ver métricas</button>
              </div>
            </article>
          </div>
        </section>

        {/* ABAS */}
        <nav className="lc-abas" role="tablist">
          {([
            ["funil", "📊", "Funil comercial", "5 etapas"],
            ["campanhas", "🎯", "Campanhas & mídia", radar.nAtivas ? `${radar.nAtivas} ativas` : "mídia"],
            ["filas", "🔁", "Filas & roletas", data?.forms ? `${data.forms} formulários` : "filas"],
            ["leads", "📋", "Todos os leads", radar.semToque ? `${radar.semToque} sem toque` : "a carteira"],
          ] as [Aba, string, string, string][]).map(([k, ic, lb, sub]) => (
            <button key={k} role="tab" aria-selected={aba === k} className={`lc-aba${aba === k ? " on" : ""}`} onClick={() => setAba(k)}>
              <span className="lc-aba-ic">{ic}</span>
              <span className="lc-aba-tx"><b>{lb}</b><small>{sub}</small></span>
            </button>
          ))}
        </nav>

        <section className="lc-conteudo">
          {aba === "funil" && <FunilCompleto managerId={gerente} />}
          {aba === "campanhas" && <AnunciosGerente embutido donoId={gerente} />}
          {aba === "filas" && <FilasFormulario como={como ?? null} abrir="*" semCartao />}
          {aba === "leads" && <LeadsOrigem como={como ?? null} />}
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
.lc-tema{min-height:40px;min-width:40px;border-radius:10px;border:1px solid var(--cv-border,#E1E6EE);background:var(--cv-surface,#fff);font-size:16px;cursor:pointer}
.lc-radar{border:1px solid var(--cv-border,#DCE6F5);border-radius:16px;padding:14px;margin-bottom:18px;background:linear-gradient(180deg,rgba(66,133,244,.07),rgba(66,133,244,.02))}
.lc-radar-h{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#2a6df0;margin:0 2px 12px}
.lc-dot{width:9px;height:9px;border-radius:50%;background:#2a6df0;box-shadow:0 0 0 4px rgba(42,109,240,.18)}
.lc-radar-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.lc-card{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E7EDF6);border-left-width:4px;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.lc-card.urg{border-left-color:#E2514A}
.lc-card.din{border-left-color:#1FA97C}
.lc-card.traf{border-left-color:#E8912B}
.lc-card h3{margin:0;font-size:14.5px;font-weight:800}
.lc-card p{margin:0;font-size:13.5px;line-height:1.5;color:var(--cv-text-main,#27364B)}
.lc-acoes{display:flex;gap:8px;margin-top:auto;padding-top:4px;flex-wrap:wrap}
.lc-b{min-height:38px;padding:0 14px;border-radius:9px;border:1px solid transparent;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.lc-b:disabled{opacity:.4;cursor:not-allowed}
.lc-b.azul{background:rgba(42,109,240,.1);color:#1f63e0}
.lc-b.verde{background:rgba(31,169,124,.12);color:#0f8a63}
.lc-b.laranja{background:rgba(232,145,43,.14);color:#b36c12}
.lc-abas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.lc-aba{display:flex;align-items:center;gap:10px;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--cv-border,#E7EDF6);background:var(--cv-surface,#fff);cursor:pointer;transition:transform .08s ease}
.lc-aba:active{transform:scale(.99)}
.lc-aba.on{background:#1f63e0;border-color:#1f63e0}
.lc-aba.on *{color:#fff !important}
.lc-aba-ic{font-size:18px;line-height:1}
.lc-aba-tx{display:flex;flex-direction:column;min-width:0}
.lc-aba-tx b{font-size:14px;font-weight:800;line-height:1.2}
.lc-aba-tx small{font-size:11.5px;color:var(--cv-text-muted,#6B7A90)}
.lc-conteudo{min-height:300px}
@media (max-width:900px){.lc-radar-cards{grid-template-columns:1fr}.lc-abas{grid-template-columns:1fr 1fr}}
`;
