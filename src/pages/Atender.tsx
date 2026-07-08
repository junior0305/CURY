/**
 * Atender — dashboard do corretor estilo WhatsApp Web (rota /atender).
 * Lista de leads + conversa espelhada + etiquetas + anotações + prêmio/comunicado + ticker.
 * Reaproveita a camada de dados existente. NÃO substitui /dashboard (paralelo pra teste).
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsForDashboard, updateLeadStatus, setLeadNegotiating } from "@/integrations/supabase/leads";
import {
  fetchLeadConversation, fetchLeadNotes, addLeadNote, setLeadTemperature,
  sendLeadMessage, fetchActiveConversationId, waLink,
} from "@/integrations/supabase/atender";
import type { Lead, LeadStatus, LostReason, LeadTemperature } from "@/types/lead";
import { LOST_REASON_LABEL, TIPO_TRABALHO_LABEL } from "@/types/lead";
import { WallOfFameTicker } from "@/components/dashboard/WallOfFameTicker";
import { WhatsAppQuickButton } from "@/components/broker/WhatsAppQuickButton";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import { useActiveLaunches, registerLaunchClaim } from "@/components/launches/useActiveLaunches";
import { useNextAnnouncement } from "@/hooks/useNextAnnouncement";
import AnnouncementCard from "@/components/announcements/AnnouncementCard";
import { toast } from "sonner";
import { useAudioArena, syncAudioSettings } from "@/hooks/use-audio-arena";

/* ── styles (do mockup aprovado) ── */
const STYLES = `
:root{
  --bg:#eef2f1;--panel:#fff;--rail:#f4f7f6;--chat:#e9efec;--ink:#0f1a17;--muted:#6d7d78;--faint:#9aa8a3;--line:#e2e9e6;
  --teal:#0b7d6f;--teal-ink:#075a4f;--sent:#d5efe6;--sent-line:#b6e3d4;--lost:#d1544e;--warm:#e0900c;
  --shadow:0 1px 2px rgba(15,26,23,.06),0 8px 24px rgba(15,26,23,.06);
  --af:"SF Pro Text",ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
}
.atd *{box-sizing:border-box;}
.atd{position:fixed;inset:0;font-family:var(--af);background:var(--bg);color:var(--ink);font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.atd .ticker{height:30px;flex:0 0 30px;background:#0f1a17;color:#eafaf4;display:flex;align-items:center;overflow:hidden;}
.atd .topbar{height:52px;flex:0 0 52px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 14px;}
.atd .brand{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.02em;font-size:16px;}
.atd .brand .dot{width:22px;height:22px;border-radius:7px;background:var(--teal);display:grid;place-items:center;color:#fff;font-size:13px;font-weight:800;}
.atd .brand small{color:var(--faint);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;}
.atd .spring{flex:1;}
.atd .chip{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:var(--rail);cursor:pointer;font-weight:600;font-size:13px;color:var(--ink);position:relative;}
.atd .chip:hover{border-color:var(--teal);color:var(--teal-ink);}
.atd .chip .k{color:var(--faint);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
.atd .chip .dotred{position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:var(--lost);border:2px solid #fff;}
.atd .me{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0b7d6f,#12a892);color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px;}
.atd .promo{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:8px 16px;background:linear-gradient(90deg,#fff6e8,#fdeccb);border-bottom:1px solid #f2e0bd;}
.atd .promo .gift{width:30px;height:30px;border-radius:9px;background:var(--warm);display:grid;place-items:center;font-size:15px;}
.atd .promo .txt{font-size:13.5px;color:#8a6410;} .atd .promo .txt b{color:#7a4e06;}
.atd .body{flex:1;display:flex;min-height:0;}
.atd .list{width:378px;flex:0 0 378px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;}
.atd .search{padding:10px 12px;border-bottom:1px solid var(--line);}
.atd .search input{width:100%;height:38px;border:1px solid var(--line);background:var(--rail);border-radius:10px;padding:0 14px;font-size:13.5px;font-family:var(--af);outline:none;}
.atd .search input:focus{border-color:var(--teal);background:#fff;}
.atd .filters{display:flex;gap:6px;padding:9px 12px;border-bottom:1px solid var(--line);overflow-x:auto;}
.atd .filters::-webkit-scrollbar{height:0;}
.atd .fchip{white-space:nowrap;height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--muted);font-weight:600;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}
.atd .fchip.on{background:var(--teal);border-color:var(--teal);color:#fff;}
.atd .fchip .n{font-variant-numeric:tabular-nums;opacity:.85;}
.atd .volhint{padding:7px 14px;font-size:12px;color:var(--faint);border-bottom:1px solid var(--line);font-weight:600;}
.atd .rows{flex:1;overflow-y:auto;min-height:0;}
.atd .row{display:flex;gap:12px;padding:11px 14px;cursor:pointer;border-bottom:1px solid #f1f5f3;align-items:flex-start;position:relative;}
.atd .row:hover{background:#f6faf8;} .atd .row.active{background:#eef7f3;}
.atd .row.active::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--teal);}
.atd .av{width:48px;height:48px;flex:0 0 48px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:16px;}
.atd .mid{flex:1;min-width:0;}
.atd .l1{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
.atd .nm{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.atd .tm{color:var(--faint);font-size:11.5px;font-variant-numeric:tabular-nums;flex:0 0 auto;}
.atd .l2{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:2px;}
.atd .pv{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.atd .pv .snt{color:var(--faint);}
.atd .badge{min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--teal);color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;}
.atd .tags{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;}
.atd .tag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:default;}
.atd .tag .d{width:6px;height:6px;border-radius:50%;}
.atd .tag.quente{background:#fdeae7;color:#c0453f;} .atd .tag.quente .d{background:#d1544e;}
.atd .tag.morno{background:#fbf0d8;color:#a06f0c;} .atd .tag.morno .d{background:#e0900c;}
.atd .tag.frio{background:#e7effb;color:#2b5bb0;} .atd .tag.frio .d{background:#2563eb;}
.atd .tag.atend{background:#e4f6f2;color:#0a6d5f;} .atd .tag.atend .d{background:#0ea5b7;}
.atd .tag.visita{background:#efe9fb;color:#5e42b0;} .atd .tag.visita .d{background:#7c5cd6;}
.atd .tag.docs{background:#efe9fb;color:#4a34a0;} .atd .tag.docs .d{background:#5b3fb8;}
.atd .tag.novo{background:#e7effb;color:#2b5bb0;} .atd .tag.novo .d{background:#2563eb;}
.atd .tag.negoc{background:#fbf0d8;color:#a06f0c;} .atd .tag.negoc .d{background:#e0900c;}
.atd .tag.venda{background:#e4f6ea;color:#0a6d3f;} .atd .tag.venda .d{background:#0b9d5f;}
.atd .conv{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--chat);}
.atd .chat-head{height:64px;flex:0 0 64px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 14px;}
.atd .chat-head .av{width:42px;height:42px;flex-basis:42px;font-size:15px;}
.atd .who{flex:1;min-width:0;}
.atd .who .n{font-weight:800;font-size:15.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.atd .who .s{color:var(--muted);font-size:12.5px;margin-top:2px;}
.atd .icobtn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;display:grid;place-items:center;color:var(--teal-ink);font-size:16px;}
.atd .icobtn:hover{background:var(--rail);border-color:var(--teal);}
.atd .icobtn.danger{color:var(--lost);border:1.5px solid var(--lost);}
.atd .icobtn.danger:hover{background:#fdeae7;}
.atd .stepper{display:flex;gap:3px;padding:9px 14px;background:var(--panel);border-bottom:1px solid var(--line);overflow-x:auto;}
.atd .step{flex:1;min-width:52px;height:30px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--muted);font-size:11.5px;font-weight:700;cursor:pointer;display:grid;place-items:center;}
.atd .step:hover{border-color:var(--teal);color:var(--teal-ink);}
.atd .step.done{background:#eaf6f1;border-color:var(--sent-line);color:var(--teal-ink);}
.atd .step.cur{background:var(--teal);border-color:var(--teal);color:#fff;}
.atd .msgs{flex:1;overflow-y:auto;min-height:0;padding:18px 8% 12px;display:flex;flex-direction:column;gap:4px;background-image:radial-gradient(circle at 1px 1px,rgba(15,26,23,.028) 1px,transparent 0);background-size:22px 22px;}
.atd .b{max-width:66%;padding:7px 11px 6px;border-radius:12px;font-size:13.7px;position:relative;box-shadow:0 1px 1px rgba(15,26,23,.05);}
.atd .b .t{font-size:10.5px;color:var(--faint);float:right;margin:6px 0 -2px 10px;font-variant-numeric:tabular-nums;}
.atd .b.in{align-self:flex-start;background:#fff;border-top-left-radius:4px;}
.atd .b.out{align-self:flex-end;background:var(--sent);border-top-right-radius:4px;} .atd .b.out .t{color:#5aa593;}
.atd .qrwrap{flex:1;display:grid;place-items:center;padding:24px;}
.atd .qrcard{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:24px 28px;text-align:center;max-width:320px;}
.atd .qrcard .qt{font-weight:800;font-size:16px;} .atd .qrcard .qs{color:var(--muted);font-size:13px;margin-top:4px;}
.atd .qrcard button{margin-top:14px;height:40px;padding:0 18px;border:0;border-radius:10px;background:var(--teal);color:#fff;font-weight:800;cursor:pointer;font-family:var(--af);}
.atd .emptychat{flex:1;display:grid;place-items:center;padding:30px;text-align:center;color:var(--muted);}
.atd .emptychat .big{font-size:40px;margin-bottom:8px;opacity:.6;}
.atd .composer{flex:0 0 auto;background:var(--panel);border-top:1px solid var(--line);padding:10px 14px;display:flex;gap:10px;align-items:center;}
.atd .composer input{flex:1;height:42px;border:1px solid var(--line);background:var(--rail);border-radius:12px;padding:0 15px;font-size:14px;font-family:var(--af);outline:none;}
.atd .composer input:focus{border-color:var(--teal);background:#fff;}
.atd .sendbtn{height:42px;padding:0 18px;border:0;border-radius:12px;background:var(--teal);color:#fff;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:7px;justify-content:center;}
.atd .sendbtn:hover{background:#0a6d61;}
.atd .noteflag{font-size:11.5px;color:var(--faint);font-weight:600;}
.atd .info{width:0;flex:0 0 0;background:var(--panel);border-left:1px solid var(--line);overflow:hidden;transition:flex-basis .2s,width .2s;}
.atd .info.open{width:330px;flex-basis:330px;}
.atd .info-in{width:330px;height:100%;overflow-y:auto;}
.atd .info h4{margin:0;padding:16px 18px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);}
.atd .facts{padding:4px 18px 12px;border-bottom:1px solid var(--line);}
.atd .fact{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:13.5px;}
.atd .fact .k{color:var(--muted);} .atd .fact .v{font-weight:700;text-align:right;}
.atd .tempset{display:flex;gap:6px;padding:10px 18px;border-bottom:1px solid var(--line);}
.atd .tempbtn{flex:1;height:32px;border:1px solid var(--line);background:#fff;border-radius:8px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:var(--af);color:var(--muted);}
.atd .tempbtn.q.on{background:#fdeae7;border-color:#e8a7a2;color:#c0453f;}
.atd .tempbtn.m.on{background:#fbf0d8;border-color:#e6cd94;color:#a06f0c;}
.atd .tempbtn.f.on{background:#e7effb;border-color:#b9cdf0;color:#2b5bb0;}
.atd .notebox{padding:12px 18px;}
.atd .noteadd{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;}
.atd .noteadd textarea{width:100%;min-height:60px;resize:vertical;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:var(--af);font-size:13.5px;outline:none;background:var(--rail);}
.atd .noteadd textarea:focus{border-color:var(--teal);background:#fff;}
.atd .noteadd button{align-self:flex-end;height:34px;padding:0 14px;border:0;border-radius:9px;background:var(--teal);color:#fff;font-weight:700;font-size:13px;cursor:pointer;}
.atd .tl{list-style:none;margin:0;padding:0;}
.atd .tl li{position:relative;padding:0 0 16px 20px;border-left:2px solid var(--line);margin-left:5px;}
.atd .tl li:last-child{border-color:transparent;}
.atd .tl li::before{content:"";position:absolute;left:-6px;top:2px;width:10px;height:10px;border-radius:50%;background:var(--teal);border:2px solid #fff;}
.atd .tl .when{font-size:11px;color:var(--faint);font-weight:700;font-variant-numeric:tabular-nums;}
.atd .tl .what{font-size:13.5px;margin-top:2px;white-space:pre-wrap;}
.atd .discardbtn{width:100%;height:42px;border:1px solid #f2d6d4;background:#fdeae7;color:#b0413b;font-weight:800;border-radius:11px;cursor:pointer;font-family:var(--af);font-size:14px;}
.atd .ov{position:fixed;inset:0;background:rgba(15,26,23,.35);opacity:0;pointer-events:none;transition:.2s;z-index:40;}
.atd .ov.open{opacity:1;pointer-events:auto;}
.atd .draw{position:fixed;top:0;right:0;height:100%;width:370px;background:var(--panel);transform:translateX(100%);transition:transform .24s;z-index:41;box-shadow:-10px 0 40px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow-y:auto;}
.atd .draw.open{transform:none;}
.atd .draw h3{margin:0;padding:18px 20px;border-bottom:1px solid var(--line);font-size:16px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff;}
.atd .draw h3 span{cursor:pointer;color:var(--faint);}
.atd .rankrow{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid #f1f5f3;}
.atd .rankrow.you{background:#eef7f3;}
.atd .rankrow .pos{width:26px;font-weight:800;color:var(--faint);text-align:center;}
.atd .rankrow .pts{margin-left:auto;font-weight:800;color:var(--teal-ink);}
.atd .modal{position:fixed;inset:0;display:grid;place-items:center;z-index:50;opacity:0;pointer-events:none;transition:.18s;}
.atd .modal.open{opacity:1;pointer-events:auto;}
.atd .modal .card{width:440px;max-width:92vw;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden;}
.atd .modal .mh{padding:18px 20px 6px;} .atd .modal .mh .t{font-weight:800;font-size:16px;} .atd .modal .mh .s{color:var(--muted);font-size:13px;margin-top:2px;}
.atd .rgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 20px 20px;}
.atd .rbtn{text-align:left;border:1px solid var(--line);background:var(--rail);border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:var(--af);}
.atd .rbtn:hover{border-color:var(--lost);background:#fdeae7;color:#b0413b;}
.atd .modal .foot{display:flex;justify-content:flex-end;padding:0 20px 18px;}
.atd .modal .cancel{border:0;background:none;color:var(--muted);font-weight:700;font-size:13.5px;cursor:pointer;padding:8px 10px;}
.atd .backbtn{display:none;}
@media(max-width:820px){
  .atd .list{width:100%;flex:1;border-right:0;}
  .atd .info,.atd .info.open{display:none;width:0;flex-basis:0;}
  .atd .conv{position:fixed;inset:0;z-index:45;transform:translateX(100%);transition:transform .22s;}
  .atd.mchat .conv{transform:none;}
  .atd .backbtn{display:grid;}
  .atd .chip .k{display:none;}
  .atd .b{max-width:84%;}
}
@media (prefers-reduced-motion:reduce){.atd *{animation:none!important;transition:none!important;}}
`;

