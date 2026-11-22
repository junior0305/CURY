// Saúde da tropa — indicadores de recrutamento e retenção, dentro do Funil de Contratação.
//  1) Entrada: contratações (semana/mês) + conversão candidato→corretor.
//  2) Retenção: contratados recentes ativos 30/60d + saíram cedo (desligou ou 20+ dias sem check-in).
//  3) Precisa de atenção: corretor em risco de sair (novato que não apareceu, sumindo do plantão), com
//     a mensagem pronta e EDITÁVEL aqui — copia ou abre o WhatsApp já preenchido.
// Fontes REAIS: candidatos (recrutamento), recrutamento_painel (turnover), rendimento_equipe (risco por corretor).
// Nada estimado: sem o dado, mostra "—". Mesma regra de escopo (gerente = equipe dele; super/diretor = árvore).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Candidato } from "./Candidatos";

const sb = supabase as any;
type R = { id: string; nome: string; dias_casa: number | null; plantao_dias: number | null; dias_sem_plantao: number | null; leads: number; atendidos: number };
type Turn = { contratados: number; ativos30: number; base30: number; ativos60: number; base60: number; saiu: number };

const prim = (nome: string) => (nome || "corretor").split(" ")[0];

// risco de SAIR (retenção) — distinto do "onde trava no funil" (isso vive na aba Rendimento)
function risco(r: R): { nivel: "critico" | "atencao"; motivo: string; frase: string; msg: string } | null {
  const dc = r.dias_casa ?? 999, sp = r.dias_sem_plantao ?? 0, pl = r.plantao_dias ?? 0;
  if (dc <= 30 && pl === 0) return { nivel: "critico", motivo: "novato não apareceu", frase: `Entrou há ${dc} dia(s) e ainda não foi ao plantão nenhuma vez.`, msg: `Oi ${prim(r.nome)}! Vi que você entrou faz pouco e ainda não apareceu no plantão. Tá tudo certo? Vamos marcar seu primeiro dia juntos?` };
  if (sp >= 10) return { nivel: "critico", motivo: "sumindo", frase: `${sp} dias sem check-in de plantão — risco de sair.`, msg: `Oi ${prim(r.nome)}! Faz ${sp} dias que não te vejo no plantão. Tá tudo bem? Vamos conversar?` };
  if (dc <= 45 && r.atendidos === 0 && r.leads > 0) return { nivel: "atencao", motivo: "novato sem atender", frase: `${dc} dias de casa, recebeu ${r.leads} lead(s) e não atendeu nenhum.`, msg: `Oi ${prim(r.nome)}! Você já tem ${r.leads} cliente(s) esperando por você. Bora falar com eles hoje? Posso te ajudar.` };
  if (sp >= 7) return { nivel: "atencao", motivo: "caindo a presença", frase: `${sp} dias sem check-in.`, msg: `Oi ${prim(r.nome)}! Senti sua falta no plantão essa semana. Consegue vir amanhã?` };
  return null;
}

