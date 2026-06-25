// CoachBroker — briefing 1:1 detalhado de um corretor.
// KPIs vs equipe + trechos travados + roteiro de 1:1 + pergunta livre.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import {
  GraduationCap, Loader2, Power, PowerOff, Send, Sparkles, AlertTriangle,
  CheckCircle, MessageSquare, Eye, Bell, ArrowLeft, ChevronRight, Target, Clock,
  Users, TrendingUp, TrendingDown, ExternalLink,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

interface Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  bot_instance_id: string | null;
  lead_assignment_enabled: boolean | null;
  manager_id: string | null;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  last_interaction_at: string | null;
  last_lead_response_at: string | null;
  last_broker_whatsapp_at: string | null;
  contact_attempts: number | null;
  tag: string | null;
  negotiating_since: string | null;
}

interface CoachAnalysis {
  quality_score: number | null;
  severity: string | null;
  summary: string | null;
  errors: any[] | null;
  positives: any[] | null;
  suggestion: string | null;
  created_at: string;
  lead_id: string;
}

const QUICK_QUESTIONS_BROKER = [
  "Qual o maior gargalo deste corretor?",
  "Como abordá-lo na 1:1 hoje?",
  "Vale investir nele ou redistribuir os leads?",
  "Que script ele deveria estar usando?",
];

const DAILY_LIMIT = 5;
const STORAGE_KEY = "v2-broker-coach-questions-today";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function getTodayCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return data.date === new Date().toDateString() ? data.count : 0;
  } catch { return 0; }
}

function incrementCount() {
  const cur = getTodayCount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toDateString(), count: cur + 1 }));
  return cur + 1;
}

