/**
 * DashboardFoco — Modo Missão (GPS do Corretor)
 * Uma missão por vez · mensagem pronta · resultado claro
 * Rota: /dashboard
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Phone, Calendar, X, Zap, Flame, Trophy,
  LogOut, CheckCircle2, Loader2, Bot, UserCheck,
  ChevronLeft, ChevronRight, FileText, AlertTriangle, Copy, RefreshCw,
  Volume2, VolumeX, PlusCircle, Shield, Star,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLeadsForDashboard, updateLeadStatus,
  registerContactAttempt, setLeadNegotiating, setLeadFollowUpAuto,
} from "@/integrations/supabase/leads";
import { fetchOpenTasks, createTask } from "@/integrations/supabase/tasks";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead, LeadStatus, LostReason } from "@/types/lead";
import { LOST_REASON_LABEL, TIPO_TRABALHO_LABEL } from "@/types/lead";
import type { Task } from "@/types/task";
import type { User } from "@/types/user";
import { toast } from "sonner";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { AchievementTicker } from "@/components/dashboard/AchievementTicker";
import { MetaStrip } from "@/components/broker/MetaStrip";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const FOCO_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
  .foco-ui  { font-family:'Rajdhani',sans-serif; }
  .foco-disp{ font-family:'Orbitron',monospace; letter-spacing:.05em; }

  .hex-bg {
    background-color:#080B14;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,212,255,.07) 0%,transparent 60%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 54,16 54,44 28,58 2,44 2,16' fill='none' stroke='%2300D4FF' stroke-width='0.4' opacity='0.09'/%3E%3C/svg%3E");
    background-size:auto,56px 48px;
  }
  .scanlines::after{
    content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,212,255,.015) 3px,rgba(0,212,255,.015) 4px);
  }

  @keyframes neonBreathe{0%,100%{filter:drop-shadow(0 0 4px #00D4FF);}50%{filter:drop-shadow(0 0 14px #00D4FF);}}
  @keyframes confettiFall{0%{transform:translateY(-10px) rotate(0);opacity:1;}100%{transform:translateY(500px) rotate(720deg);opacity:0;}}
  @keyframes pulseGold{0%,100%{box-shadow:0 0 0 0 rgba(234,179,8,.6);}50%{box-shadow:0 0 0 10px rgba(234,179,8,0);}}
  @keyframes urgencyPulse{0%,100%{border-color:rgba(239,68,68,.4);}50%{border-color:rgba(239,68,68,.9);}}

  .anim-neon { animation:neonBreathe 2.5s ease-in-out infinite; }
  .anim-gold  { animation:pulseGold 1.8s ease-in-out infinite; }
  .anim-urg   { animation:urgencyPulse 1s ease-in-out infinite; }

  .card-normal      { border:1px solid rgba(0,212,255,.28); box-shadow:0 0 40px rgba(0,212,255,.05),0 8px 40px rgba(0,0,0,.6); }
  .card-urgent      { border:1px solid rgba(239,68,68,.5);  box-shadow:0 0 40px rgba(239,68,68,.08),0 8px 40px rgba(0,0,0,.6); }
  .card-reactivated { border:1px solid rgba(234,179,8,.6);  box-shadow:0 0 40px rgba(234,179,8,.12),0 8px 40px rgba(0,0,0,.6); }

  .btn-send {
    background:linear-gradient(135deg,#059669 0%,#10B981 100%);
    box-shadow:0 6px 30px rgba(16,185,129,.5);
    transition:all .2s;
  }
  .btn-send:hover:not(:disabled){box-shadow:0 6px 40px rgba(16,185,129,.75);transform:translateY(-2px);}
  .btn-send:active:not(:disabled){transform:translateY(0);}
  .btn-send:disabled{opacity:.45;cursor:not-allowed;}

  .btn-sent {
    background:rgba(16,185,129,.12);
    border:1px solid rgba(16,185,129,.4) !important;
    box-shadow:none;
  }

  .outcome-card { transition:all .18s ease; cursor:pointer; }
  .outcome-card:hover:not(:disabled){transform:translateY(-3px);filter:brightness(1.18);}
  .outcome-card:disabled{opacity:.45;cursor:not-allowed;}

  .nav-btn{transition:all .18s;cursor:pointer;}
  .nav-btn:hover:not(:disabled){transform:translateY(-1px);}
  .nav-btn:disabled{opacity:.3;cursor:not-allowed;}

  .queue-row{transition:all .15s;}
  .queue-row:hover{background:rgba(0,212,255,.07)!important;border-color:rgba(0,212,255,.3)!important;}

  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2);border-radius:2px;}
`;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function wa(phone: string, msg?: string) {
  const d = phone.replace(/\D/g,""); const n = d.startsWith("55")?d:`55${d}`;
  return msg ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : `https://wa.me/${n}`;
}
function ini(name: string) { return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase(); }
function minsAgo(iso: string) { return Math.floor((Date.now()-new Date(iso).getTime())/60000); }
function daysAgo(iso: string) { return Math.floor((Date.now()-new Date(iso).getTime())/86400000); }

function prio(lead: Lead) {
  const m = minsAgo(lead.lastInteractionAt);
  if (lead.status==="REACTIVATED")     return 0;
  if (lead.status==="NEW" && m>30)     return 1;
  if (lead.status==="NEW")             return 2;
  if (m>120)                           return 3;
  if (lead.status==="IN_PROGRESS")     return 4;
  if (lead.status==="NEGOTIATING")     return 5;
  if (lead.status==="VISIT_SCHEDULED") return 6;
  if (lead.status==="DOCS_REQUESTED")  return 7;
  return 8;
}

function getMsg(lead: Lead, tema?: string): string {
  const nome = lead.name.split(" ")[0];
  const s = lead.status;
  if (s==="REACTIVATED")
    return `Olá ${nome}! Tudo bem? Sou da equipe do Minha Casa Minha Vida e vi que você nos contactou antes. Ainda tem interesse em realizar o sonho da casa própria? Posso te ajudar agora mesmo!`;
  if (["NEW","IN_PROGRESS","REACTIVATED"].includes(s)) {
    if (tema==="preco")      return `Olá ${nome}! Sobre o valor: no MCMV a entrada pode ser bem menor do que você imagina — principalmente com FGTS. Posso fazer uma simulação gratuita pra você agora?`;
    if (tema==="entrada")    return `Olá ${nome}! A entrada no MCMV pode ser reduzida com FGTS e subsídio do governo. Posso te mostrar como funciona com os seus dados?`;
    if (tema==="localizacao")return `Olá ${nome}! Posso te enviar fotos do entorno, acesso ao transporte e tudo que tem no bairro. Me manda um oi que coloco tudo pra você avaliar!`;
    if (tema==="documentacao")return `Olá ${nome}! Vou te mandar a lista de documentos agora — é simples e te ajudo em cada etapa!`;
    return `Olá ${nome}! Vi que você tem interesse em imóvel pelo Minha Casa Minha Vida. Sou corretor parceiro do programa e posso te ajudar com tudo. Você tem um minutinho agora?`;
  }
  if (s==="NEGOTIATING")      return `Olá ${nome}! Como está indo? Queria confirmar os próximos passos. Tem alguma dúvida que posso esclarecer?`;
  if (s==="VISIT_SCHEDULED")  return `Olá ${nome}! Confirmando sua visita ao plantão 😊 Qualquer dúvida sobre como chegar, me chama!`;
  if (s==="VISITA_REALIZADA") return `Olá ${nome}! Que bom que você veio! Para darmos o próximo passo, vou te enviar a lista de documentos. Te ajudo em tudo!`;
  if (s==="DOCS_REQUESTED")   return `Olá ${nome}! Como está indo a reunião dos documentos? Precisa de ajuda? Me chama que resolvo rapidinho 😊`;
  return `Olá ${nome}! Posso te ajudar com alguma informação?`;
}

const ST: Record<string,{bg:string;text:string;label:string;emoji:string}> = {
  NEW:              {bg:"rgba(56,189,248,.15)",  text:"#38BDF8",label:"NOVO",        emoji:"⚡"},
  IN_PROGRESS:      {bg:"rgba(129,140,248,.15)", text:"#818CF8",label:"EM ATEND.",   emoji:"💬"},
  NEGOTIATING:      {bg:"rgba(251,146,60,.15)",  text:"#FB923C",label:"NEGOCIANDO",  emoji:"🤝"},
  VISIT_SCHEDULED:  {bg:"rgba(52,211,153,.15)",  text:"#34D399",label:"VISITA MARC.",emoji:"📅"},
  VISITA_REALIZADA: {bg:"rgba(16,185,129,.15)",  text:"#10B981",label:"VEIO À VISITA",emoji:"🏠"},
  DOCS_REQUESTED:   {bg:"rgba(251,191,36,.15)",  text:"#FBBF24",label:"DOCS PEND.",  emoji:"📄"},
  CONCLUDED:        {bg:"rgba(245,158,11,.2)",   text:"#F59E0B",label:"VENDA",        emoji:"🏆"},
  FOLLOW_UP_AUTO:   {bg:"rgba(100,116,139,.12)", text:"#94A3B8",label:"FOLLOW-UP",   emoji:"🤖"},
  REACTIVATED:      {bg:"rgba(234,179,8,.2)",    text:"#EAB308",label:"REATIVADO",   emoji:"🔥"},
};

const FAIXA: Record<string,{label:string;color:string}> = {
  FAIXA_1:{label:"Faixa 1",color:"#10B981"}, FAIXA_2:{label:"Faixa 2",color:"#38BDF8"},
  FAIXA_3:{label:"Faixa 3",color:"#818CF8"}, FORA:{label:"Fora MCMV",color:"#EF4444"},
};

/* ─────────────────────────────────────────────
   RANKING
───────────────────────────────────────────── */
interface RankItem{id:string;name:string;avatar:string;pts:number;}
const XP:Partial<Record<LeadStatus,number>>={IN_PROGRESS:10,VISIT_SCHEDULED:30,VISITA_REALIZADA:50,DOCS_REQUESTED:80,CONCLUDED:200};
async function fetchRanking():Promise<RankItem[]>{
  const [{data:p},{data:l}]=await Promise.all([
    supabase.from("profiles").select("id,first_name,last_name").eq("role","BROKER"),
    supabase.from("leads").select("broker_id,status").not("broker_id","is",null).not("status","in",'("EXCLUDED","ABANDONED")').gte("created_at",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()),
  ]);
  if(!p||!l)return[];
  const sc:Record<string,number>={};
  for(const x of l) sc[x.broker_id]=(sc[x.broker_id]||0)+(XP[x.status as LeadStatus]??0);
  return p.map(x=>{const name=`${x.first_name||""} ${x.last_name||""}`.trim()||"Corretor";return{id:x.id,name,avatar:ini(name),pts:sc[x.id]??0};}).sort((a,b)=>b.pts-a.pts).slice(0,3);
}

