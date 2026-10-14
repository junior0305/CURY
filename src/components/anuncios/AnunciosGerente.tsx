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
type Aba = "alertas" | "campanhas" | "entrega" | "pixel";

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
    const casaCpl = Number(d.casa?.cpl ?? 0) || null;
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
            <div className="an-kpi-h"><span>Custo por lead</span>{cpl != null && casaCpl ? <em className={cpl > casaCpl * 1.3 ? "red" : cpl < casaCpl * 0.8 ? "grn" : "neu"}>{cpl > casaCpl ? "acima" : "abaixo"} da casa</em> : null}</div>
            <b>{brl2(cpl)}</b>
            <small>média da casa {brl2(casaCpl)} · {form} formulário + {conv} conversa</small>
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
          {([["alertas", "Alertas do tráfego", problemas.length], ["campanhas", "Campanhas", (d.campanhas ?? []).length], ["entrega", "Entrega", null], ["pixel", "Pixel", null]] as [Aba, string, number | null][])
            .map(([k, rot, n]) => (
              <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{rot}{n != null ? <span>{n}</span> : null}</button>
            ))}
        </nav>

        {aba === "alertas" ? <Alertas problemas={problemas} dicas={dicas} gestor={gestor ?? null} conta={d.conta} automatico={!!reguaLigada} />
          : aba === "campanhas" ? <Campanhas campanhas={d.campanhas ?? []} casaCpl={casaCpl} />
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

function Campanhas({ campanhas, casaCpl }: { campanhas: any[]; casaCpl: number | null }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = [...campanhas].sort((a, b) => (b.status === "ACTIVE" ? 1 : 0) - (a.status === "ACTIVE" ? 1 : 0) || Number(b.gasto) - Number(a.gasto));
  const selo = (gasto: number, leads: number) => {
    if (!casaCpl || gasto < 30) return null;
    if (leads === 0) return <em className="red">gastando sem lead</em>;
    const c = gasto / leads;
    if (c > casaCpl * 1.5) return <em className="red">cara</em>;
    if (c < casaCpl * 0.6 && leads >= 3) return <em className="grn">campeã</em>;
    return null;
  };
  if (!lista.length) return <div className="an-card"><p className="an-vazio">Nenhuma campanha com gasto nos últimos 7 dias.</p></div>;
  return (
    <div className="an-card an-tabela">
      <div className="an-tr an-th"><span>Campanha</span><span>Gasto</span><span>Leads</span><span>Por lead</span><span>Conjuntos</span></div>
      {lista.map((c) => {
        const gasto = Number(c.gasto ?? 0), leads = Number(c.leads ?? 0);
        const conj = c.conjuntos ?? [];
        return (
          <div key={c.id}>
            <button className="an-tr" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>
              <span className="an-nome"><i className={c.status === "ACTIVE" ? "on" : ""} title={c.status === "ACTIVE" ? "ativa" : "pausada"} />{c.nome}{selo(gasto, leads)}</span>
              <span className="mono">{brl(gasto)}</span>
              <span className="mono">{leads}</span>
              <span className="mono">{leads ? brl2(gasto / leads) : "—"}</span>
              <span className="mono">{conj.length} {aberta === c.id ? "▲" : "▼"}</span>
            </button>
            {aberta === c.id ? (
              <div className="an-sub">
                {conj.map((s: any) => (
                  <div key={s.id} className="an-conj">
                    <div className="an-conj-h">
                      <b>{s.nome}</b>
                      <span className="mono">{brl(Number(s.gasto))} · {s.leads} lead(s){s.leads ? ` · ${brl2(Number(s.gasto) / s.leads)}` : ""}</span>
                      <span className="an-raio">{(s.geo?.pontos ?? []).map((p: number[]) => `raio ${p[2]} km`).join(", ") || (s.geo?.cidades ?? []).join(", ")}</span>
                    </div>
                    {(s.anuncios ?? []).filter((a: any) => Number(a.gasto) > 0).sort((a: any, b: any) => Number(b.gasto) - Number(a.gasto)).map((a: any) => (
                      <div key={a.id} className="an-ad">
                        <span>{a.nome}</span>
                        <span className="mono">{brl2(Number(a.gasto))} · {a.leads} lead(s){a.leads ? ` · ${brl2(Number(a.gasto) / a.leads)}` : ""}</span>
                        {selo(Number(a.gasto), Number(a.leads))}
                      </div>
                    ))}
                  </div>
                ))}
                <small>Conjunto precisa de cerca de 50 leads por semana para sair do aprendizado do Facebook. Verba espalhada em muitos conjuntos fica presa nele.</small>
              </div>
            ) : null}
          </div>
        );
      })}
      <small className="an-nota">Por lead = gasto ÷ leads do Facebook (formulário + conversa). Média da casa: {brl2(casaCpl)}. "Cara" = 50% acima da casa; "campeã" = 40% abaixo com 3 leads ou mais.</small>
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
.mgr10 .an-vazio-box p{color:var(--ink-2)}
@media(max-width:720px){.mgr10 .an-tr{grid-template-columns:minmax(0,1fr) auto auto}.mgr10 .an-tr>span:nth-child(4),.mgr10 .an-tr>span:nth-child(5){display:none}.mgr10 .an-faixa,.mgr10 .an-alerta{grid-template-columns:minmax(0,1fr)}}
`;
