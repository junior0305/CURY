import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, UserPlus, Loader2, Trophy, AlertCircle } from "lucide-react";
import type { User } from "@/types/user";
import type { LeadStatus, TipoTrabalho } from "@/types/lead";

interface Props {
  managerId: string;
  managerName: string;
  brokers: User[];
  onClose: () => void;
}

const STATUS_OPTIONS: { v: LeadStatus; label: string; color: string }[] = [
  { v: "NEW",              label: "Novo",            color: "#94A3B8" },
  { v: "IN_PROGRESS",      label: "Em atendimento",  color: "#00D4FF" },
  { v: "NEGOTIATING",      label: "Negociando",      color: "#A78BFA" },
  { v: "VISIT_SCHEDULED",  label: "Visita agendada", color: "#F59E0B" },
  { v: "VISITA_REALIZADA", label: "Visita feita",    color: "#F59E0B" },
  { v: "DOCS_REQUESTED",   label: "Docs enviados",   color: "#FBBF24" },
  { v: "CONCLUDED",        label: "🏆 Venda fechada", color: "#10B981" },
];

// Normaliza phone: aceita "11999999999", "+5511999999999", "(11) 99999-9999" etc.
function normalizePhone(raw: string): { phone: string|null; reason?: string } {
  if (!raw) return { phone: null, reason: "vazio" };
  const cleaned = String(raw).replace(/[^0-9+]/g, "");
  const digits = cleaned.replace(/^\+/, "");
  if (!digits) return { phone: null, reason: "sem dígitos" };
  if (/^[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: "55" + digits };
  if (/^55[1-9][1-9][0-9]{8,9}$/.test(digits)) return { phone: digits };
  if (/^[0-9]{10,15}$/.test(digits)) return { phone: digits };
  return { phone: null, reason: `formato inválido (${digits.length}d)` };
}

export function NewLeadModal({ managerId, managerName, brokers, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [origin, setOrigin] = useState("");
  const [product, setProduct] = useState("");
  const [renda, setRenda] = useState("");
  const [tipoTrabalho, setTipoTrabalho] = useState<TipoTrabalho>(null);
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [brokerId, setBrokerId] = useState<string>("");
  const [duplicateWarning, setDuplicateWarning] = useState<string|null>(null);

  const activeBrokers = useMemo(() => brokers.filter(b => b.leadAssignmentEnabled !== false), [brokers]);

  const phoneNorm = useMemo(() => normalizePhone(phone), [phone]);

  const checkDup = async (normalizedPhone: string) => {
    setDuplicateWarning(null);
    const { data } = await supabase.from("leads")
      .select("id, name, status")
      .eq("phone", normalizedPhone)
      .limit(1).maybeSingle();
    if (data) {
      setDuplicateWarning(`⚠️ Já existe um lead com esse telefone: "${data.name}" (status ${data.status})`);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!phoneNorm.phone) throw new Error("Telefone inválido: " + phoneNorm.reason);
      if (name.trim().length < 3) throw new Error("Nome muito curto");
      if (!brokerId) throw new Error("Selecione um corretor");

      const nowIso = new Date().toISOString();
      const tagValue = origin.trim() || `MANUAL_${managerName.toUpperCase().replace(/\s+/g, "_")}`;

      const insertPayload: any = {
        name: name.trim(),
        phone: phoneNorm.phone,
        email: email.trim() || null,
        status,
        broker_id: brokerId,
        manager_id: managerId,
        tag: tagValue,
        last_interaction_at: nowIso,
        contact_attempts: 0,
        created_at: nowIso,
        no_redistribute: true, // lead manual não deve ser redistribuído automaticamente
      };
      if (product.trim()) insertPayload.product = product.trim();
      if (renda.trim())   insertPayload.renda_declarada = renda.trim();
      if (tipoTrabalho)   insertPayload.tipo_trabalho = tipoTrabalho;
      if (status === "NEGOTIATING") insertPayload.negotiating_since = nowIso;

      const { data: lead, error } = await supabase.from("leads")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      // Auditoria
      await supabase.from("lead_notes").insert({
        lead_id: lead.id,
        content: `Lead criado manualmente pelo gerente ${managerName} em ${new Date().toLocaleString("pt-BR")}. Status inicial: ${status}. Origem: ${tagValue}.`,
        type: "SYSTEM",
      }).then(() => {}, () => {});

      // lead_state inicial
      await supabase.rpc("upsert_lead_state", {
        p_lead_id: lead.id,
        p_intencao: status === "CONCLUDED" ? "quente" : "sem_info",
        p_tema: "sem_info",
        p_momento: status === "CONCLUDED" ? "decidido" : "explorando",
        p_ultimo_evento: "lead_criado_manualmente",
        p_modo: "manual",
        p_proxima_acao: status === "CONCLUDED" ? "concluido" : "atender",
        p_bloqueado: false,
        p_atualizado_por: `manager_${managerName}`,
      }).then(() => {}, () => {});

      return lead;
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ["teamLeads"] });
      qc.invalidateQueries({ queryKey: ["unassignedLeads"] });
      if (status === "CONCLUDED") {
        toast.success(`🏆 Venda registrada! ${lead.name} marcado como CONCLUDED`);
      } else {
        toast.success(`✅ Lead "${lead.name}" criado`);
      }
      onClose();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const isValid = name.trim().length >= 3 && phoneNorm.phone && brokerId;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--crm-surface-hex, #0D1117)", border: "1px solid rgba(0,212,255,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black flex items-center gap-2" style={{ color: "var(--crm-text)" }}>
            <UserPlus className="w-5 h-5" style={{ color: "#00D4FF" }} />
            Novo Lead Manual
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: "var(--crm-text-muted)" }} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Nome + Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Nome *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="João da Silva"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Telefone *</label>
              <input value={phone}
                onChange={e => { setPhone(e.target.value); setDuplicateWarning(null); }}
                onBlur={() => { if (phoneNorm.phone) checkDup(phoneNorm.phone); }}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--crm-surface)",
                  border: `1px solid ${phone && !phoneNorm.phone ? "rgba(239,68,68,0.5)" : "var(--crm-border-mid)"}`,
                  color: "var(--crm-text)"
                }} />
              {phoneNorm.phone && (
                <p className="text-[10px] mt-0.5 font-mono" style={{ color: "#10B981" }}>→ {phoneNorm.phone}</p>
              )}
              {phone && !phoneNorm.phone && (
                <p className="text-[10px] mt-0.5" style={{ color: "#EF4444" }}>{phoneNorm.reason}</p>
              )}
            </div>
          </div>

          {duplicateWarning && (
            <div className="rounded-lg p-2 flex items-start gap-2 text-[11px]"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {/* Email + Origem */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="opcional"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Origem / Tag</label>
              <input value={origin} onChange={e => setOrigin(e.target.value)}
                placeholder={`MANUAL_${managerName.toUpperCase()}`}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }} />
            </div>
          </div>

          {/* Produto + Renda + Tipo trabalho */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Produto</label>
              <input value={product} onChange={e => setProduct(e.target.value)} placeholder="ex: BARRA_FUNDA"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Renda</label>
              <input value={renda} onChange={e => setRenda(e.target.value)} placeholder="3500"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>Trabalho</label>
              <select value={tipoTrabalho || ""} onChange={e => setTipoTrabalho((e.target.value || null) as TipoTrabalho)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}>
                <option value="">—</option>
                <option value="CLT">CLT</option>
                <option value="AUTONOMO">Autônomo</option>
                <option value="FUNCIONARIO_PUBLICO">Func. Público</option>
              </select>
            </div>
          </div>

          {/* Status inicial */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--crm-text-muted)" }}>Status inicial</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <button key={s.v} onClick={() => setStatus(s.v)}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all"
                  style={{
                    background: status === s.v ? `${s.color}25` : "var(--crm-glass)",
                    border: `1px solid ${status === s.v ? `${s.color}80` : "var(--crm-border-mid)"}`,
                    color: status === s.v ? s.color : "var(--crm-text)",
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
            {status === "CONCLUDED" && (
              <div className="mt-2 rounded-lg p-2 flex items-start gap-2 text-[11px]"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}>
                <Trophy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Lead será criado já como <strong>venda fechada</strong> — credita XP ao corretor selecionado.</span>
              </div>
            )}
          </div>

          {/* Corretor */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--crm-text-muted)" }}>
              Corretor *
              {status === "CONCLUDED" && <span className="ml-1 text-[10px] font-normal" style={{ color: "#10B981" }}>(quem fechou a venda)</span>}
            </label>
            <select value={brokerId} onChange={e => setBrokerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--crm-surface)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}>
              <option value="">Selecione…</option>
              {activeBrokers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-[11px] font-bold"
            style={{ background: "var(--crm-glass)", border: "1px solid var(--crm-border-mid)", color: "var(--crm-text)" }}>
            Cancelar
          </button>
          <button onClick={() => createMutation.mutate()} disabled={!isValid || createMutation.isPending}
            className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5"
            style={{
              background: status === "CONCLUDED" ? "rgba(16,185,129,0.2)" : "rgba(0,212,255,0.18)",
              border: `1px solid ${status === "CONCLUDED" ? "rgba(16,185,129,0.5)" : "rgba(0,212,255,0.5)"}`,
              color: status === "CONCLUDED" ? "#10B981" : "#00D4FF",
            }}>
            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : status === "CONCLUDED" ? <Trophy className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            {status === "CONCLUDED" ? "Registrar venda" : "Criar lead"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
