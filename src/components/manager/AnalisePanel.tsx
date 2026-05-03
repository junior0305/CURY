import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart3, TrendingUp, TrendingDown, Minus, RefreshCw,
  Trophy, Loader2, Megaphone, AlertTriangle, Building2, Star,
} from "lucide-react";

interface TeamRow {
  manager_id: string;
  manager_name: string;
  team_size: number;
  sales: number;
  sales_per_broker: number;
  visits: number;
  docs: number;
  new_leads: number;
  sales_delta_pct: number;
  visits_delta_pct: number;
  campaigns: number;
  best_campaign_name: string | null;
  best_qualified_rate: number;
  target: number;
  ads_invested: number;
  cac: number | null;
  progress_pct: number | null;
}

interface LostReasonRow {
  reason: string;
  count: number;
  pct: number;
}

interface ProductRow {
  product: string;
  leads: number;
  qualified: number;
  qualified_pct: number;
  concluded: number;
}

interface Props {
  managerId: string;
}

const REASON_LABELS: Record<string, string> = {
  SEM_RETORNO:     "Sumiu / não responde",
  DESISTIU:        "Desistiu",
  FOI_CONCORRENTE: "Foi pra concorrência",
  NUMERO_ERRADO:   "Número errado",
  NAO_COMPARECEU:  "Não compareceu na visita",
  RENDA_FORA_FAIXA:"Renda fora da faixa",
  JA_TEM_IMOVEL:   "Já tem imóvel",
  OPT_OUT:         "Pediu pra parar",
  PRECO:           "Preço/orçamento",
  APROVACAO:       "Reprovado banco",
  OUTRO:           "Outro",
};

const REASON_COLORS: Record<string, string> = {
  SEM_RETORNO:     "#94A3B8",
  DESISTIU:        "#F59E0B",
  FOI_CONCORRENTE: "#A855F7",
  NUMERO_ERRADO:   "#64748B",
  NAO_COMPARECEU:  "#F97316",
  RENDA_FORA_FAIXA:"#EAB308",
  JA_TEM_IMOVEL:   "#0EA5E9",
  OPT_OUT:         "#71717A",
  PRECO:           "#EF4444",
  APROVACAO:       "#DC2626",
  OUTRO:           "#475569",
};

