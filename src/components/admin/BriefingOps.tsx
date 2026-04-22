import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2 } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function horasAtras(iso: string | null): number {
  if (!iso) return 9999;
  return Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
}
function diasAtras(iso: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function minAtras(iso: string | null): number {
  if (!iso) return 9999;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}
function fmtTempo(min: number): string {
  if (min >= 9999) return "nunca";
  if (min < 60) return `${min}min`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadIgnorado {
  id: string; name: string; tag: string | null;
  broker_name: string; horas: number; tentativas: number; chip_status: string;
}
interface LeadRespondeuSemRetorno {
  id: string; name: string; broker_name: string;
  respondeu_ha_min: number; ultimo_bot_ha_min: number; tag: string | null;
  origem: string; // "novo" | "redistribuido" | "follow_up"
}
interface AgenteRow {
  nome: string; icon: string;
  rodou: number | string; acionou: number | string; efetivo: string;
  status: "ok" | "warn" | "off" | "crit"; obs: string;
  ultima: string | null;
}
interface ChipRow {
  id: string; nome: string; status: string;
  is_prospecting: boolean; dono: boolean;
  tokens_7d: number; conversas_7d: number; leads_7d: number;
}
interface CampanhaRow {
  tag: string; total: number; responderam: number; avancaram: number;
  pior_corretor: string; pior_count: number;
}
interface CorretorResposta {
  broker_id: string; nome: string;
  leads_respondidos: number; min_avg: number; perdidos: number;
}
interface CorretorIgnorou {
  nome: string; count: number;
  leads: { name: string; horas: number; tentativas: number; tag: string | null }[];
}
interface NegociacaoParada {
  name: string; broker_name: string; dias: number;
}

interface BriefingData {
  fogo_respondeu: LeadRespondeuSemRetorno[];
  fogo_sem_contato: LeadIgnorado[];
  agentes: AgenteRow[];
  ia_auto: ChipRow[];
  chips_corretor: ChipRow[];
  follow_tentou: number; follow_respondeu: number; follow_exauridos: number;
  corretores_resposta: CorretorResposta[];
  corretores_ignoraram: CorretorIgnorou[];
  campanhas: CampanhaRow[];
  negociacoes_paradas: NegociacaoParada[];
  loaded_at: Date;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchBriefing(): Promise<BriefingData> {
  const now = Date.now();
  const ago2h   = new Date(now - 2   * 3600000).toISOString();
  const ago7d   = new Date(now - 7   * 86400000).toISOString();
  const ago24h  = new Date(now - 24  * 3600000).toISOString();
  const ago30d  = new Date(now - 30  * 86400000).toISOString();
  const ago15d  = new Date(now - 15  * 86400000).toISOString();

  const [
    leadsRespondeuRes, leadsIgnoradosRes, leadsFullRes,
    botInstancesRes, profilesRes,
    autoLogsRes, guardianLogRes, sentinelaRes,
    iaConvsRes, tokensRes,
    guardianAlertsRes, negocRes,
  ] = await Promise.all([
    // 1. Lead respondeu, corretor sumiu (7d)
    supabase.from("leads").select(
      "id,name,tag,broker_id,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,status,created_at,profiles!broker_id(first_name)"
    ).not("last_lead_response_at","is",null)
      .gt("last_lead_response_at", ago7d)
      .not("status","in","(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")")
      .limit(50),

    // 2. Leads sem contato >2h (novos com broker, bot nunca agiu)
    supabase.from("leads").select(
      "id,name,tag,broker_id,created_at,contact_attempts,status,profiles!broker_id(first_name,bot_instance_id)"
    ).in("status",["NEW","IN_PROGRESS"])
      .not("broker_id","is",null)
      .eq("contact_attempts",0)
      .lt("created_at", ago2h)
      .gt("created_at", ago7d)
      .order("created_at",{ascending:true})
      .limit(30),

    // 3. Leads últimos 30d para campanhas, corretores, follow-up
    supabase.from("leads").select(
      "id,status,broker_id,tag,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,negotiating_since,created_at,name,profiles!broker_id(first_name)"
    ).gt("created_at", ago30d)
      .not("status","in","(\"EXCLUDED\")")
      .limit(2000),

    // 4. Bot instances
    supabase.from("bot_instances").select("id,name,status,is_prospecting"),

    // 5. Profiles
    supabase.from("profiles").select("id,first_name,bot_instance_id").eq("role","BROKER"),

    // 6. Automation logs 24h
    supabase.from("automation_logs").select("entity_type,status,executed_at")
      .gt("executed_at", ago24h).limit(500),

    // 7. Guardian health log 24h
    supabase.from("system_health_log").select("run_at,checks_run,issues_found,auto_fixed")
      .gt("run_at", ago24h).order("run_at",{ascending:false}).limit(1),

    // 8. Sentinela sessions 24h
    supabase.from("ai_sentinela_sessions").select("id,status,end_reason,started_at")
      .gt("started_at", ago24h),

    // 9. IA conversations (7d) for prospecting chips
    supabase.from("ia_conversations").select("id,bot_instance_id,lead_id,created_at")
      .gt("created_at", ago7d).limit(500),

    // 10. Tokens (7d)
    supabase.from("ia_messages").select("conversation_id,ai_tokens_used")
      .gt("created_at", ago7d).limit(2000),

    // 11. Guardian alerts unresolved
    supabase.from("guardian_alerts").select("check_type,severity,message,created_at,auto_fixed")
      .is("resolved_at",null).order("created_at",{ascending:false}).limit(10),

    // 12. Negociações paradas >15d
    supabase.from("leads").select(
      "id,name,negotiating_since,broker_id,profiles!broker_id(first_name)"
    ).eq("status","NEGOTIATING")
      .not("negotiating_since","is",null)
      .lt("negotiating_since", ago15d)
      .order("negotiating_since",{ascending:true}).limit(20),
  ]);

  const allBots: any[]     = botInstancesRes.data || [];
  const allProfiles: any[] = profilesRes.data || [];
  const iaConvs: any[]     = iaConvsRes.data || [];
  const tokensData: any[]  = tokensRes.data || [];
  const autoLogs: any[]    = autoLogsRes.data || [];
  const sentinela: any[]   = sentinelaRes.data || [];
  const leads30: any[]     = leadsFullRes.data || [];

  // Mapa de tokens por conversa
  const tokensByConv: Record<string, number> = {};
  tokensData.forEach((m: any) => {
    if (m.conversation_id) tokensByConv[m.conversation_id] = (tokensByConv[m.conversation_id]||0)+(m.ai_tokens_used||0);
  });

  // Mapa de bot_instance_id → tokens (7d)
  const tokensByBot: Record<string, number> = {};
  const convsByBot: Record<string, Set<string>> = {};
  const leadsByBot: Record<string, Set<string>> = {};
  iaConvs.forEach((c: any) => {
    if (!c.bot_instance_id) return;
    tokensByBot[c.bot_instance_id] = (tokensByBot[c.bot_instance_id]||0)+(tokensByConv[c.id]||0);
    if (!convsByBot[c.bot_instance_id]) convsByBot[c.bot_instance_id] = new Set();
    convsByBot[c.bot_instance_id].add(c.id);
    if (c.lead_id) {
      if (!leadsByBot[c.bot_instance_id]) leadsByBot[c.bot_instance_id] = new Set();
      leadsByBot[c.bot_instance_id].add(c.lead_id);
    }
  });

  // Mapa perfil_id → bot status
  const profileBotMap: Record<string, string> = {};
  const profileBotId:  Record<string, string> = {};
  allProfiles.forEach((p: any) => {
    if (p.bot_instance_id) {
      const bot = allBots.find((b: any) => b.id === p.bot_instance_id);
      profileBotMap[p.id] = bot?.status || "unknown";
      profileBotId[p.id]  = p.bot_instance_id;
    }
  });

  // ── FOGO 1A: respondeu, corretor sumiu ──
  const fogo_respondeu: LeadRespondeuSemRetorno[] = (leadsRespondeuRes.data||[])
    .filter((l: any) => {
      const respondeu = new Date(l.last_lead_response_at).getTime();
      const botFalou  = l.last_broker_whatsapp_at ? new Date(l.last_broker_whatsapp_at).getTime() : 0;
      return botFalou < respondeu; // corretor não voltou depois que lead respondeu
    })
    .map((l: any) => ({
      id: l.id, name: l.name || "Sem nome", tag: l.tag,
      broker_name: l.profiles?.first_name || "—",
      respondeu_ha_min: minAtras(l.last_lead_response_at),
      ultimo_bot_ha_min: l.last_broker_whatsapp_at ? minAtras(l.last_broker_whatsapp_at) : 9999,
      origem: l.contact_attempts > 3 ? "follow_up" : l.contact_attempts > 0 ? "novo" : "novo",
    }))
    .sort((a: any, b: any) => a.respondeu_ha_min - b.respondeu_ha_min);

  // ── FOGO 1B: sem contato >2h ──
  const fogo_sem_contato: LeadIgnorado[] = (leadsIgnoradosRes.data||[]).map((l: any) => ({
    id: l.id, name: l.name || "Sem nome", tag: l.tag,
    broker_name: l.profiles?.first_name || "—",
    horas: horasAtras(l.created_at),
    tentativas: l.contact_attempts || 0,
    chip_status: profileBotMap[l.broker_id] || "unknown",
  }));

  // ── AGENTES ──
  const agentMap: Record<string, {success:number; failed:number; ultima:string|null}> = {};
  autoLogs.forEach((a: any) => {
    if (!agentMap[a.entity_type]) agentMap[a.entity_type] = {success:0,failed:0,ultima:null};
    if (a.status==="success") agentMap[a.entity_type].success++;
    else agentMap[a.entity_type].failed++;
    if (!agentMap[a.entity_type].ultima || a.executed_at > agentMap[a.entity_type].ultima!)
      agentMap[a.entity_type].ultima = a.executed_at;
  });

  const guardianLog = guardianLogRes.data?.[0];
  const sentTotal   = sentinela.length;
  const sentConv    = sentinela.filter((s: any) => s.end_reason==="lead_responded"||s.status==="active").length;
  const unresolvedAlerts = guardianAlertsRes.data?.length || 0;
  const guardian1   = guardianAlertsRes.data?.[0];

  const welcome  = agentMap["welcome"]  || {success:0,failed:0,ultima:null};
  const redist   = agentMap["redistribuicao"] || {success:0,failed:0,ultima:null};
  const redistP  = agentMap["redistribuicao_proprio"] || {success:0,failed:0,ultima:null};
  const welcFail = welcome.success+welcome.failed > 0
    ? Math.round((welcome.failed/(welcome.success+welcome.failed))*100) : 0;
  const redistDays = redist.ultima ? diasAtras(redist.ultima) : null;

  const agentes: AgenteRow[] = [
    {
      nome:"followup_scheduler", icon:"⚙️",
      rodou: guardianLog ? guardianLog.checks_run : "—",
      acionou:"—", efetivo:"—",
      status: guardianLog ? "ok" : "warn",
      obs: guardianLog
        ? `${guardianLog.issues_found} problemas · ${guardianLog.auto_fixed} auto-fix`
        : "Sem execuções nas últimas 24h",
      ultima: guardianLog?.run_at||null,
    },
    {
      nome:"boas-vindas (welcome)", icon:"👋",
      rodou: welcome.success+welcome.failed,
      acionou: welcome.success,
      efetivo: `${welcome.success} enviados`,
      status: welcFail > 40 ? "crit" : welcFail > 20 ? "warn" : "ok",
      obs: `${welcome.failed} falhas de ${welcome.success+welcome.failed} (${welcFail}% falha)`,
      ultima: welcome.ultima,
    },
    {
      nome:"agente-redistribuicao", icon:"🔄",
      rodou: redist.success+redist.failed+redistP.success+redistP.failed,
      acionou: redist.success+redistP.success,
      efetivo: `${redist.success+redistP.success} redistribuídos`,
      status: !redist.ultima && !redistP.ultima ? "off"
        : (redistDays !== null && redistDays > 3) ? "warn" : "ok",
      obs: redistDays !== null && redistDays > 0
        ? `⚠️ Última redistribuição há ${redistDays} dias`
        : "Operando",
      ultima: redist.ultima || redistP.ultima,
    },
    {
      nome:"ai-sentinela", icon:"👁️",
      rodou: sentTotal,
      acionou: sentTotal,
      efetivo: `${sentConv} conv. ativas`,
      status: sentTotal===0 ? "off" : sentConv/sentTotal < 0.15 ? "warn" : "ok",
      obs: sentTotal===0 ? "Sem sessões nas últimas 24h"
        : `${sentConv}/${sentTotal} leads engajados (${sentTotal>0?Math.round(sentConv/sentTotal*100):0}%)`,
      ultima: sentinela[0]?.started_at||null,
    },
    {
      nome:"sistema-guardian", icon:"🛡️",
      rodou: guardianLog?.checks_run || 0,
      acionou: unresolvedAlerts,
      efetivo: `${guardianLog?.auto_fixed||0} auto-fix`,
      status: unresolvedAlerts > 5 ? "warn" : guardianLog ? "ok" : "warn",
      obs: guardian1
        ? `Alerta aberto: ${guardian1.message.slice(0,80)}...`
        : "Sem alertas críticos abertos",
      ultima: guardianLog?.run_at||null,
    },
    {
      nome:"cerebro-orquestrador", icon:"🧠",
      rodou: 0, acionou: 0, efetivo:"—",
      status:"off",
      obs:"Desligado via sistema_settings (cerebro_enabled=false)",
      ultima:null,
    },
  ];

  // ── CHIPS ──
  const allChipRows: ChipRow[] = allBots
    .filter((b: any) => b.name && b.instance_name)
    .filter((b: any, i: number, arr: any[]) =>
      arr.findIndex((x: any) => x.name === b.name && x.status === b.status) === i
    )
    .map((b: any) => {
      const hasDono = allProfiles.some((p: any) => p.bot_instance_id === b.id);
      return {
        id: b.id, nome: b.name, status: b.status,
        is_prospecting: b.is_prospecting, dono: hasDono,
        tokens_7d: tokensByBot[b.id]||0,
        conversas_7d: convsByBot[b.id]?.size||0,
        leads_7d: leadsByBot[b.id]?.size||0,
      };
    });

  const ia_auto       = allChipRows.filter(c => c.is_prospecting && !c.dono && (c.conversas_7d>0||c.tokens_7d>0));
  const chips_corretor= allChipRows.filter(c => c.dono).sort((a,b)=>b.tokens_7d-a.tokens_7d);

  // ── FOLLOW-UP ──
  const follow_tentou    = leads30.filter((l: any) => (l.contact_attempts||0) > 0 && !l.last_lead_response_at).length;
  const follow_respondeu = leads30.filter((l: any) => (l.contact_attempts||0) > 0 && l.last_lead_response_at).length;
  const follow_exauridos = leads30.filter((l: any) => (l.contact_attempts||0) >= 4 && !l.last_lead_response_at && ["NEW","IN_PROGRESS"].includes(l.status)).length;

  // ── CORRETORES: tempo de resposta ──
  const brokerRespMap: Record<string, {nome:string;respondidos:number;totalMin:number;perdidos:number}> = {};
  leads30.forEach((l: any) => {
    if (!l.last_lead_response_at || !l.broker_id) return;
    const nome = l.profiles?.first_name || "—";
    if (!brokerRespMap[l.broker_id]) brokerRespMap[l.broker_id]={nome,respondidos:0,totalMin:0,perdidos:0};
    const respondeuEm = new Date(l.last_lead_response_at).getTime();
    const botVoltou   = l.last_broker_whatsapp_at ? new Date(l.last_broker_whatsapp_at).getTime() : 0;
    if (botVoltou > respondeuEm) {
      const diffMin = (botVoltou - respondeuEm) / 60000;
      brokerRespMap[l.broker_id].respondidos++;
      brokerRespMap[l.broker_id].totalMin += diffMin;
      if (diffMin > 120) brokerRespMap[l.broker_id].perdidos++;
    } else {
      brokerRespMap[l.broker_id].perdidos++;
    }
  });
  const corretores_resposta: CorretorResposta[] = Object.entries(brokerRespMap)
    .map(([id, v]: any) => ({
      broker_id: id, nome: v.nome,
      leads_respondidos: v.respondidos,
      min_avg: v.respondidos > 0 ? Math.round(v.totalMin/v.respondidos) : 9999,
      perdidos: v.perdidos,
    }))
    .sort((a, b) => a.min_avg - b.min_avg);

  // ── CORRETORES: ignoraram leads (contact_attempts=0, >2h) ──
  const ignoradosAll = (leadsIgnoradosRes.data||[]);
  const brokerIgnoreMap: Record<string, CorretorIgnorou> = {};
  ignoradosAll.forEach((l: any) => {
    const nome = l.profiles?.first_name || "—";
    if (!brokerIgnoreMap[nome]) brokerIgnoreMap[nome] = {nome, count:0, leads:[]};
    brokerIgnoreMap[nome].count++;
    brokerIgnoreMap[nome].leads.push({
      name: l.name||"Sem nome",
      horas: horasAtras(l.created_at),
      tentativas: l.contact_attempts||0,
      tag: l.tag,
    });
  });
  const corretores_ignoraram = Object.values(brokerIgnoreMap)
    .sort((a, b) => b.count - a.count);

  // ── CAMPANHAS ──
  const tagMap: Record<string, {total:number;resp:number;avanc:number;brokers:Record<string,number>}> = {};
  leads30.forEach((l: any) => {
    const t = l.tag || "(sem tag)";
    if (!tagMap[t]) tagMap[t]={total:0,resp:0,avanc:0,brokers:{}};
    tagMap[t].total++;
    if (l.last_lead_response_at) tagMap[t].resp++;
    if (!["NEW","IN_PROGRESS","ABANDONED","EXCLUDED"].includes(l.status)) tagMap[t].avanc++;
    // Conta corretores que ignoraram nessa campanha
    if ((l.contact_attempts||0)===0 && l.profiles?.first_name) {
      const b = l.profiles.first_name;
      tagMap[t].brokers[b] = (tagMap[t].brokers[b]||0)+1;
    }
  });
  const campanhas: CampanhaRow[] = Object.entries(tagMap)
    .map(([tag, v]: any) => {
      const sorted = Object.entries(v.brokers).sort((a: any,b: any)=>b[1]-a[1]);
      return {
        tag, total: v.total, responderam: v.resp, avancaram: v.avanc,
        pior_corretor: sorted[0]?.[0] as string || "",
        pior_count:    sorted[0]?.[1] as number || 0,
      };
    })
    .filter(c => c.total >= 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // ── NEGOCIAÇÕES PARADAS ──
  const negociacoes_paradas: NegociacaoParada[] = (negocRes.data||[]).map((l: any) => ({
    name: l.name||"Sem nome",
    broker_name: l.profiles?.first_name||"—",
    dias: diasAtras(l.negotiating_since),
  }));

  return {
    fogo_respondeu, fogo_sem_contato, agentes,
    ia_auto, chips_corretor,
    follow_tentou, follow_respondeu, follow_exauridos,
    corretores_resposta, corretores_ignoraram,
    campanhas, negociacoes_paradas,
    loaded_at: new Date(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BriefingOps() {
  const [d, setD] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setD(await fetchBriefing()); }
    catch(e){ console.error("[BriefingOps]",e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-20 text-slate-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />Carregando briefing...
    </div>
  );
  if (!d) return null;

  const agoStr = `${minAtras(d.loaded_at.toISOString())}min atrás`;

  return (
    <div className="space-y-8 text-sm max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-black text-base">Briefing Operacional</h3>
          <p className="text-slate-500 text-xs mt-0.5">Atualizado {agoStr} · Leia de cima para baixo</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs transition-all">
          <RefreshCw className="w-3 h-3" />Atualizar
        </button>
      </div>

      {/* ── BLOCO 1: FOGO AGORA ─────────────────────────────────────────────── */}
      <Section
        icon="🔥" title="FOGO AGORA"
        badge={d.fogo_respondeu.length + d.fogo_sem_contato.length}
        badgeColor="red"
        subtitle="Situações que estão perdendo venda agora"
      >
        {/* 1A: Respondeu, corretor sumiu */}
        <SubTitle label="Lead respondeu — corretor não foi lá" count={d.fogo_respondeu.length} color="red" />
        {d.fogo_respondeu.length === 0
          ? <EmptyOk text="Nenhum lead esperando resposta" />
          : (
            <Table headers={["Lead","Corretor","Esperando","Último bot","Campanha"]}>
              {d.fogo_respondeu.map(l => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/3">
                  <Td><span className="text-white font-semibold">{l.name}</span></Td>
                  <Td><span className="text-amber-300 font-bold">{l.broker_name}</span></Td>
                  <Td>
                    <span className={cn("font-black tabular-nums",
                      l.respondeu_ha_min > 120 ? "text-red-400" : l.respondeu_ha_min > 30 ? "text-amber-400" : "text-orange-300"
                    )}>{fmtTempo(l.respondeu_ha_min)}</span>
                  </Td>
                  <Td><span className="text-slate-500">{fmtTempo(l.ultimo_bot_ha_min)}</span></Td>
                  <Td><span className="text-slate-500 text-[10px]">{l.tag||"—"}</span></Td>
                </tr>
              ))}
            </Table>
          )
        }

        {/* 1B: Sem contato >2h */}
        <div className="mt-4" />
        <SubTitle label="Lead novo sem nenhum contato do bot (>2h)" count={d.fogo_sem_contato.length} color="orange" />
        {d.fogo_sem_contato.length === 0
          ? <EmptyOk text="Nenhum lead ignorado no momento" />
          : (
            <Table headers={["Lead","Corretor","Esperando","Campanha","Chip corretor","Diagnóstico"]}>
              {d.fogo_sem_contato.map(l => {
                const chipOnline = ["open","active","online"].includes(l.chip_status);
                const chipOff    = ["offline","disconnected"].includes(l.chip_status);
                return (
                  <tr key={l.id} className="border-t border-white/5 hover:bg-white/3">
                    <Td><span className="text-white font-semibold">{l.name}</span></Td>
                    <Td><span className="text-amber-300 font-bold">{l.broker_name}</span></Td>
                    <Td><span className={cn("font-black tabular-nums", l.horas>24?"text-red-400":"text-amber-400")}>{l.horas}h</span></Td>
                    <Td><span className="text-slate-500 text-[10px]">{l.tag||"—"}</span></Td>
                    <Td>
                      <span className={cn("text-[10px] font-bold",
                        chipOnline?"text-emerald-400":chipOff?"text-red-400":"text-yellow-400"
                      )}>
                        {chipOnline?"● online":chipOff?"● offline":"● "+l.chip_status}
                      </span>
                    </Td>
                    <Td>
                      <span className={cn("text-[10px] font-bold",
                        chipOnline?"text-red-400 text-[10px]":"text-slate-400"
                      )}>
                        {chipOnline?"descaso — bot vinculado e online":chipOff?"chip offline — falha técnica":"sem chip vinculado"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )
        }
      </Section>

      {/* ── BLOCO 2: AGENTES ────────────────────────────────────────────────── */}
      <Section icon="🤖" title="AGENTES" subtitle="O que cada agente fez e o resultado real — últimas 24h">
        <Table headers={["Agente","Rodou","Acionou","Efetivo","Status","Observação","Última exec."]}>
          {d.agentes.map(a => (
            <tr key={a.nome} className="border-t border-white/5 hover:bg-white/3">
              <Td>
                <span className="font-mono text-slate-300 text-[10px]">{a.icon} {a.nome}</span>
              </Td>
              <Td><span className="tabular-nums text-white font-bold">{a.rodou}</span></Td>
              <Td><span className="tabular-nums text-slate-300">{a.acionou}</span></Td>
              <Td><span className="text-slate-400">{a.efetivo}</span></Td>
              <Td><StatusTag s={a.status} /></Td>
              <Td className="max-w-xs">
                <span className="text-[10px] text-slate-500 leading-snug">{a.obs}</span>
              </Td>
              <Td>
                <span className="text-[10px] text-slate-600">
                  {a.ultima ? fmtTempo(minAtras(a.ultima)) : "—"}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* ── BLOCO 3: IA AUTO-RESPOSTA ────────────────────────────────────────── */}
      <Section
        icon="🧠" title="IA AUTO-RESPOSTA"
        subtitle="Chips qualificadores (sem dono fixo) — respondem automaticamente quando o lead manda mensagem"
      >
        {d.ia_auto.length === 0
          ? <EmptyOk text="Nenhuma conversa ativa nos chips qualificadores nos últimos 7 dias" />
          : (
            <Table headers={["Chip","Status","Conversas 7d","Leads atendidos","Tokens gastos","Custo aprox."]}>
              {d.ia_auto.map(c => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/3">
                  <Td><span className="text-white font-bold">{c.nome}</span></Td>
                  <Td><ChipStatus s={c.status} /></Td>
                  <Td><span className="tabular-nums text-slate-300">{c.conversas_7d}</span></Td>
                  <Td><span className="tabular-nums text-slate-300">{c.leads_7d}</span></Td>
                  <Td><span className="tabular-nums text-slate-300">{c.tokens_7d.toLocaleString("pt-BR")}</span></Td>
                  <Td>
                    <span className="text-[10px] text-slate-500">
                      ~R${(c.tokens_7d * 0.000013).toFixed(2)}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
        <p className="text-[10px] text-slate-600 mt-2">
          Esses chips assumem quando: (1) lead veio de campanha prospectiva sem corretor fixo, ou (2) lead responde fora do horário. O custo é cobrado por token via API de IA.
        </p>
      </Section>

      {/* ── BLOCO 4: FOLLOW-UP ───────────────────────────────────────────────── */}
      <Section icon="📥" title="FOLLOW-UP — O QUE VOLTOU" subtitle="Resultado dos toques automáticos nos últimos 30 dias">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Bot tentou, lead ignorou" value={d.follow_tentou} color="slate" />
          <StatCard label="Lead respondeu ao bot" value={d.follow_respondeu} color="emerald"
            sub={d.follow_tentou>0?`${Math.round(d.follow_respondeu/(d.follow_tentou+d.follow_respondeu)*100)}% taxa de retorno`:""} />
          <StatCard label="Exauridos (4+ tentativas, silêncio)" value={d.follow_exauridos} color="red"
            sub="Leads provavelmente perdidos" />
        </div>
        <p className="text-[10px] text-slate-600">
          "Exauridos" = bot tentou 4 ou mais vezes e o lead nunca respondeu. Alta chance de número inválido ou desinteresse real.
          {d.follow_exauridos > 20 && " ⚠️ Volume alto — verificar qualidade das campanhas."}
        </p>
      </Section>

      {/* ── BLOCO 5: CHIPS DE CORRETOR ──────────────────────────────────────── */}
      <Section icon="📱" title="CHIPS DE CORRETOR" subtitle="Status e atividade dos chips vinculados a corretores — 7 dias">
        <Table headers={["Chip (corretor)","Status","Conversas IA","Tokens gastos","Custo aprox."]}>
          {d.chips_corretor.filter(c => c.conversas_7d > 0 || ["offline","disconnected"].includes(c.status)).map(c => (
            <tr key={c.id} className="border-t border-white/5 hover:bg-white/3">
              <Td><span className={cn("font-bold", ["offline","disconnected"].includes(c.status)?"text-slate-500":"text-white")}>{c.nome}</span></Td>
              <Td><ChipStatus s={c.status} /></Td>
              <Td><span className="tabular-nums text-slate-300">{c.conversas_7d||"—"}</span></Td>
              <Td><span className="tabular-nums text-slate-300">{c.tokens_7d>0?c.tokens_7d.toLocaleString("pt-BR"):"—"}</span></Td>
              <Td><span className="text-[10px] text-slate-500">{c.tokens_7d>0?`~R$${(c.tokens_7d*0.000013).toFixed(2)}`:"—"}</span></Td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* ── BLOCO 6: CORRETORES ─────────────────────────────────────────────── */}
      <Section icon="👤" title="CORRETORES" subtitle="Quem está engajado e quem precisa de uma conversa">

        {/* 6A: Tempo de resposta */}
        <SubTitle label="Quando o lead responde — quanto demora o corretor?" count={null} color="slate" />
        {d.corretores_resposta.length === 0
          ? <p className="text-xs text-slate-500 mb-4">Sem dados de resposta no período.</p>
          : (
            <Table headers={["Corretor","T. médio resposta","Leads atendidos","Perdidos (>2h)","Situação"]}>
              {d.corretores_resposta.slice(0, 15).map(c => (
                <tr key={c.broker_id} className="border-t border-white/5 hover:bg-white/3">
                  <Td><span className="text-white font-bold">{c.nome}</span></Td>
                  <Td>
                    <span className={cn("font-black tabular-nums",
                      c.min_avg >= 9999 ? "text-red-400" :
                      c.min_avg > 120 ? "text-red-400" :
                      c.min_avg > 30 ? "text-amber-400" : "text-emerald-400"
                    )}>
                      {c.min_avg >= 9999 ? "nunca respondeu" : fmtTempo(c.min_avg)}
                    </span>
                  </Td>
                  <Td><span className="tabular-nums text-slate-300">{c.leads_respondidos}</span></Td>
                  <Td>
                    <span className={cn("tabular-nums font-bold", c.perdidos>2?"text-red-400":"text-slate-400")}>
                      {c.perdidos}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[10px] text-slate-500">
                      {c.min_avg >= 9999 ? "🚨 crítico — chamar para conversa" :
                       c.min_avg > 120   ? "⚠️ lento — treinar urgência" :
                       c.min_avg > 30    ? "🟡 aceitável" : "✅ ágil"}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }

        {/* 6B: Quem ignorou leads */}
        <div className="mt-5" />
        <SubTitle label="Leads sem nenhum contato — quem é responsável?" count={d.corretores_ignoraram.length} color="red" />
        {d.corretores_ignoraram.length === 0
          ? <EmptyOk text="Nenhum corretor com leads completamente ignorados" />
          : d.corretores_ignoraram.map(c => (
            <div key={c.nome} className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-300 font-black text-xs">{c.nome}</span>
                <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full font-bold">{c.count} leads</span>
              </div>
              <div className="space-y-1 pl-3 border-l border-red-500/20">
                {c.leads.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 text-[11px]">
                    <span className={cn("font-black tabular-nums w-10 shrink-0",l.horas>24?"text-red-400":"text-amber-400")}>{l.horas}h</span>
                    <span className="text-slate-300">{l.name}</span>
                    <span className="text-slate-600 text-[10px]">{l.tag||""}</span>
                    {l.tentativas > 0
                      ? <span className="text-[10px] text-red-400">bot tentou {l.tentativas}x → descaso</span>
                      : <span className="text-[10px] text-slate-500">bot nunca agiu</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          ))
        }
      </Section>

      {/* ── BLOCO 7: CAMPANHAS ──────────────────────────────────────────────── */}
      <Section icon="📊" title="CAMPANHAS" subtitle="Qualidade por campanha/tag — últimos 30 dias">
        <Table headers={["Campanha","Leads","Responderam","Avançaram","Taxa real","Corretor que mais ignorou"]}>
          {d.campanhas.map(c => {
            const taxa = c.total > 0 ? Math.round((c.avancaram/c.total)*100) : 0;
            return (
              <tr key={c.tag} className="border-t border-white/5 hover:bg-white/3">
                <Td><span className="text-slate-300 font-mono text-[10px]">{c.tag}</span></Td>
                <Td><span className="tabular-nums text-white font-bold">{c.total}</span></Td>
                <Td>
                  <span className="tabular-nums text-slate-300">
                    {c.responderam} <span className="text-slate-600 text-[10px]">({c.total>0?Math.round(c.responderam/c.total*100):0}%)</span>
                  </span>
                </Td>
                <Td>
                  <span className="tabular-nums text-slate-300">
                    {c.avancaram} <span className="text-slate-600 text-[10px]">({taxa}%)</span>
                  </span>
                </Td>
                <Td>
                  <span className={cn("font-bold text-xs",
                    taxa===0?"text-red-400":taxa<5?"text-amber-400":"text-emerald-400"
                  )}>
                    {taxa===0?"zero ←":""+taxa+"%"}
                  </span>
                </Td>
                <Td>
                  {c.pior_corretor
                    ? <span className="text-[10px] text-amber-400">{c.pior_corretor} ({c.pior_count} ignorados)</span>
                    : <span className="text-slate-600 text-[10px]">—</span>
                  }
                </Td>
              </tr>
            );
          })}
        </Table>
        <p className="text-[10px] text-slate-600 mt-2">
          Taxa real = leads que saíram de NEW/IN_PROGRESS para etapas avançadas. Zero = dinheiro jogado fora.
        </p>
      </Section>

      {/* ── BLOCO 8: NEGOCIAÇÕES PARADAS ────────────────────────────────────── */}
      <Section
        icon="⏱" title="NEGOCIAÇÕES PARADAS +15 DIAS"
        badge={d.negociacoes_paradas.length}
        badgeColor="orange"
        subtitle="Leads em NEGOTIATING sem avanço — venda provavelmente esfriando"
      >
        {d.negociacoes_paradas.length === 0
          ? <EmptyOk text="Nenhuma negociação travada no momento" />
          : (
            <Table headers={["Lead","Corretor","Parado há","Urgência"]}>
              {d.negociacoes_paradas.map((n, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/3">
                  <Td><span className="text-white font-semibold">{n.name}</span></Td>
                  <Td><span className="text-amber-300 font-bold">{n.broker_name}</span></Td>
                  <Td>
                    <span className={cn("font-black tabular-nums",
                      n.dias>30?"text-red-400":"text-amber-400"
                    )}>{n.dias} dias</span>
                  </Td>
                  <Td>
                    <span className="text-[10px] text-slate-500">
                      {n.dias>45?"🚨 provável morte — descartar ou redistribuir":
                       n.dias>30?"⚠️ urgente — intervenção do gerente":
                       "⚠️ acompanhar"}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </Section>

    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, badge, badgeColor="slate", children }: {
  icon: string; title: string; subtitle: string;
  badge?: number; badgeColor?: string; children: React.ReactNode;
}) {
  const hasBadge = badge !== undefined && badge > 0;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">{title}</span>
        {hasBadge && (
          <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full",
            badgeColor==="red"?"bg-red-500/20 text-red-300":"bg-amber-500/20 text-amber-300"
          )}>{badge}</span>
        )}
        <div className="flex-1 h-px bg-white/5" />
      </div>
      {subtitle && <p className="text-[10px] text-slate-600 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function SubTitle({ label, count, color }: { label: string; count: number|null; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] text-slate-400 font-bold">{label}</span>
      {count !== null && count > 0 && (
        <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full",
          color==="red"?"bg-red-500/20 text-red-300":"bg-orange-500/20 text-orange-300"
        )}>{count}</span>
      )}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-900/40 overflow-hidden mb-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8">
            {headers.map(h => (
              <th key={h} className="px-4 py-2 text-left text-[10px] text-slate-500 font-black uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5 align-top", className)}>{children}</td>;
}

function StatusTag({ s }: { s: "ok"|"warn"|"off"|"crit" }) {
  const m = {
    ok:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    warn: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    off:  "bg-slate-800 text-slate-500 border-slate-700",
    crit: "bg-red-500/15 text-red-400 border-red-500/25",
  }[s];
  const l = { ok:"✅ OK", warn:"⚠️ Atenção", off:"○ Desligado", crit:"🚨 Crítico" }[s];
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", m)}>{l}</span>;
}

function ChipStatus({ s }: { s: string }) {
  const online = ["open","active","online"].includes(s);
  const conn   = s === "connecting";
  return (
    <span className={cn("text-[10px] font-bold",
      online?"text-emerald-400":conn?"text-yellow-400":"text-red-400"
    )}>
      {online?"● online":conn?"◌ conectando":"○ offline"}
    </span>
  );
}

function EmptyOk({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-emerald-950/10 border border-emerald-500/15 mb-2">
      <span className="text-emerald-500 text-base">✓</span>
      <span className="text-xs text-emerald-400">{text}</span>
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  const cls = {
    slate:"border-slate-700/50 bg-slate-900/60",
    emerald:"border-emerald-500/20 bg-emerald-950/10",
    red:"border-red-500/20 bg-red-950/10",
  }[color] || "border-slate-700/50 bg-slate-900/60";
  return (
    <div className={cn("rounded-xl border p-3", cls)}>
      <p className="text-[10px] text-slate-500 font-bold leading-snug mb-1">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}
