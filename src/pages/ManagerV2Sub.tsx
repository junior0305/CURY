// ManagerV2Sub — placeholders das 5 subtelas do painel v2.
// São componentes simples até a Fase 2/3/4 trazerem implementação real.
// Cada um já reusa o TopNav pra navegação consistente.

import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import {
  GraduationCap, Send, Trophy, BarChart3, Sparkles, ArrowLeft,
  Construction,
} from "lucide-react";
import TopNav from "@/components/manager-v2/TopNav";

function loadInter() {
  if (document.querySelector('link[data-v2-inter]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
  link.setAttribute("data-v2-inter", "true");
  document.head.appendChild(link);
}

function Shell({
  title,
  subtitle,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  children: React.ReactNode;
}) {
  useEffect(loadInter, []);
  const { session } = useAuth();
  if (!session) return null;
  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 antialiased"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/manager-v2" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cockpit</span>
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${color}20`, border: `1px solid ${color}50` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">{title}</h1>
              <p className="text-[10px] text-slate-500">{subtitle}</p>
            </div>
          </div>
        </div>
      </header>
      <TopNav />
      <main className="px-4 sm:px-6 mt-4 pb-12">{children}</main>
    </div>
  );
}

function ConstructionCard({ phase, items }: { phase: string; items: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-6 max-w-2xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
          <Construction className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-100">Em construção</h2>
          <p className="text-[11px] text-slate-500">prevista para a {phase}</p>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-3">O que vai chegar aqui:</p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ─── /manager-v2/coach ───────────────────────────────────────────────────────
export function CoachIndex() {
  return (
    <Shell title="Coach 1:1" subtitle="briefing por corretor com IA" icon={GraduationCap} color="#A78BFA">
      <ConstructionCard
        phase="Fase 2"
        items={[
          "Pauta automática gerada por IA pra cada corretor",
          "KPIs da semana vs média do time",
          "Trechos de conversas que travaram (do AI Coach)",
          "Pergunta livre pra IA com cap de 5/dia · 200 tokens",
          "Pacto vivo: o que combinaram na última 1:1, status do cumprimento",
        ]}
      />
    </Shell>
  );
}

export function CoachBroker() {
  const { brokerId } = useParams<{ brokerId: string }>();
  return (
    <Shell
      title="Coach 1:1"
      subtitle={`briefing do corretor ${brokerId?.slice(0, 8)}…`}
      icon={GraduationCap}
      color="#A78BFA"
    >
      <ConstructionCard
        phase="Fase 2"
        items={[
          `Briefing detalhado do corretor selecionado`,
          "Funil individual lado a lado com média do time",
          "AI Coach: 3 pontos fortes + 3 a melhorar",
          "Roteiro de conversa de 1:1",
          "Caixa de pergunta livre pra IA",
        ]}
      />
    </Shell>
  );
}

// ─── /manager-v2/campanha ────────────────────────────────────────────────────
export function CampanhaIndex() {
  return (
    <Shell title="Campanhas" subtitle="prospecção em massa via IA" icon={Send} color="#10B981">
      <ConstructionCard
        phase="Fase 3"
        items={[
          "Lista das suas campanhas (ativas, pausadas, concluídas)",
          "Click em uma campanha → vê respostas inline",
          "Atalho 'Nova campanha' com builder em tela cheia",
          "Métricas em tempo real: enviadas, respondidas, qualificadas",
        ]}
      />
    </Shell>
  );
}

export function CampanhaNova() {
  return (
    <Shell title="Nova Campanha" subtitle="builder em tela cheia" icon={Send} color="#10B981">
      <ConstructionCard
        phase="Fase 3"
        items={[
          "Upload da base (CSV/XLSX)",
          "Preview com validação de telefone",
          "Seleção de chip(s) — bloqueia chips offline",
          "Templates a usar (com score de cada)",
          "Janela de horário e cadência",
          "Preview da primeira mensagem antes de disparar",
        ]}
      />
    </Shell>
  );
}

// ─── /manager-v2/liga ────────────────────────────────────────────────────────
export function LigaPage() {
  return (
    <Shell title="Liga de Managers" subtitle="quem está vencendo a semana" icon={Trophy} color="#F59E0B">
      <ConstructionCard
        phase="Fase 3"
        items={[
          "Ranking semanal de todos os managers",
          "Click no rival → ver as campanhas dele que estão dando certo",
          "Templates que ele usa e você não tem (com botão clonar)",
          "Comparação de funil: onde sua equipe converte melhor/pior",
          "Heatmap de horários: quando time dele performa melhor",
        ]}
      />
    </Shell>
  );
}

// ─── /manager-v2/analise ─────────────────────────────────────────────────────
export function AnalisePage() {
  return (
    <Shell title="Análise" subtitle="tendências da semana e do mês" icon={BarChart3} color="#F472B6">
      <ConstructionCard
        phase="Fase 4"
        items={[
          "Funil completo da equipe (com taxas de conversão por etapa)",
          "Tendência de 8 semanas (gráfico)",
          "Origem dos leads convertidos vs perdidos",
          "Motivos de perda mais comuns (lost_reason)",
          "Performance por tipo de produto / faixa MCMV",
        ]}
      />
    </Shell>
  );
}
