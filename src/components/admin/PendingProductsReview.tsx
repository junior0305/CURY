// PendingProductsReview — admin revisa produtos não-aprovados (novos do upload
// ou pequenos do histórico) e decide pra cada: juntar com aprovado, aprovar como
// novo, ou excluir. Substring match sugere top 3 destinos.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown,
  Layers, Sparkles, Trash2, CornerUpRight,
} from "lucide-react";

interface Pending {
  product: string;
  qtd: number;
  suggestions: { name: string; score: number }[];
  loadingSuggestions: boolean;
  selected: string | null;          // null = nada escolhido; "__new__" = aprovar como novo; "__exclude__" = excluir; outro = juntar com X
  busy: boolean;
}

const PAGE_SIZE = 10;

export default function PendingProductsReview() {
  const [pendings, setPendings] = useState<Pending[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [showDropdownIdx, setShowDropdownIdx] = useState<number | null>(null);

  async function load() {
    setLoading(true);

    // Aprovados
    const { data: appr } = await supabase
      .from("cold_approved_products")
      .select("name")
      .order("name");
    const apprList = (appr as any[] || []).map((a) => a.name);
    setApproved(apprList);

    // Pendentes: produtos com cold ativo que NÃO estão na approved list
    // Pagina pra suportar grande volume
    const PAGE = 1000;
    const allColds: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cold_contacts")
        .select("custom_fields, status")
        .in("status", ["available","claimed","promoted"])
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      allColds.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const counts = new Map<string, number>();
    const apprSet = new Set(apprList);
    for (const c of allColds) {
      const p = c.custom_fields?.product;
      if (!p) continue;
      if (apprSet.has(p)) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    const list: Pending[] = Array.from(counts.entries())
      .map(([product, qtd]) => ({
        product, qtd,
        suggestions: [],
        loadingSuggestions: true,
        selected: null,
        busy: false,
      }))
      .sort((a, b) => b.qtd - a.qtd);
    setPendings(list);
    setLoading(false);

    // Carrega sugestões em paralelo (max 5 simultâneas pra não saturar)
    const BATCH = 5;
    for (let i = 0; i < list.length; i += BATCH) {
      const slice = list.slice(i, i + BATCH);
      await Promise.all(slice.map(async (p, k) => {
        const { data } = await supabase.rpc("find_similar_products", { p_name: p.product, p_limit: 3 });
        const suggestions = (data as any[] || [])
          .filter((s) => s.score > 0)
          .map((s) => ({ name: s.name, score: s.score }));
        setPendings((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.product === p.product);
          if (idx >= 0) next[idx] = { ...next[idx], suggestions, loadingSuggestions: false };
          return next;
        });
      }));
    }
  }

  useEffect(() => { load(); }, []);

  function setSelected(idx: number, value: string) {
    setPendings((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected: value };
      return next;
    });
  }

  async function applyOne(idx: number) {
    const p = pendings[idx];
    if (!p.selected) { toast.warning("Escolha um destino primeiro"); return; }
    setPendings((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], busy: true };
      return next;
    });

    try {
      let action: "merge" | "approve_new" | "exclude";
      let target = "";
      if (p.selected === "__new__")        action = "approve_new";
      else if (p.selected === "__exclude__") action = "exclude";
      else                                   { action = "merge"; target = p.selected; }

      const { data, error } = await supabase.rpc("consolidate_cold_product", {
        p_from: p.product,
        p_to: target,
        p_action: action,
      });
      if (error) throw error;
      const result = data as any;

      if (action === "approve_new") {
        toast.success(`✅ "${p.product}" aprovado como produto novo`);
      } else if (action === "exclude") {
        toast.success(`🗑️ "${p.product}" — ${result?.excluded ?? 0} cold excluídos`);
      } else {
        toast.success(`🔀 ${result?.updated ?? 0} cold de "${p.product}" → "${target}"`);
      }

      // Remove do pendings (UI)
      setPendings((prev) => prev.filter((_, i) => i !== idx));
      setShowDropdownIdx(null);
    } catch (e: any) {
      toast.error(`Erro: ${e.message || e}`);
    } finally {
      setPendings((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], busy: false };
        return next;
      });
    }
  }

  const visiblePendings = pendings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(pendings.length / PAGE_SIZE);

  if (loading) {
    return (
      <div className="rounded-2xl border p-8 flex items-center justify-center"
           style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--crm-text-muted)" }} />
      </div>
    );
  }

  if (pendings.length === 0) {
    return (
      <section className="rounded-2xl border p-5 flex items-center gap-3"
               style={{ background: "var(--crm-card)", borderColor: "rgba(16,185,129,0.30)" }}>
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--crm-text)" }}>Pool consolidado</p>
          <p className="text-xs" style={{ color: "var(--crm-text-muted)" }}>
            Todos os produtos do pool já foram aprovados. {approved.length} produtos aprovados.
          </p>
        </div>
        <button onClick={load}
                className="ml-auto p-1.5 rounded-md transition hover:opacity-70"
                title="Recarregar"
                style={{ color: "var(--crm-text-muted)" }}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border overflow-hidden"
             style={{ background: "var(--crm-card)", borderColor: "var(--crm-border)" }}>
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3"
           style={{ borderColor: "var(--crm-border)" }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--crm-text)" }}>
            Produtos pendentes de revisão ({pendings.length})
          </h3>
        </div>
        <button onClick={load}
                className="p-1.5 rounded-md transition hover:opacity-70"
                style={{ color: "var(--crm-text-muted)" }}>
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        {visiblePendings.map((p, localIdx) => {
          const idx = page * PAGE_SIZE + localIdx;
          return (
            <div key={p.product}
                 className="rounded-xl border p-3"
                 style={{ background: "var(--crm-glass)", borderColor: "var(--crm-border)" }}>
              {/* Header da linha */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--crm-text)" }}>
                    "{p.product}"
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
                    {p.qtd} cold no pool · sem aprovação
                  </p>
                </div>
                <button
                  onClick={() => applyOne(idx)}
                  disabled={!p.selected || p.busy}
                  className="px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-40"
                  style={{
                    background: p.selected ? "linear-gradient(135deg, #06B6D4, #0EA5E9)" : "var(--crm-glass)",
                    color: p.selected ? "white" : "var(--crm-text-muted)",
                    border: p.selected ? "none" : "1px solid var(--crm-border)",
                  }}
                >
                  {p.busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aplicar"}
                </button>
              </div>

              {/* Sugestões */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--crm-text-muted)" }}>
                  Onde encaixa?
                </p>
                {p.loadingSuggestions ? (
                  <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--crm-text-muted)" }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> buscando sugestões…
                  </p>
                ) : (
                  <>
                    {p.suggestions.slice(0, 3).map((s) => {
                      const isSelected = p.selected === s.name;
                      return (
                        <Option
                          key={s.name}
                          label={s.name}
                          subLabel={`${s.score}% similar`}
                          icon={Layers}
                          color="#06B6D4"
                          selected={isSelected}
                          onClick={() => setSelected(idx, s.name)}
                        />
                      );
                    })}
                    {p.suggestions.length === 0 && (
                      <p className="text-[11px] italic" style={{ color: "var(--crm-text-muted)" }}>
                        Nenhuma sugestão automática (use "Outro destino" abaixo)
                      </p>
                    )}
                    <Option
                      label="Aprovar como produto novo"
                      icon={Sparkles}
                      color="#10B981"
                      selected={p.selected === "__new__"}
                      onClick={() => setSelected(idx, "__new__")}
                    />
                  </>
                )}
              </div>

              {/* Dropdown "outro destino" */}
              <div className="mt-2 pt-2 border-t flex items-center gap-2"
                   style={{ borderColor: "var(--crm-border)" }}>
                <button
                  onClick={() => setShowDropdownIdx(showDropdownIdx === idx ? null : idx)}
                  className="text-[11px] inline-flex items-center gap-1 hover:underline"
                  style={{ color: "var(--crm-text-muted)" }}
                >
                  <CornerUpRight className="w-3 h-3" /> Outro destino
                  <ChevronDown className={`w-3 h-3 transition ${showDropdownIdx === idx ? "rotate-180" : ""}`} />
                </button>
                <button
                  onClick={() => setSelected(idx, "__exclude__")}
                  className="text-[11px] inline-flex items-center gap-1 hover:underline ml-auto"
                  style={{ color: p.selected === "__exclude__" ? "#EF4444" : "var(--crm-text-muted)" }}
                >
                  <Trash2 className="w-3 h-3" /> {p.selected === "__exclude__" ? "✓ Excluir do pool" : "Excluir do pool"}
                </button>
              </div>

              {showDropdownIdx === idx && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border"
                     style={{ borderColor: "var(--crm-border)", background: "var(--crm-bg)" }}>
                  {approved.map((name) => (
                    <button
                      key={name}
                      onClick={() => { setSelected(idx, name); setShowDropdownIdx(null); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-cyan-500/10 transition"
                      style={{ color: p.selected === name ? "#06B6D4" : "var(--crm-text)" }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-2 border-t flex items-center justify-between text-xs"
             style={{ borderColor: "var(--crm-border)", color: "var(--crm-text-muted)" }}>
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="hover:underline disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span>Página {page + 1} de {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="hover:underline disabled:opacity-40"
          >
            Próxima →
          </button>
        </div>
      )}
    </section>
  );
}

function Option({
  label, subLabel, icon: Icon, color, selected, onClick,
}: {
  label: string;
  subLabel?: string;
  icon: any;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition text-left"
      style={{
        background: selected ? `${color}18` : "transparent",
        border: `1px solid ${selected ? color : "transparent"}`,
        color: selected ? color : "var(--crm-text)",
      }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="flex-1 truncate font-bold">{label}</span>
      {subLabel && (
        <span className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>{subLabel}</span>
      )}
    </button>
  );
}
