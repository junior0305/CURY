import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchLeadsForDashboard, updateLeadStatus, confirmLeadVisit } from "@/integrations/supabase/leads";
import { useAuth } from "@/components/AuthProvider";
import { Lead } from "@/types/lead";
import { Calendar, CheckCircle2, XCircle, AlertTriangle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { isToday, isTomorrow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

function VisitDay({ label, leads, onConfirm, onRealizada, onNaoCompareceu, onWhatsApp, onDesfazerRealizada }: {
  label: string;
  leads: Lead[];
  onConfirm: (id: string, v: boolean) => void;
  onRealizada: (id: string) => void;
  onNaoCompareceu: (id: string) => void;
  onWhatsApp: (lead: Lead) => void;
  onDesfazerRealizada: (id: string) => void;
}) {
  if (leads.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-0.5">{label}</p>
      {leads.map(lead => {
        const isVisitToday = isToday(new Date(lead.lastInteractionAt));
        const notConfirmed = lead.visitaConfirmada === null || lead.visitaConfirmada === false;

        return (
          <div
            key={lead.id}
            className={cn(
              "rounded-xl border p-3 space-y-2.5 transition-all",
              lead.status === "VISITA_REALIZADA"
                ? "bg-emerald-950/20 border-emerald-500/30"
                : notConfirmed && isVisitToday
                ? "bg-amber-950/30 border-amber-500/40"
                : "bg-white/5 border-white/10"
            )}
          >
            {/* Linha 1: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Calendar className={cn("w-3 h-3 shrink-0",
                    lead.status === "VISITA_REALIZADA" ? "text-emerald-400" : "text-indigo-400"
                  )} />
                  {notConfirmed && lead.status === "VISIT_SCHEDULED" && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      ⚠️ Não confirmou
                    </span>
                  )}
                  {lead.visitaConfirmada && lead.status === "VISIT_SCHEDULED" && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✅ Confirmado
                    </span>
                  )}
                  {lead.status === "VISITA_REALIZADA" && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✅ Compareceu
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-white truncate">{lead.name}</p>
                {(lead.rendaDeclarada || lead.tipoTrabalho) && (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {[
                      lead.rendaDeclarada ? `R$ ${lead.rendaDeclarada}` : "",
                      lead.tipoTrabalho === "CLT" ? "CLT" :
                      lead.tipoTrabalho === "AUTONOMO" ? "Autônomo" :
                      lead.tipoTrabalho === "FUNCIONARIO_PUBLICO" ? "Func. Público" : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* Ações */}
            {lead.status === "VISIT_SCHEDULED" && (
              <div className="space-y-1.5">
                {/* Confirmar presença */}
                {!lead.visitaConfirmada && (
                  <button
                    onClick={() => onConfirm(lead.id, true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-black transition-all active:scale-95"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Confirmar presença
                  </button>
                )}

                <div className="flex gap-1.5">
                  {lead.phone && (
                    <button
                      onClick={() => onWhatsApp(lead)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[11px] font-bold transition-all border border-white/10"
                    >
                      <MessageSquare className="w-3 h-3" />
                      WhatsApp
                    </button>
                  )}
                  <button
                    onClick={() => onRealizada(lead.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition-all active:scale-95"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Compareceu ✓
                  </button>
                  <button
                    onClick={() => onNaoCompareceu(lead.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-950/40 hover:bg-red-950/60 text-red-400 border border-red-500/20 transition-all"
                    title="Não compareceu"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {lead.status === "VISITA_REALIZADA" && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-emerald-400 font-bold">
                  Solicitar documentação agora →
                </p>
                <button
                  onClick={() => onDesfazerRealizada(lead.id)}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700/60 border border-gray-600/40 text-gray-500 hover:text-gray-300 hover:bg-slate-700 transition-all"
                >
                  ↩ Desfazer
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface VisitasHojeProps {
  onSelectLead: (id: string) => void;
}

export function VisitasHoje({ onSelectLead }: VisitasHojeProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const { data: allLeads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => confirmLeadVisit(id, v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] }),
  });

  const realizadaMutation = useMutation({
    mutationFn: (id: string) => updateLeadStatus(id, "VISITA_REALIZADA"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] }),
  });

  const naoCompareceuMutation = useMutation({
    mutationFn: (id: string) => updateLeadStatus(id, "ABANDONED", null, "NAO_COMPARECEU"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] }),
  });

  const desfazerRealizadaMutation = useMutation({
    mutationFn: (id: string) => updateLeadStatus(id, "VISIT_SCHEDULED"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] }),
  });

  const visitLeads = allLeads.filter(
    l => l.brokerId === userId && ["VISIT_SCHEDULED", "VISITA_REALIZADA"].includes(l.status)
  );

  const hoje = visitLeads.filter(l =>
    l.status === "VISIT_SCHEDULED" && isToday(new Date(l.lastInteractionAt))
  );
  const amanha = visitLeads.filter(l =>
    l.status === "VISIT_SCHEDULED" && isTomorrow(new Date(l.lastInteractionAt))
  );
  const realizadas = visitLeads.filter(l => l.status === "VISITA_REALIZADA");

  const openWhatsApp = (lead: Lead) => {
    const num = lead.phone?.replace(/\D/g, "");
    if (num) window.open(`https://wa.me/${num}`, "_blank");
  };

  if (visitLeads.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/3 p-4 text-center">
        <Calendar className="w-6 h-6 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-600">Nenhuma visita agendada</p>
        <p className="text-[11px] text-gray-700 mt-0.5">Agende visitas nos cards de leads</p>
      </div>
    );
  }

  // Alerta: visitas de hoje não confirmadas
  const naoCofirmadas = hoje.filter(l => !l.visitaConfirmada);

  return (
    <div className="space-y-4">
      {naoCofirmadas.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            <span className="font-black">{naoCofirmadas.length} visita{naoCofirmadas.length > 1 ? "s" : ""} hoje sem confirmação.</span>
            {" "}Confirme a presença antes do horário marcado.
          </p>
        </div>
      )}

      <VisitDay
        label="Hoje"
        leads={hoje}
        onConfirm={(id, v) => confirmMutation.mutate({ id, v })}
        onRealizada={id => realizadaMutation.mutate(id)}
        onNaoCompareceu={id => naoCompareceuMutation.mutate(id)}
        onWhatsApp={openWhatsApp}
        onDesfazerRealizada={id => desfazerRealizadaMutation.mutate(id)}
      />

      <VisitDay
        label="Amanhã"
        leads={amanha}
        onConfirm={(id, v) => confirmMutation.mutate({ id, v })}
        onRealizada={id => realizadaMutation.mutate(id)}
        onNaoCompareceu={id => naoCompareceuMutation.mutate(id)}
        onWhatsApp={openWhatsApp}
        onDesfazerRealizada={id => desfazerRealizadaMutation.mutate(id)}
      />

      {realizadas.length > 0 && (
        <VisitDay
          label="Realizadas — solicitar docs"
          leads={realizadas}
          onConfirm={(id, v) => confirmMutation.mutate({ id, v })}
          onRealizada={id => realizadaMutation.mutate(id)}
          onNaoCompareceu={id => naoCompareceuMutation.mutate(id)}
          onWhatsApp={openWhatsApp}
          onDesfazerRealizada={id => desfazerRealizadaMutation.mutate(id)}
        />
      )}
    </div>
  );
}
