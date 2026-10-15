// Meta do super no topo da Estratégia: a meta vem da diretoria (herdada, só a diretoria muda) e o super pode
// assumir vendas a mais — a Superação (metas.superacao, RPC definir_superacao). Meta da superintendência =
// herdada + superação; embaixo, quanto já foi distribuído aos gerentes. A diretoria vê a superação na Sala
// de Guerra dela ("Meta da Tropa").
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type Pessoa = { id: string; nome: string; papel: string; meta: number | null; superacao?: number; realizado: number };
type Painel = { mes: string; dono: Pessoa; filhos: Pessoa[] };

const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const um = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");

export default function MetaSuperacao({ superId }: { superId: string }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const mes = inicioMes();
  const { data } = useQuery({
    queryKey: ["metas-painel", mes, superId], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mes, p_dono: superId });
      if (error) throw error;
      return data as unknown as Painel;
    },
  });
  const herdada = data?.dono.meta ?? null;
  const [sup, setSup] = useState("");
  useEffect(() => { setSup(data?.dono.superacao ? String(data.dono.superacao) : ""); }, [data?.dono.superacao]);
  const [salvando, setSalvando] = useState(false);
  const souEu = session?.user?.id === superId;

  const superacao = Math.max(0, parseInt(sup, 10) || 0);
  const total = (herdada ?? 0) + superacao;
  const vendido = data?.dono.realizado ?? 0;
  const gerentes = (data?.filhos ?? []).filter((f) => f.papel === "MANAGER");
  const distribuido = gerentes.reduce((a, g) => a + (g.meta ?? 0), 0);
  const hoje = new Date();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = hoje.getDate() ? (vendido / hoje.getDate()) * diasMes : 0;

  async function salvar() {
    if (superacao === (data?.dono.superacao ?? 0)) return;
    setSalvando(true);
    const { error } = await supabase.rpc("definir_superacao" as any, { p_mes: mes, p_vendas: superacao });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(superacao ? `Superação de +${superacao} vendas assumida. A diretoria já vê.` : "Superação zerada.");
    qc.invalidateQueries({ queryKey: ["metas-painel"] });
    qc.invalidateQueries({ queryKey: ["aportes-tropa-supers"] });
  }

  return (
    <section className="dir-card s2-meta">
      <style>{CSS}</style>
      <div className="s2-meta-c">
        <small>Meta da diretoria</small>
        <b className="mono">{herdada ?? "—"}</b>
        <span>{herdada == null ? "a diretoria ainda não definiu a meta deste mês" : "herdada · só a diretoria muda"}</span>
      </div>
      <div className="s2-meta-op">+</div>
      <div className="s2-meta-c s2-meta-sup">
        <small>Superação</small>
        {souEu ? (
          <input type="number" min={0} inputMode="numeric" value={sup} placeholder="0" disabled={herdada == null || salvando}
            aria-label="Vendas a mais além da meta da diretoria"
            onChange={(e) => setSup(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        ) : <b className="mono">{superacao ? `+${superacao}` : "0"}</b>}
        <span>{souEu ? "vendas a mais que você assume" : "vendas a mais assumidas pelo super"}</span>
      </div>
      <div className="s2-meta-op">=</div>
      <div className="s2-meta-c s2-meta-tot">
        <small>Meta da superintendência</small>
        <b className="mono">{herdada == null ? "—" : total}</b>
        <span>vendido {um(vendido)} · no ritmo, {um(projecao)} no mês</span>
      </div>
      <div className={`s2-meta-dist ${herdada != null && distribuido < total ? "falta" : ""}`}>
        <small>Distribuído aos gerentes</small>
        <b className="mono">{distribuido} <em>de {herdada == null ? "—" : total}</em></b>
        <span>
          {herdada == null ? "aguardando a meta da diretoria"
            : distribuido < total ? `faltam ${total - distribuido} para distribuir (Sala de Guerra, abaixo)`
            : distribuido > total ? `${distribuido - total} a mais que a meta — folga da equipe` : "toda a meta distribuída"}
        </span>
      </div>
    </section>
  );
}

const CSS = `
.dir .s2-meta{display:flex;flex-wrap:wrap;align-items:stretch;gap:12px;padding:18px 20px;margin-bottom:16px}
.dir .s2-meta-c,.dir .s2-meta-dist{display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1}
.dir .s2-meta small{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.dir .s2-meta b{font-size:30px;line-height:1.1;color:var(--ink)}
.dir .s2-meta b em{font-style:normal;font-size:15px;color:var(--ink-3);font-weight:600}
.dir .s2-meta span{font-size:12.5px;color:var(--ink-3)}
.dir .s2-meta-op{align-self:center;font-size:22px;font-weight:700;color:var(--ink-3)}
.dir .s2-meta-sup input{width:110px;font:700 26px "JetBrains Mono",monospace;color:var(--teal);background:#fff;border:1px solid var(--line);border-radius:10px;padding:4px 10px}
.dir .s2-meta-sup input:focus{outline:2px solid var(--teal);outline-offset:-1px}
.dir .s2-meta-tot b{color:var(--teal)}
.dir .s2-meta-dist{border-left:1px solid var(--line);padding-left:16px}
.dir .s2-meta-dist.falta b{color:var(--org)}
@media (max-width:720px){.dir .s2-meta-op{display:none}.dir .s2-meta-dist{border-left:0;padding-left:0}}
`;
