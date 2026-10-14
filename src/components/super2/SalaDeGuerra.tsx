// Sala de Guerra do superintendente: Plano do mês, Verba (quem aporta e quanto) e Gastos, num lugar só.
//
// Verba: o super anota a verba que a diretoria liberou e marca quais gerentes aportam e quanto.
// Fica na tabela gastos (linha "Aporte Tropa & Verba de Guerra · <super>", a mesma que a diretoria lê).
// A projeção usa o custo por venda REAL das equipes (gasto no Facebook ÷ vendas do Junix, 30 dias);
// sem venda no período não há base e a tela diz isso, em vez de inventar.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import PlanoEstrategico from "@/components/plano/PlanoEstrategico";
import GastosPlano from "@/components/plano/GastosPlano";
import { useConsolidadoSuper } from "@/hooks/useConsolidadoSuper";
import { useEscopoSuper } from "./escopo";
import "@/styles/diretoria.css";

const sb = supabase as any;
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
type Aba = "plano" | "verba" | "gastos";

export default function SalaDeGuerra({ superId, superNome, abaInicial }: { superId: string; superNome: string; abaInicial?: Aba }) {
  const { session } = useAuth();
  const [aba, setAba] = useState<Aba>(abaInicial ?? "plano");
  const [desloc, setDesloc] = useState(0);
  const d = new Date();
  const mes = new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
  const nomeMes = (n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1).toLocaleDateString("pt-BR", { month: "long" });
  const { data: consMes } = useConsolidadoSuper(aba === "gastos" && desloc === 0 ? superId : undefined, d.getDate());
  const anuncio = new Map<string, number>(consMes ? [[superId, consMes.linhas.reduce((a, l) => a + (l.gasto ?? 0), 0)]] : []);

  return (
    <div className="sg">
      <style>{CSS}</style>
      <header className="sg-top">
        <div>
          <h1>Sala de Guerra</h1>
          <p>O plano do mês, a verba de cada equipe e os gastos · {superNome}</p>
        </div>
        <div className="sg-pills">
          <button className={desloc === 0 ? "on" : ""} onClick={() => setDesloc(0)}>{nomeMes(0)}</button>
          <button className={desloc === 1 ? "on" : ""} onClick={() => setDesloc(1)}>{nomeMes(1)}</button>
        </div>
      </header>
      <nav className="sg-abas" aria-label="Seções da Sala de Guerra">
        <button className={aba === "plano" ? "on" : ""} onClick={() => setAba("plano")}>Plano</button>
        <button className={aba === "verba" ? "on" : ""} onClick={() => setAba("verba")}>Verba</button>
        <button className={aba === "gastos" ? "on" : ""} onClick={() => setAba("gastos")}>Gastos</button>
      </nav>
      <div className="dir sg-dir">
        {aba === "plano" && session?.user?.id ? <PlanoEstrategico raizId={superId} meuId={session.user.id} mes={mes} />
          : aba === "verba" ? <Verba superId={superId} superNome={superNome} mes={mes} />
          : <GastosPlano raizId={superId} mes={mes} anuncio={anuncio} podeCriarCategoria={false} />}
      </div>
    </div>
  );
}

