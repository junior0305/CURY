// Conselho de Estratégia (IA) no topo da aba Estratégia: lê os fatos das 5 perguntas e ajuda a DECIDIR —
// onde estamos, a conta do funil reverso, 2-3 decisões com opções/custo/recomendação e o plano com dono,
// prazo e indicador (cada ação vira compromisso pelo "Combinar"). Também responde perguntas livres.
// Edge estrategia-ia (OpenAI); a análise do dia fica em cache, "Refazer" gera de novo.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Combinar } from "./Estrategia";

type Acao = { acao: string; responsavel_id: string; responsavel: string; prazo_dias: number; indicador: string };
type Decisao = { tema: string; decisao: string; opcoes: { nome: string; ganho: string; custo: string }[]; recomendo: string; por_que: string; nao_faria: string; plano: Acao[] };
type Analise = { leitura: string; conta: string; meta_fecha: "sim" | "apertado" | "nao"; gargalo: string; decisoes: Decisao[];
  dados_que_faltam: string[]; perguntas_reuniao: string[]; modelo?: string; gerado_em?: string };
type Resposta = { pergunta: string; resposta: string; recomendo: string; plano: Acao[]; dados_que_faltam: string[] };

const FECHA: Record<string, [string, string]> = { sim: ["a meta fecha", "c-grn"], apertado: ["meta apertada", "c-org"], nao: ["a meta não fecha", "c-red"] };
const GARG: Record<string, string> = { fechamento: "gargalo: fechamento", funil: "gargalo: funil", trafego: "gargalo: tráfego", time: "gargalo: time", dados: "gargalo: dados" };
const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("estrategia-ia", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function Conselho({ fatos, pronto, donoId, abrir }: {
  fatos: Record<string, unknown>; pronto: boolean; donoId: string; abrir: (c: Combinar) => void;
}) {
  const [an, setAn] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [perg, setPerg] = useState("");
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [perguntando, setPerguntando] = useState(false);
  const iniciou = useRef(false);

  async function gerar(forcar: boolean, soCache = false) {
    setCarregando(true); setErro(null);
    try {
      const r = await chamar({ modo: "analise", fatos, forcar, so_cache: soCache, dono_id: donoId });
      if (r?.vazio) return gerar(false);
      setAn(r);
    } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
  }
  // análise do dia: usa o cache; se ainda não tem, gera assim que os fatos estiverem prontos
  useEffect(() => { if (pronto && !iniciou.current) { iniciou.current = true; gerar(false, true); } }, [pronto]);

  async function perguntar() {
    const q = perg.trim(); if (!q) return;
    setPerguntando(true);
    try {
      const r = await chamar({ modo: "pergunta", pergunta: q, fatos, dono_id: donoId });
      setRespostas((v) => [{ pergunta: q, ...r }, ...v]); setPerg("");
    } catch (e) { toast.error((e as Error).message); } finally { setPerguntando(false); }
  }

  const combinar = (a: Acao, sobre: string) => abrir({ sobre, pergunta: 0, titulo: `${a.acao} · meta: ${a.indicador}`,
    responsavelId: a.responsavel_id || null, prazoDias: a.prazo_dias });
  const Plano = ({ plano, sobre }: { plano: Acao[]; sobre: string }) => (
    <ol className="cs-plano">
      {plano.map((a, i) => (
        <li key={i}>
          <div><b>{a.acao}</b><small>{a.responsavel || "você"} · em {a.prazo_dias} dia{a.prazo_dias === 1 ? "" : "s"} · funcionou se: {a.indicador}</small></div>
          <button className="dir-btn-action" onClick={() => combinar(a, sobre)}>Combinar</button>
        </li>))}
    </ol>
  );

  return (
    <section className="dir-card cs">
      <div className="cs-hd">
        <div className="cs-who"><div className="cs-av" aria-hidden>IA</div>
          <div><b>Conselho de estratégia</b><small>lê as 5 perguntas abaixo e ajuda a decidir{an?.gerado_em ? ` · ${an.modelo ?? ""} · gerado às ${hora(an.gerado_em)}` : ""}</small></div></div>
        <button className="dir-btn" disabled={carregando || !pronto} onClick={() => gerar(true)}>{carregando ? "Pensando…" : an ? "Refazer com os números de agora" : "Gerar a análise"}</button>
      </div>

      {erro ? <div className="est-warn"><b style={{ color: "var(--red)" }}>!</b><div>{erro}</div></div> : null}
      {!an && carregando ? <div className="dir-nota" style={{ padding: "6px 0" }}>Lendo meta, pastas, dinheiro, time e compromissos… leva uns 20 segundos.</div> : null}
      {!an && !carregando && !pronto ? <div className="dir-nota">Esperando os números das perguntas abaixo carregarem…</div> : null}

      {an ? <>
        <p className="cs-lei">{an.leitura}</p>
        <div className="cs-chips">
          <span className={`dir-chip ${FECHA[an.meta_fecha]?.[1] ?? "c-gray"}`}>{FECHA[an.meta_fecha]?.[0] ?? an.meta_fecha}</span>
          <span className="dir-chip c-blue">{GARG[an.gargalo] ?? an.gargalo}</span>
        </div>
        <div className="cs-conta"><span className="dir-lbl">A conta</span>{an.conta}</div>

        <div className="cs-decs">
          {an.decisoes.map((d, i) => (
            <article key={i} className="cs-dec">
              <div className="dir-lbl">Decisão {i + 1} · {d.tema}</div>
              <h3>{d.decisao}</h3>
              <div className="cs-ops">
                {d.opcoes.map((o) => {
                  const rec = d.recomendo.toLowerCase().includes(o.nome.toLowerCase().slice(0, 18));
                  return <div key={o.nome} className={`cs-op${rec ? " rec" : ""}`}><b>{o.nome}{rec ? <span className="dir-chip c-grn">recomendado</span> : null}</b>
                    <small><span>ganho</span> {o.ganho}</small><small><span>custo</span> {o.custo}</small></div>;
                })}
              </div>
              <p className="cs-rec"><b>Recomendo:</b> {d.recomendo} <span>{d.por_que}</span></p>
              <p className="cs-nao"><b>Não faria:</b> {d.nao_faria}</p>
              <div className="dir-lbl">Plano</div>
              <Plano plano={d.plano} sobre={`Conselho: ${d.tema}`} />
            </article>))}
        </div>

        <div className="est-g2">
          <div className="est-box">
            <div className="dir-lbl">Perguntas para a reunião de segunda</div>
            <ol className="cs-list">{an.perguntas_reuniao.map((q) => <li key={q}>{q}</li>)}</ol>
            <button className="dir-btn" style={{ alignSelf: "flex-start" }} onClick={() => navigator.clipboard?.writeText(an.perguntas_reuniao.map((q, i) => `${i + 1}. ${q}`).join("\n"))
              .then(() => toast.success("Perguntas copiadas"), () => toast.error("Não consegui copiar"))}>Copiar perguntas</button>
          </div>
          <div className="est-box">
            <div className="dir-lbl">O que falta lançar para decidir melhor</div>
            {an.dados_que_faltam.length ? <ul className="cs-list">{an.dados_que_faltam.map((q) => <li key={q}>{q}</li>)}</ul> : <div className="dir-nota">Nada: os dados bastam para decidir.</div>}
          </div>
        </div>
      </> : null}

      <div className="cs-ask">
        <label htmlFor="cs-perg" className="dir-lbl">Pergunte ao conselho</label>
        <div className="cs-ask-row">
          <textarea id="cs-perg" rows={2} value={perg} onChange={(e) => setPerg(e.target.value)} disabled={!pronto}
            placeholder="Ex.: Vale colocar mais R$ 2 mil em anúncio este mês ou cobrar os leads parados primeiro?"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) perguntar(); }} />
          <button className="dir-btn solid" disabled={perguntando || !perg.trim() || !pronto} onClick={perguntar}>{perguntando ? "Pensando…" : "Perguntar"}</button>
        </div>
        {respostas.map((r, i) => (
          <div key={i} className="cs-resp">
            <div className="cs-q">{r.pergunta}</div>
            <p>{r.resposta}</p>
            <p className="cs-rec"><b>Recomendo:</b> {r.recomendo}</p>
            {r.plano.length ? <Plano plano={r.plano} sobre={`Conselho: ${r.pergunta.slice(0, 60)}`} /> : null}
            {r.dados_que_faltam.length ? <p className="dir-nota" style={{ margin: 0 }}>Falta para responder melhor: {r.dados_que_faltam.join("; ")}</p> : null}
          </div>))}
      </div>
    </section>
  );
}
