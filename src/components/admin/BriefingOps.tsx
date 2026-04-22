import { useEffect, useState, useCallback, Fragment } from "react";
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
  broker_name: string; broker_phone: string | null;
  horas: number; tentativas: number; chip_status: string;
}
interface LeadRespondeuSemRetorno {
  id: string; name: string;
  broker_name: string; broker_phone: string | null;
  respondeu_ha_min: number; ultimo_bot_ha_min: number; tag: string | null;
  origem: string;
}
interface AgenteRow {
  nome: string; icon: string;
  rodou: number | string; acionou: number | string; efetivo: string;
  status: "ok" | "warn" | "off" | "crit"; obs: string;
  ultima: string | null;
}
interface ChipVolumeRow {
  nome: string; status: string; is_prospecting: boolean;
  auto: number; manual: number; recebeu: number; converteu: number; tokens_7d: number;
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
  leads_auto: number; leads_manual: number;
  leads_respondidos: number; min_avg: number; perdidos: number;
}
interface CorretorIgnorou {
  nome: string; phone: string | null; count: number;
  leads: { name: string; horas: number; tentativas: number; tag: string | null }[];
}
interface NegociacaoParada {
  name: string; broker_name: string; dias: number;
}
interface MensagemEfetiva {
  tipo: string; preview: string;
  enviadas: number; responderam: number; taxa: number;
  min_avg: number; // tempo médio até resposta em minutos
  melhor_hora: number | null; // hora do dia (0-23) com mais respostas
}

