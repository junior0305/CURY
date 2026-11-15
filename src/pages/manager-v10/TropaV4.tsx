// Tropa & Plantão Integrado — Modo Plantão (mockup Harmonizado V3, Junior 15/11). Fase 1 de 3.
// War room do plantão ao vivo: dados de agora + 4 top cards + alerta de ociosidade/gargalo + tabela por corretor
// (stand, check-in C2S, online/ociosidade, LEAD EM ANDAMENTO + tempo + SLA estourado, roleta 1 clique).
// Dado REAL: profiles (presença/roleta) + buscarPlantao (C2S) + leads (lead em andamento, tempo, 1º contato).
// SLA MÉDIO por corretor e WoW NÃO entram ainda (sem fonte) — ficam de fora, nada inventado.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import { useEffectiveManagerId } from "@/hooks/useSuperintendente";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { buscarPlantao } from "@/utils/c2sMatching";
import { chaveNome, chaveGerente, gerenteC2S } from "@/hooks/useDiretoria";
import { useDadosEquipe, type LeadH } from "@/hooks/useDadosEquipe";
import { usePastas } from "@/hooks/usePastas";
import { getSegunda } from "@/hooks/usePeriodo";
import { atendido } from "@/lib/situacaoLead";
import RaioXPlantaoDrawer from "@/components/manager-v10/RaioXPlantaoDrawer";