function Verba({ superId, superNome, mes }: { superId: string; superNome: string; mes: string }) {
  const qc = useQueryClient();
  const { supers } = useEscopoSuper(superId);
  const { data: cons } = useConsolidadoSuper(superId, 30);
  const gerentes = useMemo(() => (supers.length === 1 ? supers[0].gerentes : supers.flatMap((s) => s.gerentes))
    .filter((g) => !/revisor/i.test(g.nome)), [supers]);
  const [verbaDiretoria, setVerbaDiretoria] = useState(0);
  const [aportes, setAportes] = useState<Record<string, number>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const descricao = `Aporte Tropa & Verba de Guerra · ${superNome}`;

  useEffect(() => {
    setCarregado(false);
    sb.from("gastos").select("nota").eq("dono_id", superId).eq("mes", mes).like("descricao", "%Aporte Tropa%").maybeSingle()
      .then(({ data }: any) => {
        let n: any = {};
        try { n = JSON.parse(data?.nota || "{}"); } catch { n = {}; }
        setVerbaDiretoria(Number(n.verbaDiretoria) || 0);
        const ap: Record<string, number> = n.aportes ?? {};
        setAportes(ap);
        setMarcados(Object.fromEntries(Object.entries(ap).map(([k, v]) => [k, Number(v) > 0])));
        setCarregado(true);
      });
  }, [superId, mes]);

  const somaAportes = gerentes.reduce((a, g) => a + (marcados[g.id] ? Number(aportes[g.id] || 0) : 0), 0);
  const total = verbaDiretoria + somaAportes;
  const gasto30 = (cons?.linhas ?? []).reduce((a, l) => a + (l.gasto ?? 0), 0);
  const vendas30 = (cons?.linhas ?? []).reduce((a, l) => a + l.vendas, 0);
  const leads30 = (cons?.linhas ?? []).reduce((a, l) => a + (l.leadsFb ?? 0), 0);
  const custoVenda = vendas30 ? gasto30 / vendas30 : null;
  const custoLead = leads30 ? gasto30 / leads30 : null;

  const salvar = async () => {
    setSalvando(true);
    const ap = Object.fromEntries(gerentes.filter((g) => marcados[g.id] && Number(aportes[g.id]) > 0).map((g) => [g.id, Number(aportes[g.id])]));
    const { error } = await sb.from("gastos").upsert({
      dono_id: superId, mes, descricao, planejado: somaAportes, realizado: 0,
      nota: JSON.stringify({ verbaDiretoria, aportes: ap, aporteGerentes: somaAportes, cotasCorretores: 0, poderDeFogoTotal: total, superNome }),
    }, { onConflict: "dono_id,mes,descricao" });
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar: " + error.message); return; }
    toast.success(`Verba de ${brl(total)} salva. A diretoria vê na tela dela.`);
    qc.invalidateQueries({ queryKey: ["gastos"] });
  };

  if (!carregado) return <div className="dir-card dir-vazio">Carregando a verba do mês…</div>;
  return (
    <div className="sg-verba">
      <section className="dir-card">
        <div className="dir-h"><b>De onde vem o dinheiro</b><span>a verba que a diretoria liberou e o que cada gerente coloca</span></div>
        <label className="sg-linha">
          <span>Verba da diretoria</span>
          <input type="number" min={0} step={500} value={verbaDiretoria || ""} placeholder="0" onChange={(e) => setVerbaDiretoria(Number(e.target.value) || 0)} />
        </label>
        <div className="sg-ger">
          <b>Quais gerentes aportam</b>
          {gerentes.map((g) => (
            <label key={g.id} className={`sg-linha ${marcados[g.id] ? "on" : ""}`}>
              <span><input type="checkbox" checked={!!marcados[g.id]} onChange={(e) => setMarcados((m) => ({ ...m, [g.id]: e.target.checked }))} /> {g.nome}</span>
              <input type="number" min={0} step={100} disabled={!marcados[g.id]} value={aportes[g.id] || ""} placeholder="0"
                onChange={(e) => setAportes((a) => ({ ...a, [g.id]: Number(e.target.value) || 0 }))} />
            </label>
          ))}
          {!gerentes.length ? <p className="dir-nota">Nenhum gerente ligado a você.</p> : null}
        </div>
        <div className="sg-total"><span>Total para anunciar no mês</span><b>{brl(total)}</b></div>
        <button className="dir-btn solid" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar a verba"}</button>
      </section>
      <section className="dir-card">
        <div className="dir-h"><b>O que essa verba compra</b><span>pelo custo real das suas equipes nos últimos 30 dias</span></div>
        <dl className="sg-dl">
          <dt>Gasto no Facebook (30 dias)</dt><dd>{brl(gasto30)}</dd>
          <dt>Vendas no Junix (30 dias)</dt><dd>{vendas30}</dd>
          <dt>Custo por lead</dt><dd>{custoLead ? brl(custoLead) : "—"}</dd>
          <dt>Custo por venda</dt><dd>{custoVenda ? brl(custoVenda) : "—"}</dd>
        </dl>
        {total > 0 && custoVenda ? (
          <p className="sg-proj">Com <b>{brl(total)}</b> e o custo por venda atual de <b>{brl(custoVenda)}</b>, a verba paga cerca de
            <b> {Math.floor(total / custoVenda)} venda(s)</b> e <b>{custoLead ? Math.floor(total / custoLead) : "—"} leads</b>. Para vender mais com o mesmo dinheiro,
            o caminho é baixar o custo por venda: atender mais rápido e converter mais visita.</p>
        ) : total > 0 && custoLead ? (
          <p className="sg-proj">Com <b>{brl(total)}</b> dá para comprar cerca de <b>{Math.floor(total / custoLead)} leads</b> no custo atual.
            Sem venda no Junix nos últimos 30 dias, não há base para projetar vendas.</p>
        ) : <p className="dir-nota">Preencha a verba para ver quanto ela compra.</p>}
      </section>
    </div>
  );
}

const CSS = `
.mgr10 .sg{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .sg-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.mgr10 .sg-top h1{font-size:28px}
.mgr10 .sg-top p{color:var(--ink-2);margin-top:4px;font-size:14px}
.mgr10 .sg-pills{display:flex;gap:2px;background:var(--sunk);border-radius:10px;padding:3px}
.mgr10 .sg-pills button{font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;color:var(--ink-3);text-transform:capitalize}
.mgr10 .sg-pills button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(9,12,18,.08)}
.mgr10 .sg-abas{display:flex;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px;flex-wrap:wrap}
.mgr10 .sg-abas button{padding:9px 16px;border-radius:9px;font-size:14px;font-weight:600;color:var(--ink-2)}
.mgr10 .sg-abas button.on{background:var(--blue-air);color:var(--blue)}
.mgr10 .sg-dir{min-height:0;background:transparent;display:flex;flex-direction:column;gap:20px;padding:0}
.mgr10 .sg-verba .dir-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;display:grid;gap:4px}
.mgr10 .sg-verba .dir-h{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin-bottom:8px}
.mgr10 .sg-verba .dir-h span{font-size:12.5px;color:var(--ink-3)}
.mgr10 .sg-verba{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start}
.mgr10 .sg-linha{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--hair);font-size:14px}
.mgr10 .sg-linha span{display:flex;align-items:center;gap:8px}
.mgr10 .sg-linha input[type=number]{width:130px;font:inherit;text-align:right;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
.mgr10 .sg-linha input:disabled{opacity:.4}
.mgr10 .sg-ger{display:grid;margin-top:10px}
.mgr10 .sg-ger>b{font-size:13px;color:var(--ink-2);margin-bottom:4px}
.mgr10 .sg-total{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-top:2px solid var(--line);margin-top:6px}
.mgr10 .sg-total b{font-size:24px;font-family:"JetBrains Mono",monospace}
.mgr10 .sg-dl{display:grid;grid-template-columns:1fr auto;gap:8px 16px;margin:0 0 12px;font-size:14px}
.mgr10 .sg-dl dd{margin:0;text-align:right;font-family:"JetBrains Mono",monospace}
.mgr10 .sg-proj{font-size:14.5px;line-height:1.55;background:var(--blue-air);border-radius:10px;padding:12px 14px}
`;
