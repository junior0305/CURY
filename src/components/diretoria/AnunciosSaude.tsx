/* Saúde dos anúncios (aba Leads e investimento do diretor).
 * O robô /root/econ/fb_saude.py lê cada conta do Facebook na fonte de hora em hora (8h–22h) e grava
 * public.fb_saude: campanhas/conjuntos/anúncios dos últimos 7 dias, quem mexeu, o lado do Comandra
 * (chegaram, responderam, sem toque) e os alertas por regra (sem IA). Esta tela só mostra e cobra:
 * atendimento → cobra o super da equipe; estrutura da campanha → pedido pronto para o gestor de tráfego. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SuperDiretoria } from "@/hooks/useDiretoria";

type Alerta = { g: "red" | "org" | "grn"; tipo: string; titulo: string; detalhe: string; acao: "super" | "trafego" };
type Anuncio = { id: string; nome: string; status: string; gasto: number; leads: number; impr: number };
type Conjunto = { id: string; nome: string; status: string; gasto: number; leads: number; anuncios: Anuncio[] };
type Campanha = { id: string; nome: string; status: string; orcamento_dia: number; gasto: number; leads: number; impr: number; conjuntos: Conjunto[] };
type Conta = {
  conta: string; dono_id: string; dono: string; papel?: string; super_id?: string; super?: string; erro?: string;
  gasto_7d: number; leads_fb_7d: number; impr_7d: number; gasto_7d_ant: number; leads_7d_ant: number;
  gasto_por_dia: Record<string, number>; campanhas: Campanha[]; mexidas: { quando: string; tipo: string; objeto: string; quem: string }[];
  comandra: { leads: number; responderam: number; sem_toque: number; fora_regiao: number }; alertas: Alerta[]; casa: { cpl: number; cpm: number };
};
type Linha = { account_id: string; dados: Conta; atualizado_em: string };

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const COR: Record<string, string> = { red: "c-red", org: "c-org", grn: "c-grn" };
const ST: Record<string, string> = { ACTIVE: "no ar", PAUSED: "pausada", CAMPAIGN_PAUSED: "pausada", ADSET_PAUSED: "pausada", WITH_ISSUES: "com problema", DISAPPROVED: "reprovada", IN_PROCESS: "em análise" };

function situacao(c: Conta) {
  if (c.erro) return { txt: "sem acesso", cls: "c-red" };
  const ativas = c.campanhas.filter((x) => x.status === "ACTIVE").length;
  const hoje = c.gasto_por_dia?.[hojeSP()] ?? 0;
  if (!ativas) return { txt: c.gasto_7d ? "tudo pausado" : "parada", cls: c.gasto_7d ? "c-red" : "c-gray" };
  return hoje > 0 ? { txt: `no ar · ${ativas} campanha${ativas > 1 ? "s" : ""}`, cls: "c-grn" } : { txt: "no ar, sem gastar hoje", cls: "c-org" };
}

export default function AnunciosSaude({ diretorId, supers }: { diretorId: string; supers: SuperDiretoria[] }) {
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<string | null>(null);
  const [campAberta, setCampAberta] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["fb-saude"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.from("fb_saude" as any).select("account_id,dados,atualizado_em")).data ?? []) as unknown as Linha[],
  });
  if (isLoading) return <div className="dir-card dir-vazio">Lendo as contas de anúncio…</div>;
  if (!data?.length) return null;

  const contas = [...data].filter((l) => l.dados.erro || l.dados.gasto_7d > 0 || l.dados.campanhas?.length)
    .sort((a, b) => (b.dados.alertas?.filter((x) => x.g === "red").length ?? 0) - (a.dados.alertas?.filter((x) => x.g === "red").length ?? 0) || b.dados.gasto_7d - a.dados.gasto_7d);
  const sum = (f: (c: Conta) => number) => contas.reduce((a, l) => a + (f(l.dados) || 0), 0);
  const gasto = sum((c) => c.gasto_7d), leads = sum((c) => c.leads_fb_7d), gastoAnt = sum((c) => c.gasto_7d_ant), leadsAnt = sum((c) => c.leads_7d_ant);
  const cheg = sum((c) => c.comandra?.leads), resp = sum((c) => c.comandra?.responderam), semToque = sum((c) => c.comandra?.sem_toque);
  const cpl = leads ? gasto / leads : 0, cplAnt = leadsAnt ? gastoAnt / leadsAnt : 0;
  const atualizado = data.map((l) => l.atualizado_em).sort().pop();
  const vermelhos = contas.flatMap((l) => (l.dados.alertas ?? []).filter((a) => a.g === "red").map((a) => ({ ...a, conta: l.dados.dono })));

  async function cobrarSuper(c: Conta) {
    const s = supers.find((x) => x.id === (c.super_id || c.dono_id));
    if (!s) { toast.error("Superintendente desta conta não encontrado."); return; }
    const nome = s.nome.split(" ")[0];
    const lista = (c.alertas ?? []).filter((a) => a.g !== "grn").slice(0, 4).map((a) => `• ${a.titulo}`).join("\n");
    const msg = `${nome}, os anúncios da conta ${c.papel === "MANAGER" ? `do ${c.dono}` : "da sua equipe"} precisam de ajuste:\n${lista}\nGasto em 7 dias: ${brl(c.gasto_7d)} para ${c.leads_fb_7d} leads. Pode alinhar com o gestor de tráfego e me dar retorno até amanhã?`;
    const { error } = await supabase.from("cobrancas" as any).insert({ de_id: diretorId, para_id: s.id, motivo: `anúncios · ${c.dono}`, canal: "whatsapp", enviada_em: new Date().toISOString() });
    if (error) { toast.error("Não registrei a cobrança: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["diretoria"] });
    const f = String(s.phone ?? "").replace(/\D/g, "");
    if (f) { window.open(`https://api.whatsapp.com/send?phone=${f.startsWith("55") ? f : "55" + f}&text=${encodeURIComponent(msg)}`, "_blank"); toast.success(`Cobrança de ${nome} registrada. A mensagem abriu no seu WhatsApp.`); }
    else toast.info(`${nome} não tem telefone cadastrado. A cobrança ficou só no histórico.`);
  }
  const copiarTrafego = (c: Conta, a: Alerta) => {
    const txt = `Conta ${c.conta} (${c.dono}): ${a.titulo}. ${a.detalhe}`;
    navigator.clipboard?.writeText(txt).then(() => toast.success("Pedido copiado: cole no WhatsApp do gestor de tráfego"), () => toast.error("Não consegui copiar"));
  };

  return (
    <section className="dir-card ads">
      <div className="dir-h"><b>Saúde dos anúncios</b><span>lido no Facebook às {atualizado ? new Date(atualizado).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} · atualiza de hora em hora · últimos 7 dias</span></div>
      <div className="ads-band">
        <div><div className="dir-lbl">Gasto</div><div className="ads-big">{brl(gasto)}</div><div className="ads-s">{gastoAnt ? `${gasto >= gastoAnt ? "+" : ""}${Math.round((gasto / gastoAnt - 1) * 100)}% contra a semana anterior` : "sem semana anterior"}</div></div>
        <div><div className="dir-lbl">Leads no Facebook</div><div className="ads-big">{leads}</div><div className="ads-s">{cheg} chegaram no Comandra (páginas mapeadas)</div></div>
        <div><div className="dir-lbl">Custo por lead</div><div className="ads-big">{cpl ? brl(cpl) : "—"}</div><div className="ads-s">{cplAnt ? `semana anterior ${brl(cplAnt)}` : ""}</div></div>
        <div><div className="dir-lbl">Responderam</div><div className="ads-big">{cheg ? `${Math.round((resp / cheg) * 100)}%` : "—"}</div><div className="ads-s">{resp} de {cheg} à primeira mensagem</div></div>
        <div><div className="dir-lbl">Sem toque há 24h+</div><div className={`ads-big${semToque ? " r" : ""}`}>{semToque}</div><div className="ads-s">lead pago parado</div></div>
      </div>
      {vermelhos.length ? <div className="ads-urg"><b>Agora:</b> {vermelhos.slice(0, 3).map((a) => `${a.conta} — ${a.titulo}`).join(" · ")}{vermelhos.length > 3 ? ` · e mais ${vermelhos.length - 3}` : ""}</div> : null}

      <div className="dir-tree"><table>
        <thead><tr><th>Conta</th><th>Situação</th><th>Gasto 7d</th><th>Leads FB</th><th>Custo/lead</th><th>Mil impressões</th><th>Chegaram</th><th>Responderam</th><th>Sem toque</th><th>Alertas</th></tr></thead>
        <tbody>
          {contas.map((l) => {
            const c = l.dados, s = situacao(c), on = aberta === l.account_id;
            const cplC = c.leads_fb_7d ? c.gasto_7d / c.leads_fb_7d : null, cpmC = c.impr_7d ? (c.gasto_7d / c.impr_7d) * 1000 : null;
            const nR = (c.alertas ?? []).filter((a) => a.g === "red").length, nO = (c.alertas ?? []).filter((a) => a.g === "org").length;
            return [
              <tr key={l.account_id} className="n0" onClick={() => setAberta(on ? null : l.account_id)}>
                <td><span className={`dir-seta${on ? " on" : ""}`} aria-hidden>▸</span>{c.dono}<span className="ads-sub"> · {c.super && c.papel === "MANAGER" ? c.super : "super"}</span></td>
                <td style={{ fontFamily: "inherit" }}><span className={`dir-chip ${s.cls}`}>{s.txt}</span></td>
                <td>{brl(c.gasto_7d)}</td><td>{c.leads_fb_7d}</td>
                <td className={cplC && cplC > 2 * c.casa.cpl ? "r" : !cplC && c.gasto_7d > 60 ? "r" : ""}>{cplC ? brl(cplC) : "—"}</td>
                <td className={cpmC && cpmC > 2.5 * c.casa.cpm ? "r" : ""}>{cpmC ? brl(cpmC) : "—"}</td>
                <td>{c.comandra?.leads ?? "—"}</td>
                <td>{c.comandra?.leads ? `${Math.round((c.comandra.responderam / c.comandra.leads) * 100)}%` : "—"}</td>
                <td className={c.comandra?.sem_toque ? "r" : ""}>{c.comandra?.sem_toque ?? "—"}</td>
                <td style={{ fontFamily: "inherit" }}>{nR ? <span className="dir-chip c-red">{nR}</span> : null} {nO ? <span className="dir-chip c-org">{nO}</span> : null}{!nR && !nO ? <span className="dir-chip c-grn">ok</span> : null}</td>
              </tr>,
              on ? (
                <tr key={`${l.account_id}:x`} className="ads-x"><td colSpan={10}>
                  <div className="ads-alertas">
                    {(c.alertas ?? []).map((a, i) => (
                      <div key={i} className={`ads-al ${a.g}`}>
                        <div><span className={`dir-chip ${COR[a.g]}`}>{a.g === "grn" ? "oportunidade" : a.g === "red" ? "urgente" : "atenção"}</span> <b>{a.titulo}</b><p>{a.detalhe}</p></div>
                        {a.acao === "super" ? <button className="dir-btn-action" onClick={() => cobrarSuper(c)}>Cobrar {c.super?.split(" ")[0] ?? "super"}</button>
                          : <button className="dir-btn-action" onClick={() => copiarTrafego(c, a)}>Copiar pedido ao tráfego</button>}
                      </div>))}
                    {!(c.alertas ?? []).length ? <div className="dir-nota">Nenhum alerta nesta conta.</div> : null}
                  </div>
                  <div className="ads-acts">
                    <button className="dir-btn solid" onClick={() => cobrarSuper(c)}>Cobrar {c.super?.split(" ")[0] ?? "super"} pelos anúncios</button>
                    {c.mexidas?.length ? <span className="dir-nota">Última mexida: {new Date(c.mexidas[0].quando.replace("+0000", "Z")).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} por {c.mexidas[0].quem} ({c.mexidas[0].objeto})</span> : null}
                  </div>
                  <table className="ads-camp">
                    <thead><tr><th>Campanha / anúncio</th><th>Situação</th><th>Orçamento/dia</th><th>Gasto 7d</th><th>Leads</th><th>Custo/lead</th></tr></thead>
                    <tbody>
                      {[...c.campanhas].sort((a, b) => b.gasto - a.gasto).flatMap((cp) => {
                        const k = `${l.account_id}:${cp.id}`;
                        return [
                          <tr key={k} className="n1" onClick={() => setCampAberta((v) => ({ ...v, [k]: !v[k] }))}>
                            <td><span className={`dir-seta${campAberta[k] ? " on" : ""}`} aria-hidden>▸</span>{cp.nome}</td>
                            <td style={{ fontFamily: "inherit" }}>{ST[cp.status] ?? cp.status.toLowerCase()}</td>
                            <td>{cp.orcamento_dia ? brl(cp.orcamento_dia) : cp.conjuntos.reduce((a, s: any) => a + (s.orcamento_dia || 0), 0) ? brl(cp.conjuntos.reduce((a, s: any) => a + (s.orcamento_dia || 0), 0)) : "—"}</td>
                            <td>{brl(cp.gasto)}</td><td>{cp.leads}</td>
                            <td className={cp.leads && cp.gasto / cp.leads > 2 * c.casa.cpl ? "r" : !cp.leads && cp.gasto > 60 ? "r" : ""}>{cp.leads ? brl(cp.gasto / cp.leads) : "—"}</td>
                          </tr>,
                          ...(campAberta[k] ? cp.conjuntos.flatMap((s) => s.anuncios).filter((a) => a.gasto > 0).sort((a, b) => b.gasto - a.gasto).map((a) => (
                            <tr key={`${k}:${a.id}`} className="n2">
                              <td>{a.nome}</td><td style={{ fontFamily: "inherit" }}>{ST[a.status] ?? a.status.toLowerCase()}</td><td />
                              <td>{brl(a.gasto)}</td><td>{a.leads}</td>
                              <td className={a.leads && a.gasto / a.leads <= 0.6 * c.casa.cpl ? "g" : !a.leads && a.gasto >= 40 ? "r" : ""}>{a.leads ? brl(a.gasto / a.leads) : "—"}</td>
                            </tr>)) : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </td></tr>) : null,
            ];
          })}
        </tbody>
      </table></div>
      <p className="dir-nota" style={{ margin: 0 }}>Referência da casa (média das contas da Econ em 7 dias): {brl(contas[0]?.dados.casa?.cpl ?? 0)} por lead e {brl(contas[0]?.dados.casa?.cpm ?? 0)} por mil impressões. "Chegaram" conta só as páginas ligadas a cada conta; anúncio de uma equipe em página de outra aparece na conta dona da página.</p>
    </section>
  );
}
