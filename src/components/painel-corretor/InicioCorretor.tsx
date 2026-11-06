// Tela principal do corretor (06/11, protótipo aprovado https://claude.ai/artifact/DKh3nfFWhFwYPABbZ7Skxg):
// visão rápida sem lista de nomes (plantão, placar e som em pílulas; tarefas de hoje em destaque; carteira;
// fases; o dia) e o botão Atender, que abre a fila de um cliente por vez. Celular e computador.
// Usa as variáveis --surface/--border/--text/--muted/--accent, que existem nos dois painéis.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { estadoPush, type EstadoPush } from "@/lib/pushLead";
import PlantaoCheckin from "./PlantaoCheckin";
import AvisoLeadPush from "./AvisoLeadPush";
import { usePlacar } from "./MeuPlacar";
import type { ClassesTarefa } from "./TarefasLead";
import { useLeadsPC, useTarefasAbertas, tarefaPorLead, montarFila, carteira, funil, contarGrupos } from "./fila";
import { diaSP, horaSP, dataCurta, diasUteis } from "./util";

const ATENDIDOS_POR_VENDA = 66; // mesma conta da meta do painel (Econ, 90 dias até 30/10/2026)

const CSS = `
.ini{display:grid;gap:12px;color:var(--text)}
.ini-pilulas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ini-pil{all:unset;box-sizing:border-box;cursor:pointer;border-radius:12px;padding:9px 10px;display:grid;gap:2px;min-height:44px;border:1px solid var(--border);background:var(--surface)}
.ini-pil b{font-size:12.5px}.ini-pil span{font-size:11.5px;color:var(--muted)}
.ini-pil.alerta{background:rgba(245,184,92,.14);border-color:#C9922A}.ini-pil.alerta b{color:#C47A12}
.ini-pil.ok b{color:var(--accent)}
.ini-pil:focus-visible,.ini-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ini-caixa{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px;display:grid;gap:10px}
.ini-caixa h3{margin:0;font-size:15px}
.ini-m{font-size:12.5px;color:var(--muted)}
.ini-tarefas{background:#F5F7FA;color:#12233A;border-radius:16px;padding:14px;display:grid;gap:8px;box-shadow:0 0 0 3px rgba(43,181,160,.35)}
.ini-tarefa{all:unset;box-sizing:border-box;cursor:pointer;display:flex;gap:10px;background:#fff;border:1px solid #DDE3EA;border-radius:10px;padding:9px 10px;width:100%}
.ini-tarefa.atr{background:#FBE3DD;border-color:#F2B7A8}
.ini-tarefa b.h{font-size:13px;color:#0B7A6A;min-width:42px}.ini-tarefa.atr b.h{color:#8E2F1C}
.ini-barra{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px;background:var(--border)}
.ini-barra i{display:block;height:100%}
.ini-tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ini-tres b{font-size:20px;display:block}
.ini-fases{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;align-items:end;height:96px}
.ini-fases span{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;font-size:13px;font-weight:700}
.ini-fases i{display:block;width:100%;border-radius:6px 6px 0 0;min-height:3px}
.ini-rot{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;font-size:11px;color:var(--muted);text-align:center}
.ini-prog{display:block;height:8px;border-radius:4px;background:var(--border)}.ini-prog i{display:block;height:8px;border-radius:4px;background:var(--accent)}
.ini-btn{all:unset;box-sizing:border-box;cursor:pointer;width:100%;background:#2BB5A0;color:#06231E;border-radius:18px;padding:18px;display:grid;justify-items:center;gap:4px;box-shadow:0 8px 24px rgba(43,181,160,.3)}
.ini-btn b{font-size:22px;font-weight:900}.ini-btn span{font-size:14px;font-weight:700}
`;

