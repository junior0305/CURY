/* Rendimento da Equipe (29/10, mockup aprovado pelo Junior: https://claude.ai/artifact/BEbxPA8Vq3qa4xwp8G95NY). Substitui o
 * "Quem está sem gerar resultado" (QuemParado). Para cada corretor, a esteira dos últimos 30 dias
 * plantão (C2S) → leads → atendeu → visita (check-in C2S ou agenda) → pasta (Junix), o ponto onde trava, o porquê numa frase
 * e a ajuda que ele recebeu (cobranças, leads passados, filas, roleta). Dados: RPC rendimento_equipe (raiox_parados.py + leads).
 * Fica de fora: sem vínculo C2S/Junix e quem tem menos de 30 dias de casa (esses estão na Rampa de Novos).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
type R = { id: string; nome: string; equipe_id: string | null; equipe: string | null; dias_casa: number | null; vinculado: boolean; atualizado_em: string | null;
  plantao_dias: number | null; dias_sem_plantao: number | null; ultimo_plantao: string | null; leads: number; leads_anuncio: number; atendidos: number; parados: number; visitas: number; pastas: number;
  dias_sem_pasta: number | null; cobrancas: number; cobranca_ultima: string | null; cobrancas_sem_resposta: number; passados: number; na_roleta: boolean;
  filas_em: number; filas_equipe: number };
type Motivo = "plantao" | "leads" | "atende" | "visita" | "pasta";
const MOTIVOS: [Motivo | "todos", string, string][] = [
  ["todos", "Todos", "precisam de atenção"], ["plantao", "Não vai ao plantão", "vem pouco ou sumiu"], ["leads", "Vai, mas não recebe leads", "falta lead para trabalhar"],
  ["atende", "Recebe, mas não atende", "leads parados em Novo"], ["visita", "Atende, mas não marca visita", "trava na conversa"], ["pasta", "Visita, mas não vira pasta", "trava na documentação"]];
const TRAVA: Record<Motivo, number> = { plantao: 0, leads: 1, atende: 2, visita: 3, pasta: 4 };
const ETQ = ["Plantão", "Leads", "Atendeu", "Visita", "Pasta"];

const ha = (s: string | null) => { if (!s) return ""; const d = Math.round((Date.now() - new Date(s).getTime()) / 864e5); return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`; };
function analisa(r: R): { m: Motivo; crit: boolean; frase: string } | null {
  const pl = r.plantao_dias ?? 0, pctAt = r.leads ? r.atendidos / r.leads : 1;
  if (pl < 8) return { m: "plantao", crit: pl < 4, frase: pl === 0 ? `Nenhum plantão nos últimos 30 dias${r.dias_sem_plantao ? ` (último ${ha(r.ultimo_plantao)})` : ""}. Antes de tudo, precisa voltar ao plantão.` : `Foi só ${pl} dia${pl > 1 ? "s" : ""} ao plantão em 30. Antes de tudo, precisa voltar ao plantão.` };
  if (r.leads < 10) return { m: "leads", crit: r.leads < 4, frase: `Foi ${pl} dias ao plantão, mas recebeu só ${r.leads} lead${r.leads === 1 ? "" : "s"} em 30 dias.${r.filas_equipe ? ` Está em ${r.filas_em} de ${r.filas_equipe} filas de formulário da equipe.` : ""}${r.na_roleta ? "" : " Está fora da roleta."}` };
  if (r.parados >= 5 || pctAt < 0.5) return { m: "atende", crit: r.parados >= 20, frase: `Recebeu ${r.leads} leads e ${r.parados ? `${r.parados} estão parados em Novo` : `atendeu só ${r.atendidos}`}. O problema é atender.` };
  if (r.visitas === 0 && r.atendidos >= 10) return { m: "visita", crit: r.atendidos >= 40, frase: `Atendeu ${r.atendidos} de ${r.leads}, mas não marcou nenhuma visita. Precisa de ajuda para marcar visita.` };
  if (r.visitas >= 2 && r.pastas === 0) return { m: "pasta", crit: r.visitas >= 5, frase: `Teve ${r.visitas} visitas, mas nenhuma virou pasta. Precisa de ajuda na documentação.` };
  return null;
}
const COBRA: Record<Motivo, (n: string, r: R) => string> = {
  plantao: (n, r) => `Oi ${n}! Vi que você foi ${r.plantao_dias ?? 0} dia(s) ao plantão nos últimos 30. O que está acontecendo? Vamos combinar sua volta?`,
  leads: (n) => `Oi ${n}! Você está indo ao plantão, mas recebendo pouco lead. Vou te colocar em mais filas; me avisa quando estiver pronto para receber.`,
  atende: (n, r) => `Oi ${n}! Você tem ${r.parados} lead(s) parados em Novo no Comandra. Consegue falar com eles hoje? Se precisar, eu passo alguns para outro corretor.`,
  visita: (n, r) => `Oi ${n}! Você atendeu ${r.atendidos} clientes este mês e ainda não marcou visita. Vamos ver juntos duas conversas e marcar as visitas?`,
  pasta: (n, r) => `Oi ${n}! Você teve ${r.visitas} visita(s) e nenhuma virou pasta. O que faltou? Vamos montar a documentação juntos?`,
};
const CORES = ["#1d4ed8", "#0e7c7b", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#4f46e5", "#a16207"];
const cor = (n: string) => CORES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];

const CSS = `.re{display:grid;gap:14px;color:var(--cv-text-main,#0f1b2d)}
.re .re-mot{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}
.re .re-mo{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#e2e8f0);color:inherit;border-radius:14px;padding:12px 14px;text-align:left;cursor:pointer;display:grid;gap:3px}
.re .re-mo:hover{border-color:#1d4ed8}.re .re-mo.on{border-color:var(--cv-text-main,#0f1b2d);box-shadow:inset 0 0 0 1px var(--cv-text-main,#0f1b2d)}
.re .re-mo .v{font-size:26px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}.re .re-mo .k{font-weight:700;font-size:13.5px}.re .re-mo .h{font-size:12px;color:var(--cv-text-muted,#64748b)}
.re .re-p{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#e2e8f0);border-radius:16px;overflow:hidden}
.re .re-hd{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:14px 18px 6px}.re .re-hd h3{margin:0;font-size:16px}
.re .re-m{color:var(--cv-text-muted,#64748b);font-size:12.5px}
.re .re-row{display:grid;grid-template-columns:minmax(160px,1fr) minmax(360px,2.4fr) minmax(220px,1.3fr);gap:16px;align-items:center;padding:14px 18px;border-top:1px solid var(--cv-border,#e2e8f0)}
@media (max-width:960px){.re .re-row{grid-template-columns:1fr}}
.re .re-who{display:flex;gap:10px;align-items:center;min-width:0}.re .re-ava{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:13px;flex:none}
.re .re-who b{display:block;font-size:15px}.re .re-who small{color:var(--cv-text-muted,#64748b)}
.re .re-lv{display:inline-block;font-size:11px;font-weight:800;border-radius:6px;padding:1px 6px;margin-left:5px;vertical-align:1px;background:color-mix(in srgb,#d97706 14%,var(--cv-surface,#fff));color:#b45309}
.re .re-lv.c{background:color-mix(in srgb,#dc2626 12%,var(--cv-surface,#fff));color:#b91c1c}
.re .re-est{display:grid;grid-template-columns:repeat(5,minmax(58px,1fr));gap:4px;min-width:0}
.re .re-st{border-radius:10px;padding:7px 8px;background:color-mix(in srgb,var(--cv-text-main,#0f1b2d) 5%,var(--cv-surface,#fff));display:grid;gap:1px;min-width:0}
.re .re-st .k{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cv-text-muted,#64748b)}
.re .re-st .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}.re .re-st .s{font-size:11px;color:var(--cv-text-muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.re .re-st.ok{background:color-mix(in srgb,#16a34a 12%,var(--cv-surface,#fff))}.re .re-st.ok .v{color:#15803d}
.re .re-st.br{background:color-mix(in srgb,#dc2626 10%,var(--cv-surface,#fff));box-shadow:inset 0 0 0 1.5px #dc2626}.re .re-st.br .v{color:#b91c1c}
.re .re-st.off{opacity:.55}
.re .re-why{display:grid;gap:6px;min-width:0}.re .re-why p{margin:0;font-size:13px}
.re .re-help{display:flex;gap:6px;flex-wrap:wrap}.re .re-help span{font-size:11.5px;border-radius:99px;padding:2px 8px;border:1px solid var(--cv-border,#e2e8f0);color:var(--cv-text-muted,#64748b);white-space:nowrap}
.re .re-help span.no{background:color-mix(in srgb,#d97706 13%,var(--cv-surface,#fff));border-color:transparent;color:#b45309;font-weight:700}
.re .re-acts{display:flex;gap:6px;flex-wrap:wrap}.re .re-acts button{border:1px solid var(--cv-border,#e2e8f0);background:var(--cv-surface,#fff);color:inherit;border-radius:8px;padding:5px 10px;font-weight:700;font-size:12.5px;cursor:pointer}
.re .re-acts button.pri{background:var(--cv-text-main,#0f1b2d);border-color:var(--cv-text-main,#0f1b2d);color:var(--cv-surface,#fff)}
.re .re-ft{padding:12px 18px;border-top:1px solid var(--cv-border,#e2e8f0);font-size:12.5px;color:var(--cv-text-muted,#64748b)}`;

export default function RendimentoEquipe({ donoId, onRaioX }: { donoId?: string | null; onRaioX?: (id: string) => void }) {
  const [fm, setFm] = useState<Motivo | "todos">("todos");
  const { data, isLoading, error } = useQuery({
    queryKey: ["rendimento-equipe", donoId ?? ""],
    queryFn: async () => { const { data, error } = await sb.rpc("rendimento_equipe", { p_dono: donoId || null }); if (error) throw error; return (data ?? []) as R[]; },
    staleTime: 5 * 60_000,
  });
  const linhas = useMemo(() => (data ?? []).filter((r) => r.vinculado && (r.dias_casa ?? 0) >= 30)
    .map((r) => ({ r, a: analisa(r) }))
    .filter((x) => x.a)
    .sort((x, y) => Number(y.a!.crit) - Number(x.a!.crit) || TRAVA[x.a!.m] - TRAVA[y.a!.m] || y.r.leads - x.r.leads), [data]);
  if (isLoading) return <p className="re-m">Carregando o rendimento da equipe…</p>;
  if (error) return <p className="re-m">Não consegui carregar agora. Recarregue a página.</p>;
  const semVinc = (data ?? []).filter((r) => !r.vinculado).length, novos = (data ?? []).filter((r) => r.vinculado && (r.dias_casa ?? 0) < 30).length;
  const vis = linhas.filter((x) => fm === "todos" || x.a!.m === fm);
  const atual = (data ?? []).map((r) => r.atualizado_em).filter(Boolean).sort().pop() ?? null;
  const copiar = async (r: R, m: Motivo) => {
    const t = COBRA[m](r.nome, r);
    try { await navigator.clipboard.writeText(t); toast.success("Cobrança copiada. Cole no WhatsApp do corretor."); }
    catch { toast.message(t); }
  };

  return (
    <div className="re"><style>{CSS}</style>
      <div className="re-mot">
        {MOTIVOS.map(([k, t, h]) => { const n = k === "todos" ? linhas.length : linhas.filter((x) => x.a!.m === k).length;
          return <button key={k} type="button" className={`re-mo${fm === k ? " on" : ""}`} onClick={() => setFm(k)} aria-pressed={fm === k}>
            <span className="v" style={k !== "todos" && n ? { color: "#b91c1c" } : undefined}>{n}</span><span className="k">{t}</span><span className="h">{h}</span></button>; })}
      </div>
      <section className="re-p">
        <div className="re-hd"><div><h3>{fm === "todos" ? "Todos que precisam de atenção" : MOTIVOS.find((m) => m[0] === fm)![1]} ({vis.length})</h3>
          <span className="re-m">Últimos 30 dias · a caixa vermelha mostra onde trava{atual ? ` · atualizado ${new Date(atual).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span></div></div>
        {!vis.length ? <p className="re-m" style={{ padding: "8px 18px 16px" }}>{linhas.length ? "Ninguém nesse motivo." : "Ninguém travado agora. Todo mundo com plantão, leads atendidos, visitas e pastas."}</p>
          : vis.map(({ r, a }) => {
            const tr = TRAVA[a!.m], vals = [r.plantao_dias ?? 0, r.leads, r.atendidos, r.visitas, r.pastas];
            const sub = [`de 30 dias`, `${r.leads_anuncio} de anúncio`, r.leads ? `${Math.round((100 * r.atendidos) / r.leads)}% dos leads` : "—", "em 30 dias", "no Junix"];
            const ajuda: [string, boolean][] = [
              [r.cobrancas ? `${r.cobrancas} cobrança${r.cobrancas > 1 ? "s" : ""} · última ${ha(r.cobranca_ultima)}${r.cobrancas_sem_resposta ? ` · ${r.cobrancas_sem_resposta} sem resposta` : ""}` : "nenhuma cobrança em 30 dias", !r.cobrancas || r.cobrancas_sem_resposta > 0],
              [r.passados ? `${r.passados} lead${r.passados > 1 ? "s" : ""} passado${r.passados > 1 ? "s" : ""} para ele` : "nenhum lead passado para ele", a!.m === "leads" && !r.passados],
              [r.filas_equipe ? `em ${r.filas_em} de ${r.filas_equipe} filas` : "sem filas de formulário na equipe", a!.m === "leads" && r.filas_em < r.filas_equipe],
              [r.na_roleta ? "na roleta" : "fora da roleta", !r.na_roleta],
            ];
            return (
              <div key={r.id} className="re-row">
                <div className="re-who"><span className="re-ava" style={{ background: cor(r.nome) }}>{r.nome.slice(0, 2).toUpperCase()}</span>
                  <div><b>{r.nome}<span className={`re-lv${a!.crit ? " c" : ""}`}>{a!.crit ? "crítico" : "atenção"}</span></b><small>equipe {r.equipe ?? "—"}</small></div></div>
                <div className="re-est" role="list" aria-label={`Esteira de ${r.nome}`}>
                  {vals.map((v, i) => <div key={i} role="listitem" className={`re-st ${i < tr ? "ok" : i === tr ? "br" : "off"}`}><span className="k">{ETQ[i]}</span><span className="v">{v}</span><span className="s">{sub[i]}</span></div>)}
                </div>
                <div className="re-why"><p>{a!.frase}</p>
                  <div className="re-help">{ajuda.map(([t, no]) => <span key={t} className={no ? "no" : ""}>{t}</span>)}</div>
                  <div className="re-acts"><button type="button" className="pri" onClick={() => copiar(r, a!.m)}>Copiar cobrança</button>
                    {onRaioX ? <button type="button" onClick={() => onRaioX(r.id)}>Raio-X</button> : null}</div></div>
              </div>);
          })}
        <div className="re-ft">{semVinc ? `${semVinc} corretor${semVinc > 1 ? "es" : ""} sem vínculo com o C2S/Junix fica${semVinc > 1 ? "m" : ""} fora (Configurar → Confirme quem é quem). ` : ""}{novos ? `${novos} com menos de 30 dias de casa estão na Rampa de Novos.` : ""}</div>
      </section>
    </div>
  );
}
