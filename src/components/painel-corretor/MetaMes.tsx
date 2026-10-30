// "Rumo ao apartamento do mês" no painel do notebook (CorretorPainel). Mesma conta do painel do celular:
// meta do mês (padrão 1; o gerente muda na Tabela da Tropa) → 66 atendidos, 5 visitas atendidas e 3 pastas
// com documentos por venda. Usa as cores do painel antigo (variáveis do .cpv2).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { diaSP, diasUteis, horaSP, dataCurta, comArtigo } from "./util";

const POR_VENDA = { atendidos: 66, visitas: 5, docs: 3 };

export default function MetaMes({ uid, visitas = [] }: { uid: string; visitas?: { name: string; at: string }[] }) {
  const mesIni = useMemo(() => diaSP(Date.now()).slice(0, 8) + "01", []);
  const { data: t } = useQuery<any>({
    queryKey: ["pcTrilha", uid], enabled: !!uid, refetchInterval: 120_000,
    queryFn: async () => { const { data } = await (supabase as any).rpc("trilha_corretor"); return data || {}; },
  });
  const { data: mp } = useQuery<any>({
    queryKey: ["metas-painel", mesIni, "eu"], enabled: !!uid, staleTime: 60_000,
    queryFn: async () => { const { data } = await supabase.rpc("metas_painel" as any, { p_mes: mesIni, p_dono: null }); return data; },
  });
  if (!t) return null;
  const meta = Number(mp?.dono?.meta) > 0 ? Number(mp.dono.meta) : 1;
  const vendas = Number(mp?.dono?.realizado) || 0;
  const du = diasUteis();
  const alvo = { atendidos: POR_VENDA.atendidos * meta, visitas: POR_VENDA.visitas * meta, docs: POR_VENDA.docs * meta };
  const atMes = Number(t.atendidos_mes) || 0, atHoje = Number(t.atendidos_hoje) || 0;
  const vis = Number(t.visitas_mes) || 0, docs = Number(t.docs_mes) || 0;
  const alvoHoje = Math.max(1, Math.min(15, Math.ceil(Math.max(0, alvo.atendidos - (atMes - atHoje)) / du.restam)));
  const faltaDocs = Math.max(0, alvo.docs - docs), faltaVis = Math.max(0, alvo.visitas - vis);
  const prox = visitas.filter((v) => Date.parse(v.at) > Date.now() - 3 * 3.6e6).sort((a, b) => a.at.localeCompare(b.at))[0];
  const hoje = diaSP(Date.now());

  const linha = (rot: string, a: number, m: number, extra?: React.ReactNode) => (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
        <span style={{ color: "var(--muted)" }}>{rot}</span><span><b>{a}</b> de {m}{a >= m ? " ✅" : ""}{extra}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--subtle)", overflow: "hidden" }}>
        <i style={{ display: "block", height: "100%", width: `${Math.min(100, (100 * a) / Math.max(1, m))}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
  return (
    <div style={{ border: "1px solid var(--accent-border, var(--border))", background: "var(--surface)", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 13.5 }}>🏠 Meta: {meta} apartamento{meta > 1 ? "s" : ""} no mês</b>
        <span style={{ fontSize: 11.5, color: "var(--faint)" }}>dia {Math.min(du.hojeN, du.total)} de {du.total}</span>
      </div>
      {linha("Hoje: clientes atendidos", atHoje, alvoHoje)}
      {linha("Visitas no mês", vis, alvo.visitas, prox ? <span style={{ color: "var(--accent)" }}> · próxima: {comArtigo(prox.name)}, {diaSP(prox.at) === hoje ? horaSP(prox.at) : dataCurta(prox.at)}</span> : null)}
      {linha("Documentos no mês", docs, alvo.docs)}
      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
        {vendas >= meta ? `🎉 Meta do mês batida: ${vendas} venda${vendas > 1 ? "s" : ""}!`
          : faltaDocs === 1 ? "Falta pouco: mais uma pasta com documentos fecha a conta do mês."
          : faltaDocs || faltaVis ? `Faltam ${[faltaVis ? `${faltaVis} visita${faltaVis > 1 ? "s" : ""}` : "", faltaDocs ? `${faltaDocs} pasta${faltaDocs > 1 ? "s" : ""}` : ""].filter(Boolean).join(" e ")} para fechar a conta do mês.`
          : "Conta do mês fechada. Agora é virar pasta em venda."}
        {Number(mp?.dono?.meta) > 0 ? " Meta definida pelo seu gerente." : " Meta padrão: 1 por corretor."}
      </span>
    </div>
  );
}
