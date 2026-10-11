// Meta do mês em cascata: diretor → super → gerente → corretor.
// Mostra a meta de quem está logado (ou do painel aberto), o realizado (Junix) e a de
// cada um diretamente abaixo — quem pode, edita ali mesmo. Avisa quando a soma das
// partes não fecha com a meta de cima ("distribuiu 18 de 20").
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sec } from "@/components/manager-v10/ui";

type Pessoa = { id: string; nome: string; papel: string; meta: number | null; realizado: number; pode_editar: boolean };
type Painel = { mes: string; dono: Pessoa; filhos: Pessoa[] };

const PAPEL: Record<string, string> = { SUPERINTENDENT: "superintendência", MANAGER: "gerente", BROKER: "corretor", DIRECTOR: "diretoria" };
const inicioMes = (desloc = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10); };
const nomeMes = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "long" });

function Numero({ valor, onSalvar, desabilitado }: { valor: number | null; onSalvar: (n: number) => void; desabilitado?: boolean }) {
  const [txt, setTxt] = useState<string>(valor == null ? "" : String(valor));
  const salvar = () => { const n = parseInt(txt, 10); if (!Number.isNaN(n) && n !== valor) onSalvar(n); };
  return (
    <input type="number" min={0} inputMode="numeric" value={txt} disabled={desabilitado} aria-label="meta de vendas"
      onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder="—" style={{ width: 64, textAlign: "right", border: "1px solid var(--line)", background: "var(--sunk)", borderRadius: 8,
        padding: "6px 8px", font: '700 15px "JetBrains Mono", monospace', color: "var(--ink)" }} />
  );
}

export default function MetaCascata({ dono, compacto }: { dono?: string; compacto?: boolean }) {
  const qc = useQueryClient();
  const [desloc, setDesloc] = useState(0);
  const mes = inicioMes(desloc);
  const { data } = useQuery({
    queryKey: ["metas-painel", mes, dono ?? "eu"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mes, p_dono: dono ?? null });
      if (error) throw error;
      return data as Painel;
    },
  });
  if (!data) return null;

  async function definir(id: string, n: number, nome: string) {
    const { error } = await supabase.rpc("definir_meta" as any, { p_mes: mes, p_dono: id, p_vendas: n });
    if (error) { toast.error(error.message); return; }
    toast.success(`Meta de ${nome} em ${nomeMes(mes)}: ${n} venda${n === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
  }

  const d = data.dono;
  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = desloc === 0 && hoje.getDate() > 0 ? Math.round((d.realizado / hoje.getDate()) * diasMes) : null;
  const pct = d.meta ? Math.min(100, (d.realizado / d.meta) * 100) : 0;
  const ritmo = desloc === 0 ? (hoje.getDate() / diasMes) * 100 : 0;
  const somaFilhos = data.filhos.reduce((a, f) => a + (f.meta ?? 0), 0);
  const algumFilhoEditavel = data.filhos.some((f) => f.pode_editar);

  // corretor: só a faixa com a meta dele
  if (compacto) {
    return d.meta ? (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "var(--card, #fff)",
        border: "1px solid var(--line, #e5e7eb)", fontSize: 14 }}>
        <b>Sua meta de {nomeMes(mes)}:</b> <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>{d.realizado} de {d.meta}</span>
        <div style={{ flex: 1, height: 8, background: "var(--sunk, #f1f5f9)", borderRadius: 4, minWidth: 60 }}>
          <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: "var(--good, #16a34a)" }} />
        </div>
      </div>
    ) : null;
  }

  return (
    <Sec title={`Meta de ${nomeMes(mes)}`}
      tag={<span style={{ display: "inline-flex", gap: 4 }}>
        <button className={`mini${desloc === 0 ? " solid" : ""}`} onClick={() => setDesloc(0)}>Este mês</button>
        <button className={`mini${desloc === 1 ? " solid" : ""}`} onClick={() => setDesloc(1)}>Próximo</button>
      </span>}
      sub={`Venda do Junix. ${algumFilhoEditavel ? "Defina a meta de cada um abaixo de você — ela aparece no painel dele." : ""}`}>
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ font: '700 40px "JetBrains Mono", monospace', lineHeight: 1 }}>{d.realizado}</span>
          <span style={{ fontSize: 15, color: "var(--ink-2)" }}>de</span>
          {d.pode_editar
            ? <Numero valor={d.meta} onSalvar={(n) => definir(d.id, n, d.nome)} />
            : <span style={{ font: '700 24px "JetBrains Mono", monospace' }}>{d.meta ?? "—"}</span>}
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>vendas · {PAPEL[d.papel] ?? ""} {d.nome}</span>
          {projecao != null && d.meta ? (
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: projecao >= d.meta ? "var(--good)" : "var(--red)" }}>
              ritmo para {projecao} {projecao >= d.meta ? "· bate a meta" : `· faltam ${d.meta - projecao}`}</span>
          ) : null}
        </div>
        {d.meta ? (
          <div style={{ height: 10, background: "var(--sunk)", borderRadius: 5, marginTop: 12, position: "relative" }}>
            <div style={{ width: `${pct}%`, height: 10, borderRadius: 5, background: "var(--good)" }} />
            {ritmo ? <div title="onde deveria estar hoje" style={{ position: "absolute", left: `${ritmo}%`, top: -3, width: 2, height: 16, background: "var(--ink)" }} /> : null}
          </div>
        ) : d.pode_editar ? <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>Digite a meta do mês acima.</p> : null}
      </div>

      {data.filhos.length ? (
        <div className="panel" style={{ marginTop: 10 }}>
          {data.filhos.map((f) => {
            const p = f.meta ? Math.min(100, (f.realizado / f.meta) * 100) : 0;
            return (
              <div key={f.id} className="item" style={{ flexWrap: "wrap" }}>
                <span className={`pip${f.meta && f.realizado >= f.meta ? " ok" : ""}`} />
                <div className="item-b">
                  <b>{f.nome}</b>
                  <span>{PAPEL[f.papel] ?? ""} · vendeu <em>{f.realizado}</em>{f.meta ? ` de ${f.meta}` : " · sem meta"}</span>
                  {f.meta ? <div style={{ height: 6, background: "var(--sunk)", borderRadius: 3, marginTop: 6, maxWidth: 260 }}>
                    <div style={{ width: `${p}%`, height: 6, borderRadius: 3, background: "var(--good)" }} /></div> : null}
                </div>
                {f.pode_editar
                  ? <Numero valor={f.meta} onSalvar={(n) => definir(f.id, n, f.nome)} />
                  : <span style={{ font: '700 15px "JetBrains Mono", monospace' }}>{f.meta ?? "—"}</span>}
              </div>
            );
          })}
          {d.meta && algumFilhoEditavel ? (
            <div className="item" style={{ fontSize: 13, color: somaFilhos < d.meta ? "var(--red)" : "var(--ink-3)", fontWeight: 600 }}>
              {somaFilhos < d.meta ? `Distribuído ${somaFilhos} de ${d.meta} — faltam ${d.meta - somaFilhos} para fechar a meta`
                : somaFilhos > d.meta ? `Distribuído ${somaFilhos} — ${somaFilhos - d.meta} acima da meta (folga)` : `Distribuído ${somaFilhos} de ${d.meta} ✓`}
            </div>
          ) : null}
        </div>
      ) : null}
    </Sec>
  );
}
