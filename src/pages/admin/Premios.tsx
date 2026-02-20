import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Gift, CheckCircle2, XCircle, Clock, DollarSign,
  Trophy, Filter, RefreshCw, Banknote, AlertTriangle,
  ChevronDown, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type PrizeStatus = "PENDING" | "APPROVED" | "PAID" | "REJECTED";

interface PrizeClaim {
  id: string;
  brokerId: string;
  brokerName: string;
  brokerEmail: string;
  missionTitle: string | null;
  prizeType: string;
  prizeValue: number;
  prizeLabel: string;
  status: PrizeStatus;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

// ─── Configuração visual por status ──────────────────────────────────────────
const STATUS_CONFIG: Record<PrizeStatus, { label: string; color: string; icon: any }> = {
  PENDING:  { label: "Pendente",  color: "bg-yellow-900/40 text-yellow-300 border-yellow-500/30", icon: Clock },
  APPROVED: { label: "Aprovado",  color: "bg-blue-900/40   text-blue-300   border-blue-500/30",   icon: CheckCircle2 },
  PAID:     { label: "Pago",      color: "bg-green-900/40  text-green-300  border-green-500/30",  icon: Banknote },
  REJECTED: { label: "Recusado",  color: "bg-red-900/40    text-red-300    border-red-500/30",    icon: XCircle },
};

const PRIZE_TYPE_ICONS: Record<string, string> = {
  PIX:    "💸",
  FOLGA:  "🏖️",
  BONUS:  "🎁",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Premios() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<PrizeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PrizeStatus | "ALL">("PENDING");
  const [searchName, setSearchName] = useState("");

  // Dialogs
  const [approveTarget, setApproveTarget] = useState<PrizeClaim | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PrizeClaim | null>(null);
  const [payTarget, setPayTarget] = useState<PrizeClaim | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [payNote, setPayNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // ─── Carregar prêmios ──────────────────────────────────────────────────────
  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("prize_claims")
        .select(`
          id, broker_id, prize_type, prize_value, prize_label,
          status, approved_by, approved_at, paid_at, notes, created_at,
          mission_id,
          broker:profiles!prize_claims_broker_id_fkey(first_name, last_name, email),
          approver:profiles!prize_claims_approved_by_fkey(first_name, last_name),
          daily_missions(mission_templates(title))
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setClaims((data || []).map((d: any) => ({
        id: d.id,
        brokerId: d.broker_id,
        brokerName: `${d.broker?.first_name || ""} ${d.broker?.last_name || ""}`.trim() || d.broker?.email || "—",
        brokerEmail: d.broker?.email || "",
        missionTitle: d.daily_missions?.mission_templates?.title || null,
        prizeType: d.prize_type,
        prizeValue: Number(d.prize_value),
        prizeLabel: d.prize_label,
        status: d.status as PrizeStatus,
        approvedBy: d.approved_by,
        approvedByName: d.approver ? `${d.approver.first_name || ""} ${d.approver.last_name || ""}`.trim() : null,
        approvedAt: d.approved_at,
        paidAt: d.paid_at,
        notes: d.notes,
        createdAt: d.created_at,
      })));
    } catch (e) {
      toast.error("Erro ao carregar prêmios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("prize-claims-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "prize_claims" }, loadClaims)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadClaims]);

  // ─── Ações ────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approveTarget || !user?.id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("prize_claims")
        .update({
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", approveTarget.id);
      if (error) throw error;
      toast.success(`✅ Prêmio de ${approveTarget.brokerName} aprovado!`);
      setApproveTarget(null);
      loadClaims();
    } catch {
      toast.error("Erro ao aprovar prêmio");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !user?.id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("prize_claims")
        .update({
          status: "REJECTED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          notes: rejectNote || null,
        })
        .eq("id", rejectTarget.id);
      if (error) throw error;
      toast.success(`Prêmio de ${rejectTarget.brokerName} recusado.`);
      setRejectTarget(null);
      setRejectNote("");
      loadClaims();
    } catch {
      toast.error("Erro ao recusar prêmio");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!payTarget || !user?.id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("prize_claims")
        .update({
          status: "PAID",
          paid_at: new Date().toISOString(),
          notes: payNote || payTarget.notes,
        })
        .eq("id", payTarget.id);
      if (error) throw error;
      toast.success(`💸 Pagamento de ${payTarget.brokerName} registrado!`);
      setPayTarget(null);
      setPayNote("");
      loadClaims();
    } catch {
      toast.error("Erro ao registrar pagamento");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Filtragem ─────────────────────────────────────────────────────────────
  const filtered = claims.filter(c => {
    const matchStatus = filterStatus === "ALL" || c.status === filterStatus;
    const matchName = !searchName || c.brokerName.toLowerCase().includes(searchName.toLowerCase());
    return matchStatus && matchName;
  });

  // ─── Totais por status ─────────────────────────────────────────────────────
  const counts = {
    ALL:      claims.length,
    PENDING:  claims.filter(c => c.status === "PENDING").length,
    APPROVED: claims.filter(c => c.status === "APPROVED").length,
    PAID:     claims.filter(c => c.status === "PAID").length,
    REJECTED: claims.filter(c => c.status === "REJECTED").length,
  };

  const totalPendingValue  = claims.filter(c => c.status === "PENDING").reduce((s, c) => s + c.prizeValue, 0);
  const totalApprovedValue = claims.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.prizeValue, 0);
  const totalPaidValue     = claims.filter(c => c.status === "PAID").reduce((s, c) => s + c.prizeValue, 0);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* KPIs financeiros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Aguardando Aprovação", value: totalPendingValue,  count: counts.PENDING,  color: "border-yellow-500/30 bg-yellow-900/10", text: "text-yellow-400", icon: Clock },
          { label: "Aprovados (a pagar)",  value: totalApprovedValue, count: counts.APPROVED, color: "border-blue-500/30   bg-blue-900/10",   text: "text-blue-400",   icon: CheckCircle2 },
          { label: "Total Pago",           value: totalPaidValue,     count: counts.PAID,     color: "border-green-500/30  bg-green-900/10",  text: "text-green-400",  icon: Banknote },
        ].map(({ label, value, count, color, text, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl border p-4 flex items-center gap-4", color)}>
            <div className={cn("p-2 rounded-lg bg-black/20", text)}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className={cn("text-2xl font-black leading-none", text)}>{formatCurrency(value)}</p>
              <p className="text-gray-500 text-xs mt-1">{label} · {count} prêmio{count !== 1 ? "s" : ""}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "PENDING", "APPROVED", "PAID", "REJECTED"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                filterStatus === s
                  ? s === "ALL"
                    ? "bg-gray-700 text-white border-gray-500"
                    : STATUS_CONFIG[s]?.color || "bg-gray-700 text-white border-gray-500"
                  : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"
              )}
            >
              {s === "ALL" ? "Todos" : STATUS_CONFIG[s].label}
              <span className="ml-1.5 opacity-60">
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Buscar corretor..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            className="bg-slate-800/60 border-gray-600 text-white placeholder-gray-500 h-8 text-xs w-44"
          />
          <Button variant="ghost" size="sm" onClick={loadClaims} className="text-gray-400 hover:text-white h-8 w-8 p-0">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Lista de prêmios */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 border border-gray-700/30 rounded-xl">
          <Gift className="w-12 h-12 mb-3 opacity-20" />
          <p className="font-semibold">Nenhum prêmio encontrado</p>
          <p className="text-sm mt-1 text-gray-700">
            {filterStatus === "PENDING" ? "Nenhum prêmio aguardando aprovação 🎉" : "Tente outro filtro"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(claim => {
            const cfg = STATUS_CONFIG[claim.status];
            const Icon = cfg.icon;

            return (
              <div
                key={claim.id}
                className={cn(
                  "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-all",
                  claim.status === "PENDING"
                    ? "border-yellow-500/20 bg-yellow-900/5 hover:bg-yellow-900/10"
                    : "border-gray-700/40 bg-slate-800/30"
                )}
              >
                {/* Ícone do tipo de prêmio */}
                <div className="text-3xl shrink-0 w-10 text-center">
                  {PRIZE_TYPE_ICONS[claim.prizeType] || "🎁"}
                </div>

                {/* Info principal */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-black text-base">{formatCurrency(claim.prizeValue)}</span>
                    <span className="text-gray-400 text-sm">— {claim.prizeLabel}</span>
                    <Badge className={cn("text-xs border", cfg.color)}>
                      <Icon className="w-3 h-3 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm text-gray-400">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-semibold text-gray-300">{claim.brokerName}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500 text-xs truncate">{claim.brokerEmail}</span>
                  </div>

                  {claim.missionTitle && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Trophy className="w-3 h-3" />
                      Missão: <span className="text-gray-400">{claim.missionTitle}</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-600">
                    Solicitado em {formatDate(claim.createdAt)}
                    {claim.approvedByName && (
                      <span className="ml-2 text-gray-700">· Aprovado por {claim.approvedByName}</span>
                    )}
                    {claim.paidAt && (
                      <span className="ml-2 text-green-700">· Pago em {formatDate(claim.paidAt)}</span>
                    )}
                  </div>

                  {claim.notes && (
                    <p className="text-xs text-gray-500 bg-slate-800/60 rounded px-2 py-1 border border-gray-700/30">
                      📝 {claim.notes}
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {claim.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setApproveTarget(claim)}
                        className="bg-green-700 hover:bg-green-600 text-white font-bold gap-1.5 h-8 px-3 text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectTarget(claim); setRejectNote(""); }}
                        className="border-red-500/40 text-red-400 hover:bg-red-900/20 font-bold gap-1.5 h-8 px-3 text-xs"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Recusar
                      </Button>
                    </>
                  )}
                  {claim.status === "APPROVED" && (
                    <Button
                      size="sm"
                      onClick={() => { setPayTarget(claim); setPayNote(""); }}
                      className="bg-blue-700 hover:bg-blue-600 text-white font-bold gap-1.5 h-8 px-3 text-xs"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Marcar como Pago
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Dialog: Aprovar ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!approveTarget} onOpenChange={open => !open && setApproveTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" /> Aprovar Prêmio
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Confirma a aprovação do prêmio{" "}
              <span className="text-white font-bold">{approveTarget?.prizeLabel}</span>{" "}
              de <span className="text-white font-bold">{formatCurrency(approveTarget?.prizeValue || 0)}</span>{" "}
              para <span className="text-white font-bold">{approveTarget?.brokerName}</span>?
              <br /><br />
              O corretor será notificado e o prêmio ficará como <span className="text-blue-300 font-semibold">Aprovado — aguardando pagamento</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-gray-600 text-gray-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-green-700 hover:bg-green-600 text-white font-bold"
            >
              {actionLoading ? "Aprovando..." : "Confirmar Aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Dialog: Recusar ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" /> Recusar Prêmio
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-gray-400 space-y-3">
                <p>
                  Recusar o prêmio de{" "}
                  <span className="text-white font-bold">{rejectTarget?.brokerName}</span>:{" "}
                  <span className="text-white font-bold">{rejectTarget?.prizeLabel}</span>
                </p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Motivo (opcional)</label>
                  <Input
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Ex: Meta não atingida completamente..."
                    className="bg-slate-800 border-gray-600 text-white placeholder-gray-600 text-sm"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-gray-600 text-gray-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={actionLoading}
              className="bg-red-700 hover:bg-red-600 text-white font-bold"
            >
              {actionLoading ? "Recusando..." : "Confirmar Recusa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Dialog: Marcar como Pago ─────────────────────────────────────────── */}
      <AlertDialog open={!!payTarget} onOpenChange={open => !open && setPayTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-blue-400" /> Registrar Pagamento
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-gray-400 space-y-3">
                <p>
                  Confirmar pagamento de{" "}
                  <span className="text-white font-bold">{formatCurrency(payTarget?.prizeValue || 0)}</span>{" "}
                  para <span className="text-white font-bold">{payTarget?.brokerName}</span>?
                </p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Observação (opcional)</label>
                  <Input
                    value={payNote}
                    onChange={e => setPayNote(e.target.value)}
                    placeholder="Ex: PIX enviado às 14h, chave CPF..."
                    className="bg-slate-800 border-gray-600 text-white placeholder-gray-600 text-sm"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-gray-600 text-gray-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkPaid}
              disabled={actionLoading}
              className="bg-blue-700 hover:bg-blue-600 text-white font-bold"
            >
              {actionLoading ? "Registrando..." : "Confirmar Pagamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
