/* Hoje do gerente (20/10) — protótipo aprovado pelo Junior:
 * https://claude.ai/artifact/KzREhh55UNxN4f3eCNTVLy (quadro "Proposta final")
 *
 * Responde "o que fazer agora e se a semana está no ritmo", com a semana comercial de segunda a domingo:
 *  1. Alerta de cliente esperando (mesmo visual da faixa de risco de antes)
 *  2. Cartões: vendas do mês, projeção, em fechamento (abre as pastas), plantão hoje, leads sem contato
 *  3. Esta semana × semana passada INTEIRA (barra = quanto já foi feito)
 *  4. Mês semana a semana (gráfico com seletor Leads · Check-ins · Visitas · Pastas · Vendas) + o que fazer
 *  5. Funil do período (5 etapas) com a maior perda
 *  6. Quem recebe lead: roleta (liga/desliga) + fila por formulário
 * Regras: "atendido/sem contato/esperando" = src/lib/situacaoLead.ts (mesma do Time e do Leads);
 * nada estimado; mês compara com mês, semana com semana. Substitui o CockpitGerenteV3 na aba Tempo real.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useManagerV10, diasUteisRestantes } from "@/hooks/useManagerV10";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { buscarPlantao } from "@/utils/c2sMatching";
import { chaveNome, chaveGerente, gerenteC2S } from "@/hooks/useDiretoria";
import { usePastas } from "@/hooks/usePastas";
import { usePeriodo, diaSP, getSegunda } from "@/hooks/usePeriodo";
import SeletorPeriodo from "@/components/manager-v10/SeletorPeriodo";
import FilasFormulario from "@/components/leads/FilasFormulario";
import { atendido, esperando, ehTeste, ehPescado } from "@/lib/situacaoLead";

type LeadH = {
  id: string; name: string | null; status: string | null; source: string | null; broker_id: string | null;
  created_at: string; last_broker_whatsapp_at: string | null; last_lead_response_at: string | null;
  last_interaction_at: string | null; contact_attempts: number | null;
  fb_campaign?: string | null; tag?: string | null;
};
type Origem = "anuncio" | "disparo" | "pescado" | "outro" | "plantao" | "sem";
const ORIGENS: { k: Origem; nome: string; cor: string }[] = [
  { k: "anuncio", nome: "Anúncio", cor: "#1F5C9E" },
  { k: "disparo", nome: "Disparo", cor: "#0E7C7B" },
  { k: "pescado", nome: "Pescaria", cor: "#B7791F" },
  { k: "outro", nome: "Outros", cor: "#7B8BA3" },
  { k: "plantao", nome: "Plantão C2S", cor: "#2A3E5C" },
  { k: "sem", nome: "Origem não identificada", cor: "#C9D2DE" },
];
/** de onde veio o lead: anúncio, disparo, pescaria ou outro (secretária, indicação, manual…) */
function origemDe(l: { source?: string | null; fb_campaign?: string | null; tag?: string | null }): Origem {
  const src = (l.source ?? "").toLowerCase();
  const tag = (l.fb_campaign ?? l.tag ?? "").toUpperCase();
  if (src.startsWith("disparo") || src === "wa_oficial" || src === "campaign" || tag.startsWith("DISPARO") || tag === "BASE OFICIAL") return "disparo";
  if (src === "cold_pool") return "pescado";
  if (src.startsWith("facebook") || src.startsWith("fb") || src.startsWith("google") || src.startsWith("tiktok") || src === "instagram") return "anuncio";
  return "outro";
}
const chaveCliente = (n: string | null | undefined) => (n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1).slice(0, 2).join(" ");
type Metrica = "leads" | "checkins" | "visitas" | "pastas" | "vendas";

