// ABA ANÚNCIOS — de onde vem o lead e quanto ele custa.
//
// Regra que manda aqui: **o gerente não mexe em campanha.** Então todo número
// tem que terminar em uma de três coisas — cobrar quem cuida do tráfego, mudar
// onde ele põe o esforço da equipe, ou nada. Número que não leva a uma dessas
// não entra. Por isso CTR, CPM, frequência e criativo ficaram de fora: ele não
// tem acesso ao Meta e não pode agir sobre nenhum deles.
//
// A régua de qualidade é SÓ a taxa de resposta. "Qualificados" e "renda
// preenchida" medem o formulário, não o lead — foi por aí que o time concluiu
// que Butantã era lixo quando respondia igual à Lapa.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AvisoTrafego {
  chave: string;
  tom: "crit" | "warn" | "info";
  titulo: string;
  corpo: string;
  /** o que provavelmente causou — nomeado como hipótese, não diagnóstico */
  hipotese: string;
  /** já escrita, o gerente só revisa e manda */
  mensagem: string;
}

export interface DadosAnuncios {
  /** entrada no período */
  chegaram: number;
  usaveis: number;
  bloqueados: number;
  responderam: number;
  /** R$ jogados fora nos bloqueados */
  perdidoBloqueio: number;
  porDia: { dia: string; n: number }[];
  /** custo por lead, por equipe */
  custo: { equipe: string; cpl: number; eu: boolean }[];
  meuCpl: number | null;
  cplAntes: number | null;
  mediaOutros: number | null;
  campanhas: { nome: string; leads: number; resp: number }[];
  produtos: { nome: string; leads: number; gente: number | null }[];
  capi: { enviados: number; visitas: number; compras: number; erros: number; ultimo: string | null };
  /** visitas e vendas REAIS da Cury, para mostrar o buraco do CAPI */
  visitasReais: number;
  vendasReais: number;
  avisos: AvisoTrafego[];
  gestor: { nome: string; telefone: string } | null;
  dias: number;
}

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const menos = (n: number) => diaSP(new Date(Date.now() - n * 86_400_000));
const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

