// PoolPage — manager vê pool de prospecção da equipe dele.
// Tabela broker × métricas + drawer com conversas convertidas.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import Shell from "@/components/manager-v2/Shell";
import { Snowflake, Loader2, X, MessageSquare, ArrowRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface PoolRow {
  broker_id: string;
  broker_name: string;
  manager_name: string | null;
  in_fila: number;
  contactados: number;
  promovidos_total: number;
  promovidos_30d: number;
  total_30d: number;
  conv_pct: number;
  pool_limit: number;
  tier: "base" | "pro" | "elite";
}

interface Conversion {
  cold_id: string;
  lead_id: string;
  contact_name: string;
  contact_phone: string;
  promoted_at: string;
  message_count: number;
  conversation_id: string | null;
}

const TIER_BADGE = {
  base: { label: "BASE", color: "#6b7280" },
  pro: { label: "🥈 PRO", color: "#10b981" },
  elite: { label: "🏆 ELITE", color: "#f59e0b" },
};

export default function PoolPage({ globalView = false }: { globalView?: boolean }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<PoolRow | null>(null);

  async function load() {
    if (!user?.id && !globalView) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_pool_stats", {
      p_manager_id: globalView ? null : user!.id,
    });
    setRows((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id, globalView]);

  const totalLeads = rows.reduce((s, r) => s + r.in_fila, 0);
  const totalConv = rows.reduce((s, r) => s + r.promovidos_total, 0);

  const content = (
    <div className="space-y-4">
      {/* Header com totais */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-3" style={{ background: "var(--crm-card-soft)", borderColor: "rgba(63,63,70,0.5)" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--crm-text-muted)" }}>Brokers ativos</div>
          <div className="text-2xl font-black" style={{ color: "var(--crm-text)" }}>{rows.length}</div>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "var(--crm-card-soft)", borderColor: "rgba(63,63,70,0.5)" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--crm-text-muted)" }}>Em fila (claimed)</div>
          <div className="text-2xl font-black text-cyan-400">{totalLeads}</div>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "var(--crm-card-soft)", borderColor: "rgba(63,63,70,0.5)" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--crm-text-muted)" }}>Convertidos total</div>
          <div className="text-2xl font-black text-emerald-400">{totalConv}</div>
        </div>
      </div>

      {loading && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}

      {!loading && rows.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: "var(--crm-text-muted)" }}>
          Nenhum corretor da equipe usou o pool ainda.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ background: "var(--crm-card-soft)", borderColor: "rgba(63,63,70,0.5)" }}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider font-bold" style={{ background: "rgba(0,0,0,0.2)", color: "var(--crm-text-muted)" }}>
              <tr>
                <th className="text-left px-3 py-2">Broker</th>
                {globalView && <th className="text-left px-3 py-2">Equipe</th>}
                <th className="text-right px-3 py-2">Em fila</th>
                <th className="text-right px-3 py-2">Limite</th>
                <th className="text-right px-3 py-2">Contactados</th>
                <th className="text-right px-3 py-2">Convertidos</th>
                <th className="text-right px-3 py-2">Conv %</th>
                <th className="text-center px-3 py-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cheio = r.in_fila >= r.pool_limit;
                const t = TIER_BADGE[r.tier];
                return (
                  <tr key={r.broker_id} onClick={() => setDrawer(r)}
                      className="border-t cursor-pointer hover:bg-slate-800/40 transition"
                      style={{ borderColor: "rgba(63,63,70,0.3)" }}>
                    <td className="px-3 py-2 font-bold" style={{ color: "var(--crm-text)" }}>{r.broker_name}</td>
                    {globalView && <td className="px-3 py-2 text-xs" style={{ color: "var(--crm-text-muted)" }}>{r.manager_name || "—"}</td>}
                    <td className="px-3 py-2 text-right text-cyan-300 font-bold">{r.in_fila}</td>
                    <td className={`px-3 py-2 text-right ${cheio ? "text-red-400 font-bold" : ""}`} style={{ color: cheio ? undefined : "var(--crm-text-muted)" }}>
                      {r.in_fila}/{r.pool_limit} {cheio && "⛔"}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--crm-text)" }}>{r.contactados}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 font-bold">{r.promovidos_total}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.conv_pct >= 10 ? "#10b981" : "var(--crm-text-muted)" }}>{r.conv_pct}%</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: `${t.color}30`, color: t.color }}>
                        {t.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-center" style={{ color: "var(--crm-text-muted)" }}>
        Clique no broker pra ver as conversas que viraram lead.
      </p>
    </div>
  );

  if (globalView) return content;

  return (
    <>
      <Shell title="Pool de Prospecção" subtitle="Equipe · cold contacts e conversões" icon={Snowflake} color="#38BDF8">
        {content}
      </Shell>
      {drawer && <BrokerConversionsDrawer broker={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

// ─── Drawer: conversas convertidas ────────────────────────────────────────

function BrokerConversionsDrawer({ broker, onClose }: { broker: PoolRow; onClose: () => void }) {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [convId, setConvId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase.rpc("get_broker_pool_conversions", { p_broker_id: broker.broker_id, p_limit: 50 })
      .then(({ data }) => { setConversions((data as any) || []); setLoading(false); });
  }, [broker.broker_id]);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-slate-950 border-slate-800 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-cyan-300 flex items-center gap-2">
                <Snowflake className="w-5 h-5" /> {broker.broker_name}
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {broker.in_fila} em fila · {broker.contactados} contactados · {broker.promovidos_total} convertidos · {broker.conv_pct}%
            </p>
          </div>

          {loading && <div className="text-center py-10 text-gray-500"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}
          {!loading && conversions.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-500">
              Esse broker ainda não converteu nenhum cold em lead.
            </div>
          )}
          {!loading && conversions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider font-bold text-gray-400">
                ✅ Conversas convertidas ({conversions.length})
              </h3>
              {conversions.map(c => (
                <button key={c.cold_id} onClick={() => setConvId(c.conversation_id)}
                  className="w-full text-left rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2.5 hover:bg-emerald-900/30 transition flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-emerald-300 truncate">{c.contact_name}</div>
                    <div className="text-[11px] text-gray-500">
                      {c.contact_phone} · {c.message_count} msgs · {new Date(c.promoted_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
        {convId && <ConversationViewer conversationId={convId} onClose={() => setConvId(null)} />}
      </SheetContent>
    </Sheet>
  );
}

// ─── Viewer da conversa ────────────────────────────────────────────────────

function ConversationViewer({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from("ia_messages")
      .select("id, message_text, direction, sender_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => { setMsgs(data || []); setLoading(false); });
  }, [conversationId]);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-slate-950 border-slate-800 overflow-y-auto">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">💬 Conversa completa</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {loading && <div className="text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...</div>}
          {!loading && msgs.length === 0 && <div className="text-gray-500 text-sm">Sem mensagens.</div>}
          {!loading && msgs.map(m => (
            <div key={m.id} className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.direction === "outgoing"
                  ? "bg-emerald-900/40 text-emerald-100 border border-emerald-500/30"
                  : "bg-slate-800 text-gray-200 border border-gray-700"
              }`}>
                <div>{m.message_text}</div>
                <div className="text-[10px] mt-1 opacity-60">
                  {new Date(m.created_at).toLocaleString("pt-BR")} · {m.sender_type}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