/* ─────────────────────────────────────────────
   SMALL COMPONENTS
───────────────────────────────────────────── */
function Logo({size=28}:{size?:number}){
  return <img src="/comandra-icon.png" alt="Comandra" width={size} height={size} className="anim-neon object-contain" style={{filter:"drop-shadow(0 0 8px rgba(0,212,255,.6))"}}/>;
}

function Confetti({active}:{active:boolean}){
  const pieces=useRef(Array.from({length:40},(_,i)=>({id:i,color:["#00D4FF","#10B981","#F59E0B","#7C3AED","#EF4444","#FBBF24"][i%6],left:`${(i/40)*100+Math.random()*3}%`,delay:`${Math.random()*.8}s`,duration:`${1.4+Math.random()}s`,size:`${6+Math.random()*8}px`,circle:i%3===0}))).current;
  if(!active)return null;
  return(
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p=>(
        <div key={p.id} style={{position:"absolute",top:"-12px",left:p.left,width:p.size,height:p.size,background:p.color,borderRadius:p.circle?"50%":"2px",animation:`confettiFall ${p.duration} ${p.delay} ease-in forwards`}}/>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ACTION RESULT (feedback pós-clique)
───────────────────────────────────────────── */
interface ActionResult{
  emoji:string; label:string; xp:number; nextStep:string; color:string;
}
const ACTION_RESULTS:Record<string,ActionResult>={
  IN_PROGRESS:     {emoji:"✅",label:"Contato registrado!",   xp:10,  nextStep:"Aprofunde o interesse → agende uma visita o quanto antes",   color:"#10B981"},
  NEGOTIATING:     {emoji:"🤝",label:"Em negociação!",         xp:20,  nextStep:"Acompanhe de perto → próximo passo: visita ao plantão",      color:"#FB923C"},
  VISIT_SCHEDULED: {emoji:"📅",label:"Visita agendada!",       xp:30,  nextStep:"Mande lembrete 1h antes — confirme presença no dia",        color:"#34D399"},
  VISITA_REALIZADA:{emoji:"🏠",label:"Comparecimento confirmado!",xp:50,nextStep:"Solicite os documentos hoje — não deixe esfriar",           color:"#10B981"},
  DOCS_REQUESTED:  {emoji:"📄",label:"Documentação solicitada!",xp:80, nextStep:"Verifique cada documento — prepare o fechamento",           color:"#FBBF24"},
  CONCLUDED:       {emoji:"🏆",label:"VENDA FECHADA!",          xp:200, nextStep:"Parabenize o cliente e peça indicações!",                   color:"#F59E0B"},
  ABANDONED:       {emoji:"❌",label:"Lead encerrado",          xp:0,   nextStep:"Registrado como perdido — foco na próxima missão!",         color:"#EF4444"},
  NO_ANSWER:       {emoji:"📞",label:"Tentativa registrada!",   xp:0,   nextStep:"Você tentou — o sistema conta. Próximo lead!",             color:"#94A3B8"},
  FOLLOW_UP:       {emoji:"🤖",label:"Follow-up automático!",   xp:0,   nextStep:"O bot retoma o contato — você foca nos leads ativos",      color:"#64748B"},
};

/* ─────────────────────────────────────────────
   OUTCOME BUTTON
───────────────────────────────────────────── */
interface OutcomeDef{
  id:string; label:string; desc:string;
  icon:React.ReactNode; color:string; bg:string; border:string;
  full?:boolean; primary?:boolean;
  action:()=>void;
}
function OutcomeBtn({o,loading}:{o:OutcomeDef;loading:boolean}){
  return(
    <button onClick={o.action} disabled={loading}
      className={`outcome-card flex items-start gap-3 px-4 py-3 rounded-2xl text-left ${o.full?"col-span-2":""}`}
      style={{background:o.bg,border:`1px solid ${o.border}`,boxShadow:o.primary?`0 0 20px ${o.color}20`:"none"}}>
      <span className="mt-0.5 shrink-0" style={{color:o.color}}>
        {loading?<Loader2 className="w-4 h-4 animate-spin"/>:o.icon}
      </span>
      <div>
        <p className="font-black text-xs uppercase tracking-wide leading-tight" style={{color:o.color}}>{o.label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{o.desc}</p>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────
   STATUS STRIP (pipeline visual)
───────────────────────────────────────────── */
const PIPELINE_STEPS: {status: LeadStatus; label: string}[] = [
  {status:"NEW",             label:"Novo"},
  {status:"IN_PROGRESS",    label:"Atend."},
  {status:"NEGOTIATING",    label:"Negoc."},
  {status:"VISIT_SCHEDULED",label:"Visita"},
  {status:"VISITA_REALIZADA",label:"Veio"},
  {status:"DOCS_REQUESTED", label:"Docs"},
  {status:"CONCLUDED",      label:"Venda"},
];
const PIPELINE_ORDER = PIPELINE_STEPS.map(s=>s.status);

function PipelineStrip({currentStatus}:{currentStatus:LeadStatus}){
  const curIdx = PIPELINE_ORDER.indexOf(currentStatus);
  if(curIdx<0) return null;
  return(
    <div className="flex items-center gap-0 w-full overflow-x-auto no-scrollbar">
      {PIPELINE_STEPS.map((step,i)=>{
        const isPast    = i < curIdx;
        const isCurrent = i === curIdx;
        return(
          <div key={step.status} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: isPast?"#10B981":isCurrent?"#00D4FF":"rgba(255,255,255,.08)",
                  border: isCurrent?"2px solid #00D4FF":isPast?"2px solid #10B981":"2px solid rgba(255,255,255,.14)",
                  boxShadow: isCurrent?"0 0 14px rgba(0,212,255,.55)":isPast?"0 0 6px rgba(16,185,129,.3)":"none",
                }}>
                {isPast&&<span style={{fontSize:9,color:"#080B14",fontWeight:900}}>✓</span>}
                {isCurrent&&<div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide mt-1 truncate w-full text-center"
                style={{color:isPast?"#10B981":isCurrent?"#00D4FF":"rgba(255,255,255,.22)"}}>
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length-1 && (
              <div className="h-px flex-1 mx-1 shrink-0"
                style={{background:i<curIdx?"rgba(16,185,129,.45)":"rgba(255,255,255,.08)",minWidth:10}}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function DashboardFoco(){
  const {user,role,loading:authLoading,signOut}=useAuth();
  const {t}=useTheme();
  const qc=useQueryClient();
  const {playSound}=useAudioArena();

  const isBroker=role==="BROKER";
  const isPower =role==="ADMIN"||role==="SUPERINTENDENT";

  /* state */
  const [idx,setIdx]=useState(0);
  const [mutating,setMutating]=useState(false);
  const [confetti,setConfetti]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [msgText,setMsgText]=useState("");
  const [msgModified,setMsgModified]=useState(false);
  const [sent,setSent]=useState(false);
  const [lostSheet,setLostSheet]=useState(false);
  const [noShowSheet,setNoShowSheet]=useState(false);
  const [visitSheet,setVisitSheet]=useState(false);
  const [visitDate,setVisitDate]=useState("");
  const [visitTime,setVisitTime]=useState("10:00");
  const [isLeadFormOpen,setIsLeadFormOpen]=useState(false);
  const [mobileTab,setMobileTab]=useState<"missao"|"painel">("missao");
  const [saleToast,setSaleToast]=useState<string|null>(null);
  const [activeQueueTab,setActiveQueueTab]=useState<string>("new");
  const [actionResult,setActionResult]=useState<ActionResult|null>(null);
  const [actionLeadName,setActionLeadName]=useState("");
  const taRef=useRef<HTMLTextAreaElement>(null);

  /* queries */
  const {data:allLeads=[],isLoading:leadsLoading}=useQuery<Lead[]>({queryKey:["focoLeads"],queryFn:fetchLeadsForDashboard,refetchInterval:30000,enabled:!!user});
  const {data:ranking=[]}=useQuery<RankItem[]>({queryKey:["focoRanking"],queryFn:fetchRanking,refetchInterval:120000,enabled:!!user});
  const {data:profiles=[]}=useQuery<User[]>({queryKey:["focoProfiles"],queryFn:fetchProfiles,enabled:!!user});

  /* lead state map */
  const myIds=useMemo(()=>allLeads.map(l=>l.id),[allLeads]);
  const {data:statesRaw=[]}=useQuery({
    queryKey:["focoStates",myIds.join(",")],
    queryFn:async()=>{
      if(!myIds.length)return[];
      const{data}=await supabase.from("lead_state").select("lead_id,intencao,tema,momento").in("lead_id",myIds);
      return(data||[])as{lead_id:string;intencao:string;tema:string;momento:string}[];
    },
    enabled:myIds.length>0,refetchInterval:60000,
  });
  const stateMap=useMemo(()=>new Map(statesRaw.map(s=>[s.lead_id,s])),[statesRaw]);

  const myLeads=useMemo(()=>isPower?allLeads:allLeads.filter(l=>l.brokerId===user?.id),[allLeads,user?.id,isPower]);

  const ACTION_S=new Set<LeadStatus>(["NEW","REACTIVATED","IN_PROGRESS","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED"]);
  const NEGOC_S =new Set<LeadStatus>(["NEGOTIATING"]);
  const FLLW_S  =new Set<LeadStatus>(["FOLLOW_UP_AUTO"]);

  const {queue,followupLeads,sectionAcao,sectionNegoc,counts}=useMemo(()=>{
    const acao  =[...myLeads.filter(l=>ACTION_S.has(l.status))].sort((a,b)=>prio(a)-prio(b));
    const negoc =[...myLeads.filter(l=>NEGOC_S.has(l.status))].sort((a,b)=>prio(a)-prio(b));
    const fllw  =myLeads.filter(l=>FLLW_S.has(l.status));
    const cmap:Record<string,number>={};
    myLeads.forEach(l=>{cmap[l.status]=(cmap[l.status]||0)+1;});
    return{queue:[...acao,...negoc],followupLeads:fllw,sectionAcao:acao,sectionNegoc:negoc,counts:cmap};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[myLeads]);

  const myProfile =profiles.find(p=>p.id===user?.id);
  const myName    =myProfile?.name||user?.email?.split("@")[0]||"Corretor";
  const myInitials=ini(myName);
  const myRankPos =useMemo(()=>{const p=ranking.findIndex(r=>r.id===user?.id);return p>=0?p+1:null;},[ranking,user?.id]);

  const lead=queue[idx]||null;

  const {data:mcmvQual}=useQuery({
    queryKey:["foco-mcmv",lead?.id],
    enabled:!!lead?.id,
    staleTime:5*60000,
    queryFn:async()=>{
      const{data,error}=await supabase.from("mcmv_qualification").select("faixa,tem_fgts,qualificado,renda_informada").eq("lead_id",lead!.id).maybeSingle();
      if(error)return null;
      return data as{faixa:string|null;tem_fgts:boolean|null;qualificado:boolean|null;renda_informada:string|null}|null;
    },
  });

  /* clamp idx */
  useEffect(()=>{
    if(idx>=queue.length&&queue.length>0)setIdx(queue.length-1);
  },[queue.length]); // eslint-disable-line

  /* sync message when lead changes */
  useEffect(()=>{
    if(!lead)return;
    const ls=stateMap.get(lead.id);
    setMsgText(getMsg(lead,ls?.tema));
    setMsgModified(false);
    setSent(false);
  },[lead?.id]); // eslint-disable-line

  /* auto-resize textarea */
  useEffect(()=>{
    if(taRef.current){taRef.current.style.height="auto";taRef.current.style.height=`${taRef.current.scrollHeight}px`;}
  },[msgText]);

  /* auto-advance após resultado */
  useEffect(()=>{
    if(!actionResult)return;
    const t=setTimeout(()=>{setActionResult(null);goNext();},2200);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[actionResult]);

  /* realtime */
  useEffect(()=>{
    if(!user?.id)return;
    const ch=supabase.channel("foco-rt").on("postgres_changes",{event:"INSERT",schema:"public",table:"leads",filter:`broker_id=eq.${user.id}`},payload=>{
      qc.invalidateQueries({queryKey:["focoLeads"]});
      if(!isMuted)playSound("NEW_LEAD");
      toast.info(`⚡ Novo Lead: ${(payload.new as {name?:string}).name||""}`,{description:"Apareceu na sua fila!"});
    }).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[user?.id,isMuted]); // eslint-disable-line

  /* derived */
  const ls=lead?stateMap.get(lead.id):null;
  const st=lead?ST[lead.status]:null;
  const mins=lead?minsAgo(lead.lastInteractionAt):0;
  const isUrgent=mins>60;
  const isReactivated=lead?.status==="REACTIVATED";
  const negDays=lead?.negotiatingSince?daysAgo(lead.negotiatingSince):0;

  const acaoCount=(counts.NEW||0)+(counts.REACTIVATED||0)+(counts.IN_PROGRESS||0)+(counts.VISIT_SCHEDULED||0)+(counts.VISITA_REALIZADA||0)+(counts.DOCS_REQUESTED||0);
  const negocCount=counts.NEGOTIATING||0;
  const fllwCount=counts.FOLLOW_UP_AUTO||0;
  const totalWaiting=acaoCount+negocCount;

  const cardClass=isReactivated?"card-reactivated":isUrgent?"card-urgent":"card-normal";

  /* section label for current lead */
  const sectionLabel=()=>{
    if(!lead)return null;
    if(ACTION_S.has(lead.status)) return{label:"⚡ AÇÃO AGORA",color:"#00D4FF"};
    if(NEGOC_S.has(lead.status))  return{label:"🤝 EM NEGOCIAÇÃO",color:"#FB923C"};
    return null;
  };
  const sec=sectionLabel();

  const goNext=()=>{if(idx<queue.length-1)setIdx(i=>i+1);};
  const goPrev=()=>{if(idx>0)setIdx(i=>i-1);};

  /* handlers */
  const handleSend=()=>{
    if(!lead)return;
    window.open(wa(lead.phone,msgText),"_blank");
    setSent(true);
    registerContactAttempt(lead.id).then(n=>{
      qc.setQueryData(["focoLeads"],(old:Lead[]|undefined)=>old?.map(l=>l.id===lead.id?{...l,contactAttempts:n}:l));
    });
  };

  const handleCall=()=>{
    if(!lead)return;
    window.open(`tel:${lead.phone}`,"_self");
    registerContactAttempt(lead.id).then(n=>{
      qc.setQueryData(["focoLeads"],(old:Lead[]|undefined)=>old?.map(l=>l.id===lead.id?{...l,contactAttempts:n}:l));
    });
  };

  const showResult=(key:string,leadName:string)=>{
    const r=ACTION_RESULTS[key]||ACTION_RESULTS.NO_ANSWER;
    setActionLeadName(leadName);
    setActionResult(r);
  };

  const advance=async(status:LeadStatus,lostReason?:LostReason)=>{
    if(!lead||mutating)return;
    setMutating(true);
    const leadName=lead.name;
    try{
      if(status==="CONCLUDED"){
        setConfetti(true);setSaleToast(leadName);if(!isMuted)playSound("SALE");
        setTimeout(()=>setConfetti(false),3000);setTimeout(()=>setSaleToast(null),4500);
      }
      await updateLeadStatus(lead.id,status,null,lostReason||null);
      qc.invalidateQueries({queryKey:["focoLeads"]});
      qc.invalidateQueries({queryKey:["focoRanking"]});
      showResult(status==="ABANDONED"?"ABANDONED":status, leadName);
    }catch{toast.error("Erro ao atualizar. Tente novamente.");}
    finally{setMutating(false);}
  };

  const handleNegociando=async()=>{
    if(!lead||mutating)return;
    setMutating(true);
    const leadName=lead.name;
    try{
      await setLeadNegotiating(lead.id);
      qc.invalidateQueries({queryKey:["focoLeads"]});
      showResult("NEGOTIATING", leadName);
    }catch{toast.error("Erro.");}
    finally{setMutating(false);}
  };

  const handleFollowUp=async()=>{
    if(!lead||mutating)return;
    setMutating(true);
    const leadName=lead.name;
    try{
      await setLeadFollowUpAuto(lead.id);
      qc.invalidateQueries({queryKey:["focoLeads"]});
      showResult("FOLLOW_UP", leadName);
    }catch{toast.error("Erro.");}
    finally{setMutating(false);}
  };

  const handleNoAnswer=async()=>{
    if(!lead)return;
    const leadName=lead.name;
    const n=await registerContactAttempt(lead.id);
    qc.invalidateQueries({queryKey:["focoLeads"]});
    showResult("NO_ANSWER", leadName);
  };

  const handleAgendarVisita=async()=>{
    if(!lead||!visitDate)return;
    const dt=new Date(`${visitDate}T${visitTime||"10:00"}`);
    setVisitSheet(false);setMutating(true);
    try{
      await Promise.all([
        updateLeadStatus(lead.id,"VISIT_SCHEDULED"),
        createTask({userId:user!.id,leadId:lead.id,type:"FOLLOW_UP",title:`Visita — ${dt.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})} às ${visitTime}`,dueAt:dt.toISOString()}),
      ]);
      qc.invalidateQueries({queryKey:["focoLeads"]});
      toast.success(`📅 Visita confirmada`);
      goNext();
    }catch{toast.error("Erro ao agendar.");}
    finally{setMutating(false);setVisitDate("");}
  };

  const handleLost=async(reason:LostReason)=>{
    setLostSheet(false);await advance("ABANDONED",reason);
  };

  const resetMsg=()=>{
    if(!lead)return;
    setMsgText(getMsg(lead,ls?.tema));setMsgModified(false);
  };

  const getOutcomes=(l:Lead):OutcomeDef[]=>{
    const s=l.status;
    const res:OutcomeDef[]=[];
    if(["NEW","IN_PROGRESS","REACTIVATED"].includes(s)){
      res.push(
        {id:"ok",    label:"Respondeu / Atendeu!",   desc:"Marca como Em Atendimento — lead ativo",        icon:<CheckCircle2 className="w-4 h-4"/>,color:"#10B981",bg:"rgba(16,185,129,.16)",border:"rgba(16,185,129,.45)",primary:true,full:true,action:()=>advance("IN_PROGRESS")},
        {id:"visit", label:"Agendar Visita",          desc:"Registra data da visita no sistema",             icon:<Calendar     className="w-4 h-4"/>,color:"#34D399",bg:"rgba(52,211,153,.13)",border:"rgba(52,211,153,.4)",               action:()=>{setVisitDate("");setVisitSheet(true);}},
        {id:"negoc", label:"Estou Negociando",        desc:"Move para a seção Em Negociação",                icon:<UserCheck    className="w-4 h-4"/>,color:"#FB923C",bg:"rgba(251,146,60,.13)", border:"rgba(251,146,60,.4)",               action:handleNegociando},
        {id:"no",    label:"Não atendeu",             desc:"Registra tentativa e vai para próximo lead",     icon:<Phone        className="w-4 h-4"/>,color:"#94A3B8",bg:"rgba(100,116,139,.1)", border:"rgba(100,116,139,.3)",             action:handleNoAnswer},
      );
    }
    if(s==="NEGOTIATING"){
      res.push(
        {id:"visit", label:"Agendar Visita",          desc:"Próximo passo natural da negociação",            icon:<Calendar     className="w-4 h-4"/>,color:"#34D399",bg:"rgba(52,211,153,.15)",border:"rgba(52,211,153,.45)",primary:true,full:true,action:()=>{setVisitDate("");setVisitSheet(true);}},
        {id:"docs",  label:"Docs Recebidos",          desc:"Documentação entregue — quase lá!",              icon:<FileText     className="w-4 h-4"/>,color:"#FBBF24",bg:"rgba(251,191,36,.13)",border:"rgba(251,191,36,.4)",               action:()=>advance("DOCS_REQUESTED")},
        {id:"close", label:"Fechar Venda 🏆",         desc:"Negócio concluído — parabéns!",                  icon:<Trophy       className="w-4 h-4"/>,color:"#F59E0B",bg:"rgba(245,158,11,.18)",border:"rgba(245,158,11,.5)",               action:()=>advance("CONCLUDED")},
        {id:"no",    label:"Sem resposta",            desc:"Registra tentativa e vai para próximo lead",     icon:<Phone        className="w-4 h-4"/>,color:"#94A3B8",bg:"rgba(100,116,139,.1)", border:"rgba(100,116,139,.3)",             action:handleNoAnswer},
      );
    }
    if(s==="VISIT_SCHEDULED"){
      res.push(
        {id:"came",  label:"✅ Compareceu!",          desc:"Lead veio à visita — solicitar documentação",    icon:<CheckCircle2 className="w-4 h-4"/>,color:"#10B981",bg:"rgba(16,185,129,.16)",border:"rgba(16,185,129,.45)",primary:true,full:true,action:()=>advance("VISITA_REALIZADA")},
        {id:"gone",  label:"Não compareceu",          desc:"Reagendar ou registrar desistência",             icon:<X            className="w-4 h-4"/>,color:"#F97316",bg:"rgba(249,115,22,.1)", border:"rgba(249,115,22,.35)",                       action:()=>setNoShowSheet(true)},
      );
    }
    if(s==="VISITA_REALIZADA"){
      res.push(
        {id:"docs",  label:"Solicitar Documentos",   desc:"Move para etapa de documentação",                icon:<FileText     className="w-4 h-4"/>,color:"#FBBF24",bg:"rgba(251,191,36,.16)",border:"rgba(251,191,36,.5)",primary:true,full:true,action:()=>advance("DOCS_REQUESTED")},
      );
    }
    if(s==="DOCS_REQUESTED"){
      res.push(
        {id:"close", label:"Fechar Venda 🏆",         desc:"Documentação completa — venda confirmada!",      icon:<Trophy       className="w-4 h-4"/>,color:"#F59E0B",bg:"rgba(245,158,11,.2)", border:"rgba(245,158,11,.6)",primary:true,full:true,action:()=>advance("CONCLUDED")},
      );
    }
    if(!["VISIT_SCHEDULED"].includes(s)){
      res.push(
        {id:"lost",  label:"Marcar como Perdido",     desc:"Lead não tem perfil ou desistiu",                icon:<X            className="w-4 h-4"/>,color:"#EF4444",bg:"rgba(239,68,68,.08)",border:"rgba(239,68,68,.25)",                        action:()=>setLostSheet(true)},
      );
    }
    if(l.contactAttempts>=3&&!["NEGOTIATING","FOLLOW_UP_AUTO","CONCLUDED","ABANDONED"].includes(s)){
      res.push(
        {id:"fup",   label:`Follow-up automático (${l.contactAttempts} tent.)`,desc:"Bot assume o contato — você é avisado quando responder",icon:<Bot className="w-4 h-4"/>,color:"#64748B",bg:"rgba(100,116,139,.08)",border:"rgba(100,116,139,.2)",action:handleFollowUp},
      );
    }
    return res;
  };

  if(authLoading){
    return <div className="min-h-screen flex items-center justify-center bg-[#080B14]"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin"/></div>;
  }

  return(
    <>
      <style>{FOCO_STYLES}</style>
      <Confetti active={confetti}/>

      {/* Sale toast */}
      <AnimatePresence>
        {saleToast&&(
          <motion.div initial={{x:300,opacity:0}} animate={{x:0,opacity:1}} exit={{x:300,opacity:0}}
            className="fixed top-16 right-4 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl"
            style={{background:"linear-gradient(135deg,rgba(16,185,129,.97),rgba(5,150,105,.97))",boxShadow:"0 0 40px rgba(16,185,129,.5)",border:"1px solid rgba(16,185,129,.6)"}}>
            <Trophy className="w-5 h-5 text-white"/>
            <div>
              <div className="foco-disp text-white font-bold text-xs uppercase tracking-widest">VENDA CONFIRMADA</div>
              <div className="text-emerald-200 text-xs mt-0.5">{saleToast} — negócio fechado! 🎉</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="foco-ui hex-bg scanlines relative flex flex-col h-screen overflow-hidden text-white">

        {/* ── HEADER ── */}
        <header className="shrink-0 flex items-center justify-between px-4 h-12 z-10"
          style={{background:"rgba(8,11,20,.94)",borderBottom:"1px solid rgba(0,212,255,.15)",backdropFilter:"blur(12px)"}}>
          <div className="flex items-center gap-2.5">
            <Logo size={26}/>
            <div>
              <div className="foco-disp text-[11px] font-bold tracking-widest text-cyan-400">COMANDRA</div>
              <div className="text-[8px] text-slate-500 uppercase tracking-widest">Modo Missão</div>
            </div>
            <div className="w-px h-5 mx-2 bg-slate-700"/>
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/><span className="text-[10px] text-slate-400 font-semibold">AO VIVO</span></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px]" style={{background:"linear-gradient(135deg,#7C3AED,#00D4FF)"}}>{myInitials}</div>
              <span className="text-xs text-slate-300 font-semibold">{myName}</span>
            </div>
            {myRankPos&&<div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.25)"}}><Shield className="w-3 h-3 text-violet-400"/><span className="foco-disp text-[9px] text-violet-300 font-bold">#{myRankPos}</span></div>}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{background:"rgba(0,212,255,.08)",border:"1px solid rgba(0,212,255,.2)"}}><Zap className="w-3 h-3 text-cyan-400"/><span className="foco-disp text-[9px] text-cyan-300 font-bold">{totalWaiting} leads</span></div>
          </div>
          <div className="flex items-center gap-1.5">
            <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <button onClick={()=>setIsLeadFormOpen(true)} className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase" style={{background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.35)",color:"#10B981"}}>
                <PlusCircle className="w-3.5 h-3.5"/><span className="hidden sm:inline foco-disp">Novo Lead</span>
              </button>
              <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id??""} managerId={myProfile?.managerId??null}/>
            </Sheet>
            <ThemeToggle compact/>
            <button onClick={()=>setIsMuted(m=>!m)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)"}}>{isMuted?<VolumeX className="w-3.5 h-3.5 text-slate-500"/>:<Volume2 className="w-3.5 h-3.5 text-cyan-400"/>}</button>
            <button onClick={signOut} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)"}}><LogOut className="w-3.5 h-3.5 text-slate-500"/></button>
          </div>
        </header>

        <AchievementTicker/>
        {isBroker&&<MetaStrip/>}
        <WhatsAppQRBanner/>

        {/* ── MAIN ── */}
        <main className="flex flex-1 overflow-hidden gap-3 p-3 pb-20 md:pb-3 min-h-0">

          {/* ─── LEFT: MISSÃO ─── */}
          <div className={`flex flex-col gap-2 overflow-y-auto md:overflow-hidden md:min-h-0 w-full md:flex-[62] ${mobileTab==="missao"?"flex":"hidden md:flex"}`}>

            {leadsLoading&&<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin"/></div>}

            {!leadsLoading&&queue.length===0&&(
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <motion.div initial={{scale:.8,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:"spring"}}>
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 opacity-60"/>
                </motion.div>
                <div className="text-center">
                  <p className="foco-disp text-xl font-bold text-emerald-400">MISSÃO CUMPRIDA!</p>
                  <p className="text-slate-400 text-sm mt-1">Todos os leads foram atendidos</p>
                  {fllwCount>0&&<p className="text-slate-500 text-xs mt-2">🤖 {fllwCount} no follow-up automático</p>}
                </div>
              </div>
            )}

            {/* ── CARD DA MISSÃO ── */}
            {!leadsLoading&&lead&&st&&(
              <AnimatePresence mode="wait">
                <motion.div key={lead.id}
                  initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-24}}
                  transition={{duration:.2,ease:"easeOut"}}
                  className={`md:flex-1 md:overflow-y-auto rounded-2xl ${cardClass}`}
                  style={{background:"rgba(8,11,20,.88)",backdropFilter:"blur(16px)"}}>

                  <div className="flex flex-col gap-4 p-4">

                    {/* ── PROGRESSO + SEÇÃO ── */}
                    <div className="flex items-center gap-3">
                      {sec&&(
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg"
                          style={{background:`${sec.color}14`,border:`1px solid ${sec.color}30`,color:sec.color}}>
                          {sec.label}
                        </span>
                      )}
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width:`${queue.length>0?Math.round((idx/queue.length)*100):100}%`}} transition={{duration:.6}}
                          className="h-full rounded-full" style={{background:"linear-gradient(90deg,#00D4FF,#818CF8)"}}/>
                      </div>
                      <span className="foco-disp text-[9px] text-slate-500 font-bold shrink-0">{idx+1}/{queue.length}</span>
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isUrgent?"anim-urg":""}`}
                        style={isUrgent?{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)"}:{background:"rgba(0,212,255,.08)",border:"1px solid rgba(0,212,255,.2)"}}>
                        <Zap className={`w-2.5 h-2.5 ${isUrgent?"text-red-400":"text-cyan-400"}`}/>
                        <span className={isUrgent?"text-red-300":"text-cyan-300"}>
                          {mins<60?`${mins}min`:`${Math.floor(mins/60)}h${mins%60>0?` ${mins%60}m`:""}`}
                        </span>
                      </div>
                    </div>

                    {/* ── PIPELINE ── */}
                    {PIPELINE_ORDER.includes(lead.status)&&(
                      <div className="px-1">
                        <PipelineStrip currentStatus={lead.status}/>
                      </div>
                    )}

                    {/* ── BANNER REATIVADO ── */}
                    {isReactivated&&(
                      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl anim-gold"
                        style={{background:"rgba(234,179,8,.15)",border:"1px solid rgba(234,179,8,.55)"}}>
                        <Flame className="w-5 h-5 text-yellow-400 shrink-0"/>
                        <div>
                          <p className="foco-disp text-[10px] font-bold text-yellow-300 uppercase tracking-wider">🔥 Lead Reativado — Prioridade Máxima</p>
                          <p className="text-[10px] text-yellow-500 mt-0.5">Esse lead respondeu ao bot e quer falar com você. Contato agora.</p>
                        </div>
                      </div>
                    )}

                    {/* ── BANNER 5 DIAS NEGOCIANDO ── */}
                    {lead.status==="NEGOTIATING"&&negDays>=5&&(
                      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                        style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.4)"}}>
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0"/>
                        <p className="text-xs font-black text-red-300 uppercase tracking-wide">{negDays} dias em negociação sem atualização — atualize ou o lead será redistribuído</p>
                      </div>
                    )}

                    {/* ── IDENTIDADE ── */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{background:st.bg,color:st.text}}>{st.emoji} {st.label}</span>
                        {lead.rendaDeclarada&&<span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{background:"rgba(129,140,248,.12)",color:"#818CF8",border:"1px solid rgba(129,140,248,.25)"}}>R$ {lead.rendaDeclarada}</span>}
                        {mcmvQual?.faixa&&FAIXA[mcmvQual.faixa]&&<span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:`${FAIXA[mcmvQual.faixa].color}18`,color:FAIXA[mcmvQual.faixa].color,border:`1px solid ${FAIXA[mcmvQual.faixa].color}40`}}>{FAIXA[mcmvQual.faixa].label}</span>}
                        {lead.tipoTrabalho&&<span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{background:"rgba(129,140,248,.08)",color:"#818CF8",border:"1px solid rgba(129,140,248,.2)"}}>{TIPO_TRABALHO_LABEL[lead.tipoTrabalho]}</span>}
                        {lead.contactAttempts>0&&<span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:"rgba(251,191,36,.1)",color:"#FBBF24",border:"1px solid rgba(251,191,36,.25)"}}>{lead.contactAttempts} tentativa{lead.contactAttempts>1?"s":""}</span>}
                      </div>
                      <h1 className="foco-disp text-3xl sm:text-[2.4rem] font-black text-white leading-none">{lead.name}</h1>
                      <p className="text-lg text-cyan-400 font-semibold mt-1">{lead.phone}</p>
                    </div>

                    {/* ── MENSAGEM PRONTA ── */}
                    <div className="rounded-2xl overflow-hidden" style={{border:"1px solid rgba(0,212,255,.22)"}}>
                      <div className="flex items-center justify-between px-3 py-2" style={{background:"rgba(0,212,255,.07)",borderBottom:"1px solid rgba(0,212,255,.12)"}}>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-cyan-400"/>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Mensagem pronta para enviar</span>
                        </div>
                        {msgModified&&(
                          <button onClick={resetMsg} className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-slate-300 transition-colors">
                            <RefreshCw className="w-2.5 h-2.5"/> restaurar
                          </button>
                        )}
                      </div>
                      <div style={{background:"rgba(0,0,0,.25)"}}>
                        <textarea ref={taRef} value={msgText}
                          onChange={e=>{setMsgText(e.target.value);setMsgModified(true);setSent(false);}}
                          className="w-full bg-transparent text-sm text-slate-200 leading-relaxed resize-none outline-none p-3"
                          style={{minHeight:80,maxHeight:140,overflowY:"auto"}}/>
                      </div>
                    </div>

                    {/* ── BOTÃO ENVIAR ── */}
                    <div className="flex gap-2.5">
                      <button onClick={handleSend} disabled={mutating||!lead.phone}
                        className={`flex-1 flex items-center justify-center gap-2.5 h-14 rounded-2xl font-black text-white text-base uppercase tracking-wide ${sent?"btn-sent":"btn-send"}`}>
                        {sent
                          ? <><CheckCircle2 className="w-5 h-5 text-emerald-400"/><span className="text-emerald-300 text-sm">Mensagem enviada ✓</span></>
                          : <><MessageSquare className="w-5 h-5"/><span>Enviar no WhatsApp</span></>
                        }
                      </button>
                      <button onClick={handleCall} title="Ligar"
                        className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105"
                        style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}>
                        <Phone className="w-4 h-4 text-slate-300"/>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">Ligar</span>
                      </button>
                      <button onClick={()=>{navigator.clipboard.writeText(msgText);toast.success("Copiado!");}} title="Copiar texto"
                        className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105"
                        style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}>
                        <Copy className="w-4 h-4 text-slate-400"/>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">Copiar</span>
                      </button>
                    </div>

                    {/* ── RESULTADO / OUTCOMES ── */}
                    <AnimatePresence mode="wait">
                      {actionResult ? (
                        /* ── FEEDBACK PÓS-CLIQUE ── */
                        <motion.div key="result"
                          initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.95}}
                          transition={{duration:.2}}
                          className="flex flex-col items-center gap-3 py-4 px-4 rounded-2xl"
                          style={{background:`${actionResult.color}10`,border:`1px solid ${actionResult.color}30`}}>

                          {/* Emoji + Label */}
                          <div className="text-4xl">{actionResult.emoji}</div>
                          <div className="text-center">
                            <p className="foco-disp font-black text-sm uppercase tracking-wide" style={{color:actionResult.color}}>{actionResult.label}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{actionLeadName}</p>
                          </div>

                          {/* XP */}
                          {actionResult.xp>0&&(
                            <motion.div initial={{scale:.5,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:.15,type:"spring"}}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full"
                              style={{background:"rgba(250,204,21,.12)",border:"1px solid rgba(250,204,21,.3)"}}>
                              <Star className="w-3.5 h-3.5 text-yellow-400"/>
                              <span className="foco-disp text-sm font-black text-yellow-300">+{actionResult.xp} XP</span>
                            </motion.div>
                          )}

                          {/* Próximo passo */}
                          <div className="w-full rounded-xl px-3 py-2.5 text-center" style={{background:"rgba(0,0,0,.2)",border:"1px solid rgba(255,255,255,.06)"}}>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Próximo passo</p>
                            <p className="text-xs text-slate-300 leading-snug">{actionResult.nextStep}</p>
                          </div>

                          {/* Countdown bar + skip button */}
                          <div className="w-full flex flex-col gap-2">
                            <div className="w-full h-1 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,.08)"}}>
                              <motion.div initial={{width:"100%"}} animate={{width:"0%"}} transition={{duration:2.2,ease:"linear"}}
                                className="h-full rounded-full" style={{background:actionResult.color}}/>
                            </div>
                            <button onClick={()=>{setActionResult(null);goNext();}}
                              className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all hover:opacity-80"
                              style={{background:`${actionResult.color}18`,border:`1px solid ${actionResult.color}30`,color:actionResult.color}}>
                              Próximo lead →
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        /* ── BOTÕES DE RESULTADO ── */
                        <motion.div key="outcomes" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 h-px" style={{background:"rgba(255,255,255,.06)"}}/>
                            <span className="text-[10px] font-bold uppercase tracking-widest shrink-0"
                              style={{color:sent?"#00D4FF":"#334155"}}>
                              {sent?"▼ O que aconteceu?":"Registrar resultado"}
                            </span>
                            <div className="flex-1 h-px" style={{background:"rgba(255,255,255,.06)"}}/>
                          </div>
                          <motion.div animate={sent?{opacity:1}:{opacity:.55}} transition={{duration:.3}}
                            className="grid grid-cols-2 gap-2">
                            {getOutcomes(lead).map(o=><OutcomeBtn key={o.id} o={o} loading={mutating}/>)}
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* ── NAVEGAÇÃO ← → ── */}
            {queue.length>1&&(
              <div className="shrink-0 flex items-center gap-2">
                <button onClick={goPrev} disabled={idx===0||mutating}
                  className="nav-btn flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold uppercase"
                  style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"#64748B"}}>
                  <ChevronLeft className="w-3.5 h-3.5"/> Anterior
                </button>
                <div className="flex-1 flex items-center justify-center gap-1.5">
                  {queue.slice(0,Math.min(queue.length,9)).map((l,i)=>(
                    <button key={l.id} onClick={()=>setIdx(i)}
                      className="transition-all rounded-full"
                      style={{
                        width:i===idx?24:8,height:8,
                        background:i===idx?"#00D4FF":l.status==="REACTIVATED"?"#EAB308":i<idx?"rgba(0,212,255,.3)":"rgba(255,255,255,.12)",
                        borderRadius:i===idx?4:999,
                      }}/>
                  ))}
                  {queue.length>9&&<span className="text-[9px] text-slate-600">+{queue.length-9}</span>}
                </div>
                <button onClick={goNext} disabled={idx===queue.length-1||mutating}
                  className="nav-btn flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold uppercase"
                  style={{background:"rgba(0,212,255,.08)",border:"1px solid rgba(0,212,255,.2)",color:"#00D4FF"}}>
                  Próximo <ChevronRight className="w-3.5 h-3.5"/>
                </button>
              </div>
            )}
          </div>

          {/* ─── RIGHT: PAINEL ─── */}
          <div className={`flex-col gap-2 overflow-y-auto md:overflow-hidden md:min-h-0 w-full md:flex-[38] ${mobileTab==="painel"?"flex":"hidden md:flex"}`}>

            {/* 1. RANKING TOP 3 — pódio animado */}
            <div className="shrink-0 rounded-2xl px-3 pt-3 pb-2" style={{background:"rgba(8,11,20,.8)",border:"1px solid rgba(245,158,11,.22)"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400"/>
                  <span className="foco-disp text-[9px] font-black uppercase tracking-wider text-amber-400">RANKING DO MÊS</span>
                </div>
                {myRankPos&&<span className="foco-disp text-[8px] font-bold px-2 py-0.5 rounded-lg" style={{background:"rgba(0,212,255,.1)",color:"#00D4FF",border:"1px solid rgba(0,212,255,.2)"}}>VOCÊ #{myRankPos}</span>}
              </div>
              {ranking.length===0
                ? <p className="text-xs text-slate-600 text-center py-2">Sem dados ainda</p>
                : (
                  <div className="grid grid-cols-3 items-end gap-2">
                    {([
                      {slotPlace:2,rankIdx:1,barH:28,avSize:30,color:"#64748B",barGrad:"rgba(100,116,139,.45)"},
                      {slotPlace:1,rankIdx:0,barH:46,avSize:40,color:"#F59E0B",barGrad:"rgba(245,158,11,.55)"},
                      {slotPlace:3,rankIdx:2,barH:18,avSize:26,color:"#92400E",barGrad:"rgba(180,83,9,.45)"},
                    ] as const).map(slot=>{
                      const r=ranking[slot.rankIdx];
                      if(!r)return <div key={slot.slotPlace}/>;
                      const isMe=r.id===user?.id;
                      const avBg=slot.slotPlace===1?"linear-gradient(135deg,#F59E0B,#D97706)":isMe?"linear-gradient(135deg,#7C3AED,#00D4FF)":"rgba(255,255,255,.1)";
                      const avColor=slot.slotPlace===1||isMe?"#080B14":"#94A3B8";
                      const avShadow=slot.slotPlace===1?"0 0 20px rgba(245,158,11,.45)":isMe?"0 0 14px rgba(0,212,255,.35)":"none";
                      const nameColor=isMe?"#00D4FF":slot.slotPlace===1?"#FCD34D":"#CBD5E1";
                      const ptsColor=slot.slotPlace===1?"#F59E0B":isMe?"#00D4FF":"#475569";
                      return(
                        <motion.div key={r.id}
                          initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:slot.rankIdx*.1,duration:.4}}
                          className="flex flex-col items-center gap-1">
                          {/* Coroa animada apenas no 1º */}
                          {slot.slotPlace===1
                            ? <div className="text-xl animate-bounce leading-none">👑</div>
                            : <div className="h-5"/>
                          }
                          {/* Avatar */}
                          <div className="rounded-full flex items-center justify-center font-black"
                            style={{
                              width:slot.avSize,height:slot.avSize,
                              fontSize:slot.slotPlace===1?13:11,
                              background:avBg,color:avColor,
                              boxShadow:avShadow,
                              border:slot.slotPlace===1?"2px solid rgba(245,158,11,.6)":isMe?"2px solid rgba(0,212,255,.4)":"2px solid rgba(255,255,255,.08)",
                            }}>
                            {r.avatar}
                          </div>
                          {/* Nome + pontos */}
                          <div className="text-center w-full px-0.5 mt-0.5">
                            <p className="text-xs font-black truncate leading-tight" style={{color:nameColor}}>{r.name.split(" ")[0]}</p>
                            <p className="foco-disp text-[9px] font-bold" style={{color:ptsColor}}>{r.pts}p</p>
                          </div>
                          {/* Barra do pódio com animação de crescimento */}
                          <motion.div
                            initial={{height:0}} animate={{height:slot.barH}} transition={{duration:.9,delay:.25+slot.rankIdx*.12,ease:"easeOut"}}
                            className="w-full rounded-t-xl"
                            style={{background:slot.barGrad,border:`1px solid ${slot.color}30`,overflow:"hidden"}}>
                            {slot.slotPlace===1&&(
                              <div className="flex items-center justify-center h-full opacity-30">
                                <Star className="w-3 h-3 text-amber-200 animate-pulse"/>
                              </div>
                            )}
                          </motion.div>
                          {/* Número */}
                          <div className="foco-disp text-[8px] font-black" style={{color:slot.color}}>#{slot.slotPlace}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            {/* 2. FILA DE MISSÕES — abas horizontais por status */}
            {(()=>{
              const TABS=[
                {id:"reactivated",emoji:"🔥",label:"Reat.",    color:"#EAB308",statuses:["REACTIVATED"]},
                {id:"new",        emoji:"⚡",label:"Novos",     color:"#38BDF8",statuses:["NEW"]},
                {id:"inprogress", emoji:"💬",label:"Contato",   color:"#818CF8",statuses:["IN_PROGRESS"]},
                {id:"negoc",      emoji:"🤝",label:"Negoc.",    color:"#FB923C",statuses:["NEGOTIATING"]},
                {id:"visit",      emoji:"📅",label:"Visita",    color:"#34D399",statuses:["VISIT_SCHEDULED"]},
                {id:"aftervisit", emoji:"🏠",label:"Veio",      color:"#10B981",statuses:["VISITA_REALIZADA"]},
                {id:"docs",       emoji:"📄",label:"Docs",      color:"#FBBF24",statuses:["DOCS_REQUESTED"]},
              ];
              const tabLeads=(tab:typeof TABS[0])=>
                myLeads.filter(l=>(tab.statuses as string[]).includes(l.status)).sort((a,b)=>prio(a)-prio(b));
              const active=TABS.find(t=>t.id===activeQueueTab)||TABS[0];
              const visibleLeads=tabLeads(active);
              return(
                <div className="md:flex-1 md:min-h-0 rounded-2xl pt-2.5 pb-2 flex flex-col" style={{background:"rgba(8,11,20,.8)",border:"1px solid rgba(255,255,255,.07)"}}>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600 mb-2 shrink-0 px-3">FILA DE MISSÕES</span>

                  {/* Barra de abas rolável */}
                  <div className="flex gap-1 px-2 pb-2 overflow-x-auto shrink-0" style={{scrollbarWidth:"none"}}>
                    {TABS.map(tab=>{
                      const count=tabLeads(tab).length;
                      const isActive=tab.id===activeQueueTab;
                      return(
                        <button key={tab.id} onClick={()=>setActiveQueueTab(tab.id)}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all"
                          style={{
                            background:isActive?`${tab.color}20`:"rgba(255,255,255,.04)",
                            border:isActive?`1px solid ${tab.color}50`:"1px solid rgba(255,255,255,.06)",
                          }}>
                          <span className="text-sm leading-none">{tab.emoji}</span>
                          <span className="text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
                            style={{color:isActive?tab.color:"#64748B"}}>{tab.label}</span>
                          {count>0&&(
                            <span className="foco-disp text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none"
                              style={{background:isActive?`${tab.color}30`:"rgba(255,255,255,.08)",color:isActive?tab.color:"#64748B"}}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Lista da aba ativa */}
                  <div className="flex-1 md:min-h-0 md:overflow-y-auto px-2 flex flex-col gap-0.5">
                    {visibleLeads.length===0?(
                      <div className="flex items-center justify-center py-4">
                        <p className="text-[10px] text-slate-600 font-semibold">Nenhum lead nessa etapa</p>
                      </div>
                    ):visibleLeads.map(l=>{
                      const s=ST[l.status];
                      const qIdx=queue.findIndex(q=>q.id===l.id);
                      const isActive=qIdx===idx&&qIdx>=0;
                      const m=minsAgo(l.lastInteractionAt);
                      const color=active.color;
                      return(
                        <button key={l.id}
                          onClick={()=>{if(qIdx>=0)setIdx(qIdx);}}
                          className="queue-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-left w-full"
                          style={{
                            background:isActive?`${color}14`:"rgba(255,255,255,.025)",
                            border:isActive?`1px solid ${color}40`:"1px solid rgba(255,255,255,.05)",
                          }}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{background:s?.text||color}}/>
                          <p className="text-sm font-bold text-slate-100 truncate flex-1 leading-tight">{l.name}</p>
                          <span className="text-xs font-semibold shrink-0" style={{color:m>60?"#EF4444":"#475569"}}>
                            {m<60?`${m}m`:`${Math.floor(m/60)}h`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 3. SITUAÇÃO DA FILA — horizontal fixo no rodapé */}
            <div className="shrink-0 rounded-2xl px-3 py-2" style={{background:"rgba(8,11,20,.8)",border:"1px solid rgba(255,255,255,.07)"}}>
              <div className="flex gap-2">
                {[
                  {label:"Ação Agora", count:acaoCount,  color:"#00D4FF", sub:`${counts.NEW||0} novos · ${counts.IN_PROGRESS||0} atend.`},
                  {label:"Negociando", count:negocCount,  color:"#FB923C", sub:`${negocCount} em negociação`},
                  {label:"Follow-up",  count:fllwCount,   color:"#475569", sub:"bot ativo"},
                ].map(s=>(
                  <div key={s.label} className="flex-1 flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl"
                    style={{background:`${s.color}08`,border:`1px solid ${s.color}18`}}>
                    <span className="foco-disp text-lg font-black leading-none" style={{color:s.color}}>{s.count}</span>
                    <span className="foco-disp text-[7px] font-bold uppercase tracking-wide text-center" style={{color:s.color}}>{s.label}</span>
                    <span className="text-[7px] text-slate-600 text-center leading-tight">{s.sub}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>

        {/* ── MOBILE BOTTOM NAV ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex h-14"
          style={{background:"rgba(8,11,20,.97)",borderTop:"1px solid rgba(0,212,255,.15)",backdropFilter:"blur(12px)"}}>
          <button onClick={()=>setMobileTab("missao")} className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all" style={{color:mobileTab==="missao"?"#00D4FF":"#475569"}}>
            <Zap className="w-5 h-5"/><span className="text-[9px] font-bold uppercase">Missão</span>
          </button>
          <div className="w-px my-3 bg-slate-800"/>
          <button onClick={()=>setMobileTab("painel")} className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all" style={{color:mobileTab==="painel"?"#F59E0B":"#475569"}}>
            <Trophy className="w-5 h-5"/><span className="text-[9px] font-bold uppercase">Painel</span>
          </button>
        </nav>

        {/* ── SHEET: AGENDAR VISITA ── */}
        <Sheet open={visitSheet} onOpenChange={setVisitSheet}>
          <SheetContent side="bottom" className="bg-[#080B14] border-white/10 text-white rounded-t-2xl pb-8">
            <SheetHeader className="mb-5">
              <SheetTitle className="text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-emerald-400"/>Agendar visita — {lead?.name?.split(" ")[0]}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">Data</label>
                  <input type="date" value={visitDate} min={new Date().toISOString().split("T")[0]} onChange={e=>setVisitDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-white outline-none" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}/>
                </div>
                <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">Horário</label>
                  <input type="time" value={visitTime} onChange={e=>setVisitTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-white outline-none" style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}/>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {["09:00","10:00","11:00","14:00","15:00","16:00"].map(h=>(
                  <button key={h} onClick={()=>setVisitTime(h)} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{background:visitTime===h?"rgba(52,211,153,.2)":"rgba(255,255,255,.05)",border:visitTime===h?"1px solid rgba(52,211,153,.4)":"1px solid rgba(255,255,255,.08)",color:visitTime===h?"#34D399":"#64748B"}}>{h}</button>
                ))}
              </div>
              <button onClick={handleAgendarVisita} disabled={!visitDate||mutating}
                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wide disabled:opacity-40"
                style={{background:"linear-gradient(135deg,#059669,#10B981)",color:"white",boxShadow:"0 4px 18px rgba(16,185,129,.35)"}}>
                {mutating?"Agendando...":"Confirmar visita"}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── SHEET: NÃO COMPARECEU ── */}
        <Sheet open={noShowSheet} onOpenChange={setNoShowSheet}>
          <SheetContent side="bottom" className="bg-[#080B14] border-white/10 text-white rounded-t-2xl pb-8">
            <SheetHeader className="mb-5">
              <SheetTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400"/>
                {lead?.name?.split(" ")[0]} não compareceu — o que fazer?
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-3">
              {/* Reagendar */}
              <button
                onClick={()=>{setNoShowSheet(false);setVisitDate("");setVisitSheet(true);}}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all hover:brightness-110"
                style={{background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.35)"}}>
                <Calendar className="w-6 h-6 text-emerald-400 shrink-0"/>
                <div>
                  <p className="font-black text-sm text-emerald-300 uppercase tracking-wide">Reagendar Visita</p>
                  <p className="text-xs text-slate-500 mt-0.5">Marcar nova data — o lead continua na fila</p>
                </div>
              </button>
              {/* Desistência */}
              <button
                onClick={()=>{setNoShowSheet(false);setLostSheet(true);}}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all hover:brightness-110"
                style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)"}}>
                <X className="w-6 h-6 text-red-400 shrink-0"/>
                <div>
                  <p className="font-black text-sm text-red-300 uppercase tracking-wide">Registrar Desistência</p>
                  <p className="text-xs text-slate-500 mt-0.5">Lead perdido — informar o motivo e encerrar</p>
                </div>
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── SHEET: MOTIVO DE PERDA ── */}
        <Sheet open={lostSheet} onOpenChange={setLostSheet}>
          <SheetContent side="bottom" className="bg-[#080B14] border-white/10 text-white rounded-t-2xl pb-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400"/>Por que esse lead foi perdido?</SheetTitle>
            </SheetHeader>
            <div className="space-y-2">
              {(Object.entries(LOST_REASON_LABEL) as [NonNullable<LostReason>,string][]).map(([key,label])=>(
                <button key={key} onClick={()=>handleLost(key)} disabled={mutating}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(239,68,68,.15)";(e.currentTarget as HTMLElement).style.borderColor="rgba(239,68,68,.35)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.05)";(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,.08)";}}>
                  {label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </>
  );
}
