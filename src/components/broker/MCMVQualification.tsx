import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Lead, FaixaMCMV, TipoTrabalho, FAIXA_MCMV } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ChevronRight, ChevronLeft, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectFaixa(rendaStr: string | null): FaixaMCMV {
  if (!rendaStr) return null;
  // Tenta extrair número da string (ex: "R$ 3.200" → 3200)
  const num = parseFloat(rendaStr.replace(/[^\d,]/g, "").replace(",", "."));
  if (isNaN(num)) return null;
  if (num <= 2640) return "FAIXA_1";
  if (num <= 4400) return "FAIXA_2";
  if (num <= 8000) return "FAIXA_3";
  return "FORA";
}

function calcQualificado(state: QualState): boolean | null {
  if (state.temImovel === null || state.jaUsouMcmv === null || state.faixaMcmv === null) return null;
  if (state.temImovel) return false;
  if (state.jaUsouMcmv) return false;
  if (state.faixaMcmv === "FORA") return false;
  return true;
}

function calcMotivo(state: QualState): string | null {
  if (state.temImovel)             return "Já possui imóvel no nome";
  if (state.jaUsouMcmv)            return "Já utilizou o programa MCMV";
  if (state.faixaMcmv === "FORA")  return "Renda acima da faixa máxima (R$8.000)";
  return null;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface QualState {
  rendaFamiliar: string;
  faixaMcmv: FaixaMCMV;
  fgtsDisponivel: string;
  tipoTrabalho: TipoTrabalho;
  temImovel: boolean | null;
  jaUsouMcmv: boolean | null;
}

interface MCMVQualificationProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MCMVQualification({ lead, open, onClose }: MCMVQualificationProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const [state, setState] = useState<QualState>(() => {
    // Pré-preenche com dados do Facebook se disponíveis
    const faixa = detectFaixa(lead.rendaDeclarada);
    return {
      rendaFamiliar: lead.rendaDeclarada || "",
      faixaMcmv: faixa,
      fgtsDisponivel: "",
      tipoTrabalho: lead.tipoTrabalho,
      temImovel: null,
      jaUsouMcmv: null,
    };
  });

  const totalSteps = 4;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const qualificado = calcQualificado(state);
      const motivo = qualificado === false ? calcMotivo(state) : null;

      await supabase.from("mcmv_qualification").upsert({
        lead_id:              lead.id,
        renda_familiar:       state.rendaFamiliar || null,
        faixa_mcmv:           state.faixaMcmv,
        fgts_disponivel:      state.fgtsDisponivel || null,
        tem_imovel:           state.temImovel,
        ja_usou_mcmv:         state.jaUsouMcmv,
        tipo_trabalho:        state.tipoTrabalho,
        qualificado,
        nao_qualifica_motivo: motivo,
        preenchido_por:       session?.user.id ?? "broker",
        updated_at:           new Date().toISOString(),
      }, { onConflict: "lead_id" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcmv-qual", lead.id] });
      onClose();
    },
  });

  const faixaCfg = state.faixaMcmv ? FAIXA_MCMV[state.faixaMcmv] : null;

  const STEPS = [
    // Passo 1 — Renda
    {
      title: "Renda familiar",
      hint: "Se não souber exato, pergunte: \"Qual seu salário líquido mensal?\"",
      content: (
        <div className="space-y-3">
          {/* Renda vinda do Facebook */}
          {lead.rendaDeclarada && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Facebook</span>
              <span className="text-sm text-white font-bold">{lead.rendaDeclarada}</span>
              <span className="text-[10px] text-gray-500">declarado no formulário</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Até R$ 2.640", faixa: "FAIXA_1" as FaixaMCMV },
              { label: "R$ 2.640 – 4.400", faixa: "FAIXA_2" as FaixaMCMV },
              { label: "R$ 4.400 – 8.000", faixa: "FAIXA_3" as FaixaMCMV },
              { label: "Acima de R$ 8.000", faixa: "FORA" as FaixaMCMV },
            ].map(opt => (
              <button
                key={opt.faixa}
                onClick={() => setState(s => ({ ...s, faixaMcmv: opt.faixa }))}
                className={cn(
                  "p-3 rounded-xl border text-sm font-bold text-left transition-all",
                  state.faixaMcmv === opt.faixa
                    ? "bg-indigo-600/30 border-indigo-500/60 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                )}
              >
                {opt.label}
                {opt.faixa !== "FORA" && (
                  <span className="block text-[10px] text-gray-600 mt-0.5">
                    {FAIXA_MCMV[opt.faixa].label}
                  </span>
                )}
                {opt.faixa === "FORA" && (
                  <span className="block text-[10px] text-red-500 mt-0.5">Fora do programa</span>
                )}
              </button>
            ))}
          </div>

          {faixaCfg && state.faixaMcmv !== "FORA" && (
            <p className={cn("text-xs font-bold text-center", faixaCfg.color)}>
              ✓ {faixaCfg.label} — elegível ao programa
            </p>
          )}
          {state.faixaMcmv === "FORA" && (
            <p className="text-xs font-bold text-center text-red-400">
              ✗ Renda acima da faixa — não se qualifica ao MCMV
            </p>
          )}
        </div>
      ),
      canAdvance: state.faixaMcmv !== null,
    },

    // Passo 2 — Tipo de trabalho + FGTS
    {
      title: "Vínculo e FGTS",
      hint: "Autônomo pode ter dificuldade na comprovação de renda pela Caixa",
      content: (
        <div className="space-y-4">
          {/* Tipo de trabalho */}
          {lead.tipoTrabalho && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Facebook</span>
              <span className="text-sm text-white font-bold">{lead.tipoTrabalho === "CLT" ? "CLT" : lead.tipoTrabalho === "AUTONOMO" ? "Autônomo" : "Func. Público"}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "CLT" as TipoTrabalho, label: "CLT", sub: "Carteira assinada" },
              { key: "AUTONOMO" as TipoTrabalho, label: "Autônomo", sub: "Verificar comprovação" },
              { key: "FUNCIONARIO_PUBLICO" as TipoTrabalho, label: "Func. Público", sub: "Mais fácil aprovação" },
            ] as { key: TipoTrabalho; label: string; sub: string }[]).map(opt => (
              <button
                key={opt.key!}
                onClick={() => setState(s => ({ ...s, tipoTrabalho: opt.key }))}
                className={cn(
                  "p-3 rounded-xl border text-xs font-bold text-center transition-all",
                  state.tipoTrabalho === opt.key
                    ? "bg-indigo-600/30 border-indigo-500/60 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                )}
              >
                {opt.label}
                <span className="block text-[9px] text-gray-600 mt-0.5">{opt.sub}</span>
              </button>
            ))}
          </div>

          {state.tipoTrabalho === "AUTONOMO" && (
            <p className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠️ Pergunte se tem pró-labore, decore atividade ou IR declarado. Sem comprovação, pode travar na Caixa.
            </p>
          )}

          <div>
            <p className="text-xs text-gray-500 mb-2">FGTS disponível (estimado)</p>
            <div className="grid grid-cols-3 gap-2">
              {["Menos de R$5k", "R$5k – R$15k", "Mais de R$15k"].map(opt => (
                <button
                  key={opt}
                  onClick={() => setState(s => ({ ...s, fgtsDisponivel: opt }))}
                  className={cn(
                    "p-2.5 rounded-xl border text-[11px] font-bold text-center transition-all",
                    state.fgtsDisponivel === opt
                      ? "bg-emerald-600/30 border-emerald-500/60 text-white"
                      : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
      canAdvance: true,
    },

    // Passo 3 — Tem imóvel?
    {
      title: "Tem imóvel no nome?",
      hint: "Pergunte: \"Você ou seu cônjuge tem algum imóvel registrado no CPF?\"",
      content: (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Não tem", value: false, color: "emerald", desc: "Elegível" },
            { label: "Tem imóvel", value: true, color: "red", desc: "Não se qualifica" },
          ].map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setState(s => ({ ...s, temImovel: opt.value }))}
              className={cn(
                "p-4 rounded-xl border-2 font-bold transition-all",
                state.temImovel === opt.value
                  ? opt.color === "emerald"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-red-600/30 border-red-500 text-red-300"
                  : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
              )}
            >
              <div className="text-2xl mb-1">{opt.value ? "🏠" : "✓"}</div>
              <div className="text-sm">{opt.label}</div>
              <div className={cn("text-[10px] mt-0.5", opt.color === "emerald" ? "text-emerald-500" : "text-red-500")}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      ),
      canAdvance: state.temImovel !== null,
    },

    // Passo 4 — Já usou o programa?
    {
      title: "Já usou o MCMV antes?",
      hint: "Pergunte: \"Você já comprou imóvel pelo Minha Casa Minha Vida anteriormente?\"",
      content: (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Não usou", value: false, color: "emerald", desc: "Elegível" },
            { label: "Já usou", value: true, color: "red", desc: "Não se qualifica" },
          ].map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setState(s => ({ ...s, jaUsouMcmv: opt.value }))}
              className={cn(
                "p-4 rounded-xl border-2 font-bold transition-all",
                state.jaUsouMcmv === opt.value
                  ? opt.color === "emertor"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : opt.color === "emerald"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-red-600/30 border-red-500 text-red-300"
                  : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
              )}
            >
              <div className="text-2xl mb-1">{opt.value ? "📋" : "✓"}</div>
              <div className="text-sm">{opt.label}</div>
              <div className={cn("text-[10px] mt-0.5", opt.color === "emerald" ? "text-emerald-500" : "text-red-500")}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      ),
      canAdvance: state.jaUsouMcmv !== null,
    },
  ];

  const currentStep = STEPS[step];
  const qualificado = calcQualificado(state);
  const isLastStep = step === totalSteps - 1;

  const handleReset = () => {
    setStep(0);
    setState({
      rendaFamiliar: lead.rendaDeclarada || "",
      faixaMcmv: detectFaixa(lead.rendaDeclarada),
      fgtsDisponivel: "",
      tipoTrabalho: lead.tipoTrabalho,
      temImovel: null,
      jaUsouMcmv: null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { onClose(); handleReset(); } }}>
      <SheetContent side="bottom" className="bg-[#0d1117] border-white/10 text-white rounded-t-2xl pb-safe-area-inset-bottom">
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-indigo-400" />
              Qualificação MCMV — {lead.name}
            </SheetTitle>
            {/* Progresso */}
            <span className="text-xs text-gray-500">{step + 1}/{totalSteps}</span>
          </div>
          {/* Barra de progresso */}
          <div className="h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </SheetHeader>

        {/* Resultado antecipado se já sabemos */}
        {step > 0 && qualificado === false && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/30 border border-red-500/20 mb-4">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{calcMotivo(state)} — não se qualifica</p>
          </div>
        )}
        {isLastStep && qualificado === true && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              {state.faixaMcmv ? FAIXA_MCMV[state.faixaMcmv].label : ""} · FGTS {state.fgtsDisponivel || "—"} · {state.tipoTrabalho ?? "—"} · QUALIFICADO ✓
            </p>
          </div>
        )}

        {/* Conteúdo do passo */}
        <div className="mb-4">
          <p className="text-sm font-black text-white mb-1">{currentStep.title}</p>
          {currentStep.hint && (
            <p className="text-[11px] text-gray-600 mb-3 italic">{currentStep.hint}</p>
          )}
          {currentStep.content}
        </div>

        {/* Navegação */}
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}
              className="border-white/10 bg-white/5 text-gray-400 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}

          {!isLastStep ? (
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
              disabled={!currentStep.canAdvance}
              onClick={() => setStep(s => s + 1)}
            >
              Próximo
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={!currentStep.canAdvance || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar qualificação"}
              <CheckCircle2 className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
