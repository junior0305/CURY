import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Play, CheckCircle2, XCircle, Bot, Brain,
  MessageSquare, Webhook, Smartphone, Bell, Zap, Shield,
  Activity, Inbox, Users, AlertTriangle, HeartPulse,
} from "lucide-react";

type Status = "ok" | "ocioso" | "erro" | "desabilitado";

const STATUS_CFG: Record<Status, { label: string; badge: string; dot: string }> = {
  ok:          { label: "OK",          badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  ocioso:      { label: "Ocioso",      badge: "bg-yellow-500/20  text-yellow-400  border-yellow-500/30",  dot: "bg-yellow-400"  },
  erro:        { label: "Erro",        badge: "bg-red-500/20     text-red-400     border-red-500/30",     dot: "bg-red-500"     },
  desabilitado:{ label: "Desabilitado",badge: "bg-slate-600/20   text-slate-400   border-slate-600/30",   dot: "bg-slate-500"   },
};

function timeAgo(iso?: string | null) {
  if (!iso) return "nunca";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface CardProps {
  title: string;
  icon: React.ElementType;
  status: Status;
  detail: string;
  action?: React.ReactNode;
}

function ModuleCard({ title, icon: Icon, status, detail, action }: CardProps) {
  const cfg = STATUS_CFG[status];
  return (
    <Card className="p-4 bg-slate-900/60 border-slate-700/50 flex flex-col gap-3 min-h-[130px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
        <Badge className={cn("text-xs border font-semibold shrink-0", cfg.badge)}>
          <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block shrink-0", cfg.dot)} />
          {cfg.label}
        </Badge>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed flex-1">{detail}</p>
      {action && <div>{action}</div>}
    </Card>
  );
}


export default function SistemaControl() {
  const [raw, setRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [checkedAt, setCheckedAt] = useState(new Date());
  const [alertPhone, setAlertPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0] + "T00:00:00Z";

    const [
      { data: distLogs },
      { data: schedulerRuns },
      { count: cadenceCount },
      { data: cerebroSetting },
      { data: cerebroRun },
      { count: queuePending },
      { data: sentinela },
      { data: coachAnalysis },
      { data: iaMsg },
      { data: webhookLead },
      { data: bots },
      { data: notifSetting },
      { count: notifCount },
      { data: guardianHeartbeat },
      { data: guardianActiveAlerts },
      { data: guardianAlertPhone },
    ] = await Promise.all([
      supabase.from("distribution_logs").select("lead_name, created_at").order("created_at", { ascending: false }).limit(3),
      supabase.from("scheduler_runs").select("*").order("ran_at", { ascending: false }).limit(10),
      supabase.from("cadence_templates").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("system_settings").select("value").eq("key", "cerebro_enabled").maybeSingle(),
      supabase.from("cerebro_runs").select("*").order("ran_at", { ascending: false }).limit(10),
      supabase.from("lead_activation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("ai_sentinela_config").select("is_enabled,monthly_spent_usd,monthly_budget_usd,provider,model_name").maybeSingle(),
      supabase.from("ai_coach_analysis").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ia_messages").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("leads").select("last_lead_response_at").not("last_lead_response_at", "is", null).order("last_lead_response_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("bot_instances").select("id,name,instance_name,status"),
      supabase.from("system_settings").select("value").eq("key", "notify_brokers_enabled").maybeSingle(),
      supabase.from("internal_notifications").select("id", { count: "exact", head: true }).gte("created_at", today),
      supabase.from("guardian_alerts").select("created_at, message").eq("check_type", "heartbeat").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("guardian_alerts").select("check_type, severity, message, created_at").is("resolved_at", null).neq("check_type", "heartbeat").order("created_at", { ascending: false }).limit(10),
      supabase.from("system_settings").select("value").eq("key", "guardian_alert_phone").maybeSingle(),
    ]);

    setRaw({ distLogs, schedulerRuns, cadenceCount, cerebroSetting, cerebroRuns: cerebroRun, queuePending, sentinela, coachAnalysis, iaMsg, webhookLead, bots, notifSetting, notifCount, guardianHeartbeat, guardianActiveAlerts, now });
    if (guardianAlertPhone?.value) setAlertPhone(guardianAlertPhone.value);
    setCheckedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const toggleCerebro = async (val: boolean) => {
    await supabase.from("system_settings").upsert({ key: "cerebro_enabled", value: String(val) }, { onConflict: "key" });
    toast.success(val ? "Cérebro Central ativado" : "Cérebro Central desativado");
    fetchAll();
  };

  const toggleSentinela = async (val: boolean) => {
    await supabase.from("ai_sentinela_config").update({ is_enabled: val });
    toast.success(val ? "Sentinela IA ativada" : "Sentinela IA desativada");
    fetchAll();
  };

  const toggleNotif = async (val: boolean) => {
    await supabase.from("system_settings").upsert({ key: "notify_brokers_enabled", value: val }, { onConflict: "key" });
    toast.success(val ? "Notificações ativadas" : "Notificações desativadas");
    fetchAll();
  };

  const saveAlertPhone = async () => {
    setSavingPhone(true);
    await supabase.from("system_settings").upsert({ key: "guardian_alert_phone", value: alertPhone || null }, { onConflict: "key" });
    toast.success(alertPhone ? "Telefone de alerta salvo" : "Alerta por WhatsApp desativado");
    setSavingPhone(false);
  };

  const handleRunNow = () => {
    setRunning(true);
    toast.info("Scheduler iniciado. Aguarde...");
    supabase.functions.invoke("followup_scheduler", { body: {} }).catch(() => {});
    setTimeout(async () => {
      await fetchAll();
      setRunning(false);
      toast.success("Execução concluída!");
    }, 8000);
  };

  if (!raw) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando sistema...
      </div>
    );
  }

  const { distLogs, schedulerRuns, cadenceCount, cerebroSetting, cerebroRuns, queuePending,
    sentinela, coachAnalysis, iaMsg, webhookLead, bots, notifSetting, notifCount,
    guardianHeartbeat, guardianActiveAlerts, now } = raw;
  const cerebroRun = Array.isArray(cerebroRuns) ? cerebroRuns[0] : cerebroRuns;

  // ── Guardian ──────────────────────────────────────────────────────────────
  const guardianLastRun = guardianHeartbeat?.created_at ?? null;
  const guardianAlertsArr: any[] = guardianActiveAlerts ?? [];
  const highAlerts = guardianAlertsArr.filter((a: any) => a.severity === "high");
  const medAlerts  = guardianAlertsArr.filter((a: any) => a.severity === "medium");
  const guardianStatus: Status = !guardianLastRun ? "ocioso"
    : highAlerts.length > 0 ? "erro"
    : medAlerts.length > 0 ? "ocioso"
    : "ok";
  const guardianDetail = !guardianLastRun
    ? "Nenhuma execução registrada ainda. Rode o Scheduler para ativar."
    : guardianAlertsArr.length === 0
    ? `Tudo saudável — último heartbeat ${timeAgo(guardianLastRun)}`
    : `${guardianAlertsArr.length} alerta(s) ativo(s) — último check ${timeAgo(guardianLastRun)}`;

  const h2  = now - 2  * 3600000;
  const h24 = now - 24 * 3600000;
  const h48 = now - 48 * 3600000;

  // ── Boas-vindas ───────────────────────────────────────────────────────────
  const lastDist = distLogs?.[0];
  const boasStatus: Status = lastDist && new Date(lastDist.created_at).getTime() > h24 ? "ok" : "ocioso";
  const boasDetail = lastDist
    ? `Último: ${lastDist.lead_name} — ${timeAgo(lastDist.created_at)}`
    : "Nenhum lead recebido nas últimas 24h";

  // ── Incoming Lead ─────────────────────────────────────────────────────────
  const todayCount = distLogs?.filter((d: any) => new Date(d.created_at).getTime() > h24).length ?? 0;
  const incomingStatus: Status = todayCount > 0 ? "ok" : "ocioso";
  const incomingDetail = `${todayCount} lead(s) recebido(s) nas últimas 24h`;

  // ── Scheduler ─────────────────────────────────────────────────────────────
  const lastRun = schedulerRuns?.[0];
  let schedStatus: Status = "ocioso";
  let schedDetail = "Nenhuma execução registrada";
  if (lastRun) {
    if (lastRun.status === "error") {
      schedStatus = "erro";
      schedDetail = `Erro: ${lastRun.error_message || "falha desconhecida"} — ${timeAgo(lastRun.ran_at)}`;
    } else if (new Date(lastRun.ran_at).getTime() > h2) {
      schedStatus = "ok";
      schedDetail = `Última execução: ${timeAgo(lastRun.ran_at)} — ${lastRun.total ?? 0} mensagens enviadas`;
    } else {
      schedStatus = "ocioso";
      schedDetail = `Última execução: ${timeAgo(lastRun.ran_at)} — sem atividade recente`;
    }
  }

  // ── Cadências ─────────────────────────────────────────────────────────────
  const cadStatus: Status = (cadenceCount ?? 0) > 0 ? "ok" : "ocioso";
  const cadDetail = (cadenceCount ?? 0) > 0
    ? `${cadenceCount} template(s) ativo(s)`
    : "Nenhum template de cadência ativo — configure no IA Builder";

  // ── Cérebro ───────────────────────────────────────────────────────────────
  const cerebroOn = cerebroSetting?.value === true || cerebroSetting?.value === "true";
  let cerebroStatus: Status = cerebroOn ? "ok" : "desabilitado";
  let cerebroDetail = cerebroOn ? "" : "Desabilitado — Blocos 1–4 do Scheduler estão ativos";
  if (cerebroOn) {
    if (cerebroRun?.status === "error") {
      cerebroStatus = "erro";
      cerebroDetail = `Erro: ${cerebroRun.error_message || "falha"} — ${timeAgo(cerebroRun.ran_at)}`;
    } else if (cerebroRun) {
      cerebroDetail = `Última execução: ${timeAgo(cerebroRun.ran_at)} — ${cerebroRun.processed ?? 0} ações | ${queuePending ?? 0} na fila`;
    } else {
      cerebroStatus = "ocioso";
      cerebroDetail = `Ativo mas sem execuções registradas — ${queuePending ?? 0} itens na fila`;
    }
  }

  // ── Sentinela ─────────────────────────────────────────────────────────────
  let sentStatus: Status = "desabilitado";
  let sentDetail = "Não configurada";
  const sentOn = sentinela?.is_enabled ?? false;
  if (sentinela) {
    if (!sentOn) {
      sentStatus = "desabilitado";
      sentDetail = "Desabilitada";
    } else if ((sentinela.monthly_spent_usd ?? 0) >= (sentinela.monthly_budget_usd ?? 0)) {
      sentStatus = "erro";
      sentDetail = `Orçamento esgotado: $${(sentinela.monthly_spent_usd ?? 0).toFixed(2)} / $${(sentinela.monthly_budget_usd ?? 0).toFixed(2)}`;
    } else {
      sentStatus = "ok";
      const rest = (sentinela.monthly_budget_usd ?? 0) - (sentinela.monthly_spent_usd ?? 0);
      sentDetail = `Ativa — $${(sentinela.monthly_spent_usd ?? 0).toFixed(3)} usado, $${rest.toFixed(3)} restante`;
    }
  }
  const sentBudgetPct = sentinela ? Math.min(100, ((sentinela.monthly_spent_usd ?? 0) / Math.max(0.001, sentinela.monthly_budget_usd ?? 1)) * 100) : 0;

  // ── IA Coach ─────────────────────────────────────────────────────────────
  const coachStatus: Status = coachAnalysis?.created_at && new Date(coachAnalysis.created_at).getTime() > h48 ? "ok" : "ocioso";
  const coachDetail = coachAnalysis?.created_at
    ? `Última análise: ${timeAgo(coachAnalysis.created_at)}`
    : "Nenhuma análise nas últimas 48h";

  // ── Análise IA ────────────────────────────────────────────────────────────
  const analiseStatus: Status = iaMsg?.created_at && new Date(iaMsg.created_at).getTime() > h24 ? "ok" : "ocioso";
  const analiseDetail = iaMsg?.created_at
    ? `Última mensagem: ${timeAgo(iaMsg.created_at)}`
    : "Nenhuma mensagem processada nas últimas 24h";

  // ── Webhook ───────────────────────────────────────────────────────────────
  const lastResp = webhookLead?.last_lead_response_at;
  const webhookStatus: Status = lastResp && new Date(lastResp).getTime() > h24 ? "ok" : "ocioso";
  const webhookDetail = lastResp
    ? `Último evento recebido: ${timeAgo(lastResp)}`
    : "Nenhuma mensagem de lead nas últimas 24h";

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const allBots = bots ?? [];
  const openBots = allBots.filter((b: any) => b.status === "open");
  const errorBots = allBots.filter((b: any) => b.status && b.status !== "open");
  const whatsStatus: Status = allBots.length === 0 ? "ocioso" : openBots.length > 0 ? "ok" : "erro";
  const whatsDetail = allBots.length === 0
    ? "Nenhuma instância configurada"
    : openBots.length > 0
    ? `${openBots.length} instância(s) conectada(s)${errorBots.length > 0 ? ` — ${errorBots.length} com problema` : ""}`
    : `Desconectada: ${errorBots.map((b: any) => b.instance_name || b.name).join(", ")}`;

  // ── Notificações ──────────────────────────────────────────────────────────
  const notifOn = notifSetting?.value === true || notifSetting?.value === "true" || notifSetting?.value === 1;
  const notifStatus: Status = notifOn ? ((notifCount ?? 0) > 0 ? "ok" : "ocioso") : "desabilitado";
  const notifDetail = notifOn
    ? `${notifCount ?? 0} notificação(ões) enviadas hoje`
    : "Notificações para corretores desabilitadas";

  return (
    <div className="space-y-7 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            Controle do Sistema
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verificado {timeAgo(checkedAt.toISOString())}
            {loading && <span className="ml-2 italic">atualizando...</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}
          className="gap-1.5 text-xs border-slate-700 text-slate-400 hover:text-white hover:border-slate-600">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* ── Grupo 1: Recepção ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Recepção de Leads</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ModuleCard title="Boas-vindas" icon={Inbox} status={boasStatus} detail={boasDetail} />
          <ModuleCard title="Incoming Lead" icon={Users} status={incomingStatus} detail={incomingDetail} />
        </div>
      </section>

      {/* ── Grupo 2: Follow-up ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Automações de Follow-up</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ModuleCard title="Follow-up (Scheduler)" icon={Zap} status={schedStatus} detail={schedDetail}
            action={
              <Button size="sm" onClick={handleRunNow} disabled={running}
                className="w-full gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white">
                <Play className={cn("h-3 w-3", running && "animate-spin")} />
                {running ? "Executando..." : "Rodar Agora"}
              </Button>
            }
          />
          <ModuleCard title="Cadências" icon={MessageSquare} status={cadStatus} detail={cadDetail}
            action={
              <p className="text-xs text-slate-500">Configure em: Automação → IA Builder → Cadências</p>
            }
          />
          <ModuleCard title="Cérebro Central" icon={Brain} status={cerebroStatus} detail={cerebroDetail}
            action={
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{cerebroOn ? "Desativar" : "Ativar Cérebro"}</span>
                <Switch checked={cerebroOn} onCheckedChange={toggleCerebro} />
              </div>
            }
          />
        </div>
      </section>

      {/* ── Grupo 3: IA ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Inteligência Artificial</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ModuleCard title="Sentinela IA" icon={Shield} status={sentStatus} detail={sentDetail}
            action={
              sentinela && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{sentOn ? "Desativar" : "Ativar Sentinela"}</span>
                    <Switch checked={sentOn} onCheckedChange={toggleSentinela} />
                  </div>
                  {sentOn && (
                    <div className="space-y-0.5">
                      <div className="w-full bg-slate-800 rounded-full h-1">
                        <div className={cn("h-1 rounded-full transition-all",
                          sentBudgetPct > 80 ? "bg-red-500" : "bg-emerald-500")}
                          style={{ width: `${sentBudgetPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-600">{sentBudgetPct.toFixed(0)}% do orçamento usado</p>
                    </div>
                  )}
                </div>
              )
            }
          />
          <ModuleCard title="IA Coach" icon={Bot} status={coachStatus} detail={coachDetail} />
          <ModuleCard title="Análise IA" icon={Activity} status={analiseStatus} detail={analiseDetail} />
        </div>
      </section>

      {/* ── Grupo 4: WhatsApp ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Infraestrutura WhatsApp</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ModuleCard title="Webhook" icon={Webhook} status={webhookStatus} detail={webhookDetail} />
          <ModuleCard title="WhatsApp (Evolution)" icon={Smartphone} status={whatsStatus} detail={whatsDetail}
            action={
              errorBots.length > 0 && (
                <p className="text-xs text-slate-500">
                  Acesse o painel Evolution para reconectar:{" "}
                  {errorBots.map((b: any) => <strong key={b.id} className="text-slate-300">{b.instance_name || b.name}</strong>)}
                </p>
              )
            }
          />
          <ModuleCard title="Notificações" icon={Bell} status={notifStatus} detail={notifDetail}
            action={
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{notifOn ? "Desativar" : "Ativar notificações"}</span>
                <Switch checked={!!notifOn} onCheckedChange={toggleNotif} />
              </div>
            }
          />
        </div>
      </section>

      {/* ── Guardian ───────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Sistema Guardian — Saúde Automática</SectionHeader>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <ModuleCard title="Guardian" icon={HeartPulse} status={guardianStatus} detail={guardianDetail} />
          <Card className="lg:col-span-2 p-4 bg-slate-900/60 border-slate-700/50 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-white">Alerta WhatsApp (opcional)</span>
            </div>
            <p className="text-xs text-slate-400">
              Telefone do admin para receber alertas críticos. Formato: 5511999999999
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={alertPhone}
                onChange={e => setAlertPhone(e.target.value)}
                placeholder="5511999999999"
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <Button size="sm" onClick={saveAlertPhone} disabled={savingPhone}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs">
                {savingPhone ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </div>
        {guardianAlertsArr.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Alertas Ativos</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {guardianAlertsArr.map((alert: any, i: number) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0",
                    alert.severity === "high" ? "bg-red-500" :
                    alert.severity === "medium" ? "bg-yellow-500" : "bg-blue-400"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 leading-relaxed">{alert.message}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{timeAgo(alert.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ── Histórico Cérebro ──────────────────────────────────────────────── */}
      <section>
          <SectionHeader>Histórico do Cérebro Central</SectionHeader>
          <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
            {!Array.isArray(cerebroRuns) || !cerebroRuns.length ? (
              <p className="p-6 text-center text-slate-500 text-sm">Nenhuma execução registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                      <th className="px-4 py-3 text-left">Data/Hora (BRT)</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-3 py-3 text-center text-emerald-400">Enviados</th>
                      <th className="px-3 py-3 text-center text-red-400 hidden md:table-cell">Failed</th>
                      <th className="px-3 py-3 text-center hidden md:table-cell">Pulados</th>
                      <th className="px-3 py-3 text-center hidden md:table-cell">Reagend.</th>
                      <th className="px-3 py-3 text-center hidden md:table-cell">Cancelados</th>
                      <th className="px-3 py-3 text-center text-slate-300 font-bold">Fila</th>
                      <th className="px-3 py-3 text-center hidden sm:table-cell">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cerebroRuns.map((run: any) => {
                      const items: any[] = run.details?.items ?? [];
                      const failedCount = items.filter((i: any) => i.status === "failed").length;
                      const totalAttempted = (run.processed ?? 0) + failedCount + (run.skipped ?? 0);
                      return (
                        <tr key={run.id} className={cn(
                          "border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors",
                          run.status === "error" && "bg-red-900/10"
                        )}>
                          <td className="px-4 py-2.5">
                            <div className="text-slate-300 font-medium">{fmtTime(run.ran_at)}</div>
                            <div className="text-slate-600">{timeAgo(run.ran_at)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {run.status === "success"
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                              : <XCircle className="h-3.5 w-3.5 text-red-500 inline" title={run.error_message ?? ""} />
                            }
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn("font-bold", (run.processed ?? 0) > 0 ? "text-emerald-400" : "text-slate-700")}>
                              {run.processed ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <span className={cn("font-bold", failedCount > 0 ? "text-red-400" : "text-slate-700")}>
                              {failedCount}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <span className={cn("font-bold", (run.skipped ?? 0) > 0 ? "text-yellow-400" : "text-slate-700")}>
                              {run.skipped ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <span className={cn("font-bold", (run.rescheduled ?? 0) > 0 ? "text-blue-400" : "text-slate-700")}>
                              {run.rescheduled ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <span className={cn("font-bold", (run.cancelled ?? 0) > 0 ? "text-slate-400" : "text-slate-700")}>
                              {run.cancelled ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn("font-bold text-sm", totalAttempted > 0 ? "text-white" : "text-slate-600")}>
                              {totalAttempted}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-500 hidden sm:table-cell">
                            {fmtDuration(run.duration_ms)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

      {/* ── Histórico ──────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Histórico de execuções do Scheduler</SectionHeader>
        <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
          {!schedulerRuns?.length ? (
            <p className="p-6 text-center text-slate-500 text-sm">
              Nenhuma execução registrada. Clique em "Rodar Agora" para iniciar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                    <th className="px-4 py-3 text-left">Data/Hora (BRT)</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    {["Críticos","Frios","Cadência","Parados","Sentinela","Cérebro"].map(l => (
                      <th key={l} className="px-3 py-3 text-center hidden md:table-cell">{l}</th>
                    ))}
                    <th className="px-3 py-3 text-center font-bold text-slate-300">Total</th>
                    <th className="px-3 py-3 text-center hidden sm:table-cell">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulerRuns.map((run: any) => (
                    <tr key={run.id} className={cn(
                      "border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors",
                      run.status === "error" && "bg-red-900/10"
                    )}>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-300 font-medium">{fmtTime(run.ran_at)}</div>
                        <div className="text-slate-600">{timeAgo(run.ran_at)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {run.status === "success"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                          : <XCircle className="h-3.5 w-3.5 text-red-500 inline" title={run.error_message ?? ""} />
                        }
                      </td>
                      {["critical","cold","cadence","stale","sentinela","cerebro"].map(k => (
                        <td key={k} className="px-3 py-2.5 text-center hidden md:table-cell">
                          <span className={cn("font-bold", (run[k] ?? 0) > 0 ? "text-white" : "text-slate-700")}>
                            {run[k] ?? 0}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("font-bold text-sm", (run.total ?? 0) > 0 ? "text-white" : "text-slate-600")}>
                          {run.total ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-500 hidden sm:table-cell">
                        {fmtDuration(run.duration_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}