const nf = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const somaDias = (dia: string, n: number) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ENCERRADO = new Set(["CONCLUDED", "EXCLUDED", "ABANDONED"]);
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function HojeGerente({ managerId }: { managerId: string }) {
  const qc = useQueryClient();
  const { data: v10 } = useManagerV10(managerId);
  const { data: pastasData } = usePastas(managerId);
  const { periodo: per } = usePeriodo();
  const [metrica, setMetrica] = useState<Metrica>("leads");
  const [verPastas, setVerPastas] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const hoje = diaSP(new Date());
  const segAtual = getSegunda(new Date());
  const segPassada = somaDias(segAtual, -7);
  const domPassado = somaDias(segAtual, -1);
  const iniMes = hoje.slice(0, 8) + "01";
  const segIniMes = getSegunda(new Date(iniMes + "T12:00:00Z"));
  // desde a 1ª segunda da 1ª semana do mês (ou da semana passada, se for antes)
  const desde = [segIniMes, segPassada, per.de].sort()[0];
  const diasParaFechar = 7 - (new Date(hoje + "T12:00:00Z").getUTCDay() || 7);

  // ── leads da equipe (manager_id ou corretor da equipe) ──
  const { data: leads = [] } = useQuery<LeadH[]>({
    queryKey: ["hoje-leads", managerId, desde],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: bs } = await supabase.from("profiles").select("id").eq("manager_id", managerId).eq("role", "BROKER");
      const ids = (bs ?? []).map((b: any) => b.id);
      const out: LeadH[] = [];
      for (let a = 0; ; a += 1000) {
        let q = supabase.from("leads")
          .select("id,name,status,source,broker_id,created_at,last_broker_whatsapp_at,last_lead_response_at,last_interaction_at,contact_attempts,fb_campaign,tag")
          .gte("created_at", `${desde}T03:00:00Z`).neq("status", "EXCLUDED");
        q = ids.length ? q.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : q.eq("manager_id", managerId);
        const { data, error } = await q.order("created_at", { ascending: false }).range(a, a + 999);
        if (error) throw error;
        out.push(...((data ?? []) as LeadH[]));
        if (!data || data.length < 1000) break;
      }
      return out.filter((l) => !ehTeste(l));
    },
  });

  // ── origem por cliente (para pastas e vendas do Junix, que só trazem o nome) e visitas marcadas "Veio" ──
  const { data: origens } = useQuery({
    queryKey: ["hoje-origens", managerId, desde],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: bs } = await supabase.from("profiles").select("id").eq("manager_id", managerId).eq("role", "BROKER");
      const ids = (bs ?? []).map((b: any) => b.id);
      const corte = new Date(Date.now() - 200 * 864e5).toISOString();
      const porNome = new Map<string, Origem>();
      const porId = new Map<string, Origem>();
      for (let a = 0; ; a += 1000) {
        let q = supabase.from("leads").select("id,name,source,fb_campaign,tag").gte("created_at", corte);
        q = ids.length ? q.or(`manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`) : q.eq("manager_id", managerId);
        const { data } = await q.range(a, a + 999);
        for (const l of (data ?? []) as any[]) {
          const o = origemDe(l);
          porId.set(l.id, o);
          const k = chaveCliente(l.name);
          if (k && !porNome.has(k)) porNome.set(k, o);
        }
        if (!data || data.length < 1000) break;
      }
      // visita registrada no Comandra: o corretor marcou a fase "Veio" no painel
      const { data: notas } = await supabase.from("lead_notes").select("lead_id,created_at").eq("content", "Fase · Veio").gte("created_at", `${desde}T03:00:00Z`).limit(2000);
      const visitas = ((notas ?? []) as any[]).filter((n) => porId.has(n.lead_id)).map((n) => ({ dia: diaSP(new Date(n.created_at)), origem: porId.get(n.lead_id) as Origem }));
      return { porNome, visitas };
    },
  });

  // ── plantão (C2S): check-ins e visitas por dia ──
  const { data: metricas = [] } = useQuery({
    queryKey: ["hoje-metricas", managerId, desde],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: eu } = await supabase.from("cury_pessoas").select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId).maybeSingle();
      const gid = (eu as any)?.cury_id;
      if (!gid) return [] as { data: string; checkins: number; atendimentos: number }[];
      const { data } = await supabase.from("cury_metricas_diarias").select("data,checkins,atendimentos")
        .eq("escopo", "corretor").eq("gerente_cury_id", gid).gte("data", desde);
      return (data ?? []) as { data: string; checkins: number; atendimentos: number }[];
    },
  });
  const { data: plantaoHoje } = useQuery({
    queryKey: ["hoje-plantao", managerId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: ger }, plantao] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", managerId).maybeSingle(),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => [] as any[]),
      ]);
      const kg = chaveGerente((ger as any)?.first_name);
      const daEquipe = (plantao as any[]).filter((r) => r.created_at?.slice(0, 10) >= hoje && chaveGerente(gerenteC2S(r.gerente)) === kg);
      return { chaves: new Set(daEquipe.map((r) => chaveNome(r.corretor))), total: new Set(daEquipe.map((r) => chaveNome(r.corretor))).size };
    },
  });

  // ── vendas confirmadas no Junix (corretores da equipe), desde o início da 1ª semana do mês ──
  const brokers = v10?.brokers ?? [];
  const { data: vendas = [] } = useQuery({
    queryKey: ["hoje-vendas", managerId, desde, brokers.length],
    enabled: brokers.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("junix_vendas" as any).select("corretor,data_venda,vgv,fora_do_placar").gte("data_venda", desde);
      const chaves = new Set(brokers.map((b) => chaveNome(b.first_name)));
      return ((data ?? []) as any[]).filter((v) => !v.fora_do_placar && chaves.has(chaveNome(String(v.corretor ?? "").split(" ")[0])))
        .map((v) => ({ dia: String(v.data_venda).slice(0, 10), vgv: Number(v.vgv) || 0 }));
    },
  });

  const pagos = useMemo(() => leads.filter((l) => !ehPescado(l)), [leads]);
  const diaL = (l: LeadH) => diaSP(new Date(l.created_at));
  const entre = (d: string, a: string, b: string) => d >= a && d <= b;
  const pastas = pastasData?.minhas ?? [];

  // ── números por janela (semana atual, semana passada, mês, período do seletor) ──
  const janela = (a: string, b: string) => {
    const ls = pagos.filter((l) => entre(diaL(l), a, b));
    const ms = metricas.filter((m) => entre(m.data, a, b));
    return {
      leads: ls.length,
      contato: ls.length ? Math.round((ls.filter((l) => atendido(l)).length / ls.length) * 100) : 0,
      atendidos: ls.filter((l) => atendido(l)).length,
      visitas: ms.reduce((s, m) => s + (m.atendimentos || 0), 0),
      checkins: ms.reduce((s, m) => s + (m.checkins || 0), 0),
      pastas: pastas.filter((p) => p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm)), a, b)).length,
      vendas: vendas.filter((v) => entre(v.dia, a, b)).length,
    };
  };
  const sem = janela(segAtual, hoje);
  const semAnt = janela(segPassada, domPassado);
  const doPer = janela(per.de, per.ate);
  const doMes = janela(iniMes, hoje);
  // Funil: com Hoje/Ontem o dia ainda tem pouco lead (de manhã fica tudo zero) — mostra o mês
  const funilDoMes = per.de === per.ate;
  const doFunil = funilDoMes ? doMes : doPer;

  // ── mês ──
  const meta = v10?.metaMes ?? null;
  const vendasMes = doMes.vendas;
  const vgvMes = vendas.filter((v) => v.dia >= iniMes).reduce((s, v) => s + v.vgv, 0);
  const d0 = new Date(hoje + "T12:00:00Z");
  const diasNoMes = new Date(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0).getDate();
  const projecao = Math.round((vendasMes / Math.max(1, d0.getUTCDate())) * diasNoMes);
  const restantes = diasUteisRestantes(new Date());
  const porDia = meta && restantes > 0 ? Math.max(0, meta - vendasMes) / restantes : 0;

  // ── em fechamento: Laudo/Pré-análise, Proposta e Emissão (antes de Venda Confirmada) ──
  const fechamento = pastas.filter((p) => p.etapaOrdem >= 6 && p.etapaOrdem <= 9).sort((a, b) => b.etapaOrdem - a.etapaOrdem || b.dias - a.dias);
  const provaveis = fechamento.filter((p) => p.etapaOrdem >= 7).length;

  // ── alertas e "o que fazer" ──
  const ativos = pagos.filter((l) => !ENCERRADO.has(l.status ?? ""));
  const esperandoLista = ativos.filter((l) => {
    if (!esperando(l)) return false;
    const h = (Date.now() - new Date(l.last_lead_response_at as string).getTime()) / 3.6e6;
    return h >= 0.5 && h <= 48;
  });
  const maisAntigo = esperandoLista.reduce<LeadH | null>((m, l) => (!m || (l.last_lead_response_at ?? "") < (m.last_lead_response_at ?? "") ? l : m), null);
  const nomeBroker = (id: string | null) => brokers.find((b) => b.id === id)?.first_name ?? "sem corretor";
  const hHoje = pagos.filter((l) => diaL(l) === hoje);
  const hojeSemContato = hHoje.filter((l) => !atendido(l) && Date.now() - new Date(l.created_at).getTime() > 2 * 3.6e6).length;
  const semContatoPer = doPer.leads - doPer.atendidos;
  const inicioHoje = new Date(`${hoje}T03:00:00Z`).getTime();
  const semEntrar = brokers.map((b) => ({
    nome: b.first_name ?? "—",
    n: ativos.filter((l) => l.broker_id === b.id && Date.now() - new Date(l.created_at).getTime() < 2 * 864e5).length,
    visto: b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0,
  })).filter((x) => x.n > 0 && x.visto < inicioHoje).sort((a, b) => b.n - a.n);
  const pastasParadas = pastas.filter((p) => p.etapaOrdem >= 4 && p.etapaOrdem <= 9 && p.dias >= 4);

  // ── mês semana a semana ──
  const semanas = useMemo(() => {
    const out: { ini: string; fim: string }[] = [];
    for (let s = segIniMes; s.slice(0, 7) <= hoje.slice(0, 7) && out.length < 6; s = somaDias(s, 7)) {
      if (somaDias(s, 6) < iniMes) continue;
      out.push({ ini: s, fim: somaDias(s, 6) });
    }
    // completa até o fim do mês (semanas que ainda vão começar)
    while (out.length < 6 && out[out.length - 1] && somaDias(out[out.length - 1].fim, 1).slice(5, 7) === iniMes.slice(5, 7)) {
      const s = somaDias(out[out.length - 1].fim, 1);
      out.push({ ini: s, fim: somaDias(s, 6) });
    }
    return out;
  }, [segIniMes, iniMes, hoje]);
  const ROT: Record<Metrica, string> = { leads: "Leads", checkins: "Check-ins", visitas: "Visitas", pastas: "Pastas", vendas: "Vendas" };
  const origemCliente = (nome: string | null | undefined): Origem => origens?.porNome.get(chaveCliente(nome)) ?? "sem";
  // cada barra: total + pedaços por origem
  const fatias = (a: string, b: string): { total: number; partes: Partial<Record<Origem, number>> } => {
    const partes: Partial<Record<Origem, number>> = {};
    const soma = (o: Origem, n = 1) => { partes[o] = (partes[o] ?? 0) + n; };
    if (metrica === "leads") {
      // lead do Facebook + resposta de disparo que virou lead (pescaria e outros ficam fora)
      for (const l of pagos) if (entre(diaL(l), a, b)) { const o = origemDe(l); if (o === "anuncio" || o === "disparo") soma(o); }
    } else if (metrica === "checkins") {
      const n = metricas.filter((m) => entre(m.data, a, b)).reduce((s, m) => s + (m.checkins || 0), 0);
      if (n) soma("plantao", n);
    } else if (metrica === "visitas") {
      for (const v of origens?.visitas ?? []) if (entre(v.dia, a, b)) soma(v.origem);
      const c2s = metricas.filter((m) => entre(m.data, a, b)).reduce((s, m) => s + (m.atendimentos || 0), 0);
      if (c2s) soma("plantao", c2s);
    } else if (metrica === "pastas") {
      for (const p of pastas) if (p.cadastradaEm && entre(diaSP(new Date(p.cadastradaEm)), a, b)) soma(origemCliente(p.cliente));
    } else {
      // total = vendas confirmadas do Junix; origem pela pasta que virou "Venda Confirmada" na semana
      const total = vendas.filter((v) => entre(v.dia, a, b)).length;
      let conhecidas = 0;
      for (const p of pastas) {
        if (p.etapaOrdem !== 10 || !p.etapaDesde || !entre(diaSP(new Date(p.etapaDesde)), a, b) || conhecidas >= total) continue;
        const o = origemCliente(p.cliente);
        if (o !== "sem") { soma(o); conhecidas++; }
      }
      if (total - conhecidas > 0) soma("sem", total - conhecidas);
    }
    return { total: Object.values(partes).reduce((s, n) => s + (n ?? 0), 0), partes };
  };
  const barras = semanas.map((w, i) => {
    const futura = w.ini > hoje;
    const f = futura ? null : fatias(w.ini, w.fim < hoje ? w.fim : hoje);
    return { ...w, i, v: f ? f.total : null, partes: f?.partes ?? {}, atual: w.ini === segAtual, futura };
  });
  const maxB = Math.max(1, ...barras.map((b) => b.v ?? 0));
  // anúncio e disparo aparecem sempre (mesmo zerados) — é a comparação que o gerente quer ver
  const legenda = ORIGENS.filter((o) => (metrica !== "checkins" && (o.k === "anuncio" || o.k === "disparo")) || barras.some((b) => (b.partes[o.k] ?? 0) > 0));

  // ── roleta ──
  const alternar = async (id: string, nome: string, on: boolean) => {
    setOcupado(id);
    try {
      await definirRecebimento(id, !on);
      toast.success(`${nome} ${!on ? "entrou na" : "saiu da"} roleta (vale até meia-noite).`);
      qc.invalidateQueries({ queryKey: ["v10", managerId] });
      qc.invalidateQueries({ queryKey: ["roleta-hoje", managerId] });
    } catch (e: any) { toast.error(`Não consegui mudar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  };
  const naRoleta = brokers.filter((b) => b.lead_assignment_enabled !== false).length;
  const noPlantao = (nome: string | null) => !!plantaoHoje?.chaves.has(chaveNome(nome));

  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : a > 0 ? 100 : 0);
  const comp: { k: string; a: number; b: number; txt?: (n: number) => string; cor: string }[] = [
    { k: "Leads pagos", a: sem.leads, b: semAnt.leads, cor: "#1F5C9E" },
    { k: "Com contato", a: sem.contato, b: semAnt.contato, txt: (n) => `${n}%`, cor: sem.contato < semAnt.contato ? "#A8322A" : "#1D6B45" },
    { k: "Visitas", a: sem.visitas, b: semAnt.visitas, cor: "#1F5C9E" },
    { k: "Check-ins", a: sem.checkins, b: semAnt.checkins, cor: "#1F5C9E" },
    { k: "Pastas", a: sem.pastas, b: semAnt.pastas, cor: "#1F5C9E" },
    { k: "Vendas", a: sem.vendas, b: semAnt.vendas, cor: "#1D6B45" },
  ];
  const funil = [
    { k: "Leads pagos", v: doFunil.leads },
    { k: "Com contato", v: doFunil.atendidos },
    { k: "Visitas", v: doFunil.visitas },
    { k: "Pastas", v: doFunil.pastas },
    { k: "Vendas", v: doFunil.vendas },
  ];
  const conv = funil.map((f, i) => (i === 0 ? null : funil[i - 1].v > 0 ? Math.round((f.v / funil[i - 1].v) * 100) : null));
  const piorIdx = conv.reduce<number>((m, c, i) => (c != null && (m < 0 || c < (conv[m] ?? 101)) ? i : m), -1);

  return (
    <div className="hj">
      <style>{CSS}</style>

      <header className="hj-top">
        <div>
          <h1>Cockpit da Equipe</h1>
          <p>Semana de {dm(segAtual)} a {dm(somaDias(segAtual, 6))} · <b>{diasParaFechar === 0 ? "a semana fecha hoje à meia-noite" : `faltam ${diasParaFechar} dia${diasParaFechar > 1 ? "s" : ""} para fechar a semana`}</b></p>
        </div>
        <SeletorPeriodo />
      </header>

      {esperandoLista.length > 0 && (
        <div className="hj-alerta">
          <span className="hj-alerta-ico" aria-hidden><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2 0-4-2-6-1 4-4 6-4 12 0 4 3 7 7 7z" /></svg></span>
          <span className="hj-alerta-txt">
            <span><span className="hj-selo">CLIENTE ESPERANDO</span><b>{esperandoLista.length} cliente{esperandoLista.length > 1 ? "s responderam e estão" : " respondeu e está"} sem resposta há +30min</b></span>
            {maisAntigo && <span>O maior atraso atual é de <b className="hj-mono hj-red">{(() => { const m = Math.round((Date.now() - new Date(maisAntigo.last_lead_response_at as string).getTime()) / 60000); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`; })()}</b> com <b>{nomeBroker(maisAntigo.broker_id)}</b>.</span>}
          </span>
          <Link to="/manager/leads" className="hj-alerta-link">Ver {esperandoLista.length} lead{esperandoLista.length > 1 ? "s" : ""}</Link>
        </div>
      )}

      <section className="hj-cards">
        <div className="hj-card destaque">
          <span className="hj-ct">Vendas do mês</span>
          <span className="hj-num"><b>{vendasMes}</b><i>{meta ? `/ ${meta} un` : "un"}</i></span>
          {meta ? <div className="hj-bar"><div style={{ width: `${pct(vendasMes, meta)}%` }} /></div> : null}
          <span className="hj-cs">VGV <b className="hj-mono">{brl(vgvMes)}</b></span>
        </div>
        <div className="hj-card">
          <span className="hj-ct">Projeção do mês</span>
          <span className="hj-num"><b style={{ color: "#8A5200" }}>{projecao}</b><i>vendas</i></span>
          <span className="hj-cs">{meta ? <>Para bater: <span className="hj-mono">{porDia.toFixed(1).replace(".", ",")} un/dia útil</span></> : "sem meta definida no mês"}</span>
        </div>
        <button type="button" className={`hj-card hj-card-btn${verPastas ? " aberto" : ""}`} onClick={() => setVerPastas((v) => !v)} aria-expanded={verPastas}>
          <span className="hj-ct">Em fechamento</span>
          <span className="hj-num"><b style={{ color: "#1D6B45" }}>{fechamento.length}</b><i>pastas</i></span>
          <span className="hj-cs">{provaveis} em proposta ou emissão</span>
          <span className="hj-link">{verPastas ? "Esconder as pastas ▴" : "Ver as pastas ▾"}</span>
        </button>
        <div className="hj-card">
          <span className="hj-ct">Plantão hoje (C2S)</span>
          <span className="hj-num"><b>{plantaoHoje?.total ?? 0}</b><i>check-ins · {brokers.length} no time</i></span>
          <span className="hj-cs">Semana: <b>{sem.checkins} de {semAnt.checkins}</b> · Roleta: {naRoleta}</span>
        </div>
        <div className="hj-card">
          <span className="hj-ct">Leads sem contato</span>
          <span className="hj-num"><b style={{ color: semContatoPer > 0 ? "#A8322A" : "#1D6B45" }}>{nf(semContatoPer)}</b><i>de {nf(doPer.leads)}</i></span>
          <span className="hj-cs">{per.rotulo} · mesmo número do Time e do Leads</span>
        </div>
      </section>

      {verPastas && (
        <section className="hj-box hj-verde">
          <div className="hj-box-top"><h2>Pastas que podem virar venda</h2><Link to="/manager/pastas">Todas as pastas →</Link></div>
          {fechamento.length === 0 ? <p className="hj-mut">Nenhuma pasta em laudo, proposta ou emissão agora.</p> : (
            <div className="hj-tabela"><table>
              <thead><tr><th>Cliente</th><th>Corretor</th><th>Etapa no Junix</th><th>Parada há</th></tr></thead>
              <tbody>{fechamento.slice(0, 15).map((p) => (
                <tr key={p.id}><td><b>{p.cliente}</b></td><td>{p.corretor ?? "—"}</td><td>{p.etapa}</td>
                  <td className="hj-mono" style={{ color: p.dias >= 7 ? "#A8322A" : undefined }}>{p.dias} dia{p.dias === 1 ? "" : "s"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}

      <section className="hj-box">
        <div className="hj-box-top">
          <div><h2>Esta semana × semana passada</h2><p className="hj-mut">Semana de segunda a domingo. A barra é quanto já foi feito do total da semana passada inteira.</p></div>
          <span className="hj-mut">Esta: {dm(segAtual)} → hoje · Passada: {dm(segPassada)} a {dm(domPassado)}</span>
        </div>
        <div className="hj-comp">
          {comp.map((c) => (
            <div key={c.k} className="hj-comp-i">
              <span className="hj-ct">{c.k}</span>
              <span className="hj-mono hj-comp-n" style={{ color: c.cor }}>{c.txt ? c.txt(c.a) : nf(c.a)} <i>/ {c.txt ? c.txt(c.b) : nf(c.b)}</i></span>
              <div className="hj-bar fino"><div style={{ width: `${pct(c.a, c.b)}%`, background: c.cor }} /></div>
            </div>
          ))}
        </div>
      </section>

      <div className="hj-duas">
        <section className="hj-box">
          <div className="hj-box-top"><h2>{NOME_MES[d0.getUTCMonth()][0].toUpperCase() + NOME_MES[d0.getUTCMonth()].slice(1)} semana a semana</h2><span className="hj-mut">segunda a domingo</span></div>
          <div className="hj-seg" role="group" aria-label="O que mostrar no gráfico">
            {(Object.keys(ROT) as Metrica[]).map((k) => (
              <button key={k} type="button" className={metrica === k ? "on" : ""} aria-pressed={metrica === k} onClick={() => setMetrica(k)}>{ROT[k]}</button>
            ))}
          </div>
          <div className="hj-graf" style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
            {barras.map((b) => (
              <div key={b.ini} className="hj-graf-col">
                <span className="hj-mono">{b.v == null ? "—" : nf(b.v)}</span>
                {b.v == null || b.v === 0 ? (
                  <div style={{ height: 2, background: "var(--hj-line)" }} />
                ) : (
                  <div className={`hj-pilha${b.atual ? " atual" : ""}`} style={{ height: Math.max(4, Math.round((b.v / maxB) * 120)) }}
                    title={ORIGENS.filter((o) => b.partes[o.k]).map((o) => `${o.nome}: ${b.partes[o.k]}`).join(" · ")}>
                    {ORIGENS.filter((o) => b.partes[o.k]).map((o) => (
                      <span key={o.k} style={{ flexGrow: b.partes[o.k], background: o.cor }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="hj-graf-rot" style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
            {barras.map((b) => (
              <span key={b.ini}>
                <b>Semana {b.i + 1}</b><i>{dm(b.ini)}–{dm(b.fim)}{b.atual ? " · agora" : ""}</i>
                {metrica !== "checkins" && !b.futura && (
                  <em className="hj-ad"><span style={{ color: "#1F5C9E" }}>Anúncio {b.partes.anuncio ?? 0}</span> · <span style={{ color: "#0E7C7B" }}>Disparo {b.partes.disparo ?? 0}</span></em>
                )}
              </span>
            ))}
          </div>
          {legenda.length > 0 && (
            <div className="hj-leg">
              {legenda.map((o) => {
                const tot = barras.reduce((s, b) => s + (b.partes[o.k] ?? 0), 0);
                return <span key={o.k}><i style={{ background: o.cor }} />{o.nome} <b className="hj-mono">{nf(tot)}</b></span>;
              })}
            </div>
          )}
          {metrica === "visitas" && <p className="hj-mut">Plantão C2S não informa o cliente, por isso fica sem origem. As outras cores são visitas que o corretor marcou como "Veio" no Comandra.</p>}
          {(metrica === "pastas" || metrica === "vendas") && <p className="hj-mut">Origem descoberta pelo nome do cliente no Junix, cruzado com os leads da equipe.</p>}
        </section>

        <section className="hj-box">
          <h2>O que fazer para salvar a semana</h2>
          <div className="hj-acoes">
            {semContatoPer > 0 && (
              <div className="hj-acao laranja"><span><b>{nf(semContatoPer)} leads pagos sem contato</b><i>{hojeSemContato > 0 ? `${hojeSemContato} chegaram hoje e estão há mais de 2h sem falar com ninguém` : per.rotulo}</i></span><Link to="/manager/leads">Ver leads</Link></div>
            )}
            {semEntrar.length > 0 && (
              <div className="hj-acao laranja"><span><b>{semEntrar.length} corretor{semEntrar.length > 1 ? "es" : ""} com lead na mão sem entrar hoje</b><i>{semEntrar.slice(0, 4).map((x) => `${x.nome} (${x.n})`).join(" · ")}</i></span><Link to="/manager?aba=time">Ver equipe</Link></div>
            )}
            {(plantaoHoje?.total ?? 0) === 0 && (
              <div className="hj-acao azul"><span><b>Ninguém bateu ponto no plantão hoje</b><i>Semana passada a equipe teve {semAnt.checkins} check-ins</i></span><Link to="/manager?aba=time">Ver equipe</Link></div>
            )}
            {pastasParadas.length > 0 && (
              <div className="hj-acao azul"><span><b>{pastasParadas.length} pasta{pastasParadas.length > 1 ? "s paradas" : " parada"} há 4 dias ou mais</b><i>Documentação, análise ou proposta sem andar</i></span><Link to="/manager/pastas">Ver pastas</Link></div>
            )}
            {semContatoPer === 0 && semEntrar.length === 0 && (plantaoHoje?.total ?? 0) > 0 && pastasParadas.length === 0 && (
              <p className="hj-mut">Tudo em dia. Nada pendente agora.</p>
            )}
          </div>
        </section>
      </div>

      <section className="hj-box">
        <div className="hj-box-top">
          <div><h2>Funil · {funilDoMes ? NOME_MES[d0.getUTCMonth()] : per.rotulo}</h2><p className="hj-mut">A % é sobre a etapa anterior. Contato pela mesma regra do Time e do Leads.</p></div>
        </div>
        <div className="hj-funil">
          {funil.map((f, i) => (
            <div key={f.k} className={`hj-funil-i${i === piorIdx ? " pior" : ""}${i === 4 ? " fim" : ""}`}>
              <span className="hj-ct">{i + 1} · {f.k}{i === piorIdx ? " · maior perda" : ""}</span>
              <span className="hj-mono hj-comp-n">{nf(f.v)} {conv[i] != null && <i>{conv[i]}%</i>}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="hj-box">
        <div className="hj-box-top">
          <div><h2>Quem recebe lead</h2><p className="hj-mut">Roleta: quem recebe os leads sem fila. Vale até meia-noite; amanhã o plantão liga quem bater ponto.</p></div>
          <span><b className="hj-mono">{naRoleta}</b> de {brokers.length} na roleta</span>
        </div>
        <div className="hj-roleta">
          {brokers.map((b) => {
            const on = b.lead_assignment_enabled !== false;
            return (
              <button key={b.id} type="button" className={`hj-rol${on ? " on" : ""}`} aria-pressed={on} disabled={ocupado === b.id}
                onClick={() => alternar(b.id, b.first_name ?? "Corretor", on)}>
                <b>{b.first_name ?? "—"}</b>
                <i>{on ? "recebe" : "fora"}{noPlantao(b.first_name) ? " · plantão" : ""}</i>
              </button>
            );
          })}
        </div>
        <FilasFormulario />
      </section>
    </div>
  );
}

const CSS = `
.hj{--hj-bg:var(--cv-surface,#fff);--hj-line:var(--cv-border,#E1E6EE);--hj-ink:var(--cv-text,#0F1B2D);--hj-mut:var(--cv-text-muted,#3C4B5F);--hj-soft:var(--cv-surface-alt,#F6F8FB);
  display:flex;flex-direction:column;gap:18px;color:var(--hj-ink);font-family:Archivo,system-ui,sans-serif}
.hj .hj-mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.hj .hj-red{color:#A8322A}
.hj .hj-mut{font-size:13px;color:var(--hj-mut);margin:0}
.hj-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.hj-top h1{margin:0;font-size:28px;font-weight:800}
.hj-top p{margin:6px 0 0;font-size:14px;color:var(--hj-mut)}
.hj-top p b{color:#8A5200}
.hj-alerta{display:flex;align-items:center;gap:18px;padding:16px 22px 16px 18px;border-radius:16px;border:1px solid #EFCFCB;border-left:6px solid #A8322A;background:#F8ECEB;color:#0F1B2D}
.hj-alerta-ico{width:56px;height:56px;border-radius:14px;background:#fff;display:grid;place-items:center;color:#A8322A;flex-shrink:0}
.hj-alerta-txt{flex:1;display:flex;flex-direction:column;gap:6px;font-size:14.5px;color:#3C4B5F}
.hj-alerta-txt b{color:#0F1B2D}
.hj-alerta-txt > span:first-child{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:17px}
.hj-selo{padding:5px 12px;border-radius:6px;background:#A8322A;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em}
.hj-alerta-link{font-size:15px;font-weight:600;color:#0F1B2D !important;white-space:nowrap}
.hj-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
.hj-card{background:var(--hj-bg);border:1px solid var(--hj-line);border-radius:18px;padding:22px 22px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}
.hj-card.destaque{border:2px solid var(--hj-ink)}
.mgr10 button.hj-card-btn{text-align:left;cursor:pointer;font:inherit;color:inherit;background:var(--hj-bg);border:1px solid var(--hj-line)}
.mgr10 button.hj-card-btn.aberto{border:2px solid #1D6B45}
.hj-ct{font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--hj-mut)}
.hj-num{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.hj-num b{font-family:"JetBrains Mono",monospace;font-size:44px;line-height:1}
.hj-num i{font-style:normal;font-family:"JetBrains Mono",monospace;font-size:18px;color:var(--hj-mut)}
.hj-cs{font-size:14px;color:var(--hj-mut)}
.hj-cs b{color:var(--hj-ink)}
.hj-link{font-size:13.5px;font-weight:700;color:#0E7C7B}
.hj-bar{height:10px;border-radius:99px;background:var(--hj-soft);overflow:hidden}
.hj-bar > div{height:100%;border-radius:99px;background:var(--hj-ink)}
.hj-bar.fino{height:8px}
.hj-box{background:var(--hj-bg);border:1px solid var(--hj-line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}
.hj-box.hj-verde{border:2px solid #1D6B45}
.hj-box h2{margin:0;font-size:17px;font-weight:800}
.hj-box-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.hj-box-top a{font-size:13.5px;font-weight:700;color:#0E7C7B}
.hj-comp{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.hj-comp-i{padding:14px;border-radius:12px;background:var(--hj-soft);display:flex;flex-direction:column;gap:8px}
.hj-comp-i .hj-ct{font-size:11.5px;letter-spacing:.1em}
.hj-comp-n{font-size:26px;font-weight:700}
.hj-comp-n i{font-style:normal;font-size:14px;color:var(--hj-mut)}
.hj-duas{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}
.hj-seg{display:flex;gap:4px;padding:4px;border-radius:10px;background:var(--hj-soft);align-self:flex-start;flex-wrap:wrap}
.mgr10 .hj-seg button{min-height:36px;padding:0 14px;border-radius:8px;font-size:13px;font-weight:600;color:var(--hj-mut)}
.mgr10 .hj-seg button.on{background:var(--hj-bg);color:var(--hj-ink);box-shadow:0 1px 2px rgba(15,27,45,.12)}
.hj-graf{display:grid;gap:14px;align-items:end;height:170px;border-bottom:1px solid var(--hj-line)}
.hj-graf-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%}
.hj-graf-col span{font-size:15px;font-weight:700}
.hj-graf-col > div{width:70%;border-radius:6px 6px 0 0}
.hj-graf-rot{display:grid;gap:14px;text-align:center}
.hj-pilha{width:70%;border-radius:6px 6px 0 0;overflow:hidden;display:flex;flex-direction:column-reverse}
.hj-pilha.atual{outline:2px solid #0E7C7B;outline-offset:2px}
.hj-pilha span{display:block;min-height:3px}
.hj-ad{font-style:normal;font-size:11.5px;font-weight:700;margin-top:2px}
.hj-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:12.5px;color:var(--hj-mut)}
.hj-leg span{display:inline-flex;align-items:center;gap:6px}
.hj-leg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.hj-leg b{color:var(--hj-ink)}
.hj-graf-rot span{display:flex;flex-direction:column;gap:1px}
.hj-graf-rot b{font-size:12.5px}
.hj-graf-rot i{font-style:normal;font-size:11.5px;color:var(--hj-mut)}
.hj-acoes{display:flex;flex-direction:column;gap:10px}
.hj-acao{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px}
.hj-acao.laranja{background:#FFF4E3;color:#0F1B2D}
.hj-acao.azul{background:#EEF3F9;color:#0F1B2D}
.hj-acao > span{flex:1;display:flex;flex-direction:column;gap:2px}
.hj-acao b{font-size:14px}
.hj-acao i{font-style:normal;font-size:12.5px;color:#3C4B5F}
.hj-acao a{font-weight:700;font-size:13.5px;color:#0E7C7B;white-space:nowrap}
.hj-funil{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.hj-funil-i{padding:12px;border-radius:10px;background:#EEF3F9;color:#0F1B2D;display:flex;flex-direction:column;gap:4px}
.hj-funil-i .hj-ct{color:#3C4B5F;font-size:11.5px;letter-spacing:.08em}
.hj-funil-i.pior{background:#FBEDEC;border:1px solid #F0C4BF}
.hj-funil-i.pior .hj-ct{color:#A8322A}
.hj-funil-i.fim{background:#E3F1EA}
.hj-funil-i .hj-comp-n i{color:#5B6B80}
.hj-tabela{overflow-x:auto}
.hj-tabela table{width:100%;border-collapse:collapse;font-size:13.5px}
.hj-tabela th{text-align:left;color:var(--hj-mut);font-size:12px;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--hj-line)}
.hj-tabela td{padding:10px;border-bottom:1px solid var(--hj-line)}
.hj-roleta{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.mgr10 button.hj-rol{min-height:56px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;padding:8px 10px;border-radius:10px;text-align:left;border:1px solid var(--hj-line);background:var(--hj-bg);color:var(--hj-ink)}
.mgr10 button.hj-rol.on{border:2px solid #1D6B45;background:rgba(29,107,69,.08)}
.mgr10 button.hj-rol:disabled{opacity:.6}
.hj-rol b{font-size:13.5px}
.hj-rol i{font-style:normal;font-size:12px;font-weight:700;color:var(--hj-mut)}
.hj-rol.on i{color:#1D6B45}
@media (max-width:1100px){.hj-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.hj-comp{grid-template-columns:repeat(3,minmax(0,1fr))}.hj-duas{grid-template-columns:1fr}.hj-funil{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