export default function SaudeTropa({ como, candidatos }: { como?: string | null; candidatos: Candidato[] }) {
  const de30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data: painel } = useQuery({ queryKey: ["saude-painel", como ?? null, de30], staleTime: 60_000, queryFn: async () => { try { return (await sb.rpc("recrutamento_painel", { p_como: como ?? null, p_de: de30 })).data; } catch { return null; } } });
  const { data: rend, isError: rendErro } = useQuery({ queryKey: ["saude-rend", como ?? null], staleTime: 60_000, retry: false, queryFn: async () => { const r = await sb.rpc("rendimento_equipe", { p_dono: como ?? null }); if (r.error) throw r.error; return (r.data ?? []) as R[]; } });
  const turn: Turn | undefined = painel?.turnover;

  const inicioSemana = useMemo(() => { const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const inicioMes = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }, []);
  const contr = candidatos.filter((c) => c.etapa === "contratado" && c.contratado_em);
  const contrSem = contr.filter((c) => new Date(c.contratado_em!).getTime() >= inicioSemana).length;
  const contrMes = contr.filter((c) => new Date(c.contratado_em!).getTime() >= inicioMes).length;
  const conv = candidatos.length ? Math.round((contr.length / candidatos.length) * 100) : 0;

  const emRisco = useMemo(() => (rend ?? []).map((r) => ({ r, a: risco(r) })).filter((x) => x.a)
    .sort((x, y) => (x.a!.nivel === "critico" ? 0 : 1) - (y.a!.nivel === "critico" ? 0 : 1) || (y.r.dias_sem_plantao ?? 0) - (x.r.dias_sem_plantao ?? 0)), [rend]);

  const [msg, setMsg] = useState<Record<string, string>>({});
  const falar = async (id: string, texto: string) => {
    let fone = "";
    try { const { data } = await sb.from("profiles").select("phone").eq("id", id).maybeSingle(); fone = (data?.phone ?? "").replace(/\D/g, ""); } catch { /* sem coluna */ }
    if (fone) window.open(`https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    else try { await navigator.clipboard.writeText(texto); toast.success("Sem telefone do corretor aqui — mensagem copiada, cole no WhatsApp."); } catch { toast.info(texto); }
  };
  const copiar = async (texto: string) => { try { await navigator.clipboard.writeText(texto); toast.success("Mensagem copiada."); } catch { toast.info(texto); } };

  return (
    <section className="st"><style>{CSS}</style>
      <div className="st-h"><b>🩺 Saúde da tropa</b><span>recrutamento e retenção · dado real, nada estimado</span></div>
      <div className="st-blocos">
        <div className="st-bl">
          <span className="st-t">Entrada — contratações</span>
          <div className="st-kpis"><div><b>{contrSem}</b><i>esta semana</i></div><div><b>{contrMes}</b><i>este mês</i></div><div><b>{conv}%</b><i>candidato → corretor</i></div></div>
        </div>
        <div className="st-bl">
          <span className="st-t">Retenção — contratados recentes</span>
          {turn ? <div className="st-kpis"><div><b>{turn.base30 ? turn.ativos30 : "—"}</b><i>ativos 30d{turn.base30 ? ` / ${turn.base30}` : ""}</i></div><div><b>{turn.base60 ? turn.ativos60 : "—"}</b><i>ativos 60d{turn.base60 ? ` / ${turn.base60}` : ""}</i></div><div><b className={turn.saiu ? "st-red" : ""}>{turn.saiu}</b><i>saíram cedo</i></div></div> : <span className="st-m">Carregando…</span>}
          <span className="st-m">"Saíram cedo" = contratado recente que desligou ou está 20+ dias sem check-in.</span>
        </div>
      </div>
      <div className="st-bl st-risco">
        <span className="st-t">Precisa de atenção — risco de sair / bater um papo <b className="st-badge">{emRisco.length}</b></span>
        {rendErro ? <p className="st-m">A lista de risco por corretor ainda não está disponível nesta empresa (depende do raio-X de presença/produção).</p> :
          !emRisco.length ? <p className="st-m">Ninguém em risco agora — todo mundo com presença e engrenando. 👏</p> :
          emRisco.map(({ r, a }) => (
            <div key={r.id} className={`st-row ${a!.nivel}`}>
              <div className="st-who"><b>{r.nome} <span className={`st-lv ${a!.nivel}`}>{a!.nivel === "critico" ? "crítico" : "atenção"}</span></b><small>{a!.motivo} · {r.dias_casa ?? "?"} dias de casa</small><p>{a!.frase}</p></div>
              <div className="st-ac">
                <textarea className="st-txt" value={msg[r.id] ?? a!.msg} onChange={(e) => setMsg((m) => ({ ...m, [r.id]: e.target.value }))} rows={2} aria-label={`Mensagem para ${r.nome}`} />
                <div className="st-btns"><button className="st-b p" onClick={() => falar(r.id, msg[r.id] ?? a!.msg)}>💬 Falar no WhatsApp</button><button className="st-b" onClick={() => copiar(msg[r.id] ?? a!.msg)}>📋 Copiar</button></div>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

const CSS = `
.st{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;margin-bottom:18px;font-family:inherit}
.st-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.st-h b{font-size:15px;font-weight:800;color:var(--tx)} .st-h span{font-size:12px;color:var(--tm)}
.st-blocos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
@media(max-width:720px){.st-blocos{grid-template-columns:1fr}}
.st-bl{background:var(--sub);border:1px solid var(--bd);border-radius:12px;padding:12px 14px}
.st-t{display:block;font-size:12.5px;font-weight:800;color:var(--tx);margin-bottom:8px}
.st-kpis{display:flex;gap:14px;flex-wrap:wrap}
.st-kpis>div{display:flex;flex-direction:column} .st-kpis b{font-size:22px;font-weight:800;color:var(--tx);line-height:1} .st-kpis i{font-size:11.5px;color:var(--tm);font-style:normal;margin-top:3px}
.st-red{color:#C2412B} .st-m{display:block;font-size:11.5px;color:var(--tm);margin-top:8px;line-height:1.5}
.st-risco{margin-top:2px}
.st-badge{background:var(--sub);border:1px solid var(--bd);border-radius:999px;padding:1px 9px;font-size:12px;color:var(--tx)}
.st-row{display:grid;grid-template-columns:1.1fr 1.3fr;gap:14px;align-items:start;padding:12px 0;border-top:1px solid var(--bd)}
@media(max-width:720px){.st-row{grid-template-columns:1fr}}
.st-row.critico{background:linear-gradient(90deg,rgba(194,65,43,.07),transparent)}
.st-who b{font-size:14px;font-weight:800;color:var(--tx);display:flex;align-items:center;gap:8px} .st-who small{display:block;font-size:11.5px;color:var(--tm);margin:2px 0 4px} .st-who p{font-size:12.5px;color:var(--tx);margin:0;line-height:1.4}
.st-lv{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px} .st-lv.critico{background:rgba(194,65,43,.14);color:#C2412B} .st-lv.atencao{background:rgba(245,158,11,.16);color:#B45309}
.st-ac{display:flex;flex-direction:column;gap:7px}
.st-txt{width:100%;border:1px solid var(--bd);border-radius:9px;background:var(--card);color:var(--tx);font-size:12.5px;padding:8px 10px;font-family:inherit;resize:vertical}
.st-btns{display:flex;gap:7px;flex-wrap:wrap}
.st-b{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:700;cursor:pointer}
.st-b.p{background:#1f9d55;border-color:#1f9d55;color:#fff}
`;