interface BriefingData {
  fogo_respondeu: LeadRespondeuSemRetorno[];
  fogo_sem_contato: LeadIgnorado[];
  agentes: AgenteRow[];
  chips_volume: ChipVolumeRow[];
  ia_auto: ChipRow[];
  follow_sem_contato: number; follow_tentou: number;
  follow_respondeu: number; follow_resp_boasvindas: number; follow_resp_followup: number;
  follow_exauridos: number;
  mensagens_efetivas: MensagemEfetiva[];
  horarios_resposta: { hora: number; enviadas: number; responderam: number; taxa: number }[];
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
    autoLogs7dRes, msgsEfetivasRes,
  ] = await Promise.all([
    // 1. Lead respondeu, corretor sumiu (7d)
    supabase.from("leads").select(
      "id,name,tag,broker_id,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,status,created_at,profiles!broker_id(first_name)"
    ).not("last_lead_response_at","is",null)
      .gt("last_lead_response_at", ago7d)
      .not("status","in","(\"CONCLUDED\",\"EXCLUDED\",\"ABANDONED\")")
      .limit(50),

    // 2. Leads sem nenhum contato >2h — critério real: bot nunca enviou nada (last_broker_whatsapp_at IS NULL)
    // contact_attempts=0 NÃO é suficiente: boas-vindas não incrementa esse campo,
    // então leads que receberam boas-vindas aparecem como "sem contato" mesmo tendo sido tocados.
    supabase.from("leads").select(
      "id,name,tag,broker_id,created_at,contact_attempts,status,profiles!broker_id(first_name,bot_instance_id)"
    ).in("status",["NEW","IN_PROGRESS"])
      .not("broker_id","is",null)
      .is("last_broker_whatsapp_at", null)
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

    // 5. Profiles (com phone para notificação)
    supabase.from("profiles").select("id,first_name,bot_instance_id,phone").eq("role","BROKER"),

    // 6. Automation logs 24h (para painel de agentes)
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

    // 13. Automation logs 7d com entity_id (lead_id) — para separar auto de manual
    supabase.from("automation_logs").select("entity_id,entity_type,status")
      .gt("executed_at", ago7d)
      .eq("status","success")
      .in("entity_type",["welcome","follow_up","aviso_redistribuicao_proprio","redistribuicao_proprio","redistribuicao"])
      .limit(2000),

    // 14. Mensagens enviadas 30d com texto — para análise de efetividade
    supabase.from("automation_logs").select("entity_id,entity_type,message_sent,executed_at")
      .gt("executed_at", ago30d)
      .eq("status","success")
      .in("entity_type",["welcome","follow_up"])
      .not("message_sent","is",null)
      .limit(3000),
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

  // Mapa perfil_id → bot status + phone
  const profileBotMap:   Record<string, string> = {};
  const profileBotId:    Record<string, string> = {};
  const profilePhoneMap: Record<string, string | null> = {};
  allProfiles.forEach((p: any) => {
    profilePhoneMap[p.id] = p.phone || null;
    if (p.bot_instance_id) {
      const bot = allBots.find((b: any) => b.id === p.bot_instance_id);
      profileBotMap[p.id] = bot?.status || "unknown";
      profileBotId[p.id]  = p.bot_instance_id;
    }
  });

  // ── SET de leads tocados por automação (7d) ──
  // entity_id = lead_id. Se o lead aparece aqui, a automação mandou mensagem com sucesso.
  const autoLeadIds = new Set<string>((autoLogs7dRes.data || []).map((r: any) => r.entity_id).filter(Boolean));
  // Sentinela/IA também é automação — adicionar lead_ids das ia_conversations
  iaConvs.forEach((c: any) => { if (c.lead_id) autoLeadIds.add(c.lead_id); });

  // ── CHIPS VOLUME via leads (7d) ──
  // Busca volume real por chip: enviou = leads que o chip tocou, recebeu = responderam, converteu = avançaram
  const { data: chipVolumeRaw } = await supabase.rpc
    ? { data: null } // fallback — computed below from leads30
    : { data: null };

  // Computa do leads30 (últimos 30d, mas filtra por last_broker_whatsapp_at > 7d)
  // Separa: auto = só automação tocou | manual = corretor também agiu além da automação
  const ago7dTs = Date.now() - 7 * 86400000;
  const chipAutoMap:     Record<string, number> = {};
  const chipManualMap:   Record<string, number> = {};
  const chipRecebeuMap:  Record<string, number> = {};
  const chipConverteuMap: Record<string, number> = {};
  leads30.forEach((l: any) => {
    if (!l.last_broker_whatsapp_at) return;
    const sentAt = new Date(l.last_broker_whatsapp_at).getTime();
    if (sentAt < ago7dTs) return; // só últimos 7d
    const botId = profileBotId[l.broker_id];
    if (!botId) return;
    const botName = allBots.find((b: any) => b.id === botId)?.name || "";
    if (!botName) return;
    // Determina se o toque foi apenas automático ou se o corretor também agiu
    const tocadoPorAuto = autoLeadIds.has(l.id);
    // Considera "manual" quando contact_attempts supera 1 (automação normalmente faz 1 toque por ciclo)
    // ou quando o lead avançou além de NEW mas não tem entrada de automação (corretor avançou)
    const corretorAgiu = !tocadoPorAuto || (l.contact_attempts || 0) > 1;
    if (tocadoPorAuto && !corretorAgiu) {
      chipAutoMap[botName]   = (chipAutoMap[botName]   || 0) + 1;
    } else if (corretorAgiu) {
      chipManualMap[botName] = (chipManualMap[botName] || 0) + 1;
    } else {
      chipAutoMap[botName]   = (chipAutoMap[botName]   || 0) + 1;
    }
    if (l.last_lead_response_at) chipRecebeuMap[botName]  = (chipRecebeuMap[botName]  || 0) + 1;
    if (!["NEW","IN_PROGRESS","ABANDONED","EXCLUDED"].includes(l.status))
      chipConverteuMap[botName] = (chipConverteuMap[botName] || 0) + 1;
  });

  const chips_volume: ChipVolumeRow[] = allBots
    .filter((b: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.name === b.name) === i) // dedupe por nome
    .map((b: any) => ({
      nome: b.name, status: b.status, is_prospecting: b.is_prospecting,
      auto:      chipAutoMap[b.name]      || 0,
      manual:    chipManualMap[b.name]    || 0,
      recebeu:   chipRecebeuMap[b.name]   || 0,
      converteu: chipConverteuMap[b.name] || 0,
      tokens_7d: tokensByBot[b.id]        || 0,
    }))
    .filter(c => (c.auto + c.manual) > 0)
    .sort((a, b) => (b.auto + b.manual) - (a.auto + a.manual));

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
      broker_phone: profilePhoneMap[l.broker_id] || null,
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

  const ia_auto = allChipRows.filter(c => c.is_prospecting && !c.dono && (c.conversas_7d>0||c.tokens_7d>0));

  // ── FOLLOW-UP ──
  // Nota: contact_attempts só incrementa nos follow-ups agendados — boas-vindas não conta.
  // Por isso separamos: respondeu_qualquer (inclui quem respondeu ao boas-vindas) vs follow-up
  const follow_sem_contato   = leads30.filter((l: any) => (l.contact_attempts||0) === 0 && !l.last_lead_response_at && l.last_broker_whatsapp_at).length;
  const follow_tentou        = leads30.filter((l: any) => (l.contact_attempts||0) > 0 && !l.last_lead_response_at).length;
  const follow_respondeu     = leads30.filter((l: any) => l.last_lead_response_at != null).length;
  const follow_resp_boasvindas = leads30.filter((l: any) => l.last_lead_response_at != null && (l.contact_attempts||0) === 0).length;
  const follow_resp_followup   = leads30.filter((l: any) => l.last_lead_response_at != null && (l.contact_attempts||0) > 0).length;
  const follow_exauridos     = leads30.filter((l: any) => (l.contact_attempts||0) >= 4 && !l.last_lead_response_at && ["NEW","IN_PROGRESS"].includes(l.status)).length;

  // ── MENSAGENS EFETIVAS ──
  // Mapa lead_id → last_lead_response_at (de leads30)
  const leadResponseMap: Record<string, string | null> = {};
  leads30.forEach((l: any) => { leadResponseMap[l.id] = l.last_lead_response_at || null; });

  const msgsRaw: any[] = msgsEfetivasRes.data || [];

  // Para cada mensagem enviada, verificar se o lead respondeu APÓS o envio (até 72h depois)
  // Agrupar por preview (primeiros 80 chars) + tipo
  const msgMap: Record<string, {
    tipo: string; preview: string;
    enviadas: number; responderam: number; totalMin: number;
    horas: number[]; // hora do envio para as que geraram resposta
  }> = {};

  // Normaliza a mensagem: pula a primeira linha (que tem nome do lead personalizado)
  // e usa o corpo como chave de agrupamento
  function msgTemplate(raw: string): string {
    const text = (raw || "").trim();
    const nlIdx = text.indexOf("\n");
    // Se tem quebra de linha razoável (< 80 chars), usa o que vem depois
    const body = nlIdx > 0 && nlIdx < 80 ? text.slice(nlIdx).trim() : text;
    return body.slice(0, 120);
  }

  msgsRaw.forEach((m: any) => {
    const body    = msgTemplate(m.message_sent || "");
    const preview = body.slice(0, 100);
    const key     = `${m.entity_type}||${body}`;
    if (!msgMap[key]) msgMap[key] = { tipo: m.entity_type, preview: body.slice(0, 100), enviadas: 0, responderam: 0, totalMin: 0, horas: [] };
    msgMap[key].enviadas++;
    const respondeuEm = leadResponseMap[m.entity_id];
    if (respondeuEm) {
      const enviadoEm   = new Date(m.executed_at).getTime();
      const respondeuTs = new Date(respondeuEm).getTime();
      const diffMin     = (respondeuTs - enviadoEm) / 60000;
      if (diffMin > 0 && diffMin < 72 * 60) { // respondeu em até 72h
        msgMap[key].responderam++;
        msgMap[key].totalMin += diffMin;
        msgMap[key].horas.push(new Date(m.executed_at).getHours());
      }
    }
  });

  const mensagens_efetivas: MensagemEfetiva[] = Object.values(msgMap)
    .filter(m => m.enviadas >= 3) // só mensagens com volume mínimo
    .map(m => {
      // hora mais frequente entre as que geraram resposta
      const horaFreq: Record<number, number> = {};
      m.horas.forEach(h => horaFreq[h] = (horaFreq[h] || 0) + 1);
      const melhor_hora = m.horas.length > 0
        ? parseInt(Object.entries(horaFreq).sort((a, b) => b[1] - a[1])[0][0])
        : null;
      return {
        tipo: m.tipo, preview: m.preview,
        enviadas: m.enviadas, responderam: m.responderam,
        taxa: m.enviadas > 0 ? Math.round((m.responderam / m.enviadas) * 100) : 0,
        min_avg: m.responderam > 0 ? Math.round(m.totalMin / m.responderam) : 0,
        melhor_hora,
      };
    })
    .sort((a, b) => b.taxa - a.taxa)
    .slice(0, 10);

  // ── HORÁRIOS DE RESPOSTA ──
  // Por hora do dia: de todas as mensagens enviadas, quantas geraram resposta
  const horaEnvMap: Record<number, { enviadas: number; responderam: number }> = {};
  msgsRaw.forEach((m: any) => {
    const hora = new Date(m.executed_at).getHours();
    if (!horaEnvMap[hora]) horaEnvMap[hora] = { enviadas: 0, responderam: 0 };
    horaEnvMap[hora].enviadas++;
    const respondeuEm = leadResponseMap[m.entity_id];
    if (respondeuEm) {
      const diffMin = (new Date(respondeuEm).getTime() - new Date(m.executed_at).getTime()) / 60000;
      if (diffMin > 0 && diffMin < 72 * 60) horaEnvMap[hora].responderam++;
    }
  });
  const horarios_resposta = Object.entries(horaEnvMap)
    .map(([h, v]) => ({
      hora: parseInt(h),
      enviadas: v.enviadas,
      responderam: v.responderam,
      taxa: v.enviadas > 0 ? Math.round((v.responderam / v.enviadas) * 100) : 0,
    }))
    .filter(h => h.enviadas >= 2)
    .sort((a, b) => a.hora - b.hora);

  // ── CORRETORES: tempo de resposta + auto vs manual ──
  const brokerRespMap: Record<string, {nome:string;respondidos:number;totalMin:number;perdidos:number;auto:number;manual:number}> = {};
  leads30.forEach((l: any) => {
    if (!l.broker_id) return;
    const nome = l.profiles?.first_name || "—";
    if (!brokerRespMap[l.broker_id]) brokerRespMap[l.broker_id]={nome,respondidos:0,totalMin:0,perdidos:0,auto:0,manual:0};
    // Conta auto vs manual para o corretor (mesma lógica dos chips)
    if (l.last_broker_whatsapp_at) {
      const sentAt = new Date(l.last_broker_whatsapp_at).getTime();
      if (sentAt >= ago7dTs) {
        const tocadoPorAuto = autoLeadIds.has(l.id);
        const corretorAgiu  = !tocadoPorAuto || (l.contact_attempts || 0) > 1;
        if (corretorAgiu) brokerRespMap[l.broker_id].manual++;
        else              brokerRespMap[l.broker_id].auto++;
      }
    }
    // Tempo de resposta (só onde lead respondeu)
    if (!l.last_lead_response_at) return;
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
      leads_auto: v.auto, leads_manual: v.manual,
      leads_respondidos: v.respondidos,
      min_avg: v.respondidos > 0 ? Math.round(v.totalMin/v.respondidos) : 9999,
      perdidos: v.perdidos,
    }))
    .sort((a, b) => (b.leads_auto + b.leads_manual) - (a.leads_auto + a.leads_manual));

  // ── CORRETORES: ignoraram leads (contact_attempts=0, >2h) ──
  const ignoradosAll = (leadsIgnoradosRes.data||[]);
  const brokerIgnoreMap: Record<string, CorretorIgnorou> = {};
  ignoradosAll.forEach((l: any) => {
    const bId = l.broker_id || "unknown";
    const nome = l.profiles?.first_name || "—";
    if (!brokerIgnoreMap[bId]) brokerIgnoreMap[bId] = {
      nome, phone: profilePhoneMap[bId] || null, count: 0, leads: []
    };
    brokerIgnoreMap[bId].count++;
    brokerIgnoreMap[bId].leads.push({
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
    ia_auto, chips_volume,
    follow_sem_contato, follow_tentou,
    follow_respondeu, follow_resp_boasvindas, follow_resp_followup,
    follow_exauridos, mensagens_efetivas, horarios_resposta,
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
            <Table headers={["Lead","Corretor","Esperando","Último bot","Campanha","Ação"]}>
              {d.fogo_respondeu.map(l => {
                const msg = encodeURIComponent(`Oi ${l.broker_name}, o lead ${l.name} respondeu há ${fmtTempo(l.respondeu_ha_min)} e está aguardando retorno. Pode entrar em contato agora?`);
                return (
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
                    <Td>
                      {l.broker_phone
                        ? (
                          <a
                            href={`https://wa.me/${l.broker_phone}?text=${msg}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors"
                          >
                            📲 Notificar
                          </a>
                        )
                        : <span className="text-slate-600 text-[10px]">sem tel.</span>
                      }
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )
        }

        {/* 1B: Sem contato >2h */}
        <div className="mt-4" />
        <SubTitle label="Lead novo — bot nunca enviou nada (>2h sem last_broker_whatsapp_at)" count={d.fogo_sem_contato.length} color="orange" />
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
        {/* Linha 1: O que respondeu */}
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-black mb-2">Leads que responderam</p>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard
            label="Total que respondeu alguma coisa"
            value={d.follow_respondeu} color="emerald"
            sub={`de ${d.follow_tentou + d.follow_respondeu + d.follow_sem_contato} leads tocados`}
          />
          <StatCard
            label="Respondeu ao boas-vindas (1ª msg)"
            value={d.follow_resp_boasvindas} color="emerald"
            sub="contact_attempts = 0 → respondeu na hora"
          />
          <StatCard
            label="Respondeu após follow-up (2ª+ msg)"
            value={d.follow_resp_followup} color="emerald"
            sub={d.follow_resp_followup === 0 ? "⚠️ nenhum lead voltou após follow-up" : ""}
          />
        </div>
        {/* Linha 2: O que foi ignorado */}
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-black mb-2">Leads que ignoraram</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard
            label="Recebeu boas-vindas, não respondeu"
            value={d.follow_sem_contato} color="slate"
            sub="Silêncio após 1ª mensagem"
          />
          <StatCard
            label="Recebeu follow-up, continuou ignorando"
            value={d.follow_tentou} color="slate"
            sub="contact_attempts ≥ 1"
          />
          <StatCard
            label="Exauridos (4+ tentativas, silêncio)"
            value={d.follow_exauridos} color="red"
            sub={d.follow_exauridos > 20 ? "⚠️ volume alto — checar qualidade das campanhas" : "Provavelmente perdidos"}
          />
        </div>
        <p className="text-[10px] text-slate-600 mb-6">
          <strong className="text-slate-500">Boas-vindas</strong> = primeira mensagem automática ao receber o lead.
          {" "}<strong className="text-slate-500">Follow-up</strong> = mensagens subsequentes programadas pelo scheduler (contact_attempts incrementa).
          {d.follow_resp_followup === 0 && d.follow_tentou > 10 && (
            <span className="text-amber-400"> ⚠️ Nenhum lead voltou após follow-up — verificar qualidade da mensagem ou timing.</span>
          )}
        </p>

        {/* Mensagens que funcionaram */}
        <SubTitle label="Mensagens que fizeram o lead responder — últimos 30 dias" count={null} color="slate" />
        {d.mensagens_efetivas.length === 0
          ? <EmptyOk text="Dados insuficientes — aguardar mais volume de envios (mín. 3 por template)" />
          : <MensagensEfetivasTable rows={d.mensagens_efetivas} />
        }

        {/* Horários */}
        {d.horarios_resposta.length > 0 && (
          <div className="mt-4">
            <SubTitle label="Taxa de resposta por hora do dia — quando enviar funciona mais" count={null} color="slate" />
            <div className="flex flex-wrap gap-1.5">
              {d.horarios_resposta.map(h => (
                <div key={h.hora} className={cn(
                  "flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px]",
                  h.taxa >= 15 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" :
                  h.taxa >= 5  ? "bg-amber-500/15 border-amber-500/30 text-amber-300" :
                  "bg-slate-800 border-white/5 text-slate-500"
                )}>
                  <span className="font-black">{String(h.hora).padStart(2,"0")}h</span>
                  <span className="font-bold">{h.taxa}%</span>
                  <span className="text-[9px] opacity-60">{h.enviadas} env.</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              Verde = melhor janela para disparo. Taxa = % de leads que responderam dentro de 72h após mensagem enviada nesse horário.
            </p>
          </div>
        )}
      </Section>

      {/* ── BLOCO 5: CHIPS ──────────────────────────────────────────────────── */}
      <Section icon="📱" title="CHIPS" subtitle="Volume real de mensagens por chip — últimos 7 dias">
        {d.chips_volume.length === 0
          ? <EmptyOk text="Nenhum chip com atividade nos últimos 7 dias" />
          : (
            <Table headers={["Chip","Status","Tipo","Auto (bot)","Manual (corretor)","% Manual","Respondeu","Converteu","Tokens IA"]}>
              {d.chips_volume.map(c => {
                const total    = c.auto + c.manual;
                const pctManual = total > 0 ? Math.round((c.manual / total) * 100) : 0;
                const isOff    = ["offline","disconnected"].includes(c.status);
                return (
                  <tr key={c.nome} className="border-t border-white/5 hover:bg-white/3">
                    <Td>
                      <span className={cn("font-bold", isOff ? "text-slate-500" : "text-white")}>{c.nome}</span>
                    </Td>
                    <Td><ChipStatus s={c.status} /></Td>
                    <Td>
                      <span className={cn("text-[10px] font-bold",
                        c.is_prospecting ? "text-purple-400" : "text-slate-400"
                      )}>
                        {c.is_prospecting ? "qualificador" : "corretor"}
                      </span>
                    </Td>
                    <Td>
                      <span className="tabular-nums text-slate-400">{c.auto > 0 ? c.auto : "—"}</span>
                    </Td>
                    <Td>
                      <span className={cn("tabular-nums font-bold",
                        c.manual > 0 ? "text-emerald-300" : "text-red-400"
                      )}>
                        {c.manual > 0 ? c.manual : "0 ←"}
                      </span>
                    </Td>
                    <Td>
                      <span className={cn("tabular-nums font-black text-xs",
                        pctManual === 0  ? "text-red-400" :
                        pctManual < 30   ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {pctManual}%
                      </span>
                    </Td>
                    <Td><span className="tabular-nums text-slate-300">{c.recebeu > 0 ? c.recebeu : "—"}</span></Td>
                    <Td>
                      <span className={cn("tabular-nums font-bold",
                        c.converteu > 0 ? "text-emerald-300" : "text-slate-600"
                      )}>
                        {c.converteu > 0 ? c.converteu : "—"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[10px] text-slate-500">
                        {c.tokens_7d > 0 ? `${c.tokens_7d.toLocaleString("pt-BR")} (~R$${(c.tokens_7d * 0.000013).toFixed(2)})` : "—"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )
        }
        <p className="text-[10px] text-slate-600 mt-2">
          <strong className="text-slate-500">Auto</strong> = mensagens enviadas por welcome/follow-up/sentinela.{" "}
          <strong className="text-slate-500">Manual</strong> = corretor agiu além da automação (contact_attempts &gt; 1 ou sem toque automático).{" "}
          <strong className="text-slate-500">% Manual = 0%</strong> significa que o corretor não tocou em nenhum lead — o bot fez tudo.
        </p>
      </Section>

      {/* ── BLOCO 6: CORRETORES ─────────────────────────────────────────────── */}
      <Section icon="👤" title="CORRETORES" subtitle="Quem está engajado e quem precisa de uma conversa">

        {/* 6A: Tempo de resposta */}
        <SubTitle label="Quem trabalhou e quem deixou o bot fazer tudo — 7 dias" count={null} color="slate" />
        {d.corretores_resposta.length === 0
          ? <p className="text-xs text-slate-500 mb-4">Sem dados no período.</p>
          : (
            <Table headers={["Corretor","Auto (bot)","Manual (corretor)","% Manual","T. médio resposta","Perdidos (>2h)","Situação"]}>
              {d.corretores_resposta.slice(0, 15).map(c => {
                const total      = c.leads_auto + c.leads_manual;
                const pctManual  = total > 0 ? Math.round((c.leads_manual / total) * 100) : 0;
                return (
                  <tr key={c.broker_id} className="border-t border-white/5 hover:bg-white/3">
                    <Td><span className="text-white font-bold">{c.nome}</span></Td>
                    <Td><span className="tabular-nums text-slate-400">{c.leads_auto || "—"}</span></Td>
                    <Td>
                      <span className={cn("tabular-nums font-bold",
                        c.leads_manual > 0 ? "text-emerald-300" : "text-red-400"
                      )}>
                        {c.leads_manual > 0 ? c.leads_manual : "0 ←"}
                      </span>
                    </Td>
                    <Td>
                      <span className={cn("tabular-nums font-black text-xs",
                        pctManual === 0  ? "text-red-400" :
                        pctManual < 30   ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {pctManual}%
                      </span>
                    </Td>
                    <Td>
                      <span className={cn("font-black tabular-nums",
                        c.min_avg >= 9999 ? "text-red-400" :
                        c.min_avg > 120   ? "text-red-400" :
                        c.min_avg > 30    ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {c.min_avg >= 9999 ? "—" : fmtTempo(c.min_avg)}
                      </span>
                    </Td>
                    <Td>
                      <span className={cn("tabular-nums font-bold", c.perdidos > 2 ? "text-red-400" : "text-slate-400")}>
                        {c.perdidos}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[10px] text-slate-500">
                        {pctManual === 0 && total > 0 ? "🚨 só o bot trabalhou" :
                         pctManual < 20              ? "⚠️ pouco engajamento manual" :
                         c.min_avg > 120             ? "⚠️ resposta lenta" :
                         c.min_avg > 30              ? "🟡 aceitável" : "✅ ativo"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )
        }
        <p className="text-[10px] text-slate-600 mt-2 mb-4">
          <strong className="text-slate-500">% Manual = 0%</strong> = esse corretor não agiu em nenhum lead nos últimos 7 dias. O bot fez 100% do trabalho.
        </p>

        {/* 6B: Quem ignorou leads */}
        <div className="mt-5" />
        <SubTitle label="Leads que o bot NUNCA tocou — quem é responsável?" count={d.corretores_ignoraram.length} color="red" />
        {d.corretores_ignoraram.length === 0
          ? <EmptyOk text="Nenhum corretor com leads completamente ignorados" />
          : d.corretores_ignoraram.map(c => {
            const leadsList = c.leads.map(l => `• ${l.name} (${l.horas}h${l.tentativas > 0 ? `, bot tentou ${l.tentativas}x` : ""})`).join("\n");
            const msg = encodeURIComponent(`Oi ${c.nome}, você tem ${c.count} lead(s) aguardando contato há horas. Por favor acesse o CRM agora:\n${leadsList}`);
            return (
              <div key={c.nome} className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-300 font-black text-xs">{c.nome}</span>
                  <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full font-bold">{c.count} leads</span>
                  {c.phone
                    ? (
                      <a
                        href={`https://wa.me/${c.phone}?text=${msg}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors"
                      >
                        📲 Chamar corretor
                      </a>
                    )
                    : <span className="text-slate-600 text-[10px]">sem telefone cadastrado</span>
                  }
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
            );
          })
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

function MensagensEfetivasTable({ rows }: { rows: MensagemEfetiva[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="rounded-xl border border-white/8 bg-slate-900/40 overflow-hidden mb-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8">
            {["Tipo","Corpo da mensagem (clique para expandir)","Enviadas","Responderam","Taxa","Tempo até resposta","Melhor hora"].map(h => (
              <th key={h} className="px-4 py-2 text-left text-[10px] text-slate-500 font-black uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <Fragment key={i}>
              <tr
                className="border-t border-white/5 hover:bg-white/3 cursor-pointer"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <Td>
                  <span className={cn("text-[10px] font-bold",
                    m.tipo === "welcome" ? "text-blue-400" : "text-purple-400"
                  )}>
                    {m.tipo === "welcome" ? "boas-vindas" : "follow-up"}
                  </span>
                </Td>
                <Td className="max-w-xs">
                  <div className="flex items-start gap-1.5">
                    <span className="text-slate-500 text-[9px] mt-0.5 shrink-0">
                      {expanded === i ? "▼" : "▶"}
                    </span>
                    <span className="text-slate-300 text-[10px] leading-snug">
                      {expanded === i ? m.preview : m.preview.slice(0, 60) + (m.preview.length > 60 ? "…" : "")}
                    </span>
                  </div>
                </Td>
                <Td><span className="tabular-nums text-slate-400">{m.enviadas}</span></Td>
                <Td><span className="tabular-nums text-emerald-300 font-bold">{m.responderam}</span></Td>
                <Td>
                  <span className={cn("tabular-nums font-black text-xs",
                    m.taxa === 0  ? "text-red-400" :
                    m.taxa < 5    ? "text-amber-400" :
                    m.taxa < 15   ? "text-yellow-300" : "text-emerald-400"
                  )}>
                    {m.taxa}%
                  </span>
                </Td>
                <Td>
                  <span className="tabular-nums text-slate-400 text-[10px]">
                    {m.min_avg === 0 ? "—" : fmtTempo(m.min_avg)}
                  </span>
                </Td>
                <Td>
                  {m.melhor_hora !== null
                    ? <span className="text-amber-300 font-bold text-[10px]">{m.melhor_hora}h–{m.melhor_hora + 1}h</span>
                    : <span className="text-slate-600 text-[10px]">—</span>
                  }
                </Td>
              </tr>
              {expanded === i && (
                <tr className="border-t border-white/5 bg-slate-800/40">
                  <td colSpan={7} className="px-6 py-3">
                    <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Corpo completo da mensagem:</p>
                    <pre className="text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed font-sans bg-slate-900/60 rounded-lg p-3 border border-white/5">
                      {m.preview}
                    </pre>
                    <p className="text-[9px] text-slate-600 mt-1">* Primeira linha com nome do lead foi removida para agrupar templates iguais</p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
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