export function useAnuncios(managerId: string | undefined, dias = 30) {
  return useQuery<DadosAnuncios>({
    queryKey: ["anuncios", managerId, dias],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const de = menos(dias), deAntes = menos(dias * 2);

      const { data: perfil } = await supabase.from("profiles")
        .select("first_name,team_id").eq("id", managerId!).maybeSingle();
      const meuNome = (perfil as any)?.first_name ?? "";

      const { data: euCury } = await supabase.from("cury_pessoas")
        .select("cury_id").eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const gerenteCuryId = (euCury as any)?.cury_id ?? null;

      const [leadsRes, snapRes, capiRes, curyRes, gestorRes, plantaoRes] = await Promise.all([
        supabase.from("leads")
          .select("created_at,geo_status,fb_campaign,product,last_lead_response_at,source,manager_id")
          .gte("created_at", deAntes),
        supabase.from("capi_effect_snapshots")
          .select("snapshot_date,equipe,gasto,leads_fb,cpl,pct_resposta")
          .order("snapshot_date", { ascending: false }).limit(60),
        supabase.from("capi_events_log")
          .select("event_name,status,created_at").order("created_at", { ascending: false }).limit(600),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias").select("atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId).gte("data", de)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("system_settings").select("value")
          .eq("key", `gestor_trafego_${managerId}`).maybeSingle(),
        supabase.from("profiles").select("id").eq("manager_id", managerId!).eq("role", "BROKER"),
      ]);

      const todos = (leadsRes.data ?? []) as any[];

      // ⚠️ Lead bloqueado pelo geo-guard perde o corretor E o gerente: o trigger
      // zera broker_id e o manager_id fica nulo. Filtrar por gerente nunca
      // acharia nenhum. A dona é a CAMPANHA — EQ_DUDU, DUDU_ZS etc.
      const minhaCampanha = (c: string | null) =>
        !!c && c.toUpperCase().includes(meuNome.toUpperCase());
      const meu = (l: any) => l.manager_id === managerId || minhaCampanha(l.fb_campaign);

      const leads = todos.filter(meu);
      const doPeriodo = leads.filter((l) => (l.created_at ?? "") >= de);

      const bloqueados = doPeriodo.filter((l) => l.geo_status === "fora_regiao").length;
      const chegaram = doPeriodo.length;
      const usaveis = chegaram - bloqueados;
      const responderam = doPeriodo.filter((l) => l.last_lead_response_at).length;

      /* ── custo por equipe: a última semana com gasto de cada uma ── */
      const snaps = ((snapRes as any).data ?? []) as any[];
      const porEquipe = new Map<string, any[]>();
      for (const s of snaps) {
        if (!s.equipe || !s.gasto) continue;
        const a = porEquipe.get(s.equipe) ?? []; a.push(s); porEquipe.set(s.equipe, a);
      }
      const custo = [...porEquipe.entries()]
        .map(([equipe, ls]) => ({ equipe, cpl: Number(ls[0].cpl ?? 0),
          eu: equipe.toLowerCase() === meuNome.toLowerCase() }))
        .filter((c) => c.cpl > 0)
        .sort((a, b) => a.cpl - b.cpl);

      const meus = porEquipe.get(
        [...porEquipe.keys()].find((k) => k.toLowerCase() === meuNome.toLowerCase()) ?? "") ?? [];
      const meuCpl = meus[0]?.cpl ? Number(meus[0].cpl) : null;
      const cplAntes = meus[2]?.cpl ? Number(meus[2].cpl) : null;   // ~3 semanas atrás
      const outros = custo.filter((c) => !c.eu);
      const mediaOutros = outros.length
        ? outros.reduce((a, c) => a + c.cpl, 0) / outros.length : null;

      /* ── campanhas pela taxa de RESPOSTA, que é o sinal limpo ── */
      const camp = new Map<string, { leads: number; resp: number }>();
      for (const l of doPeriodo) {
        const k = l.fb_campaign || "sem campanha";
        const c = camp.get(k) ?? { leads: 0, resp: 0 };
        c.leads += 1; if (l.last_lead_response_at) c.resp += 1;
        camp.set(k, c);
      }
      const campanhas = [...camp.entries()]
        .map(([nome, c]) => ({ nome, leads: c.leads, resp: c.leads ? Math.round((c.resp / c.leads) * 100) : 0 }))
        .filter((c) => c.leads >= 3)
        .sort((a, b) => b.resp - a.resp);

      /* ── por empreendimento ── */
      const prod = new Map<string, number>();
      for (const l of doPeriodo) prod.set(l.product || "sem produto", (prod.get(l.product || "sem produto") ?? 0) + 1);
      const produtos = [...prod.entries()].map(([nome, leads]) => ({ nome, leads, gente: null }))
        .sort((a, b) => b.leads - a.leads).slice(0, 6);

      /* ── entrada por dia ── */
      const dd = new Map<string, number>();
      for (let i = dias - 1; i >= 0; i--) dd.set(menos(i), 0);
      for (const l of doPeriodo) {
        const d = (l.created_at ?? "").slice(0, 10);
        if (dd.has(d)) dd.set(d, (dd.get(d) ?? 0) + 1);
      }
      const porDia = [...dd.entries()].map(([dia, n]) => ({ dia, n }));

      /* ── CAPI ── */
      const ev = ((capiRes as any).data ?? []) as any[];
      const capi = {
        enviados: ev.filter((e) => e.status === "sent").length,
        visitas: ev.filter((e) => e.event_name === "Visita" && e.status === "sent").length,
        compras: ev.filter((e) => e.event_name === "Purchase" && e.status === "sent").length,
        erros: ev.filter((e) => e.status === "error").length,
        ultimo: ev[0]?.created_at ?? null,
      };
      const cury = ((curyRes as any).data ?? []) as any[];
      const visitasReais = cury.reduce((a, c) => a + (c.atendimentos ?? 0), 0);
      const vendasReais = cury.reduce((a, c) => a + (c.vendas ?? 0), 0);

      /* ── quanto custou o lead que foi bloqueado ── */
      const perdidoBloqueio = meuCpl ? bloqueados * meuCpl : 0;

      /* ── contato do gestor ── */
      let gestor: { nome: string; telefone: string } | null = null;
      try {
        const v = (gestorRes as any)?.data?.value;
        if (v) gestor = typeof v === "string" ? JSON.parse(v) : v;
      } catch { /* valor mal formado no banco não pode derrubar a tela */ }

      const chegaramAntes = leads.filter((l) =>
        (l.created_at ?? "") >= deAntes && (l.created_at ?? "") < de).length;

      return {
        chegaram, usaveis, bloqueados, responderam, perdidoBloqueio, porDia,
        custo, meuCpl, cplAntes, mediaOutros, campanhas, produtos,
        capi, visitasReais, vendasReais,
        avisos: montarAvisos({
          meuNome, gestor, chegaram, chegaramAntes, bloqueados, perdidoBloqueio,
          meuCpl, cplAntes, mediaOutros, campanhas, dias,
        }),
        gestor, dias,
      };
    },
  });
}

