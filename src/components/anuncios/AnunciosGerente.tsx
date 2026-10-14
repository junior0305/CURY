// Anúncios do gerente: a conta de anúncio lida na fonte (robô /root/econ/fb_saude.py, de hora em hora,
// grava public.fb_saude) — gasto, custo por lead contra a média da casa, campanha a campanha, entrega,
// o que o Facebook contou × o que chegou aqui, e os alertas para o gestor de tráfego.
// O painel só lê o Facebook; nunca escreve (decisão do Junior). O aviso automático ao gestor
// é a regra "Alerta do tráfego" da Régua (edge regua-cobranca).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";

const sb = supabase as any;
const brl = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
const brl2 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "—" : "R$ " + n.toFixed(2).replace(".", ","));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
type Aba = "alertas" | "campanhas" | "comparar" | "entrega" | "pixel";

export default function AnunciosGerente() {
  const { session } = useAuth();
  const eu = session?.user?.id;
  const { mode, toggle } = useTheme();
  useEffect(loadFonts, []);
  const [aba, setAba] = useState<Aba>("alertas");
  const [contaSel, setContaSel] = useState<string>("");

  const { data: contas, isLoading } = useQuery({
    queryKey: ["anuncios-fb-saude", eu], enabled: !!eu, refetchInterval: 300_000,
    queryFn: async () => {
      const { data } = await sb.from("fb_saude").select("account_id, dono_id, dados, atualizado_em").eq("dono_id", eu);
      return (data ?? []) as { account_id: string; dono_id: string; dados: any; atualizado_em: string }[];
    },
  });
  const { data: gestor } = useQuery({
    queryKey: ["cfg-gestor-trafego", eu], enabled: !!eu,
    queryFn: async () => {
      const { data } = await sb.from("system_settings").select("value").eq("key", `gestor_trafego_${eu}`).maybeSingle();
      let v: any = data?.value ?? null;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
      return v?.telefone ? { nome: String(v.nome || ""), telefone: String(v.telefone) } : null;
    },
  });
  const { data: reguaLigada } = useQuery({
    queryKey: ["anuncios-regua-alerta", eu], enabled: !!eu,
    queryFn: async () => {
      const { data } = await sb.from("regua_regras").select("nivel, dono_id, ligada, obrigatoria").eq("chave", "alerta_trafego");
      const linhas = data ?? [];
      if (linhas.some((r: any) => r.nivel === "diretor" && r.obrigatoria)) return true;
      const minha = linhas.find((r: any) => r.dono_id === eu);
      if (minha?.ligada != null) return !!minha.ligada;
      return !!linhas.find((r: any) => r.nivel === "diretor")?.ligada;
    },
  });

  const { data: ranking } = useQuery({
    queryKey: ["anuncios-comparativo"], enabled: !!eu, staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.rpc("anuncios_comparativo")).data ?? []) as any[],
  });
  const conta = useMemo(() => (contas ?? []).find((c) => c.account_id === contaSel) ?? (contas ?? [])[0], [contas, contaSel]);
  const d = conta?.dados ?? null;

  const corpo = () => {
    if (isLoading) return <p className="an-vazio">Carregando a conta de anúncio…</p>;
    if (!d) return (
      <div className="an-card an-vazio-box">
        <h3>Nenhuma conta de anúncio ligada a você</h3>
        <p>O robô lê as contas do Business Manager da diretoria. Peça ao administrador para ligar a conta da sua equipe ao seu nome.</p>
      </div>
    );
    const cm = d.comandra ?? {};
    const leadsFb = Number(d.leads_fb_7d ?? 0);
    const form = Number(d.form_7d ?? 0), conv = Number(d.conversas_7d ?? 0);
    const gasto = Number(d.gasto_7d ?? 0), gastoAnt = Number(d.gasto_7d_ant ?? 0);
    const cpl = leadsFb > 0 ? gasto / leadsFb : null;
    // média das contas = mesmo cálculo da aba Comparar (gasto ÷ leads do Facebook, todas as contas da diretoria)
    const somaG = (ranking ?? []).reduce((a: number, r: any) => a + Number(r.gasto || 0), 0);
    const somaL = (ranking ?? []).reduce((a: number, r: any) => a + Number(r.leads_fb || 0), 0);
    const casaCpl = somaL ? somaG / somaL : (Number(d.casa?.cpl ?? 0) || null);
    const chegaram = Number(cm.leads ?? 0);
    const naoChegaram = Math.max(0, form - chegaram);
    const alertas: any[] = d.alertas ?? [];
    const vermelhos = alertas.filter((a) => a.g === "red");
    const problemas = alertas.filter((a) => a.g !== "grn");
    const dicas = alertas.filter((a) => a.g === "grn");
    const ativas = (d.campanhas ?? []).filter((c: any) => c.status === "ACTIVE").length;
    const variacao = gastoAnt > 0 ? Math.round(((gasto - gastoAnt) / gastoAnt) * 100) : null;

    return (
      <>
        {vermelhos.length ? (
          <div className="an-faixa red">
            <span className="an-faixa-tag">PROBLEMA NA CONTA</span>
            <div><b>{vermelhos[0].titulo}</b><span>{vermelhos[0].detalhe}</span></div>
            <button className="an-btn" onClick={() => setAba("alertas")}>Ver alertas</button>
          </div>
        ) : !gestor ? (
          <div className="an-faixa amb">
            <span className="an-faixa-tag">SEM GESTOR CADASTRADO</span>
            <div><b>Os alertas da conta não têm para quem ir</b><span>Cadastre quem cuida do seu tráfego e os avisos saem sozinhos.</span></div>
            <Link className="an-btn" to="/manager/config?secao=facebook">Cadastrar</Link>
          </div>
        ) : null}

        <div className="an-kpis">
          <div className="an-kpi">
            <div className="an-kpi-h"><span>Gastou</span>{variacao != null ? <em className={variacao > 15 ? "amb" : "neu"}>{variacao > 0 ? "+" : ""}{variacao}% vs 7 dias antes</em> : null}</div>
            <b>{brl(gasto)}</b>
            <small>{ativas} campanha(s) ativa(s) · {brl((d.gasto_por_dia && Object.values(d.gasto_por_dia).slice(-1)[0]) as number)} ontem</small>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-h"><span>Custo por lead</span>{cpl != null && casaCpl ? <em className={cpl > casaCpl * 1.2 ? "red" : cpl < casaCpl * 0.85 ? "grn" : "neu"}>{cpl > casaCpl ? "acima" : "abaixo"} da média</em> : null}</div>
            <b>{brl2(cpl)}</b>
            <small>média das contas {brl2(casaCpl)} · {(() => {
              const comCpl = (ranking ?? []).filter((r: any) => r.cpl != null).sort((a: any, b: any) => Number(a.cpl) - Number(b.cpl));
              const pos = comCpl.findIndex((r: any) => r.dono_id === eu);
              return pos >= 0 ? <button className="an-link" onClick={() => setAba("comparar")}>{pos + 1}º de {comCpl.length} contas</button> : `${form} formulário + ${conv} conversa`;
            })()}</small>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-h"><span>Leads: Facebook × aqui</span>{naoChegaram > 0 ? <em className="red">{naoChegaram} não chegaram</em> : <em className="grn">todos chegaram</em>}</div>
            <b>{form} <i>×</i> {chegaram}</b>
            <small>formulários contados pelo Facebook × leads que entraram no Comandra</small>
          </div>
          <div className="an-kpi">
            <div className="an-kpi-h"><span>Responderam</span>{cm.fora_regiao ? <em className="amb">{cm.fora_regiao} de fora de SP</em> : null}</div>
            <b>{cm.responderam ?? 0} <i>de</i> {chegaram}</b>
            <small>{pct(cm.responderam ?? 0, chegaram)}% responderam · {cm.sem_toque ?? 0} ainda sem atendimento</small>
          </div>
        </div>

        <nav className="an-abas" aria-label="Seções dos anúncios">
          {([["alertas", "Alertas do tráfego", problemas.length], ["campanhas", "Campanhas", null], ["comparar", "Comparar gerentes", null], ["entrega", "Entrega", null], ["pixel", "Pixel", null]] as [Aba, string, number | null][])
            .map(([k, rot, n]) => (
              <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{rot}{n != null ? <span>{n}</span> : null}</button>
            ))}
        </nav>

        {aba === "alertas" ? <Alertas problemas={problemas} dicas={dicas} gestor={gestor ?? null} conta={d.conta} automatico={!!reguaLigada} />
          : aba === "campanhas" ? <Campanhas donoId={conta!.dono_id} casa={d.casa ?? {}} />
          : aba === "comparar" ? <Comparativo eu={eu!} />
          : aba === "entrega" ? <Entrega d={d} />
          : <Pixel d={d} />}
      </>
    );
  };

  return (
    <div className="mgr10 app2">
      <RailV10 atual="leads" mode={mode} toggle={toggle} />
      <main className="shell2">
        <div className="an">
          <style>{CSS}</style>
          <header className="an-top">
            <div>
              <h1>Anúncios</h1>
              <p>A sua conta de anúncio lida direto no Facebook · últimos 7 dias{conta?.atualizado_em ? ` · atualizado às ${new Date(conta.atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            </div>
            <div className="an-top-r">
              {(contas ?? []).length > 1 ? (
                <select value={conta?.account_id ?? ""} onChange={(e) => setContaSel(e.target.value)} aria-label="Conta de anúncio">
                  {(contas ?? []).map((c) => <option key={c.account_id} value={c.account_id}>{c.dados?.conta ?? c.account_id}</option>)}
                </select>
              ) : d ? <span className="an-conta">{d.conta}</span> : null}
              <Link className="an-btn" to="/manager/leads">← Central de Leads</Link>
            </div>
          </header>
          {corpo()}
        </div>
      </main>
    </div>
  );
}

function Alertas({ problemas, dicas, gestor, conta, automatico }: {
  problemas: any[]; dicas: any[]; gestor: { nome: string; telefone: string } | null; conta: string; automatico: boolean;
}) {
  const link = (a: any) => {
    const n = String(gestor?.telefone || "").replace(/\D/g, "");
    const txt = `Oi ${gestor?.nome?.split(" ")[0] ?? ""}, alerta na conta ${conta}:\n\n*${a.titulo}*\n${a.detalhe}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`;
  };
  return (
    <div className="an-sec">
      <div className="an-info">
        {gestor ? <span>Gestor de tráfego: <b>{gestor.nome}</b> · {gestor.telefone}</span>
          : <span>Nenhum gestor de tráfego cadastrado. <Link to="/manager/config?secao=facebook">Cadastrar</Link></span>}
        <span className={automatico ? "ok" : ""}>{automatico ? "Aviso automático ligado" : "Aviso automático desligado"} · <Link to="/manager/config?secao=avisos">ajustar em Configurar</Link></span>
      </div>
      {!problemas.length ? <div className="an-card"><p className="an-vazio">Nenhum problema na conta agora. O robô confere de hora em hora.</p></div> : null}
      {problemas.map((a, i) => (
        <div key={i} className={`an-alerta ${a.g}`}>
          <span className="an-dot" />
          <div><b>{a.titulo}</b><p>{a.detalhe}</p></div>
          {gestor ? <a className="an-btn" href={link(a)} target="_blank" rel="noreferrer">Avisar {gestor.nome.split(" ")[0]}</a> : null}
        </div>
      ))}
      {dicas.length ? <h3 className="an-h3">Oportunidades</h3> : null}
      {dicas.map((a, i) => (
        <div key={`d${i}`} className="an-alerta grn">
          <span className="an-dot" />
          <div><b>{a.titulo}</b><p>{a.detalhe}</p></div>
          {gestor ? <a className="an-btn" href={link(a)} target="_blank" rel="noreferrer">Mandar para {gestor.nome.split(" ")[0]}</a> : null}
        </div>
      ))}
    </div>
  );
}

type Periodo = "hoje" | "ontem" | "7d" | "30d" | "datas";
const diaSP = (desloc = 0) => new Date(Date.now() - 3 * 3600e3 - desloc * 86400e3).toISOString().slice(0, 10);

function Campanhas({ donoId, casa }: { donoId: string; casa: { cpl?: number; cpc?: number; cpm?: number } }) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [de, setDe] = useState(diaSP(6)); const [ate, setAte] = useState(diaSP(0));
  const [aberta, setAberta] = useState<string | null>(null);
  const janela = periodo === "hoje" ? { de: diaSP(0), ate: diaSP(0) } : periodo === "ontem" ? { de: diaSP(1), ate: diaSP(1) }
    : periodo === "7d" ? { de: diaSP(6), ate: diaSP(0) } : periodo === "30d" ? { de: diaSP(29), ate: diaSP(0) } : { de, ate };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["anuncios-campanhas", donoId, janela.de, janela.ate], staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      const [{ data: fb, error }, chegou] = await Promise.all([
        supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: donoId, de: janela.de, ate: janela.ate } }),
        sb.from("leads").select("fb_campaign_id").not("fb_campaign_id", "is", null)
          .gte("created_at", `${janela.de}T03:00:00Z`).lt("created_at", new Date(new Date(`${janela.ate}T03:00:00Z`).getTime() + 86400e3).toISOString()),
      ]);
      const porCamp = new Map<string, number>();
      for (const l of chegou.data ?? []) porCamp.set(String(l.fb_campaign_id), (porCamp.get(String(l.fb_campaign_id)) ?? 0) + 1);
      const d = fb as any;
      if (error || d?.error || d?.semConta) return { erro: d?.motivo || d?.error || error?.message || "Não consegui ler a conta agora.", campanhas: [] as any[], gasto: 0 };
      return {
        erro: null as string | null, gasto: Number(d.gasto ?? 0), saldo: d.saldo as string | null,
        campanhas: (d.campanhas ?? []).map((c: any) => ({ ...c, chegaram: porCamp.get(String(c.id)) ?? 0 })) as any[],
      };
    },
  });

  // mesmas regras do robô (/root/econ/fb_saude.py): campanha de conversa compara com o custo por conversa da casa
  const tipo = (c: any) => (Number(c.conversas ?? 0) > Number(c.leads ?? 0) ? "conversa" : "form");
  const resultado = (c: any) => Number(c.leads ?? 0) + Number(c.conversas ?? 0);
  const ref = (c: any) => (tipo(c) === "conversa" ? casa.cpc : casa.cpl) || 0;
  const minGasto = periodo === "hoje" || periodo === "ontem" ? 15 : 60;
  const selo = (c: any) => {
    const gasto = Number(c.gasto ?? 0), n = resultado(c), r = ref(c), impr = Number(c.impr ?? 0);
    if (!r || gasto < minGasto) return null;
    if (!n) return <em className="red">gastando sem lead</em>;
    const custo = gasto / n;
    if (custo >= 2 * r) return <em className="red">cara</em>;
    if (impr && casa.cpm && (gasto / impr) * 1000 >= 2.5 * casa.cpm) return <em className="amb">impressão cara</em>;
    if (custo <= 0.6 * r && n >= 3) return <em className="grn">campeã</em>;
    return null;
  };

  const pills: [Periodo, string][] = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["datas", "Escolher datas"]];
  const lista = [...(data?.campanhas ?? [])].sort((a, b) => (b.ativa ? 1 : 0) - (a.ativa ? 1 : 0) || Number(b.gasto) - Number(a.gasto));
  return (
    <div className="an-sec">
      <div className="an-periodo">
        <div className="an-pills">
          {pills.map(([k, rot]) => <button key={k} className={periodo === k ? "on" : ""} onClick={() => { setPeriodo(k); setAberta(null); }}>{rot}</button>)}
        </div>
        {periodo === "datas" ? (
          <span className="an-datas">
            <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} aria-label="De" />
            <span>até</span>
            <input type="date" value={ate} min={de} max={diaSP(0)} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
          </span>
        ) : null}
        <span className="an-conta">{isFetching ? "lendo o Facebook…" : data && !data.erro ? `gasto no período: ${brl(data.gasto)}` : ""}</span>
      </div>
      {isLoading ? <div className="an-card"><p className="an-vazio">Lendo as campanhas no Facebook…</p></div>
        : data?.erro ? <div className="an-card"><p className="an-alerta-txt red">{data.erro}</p></div>
        : !lista.length ? <div className="an-card"><p className="an-vazio">Nenhuma campanha com gasto neste período.</p></div>
        : (
        <div className="an-card an-tabela">
          <div className="an-tr an-tr6 an-th"><span>Campanha</span><span>Gasto</span><span>Facebook</span><span>Chegaram</span><span>Por lead</span><span></span></div>
          {lista.map((c) => {
            const n = resultado(c);
            return (
              <div key={c.id}>
                <button className="an-tr an-tr6" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>
                  <span className="an-nome"><i className={c.ativa ? "on" : ""} title={c.ativa ? "ativa" : "pausada"} />{c.nome}
                    {tipo(c) === "conversa" ? <em className="neu">conversa</em> : null}{selo(c)}</span>
                  <span className="mono">{brl(Number(c.gasto))}</span>
                  <span className="mono">{n}{c.conversas ? <small> ({c.leads} form · {c.conversas} conv.)</small> : null}</span>
                  <span className={`mono ${tipo(c) === "form" && Number(c.leads) > c.chegaram ? "an-falta" : ""}`}>{c.chegaram}</span>
                  <span className="mono">{n ? brl2(Number(c.gasto) / n) : "—"}</span>
                  <span className="mono">{aberta === c.id ? "▲" : "▼"}</span>
                </button>
                {aberta === c.id ? <Detalhe donoId={donoId} campanha={c} janela={janela} refCusto={ref(c)} /> : null}
              </div>
            );
          })}
          <small className="an-nota">Facebook = leads de formulário + conversas que o Facebook contou. Chegaram = leads desta campanha que entraram no Comandra no período (em vermelho quando chegaram menos formulários do que o Facebook contou). Casa: {brl2(casa.cpl)} por lead de formulário, {brl2(casa.cpc)} por conversa. "Cara" = o dobro da casa; "campeã" = 40% abaixo com 3 resultados ou mais.</small>
        </div>
      )}
    </div>
  );
}

function Detalhe({ donoId, campanha, janela, refCusto }: { donoId: string; campanha: any; janela: { de: string; ate: string }; refCusto: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anuncios-detalhe", donoId, campanha.id, janela.de, janela.ate], staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: donoId, de: janela.de, ate: janela.ate, campanha_id: campanha.id } });
      return ((data as any)?.conjuntos ?? []) as any[];
    },
  });
  const seloAd = (a: any) => {
    const n = Number(a.leads) + Number(a.conversas), g = Number(a.gasto);
    if (!refCusto) return null;
    if (!n && g >= Math.max(1.5 * refCusto, 40)) return <em className="red">gastando sem lead</em>;
    if (n >= 2 && g / n <= 0.6 * refCusto) return <em className="grn">campeão</em>;
    return null;
  };
  if (isLoading) return <div className="an-sub"><small>Abrindo os conjuntos…</small></div>;
  if (!data?.length) return <div className="an-sub"><small>Sem gasto nos conjuntos desta campanha no período.</small></div>;
  return (
    <div className="an-sub">
      {data.map((s) => {
        const n = Number(s.leads) + Number(s.conversas);
        return (
          <div key={s.id} className="an-conj">
            <div className="an-conj-h"><b>{s.nome}</b>
              <span className="mono">{brl(Number(s.gasto))} · {n} resultado(s){n ? ` · ${brl2(Number(s.gasto) / n)}` : ""}</span></div>
            {(s.anuncios ?? []).filter((a: any) => Number(a.gasto) > 0).map((a: any) => {
              const na = Number(a.leads) + Number(a.conversas);
              return (
                <div key={a.id} className="an-ad">
                  <span>{a.nome}</span>
                  <span className="mono">{brl2(Number(a.gasto))} · {na} resultado(s){na ? ` · ${brl2(Number(a.gasto) / na)}` : ""}</span>
                  {seloAd(a)}
                </div>
              );
            })}
          </div>
        );
      })}
      <small>Conjunto precisa de cerca de 50 resultados por semana para sair do aprendizado do Facebook. Verba espalhada em muitos conjuntos fica presa nele.</small>
    </div>
  );
}

function Comparativo({ eu }: { eu: string }) {
  const [ordem, setOrdem] = useState<"cpl" | "gasto" | "resp" | "leads">("cpl");
  const { data, isLoading } = useQuery({
    queryKey: ["anuncios-comparativo"], staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.rpc("anuncios_comparativo")).data ?? []) as any[],
  });
  if (isLoading) return <div className="an-card"><p className="an-vazio">Somando as contas da diretoria…</p></div>;
  const linhas = (data ?? []).map((r) => ({ ...r, resp: r.chegaram ? r.responderam / r.chegaram : 0 }));
  if (!linhas.length) return <div className="an-card"><p className="an-vazio">Nenhuma conta de anúncio lida pelo robô.</p></div>;
  const tot = linhas.reduce((a, r) => ({ gasto: a.gasto + Number(r.gasto), leads: a.leads + r.leads_fb, cheg: a.cheg + r.chegaram, resp: a.resp + r.responderam }), { gasto: 0, leads: 0, cheg: 0, resp: 0 });
  const media = { cpl: tot.leads ? tot.gasto / tot.leads : null, resp: tot.cheg ? tot.resp / tot.cheg : 0 };
  const ord = [...linhas].sort((a, b) => ordem === "cpl" ? (Number(a.cpl ?? 1e9) - Number(b.cpl ?? 1e9))
    : ordem === "gasto" ? Number(b.gasto) - Number(a.gasto) : ordem === "resp" ? b.resp - a.resp : b.leads_fb - a.leads_fb);
  const maxGasto = Math.max(1, ...linhas.map((r) => Number(r.gasto)));
  const th = (k: typeof ordem, rot: string) => <button className={ordem === k ? "on" : ""} onClick={() => setOrdem(k)}>{rot}{ordem === k ? " ▾" : ""}</button>;
  return (
    <div className="an-sec">
      <div className="an-info"><span>Todas as contas da diretoria · últimos 7 dias · média da casa: <b>{brl2(media.cpl)}</b> por lead e <b>{Math.round(media.resp * 100)}%</b> de resposta</span></div>
      <div className="an-card an-tabela">
        <div className="an-tr an-tr7 an-th an-th-ord"><span>#</span><span>Conta</span>{th("gasto", "Gasto")}{th("leads", "Leads")}{th("cpl", "Por lead")}{th("resp", "Responderam")}<span>Alertas</span></div>
        {ord.map((r, i) => {
          const minha = r.dono_id === eu;
          const cplRuim = media.cpl && r.cpl && Number(r.cpl) > media.cpl * 1.2;
          const cplBom = media.cpl && r.cpl && Number(r.cpl) < media.cpl * 0.85;
          return (
            <div key={r.conta + i} className={`an-tr an-tr7 ${minha ? "an-eu" : ""}`}>
              <span className="mono">{i + 1}º</span>
              <span className="an-nome">{r.dono}{minha ? <em className="neu">você</em> : null}<small className="an-raio">{r.papel === "SUPERINTENDENT" ? "super" : r.super ? `equipe ${r.super}` : ""}</small></span>
              <span className="mono an-gbar"><i style={{ width: `${(Number(r.gasto) / maxGasto) * 100}%` }} />{brl(Number(r.gasto))}</span>
              <span className="mono">{r.leads_fb}<small> ({r.form} form · {r.conversas} conv.) → {r.chegaram} aqui</small></span>
              <span className={`mono ${cplRuim ? "an-falta" : cplBom ? "an-bom" : ""}`}>{brl2(r.cpl)}</span>
              <span className="mono">{Math.round(r.resp * 100)}%<small> ({r.responderam})</small></span>
              <span className="mono">{r.alertas || "—"}</span>
            </div>
          );
        })}
        <small className="an-nota">Por lead em vermelho = 20% acima da média da casa; em verde = 15% abaixo. Responderam = leads que responderam a primeira mensagem ÷ leads que chegaram. Conversa de anúncio abre direto no WhatsApp da equipe e não passa pelo Comandra; só formulário chega aqui. Os números vêm do robô que lê cada conta de hora em hora.</small>
      </div>
    </div>
  );
}

function Entrega({ d }: { d: any }) {
  const dias = Object.entries(d.gasto_por_dia ?? {}) as [string, number][];
  const max = Math.max(1, ...dias.map(([, v]) => Number(v)));
  const impr = Number(d.impr_7d ?? 0), cliques = Number(d.cliques_7d ?? 0), gasto = Number(d.gasto_7d ?? 0);
  const cm = d.comandra ?? {};
  return (
    <div className="an-sec an-grid2">
      <div className="an-card">
        <h3 className="an-h3">Gasto por dia</h3>
        <div className="an-barras">
          {dias.map(([dia, v]) => (
            <div key={dia} className="an-barra">
              <span className="mono">{brl(Number(v))}</span>
              <i style={{ height: `${Math.max(4, (Number(v) / max) * 120)}px` }} />
              <small>{dia.slice(8, 10)}/{dia.slice(5, 7)}</small>
            </div>
          ))}
          {!dias.length ? <p className="an-vazio">Sem gasto registrado nos últimos 3 dias.</p> : null}
        </div>
        <small>Dia sem gasto com campanha ativa costuma ser saldo, cartão ou anúncio reprovado.</small>
      </div>
      <div className="an-card">
        <h3 className="an-h3">Funil da conta (7 dias)</h3>
        <dl className="an-dl">
          <dt>Pessoas alcançadas (impressões)</dt><dd className="mono">{impr.toLocaleString("pt-BR")}</dd>
          <dt>Cliques</dt><dd className="mono">{cliques} · {pct(cliques, impr)}% das impressões</dd>
          <dt>Custo por mil impressões</dt><dd className="mono">{impr ? brl2((gasto / impr) * 1000) : "—"} <span>(casa {brl2(d.casa?.cpm)})</span></dd>
          <dt>Formulários / conversas</dt><dd className="mono">{d.form_7d ?? 0} / {d.conversas_7d ?? 0}</dd>
          <dt>Chegaram no Comandra</dt><dd className="mono">{cm.leads ?? 0}</dd>
          <dt>De fora de SP (bloqueados)</dt><dd className="mono">{cm.fora_regiao ?? 0}</dd>
          <dt>Responderam a primeira mensagem</dt><dd className="mono">{cm.responderam ?? 0}</dd>
          <dt>Sem atendimento do corretor</dt><dd className="mono">{cm.sem_toque ?? 0}</dd>
        </dl>
      </div>
    </div>
  );
}

function Pixel({ d }: { d: any }) {
  const capi = Number(d.capi_7d ?? 0);
  return (
    <div className="an-sec">
      <div className="an-card">
        <h3 className="an-h3">O que o Comandra devolve ao Facebook</h3>
        <p className="an-p">Toda vez que um cliente seu responde, visita ou compra, o Comandra avisa o Facebook pelo pixel da conta. É assim que ele aprende a procurar gente parecida com quem compra, e não só com quem preenche formulário.</p>
        <dl className="an-dl">
          <dt>Pixel da conta</dt><dd className="mono">{d.pixel || "nenhum ligado"}</dd>
          <dt>Avisos enviados em 7 dias</dt><dd className="mono">{capi}</dd>
        </dl>
        {!d.pixel ? <p className="an-alerta-txt red">Sem pixel ligado, o Facebook não recebe nenhum sinal de qualidade desta conta.</p>
          : capi === 0 ? <p className="an-alerta-txt amb">Nenhum aviso em 7 dias: o Facebook não está aprendendo quem compra. Confira se os corretores atualizam o status dos leads.</p>
          : <p className="an-alerta-txt grn">Funcionando.</p>}
      </div>
    </div>
  );
}

const CSS = `
.mgr10 .an{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5);max-width:1200px}
.mgr10 .an-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .an-top h1{font-size:28px}
.mgr10 .an-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .an-top-r{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mgr10 .an-top-r select{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:7px 10px}
.mgr10 .an-conta{font-size:13px;color:var(--ink-3)}
.mgr10 .an-btn{font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;white-space:nowrap}
.mgr10 .an-faixa{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 18px;border-radius:var(--r);border:1px solid}
.mgr10 .an-faixa.red{background:var(--red-air);border-color:color-mix(in srgb,var(--red) 35%,transparent)}
.mgr10 .an-faixa.amb{background:var(--amber-air);border-color:color-mix(in srgb,var(--amber) 35%,transparent)}
.mgr10 .an-faixa-tag{font-family:"JetBrains Mono",monospace;font-size:10.5px;font-weight:700;letter-spacing:.1em;padding:4px 8px;border-radius:6px;color:#fff;background:var(--red)}
.mgr10 .an-faixa.amb .an-faixa-tag{background:var(--amber)}
.mgr10 .an-faixa div{display:grid;min-width:0}
.mgr10 .an-faixa div span{font-size:13px;color:var(--ink-2)}
.mgr10 .an-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.mgr10 .an-kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px}
.mgr10 .an-kpi-h{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}
.mgr10 .an-kpi-h span{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mgr10 .an-kpi b{font-size:30px;font-weight:800;letter-spacing:-.03em;font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums}
.mgr10 .an-kpi b i{font-style:normal;color:var(--ink-3);font-size:18px;font-weight:600}
.mgr10 .an-kpi small{font-size:12.5px;color:var(--ink-3)}
.mgr10 .an em{font-style:normal;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;margin-left:6px}
.mgr10 .an em.red{color:var(--red);background:var(--red-air)} .mgr10 .an em.grn{color:var(--good);background:var(--good-air)}
.mgr10 .an em.amb{color:var(--amber);background:var(--amber-air)} .mgr10 .an em.neu{color:var(--ink-2);background:var(--sunk)}
.mgr10 .an-abas{display:flex;gap:4px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px}
.mgr10 .an-abas button{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:9px;font-size:14px;font-weight:600;color:var(--ink-2)}
.mgr10 .an-abas button span{font-size:11.5px;background:var(--sunk);padding:1px 7px;border-radius:999px}
.mgr10 .an-abas button.on{background:var(--blue-air);color:var(--blue)}
.mgr10 .an-sec{display:grid;gap:10px}
.mgr10 .an-grid2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.mgr10 .an-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:10px;min-width:0}
.mgr10 .an-info{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:13px;color:var(--ink-2)}
.mgr10 .an-info .ok{color:var(--good);font-weight:600}
.mgr10 .an-info a,.mgr10 .an-vazio-box a{color:var(--blue);font-weight:600}
.mgr10 .an-alerta{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.mgr10 .an-alerta p{font-size:13.5px;color:var(--ink-2);margin-top:3px;overflow-wrap:anywhere}
.mgr10 .an-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--amber)}
.mgr10 .an-alerta.red .an-dot{background:var(--red)} .mgr10 .an-alerta.grn .an-dot{background:var(--good)}
.mgr10 .an-alerta.red{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.mgr10 .an-h3{font-size:15px}
.mgr10 .an-tabela{padding:0;gap:0;overflow:hidden}
.mgr10 .an-tr{display:grid;grid-template-columns:minmax(0,3fr) repeat(4,minmax(70px,1fr));gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--hair);width:100%;text-align:left;font-size:13.5px}
.mgr10 .an-th{border-top:0;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--sunk)}
.mgr10 button.an-tr:hover{background:var(--sunk)}
.mgr10 .an-nome{display:flex;align-items:center;gap:8px;font-weight:600;min-width:0;overflow-wrap:anywhere}
.mgr10 .an-nome i{width:8px;height:8px;border-radius:50%;background:var(--ink-3);flex-shrink:0}
.mgr10 .an-nome i.on{background:var(--good)}
.mgr10 .an-sub{background:var(--sunk);padding:12px 16px;display:grid;gap:10px;font-size:13px}
.mgr10 .an-sub small,.mgr10 .an-nota{color:var(--ink-3);font-size:12px}
.mgr10 .an-nota{display:block;padding:10px 16px;border-top:1px solid var(--hair)}
.mgr10 .an-conj{background:var(--card);border-radius:10px;padding:10px 12px;display:grid;gap:6px}
.mgr10 .an-conj-h{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
.mgr10 .an-raio{color:var(--ink-3);font-size:12px}
.mgr10 .an-ad{display:flex;flex-wrap:wrap;gap:4px 12px;padding-left:12px;color:var(--ink-2)}
.mgr10 .an-barras{display:flex;gap:18px;align-items:flex-end;min-height:160px;padding-top:8px}
.mgr10 .an-barra{display:grid;justify-items:center;gap:6px;font-size:12px}
.mgr10 .an-barra i{width:46px;border-radius:8px 8px 3px 3px;background:var(--blue)}
.mgr10 .an-barra small{color:var(--ink-3)}
.mgr10 .an-dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;margin:0;font-size:13.5px}
.mgr10 .an-dl dt{color:var(--ink-2)} .mgr10 .an-dl dd{margin:0;text-align:right}
.mgr10 .an-dl dd span{color:var(--ink-3);font-size:12px}
.mgr10 .an-p{color:var(--ink-2);font-size:14px;max-width:70ch}
.mgr10 .an-alerta-txt{font-size:13.5px;font-weight:600}
.mgr10 .an-alerta-txt.red{color:var(--red)} .mgr10 .an-alerta-txt.amb{color:var(--amber)} .mgr10 .an-alerta-txt.grn{color:var(--good)}
.mgr10 .an-vazio{color:var(--ink-3);font-size:14px}
.mgr10 .an-periodo{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.mgr10 .an-pills{display:flex;gap:2px;background:var(--sunk);border-radius:10px;padding:3px;flex-wrap:wrap}
.mgr10 .an-pills button{font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;color:var(--ink-3)}
.mgr10 .an-pills button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.08)}
.mgr10 .an-datas{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2)}
.mgr10 .an-datas input{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.mgr10 .an-tr.an-tr6{grid-template-columns:minmax(0,3fr) repeat(4,minmax(70px,1fr)) 28px}
.mgr10 .an-tr.an-tr7{grid-template-columns:40px minmax(0,1.6fr) minmax(110px,1.2fr) minmax(150px,1.8fr) repeat(3,minmax(70px,1fr))}
.mgr10 .an-tr small{color:var(--ink-3);font-size:11.5px;font-family:inherit}
.mgr10 .an-falta{color:var(--red);font-weight:700}
.mgr10 .an-bom{color:var(--good);font-weight:700}
.mgr10 .an-eu{background:var(--blue-air)}
.mgr10 .an-th-ord button{font:inherit;text-align:left;color:inherit;letter-spacing:inherit;text-transform:inherit}
.mgr10 .an-th-ord button.on{color:var(--blue)}
.mgr10 .an-gbar{position:relative;display:flex;align-items:center;gap:6px}
.mgr10 .an-gbar i{position:absolute;left:0;top:50%;transform:translateY(-50%);height:18px;background:var(--blue-air);border-radius:4px;z-index:-1}
.mgr10 .an-gbar{isolation:isolate}
.mgr10 .an-gbar{padding-left:4px}
.mgr10 .an-link{color:var(--blue);font-weight:600;font-size:12.5px;padding:0}
.mgr10 .an-vazio-box p{color:var(--ink-2)}
@media(max-width:720px){.mgr10 .an-tr,.mgr10 .an-tr.an-tr6,.mgr10 .an-tr.an-tr7{grid-template-columns:minmax(0,1fr) auto auto}.mgr10 .an-tr>span:nth-child(n+4){display:none}.mgr10 .an-faixa,.mgr10 .an-alerta{grid-template-columns:minmax(0,1fr)}}
`;