function hoursSince(iso: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

interface KpiCompare { broker: number; team: number; better: boolean; }

export default function CoachBroker() {
  const { brokerId } = useParams<{ brokerId: string }>();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [broker, setBroker] = useState<Broker | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analyses, setAnalyses] = useState<CoachAnalysis[]>([]);
  const [teamLeads, setTeamLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Pergunta livre
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [askedToday, setAskedToday] = useState(getTodayCount());
  const askRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!brokerId || !userId) return;
    (async () => {
      setLoading(true);

      const { data: brokerData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone, bot_instance_id, lead_assignment_enabled, manager_id")
        .eq("id", brokerId)
        .maybeSingle();

      if (brokerData?.manager_id !== userId) {
        // Segurança: corretor não é do meu time
        setLoading(false);
        return;
      }
      setBroker(brokerData);

      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, name, phone, status, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, tag, negotiating_since")
        .eq("broker_id", brokerId)
        .limit(500);
      setLeads((leadsData as Lead[]) || []);

      // Análises do AI Coach pra esse broker (se houver)
      const { data: anData } = await supabase
        .from("ai_coach_analysis")
        .select("quality_score, severity, summary, errors, positives, suggestion, created_at, lead_id")
        .eq("broker_id", brokerId)
        .order("created_at", { ascending: false })
        .limit(20);
      setAnalyses((anData as CoachAnalysis[]) || []);

      // Leads do time (média) — só broker_ids do meu manager_id
      const { data: peers } = await supabase
        .from("profiles").select("id").eq("manager_id", userId).eq("role", "BROKER");
      const peerIds = (peers || []).map((p: any) => p.id).filter((id: string) => id !== brokerId);
      if (peerIds.length > 0) {
        const { data: teamData } = await supabase
          .from("leads")
          .select("id, status, created_at, last_interaction_at, last_broker_whatsapp_at")
          .in("broker_id", peerIds)
          .limit(2000);
        setTeamLeads((teamData as Lead[]) || []);
      }

      setLoading(false);
    })();
  }, [brokerId, userId]);

  const kpis = useMemo(() => {
    if (!broker) return null;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    function calc(list: Lead[], ids?: number) {
      const total = list.length;
      const peerCount = ids || 1;
      // Vendas semana
      const vendas = list.filter((l) =>
        l.status === "CONCLUDED" && l.last_interaction_at && new Date(l.last_interaction_at) >= weekAgo
      ).length;
      // Conversão simples: CONCLUDED / total
      const conv = total > 0 ? (list.filter((l) => l.status === "CONCLUDED").length / total) * 100 : 0;
      // TPR médio
      const tprs = list
        .filter((l: any) => l.last_broker_whatsapp_at)
        .map((l: any) => (new Date(l.last_broker_whatsapp_at).getTime() - new Date(l.created_at).getTime()) / 60000)
        .filter((m) => m >= 0 && m < 60 * 24 * 7);
      const tpr = tprs.length > 0 ? tprs.reduce((s, d) => s + d, 0) / tprs.length : null;
      // Pipeline
      const pipeline = list.filter((l) =>
        ["DOCS_REQUESTED", "VISIT_SCHEDULED", "VISITA_REALIZADA"].includes(l.status)
      ).length;
      // Quentes ignorados
      const quentes = list.filter((l: any) => {
        if (!l.last_lead_response_at) return false;
        const respH = (Date.now() - new Date(l.last_lead_response_at).getTime()) / 3600000;
        const brokerH = l.last_broker_whatsapp_at
          ? (Date.now() - new Date(l.last_broker_whatsapp_at).getTime()) / 3600000
          : Infinity;
        return respH > 2 && respH < 48 && brokerH > respH;
      }).length;
      return {
        vendas: vendas / peerCount,
        conv: conv,
        tpr,
        pipeline: pipeline / peerCount,
        ativos: list.filter((l) => !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)).length / peerCount,
        quentes,
      };
    }

    const me = calc(leads);
    const peerCount = Math.max(1, new Set(teamLeads.map((l: any) => l.broker_id)).size);
    const team = calc(teamLeads, peerCount);

    return {
      vendas: { broker: Math.round(me.vendas), team: Math.round(team.vendas * 10) / 10, better: me.vendas >= team.vendas } as KpiCompare,
      conv: { broker: Math.round(me.conv), team: Math.round(team.conv), better: me.conv >= team.conv } as KpiCompare,
      tpr: me.tpr !== null && team.tpr !== null
        ? { broker: Math.round(me.tpr), team: Math.round(team.tpr), better: me.tpr <= team.tpr } as KpiCompare
        : null,
      pipeline: { broker: Math.round(me.pipeline), team: Math.round(team.pipeline * 10) / 10, better: me.pipeline >= team.pipeline } as KpiCompare,
      ativos: { broker: Math.round(me.ativos), team: Math.round(team.ativos * 10) / 10, better: true } as KpiCompare,
      quentes: me.quentes,
    };
  }, [broker, leads, teamLeads]);

  // Gera briefing automático com base nos dados (heurísticas, não LLM ainda)
  const briefing = useMemo(() => {
    if (!broker || !kpis) return null;
    const points: { type: "fortes" | "melhorar"; text: string }[] = [];
    const ausente = broker.lead_assignment_enabled === false;

    // Pontos fortes
    if (kpis.vendas.better && kpis.vendas.broker > 0) {
      points.push({ type: "fortes", text: `Vendendo no ritmo do time (${kpis.vendas.broker}/sem vs ${kpis.vendas.team}/sem da média)` });
    }
    if (kpis.tpr && kpis.tpr.better) {
      points.push({ type: "fortes", text: `TPR melhor que a média do time (${kpis.tpr.broker}min vs ${kpis.tpr.team}min)` });
    }
    if (kpis.pipeline.better && kpis.pipeline.broker > 0) {
      points.push({ type: "fortes", text: `Pipeline forte: ${kpis.pipeline.broker} leads em fase final` });
    }
    if (analyses.length > 0) {
      const positives = analyses.flatMap((a) => a.positives || []).slice(0, 2);
      positives.forEach((p: any) => {
        const txt = typeof p === "string" ? p : p?.description;
        if (txt) points.push({ type: "fortes", text: txt });
      });
    }

    // Pontos a melhorar
    if (kpis.quentes > 0) {
      points.push({ type: "melhorar", text: `${kpis.quentes} lead(s) quentes esperando resposta há +2h — perda iminente` });
    }
    if (kpis.tpr && !kpis.tpr.better) {
      points.push({ type: "melhorar", text: `TPR lento: ${kpis.tpr.broker}min (média do time: ${kpis.tpr.team}min). Velocidade na 1ª resposta = mais conversão` });
    }
    if (!kpis.vendas.better && kpis.vendas.team > 0) {
      points.push({ type: "melhorar", text: `Vendas abaixo da média: ${kpis.vendas.broker} vs ${kpis.vendas.team} do time` });
    }
    if (analyses.length > 0) {
      const errors = analyses.flatMap((a) => a.errors || []).slice(0, 2);
      errors.forEach((e: any) => {
        const txt = typeof e === "string" ? e : e?.description;
        if (txt) points.push({ type: "melhorar", text: txt });
      });
    }
    if (ausente) {
      points.push({ type: "melhorar", text: "Marcado como ausente — leads não estão sendo distribuídos" });
    }

    return {
      fortes: points.filter((p) => p.type === "fortes").slice(0, 3),
      melhorar: points.filter((p) => p.type === "melhorar").slice(0, 4),
    };
  }, [broker, kpis, analyses]);

  // Conversas que travaram (leads parados +24h com last_lead_response_at sem broker reply)
  const conversasTravadas = useMemo(() => {
    return leads
      .filter((l: any) => {
        if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status)) return false;
        if (!l.last_lead_response_at) return false;
        const respH = hoursSince(l.last_lead_response_at);
        const brokerH = hoursSince(l.last_broker_whatsapp_at);
        return respH > 6 && brokerH > respH;
      })
      .sort((a: any, b: any) => new Date(b.last_lead_response_at).getTime() - new Date(a.last_lead_response_at).getTime())
      .slice(0, 5);
  }, [leads]);

  // Roteiro 1:1 dinâmico
  const roteiro = useMemo(() => {
    if (!broker || !kpis || !briefing) return [];
    const items: { titulo: string; texto: string; minutos: number }[] = [];
    items.push({
      titulo: "Abertura emocional (5min)",
      texto: `Pergunte como ${broker.first_name} está. Não comece pelos números. Escute. Algumas pessoas vão te dar a chave da semana só nessa pergunta.`,
      minutos: 5,
    });
    if (briefing.fortes.length > 0) {
      items.push({
        titulo: "Reforço positivo (5min)",
        texto: `Mostre 1 vitória recente: "${briefing.fortes[0].text}". Reconhecer antes de cobrar gera ouvido.`,
        minutos: 5,
      });
    }
    if (briefing.melhorar.length > 0) {
      items.push({
        titulo: "Diagnóstico do gap (10min)",
        texto: `Apresente o ponto principal: "${briefing.melhorar[0].text}". Pergunte o que ele acha que está acontecendo. Não imponha — investigue junto.`,
        minutos: 10,
      });
    }
    if (kpis.quentes > 0) {
      items.push({
        titulo: "Plano de ação imediato (5min)",
        texto: `Pacto pra hoje: ${kpis.quentes} leads quentes esperando — peça que ele atenda TODOS antes do fim do expediente. Combine de você cobrar às 18h.`,
        minutos: 5,
      });
    }
    items.push({
      titulo: "Pacto da semana (5min)",
      texto: "Combine UMA mudança específica e mensurável. Não 5. Uma. Marque a próxima 1:1 pra revisar.",
      minutos: 5,
    });
    return items;
  }, [broker, kpis, briefing]);

  async function togglePresence() {
    if (!broker) return;
    const newState = !(broker.lead_assignment_enabled ?? true);
    if (!newState && !window.confirm(`Marcar ${broker.first_name} como AUSENTE?\n\nEle PARA de receber leads novos automaticamente até ser reativado.`)) {
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ lead_assignment_enabled: newState })
      .eq("id", broker.id);
    if (error) { toast.error("Falha: " + error.message); return; }
    setBroker({ ...broker, lead_assignment_enabled: newState });
    toast.success(newState ? `✅ ${broker.first_name} ativo` : `🚫 ${broker.first_name} ausente`);
  }

  function fakeAnswer(q: string): string {
    if (!broker || !kpis) return "Sem dados suficientes pra responder.";
    const ql = q.toLowerCase();
    if (ql.includes("gargalo") || ql.includes("problema")) {
      if (kpis.quentes > 0) return `O gargalo de ${broker.first_name} agora são os ${kpis.quentes} leads quentes ignorados há +2h. Antes de tudo, faça ele atender. Depois investigue por quê.`;
      if (kpis.tpr && !kpis.tpr.better) return `Velocidade. ${broker.first_name} responde em ${kpis.tpr.broker}min, time em ${kpis.tpr.team}min. Cada min de delay perde ~10% de conversão.`;
      if (!kpis.vendas.better) return `Conversão pra venda. ${broker.first_name} tem pipeline (${kpis.pipeline.broker}) mas não fecha. Pode ser fechamento (treinar) ou qualificação ruim (filtrar antes).`;
      return `Sem gargalo evidente — ${broker.first_name} está performando. Reforce, mantenha autonomia.`;
    }
    if (ql.includes("aborda") || ql.includes("1:1") || ql.includes("conversa")) {
      return `Comece pelo emocional ("Como tá a semana?"). Mostre 1 vitória recente. Apresente 1 dado que precisa mudar (não 5 — só 1). Combine UMA ação pra próxima semana. Termina em 25-30min.`;
    }
    if (ql.includes("redistribuir") || ql.includes("vale") || ql.includes("investir")) {
      const score = (kpis.vendas.better ? 1 : 0) + (kpis.tpr?.better ? 1 : 0) + (kpis.pipeline.better ? 1 : 0);
      if (score >= 2) return `Investir. ${broker.first_name} tem fundamentos bons em ${score}/3 KPIs. Coaching individual rende mais que redistribuir.`;
      if (kpis.quentes >= 5) return `Redistribuir os quentes ignorados imediatamente. Pra os outros, dê 2 semanas de coaching. Se não evoluir, redistribui.`;
      return `Misto. ${score}/3 KPIs ok. Tente 2 semanas de coaching focado num único ponto. Se não mexer, considere redistribuir parte do funil.`;
    }
    if (ql.includes("script") || ql.includes("template") || ql.includes("usar")) {
      return `Templates campeões da rede: "Aprovação" (score 6.2) e "Sem entrada" (5.8). Confirme com ${broker.first_name} se ele já testou. Se ainda tá usando os antigos, troca hoje.`;
    }
    return `${broker.first_name}: ${kpis.vendas.broker} vendas/sem, pipeline ${kpis.pipeline.broker}, ${kpis.quentes} quentes ignorados. ${kpis.vendas.better ? "Performando." : "Abaixo da média do time."}. Pra resposta detalhada preciso da Fase 2 com IA conectada ao banco.`;
  }

  async function handleAsk() {
    if (!question.trim() || askBusy || askedToday >= DAILY_LIMIT) return;
    setAskBusy(true);
    const newCount = incrementCount();
    setAskedToday(newCount);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    setAnswer(fakeAnswer(question));
    setAskBusy(false);
    setTimeout(() => askRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 200);
  }

  if (!brokerId || !userId) {
    return (
      <Shell title="Coach 1:1" subtitle="briefing por corretor" icon={GraduationCap} color="#A78BFA">
        <p className="text-center text-slate-500 py-8">Sessão inválida.</p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell title="Coach 1:1" subtitle="carregando…" icon={GraduationCap} color="#A78BFA">
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> preparando briefing…
        </div>
      </Shell>
    );
  }

  if (!broker) {
    return (
      <Shell title="Coach 1:1" subtitle="" icon={GraduationCap} color="#A78BFA">
        <div className="rounded-2xl bg-slate-900/60 border border-red-500/30 p-6 text-center">
          <p className="text-red-300 font-bold">Corretor não encontrado ou não pertence ao seu time.</p>
          <Link to="/manager/coach" className="text-cyan-400 hover:text-cyan-300 text-sm mt-2 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Voltar pra lista
          </Link>
        </div>
      </Shell>
    );
  }

  const name = `${broker.first_name || ""} ${broker.last_name || ""}`.trim() || "—";
  const ausente = broker.lead_assignment_enabled === false;

  return (
    <Shell
      title={`Coach: ${name}`}
      subtitle="briefing automático pra 1:1"
      icon={GraduationCap}
      color="#A78BFA"
      actions={
        <Link
          to="/manager/coach"
          className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 flex items-center gap-1 transition"
        >
          <Users className="w-3 h-3" /> Trocar corretor
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* ─── Sidebar: identidade ─────────────────────────────────────────── */}
        <aside className="space-y-3">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4">
            <div className="flex flex-col items-center text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black mb-3"
                style={{
                  background: ausente ? "rgba(113,113,122,0.2)" : "rgba(167,139,250,0.2)",
                  border: `2px solid ${ausente ? "#71717A" : "#A78BFA"}50`,
                  color: ausente ? "#71717A" : "#A78BFA",
                }}
              >
                {initials(name)}
              </div>
              <h2 className="text-base font-bold text-slate-100">{name}</h2>
              <button
                onClick={togglePresence}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition"
                style={{
                  background: ausente ? "rgba(113,113,122,0.15)" : "rgba(16,185,129,0.15)",
                  border: `1px solid ${ausente ? "#71717A" : "#10B981"}50`,
                  color: ausente ? "#A1A1AA" : "#10B981",
                }}
              >
                {ausente ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                {ausente ? "Ausente · ativar" : "Ativo · pausar"}
              </button>
            </div>
          </div>

          {kpis && (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  KPIs · vs equipe
                </h3>
              </div>
              <div className="divide-y divide-slate-800/40">
                <KpiRow label="Vendas (sem)" data={kpis.vendas} suffix="" />
                {kpis.tpr && <KpiRow label="TPR (min)" data={kpis.tpr} suffix=" min" inverted />}
                <KpiRow label="Pipeline" data={kpis.pipeline} suffix="" />
                <KpiRow label="Conversão" data={kpis.conv} suffix="%" />
                <KpiRow label="Ativos" data={kpis.ativos} suffix="" noCompare />
              </div>
            </div>
          )}
        </aside>

        {/* ─── Conteúdo principal ──────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Briefing */}
          {briefing && (
            <div className="rounded-2xl bg-slate-900/60 border border-violet-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-300">
                  Briefing automático
                </h3>
                <span className="text-[11px] text-slate-500 ml-auto">
                  baseado em {leads.length} leads · IA real Fase 2
                </span>
              </div>
              <div className="grid md:grid-cols-2 divide-x divide-slate-800/40">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <h4 className="text-xs font-bold text-emerald-300">3 pontos fortes</h4>
                  </div>
                  {briefing.fortes.length > 0 ? (
                    <ul className="space-y-1.5">
                      {briefing.fortes.map((p, i) => (
                        <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                          <span className="text-emerald-400 shrink-0">•</span>
                          {p.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Sem dados suficientes pra destacar pontos fortes.</p>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <h4 className="text-xs font-bold text-amber-300">A trabalhar</h4>
                  </div>
                  {briefing.melhorar.length > 0 ? (
                    <ul className="space-y-1.5">
                      {briefing.melhorar.map((p, i) => (
                        <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                          <span className="text-amber-400 shrink-0">•</span>
                          {p.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Nada urgente. Reforce o que está funcionando.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conversas que travaram */}
          {conversasTravadas.length > 0 && (
            <div className="rounded-2xl bg-slate-900/60 border border-red-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-red-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-red-300">
                  Conversas que travaram
                </h3>
                <span className="text-[11px] text-slate-500 ml-auto">
                  {conversasTravadas.length} lead(s) respondeu e foi ignorado
                </span>
              </div>
              <div className="divide-y divide-slate-800/40">
                {conversasTravadas.map((l: any) => (
                  <div key={l.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">{l.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        Respondeu há {Math.round(hoursSince(l.last_lead_response_at))}h ·
                        Última msg do corretor há {l.last_broker_whatsapp_at
                          ? Math.round(hoursSince(l.last_broker_whatsapp_at)) + "h"
                          : "nunca"}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded">
                      ignorado
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-800/60 text-[11px] text-slate-500 text-center">
                use isso na 1:1 — pergunte por que ele não respondeu
              </div>
            </div>
          )}

          {/* Roteiro de 1:1 */}
          {roteiro.length > 0 && (
            <div className="rounded-2xl bg-slate-900/60 border border-cyan-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-cyan-300">
                  Roteiro de 1:1 sugerido
                </h3>
                <span className="text-[11px] text-slate-500 ml-auto">
                  ~{roteiro.reduce((s, r) => s + r.minutos, 0)}min total
                </span>
              </div>
              <div className="divide-y divide-slate-800/40">
                {roteiro.map((r, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="px-4 py-3 flex gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-300 text-xs font-black shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-100">{r.titulo}</p>
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{r.texto}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Pergunta livre IA */}
          <div className="rounded-2xl bg-slate-900/60 border border-violet-500/30 overflow-hidden" ref={askRef}>
            <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-300">
                Pergunte ao Coach IA
              </h3>
              <span className="text-[11px] text-slate-500 ml-auto">
                {DAILY_LIMIT - askedToday}/{DAILY_LIMIT} hoje
              </span>
            </div>
            <div className="p-4 space-y-3">
              {answer && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-violet-500/[0.06] border border-violet-500/30 p-3"
                >
                  <p className="text-sm text-slate-200 leading-relaxed">{answer}</p>
                </motion.div>
              )}

              {askedToday >= DAILY_LIMIT ? (
                <p className="text-xs text-slate-500 text-center py-2">
                  ⏳ Limite diário atingido. Volta amanhã.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {QUICK_QUESTIONS_BROKER.map((q) => (
                      <button
                        key={q}
                        onClick={() => { setQuestion(q); setTimeout(handleAsk, 50); }}
                        className="text-[11px] text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 transition"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
                      placeholder={`Pergunta livre sobre ${broker.first_name}…`}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                      disabled={askBusy}
                    />
                    <button
                      onClick={handleAsk}
                      disabled={askBusy || !question.trim()}
                      className="px-3 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 disabled:opacity-30 transition"
                    >
                      {askBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              )}
              <p className="text-[11px] text-slate-600 text-center">
                respostas baseadas em heurísticas + dados do banco · IA real Fase 2
              </p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function KpiRow({
  label, data, suffix, inverted, noCompare,
}: {
  label: string; data: KpiCompare; suffix: string; inverted?: boolean; noCompare?: boolean;
}) {
  // "better" significa "está melhor que a média". Se inverted (TPR), menor = melhor.
  const better = inverted ? data.broker <= data.team : data.broker >= data.team;
  const color = noCompare ? "#94A3B8" : better ? "#10B981" : "#EF4444";
  const TrendIcon = noCompare ? null : better ? TrendingUp : TrendingDown;
  return (
    <div className="px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-base font-black tabular-nums" style={{ color }}>
          {data.broker}{suffix}
        </span>
        {!noCompare && (
          <>
            <span className="text-[11px] text-slate-500">vs {data.team}{suffix}</span>
            {TrendIcon && <TrendIcon className="w-3 h-3" style={{ color }} />}
          </>
        )}
      </div>
    </div>
  );
}