function montarAvisos(x: {
  meuNome: string; gestor: { nome: string } | null;
  chegaram: number; chegaramAntes: number; bloqueados: number; perdidoBloqueio: number;
  meuCpl: number | null; cplAntes: number | null; mediaOutros: number | null;
  campanhas: { nome: string; leads: number; resp: number }[]; dias: number;
}): AvisoTrafego[] {
  const out: AvisoTrafego[] = [];
  const oi = x.gestor?.nome ? `Oi ${x.gestor.nome.split(" ")[0]}` : "Oi";
  const eu = x.meuNome ? `, aqui é o ${x.meuNome}` : "";

  // parou de entrar
  if (x.chegaramAntes >= 10 && x.chegaram < x.chegaramAntes * 0.5) {
    out.push({ chave: "parou", tom: "crit", titulo: "Parou de entrar lead",
      corpo: `Você recebeu ${x.chegaram} leads nos últimos ${x.dias} dias. No período anterior eram ${x.chegaramAntes}.`,
      hipotese: "Campanha pausada, verba acabada, ou o formulário parou de entregar.",
      mensagem: `${oi}${eu}. Minha entrada de lead caiu muito: foram ${x.chegaram} leads nos últimos ${x.dias} dias, contra ${x.chegaramAntes} no período anterior. Consegue ver se a campanha está rodando?` });
  }

  // lead caro contra as outras equipes
  if (x.meuCpl && x.mediaOutros && x.meuCpl > x.mediaOutros * 1.4) {
    out.push({ chave: "caro", tom: "crit", titulo: "Seu lead está caro",
      corpo: `Você paga ${brl(x.meuCpl)} por lead. A média das outras equipes é ${brl(x.mediaOutros)}.`,
      hipotese: "Público pequeno demais, ou disputa alta no mesmo público.",
      mensagem: `${oi}${eu}. Meu custo por lead está em ${brl(x.meuCpl)}, e as outras equipes estão pagando em média ${brl(x.mediaOutros)}. Dá pra olhar o público da minha campanha?` });
  }

  // custo subindo — o sintoma é medido, a causa é hipótese
  if (x.meuCpl && x.cplAntes && x.meuCpl > x.cplAntes * 1.3) {
    const pct = Math.round(((x.meuCpl - x.cplAntes) / x.cplAntes) * 100);
    out.push({ chave: "subindo", tom: "warn", titulo: `O custo subiu ${pct}% em três semanas`,
      corpo: `Era ${brl(x.cplAntes)} há três semanas, agora está em ${brl(x.meuCpl)}.`,
      hipotese: "Custo subindo semana após semana costuma ser criativo cansado ou público saturado. Quem confirma é você — eu só vejo o custo.",
      mensagem: `${oi}${eu}. O custo do meu lead subiu de ${brl(x.cplAntes)} pra ${brl(x.meuCpl)} em três semanas. Pode ser criativo cansado? Vale trocar a peça ou abrir o público?` });
  }

  // DDD de fora: o número principal mente sem isso
  if (x.bloqueados > 0) {
    out.push({ chave: "ddd", tom: "warn", titulo: `${x.bloqueados} leads vieram de outro estado`,
      corpo: `Telefones com DDD de fora de São Paulo. O sistema bloqueou sozinho, mas o anúncio foi pago${x.perdidoBloqueio ? `: ${brl(x.perdidoBloqueio)}` : ""}.`,
      hipotese: "A segmentação geográfica está pegando gente de fora.",
      mensagem: `${oi}${eu}. ${x.bloqueados} dos meus leads deste mês vieram com DDD de outro estado e foram bloqueados aqui${x.perdidoBloqueio ? `, uns ${brl(x.perdidoBloqueio)} jogados fora` : ""}. Consegue apertar a segmentação pra São Paulo?` });
  }

  // uma campanha responde muito mais que a outra
  if (x.campanhas.length >= 2) {
    const boa = x.campanhas[0], ruim = x.campanhas[x.campanhas.length - 1];
    if (boa.resp >= ruim.resp * 2 && boa.resp >= 50 && ruim.leads >= 10) {
      out.push({ chave: "verba", tom: "info", titulo: "Uma campanha sua responde muito mais que a outra",
        corpo: `A ${boa.nome} traz lead que responde ${boa.resp}% das vezes. A ${ruim.nome}, ${ruim.resp}%.`,
        hipotese: "Público ou anúncio diferente atraindo gente com intenção diferente.",
        mensagem: `${oi}${eu}. A campanha ${boa.nome} está trazendo lead que responde ${boa.resp}% das vezes, e a ${ruim.nome} só ${ruim.resp}%. Vale mover verba da segunda pra primeira?` });
    }
  }

  return out;
}

export async function salvarGestor(managerId: string, nome: string, telefone: string) {
  const { error } = await supabase.from("system_settings").upsert({
    key: `gestor_trafego_${managerId}`,
    value: JSON.stringify({ nome, telefone }),
    description: "Contato do gestor de tráfego deste gerente",
  }, { onConflict: "key" });
  if (error) throw error;
}
