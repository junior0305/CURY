/* Placar de Metas da Reunião Estratégica:
 * Mostra o ritmo de vendas da diretoria, vendas faltantes, ritmo semanal,
 * meta derramada e a tabela completa de Superintendências e Gerentes:
 * Equipe | Meta (editável inline) | Vendeu | Ritmo | Projeção | Devendo | Combinar Ação.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SuperDiretoria, PessoaMeta } from "@/hooks/useDiretoria";
import type { LinhaConsolidado } from "@/hooks/useConsolidadoSuper";

export type MetaPainel = { dono: PessoaMeta; filhos: PessoaMeta[] };
export interface Combinar {
  sobre: string;
  pergunta: number;
  titulo: string;
  responsavelId?: string | null;
  prazoDias?: number;
}

export function Cab({
  n,
  titulo,
  children,
  veredito,
  tom,
}: {
  n: number | string;
  titulo: string;
  children: React.ReactNode;
  veredito?: string;
  tom?: "red" | "org" | "grn";
}) {
  return (
    <div className="est-qh">
      <div>
        <div className="est-qn">{typeof n === "number" ? `ETAPA ${n}` : n}</div>
        <h2>{titulo}</h2>
        <p className="est-ans">{children}</p>
      </div>
      {veredito ? <span className={`est-ver c-${tom ?? "org"}`}>{veredito}</span> : null}
    </div>
  );
}

export function MetaInline({ pessoa, mes }: { pessoa: PessoaMeta; mes: string }) {
  const qc = useQueryClient();
  const [txt, setTxt] = useState(pessoa.meta == null ? "" : String(pessoa.meta));
  if (!pessoa.pode_editar) return <>{pessoa.meta ?? "—"}</>;
  const salvar = async () => {
    const n = parseInt(txt, 10);
    if (Number.isNaN(n) || n === pessoa.meta) return;
    const { error } = await supabase.rpc("definir_meta" as any, {
      p_mes: mes,
      p_dono: pessoa.id,
      p_vendas: n,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Meta de ${pessoa.nome}: ${n}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  };
  return (
    <input
      className="est-meta-in"
      type="number"
      min={0}
      inputMode="numeric"
      value={txt}
      placeholder="—"
      aria-label={`meta de ${pessoa.nome}`}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function PlacarMetas({
  metaDir,
  supers,
  metaSuper,
  linha,
  c30,
  diaHoje,
  diasMes,
  mes,
  abrir,
}: {
  metaDir?: MetaPainel;
  supers: SuperDiretoria[];
  metaSuper: Map<string, MetaPainel | undefined>;
  linha: Map<string, LinhaConsolidado>;
  c30: LinhaConsolidado[] | null;
  diaHoje: number;
  diasMes: number;
  mes: string;
  abrir?: (c: Combinar) => void;
}) {
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  if (!metaDir) {
    return (
      <section className="dir-card est-q">
        <div className="dir-vazio">Buscando as metas da diretoria…</div>
      </section>
    );
  }

  const proj = (r: number) => Math.round((r / diaHoje) * diasMes);
  const meta = metaDir.dono.meta ?? 0;
  const vendido = metaDir.dono.realizado;
  const faltam = Math.max(0, meta - vendido);
  const semanas = Math.max(1, (diasMes - diaHoje) / 7);
  const porSemana = Math.ceil(faltam / semanas);
  const ritmoSemana = (vendido / diaHoje) * 7;
  const esperado = Math.round((meta * diaHoje) / diasMes);

  const tot = (c30 ?? []).reduce(
    (a, l) => ({ v: a.v + l.visitas, s: a.s + l.vendas }),
    { v: 0, s: 0 }
  );
  const visitaPorVenda = tot.s > 0 && tot.v >= tot.s ? tot.v / tot.s : null;

  const filhosDir = metaDir.filhos.filter((f) => f.papel === "SUPERINTENDENT");
  const somaSupers = filhosDir.reduce((a, f) => a + (f.meta ?? 0), 0);
  const derrame = supers.map((s) => {
    const m = metaSuper.get(s.id);
    const gers = (m?.filhos ?? []).filter((f) => f.papel === "MANAGER");
    return {
      s,
      metaS: m?.dono.meta ?? null,
      gers,
      soma: gers.reduce((a, g) => a + (g.meta ?? 0), 0),
      semMeta: gers.filter((g) => g.meta == null),
    };
  });

  const problemas = [
    ...(meta && somaSupers !== meta ? [`os supers somam ${somaSupers} para ${meta} da diretoria`] : []),
    ...derrame
      .filter((d) => d.metaS != null && d.gers.length && d.soma !== d.metaS)
      .map((d) => `os gerentes de ${d.s.nome} somam ${d.soma} para ${d.metaS}`),
    ...derrame
      .filter((d) => d.semMeta.length)
      .map((d) => `${d.semMeta.length} gerente${d.semMeta.length > 1 ? "s" : ""} de ${d.s.nome} sem meta`),
  ];

  const linhaPessoa = (p: PessoaMeta, nivel: "sup" | "sub", superId: string) => {
    const pr = proj(p.realizado);
    const dev = p.meta != null ? Math.max(0, p.meta - p.realizado) : null;
    const ruim = p.meta != null && pr < p.meta;
    return (
      <tr key={p.id} className={nivel}>
        <td>
          {nivel === "sup" ? (
            <button
              type="button"
              className="dir-abrir"
              onClick={() => setAberto((v) => ({ ...v, [superId]: !v[superId] }))}
            >
              <span className={`dir-seta${aberto[superId] ? " on" : ""}`} aria-hidden>
                ▸
              </span>{" "}
              {p.nome}
            </button>
          ) : (
            p.nome
          )}
        </td>
        <td>
          <MetaInline pessoa={p} mes={mes} />
        </td>
        <td>{p.realizado}</td>
        <td>
          <div className="dir-bar" style={{ minWidth: 90 }}>
            <i
              className={ruim ? "ruim" : ""}
              style={{
                width: `${p.meta ? Math.min(100, (p.realizado / p.meta) * 100) : 0}%`,
                background: ruim ? "var(--red)" : undefined,
              }}
            />
          </div>
        </td>
        <td className={ruim ? "ruim" : ""}>{pr}</td>
        <td className={dev ? "ruim" : ""}>
          {dev == null ? <span className="dir-chip c-gray">sem meta</span> : dev}
        </td>
        <td className="ac">
          {p.meta == null && p.pode_editar ? (
            <span className="dir-nota">defina ao lado</span>
          ) : dev && abrir ? (
            <button
              type="button"
              className="dir-btn-action"
              onClick={() =>
                abrir({
                  sobre: p.nome,
                  pergunta: 1,
                  responsavelId: p.id,
                  titulo: `Plano para recuperar ${dev} venda${dev > 1 ? "s" : ""} até o fim do mês`,
                })
              }
            >
              Combinar ação
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <section className="dir-card est-q" style={{ border: "1.5px solid #CBD5E1", boxShadow: "0 2px 10px rgba(15,27,45,0.04)" }}>
      <Cab
        n="1. META"
        titulo="Placar de Metas: Vamos bater a meta? Quem está devendo?"
        veredito={proj(vendido) >= meta ? "No ritmo da meta" : "Não fecha no ritmo atual"}
        tom={proj(vendido) >= meta ? "grn" : "red"}
      >
        No ritmo atual fechamos <b>{proj(vendido)} de {meta}</b>. Faltam <b>{faltam} vendas em {diasMes - diaHoje} dias</b>, cerca de <b>{porSemana} por semana</b>. Hoje fazemos {ritmoSemana.toFixed(1).replace(".", ",")}.
      </Cab>

      <div className="est-g2">
        <div className="est-box">
          <div className="dir-lbl">Meta da diretoria</div>
          <div className="est-big mono">
            {vendido}
            <span style={{ fontSize: 18, color: "var(--ink-3)" }}> / {meta}</span>
          </div>
          <div className="est-pace" aria-label={`Vendido ${vendido}, esperado ${esperado} até hoje`}>
            <i style={{ width: `${meta ? Math.min(100, (vendido / meta) * 100) : 0}%` }} />
            <em style={{ left: `${(diaHoje / diasMes) * 100}%` }} />
            <b style={{ left: `${(diaHoje / diasMes) * 100}%` }}>devia estar em {esperado}</b>
          </div>
          <div className="dir-lbl">O que precisa acontecer por semana</div>
          <div className="est-g3">
            <div>
              <div className="est-big mono" style={{ fontSize: 24 }}>{porSemana}</div>
              <div className="dir-nota">vendas</div>
            </div>
            <div>
              <div className="est-big mono" style={{ fontSize: 24 }}>
                {visitaPorVenda ? Math.ceil(porSemana * visitaPorVenda) : "—"}
              </div>
              <div className="dir-nota">
                visitas no C2S{visitaPorVenda ? ` (${visitaPorVenda.toFixed(1).replace(".", ",")} por venda)` : ""}
              </div>
            </div>
            <div>
              <div className="est-big mono" style={{ fontSize: 24 }}>{tot.v}</div>
              <div className="dir-nota">visitas lançadas em 30 dias</div>
            </div>
          </div>
        </div>

        <div className="est-box">
          <div className="dir-lbl">Meta derramada</div>
          {problemas.length ? (
            <div className="est-warn">
              <b style={{ color: "var(--org)" }}>!</b>
              <div>A meta derramada <b>não fecha</b>: {problemas.join("; ")}.</div>
            </div>
          ) : (
            <div className="est-warn info">
              <div>A meta derramada fecha em todos os níveis.</div>
            </div>
          )}
          <div className="est-item">
            <div>
              <div className="t">Diretoria → supers</div>
              <div className="m">{filhosDir.map((f) => `${f.nome} ${f.meta ?? "—"}`).join(" · ")}</div>
            </div>
            <span className={`dir-chip ${somaSupers === meta ? "c-grn" : "c-org"}`}>
              {somaSupers} de {meta}
            </span>
          </div>
          {derrame.map((d) => (
            <div key={d.s.id} className="est-item">
              <div style={{ minWidth: 0 }}>
                <div className="t">{d.s.nome} → gerentes</div>
                <div className="m">{d.gers.map((g) => `${g.nome} ${g.meta ?? "—"}`).join(" · ") || "nenhum gerente"}</div>
              </div>
              <span
                className={`dir-chip ${
                  !d.gers.length || d.semMeta.length === d.gers.length
                    ? "c-red"
                    : d.soma === d.metaS
                    ? "c-grn"
                    : "c-org"
                }`}
              >
                {d.semMeta.length === d.gers.length ? "sem meta" : `${d.soma} de ${d.metaS ?? "—"}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="est-tab">
        <table>
          <thead>
            <tr>
              <th>Equipe</th>
              <th>Meta</th>
              <th>Vendeu</th>
              <th>Ritmo</th>
              <th>Projeção</th>
              <th>Devendo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {supers.map((s) => {
              const m = metaSuper.get(s.id);
              if (!m) return null;
              return [
                linhaPessoa(m.dono, "sup", s.id),
                ...(aberto[s.id]
                  ? m.filhos
                      .filter((f) => f.papel === "MANAGER")
                      .map((g) => linhaPessoa(g, "sub", s.id))
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="dir-nota" style={{ margin: 0 }}>
        Vendas do Junix no mês. Clique no super para abrir os gerentes; a meta pode ser editada direto na tabela.
      </p>
    </section>
  );
}
