// LaunchProductPrompt — modal "É deste lançamento?" Sim/Não/Outro.
// Aparece SÓ quando há lançamento ativo no momento da ação (visita/doc/venda).

import { Trophy, X } from "lucide-react";
import type { Launch } from "./useActiveLaunches";

interface Props {
  launches: Launch[];           // lançamentos ativos elegíveis
  actionLabel: string;          // "visita", "pasta", "venda"
  onConfirm: (launchId: string | null) => void;
  onCancel: () => void;
}

export default function LaunchProductPrompt({ launches, actionLabel, onConfirm, onCancel }: Props) {
  if (launches.length === 0) {
    // não deve acontecer — caller já filtra
    onConfirm(null);
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
         onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
           className="w-full max-w-md rounded-2xl border-2 p-5 space-y-4 relative"
           style={{
             background: "linear-gradient(135deg, rgba(251,191,36,0.20), rgba(15,23,42,0.95))",
             borderColor: "rgba(251,191,36,0.55)",
             boxShadow: "0 0 40px rgba(251,191,36,0.30)",
           }}>
        <button onClick={onCancel} className="absolute top-3 right-3 text-amber-300/60 hover:text-amber-200">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <Trophy className="w-8 h-8 text-amber-400" />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black text-amber-400">🏆 LANÇAMENTO ATIVO</div>
            <h3 className="text-lg font-black text-amber-200">
              {launches.length === 1 ? `Essa ${actionLabel} é do ${launches[0].name}?` : `De qual produto é essa ${actionLabel}?`}
            </h3>
            <p className="text-xs text-amber-100/70 mt-1">
              Se sim, conta no ranking do lançamento e te qualifica pro prêmio.
              <br />
              <span className="text-amber-300/60">⚠️ Secretária valida depois antes do pix sair.</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {launches.map(l => (
            <button key={l.id} onClick={() => onConfirm(l.id)}
              className="w-full text-left rounded-xl border-2 border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 px-4 py-3 transition flex items-center gap-3">
              <span className="text-2xl">{l.hero_emoji || "🚀"}</span>
              <div className="flex-1">
                <div className="font-black text-amber-200">Sim, é {l.name}</div>
                <div className="text-[11px] text-amber-300/70">
                  {l.reward_rules.map(r => `R$ ${r.prize_per_unit.toLocaleString("pt-BR")}/${r.action}`).join(" · ")}
                </div>
              </div>
            </button>
          ))}

          <button onClick={() => onConfirm(null)}
            className="w-full rounded-xl border border-gray-700 bg-slate-900/60 hover:bg-slate-900 px-4 py-3 transition text-sm font-bold text-gray-300">
            Não, é outro produto
          </button>
        </div>
      </div>
    </div>
  );
}