export default function AnalisePanel({ managerId }: Props) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [lostReasons, setLostReasons] = useState<LostReasonRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState<number>(7);

  async function load() {
    setLoading(true);
    try {
      // 1) Heatmap competitivo
      const { data: comp } = await supabase.rpc("get_teams_competition_dashboard");
      const teamsList = (comp as any)?.teams || [];
      setTeams(teamsList);

      // 2) Brokers do manager pra filtrar leads
      const { data: brokers } = await supabase
        .from("profiles").select("id")
        .eq("manager_id", managerId).eq("role", "BROKER");
      const brokerIds = (brokers || []).map((b: any) => b.id);

      if (brokerIds.length === 0) {
        setLostReasons([]); setProducts([]); setLoading(false); return;
      }

      const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString();

      // 3) Motivos de perda
      const { data: lost } = await supabase
        .from("leads")
        .select("lost_reason")
        .in("broker_id", brokerIds)
        .not("lost_reason", "is", null)
        .gte("created_at", cutoff);

      const reasonCount = new Map<string, number>();
      (lost || []).forEach((l: any) => {
        const r = l.lost_reason || "OUTRO";
        reasonCount.set(r, (reasonCount.get(r) || 0) + 1);
      });
      const totalLost = Array.from(reasonCount.values()).reduce((a, b) => a + b, 0);
      const lostList: LostReasonRow[] = Array.from(reasonCount.entries())
        .map(([reason, count]) => ({ reason, count, pct: totalLost > 0 ? (count / totalLost) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      setLostReasons(lostList);

      // 4) Performance por produto
      const { data: leadsByProduct } = await supabase
        .from("leads")
        .select("id, product, status")
        .in("broker_id", brokerIds)
        .gte("created_at", cutoff)
        .not("product", "is", null);

      const QUALIFIED = ["IN_PROGRESS","NEGOTIATING","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED","CONCLUDED"];
      const productMap = new Map<string, { leads: number; qualified: number; concluded: number }>();
      (leadsByProduct || []).forEach((l: any) => {
        const p = (l.product || "").toUpperCase().trim() || "(SEM PRODUTO)";
        const cur = productMap.get(p) || { leads: 0, qualified: 0, concluded: 0 };
        cur.leads++;
        if (QUALIFIED.includes(l.status)) cur.qualified++;
        if (l.status === "CONCLUDED") cur.concluded++;
        productMap.set(p, cur);
      });
      const productList: ProductRow[] = Array.from(productMap.entries())
        .map(([product, v]) => ({
          product, leads: v.leads, qualified: v.qualified, concluded: v.concluded,
          qualified_pct: v.leads > 0 ? (v.qualified / v.leads) * 100 : 0,
        }))
        .filter(p => p.leads >= 3)
        .sort((a, b) => b.leads - a.leads);
      setProducts(productList);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerId, periodDays]);

  // Highlight da semana — encontra o destaque positivo
  const highlight = useMemo(() => {
    if (teams.length === 0) return null;
    const me = teams.find(t => t.manager_id === managerId);
    const others = teams.filter(t => t.manager_id !== managerId);
    if (others.length === 0) return null;

    const bestSalesDelta = [...others].sort((a, b) => b.sales_delta_pct - a.sales_delta_pct)[0];
    const bestVisitsDelta = [...others].sort((a, b) => b.visits_delta_pct - a.visits_delta_pct)[0];
    const mostCampaigns = [...others].sort((a, b) => b.campaigns - a.campaigns)[0];

    if (bestSalesDelta && bestSalesDelta.sales_delta_pct > 30) {
      return { text: `${bestSalesDelta.manager_name} subiu ${bestSalesDelta.sales_delta_pct.toFixed(0)}% em vendas vs semana anterior`, kind: "sales" };
    }
    if (bestVisitsDelta && bestVisitsDelta.visits_delta_pct > 50) {
      return { text: `${bestVisitsDelta.manager_name} subiu ${bestVisitsDelta.visits_delta_pct.toFixed(0)}% em visitas`, kind: "visits" };
    }
    if (mostCampaigns && mostCampaigns.campaigns > 0 && (!me || mostCampaigns.campaigns > me.campaigns)) {
      return { text: `${mostCampaigns.manager_name} disparou ${mostCampaigns.campaigns} campanha(s) essa semana`, kind: "campaigns" };
    }
    return null;
  }, [teams, managerId]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[7, 30].map(d => (
            <button key={d} onClick={() => setPeriodDays(d)}
              className={`px-2 py-1 text-xs rounded transition-colors ${periodDays === d ? "bg-cyan-900/60 text-cyan-200 border border-cyan-500/40" : "bg-slate-800 text-gray-400 hover:text-gray-200"}`}>
              {d === 7 ? "Esta semana" : "30 dias"}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-gray-400 hover:text-gray-200 inline-flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Highlight */}
      {highlight && (
        <div className="bg-gradient-to-r from-amber-900/40 to-amber-950/20 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <Star className="w-5 h-5 text-amber-300 flex-shrink-0" />
          <div className="text-xs text-amber-100">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-300/80">Destaque da semana</span>
            <div>{highlight.text}</div>
          </div>
        </div>
      )}

      {/* 1) Heatmap competitivo */}
      <Section title="Comparativo das equipes" icon={Trophy}>
        {loading && teams.length === 0 ? (
          <Loading />
        ) : teams.length === 0 ? (
          <Empty msg="Sem dados de equipes" />
        ) : (
          <div className="space-y-2">
            {teams.map(t => {
              const isMe = t.manager_id === managerId;
              return (
                <div key={t.manager_id}
                     className={`bg-slate-900/40 border rounded-lg p-2.5 ${isMe ? "border-cyan-500/40 ring-1 ring-cyan-500/30" : "border-gray-700/50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isMe ? "text-cyan-200" : "text-gray-200"}`}>
                        {t.manager_name} {isMe && <span className="text-[10px] text-cyan-400">(você)</span>}
                      </span>
                      <span className="text-[10px] text-gray-500">{t.team_size} corretores</span>
                    </div>
                    <DeltaBadge value={t.sales_delta_pct} />
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    <Stat label="Vendas"  value={t.sales}    target={t.target} />
                    <Stat label="Pastas"  value={t.docs} />
                    <Stat label="Visitas" value={t.visits} />
                    <Stat label="Leads"   value={t.new_leads} />
                    <Stat label="Camp."   value={t.campaigns} />
                  </div>
                  {t.best_campaign_name && t.best_qualified_rate > 0 && (
                    <div className="mt-1.5 text-[10px] text-emerald-300 inline-flex items-center gap-1">
                      <Megaphone className="w-3 h-3" />
                      Best campaign: <strong>{t.best_campaign_name}</strong> ({t.best_qualified_rate.toFixed(1)}% qualif)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 2) Motivos de perda */}
      <Section title="Motivos de perda" icon={AlertTriangle}>
        {loading && lostReasons.length === 0 ? (
          <Loading />
        ) : lostReasons.length === 0 ? (
          <Empty msg="Nenhuma perda registrada no período (parabéns!)" />
        ) : (
          <div className="space-y-1.5">
            {lostReasons.map(r => (
              <div key={r.reason} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-gray-300">{REASON_LABELS[r.reason] || r.reason}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: REASON_COLORS[r.reason] || "#475569" }} />
                </div>
                <span className="w-20 text-right font-mono text-gray-400">{r.count} ({r.pct.toFixed(0)}%)</span>
              </div>
            ))}
            <div className="text-[10px] text-gray-500 italic mt-2 px-1">
              💡 Ataque o motivo mais frequente: vale mais reduzir 10% do top que zerar o último.
            </div>
          </div>
        )}
      </Section>

      {/* 3) Performance por produto */}
      <Section title="Performance por produto" icon={Building2}>
        {loading && products.length === 0 ? (
          <Loading />
        ) : products.length === 0 ? (
          <Empty msg="Sem produtos com volume suficiente (≥3 leads)" />
        ) : (
          <div className="space-y-1.5">
            {products.map(p => (
              <div key={p.product} className="bg-slate-900/40 border border-gray-700/50 rounded p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-100 font-medium">{p.product}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    p.qualified_pct >= 30 ? "bg-emerald-900/40 text-emerald-200 border-emerald-500/40" :
                    p.qualified_pct >= 15 ? "bg-amber-900/40 text-amber-200 border-amber-500/40" :
                                            "bg-red-900/40 text-red-200 border-red-500/40"
                  }`}>{p.qualified_pct.toFixed(0)}% qualif</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-gray-400">{p.leads} leads</span>
                  <span className="text-amber-300">{p.qualified} qualificados</span>
                  <span className="text-emerald-300">{p.concluded} vendidos</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, target }: { label: string; value: number; target?: number }) {
  return (
    <div className="bg-slate-900/60 rounded px-1.5 py-1 text-center">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm font-bold text-gray-100 leading-tight">
        {value}{target ? <span className="text-gray-500 text-[10px] font-normal">/{target}</span> : null}
      </div>
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  if (Math.abs(value) < 1) return (
    <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5"><Minus className="w-3 h-3" />estável</span>
  );
  const pos = value > 0;
  return (
    <span className={`text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
      pos ? "bg-emerald-900/40 text-emerald-200" : "bg-red-900/40 text-red-200"
    }`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value > 0 ? "+" : ""}{value.toFixed(0)}%
    </span>
  );
}

function Loading() {
  return <div className="text-center text-gray-500 py-4 inline-flex items-center justify-center gap-2 w-full"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</div>;
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-center text-gray-500 py-3 text-xs italic">{msg}</div>;
}
