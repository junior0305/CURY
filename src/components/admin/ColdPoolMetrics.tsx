// ColdPoolMetrics — 3 indicadores essenciais pro admin: funnel, por produto, top brokers.
// Renderizado no topo da página ColdPool.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Trophy, Layers, RefreshCw } from "lucide-react";

interface FunnelData {
  pool: number;
  claimed: number;
  withFirstMsg: number;
  responded: number;
  sold: number;
}

interface ProductRow {
  product: string;
  pool: number;
  claimed: number;
  responded: number;
  sold: number;
  responseRate: number;
}

interface BrokerRow {
  broker_id: string;
  broker_name: string;
  picked: number;
  withMsg: number;
  responded: number;
  rate: number;
}

export default function ColdPoolMetrics() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    // ── Pega tudo de cold_contacts (campos relevantes) ──
    const { data: colds } = await supabase
      .from("cold_contacts")
      .select("id, status, first_msg_sent_at, claimed_by, tag, custom_fields, promoted_to_lead_id");

    // ── Pega leads vendidos vindos de cold ──
    const { data: soldLeads } = await supabase
      .from("leads")
      .select("id, broker_id, tag, product")
      .eq("source", "cold_pool")
      .eq("status", "CONCLUDED");

    const allColds = (colds as any[]) || [];
    const allSold = (soldLeads as any[]) || [];

    // ── Funnel ──
    const pool         = allColds.filter((c) => c.status === "available").length;
    const claimed      = allColds.filter((c) => c.status === "claimed" || c.status === "promoted").length;
    const withFirstMsg = allColds.filter((c) => c.first_msg_sent_at || c.status === "promoted").length;
    const responded    = allColds.filter((c) => c.status === "promoted").length;
    const sold         = allSold.length;
    setFunnel({ pool, claimed, withFirstMsg, responded, sold });

    // ── Por produto ──
    const productKey = (c: any) => c.custom_fields?.product || c.tag || "Sem produto";
    const byProduct = new Map<string, { pool: number; claimed: number; responded: number; sold: number }>();
    for (const c of allColds) {
      const p = productKey(c);
      if (!byProduct.has(p)) byProduct.set(p, { pool: 0, claimed: 0, responded: 0, sold: 0 });
      const row = byProduct.get(p)!;
      if (c.status === "available") row.pool += 1;
      if (c.status === "claimed" || c.status === "promoted") row.claimed += 1;
      if (c.status === "promoted") row.responded += 1;
    }
    for (const lead of allSold) {
      const p = lead.product || lead.tag || "Sem produto";
      if (!byProduct.has(p)) byProduct.set(p, { pool: 0, claimed: 0, responded: 0, sold: 0 });
      byProduct.get(p)!.sold += 1;
    }
    const productList: ProductRow[] = Array.from(byProduct.entries())
      .map(([product, v]) => ({
        product,
        ...v,
        responseRate: v.claimed > 0 ? Math.round((v.responded / v.claimed) * 100) : 0,
      }))
      .sort((a, b) => (b.pool + b.claimed) - (a.pool + a.claimed));
    setProducts(productList);

    // ── Top brokers ──
    const broker_ids = Array.from(new Set(allColds.map((c) => c.claimed_by).filter(Boolean)));
    const profileMap = new Map<string, string>();
    if (broker_ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", broker_ids);
      (profiles as any[] || []).forEach((p) => {
        profileMap.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "—");
      });
    }
    const byBroker = new Map<string, { picked: number; withMsg: number; responded: number }>();
    for (const c of allColds) {
      if (!c.claimed_by) continue;
      if (!byBroker.has(c.claimed_by)) byBroker.set(c.claimed_by, { picked: 0, withMsg: 0, responded: 0 });
      const row = byBroker.get(c.claimed_by)!;
      row.picked += 1;
      if (c.first_msg_sent_at || c.status === "promoted") row.withMsg += 1;
      if (c.status === "promoted") row.responded += 1;
    }
    const brokerList: BrokerRow[] = Array.from(byBroker.entries())
      .map(([broker_id, v]) => ({
        broker_id,
        broker_name: profileMap.get(broker_id) || "—",
        ...v,
        rate: v.withMsg > 0 ? Math.round((v.responded / v.withMsg) * 100) : 0,
      }))
      .sort((a, b) => b.picked - a.picked)
      .slice(0, 10);
    setBrokers(brokerList);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading && !funnel) {
    return (
      <div className="rounded-2xl border p-8 flex items-center justify-center"
           style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--crm-text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--crm-text-muted)" }}>
          Indicadores
        </h2>
        <button onClick={load} disabled={loading}
                title="Atualizar"
                className="p-1.5 rounded-md transition hover:opacity-70"
                style={{ color: "var(--crm-text-muted)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── 1) Funnel ── */}
      {funnel && (
        <section className="rounded-2xl border overflow-hidden"
                 style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--crm-border)" }}>
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--crm-text)" }}>
              Funil de conversão
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px" style={{ background: "var(--crm-border)" }}>
            <FunnelCol label="No pool"     value={funnel.pool}         color="#94A3B8" />
            <FunnelCol label="Pegos"       value={funnel.claimed}      color="#06B6D4"
                       sub={pct(funnel.claimed, funnel.pool + funnel.claimed)} />
            <FunnelCol label="1ª msg"      value={funnel.withFirstMsg} color="#10B981"
                       sub={pct(funnel.withFirstMsg, funnel.claimed)} />
            <FunnelCol label="Responderam" value={funnel.responded}    color="#F59E0B"
                       sub={pct(funnel.responded, funnel.withFirstMsg)} />
            <FunnelCol label="Venderam"    value={funnel.sold}         color="#EF4444"
                       sub={pct(funnel.sold, funnel.responded)} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── 2) Por produto ── */}
        <section className="rounded-2xl border overflow-hidden"
                 style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--crm-border)" }}>
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--crm-text)" }}>
              Por produto
            </h3>
          </div>
          {products.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "var(--crm-text-muted)" }}>
              Nenhum cold no banco ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: "var(--crm-glass)" }}>
                  <tr>
                    <Th>Produto</Th>
                    <Th right>Pool</Th>
                    <Th right>Pegos</Th>
                    <Th right>Resp.</Th>
                    <Th right>Vendas</Th>
                    <Th right>Tx resp.</Th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.product} className="border-t" style={{ borderColor: "var(--crm-border)" }}>
                      <td className="px-3 py-2 font-bold" style={{ color: "var(--crm-text)" }}>
                        {p.product}
                      </td>
                      <Td right>{p.pool}</Td>
                      <Td right>{p.claimed}</Td>
                      <Td right>{p.responded}</Td>
                      <Td right strong color="#10B981">{p.sold}</Td>
                      <Td right color={p.responseRate >= 20 ? "#10B981" : p.responseRate >= 10 ? "#F59E0B" : "#EF4444"}>
                        {p.responseRate}%
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 3) Top brokers ── */}
        <section className="rounded-2xl border overflow-hidden"
                 style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--crm-border)" }}>
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--crm-text)" }}>
              Top corretores em prospecção
            </h3>
          </div>
          {brokers.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "var(--crm-text-muted)" }}>
              Ninguém usou ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: "var(--crm-glass)" }}>
                  <tr>
                    <Th>#</Th>
                    <Th>Corretor</Th>
                    <Th right>Pegos</Th>
                    <Th right>1ª msg</Th>
                    <Th right>Resp.</Th>
                    <Th right>Conv.</Th>
                  </tr>
                </thead>
                <tbody>
                  {brokers.map((b, i) => (
                    <tr key={b.broker_id} className="border-t" style={{ borderColor: "var(--crm-border)" }}>
                      <td className="px-3 py-2 text-center" style={{ color: "var(--crm-text-muted)" }}>{i + 1}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: "var(--crm-text)" }}>
                        {b.broker_name}
                      </td>
                      <Td right>{b.picked}</Td>
                      <Td right>{b.withMsg}</Td>
                      <Td right>{b.responded}</Td>
                      <Td right color={b.rate >= 20 ? "#10B981" : b.rate >= 10 ? "#F59E0B" : "#EF4444"}>
                        {b.rate}%
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── helpers ──
function pct(a: number, b: number): string {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

function FunnelCol({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="px-3 py-3 text-center" style={{ background: "var(--crm-bg)" }}>
      <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "var(--crm-text-muted)" }}>
        {label}
      </p>
      <p className="text-2xl font-black tabular-nums leading-tight mt-0.5" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: "var(--crm-text-muted)" }}>{sub}</p>}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-bold uppercase tracking-wider text-[10px] ${right ? "text-right" : "text-left"}`}
        style={{ color: "var(--crm-text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, right, strong, color }: { children: React.ReactNode; right?: boolean; strong?: boolean; color?: string }) {
  return (
    <td className={`px-3 py-2 tabular-nums ${right ? "text-right" : ""}`}
        style={{ color: color || (strong ? "var(--crm-text)" : "var(--crm-text-muted)"), fontWeight: strong ? 700 : 400 }}>
      {children}
    </td>
  );
}
