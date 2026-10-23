// QUEM ESTÁ SEM GERAR RESULTADO (24/10, pedido do Junior)
// Lista curta, em frase, de quem está parado: dias sem pasta / plantão / venda e leads sem contato.
// Dados: raiox_parados (robô /root/econ/raiox_parados.py, 6h50/12h50/18h50) via RPC raiox_parados_lista(dono),
// que devolve só a árvore de quem pede. Gerente e super veem nome por nome; diretor vê por equipe e abre os nomes.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Linha = {
  profile_id: string; nome: string; gerente_id: string | null; gerente: string | null; super_id: string | null; super: string | null;
  dias_casa: number; novato: boolean; leads_sem_contato: number; leads_30d: number;
  dias_sem_plantao: number | null; dias_sem_pasta: number | null; dias_sem_venda: number | null;
  vinculado: boolean; nivel: number; atualizado_em: string;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** fatos em frase, na ordem do que mais pesa */
function fatos(l: Linha): { t: string; forte: boolean }[] {
  const f: { t: string; forte: boolean }[] = [];
  const pasta = l.dias_sem_pasta;
  if (pasta === null) { if (l.dias_casa >= 20) f.push({ t: "nenhuma pasta no Junix", forte: l.dias_casa >= 30 }); }
  else if (pasta >= 20) f.push({ t: `${pasta} dias sem pasta`, forte: pasta >= 30 });
  if (l.dias_sem_plantao === null) f.push({ t: "nenhum plantão desde 01/09", forte: true });
  else if (l.dias_sem_plantao >= 5) f.push({ t: `${l.dias_sem_plantao} dias sem plantão`, forte: l.dias_sem_plantao >= 10 });
  if (l.leads_sem_contato >= 2) f.push({ t: `${plural(l.leads_sem_contato, "lead parado", "leads parados")} em Novo há mais de 24h`, forte: l.leads_sem_contato >= 5 });
  const venda = l.dias_sem_venda;
  if (venda === null) { if (l.dias_casa >= 45) f.push({ t: "nenhuma venda no Junix", forte: false }); }
  else if (venda >= 45) f.push({ t: `${venda} dias sem venda`, forte: false });
  if (l.leads_30d) f.push({ t: `recebeu ${plural(l.leads_30d, "lead", "leads")} em 30 dias`, forte: false });
  return f;
}

function textoCobranca(l: Linha) {
  const f = fatos(l).filter((x) => !x.t.startsWith("recebeu")).map((x) => x.t);
  return `Oi ${l.nome}! Olhei seus números no Comandra: ${f.join(", ")}. O que está travando? Me conta hoje que a gente resolve junto.`;
}

