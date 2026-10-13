// Conselho de Estratégia (IA) no topo da aba Estratégia. Só age quando perguntado: o usuário pergunta
// (ou usa um atalho) e a IA responde com a recomendação, a escada Leads → Visitas → Pastas → Vendas
// (hoje × precisa × como aumentar) e um plano que vira compromisso pelo "Combinar".
// Edge estrategia-ia (OpenAI), gera em segundo plano; as perguntas ficam guardadas em public.estrategia_ia.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Combinar } from "./Estrategia";

type Acao = { acao: string; responsavel_id: string; responsavel: string; prazo_dias: number; indicador: string };
type Resp = { resposta: string; funil: { etapa: string; hoje: string; precisa: string; como: string }[]; plano: Acao[];
  premissas: string[]; dados_que_faltam: string[] };
type Item = { id: string; pergunta: string; criado_em: string; status: string; resposta: Resp | null };

const ATALHOS: [string, string][] = [
  ["Como bato a meta?", "Preciso bater a meta deste mês. Como devo atuar? Monte a conta de volume de leads, visitas e pastas e diga o que fazer para aumentar cada um."],
  ["Volume para a meta", "Qual volume de leads, visitas e pastas preciso por semana até o fim do mês para chegar na meta, e onde está o maior buraco hoje?"],
  ["Tenho gente suficiente", "Temos gente suficiente trabalhando. Como tiro mais volume do time atual, sem contratar, para chegar na meta?"],
  ["Lançamento no mês que vem", "Quero uma estratégia para um lançamento no mês que vem: volume de leads, visitas e pastas por semana, canais, escala do time e cronograma do pré-lançamento ao pós."],
];
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Conselho({ fatos, pronto, donoId, abrir }: {
  fatos: Record<string, unknown>; pronto: boolean; donoId: string; abrir: (c: Combinar) => void;
}) {
  const qc = useQueryClient();
  const [perg, setPerg] = useState("");
  const [pensando, setPensando] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const { data: hist } = useQuery({
    queryKey: ["estrategia-ia", donoId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("estrategia_ia" as any).select("id,pergunta,criado_em,status,resposta")
        .eq("dono_id", donoId).eq("modo", "pergunta").neq("status", "erro").order("criado_em", { ascending: false }).limit(8);
      return ((data ?? []) as unknown as Item[]).filter((i) => i.status === "pronto" && i.resposta && "funil" in (i.resposta as object));
    },
  });
  const atual = hist?.find((i) => i.id === abertaId) ?? hist?.[0] ?? null;

  async function perguntar(q: string) {
    q = q.trim(); if (!q || pensando) return;
    setPensando(true);
    try {
      const { data, error } = await supabase.functions.invoke("estrategia-ia", { body: { modo: "pergunta", pergunta: q, fatos, dono_id: donoId } });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const id = (data as any).id as string;
      for (let i = 0; i < 75; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data: l } = await supabase.from("estrategia_ia" as any).select("status").eq("id", id).maybeSingle();
        const st = (l as any)?.status;
        if (st === "pronto") { await qc.invalidateQueries({ queryKey: ["estrategia-ia", donoId] }); setAbertaId(id); setPerg(""); return; }
        if (st === "erro") throw new Error("A IA não conseguiu responder agora. Tente de novo.");
      }
      throw new Error("A IA demorou demais. Tente de novo em instantes.");
    } catch (e) { toast.error((e as Error).message); } finally { setPensando(false); }
  }

  const r = atual?.resposta;
  return (
    <section className="dir-card cs">
      <div className="cs-hd">
        <div className="cs-who"><div className="cs-av" aria-hidden>IA</div>
          <div><b>Conselho de estratégia</b><small>pergunte o que precisa decidir · responde com os números das perguntas abaixo</small></div></div>
      </div>

      <div className="cs-ask-row">
        <textarea id="cs-perg" rows={2} value={perg} onChange={(e) => setPerg(e.target.value)} disabled={!pronto || pensando}
          placeholder={pronto ? "Ex.: Preciso bater a meta. Como devo atuar?" : "Carregando os números…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(perg); } }} />
        <button className="dir-btn solid" disabled={pensando || !perg.trim() || !pronto} onClick={() => perguntar(perg)}>{pensando ? "Pensando…" : "Perguntar"}</button>
      </div>
      <div className="cs-atalhos">
        {ATALHOS.map(([t, q]) => <button key={t} className="cs-atalho" disabled={!pronto || pensando} onClick={() => { setPerg(q); perguntar(q); }}>{t}</button>)}
      </div>
      {pensando ? <div className="dir-nota">Fazendo a conta com meta, leads, visitas, pastas e time… leva cerca de 1 minuto.</div> : null}

      {atual && r ? (
        <div className="cs-resp">
          <div className="cs-q">{atual.pergunta}</div>
          <p className="cs-lei">{r.resposta}</p>

          {r.funil.length ? (
            <div className="est-tab"><table className="cs-funil">
              <thead><tr><th>Etapa</th><th>Hoje</th><th>Precisa</th><th>Como aumentar</th></tr></thead>
              <tbody>{r.funil.map((f) => <tr key={f.etapa}><td><b>{f.etapa}</b></td><td>{f.hoje}</td><td><b>{f.precisa}</b></td><td>{f.como}</td></tr>)}</tbody>
            </table></div>) : null}

          {r.plano.length ? <>
            <div className="dir-lbl">O que fazer</div>
            <ol className="cs-plano">
              {r.plano.map((a, i) => (
                <li key={i}>
                  <div><b>{a.acao}</b><small>{a.responsavel || "você"} · em {a.prazo_dias} dia{a.prazo_dias === 1 ? "" : "s"} · funcionou se: {a.indicador}</small></div>
                  <button className="dir-btn-action" onClick={() => abrir({ sobre: `Conselho: ${atual.pergunta.slice(0, 60)}`, pergunta: 0,
                    titulo: `${a.acao} · meta: ${a.indicador}`, responsavelId: a.responsavel_id || null, prazoDias: a.prazo_dias })}>Combinar</button>
                </li>))}
            </ol></> : null}

          {r.premissas.length || r.dados_que_faltam.length ? (
            <p className="dir-nota" style={{ margin: 0 }}>
              {r.premissas.length ? <>Supondo: {r.premissas.join("; ")}. </> : null}
              {r.dados_que_faltam.length ? <>Para afinar: {r.dados_que_faltam.join("; ")}.</> : null}
            </p>) : null}
        </div>) : null}

      {hist && hist.length > 1 ? (
        <details className="cs-hist">
          <summary>Perguntas anteriores ({hist.length - 1})</summary>
          {hist.filter((i) => i.id !== atual?.id).map((i) => (
            <button key={i.id} onClick={() => setAbertaId(i.id)}><span>{hora(i.criado_em)}</span>{i.pergunta}</button>))}
        </details>) : null}
    </section>
  );
}