/* ── helpers ── */
const STAGES: [LeadStatus, string][] = [
  ["NEW", "Novo"], ["IN_PROGRESS", "Atend."], ["NEGOTIATING", "Negoc."],
  ["VISIT_SCHEDULED", "Visita"], ["VISITA_REALIZADA", "Veio"], ["DOCS_REQUESTED", "Docs"], ["CONCLUDED", "Venda"],
];
const STAGE_TAG: Partial<Record<LeadStatus, [string, string]>> = {
  NEW: ["novo", "Novo"], IN_PROGRESS: ["atend", "Atend."], NEGOTIATING: ["negoc", "Negoc."],
  VISIT_SCHEDULED: ["visita", "Visita"], VISITA_REALIZADA: ["visita", "Veio"], DOCS_REQUESTED: ["docs", "Docs"],
  CONCLUDED: ["venda", "Venda"], REACTIVATED: ["novo", "Voltou"], FOLLOW_UP_AUTO: ["frio", "Follow-up"],
};
const TEMP_TAG: Record<string, [string, string]> = { quente: ["quente", "Quente"], morno: ["morno", "Morno"], frio: ["frio", "Frio"] };
const AVC = ["#0b7d6f", "#2563eb", "#e0900c", "#7c5cd6", "#c2506b", "#0ea5b7", "#b4772a"];
const XP: Partial<Record<LeadStatus, number>> = { IN_PROGRESS: 10, NEGOTIATING: 15, VISIT_SCHEDULED: 30, VISITA_REALIZADA: 50, DOCS_REQUESTED: 80, CONCLUDED: 200 };
function initials(n: string) { return (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
function avColor(n: string) { let s = 0; for (const c of n || "") s += c.charCodeAt(0); return AVC[s % AVC.length]; }
function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias`;
  return `${Math.floor(days / 7)} sem`;
}
const DISCARD_REASONS: LostReason[] = [
  "JA_COMPROU", "RENDA_FORA_FAIXA", "JA_TEM_IMOVEL", "JA_USOU_PROGRAMA", "RESTRICAO_CPF",
  "NAO_COMPARECEU", "FOI_CONCORRENTE", "DESISTIU", "SEM_RETORNO", "NUMERO_ERRADO", "SEM_PERFIL", "LOCALIZACAO",
];

type FilterKey = "prio" | "ALL" | "hot" | "NEW" | "VIS" | "DOC";
const FILTERS: [FilterKey, string][] = [
  ["prio", "⚡ Agora"], ["ALL", "Todos"], ["hot", "🔥 Quentes"], ["NEW", "🆕 Novos"], ["VIS", "Visita"], ["DOC", "Docs"],
];

export default function Atender() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { playSound } = useAudioArena();
  const [selId, setSelId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("prio");
  const [infoOpen, setInfoOpen] = useState(true);
  const [mchat, setMchat] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [drawer, setDrawer] = useState<null | "rank" | "cmt">(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["atenderLeads"], queryFn: fetchLeadsForDashboard, refetchInterval: 30000, enabled: !!user });
  const { data: launches = [] } = useActiveLaunches(user?.id);
  const { announcement } = useNextAnnouncement(user?.id);

  /* chip do corretor + status de conexão (realtime) */
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("bot_instance_id").eq("id", user.id).maybeSingle().then(({ data }) => {
      const bid = data?.bot_instance_id ?? null;
      setBotId(bid);
      if (!bid) { setConnected(false); return; }
      supabase.from("bot_instances").select("status").eq("id", bid).maybeSingle().then(({ data: b }) => setConnected(b?.status === "open"));
    });
  }, [user?.id]);
  useEffect(() => {
    if (!botId) return;
    const ch = supabase.channel(`atd_bot_${botId}`).on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "bot_instances", filter: `id=eq.${botId}` },
      (p: any) => setConnected(p.new?.status === "open")).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [botId]);

  /* Arena Sonora: sincroniza MP3 custom + toca som de LEAD NOVO (INSERT) e VENDA (UPDATE→CONCLUDED) */
  useEffect(() => { syncAudioSettings(supabase); }, []);
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`atd_sound_${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: `broker_id=eq.${user.id}` },
        (p: any) => { playSound("NEW_LEAD"); qc.invalidateQueries({ queryKey: ["atenderLeads"] }); toast.info(`⚡ Novo lead: ${p.new?.name || ""}`, { description: "Apareceu na sua fila!" }); })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: `broker_id=eq.${user.id}` },
        (p: any) => { if (p.new?.status === "CONCLUDED" && p.old?.status !== "CONCLUDED") playSound("SALE"); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, playSound, qc]);

  /* ranking simples (top 6 do mês por XP) */
  const { data: ranking = [] } = useQuery({
    queryKey: ["atenderRank"], enabled: !!user, refetchInterval: 120000,
    queryFn: async () => {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data } = await supabase.from("leads").select("broker_id,status").not("broker_id", "is", null).gte("last_interaction_at", start);
      const pts: Record<string, number> = {};
      (data || []).forEach((l: any) => { pts[l.broker_id] = (pts[l.broker_id] || 0) + (XP[l.status as LeadStatus] || 0); });
      const ids = Object.keys(pts);
      if (!ids.length) return [] as { id: string; name: string; pts: number }[];
      const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
      return (profs || []).map((p: any) => ({ id: p.id, name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Corretor", pts: pts[p.id] || 0 }))
        .sort((a, b) => b.pts - a.pts).slice(0, 6);
    },
  });
  const myRank = useMemo(() => { const i = ranking.findIndex((r) => r.id === user?.id); return i >= 0 ? { pos: i + 1, pts: ranking[i].pts } : null; }, [ranking, user?.id]);

  const myLeads = useMemo(() => leads.filter((l) => l.brokerId === user?.id), [leads, user?.id]);
  function matchKey(k: FilterKey, l: Lead) {
    if (k === "prio") return l.leadTemperature === "quente" || l.status === "NEW" || l.status === "VISIT_SCHEDULED";
    if (k === "ALL") return true;
    if (k === "hot") return l.leadTemperature === "quente";
    if (k === "NEW") return l.status === "NEW";
    if (k === "VIS") return l.status === "VISIT_SCHEDULED";
    if (k === "DOC") return l.status === "DOCS_REQUESTED";
    return true;
  }
  const rows = useMemo(() => myLeads
    .filter((l) => matchKey(filter, l) && (l.name || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()),
    [myLeads, filter, q]);

  const sel = useMemo(() => myLeads.find((l) => l.id === selId) || null, [myLeads, selId]);

  /* ── AGORA: rosto do Jarvis (feed computado dos leads reais) ── */
  const [agIdx, setAgIdx] = useState(0);
  const agFeed = useMemo(() => {
    const now = Date.now();
    const hs = (t?: string | null) => (t ? (now - new Date(t).getTime()) / 3.6e6 : 9999);
    const fst = (n: string) => (n || "Lead").trim().split(/\s+/)[0];
    const parados = myLeads
      .filter((l) => (l.leadTemperature === "quente" || l.status === "NEGOTIATING" || l.status === "IN_PROGRESS") && l.lastLeadResponseAt)
      .sort((a, b) => hs(b.lastLeadResponseAt) - hs(a.lastLeadResponseAt));
    const jogada = parados.find((l) => hs(l.lastLeadResponseAt) > 1 && hs(l.lastLeadResponseAt) < 72) || null;
    const risco = myLeads.filter((l) => l.leadTemperature === "quente" && hs(l.lastLeadResponseAt) > 2 && hs(l.lastLeadResponseAt) < 72).length;
    const novo = myLeads.filter((l) => l.status === "NEW").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const novoRec = novo && hs(novo.createdAt) < 0.5 ? novo : null;
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const hoje = myLeads.filter((l) => l.lastInteractionAt && new Date(l.lastInteractionAt) >= d0).length;
    const items: { badge: string; cls: string; txt: string; leadId?: string; btn?: string }[] = [];
    if (jogada) items.push({ badge: "⚡ AGORA", cls: "jogada", txt: `${fst(jogada.name)} está quente e parada há ${Math.round(hs(jogada.lastLeadResponseAt))}h — seu lead mais quente sem resposta.`, leadId: jogada.id, btn: "Atender" });
    if (risco >= 2) items.push({ badge: "⏳ RISCO", cls: "risco", txt: `${risco} leads quentes vão esfriar hoje se você não tocar.` });
    if (novoRec) items.push({ badge: "🆕 OPORTUNIDADE", cls: "oport", txt: `${fst(novoRec.name)} chegou agora — responder já dobra a chance de visita.`, leadId: novoRec.id, btn: "Atender" });
    items.push({ badge: "🎯 SEU RITMO", cls: "ritmo", txt: hoje > 0 ? `Você já mexeu em ${hoje} leads hoje — mantém o ritmo.` : `Bora começar: seu primeiro lead do dia te espera.` });
    return items;
  }, [myLeads]);
  useEffect(() => {
    if (agFeed.length <= 1) return;
    const t = setInterval(() => setAgIdx((i) => (i + 1) % agFeed.length), 5000);
    return () => clearInterval(t);
  }, [agFeed.length]);
  const ag = agFeed[Math.min(agIdx, agFeed.length - 1)] || null;
  useEffect(() => { if (!selId && rows.length) setSelId(rows[0].id); }, [rows, selId]);

  const { data: conv = [] } = useQuery({ queryKey: ["atenderConv", selId, connected], queryFn: () => fetchLeadConversation(selId!), enabled: !!selId && connected !== false, refetchInterval: 20000 });
  const { data: notes = [] } = useQuery({ queryKey: ["atenderNotes", selId], queryFn: () => fetchLeadNotes(selId!), enabled: !!selId });

  const msgsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [conv, selId]);

  function pick(id: string) { setSelId(id); if (window.innerWidth <= 820) setMchat(true); }
  function tagPill(cls: string, label: string) { return <span className={`tag ${cls}`}><span className="d" />{label}</span>; }
  function leadTags(l: Lead) {
    const t = l.leadTemperature && TEMP_TAG[l.leadTemperature] ? TEMP_TAG[l.leadTemperature] : null;
    const s = STAGE_TAG[l.status] || null;
    return <>{t && tagPill(t[0], t[1])}{s && tagPill(s[0], s[1])}</>;
  }

  async function advance(status: LeadStatus) {
    if (!sel) return;
    try {
      if (status === "NEGOTIATING") await setLeadNegotiating(sel.id);
      else await updateLeadStatus(sel.id, status);
      toast.success("Etapa: " + (STAGES.find((s) => s[0] === status)?.[1] || status));
      qc.invalidateQueries({ queryKey: ["atenderLeads"] });
    } catch (e: any) { toast.error("Falhou: " + e.message); }
  }
  async function setTemp(t: LeadTemperature) {
    if (!sel) return;
    try { await setLeadTemperature(sel.id, t); toast.success("Temperatura atualizada"); qc.invalidateQueries({ queryKey: ["atenderLeads"] }); }
    catch (e: any) { toast.error("Falhou: " + e.message); }
  }
  async function saveNote() {
    if (!sel || !noteDraft.trim() || !user?.id) return;
    try { await addLeadNote(sel.id, user.id, noteDraft.trim()); setNoteDraft(""); qc.invalidateQueries({ queryKey: ["atenderNotes", sel.id] }); toast.success("Anotação salva"); }
    catch (e: any) { toast.error("Falhou: " + e.message); }
  }
  async function send() {
    if (!sel || !draft.trim()) return;
    const text = draft.trim();
    if (connected && botId) {
      setDraft("");
      const convId = await fetchActiveConversationId(sel.id);
      const r = await sendLeadMessage(botId, sel.phone, text, convId);
      if (r.success) { toast.success("Enviada"); qc.invalidateQueries({ queryKey: ["atenderConv", sel.id] }); }
      else { toast.error("Falha ao enviar: " + r.error); setDraft(text); }
    } else {
      window.open(waLink(sel.phone, text), "_blank");
      setDraft("");
    }
  }
  async function doDiscard(reason: LostReason) {
    if (!sel) return;
    try {
      await updateLeadStatus(sel.id, "ABANDONED", null, reason);
      toast.success(`${sel.name} descartado · ${reason ? LOST_REASON_LABEL[reason] : ""}`);
      setDiscardOpen(false); setSelId(null);
      qc.invalidateQueries({ queryKey: ["atenderLeads"] });
    } catch (e: any) { toast.error("Falhou: " + e.message); }
  }

  const prize = launches[0];
  const ci = sel ? STAGES.findIndex((s) => s[0] === sel.status) : -1;

  return (
    <div className={`atd${mchat ? " mchat" : ""}`}>
      <style>{STYLES}</style>
      <style>{`
        .atd .agorabar{flex:1;display:flex;align-items:center;gap:10px;min-width:0;padding-left:10px;border-left:1px solid var(--line);}
        .atd .agbadge{flex:0 0 auto;font-size:11px;font-weight:800;letter-spacing:.5px;color:var(--teal);background:rgba(0,128,105,.12);border-radius:999px;padding:5px 11px;animation:agp 2.2s ease-in-out infinite;white-space:nowrap;}
        .atd .agorabar.ag-risco .agbadge{color:#d9334a;background:rgba(217,51,74,.12);} .atd .agorabar.ag-oport .agbadge{color:#027eb5;background:rgba(2,126,181,.12);} .atd .agorabar.ag-ritmo .agbadge{color:#b8860b;background:rgba(184,134,11,.14);}
        .atd .agtxt{flex:1;min-width:0;font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .atd .agbtn{flex:0 0 auto;border:none;border-radius:8px;padding:6px 13px;font-size:12.5px;font-weight:700;background:var(--teal);color:#fff;cursor:pointer;}
        @keyframes agp{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
      `}</style>

      <div className="ticker"><WallOfFameTicker /></div>

      <div className="topbar">
        <div className="brand"><span className="dot">C</span>Comandra <small>Atender</small></div>
        {ag ? (
          <div className={`agorabar ag-${ag.cls}`}>
            <span className="agbadge">{ag.badge}</span>
            <span className="agtxt">{ag.txt}</span>
            {ag.leadId && <button className="agbtn" onClick={() => pick(ag.leadId!)}>{ag.btn} ›</button>}
          </div>
        ) : <div className="spring" />}
        <div className="chip" onClick={() => setDrawer("rank")}>
          <span className="k">Ranking</span> {myRank ? <><b>{myRank.pos}º</b> · <b>{myRank.pts}</b></> : "—"}
        </div>
        {announcement && <div className="chip" onClick={() => setDrawer("cmt")}>📣 <span className="k">Comunicados</span><span className="dotred" /></div>}
        <WhatsAppQuickButton />
        <div className="me">{initials(user?.email?.split("@")[0] || "EU")}</div>
      </div>

      {connected === false && <div style={{ flex: "0 0 auto" }}><WhatsAppQRBanner /></div>}

      {prize && (
        <div className="promo">
          <div className="gift">{prize.hero_emoji || "🎁"}</div>
          <div className="txt"><b>{prize.name}</b>{prize.description ? " — " + prize.description : ""}</div>
        </div>
      )}

      <div className="body">
        {/* LISTA */}
        <aside className="list">
          <div className="search"><input placeholder="Buscar lead por nome…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="filters">
            {FILTERS.map(([k, lbl]) => {
              const n = myLeads.filter((l) => matchKey(k, l)).length;
              return <div key={k} className={`fchip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{lbl} <span className="n">{n}</span></div>;
            })}
          </div>
          <div className="volhint">📊 {rows.length} na tela · <b>{myLeads.length}</b> no total — filtre pra achar</div>
          <div className="rows">
            {rows.map((l) => {
              const last = conv.length && l.id === selId ? conv[conv.length - 1] : null;
              const pv = last ? (last.direction === "outgoing" ? "Você: " : "") + last.text : (l.tag || "—");
              return (
                <div key={l.id} className={`row${selId === l.id ? " active" : ""}`} onClick={() => pick(l.id)}>
                  <div className="av" style={{ background: avColor(l.name) }}>{initials(l.name)}</div>
                  <div className="mid">
                    <div className="l1"><span className="nm">{l.name}</span><span className="tm">{fmtTime(l.lastInteractionAt)}</span></div>
                    <div className="l2"><span className="pv">{pv.length > 40 ? pv.slice(0, 40) + "…" : pv}</span></div>
                    <div className="tags">{leadTags(l)}</div>
                  </div>
                </div>
              );
            })}
            {!rows.length && <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--faint)" }}>Nenhum lead aqui.</div>}
          </div>
        </aside>

        {/* CONVERSA */}
        <main className="conv">
          {sel ? (
            <>
              <div className="chat-head">
                <button className="icobtn backbtn" onClick={() => setMchat(false)} style={{ fontSize: 22, fontWeight: 800 }}>‹</button>
                <div className="av" style={{ background: avColor(sel.name) }}>{initials(sel.name)}</div>
                <div className="who">
                  <div className="n">{sel.name} {leadTags(sel)}</div>
                  <div className="s">{sel.phone}{sel.product ? " · " + sel.product : ""}</div>
                </div>
                <a className="icobtn" href={`tel:${sel.phone.replace(/\D/g, "")}`} title="Ligar">📞</a>
                <a className="icobtn" href={waLink(sel.phone)} target="_blank" rel="noreferrer" title="Abrir no WhatsApp">🟢</a>
                <button className="icobtn" onClick={() => setInfoOpen((v) => !v)} title="Informações e anotações">ℹ️</button>
                <button className="icobtn danger" onClick={() => setDiscardOpen(true)} title="Descartar lead">🗑️</button>
              </div>

              <div className="stepper">
                {STAGES.map(([k, lbl], i) => (
                  <div key={k} className={`step${i === ci ? " cur" : i < ci ? " done" : ""}`} onClick={() => advance(k)}>{lbl}</div>
                ))}
              </div>

              {connected === false ? (
                <div className="qrwrap">
                  <div className="qrcard">
                    <div className="qt">Conecte seu WhatsApp</div>
                    <div className="qs">As conversas só aparecem com o WhatsApp conectado. Toque no chip lá em cima pra escanear o QR.</div>
                  </div>
                </div>
              ) : conv.length === 0 ? (
                <div className="emptychat"><div><div className="big">💬</div><b>Nenhuma mensagem ainda</b><div style={{ marginTop: 4 }}>Chame {sel.name.split(" ")[0]} agora — quem chega primeiro ganha.</div></div></div>
              ) : (
                <div className="msgs" ref={msgsRef}>
                  {conv.map((m) => (
                    <div key={m.id} className={`b ${m.direction === "incoming" ? "in" : "out"}`}>
                      {m.text}<span className="t">{new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="composer">
                {connected ? (
                  <>
                    <input placeholder="Escrever mensagem para o lead…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                    <span className="noteflag">↵ envia · pelo seu chip</span>
                    <button className="sendbtn" onClick={send}>Enviar</button>
                  </>
                ) : (
                  <>
                    <button className="sendbtn" style={{ flex: 1 }} onClick={() => window.open(waLink(sel.phone), "_blank")}>💬 Abrir no WhatsApp</button>
                    <span className="noteflag">sem chip → abre no seu WhatsApp</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="emptychat"><div><div className="big">👈</div>Selecione um lead pra atender</div></div>
          )}
        </main>

        {/* INFO + NOTAS */}
        <section className={`info${infoOpen ? " open" : ""}`}>
          {sel && (
            <div className="info-in">
              <h4>Dados do lead</h4>
              <div className="facts">
                <div className="fact"><span className="k">Telefone</span><span className="v">{sel.phone}</span></div>
                <div className="fact"><span className="k">Produto</span><span className="v">{sel.product || "—"}</span></div>
                <div className="fact"><span className="k">Renda</span><span className="v">{sel.rendaDeclarada || "—"}</span></div>
                <div className="fact"><span className="k">Trabalho</span><span className="v">{sel.tipoTrabalho ? TIPO_TRABALHO_LABEL[sel.tipoTrabalho] : "—"}</span></div>
                <div className="fact"><span className="k">Etapa</span><span className="v">{ci >= 0 ? STAGES[ci][1] : sel.status}</span></div>
              </div>
              <div className="tempset">
                <button className={`tempbtn q${sel.leadTemperature === "quente" ? " on" : ""}`} onClick={() => setTemp("quente")}>🔥 Quente</button>
                <button className={`tempbtn m${sel.leadTemperature === "morno" ? " on" : ""}`} onClick={() => setTemp("morno")}>🟡 Morno</button>
                <button className={`tempbtn f${sel.leadTemperature === "frio" ? " on" : ""}`} onClick={() => setTemp("frio")}>🔵 Frio</button>
              </div>
              <div className="notebox">
                <h4 style={{ paddingLeft: 0 }}>O que aconteceu — anotações</h4>
                <div className="noteadd">
                  <textarea placeholder="Ex: Liguei, atendeu, quer visita sábado. Pediu simulação." value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                  <button onClick={saveNote}>Salvar anotação</button>
                </div>
                <ul className="tl">
                  {notes.length ? notes.map((n) => (
                    <li key={n.id}><div className="when">{new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div><div className="what">{n.content}</div></li>
                  )) : <li style={{ border: "none", color: "var(--faint)", fontSize: 13 }}><div className="what">Nenhuma anotação ainda. Registre o que aconteceu com esse lead.</div></li>}
                </ul>
              </div>
              <div style={{ padding: "12px 18px 20px", borderTop: "1px solid var(--line)" }}>
                <button className="discardbtn" onClick={() => setDiscardOpen(true)}>🗑️ Descartar este lead</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* DRAWER ranking/comunicado */}
      <div className={`ov${drawer ? " open" : ""}`} onClick={() => setDrawer(null)} />
      <div className={`draw${drawer ? " open" : ""}`}>
        {drawer === "rank" && <>
          <h3>Ranking da equipe <span onClick={() => setDrawer(null)}>✕</span></h3>
          {ranking.map((r, i) => (
            <div key={r.id} className={`rankrow${r.id === user?.id ? " you" : ""}`}>
              <span className="pos">{i + 1}º</span>
              <div className="av" style={{ width: 34, height: 34, flexBasis: 34, fontSize: 12, background: avColor(r.name) }}>{initials(r.name)}</div>
              <span style={{ fontWeight: 700 }}>{r.name}{r.id === user?.id ? " (você)" : ""}</span>
              <span className="pts">{r.pts.toLocaleString("pt-BR")}</span>
            </div>
          ))}
          {!ranking.length && <div style={{ padding: 24, color: "var(--faint)" }}>Sem pontuação ainda este mês.</div>}
        </>}
        {drawer === "cmt" && <>
          <h3>Comunicados <span onClick={() => setDrawer(null)}>✕</span></h3>
          <div style={{ padding: 16 }}>{announcement ? <AnnouncementCard ann={announcement as any} /> : <div style={{ color: "var(--faint)" }}>Nenhum comunicado novo.</div>}</div>
        </>}
      </div>

      {/* MODAL descartar */}
      <div className={`modal${discardOpen ? " open" : ""}`}>
        <div className="card">
          <div className="mh"><div className="t">Descartar lead</div><div className="s">{sel ? `${sel.name} · ${sel.phone}` : ""}</div></div>
          <div className="rgrid">
            {DISCARD_REASONS.map((r) => <button key={r} className="rbtn" onClick={() => doDiscard(r)}>{r ? LOST_REASON_LABEL[r] : ""}</button>)}
          </div>
          <div className="foot"><button className="cancel" onClick={() => setDiscardOpen(false)}>Cancelar</button></div>
        </div>
      </div>
    </div>
  );
}