export default function QuemParado({ donoId, modo }: { donoId: string | undefined; modo: "gerente" | "super" | "diretor" }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [todos, setTodos] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["quem-parado", donoId],
    enabled: !!donoId,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("raiox_parados_lista", { p_dono: donoId });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const parados = useMemo(() => (data ?? []).filter((l) => l.nivel > 0)
    .sort((a, b) => b.nivel - a.nivel || (b.dias_sem_pasta ?? b.dias_casa) - (a.dias_sem_pasta ?? a.dias_casa)), [data]);
  const crit = parados.filter((l) => l.nivel === 2).length;
  const semVinc = (data ?? []).filter((l) => !l.vinculado).length;
  const novos = (data ?? []).filter((l) => l.vinculado && l.novato).map((l) => l.nome);
  const hora = data?.[0]?.atualizado_em ? new Date(data[0].atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  const equipes = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; sup: string; total: number; crit: Linha[]; aten: Linha[] }>();
    for (const l of data ?? []) {
      const k = l.gerente_id ?? "sem";
      const e = m.get(k) ?? { id: k, nome: l.gerente ?? "Sem gerente", sup: l.super ?? "", total: 0, crit: [], aten: [] };
      e.total++;
      if (l.nivel === 2) e.crit.push(l); else if (l.nivel === 1) e.aten.push(l);
      m.set(k, e);
    }
    return [...m.values()].filter((e) => e.crit.length + e.aten.length > 0)
      .sort((a, b) => b.crit.length - a.crit.length || b.aten.length - a.aten.length);
  }, [data]);

  const copiar = async (l: Linha) => {
    try { await navigator.clipboard.writeText(textoCobranca(l)); toast.success(`Cobrança para ${l.nome} copiada. Cole no WhatsApp dele.`); }
    catch { toast.error("Não consegui copiar. Selecione o texto à mão."); }
  };

  const pessoa = (l: Linha, mostrarEquipe: boolean) => (
    <li key={l.profile_id} className={`qp-item ${l.nivel === 2 ? "crit" : "aten"}`}>
      <span className="qp-dot" aria-hidden="true" />
      <div className="qp-txt">
        <b>{l.nome}</b>{mostrarEquipe && l.gerente ? <span className="qp-eq"> · equipe {l.gerente}</span> : null}
        <p>{fatos(l).map((x, i) => <span key={i}>{i ? " · " : ""}{x.forte ? <strong>{x.t}</strong> : x.t}</span>)}</p>
      </div>
      <button className="qp-btn" onClick={() => copiar(l)} title="Copia uma mensagem pronta para mandar no WhatsApp do corretor">Copiar cobrança</button>
    </li>
  );

  // planoego ainda não tem C2S/Junix: sem a função no banco, o bloco não aparece
  if (!donoId || isError) return null;
  const limite = 8;
  return (
    <section className="qp">
      <style>{CSS}</style>
      <div className="qp-head">
        <div>
          <h2>Quem está sem gerar resultado</h2>
          <p>{isLoading ? "Juntando C2S, Junix e Comandra…"
            : parados.length ? `${crit} ${crit === 1 ? "crítico" : "críticos"} · ${parados.length - crit} em atenção${hora ? ` · atualizado ${hora}` : ""}`
            : "Ninguém parado. Todos com pasta, plantão e leads em dia."}</p>
        </div>
        <details className="qp-regras">
          <summary>Quando alguém entra na lista</summary>
          <div>
            <p><span className="qp-tag crit">Crítico</span> 30 dias ou mais sem pasta · 10 dias ou mais sem plantão · 5 leads ou mais parados em Novo há mais de 24h</p>
            <p><span className="qp-tag aten">Atenção</span> 20 a 29 dias sem pasta · 45 dias ou mais sem venda · 5 a 9 dias sem plantão</p>
            <p><span className="qp-tag">Fora</span> quem entrou há menos de 30 dias e quem ainda não foi ligado ao nome no C2S/Junix</p>
          </div>
        </details>
      </div>

      {modo === "diretor" ? (
        <ul className="qp-list">
          {equipes.map((e) => (
            <li key={e.id} className="qp-eqbloco">
              <button className={`qp-item qp-eqlinha ${e.crit.length ? "crit" : "aten"}`} aria-expanded={!!abertos[e.id]}
                onClick={() => setAbertos((a) => ({ ...a, [e.id]: !a[e.id] }))}>
                <span className="qp-dot" aria-hidden="true" />
                <div className="qp-txt">
                  <b>Equipe {e.nome}</b>{e.sup ? <span className="qp-eq"> · super {e.sup}</span> : null}
                  <p>{e.crit.length ? <strong>{plural(e.crit.length, "crítico", "críticos")}</strong> : "nenhum crítico"}
                    {e.aten.length ? ` · ${e.aten.length} em atenção` : ""} · de {plural(e.total, "corretor", "corretores")}</p>
                </div>
                <span className="qp-seta">{abertos[e.id] ? "▾" : "▸"}</span>
              </button>
              {abertos[e.id] ? <ul className="qp-list qp-sub">{[...e.crit, ...e.aten].map((l) => pessoa(l, false))}</ul> : null}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="qp-list">{(todos ? parados : parados.slice(0, limite)).map((l) => pessoa(l, modo === "super"))}</ul>
          {parados.length > limite ? (
            <button className="qp-mais" onClick={() => setTodos((t) => !t)}>{todos ? "Mostrar menos" : `Ver todos os ${parados.length}`}</button>
          ) : null}
        </>
      )}

      {!isLoading && (semVinc || novos.length) ? (
        <p className="qp-nota">
          {semVinc ? `${plural(semVinc, "corretor ainda sem vínculo", "corretores ainda sem vínculo")} com o C2S/Junix fica${semVinc === 1 ? "" : "m"} fora (Configurar → Confirme quem é quem). ` : ""}
          {novos.length ? `Fora por serem novos: ${novos.slice(0, 6).join(", ")}${novos.length > 6 ? ` e mais ${novos.length - 6}` : ""}.` : ""}
        </p>
      ) : null}
    </section>
  );
}

const CSS = `
.qp{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E2E8F0);border-radius:var(--cv-radius-md,12px);padding:16px 18px;margin:0 0 18px}
.qp-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.qp-head h2{margin:0;font-size:16px;font-weight:800;color:var(--cv-text-main,#0F172A)}
.qp-head p{margin:3px 0 0;font-size:12.5px;color:var(--cv-text-muted,#64748B)}
.qp-regras{font-size:12.5px;color:var(--cv-text-muted,#64748B);max-width:420px}
.qp-regras summary{cursor:pointer;font-weight:600}
.qp-regras div{padding-top:8px;display:flex;flex-direction:column;gap:6px}
.qp-regras p{margin:0;line-height:1.45}
.qp-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;margin-right:4px;background:var(--cv-surface-subtle,#F1F5F9);color:var(--cv-text-muted,#64748B)}
.qp-tag.crit{background:var(--cv-rose-light,#FFE4E6);color:var(--cv-rose,#E11D48)}
.qp-tag.aten{background:#FEF3C7;color:var(--cv-amber,#D97706)}
.qp-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column}
.qp-item{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 0;border-bottom:1px solid var(--cv-border,#E2E8F0);width:100%}
.qp-list > li:last-child > .qp-item, .qp-list > .qp-item:last-child{border-bottom:0}
.qp-dot{width:10px;height:10px;border-radius:50%;margin-top:5px;background:var(--cv-amber,#D97706)}
.qp-item.crit .qp-dot{background:var(--cv-rose,#E11D48)}
.qp-txt b{font-size:14.5px;color:var(--cv-text-main,#0F172A)}
.qp-eq{font-size:12px;color:var(--cv-text-muted,#64748B)}
.qp-txt p{margin:3px 0 0;font-size:13px;line-height:1.45;color:var(--cv-text-muted,#64748B)}
.qp-txt strong{color:var(--cv-text-main,#0F172A)}
.qp-item.crit .qp-txt strong{color:var(--cv-rose,#E11D48)}
.qp-btn{font:inherit;font-size:12px;font-weight:700;border:1px solid var(--cv-border,#E2E8F0);background:var(--cv-surface-subtle,#F8FAFC);color:var(--cv-text-main,#0F172A);border-radius:8px;padding:6px 10px;cursor:pointer;white-space:nowrap}
.qp-btn:hover{border-color:var(--cv-brand,#0E9F94);color:var(--cv-brand,#0E9F94)}
.qp-eqlinha{background:none;border:0;border-bottom:1px solid var(--cv-border,#E2E8F0);text-align:left;cursor:pointer;font:inherit}
.qp-seta{color:var(--cv-text-muted,#64748B);padding-top:2px}
.qp-sub{margin:0 0 6px 24px}
.qp-mais{margin-top:8px;font:inherit;font-size:12.5px;font-weight:700;background:none;border:0;color:var(--cv-brand,#0E9F94);cursor:pointer;padding:0}
.qp-nota{margin:10px 0 0;font-size:12px;color:var(--cv-text-muted,#64748B)}
@media (max-width:640px){.qp-item{grid-template-columns:12px minmax(0,1fr)}.qp-btn{grid-column:2;justify-self:start}}
`;