export default function InicioCorretor({ uid, c, onAtender, onPlacar, onAbrir }: {
  uid: string; c: ClassesTarefa; onAtender: () => void; onPlacar: () => void; onAbrir: (leadId: string) => void;
}) {
  const [abre, setAbre] = useState<"plantao" | "som" | null>(null);
  const [som, setSom] = useState<EstadoPush | null>(null);
  useEffect(() => { estadoPush().then(setSom).catch(() => setSom("sem_suporte")); }, [abre]);

  const { data: leads = [] } = useLeadsPC(uid);
  const { data: tarefas = [] } = useTarefasAbertas();
  const tmap = useMemo(() => tarefaPorLead(tarefas, uid), [tarefas, uid]);
  const fila = useMemo(() => montarFila(leads, tmap), [leads, tmap]);
  const grupos = useMemo(() => contarGrupos(leads, tmap), [leads, tmap]);
  const cart = useMemo(() => carteira(leads, tmap), [leads, tmap]);
  const fases = useMemo(() => funil(leads), [leads]);
  const nomes = useMemo(() => new Map(leads.map((l) => [l.id, l.name])), [leads]);
  const hoje = diaSP(Date.now());
  const deHoje = tarefas.filter((t) => t.userId === uid && t.leadId && nomes.has(t.leadId) && diaSP(t.dueAt) <= hoje);
  const atrasadas = deHoje.filter((t) => Date.parse(t.dueAt) < Date.now()).length;

  const { data: plantao } = useQuery<any>({
    queryKey: ["plantaoDia", uid], enabled: !!uid, refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_meu_dia"); if (error) throw error; return data; },
  });
  const { data: placar } = usePlacar(uid);
  const { data: trilha } = useQuery<any>({
    queryKey: ["pcTrilha", uid], enabled: !!uid, refetchInterval: 120_000,
    queryFn: async () => { const { data } = await (supabase as any).rpc("trilha_corretor"); return data || {}; },
  });
  const mesIni = hoje.slice(0, 8) + "01";
  const { data: metaP } = useQuery<any>({
    queryKey: ["metas-painel", mesIni, "eu"], enabled: !!uid, staleTime: 60_000,
    queryFn: async () => { const { data } = await supabase.rpc("metas_painel" as any, { p_mes: mesIni, p_dono: null }); return data; },
  });
  const metaVendas = Number(metaP?.dono?.meta) > 0 ? Number(metaP.dono.meta) : 1;
  const atMes = Number(trilha?.atendidos_mes) || 0, atHoje = Number(trilha?.atendidos_hoje) || 0;
  const du = diasUteis();
  const alvoHoje = Math.max(1, Math.min(15, Math.ceil(Math.max(0, ATENDIDOS_POR_VENDA * metaVendas - (atMes - atHoje)) / du.restam)));

  const sit = plantao?.situacao as string | undefined;
  const pilPlantao = sit === "roleta" ? { b: plantao?.fim_da_roleta ? "Na roleta · no fim" : "Na roleta", s: plantao?.plantao?.nome || "plantão", k: "ok" }
    : sit === "visita" ? { b: "Em visita", s: "segue na roleta", k: "ok" }
    : sit === "fora" ? { b: "Fora da roleta", s: "Conferir ›", k: "alerta" }
    : sit === "aguardando" ? { b: "Aguardando gerente", s: "check-in feito ›", k: "alerta" }
    : { b: sit === "saiu" ? "Saiu do plantão" : "Sem check-in", s: "Fazer check-in ›", k: "alerta" };
  if (plantao?.conferencia_pendente && (sit === "roleta" || sit === "visita")) Object.assign(pilPlantao, { b: `Conferência ${plantao.conferencia_pendente.qual}`, s: "Confirmar ›", k: "alerta" });
  const pilPlacar = placar?.ok ? { b: `Placar · ${placar.eu.pontos} pts`, s: placar.no_podio && placar.pos ? `${placar.pos}º no pódio ›` : placar.top10 ? "top 10 ›" : `faltam ${placar.falta_top10} p/ top 10 ›` } : { b: "Meu Placar", s: "ver ›" };
  const somOk = som === "ativo";

  const pct = (n: number) => `${cart.total ? (100 * n) / cart.total : 0}%`;
  const maxF = Math.max(1, fases.sem, fases.conv, fases.vis, fases.pasta, fases.venda);
  const alt = (n: number) => `${Math.max(4, Math.round((64 * n) / maxF))}px`;

  return (
    <div className="ini">
      <style>{CSS}</style>
      <div className="ini-pilulas">
        <button type="button" className={`ini-pil ${pilPlantao.k}`} onClick={() => setAbre(abre === "plantao" ? null : "plantao")} aria-expanded={abre === "plantao"}><b>{pilPlantao.b}</b><span>{pilPlantao.s}</span></button>
        <button type="button" className="ini-pil" onClick={onPlacar}><b style={{ color: "#C9922A" }}>{pilPlacar.b}</b><span>{pilPlacar.s}</span></button>
        <button type="button" className={`ini-pil ${somOk ? "ok" : "alerta"}`} onClick={() => setAbre(abre === "som" ? null : "som")} aria-expanded={abre === "som"}><b>{somOk ? "Som ligado" : "Som desligado"}</b><span>{somOk ? "testar ›" : "Ativar ›"}</span></button>
      </div>
      {abre === "plantao" && <div className="ini-caixa"><PlantaoCheckin uid={uid} c={c} /></div>}
      {abre === "som" && <AvisoLeadPush uid={uid} sempre />}

      {deHoje.length > 0 && (
        <div className="ini-tarefas" role="region" aria-label="Suas tarefas de hoje">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 16 }}>Suas tarefas de hoje · {deHoje.length}</b>
            {atrasadas > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: "#B4462F" }}>{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
          </div>
          {deHoje.slice(0, 6).map((t) => {
            const atr = Date.parse(t.dueAt) < Date.now();
            return (
              <button key={t.id} type="button" className={`ini-tarefa${atr ? " atr" : ""}`} onClick={() => onAbrir(t.leadId!)}>
                <b className="h">{diaSP(t.dueAt) < hoje ? dataCurta(t.dueAt) : horaSP(t.dueAt)}</b>
                <span style={{ display: "grid", gap: 1, flex: 1 }}><b style={{ fontSize: 14 }}>{t.title} · {nomes.get(t.leadId!) || "Cliente"}</b>{t.notes ? <span style={{ fontSize: 12.5, color: "#3D4A5C" }}>{t.notes}</span> : null}</span>
                {atr && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#8E2F1C" }}>atrasada</span>}
              </button>);
          })}
        </div>)}

      <div className="ini-caixa">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h3>Sua carteira · {cart.total} clientes</h3><span className="ini-m">como estão</span></div>
        <div className="ini-barra" role="img" aria-label={`${cart.emDia} em dia, ${cart.precisam} precisam de você hoje, ${cart.esquecidos} esquecidos`}>
          {cart.emDia > 0 && <i style={{ width: pct(cart.emDia), background: "#2BB5A0" }} />}
          {cart.precisam > 0 && <i style={{ width: pct(cart.precisam), background: "#F29A4A" }} />}
          {cart.esquecidos > 0 && <i style={{ width: pct(cart.esquecidos), background: "#E5654B" }} />}
        </div>
        <div className="ini-tres">
          <span><b style={{ color: "#16A08A" }}>{cart.emDia}</b><span className="ini-m">em dia</span></span>
          <span><b style={{ color: "#E5772A" }}>{cart.precisam}</b><span className="ini-m">precisam de você hoje</span></span>
          <span><b style={{ color: "#D2452B" }}>{cart.esquecidos}</b><span className="ini-m">esquecidos (+3 dias)</span></span>
        </div>
      </div>

      <div className="ini-caixa">
        <h3>Onde estão seus clientes</h3>
        <div className="ini-fases" role="img" aria-label={`Sem contato ${fases.sem}, conversando ${fases.conv}, visita ${fases.vis}, pasta ${fases.pasta}, venda no mês ${fases.venda}`}>
          <span>{fases.sem}<i style={{ height: alt(fases.sem), background: "#7D93B0" }} /></span>
          <span>{fases.conv}<i style={{ height: alt(fases.conv), background: "#5B9BEA" }} /></span>
          <span>{fases.vis}<i style={{ height: alt(fases.vis), background: "#2BB5A0" }} /></span>
          <span>{fases.pasta}<i style={{ height: alt(fases.pasta), background: "#2BB5A0" }} /></span>
          <span>{fases.venda}<i style={{ height: alt(fases.venda), background: "#F5C451" }} /></span>
        </div>
        <div className="ini-rot"><span>Sem contato</span><span>Conversando</span><span>Visita</span><span>Pasta</span><span>Venda no mês</span></div>
      </div>

      <div className="ini-caixa">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h3>Seu dia</h3><span className="ini-m">{atHoje} de {alvoHoje} atendidos {atHoje >= alvoHoje ? "✅" : ""}</span></div>
        <span className="ini-prog"><i style={{ width: `${Math.min(100, (100 * atHoje) / alvoHoje)}%` }} /></span>
        <span className="ini-m">{atHoje >= alvoHoje ? "Meta de hoje batida! Cada cliente a mais deixa o mês mais perto." : `Mais ${alvoHoje - atHoje} cliente${alvoHoje - atHoje > 1 ? "s" : ""} e você bate a meta de hoje.`}</span>
      </div>

      <button type="button" className="ini-btn" onClick={onAtender}>
        <b>Atender</b>
        <span>{fila.length ? `${fila.length} cliente${fila.length > 1 ? "s" : ""} na sua fila de hoje${grupos.resp ? ` · ${grupos.resp} respondeu${grupos.resp > 1 ? "ram" : ""}` : ""}` : "Fila em dia · ver todos os clientes"}</span>
      </button>
      <span className="ini-m" style={{ textAlign: "center" }}>O Comandra mostra um cliente por vez, na ordem certa.</span>
    </div>
  );
}
