import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NewLeadModal } from "@/components/manager/NewLeadModal";

type Section = "buscar" | "novo";

interface Props {
  open: boolean;
  onClose: () => void;
  managerId: string;
  managerName: string;
  brokers: any[];
  onSelectLead: (lead: any) => void;
}

export default function OperacoesSheet({
  open,
  onClose,
  managerId,
  managerName,
  brokers,
  onSelectLead,
}: Props) {
  const [section, setSection] = useState<Section>("buscar");
  const [query, setQuery] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const qc = useQueryClient();

  const brokerIds = useMemo(() => brokers.map((b: any) => b.id), [brokers]);
  const brokerMap = useMemo(
    () => Object.fromEntries(brokers.map((b: any) => [b.id, b.first_name || "—"])),
    [brokers]
  );

  const search = useQuery({
    queryKey: ["v2-op-search", managerId, query],
    enabled: open && section === "buscar" && query.trim().length >= 2 && brokerIds.length > 0,
    queryFn: async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone, status, broker_id, created_at, last_interaction_at, tag")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,tag.ilike.%${q}%`)
        .in("broker_id", brokerIds)
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(40);
      return data || [];
    },
  });

  const brokersForModal = useMemo(
    () =>
      brokers.map((b: any) => ({
        id: b.id,
        firstName: b.first_name,
        lastName: b.last_name,
        phone: b.phone,
        botInstanceId: b.bot_instance_id,
        leadAssignmentEnabled: b.lead_assignment_enabled,
        role: "BROKER",
      })),
    [brokers]
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-slate-950 border-slate-800 text-slate-100"
      >
        <SheetHeader className="px-5 py-4 border-b border-slate-800">
          <SheetTitle className="text-base text-slate-100">Operações</SheetTitle>
        </SheetHeader>

        <div className="px-5 pt-3 flex gap-1.5 flex-wrap">
          {(
            [
              { v: "buscar", label: "Buscar", icon: Search },
              { v: "novo", label: "Novo lead", icon: UserPlus },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = section === t.v;
            return (
              <button
                key={t.v}
                onClick={() => setSection(t.v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: active ? "rgba(6,182,212,0.15)" : "rgba(30,41,59,0.6)",
                  border: `1px solid ${active ? "rgba(6,182,212,0.5)" : "rgba(51,65,85,0.5)"}`,
                  color: active ? "#06B6D4" : "#94A3B8",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>
          {section === "buscar" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome, telefone ou tag…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
                />
              </div>
              {query.trim().length < 2 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  Digite ao menos 2 caracteres
                </p>
              ) : search.isLoading ? (
                <div className="flex items-center justify-center py-6 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (search.data || []).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Nada encontrado</p>
              ) : (
                <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 overflow-hidden">
                  {(search.data || []).map((l: any) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        onSelectLead(l);
                        onClose();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-800/50 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {l.name || l.phone}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {brokerMap[l.broker_id] || "—"} · {l.status} · {l.tag || "sem tag"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "novo" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Adicionar lead manualmente (entrada offline, indicação ou venda direta de parceiro).
              </p>
              <button
                onClick={() => setShowNewLead(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-sm font-bold hover:bg-cyan-500/20 transition"
              >
                <UserPlus className="w-4 h-4" />
                Adicionar lead manual
              </button>
            </div>
          )}

        </div>

        {showNewLead && (
          <NewLeadModal
            managerId={managerId}
            managerName={managerName}
            brokers={brokersForModal as any}
            onClose={() => {
              setShowNewLead(false);
              qc.invalidateQueries({ queryKey: ["v2-team-data"] });
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