const sb = supabase as any;
const diaSP = (d: Date | number = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");
const ini2 = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();
const ATIVO = new Set(["NEW", "CONTACTED", "IN_PROGRESS", "NEGOTIATING", "DOCS_REQUESTED", "VISIT_SCHEDULED"]);
const mmss = (ms: number) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
const haCurto = (ms: number) => { const h = ms / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} dias`; };

type FT = "todos" | "stand" | "pedindo" | "atend" | "livre" | "semcheckin" | "pausado";

export default function TropaV4() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const qc = useQueryClient();
  const gerente = useEffectiveManagerId() ?? session?.user?.id ?? "";
  const [ft, setFt] = useState<FT>("todos");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [modo, setModo] = useState<"plantao" | "contratacao" | "gestao">("plantao");
  const como = gerente !== session?.user?.id ? gerente : null;
  loadFonts();

  const { data } = useQuery({
    queryKey: ["tropav4", gerente],
    enabled: !!gerente,
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoje = diaSP();
      const desde14 = new Date(Date.now() - 14 * 864e5).toISOString();
      const [gerR, brokersR, leadsR, plantao] = await Promise.all([
        sb.from("profiles").select("first_name").eq("id", gerente).maybeSingle(),
        sb.from("profiles").select("id,first_name,last_name,last_seen_at,lead_assignment_enabled,roleta_entrou_em").eq("manager_id", gerente).eq("role", "BROKER").eq("is_active", true),
        sb.from("leads").select("id,name,broker_id,status,created_at,atribuido_em,primeiro_contato_em,last_broker_whatsapp_at,last_lead_response_at").eq("manager_id", gerente).gte("created_at", desde14).limit(4000),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => [] as any[]),
      ]);
      const kg = chaveGerente((gerR.data as any)?.first_name);
      const plMap = new Map<string, { estande: string | null; hora: string }>();
      for (const r of (plantao as any[])) {
        if (r.created_at?.slice(0, 10) >= hoje && chaveGerente(gerenteC2S(r.gerente)) === kg) {
          const k = chaveNome(r.corretor);
          if (!plMap.has(k)) plMap.set(k, { estande: (r.tipos || "").toString().trim() || null, hora: r.created_at });
        }
      }
      return { brokers: (brokersR.data ?? []) as any[], leads: (leadsR.data ?? []) as any[], plMap };
    },
  });

  // ── Modo Contratação: candidatos (recrutamento) + vagas (system_settings) ──
  const { data: cand } = useQuery({
    queryKey: ["tropav4-cand", gerente, como],
    enabled: !!gerente && modo === "contratacao",
    refetchInterval: 120_000,
    queryFn: async () => (await sb.rpc("candidatos_lista", { p_como: como })).data as any[] ?? [],
  });
  const { data: vagas } = useQuery({
    queryKey: ["tropav4-vagas", gerente],
    enabled: !!gerente && modo === "contratacao",
    staleTime: 60_000,
    queryFn: async () => {
      const r = (await sb.from("system_settings").select("value").eq("key", "vagas_equipe").maybeSingle()).data;
      try { const raw = r?.value; const m = typeof raw === "string" ? JSON.parse(raw) : (raw || {}); return Number(m?.[gerente] ?? 0); } catch { return 0; }
    },
  });
  const candidatos = (cand ?? []) as any[];
  const parado24 = (c: any) => c.etapa === "em_contato" && !c.contatado_em && Date.now() - new Date(c.criado_em).getTime() > 864e5;
  const funil = useMemo(() => {
    const m: Record<string, number> = { em_contato: 0, entrevista: 0, contratado: 0, nao_seguiu: 0 };
    for (const c of candidatos) m[c.etapa] = (m[c.etapa] ?? 0) + 1;
    return m;
  }, [candidatos]);
  const emEsteira = candidatos.filter((c) => c.etapa === "em_contato" || c.etapa === "entrevista")
    .sort((a, b) => Number(parado24(b)) - Number(parado24(a)) || new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  const semContato24 = candidatos.filter(parado24).length;
  const chamarCand = (c: any) => {
    const d = (c.telefone ?? "").replace(/\D/g, "");
    if (d) window.open(`https://wa.me/${d.startsWith("55") ? d : `55${d}`}`, "_blank", "noopener");
    if (!c.contatado_em) sb.rpc("candidato_mover", { p_id: c.id, p_acao: "chamei" }).then(() => qc.invalidateQueries({ queryKey: ["tropav4-cand"] })).catch(() => {});
  };
  const [editVaga, setEditVaga] = useState(false);
  const [metaVaga, setMetaVaga] = useState("");
  const salvarVagas = async () => {
    try { const { error } = await sb.rpc("salvar_vagas", { p_gerente: gerente, p_meta: Number(metaVaga) || 0 }); if (error) throw error;
      toast.success("Vagas atualizadas."); setEditVaga(false); qc.invalidateQueries({ queryKey: ["tropav4-vagas", gerente] }); }
    catch (e: any) { toast.error(e?.message?.includes("salvar_vagas") || e?.code === "PGRST202" ? "Rode o SQL de vagas no servidor primeiro." : (e?.message ?? "Não consegui salvar.")); }
  };

  // ── Modo Gestão: SLA real (atribuido_em→primeiro_contato_em) + semana × semana (WoW) + churn ──
  const segAtual = getSegunda(new Date());
  const segPassada = new Date(Date.parse(segAtual + "T12:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
  const domPassado = new Date(Date.parse(segAtual + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  const { leads: leadsEq, metricas, vendas: vendasEq } = useDadosEquipe(gerente, segPassada);
  const { data: pastasData } = usePastas(gerente);
  const pastasG = pastasData?.minhas ?? [];
  const [verRaiox, setVerRaiox] = useState<string | null>(null);
  const { data: rendimento } = useQuery({
    queryKey: ["tropav4-rendimento", gerente],
    enabled: !!gerente && modo === "gestao",
    staleTime: 5 * 60_000,
    queryFn: async () => (await sb.rpc("rendimento_equipe", { p_dono: gerente })).data as any[] ?? [],
  });
  // Raio-X por corretor: rampa (5 marcos) + diagnóstico + risco, sobre rendimento_equipe + vendas por nome
  const raiox = useMemo(() => {
    const semana = (ini: string, fim: string) => (c: string) => (vendasEq ?? []).filter((v: any) => v.corretor === c && v.dia >= ini && v.dia <= fim).length;
    const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const vSem = semana(segAtual, hojeStr), vAnt = semana(segPassada, domPassado);
    const vMes = (c: string) => (vendasEq ?? []).filter((v: any) => v.corretor === c).length;
    return (rendimento ?? []).filter((r: any) => r.vinculado).map((r: any) => {
      const ch = chaveNome((r.nome || "").split(" ")[0]);
      const vendas = vMes(ch), wow = vSem(ch) - vAnt(ch);
      const marcos = [((r.plantao_dias ?? 0) > 0), (r.atendidos > 0), (r.visitas > 0), (r.pastas > 0), vendas > 0];
      const feito = marcos.filter(Boolean).length;
      const prox = marcos.indexOf(false); // -1 = tudo feito
      const dsp = r.dias_sem_plantao ?? 0, dias = r.dias_casa ?? 0;
      // diagnóstico por regra
      let diag = "Referência · pode apadrinhar novatos", bom = true;
      if (prox === 0) { diag = `Não vai ao plantão (${dsp}d sem check-in)`; bom = false; }
      else if (prox === 1) { diag = "Não atende os leads que recebe"; bom = false; }
      else if (prox === 2) { diag = "Atende mas não marca visita"; bom = false; }
      else if (prox === 3) { diag = `Travado no marco 4: ${r.visitas} visitas → 0 pastas (documentação Caixa?)`; bom = false; }
      else if (prox === 4) { diag = `${r.pastas} pasta(s) aberta(s), falta fechar a 1ª venda`; bom = false; }
      // risco real (nível, não %)
      let risco: "estavel" | "atencao" | "risco" = "estavel";
      if (dsp >= 10 || (r.visitas > 0 && r.pastas === 0 && dias < 60) || (r.dias_sem_pasta ?? 0) >= 45) risco = "risco";
      else if (dsp >= 5 || (r.dias_sem_pasta ?? 0) >= 25 || (prox >= 0 && dias < 45)) risco = "atencao";
      const nivel = dias < 45 ? `Novato · ${dias}d` : dias < 180 ? "Pleno" : "Sênior";
      return { id: r.id, nome: r.nome || "—", nivel, vendas, wow, pastas: r.pastas, visitas: r.visitas, marcos, feito, diag, bom, risco };
    }).sort((a, b) => ({ risco: 0, atencao: 1, estavel: 2 } as any)[a.risco] - ({ risco: 0, atencao: 1, estavel: 2 } as any)[b.risco] || a.feito - b.feito);
  }, [rendimento, vendasEq, segAtual, segPassada, domPassado]);
  const RISCO: Record<string, [string, string]> = { estavel: ["Estável", "#10B981"], atencao: ["Atenção", "#F59E0B"], risco: ["Risco", "#F43F5E"] };

  // SLA: minutos entre atribuição e 1º contato, nos leads dos últimos 14 dias
  const sla = useMemo(() => {
    const ls = (data?.leads ?? []).filter((l: any) => l.atribuido_em && l.primeiro_contato_em);
    const mins = ls.map((l: any) => (new Date(l.primeiro_contato_em).getTime() - new Date(l.atribuido_em).getTime()) / 60000).filter((m) => m >= 0 && m < 7 * 1440);
    if (!mins.length) return null;
    const media = mins.reduce((s, m) => s + m, 0) / mins.length;
    const dentro = mins.filter((m) => m <= 2).length;
    // por corretor
    const porC = new Map<string, number[]>();
    for (const l of ls) { const a = porC.get(l.broker_id) ?? []; a.push((new Date(l.primeiro_contato_em).getTime() - new Date(l.atribuido_em).getTime()) / 60000); porC.set(l.broker_id, a); }
    const med = [...porC.entries()].map(([id, arr]) => ({ id, m: arr.reduce((s, x) => s + x, 0) / arr.length, n: arr.length })).filter((x) => x.n >= 3).sort((a, b) => a.m - b.m);
    return { media, pctDentro: Math.round((dentro / mins.length) * 100), total: mins.length, melhor: med[0] ?? null, pior: med.length > 1 ? med[med.length - 1] : null };
  }, [data]);
  const nomeBrokerG = (id: string | null) => (data?.brokers ?? []).find((b: any) => b.id === id);
  const fmtSla = (m: number) => m < 1 ? `${Math.round(m * 60)}s` : `${Math.floor(m)}m${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;

  // WoW: leads/contato/visitas/check-ins/pastas/vendas — esta semana × passada
  const wow = useMemo(() => {
    const entre = (d: string, a: string, b: string) => d >= a && d <= b;
    const diaL = (l: LeadH) => new Date(l.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const pagos = (leadsEq ?? []).filter((l) => !["manual_test"].includes((l.source || "")));
    const janela = (a: string, b: string) => {
      const ls = pagos.filter((l) => entre(diaL(l), a, b));
      const ms = (metricas ?? []).filter((m: any) => entre(m.data, a, b));
      return {
        leads: ls.length,
        contato: ls.length ? Math.round((ls.filter((l) => atendido(l as any)).length / ls.length) * 100) : 0,
        visitas: ms.reduce((s: number, m: any) => s + (m.atendimentos || 0), 0),
        checkins: ms.reduce((s: number, m: any) => s + (m.checkins || 0), 0),
        pastas: pastasG.filter((p: any) => p.cadastradaEm && entre(new Date(p.cadastradaEm).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), a, b)).length,
        vendas: (vendasEq ?? []).filter((v: any) => entre(v.dia, a, b)).length,
      };
    };
    const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return { sem: janela(segAtual, hojeStr), ant: janela(segPassada, domPassado) };
  }, [leadsEq, metricas, vendasEq, pastasG, segAtual, segPassada, domPassado]);

  const now = Date.now();
  const sumidos = useMemo(() => (data?.brokers ?? []).filter((b: any) => !b.last_seen_at || now - new Date(b.last_seen_at).getTime() > 20 * 864e5).map((b: any) => ({ id: b.id, nome: [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || "—", visto: b.last_seen_at })), [data, now]);

  const tropa = useMemo(() => {
    const brokers = data?.brokers ?? [];
    const leads = data?.leads ?? [];
    const plMap = data?.plMap ?? new Map();
    const porBroker = new Map<string, any[]>();
    for (const l of leads) if (l.broker_id) { const a = porBroker.get(l.broker_id) ?? []; a.push(l); porBroker.set(l.broker_id, a); }
    return brokers.map((b) => {
      const nome = [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || "—";
      const pl = plMap.get(chaveNome(b.first_name));
      const online = !!b.last_seen_at && now - new Date(b.last_seen_at).getTime() < 15 * 60_000;
      const roleta = b.lead_assignment_enabled !== false;
      const ativos = (porBroker.get(b.id) ?? []).filter((l) => ATIVO.has(l.status ?? ""));
      const contatado = (l: any) => l.last_broker_whatsapp_at && (!l.atribuido_em || new Date(l.last_broker_whatsapp_at) >= new Date(l.atribuido_em));
      const naoContatados = ativos.filter((l) => !contatado(l)).sort((a, b2) => new Date(a.atribuido_em || a.created_at).getTime() - new Date(b2.atribuido_em || b2.created_at).getTime());
      const atendendo = ativos.some((l) => l.last_broker_whatsapp_at && now - new Date(l.last_broker_whatsapp_at).getTime() < 60 * 60_000);
      // lead em andamento = o mais urgente (não contatado mais antigo) OU o último tocado
      const lead = naoContatados[0] ?? ativos.sort((a, b2) => new Date(b2.last_broker_whatsapp_at || b2.created_at).getTime() - new Date(a.last_broker_whatsapp_at || a.created_at).getTime())[0] ?? null;
      let leadInfo: { nome: string; tempoMs: number; contatado: boolean; estourado: boolean } | null = null;
      if (lead) {
        const t0 = new Date(lead.atribuido_em || lead.created_at).getTime();
        const cont = !!contatado(lead);
        const tempoMs = now - (cont ? new Date(lead.last_broker_whatsapp_at).getTime() : t0);
        leadInfo = { nome: lead.name || "Cliente", tempoMs, contatado: cont, estourado: !cont && (now - t0) > 10 * 60_000 };
      }
      return { id: b.id, nome, estande: pl?.estande ?? null, hora: pl?.hora ?? null, plantao: !!pl, online, visto: b.last_seen_at as string | null, roleta, atendendo, lead: leadInfo, naoContatados: naoContatados.length };
    }).sort((a, b) => Number(b.lead?.estourado ?? false) - Number(a.lead?.estourado ?? false) || Number(b.plantao) - Number(a.plantao) || a.nome.localeCompare(b.nome));
  }, [data, now]);

  const casa = (t: typeof tropa[number], f: FT) =>
    f === "todos" ? true : f === "stand" ? t.plantao : f === "pedindo" ? (t.plantao && !t.roleta)
      : f === "atend" ? t.atendendo : f === "livre" ? (t.online && !t.atendendo) : f === "semcheckin" ? !t.plantao : !t.roleta;
  const PILLS: [FT, string][] = [["todos", "Todos"], ["stand", "No stand agora"], ["pedindo", "Pedindo roleta"], ["atend", "Em atendimento"], ["livre", "Livres / online"], ["semcheckin", "Sem check-in"], ["pausado", "Pausados"]];
  const filtrada = tropa.filter((t) => casa(t, ft));

  // resumos
  const noStand = tropa.filter((t) => t.plantao).length;
  const online = tropa.filter((t) => t.online).length;
  const atendendo = tropa.filter((t) => t.atendendo).length;
  const naRoleta = tropa.filter((t) => t.roleta).length;
  const pedindo = tropa.filter((t) => t.plantao && !t.roleta).length;
  const pausados = tropa.filter((t) => !t.roleta).length;
  const estourados = tropa.filter((t) => t.lead?.estourado).length;

  // alerta de ociosidade & gargalo: lead estourado + alguém livre/online pra pegar
  const gargalo = useMemo(() => {
    const preso = tropa.filter((t) => t.lead?.estourado).sort((a, b) => (b.lead!.tempoMs) - (a.lead!.tempoMs))[0];
    const livre = tropa.find((t) => t.online && !t.atendendo && t.roleta && (!t.lead || t.lead.contatado));
    return preso ? { preso, livre } : null;
  }, [tropa]);

  const alternar = async (id: string, nome: string, on: boolean) => {
    setOcupado(id);
    try { await definirRecebimento(id, !on); toast.success(`${nome} ${!on ? "entrou na" : "saiu da"} roleta.`); qc.invalidateQueries({ queryKey: ["tropav4", gerente] }); }
    catch (e: any) { toast.error(e?.message ?? "Não consegui mudar."); } finally { setOcupado(null); }
  };

  return (
    <div className={`mgr10 app2 tvx ${mode === "light" ? "tvx-light" : "tvx-dark"}`}>
      <style>{CSS}</style>
      <RailV10 atual={"time" as any} sub={`${tropa.length} corretores`} mode={mode} toggle={toggle} />

      <main className="shell2 tv-main">
        <header className="tv-top">
          <div>
            <h1>Tropa &amp; Plantão <span className="tv-mode">{modo === "plantao" ? "Modo Plantão · tempo real" : modo === "contratacao" ? "Funil de Contratação" : "Gestão & Estratégia"}</span></h1>
            <p>{modo === "plantao" ? "Plantão ao vivo: check-in, ociosidade e o lead que cada corretor está segurando agora." : modo === "contratacao" ? "Esteira de recrutamento: do formulário de contratação até virar corretor." : "SLA real, semana a semana e risco de churn da equipe."}</p>
            <div className="tv-agora">
              <span className="tv-agora-lbl">● Dados de agora:</span>
              <span className="tv-badge"><span className="tv-dot azul" /> <b>{noStand} no stand</b> (check-in C2S)</span>
              <span className="tv-badge"><span className="tv-dot verde" /> <b>{online} logados</b> no CRM</span>
              <span className="tv-badge"><span className="tv-dot ambar" /> <b>{atendendo} em atendimento</b></span>
              {pedindo > 0 && <span className="tv-badge pulso"><span className="tv-dot roxo" /> <b>✋ {pedindo} pedindo roleta</b></span>}
            </div>
          </div>
        </header>

        <div className="tv-modos">
          <button className={`tv-modo${modo === "plantao" ? " on" : ""}`} onClick={() => setModo("plantao")}><span>🛰️</span> Modo Plantão <small>tempo real</small></button>
          <button className={`tv-modo${modo === "contratacao" ? " on" : ""}`} onClick={() => setModo("contratacao")}><span>🧩</span> Funil de Contratação <small>recrutamento</small></button>
          <button className={`tv-modo${modo === "gestao" ? " on" : ""}`} onClick={() => setModo("gestao")}><span>📈</span> Gestão &amp; Estratégia <small>SLA · WoW · churn</small></button>
        </div>

        {modo === "contratacao" ? (
          <>
            {/* capacidade / vagas */}
            <div className="tv-vagas">
              <div className="tv-vagas-tx">
                <b>Capacidade da equipe</b>
                {typeof vagas === "number" && vagas > 0
                  ? <span><b className="tv-mono">{tropa.length}</b> / {vagas} vagas · <b className={tropa.length < vagas ? "verde" : "amb"}>{Math.max(0, vagas - tropa.length)} abertas</b></span>
                  : <span>Defina quantas vagas (posições) a equipe tem para calcular as abertas.</span>}
              </div>
              {typeof vagas === "number" && vagas > 0 && (
                <div className="tv-vagas-bar"><div className="tv-vagas-fill" style={{ width: `${Math.min(100, Math.round((tropa.length / vagas) * 100))}%` }} /></div>
              )}
              {editVaga
                ? <span className="tv-vagas-ed"><input type="number" min={0} value={metaVaga} onChange={(e) => setMetaVaga(e.target.value)} placeholder="vagas" /><button className="tv-garg-b" onClick={salvarVagas}>Salvar</button><button className="tv-act ver" onClick={() => setEditVaga(false)}>✕</button></span>
                : <button className="tv-modo" onClick={() => { setMetaVaga(String(vagas || "")); setEditVaga(true); }}>⚙️ Definir vagas</button>}
            </div>

            {/* funil */}
            <section className="tv-cards">
              <article className="tv-card azul"><div className="tv-card-h"><span>Em contato</span></div><div className="tv-val"><b className="azul">{funil.em_contato}</b><i>candidatos</i></div><div className="tv-card-f">gerente já falando / a chamar</div></article>
              <article className="tv-card roxoC"><div className="tv-card-h"><span>Entrevista</span></div><div className="tv-val"><b className="roxo">{funil.entrevista}</b><i>marcadas</i></div><div className="tv-card-f">com dia, hora e local</div></article>
              <article className="tv-card verde"><div className="tv-card-h"><span>Contratados</span></div><div className="tv-val"><b className="verde">{funil.contratado}</b><i>viraram corretor</i></div><div className="tv-card-f">Comandra acompanha 1º acesso/check-in</div></article>
              <article className="tv-card rose"><div className="tv-card-h"><span>Sem contato +24h</span><span className="tv-tag amb">atenção</span></div><div className="tv-val"><b className={semContato24 ? "rose" : "verde"}>{semContato24}</b><i>candidatos</i></div><div className="tv-card-f">entraram e ninguém chamou ainda</div></article>
            </section>

            <section className="tv-panel">
              <div className="tv-panel-h2"><b>📋 Esteira de contratação</b><Link to="/manager?aba=time" className="tv-act ver" style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}>Entrevistar / contratar na esteira completa →</Link></div>
              <div className="tv-tbl">
                <div className="tv-tr2 tv-th"><span>Candidato</span><span>Origem / região</span><span>Etapa</span><span>Gerente</span><span>Entrou / status</span><span className="r">Ação</span></div>
                {!emEsteira.length ? <div className="tv-vazio">Nenhum candidato em contato ou entrevista agora.</div> : emEsteira.slice(0, 20).map((c) => (
                  <div className={`tv-tr2${parado24(c) ? " alerta" : ""}`} key={c.id}>
                    <span className="tv-corr"><span className="tv-av">{ini2(c.nome ?? "?")}</span><span><b>{c.nome || "Candidato"}</b><small>{c.telefone || ""}</small></span></span>
                    <span className="tv-dim2">{c.campanha || c.formulario || "—"}{c.regiao ? ` · ${c.regiao}` : ""}</span>
                    <span>{c.etapa === "entrevista" ? <em className="tv-b roxoB">entrevista</em> : <em className="tv-b azul">em contato</em>}</span>
                    <span className="tv-dim2">{c.gerente || "—"}</span>
                    <span className="tv-dim2">{parado24(c) ? <b className="tv-red">🚨 {Math.round((Date.now() - new Date(c.criado_em).getTime()) / 36e5)}h sem chamar</b> : c.etapa === "entrevista" && c.entrevista_em ? `entrevista ${hhmm(c.entrevista_em)}${c.entrevista_local ? ` · ${c.entrevista_local}` : ""}` : `entrou há ${Math.round((Date.now() - new Date(c.criado_em).getTime()) / 36e5)}h`}</span>
                    <span className="r"><button className="tv-rol on" onClick={() => chamarCand(c)}>📲 Chamar</button></span>
                  </div>
                ))}
              </div>
            </section>
            <p className="tv-nota">Fonte real: formulário de contratação → roleta de gerentes → esteira (em contato · entrevista · contratado · não seguiu). O <b>checklist CRECI</b> do mockup ainda não tem campo — fica para depois. Entrevista e contratação (abrem cadastro) ficam na esteira completa.</p>
          </>
        ) : modo === "gestao" ? (
          <>
            {/* SLA real */}
            <section className="tv-cards">
              <article className="tv-card azul">
                <div className="tv-card-h"><span>SLA médio de 1º contato</span><span className="tv-tag">14 dias</span></div>
                <div className="tv-val"><b className={sla && sla.media <= 2 ? "verde" : "amb"}>{sla ? fmtSla(sla.media) : "—"}</b><i>atribuição → toque</i></div>
                <div className="tv-card-f">{sla ? <>{sla.pctDentro}% dentro da meta (&lt;2min) · {sla.total} leads</> : "sem leads com 1º contato ainda"}</div>
              </article>
              <article className="tv-card verde">
                <div className="tv-card-h"><span>Mais rápido</span></div>
                <div className="tv-val"><b className="verde">{sla?.melhor ? fmtSla(sla.melhor.m) : "—"}</b></div>
                <div className="tv-card-f">{sla?.melhor ? `${nomeBrokerG(sla.melhor.id)?.first_name ?? "—"} · ${sla.melhor.n} leads` : "—"}</div>
              </article>
              <article className="tv-card rose">
                <div className="tv-card-h"><span>Mais lento</span><span className="tv-tag amb">cobrar</span></div>
                <div className="tv-val"><b className="rose">{sla?.pior ? fmtSla(sla.pior.m) : "—"}</b></div>
                <div className="tv-card-f">{sla?.pior ? `${nomeBrokerG(sla.pior.id)?.first_name ?? "—"} · ${sla.pior.n} leads` : "—"}</div>
              </article>
              <article className="tv-card roxoC">
                <div className="tv-card-h"><span>Churn / sumidos</span><span className="tv-tag amb">risco</span></div>
                <div className="tv-val"><b className={sumidos.length ? "rose" : "verde"}>{sumidos.length}</b><i>corretores</i></div>
                <div className="tv-card-f">sem acessar o Comandra há +20 dias</div>
              </article>
            </section>

            {/* WoW: esta semana × passada */}
            <section className="tv-panel">
              <div className="tv-panel-h2"><b>📊 Esta semana × semana passada</b><span style={{ fontSize: 12, color: "var(--tm)" }}>seg → hoje vs. semana anterior inteira</span></div>
              <div className="tv-wow">
                {([["Leads", wow.sem.leads, wow.ant.leads], ["Com contato", wow.sem.contato, wow.ant.contato, "%"], ["Visitas", wow.sem.visitas, wow.ant.visitas], ["Check-ins", wow.sem.checkins, wow.ant.checkins], ["Pastas", wow.sem.pastas, wow.ant.pastas], ["Vendas", wow.sem.vendas, wow.ant.vendas]] as [string, number, number, string?][]).map(([k, a, b, suf]) => {
                  const d = b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0;
                  return (
                    <div className="tv-wcol" key={k}>
                      <span className="tv-wk">{k}</span>
                      <div className="tv-wn"><b>{a}{suf || ""}</b> <i>/ {b}{suf || ""}</i></div>
                      <span className={`tv-wd ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(d)}%</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Raio-X por corretor: rampa + diagnóstico + risco + Ver Raio-X */}
            <section className="tv-panel" style={{ marginTop: 16 }}>
              <div className="tv-panel-h2"><b>📈 Raio-X de pessoas &amp; rampa por corretor</b><span style={{ fontSize: 12, color: "var(--tm)" }}>identifique o gargalo antes de virar desligamento</span></div>
              <div className="tv-tbl">
                <div className="tv-rx tv-th"><span>Corretor</span><span>Produção</span><span>Rampa (5 marcos)</span><span>Diagnóstico do copiloto</span><span>Risco</span><span className="r">Ações</span></div>
                {!raiox.length ? <div className="tv-vazio">Sem corretores vinculados para o raio-x.</div> : raiox.map((c) => (
                  <div className="tv-rx" key={c.id}>
                    <span className="tv-corr"><span className="tv-av">{ini2(c.nome)}</span><span><b>{c.nome}</b><small>{c.nivel}</small></span></span>
                    <span className="tv-dim2"><b className={c.wow > 0 ? "verde" : ""} style={{ fontFamily: '"JetBrains Mono",monospace' }}>{c.vendas} venda{c.vendas !== 1 ? "s" : ""}</b>{c.wow !== 0 && <small style={{ color: c.wow > 0 ? "#10B981" : "#F43F5E" }}> ({c.wow > 0 ? "+" : ""}{c.wow} WoW)</small>}<br /><small>{c.pastas} pastas · {c.visitas} visitas</small></span>
                    <span className="tv-rampa">{c.marcos.map((ok, i) => <span key={i} className={`tv-marco${ok ? " ok" : i === c.feito ? " atual" : ""}`}>{i + 1}</span>)}</span>
                    <span className="tv-dim2" style={{ color: c.bom ? "#10B981" : "#F59E0B", whiteSpace: "normal" }}>{c.diag}</span>
                    <span><em className="tv-b" style={{ color: RISCO[c.risco][1], background: `${RISCO[c.risco][1]}22` }}>{RISCO[c.risco][0]}</em></span>
                    <span className="r"><button className="tv-rol on" onClick={() => setVerRaiox(c.id)}>🔍 Ver Raio-X</button></span>
                  </div>
                ))}
              </div>
            </section>

            {sumidos.length > 0 && (
              <section className="tv-panel" style={{ marginTop: 16 }}>
                <div className="tv-panel-h2"><b>🚪 Em risco de churn (sem acesso há +20 dias)</b></div>
                <div className="tv-tbl">
                  {sumidos.slice(0, 12).map((s) => (
                    <div className="tv-tr2" key={s.id} style={{ gridTemplateColumns: "minmax(0,1.5fr) 1fr auto" }}>
                      <span className="tv-corr"><span className="tv-av">{ini2(s.nome)}</span><b>{s.nome}</b></span>
                      <span className="tv-dim2">{s.visto ? `visto há ${haCurto(now - new Date(s.visto).getTime())}` : "nunca entrou"}</span>
                      <span className="r"><button className="tv-act ver" onClick={() => setVerRaiox(s.id)} title="Ver os leads e repassar">👁️</button></span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <p className="tv-nota">SLA = minutos entre o lead cair no corretor (atribuição) e o 1º contato real (dado dos últimos 14 dias). Semana comercial seg→dom; nada estimado. <b>Rampa de novos</b> (1º plantão/lead/visita/pasta/venda por corretor) fica na aba <Link to="/manager?aba=time">Tropa &amp; presença</Link>, que já tem.</p>
          </>
        ) : (<>

        {/* 4 top cards */}
        <section className="tv-cards">
          <article className="tv-card azul">
            <div className="tv-card-h"><span>Presença no stand</span><span className="tv-tag">C2S</span></div>
            <div className="tv-val"><b className="azul">{noStand}</b><i>/ {tropa.length} corretores</i></div>
            <div className="tv-card-f">check-in físico confirmado hoje</div>
          </article>
          <article className="tv-card verde">
            <div className="tv-card-h"><span>Roleta de leads hoje</span><span className="tv-tag">{naRoleta} ativos</span></div>
            <div className="tv-val"><b className="verde">{naRoleta}</b><i>recebendo</i></div>
            <div className="tv-card-f">{pedindo > 0 ? <b className="roxo">✋ {pedindo} pedindo</b> : "ninguém pedindo"} · {pausados} pausados</div>
          </article>
          <article className="tv-card rose">
            <div className="tv-card-h"><span>SLA estourado agora</span><span className="tv-tag amb">atenção</span></div>
            <div className="tv-val"><b className={estourados ? "rose" : "verde"}>{estourados}</b><i>leads</i></div>
            <div className="tv-card-f">leads atribuídos sem 1º contato há +10 min</div>
          </article>
          <article className="tv-card roxoC">
            <div className="tv-card-h"><span>Em atendimento</span><span className="tv-tag">ao vivo</span></div>
            <div className="tv-val"><b className="roxo">{atendendo}</b><i>em conversa</i></div>
            <div className="tv-card-f">corretores que tocaram um lead na última hora</div>
          </article>
        </section>

        {/* alerta de ociosidade & gargalo */}
        {gargalo && (
          <div className="tv-gargalo">
            <span className="tv-garg-ic">🧭</span>
            <div className="tv-garg-tx">
              <b>Alerta de ociosidade &amp; gargalo</b>
              <span><b>{gargalo.preso.nome}</b> está segurando o lead <b>{gargalo.preso.lead!.nome}</b> há <b className="tv-red">{mmss(gargalo.preso.lead!.tempoMs)}</b> sem 1º contato.
                {gargalo.livre && <> Enquanto isso, <b>{gargalo.livre.nome}</b> está online e livre no momento.</>}</span>
            </div>
            <button className="tv-garg-b" onClick={() => alternar(gargalo.preso.id, gargalo.preso.nome, gargalo.preso.roleta)}>Cobrar / pausar {gargalo.preso.nome.split(" ")[0]}</button>
          </div>
        )}

        {/* pílulas */}
        <div className="tv-pills">
          {PILLS.map(([f, lb]) => { const n = tropa.filter((t) => casa(t, f)).length; return <button key={f} className={`tv-pill${ft === f ? " on" : ""}`} onClick={() => setFt(f)}>{lb} <i>{n}</i></button>; })}
        </div>

        {/* tabela */}
        <section className="tv-panel">
          <div className="tv-tbl">
            <div className="tv-tr tv-th">
              <span>Corretor &amp; stand</span><span>Presença (C2S)</span><span>Status digital</span><span>Lead em andamento &amp; tempo</span><span>Roleta</span><span className="r">Ações</span>
            </div>
            {!filtrada.length ? <div className="tv-vazio">Nenhum corretor neste filtro.</div> : filtrada.map((t) => (
              <div className={`tv-tr${t.lead?.estourado ? " alerta" : ""}`} key={t.id}>
                <span className="tv-corr">
                  <span className="tv-av" style={{ borderColor: t.online ? "#10B981" : "var(--bd)" }}>{ini2(t.nome)}</span>
                  <span><b>{t.nome}</b><small>{t.estande ? `🏢 ${t.estande}` : "sem stand"}</small></span>
                </span>
                <span>{t.plantao ? <em className="tv-b azul">🏢 {hhmm(t.hora)} · OK</em> : <em className="tv-b cinza">✕ sem check-in</em>}</span>
                <span>{t.atendendo ? <em className="tv-b ambar">💬 em atendimento</em> : t.online ? <em className="tv-b verde">🟢 online / livre</em> : <em className="tv-b vermelho">🔴 offline{t.visto ? ` · há ${haCurto(now - new Date(t.visto).getTime())}` : ""}</em>}</span>
                <span className="tv-lead">
                  {t.lead ? <>
                    <b>{t.lead.nome}</b>
                    <small className={t.lead.estourado ? "tv-red" : t.lead.contatado ? "tv-ok" : "tv-amb"}>
                      {t.lead.estourado ? `🚨 ${mmss(t.lead.tempoMs)} sem 1º contato` : t.lead.contatado ? `✓ há ${mmss(t.lead.tempoMs)} no contato` : `⏳ ${mmss(t.lead.tempoMs)} esperando 1º toque`}
                    </small>
                  </> : <small className="tv-dim">sem lead ativo{t.plantao ? " · pronto p/ receber" : ""}</small>}
                </span>
                <span>
                  <button className={`tv-rol${t.roleta ? " on" : " off"}`} disabled={ocupado === t.id} onClick={() => alternar(t.id, t.nome, t.roleta)}>{t.roleta ? "● Na roleta" : "○ Pausado"}</button>
                </span>
                <span className="r tv-acts">
                  <button className="tv-act ver" onClick={() => setVerRaiox(t.id)} title="Ver os leads e repassar">👁️</button>
                </span>
              </div>
            ))}
          </div>
        </section>

        <p className="tv-nota">SLA médio por corretor e comparação semana a semana (WoW) entram quando a fonte de tempo de resposta estiver ligada — não mostramos número estimado. Para o raio-X de pessoas, use a aba <Link to="/manager?aba=time">Tropa &amp; presença</Link>.</p>
        </>)}
      </main>

      {verRaiox && (() => {
        const g = raiox.find((r) => r.id === verRaiox);
        const t = tropa.find((x) => x.id === verRaiox);
        const nome = g?.nome ?? t?.nome; if (!nome) return null;
        const lista = tropa.map((x) => ({ id: x.id, nome: x.nome }));
        return <RaioXPlantaoDrawer brokerId={verRaiox} nome={nome} stand={t?.estande} vendas={g?.vendas} pastas={g?.pastas} visitas={g?.visitas} diag={g?.diag} corretores={lista} como={como} onClose={() => setVerRaiox(null)} />;
      })()}
    </div>
  );
}

const CSS = `
.tvx.tvx-dark{--cgbg:#070B14;--surf:#0E1626;--card:#131E33;--sub:#192640;--bd:#233558;--bds:#1A2844;--tx:#F8FAFC;--tm:#94A3B8;--td:#64748B}
.tvx.tvx-light{--cgbg:#EEF2F8;--surf:#FFFFFF;--card:#FFFFFF;--sub:#EDF1F7;--bd:#D7DFEC;--bds:#E6ECF4;--tx:#0F1B2D;--tm:#5B6B80;--td:#8A97A8}
.tvx .shell2.tv-main{background:var(--cgbg);color:var(--tx);font-family:Archivo,system-ui,sans-serif;padding:0 32px 90px;zoom:1.08}
.tv-top{position:sticky;top:0;z-index:30;background:var(--cgbg);background:color-mix(in srgb,var(--cgbg) 94%,transparent);backdrop-filter:blur(14px);padding:18px 0 14px;border-bottom:1px solid var(--bd);margin-bottom:20px}
.tv-top h1{font-size:24px;font-weight:900;letter-spacing:-.02em;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tv-mode{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#38BDF8;background:rgba(14,165,233,.14);border:1px solid rgba(14,165,233,.35);padding:3px 10px;border-radius:999px}
.tv-top p{font-size:13px;color:var(--tm);margin-top:3px}
.tv-agora{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px}
.tv-agora-lbl{font-size:12px;color:var(--tm);font-weight:700}
.tv-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;background:var(--surf);border:1px solid var(--bd);color:var(--tx);padding:5px 11px;border-radius:999px}
.tv-badge.pulso{border-color:#A855F7;background:rgba(168,85,247,.16);animation:tvpulse 2.2s infinite}
@keyframes tvpulse{0%,100%{box-shadow:0 0 8px rgba(168,85,247,.3)}50%{box-shadow:0 0 18px rgba(168,85,247,.6)}}
.tv-dot{width:7px;height:7px;border-radius:50%}
.tv-dot.azul{background:#38BDF8;box-shadow:0 0 6px #38BDF8}.tv-dot.verde{background:#10B981;box-shadow:0 0 6px #10B981}.tv-dot.ambar{background:#F59E0B;box-shadow:0 0 6px #F59E0B}.tv-dot.roxo{background:#C084FC;box-shadow:0 0 6px #C084FC}
.azul{color:#38BDF8}.verde{color:#10B981}.rose{color:#F43F5E}.roxo{color:#C084FC}.amb{color:#F59E0B}
.tv-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
.tv-card{background:var(--card);border:1px solid var(--bd);border-radius:14px;border-top-width:3px;padding:15px 17px;display:flex;flex-direction:column;gap:8px;transition:all .2s}
.tv-card:hover{transform:translateY(-2px)}
.tv-card.azul{border-top-color:#38BDF8}.tv-card.verde{border-top-color:#10B981}.tv-card.rose{border-top-color:#F43F5E}.tv-card.roxoC{border-top-color:#A855F7}
.tv-card-h{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--tm)}
.tv-tag{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:var(--sub);color:var(--tm)}
.tv-tag.amb{background:rgba(245,158,11,.16);color:#F59E0B}
.tv-val{display:flex;align-items:baseline;gap:7px;font-family:"JetBrains Mono",monospace}
.tv-val b{font-size:34px;font-weight:900;line-height:1}.tv-val i{font-style:normal;font-size:14px;color:var(--tm);font-weight:700}
.tv-card-f{font-size:11.5px;color:var(--tm)}
.tv-gargalo{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(244,63,94,.1),rgba(245,158,11,.08));border:1px solid rgba(244,63,94,.3);border-radius:14px;padding:14px 18px;margin-bottom:18px}
.tv-garg-ic{font-size:26px;flex:none}
.tv-garg-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.tv-garg-tx b{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#F43F5E}
.tv-garg-tx span{font-size:13.5px;color:var(--tx);line-height:1.45}
.tv-red{color:#F43F5E}
.tvx .tv-garg-b{flex:none;font:inherit;font-size:13px;font-weight:700;padding:9px 15px;border-radius:10px;border:1px solid rgba(244,63,94,.4);background:rgba(244,63,94,.14);color:#F43F5E;cursor:pointer}
.tvx .tv-garg-b:hover{background:#F43F5E;color:#fff}
.tv-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.tvx .tv-pill{font:inherit;font-size:12.5px;font-weight:700;padding:6px 13px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--tm);cursor:pointer;transition:all .15s}
.tvx .tv-pill:hover{color:var(--tx)}
.tvx .tv-pill.on{background:#0EA5E9;border-color:#0EA5E9;color:#fff}
.tv-pill i{font-style:normal;font-weight:800;opacity:.75;margin-left:3px}
.tv-panel{background:var(--card);border:1px solid var(--bd);border-radius:14px;overflow:hidden}
.tv-tbl{display:flex;flex-direction:column}
.tv-tr{display:grid;grid-template-columns:minmax(0,1.3fr) 130px 150px minmax(0,1.5fr) 118px 70px;gap:12px;align-items:center;padding:13px 18px;border-top:1px solid var(--bds);font-size:13.5px;color:var(--tx)}
.tv-th{border:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--tm);font-weight:800;background:color-mix(in srgb,var(--cgbg) 55%,var(--card))}
.tv-tr.alerta{background:rgba(244,63,94,.05)}
.tv-tr .r{text-align:right}
.tv-corr{display:flex;align-items:center;gap:10px;min-width:0}
.tv-corr b{font-size:13.5px;font-weight:700;display:block}.tv-corr small{font-size:11.5px;color:var(--tm)}
.tv-av{width:34px;height:34px;border-radius:50%;background:var(--sub);border:1.5px solid var(--bd);display:grid;place-items:center;font-size:12px;font-weight:800;flex:none;color:var(--tx)}
.tv-b{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:6px}
.tv-b.azul{color:#38BDF8;background:rgba(56,189,248,.14)}.tv-b.verde{color:#10B981;background:rgba(16,185,129,.14)}.tv-b.ambar{color:#F59E0B;background:rgba(245,158,11,.14)}.tv-b.vermelho{color:#F87171;background:rgba(244,63,94,.12)}.tv-b.cinza{color:var(--td)}
.tv-lead b{font-size:13.5px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv-lead small{font-size:11.5px;font-family:"JetBrains Mono",monospace;display:block;margin-top:1px}
.tv-red{color:#F87171;font-weight:700}.tv-ok{color:#10B981}.tv-amb{color:#F59E0B}.tv-dim{color:var(--td);font-size:12px}
.tvx .tv-rol{font:inherit;font-size:11.5px;font-weight:800;padding:6px 11px;border-radius:999px;cursor:pointer;border:1px solid transparent;white-space:nowrap}
.tvx .tv-rol.on{background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.4);color:#10B981}
.tvx .tv-rol.off{background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.3);color:#FDA4AF}
.tvx .tv-rol:disabled{opacity:.5}
.tv-acts{display:inline-flex;gap:5px;justify-content:flex-end}
.tvx .tv-act{display:inline-flex;align-items:center;justify-content:center;min-width:32px;padding:6px 8px;border-radius:8px;border:1px solid var(--bd);background:var(--sub);color:var(--tm);text-decoration:none;font-size:14px}
.tvx .tv-act:hover{color:var(--tx)}
.tv-vazio{padding:24px 18px;font-size:13.5px;color:var(--tm)}
.tv-nota{font-size:12px;color:var(--td);margin-top:14px;line-height:1.5}
.tv-nota a{color:#38BDF8}
.tv-modos{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.tvx .tv-modo{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:13.5px;font-weight:700;padding:11px 16px;border-radius:12px;border:1px solid var(--bd);background:var(--surf);color:var(--tm);cursor:pointer;transition:all .15s}
.tvx .tv-modo small{font-weight:600;font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.04em}
.tvx .tv-modo:hover{color:var(--tx)}
.tvx .tv-modo.on{background:#0EA5E9;border-color:#0EA5E9;color:#fff}.tvx .tv-modo.on small{opacity:.85}
.tv-vagas{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:15px 18px;margin-bottom:18px}
.tv-vagas-tx{display:flex;flex-direction:column;gap:2px}.tv-vagas-tx>b{font-size:14px;font-weight:800}.tv-vagas-tx span{font-size:13px;color:var(--tm)}
.tv-vagas-bar{flex:1;min-width:140px;height:8px;border-radius:999px;background:var(--sub);overflow:hidden}
.tv-vagas-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#10B981,#0EA5E9)}
.tv-vagas-ed{display:inline-flex;align-items:center;gap:6px}
.tv-vagas-ed input{min-height:38px;width:90px;border:1px solid var(--bd);border-radius:9px;background:var(--surf);color:inherit;font:inherit;padding:0 10px}
.tv-mono{font-family:"JetBrains Mono",monospace;font-weight:800}
.tv-panel-h2{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--bd)}.tv-panel-h2 b{font-size:15px;font-weight:800}
.tv-tr2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.1fr) 110px minmax(0,0.9fr) minmax(0,1.2fr) 120px;gap:12px;align-items:center;padding:13px 18px;border-top:1px solid var(--bds);font-size:13.5px;color:var(--tx)}
.tv-tr2.tv-th{border:0}.tv-tr2.alerta{background:rgba(244,63,94,.05)}.tv-tr2 .r{text-align:right}
.tv-dim2{font-size:12.5px;color:var(--tm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv-b.roxoB{color:#C084FC;background:rgba(168,85,247,.16)}
.tv-rx{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) 170px minmax(0,1.5fr) 88px 130px;gap:12px;align-items:center;padding:13px 18px;border-top:1px solid var(--bds);font-size:13px;color:var(--tx)}
.tv-rx.tv-th{border:0}.tv-rx .r{text-align:right}
.tv-rampa{display:flex;align-items:center;gap:5px}
.tv-marco{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;font-family:"JetBrains Mono",monospace;background:var(--sub);color:var(--td);border:1px solid var(--bd);position:relative}
.tv-marco:not(:last-child)::after{content:"";position:absolute;right:-6px;width:5px;height:2px;background:var(--bd)}
.tv-marco.ok{background:#10B981;color:#fff;border-color:#10B981}
.tv-marco.atual{background:#F59E0B;color:#fff;border-color:#F59E0B}
@media(max-width:1100px){.tv-rx{grid-template-columns:1fr auto}.tv-rx>span:nth-child(3),.tv-rx>span:nth-child(4){grid-column:1/-1}}
.tv-wow{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--bd)}
.tv-wcol{background:var(--card);padding:14px 16px;display:flex;flex-direction:column;gap:5px}
.tv-wk{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--tm)}
.tv-wn{font-family:"JetBrains Mono",monospace;font-size:19px;font-weight:900}.tv-wn i{font-style:normal;font-size:12px;color:var(--td);font-weight:600}
.tv-wd{font-size:12px;font-weight:800;font-family:"JetBrains Mono",monospace;color:var(--tm)}.tv-wd.up{color:#10B981}.tv-wd.down{color:#F43F5E}
@media(max-width:900px){.tv-wow{grid-template-columns:repeat(3,1fr)}}
@media (max-width:1050px){.tvx .shell2.tv-main{padding:0 16px 80px;zoom:1}.tv-cards{grid-template-columns:1fr 1fr}.tv-th{display:none}.tv-tr{grid-template-columns:1fr auto;gap:6px}.tv-corr{grid-column:1/-1}.tv-lead{grid-column:1/-1}}
`;
